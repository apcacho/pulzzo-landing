'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const Demo=require('../assets/js/patient-demo.js');
const source=fs.readFileSync(path.join(__dirname,'../solicitud-paciente.html'),'utf8');
// Execute actual named functions from the shipped HTML; compile candidates to
// locate balanced function boundaries without a separate implementation copy.
function functionSource(name){
  const match=new RegExp('^function '+name+'\\s*\\(','m').exec(source);
  assert.ok(match,`Missing actual source function ${name}`);
  for(let end=source.indexOf('}',match.index);end>=0;end=source.indexOf('}',end+1)){
    const candidate=source.slice(match.index,end+1);
    try{new vm.Script('('+candidate+')');return candidate;}catch{}
  }
  throw new Error('Cannot extract '+name);
}
function harness(state={}){
  const nodes=new Map(),data=new Map(),session=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',dataset:{},textContent:'',innerHTML:'',style:{},classList:{add(){},remove(){},toggle(){}},querySelector(){return null;},querySelectorAll(){return [];},setAttribute(){},addEventListener(){},focus(){},scrollIntoView(){}});return nodes.get(id);};
  const context={state,applicationMemorySnapshot:JSON.stringify(state),applicationStorageSnapshot:null,patientStorageSnapshot:null,verifiedStorageSnapshot:null,console,Date,Blob,File,URL,JSON,Math,Number,String,Array,Object,Set,Map,PulzzoPatientDemo:Demo,
    document:{getElementById:node,querySelector:()=>null,querySelectorAll:()=>[],activeElement:null},
    window:{matchMedia:()=>({matches:true}),scrollTo(){}},
    localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},
    sessionStorage:{getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)},
    documentUploads:{bank:[],payroll:[],csf:[],annualReturns:[],monthlyReturn:[],complianceOpinion:[]},identityUploads:{},pulzzoUploadedDocumentRegistry:{},docsMeta:{},
    patient:{primerNombre:'Paciente',apellidoPaterno:'Demo',correo:'paciente@example.test'},patientFromStorage:{correo:'paciente@example.test'},
    navigator:{userAgent:'test',language:'es-MX'},CSS:{escape:x=>x},setTimeout:()=>1,clearInterval(){},setInterval:()=>1};
  vm.createContext(context);
  const names=[...source.matchAll(/^function ([A-Za-z_$][\w$]*)\s*\(/gm)].map(m=>m[1]);
  for(const name of new Set(names)) vm.runInContext(functionSource(name),context);
  context.renderChecklist=()=>{};
  context.renderPortal=()=>{}; context.prepareBackendPayload=()=>{}; context.updateDocumentsView=()=>{};
  return {context,state,data,node,run:code=>vm.runInContext(code,context)};
}
const completed={geoDone:true,procedureDone:true,estimateDone:true,identityDone:true,incomeDone:true,documentsDone:true,creditAuthConfirmed:true};
const s={...completed,incomeType:'nomina',selectedTerm:12,procedure:{amount:75000,procedure:'Consulta ficticia',doctorName:'Clínica Demo'}};
const h=harness(s);
// Stable flat-cost illustrative schedule, shared across landing/application.
for(const term of [6,12,18,24]){
  s.selectedTerm=term;
  assert.equal(Demo.parseAmount(h.context.estimatedMonthly(75000)),Demo.quote(75000,term).monthly);
  assert.equal(h.context.getPostApprovalOffer().termMonths,term);
}
assert.ok(!Demo.quote(75000,36));
s.selectedTerm=12; s.procedure.termMonths=24;
assert.equal(h.context.getPostApprovalOffer().termMonths,12);
s.offer={approvedAmount:75000,termMonths:18,monthlyPayment:'$4,283.33 a 18 meses',openingFee:'2.00%',annualInterestRate:'24.50%',initialPaymentRequired:true,initialPaymentInstallments:2,initialPaymentTotal:8566.66};
s.offer.monthlyPayment='$5,066.67';assert.equal(h.context.getPostApprovalOffer().monthlyPayment,'$5,066.67');
s.offer.monthlyPayment='$4,283.33 a 18 meses';
const offer=h.context.getPostApprovalOffer();
assert.equal(offer.termMonths,18);assert.equal(offer.monthlyPayment,'$4,283.33');
assert.equal(offer.openingFee,'2.00%');assert.equal(offer.annualInterestRate,'24.50%');
assert.equal(offer.initialPaymentTotal,8566.66);assert.equal(offer.initialPaymentEach,4283.33);
s.offer.initialPaymentInstallments=0;s.offer.initialPaymentTotal=0;s.offer.initialPaymentInstallmentAmount=0;
assert.equal(h.context.getPostApprovalOffer().initialInstallments,0);assert.equal(h.context.getPostApprovalOffer().initialPaymentTotal,0);assert.equal(h.context.getPostApprovalOffer().initialPaymentEach,0);
delete s.offer.initialPaymentInstallments;s.offer.initialPaymentsRequired=4;assert.equal(h.context.getPostApprovalOffer().initialInstallments,4);delete s.offer.initialPaymentsRequired;s.offer.initialInstallments=2;assert.equal(h.context.getPostApprovalOffer().initialInstallments,2);
s.offer.openingFee=0;s.offer.annualInterestRate=0;
assert.equal(h.context.getPostApprovalOffer().openingFee,0);assert.equal(h.context.escapeHtml(0),'0');
// Pending estimate never enables an approval through either renderer or handler.
delete s.offer;
for(const render of ['renderPostApprovalFlowDesktop','renderPostApprovalFlowMobile']){
  const html=h.context[render]();
  assert.match(html,/data-stage-action="accept-offer" disabled/);
  assert.match(html,/Monto estimado \(sin aprobación\)/);
}
h.context.handlePostApprovalAction('accept-offer');assert.notEqual(s.offerAccepted,true);
h.context.handlePostApprovalAction('reject-offer');assert.notEqual(s.offerRejected,true);
assert.equal(h.context.postStageStatus('offer').label,'Pendiente');
s.offerReady=true;s.offer={approvedAmount:75000,termMonths:12,monthlyPayment:8000};
h.context.readOfferPaymentSelection=()=>({ok:true,frequency:'Quincenal',paymentDay:'5 y 20'});
h.context.handlePostApprovalAction('accept-offer');assert.equal(s.offerAccepted,true);assert.equal(s.preferredPaymentDay,'5 y 20');
const acceptedAt=s.offerAcceptedAt;h.context.handlePostApprovalAction('reject-offer');assert.equal(s.offerAccepted,true);assert.equal(s.offerAcceptedAt,acceptedAt);
// Contract state cannot bypass an unapproved/unaccepted offer.
s.offerReady=false;s.contractSigned=true;s.signatureStatus='signed';s.signedContractUrl='https://example.test/demo.pdf';
assert.equal(h.context.isPatientContractSigned(),false);assert.equal(h.context.postStageStatus('schedule').label,'Bloqueada');
s.offerReady=true;s.offerAccepted=true;delete s.contractSigned;delete s.signedContractUrl;s.signatureStatus='unsigned';
assert.equal(h.context.isPatientContractSigned(),false);
s.signatureStatus='uploaded_review';assert.equal(h.context.isPatientContractSigned(),false);
s.signatureStatus='signed';assert.equal(h.context.isPatientContractSigned(),true);
// No hard-coded six-row schedule, merged day 520, clipped end-of-month or lost cents.
for(const term of [6,12,18,24])for(const frequency of ['Mensual','Quincenal']){
  const rows=Demo.paymentSchedule({termMonths:term,monthlyPayment:'$1,000.01',frequency,paymentDay:frequency==='Mensual'?'28':'5 y 20',start:new Date('2026-01-10T12:00:00Z')});
  assert.equal(rows.length,term*(frequency==='Mensual'?1:2));
  assert.equal(Math.round(rows.reduce((n,r)=>n+r.paymentAmount,0)*100),100001*term);
  assert.equal(rows[0].isoDate,frequency==='Mensual'?'2026-02-28':'2026-02-05');
  if(frequency==='Quincenal')assert.equal(rows[1].isoDate,'2026-02-20');
}
assert.deepEqual(Demo.paymentSchedule({termMonths:2,monthlyPayment:100,frequency:'Quincenal',paymentDay:'15 y fin de mes',start:new Date('2028-01-31T12:00:00Z')}).map(r=>r.isoDate),['2028-02-15','2028-02-29','2028-03-15','2028-03-31']);
assert.deepEqual(Demo.paymentSchedule({termMonths:2,monthlyPayment:100,paymentDay:'Último día del mes',start:new Date('2026-01-31T12:00:00Z')}).map(r=>r.isoDate),['2026-02-28','2026-03-31']);
assert.equal(Demo.paymentSchedule({termMonths:6,monthlyPayment:100,frequency:'Quincenal',paymentDay:'520'}).length,0);
for(const monthlyPayment of [0,-1,NaN,Infinity,'Pendiente']) assert.equal(Demo.paymentSchedule({termMonths:6,monthlyPayment,paymentDay:'15'}).length,0);
// Canonical documents keep both old aliases and saved uploads without fabricated files.
const migrated=Demo.normalizeDocuments({annualTax:[{name:'a.pdf',size:10}],annualReturns:[{name:'a.pdf',size:10},{name:'b.pdf',size:20}],monthlyTax:[{name:'m.pdf'}],compliance:[{name:'c.pdf'}]});
assert.equal(migrated.annualReturns.length,2);assert.ok(!('annualTax' in migrated));assert.equal(migrated.monthlyReturn.length,1);
s.documentFiles=migrated;s.incomeType='independiente';s.ciecChoice='no';
assert.equal(h.context.getPortalDocsByProfile().find(d=>d.key==='annualReturns').files.length,2);
assert.equal(h.context.getFilesForPortal('bank','Estados',3).length,0);
h.context.documentUploads.bank=[{name:'saved.pdf',size:10,type:'application/pdf',metadataOnly:true,status:'En revisión'}];
assert.equal(h.context.getFileUrl(h.context.documentUploads.bank[0]),'');
// These upload tests use an unsubmitted draft; accepted data is tested as immutable separately.
s.offerAccepted=false;s.contractSigned=false;s.signatureStatus='unsigned';h.context.applicationMemorySnapshot=JSON.stringify(s);
const replacement=new File(['demo'],'replacement.pdf',{type:'application/pdf'});
h.context.replacePortalFile('bank',0,replacement);
assert.equal(s.documentFiles.bank[0].name,'replacement.pdf');assert.equal(h.context.documentUploads.bank.length,1);
h.context.removeDocumentUpload('bank',0);assert.equal(s.documentFiles.bank.length,0);assert.equal(s.documentsDone,false);
const html=h.context.renderFilesList({key:'annualReturns'});assert.equal(typeof html,'string');
s.ciecChoice='yes';assert.ok(!h.context.getDocumentItems().some(i=>i.type==='field'));assert.match(h.context.renderPortalSatPasswordMetric(),/sin credenciales/);
// A legacy submitted/accepted application cannot be reset by starting a replacement.
Object.assign(s,{identity:{name:'Paciente Demo'},demoBridgeCaseId:'old',offerAccepted:true,contractSigned:true,offer:{approvedAmount:1},incomeMonthly:'1'});
const submittedSnapshot=JSON.stringify(s);h.context.showValidationGuide=()=>{};
h.context.startNewApplication();assert.equal(JSON.stringify(s),submittedSnapshot);
// Sanitization covers nested known state and backup without reading/logging secret values.
const store=new Map([['pulzzo_application',JSON.stringify({ciecPassword:'synthetic-not-a-secret',nested:{satPassword:'synthetic'},keep:1})],['pulzzo_backend_payload',JSON.stringify({application:{password:'synthetic'},postApproval:{offer:null}})],['pulzzo_patient_demo_recovery_backup',JSON.stringify({history:[{records:{password2:'synthetic'}}]})]]);
Demo.scrubKnownStorage({getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)});
for(const raw of store.values())assert.doesNotMatch(raw,/synthetic|Password|password/);
assert.equal(JSON.parse(store.get('pulzzo_application')).keep,1);
assert.equal(Demo.resumeView({...completed,estimateDone:false},'#portal'),'estimacion');
assert.equal(Demo.resumeView({...completed},'#portal'),'portal');
assert.equal(Demo.resumeView({},'#documents'),'geolocalizacion');
// Shipped source integration, not only helper behavior.
assert.match(source,/assets\/js\/patient-demo\.js/);assert.match(source,/getProcedureOfferItems\(\)\.length/);assert.doesNotMatch(source,/getOfferProcedureItems/);
assert.match(source,/PulzzoPatientDemoBridge=\{getState:\(\)=>\{assertApplicationFresh\(\);return state;/);assert.match(source,/assets\/pulzzo-demo-bridge\.js/);
assert.match(fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),/sessionStorage\.setItem\('pulzzo_pending_estimate'/);
console.log('PASS: patient actual-source offer/mobile gates, decimals, selected terms, 6/12/18/24-month monthly/semimonthly calendars, document aliases/reload/replace/remove, SAT scrubbing, new-application isolation and safe routes.');

// Patient screens must disclose the transported snapshot, without calculating a
// second opening fee or silently taxing a historical accepted offer.
const Bridge=require('../assets/pulzzo-demo-bridge.js');
for(const mode of ['financed','upfront']){
 const portal=harness({applicationId:'TAX-UI',demoBridgeCaseId:'APP-TAX-UI',procedure:{amount:100000},selectedTerm:12});
 const storedOffer={status:'enviada',approvedAmount:mode==='financed'?103480:100000,termMonths:12,monthlyPayment:10000,openingFee:3,openingFeeBaseAmount:3000,openingFeeIvaAmount:480,openingFeeAmount:3480,openingFeeTaxVersion:1,openingFeeMode:mode,totalFinancedAmount:mode==='financed'?103480:100000,upfrontOpeningFeeDue:mode==='upfront'?3480:0,initialPaymentsRequired:0};
 const reply=Bridge.makeReply({id:'APP-TAX-UI',demoBridge:{sourceApplicationId:'TAX-UI'},application:{offerReady:true},offer:storedOffer});
 Bridge.applyReply(portal.state,reply);
 const visible=portal.context.getPostApprovalOffer();
 for(const key of ['openingFeeBaseAmount','openingFeeIvaAmount','openingFeeAmount','openingFeeTaxVersion','openingFeeMode','totalFinancedAmount','upfrontOpeningFeeDue'])assert.equal(visible[key],storedOffer[key],key);
 let modal='';portal.context.openPortalFlowModal=(_title,html)=>{modal=html;};
 const modalFunction=[...source.matchAll(/^function ([A-Za-z_$][\w$]*)\s*\(/gm)].map(m=>m[1]).find(name=>functionSource(name).includes("openPortalFlowModal('Oferta final'"));
 assert.ok(modalFunction);portal.context[modalFunction]();
 for(const html of [portal.context.renderPostApprovalFlowDesktop(),portal.context.renderPostApprovalFlowMobile(),modal]){
  assert.match(html,/Comisión base \$3,000\.00 \+ IVA 16% \$480\.00 = \$3,480\.00/);
  assert.ok(html.includes('Monto financiado '+Demo.money(storedOffer.totalFinancedAmount)));
  assert.match(html,/>3%<\/strong>/);
  assert.ok(html.includes(mode==='financed'?'Financiada en el crédito':'Upfront: cobro separado previo a la dispersión $3,480.00'));
 }
 const snapshot=JSON.stringify(portal.state.offer);
 portal.context.readOfferPaymentSelection=()=>({ok:true,frequency:'Mensual',paymentDay:'15'});
 portal.context.handlePostApprovalAction('accept-offer');
 assert.equal(portal.state.offerAccepted,true);assert.equal(JSON.stringify(portal.state.offer),snapshot);
}
const legacy=harness({offerReady:true,offerAccepted:true,offer:{approvedAmount:103000,termMonths:12,monthlyPayment:10000,openingFee:3,openingFeeAmount:3000,openingFeeTaxVersion:0}});
const legacySnapshot=JSON.stringify(legacy.state.offer);
assert.match(legacy.context.getPostApprovalOffer().openingFeeDisclosure,/Condiciones registradas conservadas; revisión fiscal pendiente/);
assert.equal(legacy.context.getPostApprovalOffer().openingFeeIvaAmount,undefined);
assert.equal(JSON.stringify(legacy.state.offer),legacySnapshot);
console.log('PASS: patient desktop/mobile/modal disclose exact transferred fee base, IVA, mode and financed total before acceptance, and preserve legacy snapshots.');

const payout=harness({offerReady:true,procedure:{amount:100000},offer:{approvedAmount:103480,amountToDisperse:90000.25,procedureAmount:100000,openingFeeAmount:3480,termMonths:12,monthlyPayment:10000}});
assert.equal(payout.context.getDoctorPaymentItems()[0].amount,90000.25);
assert.match(payout.context.renderDoctorPaymentItems(),/\$90,000\.25/);
assert.doesNotMatch(payout.context.renderDoctorPaymentItems(),/103,480/);
payout.state.offer.providerDispersions=[{concept:'Cirugía',provider:'Clínica A',amount:60000.10},{concept:'Hospital',provider:'Hospital B',amount:30000.15},{concept:'Incluido',provider:'Clínica A',amount:0}];
assert.deepEqual(Array.from(payout.context.getDoctorPaymentItems(),x=>x.amount),[60000.10,30000.15,0]);
assert.equal(payout.context.getDoctorPaymentItems()[0].procedure,'Cirugía');
delete payout.state.offer.providerDispersions;
payout.state.procedure.procedureProviders={procedures:[{procedure:'Consulta',provider:'Clínica C',amount:250.50},{procedure:'Incluido',provider:'Clínica C',amount:0}]};
assert.deepEqual(Array.from(payout.context.getDoctorPaymentItems(),x=>x.amount),[250.50,0]);
delete payout.state.procedure.procedureProviders;delete payout.state.offer.amountToDisperse;
assert.equal(payout.context.getDoctorPaymentItems()[0].amount,null);
assert.match(payout.context.renderDoctorPaymentItems(),/Pendiente de desglose/);
assert.doesNotMatch(payout.context.renderDoctorPaymentItems(),/103,480/);
console.log('PASS: provider payout uses recorded disbursement cents, preserves explicit rows including zero, and never substitutes financed principal.');
