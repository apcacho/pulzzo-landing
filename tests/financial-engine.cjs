'use strict';
// Execute actual production handlers. Reference formulas below are independent of the engine.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
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


function setup(base='global',signed='2026-06-16') { const r=runtime();credit(r);r.run(`p.offer.interestCalculationBase='${base}';p.application.interestCalculationBase='${base}';p.contract={signedAt:'${signed}'};p.application.dispersionDate='2026-06-16';p.application.disbursedAt='2026-06-16';p.paymentSchedule=[];dispersionEnsureSchedule(p);persist();`);return r; }
let failures=[];let checks=0;
function check(name,fn){try{fn();checks++;console.log('PASS '+name)}catch(e){failures.push({name,error:e.message});console.log('FAIL '+name+': '+e.message)}}
const cents=n=>Math.round((n+Number.EPSILON)*100)/100;
const read=(r,code)=>JSON.parse(r.run('JSON.stringify('+code+')'));
function dates(start,freq,n){let [y,m]=start.split('-').map(Number),out=[];for(let offset=0;out.length<n;offset++){const month=new Date(Date.UTC(y,m-1+offset,1));for(const day of freq==='biweekly'?[15,new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate()]:[15]){const d=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth(),day)).toISOString().slice(0,10);if(d>start)out.push(d);if(out.length===n)break;}}return out;}
function reference(principal,rate,start,due){let discount=1,pv=0,previous=start;for(const date of due){const days=(Date.parse(date)-Date.parse(previous))/86400000;discount/=1+rate*days/360*1.16;pv+=discount;previous=date;}return principal/pv;}
check('Backdated prepayment cannot bypass three-month eligibility',()=>{const r=setup();const before=r.run('JSON.stringify(p)');assert.equal(r.run("dispersionApplyCapitalPrepayment(p,50000,'2026-06-17','BACKDATE','SPEI')"),false);assert.equal(r.run('JSON.stringify(p)'),before)});
check('Signature before disbursement cannot create excess interest',()=>{const r=setup('outstanding_balance','2026-06-01');assert.equal(r.run('p.paymentSchedule[0].interest'),1960);assert.equal(r.run('p.paymentSchedule[0].interestIva'),313.60);assert.ok(Math.abs(r.run('p.paymentSchedule.at(-1).payment')-4922.56)<.02)});
check('Capital prepayment preserves regular payment and reduces maturity',()=>{const r=setup('outstanding_balance');const fixed=r.run('p.paymentSchedule[7].payment');assert.equal(r.run("dispersionApplyCapitalPrepayment(p,50000,'2026-10-07','PREPAY','SPEI')"),true);const rows=read(r,"dispersionBuildSchedule(p).filter(r=>r.dueDate>'2026-10-07'&&r.capitalPending>0)");assert.ok(rows.length<17);rows.slice(0,-1).forEach(row=>assert.equal(row.payment,fixed));assert.equal(cents(rows.reduce((s,row)=>s+row.capitalPending,0)),49590.88);const snap=JSON.stringify(rows);assert.equal(JSON.stringify(read(r,"dispersionBuildSchedule(p).filter(r=>r.dueDate>'2026-10-07'&&r.capitalPending>0)")),snap)});
check('Partial advance does not strand future principal',()=>{const r=setup();assert.equal(r.run("dispersionApplyPayment({creditId:p.id,amount:100,type:'advance_installment',date:'2026-10-07',reference:'ADVANCE',method:'SPEI',target:'ordinary-8'},{quiet:true})"),true);assert.equal(r.run("dispersionApplyCapitalPrepayment(p,200000,'2026-10-07','PREPAY','SPEI')"),true);assert.equal(r.run('p.payments.at(-1).unappliedAmount'),98948);assert.equal(r.run('roundToCents(dispersionBuildSchedule(p).reduce((s,r)=>s+r.capitalPending,0))'),0)});
for(const base of ['global','outstanding_balance'])for(const freq of ['monthly','biweekly'])for(const amount of [.01,100,1000,5000,10000,50000,100000,200000])check(`Conservation ${base}/${freq}/${amount}`,()=>{
const r=setup(base);r.run(`p.offer.paymentFrequency='${freq}';p.application.paymentFrequency='${freq}';p.paymentSchedule=[];dispersionEnsureSchedule(p);persist()`);assert.equal(r.run(`dispersionApplyCapitalPrepayment(p,${amount},'2026-10-07','MATRIX','SPEI')`),true);const payment=read(r,'p.payments.at(-1)');const principalPaid=cents(payment.allocations.filter(a=>['capital','capital_prepay'].includes(a.concept)).reduce((s,a)=>s+a.amount,0));for(let n=0;n<3;n++){r.run('dispersionEnsureSchedule(p)');assert.equal(r.run('roundToCents(p.paymentSchedule.reduce((s,r)=>s+r.capitalPending,0))'),cents(84000-principalPaid));}assert.equal(cents(payment.totalApplied+payment.unappliedAmount),amount);assert.equal(cents(payment.allocations.reduce((s,a)=>s+a.amount,0)),payment.totalApplied);
});
for(const base of ['global','outstanding_balance'])for(const freq of ['monthly','biweekly'])for(const start of ['2026-01-31','2026-02-28','2026-06-16','2028-02-29'])for(const principal of [1000,84000,103480])check(`Independent quote ${base}/${freq}/${start}/${principal}`,()=>{
const r=runtime(),n=freq==='biweekly'?24:12,due=dates(start,freq,n),rate=.60;const actual=r.run(`calculateFixedPeriodPayment(${JSON.stringify({principal,totalPeriods:n,dueDates:due,startDate:start,terms:{ordinaryAnnualRate:rate,paymentFrequency:freq,totalFinancedAmount:principal},interestCalculationBase:base})})`);const expected=base==='global'?cents(principal/n+cents(principal*rate/n)+cents(cents(principal*rate/n)*.16)):reference(principal,rate,start,due);assert.ok(Math.abs(actual-expected)<.03,`actual ${actual}, independently discounted expected ${expected}`);
});
for(const base of ['global','outstanding_balance'])for(const advance of [100,2436,2500,3000,4900])check(`Advance then prepay preserves paid concepts ${base}/${advance}`,()=>{const r=setup(base);assert.equal(r.run(`dispersionApplyPayment({creditId:p.id,amount:${advance},type:'advance_installment',date:'2026-10-07',reference:'ADVANCE',method:'SPEI',target:'ordinary-8'},{quiet:true})`),true);const originalPaid=read(r,"p.paymentSchedule.find(r=>r.id==='ordinary-8')");assert.equal(r.run("dispersionApplyCapitalPrepayment(p,200000,'2026-10-07','PREPAY','SPEI')"),true);const movements=read(r,'p.payments');const applied=cents(movements.flatMap(m=>m.allocations||[]).filter(a=>['capital','capital_prepay'].includes(a.concept)).reduce((s,a)=>s+a.amount,0));const pending=r.run('roundToCents(dispersionBuildSchedule(p).reduce((s,r)=>s+r.capitalPending,0))');assert.equal(cents(applied+pending),84000);assert.equal(pending,0);const after=read(r,"p.paymentSchedule.find(r=>r.id==='ordinary-8')");for(const field of ['capitalPaid','interestPaid','ivaInteresPaid'])assert.equal(after[field],originalPaid[field],field);});

