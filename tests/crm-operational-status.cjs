'use strict';
// Storage-corruption and privacy tests for the read-only CRM operational adapter.
// Genuine holder/import journeys are covered separately by integration tests.
const assert=require('node:assert/strict');
const O=require('../assets/js/crm-demo-office.js');
const S=require('../assets/js/crm-demo-store.js');
const clone=x=>JSON.parse(JSON.stringify(x));
let count=0;
function test(name,run){run();count++;console.log('PASS:',name);}
function storage(){const rows=new Map();return {getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,String(v)),removeItem:k=>rows.delete(k),dump:()=>JSON.stringify([...rows])};}
function good(result){assert.equal(result.ok,true,result.error);return result.value;}
function fixture(kind='patient'){
 const disk=storage();let sequence=0;
 const make=actor=>S.createStore({storage:disk,actor,now:()=>new Date('2026-10-09T06:00:00Z'),randomId:()=>String(++sequence),validateExternalReference:(key,id,c)=>O.validateExternalReference(disk,key,id,c)});
 const staff=make({id:'kam_ana',role:'kam'}),admin=make({id:'admin_demo',role:'admin'}),other=make({id:'kam_luis',role:'kam'});
 const contact=good(staff.createContact({type:kind,name:'Titular Ficticio',email:'ficticio@example.test',phone:'5500000001'},staff.snapshot().revision));
 const identity={id:'holder_demo',email:contact.email,demo:true,verifiedAt:'2026-10-09T05:00:00.000Z'};
 const fields={fullName:contact.name,email:contact.email,phone:contact.phone,procedure:'Consulta demo',requestedAmount:20000,termMonths:12,monthlyIncome:15000,professionalLicense:'DEMO-123',specialty:'Consulta ficticia',clinicAddress:'Dirección ficticia'};
 const actions=Object.fromEntries((kind==='patient'?['otp','buroConsent','finalConfirmation']:['otp','finalConfirmation']).map(key=>[key,{actorId:identity.id,actorRole:'holder',at:'2026-10-09T05:01:00.000Z',confirmed:true,demo:true,capacity:'holder',authorityConfirmed:true}]));
 let exp={id:'EXP_ONE',contactId:contact.id,kind,status:'draft',createdAt:'2026-10-09T05:00:00.000Z',fields,documents:[],holderActions:{}};
 function state(){return JSON.parse(disk.getItem(S.STORAGE_KEY));}
 function saveState(value){disk.setItem(S.STORAGE_KEY,JSON.stringify(value));}
 function saveExp(){const value=state();value.expedients[exp.id]=clone(exp);if(exp.holderIdentity)Object.assign(value.contacts[contact.id],{holderId:identity.id,accountId:identity.id,accountExists:true});saveState(value);return exp;}
 function submitted(){exp={...exp,status:'submitted',holderIdentity:identity,holderActions:actions,submittedAt:'2026-10-09T05:02:00.000Z',submissionRevision:4};exp.submissionSnapshot={schema:'pulzzo.crm.submission.v1',demo:true,revision:4,submissionId:'submission_'+exp.id,expedientId:exp.id,contactId:contact.id,accountId:identity.id,kind,fields:clone(fields),documents:[],holderIdentity:clone(identity),holderActions:clone(actions),holderConfirmation:clone(actions.finalConfirmation),submittedAt:exp.submittedAt};saveExp();return exp;}
 function saveDB(db){disk.setItem(O.BO_KEY,JSON.stringify(db));}
 function imported(){submitted();const result=O.prepareImport({patients:[],providers:[],audit:[]},exp,'admin_demo');saveDB(result.database);return result;}
 return {disk,staff,admin,other,make,contact,kind,identity,actions,state,saveState,saveExp,submitted,imported,saveDB,exp:()=>exp,status:()=>O.operationalStatus(disk,contact,staff),choices:()=>O.listReferenceChoices(disk,staff,contact.id),db:()=>JSON.parse(disk.getItem(O.BO_KEY)),validate:(key,id)=>O.validateExternalReference(disk,key,id,contact)};
}
const empty={expedientId:[],creditId:[],providerId:[],requestId:[],registrationId:[]};

