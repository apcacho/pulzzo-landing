'use strict';
// Execute actual production handlers against adversarial financial invariants.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const authorizeExtension=require('./fixtures/extension-authorization.cjs');
const source=fs.readFileSync(path.join(__dirname,'../backoffice.html'),'utf8');
const script=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m=>m[1].includes('const baseState='))[1];
let auditNow='2026-10-07T12:00:00Z';
function runtime(saved){
 let failWrites=false, confirmResult=true;
 const elements=new Map();
 function el(id){if(!elements.has(id))elements.set(id,{id,value:'',dataset:{},style:{},innerHTML:'',textContent:'',checked:false,disabled:false,files:[],classList:{add(){},remove(){},toggle(){},contains(){return false}},querySelector(){return null},querySelectorAll(){return []},addEventListener(){},setAttribute(){},scrollIntoView(){}});return elements.get(id)}
 const storage=new Map(saved||[]);
 const document={querySelector:s=>el(s.replace(/^#/,'')),querySelectorAll:s=>s==='.offer-procedure-card'?[...elements.values()].filter(x=>/^offerProcCard\d+$/.test(x.id)):[],getElementById:id=>elements.get(id)||null,addEventListener(){},createElement:tag=>el(tag),body:{appendChild(){}}};
 const FixedDate=class extends Date {constructor(...a){super(...(a.length?a:[auditNow]))} static now(){return new Date(auditNow).getTime()}};
 const context=vm.createContext({document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(failWrites)throw new Error('Quota exceeded');storage.set(k,String(v))},removeItem:k=>storage.delete(k)},window:{},confirm:()=>confirmResult,Date:FixedDate,console,Intl,Blob,URL,setTimeout(){},clearTimeout(){},innerWidth:1200});
 require('./fixtures/staff-session.cjs')(context);vm.runInContext(script,context);
 const run=code=>vm.runInContext(code,context);
 // No browser rendering is simulated: preserve real calculations/handlers, suppress repaint only.
 run("render=()=>{};renderPatientDetail=()=>{};closeModal=()=>{};session=testStaffSession('admin');");
 return {run,el,storage,failWrites:(v)=>failWrites=v,confirm:(v)=>confirmResult=v};
}

let passed=0;function test(name,fn){fn();passed++;console.log('PASS: '+name)}
function credit(r){r.run("var p=db.patients.find(p=>p.id==='APP-PUL-1015'); selectedPatientId=p.id; p.application.dispersionDate='2026-01-01';p.application.disbursedAt='2026-01-01';p.application.amortizationStatus='active';dispersionEnsureSchedule(p);persist()");}
function input(r,id,value){r.el(id).value=String(value)}
function ordinary(r,amount,ref){input(r,'dispersionPaymentType','ordinary');input(r,'dispersionPaymentAmount',amount);input(r,'dispersionPaymentReference',ref);input(r,'dispersionPaymentDate','2026-10-07');input(r,'dispersionPaymentMethod','SPEI');input(r,'dispersionPaymentTarget','auto');return r.run('dispersionApplyPayment()');}
function extension(r){r.run("var row=dispersionBuildSchedule(p).find(r=>dispersionExtensionEligibility(r,p).ok);var preview=dispersionExtensionPreview(row,p,15)");input(r,'extensionDays',15);input(r,'extensionReference','BANK-EXT-1');input(r,'extensionMethod','SPEI');input(r,'extensionAmountReceived',r.run('preview.totalRequired'));authorizeExtension(r);return r.run('dispersionApplyExtension(row.id)');}


function setup(base='global',signed='2026-06-16') { const r=runtime();credit(r);r.run(`p.offer.interestCalculationBase='${base}';p.application.interestCalculationBase='${base}';p.contract={signedAt:'${signed}'};p.application.dispersionDate='2026-06-16';p.application.disbursedAt='2026-06-16';p.paymentSchedule=[];dispersionEnsureSchedule(p);persist();`);return r; }
let failures=[];let checks=0;
function check(name,fn){try{fn();checks++;console.log('PASS '+name)}catch(e){failures.push({name,error:e.message});console.log('FAIL '+name+': '+e.message)}}
const cents=n=>Math.round((n+Number.EPSILON)*100)/100;
const read=(r,code)=>JSON.parse(r.run('JSON.stringify('+code+')'));
// Counterexamples found in the full-demo audit. Execute production handlers,
// never a copied finance implementation. All records below are fictitious.
function addCharges(r,when='due'){
 r.run(`var charged=p.paymentSchedule.find(row=>row.dueDate${when==='due'?'<=':'>'}'2026-10-07');Object.assign(charged,{commission:16,commissionPaid:4,moratoryNonInterest:100,moratoryNonInterestPaid:25,ordinaryNonInterest:200,ordinaryNonInterestPaid:50});dispersionRecalculateRowTotals(charged);persist()`);
}
function feeFixture(legacy=false){
 const r=runtime();r.run(`var p={id:'AUDIT-FEE',application:{contractSigned:true},offer:{accepted:true,patientProcedureAmount:10000,openingFeeRate:.03,openingFeeMode:'upfront'${legacy?'':',openingFeeTaxVersion:1'}},payments:[],timeline:[]};db.patients.push(p);persist()`);return r;
}
function feePay(r,amount,ref){return r.run(`dispersionApplyUpfrontOpeningFeePayment(p,${amount},'2026-10-07',${JSON.stringify(ref)},'SPEI',{quiet:true})`)}
function ledgerInvariant(r){
 const receipts=read(r,'getPortfolioLedgerRows(p)');
 for(const m of receipts){assert.equal(cents(m.totalApplied+m.unappliedAmount),m.amountReceived);assert.equal(cents(m.allocations.reduce((sum,a)=>sum+a.amount,0)),m.totalApplied);assert.ok(m.receiptId);}
}
for(const base of ['global','outstanding_balance'])for(const frequency of ['monthly','biweekly'])for(const when of ['due','future'])check(`Settlement retains all recorded non-interest debt ${base}/${frequency}/${when}`,()=>{
 const r=setup(base);r.run(`p.offer.paymentFrequency='${frequency}';p.application.paymentFrequency='${frequency}';p.paymentSchedule=[];dispersionEnsureSchedule(p);persist()`);
 const baseline=r.run("dispersionCalculateEarlySettlement(p,'2026-10-07').total");addCharges(r,when);
 const before=r.run('JSON.stringify(p)');const quote=read(r,"dispersionCalculateEarlySettlement(p,'2026-10-07')");
 assert.equal(r.run('JSON.stringify(p)'),before);assert.equal(quote.moratoryNonInterestPending,75);assert.equal(quote.ordinaryNonInterestPending,150);assert.equal(quote.commissionsPending,12);assert.equal(quote.total,cents(baseline+237));
 r.run("p.application.earlySettlementSimulation=dispersionCalculateEarlySettlement(p,'2026-10-07');var total=p.application.earlySettlementSimulation.total;var beforeClose=JSON.stringify(p.paymentSchedule)");
 assert.match(r.run('dispersionEarlySettlementHtml(p)'),/Moratorios sin interés pendientes/);
 assert.equal(r.run("dispersionApplyEarlySettlement(p,total+10,'2026-10-07','AUDIT-CLOSE','SPEI',{quiet:true})"),true);
 assert.equal(r.run('dispersionIsCreditLiquidated(p)'),true);ledgerInvariant(r);
 assert.equal(r.run('p.payments.at(-1).moratoryNonInterestSettled'),75);assert.equal(r.run('p.payments.at(-1).ordinaryNonInterestSettled'),150);assert.equal(r.run('p.payments.at(-1).unappliedAmount'),10);
 assert.equal(r.run("p.payments.at(-1).allocations.find(a=>a.concept==='moratorioSinInteres').amount"),75);assert.equal(r.run("p.payments.at(-1).allocations.find(a=>a.concept==='ordinarioSinInteres').amount"),150);
 assert.match(r.run('dispersionEarlySettlementSummaryHtml(p)'),/Ordinarios sin interés liquidados/);
 const reload=runtime([...r.storage]);assert.equal(reload.run("db.patients.find(x=>x.id==='APP-PUL-1015').payments.at(-1).ordinaryNonInterestSettled"),150);
 assert.equal(r.run("dispersionReverseReceipt(p.id,p.payments.at(-1).receiptId,'Corregir liquidación ficticia')"),true);assert.equal(r.run('JSON.stringify(p.paymentSchedule)'),r.run('beforeClose'));ledgerInvariant(r);
});
for(const channel of ['saved','provided','preview'])check(`A forged matching-fingerprint quote cannot close debt ${channel}`,()=>{
 const r=setup();r.run("var q=dispersionCalculateEarlySettlement(p,'2026-10-07');Object.assign(q,{capitalPending:1,interestAccrued:0,accruedOrdinaryInterest:0,interestIvaAccrued:0,ivaInterestPending:0,moratoryPending:0,moratoryIvaPending:0,commissionsPending:0,moratoryNonInterestPending:0,ordinaryNonInterestPending:0,total:1,totalToSettle:1})");
 if(channel==='saved')r.run('p.application.earlySettlementSimulation=q');
 const before=r.run('JSON.stringify(db)');const options=channel==='saved'?'{quiet:true}':channel==='provided'?'{quiet:true,settlementQuote:q}':'{preview:true,settlementQuote:q}';
 const result=channel==='preview'?r.run("dispersionApplyPayment({creditId:p.id,amount:1,type:'early_liquidation',date:'2026-10-07',reference:'BAD-QUOTE',method:'SPEI',settlementQuote:q},{preview:true})"):r.run(`dispersionApplyEarlySettlement(p,1,'2026-10-07','BAD-QUOTE','SPEI',${options})`);
 assert.equal(result,false);assert.equal(r.run('JSON.stringify(db)'),before);assert.equal(r.run('dispersionIsCreditLiquidated(p)'),false);
});
for(const field of ['capitalPending','interestAccrued','interestIvaAccrued','moratoryPending','moratoryIvaPending','commissionsPending','moratoryNonInterestPending','ordinaryNonInterestPending','total','totalToSettle'])check(`Settlement independently verifies quote component ${field}`,()=>{
 const r=setup();r.run(`p.application.earlySettlementSimulation=dispersionCalculateEarlySettlement(p,'2026-10-07');p.application.earlySettlementSimulation.${field}+=.01;var before=JSON.stringify(p)`);
 assert.equal(r.run("dispersionApplyEarlySettlement(p,999999,'2026-10-07','BAD-COMPONENT','SPEI',{quiet:true})"),false);assert.equal(r.run('JSON.stringify(p)'),r.run('before'));
});
for(const base of ['global','outstanding_balance'])for(const charge of ['commission','moratoryNonInterest','ordinaryNonInterest'])check(`Extension blocks unsupported unpaid charge without erasing debt ${base}/${charge}`,()=>{
 const r=setup(base);r.run(`var row=p.paymentSchedule[0];row.${charge}=100;dispersionRecalculateRowTotals(row);persist();var before=JSON.stringify(db)`);
 const eligibility=read(r,'dispersionExtensionEligibility(row,p)');assert.equal(eligibility.ok,false);assert.match(eligibility.message,/Revisión contable/);
 input(r,'extensionDays',15);input(r,'extensionAmountReceived',r.run('dispersionExtensionPreview(row,p,15).totalRequired'));input(r,'extensionReference','NO-WAIVER');input(r,'extensionMethod','SPEI');
 assert.equal(r.run("dispersionAuthorizeExtension(row.id,15,'No debe condonar cargos')"),false);r.run('dispersionApplyExtension(row.id)');assert.equal(r.run('JSON.stringify(db)'),r.run('before'));assert.equal(r.run('row.'+charge),100);
});
check('A settled extra charge does not impose a new extension restriction',()=>{
 const r=setup();r.run('var row=p.paymentSchedule[0];row.commission=100;row.commissionPaid=100;dispersionRecalculateRowTotals(row);persist()');assert.equal(r.run('dispersionExtensionEligibility(row,p).ok'),true);
});
const partitions=[['single',[348]],['rounded-parts',[50,50,50,50,50,50,48]],['cent-parts',[...Array(17).fill(.01),347.83]],['uneven',[.01,1.23,19.99,100.07,226.7]],['overpayment',[50,50,300]]];
for(const [label,amounts] of partitions)check(`Partial opening-fee tax totals equal the accepted base and IVA ${label}`,()=>{
 const r=feeFixture();amounts.forEach((amount,i)=>assert.equal(feePay(r,amount,`VAT-${i}`),true));ledgerInvariant(r);
 assert.equal(r.run("roundToCents(p.payments.flatMap(m=>m.allocations).filter(a=>a.concept==='commission_upfront_iva').reduce((sum,a)=>sum+a.amount,0))"),48);
 assert.equal(r.run("roundToCents(p.payments.flatMap(m=>m.allocations).filter(a=>a.concept==='commission_upfront').reduce((sum,a)=>sum+a.amount,0))"),300);
 assert.equal(r.run('dispersionUpfrontOpeningFeePending(p)'),0);assert.equal(r.run('dispersionTerms(p).totalFinancedAmount'),10000);
 const reload=runtime([...r.storage]);assert.equal(reload.run("dispersionUpfrontOpeningFeePending(db.patients.find(x=>x.id==='AUDIT-FEE'))"),0);
});
check('Cumulative fee tax remains exact after reversal, retry, and legacy receipts',()=>{
 const r=feeFixture();for(let i=0;i<6;i++)assert.equal(feePay(r,50,`PART-${i}`),true);assert.equal(feePay(r,48,'PART-LAST'),true);
 const immutable=r.run('JSON.stringify(p.payments.at(-1))');assert.equal(r.run("dispersionReverseReceipt(p.id,p.payments.at(-1).receiptId,'Corregir referencia')"),true);assert.equal(r.run('JSON.stringify(p.payments.at(-2))'),immutable);assert.equal(feePay(r,48,'PART-RETRY'),true);ledgerInvariant(r);
 assert.equal(r.run("roundToCents(p.payments.flatMap(m=>m.allocations).filter(a=>a.concept==='commission_upfront_iva').reduce((sum,a)=>sum+a.amount,0))"),48);
 const legacy=feeFixture(true);assert.equal(feePay(legacy,300,'LEGACY-FEE'),true);assert.equal(legacy.run("p.payments.at(-1).allocations.some(a=>a.concept==='commission_upfront_iva')"),false);assert.equal(legacy.run('dispersionTerms(p).openingFeeTaxReviewPending'),true);
});
check('Fee storage failure rolls back cumulative tax without consuming its rounding delta',()=>{
 const r=feeFixture();assert.equal(feePay(r,50,'FIRST'),true);const before=r.run('JSON.stringify(db)');r.failWrites(true);assert.equal(feePay(r,50,'RETRY'),false);assert.equal(r.run('JSON.stringify(db)'),before);r.failWrites(false);assert.equal(feePay(r,50,'RETRY'),true);assert.equal(r.run("p.payments.at(-1).allocations.find(a=>a.concept==='commission_upfront_iva').amount"),6.89);ledgerInvariant(r);
});
for(const base of ['global','outstanding_balance'])check(`Receipt order, reversal, and restored balance remain coherent ${base}`,()=>{
 const r=setup(base);const before=r.run('JSON.stringify(p.paymentSchedule)');assert.equal(r.run("dispersionApplyCapitalPrepayment(p,10000,'2026-10-07','FIRST','SPEI')"),true);const first=r.run('JSON.stringify(p.payments.at(-1))');assert.equal(r.run("dispersionApplyCapitalPrepayment(p,50000,'2026-10-07','SECOND','SPEI')"),true);
 assert.equal(r.run("dispersionApplyCapitalPrepayment(p,100,'2026-10-06','BACKDATED','SPEI',{retrospectiveReason:'Fecha incorrecta'})"),false);
 assert.equal(r.run("dispersionReverseReceipt(p.id,p.payments.at(-1).receiptId,'Reversa del segundo')"),true);
 assert.equal(r.run("dispersionReverseReceipt(p.id,p.payments[0].receiptId,'Reversa del primero')"),true);
 assert.equal(r.run('JSON.stringify(p.paymentSchedule)'),before);assert.equal(r.run('JSON.stringify(p.payments[0])'),first);ledgerInvariant(r);
 assert.equal(r.run("dispersionApplyCapitalPrepayment(p,100,'2026-10-06','BACKDATED','SPEI',{retrospectiveReason:'Comprobante histórico, posteriores revertidos'})"),true);ledgerInvariant(r);
});

for(const mode of ['upfront','financed'])for(const modern of [false,true])check(`Accepted monetary fee values override rate recomputation ${mode}/${modern?'tax-v1':'legacy'}`,()=>{
 const r=runtime(),fee=modern?232:250,principal=mode==='financed'?10000+fee:10000;
 r.run(`var p={id:'FROZEN-FEE',application:{contractSigned:true},offer:{accepted:true,patientProcedureAmount:10000,openingFeeRate:.03,openingFeeMode:'${mode}',openingFeeAmount:${fee},totalFinancedAmount:${principal}${modern?',openingFeeTaxVersion:1,openingFeeBaseAmount:200,openingFeeIvaAmount:32':''}},payments:[],timeline:[]};db.patients.push(p);persist();var frozen=JSON.stringify(p.offer)`);
 const b=read(r,'normalizeFinancialBreakdown(p)');assert.equal(b.openingFeeAmount,fee);assert.equal(b.openingFeeBaseAmount,modern?200:250);assert.equal(b.openingFeeIvaAmount,modern?32:0);assert.equal(b.totalFinancedAmount,principal);assert.equal(b.financialTermsReviewPending,false);assert.equal(r.run('JSON.stringify(p.offer)'),r.run('frozen'));
 const reload=runtime([...r.storage]);assert.equal(reload.run("dispersionTerms(db.patients.find(x=>x.id==='FROZEN-FEE')).openingFeeAmount"),fee);
 if(mode==='upfront'){assert.equal(r.run(`dispersionApplyUpfrontOpeningFeePayment(p,${fee},'2026-10-07','FROZEN-RECEIPT','SPEI',{quiet:true})`),true);ledgerInvariant(r);assert.equal(r.run('dispersionUpfrontOpeningFeePending(p)'),0);}
});
check('An explicitly recorded zero fee stays zero while a missing fee uses its rate',()=>{
 const r=runtime();r.run("var p={id:'ZERO-FEE',application:{contractSigned:true},offer:{accepted:true,patientProcedureAmount:10000,openingFeeRate:.03,openingFeeMode:'financed',openingFeeTaxVersion:1,openingFeeAmount:0,openingFeeBaseAmount:0,openingFeeIvaAmount:0,totalFinancedAmount:10000},payments:[]};db.patients.push(p)");
 assert.equal(r.run('dispersionTerms(p).openingFeeAmount'),0);assert.equal(r.run('dispersionTerms(p).totalFinancedAmount'),10000);assert.equal(r.run('dispersionTerms(p).financialTermsReviewPending'),false);
 r.run('delete p.offer.openingFeeAmount;delete p.offer.openingFeeBaseAmount;delete p.offer.openingFeeIvaAmount;delete p.offer.totalFinancedAmount');assert.equal(r.run('dispersionTerms(p).openingFeeAmount'),348);assert.equal(r.run('dispersionTerms(p).totalFinancedAmount'),10348);
});
for(const issue of ['financed-zero','financed-mismatch','fee-components'])check(`Inconsistent recorded terms retain values and block collection ${issue}`,()=>{
 const r=feeFixture();r.run("p.offer.openingFeeAmount=348;p.offer.openingFeeBaseAmount=300;p.offer.openingFeeIvaAmount=48;p.offer.totalFinancedAmount=10000");
 if(issue==='financed-zero')r.run('p.offer.totalFinancedAmount=0');
 if(issue==='financed-mismatch')r.run('p.offer.totalFinancedAmount=10001');
 if(issue==='fee-components')r.run('p.offer.openingFeeAmount=349');
 r.run('persist();var before=JSON.stringify(db)');assert.equal(r.run('dispersionTerms(p).financialTermsReviewPending'),true);assert.match(r.run('openingFeeTaxNotice(p)'),/Revisión contable/);assert.equal(feePay(r,100,'NO-REPRICE'),false);assert.equal(r.run('JSON.stringify(db)'),r.run('before'));assert.match(r.run("dispersionPrepareActivation(p,'2026-10-07').error"),/Revisión contable/);
 if(issue==='financed-zero')assert.equal(r.run('dispersionTerms(p).totalFinancedAmount'),0);
});
check('Fresh unaccepted quote recomputes fee and IVA from the current selected rate',()=>{
 const r=runtime();r.run("var p={id:'FRESH-FEE',application:{},offer:{patientProcedureAmount:10000,openingFeeRate:.03,openingFeeMode:'financed',openingFeeAmount:250,totalFinancedAmount:10250},payments:[]}");const b=read(r,'normalizeFinancialBreakdown(p)');assert.equal(b.openingFeeAmount,348);assert.equal(b.totalFinancedAmount,10348);assert.equal(b.financialTermsReviewPending,false);
});

check('A new final fee receipt reconciles independently rounded old receipts without rewriting them',()=>{
 const r=feeFixture();r.run("p.payments=Array.from({length:6},(_,i)=>({receiptId:'OLD-'+i,paymentType:'commission_upfront',reference:'OLD-'+i,date:'2026-10-07',amount:50,amountReceived:50,totalApplied:50,unappliedAmount:0,allocations:[{concept:'commission_upfront',amount:43.1},{concept:'commission_upfront_iva',amount:6.9}]}));p.application.openingFeeUpfrontPaidAmount=300;p.offer.openingFeeUpfrontPaidAmount=300;persist();var oldReceipts=JSON.stringify(p.payments)");
 assert.equal(feePay(r,48,'NEW-LAST'),true);assert.equal(r.run('JSON.stringify(p.payments.slice(0,6))'),r.run('oldReceipts'));ledgerInvariant(r);
 assert.equal(r.run("roundToCents(p.payments.flatMap(m=>m.allocations).filter(a=>a.concept==='commission_upfront_iva').reduce((sum,a)=>sum+a.amount,0))"),48);assert.equal(r.run("roundToCents(p.payments.flatMap(m=>m.allocations).filter(a=>a.concept==='commission_upfront').reduce((sum,a)=>sum+a.amount,0))"),300);
 assert.equal(r.run('p.payments.at(-1).openingFeeTaxRoundingAdjustment'),-.02);assert.equal(r.run("p.payments.at(-1).allocations.find(a=>a.concept==='commission_upfront_iva').amount"),6.6);
 assert.equal(r.run("dispersionReverseReceipt(p.id,p.payments.at(-1).receiptId,'Corregir último recibo')"),true);assert.equal(r.run('JSON.stringify(p.payments.slice(0,6))'),r.run('oldReceipts'));assert.equal(feePay(r,48,'NEW-LAST-RETRY'),true);ledgerInvariant(r);
});
for(const issue of ['missing-breakdown','insufficient-room','negative-tax-delta'])check(`Unreconcilable historical tax evidence fails closed ${issue}`,()=>{
 const r=feeFixture();r.run("p.payments=[{receiptId:'OLD',paymentType:'commission_upfront',reference:'OLD',date:'2026-10-07',amount:50,amountReceived:50,totalApplied:50,unappliedAmount:0}]");
 if(issue==='insufficient-room')r.run("p.payments[0].amount=347.99;p.payments[0].amountReceived=347.99;p.payments[0].totalApplied=347.99;p.payments[0].allocations=[{concept:'commission_upfront',amount:347.99}]");
 if(issue==='negative-tax-delta')r.run("p.payments[0].allocations=[{concept:'commission_upfront',amount:0},{concept:'commission_upfront_iva',amount:50}]");
 r.run('persist();var before=JSON.stringify(db);var issueMessage=""');assert.equal(r.run("dispersionApplyUpfrontOpeningFeePayment(p,348,'2026-10-07','BLOCKED-TAX','SPEI',{quiet:true,onError:message=>issueMessage=message})"),false);assert.equal(r.run('JSON.stringify(db)'),r.run('before'));assert.match(r.run('issueMessage'),/Revisión fiscal/);
});

for(const field of ['openingFeeAmount','openingFeeBaseAmount','openingFeeIvaAmount','totalFinancedAmount'])for(const value of ['garbage',-1,true,false])check(`Malformed posted ${field} is blocked, never replaced by current rate (${String(value)})`,()=>{
 const r=feeFixture();r.run(`p.offer.openingFeeAmount=348;p.offer.openingFeeBaseAmount=300;p.offer.openingFeeIvaAmount=48;p.offer.totalFinancedAmount=10000;p.offer.${field}=${JSON.stringify(value)};persist();var before=JSON.stringify(db);var issueMessage='';`);
 assert.equal(r.run('dispersionTerms(p).financialTermsReviewPending'),true);assert.equal(r.run('JSON.stringify(db)'),r.run('before'));
 assert.equal(r.run("dispersionApplyUpfrontOpeningFeePayment(p,100,'2026-10-07','INVALID-POSTED','SPEI',{quiet:true,onError:message=>issueMessage=message})"),false);assert.match(r.run('issueMessage'),/Revisión contable/);assert.equal(r.run('JSON.stringify(db)'),r.run('before'));
});
for(const versions of [[0,1],[1,0],[true,1],['garbage',1],[2,1]])check(`Disagreeing or invalid posted tax versions fail closed ${JSON.stringify(versions)}`,()=>{
 const r=feeFixture();r.run(`p.offer.openingFeeAmount=348;p.offer.openingFeeBaseAmount=300;p.offer.openingFeeIvaAmount=48;p.offer.openingFeeTaxVersion=${JSON.stringify(versions[0])};p.application.openingFeeTaxVersion=${JSON.stringify(versions[1])};persist();var before=JSON.stringify(db)`);
 assert.equal(r.run('dispersionTerms(p).financialTermsReviewPending'),true);assert.equal(feePay(r,100,'VERSION-CONFLICT'),false);assert.equal(r.run('JSON.stringify(db)'),r.run('before'));
 if(versions[0]===0)assert.equal(r.run('dispersionTerms(p).openingFeeTaxVersion'),0);
});
check('Missing historical VAT may be derived from recorded base, never a conflicting rate',()=>{
 const r=feeFixture();r.run('p.offer.openingFeeBaseAmount=200;delete p.offer.openingFeeIvaAmount;delete p.offer.openingFeeAmount');assert.equal(r.run('dispersionTerms(p).openingFeeAmount'),232);assert.equal(r.run('dispersionTerms(p).openingFeeIvaAmount'),32);assert.equal(r.run('dispersionTerms(p).financialTermsReviewPending'),false);
});
check('Recorded tax-version-one components inconsistent with IVA16 require review',()=>{
 const r=feeFixture();r.run('p.offer.openingFeeAmount=300;p.offer.openingFeeBaseAmount=300;p.offer.openingFeeIvaAmount=0;persist();var before=JSON.stringify(db)');assert.equal(r.run('dispersionTerms(p).openingFeeIvaAmount'),0);assert.equal(r.run('dispersionTerms(p).financialTermsReviewPending'),true);assert.equal(feePay(r,100,'INVALID-VAT'),false);assert.equal(r.run('JSON.stringify(db)'),r.run('before'));
});
console.log(JSON.stringify({checksPassed:checks,failures},null,2));process.exitCode=failures.length?1:0;
