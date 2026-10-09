'use strict';
const assert=require('node:assert/strict');
const O=require('../assets/js/crm-demo-office.js');
const S=require('../assets/js/crm-demo-store.js');
const clone=value=>JSON.parse(JSON.stringify(value)),empty={rfc:'',curp:''};
const identities={patient:{rfc:'MUAJ900101AB7',curp:'MUAJ900101HDFNNN09'},doctor:{rfc:'SARH820202BB2',curp:'SARH820202HNLNBL02'}};
let count=0;
function test(name,run){run();count++;console.log('PASS:',name);}
function good(result){assert.equal(result.ok,true,result.error);return result.value;}
function fixture(kind='patient'){
 const rows=new Map(),reads=[];
 const disk={getItem:key=>{reads.push(key);return rows.get(key)??null;},setItem:(key,value)=>rows.set(key,String(value)),removeItem:key=>rows.delete(key),dump:()=>JSON.stringify([...rows])};
 let sequence=0;
 const make=actor=>S.createStore({storage:disk,actor,now:()=>new Date('2026-10-09T06:00:00Z'),randomId:()=>String(++sequence)});
 const staff=make({id:'kam_ana',role:'kam'}),admin=make({id:'admin_demo',role:'admin'}),other=make({id:'kam_luis',role:'kam'});
 const contact=good(staff.createContact({type:kind,name:'Titular Ficticio',email:'ficticio@example.test',phone:'5500000001'},staff.snapshot().revision));
 const holder={id:'holder_demo',email:contact.email,demo:true,verifiedAt:'2026-10-09T05:00:00.000Z'};
 const fields={fullName:contact.name,email:contact.email,phone:contact.phone,procedure:'Consulta demo',requestedAmount:20000,termMonths:12,monthlyIncome:15000,professionalLicense:'DEMO-123',specialty:'Consulta ficticia',clinicAddress:'Dirección ficticia'};
 const actions=Object.fromEntries((kind==='patient'?['otp','buroConsent','finalConfirmation']:['otp','finalConfirmation']).map(key=>[key,{actorId:holder.id,actorRole:'holder',at:'2026-10-09T05:01:00.000Z',confirmed:true,demo:true,capacity:'holder',authorityConfirmed:true}]));
 const exp={id:'EXP_ONE',contactId:contact.id,kind,status:'submitted',createdAt:'2026-10-09T05:00:00.000Z',fields,documents:[],holderIdentity:holder,holderActions:actions,submittedAt:'2026-10-09T05:02:00.000Z',submissionRevision:4};
 exp.submissionSnapshot={schema:'pulzzo.crm.submission.v1',demo:true,revision:4,submissionId:'submission_'+exp.id,expedientId:exp.id,contactId:contact.id,accountId:holder.id,kind,fields:clone(fields),documents:[],holderIdentity:clone(holder),holderActions:clone(actions),holderConfirmation:clone(actions.finalConfirmation),submittedAt:exp.submittedAt};
 const state=()=>JSON.parse(disk.getItem(S.STORAGE_KEY)),saveState=value=>disk.setItem(S.STORAGE_KEY,JSON.stringify(value));
 const db=()=>JSON.parse(disk.getItem(O.BO_KEY)),saveDB=value=>disk.setItem(O.BO_KEY,JSON.stringify(value));
 function imported(){
  const current=state();current.expedients[exp.id]=clone(exp);Object.assign(current.contacts[contact.id],{holderId:holder.id,accountId:holder.id,accountExists:true});saveState(current);
  const result=O.prepareImport({patients:[],providers:[],audit:[]},exp,'admin_demo'),record=result.record;
  if(kind==='patient')Object.assign(record.patient,identities.patient);else{record.fiscal.rfc=identities.doctor.rfc;record.medval.curp=identities.doctor.curp;}
  saveDB(result.database);return record;
 }
 return {disk,reads,staff,admin,other,make,contact,kind,holder,exp,state,saveState,db,saveDB,imported,identity:()=>{
  const single=O.taskContactIdentity(disk,staff,contact.id),batch=O.taskContactIdentities(disk,staff,[contact.id]);
  assert.deepEqual(batch[contact.id]||empty,single,'Batch and individual projection must apply identical identity guards');return single;
 }};
}

