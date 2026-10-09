'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../backoffice.html'),'utf8');
const script=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m=>m[1].includes('const baseState='))[1];
function runtime(saved){
 const elements=new Map(),storage=new Map(saved||[]);let writes=0,focused='';
 function el(id){if(!elements.has(id))elements.set(id,{id,value:'',dataset:{},style:{},innerHTML:'',textContent:'',checked:false,disabled:false,files:[],classList:{add(){},remove(){},toggle(){},contains(){return false}},querySelector(s){return el(id+' '+s)},querySelectorAll(){return []},addEventListener(){},setAttribute(){},scrollIntoView(){},focus(){focused=id}});return elements.get(id)}
 const document={querySelector:s=>el(s.replace(/^#/,'')),querySelectorAll:()=>[],getElementById:id=>el(id),addEventListener(){},createElement:tag=>el(tag),body:{appendChild(){}}};
 const context=vm.createContext({document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{writes++;storage.set(k,String(v))},removeItem:k=>storage.delete(k)},window:{},Date,console,Intl,Blob,URL,setTimeout(){},clearTimeout(){},innerWidth:1200});
 vm.runInContext(script,context);const run=code=>vm.runInContext(code,context);
 run("session=users.find(u=>u.role==='admin')");
 return {run,el,storage,get writes(){return writes},get focused(){return focused},ui:id=>el(run('providerElementId('+JSON.stringify(id)+')'))};
}
let count=0;function test(name,fn){fn();count++;console.log('PASS',name)}
test('Legacy migration accepts only profile approval, keeps known dates and is idempotent',()=>{
 const r=runtime();
 r.run(`var cases={providers:[
 {id:'a',status:'aprobado',timeline:[]},
 {id:'b',status:'correccion_requerida',timeline:[{action:'Perfil aprobado',at:'fecha original'}]},
 {id:'c',status:'fiscal_banco_pendiente',timeline:[{action:'Fiscal y banco aprobado'}]},
 {id:'d',status:'rechazado',timeline:[{action:'Documentos aprobados'}]},
 {id:'e',status:'perfil_en_revision',timeline:[{action:'Perfil no aprobado'}]},
 {id:'f',status:'rechazado',onboarding:{approved:true,approvedAt:'original'},timeline:[]}
 ]};migrateProviderMembership(cases)`);
 assert.equal(r.run('cases.providers.map(providerIsApproved).join()'),'true,true,false,false,false,true');
 assert.equal(r.run('cases.providers[0].onboarding.approvedAt'),null);
 assert.equal(r.run('cases.providers[1].onboarding.approvedAt'),'fecha original');
 assert.equal(r.run('cases.providers[5].onboarding.approvedAt'),'original');
 const before=r.run('JSON.stringify(cases)');assert.equal(r.run('migrateProviderMembership(cases)'),false);assert.equal(r.run('JSON.stringify(cases)'),before);
});
test('Persisted migration never duplicates or resets records and reload performs no migration write',()=>{
 const r=runtime();r.run("db.providers[0].procedures=['Procedimiento personalizado'];db.providers[0].notes=[{text:'Conservar'}];db.providers.forEach(p=>delete p.onboarding);persist()");
 const ids=r.run('db.providers.map(p=>p.id).join()'),original=r.run('JSON.stringify(db.providers[0])');
 const reload=runtime([...r.storage]);assert.equal(reload.run('db.providers.map(p=>p.id).join()'),ids);
 assert.equal(reload.run('JSON.stringify((({onboarding,...p})=>p)(db.providers[0]))'),original);
 assert.equal(reload.run('db.providers.filter(providerIsApproved).length'),1);
 const again=runtime([...reload.storage]);assert.equal(again.writes,0);assert.equal(again.run('JSON.stringify(db)'),reload.run('JSON.stringify(db)'));
});
test('Seven primary destinations expose pending intake and established directory with distinct IDs and preserved filters',()=>{
 const r=runtime();assert.equal(r.run('navItems.length'),8);
 for(const role of ['admin','provider','readonly'])assert.equal(r.run(`navItems.filter(n=>['providers','providerRequests'].includes(n.id)&&n.roles.includes('${role}')).length`),2);
 r.run("setView('providerRequests')");assert.equal(r.ui('providerCount').textContent,'2 solicitudes');assert.doesNotMatch(r.ui('providerList').innerHTML,/Roberto/);
 assert.match(r.el('providerRequests').innerHTML,/id="request-dfName"/);
 r.ui('dfName').oninput({target:{value:'Laura'}});r.run("setView('providers')");assert.equal(r.ui('providerCount').textContent,'1 perfil');assert.match(r.ui('providerList').innerHTML,/Roberto/);assert.doesNotMatch(r.ui('providerList').innerHTML,/Laura|Reforma/);
 assert.match(r.el('providers').innerHTML,/id="dfName"/);assert.equal(r.el('providerRequests').innerHTML,'');
 r.run("setView('providerRequests')");assert.equal(r.run('providerFilters.query'),'Laura');assert.equal(r.ui('providerCount').textContent,'1 solicitud');
});
test('Approval creates a single durable milestone; correction, fiscal rejection and later review rejection retain directory membership',()=>{
 const r=runtime();r.run("openProviderProfile('MED-001');providerApprove('MED-001')");
 const approvedAt=r.run('db.providers[0].onboarding.approvedAt');assert.ok(approvedAt);assert.equal(r.run('db.providers.length'),3);
 r.run("providerTab='fiscal';providerFiscal('MED-001',false)");assert.equal(r.run('providerTab'),'fiscal');assert.equal(r.run('providerIsApproved(db.providers[0])'),true);
 r.run("openCorrection('provider','MED-001')");r.el('modalText').value='Documento nuevo';r.el('modalReason').value='Actualizar';r.run("confirmCorrection('provider','MED-001');providerReject('MED-001');setView('providers')");
 assert.match(r.ui('providerList').innerHTML,/Laura/);assert.match(r.ui('providerList').innerHTML,/Alta aprobada · Expediente permanente/);assert.match(r.ui('providerList').innerHTML,/Revisión actual: Rechazado/);
 assert.equal(r.run('db.providers[0].onboarding.approvedAt'),approvedAt);
 r.run("providerApprove('MED-001')");assert.equal(r.run('db.providers[0].onboarding.approvedAt'),approvedAt);
 const reload=runtime([...r.storage]);assert.equal(reload.run('db.providers.filter(providerIsApproved).length'),2);
});
test('Individual document review appears on directory badges without revoking approval',()=>{
 const r=runtime();r.run("openProviderProfile('MED-003');providerTab='documentos';docAction('provider','MED-003',db.providers[2].files[0].id,'correction_required')");
 assert.equal(r.run('currentView'),'providers');assert.equal(r.run('providerTab'),'documentos');assert.equal(r.run('providerIsApproved(db.providers[2])'),true);
 assert.match(r.ui('providerDetail').innerHTML,/Revisión actual: Corrección requerida/);
 r.run("docAction('provider','MED-003',db.providers[2].files[0].id,'approved')");assert.match(r.ui('providerDetail').innerHTML,/Revisión al día/);
});
test('Unapproved rejection never enters directory; intake history uses same record and shows later review',()=>{
 const r=runtime();r.run("providerReject('MED-002');setView('providerRequests')");assert.match(r.ui('providerList').innerHTML,/Reforma/);
 r.run("setView('providers')");assert.doesNotMatch(r.ui('providerList').innerHTML,/Reforma/);
 r.run("providerReject('MED-003');setView('providerRequests');providerFilters.history='approved';renderProviders()");assert.match(r.ui('providerList').innerHTML,/Roberto/);assert.match(r.ui('providerList').innerHTML,/Revisión actual: Rechazado/);assert.doesNotMatch(r.ui('providerList').innerHTML,/Reforma|Laura/);
 r.ui('providerList').onclick({target:{closest:()=>({dataset:{providerId:'MED-003'}})}});assert.equal(r.run('currentView'),'providerRequests');assert.match(r.ui('providerDetail').innerHTML,/MED-003/);
 r.run('backToProviders()');assert.equal(r.run('providerFilters.history'),'approved');assert.equal(r.run('currentView'),'providerRequests');assert.match(r.focused,/MED-003/);
});
test('Search matches real owner fields and normalizes phones/accents without borrowing patient IDs',()=>{
 const r=runtime();r.run("setView('providerRequests');db.providers[0].contact.email='personal@ejemplo.test';db.providers[0].applicationId='ALTA-UNICA'");
 for(const q of ['Méndez','MED-001','MELL850101AA1','MELL850101MDFRRR01','personal@ejemplo.test','5510002000','Ciudad de Mexico','ALTA-UNICA','Laser CO2']){
  r.run(`providerFilters.query=${JSON.stringify(q)}`);assert.equal(r.run('filteredProviders()[0]?.id'),'MED-001',q);
 }
 r.run("providerFilters.query='APP-PUL-1001'");assert.equal(r.run('filteredProviders().length'),0);
 r.run("providerFilters.query='';providerFilters.type='Clínica u hospital';providerFilters.status='pendiente'");assert.equal(r.run('filteredProviders()[0]?.id'),'MED-002');
});
test('Dashboard routes by membership and correction returns retain exact tab, owner and queue query after decisions',()=>{
 const r=runtime();r.run("openDashboardRecord('provider','MED-001')");assert.equal(r.run('currentView'),'providerRequests');
 r.run("openDashboardRecord('provider','MED-003')");assert.equal(r.run('currentView'),'providers');
 r.run("docAction('provider','MED-003',db.providers[2].files[0].id,'correction_required');queueFilters.corrections.query='Roberto';setView('corrections');var row=correctionQueueRows().find(r=>r.ref==='MED-003');openQueueCorrection(row)");
 assert.equal(r.run('currentView'),'providers');assert.equal(r.run('selectedProviderId'),'MED-003');assert.equal(r.run('providerTab'),'documentos');
 r.run("providerFiscal('MED-003',false);backToProviders()");assert.equal(r.run('currentView'),'corrections');assert.equal(r.run('queueFilters.corrections.query'),'Roberto');assert.equal(r.focused,'correctionsSearch');
 r.run("var row2=correctionQueueRows().find(r=>r.ref==='MED-002');openQueueCorrection(row2)");assert.equal(r.run('currentView'),'providerRequests');assert.equal(r.run('providerTab'),'documentos');assert.match(r.el('providerRequests').innerHTML,/request-providerDetail/);
});
test('Read-only actions preserve membership and data; authorized demo reset reinitializes one set',()=>{
 const r=runtime();r.run("session=users.find(u=>u.role==='readonly');openProviderProfile('MED-001')");const before=r.run('JSON.stringify(db)');
 for(const call of ["providerApprove('MED-001')","providerReject('MED-003')","providerFiscal('MED-003',false)","confirmCorrection('provider','MED-003')","docAction('provider','MED-003',db.providers[2].files[0].id,'rejected')"])r.run(call);
 assert.equal(r.run('JSON.stringify(db)'),before);assert.match(r.ui('providerDetail').innerHTML,/providerApprove\('MED-001'\)" disabled/);
 r.run("session=users.find(u=>u.role==='admin');providerApprove('MED-001');initApp()");r.el('resetBtn').onclick();assert.equal(r.run('db.providers.length'),3);assert.equal(r.run('db.providers.filter(providerIsApproved).length'),1);
});
test('Orange layout and mobile navigation are defined independently for both views',()=>{
 assert.match(source,/<style id="provider-intake-consistency-styles">/);assert.match(source,/#providerRequests \.patient-profile-tabbar \.tab.active\{background:var\(--coral\)/);
 assert.match(source,/\.nav-btn\[data-id="providerRequests"\]\{white-space:normal;min-width:0;overflow-wrap:anywhere/);
 const css=fs.readFileSync(path.join(__dirname,'../assets/css/backoffice-refinement.css'),'utf8');assert.match(css,/#providerRequests \.provider-row:has\(:focus-visible\)/);assert.doesNotMatch(css,/provider-row\.is-selected/);
});
console.log(`PASS: ${count} provider membership/intake regressions. Source/DOM/VM verification only; browser visual QA remains unrun.`);
