const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../backoffice.html'),'utf8');
const script=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m=>m[1].includes('const baseState='))[1];
function runtime(saved){
 const elements=new Map();
 function el(id){if(!elements.has(id))elements.set(id,{id,value:'',dataset:{},style:{},innerHTML:'',textContent:'',checked:false,disabled:false,files:[],classList:{add(){},remove(){},toggle(){},contains(){return false}},querySelector(){return null},querySelectorAll(){return []},addEventListener(){},setAttribute(){},focus(){this.focused=true},scrollIntoView(){}});return elements.get(id)}
 const storage=new Map(saved||[]);
 const document={querySelector:s=>el(s.replace(/^#/,'')),querySelectorAll:s=>s==='.offer-procedure-card'?[...elements.values()].filter(x=>/^offerProcCard\d+$/.test(x.id)):[],getElementById:id=>elements.get(id)||null,addEventListener(){},createElement:tag=>el(tag),body:{appendChild(){}}};
 const FixedDate=class extends Date {constructor(...a){super(...(a.length?a:['2026-10-07T12:00:00Z']))} static now(){return new Date('2026-10-07T12:00:00Z').getTime()}};
 const context=vm.createContext({document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},window:{},Date:FixedDate,console,Intl,Blob,URL,setTimeout(){},clearTimeout(){},innerWidth:1200});
 vm.runInContext(script,context);
 const run=code=>vm.runInContext(code,context);
 // No browser rendering is simulated: preserve real calculations/handlers, suppress repaint only.
 run("render=()=>{};renderPatientDetail=()=>{};closeModal=()=>{};session=users.find(x=>x.role==='admin');");
 return {run,el,storage};
}
let count=0;function test(name,fn){fn();count++;console.log('PASS: '+name)}
const r=runtime();
// Use deterministic, distinct identity fields on actual-shaped records, never unrelated reference contacts.
r.run(`var p=db.patients[1];p.patient={...p.patient,fullName:'Ángela Única',rfc:'RFCEXCLUSIVO',curp:'CURPEXCLUSIVA',phone:'+52 (55) 1234-5678',email:'angela@prueba.test'};p.application.applicationId='SOL-EXCLUSIVA';var provider=db.providers[1];provider.profile.name='Clínica Única';provider.contact.email='clinica@prueba.test';provider.applicationId='ALTA-EXCLUSIVA';provider.medval.curp='PROVCURP';`);
for(const view of ['documents','corrections'])test(view+' searches all six patient and provider fields independently',()=>{
 for(const q of ['  ANGELA unica  ','sol-exclusiva','rfcexclusivo','55 1234 5678','curpexclusiva','angela@prueba.test'])assert.ok(r.run(`(${view==='documents'?'documentQueueRows':'correctionQueueRows'}()).some(row=>row.ref===p.id&&queueMatches(row,${JSON.stringify(q)}))`),q);
 for(const q of ['clinica unica','alta-exclusiva','CPR260101D01','5520003000','PROVCURP','clinica@prueba.test'])assert.ok(r.run(`(${view==='documents'?'documentQueueRows':'correctionQueueRows'}()).some(row=>row.ref===provider.id&&queueMatches(row,${JSON.stringify(q)}))`),q);
 assert.equal(r.run(`(${view==='documents'?'documentQueueRows':'correctionQueueRows'}()).some(row=>row.ref!==p.id&&queueMatches(row,'angela@prueba.test'))`),false);
});
test('Normalization, partial terms, missing data and empty query are safe',()=>{
 assert.equal(r.run("queueMatches({kind:'patient',record:p},'1234-56')"),true);
 assert.equal(r.run("queueMatches({kind:'patient',record:p},'rfcExcl')"),true);
 assert.equal(r.run("queueMatches({kind:'provider',record:{}},'anything')"),false);
 assert.equal(r.run("queueMatches({kind:'patient'},'   ')"),true);
 assert.equal(r.run("queueMatches({kind:'patient',record:p},'1234evil')"),false);
 assert.equal(r.run("queueMatches({kind:'provider',record:db.providers[0]},'APP-PUL-1001')"),false,'Name-only relationships must not match another owner’s application');
});
test('Search rerenders only rows, empty result and clear work in each queue',()=>{
 for(const view of ['documents','corrections']){
  r.run(view==='documents'?'renderDocuments()':'renderCorrections()');const input=r.el(view+'Search');input.oninput({target:{value:'no-such-record'}});
  assert.match(r.el(view+'Rows').innerHTML,/Sin resultados/);assert.match(r.el(view).innerHTML,/type="search"/);
  r.el(view+'Clear').onclick();assert.equal(input.value,'');assert.equal(input.focused,true);assert.doesNotMatch(r.el(view+'Rows').innerHTML,/Sin resultados/);
 }
});
test('Exact patient/provider correction destination, context, return, and no mutations',()=>{
 r.run("renderPatients=()=>{};renderProviders=()=>{};var before=JSON.stringify(db);queueFilters.corrections.query='angela';var row=correctionQueueRows().find(r=>r.ref===p.id);openQueueCorrection(row)");
 assert.equal(r.run('selectedPatientId'),r.run('p.id'));assert.equal(r.run('patientTab'),'documentos');assert.equal(r.el('patientCorrectionContext').focused,true);assert.match(r.run("correctionContextHtml('patient',p.id)"),/INE reverso/);
 r.run('backToPatientRequests()');assert.equal(r.run('currentView'),'corrections');assert.equal(r.run('queueFilters.corrections.query'),'angela');assert.equal(r.el('correctionsSearch').focused,true);
 r.run("openQueueCorrection(correctionQueueRows().find(r=>r.ref===provider.id))");assert.equal(r.run('selectedProviderId'),r.run('provider.id'));assert.equal(r.run('providerTab'),'documentos');assert.equal(r.el('providerCorrectionContext').focused,true);r.run('backToProviders()');assert.equal(r.run('currentView'),'corrections');assert.equal(r.run('JSON.stringify(db)'),r.run('before'));
});
test('General corrections appear once and route without document mutation',()=>{
 r.run("db.providers[0].status='correccion_requerida';db.providers[0].timeline.unshift({action:'Corrección solicitada',comment:'General'});db.corrections=[{kind:'provider',entityId:'MED-001',field:'Datos del perfil',comment:'General',status:'correction_required'}];var general=correctionQueueRows().filter(r=>r.ref==='MED-001'&&!r.doc)");assert.equal(r.run('general.length'),1);r.run('openQueueCorrection(general[0])');assert.equal(r.run('providerTab'),'resumen');
 r.run("db.corrections.push({kind:'patient',entityId:p.id,field:'Datos',status:'correction_required'});openQueueCorrection(correctionQueueRows().find(r=>r.kind==='patient'&&!r.doc))");assert.equal(r.run('patientTab'),'datos');
});
test('Orphans, stale documents, and read-only navigation are safe',()=>{
 r.run("db.corrections.push({kind:'provider',entityId:'ORPHAN',field:'Datos'},{kind:'patient',entityId:p.id,docId:'MISSING',field:'Faltante'});queueFilters.corrections.query='';renderCorrections()");assert.match(r.el('correctionsRows').innerHTML,/disabled[^>]*[^]*Expediente no disponible/);assert.match(r.el('correctionsRows').innerHTML,/Documento no disponible/);
 assert.equal(r.run("openQueueCorrection(correctionQueueRows().find(r=>r.ref==='ORPHAN'))"),false);
 assert.equal(r.run("openQueueCorrection(correctionQueueRows().find(r=>r.missingDocument))"),false);
 r.run("session=users.find(u=>u.role==='readonly');var safeBefore=JSON.stringify(db);var readonlyRow=correctionQueueRows().find(r=>r.doc)");assert.equal(r.run('correctionActionLabel(readonlyRow)'),'Ver expediente');assert.equal(r.run('openQueueCorrection(readonlyRow)'),true);assert.equal(r.run('JSON.stringify(db)'),r.run('safeBefore'));
});
test('Provider selection has no persistent visual class; hover and keyboard equivalent remain scoped',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../assets/css/backoffice-refinement.css'),'utf8');assert.doesNotMatch(source,/provider-row \$\{p.id===selectedProviderId/);assert.doesNotMatch(css,/provider-row\.is-selected/);assert.match(css,/#providers \.provider-row:hover,\s*#providers \.provider-row:has\(:focus-visible\)/);
 r.run("currentView='providerRequests';providerFilters={query:'Laura',type:'Doctor independiente',status:'revision'}");assert.equal(r.run('filteredProviders().length'),0);r.run("currentView='providerRequests';providerFilters={query:'Laura',type:'Doctor independiente',status:''}");assert.equal(r.run('filteredProviders().length'),1);
});
test('Delegated action opens its exact row; document preview and empty queues are safe',()=>{
 const x=runtime();x.run("renderPatients=()=>{};renderProviders=()=>{};renderCorrections();var first=correctionQueueRows()[0]");
 x.el('correctionsRows').onclick({target:{closest:()=>({disabled:false,dataset:{queueIndex:'0'}})}});assert.equal(x.run('reviewContext.entityId'),x.run('first.ref'));assert.match(x.el('modal').innerHTML,/Seguimiento de corrección/);
 x.run("closeDocumentReview();queueFilters.documents.status='';renderDocuments();var firstDoc=documentQueueRows()[0]");x.el('documentsRows').onclick({target:{closest:()=>({disabled:false,dataset:{queueIndex:'0'}})}});assert.equal(x.run('reviewContext.docId'),x.run('firstDoc.doc.id'));assert.equal(x.run('reviewContext.entityId'),x.run('firstDoc.ref'));
 x.run("db.patients=[];db.providers=[];db.corrections=[];renderDocuments();renderCorrections()");assert.match(x.el('documentsRows').innerHTML,/Sin documentos registrados/);assert.match(x.el('correctionsRows').innerHTML,/Sin correcciones pendientes/);
});
console.log(`PASS: ${count} backoffice queue regressions; DOM/VM and source contracts, not browser geometry.`);
