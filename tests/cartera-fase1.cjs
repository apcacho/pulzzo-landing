const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../backoffice.html'),'utf8');
const script=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m=>m[1].includes('const baseState='))[1];
function runtime(){
 let confirmResult=true;
 const elements=new Map();
 function el(id){if(!elements.has(id))elements.set(id,{id,value:'',dataset:{},style:{},innerHTML:'',textContent:'',checked:false,disabled:false,files:[],classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},focus(){},closest(){return null},querySelector(){return null},querySelectorAll(){return []}});return elements.get(id);}
 const storage=new Map();
 const document={querySelector:s=>el(String(s).replace(/^#/,'')),querySelectorAll(){return []},getElementById:id=>elements.get(id)||null,addEventListener(){},removeEventListener(){},createElement:tag=>el(tag),head:el('head'),body:{children:[],style:{},classList:{add(){},remove(){},toggle(){}},appendChild(node){elements.set(node.id,node);}}};
 const FixedDate=class extends Date {constructor(...a){super(...(a.length?a:['2026-10-07T12:00:00Z']));} static now(){return new Date('2026-10-07T12:00:00Z').getTime();}};
 const context=vm.createContext({document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},window:{addEventListener(){},scrollTo(){}},confirm:()=>confirmResult,Date:FixedDate,console,Intl,Blob,URL,setTimeout(){},clearTimeout(){},innerWidth:1200,FileReader:class{readAsDataURL(){this.onload&&this.onload();}}});
 require('./fixtures/staff-session.cjs')(context);
 vm.runInContext(script,context);
 vm.runInContext("render=()=>{};renderPatientDetail=()=>{};closeModal=()=>{};session=testStaffSession('admin');",context);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js/backoffice-configuration.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js/backoffice-portfolio.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js/backoffice-portfolio-payment.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js/backoffice-cartera-fase1.js'),'utf8'),context);
 const run=code=>vm.runInContext(code,context);
 return {run,el,storage,context,confirm:v=>{confirmResult=v;}};
}
let passed=0;function test(name,fn){fn();passed++;console.log('PASS: '+name);}
function dispersed(r,date){r.run(`var p=db.patients.find(p=>p.id==='APP-PUL-1015');selectedPatientId=p.id;p.application.dispersionDate=${JSON.stringify(date)};p.application.disbursedAt=${JSON.stringify(date)};p.application.amortizationStatus='active';p.paymentSchedule=[];p.payments=[];dispersionEnsureSchedule(p);persist();`);}

test('Prelación applies IVA, commissions, moratory interest, ordinary interest, then capital',()=>{
 const r=runtime();
 r.run(`var row={interest:100,interestPaid:0,interestIva:16,ivaInteresPaid:0,moratory:10,moratoryPaid:0,moratoryIva:1.6,ivaMoratorioPaid:0,commission:5,commissionPaid:0,moratoryNonInterest:3,moratoryNonInterestPaid:0,ordinaryNonInterest:2,ordinaryNonInterestPaid:0,capital:1000,capitalPaid:0,pendingAmount:1,status:'Vencido',currentDueDate:'2026-09-01'};`);
 const steps=[[16,'ivaInteresPaid'],[1.6,'ivaMoratorioPaid'],[5,'commissionPaid'],[10,'moratoryPaid'],[3,'moratoryNonInterestPaid'],[100,'interestPaid'],[2,'ordinaryNonInterestPaid'],[40,'capitalPaid']];
 let paid=0;
 for(const [amount,field] of steps){
  paid=Math.round((paid+amount)*100)/100;
  r.run(`dispersionApplyAmountToConcepts(row,${amount},'2026-10-07','PREL','SPEI')`);
  assert.equal(r.run(`row.${field}`),amount,field);
  assert.equal(r.run('row.paidAmount'),paid);
 }
 assert.equal(r.run('row.interestPaid'),100);
 assert.equal(r.run('row.capitalPaid'),40);
});

test('Oldest installment receives the payment before a newer one',()=>{
 const r=runtime();
 r.run(`var older={id:'old',interest:80,interestPaid:0,interestIva:16,ivaInteresPaid:0,capital:500,capitalPaid:0,currentDueDate:'2026-08-01',status:'Vencido'};var newer={id:'new',interest:80,interestPaid:0,interestIva:16,ivaInteresPaid:0,capital:500,capitalPaid:0,currentDueDate:'2026-09-01',status:'Vencido'};carteraAllocateOldestFirst([newer,older],16,'2026-10-07','OLD','SPEI');`);
 assert.equal(r.run('older.ivaInteresPaid'),16);
 assert.equal(r.run('older.interestPaid'),0);
 assert.equal(r.run('newer.ivaInteresPaid'),0);
 assert.equal(r.run('newer.interestPaid'),0);
 dispersed(r,'2026-01-01');
 r.run(`var rows=dispersionBuildSchedule(p).filter(row=>dispersionIsOrdinaryPayableRow(row,'2026-10-07')&&roundToCents(dispersionNumber(row.interestIva,0)-dispersionNumber(row.ivaInteresPaid,0))>0);var first=rows[0],second=rows[1],iva=roundToCents(dispersionNumber(first.interestIva,0)-dispersionNumber(first.ivaInteresPaid,0));var secondBefore=JSON.stringify(second);dispersionApplyPayment({creditId:p.id,type:'ordinary',amount:iva,date:'2026-10-07',reference:'IVA-OLDEST',method:'SPEI',target:'auto'},{quiet:true});var again=dispersionBuildSchedule(p);var paid=again.find(row=>row.id===first.id),next=again.find(row=>row.id===second.id);`);
 assert.equal(r.run('paid.ivaInteresPaid'),r.run('iva'));
 assert.equal(r.run('paid.interestPaid'),0);
 assert.equal(r.run('JSON.stringify(next)'),r.run('secondBefore'));
});

test('Duplicate warning uses amount, account, date and credit, and confirmation stores the payment',()=>{
 const r=runtime();dispersed(r,'2026-01-01');
 const pay=(amount,ref,cuenta,options='{quiet:true}')=>r.run(`var err='';var saved=dispersionApplyPayment({creditId:p.id,type:'ordinary',amount:${amount},date:'2026-10-07',reference:${JSON.stringify(ref)},method:'SPEI',target:'auto',cuenta:${JSON.stringify(cuenta)}},{...${options},onError:m=>{err=m}});saved`);
 assert.equal(pay(80,'REF-A','CTA-1'),true);
 r.confirm(false);
 assert.notEqual(pay(80,'REF-B','CTA-1'),true);
 assert.match(r.run('err'),/mismo monto/);
 assert.equal(r.run('p.payments.length'),1);
 r.confirm(true);
 assert.equal(pay(80,'REF-C','CTA-1'),true);
 assert.equal(r.run('p.payments.length'),2);
 r.confirm(false);
 assert.equal(pay(80,'REF-D','CTA-1','{quiet:true,confirmDuplicate:true}'),true);
 assert.equal(pay(90,'REF-A','CTA-1'),true);
 assert.equal(r.run("carteraFindDuplicate(db.patients.find(x=>x.id!==p.id),80,'CTA-1','2026-10-07')"),null);
 assert.equal(r.run("p.payments.filter(m=>String(m.reference).toLowerCase()==='ref-a').length"),2);
});

test('IVA version changes unpaid future rows and keeps booked IVA',()=>{
 const r=runtime();dispersed(r,'2026-01-01');
 r.run(`var rows=dispersionBuildSchedule(p);var past=rows.find(row=>String(row.currentDueDate||row.dueDate)<'2026-10-07'&&dispersionNumber(row.interest,0)>0&&!dispersionNumber(row.paidAmount,0));var future=rows.find(row=>String(row.currentDueDate||row.dueDate)>='2026-10-07'&&dispersionNumber(row.interest,0)>0&&!dispersionNumber(row.paidAmount,0));var pastIva=past.interestIva,futureInterest=future.interest,pastId=past.id,futureId=future.id;var payable=rows.find(row=>row.id!==past.id&&dispersionIsOrdinaryPayableRow(row,'2026-10-07'));dispersionApplyPayment({creditId:p.id,type:'ordinary',amount:payable.pendingAmount,date:'2026-10-07',reference:'IVA-BOOKED',method:'SPEI',target:payable.id},{quiet:true});var bookedId=payable.id,bookedIva=p.paymentSchedule.find(row=>row.id===bookedId).interestIva,allocation=JSON.stringify(p.payments.at(-1).allocations);var change={patch:{ivaRate:.08},scope:'existing_new',effectiveDate:today(),authorized:true,authorizationReference:'IVA cartera'};var preview=configPreviewChange(change);var saved=configSaveChange(change,preview.revision,preview.token);var again=dispersionBuildSchedule(p);`);
 assert.equal(r.run('saved.ok'),true);
 assert.equal(r.run('pastIva'),r.run('roundToCents(past.interest*.16)'));
 assert.equal(r.run('again.find(row=>row.id===pastId).interestIva'),r.run('pastIva'));
 assert.equal(r.run('again.find(row=>row.id===futureId).interestIva'),r.run('roundToCents(futureInterest*.08)'));
 assert.equal(r.run('again.find(row=>row.id===bookedId).interestIva'),r.run('bookedIva'));
 assert.equal(r.run('JSON.stringify(p.payments.find(m=>m.reference==="IVA-BOOKED").allocations)'),r.run('allocation'));
 const off=runtime();dispersed(off,'2026-01-01');
 off.run(`var future=dispersionBuildSchedule(p).find(row=>String(row.currentDueDate||row.dueDate)>='2026-10-07'&&dispersionNumber(row.interest,0)>0);var change={patch:{ivaEnabled:false},scope:'existing_new',effectiveDate:today(),authorized:true,authorizationReference:'Sin IVA'};var preview=configPreviewChange(change);configSaveChange(change,preview.revision,preview.token);var row=dispersionBuildSchedule(p).find(item=>item.id===future.id);`);
 assert.equal(off.run('row.interestIva'),0);
});

test('Preventive extension uses cola final, records the audit and stops at three',()=>{
 const r=runtime();dispersed(r,'2026-10-07');
 r.run(`session=testStaffSession('portfolio');var before=JSON.stringify(db);var preview=carteraPreviewExtension(p,{modality:'COLA_FINAL'});`);
 assert.equal(r.run('JSON.stringify(db)'),r.run('before'));
 assert.equal(r.run('preview.ok'),true);
 assert.equal(r.run('preview.modality'),'COLA_FINAL');
 r.run(`var sourceRow=p.paymentSchedule.find(row=>row.id===preview.audit.rowId);var sourceBefore=carteraCapitalPending(sourceRow);var last=carteraOpenRows(p.paymentSchedule).filter(row=>row.id!==sourceRow.id).sort((a,b)=>String(a.currentDueDate||a.dueDate).localeCompare(String(b.currentDueDate||b.dueDate))).at(-1);var lastBefore=carteraCapitalPending(last);var applied=carteraApplyExtension(p,{modality:'COLA_FINAL',reference:'EXT-1'});var source=p.paymentSchedule.find(row=>row.id===applied.audit.rowId);var lastAfter=p.paymentSchedule.find(row=>row.id===last.id);`);
 assert.equal(r.run('applied.ok'),true);
 assert.equal(r.run('carteraCapitalPending(source)'),0);
 assert.ok(r.run('carteraCapitalPending(lastAfter)')>r.run('lastBefore'));
 assert.equal(r.run('applied.audit.count'),1);
 assert.equal(r.run('applied.audit.modality'),'COLA_FINAL');
 assert.ok(r.run('applied.audit.extendedDue>applied.audit.originalDue'));
 assert.ok(r.run('applied.audit.fee>0'));
 assert.ok(r.run('applied.audit.interestPaid>0'));
 assert.equal(r.run('p.application.preventiveExtensions.length'),1);
 assert.equal(r.run('sourceBefore>0'),true);
 r.run(`var second=carteraApplyExtension(p,{modality:'COLA_FINAL',reference:'EXT-2'});var third=carteraApplyExtension(p,{modality:'COLA_FINAL',reference:'EXT-3'});var fourth=carteraApplyExtension(p,{modality:'COLA_FINAL',reference:'EXT-4'});`);
 assert.equal(r.run('second.ok&&third.ok'),true);
 assert.equal(r.run('fourth.ok'),false);
 assert.match(r.run('fourth.error'),/reestructura/);
 assert.equal(r.run('p.application.preventiveExtensions.length'),3);
 r.run(`var splitBefore=JSON.stringify(db);var split=carteraPreviewExtension(p,{modality:'PRORRATEADO'});`);
 assert.equal(r.run('split.ok'),false);
 assert.equal(r.run('JSON.stringify(db)'),r.run('splitBefore'));
});

test('Prorrated extension spreads deferred capital before the credit reaches the limit',()=>{
 const r=runtime();dispersed(r,'2026-10-07');
 r.run(`session=testStaffSession('portfolio');var preview=carteraPreviewExtension(p,{modality:'PRORRATEADO'});var targets=carteraOpenRows(p.paymentSchedule).filter(row=>row.id!==preview.audit.rowId);var before=targets.map(row=>carteraCapitalPending(row));var applied=carteraApplyExtension(p,{modality:'PRORRATEADO',reference:'EXT-PRO'});var after=targets.map(row=>carteraCapitalPending(p.paymentSchedule.find(item=>item.id===row.id)));`);
 assert.equal(r.run('applied.ok'),true);
 assert.equal(r.run('applied.audit.modality'),'PRORRATEADO');
 assert.equal(r.run('carteraCapitalPending(p.paymentSchedule.find(row=>row.id===applied.audit.rowId))'),0);
 assert.ok(r.run('after.filter((value,index)=>value>before[index]).length>=2'));
});

test('Prepago reduce plazo keeps the engine effect and records before and after balances',()=>{
 const r=runtime();dispersed(r,'2026-01-01');
 r.run(`session=testStaffSession('portfolio');var due=dispersionBuildSchedule(p).filter(row=>dispersionIsOrdinaryPayableRow(row,'2026-10-07')).reduce((sum,row)=>sum+dispersionNumber(row.pendingAmount,0),0);var amount=roundToCents(due+40000);var previewBefore=JSON.stringify(db);var preview=carteraPreviewPrepay(p,{modality:'reduce_plazo',amount:amount,date:'2026-10-07',reference:'PRE-VISTA',method:'SPEI',preview:true});`);
 assert.equal(r.run('JSON.stringify(db)'),r.run('previewBefore'));
 assert.equal(r.run('preview.ok'),true);
 r.run(`var result=carteraApplyPrepay(p,{modality:'reduce_plazo',amount:amount,date:'2026-10-07',reference:'PRE-1',method:'SPEI'});`);
 assert.equal(r.run('result.ok'),true);
 assert.equal(r.run('result.prepayModality'),'reduce_plazo');
 assert.equal(r.run('result.effect'),'reduce_term');
 assert.ok(r.run('result.periodsAfter<result.periodsBefore'));
 assert.ok(r.run('result.balanceAfter<result.balanceBefore'));
 assert.ok(r.run('result.appliedToCapital>0'));
 assert.equal(r.run('p.payments.at(-1).prepayModality'),'reduce_plazo');
 assert.equal(r.run('p.application.prepayEvents.at(-1).balanceBefore'),r.run('result.balanceBefore'));
 const cuota=runtime();dispersed(cuota,'2026-01-01');
 cuota.run(`session=testStaffSession('portfolio');var result=carteraApplyPrepay(p,{modality:'reduce_cuota',amount:8000,date:'2026-10-07',reference:'CUOTA-1',method:'SPEI'});`);
 assert.equal(cuota.run('result.ok'),true);
 assert.equal(cuota.run('result.periodsAfter'),cuota.run('result.periodsBefore'));
 assert.ok(cuota.run('result.balanceAfter<result.balanceBefore'));
 const settled=runtime();dispersed(settled,'2026-01-01');
 settled.run(`session=testStaffSession('portfolio');var result=carteraApplyPrepay(p,{modality:'liquidacion_total',date:'2026-10-07',reference:'LIQ-1',method:'SPEI'});`);
 assert.equal(settled.run('result.ok'),true);
 assert.equal(settled.run('result.balanceAfter'),0);
 assert.ok(settled.run('result.balanceBefore>0'));
 assert.equal(settled.run('dispersionIsCreditLiquidated(p)'),true);
 assert.equal(settled.run('p.payments.at(-1).prepayModality'),'liquidacion_total');
});

test('Restructure A capitalizes recognized debt, B keeps mora aside, and portfolio cannot apply it',()=>{
 const r=runtime();dispersed(r,'2026-01-01');
 r.run(`var row=p.paymentSchedule.find(item=>dispersionNumber(item.capital,0)>0);row.moratory=100;row.moratoryPending=100;row.moratoryPaid=0;row.moratoryIva=16;row.ivaMoratorioPending=16;row.ivaMoratorioPaid=0;row.commission=50;row.commissionPending=50;row.commissionPaid=0;var schedule=JSON.stringify(p.paymentSchedule);session=testStaffSession('portfolio');var denied=carteraApplyRestructure(p,{option:'A',termMonths:6,annualRate:36});`);
 assert.equal(r.run('denied.ok'),false);
 assert.match(r.run('denied.error'),/administrador/);
 assert.equal(r.run('JSON.stringify(p.paymentSchedule)'),r.run('schedule'));
 assert.equal(r.run('!!p.application.restructured'),false);
 r.run(`session=testStaffSession('admin');var optionA=carteraPreviewRestructure(p,{option:'A',termMonths:6,annualRate:36});var optionB=carteraPreviewRestructure(p,{option:'B',termMonths:6,annualRate:36});`);
 assert.equal(r.run('optionA.components.moratory'),100);
 assert.equal(r.run('optionB.separated.moratory'),100);
 assert.ok(r.run('optionA.newBalance>optionB.newBalance'));
 r.run(`var appliedB=carteraApplyRestructure(p,{option:'B',termMonths:6,annualRate:36,reference:'RE-B'});var charge=p.paymentSchedule.find(item=>item.id==='restructure-cargos');`);
 assert.equal(r.run('appliedB.ok'),true);
 assert.equal(r.run('p.application.restructured'),true);
 assert.equal(r.run('charge.moratory'),100);
 assert.ok(r.run('charge.commission>=50'));
 assert.equal(r.run('appliedB.audit.option'),'B');
 const a=runtime();dispersed(a,'2026-01-01');
 a.run(`var row=p.paymentSchedule.find(item=>dispersionNumber(item.capital,0)>0);row.moratory=100;row.moratoryPending=100;row.commission=50;row.commissionPending=50;var applied=carteraApplyRestructure(p,{option:'A',termMonths:6,annualRate:36});`);
 assert.equal(a.run('applied.ok'),true);
 assert.equal(a.run("p.paymentSchedule.some(item=>item.id==='restructure-cargos')"),false);
 assert.equal(a.run('p.application.restructured'),true);
 assert.ok(a.run('applied.audit.newBalance>applied.audit.components.capital'));
 const plain=runtime();dispersed(plain,'2026-01-01');
 plain.run(`p.paymentSchedule[0].dpd=40;p.paymentSchedule[0].status='Vencido';dispersionBuildSchedule(p);`);
 assert.equal(plain.run('!!p.application.restructured'),false);
});

test('Existing extension requires motivo and shows pending commission plus IVA',()=>{
 const r=runtime();dispersed(r,'2026-01-01');
 r.run(`var row=dispersionBuildSchedule(p).find(item=>dispersionExtensionEligibility(item,p).ok);row.commission=200;row.commissionPending=200;row.commissionPaid=0;session=testStaffSession('portfolio');var blocked=dispersionExtensionEligibility(row,p);`);
 assert.equal(r.run('blocked.ok'),false);
 assert.equal(r.run('blocked.commissionPending'),200);
 assert.equal(r.run('blocked.commissionIva'),32);
 assert.match(r.run('blocked.message'),/IVA/);
 assert.match(r.run('blocked.message'),/administrador/);
 r.run(`session=testStaffSession('admin');var allowed=dispersionExtensionEligibility(row,p);var html=dispersionExtensionSectionHtml(p,row);`);
 assert.equal(r.run('allowed.ok'),true);
 assert.match(r.run('allowed.message'),/IVA/);
 assert.match(r.run('html'),/>Motivo</);
 assert.doesNotMatch(r.run('html'),/Motivo \(opcional\)/);
 assert.match(r.run('html'),/IVA/);
 assert.match(r.run('html'),/id="extensionNote"[^>]*required/);
});

test('Portfolio screen and payment drawer expose the fase 1 choices without radio controls',()=>{
 const r=runtime();dispersed(r,'2026-01-01');
 const html=r.run('carteraPanelHtml(p)');
 assert.match(html,/Pago normal/);assert.match(html,/Prepago/);assert.match(html,/Extensión/);assert.match(html,/Reestructura/);assert.match(html,/cartera-choices-ops/);assert.match(html,/cartera-choice/);
 assert.doesNotMatch(html,/type="radio"/);
 const choices=r.run(`configChoice('preventiveExtensionModality','Modalidad','COLA_FINAL',[['COLA_FINAL','Cola final'],['PRORRATEADO','Prorrateado']],false)`);
 assert.match(choices,/cartera-choice/);assert.doesNotMatch(choices,/type="radio"/);
 r.run(`portfolioPaymentSession={creditId:p.id,comprobante:{name:'ticket.png',dataUrl:'data:image/png;base64,abc'}};`);
 r.el('portfolioPaymentAmount').value='10';r.el('portfolioPaymentType').value='ordinary';r.el('portfolioPaymentDate').value='2026-10-07';r.el('portfolioPaymentReference').value='REF';r.el('portfolioPaymentMethod').value='SPEI';r.el('portfolioPaymentTarget').value='auto';r.el('portfolioPaymentCuenta').value='001';r.el('portfolioPaymentOrigen').value='Efectivo';
 assert.equal(r.run('portfolioPaymentInput().cuenta'),'001');
 assert.equal(r.run('portfolioPaymentInput().origen'),'Efectivo');
 assert.equal(r.run('portfolioPaymentInput().comprobante.name'),'ticket.png');
 r.run(`dispersionApplyPayment({creditId:p.id,type:'ordinary',amount:25,date:'2026-10-07',reference:'EVIDENCIA',method:'SPEI',target:'auto',cuenta:'001',origen:'Depósito',comprobante:{name:'foto.jpg',dataUrl:'data:image/jpeg,abc'}},{quiet:true});`);
 assert.equal(r.run('p.payments.at(-1).cuenta'),'001');
 assert.equal(r.run('p.payments.at(-1).origen'),'Depósito');
 assert.equal(r.run('p.payments.at(-1).comprobanteName'),'foto.jpg');
 assert.equal(r.run('p.payments.at(-1).comprobante'),'data:image/jpeg,abc');
 const drawer=fs.readFileSync(path.join(__dirname,'../assets/js/backoffice-portfolio-payment.js'),'utf8');
 assert.match(drawer,/Comprobante \(opcional\)/);assert.match(drawer,/Origen \(opcional\)/);assert.match(drawer,/getElementById\('portfolioPayment'\+suffix\)\?\.addEventListener/);
});

test('Solicitudes dispersion tab renders the compact phase table',()=>{
 const r=runtime();
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js/pulzzo-v1.js'),'utf8')+'\n;globalThis.PulzzoV1=globalThis.PulzzoV1||window.PulzzoV1;',r.context);
 const html=r.run(`patientTabContent(db.patients.find(p=>p.id==='APP-PUL-1001'),'dispersion')`);
 assert.match(html,/<table class="v1-phase-table"/);
 assert.match(html,/data-v1-phase-total>/);
 assert.match(html,/>Liberar</);
 assert.match(html,/Contrato pendiente de validación legal/);
 assert.match(html,/financial-breakdown-note/);
 assert.doesNotMatch(html,/Liberar fase/);
 assert.match(r.run('String(renderDispersionTab)'),/phasePanelHtml/);
});

console.log(`PASS: ${passed} cartera fase 1 groups.`);