test('a fresh contact has no expediente before or after BO initialization',()=>{
 const f=fixture();assert.equal(f.status(),'Sin expediente');assert.deepEqual(f.choices(),empty);
 f.saveDB({patients:[],providers:[]});assert.equal(f.status(),'Sin expediente');assert.equal(O.operationalStatus(f.disk,f.contact),'Sin expediente');
 good(f.staff.moveCommercialStage(f.contact.id,'application_started',{},f.staff.snapshot().revision));assert.equal(f.status(),'Sin expediente','A commercial stage is not an expediente or a submission');
});
test('local drafts, invitations and holder capture do not claim a BO submission',()=>{
 for(const kind of ['patient','doctor']){
  const f=fixture(kind);f.saveExp();assert.equal(f.status(),kind==='patient'?'Borrador de solicitud':'Borrador de registro');
  assert.equal(f.choices().expedientId[0].id,f.exp().id);assert.match(f.choices().expedientId[0].label,/Titular Ficticio/);
  f.exp().status='invited';f.saveExp();assert.match(f.status(),/Invitación preparada/);
  f.exp().status='claimed';f.exp().holderIdentity=f.identity;f.saveExp();assert.equal(f.status(),'En captura por el titular');
  f.exp().holderActions=f.actions;f.saveExp();assert.equal(f.status(),'Confirmado por el titular · pendiente de envío');
 }
});
test('only exact confirmed submissions become pending import; real BO status then wins',()=>{
 for(const kind of ['patient','doctor']){
  const f=fixture(kind);f.submitted();assert.equal(f.status(),'Enviado por el titular · pendiente de importar a backoffice');
  f.saveDB({patients:[],providers:[]});assert.match(f.status(),/pendiente de importar/);
  const result=f.imported();assert.equal(f.status(),kind==='patient'?'en_evaluacion':'perfil_en_revision');
  assert.doesNotMatch(f.choices().expedientId[0].label,/pendiente de importar/);
  const key=kind==='patient'?'creditId':'providerId';assert.equal(f.choices()[key][0].id,result.id);assert.equal(f.validate(key,result.id),true);
  assert.deepEqual(f.choices()[kind==='patient'?'requestId':'registrationId'],f.choices()[key]);
  assert.equal(f.choices()[kind==='patient'?'registrationId':'creditId'].length,0);
 }
});
test('an unverified or tampered local submission is never shown as ready to import',()=>{
 const changes=[e=>delete e.submissionSnapshot,e=>{e.submittedAt='invalid-date';e.submissionSnapshot.submittedAt='invalid-date';},e=>e.submissionSnapshot.accountId='wrong_holder',e=>e.submissionSnapshot.submittedAt='wrong',e=>e.submissionSnapshot.revision++,e=>e.submissionSnapshot.holderActions.otp.actorId='kam_ana',e=>e.fields.requestedAmount=99];
 for(const change of changes){const f=fixture();f.submitted();change(f.exp());f.saveExp();assert.equal(f.status(),'Envío pendiente de verificación');}
});
test('forged contact-only BO rows cannot expose status, reference IDs or holder offers',()=>{
 for(const startDraft of [false,true]){
  const f=fixture();if(startDraft)f.saveExp();f.saveDB({patients:[{id:'FOREIGN_SECRET_ID',patientAccountId:'foreign_holder',crmIntake:{contactId:f.contact.id},application:{applicationStatus:'SECRET_STATUS'},notes:['SECRET_NOTE']}],providers:[]});
  assert.equal(f.status(),'Requiere conciliación de identidades');assert.equal(f.choices().creditId.length,0);assert.equal(f.validate('creditId','FOREIGN_SECRET_ID'),false);
  assert.doesNotMatch(JSON.stringify(f.choices()),/FOREIGN|SECRET/);
  const result=f.staff.addActivity({contactId:f.contact.id,summary:'Referencia inválida demo',creditId:'FOREIGN_SECRET_ID'},f.staff.snapshot().revision);assert.equal(result.ok,false);assert.equal(result.code,'invalid_reference');
 }
});
test('all imported identity coordinates bind the same immutable local receipt',()=>{
 const mutations=[r=>r.crmIntake.contactId='OTHER_CONTACT',r=>delete r.crmIntake.contactId,r=>r.crmIntake.expedientId='OTHER_EXP',r=>r.crmIntake.accountId='OTHER_ACCOUNT',r=>r.patientAccountId='OTHER_ACCOUNT',r=>r.crmIntake.submissionId='OTHER_SUBMISSION',r=>r.crmIntake.submittedAt='2026-10-08T00:00:00Z'];
 for(const mutation of mutations){
  const f=fixture(),result=f.imported(),db=f.db();mutation(db.patients[0]);f.saveDB(db);
  assert.equal(f.status(),'Requiere conciliación de identidades');assert.equal(f.choices().creditId.length,0);assert.equal(f.validate('creditId',result.id),false);assert.equal(O.readSubmittedRecord(f.disk,f.exp()),null);
 }
});
test('ambiguous record IDs and duplicate intake identities cannot be selected',()=>{
 for(const duplicateId of [true,false]){const f=fixture(),result=f.imported(),db=f.db();db.patients.push({...clone(db.patients[0]),id:duplicateId?result.id:'APP_DUPLICATE'});f.saveDB(db);assert.equal(f.status(),'Requiere conciliación de identidades');assert.equal(f.choices().creditId.length,0);assert.equal(f.validate('creditId',result.id),false);}
 const f=fixture();f.submitted();const state=f.state();state.expedients.EXP_TWO={...clone(f.exp()),id:'EXP_TWO'};f.saveState(state);assert.equal(f.status(),'Requiere conciliación de identidades');assert.deepEqual(f.choices(),empty);assert.equal(O.expedienteUrl(f.staff,f.contact.id,f.exp().id),null);
});
test('reference projections exclude amounts, offers, holder actions and nested private history',()=>{
 const f=fixture();f.imported();const db=f.db(),r=db.patients[0];r.patient.incomeMonthly='SECRET_INCOME';r.offer={approvedAmount:'SECRET_AMOUNT',commercialSpread:'SECRET_SPREAD'};r.payments=[{private:'SECRET_PAYMENT'}];r.timeline=[{note:'SECRET_TIMELINE'}];r.risk={score:'SECRET_SCORE'};r.notes=['SECRET_NOTE'];f.saveDB(db);
 const choices=f.choices();assert.equal(choices.creditId.length,1);assert.doesNotMatch(JSON.stringify(choices),/SECRET|income|payments|risk|holderActions|submissionSnapshot/);
 for(const entries of Object.values(choices))for(const entry of entries)assert.deepEqual(Object.keys(entry).sort(),['id','label']);
});
test('linked provider names are selectable without revealing their operational or financial details',()=>{
 const f=fixture();f.imported();const db=f.db();db.patients[0].application.procedureProviders=[{providerId:'MED_LINKED'}];db.providers=[{id:'MED_LINKED',profile:{name:'Clínica ficticia',email:'SECRET_EMAIL'},status:'SECRET_PROVIDER_STATUS',financial:{amount:'SECRET_FINANCE'},crmIntake:{contactId:'OTHER_KAM_CONTACT'}},{id:'MED_OTHER',profile:{name:'SECRET_OTHER_NAME'}}];f.saveDB(db);
 assert.deepEqual(f.choices().providerId,[{id:'MED_LINKED',label:'Proveedor · Clínica ficticia · MED_LINKED'}]);assert.equal(f.validate('providerId','MED_LINKED'),true);assert.equal(f.validate('registrationId','MED_LINKED'),false);assert.equal(f.validate('providerId','MED_OTHER'),false);assert.doesNotMatch(JSON.stringify(f.choices()),/SECRET/);
 db.providers.push(clone(db.providers[0]));f.saveDB(db);assert.equal(f.choices().providerId.length,0);assert.equal(f.validate('providerId','MED_LINKED'),false);
});
test('legacy operation linkage uses stable accounts only and never treats partial intake as legacy',()=>{
 const f=fixture();f.submitted();const db={patients:[{id:'APP_LEGACY',patientAccountId:f.identity.id,patient:{fullName:'Same name'},application:{applicationStatus:'activo'}}],providers:[]};f.saveDB(db);assert.equal(f.status(),'activo');assert.equal(f.choices().creditId[0].id,'APP_LEGACY');assert.equal(f.validate('creditId','APP_LEGACY'),true);assert.equal(O.readSubmittedRecord(f.disk,f.exp()),null,'Legacy account matching is not an imported holder offer');
 db.patients[0].crmIntake={expedientId:'WRONG_EXP',submissionId:'WRONG_SUBMISSION'};f.saveDB(db);assert.equal(f.status(),'Requiere conciliación de identidades');assert.equal(f.choices().creditId.length,0);assert.equal(f.validate('creditId','APP_LEGACY'),false);
 delete db.patients[0].crmIntake;delete db.patients[0].patientAccountId;db.patients[0].patient.email=f.contact.email;f.saveDB(db);assert.match(f.status(),/pendiente de importar/);assert.equal(f.choices().creditId.length,0);
});
test('every lookup and URL reevaluates access after reassignment, never using cached contact ownership',()=>{
 const f=fixture();f.imported();const cached=f.contact,url='backoffice.html#crm/patient/contacts/'+encodeURIComponent(f.contact.id);
 assert.equal(O.expedienteUrl(f.staff,cached.id,f.exp().id),url);assert.deepEqual(O.listReferenceChoices(f.disk,f.other,cached.id),empty);assert.equal(O.operationalStatus(f.disk,cached,f.other),'Estado no disponible');assert.equal(O.expedienteUrl(f.other,cached.id,f.exp().id),null);
 good(f.admin.reassignContact(cached.id,'kam_luis','Cambio de responsable demo',f.admin.snapshot().revision));
 assert.deepEqual(f.choices(),empty);assert.equal(f.status(),'Estado no disponible');assert.equal(O.expedienteUrl(f.staff,cached.id,f.exp().id),null);assert.equal(O.expedienteUrl(f.other,cached.id,f.exp().id),url);assert.equal(O.listReferenceChoices(f.disk,f.other,cached.id).creditId.length,1);
});
test('invalid/deleted references and holder sessions cannot mint staff navigation or selector data',()=>{
 const f=fixture();f.imported();const holder=f.make({id:f.identity.id,role:'holder'});
 assert.deepEqual(O.listReferenceChoices(f.disk,holder,f.contact.id),empty);assert.equal(O.expedienteUrl(holder,f.contact.id,f.exp().id),null);
 for(const id of ['../OTHER','javascript:alert(1)','__proto__','missing'])assert.equal(O.expedienteUrl(f.staff,f.contact.id,id),null);
 assert.equal(O.expedienteUrl(f.staff,'OTHER_CONTACT',f.exp().id),null);
 const state=f.state();state.contacts[f.contact.id].deletedAt='2026-10-09T06:00:00Z';f.saveState(state);assert.deepEqual(f.choices(),empty);assert.equal(f.status(),'Estado no disponible');assert.equal(O.expedienteUrl(f.staff,f.contact.id,f.exp().id),null);
});
test('bare BO-only IDs are insufficient and all successful/denied read APIs leave storage untouched',()=>{
 const f=fixture(),result=f.imported(),before=f.disk.dump();f.status();f.choices();f.validate('creditId',result.id);O.expedienteUrl(f.staff,f.contact.id,f.exp().id);O.listReferenceChoices(f.disk,f.other,f.contact.id);O.readSubmittedRecord(f.disk,f.exp());assert.equal(f.disk.dump(),before);
 f.disk.removeItem(S.STORAGE_KEY);const bareBefore=f.disk.dump();assert.equal(O.operationalStatus(f.disk,{id:f.contact.id}),'Estado no disponible');assert.equal(O.validateExternalReference(f.disk,'creditId',result.id,f.contact),false);assert.equal(f.disk.dump(),bareBefore);
});
console.log(`PASS: ${count} operational status, exact-binding, privacy and URL guard tests.`);
