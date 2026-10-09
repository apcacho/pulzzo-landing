'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../backoffice.html'),'utf8');
const script=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m=>m[1].includes('const baseState='))[1];
const elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{id,value:'',dataset:{},style:{},innerHTML:'',textContent:'',checked:false,disabled:false,files:[],classList:{add(){},remove(){},toggle(){},contains(){return false}},querySelector(s){return el(id+' '+s)},querySelectorAll(){return []},addEventListener(){},setAttribute(){},scrollIntoView(){},focus(){}});return elements.get(id)}
const storage=new Map();
const document={querySelector:s=>el(s.replace(/^#/,'')),querySelectorAll:()=>[],getElementById:id=>el(id),addEventListener(){},createElement:tag=>el(tag),body:{appendChild(){}}};
const context=vm.createContext({document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},window:{},Date,console,Intl,Blob,URL,setTimeout(){},clearTimeout(){},innerWidth:1200});
vm.runInContext(script,context);
const run=code=>vm.runInContext(code,context);
const ui=id=>el(run('providerElementId('+JSON.stringify(id)+')'));
run("session=users.find(u=>u.role==='admin');setView('providerRequests');providerFilters.history='all';renderProviders()");
let count=0;function test(name,fn){fn();count++;console.log('PASS',name)}
test('Provider landing is a full-width patient-style list without a simultaneous detail',()=>{
 assert.match(el(run('currentView')).innerHTML,/patient-request-list-view/);assert.match(el(run('currentView')).innerHTML,/patient-profiles-card/);
 assert.doesNotMatch(el(run('currentView')).innerHTML,/master-detail|id="providerDetail"/);
 assert.match(ui('providerList').innerHTML,/Ver doctor/);assert.match(ui('providerList').innerHTML,/Ver clínica/);
 assert.equal(ui('providerCount').textContent,'3 solicitudes');
});
test('Filtering renders results/count and an explicit empty state',()=>{
 ui('dfName').oninput({target:{value:'Laura'}});assert.equal(ui('providerCount').textContent,'1 solicitud');
 assert.match(ui('providerList').innerHTML,/Laura/);assert.doesNotMatch(ui('providerList').innerHTML,/Roberto/);
 ui('dfName').oninput({target:{value:'no-match'}});assert.match(ui('providerList').innerHTML,/Sin solicitudes encontradas/);
 ui('dfName').oninput({target:{value:''}});ui('dfType').oninput({target:{value:'Clínica u hospital'}});assert.equal(ui('providerCount').textContent,'1 solicitud');
 ui('dfType').oninput({target:{value:''}});ui('dfStatus').oninput({target:{value:'aprobado'}});assert.match(ui('providerList').innerHTML,/Roberto/);
 ui('dfStatus').oninput({target:{value:''}});ui('dfName').oninput({target:{value:'MELL'}});assert.equal(ui('providerCount').textContent,'1 solicitud');
});
test('Explicit button opens correct full-width detail and Back preserves filters',()=>{
 ui('providerList').onclick({target:{closest:()=>({dataset:{providerId:'MED-001'}})}});
 assert.equal(run('providerMode'),'detail');assert.equal(run('selectedProviderId'),'MED-001');
 assert.match(el(run('currentView')).innerHTML,/Volver a solicitudes de doctores y clínicas/);assert.doesNotMatch(el(run('currentView')).innerHTML,/id="(?:request-)?providerList"/);
 assert.match(ui('providerDetail').innerHTML,/patient-profile-detail-header/);assert.match(ui('providerDetail').innerHTML,/patient-profile-kpis/);
 assert.match(ui('providerDetail').innerHTML,/Pendiente/);assert.doesNotMatch(ui('providerDetail').innerHTML,/>pending</);
 run('backToProviders()');assert.equal(run('providerMode'),'list');assert.match(el(run('currentView')).innerHTML,/value="MELL"/);assert.equal(ui('providerCount').textContent,'1 solicitud');
});
test('All nine tabs and re-entry work, with no data changes from navigation',()=>{
 const before=run('JSON.stringify(db)');run("openProviderProfile('MED-001')");
 for(const tab of ['resumen','documentos','fiscal','contacto','datos','procedimientos','interesados','operar','historial']){
  ui('providerDetail .patient-profile-tabbar').onclick({target:{closest:()=>({dataset:{tab}})}});
  assert.equal(run('providerTab'),tab);assert.ok(ui('providerDetail').innerHTML.includes(`aria-selected="true" data-tab="${tab}"`));
 }
 run("backToProviders();openProviderProfile('MED-002')");assert.equal(run('providerTab'),'resumen');assert.match(ui('providerDetail').innerHTML,/Perfil de la clínica/);
 assert.equal(run('JSON.stringify(db)'),before);
 assert.equal(run("openProviderProfile('missing')"),false);assert.equal(run('selectedProviderId'),'MED-002');
 run("currentView='documents';setView('providers')");assert.equal(run('providerMode'),'list');
});
test('Dashboard/chart/priority links still open the chosen provider detail',()=>{
 run("closeModal=()=>{};openDashboardRecord('provider','MED-001')");assert.equal(run('providerMode'),'detail');assert.equal(run('selectedProviderId'),'MED-001');
 run("currentView='dashboard';openProviderFromChart('MED-002')");assert.equal(run('providerMode'),'detail');assert.equal(run('selectedProviderId'),'MED-002');
 run("currentView='dashboard';dashboardOpenPriority('provider','MED-003')");assert.equal(run('providerMode'),'detail');assert.equal(run('selectedProviderId'),'MED-003');
});
test('Spanish field/status/boolean presentation preserves zero and underlying data',()=>{
 const before=run('JSON.stringify(db)');
 for(const tab of ['documentos','fiscal','contacto','datos']){
  run(`providerTab='${tab}';selectedProviderId='MED-002';renderProviderDetail()`);
  assert.doesNotMatch(ui('providerDetail').innerHTML,/>true<|>false<|>pending<|>BANK_COVER<|>bank_cover<|>officePhone<|>clinicDocs<|>medval</);
 }
 assert.equal(run('providerDisplayValue(false)'),'No');assert.equal(run('providerDisplayValue(0)'),0);
 assert.equal(run('JSON.stringify(db)'),before);
 assert.match(run("providerDocumentHtml(db.providers[0],{type:'BANK_COVER',id:'test',status:'pending',fileName:'banco.pdf',source:'Demo'})"),/Carátula bancaria/);
});
test('Read-only controls and original handler permissions remain enforced',()=>{
 run("session=users.find(u=>u.role==='readonly');openProviderProfile('MED-001')");
 assert.match(ui('providerDetail').innerHTML,/onclick="providerApprove\('MED-001'\)" disabled/);
 const before=run('JSON.stringify(db)');
 for(const call of ["providerApprove('MED-001')","providerReject('MED-001')","providerFiscal('MED-001',true)","addProc('MED-001')","removeProc('MED-001','Rinoplastia')","providerSimple('MED-001','Contacto validado')"])run(call);
 assert.equal(run('JSON.stringify(db)'),before);
 run("providerTab='documentos';renderProviderDetail()");assert.match(ui('providerDetail').innerHTML,/onclick="openDocumentReview/);assert.doesNotMatch(ui('providerDetail').innerHTML,/onclick="docAction/);
 run("session=users.find(u=>u.role==='admin')");
});
test('Provider edits, fiscal decisions and correction queue survive rerender in detail',()=>{
 run("openProviderProfile('MED-001');providerTab='procedimientos'");const n=run('db.providers[0].procedures.length');run("addProc('MED-001')");assert.equal(run('db.providers[0].procedures.length'),n+1);assert.equal(run('providerMode'),'detail');
 assert.match(ui('providerDetail').innerHTML,/Procedimiento demo/);run("removeProc('MED-001','Procedimiento demo '+db.providers[0].procedures.length)");assert.equal(run('db.providers[0].procedures.length'),n);
 run("providerTab='fiscal';providerFiscal('MED-001',true)");assert.equal(run('providerTab'),'fiscal');assert.match(ui('providerDetail').innerHTML,/Aprobado/);
 run("openCorrection('provider','MED-001')");el('modalText').value='Perfil';el('modalReason').value='Revisar dato';
 run("confirmCorrection('provider','MED-001');renderCorrections()");assert.match(el('correctionsRows').innerHTML,/Revisar dato/);
 assert.equal(run('providerMode'),'detail');assert.equal(run("db.providers[0].status"),'correccion_requerida');
});
test('Provider CSS stays scoped, preserves semantic colors and defines responsive rules',()=>{
 const blocks=[...source.matchAll(/<style id="provider-consistency-styles">([\s\S]*?)<\/style>/g)];assert.equal(blocks.length,1);
 const css=blocks[0][1];
 assert.match(css,/#providers \.patient-profile-tabbar \.tab.active\{background:var\(--coral\)/);
 assert.match(css,/#providers \.provider-approve\{background:var\(--green-bg\)/);
 assert.match(css,/@media\(max-width:760px\)/);assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);assert.match(css,/overflow-x:auto/);assert.match(css,/flex-wrap:wrap/);
 // Every actual selector is scoped either to the providers view or its own nav item.
 for(const match of css.matchAll(/([^{}]+)\{/g)){
  const selector=match[1].replace(/\/\*[\s\S]*?\*\//g,'').trim();if(selector.startsWith('@'))continue;
  for(const part of selector.split(','))assert.ok(part.trim().startsWith('#providers ')||part.trim().startsWith('.nav-btn[data-id="providers"]'),part);
 }
 assert.match(source,/class="btn btn-sm btn-danger" type="button" onclick="providerReject/);
});
console.log(`PASS: ${count} provider layout/navigation regression cases. DOM stubs and CSS assertions do not replace visual browser QA.`);
