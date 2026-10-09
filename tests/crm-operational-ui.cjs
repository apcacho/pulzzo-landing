'use strict';
// Mounted shipped createApp handlers and real domain stores, with deterministic DOM
// fixtures. No browser process, geometry claim, network, or outbound communication.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const UI = require('../assets/js/crm-demo-ui.js');
const Store = require('../assets/js/crm-demo-store.js');
const Office = require('../assets/js/crm-demo-office.js');
const fixtureFile = path.join(__dirname, 'crm-demo-ui.cjs');
const source = fs.readFileSync(fixtureFile, 'utf8'), marker = source.indexOf('(async()=>{');
assert.ok(marker > 0);
const context = vm.createContext({require:createRequire(fixtureFile),__dirname,console,Blob,URL,URLSearchParams});
vm.runInContext(source.slice(0,marker)+'\nglobalThis.fixture={setup};',context,{filename:fixtureFile});
const cases=[];const test=(name,run)=>cases.push({name,run});
const good=r=>{assert.equal(r.ok,true,r.error);return r.value;};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function gate(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function setup(options={}){const h=context.fixture.setup(options);h.window.PulzzoCRMOffice=Office;return h;}
let seq=0;
function add(h,name,extra={}){seq++;return good(h.app.state.store.createContact({type:'patient',name,email:'contact'+seq+'@example.test',phone:'+1202555'+String(seq).padStart(4,'0'),originalSource:'manual',...extra},h.app.state.store.snapshot().revision));}
async function role(h,id){h.get('actorSelect').value=id;await h.get('actorSelect').dispatch('change');}
async function filter(h,id,value){h.get(id).value=value;await h.get(id).dispatch('change');}
function activity(h,c,type,at,extra={}){return good(h.app.state.store.addActivity({contactId:c.id,type,summary:'Intento ficticio',outcome:'no_response',contactAt:at,...extra},h.app.state.store.snapshot().revision));}
function auditSection(h){return h.get('contactDetail').innerHTML.split('aria-label="Historial administrativo de esta ficha"')[1]||'';}
function draft(h,c){h.app.navigate(c.type,'contacts',c.id);h.app.handlers.beginOnboarding();h.app.closeDialog();return Object.values(h.app.state.store.snapshot().expedients).find(e=>e.contactId===c.id);}

test('Native template exposes scoped filters, admin entry and shared compact/select design without another shell',()=>{
 const template=fs.readFileSync(path.join(__dirname,'../assets/js/crm-demo-template.js'),'utf8'),css=fs.readFileSync(path.join(__dirname,'../assets/css/crm-demo.css'),'utf8');
 for(const id of ['attentionFilter','inactivityMode','inactivityDays','inactivityDate','lifecycleFilter','identityReviewButton'])assert.match(template,new RegExp('id="'+id+'"'));
 assert.match(template,/value="days">Días elegidos/);assert.doesNotMatch(template,/id="inactivityDays"[^>]*value=/);
 assert.match(css,/\.attention-controls select,\.linked-records select\{width:100%/);assert.match(css,/@media\(max-width:620px\)/);
});

test('CDMX dates and canonical actual-contact timestamps are independent of device timezone and administrative writes',()=>{
 assert.equal(UI.businessDay('2026-10-09T05:59:59Z'),'2026-10-08');assert.equal(UI.businessDay('2026-10-09T06:00:00Z'),'2026-10-09');
 for(const type of ['note','other','stage_change','contact_reassigned','task_closed'])assert.equal(UI.contactAttemptAt({type,contactAt:'2026-10-09T01:00:00Z'}),'');
 assert.equal(UI.contactAttemptAt({type:'call',contactAt:'2026-09-01T12:00:00Z',occurredAt:'2026-10-09T12:00:00Z'}),'2026-09-01T12:00:00.000Z');
 assert.equal(UI.contactAttemptAt({type:'call',createdAt:'2026-10-09T12:00:00Z'}),'');
 assert.equal(UI.inactivityCutoff({inactivityMode:'days',inactivityDays:''},'2026-10-09T05:00:00Z'),'');
 assert.equal(UI.inactivityCutoff({inactivityMode:'days',inactivityDays:'7'},'2026-10-09T05:00:00Z'),'2026-10-01');
 for(const date of ['2026-02-30','2026-13-01','2099-01-01'])assert.equal(UI.inactivityCutoff({inactivityMode:'date',inactivityDate:date},'2026-10-09T12:00:00Z'),'');
});

test('Attention counts and directory use the same scoped base; notes, stages and closed tasks do not satisfy contact/follow-up',async()=>{
 const h=setup(),untouched=add(h,'Sin intento'),old=add(h,'Intento anterior'),recent=add(h,'Intento reciente'),note=add(h,'Nota administrativa');
 activity(h,old,'call','2026-09-01T12:00:00Z');activity(h,recent,'whatsapp','2026-10-09T10:00:00Z');activity(h,note,'note','2026-10-09T11:00:00Z');
 good(h.app.state.store.moveCommercialStage(untouched.id,'interested',{reason:'Cambio administrativo'},h.app.state.store.snapshot().revision));
 const task=good(h.app.state.store.createTask({contactId:old.id,title:'Tarea cerrada',dueAt:'2026-10-10T12:00:00Z'},h.app.state.store.snapshot().revision));good(h.app.state.store.closeTask(task.id,'Completada',h.app.state.store.snapshot().revision));
 good(h.app.state.store.createTask({contactId:recent.id,title:'Siguiente paso',dueAt:'2026-10-10T12:00:00Z'},h.app.state.store.snapshot().revision));h.app.render();
 assert.equal(h.get('contactCount').textContent,'4 contactos');assert.match(h.get('attentionFilter').innerHTML,/Sin próxima tarea · 3/);assert.match(h.get('attentionFilter').innerHTML,/Sin contacto registrado · 2/);
 await filter(h,'attentionFilter','no_contact');assert.equal(h.get('contactCount').textContent,'2 contactos');assert.match(h.get('contactList').innerHTML,/Sin intento/);assert.match(h.get('contactList').innerHTML,/Nota administrativa/);assert.doesNotMatch(h.get('contactList').innerHTML,/Intento anterior/);
 await filter(h,'attentionFilter','no_task');assert.equal(h.get('contactCount').textContent,'3 contactos');assert.doesNotMatch(h.get('contactList').innerHTML,/Intento reciente/);
 await filter(h,'attentionFilter','inactive');assert.equal(h.get('contactCount').textContent,'4 contactos','No unspecified automatic inactivity threshold');assert.match(h.get('attentionSummary').textContent,/Elige días o fecha/);
 await filter(h,'inactivityDays','7');assert.equal(h.get('contactCount').textContent,'1 contacto');assert.match(h.get('contactList').innerHTML,/Intento anterior/);assert.match(h.get('attentionSummary').textContent,/2026-10-02/);
 h.app.navigate('patient','tasks');h.app.navigate('doctor','contacts');h.app.navigate('patient','contacts');assert.equal(h.get('contactCount').textContent,'1 contacto');assert.equal(h.app.state.filters.inactivityDays,'7');
 await filter(h,'inactivityMode','date');await filter(h,'inactivityDate','2026-09-01');assert.equal(h.get('contactCount').textContent,'0 contactos','Strictly before the disclosed CDMX cutoff');await filter(h,'inactivityDate','2026-09-02');assert.equal(h.get('contactCount').textContent,'1 contacto');
 await role(h,'admin_demo');add(h,'Cartera privada Luis',{assignedKam:'kam_luis'});h.get('ownerFilter').value='kam_luis';h.app.render();assert.equal(h.get('contactCount').textContent,'0 contactos');await role(h,'kam_luis');assert.equal(h.get('ownerFilter').value,'');assert.equal(h.app.state.filters.attention,'inactive');assert.doesNotMatch(h.get('contactList').innerHTML,/Intento anterior/);assert.match(h.get('attentionFilter').innerHTML,/Sin contacto registrado · 1/);assert.equal(h.get('identityReviewButton').hidden,true);h.app.destroy();
});

test('Activity form uses friendly exact-reference selects and rejects forged IDs before persistence',async()=>{
 const h=setup(),c=add(h,'Solicitud exacta'),e=draft(h,c);h.app.handlers.activityEditor();const html=h.get('dialogContent').innerHTML;
 assert.match(html,/<select name="expedientId">/);assert.match(html,/Solicitud asistida/);assert.doesNotMatch(html,/<input[^>]*name="(?:expedientId|requestId|creditId|providerId|registrationId)"/);
 let r=await h.submit({type:'call',outcome:'no_response',note:'Intento ficticio',contactAt:'2026-10-08T10:00',expedientId:'foreign-expedient'});assert.match(r.error,/referencia no está vinculada/);assert.equal(h.app.state.store.listActivities().filter(a=>a.type==='call').length,0);
 r=await h.submit({type:'call',outcome:'no_response',note:'Intento ficticio',contactAt:'2026-10-08T10:00',expedientId:e.id});assert.equal(r.error,'');assert.equal(h.app.state.store.listActivities().find(a=>a.type==='call').expedientId,e.id);h.app.destroy();
});

test('Expediente dialog rechecks exact identity, role and revision before and after each async reference read',async()=>{
 for(const interrupt of ['navigate','actor','dismiss','revision','destroy','second-read']){
  const h=setup(),c=add(h,'Expediente protegido'),e=draft(h,c),pending=gate();let calls=0;
  h.window.PulzzoCRMOffice={...Office,listReferenceChoices(...args){calls++;const result=Office.listReferenceChoices(...args);return calls===(interrupt==='second-read'?2:1)?pending.promise.then(()=>result):result;}};
  const opening=h.app.handlers.viewExpedient(e.id);await tick();
  if(interrupt==='navigate')h.app.navigate('patient','tasks');if(interrupt==='actor')await role(h,'kam_luis');if(interrupt==='dismiss')h.app.closeDialog();if(interrupt==='destroy')h.app.destroy();
  if(interrupt==='revision'||interrupt==='second-read')good(h.app.state.store.updateContact(c.id,{notes:'Nuevo contexto'},h.app.state.store.snapshot().revision));
  pending.resolve();await opening;assert.equal(h.get('editorDialog').open,false,interrupt);h.app.destroy();
 }
 const h=setup(),c=add(h,'Consulta exacta'),e=draft(h,c);await h.app.handlers.viewExpedient('foreign-expedient');assert.equal(h.get('editorDialog').open,false);await h.app.handlers.viewExpedient(e.id);assert.equal(h.get('dialogTitle').textContent,'Expediente demo');assert.match(h.get('dialogContent').innerHTML,/Estado operativo/);assert.match(h.get('dialogContent').innerHTML,new RegExp(e.id));assert.doesNotMatch(h.get('dialogContent').innerHTML,/data-action="(?:edit|upload|refresh)/);h.app.destroy();
});

test('External CRM/BO changes close scoped read-only results and invalidate pending opens without discarding plain draft inputs',async()=>{
 const h=setup(),c=add(h,'Expediente en otra pestaña'),e=draft(h,c);const storageEvent=key=>{for(const fn of h.window.listeners.storage||[])fn({key});};
 await h.app.handlers.viewExpedient(e.id);assert.equal(h.get('editorDialog').open,true);storageEvent(Office.BO_KEY);assert.equal(h.get('editorDialog').open,false);assert.equal(h.get('dialogContent').innerHTML,'');
 await h.app.handlers.viewExpedient(e.id);const admin=Store.createStore({storage:h.storage,actor:{id:'admin_external',role:'admin'},now:()=>new Date('2026-10-09T12:00:00Z')});good(admin.reassignContact(c.id,'kam_luis','Cambio externo',admin.snapshot().revision));storageEvent(Store.STORAGE_KEY);assert.equal(h.get('editorDialog').open,false);assert.doesNotMatch(h.get('contactDetail').innerHTML,/Expediente en otra pestaña/);
 await role(h,'admin_demo');h.app.handlers.identityReview({type:'patient',email:c.email,phone:c.phone});let r=await h.submit({type:'patient',email:c.email,phone:c.phone});assert.equal(r.error,'');storageEvent(Store.STORAGE_KEY);assert.equal(h.get('editorDialog').open,false);assert.equal(h.app.state.dialogHandler,null);assert.equal(h.app.state.store.listIdentityReviews().length,0);
 h.app.navigate('patient','contacts',c.id);h.app.handlers.newContact();const draftHtml=h.get('dialogContent').innerHTML;storageEvent(Store.STORAGE_KEY);assert.equal(h.get('editorDialog').open,true);assert.equal(h.get('dialogContent').innerHTML,draftHtml);h.app.closeDialog();
 const pending=gate();h.window.PulzzoCRMOffice={...Office,listReferenceChoices(...args){return pending.promise.then(()=>Office.listReferenceChoices(...args));}};const opening=h.app.handlers.viewExpedient(e.id);storageEvent(Office.BO_KEY);pending.resolve();await opening;assert.equal(h.get('editorDialog').open,false);h.app.destroy();
});

test('Reassignment clears contact-bound editors immediately but preserves an unrelated new-contact form',async()=>{
 for(const editor of ['onboarding','activity','edit','new','task']){
  const h=setup(),c=add(h,'Ficha que cambia de responsable');draft(h,c);
  if(editor==='onboarding')h.app.handlers.onboardingEditor();if(editor==='activity')h.app.handlers.activityEditor();if(editor==='edit')h.app.handlers.newContact(c);if(editor==='new')h.app.handlers.newContact();if(editor==='task')h.app.handlers.taskEditor(null,c.id);
  const previous=h.get('dialogContent').innerHTML;const admin=Store.createStore({storage:h.storage,actor:{id:'admin_external',role:'admin'},now:()=>new Date('2026-10-09T12:00:00Z')});good(admin.reassignContact(c.id,'kam_luis','Cambio desde otra pestaña',admin.snapshot().revision));
  for(const fn of h.window.listeners.storage||[])fn({key:Store.STORAGE_KEY});
  if(editor==='new'){assert.equal(h.get('editorDialog').open,true);assert.equal(h.get('dialogContent').innerHTML,previous);}else{assert.equal(h.get('editorDialog').open,false,editor);assert.equal(h.get('dialogContent').innerHTML,'',editor);assert.equal(h.app.state.dialogHandler,null,editor);}
  assert.doesNotMatch(h.get('contactDetail').innerHTML,/Ficha que cambia de responsable/);h.app.destroy();
 }
});

test('Task contact scope is canonical across general navigation, Back/Forward, direct refresh and inaccessible routes',async()=>{
 const h=setup(),a=add(h,'Contacto A'),b=add(h,'Contacto B');for(const c of [a,b])good(h.app.state.store.createTask({contactId:c.id,title:'Pendiente '+c.name,dueAt:'2026-10-10T12:00:00Z'},h.app.state.store.snapshot().revision));
 h.app.navigate('patient','tasks',a.id);const scoped=h.window.location.hash;assert.equal(scoped,'#patient/tasks/'+a.id);assert.match(h.get('taskBoard').innerHTML,/Pendiente Contacto A/);assert.doesNotMatch(h.get('taskBoard').innerHTML,/Pendiente Contacto B/);
 await h.click('all-tasks');assert.equal(h.window.location.hash,'#patient/tasks');assert.match(h.get('taskBoard').innerHTML,/Pendiente Contacto B/);
 const restore=hash=>{h.window.location.hash=hash;for(const fn of h.window.listeners.popstate||[])fn({});};restore(scoped);assert.equal(h.app.state.taskContactFilter,a.id);assert.doesNotMatch(h.get('taskBoard').innerHTML,/Pendiente Contacto B/);restore('#patient/tasks');assert.equal(h.app.state.taskContactFilter,null);assert.match(h.get('taskBoard').innerHTML,/Pendiente Contacto B/);
 h.app.navigate('patient','tasks',b.id);restore(scoped);assert.equal(h.app.state.taskContactFilter,a.id);assert.doesNotMatch(h.get('taskBoard').innerHTML,/Pendiente Contacto B/);
 h.app.navigate('patient','contacts',a.id);await h.click(null,null,{view:'tasks'});assert.equal(h.window.location.hash,'#patient/tasks');assert.equal(h.app.state.taskContactFilter,null);
 h.app.destroy();h.window.location.hash=scoped;h.app=UI.createApp({window:h.window,document:h.document,storage:h.storage,storeModule:Store,now:()=>new Date('2026-10-09T12:00:00Z')});assert.equal(h.app.state.taskContactFilter,a.id);assert.doesNotMatch(h.get('taskBoard').innerHTML,/Pendiente Contacto B/);
 h.app.navigate('patient','tasks','foreign-contact');assert.doesNotMatch(h.get('taskBoard').innerHTML,/Pendiente Contacto A|Pendiente Contacto B/);assert.match(h.get('taskBoard').innerHTML,/ya no accesible/);h.app.destroy();
});

test('Blocked archive gives guarded direct routes to the same dossier and contact tasks, without cancelling either',async()=>{
 const h=setup();await role(h,'admin_demo');const c=add(h,'Archivo bloqueado'),other=add(h,'Otro prospecto'),e=draft(h,c);
 good(h.app.state.store.createTask({contactId:c.id,title:'Tarea exacta pendiente',dueAt:'2026-10-10T12:00:00Z'},h.app.state.store.snapshot().revision));good(h.app.state.store.createTask({contactId:other.id,title:'Tarea de otra ficha',dueAt:'2026-10-10T12:00:00Z'},h.app.state.store.snapshot().revision));
 h.app.handlers.archiveContact();assert.match(h.get('dialogContent').innerHTML,/data-action="view-expedient"/);assert.match(h.get('dialogContent').innerHTML,/data-action="contact-tasks"/);await h.click('contact-tasks',c.id);assert.equal(h.get('editorDialog').open,false);assert.equal(h.app.state.view,'tasks');assert.equal(h.app.state.selected,c.id);assert.match(h.get('taskBoard').innerHTML,/Tarea exacta pendiente/);assert.doesNotMatch(h.get('taskBoard').innerHTML,/Tarea de otra ficha/);await h.click('all-tasks');assert.match(h.get('taskBoard').innerHTML,/Tarea de otra ficha/);
 h.app.navigate('patient','contacts',c.id);h.app.handlers.archiveContact();await h.click('view-expedient',e.id);await tick();assert.equal(h.get('dialogTitle').textContent,'Expediente demo');assert.ok(h.app.state.store.snapshot().expedients[e.id]);assert.equal(h.app.state.store.listTasks().filter(t=>t.status==='open').length,2);h.app.destroy();
});

test('Changing selected operation during awaited evidence rolls back the file and never records activity',async()=>{
 const pending=gate(),removed=[];let allowed=true;
 const evidence={put:async(file,meta)=>{await pending.promise;return {id:'evidence_selected',name:'ficticio.pdf',mimeType:'application/pdf',size:100,uploadedAt:'2026-10-09T12:00:00Z',actorId:meta.actorId,contactId:meta.contactId};},remove:async id=>removed.push(id)};
 const h=setup({evidenceModule:{createEvidenceStore:()=>evidence}}),c=add(h,'Evidencia exacta'),e=draft(h,c);
 h.window.PulzzoCRMOffice={...Office,listReferenceChoices(...args){const result=Office.listReferenceChoices(...args);if(!allowed)result.expedientId=[];return result;}};h.app.handlers.activityEditor();
 const saving=h.submit({type:'call',outcome:'no_response',note:'Prueba',contactAt:'2026-10-08T10:00',expedientId:e.id},{evidence:[{name:'ficticio.pdf',size:100,type:'application/pdf'}]});await tick();allowed=false;pending.resolve();const r=await saving;assert.match(r.error,/operación seleccionada cambió/);assert.deepEqual(removed,['evidence_selected']);assert.equal(h.app.state.store.listActivities().filter(a=>a.type==='call').length,0);h.app.destroy();
});

test('Administrative history is contact-scoped, separately paginated and allowlisted instead of serializing private payloads',async()=>{
 const h=setup(),c=add(h,'Historial demo'),other=add(h,'Otra ficha');
 good(h.app.state.store.moveCommercialStage(c.id,'interested',{reason:'Contexto operativo'},h.app.state.store.snapshot().revision));
 for(let i=0;i<12;i++)good(h.app.state.store.updateContact(c.id,{notes:'Nota '+i},h.app.state.store.snapshot().revision));
 good(h.app.state.store.transact(h.app.state.store.snapshot().revision,(state,ctx)=>ctx.append('audit',{contactId:c.id,action:'contact_updated',changedFields:['notes','password'],reason:'token=SUPER_SECRET email secret@example.test +12025550101',nested:{password:'NESTED_SECRET',email:'private@example.test'},before:{email:'BEFORE_SECRET'},after:{token:'AFTER_SECRET'}})));
 good(h.app.state.store.transact(h.app.state.store.snapshot().revision,(state,ctx)=>ctx.append('audit',{contactId:other.id,action:'contact_updated',reason:'FOREIGN_REASON'})));
 h.app.navigate('patient','contacts',c.id);let audit=auditSection(h);assert.match(audit,/Página 1 de 2/);assert.equal((audit.match(/class="timeline-row"/g)||[]).length,10);assert.doesNotMatch(audit,/NESTED_SECRET|SUPER_SECRET|BEFORE_SECRET|AFTER_SECRET|private@example|FOREIGN_REASON|secret@example|12025550101/);
 await h.click('audit-next');audit=auditSection(h);assert.match(audit,/Página 2 de 2/);assert.match(audit,/Campos modificados: Notas/);assert.doesNotMatch(audit,/SUPER_SECRET|NESTED_SECRET|BEFORE_SECRET|AFTER_SECRET|FOREIGN_REASON|secret@example|12025550101/);await h.click('audit-next');assert.match(auditSection(h),/Página 2 de 2/);
 await role(h,'kam_luis');h.app.navigate('patient','contacts',c.id);assert.equal(auditSection(h),'');h.app.destroy();
});

test('Admin archives and restores the same prospect identity; KAM forged actions and active onboarding/tasks stay blocked',async()=>{
 const h=setup(),c=add(h,'Prospecto a conservar');h.app.navigate('patient','contacts',c.id);assert.doesNotMatch(h.get('contactDetail').innerHTML,/data-action="archive-contact"/);h.app.handlers.archiveContact();assert.equal(h.get('editorDialog').open,false);
 await role(h,'admin_demo');h.app.navigate('patient','contacts',c.id);h.app.handlers.archiveContact();let r=await h.submit({reason:''});assert.ok(r.error);r=await h.submit({reason:'Archivo manual ficticio'});assert.equal(r.error,'');assert.equal(h.app.state.store.listContacts().length,0);assert.equal(h.app.state.store.listArchivedContacts()[0].id,c.id);
 await filter(h,'lifecycleFilter','archived');assert.equal(h.get('contactCount').textContent,'1 contacto');await h.click('select-contact',c.id);assert.match(h.get('contactDetail').innerHTML,/Restaurar mismo prospecto/);assert.doesNotMatch(h.get('contactDetail').innerHTML,/data-action="(?:activity|new-task|edit-contact|begin-onboarding)"/);assert.match(auditSection(h),/Prospecto archivado/);
 h.app.handlers.restoreContact();r=await h.submit({reason:'Retomar contacto por petición demo'});assert.equal(r.error,'');const restored=h.app.state.store.getContact(c.id);for(const key of ['id','originalSource','referringKam','assignedKam','createdAt'])assert.deepEqual(restored[key],c[key]);assert.equal(h.app.state.filters.lifecycle,'active');assert.match(auditSection(h),/Prospecto restaurado/);
 const task=good(h.app.state.store.createTask({contactId:c.id,title:'Pendiente',dueAt:'2026-10-10T12:00:00Z'},h.app.state.store.snapshot().revision));h.app.handlers.archiveContact();r=await h.submit({reason:'No debe cancelar'});assert.match(r.error,/tareas/i);assert.equal(h.app.state.store.listTasks().find(t=>t.id===task.id).status,'open');h.app.closeDialog();
 good(h.app.state.store.closeTask(task.id,'Resuelta',h.app.state.store.snapshot().revision));draft(h,c);h.app.handlers.archiveContact();r=await h.submit({reason:'No debe cancelar expediente'});assert.match(r.error,/expediente|onboarding/i);assert.ok(h.app.state.store.getContact(c.id));h.app.destroy();
});

test('Identity review continues only an exact existing record or records pending, without identity takeover or KAM disclosure',async()=>{
 const h=setup(),c=add(h,'Identidad ya existente');h.app.handlers.identityReview();assert.equal(h.get('editorDialog').open,false);assert.match(h.get('notice').textContent,/Administración/);
 await role(h,'admin_demo');const before=h.app.state.store.snapshot().contacts[c.id];h.app.handlers.identityReview();let r=await h.submit({type:'patient',email:c.email,phone:'+12025550000'});assert.equal(r.error,'');assert.doesNotMatch(h.get('dialogContent').innerHTML,/value="resolved"/);r=await h.submit({status:'pending',reason:'Validar identificadores fuera de este flujo'});assert.equal(r.error,'');assert.equal(h.app.state.store.listIdentityReviews().length,1);assert.deepEqual(h.app.state.store.snapshot().contacts[c.id],before);
 h.app.handlers.identityReview({type:'patient',email:c.email,phone:c.phone});r=await h.submit({type:'patient',email:c.email,phone:c.phone});assert.equal(r.error,'');assert.match(h.get('dialogContent').innerHTML,/value="resolved"/);r=await h.submit({status:'resolved',reason:'Coincidencia exacta verificada en demo'});assert.equal(r.error,'');assert.equal(h.app.state.selected,c.id);assert.deepEqual(h.app.state.store.snapshot().contacts[c.id],before);assert.equal(h.app.state.store.listContacts().length,1);assert.equal(h.app.state.store.listIdentityReviews().length,2);
 h.app.handlers.identityReview({type:'doctor',email:c.email,phone:c.phone});r=await h.submit({type:'doctor',email:c.email,phone:c.phone});assert.equal(r.error,'');assert.doesNotMatch(h.get('dialogContent').innerHTML,/value="resolved"/);good(h.app.state.store.updateContact(c.id,{notes:'Newer revision'},h.app.state.store.snapshot().revision));r=await h.submit({status:'pending',reason:'Stale review'});assert.match(r.error,/cambi|actualiz/i);assert.equal(h.app.state.store.listIdentityReviews().length,2);h.app.closeDialog();
 await role(h,'kam_luis');h.app.handlers.newContact();r=await h.submit({type:'patient',name:'Intento de duplicación',email:c.email,phone:c.phone,originalSource:'manual'});assert.ok(r.error);assert.doesNotMatch(r.error,new RegExp(c.id+'|Identidad ya existente'));assert.equal(h.app.state.store.listContacts().length,0);h.app.destroy();
});

(async()=>{for(const {name,run}of cases){await run();console.log('PASS: '+name);}console.log('PASS: '+cases.length+' operational CRM DOM-handler groups. Browser rendering remains unverified.');})().catch(error=>{console.error(error);process.exitCode=1;});