for(const when of ['2026-10-01','2026-10-07','2026-10-15'])check(`Split-period single prepayment ${when}`,()=>{auditNow=when+'T12:00:00Z';const r=setup('outstanding_balance'),before=read(r,'p.paymentSchedule');const dues=before.filter(row=>row.dueDate<=when),future=before.find(row=>row.dueDate>when);const oldBalance=cents(84000-dues.reduce((s,row)=>s+row.capital,0)),capitalPrepaid=cents(50000-dues.reduce((s,row)=>s+row.payment,0)),newBalance=cents(oldBalance-capitalPrepaid),start=dues.at(-1).dueDate;assert.equal(r.run(`dispersionApplyCapitalPrepayment(p,50000,'${when}','SPLIT','SPEI')`),true);const next=read(r,`p.paymentSchedule.find(r=>r.id==='${future.id}')`),days1=(Date.parse(when)-Date.parse(start))/86400000,days2=(Date.parse(future.dueDate)-Date.parse(when))/86400000,interest=cents((oldBalance*days1+newBalance*days2)*.6/360);assert.equal(next.interest,interest);assert.equal(next.interestIva,cents(interest*.16));assert.equal(next.payment,4922.69);assert.equal(next.capital,cents(4922.69-interest-cents(interest*.16)));assert.equal(r.run(`dispersionBuildSchedule(p).find(r=>r.id==='${future.id}').interest`),interest);});
check('Two mid-period prepayments preserve segmented interest without duplicated days',()=>{auditNow='2026-10-01T12:00:00Z';const r=setup('outstanding_balance');assert.equal(r.run("dispersionApplyCapitalPrepayment(p,50000,'2026-10-01','FIRST-SPLIT','SPEI')"),true);auditNow='2026-10-07T12:00:00Z';assert.equal(r.run("dispersionApplyCapitalPrepayment(p,5000,'2026-10-07','SECOND-SPLIT','SPEI')"),true);const expected=cents((65132.05*1+49590.88*6+44590.88*8)*.6/360);assert.equal(r.run("dispersionBuildSchedule(p).find(r=>r.id==='ordinary-8').interest"),expected);assert.equal(r.run('roundToCents(dispersionBuildSchedule(p).reduce((s,r)=>s+r.capitalPending,0))'),44590.88)});
auditNow='2026-10-07T12:00:00Z';

