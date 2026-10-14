'use strict';
// Real CRM DOM handlers and store. No browser, authentication or outbound link is opened.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const Store = require('../assets/js/crm-demo-store.js');
const UI = require('../assets/js/crm-demo-ui.js');
const fixtureFile = path.join(__dirname, 'crm-demo-ui.cjs');
const source = fs.readFileSync(fixtureFile, 'utf8');
const context = vm.createContext({require:createRequire(fixtureFile),__dirname,console,Blob,URL,URLSearchParams});
const fixture = source.slice(0,source.indexOf('(async()=>{')).replace("now:()=>new Date('2026-10-09T12:00:00.000Z')", "now:options.now||(()=>new Date('2026-10-09T12:00:00.000Z'))");
vm.runInContext(fixture+'\nglobalThis.fixture={setup,MemoryStorage};',context,{filename:fixtureFile});
const setup = options => context.fixture.setup(options);
const good = result => {assert.equal(result.ok,true,result.error);return result.value;};
const cases=[];
const test=(name,run)=>cases.push({name,run});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function role(h,id){h.get('actorSelect').value=id;await h.get('actorSelect').dispatch('change');}
async function add(h,kind='patient',values={}){h.app.navigate(kind,'contacts');h.app.handlers.newContact();const result=await h.submit({name:'Prospecto ficticio',phone:'5512345678',...values});assert.equal(result.error,'');return h.app.state.store.listContacts({type:kind}).at(-1);}
function invitation(h,c,ttlMinutes=60){h.app.navigate(c.type,'contacts',c.id);const exp=good(h.app.state.assisted.beginDraft({contactId:c.id,kind:c.type},h.app.state.store.snapshot().revision));const inv=good(h.app.state.assisted.invite(exp.id,{email:c.email,ttlMinutes},h.app.state.store.snapshot().revision));h.app.render();return {exp,inv};}

test('New prospect only requires a name and phone OR email; optional source stays unknown and owner follows role',async()=>{
 const h=setup();h.app.handlers.newContact();const html=h.get('dialogContent').innerHTML;
 assert.match(html,/Teléfono o correo/);assert.match(html,/Con uno de los dos es suficiente/);
 assert.doesNotMatch(html,/name="type"|Origen inicial|Captura manual|name="assignedKam"/);
 assert.match(html,/<details class="details-form prospect-options"><summary>Más datos \(opcional\)/);
 assert.match(html,/<option value="unknown" selected>No lo sé/);
 let result=await h.submit({name:'Falta contacto'});assert.match(result.error,/teléfono o un correo/);
 result=await h.submit({name:'Solo teléfono',phone:'55 1234 5678'});assert.equal(result.error,'');
 let contact=h.app.state.store.listContacts()[0];assert.equal(contact.assignedKam,'kam_ana');assert.equal(contact.originalSource,'unknown');assert.equal(contact.captureMechanism,'crm_manual');assert.equal(contact.email,'');
 h.app.handlers.newContact();result=await h.submit({name:'Solo correo',email:'solo@example.test'});assert.equal(result.error,'');
 assert.equal(h.app.state.store.listContacts().find(c=>c.email==='solo@example.test').phone,'');
 await role(h,'admin_demo');h.app.handlers.newContact();assert.match(h.get('dialogContent').innerHTML,/Asignar responsable/);
 result=await h.submit({name:'Admin responsable',email:'admin@example.test'});assert.equal(result.error,'');contact=h.app.state.store.listContacts().find(c=>c.email==='admin@example.test');assert.equal(contact.assignedKam,'admin_demo');assert.equal(contact.originalSource,'unknown');
 await role(h,'leader_demo');h.app.handlers.newContact();assert.equal(h.get('editorDialog').open,false);assert.match(h.get('notice').textContent,/consulta/);h.app.destroy();
});

