'use strict';
const assert = require('node:assert/strict');
const Store = require('../assets/js/crm-demo-store.js');
const Assisted = require('../assets/js/crm-assisted.js');
const Office = require('../assets/js/crm-demo-office.js');
const Publication = require('../assets/js/doctor-publication.js');
let count = 0;
function test(name, run) { run(); count++; console.log('PASS:', name); }
function good(result) { assert.equal(result.ok, true, result.error); return result.value; }
function denied(result) { assert.equal(result.ok, false); assert.equal(result.code, 'forbidden'); }
function fixture() {
  const values = new Map(); let sequence = 0;
  const storage = { getItem:key=>values.get(key)??null, setItem:(key,value)=>values.set(key,String(value)), dump:()=>JSON.stringify([...values]) };
  const now = () => '2026-10-11T12:00:00.000Z';
  const make = (id, role, extra={}) => Store.createStore({storage, actor:{id,role}, now, randomId:()=>String(++sequence), ...extra});
  const ana=make('kam_ana','kam'), luis=make('kam_luis','kam'), admin=make('admin_demo','admin'), leader=make('leader_demo','leader');
  const revision=()=>admin.snapshot().revision;
  const create=(store,type,suffix)=>good(store.createContact({type,name:'Demo '+suffix,email:suffix+'@example.test'},revision()));
  const first=create(ana,'patient','ana'), second=create(luis,'doctor','luis');
  const taskA=good(ana.createTask({contactId:first.id,title:'Ana task',dueAt:'2026-10-12T12:00:00Z'},revision()));
  const taskB=good(luis.createTask({contactId:second.id,title:'Luis task',dueAt:'2026-10-12T12:00:00Z'},revision()));
  good(ana.addActivity({contactId:first.id,type:'note',summary:'Ana history'},revision()));
  good(luis.addActivity({contactId:second.id,type:'note',summary:'Luis history'},revision()));
  const assisted=store=>Assisted.createAssisted({store,actor:store.actor,now});
  const expA=good(assisted(ana).beginDraft({contactId:first.id},revision()));
  const expB=good(assisted(luis).beginDraft({contactId:second.id},revision()));
  const refA=good(ana.createReferral('patient',revision())),refB=good(luis.createReferral('doctor',revision()));
  return {values,storage,now,make,ana,luis,admin,leader,revision,first,second,taskA,taskB,expA,expB,refA,refB,assisted,create};
}
test('KAM reads use current assignment across snapshots, lists, IDs, timelines, tasks and dossier reads',()=>{
  const f=fixture();
  assert.deepEqual(f.ana.listContacts().map(c=>c.id),[f.first.id]);
  const s=f.ana.snapshot();
  assert.deepEqual(Object.keys(s.contacts),[f.first.id]);
  for(const key of ['expedients','tasks','activities','audit','events'])assert.ok(Object.values(s[key]).every(row=>row.contactId===f.first.id),key);
  assert.deepEqual(Object.keys(s.referrals),[f.refA.id]);
  assert.throws(()=>f.ana.getContact(f.second.id),e=>e.code==='forbidden');
  assert.deepEqual(f.ana.listTasks({contactId:f.second.id}),[]);
  assert.deepEqual(f.ana.listActivities({contactId:f.second.id}),[]);
  assert.deepEqual(f.ana.listAudit({contactId:f.second.id}),[]);
  assert.equal(f.assisted(f.ana).getExpedient(f.expB.id).ok,false);
  denied(f.ana.resolveReferral(f.refB.token,'doctor'));
  assert.throws(()=>f.ana.dashboard({kamId:'kam_luis'}),e=>e.code==='forbidden');
});
test('leader reads both portfolios and genuine dashboard scopes without acquiring write capability',()=>{
  const f=fixture(),before=f.storage.dump(),s=f.leader.snapshot();
  assert.deepEqual(Object.keys(s.contacts).sort(),[f.first.id,f.second.id].sort());
  assert.equal(f.leader.getContact(f.second.id).id,f.second.id);
  assert.equal(f.leader.listTasks().length,2);assert.equal(f.leader.listActivities().length,2);
  assert.equal(f.leader.listAudit().length,f.admin.listAudit().length);
  assert.equal(f.leader.dashboard().currentSnapshot.contacts,2);
  assert.equal(f.leader.dashboard({kamId:'kam_luis'}).currentSnapshot.contacts,1);
  assert.equal(good(f.assisted(f.leader).getExpedient(f.expB.id)).expedient.id,f.expB.id);
  assert.equal(f.storage.dump(),before);
});
test('every leader mutation, including no-op transaction and assisted/holder entry points, denies before callback',()=>{
  const f=fixture(),r=f.revision(),before=f.storage.dump();let callbacks=0;
  const calls=[()=>f.leader.transact(r,()=>{callbacks++;}),()=>f.leader.createContact({},r),()=>f.leader.seedExamples(r),()=>f.leader.updateContact(f.first.id,{notes:'no'},r),()=>f.leader.setStage(f.first.id,'contacted',{},r),()=>f.leader.reassignContact(f.first.id,'kam_luis','no',r),()=>f.leader.deleteContact(f.first.id,'no',r),()=>f.leader.restoreContact(f.first.id,'no',r),()=>f.leader.createReferral('patient',r),()=>f.leader.applyReferral(f.first.id,f.refA.token,r),()=>f.leader.createTask({},r),()=>f.leader.updateTask(f.taskA.id,{},r),()=>f.leader.closeTask(f.taskA.id,'no',r),()=>f.leader.addActivity({},r),()=>f.leader.reviewIdentity({}, {},r)];
  const assisted=f.assisted(f.leader);
  calls.push(()=>assisted.beginDraft({contactId:f.first.id},r),()=>assisted.editDraft(f.expA.id,{fields:{fullName:'no'}},r),()=>assisted.invite(f.expA.id,{email:f.first.email},r),()=>assisted.claim('token',{},r),()=>assisted.createSelfService({},r),()=>assisted.holderAction(f.expA.id,'otp',{confirmed:true,demo:true},r),()=>assisted.submit(f.expA.id,r),()=>assisted.receiveOffer(f.expA.id,r),()=>assisted.receiveCorrection(f.expA.id,r),()=>assisted.editCorrection(f.expA.id,{},r),()=>assisted.submitCorrection(f.expA.id,{},r),()=>assisted.receiveDocumentCorrection(f.expA.id,r),()=>assisted.editDocumentCorrectionDraft(f.expA.id,{},r),()=>assisted.submitDocumentCorrection(f.expA.id,{},r));
  for(const call of calls)denied(call());
  assert.equal(callbacks,0);assert.equal(f.storage.dump(),before);
  assert.equal(assisted.requestDemoVerification({email:f.first.email}).ok,false);
});
test('KAM extension callbacks cannot enumerate, return or directly read another portfolio',()=>{
  const f=fixture(),before=f.storage.dump();let observed;
  const result=good(f.ana.transact(f.revision(),(state)=>{observed=JSON.parse(JSON.stringify(state));return state;}));
  assert.deepEqual(Object.keys(observed.contacts),[f.first.id]);assert.deepEqual(Object.keys(result.contacts),[f.first.id]);
  for(const key of ['expedients','tasks','activities','audit','events'])assert.ok(Object.values(observed[key]).every(row=>row.contactId===f.first.id));
  denied(f.ana.transact(f.revision(),state=>state.contacts[f.second.id]));
  denied(f.ana.transact(f.revision(),state=>state.tasks[f.taskB.id]));
  assert.equal(f.storage.dump(),before);
});
test('scoped callback writes retain all hidden records and enforce global collision and immutable history rules',()=>{
  const f=fixture(),before=f.admin.snapshot();
  good(f.ana.transact(f.revision(),(state,ctx)=>{state.contacts[f.first.id].notes='Scoped note';ctx.append('audit',{action:'scoped_note',contactId:f.first.id});}));
  const after=f.admin.snapshot();
  assert.deepEqual(after.contacts[f.second.id],before.contacts[f.second.id]);
  for(const key of ['expedients','tasks','activities','audit','events','referrals'])for(const [id,row]of Object.entries(before[key]))assert.deepEqual(after[key][id],row);
  const raw=f.storage.dump();
  assert.equal(f.ana.transact(f.revision(),(state,ctx)=>{const c=ctx.makeContact({type:'doctor',name:'Collision',email:f.second.email});state.contacts[c.id]=c;}).code,'duplicate_contact');
  denied(f.ana.transact(f.revision(),state=>{state.contacts[f.second.id]={...state.contacts[f.first.id],id:f.second.id};}));
  assert.equal(f.ana.transact(f.revision(),state=>{delete state.tasks[f.taskA.id];}).code,'deletion_forbidden');
  assert.equal(f.ana.transact(f.revision(),state=>{Object.values(state.activities)[0].summary='rewrite';}).code,'immutable_history');
  assert.equal(f.storage.dump(),raw);
});
test('reassignment and cross-tab edits revoke previous KAM reads and stale writes without touching winner state',()=>{
  const f=fixture(),stale=f.revision();
  good(f.admin.reassignContact(f.first.id,'kam_luis','Cartera reasignada',stale));
  assert.equal(f.ana.listContacts().length,0);assert.equal(f.ana.listTasks().length,0);assert.equal(f.ana.listActivities().length,0);
  assert.equal(f.leader.listContacts().length,2);assert.equal(f.luis.listContacts().length,2);
  assert.equal(f.ana.updateContact(f.first.id,{notes:'stale'},stale).code,'stale_revision');
  denied(f.ana.updateContact(f.first.id,{notes:'foreign'},f.revision()));
  let winner;
  const raced=f.luis.transact(f.revision(),state=>{state.contacts[f.second.id].notes='loser';good(f.admin.reassignContact(f.second.id,'kam_ana','Cambio concurrente',f.revision()));winner=f.storage.dump();});
  assert.equal(raced.code,'stale_revision');assert.equal(f.storage.dump(),winner);
});
test('session invalidation blocks cached store reads, callback execution and precommit writes',()=>{
  const f=fixture();let current=true,calls=0;const bound=f.make('kam_ana','kam',{isCurrent:()=>current});
  const r=f.revision(),before=f.storage.dump();
  denied(bound.transact(r,state=>{state.contacts[f.first.id].notes='abandoned';current=false;}));
  assert.equal(f.storage.dump(),before);
  assert.throws(()=>bound.snapshot(),e=>e.code==='forbidden');
  assert.throws(()=>bound.getContact(f.first.id),e=>e.code==='forbidden');
  denied(bound.transact(r,()=>calls++));assert.equal(calls,0);
});
test('leader excludes archives and unrelated legacy identity details; admin retains archive/review powers',()=>{
  const f=fixture(),archived=f.create(f.admin,'patient','archived');
  good(f.admin.deleteContact(archived.id,'Prospecto descartado',f.revision()));
  assert.equal(f.leader.snapshot().contacts[archived.id],undefined);
  assert.throws(()=>f.leader.getArchivedContact(archived.id),e=>e.code==='forbidden');
  assert.throws(()=>f.leader.listArchivedContacts(),e=>e.code==='forbidden');
  assert.equal(f.admin.getArchivedContact(archived.id).id,archived.id);
  f.storage.setItem('pulzzo_patient',JSON.stringify({patientAccountId:'legacy_private',correo:'legacy@example.test'}));
  const report=f.leader.inspectIdentity({email:'legacy@example.test',type:'patient'});
  assert.equal(report.existingAccountId,null);assert.equal(report.matches[0].restricted,true);
  assert.doesNotMatch(JSON.stringify(report),/legacy_private/);
});
test('holder ownership and staff financial/consent prohibitions are unchanged',()=>{
  const f=fixture(),holder=f.make('holder_private','holder');
  assert.deepEqual(holder.snapshot().contacts,{});
  assert.throws(()=>holder.getContact(f.first.id),e=>e.code==='forbidden');
  for(const staff of [f.ana,f.admin,f.leader])assert.equal(f.assisted(staff).holderAction(f.expA.id,'offerAcceptance',{confirmed:true,demo:true},f.revision()).ok,false);
  assert.equal(f.ana.transact(f.revision(),state=>{state.expedients[f.expA.id].holderActions.otp={actorId:'kam_ana',actorRole:'holder',at:f.now(),confirmed:true,demo:true};}).ok,false);
});
test('linked record identity and reference adapters allow leader read only through exact CRM identity',()=>{
  const f=fixture(),state=JSON.parse(f.storage.getItem(Store.STORAGE_KEY));
  state.contacts[f.first.id].accountId=state.contacts[f.first.id].holderId='holder_ana';
  state.contacts[f.second.id].accountId=state.contacts[f.second.id].holderId='holder_luis';
  f.storage.setItem(Store.STORAGE_KEY,JSON.stringify(state));
  f.storage.setItem(Office.BO_KEY,JSON.stringify({patients:[{id:'PATIENT_ANA',patientAccountId:'holder_ana',patient:{rfc:'ANA_DEMO',curp:'ANA_CURP'}}],providers:[{id:'PROVIDER_LUIS',doctorAccountId:'holder_luis',fiscal:{rfc:'LUIS_DEMO'},medval:{curp:'LUIS_CURP'}}]}));
  assert.deepEqual(Office.taskContactIdentity(f.storage,f.leader,f.second.id),{rfc:'LUIS_DEMO',curp:'LUIS_CURP'});
  const all=Office.taskContactIdentities(f.storage,f.leader,[f.first.id,f.second.id]);assert.equal(Object.keys(all).length,2);
  assert.deepEqual(Office.taskContactIdentity(f.storage,f.ana,f.second.id),{rfc:'',curp:''});
  assert.equal(Office.listReferenceChoices(f.storage,f.leader,f.second.id).providerId[0].id,'PROVIDER_LUIS');
  assert.deepEqual(Office.listReferenceChoices(f.storage,f.ana,f.second.id).providerId,[]);
});
test('leader public-profile access is CRM-linked, read-only and never reviewer or holder authority',()=>{
  const f=fixture(),providers={ONE:{id:'ONE',accountId:'holder_one',contactId:f.first.id,assignedKam:'kam_ana',eligible:true},TWO:{id:'TWO',accountId:'holder_two',contactId:f.second.id,assignedKam:'kam_luis',eligible:true},LEGACY:{id:'LEGACY',accountId:'holder_legacy',contactId:null,assignedKam:null,eligible:true}};
  const fields={displayName:'Doctor ficticio',specialty:'Demo',city:'Ciudad',state:'Estado',bio:'',phone:'',whatsapp:'',website:'',services:[],links:{},photo:null};
  const make=(actor,extra={})=>Publication.createStore({storage:f.storage,actor,resolveProvider:id=>providers[id],now:f.now,...extra});
  const admin=make(f.admin.actor),leader=make(f.leader.actor);
  for(const id of Object.keys(providers))admin.saveDraft(id,fields,admin.snapshot().revision);
  assert.deepEqual(Object.keys(leader.snapshot().profiles).sort(),['ONE','TWO']);
  const before=f.storage.dump(),rev=leader.snapshot().revision,version=leader.snapshot().profiles.ONE.currentVersionId;
  for(const action of [()=>leader.saveDraft('ONE',fields,rev),()=>leader.confirm('ONE',version,rev),()=>leader.review('ONE',version,'approve','',rev),()=>leader.publish('ONE',version,rev)])assert.throws(action);
  assert.equal(f.storage.dump(),before);
  let live=true;const bound=make(f.ana.actor,{isCurrent:()=>live});bound.snapshot();live=false;
  assert.throws(()=>bound.snapshot(),e=>e.code==='forbidden');assert.throws(()=>bound.saveDraft('ONE',fields,rev),e=>e.code==='forbidden');
});
test('leader consultation projections never disclose invitation or referral bearer tokens',()=>{
  const f=fixture(),invite=good(f.assisted(f.ana).invite(f.expA.id,{email:f.first.email},f.revision()));
  const snapshot=f.leader.snapshot();assert.equal(snapshot.invitations[invite.id].token,undefined);assert.equal(snapshot.referrals[f.refA.id].token,undefined);
  assert.equal(good(f.leader.resolveReferral(f.refA.token,'patient')).token,undefined);
  assert.equal(f.ana.snapshot().invitations[invite.id].token,invite.token);assert.equal(f.admin.snapshot().referrals[f.refA.id].token,f.refA.token);
  const holder=f.make('holder_new','holder');assert.equal(holder.snapshot({invitationToken:invite.token}).invitations[invite.id].token,invite.token);
  assert.doesNotMatch(JSON.stringify(snapshot),new RegExp(invite.token+'|'+f.refA.token+'|'+f.refB.token));
});
test('legacy dashboard follows CDMX calendar months, historical DST and future-event exclusion',()=>{
  const f=fixture(),base=JSON.parse(f.storage.getItem(Store.STORAGE_KEY));
  for(const [at,year,month]of [['2026-10-01T05:59:59.999Z',2026,9],['2026-10-01T06:00:00.000Z',2026,10],['2021-10-01T04:59:59.999Z',2021,9],['2021-10-01T05:00:00.000Z',2021,10],['2021-11-01T05:59:59.999Z',2021,10],['2021-11-01T06:00:00.000Z',2021,11],['2021-05-01T04:59:59.999Z',2021,4],['2021-05-01T05:00:00.000Z',2021,5]]){
    const state=structuredClone(base);state.events={boundary:{id:'boundary',type:'contact_created',contactId:f.first.id,createdAt:at}};f.storage.setItem(Store.STORAGE_KEY,JSON.stringify(state));
    const report=f.leader.dashboard({year,month});assert.equal(report.counts.newContacts,1,at);assert.equal(report.events.length,1,at);
  }
  const early=f.make('leader_early','leader',{now:()=> '2026-10-01T05:59:59.999Z'});assert.deepEqual(early.dashboard().period,{month:9,year:2026});
  const future=structuredClone(base);future.events={future:{id:'future',type:'contact_created',contactId:f.first.id,createdAt:'2026-10-31T12:00:00Z'}};f.storage.setItem(Store.STORAGE_KEY,JSON.stringify(future));assert.equal(f.leader.dashboard({month:10,year:2026}).events.length,0);
});
console.log(`PASS: ${count} CRM role API groups, including adversarial callback, session and reassignment cases.`);
