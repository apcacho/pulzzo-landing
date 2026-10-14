'use strict';
// Actual-source, browser-free checks. They do not claim visual/browser coverage.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'solicitud-paciente.html'),'utf8');
const Demo=require('../assets/js/patient-demo.js'),Servicing=require('../assets/js/demo-servicing.js'),Bridge=require('../assets/pulzzo-demo-bridge.js');
const flowSource=fs.readFileSync(path.join(__dirname,'patient-flows.cjs'),'utf8');
const harness=new Function('source','Demo','vm','assert',flowSource.slice(flowSource.indexOf('function functionSource'),flowSource.indexOf('const completed='))+';return harness;')(source,Demo,vm,assert);
const clone=x=>JSON.parse(JSON.stringify(x));
function store(seed={}){
 const data=new Map(Object.entries(seed).map(([k,v])=>[k,typeof v==='string'?v:JSON.stringify(v)]));
 return {data,getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
}
const legacyPatient={demo:true,demoId:'synthetic-legacy',correo:'patient@example.test',fullName:'Paciente Demo'};
const legacyState={applicationId:'APP-LEGACY',offerAccepted:true,contractSigned:true,signatureStatus:'signed',offer:{approvedAmount:125000.01,monthlyPayment:11001.23,termMonths:12},signedContractUrl:'about:blank',payments:[{amount:500.01}]};
const migration=store({pulzzo_patient:legacyPatient,pulzzo_application:legacyState});
const account=Demo.migratePatientAccount(migration);
assert.ok(account.patientAccountId.startsWith('PAT-'));
const migratedPatient=JSON.parse(migration.getItem('pulzzo_patient')),migratedState=JSON.parse(migration.getItem('pulzzo_application'));
assert.equal(migratedState.patientAccountId,account.patientAccountId);
assert.deepEqual({...migratedState,patientAccountId:undefined},{...legacyState,patientAccountId:undefined});
assert.deepEqual({...migratedPatient,patientAccountId:undefined},{...legacyPatient,patientAccountId:undefined});
const afterMigration=JSON.stringify([...migration.data]);Demo.migratePatientAccount(migration);assert.equal(JSON.stringify([...migration.data]),afterMigration,'migration is stable on reload');
assert.notEqual(Demo.newPatientAccountId(),Demo.newPatientAccountId(),'fresh demo accounts never reuse static email identity');
for(const seed of [
 {pulzzo_patient:{...legacyPatient,patientAccountId:'PAT-B'},pulzzo_application:{...legacyState,patientAccountId:'PAT-A'}},
 {pulzzo_patient:legacyPatient,pulzzo_application:'{broken'},
 {pulzzo_patient:{...legacyPatient,patientAccountId:123},pulzzo_application:legacyState},
]){
 const blocked=store(seed),before=JSON.stringify([...blocked.data]);assert.throws(()=>Demo.migratePatientAccount(blocked));assert.equal(JSON.stringify([...blocked.data]),before);
}
const quota=store({pulzzo_patient:legacyPatient,pulzzo_application:legacyState}),beforeQuota=JSON.stringify([...quota.data]),set=quota.setItem;
quota.setItem=(key,value)=>{if(key==='pulzzo_application')throw Error('QuotaExceededError');set(key,value);};
assert.throws(()=>Demo.migratePatientAccount(quota),/Quota/);assert.equal(JSON.stringify([...quota.data]),beforeQuota,'failed application migration restores its own account write');
console.log('PASS: stable additive patient identity migration preserves accepted terms, signed contracts and payment facts; mismatch, malformed and failed-storage cases fail closed.');

const rows=[
 {id:'R-1',number:1,type:'Pago inicial requerido',originalDueDate:'2026-09-05',currentDueDate:'2026-09-05',dueDate:'2026-09-05',paymentFrequency:'Quincenal',capital:1000,interest:100,interestIva:16,moratory:0,moratoryIva:0,commission:0,totalPayment:1116,paidAmount:1116,pendingAmount:0,capitalPending:0,status:'Pagado',dpd:0},
 {id:'R-2',number:2,type:'Pago inicial requerido',originalDueDate:'2026-09-20',currentDueDate:'2026-10-05',dueDate:'2026-10-05',paymentFrequency:'Quincenal',capital:1000.01,interest:100.01,interestIva:16,moratory:10,moratoryIva:1.6,commission:20,totalPayment:1147.62,paidAmount:500.01,pendingAmount:647.61,capitalPending:600.01,status:'Vencido',dpd:3,extensionStatus:'active',extensionDays:15,extendedDueDate:'2026-10-05'},
 {id:'R-3',number:3,type:'Mensualidad',originalDueDate:'2026-10-20',currentDueDate:'2026-10-20',dueDate:'2026-10-20',paymentFrequency:'Quincenal',capital:0,interest:0,interestIva:0,moratory:0,moratoryIva:0,commission:0,totalPayment:0,paidAmount:0,pendingAmount:0,capitalPending:0,status:'Reducida por prepago',dpd:0}
];
function patientHarness(payloadOverride={}){
 const state={applicationId:'APP-SERVICING',patientAccountId:'PAT-OWNER',offerReady:true,offerAccepted:true,offerAcceptedAt:'2026-08-01T12:00:00.000Z',contractSigned:true,signatureStatus:'signed',preferredPaymentDay:'5 y 20',paymentFrequency:'Quincenal',offer:{approvedAmount:2000.01,monthlyPayment:2232.01,termMonths:12,initialPaymentRequired:true,initialInstallments:2},signedContractUrl:'about:blank'};
 state.demoBridgeCaseId='CREDIT-A';state.demoBridgeOfferFingerprint=Bridge.fingerprint(state.offer);
 const h=harness(state),patient={...legacyPatient,patientAccountId:'PAT-OWNER'};
 h.context.patientFromStorage=patient;h.context.window.PulzzoDemoServicing=Servicing;h.context.window.PulzzoDemoBridge=Bridge;
 h.data.set('pulzzo_patient',JSON.stringify(patient));h.context.patientStorageSnapshot=h.data.get('pulzzo_patient');
 h.data.set('pulzzo_verified','true');h.context.verifiedStorageSnapshot='true';
 h.checkpoint=()=>{const raw=JSON.stringify(h.state);h.data.set('pulzzo_application',raw);h.context.applicationStorageSnapshot=raw;h.context.applicationMemorySnapshot=raw;};
 h.checkpoint();
 h.payload={creditId:'CREDIT-A',offerFingerprintDigest:Servicing.digestText(state.demoBridgeOfferFingerprint),sourceApplicationId:state.applicationId,patientAccountId:patient.patientAccountId,calculatedAt:'2026-10-08',summary:{outstanding:600.01,overdue:647.61,settled:false,nextDueDate:'2026-10-05',nextPaymentAmount:647.61,currency:'MXN',calendarStatus:'active',openingFee:{mode:'upfront',due:116,paid:50,pending:66}},rows:clone(rows),initialPayments:{required:2,covered:1,pendingAmount:647.61},...payloadOverride};
 h.envelope=Servicing.publish(h.context.localStorage,'patient_servicing',state.patientAccountId,state.applicationId,h.payload);
 h.received=()=>{state.servicingProjection=clone(h.envelope);h.checkpoint();};
 h.modal='';h.context.openPortalFlowModal=(_title,html)=>{h.modal=html;};
 return h;
}
const pending=patientHarness();
assert.equal(pending.context.getAmortizationSchedule().length,0);
assert.match(pending.context.renderMiniAmortizationSummary(),/Calendario pendiente de recibir/);
for(const name of ['renderPostApprovalFlowDesktop','renderPostApprovalFlowMobile']){
 const html=pending.context[name]();assert.match(html,/Pendiente de recibir/);assert.match(html,/data-stage-action="view-schedule" disabled/);
}
pending.context.showScheduleModal();assert.doesNotMatch(pending.modal,/<tbody>|\$2,232/);
const h=patientHarness();h.received();
const snapshot=JSON.stringify(h.state),stored=h.data.get('pulzzo_application');
const priorCalculator=Demo.paymentSchedule;Demo.paymentSchedule=()=>{throw Error('Patient portal must never calculate servicing');};
assert.deepEqual(clone(h.context.getAmortizationSchedule()),rows);
h.context.showScheduleModal();
for(const expected of ['Pago inicial requerido','05/09/2026','20/09/2026','05/10/2026','$647.61','$600.01','$500.01','Reducida por prepago','Vencido','3 días de atraso','Prórroga: active','Comisión de apertura upfront (cobro separado)','$116.00','$50.00','$66.00','1 de 2 cubiertos'])assert.ok(h.modal.includes(expected),expected);
assert.doesNotMatch(h.modal,/data-stage-action=|Registrar pago|Marcar pagado|Calendario ilustrativo, calculado/);
assert.equal(JSON.stringify(h.state),snapshot);assert.equal(h.data.get('pulzzo_application'),stored,'all calendar reads are non-mutating');
const copyRows=h.context.getAmortizationSchedule();copyRows[0].paidAmount=99999;assert.equal(h.state.servicingProjection.payload.rows[0].paidAmount,1116);
Demo.paymentSchedule=priorCalculator;
for(const name of ['renderPostApprovalFlowDesktop','renderPostApprovalFlowMobile']){
 const html=h.context[name]();assert.match(html,/data-servicing-summary/);assert.match(html,/Saldo de capital/);assert.doesNotMatch(html,/data-stage-action="view-schedule" disabled/);
}
console.log('PASS: actual patient desktop/mobile/modal read exact received dates, cents, partial payments, prepayments, arrears and extensions with no recalculation or mutation; upfront fee remains separate.');

for(const corrupt of [
 e=>{e.fingerprint='invalid';}, e=>{e.accountId='PAT-OTHER';}, e=>{e.applicationId='APP-OTHER';},
 e=>{e.payload.rows[0].paidAmount=900000;}, e=>{delete e.demo;}
]){
 const rejected=patientHarness();rejected.received();corrupt(rejected.state.servicingProjection);rejected.checkpoint();
 assert.equal(rejected.context.getAmortizationSchedule().length,0);rejected.context.showScheduleModal();assert.match(rejected.modal,/Calendario pendiente de recibir/);assert.doesNotMatch(rejected.modal,/900,000/);
}
for(const override of [{patientAccountId:'PAT-OTHER'},{sourceApplicationId:'APP-OTHER'},{creditId:'OTHER-CREDIT'},{offerFingerprintDigest:'OTHER-OFFER'},{rows:[null]}]){
 const wrong=patientHarness(override);wrong.received();assert.equal(wrong.context.getPatientServicingProjection(),null,'payload binding independently checked');
}
for(const key of ['pulzzo_patient','pulzzo_application','pulzzo_verified']){
 const stale=patientHarness();stale.received();stale.modal='';stale.node('portalShell').innerHTML='private calendar';stale.node('documentModalBody').innerHTML='private rows';stale.data.set(key,'changed in another tab');
 stale.context.handlePostApprovalAction('view-schedule');assert.equal(stale.modal,'');assert.equal(stale.context.getAmortizationSchedule().length,0);assert.equal(stale.node('documentModalBody').innerHTML,'');assert.doesNotMatch(stale.node('portalShell').innerHTML,/private calendar/);
}
const escaped=patientHarness();escaped.payload.rows[0].type='<img src=x onerror=alert(1)>';escaped.payload.rows[0].status='<script>alert(1)</script>';escaped.payload.calculatedAt='<svg onload=alert(1)>';
escaped.envelope=Servicing.publish(escaped.context.localStorage,'patient_servicing',escaped.state.patientAccountId,escaped.state.applicationId,escaped.payload);escaped.received();escaped.context.showScheduleModal();
assert.doesNotMatch(escaped.modal,/<img|<script|<svg/);assert.match(escaped.modal,/&lt;img/);
const settled=patientHarness({summary:{outstanding:0,overdue:0,settled:true,nextDueDate:null,nextPaymentAmount:0,currency:'MXN',openingFee:{mode:'financed',due:0,paid:0,pending:0}}});settled.received();settled.context.showScheduleModal();assert.match(settled.modal,/Crédito liquidado/);assert.match(settled.modal,/comisión de apertura está financiada/);assert.doesNotMatch(settled.modal,/Próximo vencimiento pendiente:/);
console.log('PASS: fingerprint, account, application, stale-tab and markup defenses protect rendered calendars; actual settled/financed projection states are respected.');

// Execute the production module's receive button and actual patient persistence.
function mountPatient(h){
 const buttons=[],status=[],make=tag=>({tag,style:{},children:[],setAttribute(){},appendChild(child){this.children.push(child)},addEventListener(type,fn){this[type]=fn},textContent:'',innerHTML:''});
 const window={PulzzoDemoBridge:Bridge,document:{getElementById:()=>null,createElement:tag=>{const node=make(tag);if(tag==='button')buttons.push(node);if(tag==='p')status.push(node);return node;},body:make('body')},localStorage:h.context.localStorage,PulzzoPatientDemoBridge:{getState:()=>{h.context.assertApplicationFresh();return h.state;},getAccount:()=>{h.context.assertApplicationFresh();return h.context.patientFromStorage;},assertFresh:()=>h.context.assertApplicationFresh(),save:()=>h.context.saveState(),refresh(){}}};
 Servicing.mount(window);return {button:buttons.find(b=>/Recibir calendario/.test(b.textContent)),status};
}
const mounted=patientHarness(),mountedUI=mountPatient(mounted),terms=JSON.stringify(mounted.state.offer),contract=mounted.state.signedContractUrl;
assert.ok(mountedUI.button);mountedUI.button.onclick();assert.ok(mounted.state.servicingProjection);assert.equal(JSON.stringify(mounted.state.offer),terms);assert.equal(mounted.state.signedContractUrl,contract);assert.equal(mounted.state.offerAccepted,true);assert.equal(mounted.state.contractSigned,true);
const same=JSON.stringify(mounted.state);mountedUI.button.onclick();assert.equal(JSON.stringify(mounted.state),same,'repeated receipt is idempotent');
const failed=patientHarness(),failedUI=mountPatient(failed),beforeFailure=JSON.stringify(failed.state),write=failed.context.localStorage.setItem;
failed.context.localStorage.setItem=(key,value)=>{if(key==='pulzzo_application')throw Error('QuotaExceededError');write(key,value);};failedUI.button.onclick();assert.equal(JSON.stringify(failed.state),beforeFailure,'failed receiver write rolls back projection');
failed.context.localStorage.setItem=write;failedUI.button.onclick();assert.ok(failed.state.servicingProjection,'same received message can safely retry after failed save');
const switched=patientHarness(),switchedUI=mountPatient(switched);switched.data.set('pulzzo_patient',JSON.stringify({...legacyPatient,patientAccountId:'PAT-OTHER'}));switchedUI.button.onclick();assert.equal(switched.state.servicingProjection,undefined);
console.log('PASS: actual mounted receive callback preserves signed terms, repeats safely, rolls back failed storage, retries successfully and refuses account switches.');

// Legacy accepted private fingerprint remains untouched while canonical public digest renders new servicing.
const legacyRender=patientHarness();legacyRender.state.demoBridgeOfferFingerprint=JSON.stringify({internalMargins:{secret:123},approvedAmount:2000.01});legacyRender.received();
const preservedLegacyFingerprint=legacyRender.state.demoBridgeOfferFingerprint;
assert.ok(legacyRender.context.getPatientServicingProjection());legacyRender.context.showScheduleModal();assert.match(legacyRender.modal,/\$647.61/);assert.equal(legacyRender.state.demoBridgeOfferFingerprint,preservedLegacyFingerprint);
console.log('PASS: legacy accepted fingerprint remains unchanged while canonical public-offer servicing renders.');
