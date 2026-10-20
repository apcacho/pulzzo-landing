'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'backoffice.html'),'utf8');
const inline=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m=>m[1].includes('const baseState='))[1];
const portfolio=fs.readFileSync(path.join(root,'assets/js/backoffice-portfolio.js'),'utf8');
function runtime(){
 const elements=new Map(),storage=new Map();
 function el(id){if(!elements.has(id))elements.set(id,{id,value:'',dataset:{},style:{},innerHTML:'',textContent:'',files:[],classList:{add(){},remove(){},toggle(){},contains(){return false}},querySelector(){return null},querySelectorAll(){return []},addEventListener(){},setAttribute(){},focus(){this.focused=true;},scrollIntoView(){}});return elements.get(id);}
 const FixedDate=class extends Date{constructor(...args){super(...(args.length?args:['2026-10-08T12:00:00Z']));}static now(){return new Date('2026-10-08T12:00:00Z').getTime();}};
 const document={querySelector:s=>el(s.replace(/^#/,'')),querySelectorAll:()=>[],getElementById:el,createElement:el,head:{appendChild(){}},body:{appendChild(){}},addEventListener(){}};
 const context=vm.createContext({document,window:{},Date:FixedDate,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},console,Intl,Blob,URL,setTimeout(){},clearTimeout(){},innerWidth:1200});
 const run=code=>vm.runInContext(code,context);require('./fixtures/staff-session.cjs')(context);run(inline);run(portfolio);
 run(`session=testStaffSession('admin');renderPatientDetail=()=>{};closeModal=()=>{};toast=()=>{};renderPatients=()=>{};
  dispersionTerms=p=>({provider:'Clínica Norte',approvedAmount:999999});
  dispersionBuildSchedule=p=>p.paymentSchedule||[];
  function testCredit(id,rows,extra={}){return {id,contract:{signedAt:'2026-06-01'},patient:{fullName:'Cliente '+id,rfc:'RFC-'+id},application:{applicationId:id,dispersionDate:'2026-06-01',...extra},paymentSchedule:rows,payments:[]};}
  function testRow(id,date,capital,pending,extra={}){return {id,number:id,type:'Mensualidad ordinaria',dueDate:date,currentDueDate:date,capital,capitalPending:capital,totalPayment:pending,pendingAmount:pending,status:'Pendiente',...extra};}
  db.patients=[testCredit('CR-A',[testRow('1','2026-10-01',80,100),testRow('2','2026-10-20',120,150)]),testCredit('CR-B',[testRow('1','2026-10-25',300,330)]),testCredit('CR-C',[testRow('1','2026-09-01',0,0,{status:'Pagado'})])];
  db.patients[0].payments=[{receiptId:'R-1',date:'2026-10-03',amountReceived:110,totalApplied:100,unappliedAmount:10}];
 `);
 return {run,el};
}
function engine(){
 const elements=new Map(),storage=new Map();
 function el(id){if(!elements.has(id))elements.set(id,{id,value:'',dataset:{},style:{},innerHTML:'',textContent:'',checked:false,disabled:false,files:[],classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},focus(){this.focused=true;},closest(){return null},querySelector(){return null},querySelectorAll(){return []},appendChild(){},scrollIntoView(){}});return elements.get(id);}
 const FixedDate=class extends Date{constructor(...args){super(...(args.length?args:['2026-10-15T18:00:00Z']));}static now(){return new Date('2026-10-15T18:00:00Z').getTime();}};
 const document={querySelector:s=>el(String(s).replace(/^#/,'')),querySelectorAll(){return []},getElementById:id=>el(id),addEventListener(){},createElement:()=>el('node'),head:el('head'),body:{style:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},appendChild(){}}};
 const context=vm.createContext({document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},window:{addEventListener(){},scrollTo(){},open(){return {document:{open(){},write(){},close(){}}}}},confirm:()=>true,Date:FixedDate,console,Intl,Blob,URL:Object.assign(URL,{createObjectURL:()=>'blob:demo',revokeObjectURL(){}}),setTimeout(){},clearTimeout(){},innerWidth:1200,fetch(){throw Error('no hay envío real');}});
 require('./fixtures/staff-session.cjs')(context);
 vm.runInContext(inline,context);
 vm.runInContext("render=()=>{};renderPatientDetail=()=>{};closeModal=()=>{};session=testStaffSession('admin');",context);
 vm.runInContext(fs.readFileSync(path.join(root,'assets/js/backoffice-configuration.js'),'utf8'),context);
 vm.runInContext(portfolio,context);
 vm.runInContext(fs.readFileSync(path.join(root,'assets/js/backoffice-portfolio-payment.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(root,'assets/js/backoffice-cartera-fase1.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(root,'assets/js/backoffice-cartera-cobranza.js'),'utf8'),context);
 return {run:code=>vm.runInContext(code,context),el};
}
let count=0;function test(name,fn){fn();count++;console.log('PASS: '+name);}
test('Footer badge and VERSION.json say v42 demo local',()=>{
 const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const version=JSON.parse(fs.readFileSync(path.join(root,'VERSION.json'),'utf8'));
 assert.match(index,/>v42 · demo local</);assert.match(html,/>v42 · demo local</);
 assert.doesNotMatch(index,/revisión incompleta/);assert.doesNotMatch(html,/revisión incompleta/);
 assert.equal(version.version,'v42');assert.match(version.note,/v42 · demo local/);
 assert.equal(typeof version.files,'object');assert.ok(version.files['backoffice.html']);assert.equal(version.previous_version,'v36-asistido-20261014');
});
test('Dashboard math matches the cartera engine on the synthetic book',()=>{
 const r=runtime();
 const board=JSON.parse(r.run('JSON.stringify(portfolioDashboard(portfolioCredits()))'));
 const metrics=JSON.parse(r.run('JSON.stringify(portfolioMetrics(portfolioCredits()))'));
 assert.equal(board.principal,metrics.principal);assert.equal(board.principal,500);
 assert.equal(board.overdue,metrics.overdue);assert.equal(board.overdue,100);
 assert.equal(board.received,metrics.received);assert.equal(board.received,110);
 assert.equal(board.upcoming,metrics.upcoming);assert.equal(board.upcoming,480);
 assert.equal(board.lateShare,40);assert.equal(board.active,2);
 assert.equal(r.run('roundToCents(portfolioDashboard(portfolioCredits()).buckets.reduce((s,b)=>s+b.capital,0))'),500);
 assert.equal(board.buckets.map(bucket=>bucket.label).join(','),'Al corriente,1-30,31-60,61-90,90+,Liquidado');
 assert.equal(board.months.length,12);assert.equal(board.months[0].month,'2026-10');
 assert.equal(board.months[0].collected,board.received);
 assert.equal(board.months.slice(1).reduce((sum,month)=>sum+month.collected,0),0);
 assert.equal(board.contractual.capital,board.principal);
 assert.equal(board.contractual.total,board.contractual.capital+board.contractual.interest);
 assert.equal(board.collections.cobranza+board.collections.vence_hoy+board.collections.precobranza+board.collections.sin_accion,board.active);
 assert.equal(board.disbursed,500);
 r.run("db.patients[0].paymentSchedule[1].interestPending=25;db.patients[0].payments.push({date:'2026-10-04',amountReceived:-110,totalApplied:-100,unappliedAmount:-10,reversalOf:'R-1'})");
 const after=JSON.parse(r.run('JSON.stringify(portfolioDashboard(portfolioCredits()))'));
 assert.equal(after.received,0);assert.equal(after.months[0].collected,0);
 assert.equal(after.contractual.interest,25);assert.equal(after.contractual.total,after.principal+25);
 assert.equal(after.contractual.capital,after.principal);
});
test('Resumen renders the dashboard, keeps search, and opens a filtered Cobranza list',()=>{
 const r=runtime();r.run('renderPortfolio()');
 const shell=r.el('portfolio').innerHTML,rendered=r.el('portfolioContent').innerHTML;
 assert.match(shell,/id="portfolioSearch"/);
 for(const label of ['Cartera vigente','Monto dispersado neto','Vencido + moratorios','% de cartera con atraso','Cobrado en el mes','Por cobrar próximos 30 días','Flujo contractual pendiente','Créditos activos','Cobranza de hoy','En cobranza','Vence hoy','Precobranza','Sin acción','Top clientes por saldo','Próximos vencimientos'])assert.match(rendered,new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 assert.equal((rendered.match(/class="portfolio-metric"/g)||[]).length,8);
 assert.equal((rendered.match(/class="portfolio-today-card"/g)||[]).length,4);
 assert.match(rendered,/<svg[\s>]/);assert.doesNotMatch(rendered,/<script|chart\.js|cdn\.|googleapis/i);
 assert.match(rendered,/\$500|500\.00|MXN/);
 r.el('portfolioContent').onclick({target:{closest:selector=>selector==='button'?{dataset:{collection:'precobranza'}}:null}});
 assert.equal(r.run('portfolioState.tab'),'collections');assert.equal(r.run('portfolioState.collectionFocus'),'precobranza');
 r.run("portfolioState.tab='summary';portfolioState.collectionFocus='';db.patients=[];renderPortfolio()");
 assert.match(r.el('portfolioContent').innerHTML,/Sin clientes con saldo/);
 assert.match(r.el('portfolioContent').innerHTML,/Sin saldo de capital/);
 assert.match(r.el('portfolio').innerHTML,/id="portfolioSearch"/);
});
test('Seeded cartera credits keep bucket capital, monthly collections and Cobranza filters aligned',()=>{
 const r=engine();
 const board=JSON.parse(r.run('JSON.stringify(portfolioDashboard(portfolioCredits()))'));
 const metrics=JSON.parse(r.run('JSON.stringify(portfolioMetrics(portfolioCredits()))'));
 assert.equal(board.principal,metrics.principal);assert.ok(board.principal>0);
 assert.equal(r.run('roundToCents(portfolioDashboard(portfolioCredits()).buckets.reduce((s,b)=>s+b.capital,0))'),board.principal);
 assert.equal(board.months[0].collected,board.received);assert.equal(board.received,metrics.received);assert.ok(board.received>0);
 assert.equal(board.contractual.capital,board.principal);
 assert.ok(board.contractual.interest>0);assert.equal(board.contractual.total,r.run('roundToCents(portfolioDashboard(portfolioCredits()).contractual.capital+portfolioDashboard(portfolioCredits()).contractual.interest)'));
 assert.equal(board.collections.cobranza+board.collections.vence_hoy+board.collections.precobranza+board.collections.sin_accion,board.active);
 assert.ok(board.disbursed>=84000+96000+72000+110000+64000);
 const placed=JSON.parse(r.run(`JSON.stringify(['APP-CARTERA-1001','APP-CARTERA-1002','APP-CARTERA-1003','APP-CARTERA-1004','APP-CARTERA-1005'].map(id=>{const credit=portfolioCredits().find(item=>item.id===id);const bucket=credit.settled?'settled':portfolioAgingId(portfolioCreditDpd(credit));return {id,bucket,outstanding:credit.outstanding,overdue:credit.overdue};}))`));
 const byId=Object.fromEntries(placed.map(row=>[row.id,row]));
 assert.equal(byId['APP-CARTERA-1001'].overdue,0);assert.equal(byId['APP-CARTERA-1001'].bucket,'current');
 assert.ok(byId['APP-CARTERA-1002'].overdue>0);assert.notEqual(byId['APP-CARTERA-1002'].bucket,'current');
 for(const row of placed){const bucket=board.buckets.find(item=>item.id===row.bucket);assert.ok(bucket.capital+0.001>=row.outstanding,row.id);}
 const tableOf=()=>{const html=r.el('portfolioContent').innerHTML;return html.slice(html.lastIndexOf('<table'));};
 r.run("renderPortfolio();portfolioOpenCollections('cobranza')");
 assert.match(r.el('portfolioContent').innerHTML,/Bandeja de hoy: En cobranza/);
 assert.match(tableOf(),/Hugo Ramírez Beltrán/);assert.doesNotMatch(tableOf(),/Inés Palacios Mora|Jorge Beltrán Osorio/);
 r.run("portfolioOpenCollections('precobranza')");assert.match(tableOf(),/Inés Palacios Mora/);assert.doesNotMatch(tableOf(),/Hugo Ramírez Beltrán/);
 r.run("portfolioOpenCollections('vence_hoy')");assert.match(tableOf(),/Jorge Beltrán Osorio/);assert.doesNotMatch(tableOf(),/Inés Palacios Mora/);
 const elena=r.run("portfolioCollectionBucket(portfolioCredits().find(c=>c.id==='APP-CARTERA-1001'))");
 r.run('portfolioOpenCollections('+JSON.stringify(elena)+')');assert.match(tableOf(),/Elena Vargas Solís/);
 r.run("portfolioOpenCollections('sin_accion')");assert.doesNotMatch(tableOf(),/Hugo Ramírez Beltrán|Inés Palacios Mora|Jorge Beltrán Osorio/);
 assert.equal(r.run('localStorage.getItem("pulzzo_crm_assisted_demo_v1")'),null);
 assert.doesNotMatch(portfolio,/localStorage\.clear|indexedDB\.deleteDatabase/);
});
console.log('PASS: '+count+' portfolio dashboard suites.');
