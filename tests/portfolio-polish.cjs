'use strict';
// Lightweight DOM/state contracts; these checks do not claim browser layout coverage.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../backoffice.html'),'utf8');
const engine=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m=>m[1].includes('const baseState='))[1];
const source=fs.readFileSync(path.join(__dirname,'../assets/js/backoffice-portfolio.js'),'utf8');
function runtime(){
  const elements=new Map(),storage=new Map(),mediaListeners=[];let mobile=false;let document;
  function el(id){
    if(!elements.has(id)){
      const classes=new Set(),attrs=new Map();
      elements.set(id,{id,value:'',dataset:{},style:{},innerHTML:'',textContent:'',files:[],hidden:false,disabled:false,isConnected:true,
        classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,force){if(force===undefined)force=!classes.has(x);force?classes.add(x):classes.delete(x);return force;}},
        getAttribute:k=>attrs.get(k),setAttribute:(k,v)=>attrs.set(k,String(v)),removeAttribute:k=>attrs.delete(k),
        querySelector(){return null},querySelectorAll(){return this.controls||[]},addEventListener(){},
        closest(selector){return selector==='[hidden]'&&this.hidden?this:null},getClientRects(){return this.hidden?[]:[{}]},
        focus(){document.activeElement=this;this.focused=true;},scrollIntoView(){}});
    }
    return elements.get(id);
  }
  const FixedDate=class extends Date{constructor(...args){super(...(args.length?args:['2026-10-08T12:00:00Z']));}static now(){return new Date('2026-10-08T12:00:00Z').getTime();}};
  document={querySelector:s=>el(s.replace(/^#/,'')),querySelectorAll:()=>[],getElementById:el,createElement:el,head:{appendChild(){}},body:el('body'),listeners:{},addEventListener(type,fn){(this.listeners[type]??=[]).push(fn)},dispatchKeydown(event){for(const fn of this.listeners.keydown||[])fn(event)},activeElement:null};
  const context=vm.createContext({document,window:{matchMedia:()=>({matches:mobile,addEventListener:(type,fn)=>mediaListeners.push(fn)})},Date:FixedDate,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},console,Intl,Blob,URL,setTimeout(){},clearTimeout(){},innerWidth:1200});
  const run=code=>vm.runInContext(code,context);run(engine);run(source);
  run(`session=users.find(u=>u.role==='admin');renderPatientDetail=()=>{};closeModal=()=>{};toast=message=>globalThis.lastToast=message;var paymentRoute=null;portfolioOpenPayment=(id,rowId)=>{paymentRoute={id,rowId};return true;};
    dispersionTerms=p=>({provider:'Clínica Norte',approvedAmount:999999});dispersionBuildSchedule=p=>p.paymentSchedule||[];
    function row(id,date,capital,pending,extra={}){return {id,number:id,type:'Mensualidad ordinaria',dueDate:date,currentDueDate:date,capital,capitalPending:capital,totalPayment:pending,pendingAmount:pending,status:'Pendiente',...extra};}
    function credit(id,rows){return {id,contract:{signedAt:'2026-06-01'},patient:{fullName:'Cliente '+id,rfc:'RFC-'+id},application:{applicationId:id,dispersionDate:'2026-06-01'},paymentSchedule:rows,payments:[]};}
    db.patients=[credit('A',[row('1','2026-10-01',80,100),row('2','2026-10-08',120,150)]),credit('B',[row('1','2026-10-10',300,330)]),credit('C',[row('1','2026-10-25',200,220)]),credit('D',[row('1','2026-09-01',0,0,{status:'Pagado'})])];
    db.patients[0].payments=[{receiptId:'R-1',date:'2026-10-03',amountReceived:110,totalApplied:100,unappliedAmount:10,actor:'admin@demo.test',reference:'REF',allocations:[{rowId:'1',concept:'capital',amount:80},{rowId:'1',concept:'interest',amount:20}]}];
  `);
  return {run,el,storage,document,setMobile(value){mobile=value;for(const fn of mediaListeners)fn({matches:value});}};
}
let count=0;function test(name,fn){fn();count++;console.log('PASS: '+name);}
test('Four primary KPI buttons preserve exact existing metric values and read-only data',()=>{
  const r=runtime();r.run('var before=JSON.stringify(db);renderPortfolio();var m=portfolioMetrics(portfolioCredits())');
  const rendered=r.el('portfolioContent').innerHTML;
  assert.equal((rendered.match(/class="portfolio-metric"/g)||[]).length,4);
  for(const key of ['principal','overdue','received','upcoming'])assert.match(rendered,new RegExp('class="portfolio-metric" data-drill="'+key+'"'));
  assert.equal(r.run('m.principal'),700);assert.equal(r.run('m.overdue'),100);assert.equal(r.run('m.received'),110);assert.equal(r.run('m.upcoming'),700);assert.equal(r.run('m.latePrincipal'),200);
  assert.equal(r.run('JSON.stringify(db)'),r.run('before'));
});
test('Due buckets partition the exact 30-day pending metric and drill through dates',()=>{
  const r=runtime();r.run('renderPortfolio()');const rendered=r.el('portfolioContent').innerHTML;
  for(const dates of [['2026-10-08','2026-10-08'],['2026-10-09','2026-10-15'],['2026-10-16','2026-11-07']])assert.ok(rendered.includes(`data-range-from="${dates[0]}" data-range-to="${dates[1]}"`));
  r.run("portfolioDrillRange('2026-10-09','2026-10-15')");assert.equal(r.run('portfolioState.tab'),'calendar');assert.equal(r.run('portfolioState.due'),'pending');
  assert.match(r.el('portfolioContent').innerHTML,/Cliente B/);assert.doesNotMatch(r.el('portfolioContent').innerHTML,/Cliente A|Cliente C|Cliente D/);
  assert.equal(r.el('portfolioTab-calendar').focused,true);
});
test('Priorities are bounded, sort by actual overdue amount, and keep readonly actions safe',()=>{
  const r=runtime();r.run("for(var i=0;i<7;i++)db.patients.push(credit('L'+i,[row('1','2026-10-01',i+1,200+i)]));renderPortfolio()");
  let rendered=r.el('portfolioContent').innerHTML;assert.equal((rendered.match(/class="portfolio-priority-item"/g)||[]).length,5);
  assert.ok(rendered.indexOf('Cliente L6')<rendered.indexOf('Cliente L5'));assert.doesNotMatch(rendered,/Cliente L0|Cliente L1/);
  r.run("session=users.find(u=>u.role==='readonly');renderPortfolio()");rendered=r.el('portfolioContent').innerHTML;
  assert.doesNotMatch(rendered,/Registrar pago/);assert.equal(r.run("portfolioOpenCredit('A','payment')"),false);assert.equal(r.run('paymentRoute'),null);
});
test('Filters have a compact primary row, hidden additional controls and removable active chips',()=>{
  const r=runtime();r.run("portfolioSetTab('credits')");const shell=r.el('portfolio').innerHTML;
  for(const token of ['portfolio-filter-main','portfolioSearch','portfolioCreditState','portfolioFrom','portfolioTo','portfolio-more-filters" hidden','aria-controls="portfolioMoreFilters"','portfolioFilterChips'])assert.ok(shell.includes(token),token);
  assert.match(r.el('portfolioFilterChips').innerHTML,/Estado: Activos/);
  r.el('portfolioSearch').oninput({target:{value:'Cliente B'}});assert.match(r.el('portfolioFilterChips').innerHTML,/Búsqueda: Cliente B/);assert.doesNotMatch(r.el('portfolioContent').innerHTML,/Cliente A/);
  r.run("portfolioClearFilter('query');portfolioClearFilter('creditState')");assert.equal(r.run('portfolioState.creditState'),'all');assert.doesNotMatch(r.el('portfolioFilterChips').innerHTML,/Estado:/);assert.match(r.el('portfolioContent').innerHTML,/Cliente D/);
  r.run('portfolioToggleMore()');assert.equal(r.el('portfolioMoreFilters').hidden,false);assert.equal(r.el('portfolioMoreToggle').getAttribute('aria-expanded'),'true');
  r.run('portfolioToggleMore()');assert.equal(r.el('portfolioMoreFilters').hidden,true);
});
test('Credit date filters work without a due filter and invalid ranges never show stale results',()=>{
  const r=runtime();r.run("portfolioSetTab('credits')");r.el('portfolioFrom').onchange({target:{value:'2026-10-20'}});
  assert.match(r.el('portfolioContent').innerHTML,/Cliente C/);assert.doesNotMatch(r.el('portfolioContent').innerHTML,/Cliente A|Cliente B/);
  r.el('portfolioTo').onchange({target:{value:'2026-10-01'}});assert.match(r.el('portfolioContent').innerHTML,/role="alert"/);assert.doesNotMatch(r.el('portfolioContent').innerHTML,/Cliente C/);
  r.el('portfolioClear').onclick();assert.equal(r.run('portfolioState.from'),'');assert.equal(r.run('portfolioState.to'),'');assert.equal(r.run('portfolioState.creditState'),'active');assert.equal(r.el('portfolioSearch').focused,true);
});
test('Mobile filter drawer closes via button, Escape, backdrop, completion and resize',()=>{
  const r=runtime();r.setMobile(true);r.run("portfolioSetTab('credits')");
  for(const id of ['portfolioFilterClose','portfolioFilterDone','portfolioFilterBackdrop']){
    r.el('portfolioFilterToggle').onclick();assert.equal(r.run('portfolioState.filterOpen'),true);assert.equal(r.el('portfolioFilterShell').getAttribute('role'),'dialog');assert.equal(r.el('portfolioFilterShell').getAttribute('aria-modal'),'true');assert.equal(r.document.body.classList.contains('portfolio-filters-open'),true);assert.equal(r.el('portfolioFilterBackdrop').hidden,false);
    r.el(id).onclick();assert.equal(r.run('portfolioState.filterOpen'),false);assert.equal(r.document.body.classList.contains('portfolio-filters-open'),false);assert.equal(r.el('portfolioFilterToggle').focused,true);assert.equal(r.el('portfolioFilterShell').getAttribute('role'),undefined);
  }
  r.run('portfolioSetFiltersOpen(true)');let prevented=false;r.document.dispatchKeydown({key:'Escape',preventDefault(){prevented=true},target:{closest(){return null}}});assert.equal(prevented,true);assert.equal(r.run('portfolioState.filterOpen'),false);
  r.run('portfolioSetFiltersOpen(true)');r.setMobile(false);assert.equal(r.run('portfolioState.filterOpen'),false);assert.equal(r.document.body.classList.contains('portfolio-filters-open'),false);assert.equal(r.el('portfolioSearch').focused,true);
});
test('Mobile filter keyboard focus is contained and selected tab supports arrow navigation',()=>{
  const r=runtime();r.run("portfolioSetTab('credits');portfolioSetFiltersOpen(true)");const first=r.el('first'),last=r.el('last');r.el('portfolioFilterShell').controls=[first,last];
  first.focus();let prevented=false;r.run('globalThis.eventForTest=null');r.document.dispatchKeydown({key:'Tab',shiftKey:true,preventDefault(){prevented=true},target:first});assert.equal(prevented,true);assert.equal(r.document.activeElement,last);
  last.focus();r.document.dispatchKeydown({key:'Tab',shiftKey:false,preventDefault(){},target:last});assert.equal(r.document.activeElement,first);
  r.run('portfolioSetFiltersOpen(false)');r.el('portfolio').onkeydown({key:'ArrowRight',preventDefault(){},target:{closest:()=>({dataset:{portfolioTab:'credits'}})}});assert.equal(r.run('portfolioState.tab'),'movements');assert.equal(r.el('portfolioTab-movements').focused,true);
});
test('All list tabs provide separate mobile cards, numeric alignment and unambiguous action IDs',()=>{
  const r=runtime();for(const tab of ['credits','calendar','collections','movements']){
    r.run(`portfolioSetTab('${tab}')`);const rendered=r.el('portfolioContent').innerHTML;
    assert.match(rendered,/class="table-wrap portfolio-desktop-table"/);assert.match(rendered,/class="portfolio-mobile-cards"/);assert.match(rendered,/class="portfolio-mobile-card"/);assert.match(rendered,/class="portfolio-number"/);assert.match(rendered,/data-credit="A"/);
  }
  r.run("portfolioSetTab('credits')");assert.match(r.el('portfolioContent').innerHTML,/Cliente \/ crédito/);assert.doesNotMatch(r.el('portfolioContent').innerHTML,/<th scope="col">Proveedor/);
});
test('Receipt cards retain reversal signs, splits, allocations, actor and reference',()=>{
  const r=runtime();r.run("db.patients[0].payments.push({receiptId:'REV-1',date:'2026-10-04',amountReceived:-110,totalApplied:-100,unappliedAmount:-10,reversalOf:'R-1'});portfolioSetTab('movements')");
  const rendered=r.el('portfolioContent').innerHTML;for(const token of ['Reverso','R-1','REF','admin@demo.test','capital','interest','No aplicado','Aplicado'])assert.ok(rendered.includes(token));
  assert.equal(r.run('portfolioMetrics(portfolioCredits()).received'),0);
});
test('Payment routing preserves portfolio filters and selected patient, passes exact row, and rejects settled credits',()=>{
  const r=runtime();r.run("selectedPatientId='OTHER';portfolioState.query='Cliente A';portfolioState.tab='calendar';var stateBefore=JSON.stringify(portfolioState);portfolioOpenCredit('A','payment','2')");
  assert.equal(r.run('paymentRoute.id'),'A');assert.equal(r.run('paymentRoute.rowId'),'2');assert.equal(r.run('selectedPatientId'),'OTHER');assert.equal(r.run('JSON.stringify(portfolioState)'),r.run('stateBefore'));
  r.run('paymentRoute=null');assert.equal(r.run("portfolioOpenCredit('D','payment')"),false);assert.equal(r.run('paymentRoute'),null);
});
test('Unsigned credits remain readable but cannot open payment; signed pre-disbursement receipts stay eligible',()=>{
  const r=runtime();r.run("delete db.patients[0].contract;db.patients.push({id:'PRE',contract:{signedAt:'2026-10-01'},application:{applicationId:'PRE'},patient:{fullName:'Cliente PRE'},payments:[{date:'2026-10-03',amountReceived:30,totalApplied:30,unappliedAmount:0}]});portfolioSetTab('movements')");
  const rendered=r.el('portfolioContent').innerHTML;
  assert.doesNotMatch(rendered,/<option value="A"/);assert.match(rendered,/<option value="PRE"/);assert.match(rendered,/Cliente A/);
  assert.equal(r.run("portfolioOpenCredit('A','payment')"),false);assert.equal(r.run('paymentRoute'),null);
  assert.equal(r.run("portfolioOpenCredit('PRE','payment')"),true);assert.equal(r.run('paymentRoute.id'),'PRE');
  assert.equal(r.run('portfolioMetrics(portfolioCredits()).received'),140);assert.equal(r.run('portfolioCredits().length'),4);
});
test('Credit detail returns to a visible portfolio control at mobile and desktop widths',()=>{
  const r=runtime();r.run('renderPatients=()=>{}');r.setMobile(true);r.run("portfolioOpenCredit('A','detail')");assert.equal(r.run('operationalReturnContext.focus'),'portfolioFilterToggle');
  r.setMobile(false);r.run("portfolioOpenCredit('A','detail')");assert.equal(r.run('operationalReturnContext.focus'),'portfolioSearch');
});
test('New priority/card/chip surfaces escape imported user content without mutating ledgers',()=>{
  const r=runtime();r.run(`db.patients[0].patient.fullName='<img src=x onerror=alert(1)>';portfolioState.query='<img';var originalDb=JSON.stringify(db);`);
  for(const tab of ['summary','credits','calendar','collections','movements']){r.run(`portfolioSetTab('${tab}')`);assert.doesNotMatch(r.el('portfolioContent').innerHTML,/<img src=x/);assert.doesNotMatch(r.el('portfolioFilterChips').innerHTML,/<img/);}
  assert.equal(r.run('JSON.stringify(db)'),r.run('originalDb'));
});
console.log(`PASS: ${count} portfolio polish suites. Real browser layout, keyboard and screen-reader QA remain separate.`);
