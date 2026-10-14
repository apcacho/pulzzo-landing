'use strict';
// Independent two-step extension regression. Executes shipped source in a VM;
// no browser, production publication, forged staff sessions, or copied math.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../backoffice.html'),'utf8');
const script=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m=>m[1].includes('const baseState='))[1];
function runtime(saved){
 let failWrites=false,confirmed=true,clock='2026-10-07T12:00:00Z',beforeConfirm=null,tick=0;
 const elements=new Map(),storage=new Map(saved||[]);
 function el(id){if(!elements.has(id))elements.set(id,{id,value:'',dataset:{},style:{},innerHTML:'',textContent:'',checked:false,disabled:false,files:[],classList:{add(){},remove(){},toggle(){},contains(){return false;}},querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){},setAttribute(){},scrollIntoView(){},focus(){}});return elements.get(id);}
 const document={querySelector:s=>el(s.replace(/^#/,'')),querySelectorAll:()=>[],getElementById:id=>elements.get(id)||null,addEventListener(){},createElement:tag=>el(tag),body:{appendChild(){}}};
 class FixedDate extends Date{constructor(...args){super(...(args.length?args:[clock]));if(!args.length&&tick)clock=new Date(Date.parse(clock)+tick).toISOString();}static now(){const result=Date.parse(clock);if(tick)clock=new Date(result+tick).toISOString();return result;}}
 const context=vm.createContext({document,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>{if(failWrites)throw Error('Quota exceeded');storage.set(k,String(v));},removeItem:k=>storage.delete(k)},window:{},confirm:()=>{if(beforeConfirm)beforeConfirm();return confirmed;},Date:FixedDate,console,Intl,Blob,URL,setTimeout(){},clearTimeout(){},innerWidth:1200});
 const access=require('./fixtures/staff-session.cjs')(context);
 vm.runInContext(script,context);
 const run=code=>vm.runInContext(code,context);
 run("render=()=>{};renderPatientDetail=()=>{};closeModal=()=>{};session=testStaffSession('admin');");
 return {run,context,access,el,storage,failWrites:value=>failWrites=value,confirm:value=>confirmed=value,setDate:value=>clock=value,onConfirm:fn=>beforeConfirm=fn,advanceEachDate:value=>tick=value};
}
function setup(base='global',frequency='monthly'){
 const r=runtime();
 r.run(`var p=db.patients.find(p=>p.id==='APP-PUL-1015');selectedPatientId=p.id;p.offer.interestCalculationBase='${base}';p.application.interestCalculationBase='${base}';p.offer.paymentFrequency='${frequency}';p.application.paymentFrequency='${frequency}';p.contract={signedAt:'2026-06-16'};p.application.dispersionDate='2026-06-16';p.application.disbursedAt='2026-06-16';p.application.amortizationStatus='active';p.paymentSchedule=[];dispersionEnsureSchedule(p);persist();var row=dispersionBuildSchedule(p).find(row=>dispersionExtensionEligibility(row,p).ok);var quote=dispersionExtensionPreview(row,p,15);`);
 for(const [id,value] of Object.entries({extensionDays:15,extensionAmountReceived:r.run('quote.totalRequired'),extensionReference:'INDEPENDENT-EXTENSION',extensionMethod:'SPEI',extensionNote:'Fictitious regression payment'}))r.el(id).value=String(value);
 return r;
}
function authorize(r){return r.run("var approval=dispersionAuthorizeExtension(row.id,15,'Fictitious independent authorization');approval");}
function apply(r){return r.run('dispersionApplyExtension(row.id)');}
const read=(r,code)=>JSON.parse(r.run('JSON.stringify('+code+')'));
const patientState=r=>r.run('JSON.stringify(db.patients)');
const dbState=r=>r.run('JSON.stringify(db)');
let count=0,failures=[];
function test(name,fn){try{fn();count++;console.log('PASS '+name);}catch(error){failures.push({name,error});console.error('FAIL '+name+'\n'+String(error.stack).slice(0,1000));}}

test('Every non-Admin role denies authorization without mutation',()=>{
 for(const role of ['operations','risk','portfolio','kam','leader','provider','readonly']){
  const r=setup();r.run(`session=testStaffSession('${role}')`);const before=dbState(r),stored=r.storage.get('pulzzo_backoffice_demo');
  assert.equal(authorize(r),false,role);assert.equal(dbState(r),before);assert.equal(r.storage.get('pulzzo_backoffice_demo'),stored);
 }
});
test('All payment-capable accounts need Admin authorization first',()=>{
 for(const role of ['admin','portfolio']){const r=setup();r.run(`session=testStaffSession('${role}')`);const before=dbState(r);assert.equal(apply(r),false);assert.equal(dbState(r),before);}
});
test('Operations and Risk cannot apply even an authorized exact quote',()=>{
 for(const role of ['operations','risk','kam','leader','provider','readonly']){const r=setup();assert.ok(authorize(r));r.run(`session=testStaffSession('${role}')`);const before=dbState(r);assert.equal(apply(r),false);assert.equal(dbState(r),before);}
});
test('Quotes and authorization preserve patients, balances, schedules and receipts exactly',()=>{
 const r=setup(),before=patientState(r);r.run('dispersionExtensionPreview(row,p,15);dispersionExtensionPreview(row,p,30);dispersionExtensionSectionHtml(p,row)');assert.equal(patientState(r),before);
 const beforeRecords=read(r,'db.patients');assert.ok(authorize(r));const afterRecords=read(r,'db.patients');
 const changed=afterRecords.find(item=>item.id===r.run('p.id')),old=beforeRecords.find(item=>item.id===changed.id);
 assert.equal(changed.extensionAuthorizations.length,1);assert.equal(changed.timeline[0].action,'Prórroga autorizada por Admin');assert.equal(changed.timeline[0].actorId,'admin_demo');
 delete changed.extensionAuthorizations;changed.timeline.shift();assert.deepEqual(afterRecords,beforeRecords);
 assert.ok(r.run("db.audit.some(event=>event.actorId==='admin_demo')"));
});
for(const base of ['global','outstanding_balance'])for(const frequency of ['monthly','biweekly'])test(`Authorized Portfolio payment preserves exact existing math ${base}/${frequency}`,()=>{
 const r=setup(base,frequency),q=read(r,'quote'),capitalBefore=r.run('p.paymentSchedule.reduce((sum,r)=>sum+r.capitalPending,0)');assert.ok(authorize(r));r.run("session=testStaffSession('portfolio')");assert.equal(apply(r),true);
 const movement=read(r,'p.payments.at(-1)'),changed=read(r,'p.paymentSchedule.find(r=>r.id===row.id)');
 assert.equal(movement.actorId,'portfolio_demo');assert.equal(movement.amountReceived,q.totalRequired);assert.equal(movement.totalApplied,q.totalRequired);assert.equal(movement.unappliedAmount,0);
 assert.equal(movement.allocations.some(a=>a.concept==='capital'),false);
 assert.equal(Math.round(movement.allocations.reduce((sum,a)=>sum+a.amount,0)*100),Math.round(q.totalRequired*100));
 assert.equal(changed.capitalPending,q.capitalDeferred);assert.equal(changed.currentDueDate,q.newDueDate);
 assert.equal(Math.round(r.run('p.paymentSchedule.reduce((sum,r)=>sum+r.capitalPending,0)')*100),Math.round(capitalBefore*100));
 assert.equal(q.extensionFee,Math.round(Math.max(300,q.capitalDeferred*.03)*100)/100);assert.equal(q.extensionFeeVat,Math.round(q.extensionFee*.16*100)/100);
});
test('Confirmation cancellation leaves approval available and all credit state intact',()=>{
 const r=setup();assert.ok(authorize(r));r.run("session=testStaffSession('portfolio')");const before=dbState(r);r.confirm(false);assert.equal(apply(r),false);assert.equal(dbState(r),before);r.confirm(true);assert.equal(apply(r),true);
});
test('Wrong amount or reference cannot consume authorization',()=>{
 for(const amount of [0,1,-1,NaN,Infinity]){const r=setup();assert.ok(authorize(r));r.el('extensionAmountReceived').value=String(amount);const before=dbState(r);assert.equal(apply(r),false);assert.equal(dbState(r),before);r.el('extensionAmountReceived').value=String(r.run('quote.totalRequired'));assert.equal(apply(r),true);}
 for(const change of ['subcent','over','missingReference']){const r=setup();assert.ok(authorize(r));if(change==='missingReference')r.el('extensionReference').value='';else r.el('extensionAmountReceived').value=String(r.run('quote.totalRequired')+(change==='subcent'?.001:.01));const before=dbState(r);assert.equal(apply(r),false);assert.equal(dbState(r),before);}
});
test('Business-date change requires a fresh exact authorization',()=>{
 const r=setup();assert.ok(authorize(r));r.setDate('2026-10-08T12:00:00Z');const before=dbState(r);assert.equal(apply(r),false);assert.equal(dbState(r),before);assert.ok(authorize(r));assert.equal(apply(r),true);
});
test('Changing permitted days cannot reuse another quote authorization',()=>{
 const r=setup();assert.ok(authorize(r));r.el('extensionDays').value='30';r.el('extensionAmountReceived').value=String(r.run('dispersionExtensionPreview(row,p,30).totalRequired'));const before=dbState(r);assert.equal(apply(r),false);assert.equal(dbState(r),before);
});
test('A rule version change requires fresh authorization even at identical price',()=>{
 const r=setup();assert.ok(authorize(r));r.run("var priorRules=dispersionFinancialRules(p);configResolveRules=()=>({...priorRules,versionId:'independent-new-rule-version'})");const before=dbState(r);assert.equal(apply(r),false);assert.equal(dbState(r),before);assert.ok(authorize(r));assert.equal(apply(r),true);
});
test('A real intervening receipt invalidates the previously authorized quote',()=>{
 const r=setup();assert.ok(authorize(r));assert.equal(r.run("dispersionApplyPayment({creditId:p.id,amount:1,type:'ordinary',date:'2026-10-07',reference:'INTERVENING-RECEIPT',method:'SPEI',target:'auto'},{quiet:true})"),true);const before=dbState(r);assert.equal(apply(r),false);assert.equal(dbState(r),before);
});
test('Approval cannot cross installments or patients',()=>{
 const r=setup();assert.ok(authorize(r));r.run('var other=dispersionBuildSchedule(p).find(r=>r.id!==row.id&&dispersionExtensionEligibility(r,p).ok)');assert.ok(r.run('other'));r.el('extensionAmountReceived').value=String(r.run('dispersionExtensionPreview(other,p,15).totalRequired'));const before=dbState(r);assert.equal(r.run('dispersionApplyExtension(other.id)'),false);assert.equal(dbState(r),before);
 r.run("var original=p;var p2=JSON.parse(JSON.stringify(p));p2.id='INDEPENDENT-OTHER-CREDIT';db.patients.push(p2);selectedPatientId=p2.id;persist()");r.el('extensionAmountReceived').value=String(r.run('quote.totalRequired'));const beforeOther=dbState(r);assert.equal(apply(r),false);assert.equal(dbState(r),beforeOther);
});
test('Authorization write failure leaves no partial evidence or patient mutation',()=>{
 const r=setup(),before=dbState(r),stored=r.storage.get('pulzzo_backoffice_demo');r.failWrites(true);assert.equal(authorize(r),false);assert.equal(dbState(r),before);assert.equal(r.storage.get('pulzzo_backoffice_demo'),stored);r.failWrites(false);assert.ok(authorize(r));assert.equal(apply(r),true);
});
test('Payment write failure rolls back and preserves the unspent authorization',()=>{
 const r=setup();assert.ok(authorize(r));r.run("session=testStaffSession('portfolio')");const before=dbState(r),stored=r.storage.get('pulzzo_backoffice_demo');r.failWrites(true);assert.equal(apply(r),false);assert.equal(dbState(r),before);assert.equal(r.storage.get('pulzzo_backoffice_demo'),stored);r.failWrites(false);assert.equal(apply(r),true);
});
test('Approval and payment reject stale cross-tab state without overwriting it',()=>{
 for(const stage of ['approval','payment']){const r=setup();if(stage==='payment')assert.ok(authorize(r));const before=dbState(r),external=JSON.parse(r.storage.get('pulzzo_backoffice_demo'));external.externalMarker='keep';const stored=JSON.stringify(external);r.storage.set('pulzzo_backoffice_demo',stored);assert.equal(stage==='approval'?authorize(r):apply(r),false);assert.equal(dbState(r),before);assert.equal(r.storage.get('pulzzo_backoffice_demo'),stored);}
});
test('Successful extension is single-use and reversal does not revive its approval',()=>{
 const r=setup();assert.ok(authorize(r));r.run("session=testStaffSession('portfolio')");assert.equal(apply(r),true);const after=dbState(r);assert.equal(apply(r),false);assert.equal(dbState(r),after);r.run("session=testStaffSession('admin');var extensionReceipt=p.payments.at(-1);var immutableReceipt=JSON.stringify(extensionReceipt)");assert.equal(r.run("dispersionReverseReceipt(p.id,extensionReceipt.receiptId,'Correct fictitious receipt')"),true);assert.equal(r.run('JSON.stringify(extensionReceipt)'),r.run('immutableReceipt'));
 const reversed=dbState(r);r.el('extensionReference').value='NEW-REFERENCE-AFTER-REVERSAL';assert.equal(apply(r),false);assert.equal(dbState(r),reversed);assert.ok(authorize(r));assert.equal(apply(r),true);
});
for(const concept of ['commission','moratoryNonInterest','ordinaryNonInterest'])test(`Unresolved ${concept} keeps reconciliation blocker without automatic deferral`,()=>{
 const r=setup();r.run(`var raw=p.paymentSchedule.find(r=>r.id===row.id);raw.${concept}=100;dispersionRecalculateRowTotals(raw);persist()`);const before=dbState(r);assert.equal(authorize(r),false);assert.equal(apply(r),false);assert.equal(dbState(r),before);assert.match(r.el('toast').textContent,/Revisión contable|conciliar/);
});


function captureReadyPayment(r){
 r.run('var realCommitReceipt=dispersionCommitReceipt;var capturedTx;dispersionCommitReceipt=tx=>{capturedTx=tx;return false;}');
 assert.equal(apply(r),false);r.run('dispersionCommitReceipt=realCommitReceipt');assert.ok(r.run('capturedTx'));
}
test('Approval copies cannot rewrite the persisted quote or historical actor',()=>{
 const r=setup();assert.ok(authorize(r));const before=dbState(r);r.run("approval.actorId='forged_admin';approval.quote.totalRequired=1;approval.fingerprint='forged'");assert.equal(dbState(r),before);
 r.run("session=testStaffSession('portfolio')");assert.equal(apply(r),true);assert.equal(r.run('p.payments.at(-1).extensionAuthorizedById'),'admin_demo');assert.equal(r.run('p.payments.at(-1).actorId'),'portfolio_demo');assert.equal(r.run('p.extensionAuthorizationUses.at(-1).actorId'),'portfolio_demo');
});
test('Authorization remains immutable after approver or payer display-name changes',()=>{
 const r=setup(),admin=r.run('session');assert.ok(authorize(r));const historical=read(r,'p.extensionAuthorizations');r.access.updateUser(admin,'portfolio_demo',{name:'Renamed portfolio'});r.run("session=testStaffSession('portfolio')");assert.equal(apply(r),true);const receipt=read(r,'p.payments.at(-1)');r.access.updateUser(admin,'admin_demo',{name:'Renamed admin'});assert.deepEqual(read(r,'p.extensionAuthorizations'),historical);assert.deepEqual(read(r,'p.payments.at(-1)'),receipt);assert.equal(receipt.extensionAuthorizedById,'admin_demo');assert.equal(receipt.actorId,'portfolio_demo');
});
test('Direct begin service denies absent authorization regardless of actor privilege',()=>{
 for(const role of ['admin','portfolio','operations','risk']){const r=setup();r.run(`session=testStaffSession('${role}')`);const before=dbState(r);assert.equal(r.run("dispersionBeginReceipt(p,quote.totalRequired,'2026-10-07','DIRECT','SPEI',{extension:true,extensionRowId:row.id,extensionDays:15})"),null);assert.equal(dbState(r),before);}
});
test('No-approval regular receipt transaction cannot be relabeled as extension',()=>{
 const r=setup();r.run("var tx=dispersionBeginReceipt(p,quote.totalRequired,'2026-10-07','DIRECT-FORGE','SPEI');var baseline=JSON.stringify(db);p.payments=p.payments||[];p.payments.push({paymentType:'extension',rowId:row.id,totalApplied:quote.totalRequired,interestCovered:quote.interestPending,ivaInterestCovered:quote.ivaInterestPending,moratoryCovered:quote.moratoryPending,ivaMoratoryCovered:quote.ivaMoratoryPending,extensionFee:quote.extensionFee,extensionFeeVat:quote.extensionFeeVat})");assert.equal(r.run('dispersionCommitReceipt(tx)'),false);assert.equal(dbState(r),r.run('baseline'));
});
test('A manufactured commit transaction cannot poison state via rollback snapshots',()=>{
 const r=setup(),before=dbState(r),stored=r.storage.get('pulzzo_backoffice_demo');r.run("var forgedDb=JSON.parse(JSON.stringify(db));forgedDb.injectedByCounterfeitRollback=true;var counterfeit={patient:p,before:JSON.parse(JSON.stringify(p)),dbBefore:JSON.stringify(forgedDb),actorId:session.id,sessionId:session.sessionId,storageBefore:dispersionLedgerStorageVersion,amount:1,date:'2026-10-07',reference:'FAKE-TX',method:'SPEI'};counterfeit.before.offer.annualInterestRate=999");assert.equal(r.run('dispersionCommitReceipt(counterfeit)'),false);assert.equal(dbState(r),before);assert.equal(r.storage.get('pulzzo_backoffice_demo'),stored);
});
for(const [label,change] of [
 ['amount',"capturedTx.amount=1"],
 ['original snapshot',"capturedTx.before.paymentSchedule[0].capital=1"],
 ['rollback snapshot',"var forged=JSON.parse(capturedTx.dbBefore);forged.injectedByCounterfeitRollback=true;capturedTx.dbBefore=JSON.stringify(forged);p.payments.at(-1).extensionFee=1"],
 ['receipt total',"p.payments.at(-1).totalApplied=1"],
 ['fee split',"p.payments.at(-1).extensionFee+=.01;p.payments.at(-1).extensionFeeVat-=.01"],
 ['due date',"p.paymentSchedule.find(item=>item.id===row.id).currentDueDate='2030-01-01'"],
 ['deferred principal',"p.paymentSchedule.find(item=>item.id===row.id).capitalPending=0"],
 ['later installment',"p.paymentSchedule.at(-1).capital=0;p.paymentSchedule.at(-1).pendingAmount=0"],
 ['original approval',"p.extensionAuthorizations.at(-1).actorId='injected-approver'"],
 ['retained ledger',"p.payments.unshift({paymentType:'ordinary',amountReceived:999,receiptId:'FORGED-HISTORY'})"]
])test(`Genuine extension transaction rejects tampered ${label} and rolls back safely`,()=>{
 const r=setup();assert.ok(authorize(r));r.run("session=testStaffSession('portfolio')");const before=dbState(r),stored=r.storage.get('pulzzo_backoffice_demo');captureReadyPayment(r);r.run(change);assert.equal(r.run('dispersionCommitReceipt(capturedTx)'),false);assert.equal(dbState(r),before);assert.equal(r.storage.get('pulzzo_backoffice_demo'),stored);
});
test('Staff revocation during confirmation prevents application and approval consumption',()=>{
 const r=setup(),admin=r.run('session');assert.ok(authorize(r));r.run("session=testStaffSession('portfolio')");const before=dbState(r);r.onConfirm(()=>r.access.updateUser(admin,'portfolio_demo',{active:false}));assert.equal(apply(r),false);assert.equal(dbState(r),before);
});
test('Commit independently rejects a retained transaction after payer revocation',()=>{
 const r=setup(),admin=r.run('session');assert.ok(authorize(r));r.run("session=testStaffSession('portfolio')");const before=dbState(r);captureReadyPayment(r);r.access.updateUser(admin,'portfolio_demo',{active:false});assert.equal(r.run('dispersionCommitReceipt(capturedTx)'),false);assert.equal(dbState(r),before);
});


test('Valid authorized payment succeeds with a continuously advancing real-world clock',()=>{
 const r=setup();assert.ok(authorize(r));r.advanceEachDate(2);assert.equal(apply(r),true);
});
test('Direct rollback service ignores caller-invented snapshots',()=>{
 const r=setup(),before=dbState(r),stored=r.storage.get('pulzzo_backoffice_demo');r.run("var forgedDb=JSON.parse(JSON.stringify(db));forgedDb.injectedByCounterfeitRollback=true;var counterfeit={patient:p,before:JSON.parse(JSON.stringify(p)),dbBefore:JSON.stringify(forgedDb)};counterfeit.before.offer.annualInterestRate=999;dispersionRollbackReceipt(counterfeit)");assert.equal(dbState(r),before);assert.equal(r.storage.get('pulzzo_backoffice_demo'),stored);
});
test('An authorized extension ticket cannot be relabeled to skip authorization consumption',()=>{
 const r=setup();assert.ok(authorize(r));const before=dbState(r),stored=r.storage.get('pulzzo_backoffice_demo');captureReadyPayment(r);r.run("p.payments.at(-1).paymentType='commission_upfront'");assert.equal(r.run('dispersionCommitReceipt(capturedTx)'),false);assert.equal(dbState(r),before);assert.equal(r.storage.get('pulzzo_backoffice_demo'),stored);
});
test('Extension preview receipt path cannot mutate the authoritative credit',()=>{
 const r=setup();assert.ok(authorize(r));const before=dbState(r),stored=r.storage.get('pulzzo_backoffice_demo');r.run('var realBeginReceipt=dispersionBeginReceipt;dispersionBeginReceipt=(p,amount,date,reference,method,options={})=>realBeginReceipt(p,amount,date,reference,method,{...options,preview:true})');assert.equal(apply(r),false);assert.equal(dbState(r),before);assert.equal(r.storage.get('pulzzo_backoffice_demo'),stored);
});
test('An ordinary payment ticket cannot introduce an unauthorized date extension',()=>{
 const r=setup(),before=dbState(r),stored=r.storage.get('pulzzo_backoffice_demo');r.run("var realCommitReceipt=dispersionCommitReceipt;var capturedTx;dispersionCommitReceipt=tx=>{capturedTx=tx;return false;};dispersionApplyPayment({creditId:p.id,amount:100,type:'ordinary',date:'2026-10-07',reference:'DISGUISED-EXTENSION',method:'SPEI',target:'auto'},{quiet:true});dispersionCommitReceipt=realCommitReceipt;p.paymentSchedule[0].currentDueDate='2030-01-01';p.paymentSchedule[0].dueDate='2030-01-01';p.paymentSchedule[0].scheduledDate='2030-01-01'");assert.ok(r.run('capturedTx'));assert.equal(r.run('dispersionCommitReceipt(capturedTx)'),false);assert.equal(dbState(r),before);assert.equal(r.storage.get('pulzzo_backoffice_demo'),stored);
});


test('Repeated unchanged authorization is idempotent and preserves the original approval',()=>{
 const r=setup();const approval=authorize(r),before=dbState(r),stored=r.storage.get('pulzzo_backoffice_demo');assert.ok(approval);assert.equal(authorize(r).id,approval.id);assert.equal(dbState(r),before);assert.equal(r.storage.get('pulzzo_backoffice_demo'),stored);
});
test('Persisted unused authorization survives reload and is consumed exactly once',()=>{
 const r=setup();assert.ok(authorize(r));const saved=read(r,'p.extensionAuthorizations');const reload=runtime([...r.storage]);reload.run("var p=db.patients.find(p=>p.id==='APP-PUL-1015');selectedPatientId=p.id;var row=dispersionBuildSchedule(p).find(row=>dispersionExtensionEligibility(row,p).ok);var quote=dispersionExtensionPreview(row,p,15);session=testStaffSession('portfolio')");
 for(const [id,value] of Object.entries({extensionDays:15,extensionAmountReceived:reload.run('quote.totalRequired'),extensionReference:'RELOAD-EXTENSION',extensionMethod:'SPEI'}))reload.el(id).value=String(value);
 assert.deepEqual(read(reload,'p.extensionAuthorizations'),saved);assert.equal(apply(reload),true);assert.equal(reload.run('p.extensionAuthorizationUses.length'),1);
 const second=runtime([...reload.storage]);second.run("var p=db.patients.find(p=>p.id==='APP-PUL-1015');selectedPatientId=p.id;var row={id:p.extensionAuthorizations[0].rowId}");assert.equal(apply(second),false);assert.equal(second.run('p.extensionAuthorizationUses.length'),1);assert.equal(second.run("p.payments.filter(item=>item.paymentType==='extension').length"),1);
});
test('Extension simulation remains entirely read-only with missing schedule caches',()=>{
 const r=setup();r.run("delete p.paymentCalendarSignature;delete p.application.paymentCalendarSignature;delete p.offer.paymentCalendarSignature;delete p.paymentSchedule;persist()");const before=dbState(r),stored=[...r.storage];
 r.run("var q=dispersionExtensionQuote(p,row.id,15);dispersionExtensionPreview(row,p,15);dispersionExtensionSectionHtml(p,row);dispersionExtensionPreviewUpdate(row.id)");assert.equal(dbState(r),before);assert.deepEqual([...r.storage],stored);
});
test('Duplicate external payment references preserve the pending extension authorization',()=>{
 const r=setup();assert.ok(authorize(r));r.run("var another=db.patients.find(item=>item.id!==p.id);another.payments=another.payments||[];another.payments.push({paymentType:'ordinary',receiptId:'EXISTING-REF',reference:'INDEPENDENT-EXTENSION'});persist()");const before=dbState(r);assert.equal(apply(r),false);assert.equal(dbState(r),before);r.el('extensionReference').value='CORRECT-EXTENSION-REFERENCE';assert.equal(apply(r),true);
});

process.on('beforeExit',()=>{console.log(`${count} independent extension groups passed; ${failures.length} failed. Source/VM only; browser rendering unrun.`);if(failures.length)process.exitCode=1;});