check('Receipt dates require permission/reason, reject future and preserve as-of allocation',()=>{const r=setup();const before=r.run('JSON.stringify(p)');assert.equal(r.run("dispersionApplyCapitalPrepayment(p,50000,'2026-10-08','FUTURE','SPEI')"),false);assert.equal(r.run("dispersionApplyCapitalPrepayment(p,50000,'2026-10-01','NO-REASON','SPEI')"),false);assert.equal(r.run('JSON.stringify(p)'),before);r.run("session=users.find(u=>u.role==='operations')");assert.equal(r.run("dispersionApplyCapitalPrepayment(p,50000,'2026-10-01','NO-PERMISSION','SPEI',{retrospectiveReason:'Real receipt date'})"),false);r.run("session=users.find(u=>u.role==='admin')");assert.equal(r.run("dispersionApplyPayment({creditId:p.id,amount:20000,type:'ordinary',date:'2026-07-01',reference:'HISTORICAL',method:'SPEI',target:'auto'},{quiet:true,retrospectiveReason:'Original bank receipt'})"),true);const m=read(r,'p.payments.at(-1)');assert.equal(m.totalApplied,5936);assert.equal(m.unappliedAmount,14064);assert.equal(r.run("p.paymentSchedule.filter(r=>r.dueDate>'2026-07-01').reduce((s,r)=>s+r.paidAmount,0)"),0);assert.equal(m.retrospectiveReason,'Original bank receipt');});
check('Later receipts prevent unsafe historical insertion',()=>{const r=setup();assert.equal(r.run("dispersionApplyCapitalPrepayment(p,50000,'2026-10-07','LATER','SPEI')"),true);const before=r.run('JSON.stringify(p)');assert.equal(r.run("dispersionApplyCapitalPrepayment(p,50000,'2026-10-01','EARLIER','SPEI',{retrospectiveReason:'Earlier bank receipt'})"),false);assert.equal(r.run('JSON.stringify(p)'),before)});
check('Split interest survives reload, exact reversal, and failed writes',()=>{const r=setup('outstanding_balance');const original=r.run('JSON.stringify(p.paymentSchedule)');r.failWrites(true);assert.equal(r.run("dispersionApplyCapitalPrepayment(p,50000,'2026-10-07','SPLIT-FAIL','SPEI')"),false);assert.equal(r.run('JSON.stringify(p.paymentSchedule)'),original);r.failWrites(false);assert.equal(r.run("dispersionApplyCapitalPrepayment(p,50000,'2026-10-07','SPLIT-OK','SPEI')"),true);const reload=runtime([...r.storage]);assert.equal(reload.run("dispersionBuildSchedule(db.patients.find(p=>p.id==='APP-PUL-1015')).find(r=>r.id==='ordinary-8').interest"),1421.09);assert.equal(r.run("dispersionReverseReceipt(p.id,p.payments.at(-1).receiptId,'Correct erroneous receipt')"),true);assert.equal(r.run('JSON.stringify(p.paymentSchedule)'),original)});