test('Registrar contacto is compact, prefilled, and optional follow-up remains atomic',async()=>{
 const h=setup();const c=await add(h);h.app.handlers.activityEditor();const html=h.get('dialogContent').innerHTML;
 assert.match(html,new RegExp('name="contactAt"[^>]*value="'+UI.localInput('2026-10-09T12:00:00Z')+'"'));
 assert.match(html,/attachment-control/);assert.match(html,/📎/);assert.match(html,/<details class="details-form contact-follow-up"><summary>Agregar seguimiento/);
 assert.doesNotMatch(html,/<legend>[123]\.|<legend>.*Evidencia/);
 let result=await h.submit({type:'call',outcome:'reached',note:'Conversación ficticia',contactAt:UI.localInput('2026-10-09T11:30:00Z')});assert.equal(result.error,'');
 assert.equal(h.app.state.store.listActivities().filter(a=>a.type==='call').length,1);assert.equal(h.app.state.store.listTasks().length,0);
 h.app.handlers.activityEditor();result=await h.submit({type:'whatsapp',outcome:'follow_up',note:'Acordamos continuar',contactAt:UI.localInput('2026-10-09T11:35:00Z'),nextAction:'Llamar de nuevo',nextActionAt:'2026-10-10T11:00'});assert.equal(result.error,'');assert.equal(h.app.state.store.listTasks().filter(t=>t.title==='Llamar de nuevo').length,1);
 h.app.handlers.activityEditor();result=await h.submit({type:'call',outcome:'reached',note:'Futuro',contactAt:'2026-10-10T12:00'});assert.match(result.error,/futuro/);assert.equal(h.app.state.store.listActivities().filter(a=>a.type==='call').length,1);h.app.destroy();
});