test('fresh contacts and missing identifiers return empty without initializing BO or changing CRM',()=>{
 for(const kind of ['patient','doctor']){
  const f=fixture(kind),before=f.disk.dump();assert.deepEqual(f.identity(),empty);assert.equal(f.disk.dump(),before);
  f.imported();const db=f.db(),record=(kind==='patient'?db.patients:db.providers)[0];
  if(kind==='patient'){delete record.patient.rfc;delete record.patient.curp;}else{record.fiscal={};record.medval={};}
  f.saveDB(db);assert.deepEqual(f.identity(),empty);
  const state=f.state();state.contacts[f.contact.id].rfc='UNTRUSTED_CONTACT_RFC';state.contacts[f.contact.id].curp='UNTRUSTED_CONTACT_CURP';f.saveState(state);assert.deepEqual(f.identity(),empty);
 }
});
test('exact patient and provider imports expose only their own two identifiers',()=>{
 for(const kind of ['patient','doctor']){
  const f=fixture(kind);f.imported();const db=f.db(),record=(kind==='patient'?db.patients:db.providers)[0];
  record.notes=['SECRET_NOTE'];record.offer={secret:'SECRET_OFFER'};record.payments=[{secret:'SECRET_PAYMENT'}];record.patient={...record.patient,incomeMonthly:'SECRET_INCOME'};record.fiscal={...record.fiscal,clabe:'SECRET_BANK'};
  f.saveDB(db);const before=f.disk.dump();assert.deepEqual(f.identity(),identities[kind]);assert.deepEqual(O.taskContactIdentity(f.disk,f.admin,f.contact.id),identities[kind]);assert.deepEqual(Object.keys(f.identity()).sort(),['curp','rfc']);assert.equal(f.disk.dump(),before);
 }
});
test('native patient handoff paths are supported, equivalent formatting agrees and conflicts fail closed',()=>{
 const f=fixture();f.imported();const db=f.db(),r=db.patients[0];delete r.patient.rfc;delete r.patient.curp;r.application.identity={...identities.patient};f.saveDB(db);assert.deepEqual(f.identity(),identities.patient);
 Object.assign(r.application,identities.patient);r.patient.rfc=' muaj-900101 AB7 ';r.patient.curp=' MUAJ 900101-HDFNNN09 ';f.saveDB(db);assert.deepEqual(f.identity(),{rfc:'muaj-900101 AB7',curp:'MUAJ 900101-HDFNNN09'});
 for(const key of ['rfc','curp']){const changed=clone(db);changed.patients[0].application.identity[key]='FOREIGN_IDENTIFIER';f.saveDB(changed);assert.deepEqual(f.identity(),empty);}
});
test('provider clinical representatives and patients’ selected providers are never treated as the contact identity',()=>{
 const d=fixture('doctor');d.imported();let db=d.db();db.providers[0].medval={};db.providers[0].clinicDocs={responsibleCurp:'FOREIGN_RESPONSIBLE_CURP'};db.providers[0].profile.curp='UNVERIFIED_PROFILE_CURP';d.saveDB(db);assert.deepEqual(d.identity(),{rfc:identities.doctor.rfc,curp:''});
 const p=fixture();p.imported();db=p.db();db.patients[0].patient={};db.patients[0].application.identity={};db.patients[0].application.procedureProviders=[{providerId:'FOREIGN_PROVIDER'}];db.providers=[{id:'FOREIGN_PROVIDER',fiscal:{rfc:'FOREIGN_PROVIDER_RFC'},medval:{curp:'FOREIGN_PROVIDER_CURP'}}];p.saveDB(db);assert.deepEqual(p.identity(),empty);
});
test('global same-name, email and phone matches cannot supply a missing contact identity',()=>{
 const f=fixture();const foreign={id:'FOREIGN_PATIENT',patientAccountId:'foreign_holder',patient:{fullName:f.contact.name,email:f.contact.email,phone:f.contact.phone,...identities.patient},application:{identity:{rfc:'FOREIGN_RFC',curp:'FOREIGN_CURP'}}};
 f.saveDB({patients:[foreign],providers:[{id:'FOREIGN_DOCTOR',doctorAccountId:'another_holder',profile:{name:f.contact.name,email:f.contact.email},contact:{registered:f.contact.phone},fiscal:{rfc:'FOREIGN_PROVIDER_RFC'},medval:{curp:'FOREIGN_PROVIDER_CURP'}}]});
 f.reads.length=0;const before=f.disk.dump();assert.deepEqual(f.identity(),empty);assert.ok(f.reads.every(key=>[O.BO_KEY,S.STORAGE_KEY].includes(key)));assert.equal(f.disk.dump(),before);
 f.imported();const db=f.db();db.patients.push(foreign);f.saveDB(db);assert.deepEqual(f.identity(),identities.patient,'An unrelated lookalike does not override the exact linked record');
});
test('all imported account, contact and receipt coordinates must match the immutable submission',()=>{
 const changes=[r=>r.crmIntake.contactId='OTHER_CONTACT',r=>delete r.crmIntake.contactId,r=>r.crmIntake.expedientId='OTHER_EXP',r=>r.crmIntake.accountId='OTHER_ACCOUNT',r=>r.patientAccountId='OTHER_ACCOUNT',r=>r.crmIntake.submissionId='OTHER_SUBMISSION',r=>r.crmIntake.submittedAt='2026-10-08T00:00:00Z',r=>r.crmIntake={contactId:r.crmIntake.contactId},r=>r.doctorAccountId='holder_demo'];
 for(const change of changes){const f=fixture();f.imported();const db=f.db();change(db.patients[0]);f.saveDB(db);assert.deepEqual(f.identity(),empty);}
 for(const change of [e=>delete e.submissionSnapshot,e=>e.fields.requestedAmount=99,e=>e.submissionSnapshot.holderActions.otp.actorId='kam_ana',e=>e.submissionSnapshot.revision++]){
  const f=fixture();f.imported();const state=f.state();change(state.expedients[f.exp.id]);f.saveState(state);assert.deepEqual(f.identity(),empty);
 }
});
test('legacy lookups require one exact stable account and reject partial intake or conflicting contact identities',()=>{
 for(const kind of ['patient','doctor']){
  const f=fixture(kind);f.imported();const db=f.db(),record=(kind==='patient'?db.patients:db.providers)[0];delete record.crmIntake;f.saveDB(db);assert.deepEqual(f.identity(),identities[kind]);
  record.crmIntake={contactId:f.contact.id};f.saveDB(db);assert.deepEqual(f.identity(),empty);delete record.crmIntake;
  delete record[kind==='patient'?'patientAccountId':'doctorAccountId'];f.saveDB(db);assert.deepEqual(f.identity(),empty);
 }
 for(const account of ['WRONG_ACCOUNT',{id:'holder_demo'},123]){const f=fixture();f.imported();const state=f.state();state.contacts[f.contact.id].accountId=account;f.saveState(state);assert.deepEqual(f.identity(),empty);}
});
test('duplicate records, duplicate IDs, duplicate expedients and patient/provider mismatches fail closed',()=>{
 for(const variant of ['linked_duplicate','foreign_same_id','cross_kind_id','cross_kind_account','duplicate_expedient','wrong_expedient_kind','wrong_contact_kind']){
  const f=fixture();f.imported();const db=f.db(),state=f.state(),record=db.patients[0];
  if(variant==='linked_duplicate')db.patients.push({...clone(record),id:'DUPLICATE_PATIENT'});
  if(variant==='foreign_same_id')db.patients.push({id:record.id,patientAccountId:'foreign_holder',patient:{rfc:'FOREIGN'}});
  if(variant==='cross_kind_id')db.providers.push({id:record.id,fiscal:{rfc:'FOREIGN'}});
  if(variant==='cross_kind_account')db.providers.push({id:'FOREIGN_PROVIDER',doctorAccountId:f.holder.id,fiscal:{rfc:'FOREIGN'}});
  if(variant==='duplicate_expedient')state.expedients.EXP_TWO={...clone(f.exp),id:'EXP_TWO'};
  if(variant==='wrong_expedient_kind')state.expedients[f.exp.id].kind='doctor';
  if(variant==='wrong_contact_kind')state.contacts[f.contact.id].type='doctor';
  f.saveDB(db);f.saveState(state);assert.deepEqual(f.identity(),empty,variant);
 }
});
test('every read reevaluates assignment, archive and staff access without trusting a cached contact',()=>{
 const f=fixture();f.imported();assert.deepEqual(f.identity(),identities.patient);assert.deepEqual(O.taskContactIdentity(f.disk,f.other,f.contact.id),empty);assert.deepEqual(O.taskContactIdentity(f.disk,f.make({id:f.holder.id,role:'holder'}),f.contact.id),empty);
 good(f.admin.reassignContact(f.contact.id,'kam_luis','Cambio de responsable demo',f.admin.snapshot().revision));assert.deepEqual(f.identity(),empty);assert.deepEqual(O.taskContactIdentity(f.disk,f.other,f.contact.id),identities.patient);
 const state=f.state();state.contacts[f.contact.id].deletedAt='2026-10-09T06:00:00Z';f.saveState(state);assert.deepEqual(O.taskContactIdentity(f.disk,f.other,f.contact.id),empty);assert.deepEqual(O.taskContactIdentity(f.disk,f.admin,f.contact.id),empty);
 for(const id of [null,'__proto__','../OTHER','javascript:alert(1)','missing'])assert.deepEqual(O.taskContactIdentity(f.disk,f.admin,id),empty);
});
test('a reassignment during the BO read cannot release an already-resolved identity',()=>{
 const f=fixture();f.imported();const storage={getItem:key=>{const raw=f.disk.getItem(key);if(key===O.BO_KEY){const state=f.state();state.contacts[f.contact.id].assignedKam='kam_luis';f.saveState(state);}return raw;}};
 assert.deepEqual(O.taskContactIdentity(storage,f.staff,f.contact.id),empty);
});
test('malformed storage, rows, nested data and non-string identifiers return empty without throwing or writing',()=>{
 for(const raw of ['{','null','[]','{}','{"patients":[],"providers":{}}','{"patients":[null],"providers":[]}','{"patients":[42],"providers":[]}']){
  const f=fixture();f.imported();f.disk.setItem(O.BO_KEY,raw);const before=f.disk.dump();assert.deepEqual(f.identity(),empty);assert.equal(f.disk.dump(),before);
 }
 for(const value of [{private:'SECRET'},['SECRET'],123,true,'X'.repeat(81),'VALID\u0000SECRET']){const f=fixture();f.imported();const db=f.db();db.patients[0].patient.rfc=value;f.saveDB(db);assert.deepEqual(f.identity(),empty);}
 for(const value of [[],true,'invalid']){const f=fixture();f.imported();const db=f.db();db.patients[0].application.identity=value;f.saveDB(db);assert.deepEqual(f.identity(),empty);}
 const f=fixture();f.imported();assert.deepEqual(O.taskContactIdentity({getItem(){throw Error('blocked');}},f.staff,f.contact.id),empty);assert.deepEqual(O.taskContactIdentity(f.disk,null,f.contact.id),empty);
 f.disk.setItem(S.STORAGE_KEY,'{');assert.deepEqual(f.identity(),empty);
});
test('batch results contain only requested accessible active staff contacts and no persistent cache',()=>{
 const f=fixture();f.imported();const state=f.state();state.contacts.FOREIGN_CONTACT={...clone(state.contacts[f.contact.id]),id:'FOREIGN_CONTACT',assignedKam:'kam_luis'};state.contacts.ARCHIVED_CONTACT={...clone(state.contacts[f.contact.id]),id:'ARCHIVED_CONTACT',deletedAt:'2026-10-09T06:00:00Z'};f.saveState(state);
 const ids=[f.contact.id,'FOREIGN_CONTACT','ARCHIVED_CONTACT','MISSING','__proto__','constructor',f.contact.id],before=f.disk.dump();
 assert.deepEqual(O.taskContactIdentities(f.disk,f.staff,ids),{[f.contact.id]:identities.patient});
 assert.deepEqual(O.taskContactIdentities(f.disk,f.make({id:f.holder.id,role:'holder'}),ids),{});
 assert.deepEqual(O.taskContactIdentities(f.disk,f.staff,null),{});assert.deepEqual(O.taskContactIdentities(f.disk,f.staff,[]),{});assert.equal(f.disk.dump(),before);
 state.contacts[f.contact.id].assignedKam='kam_luis';f.saveState(state);assert.deepEqual(O.taskContactIdentities(f.disk,f.staff,[f.contact.id]),{});
});
test('batch fails closed if access or source identity changes during its read',()=>{
 for(const field of ['assignedKam','accountId','deletedAt']){
  const f=fixture();f.imported();const storage={getItem:key=>{const raw=f.disk.getItem(key);if(key===O.BO_KEY){const state=f.state();state.contacts[f.contact.id][field]=field==='deletedAt'?'2026-10-09T06:00:00Z':'changed_identity';f.saveState(state);}return raw;}};
  assert.deepEqual(O.taskContactIdentities(storage,f.staff,[f.contact.id]),{});
 }
});
test('250-contact query uses one BO read and two scoped snapshots, never a per-candidate store read',()=>{
 const f=fixture(),state=f.state(),ids=[],db={patients:[],providers:[]};state.contacts={};
 for(let i=0;i<250;i++){
  const id='CONTACT_'+i,account='ACCOUNT_'+i;ids.push(id);state.contacts[id]={...clone(f.contact),id,accountId:account,holderId:account};
  db.patients.push({id:'PATIENT_'+i,patientAccountId:account,patient:{rfc:'RFC_'+i,curp:'CURP_'+i}});
 }
 f.saveState(state);f.saveDB(db);let snapshots=0,boReads=0;
 const store={actor:f.staff.actor,snapshot:()=>{snapshots++;return f.staff.snapshot();},getContact(){throw Error('Batch must use the actor-scoped snapshot');}},storage={getItem:key=>{if(key===O.BO_KEY)boReads++;return f.disk.getItem(key);}};
 const started=performance.now(),result=O.taskContactIdentities(storage,store,ids),elapsed=performance.now()-started;
 assert.equal(Object.keys(result).length,250);for(let i=0;i<250;i++)assert.deepEqual(result[ids[i]],{rfc:'RFC_'+i,curp:'CURP_'+i});assert.equal(snapshots,2);assert.equal(boReads,1);
 console.log(`INFO: 250-contact batch identity query: ${elapsed.toFixed(1)} ms`);
});
console.log(`PASS: ${count} privacy-scoped task contact identity suites.`);
