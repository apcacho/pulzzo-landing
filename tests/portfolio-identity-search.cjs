'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../backoffice.html'),'utf8');
const inline=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m=>m[1].includes('const baseState='))[1];
const portfolio=fs.readFileSync(path.join(__dirname,'../assets/js/backoffice-portfolio.js'),'utf8');
function runtime(saved=[]){
 const elements=new Map(),storage=new Map(saved);let fail=false;
 function el(id){if(!elements.has(id))elements.set(id,{id,value:'',dataset:{},style:{},innerHTML:'',textContent:'',files:[],classList:{add(){},remove(){},toggle(){},contains(){return false}},querySelector(){return null},querySelectorAll(){return []},addEventListener(){},setAttribute(){},focus(){this.focused=true;},scrollIntoView(){}});return elements.get(id);}
 const FixedDate=class extends Date{constructor(...args){super(...(args.length?args:['2026-10-08T12:00:00Z']));}static now(){return new Date('2026-10-08T12:00:00Z').getTime();}};
 const document={querySelector:s=>el(s.replace(/^#/,'')),querySelectorAll:()=>[],getElementById:el,createElement:el,head:{appendChild(){}},body:{appendChild(){}},addEventListener(){}};
 const context=vm.createContext({document,window:{},Date:FixedDate,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(fail)throw Error('blocked');storage.set(k,String(v));},removeItem:k=>storage.delete(k)},console,Intl,Blob,URL,setTimeout(){},clearTimeout(){},innerWidth:1200});
 const run=code=>vm.runInContext(code,context);run(inline);run(portfolio);run("session=users.find(u=>u.role==='admin');renderPatientDetail=()=>{};closeModal=()=>{};toast=message=>globalThis.lastToast=message;var paymentRoute=null;portfolioOpenPayment=(id,rowId)=>{paymentRoute={id,rowId};return true;};");
 return {run,el,storage,failStorage(){fail=true;}};
}
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/portfolio-search-identities.json'),'utf8'));
function setup(){
 const r=runtime();r.run(`
 dispersionTerms=p=>({provider:'Proveedor Exclusivo',approvedAmount:999999});
 dispersionBuildSchedule=p=>p.paymentSchedule||[];
 db.patients=${JSON.stringify(fixture)}.map(f=>({id:f.id,patient:{fullName:f.fullName,phone:f.phone,rfc:f.rfc,curp:f.curp,email:f.email},application:{applicationId:f.code,dispersionDate:'2026-06-01',doctorWhatsApp:'4421112233'},contract:{signedAt:'2026-06-01'},paymentSchedule:[{id:'SHARED-ROW',number:1,dueDate:'2026-10-01',currentDueDate:'2026-10-01',capital:f.capital,capitalPending:f.capital,totalPayment:f.capital,pendingAmount:f.capital,status:'Pendiente'}],payments:[{receiptId:'RECEIPT-'+f.id,date:'2026-10-03',amountReceived:f.received,totalApplied:f.received,unappliedAmount:0,allocations:[{rowId:'SHARED-ROW',concept:'capital',amount:f.received}]}]}));
 var dataBefore=JSON.stringify(db),storageBefore=localStorage.getItem(DEMO_STORAGE_KEY);
 renderPortfolio();`);return r;
}
function search(r,query){r.el('portfolioSearch').oninput({target:{value:query}});}
function ids(r){return JSON.parse(r.run('JSON.stringify(portfolioCredits().filter(portfolioMatches).map(c=>c.id))'));}
let count=0;function test(name,fn){fn();count++;console.log('PASS: '+name);}
const cases={phone:['+52 (55) 1234-5678','525512345678','55 1234 5678','(55)1234-5678','1234-5678'],rfc:['MUAJ-900101 AB7','muaj900101ab7',' muaj 900101-ab7 ','900101ab7'],curp:['MUAJ 900101-HDFNNN 09','muaj900101hdfnnn09','MUAJ-900101 HDFNNN09','hdfnnn09'],name:['José Ángel Muñoz','jose angel munoz','  JOSE   ANGEL  MUÑOZ  ','angel mun'],credit:['APP-PUL-4101','app pul 4101','apppul4101','4101'],email:['Jose.Munoz+cartera@demo.test','JOSE.MUNOZ+CARTERA@DEMO.TEST','munoz+cartera']};
for(const [field,queries] of Object.entries(cases))test(`${field}: full/partial/formatted search selects only its record in all five tabs`,()=>{
 const r=setup();for(const tab of ['summary','credits','movements','calendar','collections']){
  r.run(`portfolioSetTab('${tab}')`);
  for(const query of queries){search(r,query);assert.deepEqual(ids(r),['RECORD-A'],`${tab}: ${query}`);
   const body=r.el('portfolioContent').innerHTML;assert.ok(body.includes('APP-PUL-4101'),`${tab}: target rendered`);assert.doesNotMatch(body,/APP-PUL-4202|APP-PUL-4303|RECEIPT-RECORD-B|RECEIPT-RECORD-C/);
   assert.equal(r.run('portfolioMetrics(portfolioCredits().filter(portfolioMatches)).principal'),100);assert.equal(r.run('portfolioMetrics(portfolioCredits().filter(portfolioMatches)).received'),21);
  }
 }
 assert.equal(r.run('JSON.stringify(db)'),r.run('dataBefore'));assert.equal(r.run('localStorage.getItem(DEMO_STORAGE_KEY)'),r.run('storageBefore'));
});
test('Queries cannot join field boundaries, provider identities, foreign receipts or strip arbitrary text into phone numbers',()=>{
 const r=setup();for(const q of ['RECORD-A APP-PUL-4101','Proveedor Exclusivo','4421112233','RECEIPT-RECORD-A','call 5512345678','jose.munozcartera@demo.test','hdfnnn08','not-found','---','()']){search(r,q);assert.deepEqual(ids(r),[],q);}
 for(const tab of ['summary','credits','movements','calendar','collections']){r.run(`portfolioSetTab('${tab}')`);search(r,'not-found');assert.doesNotMatch(r.el('portfolioContent').innerHTML,/APP-PUL-4101|APP-PUL-4202|APP-PUL-4303/);assert.match(r.el('portfolioContent').innerHTML,tab==='summary'?/No hay créditos/:/Sin resultados/);}
 search(r,' \t ');assert.equal(ids(r).length,3);
});
test('Same-name borrowers remain separate credits and searching one contact never inherits another record',()=>{
 const r=setup();r.run("db.patients[1].patient.fullName=db.patients[0].patient.fullName;portfolioSetTab('movements')");search(r,'jose angel munoz');assert.deepEqual(ids(r),['RECORD-A','RECORD-B']);search(r,'muaj900101hdfnnn09');assert.deepEqual(ids(r),['RECORD-A']);assert.doesNotMatch(r.el('portfolioContent').innerHTML,/RECEIPT-RECORD-B/);
 r.run("db.patients[1].patient.phone=db.patients[0].patient.phone");search(r,'5512345678');assert.deepEqual(ids(r),['RECORD-A','RECORD-B']);search(r,'app-pul-4101');assert.deepEqual(ids(r),['RECORD-A']);
});
test('Search intersects existing state/date/due/month filters and clearing one chip preserves the others',()=>{
 const r=setup();r.run("portfolioSetTab('credits')");search(r,'hdfnnn09');r.el('portfolioCreditState').onchange({target:{value:'settled'}});assert.match(r.el('portfolioContent').innerHTML,/Sin resultados/);r.el('portfolioCreditState').onchange({target:{value:'active'}});r.el('portfolioDue').onchange({target:{value:'upcoming'}});assert.match(r.el('portfolioContent').innerHTML,/Sin resultados/);r.el('portfolioDue').onchange({target:{value:'late'}});
 r.el('portfolioFrom').onchange({target:{value:'2026-10-02'}});assert.match(r.el('portfolioContent').innerHTML,/Sin resultados/);r.run("portfolioClearFilter('from')");assert.match(r.el('portfolioContent').innerHTML,/APP-PUL-4101/);assert.equal(r.el('portfolioFilterCount').textContent,'3');r.run("portfolioClearFilter('query')");assert.equal(r.run('portfolioState.due'),'late');assert.equal(r.el('portfolioFilterCount').textContent,'2');assert.match(r.el('portfolioContent').innerHTML,/APP-PUL-4202/);
 r.run("portfolioSetTab('movements')");search(r,'hdfnnn09');r.el('portfolioMonth').onchange({target:{value:'2026-09'}});assert.match(r.el('portfolioContent').innerHTML,/Sin resultados/);r.run("portfolioClearFilter('movementMonth')");assert.match(r.el('portfolioContent').innerHTML,/RECEIPT-RECORD-A/);r.el('portfolioClear').onclick();assert.equal(r.run('portfolioState.query'),'');assert.equal(r.run('portfolioState.creditState'),'active');
});
test('Receipt-only search uses its own identity, readonly roles stay readonly and payment targets remain exact',()=>{
 const r=setup();r.run("delete db.patients[2].application.dispersionDate;portfolioSetTab('movements')");search(r,'TOMM920303HJCRRT07');assert.match(r.el('portfolioContent').innerHTML,/RECEIPT-RECORD-C/);assert.doesNotMatch(r.el('portfolioContent').innerHTML,/RECEIPT-RECORD-A|RECEIPT-RECORD-B/);assert.equal(r.run('portfolioMetrics(portfolioCredits().filter(portfolioMatches)).received'),63);
 search(r,'hdfnnn09');r.el('portfolioPaymentCredit').value='RECORD-A';r.el('portfolioContent').onclick({target:{closest:()=>({dataset:{registerPayment:'true'}})}});assert.equal(r.run('paymentRoute.id'),'RECORD-A');assert.equal(r.run('portfolioState.query'),'hdfnnn09');assert.equal(r.run('portfolioState.tab'),'movements');
 r.run("session=users.find(u=>u.role==='readonly')");for(const tab of ['summary','credits','movements','calendar','collections']){r.run(`portfolioSetTab('${tab}')`);assert.doesNotMatch(r.el('portfolioContent').innerHTML,/Registrar pago|Registrar gestión/);assert.equal(r.run("portfolioOpenCredit('RECORD-A','payment','SHARED-ROW')"),false);}
});
test('Absent optional identity fields do not create undefined or null matches',()=>{
 const r=setup();r.run("db.patients[1].patient={fullName:'Lucía Rivera'};db.patients[2].patient=null");for(const q of ['undefined','null','hdfnnn09']){search(r,q);assert.deepEqual(ids(r),q==='hdfnnn09'?['RECORD-A']:[]);}
});
test('Short search placeholder has a visible, accessible description of all six supported fields',()=>{
 const r=setup();const markup=r.el('portfolio').innerHTML;assert.match(markup,/id="portfolioSearch"[^>]*aria-describedby="portfolioSearchHelp"/);assert.match(markup,/id="portfolioSearchHelp"[^>]*>Busca por teléfono, RFC, CURP, nombre, número de crédito o correo electrónico\./);assert.ok(markup.match(/id="portfolioSearch"[^>]*placeholder="([^"]+)"/)[1].length<30);assert.doesNotMatch(markup.match(/id="portfolioSearch"[^>]+/)[0],/proveedor/);
});
console.log(`PASS: ${count} identity-search suites. VM/DOM contracts only; browser geometry is not simulated.`);
