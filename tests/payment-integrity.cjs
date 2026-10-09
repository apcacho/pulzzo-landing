const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../backoffice.html'),'utf8');
const script=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m=>m[1].includes('const baseState='))[1];
function runtime(saved){
 let failWrites=false, confirmResult=true;
 const elements=new Map();
 function el(id){if(!elements.has(id))elements.set(id,{id,value:'',dataset:{},style:{},innerHTML:'',textContent:'',checked:false,disabled:false,files:[],classList:{add(){},remove(){},toggle(){},contains(){return false}},querySelector(){return null},querySelectorAll(){return []},addEventListener(){},setAttribute(){},scrollIntoView(){}});return elements.get(id)}
 const storage=new Map(saved||[]);
 const document={querySelector:s=>el(s.replace(/^#/,'')),querySelectorAll:s=>s==='.offer-procedure-card'?[...elements.values()].filter(x=>/^offerProcCard\d+$/.test(x.id)):[],getElementById:id=>elements.get(id)||null,addEventListener(){},createElement:tag=>el(tag),body:{appendChild(){}}};
 const FixedDate=class extends Date {constructor(...a){super(...(a.length?a:['2026-10-07T12:00:00Z']))} static now(){return new Date('2026-10-07T12:00:00Z').getTime()}};
 const context=vm.createContext({document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(failWrites)throw new Error('Quota exceeded');storage.set(k,String(v))},removeItem:k=>storage.delete(k)},window:{},confirm:()=>confirmResult,Date:FixedDate,console,Intl,Blob,URL,setTimeout(){},clearTimeout(){},innerWidth:1200});
 vm.runInContext(script,context);
 const run=code=>vm.runInContext(code,context);
 // No browser rendering is simulated: preserve real calculations/handlers, suppress repaint only.
 run("render=()=>{};renderPatientDetail=()=>{};closeModal=()=>{};session=users.find(x=>x.role==='admin');");
 return {run,el,storage,failWrites:(v)=>failWrites=v,confirm:(v)=>confirmResult=v};
}

let passed=0;function test(name,fn){fn();passed++;console.log('PASS: '+name)}
function credit(r){r.run("var p=db.patients.find(p=>p.id==='APP-PUL-1015'); selectedPatientId=p.id; p.application.dispersionDate='2026-01-01';p.application.disbursedAt='2026-01-01';p.application.amortizationStatus='active';dispersionEnsureSchedule(p);persist()");}
function input(r,id,value){r.el(id).value=String(value)}
function ordinary(r,amount,ref){input(r,'dispersionPaymentType','ordinary');input(r,'dispersionPaymentAmount',amount);input(r,'dispersionPaymentReference',ref);input(r,'dispersionPaymentDate','2026-10-07');input(r,'dispersionPaymentMethod','SPEI');input(r,'dispersionPaymentTarget','auto');return r.run('dispersionApplyPayment()');}
function extension(r){r.run("var row=dispersionBuildSchedule(p).find(r=>dispersionExtensionEligibility(r,p).ok);var preview=dispersionExtensionPreview(row,p,15)");input(r,'extensionDays',15);input(r,'extensionReference','BANK-EXT-1');input(r,'extensionMethod','SPEI');input(r,'extensionAmountReceived',r.run('preview.totalRequired'));return r.run('dispersionApplyExtension(row.id)');}
test('Extension requires actual received funds, reference, explicit confirmation, and creates one atomic receipt',()=>{
 const r=runtime();credit(r);r.run("var row=dispersionBuildSchedule(p).find(r=>dispersionExtensionEligibility(r,p).ok);var before=JSON.stringify(p)");assert.equal(r.run('dispersionApplyExtension(row.id)'),false);assert.equal(r.run('JSON.stringify(p)'),r.run('before'));
 r.confirm(false);assert.equal(extension(r),false);assert.equal(r.run('(p.payments||[]).filter(x=>x.receiptId).length'),0);
 r.confirm(true);assert.equal(extension(r),true);assert.equal(r.run('p.payments.at(-1).amountReceived'),r.run('preview.totalRequired'));assert.equal(r.run('p.payments.at(-1).totalApplied'),r.run('preview.totalRequired'));assert.equal(r.run("p.payments.at(-1).allocations.some(a=>a.concept==='capital')"),false);
 const persisted=JSON.parse(r.storage.get('pulzzo_backoffice_demo')).patients.find(p=>p.id===r.run('p.id'));assert.equal(persisted.payments.at(-1).receiptId,r.run('p.payments.at(-1).receiptId'));r.run('dispersionApplyExtension(row.id)');assert.equal(r.run('p.payments.filter(x=>x.receiptId).length'),1);
});
test('Extended principal remains paid through rebuild, overdue remains visible, closure survives rebuild',()=>{
 const r=runtime();credit(r);extension(r);r.run("var ext=p.paymentSchedule.find(x=>x.id===row.id);ext.currentDueDate='2026-09-01';ext.dueDate='2026-09-01';dispersionApplyAmountToConcepts(ext,10,'2026-10-07','CAP','SPEI');var capPaid=ext.capitalPaid;var pending=ext.capitalPending;var rows=dispersionBuildSchedule(p);var rebuilt=rows.find(x=>x.id===ext.id)");assert.equal(r.run('rebuilt.capitalPaid'),r.run('capPaid'));assert.equal(r.run('rebuilt.capitalPending'),r.run('pending'));assert.equal(r.run('rebuilt.status'),'Vencido');
 r.run("dispersionApplyAmountToConcepts(ext,ext.pendingAmount,'2026-10-07','CAP2','SPEI');var closed=dispersionBuildSchedule(p).find(x=>x.id===ext.id)");assert.equal(r.run('closed.status'),'Pagado');assert.equal(r.run('closed.pendingAmount'),0);assert.equal(r.run('closed.capitalPending'),0);
});
test('Ordinary receipts reconcile, have unique IDs, reject replayed references, and survive reload',()=>{
 const r=runtime();credit(r);ordinary(r,100,'BANK-1');assert.equal(r.run('p.payments.at(-1).amountReceived'),100);assert.equal(r.run('p.payments.at(-1).totalApplied+p.payments.at(-1).unappliedAmount'),100);const count=r.run('p.payments.length');ordinary(r,100,'bank-1');assert.equal(r.run('p.payments.length'),count);ordinary(r,100,'BANK-2');assert.notEqual(r.run('p.payments.at(-1).receiptId'),r.run('p.payments.at(-2).receiptId'));
 const reload=runtime([...r.storage]);assert.equal(reload.run("getPortfolioLedgerRows().filter(m=>m.receiptId.startsWith('RCPT-')).length"),2);
});
test('Failed storage writes roll back payments, principal, history, and success state',()=>{
 const r=runtime();credit(r);r.run('var before=JSON.stringify(db)');const stored=r.storage.get('pulzzo_backoffice_demo');r.failWrites(true);assert.equal(ordinary(r,100,'FAIL-1'),false);assert.equal(r.run('JSON.stringify(db)'),r.run('before'));assert.equal(r.storage.get('pulzzo_backoffice_demo'),stored);assert.match(r.el('toast').textContent,/No se guardó/);
});
test('Stale tabs cannot overwrite another persisted payment',()=>{
 const r=runtime();credit(r);const altered=JSON.parse(r.storage.get('pulzzo_backoffice_demo'));altered.concurrent='new state';r.storage.set('pulzzo_backoffice_demo',JSON.stringify(altered));r.run('var before=JSON.stringify(p)');assert.equal(ordinary(r,100,'STALE-1'),false);assert.equal(r.run('JSON.stringify(p)'),r.run('before'));assert.match(r.el('toast').textContent,/otra pestaña/);
});
test('Reversal requires permission, reason and confirmation, retains original and blocks duplicate',()=>{
 const r=runtime();credit(r);ordinary(r,100,'REVERSE-1');r.run('var receipt=p.payments.at(-1);var original=JSON.stringify(receipt)');assert.equal(r.run("dispersionReverseReceipt(p.id,receipt.receiptId,'')"),false);r.run("session=users.find(x=>x.role==='operations')");assert.equal(r.run("dispersionReverseReceipt(p.id,receipt.receiptId,'Corrección')"),false);r.run("session=users.find(x=>x.role==='admin')");r.confirm(false);assert.equal(r.run("dispersionReverseReceipt(p.id,receipt.receiptId,'Corrección')"),false);r.confirm(true);assert.equal(r.run("dispersionReverseReceipt(p.id,receipt.receiptId,'Referencia equivocada')"),true);assert.equal(r.run('JSON.stringify(receipt)'),r.run('original'));assert.equal(r.run('p.payments.at(-1).reversalOf'),r.run('receipt.receiptId'));assert.equal(r.run('p.payments.at(-1).amountReceived'),-100);assert.equal(r.run("dispersionReverseReceipt(p.id,receipt.receiptId,'otra vez')"),false);
});
test('Settlement rejects outdated dates and changed balance snapshots',()=>{
 const r=runtime();credit(r);r.run("p.application.earlySettlementSimulation=dispersionCalculateEarlySettlement(p,'2026-10-07');var sim=p.application.earlySettlementSimulation");assert.equal(r.run("dispersionCanApplyEarlySettlement(p,sim.total+1,'2026-10-07').ok"),true);assert.equal(r.run("dispersionCanApplyEarlySettlement(p,sim.total+1,'2026-10-08').ok"),false);r.run('p.paymentSchedule[0].capitalPaid=42');assert.equal(r.run("dispersionCanApplyEarlySettlement(p,sim.total+1,'2026-10-07').ok"),false);
});
test('Extension defaults retain fees, IVA and permitted calendar periods',()=>{
 const r=runtime();credit(r);r.run('var row=dispersionBuildSchedule(p).find(r=>dispersionExtensionEligibility(r,p).ok);var quote=dispersionExtensionPreview(row,p,15)');assert.equal(r.run('quote.extensionFee'),r.run('roundToCents(Math.max(300,quote.capitalDeferred*.03))'));assert.equal(r.run('quote.extensionFeeVat'),r.run('roundToCents(quote.extensionFee*.16)'));assert.equal(r.run('dispersionExtensionPreview(row,p,30).valid'),false);
});
test('Sub-cent amounts and impossible dates are rejected before mutation',()=>{
 const r=runtime();credit(r);r.run('var before=JSON.stringify(p)');assert.equal(ordinary(r,10.005,'FRACTION'),false);assert.equal(r.run('JSON.stringify(p)'),r.run('before'));input(r,'dispersionPaymentAmount',10);input(r,'dispersionPaymentDate','2026-02-31');assert.equal(r.run('dispersionApplyPayment()'),false);assert.equal(r.run('JSON.stringify(p)'),r.run('before'));
});
test('Prepayment and settlement preserve receipt allocation equality',()=>{
 const r=runtime();credit(r);assert.equal(r.run("dispersionApplyCapitalPrepayment(p,1000,'2026-10-07','PREPAY-1','SPEI')"),true);assert.equal(r.run('roundToCents(p.payments.at(-1).allocations.reduce((sum,a)=>sum+a.amount,0))'),r.run('p.payments.at(-1).totalApplied'));
 r.run("p.application.earlySettlementSimulation=dispersionCalculateEarlySettlement(p,'2026-10-07');var total=p.application.earlySettlementSimulation.total");assert.equal(r.run("dispersionApplyEarlySettlement(p,total,'2026-10-07','SETTLE-1','SPEI')"),true);assert.equal(r.run('roundToCents(p.payments.at(-1).allocations.reduce((sum,a)=>sum+a.amount,0))'),r.run('p.payments.at(-1).totalApplied'));assert.equal(r.run('dispersionIsCreditLiquidated(p)'),true);
});
test('Reversal remains available after ordinary schedule normalization',()=>{
 const r=runtime();credit(r);ordinary(r,100,'NORMAL-1');r.run('var receipt=p.payments.at(-1);dispersionEnsureSchedule(p)');assert.equal(r.run("dispersionReverseReceipt(p.id,receipt.receiptId,'Corrección')"),true);
});
test('Disabled extension configuration and failed config storage fail closed',()=>{
 const r=runtime();credit(r);r.run("configResolveRules=()=>({...dispersionFinancialRulesBase,extensionBiweeklyDays:[]})");assert.equal(r.run('dispersionCanPrepayOrLiquidate(p)'),false); // unresolved base is a simulated corrupt registry
 r.run("configResolveRules=()=>({extensionMonthlyDays:[],extensionBiweeklyDays:[],prepayWaitMonths:3,extension15Rate:.03,extension15Minimum:300,extension30Rate:.05,extension30Minimum:500,versionId:'disabled'})");r.run('var row=dispersionBuildSchedule(p)[0]');assert.equal(r.run('dispersionExtensionEligibility(row,p).ok'),false);assert.equal(r.run('dispersionExtensionPreview(row,p,15).valid'),false);
});
test('Opening-fee reversal restores debt without removing original evidence',()=>{
 const r=runtime();r.run("var p={id:'FEE-REV',patient:{},application:{contractSigned:true},offer:{patientProcedureAmount:110000,providerBaseAmount:100000,openingFeeRate:.05,openingFeeMode:'upfront'},timeline:[]};db.patients.push(p);var originalDue=dispersionUpfrontOpeningFeePending(p)");assert.equal(r.run("dispersionApplyUpfrontOpeningFeePayment(p,100,'2026-10-07','FEE-REV-1','SPEI')"),true);assert.equal(r.run('dispersionUpfrontOpeningFeePending(p)'),r.run('originalDue-100'));r.run('var id=p.payments.at(-1).receiptId');assert.equal(r.run("dispersionReverseReceipt(p.id,id,'Error capturado')"),true);assert.equal(r.run('dispersionUpfrontOpeningFeePending(p)'),r.run('originalDue'));assert.equal(r.run('p.payments.length'),2);
});
test('Reversal controls are visible for administrators and hide from read-only roles',()=>{
 const r=runtime();credit(r);ordinary(r,100,'UI-REV-1');assert.match(r.run('dispersionMovementRowsHtml(p,[])'),/Revertir recibo/);assert.equal(r.run('dispersionOpenReceiptReversal(p.id,p.payments.at(-1).receiptId)'),true);assert.match(r.el('modal').innerHTML,/Motivo obligatorio/);assert.match(r.el('modal').innerHTML,/No devuelve dinero/);r.run("session=users.find(x=>x.role==='readonly')");assert.doesNotMatch(r.run('dispersionMovementRowsHtml(p,[])'),/Revertir recibo/);assert.equal(r.run('dispersionOpenReceiptReversal(p.id,p.payments.at(-1).receiptId)'),false);
});
test('Extension failure and reversal failures leave schedules and receipts untouched',()=>{
 const r=runtime();credit(r);r.run('var before=JSON.stringify(p)');r.failWrites(true);assert.equal(extension(r),false);assert.equal(r.run('JSON.stringify(p)'),r.run('before'));r.failWrites(false);ordinary(r,100,'FAIL-REV');r.run('var before=JSON.stringify(p);var receipt=p.payments.at(-1)');r.failWrites(true);assert.equal(r.run("dispersionReverseReceipt(p.id,receipt.receiptId,'Error')"),false);assert.equal(r.run('JSON.stringify(p)'),r.run('before'));
});
test('Receipt references cannot be reused across credits or through duplicate clicks',()=>{
 const r=runtime();credit(r);ordinary(r,100,'GLOBAL-BANK-1');r.run("var another={id:'OTHER',patient:{},application:{contractSigned:true},offer:{patientProcedureAmount:110000,openingFeeRate:.05,openingFeeMode:'upfront'},timeline:[]};db.patients.push(another)");assert.equal(r.run("dispersionApplyUpfrontOpeningFeePayment(another,100,'2026-10-07','GLOBAL-BANK-1','SPEI')"),false);assert.equal(r.run('(another.payments||[]).length'),0);
});
test('Outstanding-balance prepayment cannot reopen paid principal on rebuild',()=>{
 const r=runtime();credit(r);r.run("p.offer.interestCalculationBase='outstanding_balance';p.application.interestCalculationBase='outstanding_balance';p.paymentSchedule=[];dispersionEnsureSchedule(p);persist();var beforePrincipal=roundToCents(p.paymentSchedule.reduce((sum,r)=>sum+r.capitalPending,0))");assert.equal(r.run("dispersionApplyCapitalPrepayment(p,100000,'2026-10-07','OUTSTANDING-PREPAY','SPEI')"),true);r.run("var capitalApplied=p.payments.at(-1).allocations.filter(a=>['capital','capital_prepay'].includes(a.concept)).reduce((sum,a)=>sum+a.amount,0);var rebuilt=dispersionBuildSchedule(p)");assert.equal(r.run('roundToCents(rebuilt.reduce((sum,r)=>sum+r.capitalPending,0))'),r.run('roundToCents(beforePrincipal-capitalApplied)'));assert.equal(r.run("rebuilt.filter(r=>r.status==='Pagado').length"),r.run("p.paymentSchedule.filter(r=>r.status==='Pagado').length"));
});
test('Outstanding-balance realistic dates preserve principal across repeated reloads',()=>{
 const r=runtime();credit(r);r.run("p.offer.interestCalculationBase='outstanding_balance';p.application.interestCalculationBase='outstanding_balance';p.contract={signedAt:'2026-06-15'};p.application.dispersionDate='2026-06-16';p.application.disbursedAt='2026-06-16';p.paymentSchedule=[];dispersionEnsureSchedule(p);persist();var beforePrincipal=roundToCents(p.paymentSchedule.reduce((sum,r)=>sum+r.capitalPending,0))");assert.equal(r.run("dispersionApplyCapitalPrepayment(p,90000,'2026-10-07','JUNE-PREPAY','SPEI')"),true);r.run("var applied=p.payments.at(-1).allocations.filter(a=>['capital','capital_prepay'].includes(a.concept)).reduce((sum,a)=>sum+a.amount,0);var expected=roundToCents(beforePrincipal-applied);dispersionEnsureSchedule(p);dispersionEnsureSchedule(p)");assert.equal(r.run('roundToCents(p.paymentSchedule.reduce((sum,r)=>sum+r.capitalPending,0))'),r.run('expected'));const reload=runtime([...r.storage]);assert.equal(reload.run("roundToCents(dispersionBuildSchedule(db.patients.find(p=>p.id==='APP-PUL-1015')).reduce((sum,r)=>sum+r.capitalPending,0))"),r.run('expected'));
});
test('Changing settlement calculation date invalidates quote and hides stale results',()=>{
 const r=runtime();credit(r);r.run("p.application.earlySettlementSimulation=dispersionCalculateEarlySettlement(p,'2026-10-07')");input(r,'dispersionPaymentType','early_liquidation');input(r,'dispersionPaymentAmount',999999);r.run('dispersionInvalidateSettlementQuote()');assert.equal(r.run('dispersionEarlySettlementSimulation(p)'),null);assert.match(r.el('toast').textContent,/Recalcula/);
});
test('Committed future rows become payable on due day without changing principal',()=>{
 const r=runtime();credit(r);ordinary(r,100,'AGE-SCHEDULE');r.run("var row=p.paymentSchedule.find(r=>r.status==='Programado');row.currentDueDate='2026-10-07';row.dueDate='2026-10-07';var originalCapital=row.capital;var rebuilt=dispersionBuildSchedule(p).find(r=>r.id===row.id)");assert.equal(r.run('rebuilt.status'),'Pendiente');assert.equal(r.run('dispersionIsOrdinaryPayableRow(rebuilt)'),true);assert.equal(r.run('rebuilt.capital'),r.run('originalCapital'));
});
test('Prepay reversal survives render for both interest bases, frequencies, and payoff sizes',()=>{
 for(const base of ['global','outstanding_balance'])for(const frequency of ['monthly','biweekly'])for(const amount of [10000,90000,200000]){
  const r=runtime();credit(r);r.run(`p.offer.interestCalculationBase='${base}';p.application.interestCalculationBase='${base}';p.offer.paymentFrequency='${frequency}';p.application.paymentFrequency='${frequency}';p.contract={signedAt:'2026-06-15'};p.application.dispersionDate='2026-06-16';p.application.disbursedAt='2026-06-16';p.paymentSchedule=[];dispersionEnsureSchedule(p);persist();var principalBefore=roundToCents(p.paymentSchedule.reduce((sum,r)=>sum+r.capitalPending,0))`);
  assert.equal(r.run(`dispersionApplyCapitalPrepayment(p,${amount},'2026-10-07','MATRIX-${base}-${frequency}-${amount}','SPEI')`),true);r.run('var receipt=p.payments.at(-1);dispersionEnsureSchedule(p);dispersionEnsureSchedule(p)');assert.equal(r.run("dispersionReverseReceipt(p.id,receipt.receiptId,'Corrección de registro')"),true,`${base}/${frequency}/${amount}`);assert.equal(r.run('roundToCents(dispersionBuildSchedule(p).reduce((sum,r)=>sum+r.capitalPending,0))'),r.run('principalBefore'));
 }
});
test('Reversal equivalence ignores only aging projections and preserves financial guards',()=>{
 const r=runtime();r.run("var a={id:'x',status:'Programado',dpd:0,capital:100,capitalPaid:0,capitalPending:100,dueDate:'2026-10-07'},b={...a,status:'Vencido',dpd:1}");assert.equal(r.run("dispersionReceiptStateEquivalent('paymentSchedule',[a],[b])"),true);
 for(const change of ["capital:101","capitalPaid:1","capitalPending:99","dueDate:'2026-10-08'","status:'Pagado'","status:'Ajustada por prepago'"]){assert.equal(r.run(`dispersionReceiptStateEquivalent('paymentSchedule',[a],[{...b,${change}}])`),false,change);}
 credit(r);ordinary(r,100,'GUARDED');r.run('var receipt=p.payments.at(-1);p.paymentSchedule[0].capitalPending+=1');assert.equal(r.run("dispersionReverseReceipt(p.id,receipt.receiptId,'No autorizado')"),false);
});
console.log(`PASS: ${passed} payment integrity regression groups. Browser rendering is tested separately.`);
