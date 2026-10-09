'use strict';
const assert=require('node:assert/strict');
const bridge=require('../assets/pulzzo-demo-bridge.js');
const originalFixture={id:'APP-PUL-1004',application:{requestedAmount:110000},offer:{approvedAmount:110000}};
const db={patients:[structuredClone(originalFixture)]};
const state={applicationId:'APP-TEST-42',applicationSubmitted:true,procedure:{amount:125000.50,procedure:'Procedimiento de ejemplo',doctorName:'Doctora Ejemplo'},selectedTerm:12,documentFiles:{annualReturns:[{name:'private-file.pdf'}]},documentsDone:true};
const handoff=bridge.makeHandoff(state,{nombre:'Paciente',apellidoPaterno:'Ejemplo',correo:'paciente@example.test'});
assert.equal(handoff.application.requestedAmount,125000.50);assert.equal(handoff.patient.fullName,'Paciente Ejemplo');
assert.doesNotMatch(JSON.stringify(handoff),/private-file/);
const record=bridge.importHandoff(db,handoff);assert.equal(db.patients.length,2);assert.equal(record.offer,null);assert.equal(record.application.offerReady,false);
assert.deepEqual(db.patients[0],originalFixture);
assert.throws(()=>bridge.importHandoff(db,handoff),/ya existe/);
record.offer={approvedAmount:125000.50,procedureAmount:125000.50,termMonths:12,monthlyPayment:12345.67,openingFee:5,annualInterestRate:30,initialPaymentsRequired:0};
record.application.offerReady=true;record.application.initialPaymentRequired=false;
record.offer.status='borrador';record.offer.sent=false;assert.throws(()=>bridge.makeReply(record),/Prepara y envía/);record.offer.status='enviada';record.offer.sent=true;
const reply=bridge.makeReply(record);state.demoBridgeCaseId=record.id;bridge.applyReply(state,reply);
assert.equal(state.offer.monthlyPayment,12345.67);assert.equal(state.offer.initialPaymentsRequired,0);assert.equal(state.offerReady,true);assert.equal(state.initialPaymentRequired,false);
state.offerAccepted=true;state.preferredPaymentDay='5 y 20';state.paymentFrequency='Quincenal';
const accepted=bridge.makeHandoff(state,{nombre:'Paciente Ejemplo'});bridge.importHandoff(db,accepted);
assert.equal(record.application.offerAccepted,true);assert.equal(record.offer.status,'aceptada');assert.equal(record.offer.monthlyPayment,12345.67);
assert.deepEqual(db.patients[0],originalFixture);
const changed=structuredClone(reply);changed.offer.monthlyPayment=900;changed.offerFingerprint=bridge.fingerprint(changed.offer);assert.throws(()=>bridge.applyReply(state,changed),/aceptada o firmada/);
assert.throws(()=>bridge.applyReply({...state,applicationId:'NEW'},reply),/no pertenece/);
assert.throws(()=>bridge.makeHandoff({...state,applicationSubmitted:false},{}),/envía primero/);
assert.throws(()=>bridge.makeReply(db.patients[0]),/Selecciona/);
const unsafe=bridge.makeHandoff({...state,offerAccepted:false},{nombre:'<img onerror="bad()">'});assert.doesNotMatch(unsafe.patient.fullName,/[<>"']/);
const conflicting=structuredClone(accepted);conflicting.sourceApplicationId='DIFFERENT';assert.throws(()=>bridge.importHandoff(db,conflicting),/otro expediente/);
const obsolete=structuredClone(accepted);record.offer.monthlyPayment=100;assert.throws(()=>bridge.importHandoff(db,obsolete),/oferta cambió/);
console.log('PASS: local demo patient→backoffice→offer→patient→acceptance, exact cents, document metadata only, duplicate/stale/accepted-offer guards, unrelated fixture preservation.');

for(const key of ['interestCalculationBase','initialPaymentEach','paymentDays','validUntil']) {
 const altered=structuredClone(reply);altered.offer[key]=key==='paymentDays'?[5,20]:'changed';altered.offerFingerprint=bridge.fingerprint(altered.offer);assert.throws(()=>bridge.applyReply(state,altered),/aceptada o firmada/);
}

// Execute the actual backoffice financial functions, then transport their exact
// persisted offer through the same bridge used by the patient portal.
const fs=require('node:fs'),vm=require('node:vm');
const officeSource=fs.readFileSync(require('node:path').join(__dirname,'../backoffice.html'),'utf8');
const financialContext=vm.createContext({console,Date,Intl});
for(const match of officeSource.matchAll(/^function ([A-Za-z_$][\w$]*)\s*\(/gm)){
 for(let end=officeSource.indexOf('}',match.index);end>=0;end=officeSource.indexOf('}',end+1)){
  const candidate=officeSource.slice(match.index,end+1);
  try{new vm.Script('('+candidate+')');vm.runInContext(candidate,financialContext);break;}catch(error){if(error.name!=='SyntaxError')throw error;}
 }
}
for(const mode of ['financed','upfront']){
 const patient={applicationId:'TAX-'+mode,applicationSubmitted:true,procedure:{amount:100000},selectedTerm:12};
 const database={patients:[]},caseRecord=bridge.importHandoff(database,bridge.makeHandoff(patient,{}));
 patient.demoBridgeCaseId=caseRecord.id;
 caseRecord.offer={status:'enviada',approvedAmount:100000,procedureAmount:100000,termMonths:12,monthlyPayment:10000,openingFee:3,openingFeeMode:mode,annualInterestRate:24,initialPaymentsRequired:0};
 caseRecord.application.offerReady=true;
 financialContext.caseRecord=caseRecord;
 vm.runInContext('applyFinancialBreakdownToPatient(caseRecord)',financialContext);
 assert.equal(caseRecord.offer.openingFeeBaseAmount,3000);
 assert.equal(caseRecord.offer.openingFeeIvaAmount,480);
 assert.equal(caseRecord.offer.openingFeeAmount,3480);
 assert.equal(caseRecord.offer.totalFinancedAmount,mode==='financed'?103480:100000);
 assert.equal(caseRecord.offer.upfrontOpeningFeeDue,mode==='upfront'?3480:0);
 const exported=bridge.makeReply(caseRecord);
 bridge.applyReply(patient,exported);
 assert.deepEqual(patient.offer,caseRecord.offer);
 patient.offerAccepted=true;
 bridge.importHandoff(database,bridge.makeHandoff(patient,{}));
 const contracted=JSON.stringify(patient.offer);
 for(const field of ['openingFeeBaseAmount','openingFeeIvaAmount','openingFeeAmount','openingFeeTaxVersion','openingFeeMode','totalFinancedAmount','upfrontOpeningFeeDue']){
  const revised=structuredClone(exported);revised.offer[field]=field==='openingFeeMode'?'changed':999;revised.offerFingerprint=bridge.fingerprint(revised.offer);
  assert.throws(()=>bridge.applyReply(patient,revised),/aceptada o firmada/);
  assert.equal(JSON.stringify(patient.offer),contracted);
 }
 const settled=bridge.makeReply(caseRecord);bridge.applyReply(patient,settled);
 assert.equal(patient.offerAccepted,true);
 assert.equal(patient.offer.openingFeeIvaAmount,480);
}
console.log('PASS: actual backoffice opening-fee tax snapshot exports exact financed/upfront amounts; accepted tax and financing terms cannot be replaced.');

// Real versioned configuration + real offer-draft handler + bridge round trip.
// DOM values model the editor's actual default resolvers; financial and config
// functions are the shipped source above, not parallel pricing calculations.
const configStorage=new Map(),editorNodes=new Map();
Object.assign(financialContext,{
 DEMO_STORAGE_KEY:'pulzzo_backoffice_demo',dispersionLedgerStorageVersion:null,toast:()=>{},
 db:{patients:[]},session:{role:'admin',email:'admin@example.test'},permissions:{admin:['riskActions']},
 today:()=> '2026-10-08',
 localStorage:{getItem:k=>configStorage.get(k)??null,setItem:(k,v)=>configStorage.set(k,String(v))},
 document:{getElementById:k=>editorNodes.get(k)||null,querySelectorAll:selector=>selector==='.offer-procedure-card'?[editorNodes.get('offerProcCard0')]:[]}
});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../assets/js/backoffice-configuration.js'),'utf8'),financialContext);
function setProductDefaults(patch){
 financialContext.change={scope:'newonly',effectiveDate:'2026-10-08',patch};
 const saved=vm.runInContext('(()=>{const preview=configPreviewChange(change);return configSaveChange(change,preview.revision,preview.token)})()',financialContext);
 assert.equal(saved.ok,true,saved.error);
}
setProductDefaults({openingFeeRate:.03,openingFeeMode:'financed',defaultPaymentFrequency:'biweekly'});
const configuredPatient={applicationId:'CONFIG-ROUNDTRIP',applicationSubmitted:true,procedure:{amount:100000},selectedTerm:12};
const configuredRecord=bridge.importHandoff(financialContext.db,bridge.makeHandoff(configuredPatient,{}));
configuredPatient.demoBridgeCaseId=configuredRecord.id;
financialContext.configuredRecord=configuredRecord;financialContext.selectedPatientId=configuredRecord.id;
const defaults=vm.runInContext('({rate:openingFeeRateForPatient(configuredRecord),mode:normalizeOpeningFeeMode(configuredRecord),frequency:dispersionNormalizePaymentConfig(configuredRecord).paymentFrequency,breakdown:normalizeFinancialBreakdown(configuredRecord)})',financialContext);
assert.equal(defaults.rate,.03);assert.equal(defaults.mode,'financed');assert.equal(defaults.frequency,'biweekly');
for(const [key,value] of Object.entries({offerOpeningFee:defaults.rate*100,offerOpeningFeeMode:defaults.mode,offerOpeningFeeAmount:defaults.breakdown.openingFeeAmount,offerApprovedAmount:defaults.breakdown.totalFinancedAmount,offerProviderBaseAmount:100000,offerAmountToDisperse:100000,offerTermMonths:12,offerMonthlyPayment:11000,offerAnnualInterestRate:24,offerInterestCalculationBase:'global',offerProcAmount0:100000,offerProviderPayout0:100000,offerProcName0:'Procedimiento demo',offerProviderName0:'Clínica demo'}))editorNodes.set(key,{value:String(value)});
editorNodes.set('offerProcCard0',{dataset:{}});editorNodes.set('offerProcSelected0',{checked:true});
const configuredDraft=vm.runInContext('saveOfferDraftFromDom()',financialContext);
configuredDraft.offer.status='enviada';configuredDraft.application.offerReady=true;
financialContext.db.patients[0]=configuredDraft;
assert.equal(configuredDraft.offer.configurationVersionId,'config-v1');
assert.equal(configuredDraft.offer.openingFeeRate,.03);assert.equal(configuredDraft.offer.openingFeeMode,'financed');
assert.equal(configuredDraft.offer.paymentFrequency,'biweekly');assert.equal(configuredDraft.offer.openingFeeIvaAmount,480);
assert.equal(configuredDraft.offer.approvedAmount,103480);
bridge.applyReply(configuredPatient,bridge.makeReply(configuredDraft));
assert.deepEqual(configuredPatient.offer,JSON.parse(JSON.stringify(configuredDraft.offer)));
configuredPatient.offerAccepted=true;
bridge.importHandoff(financialContext.db,bridge.makeHandoff(configuredPatient,{}));
const acceptedTerms=JSON.stringify(configuredDraft.offer);
setProductDefaults({openingFeeRate:.07,openingFeeMode:'upfront',defaultPaymentFrequency:'monthly'});
assert.equal(JSON.stringify(configuredDraft.offer),acceptedTerms);
financialContext.configuredDraft=configuredDraft;
assert.equal(vm.runInContext('openingFeeRateForPatient(configuredDraft)',financialContext),.03);
assert.equal(vm.runInContext('normalizeOpeningFeeMode(configuredDraft)',financialContext),'financed');
assert.equal(vm.runInContext('dispersionNormalizePaymentConfig(configuredDraft).paymentFrequency',financialContext),'biweekly');
assert.equal(vm.runInContext('openingFeeRateForPatient({id:"NEXT-CONFIG-CREDIT"})',financialContext),.07);
assert.equal(vm.runInContext('dispersionNormalizePaymentConfig({id:"NEXT-CONFIG-CREDIT"}).paymentFrequency',financialContext),'monthly');
bridge.applyReply(configuredPatient,bridge.makeReply(configuredDraft));
assert.equal(configuredPatient.offer.openingFeeRate,.03);assert.equal(configuredPatient.offer.paymentFrequency,'biweekly');
for(const [key,value] of Object.entries({openingFeeRate:.07,openingFeeMode:'upfront',paymentFrequency:'monthly',configurationVersionId:'config-v2'})){
 const revised=bridge.makeReply(configuredDraft);revised.offer[key]=value;revised.offerFingerprint=bridge.fingerprint(revised.offer);
 assert.throws(()=>bridge.applyReply(configuredPatient,revised),/aceptada o firmada/);
}
console.log('PASS: configured new-credit rate/mode/frequency persist through actual offer draft and patient bridge; later defaults affect fresh credits only and cannot replace accepted snapshots.');
