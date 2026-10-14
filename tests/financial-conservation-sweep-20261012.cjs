'use strict';
// Execute real production handlers; assert conservation and reload invariants only.
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
// Seeded, reproducible mixed-action conservation sweep. This is VM execution of
// production handlers, not browser QA and not an independent interest oracle.
const counts={attempted:0,executed:0,committed:0,rejected:0,skipped:0};
for(const base of ['global','outstanding_balance'])for(const frequency of ['monthly','biweekly'])for(let seed=1;seed<=15;seed++)check(`Conservation sweep ${base}/${frequency}/seed-${seed}`,()=>{
 let state=seed;const random=()=>((state=Math.imul(state,1664525)+1013904223>>>0)/4294967296);const r=setup(base);
 r.run(`p.offer.paymentFrequency='${frequency}';p.application.paymentFrequency='${frequency}';p.paymentSchedule=[];dispersionEnsureSchedule(p);persist()`);
 const actions=[];
 for(let n=0;n<20;n++){
  counts.attempted++;const type=['ordinary','advance_installment','capital_prepay','extension','reverse'][Math.floor(random()*5)],amount=cents(1+random()*10000),reference=`SWEEP-${seed}-${n}`;let result;
  let before=r.run('JSON.stringify(db)');
  if(type==='extension'){
   r.run('var row=dispersionBuildSchedule(p).find(row=>dispersionExtensionEligibility(row,p).ok)');if(!r.run('!!row')){counts.skipped++;continue;}
   input(r,'extensionDays',15);input(r,'extensionAmountReceived',r.run('dispersionExtensionPreview(row,p,15).totalRequired'));input(r,'extensionReference',reference);input(r,'extensionMethod','SPEI');authorizeExtension(r);before=r.run('JSON.stringify(db)');result=r.run('dispersionApplyExtension(row.id)');
  }else if(type==='reverse'){
   r.run("var active=(p.payments||[]).filter(x=>x.paymentType!=='reversal'&&!(p.payments||[]).some(rev=>rev.reversalOf===x.receiptId)).at(-1)");if(!r.run('!!active')){counts.skipped++;continue;}
   result=r.run("dispersionReverseReceipt(p.id,active.receiptId,'Corrección ficticia del barrido')");
  }else result=r.run(`dispersionApplyPayment({creditId:p.id,type:'${type}',amount:${amount},reference:'${reference}',date:'2026-10-07',method:'SPEI'},{quiet:true})`);
  counts.executed++;if(result===true)counts.committed++;else{counts.rejected++;assert.equal(r.run('JSON.stringify(db)'),before,'Rejected action mutated state');}
  actions.push({type,amount,result});
  const pending=r.run('roundToCents(dispersionBuildSchedule(p).reduce((sum,row)=>sum+(row.capitalPending||0),0))');
  const paid=r.run("roundToCents((p.payments||[]).flatMap(m=>m.allocations||[]).filter(a=>['capital','capital_prepay'].includes(a.concept)).reduce((sum,a)=>sum+a.amount,0))");
  assert.equal(cents(pending+paid),84000,JSON.stringify({seed,n,pending,paid,actions}));
  for(const m of read(r,'getPortfolioLedgerRows(p)')){assert.equal(cents(m.amountReceived),cents(m.totalApplied+m.unappliedAmount));assert.equal(cents(m.totalApplied),cents(m.allocations.reduce((sum,a)=>sum+a.amount,0)));}
 }
 const reload=runtime([...r.storage]);assert.equal(reload.run("roundToCents(dispersionBuildSchedule(db.patients.find(x=>x.id==='APP-PUL-1015')).reduce((sum,row)=>sum+(row.capitalPending||0),0))"),r.run('roundToCents(dispersionBuildSchedule(p).reduce((sum,row)=>sum+(row.capitalPending||0),0))'));
});
console.log(JSON.stringify({checksPassed:checks,counts,failures},null,2));process.exitCode=failures.length?1:0;
