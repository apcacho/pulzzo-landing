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
test('Correction migration is idempotent and requester is not silently assigned',()=>{
 const r=runtime();r.run("var before=JSON.stringify(db.corrections);syncCorrectionRecords()");assert.equal(r.run('JSON.stringify(db.corrections)'),r.run('before'));
 assert.ok(r.run('db.corrections.length>0'));assert.ok(r.run("db.corrections.every(c=>!c.assignee)"));
 r.run("db.corrections.push({id:'dup-older',kind:db.corrections[0].kind,entityId:db.corrections[0].entityId,docId:db.corrections[0].docId,status:'received',createdAt:'2000-01-01'});syncCorrectionRecords();var once=JSON.stringify(db.corrections);syncCorrectionRecords()");assert.equal(r.run('JSON.stringify(db.corrections)'),r.run('once'));assert.ok(r.run("db.corrections.some(c=>c.legacyRecords?.length===1)"));
});
test('General correction lifecycle is explicit, assigned separately, retained through reload',()=>{
 const r=runtime();r.run("var p=db.patients[1];db.corrections.push({id:'general-test',kind:'patient',entityId:p.id,field:'Datos del perfil',status:'pending',createdAt:'2026-10-01T12:00:00Z',requestedBy:'solicitante@demo.test'});persist();var row=()=>correctionQueueRows().find(r=>r.correction?.id==='general-test')");
 assert.equal(r.run("changeCorrection(row(),'resolved')"),false);
 assert.equal(r.run("changeCorrection(row(),'assign',session.email)"),true);assert.equal(r.run('row().requestedBy'),'solicitante@demo.test');assert.equal(r.run('row().responsible'),r.run('session.email'));
 for(const state of ['received','in_review','resolved'])assert.equal(r.run(`changeCorrection(row(),'${state}')`),true);
 assert.equal(r.run('row().status'),'resolved');assert.equal(r.run('row().correction.history.length'),4);assert.equal(r.run("changeCorrection(row(),'resolved')"),false);
 const reloaded=runtime([...r.storage]);assert.equal(reloaded.run("correctionQueueRows().find(r=>r.correction?.id==='general-test').status"),'resolved');
 assert.equal(reloaded.run("changeCorrection(correctionQueueRows().find(r=>r.correction?.id==='general-test'),'pending')"),true);assert.equal(reloaded.run("db.corrections.filter(c=>c.id==='general-test').length"),1);
});
test('Received means operator-recorded, duplicate clicks do not duplicate history',()=>{
 const r=runtime();r.run("var row=correctionQueueRows().find(r=>r.kind==='patient');renderCorrections()");assert.match(r.el('correctionsRows').innerHTML,/>Revisar<\/button>/);assert.doesNotMatch(r.el('correctionsRows').innerHTML,/data-correction-action/);
 assert.equal(r.run("changeCorrection(row,'received')"),true);assert.equal(r.run("changeCorrection(row,'received')"),false);assert.equal(r.run('row.correction.history.length'),1);assert.equal(r.run('row.correction.receivedBy'),r.run('session.email'));assert.match(r.el('correctionsRows').innerHTML,/registro manual/);
});
test('Document approval resolves only its issue and reopening survives save/reload',()=>{
 const r=runtime();r.run("var p=db.patients[1],row=correctionQueueRows().find(r=>r.ref===p.id&&r.doc);db.corrections.push({id:'unrelated',kind:'patient',entityId:p.id,status:'pending'});backofficePatientDocAction(p.id,row.doc.id,'approved')");
 assert.equal(r.run('row.correction.status'),'resolved');assert.equal(r.run("db.corrections.find(c=>c.id==='unrelated').status"),'pending');
 assert.equal(r.run("changeCorrection(correctionQueueRows().find(r=>r.correction?.id===row.correction.id),'pending')"),true);assert.equal(r.run('row.doc.status'),'correction_required');assert.equal(r.run('row.correction.status'),'pending');
 const reloaded=runtime([...r.storage]);assert.equal(reloaded.run(`db.corrections.find(c=>c.id===${JSON.stringify(r.run('row.correction.id'))}).status`),'pending');
 r.run("var active=correctionQueueRows().find(r=>r.correction?.id===row.correction.id);changeCorrection(active,'received');changeCorrection(correctionQueueRows().find(r=>r.correction?.id===row.correction.id),'in_review')");assert.equal(r.run("changeCorrection(correctionQueueRows().find(r=>r.correction?.id===row.correction.id),'resolved')"),false);
});
test('Correction permissions guard handlers and role-appropriate assignees',()=>{
 const r=runtime();r.run("var patient=correctionQueueRows().find(r=>r.kind==='patient'),provider=correctionQueueRows().find(r=>r.kind==='provider');session=users.find(u=>u.role==='provider');var before=JSON.stringify(db)");
 assert.equal(r.run("changeCorrection(patient,'received')"),false);assert.equal(r.run("backofficePatientDocAction(patient.ref,patient.doc.id,'approved')"),false);assert.equal(r.run('JSON.stringify(db)'),r.run('before'));
 assert.equal(r.run("changeCorrection(provider,'received')"),true);assert.equal(r.run("changeCorrection(provider,'assign',users.find(u=>u.role==='operations').email)"),false);
 r.run("session=users.find(u=>u.role==='readonly');var before=JSON.stringify(db);renderCorrections()");assert.equal(r.run("changeCorrection(provider,'in_review')"),false);assert.equal(r.run('JSON.stringify(db)'),r.run('before'));assert.doesNotMatch(r.el('correctionsRows').innerHTML,/data-correction-action/);
});
test('Correction filters/clear use real handlers and unknown dates are never fabricated',()=>{
 const r=runtime();r.run('renderCorrections()');r.el('correctionsEntity').onchange({target:{value:'provider'}});assert.doesNotMatch(r.el('correctionsRows').innerHTML,/APP-PUL/);
 r.el('correctionsStatus').onchange({target:{value:'resolved'}});assert.match(r.el('correctionsRows').innerHTML,/Sin resultados/);r.el('correctionsClear').onclick();assert.equal(r.run('queueFilters.corrections.entity'),'');assert.equal(r.run('queueFilters.corrections.status'),'');
 for(const date of ['',null,'nonsense','2026-02-31','31 febrero 2026'])assert.equal(r.run(`correctionAge(${JSON.stringify(date)})`),'Sin fecha registrada');assert.equal(r.run("correctionAge('2026-10-01T12:00:00Z')"),'6 días desde creación');assert.equal(r.run("correctionAge('2026-10-07')"),'Hoy');assert.equal(r.run("correctionAge('7 oct 2026')"),'Hoy');
});
test('Offers include approved applications before an offer exists and search six fields',()=>{
 const r=runtime();r.run("var p=db.patients[1];p.offer=null;p.application.offerReady=false;p.application.offerAccepted=false;p.application.offerRejected=false;p.application.applicationStatus='aprobada_para_oferta';p.patient={...p.patient,fullName:'Ángela Única',rfc:'RFCEXCLUSIVO',curp:'CURPEXCLUSIVA',phone:'+52 (55) 1234-5678',email:'angela@prueba.test'};p.application.applicationId='SOL-EXCLUSIVA';renderOffers()");assert.equal(r.run('offerQueueRows().find(r=>r.ref===p.id).status'),'prepare');assert.match(r.el('offersRows').innerHTML,/Preparar oferta/);
 for(const q of ['angela unica','sol-exclusiva','rfcexclusivo','55 1234 5678','curpexclusiva','angela@prueba.test'])assert.ok(r.run(`offerQueueRows().some(r=>r.ref===p.id&&queueMatches(r,${JSON.stringify(q)}))`));
 r.el('offersStatus').onchange({target:{value:'prepare'}});assert.match(r.el('offersRows').innerHTML,/Por preparar/);assert.doesNotMatch(r.el('offersRows').innerHTML,/Aceptada/);r.el('offersSearch').oninput({target:{value:'MISSING'}});assert.match(r.el('offersRows').innerHTML,/Sin ofertas/);r.el('offersClear').onclick();assert.equal(r.run('offerQueueFilters.status'),'');
});
test('Canonical offer states win over stale flags and acceptance aliases all lock editing',()=>{
 const r=runtime();r.run("var p=db.patients[1];p.application.offerAccepted=false;p.application.offerRejected=false;p.application.contractSigned=false;p.application.applicationStatus='oferta_borrador';p.offer={status:'borrador'};p.application.offerReady=true");assert.equal(r.run('offerPipelineState(p)'),'draft');
 for(const status of ['aceptada','aceptado','accepted','oferta_aceptada','offer_accepted']){r.run(`p.offer.status='${status}'`);assert.equal(r.run('offerPipelineState(p)'),'accepted');assert.equal(r.run('financialOfferLocked(p)'),true);assert.equal(r.run("offerQueueAction({record:p,status:'accepted'})"),'Ver oferta');}
 r.run("p.offer={status:'enviada'};p.application.offerReady=true");assert.equal(r.run('offerPipelineState(p)'),'sent');r.run("p.offer.status='rechazada'");assert.equal(r.run('offerPipelineState(p)'),'rejected');
});
test('Offer row opens the sole editor and Back preserves filters without writing data',()=>{
 const r=runtime();r.run("renderPatients=()=>{};var before=JSON.stringify(db);offerQueueFilters.query=db.patients[0].id;renderOffers();var first=offerQueueRows().find(r=>queueMatches(r,offerQueueFilters.query))");
 r.el('offersRows').onclick({target:{closest:()=>({dataset:{offerIndex:'0'}})}});assert.equal(r.run('patientTab'),'oferta');assert.equal(r.run('selectedPatientId'),r.run('first.ref'));assert.equal(r.run('operationalReturnContext.view'),'offers');r.run('backToPatientRequests()');assert.equal(r.run('currentView'),'offers');assert.equal(r.el('offersSearch').focused,true);assert.equal(r.run('JSON.stringify(db)'),r.run('before'));
 r.run("session=users.find(u=>u.role==='readonly');renderOffers()");assert.match(r.el('offersRows').innerHTML,/Ver oferta/);assert.doesNotMatch(r.el('offersRows').innerHTML,/disabled/);
});
test('History stores true prospective before/after workflow values without sensitive snapshots',()=>{
 const r=runtime();r.run("var p=db.patients[1];p.patient.password='SECRET';p.patient.ciec='SECRET';p.documents[0].content='SECRET';var before=p.application.applicationStatus;approvePatient(p.id);var event=db.audit.find(e=>e.changes?.some(c=>c.field==='applicationStatus'))");assert.equal(r.run('event.changes[0].previous'),r.run('before'));assert.equal(r.run('event.changes[0].next'),'aprobada_para_oferta');assert.equal(r.run('event.entity'),r.run('p.id'));assert.equal(r.run('event.entityKind'),'patient');assert.doesNotMatch(r.run('JSON.stringify(db.audit.filter(e=>e.changes))'),/SECRET|password|ciec|content/);
 r.run("var count=db.audit.length;persist();persist()");assert.equal(r.run('db.audit.length'),r.run('count'));
});
test('History handles search/date/user/entity/action, old timestamps, orphans and pagination',()=>{
 const r=runtime();r.run("db.audit=[...Array.from({length:65},(_,i)=>({at:'8 oct 2026, 12:00',createdAt:'2026-10-08T12:00:00Z',user:i%2?'one@demo':'two@demo',action:'Acción '+i,entity:db.patients[0].id})),{at:'sin fecha',user:'old',action:'Anterior',entity:'ORPHAN'}];var before=JSON.stringify(db.audit);renderHistory()");assert.equal((r.el('historyRows').innerHTML.match(/<article /g)||[]).length,30);assert.equal(r.el('historyPrev').disabled,true);r.el('historyNext').onclick();assert.equal(r.run('historyFilters.page'),2);
 r.el('historyUser').onchange({target:{value:'one@demo'}});assert.equal(r.run('historyFilters.page'),1);assert.doesNotMatch(r.el('historyRows').innerHTML,/two@demo/);
 r.el('historyClear').onclick();r.el('historyFrom').onchange({target:{value:'2026-10-09'}});assert.match(r.el('historyRows').innerHTML,/Sin eventos/);r.el('historyTo').onchange({target:{value:'2026-10-01'}});assert.match(r.el('historyCount').textContent,/Desde/);
 r.el('historyClear').onclick();r.el('historyAction').onchange({target:{value:'Anterior'}});assert.match(r.el('historyRows').innerHTML,/Expediente no disponible/);assert.match(r.el('historyRows').innerHTML,/disabled/);assert.match(r.el('historyRows').innerHTML,/Sin detalle anterior/);
 r.el('historyClear').onclick();r.el('historySearch').oninput({target:{value:'acción 64'}});assert.equal((r.el('historyRows').innerHTML.match(/<article /g)||[]).length,1);assert.equal(r.run('JSON.stringify(db.audit)'),r.run('before'));
});
test('History links exact records with origin/focus and rejects ambiguous IDs',()=>{
 const r=runtime();r.run("renderPatients=()=>{};renderProviders=()=>{};db.audit=[{at:'2026-10-01',action:'Test',entity:db.providers[0].id,entityKind:'provider'}];var before=JSON.stringify(db);renderHistory()");r.el('historyRows').onclick({target:{closest:()=>({dataset:{historyIndex:'0'}})}});assert.equal(r.run('selectedProviderId'),r.run('db.providers[0].id'));assert.equal(r.run('operationalReturnContext.view'),'history');r.run('backToProviders()');assert.equal(r.run('currentView'),'history');assert.equal(r.el('historySearch').focused,true);assert.equal(r.run('JSON.stringify(db)'),r.run('before'));
 r.run("db.providers.push({...db.providers[0],id:db.patients[0].id})");assert.equal(r.run('historyTarget({entity:db.patients[0].id})'),null);assert.equal(r.run("historyTarget({entity:db.patients[0].id,entityKind:'patient'}).kind"),'patient');
});
test('No data changes from views; versioned configuration module is explicitly loaded',()=>{
 const r=runtime();r.run("var before=JSON.stringify(db);renderCorrections();renderOffers();renderHistory()");assert.equal(r.run('JSON.stringify(db)'),r.run('before'));
 assert.match(source,/<script src="assets\/js\/backoffice-configuration.js"><\/script>/); // Functional version/scope invariants are covered by backoffice-configuration.cjs.
});
console.log(`PASS: ${count} operational workflow DOM/VM regressions. No browser visual QA claimed.`);
