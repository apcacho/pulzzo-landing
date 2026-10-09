const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../backoffice.html'),'utf8');
const script=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m=>m[1].includes('const baseState='))[1];
function runtime(saved){
 let failWrites=false, confirmResult=true;
 const elements=new Map();
 function el(id){if(!elements.has(id))elements.set(id,{id,value:'',dataset:{},style:{},innerHTML:'',textContent:'',checked:false,disabled:false,files:[],isConnected:true,tagName:'DIV',focus(){document.activeElement=this},remove(){this.isConnected=false;elements.delete(this.id)},contains(x){return x===this},classList:{add(){},remove(){},toggle(){},contains(){return false}},querySelector(){return null},querySelectorAll(){return []},addEventListener(){},setAttribute(){},scrollIntoView(){}});return elements.get(id)}
 const storage=new Map(saved||[]);
 const document={querySelector:s=>el(s.replace(/^#/,'')),querySelectorAll:s=>s==='.offer-procedure-card'?[...elements.values()].filter(x=>/^offerProcCard\d+$/.test(x.id)):[],getElementById:id=>elements.get(id)||null,addEventListener(){},removeEventListener(){},activeElement:null,createElement:tag=>el(tag),body:{children:[],style:{},classList:{add(){},remove(){},toggle(){}},appendChild(node){elements.set(node.id,node);document.body.children.push(node)}}};
 const FixedDate=class extends Date {constructor(...a){super(...(a.length?a:['2026-10-07T12:00:00Z']))} static now(){return new Date('2026-10-07T12:00:00Z').getTime()}};
 const context=vm.createContext({document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(failWrites)throw new Error('Quota exceeded');storage.set(k,String(v))},removeItem:k=>storage.delete(k)},window:{addEventListener(){},scrollTo(){},scrollY:0},confirm:()=>confirmResult,Date:FixedDate,console,Intl,Blob,URL,setTimeout(){},clearTimeout(){},innerWidth:1200});
 vm.runInContext(script,context);
 const run=code=>vm.runInContext(code,context);
 // No browser rendering is simulated: preserve real calculations/handlers, suppress repaint only.
 run("render=()=>{};renderPatientDetail=()=>{};closeModal=()=>{};session=users.find(x=>x.role==='admin');");
 run(fs.readFileSync(path.join(__dirname,'../assets/js/backoffice-portfolio.js'),'utf8'));
 run(fs.readFileSync(path.join(__dirname,'../assets/js/backoffice-portfolio-payment.js'),'utf8'));
 return {run,el,storage,failWrites:(v)=>failWrites=v,confirm:(v)=>confirmResult=v};
}

let passed=0;function test(name,fn){fn();passed++;console.log('PASS: '+name)}
function credit(r){r.run("var p=db.patients.find(p=>p.id==='APP-PUL-1015');p.application.dispersionDate='2026-01-01';p.application.disbursedAt='2026-01-01';p.application.amortizationStatus='active';dispersionEnsureSchedule(p);persist();currentView='portfolio';var untouchedSelection=selectedPatientId;");}
function setup(r,type='ordinary',amount=100){r.run(`var input={creditId:p.id,type:${JSON.stringify(type)},amount:${amount},date:'2026-10-07',reference:'DRAWER-1',method:'SPEI',target:'auto'};`);}
for(const type of ['ordinary','advance_installment','capital_prepay','early_liquidation','commission_upfront'])test(type+' preview reuses receipt allocation and never changes db, audit, storage, or selected credit',()=>{
 const r=runtime();credit(r);
 if(type==='commission_upfront')r.run("p.offer.openingFeeMode='upfront';p.application.openingFeeMode='upfront';p.offer.openingFeeUpfrontPaid=false;p.application.openingFeeUpfrontPaid=false;p.offer.openingFeeUpfrontPaidAmount=0;p.application.openingFeeUpfrontPaidAmount=0;persist();");
 setup(r,type,type==='capital_prepay'?100000:100);
 if(type==='early_liquidation')r.run("input.settlementQuote=dispersionCalculateEarlySettlement(JSON.parse(JSON.stringify(p)),input.date);input.amount=input.settlementQuote.total+17;");
 r.run('var before=JSON.stringify(db);var selectedBefore=selectedPatientId;var quote=dispersionApplyPayment(input,{preview:true,quiet:true});');
 assert.equal(r.run('JSON.stringify(db)'),r.run('before'));assert.equal(r.run('selectedPatientId'),r.run('selectedBefore'));assert.ok(r.run('quote&&quote.allocations.length>0'),type+' must quote');
 const stored=r.storage.get('pulzzo_backoffice_demo');assert.equal(stored,r.run('before'));
 assert.equal(r.run('dispersionApplyPayment(input,{quiet:true})'),true);
 assert.equal(r.run('JSON.stringify(p.payments.at(-1).allocations)'),r.run('JSON.stringify(quote.allocations)'));
 assert.equal(r.run('p.payments.at(-1).unappliedAmount'),r.run('quote.unappliedAmount'));
 assert.equal(r.run('selectedPatientId'),r.run('selectedBefore'));
 const count=r.run('p.payments.length');assert.notEqual(r.run('dispersionApplyPayment(input,{quiet:true})'),true);assert.equal(r.run('p.payments.length'),count);
});
test('signed predisbursement upfront fee uses the same drawer engine without releasing the credit',()=>{
 const r=runtime();r.run("var p={id:'PRE-DISBURSE',patient:{fullName:'Demo'},application:{contractSigned:true},offer:{patientProcedureAmount:110000,providerBaseAmount:100000,openingFeeRate:.05,openingFeeMode:'upfront'},timeline:[]};db.patients.push(p);persist();currentView='portfolio';");setup(r,'commission_upfront',100);r.run('var before=JSON.stringify(db);var quote=dispersionApplyPayment(input,{preview:true})');assert.ok(r.run('quote'));assert.equal(r.run('JSON.stringify(db)'),r.run('before'));assert.equal(r.run('dispersionApplyPayment(input,{quiet:true})'),true);assert.equal(r.run('JSON.stringify(p.payments.at(-1).allocations)'),r.run('JSON.stringify(quote.allocations)'));assert.equal(r.run('portfolioDisbursed(p)'),false);
});
test('explicit credit identity overrides unrelated global selection',()=>{
 const r=runtime();credit(r);setup(r);r.run("selectedPatientId=db.patients.find(x=>x.id!==p.id).id;var otherId=selectedPatientId;var otherBefore=JSON.stringify(contractSelectedPatient());");
 assert.equal(r.run('dispersionApplyPayment(input,{quiet:true})'),true);assert.equal(r.run('selectedPatientId'),r.run('otherId'));assert.equal(r.run('JSON.stringify(contractSelectedPatient())'),r.run('otherBefore'));
});
test('preview validation is read-only on duplicate, invalid date and storage failure',()=>{
 const r=runtime();credit(r);setup(r);r.run('var before=JSON.stringify(db);input.date="2026-02-31";');assert.equal(r.run('dispersionApplyPayment(input,{preview:true})'),false);assert.equal(r.run('JSON.stringify(db)'),r.run('before'));
 r.run('input.date="2026-10-07"');r.failWrites(true);assert.ok(r.run('dispersionApplyPayment(input,{preview:true})'));assert.equal(r.run('dispersionApplyPayment(input,{quiet:true})'),false);assert.equal(r.run('JSON.stringify(db)'),r.run('before'));
});
test('drawer session rejects navigation, altered financial state, configuration, storage and permission changes',()=>{
 const r=runtime();credit(r);r.run("portfolioPaymentSession={creditId:p.id,fingerprint:portfolioPaymentFingerprint(p),configuration:portfolioPaymentConfiguration(),storageVersion:dispersionLedgerStorageVersion};");assert.equal(r.run('portfolioPaymentIsCurrent()'),true);
 r.run("currentView='patients'");assert.equal(r.run('portfolioPaymentIsCurrent()'),false);r.run("currentView='portfolio';p.offer.principal=1");assert.equal(r.run('portfolioPaymentIsCurrent()'),false);r.run('delete p.offer.principal');assert.equal(r.run('portfolioPaymentIsCurrent()'),true);
 r.run("configRead=()=>({revision:1})");assert.equal(r.run('portfolioPaymentIsCurrent()'),false);r.run("configRead=undefined;session=users.find(x=>x.role==='readonly')");assert.equal(r.run('portfolioPaymentIsCurrent()'),false);
 r.run("session=users.find(x=>x.role==='admin')");r.storage.set('pulzzo_backoffice_demo','{}');assert.equal(r.run('portfolioPaymentIsCurrent()'),false);
});
test('drawer markup/lifecycle is explicit, accessible and leaves the global selection untouched',()=>{
 const drawer=fs.readFileSync(path.join(__dirname,'../assets/js/backoffice-portfolio-payment.js'),'utf8');
 assert.doesNotMatch(drawer,/selectedPatientId\s*=/);for(const token of ['aria-modal="true"','aria-labelledby="portfolioPaymentTitle"',"event.key==='Escape'","event.key!=='Tab'",'portfolioPaymentCancel','portfolioPaymentClose','portfolioPaymentOriginalSetView',"'popstate'","'pagehide'",'wasInert','s.trigger?.isConnected',"position:'fixed'",'if(!s||s.saving'])assert.ok(drawer.includes(token),token);
});

function drawerElements(r){for(const suffix of ['Amount','Type','Date','Method','Reference','RetrospectiveReason','Retrospective','SettlementQuote','Target','Preview','Hint','Settlement','Save','Calculate','Close','Cancel','Drawer'])r.el(suffix==='Drawer'?'portfolioPaymentDrawer':'portfolioPayment'+suffix);r.el('portfolioPaymentType').value='ordinary';r.el('portfolioPaymentDate').value='2026-10-07';r.el('portfolioPaymentMethod').value='SPEI';r.el('portfolioPaymentTarget').value='auto';}
test('open, Escape, cancel, reopen and successful save retain Cartera and restore focus without selection leakage',()=>{
 const r=runtime();credit(r);drawerElements(r);r.el('portfolioSearch').focus();
 assert.equal(r.run('portfolioOpenPayment(p.id)'),true);assert.equal(r.run('selectedPatientId'),r.run('untouchedSelection'));assert.equal(r.el('portfolioPaymentAmount'),r.run('document.activeElement'));
 r.run("portfolioPaymentKeydown({key:'Escape',preventDefault(){}})");assert.equal(r.run('portfolioPaymentSession'),null);assert.equal(r.el('portfolioSearch'),r.run('document.activeElement'));
 assert.equal(r.run('portfolioOpenPayment(p.id)'),true);r.el('portfolioPaymentCancel').onclick();assert.equal(r.run('portfolioPaymentSession'),null);
 assert.equal(r.run('portfolioOpenPayment(p.id)'),true);r.el('portfolioPaymentAmount').value='100';r.el('portfolioPaymentReference').value='DRAWER-SAVE-1';r.run('renderPortfolio=()=>{}');assert.equal(r.run('portfolioPaymentSave()'),true);assert.equal(r.run('portfolioPaymentSession'),null);assert.equal(r.run('currentView'),'portfolio');assert.equal(r.run('selectedPatientId'),r.run('untouchedSelection'));assert.equal(r.run('p.payments.at(-1).reference'),'DRAWER-SAVE-1');assert.equal(r.run('portfolioPaymentSave()'),false);
});
test('drawer keyboard loop, navigation cleanup and mobile focus fallback stay bounded',()=>{
 const r=runtime();credit(r);drawerElements(r);r.el('portfolioSearch').focus();assert.equal(r.run('portfolioOpenPayment(p.id)'),true);
 const first=r.el('portfolioPaymentClose'),last=r.el('portfolioPaymentCancel'),panel=r.el('portfolioPaymentDrawer');first.closest=last.closest=()=>null;panel.querySelectorAll=()=>[first,last];first.focus();let prevented=0;r.run('portfolioPaymentKeydown')({key:'Tab',shiftKey:true,preventDefault(){prevented++}});assert.equal(r.run('document.activeElement'),last);assert.equal(prevented,1);
 r.run('portfolioPaymentKeydown')({key:'Tab',shiftKey:false,preventDefault(){prevented++}});assert.equal(r.run('document.activeElement'),first);assert.equal(prevented,2);
 r.run("setView('dashboard')");assert.equal(r.run('portfolioPaymentSession'),null);assert.equal(r.run('currentView'),'dashboard');r.el('portfolioFilterToggle');r.run('window.matchMedia=()=>({matches:true})');assert.equal(r.run('portfolioPaymentReturnFocus()'),r.el('portfolioFilterToggle'));
});
test('read-only opening is blocked; stale session cannot save and preserves user input',()=>{
 const r=runtime();credit(r);drawerElements(r);r.run("session=users.find(x=>x.role==='readonly')");assert.equal(r.run('portfolioOpenPayment(p.id)'),false);
 r.run("session=users.find(x=>x.role==='admin')");assert.equal(r.run('portfolioOpenPayment(p.id)'),true);r.el('portfolioPaymentAmount').value='321';r.el('portfolioPaymentReference').value='NEVER-SAVE';r.run('p.offer.externalChange=true;var before=JSON.stringify(db)');assert.equal(r.run('portfolioPaymentSave()'),false);assert.equal(r.run('JSON.stringify(db)'),r.run('before'));assert.equal(r.el('portfolioPaymentAmount').value,'321');assert.equal(r.el('portfolioPaymentSave').disabled,true);assert.match(r.el('portfolioPaymentPreview').textContent,/cambiaron/);
});
console.log(`PASS: ${passed} payment drawer regression groups. DOM behavior is source/stub checked; no rendered-browser claim.`);