for(const base of ['global','outstanding_balance'])for(const frequency of ['monthly','biweekly']){
 check(`Effective date governs eligibility and due allocations ${base}/${frequency}`,()=>{
  auditNow='2026-10-07T12:00:00Z';const r=setup(base);r.run(`p.offer.paymentFrequency='${frequency}';p.application.paymentFrequency='${frequency}';p.paymentSchedule=[];dispersionEnsureSchedule(p);persist();var before=JSON.stringify(p)`);
  assert.equal(r.run("dispersionCanPrepayOrLiquidate(p,'2026-09-15')"),false);
  assert.equal(r.run("dispersionCanPrepayOrLiquidate(p,'2026-09-16')"),true);
  assert.equal(r.run("dispersionApplyCapitalPrepayment(p,50000,'2026-09-15','EARLY','SPEI',{retrospectiveReason:'Corrección autorizada'})"),false);
  assert.equal(r.run('JSON.stringify(p)'),r.run('before'));
  const beforeRows=read(r,'p.paymentSchedule');
  assert.equal(r.run("dispersionApplyCapitalPrepayment(p,50000,'2026-09-16','EFFECTIVE','SPEI',{retrospectiveReason:'Comprobante de recepción validado'})"),true);
  const receipt=read(r,'p.payments.at(-1)');
  assert.equal(receipt.appliedToDues,cents(beforeRows.filter(row=>row.dueDate<='2026-09-16').reduce((s,row)=>s+row.pendingAmount,0)));
  for(const allocation of receipt.allocations.filter(a=>a.rowId))assert.ok(beforeRows.find(row=>row.id===allocation.rowId).dueDate<='2026-09-16');
  assert.equal(receipt.effectiveDate,'2026-09-16');assert.equal(receipt.retrospective,true);assert.equal(receipt.retrospectiveReason,'Comprobante de recepción validado');assert.ok(receipt.retrospectiveAuthorizedBy);
 });
 check(`Partial advanced capital is preserved over repeated prepay ${base}/${frequency}`,()=>{
  auditNow='2026-10-07T12:00:00Z';const r=setup(base);r.run(`p.offer.paymentFrequency='${frequency}';p.application.paymentFrequency='${frequency}';p.paymentSchedule=[];dispersionEnsureSchedule(p);persist();var next=p.paymentSchedule.find(r=>r.dueDate>'2026-10-07')`);
  const advance=cents(r.run('next.interest+next.interestIva+25.37'));
  assert.equal(r.run(`dispersionApplyPayment({creditId:p.id,amount:${advance},type:'advance_installment',date:'2026-10-07',reference:'ADV',method:'SPEI',target:next.id},{quiet:true})`),true);
  r.run('var paidBefore=JSON.stringify(p.payments[0]);var rowId=next.id');const paid=read(r,'p.paymentSchedule.find(r=>r.id===rowId)');
  for(const amount of [50000,123.45,200000]){
   assert.equal(r.run(`dispersionApplyCapitalPrepayment(p,${amount},'2026-10-07','PRE-${amount}','SPEI')`),true);
   const outstanding=r.run('roundToCents(dispersionBuildSchedule(p).reduce((s,row)=>s+row.capitalPending,0))');
   const paidPrincipal=r.run("roundToCents(p.payments.flatMap(m=>m.allocations||[]).filter(a=>['capital','capital_prepay'].includes(a.concept)).reduce((s,a)=>s+a.amount,0))");
   assert.equal(cents(outstanding+paidPrincipal),84000);
   const actual=read(r,'p.paymentSchedule.find(r=>r.id===rowId)');for(const field of ['capitalPaid','interestPaid','ivaInteresPaid'])assert.equal(actual[field],paid[field]);
   assert.equal(r.run('JSON.stringify(p.payments[0])'),r.run('paidBefore'));
  }
  assert.equal(r.run('roundToCents(p.paymentSchedule.reduce((s,r)=>s+r.capitalPending,0))'),0);
 });
}
check('Saved accepted schedules retain legacy values without silent repricing',()=>{
 auditNow='2026-10-07T12:00:00Z';const r=setup('outstanding_balance','2026-06-01');
 r.run("p.paymentSchedule[0].interest=4060;p.paymentSchedule[0].interestIva=649.6;p.paymentSchedule[0].payment=7001.1;p.paymentSchedule[0].totalPayment=7001.1;dispersionHydrateConcepts(p.paymentSchedule[0],{});p.paymentSchedule.at(-1).payment=9668.17;p.paymentSchedule.at(-1).totalPayment=9668.17;var historical=JSON.stringify(p.paymentSchedule);persist()");
 r.run('dispersionEnsureSchedule(p);dispersionEnsureSchedule(p)');assert.equal(r.run('JSON.stringify(p.paymentSchedule)'),r.run('historical'));
 const reload=runtime([...r.storage]);assert.equal(reload.run("dispersionBuildSchedule(db.patients.find(x=>x.id==='APP-PUL-1015'))[0].interest"),4060);
});
check('Retroactive date requires administrator plus reason, future dates fail atomically',()=>{
 auditNow='2026-10-07T12:00:00Z';const r=setup();r.run('var before=JSON.stringify(p)');
 for(const [date,options] of [['2026-10-08',"{retrospectiveReason:'No futuro'}"],['2026-09-16','{}']]){
  assert.equal(r.run(`dispersionApplyCapitalPrepayment(p,50000,'${date}','DATE-${date}','SPEI',${options})`),false);assert.equal(r.run('JSON.stringify(p)'),r.run('before'));
 }
 r.run("session=users.find(x=>x.role==='operations')");assert.equal(r.run("dispersionApplyCapitalPrepayment(p,50000,'2026-09-16','ROLE','SPEI',{retrospectiveReason:'Comprobante'})"),false);assert.equal(r.run('JSON.stringify(p)'),r.run('before'));
 r.run("session=users.find(x=>x.role==='admin')");assert.equal(r.run("dispersionApplyPayment({creditId:p.id,amount:50000,type:'capital_prepay',date:'2026-09-16',reference:'OK-PAST',method:'SPEI',retrospectiveReason:'Comprobante verificado'},{quiet:true})"),true);
 assert.equal(r.run('p.payments.at(-1).retrospectiveReason'),'Comprobante verificado');
});
check('Mexico City date boundary is independent of host clock date',()=>{
 auditNow='2026-10-08T03:00:00Z';const r=setup();assert.equal(r.run('dispersionBusinessDateMX()'),'2026-10-07');
 assert.equal(r.run("dispersionApplyCapitalPrepayment(p,50000,'2026-10-08','UTC-FUTURE','SPEI')"),false);
 assert.equal(r.run("dispersionApplyCapitalPrepayment(p,50000,'2026-10-07','MX-TODAY','SPEI')"),true);assert.equal(r.run('p.payments.at(-1).retrospective'),false);
 auditNow='2026-10-07T12:00:00Z';
});
check('Out-of-order receipt and settlement quote fail closed without reconstructible replay',()=>{
 const r=setup();assert.equal(r.run("dispersionApplyCapitalPrepayment(p,100,'2026-10-07','LATER','SPEI')"),true);r.run('var before=JSON.stringify(p)');
 assert.equal(r.run("dispersionApplyCapitalPrepayment(p,50000,'2026-09-16','OLDER','SPEI',{retrospectiveReason:'Recepción anterior'})"),false);assert.equal(r.run('JSON.stringify(p)'),r.run('before'));assert.match(r.el('toast').textContent,/operación posterior/);
 assert.equal(r.run("dispersionCanSimulateEarlySettlement(p,'2026-09-16')"),false);
});
check('Ordinary and advance handlers allocate against the effective date',()=>{
 const r=setup();r.run("var target=p.paymentSchedule.find(row=>row.dueDate==='2026-09-30');var before=JSON.stringify(p)");
 assert.equal(r.run("dispersionApplyPayment({creditId:p.id,amount:100,type:'ordinary',date:'2026-09-16',reference:'WRONG-ORDINARY',method:'SPEI',target:target.id,retrospectiveReason:'Recepción real'},{quiet:true})"),undefined);
 assert.equal(r.run('JSON.stringify(p)'),r.run('before'));
 assert.equal(r.run("dispersionApplyPayment({creditId:p.id,amount:100,type:'advance_installment',date:'2026-09-16',reference:'RIGHT-ADVANCE',method:'SPEI',target:target.id,retrospectiveReason:'Recepción real'},{quiet:true})"),true);
 assert.equal(r.run('p.payments.at(-1).allocations[0].rowId'),r.run('target.id'));
});
for(const frequency of ['monthly','biweekly'])check(`Full capital payoff preserves accrued interest and settlement ${frequency}`,()=>{
 const r=setup('outstanding_balance');r.run(`p.offer.paymentFrequency='${frequency}';p.application.paymentFrequency='${frequency}';p.paymentSchedule=[];dispersionEnsureSchedule(p);persist()`);
 const rows=read(r,'p.paymentSchedule'),next=rows.find(row=>row.dueDate>'2026-10-07'),previous=rows.filter(row=>row.dueDate<='2026-10-07').at(-1).dueDate;
 const oldBalance=cents(rows.filter(row=>row.dueDate>'2026-10-07').reduce((s,row)=>s+row.capitalPending,0));
 const expectedInterest=cents(oldBalance*.6*(Date.parse('2026-10-07')-Date.parse(previous))/86400000/360);
 assert.equal(r.run("dispersionApplyCapitalPrepayment(p,200000,'2026-10-07','ALL-CAPITAL','SPEI')"),true);
 assert.equal(r.run('roundToCents(p.paymentSchedule.reduce((s,row)=>s+row.capitalPending,0))'),0);
 const updated=read(r,`p.paymentSchedule.find(row=>row.id==='${next.id}')`);assert.equal(updated.interestPending,expectedInterest);assert.equal(updated.ivaInteresPending,cents(expectedInterest*.16));assert.equal(updated.status,'Ajustada por prepago');
 const snapshot=r.run('JSON.stringify(p.paymentSchedule)');const quote=read(r,"dispersionCalculateEarlySettlement(p,'2026-10-07')");assert.equal(r.run('JSON.stringify(p.paymentSchedule)'),snapshot);assert.equal(quote.capitalPending,0);assert.equal(quote.interestAccrued,expectedInterest);assert.equal(quote.total,cents(expectedInterest+cents(expectedInterest*.16)));
 r.run("p.application.earlySettlementSimulation=dispersionCalculateEarlySettlement(p,'2026-10-07');var final=p.application.earlySettlementSimulation.total");assert.equal(r.run("dispersionApplyEarlySettlement(p,final,'2026-10-07','CLOSE-INTEREST','SPEI')"),true);assert.equal(r.run('dispersionIsCreditLiquidated(p)'),true);
});
check('Settlement after two dated prepayments integrates saved principal segments',()=>{
 auditNow='2026-10-01T12:00:00Z';const r=setup('outstanding_balance');assert.equal(r.run("dispersionApplyCapitalPrepayment(p,50000,'2026-10-01','FIRST','SPEI')"),true);
 auditNow='2026-10-07T12:00:00Z';assert.equal(r.run("dispersionApplyCapitalPrepayment(p,5000,'2026-10-07','SECOND','SPEI')"),true);
 const quote=read(r,"dispersionCalculateEarlySettlement(p,'2026-10-07')");assert.equal(quote.interestAccrued,cents((65132.05*1+49590.88*6)*.6/360));assert.equal(quote.interestIvaAccrued,cents(quote.interestAccrued*.16));assert.equal(quote.capitalPending,44590.88);
 const reloaded=runtime([...r.storage]);assert.equal(reloaded.run("dispersionCalculateEarlySettlement(db.patients.find(x=>x.id==='APP-PUL-1015'),'2026-10-07').interestAccrued"),quote.interestAccrued);
});
check('Wait-month anniversaries clamp month ends and invalid dates never qualify',()=>{
 const r=setup();for(const [start,expected] of [['2026-01-31','2026-04-30'],['2025-11-30','2026-02-28'],['2027-11-30','2028-02-29']]){
  r.run(`p.application.dispersionDate='${start}'`);assert.equal(r.run('dispersionPrepayAllowedDate(p)'),expected);
 }
 assert.equal(r.run("dispersionCanPrepayOrLiquidate(p,'2028-02-31')"),false);
});
check('Validation callbacks expose real failure without preview toast or mutation',()=>{
 const r=setup();r.run("var issue='';var before=JSON.stringify(p);var dbBefore=JSON.stringify(db);var toastCount=0;toast=()=>{toastCount++}");
 assert.equal(r.run("dispersionApplyPayment({creditId:p.id,amount:100,type:'ordinary',date:'2026-09-16',reference:'NO-REASON',method:'SPEI'},{preview:true,onError:message=>issue=message})"),false);
 assert.match(r.run('issue'),/motivo/);assert.equal(r.run('toastCount'),0);assert.equal(r.run('JSON.stringify(p)'),r.run('before'));assert.equal(r.run('JSON.stringify(db)'),r.run('dbBefore'));
});
check('Paid-interest surplus is visible as review-only interest and IVA',()=>{
 const r=setup('outstanding_balance');assert.equal(r.run("dispersionApplyPayment({creditId:p.id,amount:3000,type:'advance_installment',date:'2026-10-07',reference:'ADV-REVIEW',method:'SPEI',target:'ordinary-8'},{quiet:true})"),true);
 assert.equal(r.run("dispersionApplyCapitalPrepayment(p,200000,'2026-10-07','PRE-REVIEW','SPEI')"),true);
 const html=r.run('dispersionPrepaymentReviewNoticeHtml(p.paymentSchedule)');assert.match(html,/Revisión contable requerida/);assert.match(html,/no se aplicó devolución ni reasignación/);assert.match(html,/IVA/);
 assert.ok(r.run('p.paymentSchedule.reduce((s,r)=>s+r.prepaymentInterestCreditPendingReview||s,0)')>0);
});
check('Settlement retains prior partial-advance evidence on cancelled future rows',()=>{
 const r=setup('outstanding_balance');assert.equal(r.run("dispersionApplyPayment({creditId:p.id,amount:3000,type:'advance_installment',date:'2026-10-07',reference:'ADV-SETTLE',method:'SPEI',target:'ordinary-8'},{quiet:true})"),true);
 const paid=read(r,"p.paymentSchedule.find(row=>row.id==='ordinary-8')");r.run("var previousReceipt=JSON.stringify(p.payments[0]);p.application.earlySettlementSimulation=dispersionCalculateEarlySettlement(p,'2026-10-07');var total=p.application.earlySettlementSimulation.total");
 assert.equal(r.run("dispersionApplyEarlySettlement(p,total,'2026-10-07','FINAL-SETTLE','SPEI')"),true);
 const settled=read(r,"dispersionBuildSchedule(p).find(row=>row.id==='ordinary-8')");for(const field of ['capitalPaid','interestPaid','ivaInteresPaid','paidAmount'])assert.equal(settled[field],paid[field]);assert.equal(settled.pendingAmount,0);assert.equal(r.run('JSON.stringify(p.payments[0])'),r.run('previousReceipt'));
});
check('Provider allocations preserve zero, distinguish missing, and never inflate stored singles',()=>{
 const r=setup();r.run("var providerCase={application:{providerDispersions:[{provider:'A',amount:0},{provider:'B',amount:25},{provider:'C'},{provider:'D',amount:'pendiente'},{provider:'E',amount:-10}]},offer:{}};var terms={amountToDisperse:100,provider:'Fallback',procedure:'P'}");
 const rows=read(r,'dispersionGeneratedProviderPayments(providerCase,terms)');assert.deepEqual(rows.map(row=>row.amount),[0,25,null,null,null]);assert.deepEqual(rows.map(row=>row.amountValidation),['valid','valid','missing','invalid','invalid']);
 r.run('providerCase.application.providerDispersions=[{provider:"Only",amount:25}]');assert.equal(r.run('dispersionGeneratedProviderPayments(providerCase,terms)[0].amount'),25);
 r.run('providerCase.application.providerDispersions=[];providerCase.offer.financedProcedures=[{providerName:"Zero",cost:0,amount:100}]');assert.equal(r.run('dispersionGeneratedProviderPayments(providerCase,terms)[0].amount'),0);
});
check('Provider paid states require exact success or valid actual date',()=>{
 const r=setup();for(const status of ['Pendiente de dispersión','No dispersada','Sin importe por dispersar','Bloqueada','Lista para liberar'])assert.equal(r.run(`dispersionProviderIsDispersed({status:${JSON.stringify(status)}})`),false,status);
 for(const status of ['Dispersada','dispersado','Dispersed','Paid','Pagada'])assert.equal(r.run(`dispersionProviderIsDispersed({status:${JSON.stringify(status)}})`),true,status);
 assert.equal(r.run("dispersionProviderIsDispersed({dispersionDate:'2026-02-31'})"),false);assert.equal(r.run("dispersionProviderIsDispersed({dispersionDate:'2026-09-30',status:'Pendiente de dispersión'})"),true);
});
check('Provider normalization is read-only and unresolved amounts visibly block payout',()=>{
 const r=setup();r.run("p.application.providerDispersions=[{id:'a',provider:'A',amount:0,status:'No dispersada'},{id:'b',provider:'B',status:'Pendiente de dispersión'}];var before=JSON.stringify(p)");
 const rows=read(r,'dispersionProviderPayments(p,dispersionTerms(p),true)');assert.equal(rows[0].status,'Sin importe por dispersar');assert.equal(rows[1].status,'Requiere revisión');assert.equal(r.run('JSON.stringify(p)'),r.run('before'));
 r.run('dispersionReadyForRelease=()=>true');assert.equal(r.run('dispersionMarkProviderDispersed(1)'),false);assert.equal(r.run('JSON.stringify(p)'),r.run('before'));
});
console.log(JSON.stringify({checksPassed:checks,failures},null,2));process.exitCode=failures.length?1:0;