test('Full onboarding replaces both provisional capture and separate document actions; staff mode remains explicit',async()=>{
 for(const kind of ['patient','doctor']){
  const h=setup(),calls=[],destinations=[];h.window.sessionStorage=new context.fixture.MemoryStorage();h.window.location.assign=url=>destinations.push(url);
  h.window.PulzzoCRMOnboarding={start(input){calls.push(input);return {url:(kind==='doctor'?'registro-doctor.html':'solicitud-paciente.html')+'?crmExp='+input.expId+'&crmMode=assisted'};},summary(exp){return {fieldCount:3,documentCount:0};}};
  const c=await add(h,kind,{email:kind+'@example.test'});assert.match(h.get('contactDetail').innerHTML,/Yo le ayudo a completarlo/);h.app.handlers.beginOnboarding();
  assert.equal(calls.length,1);assert.equal(calls[0].actor.id,'kam_ana');assert.equal(calls[0].actor.role,'kam');assert.equal(calls[0].sessionStorage,h.window.sessionStorage);assert.match(calls[0].returnUrl,/^crm-demo.html#(?:patient|doctor)\/contacts\//);assert.equal(h.get('editorDialog').open,false);
  assert.match(destinations[0],new RegExp(kind==='doctor'?'registro-doctor.html':'solicitud-paciente.html'));assert.match(destinations[0],/crmMode=assisted/);
  const html=h.get('contactDetail').innerHTML;assert.match(html,/Avance guardado/);assert.match(html,/Responsable/);assert.match(html,/Pendiente:/);assert.match(html,/Yo le ayudo a completarlo/);assert.equal((html.match(/<h4>Enlace para el cliente<\/h4>/g)||[]).length,0,'unissued links have no duplicate section');assert.doesNotMatch(html,/Captura asistida provisional|data-action="upload-document"|Editar borrador/);
  h.app.handlers.uploadDocument();assert.equal(calls.length,2);assert.equal(h.get('editorDialog').open,false);
  await role(h,'leader_demo');h.app.navigate(kind,'contacts',c.id);h.app.handlers.onboardingEditor();assert.equal(calls.length,2);assert.doesNotMatch(h.get('contactDetail').innerHTML,/data-action="edit-onboarding"|data-action="invite-holder"/);h.app.destroy();
 }
});

test('Only current same-origin full-form routes can be opened',async()=>{
 const h=setup(),destinations=[];h.window.location.assign=url=>destinations.push(url);const c=await add(h,'patient',{email:'route@example.test'});
 h.window.PulzzoCRMOnboarding={start(){return {url:'https://evil.test/solicitud-paciente.html?crmMode=assisted&crmExp=other'};}};
 h.app.handlers.beginOnboarding();assert.equal(destinations.length,0);assert.match(h.get('notice').textContent,/ruta no corresponde/);
 const exp=Object.values(h.app.state.store.snapshot().expedients)[0];h.window.PulzzoCRMOnboarding.start=()=>({url:'solicitud-paciente.html?crmMode=holder&crmExp='+exp.id});h.app.handlers.onboardingEditor();assert.equal(destinations.length,0);
 const admin=Store.createStore({storage:h.storage,actor:{id:'admin_demo',role:'admin'}});good(admin.reassignContact(c.id,'kam_luis','Prueba de permiso',admin.snapshot().revision));h.app.handlers.onboardingEditor();assert.equal(destinations.length,0);h.app.destroy();
});

test('Legacy link requires explicit migration; stable URL survives time and closes on reassignment',async()=>{
 let now=new Date('2026-10-09T12:00:00Z');const h=setup({now:()=>now});const c=await add(h,'patient',{email:'link@example.test'});const {exp,inv}=invitation(h,c,1);
 h.app.handlers.inviteHolder();assert.match(h.get('dialogContent').innerHTML,/Actualizar enlace/);assert.doesNotMatch(h.get('dialogContent').innerHTML,new RegExp(inv.token));
 await h.click('migrate-entry');assert.equal((await h.submit()).error,'');const token=h.app.state.store.snapshot().expedients[exp.id].entryLink.token;assert.notEqual(token,inv.token);assert.match(h.get('dialogContent').innerHTML,new RegExp(token));
 await h.click('copy-entry');assert.equal(h.clipboard.length,1);now=new Date('2027-01-09T12:00:00Z');h.app.closeDialog();h.app.handlers.inviteHolder();assert.match(h.get('dialogContent').innerHTML,new RegExp(token));
 const admin=Store.createStore({storage:h.storage,actor:{id:'admin_demo',role:'admin'}});good(admin.reassignContact(c.id,'kam_luis','Mover ficha',admin.snapshot().revision));for(const fn of h.window.listeners.storage||[])fn({key:Store.STORAGE_KEY});assert.equal(h.get('editorDialog').open,false);assert.doesNotMatch(h.get('dialogContent').innerHTML,new RegExp(token));h.app.destroy();
});

test('Global referral targets the public entry gateway; copy/open never records contact, sent or reply',async()=>{
 const h=setup();await add(h,'patient',{email:'referral@example.test'});
 for(const kind of ['patient','doctor']){h.app.navigate(kind,'contacts');await h.click('referral');const html=h.get('dialogContent').innerHTML;assert.match(html,new RegExp('registro-'+(kind==='patient'?'paciente':'doctor')+'\\.html\\?ref='));assert.doesNotMatch(html,/asistido-demo\.html\?mode=self/);const url=html.match(/data-url="([^"]+)"/)[1].replace(/&amp;/g,'&');await h.click('copy-referral',null,{url});assert.equal(h.app.state.store.listActivities().filter(a=>['call','whatsapp','email','meeting'].includes(a.type)).length,0);h.app.closeDialog();}
 assert.equal(h.clipboard.length,2);h.app.destroy();
});


test('Full-form documents open from the exact stored expediente without IndexedDB and stale navigation suppresses previews',async()=>{
 const Shared=require('../assets/js/crm-onboarding-session.js');
 const h=setup(),destinations=[];h.window.sessionStorage=new context.fixture.MemoryStorage();h.window.PulzzoCRMOnboarding=Shared;h.window.location.assign=url=>destinations.push(url);
 const c=await add(h,'patient',{email:'document@example.test'});h.app.handlers.beginOnboarding();assert.equal(destinations.length,0,'Unregistered prospect must not open assisted capture');
 let exp=Object.values(h.app.state.store.snapshot().expedients)[0];require('./fixtures/registered-expedient.cjs')({storage:h.window.localStorage,staff:h.app.state.actor,expId:exp.id});h.app.handlers.beginOnboarding();assert.equal(destinations.length,1);exp=Object.values(h.app.state.store.snapshot().expedients)[0];const pdf=Buffer.from('%PDF-1.4\nFicticio\n'),file={name:'documento-ficticio.pdf',type:'application/pdf',size:pdf.length,dataUrl:'data:application/pdf;base64,'+pdf.toString('base64')};
 const application=JSON.parse(exp.onboarding.records.pulzzo_application);application.documentFiles.proofAddress=file;
 good(h.app.state.assisted.saveOnboarding(exp.id,{records:{pulzzo_application:JSON.stringify(application)}},h.app.state.store.snapshot().revision));exp=Object.values(h.app.state.store.snapshot().expedients)[0];const document=exp.documents.find(item=>item.fileName===file.name);assert.ok(document);assert.equal(document.evidenceId,null);
 h.app.render();assert.match(h.get('contactDetail').innerHTML,/1 documentos/);await h.app.handlers.viewExpedient(exp.id);assert.match(h.get('dialogContent').innerHTML,/documento-ficticio.pdf/);assert.match(h.get('dialogContent').innerHTML,new RegExp('data-id="'+document.id+'"'));h.app.closeDialog();
 await h.app.handlers.viewEvidence(document.id);assert.equal(h.urls.length,1);assert.equal(h.urls[0].blob.type,'application/pdf');assert.match(h.get('dialogContent').innerHTML,/<iframe sandbox/);assert.doesNotMatch(h.get('dialogContent').innerHTML,/data:application/);h.app.closeDialog();assert.deepEqual(Array.from(h.revoked),['blob:fixture-1']);
 const pending=h.app.handlers.viewEvidence(document.id);h.app.navigate('patient','tasks',c.id);await pending;assert.equal(h.urls.length,1);assert.equal(h.get('editorDialog').open,false);
 await role(h,'kam_luis');assert.equal(h.window.sessionStorage.getItem(Shared.CONTEXT_KEY),null);h.app.navigate('patient','contacts',c.id);await h.app.handlers.viewEvidence(document.id);assert.equal(h.urls.length,1);assert.doesNotMatch(h.get('dialogContent').innerHTML,/documento-ficticio.pdf/);h.app.destroy();
});

test('Two clear contact choices share one expediente; customer-first never opens a staff form',async()=>{
 const Assisted=require('../assets/js/crm-assisted.js'),Shared=require('../assets/js/crm-onboarding-session.js');
 for(const kind of ['patient','doctor']){
  const h=setup(),destinations=[];h.window.sessionStorage=new context.fixture.MemoryStorage();h.window.PulzzoCRMOnboarding=Shared;h.window.location.assign=url=>destinations.push(url);
  const c=await add(h,kind,{email:kind+'-customer-first@example.test'});
  let html=h.get('contactDetail').innerHTML;assert.match(html,/El cliente lo completa/);assert.match(html,/Yo le ayudo a completarlo/);assert.doesNotMatch(html,/data-action="referral"|Mi enlace de referido/);assert.equal(h.get('inviteNewClient').hidden,false);
  h.app.handlers.inviteHolder();assert.equal(Object.values(h.app.state.store.snapshot().expedients).length,1,'opening share creates the stable entry immediately');assert.equal(destinations.length,0);
  let result=await h.submit({email:c.email});assert.equal(result.error,'');let snap=h.app.state.store.snapshot(),exp=Object.values(snap.expedients)[0],inv=snap.invitations[exp.activeInvitationId];assert.equal(inv.expedientId,exp.id);assert.equal(destinations.length,0);assert.equal(Object.keys(snap.contacts).length,1);
  h.app.handlers.inviteHolder();assert.match(h.get('dialogContent').innerHTML,/data-action="copy-entry"/);assert.equal(h.app.state.store.snapshot().expedients[exp.id].activeInvitationId,inv.id,'reuses live invitation');h.app.closeDialog();
  h.app.handlers.onboardingEditor();assert.equal(destinations.length,0,'KAM cannot start before holder registration');assert.match(h.get('notice').textContent,/registro inicial/);
  const holder={id:'holder_'+kind,role:'holder',email:c.email},disk=h.storage,now=()=>new Date('2026-10-09T12:00:00Z'),holderStore=Store.createStore({storage:disk,actor:holder,now}),api=Assisted.createAssisted({store:holderStore,actor:holder,now});
  const challenge=good(api.requestDemoVerification({entryToken:inv.token,email:c.email,kind})),proof=good(api.verifyDemoCode(challenge.challengeId,challenge.demoCode));good(api.openEntryLink(inv.token,{email:c.email,proofToken:proof.proofToken},holderStore.snapshot().revision));
  require('./fixtures/registered-expedient.cjs')({storage:disk,staff:h.app.state.actor,expId:exp.id,holder,now});h.app.handlers.onboardingEditor();assert.equal(destinations.length,1);assert.equal(new URL(destinations[0]).searchParams.get('crmExp'),exp.id);assert.equal(new URL(destinations[0]).searchParams.get('crmMode'),'assisted');
  h.app.render();assert.equal(h.app.state.invite,null);h.app.handlers.inviteHolder();html=h.get('dialogContent').innerHTML;assert.match(html,/#entry=/);assert.match(html,/Activo · sin caducidad automática/);assert.doesNotMatch(html,/crmExp=|crmMode=|#invite=/);await h.click('copy-entry');assert.equal(new URL(h.clipboard.at(-1)).hash,'#entry='+inv.token);assert.equal(Object.values(h.app.state.store.snapshot().expedients).length,1);assert.ok(h.app.state.store.snapshot().expedients[exp.id].onboarding,'staff and customer use saved full-form records');
  h.app.closeDialog();await role(h,'leader_demo');h.app.navigate(kind,'contacts',c.id);assert.doesNotMatch(h.get('contactDetail').innerHTML,/data-action="invite-holder"|data-action="edit-onboarding"/);assert.match(h.get('contactDetail').innerHTML,/Ver resumen/);assert.equal(h.get('inviteNewClient').hidden,true);assert.doesNotMatch(h.get('contactDetail').innerHTML,/Elige “El cliente lo completa”|“El cliente lo completa” permite/);h.app.destroy();
 }
});

test('Missing email, task counter, cancelled preparation and stale reassignment give honest outcomes',async()=>{
 const h=setup();const c=await add(h);h.app.handlers.inviteHolder();assert.match(h.get('dialogContent').innerHTML,/data-action="edit-contact">Agregar correo/);assert.equal(Object.values(h.app.state.store.snapshot().expedients).length,0);h.app.closeDialog();
 good(h.app.state.store.createTask({contactId:c.id,title:'Llamar mañana',dueAt:'2026-10-10T12:00:00Z'},h.app.state.store.snapshot().revision));h.app.render();assert.match(h.get('contactDetail').innerHTML,/1 tarea pendiente/);assert.match(h.get('contactDetail').innerHTML,/Llamar mañana/);assert.doesNotMatch(h.get('contactDetail').innerHTML,/Próximos pasos/);
 const withEmail=await add(h,'doctor',{email:'cancel-link@example.test',phone:'5512349999'});h.app.handlers.inviteHolder();h.app.closeDialog();assert.equal(Object.values(h.app.state.store.snapshot().expedients).length,1,'closing preserves the generated stable link');
 h.app.handlers.inviteHolder();await h.click('revoke-entry');const admin=Store.createStore({storage:h.storage,actor:{id:'admin_demo',role:'admin'}});good(admin.reassignContact(withEmail.id,'kam_luis','Reasignación',admin.snapshot().revision));const result=await h.submit({email:withEmail.email});assert.ok(result.error);assert.equal(Object.values(admin.snapshot().expedients).length,1);assert.equal(Object.values(admin.snapshot().expedients)[0].entryLink.status,'active','stale revocation must not commit');h.app.destroy();
});

test('Phone-only prospect stays pending until contact email and holder registration are complete',async()=>{
 const Shared=require('../assets/js/crm-onboarding-session.js');
 for(const kind of ['patient','doctor']){
  const h=setup(),destinations=[];h.window.sessionStorage=new context.fixture.MemoryStorage();h.window.PulzzoCRMOnboarding=Shared;h.window.location.assign=url=>destinations.push(url);
  const c=await add(h,kind);h.app.handlers.beginOnboarding();let exp=Object.values(h.app.state.store.snapshot().expedients)[0];assert.equal(destinations.length,0);assert.ok(!exp.onboarding);assert.match(h.get('notice').textContent,/registro inicial/);
  const email=kind+'-phone-first@example.test';good(h.app.state.store.updateContact(c.id,{email},h.app.state.store.snapshot().revision));
  require('./fixtures/registered-expedient.cjs')({storage:h.storage,staff:h.app.state.actor,expId:exp.id,now:()=>new Date('2026-10-09T12:00:00Z')});
  h.app.handlers.onboardingEditor();assert.equal(destinations.length,1);const ctx=Shared.open({storage:h.storage,sessionStorage:h.window.sessionStorage,location:new URL(destinations[0]),kind});assert.equal(ctx.expId,exp.id);assert.equal(ctx.isAssistant,true);
  h.app.render();assert.equal(h.app.state.store.getContact(c.id).email,email);h.app.handlers.inviteHolder();await h.click('migrate-entry');assert.equal((await h.submit()).error,'');assert.match(h.get('dialogContent').innerHTML,/#entry=/);const snap=h.app.state.store.snapshot();assert.equal(Object.keys(snap.expedients).length,1);assert.equal(snap.expedients[exp.id].fields.email,email);h.app.destroy();
 }
});

(async()=>{for(const item of cases){await item.run();console.log('PASS: '+item.name);}console.log('PASS: '+cases.length+' simplified CRM handler groups. Browser layout remains unverified.');})().catch(error=>{console.error(error);process.exitCode=1;});
