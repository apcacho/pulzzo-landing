const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../backoffice.html'),'utf8');
const script=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m=>m[1].includes('const baseState='))[1];
function runtime(saved){
 const elements=new Map();
 function el(id){if(!elements.has(id))elements.set(id,{id,value:'',dataset:{},style:{},innerHTML:'',textContent:'',checked:false,disabled:false,files:[],classList:{add(){},remove(){},toggle(){},contains(){return false}},querySelector(){return null},querySelectorAll(){return []},addEventListener(){},setAttribute(){},scrollIntoView(){}});return elements.get(id)}
 const storage=new Map(saved||[]);
 const document={querySelector:s=>el(s.replace(/^#/,'')),querySelectorAll:s=>s==='.offer-procedure-card'?[...elements.values()].filter(x=>/^offerProcCard\d+$/.test(x.id)):[],getElementById:id=>elements.get(id)||null,addEventListener(){},createElement:tag=>el(tag),body:{appendChild(){}}};
 const FixedDate=class extends Date {constructor(...a){super(...(a.length?a:['2026-10-07T12:00:00Z']))} static now(){return new Date('2026-10-07T12:00:00Z').getTime()}};
 const context=vm.createContext({document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},window:{},Date:FixedDate,console,Intl,Blob,URL,setTimeout(){},clearTimeout(){},innerWidth:1200});
 vm.runInContext(script,context);
 const run=code=>vm.runInContext(code,context);
 // No browser rendering is simulated: preserve real calculations/handlers, suppress repaint only.
 run("render=()=>{};renderPatientDetail=()=>{};closeModal=()=>{};session=users.find(x=>x.role==='admin');");
 return {run,el,storage};
}
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS',name)}
const r=runtime();
test('Percentage inputs distinguish 1%, 0.5%, 0%, and stored decimal rates',()=>{
 for(const [input,expect] of [['1',.01],['0.5',.005],['0',0],['60',.6]]) assert.equal(r.run(`normalizePercentRate('${input}',.05,'percent')`),expect);
 assert.equal(r.run("normalizePercentRate('0.5%',.05)"),.005);
 assert.equal(r.run('normalizePercentRate(.05)'),.05);
 assert.equal(r.run("openingFeeRateForPatient({offer:{openingFee:.5}})"),.005);
 assert.equal(r.run("normalizeOrdinaryAnnualRate({offer:{annualInterestRate:1}})"),.01);
 assert.equal(r.run("normalizeOrdinaryAnnualRate({offer:{ordinaryAnnualRate:0}})"),0);
});
test('Partial upfront payments leave remaining 5499, accumulate, and cap overpayment',()=>{
 r.run("var feeCase={id:'FEE',patient:{},application:{contractSigned:true},offer:{patientProcedureAmount:110000,providerBaseAmount:100000,openingFeeRate:.05,openingFeeMode:'upfront'},timeline:[]};db.patients.push(feeCase)");
 assert.equal(r.run('dispersionUpfrontOpeningFeePending(feeCase)'),5500);
 assert.equal(r.run("dispersionApplyUpfrontOpeningFeePayment(feeCase,1,'2026-10-07','TEST','SPEI')"),true);
 assert.equal(r.run('dispersionUpfrontOpeningFeePending(feeCase)'),5499);
 assert.equal(r.run('dispersionIsUpfrontOpeningFeePaid(feeCase)'),false);
 assert.equal(r.run("dispersionApplyUpfrontOpeningFeePayment(feeCase,499,'2026-10-07','TEST2','SPEI')"),true);
 assert.equal(r.run('dispersionUpfrontOpeningFeePending(feeCase)'),5000);
 assert.equal(r.run("dispersionApplyUpfrontOpeningFeePayment(feeCase,6000,'2026-10-07','TEST3','SPEI')"),true);
 assert.equal(r.run('dispersionUpfrontOpeningFeePending(feeCase)'),0);
 assert.equal(r.run('feeCase.payments[2].amount'),5000);
 assert.equal(r.run('feeCase.payments[2].unappliedAmount'),1000);
 assert.equal(r.run("dispersionApplyUpfrontOpeningFeePayment(feeCase,1,'2026-10-07','TEST4','SPEI')"),false);
});
test('Movement evidence overrides stale paid boolean; no double counting totals',()=>{
 assert.equal(r.run("dispersionUpfrontOpeningFeePending({application:{openingFeeUpfrontPaid:true,openingFeeUpfrontPaidAmount:1},offer:{patientProcedureAmount:110000,openingFeeRate:.05},payments:[{type:'commission_upfront',amount:1}]})"),5499);
 assert.equal(r.run("dispersionUpfrontOpeningFeePending({application:{openingFeeUpfrontPaidAmount:100},offer:{patientProcedureAmount:110000,openingFeeRate:.05,openingFeeUpfrontPaidAmount:100},payments:[{type:'commission_upfront',amount:100}]})"),5400);
});
test('Principal and provider split obey upfront/financed rules including zero rates',()=>{
 for(const [mode,principal] of [['upfront',110000],['financed',116380]]){
  const b=JSON.parse(r.run(`JSON.stringify(normalizeFinancialBreakdown({application:{},offer:{patientProcedureAmount:110000,providerBaseAmount:100000,providerExtraAmount:2000,openingFeeRate:.05,openingFeeMode:'${mode}'}}))`));
  assert.equal(b.totalFinancedAmount,principal);assert.equal(b.amountToDisperse,102000);assert.equal(b.pulzzoCommercialFee,8000);
 }
 assert.equal(r.run("normalizeFinancialBreakdown({offer:{patientProcedureAmount:100,providerBaseAmount:90,providerExtraAmount:100,openingFeeRate:0}}).amountToDisperse"),100);
 assert.equal(r.run("normalizeFinancialBreakdown({offer:{patientProcedureAmount:100,openingFeeRate:0}}).openingFeeAmount"),0);
});
test('Opening-fee VAT preserves historical contracts and is separate from principal',()=>{
 const legacy={application:{contractSigned:true},offer:{patientProcedureAmount:100000,openingFeeRate:.03,openingFeeMode:'financed'}};
 const fresh=JSON.parse(JSON.stringify(legacy));fresh.application.contractSigned=false;
 for(const [p,expected,vat] of [[legacy,103000,0],[fresh,103480,480]]){const before=JSON.stringify(p);const b=JSON.parse(r.run(`JSON.stringify(normalizeFinancialBreakdown(${JSON.stringify(p)}))`));assert.equal(b.totalFinancedAmount,expected);assert.equal(b.openingFeeIvaAmount,vat);assert.equal(b.openingFeeBaseAmount,3000);assert.equal(b.patientProcedureAmount,100000);assert.equal(JSON.stringify(p),before);}
 assert.match(r.run(`openingFeeTaxNotice(${JSON.stringify(legacy)})`),/revisión fiscal/);
});
test('Read-only role blocks direct finance, contract, offer, provider, document handlers',()=>{
 r.run("session=users.find(x=>x.role==='readonly');selectedPatientId='APP-PUL-1004';var beforeReadonly=JSON.stringify(db)");
 for(const call of ['dispersionApplyPayment()','dispersionApplyUpfrontOpeningFeePayment(feeCase,1)','dispersionApplyCapitalPrepayment(feeCase,1)','dispersionApplyEarlySettlement(feeCase,1)','dispersionApplyExtension(\'row1\')','dispersionMarkProviderDispersed(0)','dispersionMarkDispersed()','contractGenerateDocument()','contractSendDigitalSignature()','contractGenerateManualBaseDocument()','contractSaveBaseDocument()','contractSaveSignedDocument()','savePatientOffer()','confirmOffer(\'APP-PUL-1004\')','providerApprove(\'MED-001\')','providerReject(\'MED-001\')','docAction(\'patient\',\'APP-PUL-1004\',\'bad\',\'approved\')','confirmCorrection(\'provider\',\'MED-001\')'])r.run(call);
 assert.equal(r.run('JSON.stringify(db)'),r.run('beforeReadonly'));
 const html=r.run(`readonlyFinancialHtml('<button onclick="dispersionApplyPayment()">Aplicar</button><input value="1"><button onclick="setDispersionInnerTab(1)">Tab</button>')`);
 assert.match(html,/<button disabled onclick="dispersionApplyPayment\(\)"/);assert.match(html,/<input disabled/);assert.match(html,/<button onclick="setDispersionInnerTab/);
 r.run("session=users.find(x=>x.role==='admin')");
});
test('Accepted/signed offers are locked through all edit handlers',()=>{
 r.run("selectedPatientId='APP-PUL-1004';var beforeLock=JSON.stringify(db)");
 for(const call of ["savePatientOffer()","confirmOffer('APP-PUL-1004')","saveOfferDraftFromDom()","confirmInitial('APP-PUL-1004')","sendOffer('APP-PUL-1004')","markOffer('APP-PUL-1004','rechazada')"]){r.run(call);assert.equal(r.run('JSON.stringify(db)'),r.run('beforeLock'));}
 assert.match(r.run("renderOfferTab(db.patients.find(p=>p.id==='APP-PUL-1004'))"),/Solo lectura/);
});
test('General provider correction persists and renders in queue without rejected documents',()=>{
 r.el('modalText').value='Corregir nombre del perfil';r.el('modalReason').value='Datos no coinciden';
 r.run("confirmCorrection('provider','MED-003');renderCorrections()");
 assert.match(r.el('correctionsRows').innerHTML,/Corregir nombre del perfil/);
 assert.equal(r.run("db.corrections.filter(c=>c.entityId==='MED-003').length"),1);
});
test('Fresh APP-PUL-1004 patient/medical amounts agree while payout remains 100000',()=>{
 assert.equal(r.run("normalizeFinancialBreakdown(db.patients.find(p=>p.id==='APP-PUL-1004')).patientProcedureAmount"),110000);
 assert.equal(r.run("db.patients.find(p=>p.id==='APP-PUL-1004').application.procedureCosts.Blefaroplastia"),110000);
 assert.equal(r.run("normalizeFinancialBreakdown(db.patients.find(p=>p.id==='APP-PUL-1004')).amountToDisperse"),100000);
});
test('Reload preserves saved finance, payments, provider changes, and other prototype storage',()=>{
 r.run("var reloadPatient=db.patients.find(p=>p.id==='APP-PUL-1015');reloadPatient.offer.patientProcedureAmount=77777;reloadPatient.offer.annualInterestRate=1;reloadPatient.application.providerDispersions[0].amount=12345;reloadPatient.application.providerDispersions[0].receiptName='saved.pdf';reloadPatient.payments=[{type:'commission_upfront',amount:1}];persist()");
 r.storage.set('pulzzo_patient','keep me');r.storage.set('pulzzo_doctor','keep doctor');r.storage.set('pulzzo_backoffice_demo_version','old-version');
 const before=r.storage.get('pulzzo_backoffice_demo');const loaded=runtime([...r.storage]);
 assert.equal(loaded.run('JSON.stringify(db)'),before);
 assert.equal(loaded.storage.get('pulzzo_patient'),'keep me');
 loaded.run('clearPulzzoDemoStorage()');assert.equal(loaded.storage.get('pulzzo_patient'),'keep me');assert.equal(loaded.storage.get('pulzzo_doctor'),'keep doctor');
});
function setOfferForm(){
 r.run("selectedPatientId='APP-PUL-1003';session=users.find(x=>x.role==='admin')");
 const values={offerProcCard0:'',offerProcSelected0:'',offerProcName0:'Ortodoncia invisible',offerProcSpecialty0:'Odontología',offerProcAmount0:'50000',offerProcedureCost0:'50000',offerProviderType0:'Doctor',offerProviderName0:'Dental Align MX',offerProviderPhone0:'5530004000',offerProviderPayout0:'42000',offerProviderBaseAmount:'40000',offerProviderExtraAmount:'2000',offerOpeningFee:'0.5',offerOpeningFeeMode:'financed',offerAnnualInterestRate:'1',offerTermMonths:'18',offerValidUntil:'2026-12-01',offerInitialPaymentMonths:'0',offerMonthlyPayment:'',offerProcedureAmount:'',offerApprovedAmount:'',offerAmountToDisperse:'',offerOpeningFeeAmount:'',offerInterestCalculationBase:'global'};
 for(const [id,value]of Object.entries(values))r.el(id).value=value;
 r.el('offerProcSelected0').checked=true;
}
test('Unified offer save updates canonical totals, procedures, payout and preserves initial count',()=>{
 setOfferForm();r.run('savePatientOffer(false)');
 const p=JSON.parse(r.run("JSON.stringify(db.patients.find(p=>p.id==='APP-PUL-1003'))"));
 assert.equal(p.offer.openingFeeBaseAmount,250);assert.equal(p.offer.openingFeeIvaAmount,40);assert.equal(p.offer.openingFeeTaxVersion,1);assert.equal(p.offer.patientProcedureAmount,50000);assert.equal(p.application.patientProcedureAmount,50000);assert.equal(p.offer.approvedAmount,50290);assert.equal(p.offer.openingFeeRate,.005);assert.equal(p.offer.ordinaryAnnualRate,.01);assert.equal(p.offer.amountToDisperse,42000);assert.equal(p.offer.pulzzoCommercialFee,8000);assert.equal(p.application.procedureCosts['Ortodoncia invisible'],50000);assert.equal(p.application.providerDispersions[0].amount,42000);assert.equal(p.application.initialInstallments,0);assert.equal(p.offer.status,'borrador');assert.equal(p.offer.sent,false);assert.equal(p.application.offerReady,false);
});
test('Invalid offer save leaves entire database unchanged',()=>{
 setOfferForm();r.el('offerProviderPhone0').value='';r.run('var beforeInvalid=JSON.stringify(db);savePatientOffer(true)');assert.equal(r.run('JSON.stringify(db)'),r.run('beforeInvalid'));
});
test('Decimal procedure principal survives preview and canonical save',()=>{
 setOfferForm();r.el('offerProcAmount0').value='125000.50';r.el('offerProcedureCost0').value='125000.50';r.el('offerOpeningFeeMode').value='upfront';r.el('offerOpeningFee').value='1';
 r.run('savePatientOffer(false)');
 assert.equal(r.run("db.patients.find(p=>p.id==='APP-PUL-1003').offer.approvedAmount"),125000.5);
 assert.equal(r.run("db.patients.find(p=>p.id==='APP-PUL-1003').offer.openingFeeAmount"),1450.01);
 assert.match(r.run("renderOfferTab(db.patients.find(p=>p.id==='APP-PUL-1003'))"),/data-raw="125000.5"/);
});
test('Read-only financial rendering does not persist derived schedule state',()=>{
 r.run("session=users.find(x=>x.role==='readonly');var beforeReadRender=JSON.stringify(db);var readonlyHtml=patientTabContent(db.patients.find(p=>p.id==='APP-PUL-1004'),'dispersion')");
 assert.equal(r.run('JSON.stringify(db)'),r.run('beforeReadRender'));
 assert.match(r.run('readonlyHtml'),/<button disabled[^>]*onclick="dispersionApplyPayment/);
 r.run("session=users.find(x=>x.role==='admin')");
});
test('Disbursement handler cannot bypass fee prerequisites',()=>{
 r.run("selectedPatientId='APP-PUL-1004';var beforeRelease=JSON.stringify(db);dispersionMarkProviderDispersed(0);dispersionMarkDispersed()");
 assert.equal(r.run('JSON.stringify(db)'),r.run('beforeRelease'));
});
test('Form blur, refresh and save retain cents in financed principal and payment estimate',()=>{
 setOfferForm();r.el('offerProcAmount0').value='50000.50';r.el('offerProcedureCost0').value='50000.50';
 r.run("formatOfferMoneyInput(document.getElementById('offerProcAmount0'));refreshOfferCalculations();savePatientOffer(false)");
 assert.equal(r.run("db.patients.find(p=>p.id==='APP-PUL-1003').offer.patientProcedureAmount"),50000.5);
 assert.equal(r.run("db.patients.find(p=>p.id==='APP-PUL-1003').offer.approvedAmount"),50290.5);
 assert.equal(r.run("db.patients.find(p=>p.id==='APP-PUL-1003').offer.openingFeeAmount"),290);
 assert.equal(r.run("db.patients.find(p=>p.id==='APP-PUL-1003').offer.monthlyPayment"),2842.54);
});
test('Negative manual monthly payment cannot be saved',()=>{
 setOfferForm();r.el('offerMonthlyPayment').value='-100';r.el('offerMonthlyPayment').dataset.manual='true';r.el('offerMonthlyPayment').dataset.interestBase='global';
 r.run('var beforeNegative=JSON.stringify(db);savePatientOffer(true)');assert.equal(r.run('JSON.stringify(db)'),r.run('beforeNegative'));
});
test('Non-finite manual monthly payment is rejected without state mutation',()=>{
 setOfferForm();r.el('offerMonthlyPayment').value='Infinity';r.el('offerMonthlyPayment').dataset.manual='true';r.el('offerMonthlyPayment').dataset.interestBase='global';
 r.run('var beforeInfinite=JSON.stringify(db);savePatientOffer(true)');assert.equal(r.run('JSON.stringify(db)'),r.run('beforeInfinite'));
});
test('Negative selected procedure cannot be offset by a positive procedure',()=>{
 setOfferForm();r.el('offerProcAmount0').value='-100';
 for(const [id,value]of Object.entries({offerProcCard1:'',offerProcSelected1:'',offerProcName1:'Segundo',offerProcSpecialty1:'Odontología',offerProcAmount1:'60000',offerProcedureCost1:'60000',offerProviderType1:'Doctor',offerProviderName1:'Dental',offerProviderPhone1:'5512345678',offerProviderPayout1:'0'}))r.el(id).value=value;
 r.el('offerProcSelected1').checked=true;
 r.run('var beforeNegativeProcedure=JSON.stringify(db);savePatientOffer(true)');assert.equal(r.run('JSON.stringify(db)'),r.run('beforeNegativeProcedure'));
});
test('Provider role retains authorized correction inputs; read-only cannot edit them',()=>{
 r.run("session=users.find(x=>x.role==='provider');openCorrection('provider','MED-001')");assert.doesNotMatch(r.el('modal').innerHTML,/<textarea disabled/);
 r.run("session=users.find(x=>x.role==='readonly');openCorrection('provider','MED-001')");assert.match(r.el('modal').innerHTML,/<textarea disabled/);
 r.run("session=users.find(x=>x.role==='admin')");
});
console.log(`Backoffice runtime tests: ${passed} passed.`);
