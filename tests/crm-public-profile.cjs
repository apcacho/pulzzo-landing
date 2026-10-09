'use strict';
// Real CRM, assisted intake, identity adapter and publication flow; the mounted UI
// fixture executes shipped handlers without network, browser geometry, or outbound reminders.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const Store=require('../assets/js/crm-demo-store.js');
const Assisted=require('../assets/js/crm-assisted.js');
const Office=require('../assets/js/crm-demo-office.js');
const Publication=require('../assets/js/doctor-publication.js');
const Context=require('../assets/js/doctor-publication-context.js');
const UI=require('../assets/js/crm-demo-ui.js');
const Analytics=require('../assets/js/crm-demo-analytics.js');
const fixtureFile=path.join(__dirname,'crm-demo-ui.cjs'),source=fs.readFileSync(fixtureFile,'utf8');
const sandbox=vm.createContext({require:createRequire(fixtureFile),__dirname,console,Blob,URL,URLSearchParams});
vm.runInContext(source.slice(0,source.indexOf('(async()=>{')).replace("value:values[name]??''","value:values[name]??'',checked:values[name]===true")+'\nglobalThis.fixture={setup};',sandbox,{filename:fixtureFile});
const now=()=>new Date('2026-10-09T12:00:00.000Z');
const good=r=>{assert.equal(r.ok,true,r.error);return r.value;};
const photoData='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNImbYFAAMQAa+WK6uvAAAAAElFTkSuQmCC';
const PHOTO={dataUrl:photoData,type:'image/png',size:Buffer.from(photoData.split(',')[1],'base64').length,name:'foto-demo.png'};
const fields={displayName:'Dra. Perfil Demo',specialty:'Odontología',city:'Ciudad de México',state:'Ciudad de México',clinicName:'Clínica Demo',bio:'Información pública ficticia.',phone:'+525512345678',whatsapp:'',website:'https://example.test',services:'Consulta\nSeguimiento'};
async function fixture(){
 const h=sandbox.fixture.setup();h.window.PulzzoDoctorPublication=Publication;h.window.PulzzoDoctorPublicationContext=Context;h.window.Image=class{constructor(){this.naturalWidth=1;this.naturalHeight=1;}set src(value){if(value&&this.onload)this.onload();}};
 const contact=good(h.app.state.store.createContact({type:'doctor',name:'Doctora de prueba',email:'doctor.public@example.test',phone:'5512345678',originalSource:'manual'},h.app.state.store.snapshot().revision));
 const exp=good(h.app.state.assisted.beginDraft({contactId:contact.id,kind:'doctor'},h.app.state.store.snapshot().revision));
 const invitation=good(h.app.state.assisted.invite(exp.id,{email:contact.email,ttlMinutes:60},h.app.state.store.snapshot().revision));
 const actor={id:'holder_public_doctor',role:'holder',email:contact.email},holderStore=Store.createStore({storage:h.storage,actor,now}),holder=Assisted.createAssisted({store:holderStore,actor,now});
 const challenge=good(holder.requestDemoVerification({token:invitation.token,email:contact.email})),proof=good(holder.verifyDemoCode(challenge.challengeId,challenge.demoCode));
 good(holder.claim(invitation.token,{email:contact.email,proofToken:proof.proofToken},holderStore.snapshot().revision));
 good(holder.editDraft(exp.id,{fields:{specialty:'Odontología',professionalLicense:'CEDULA-DEMO',clinicName:'Clínica Demo',clinicAddress:'Domicilio ficticio'},documents:[{label:'license',fileName:'cedula-demo.pdf',evidenceId:'license_demo',mimeType:'application/pdf',size:100,demo:true}]},holderStore.snapshot().revision));
 good(holder.holderAction(exp.id,'otp',{confirmed:true,demo:true},holderStore.snapshot().revision));
 good(holder.holderAction(exp.id,'finalConfirmation',{confirmed:true,demo:true,capacity:'holder',authorityConfirmed:true},holderStore.snapshot().revision));
 good(holder.submit(exp.id,holderStore.snapshot().revision));
 const imported=Office.prepareImport({patients:[],providers:[],audit:[]},holderStore.snapshot().expedients[exp.id],'admin_demo').database,provider=imported.providers[0];provider.onboarding={...(provider.onboarding||{}),approved:true};
 h.storage.setItem(Office.BO_KEY,JSON.stringify(imported));
 const make=actor=>Publication.createStore({storage:h.storage,actor,now,resolveProvider:id=>Context.resolveProvider(h.storage,id)});
 h.clients={kam:make({id:'kam_ana',role:'kam'}),holder:make(actor),admin:make({id:'admin_demo',role:'admin'}),foreign:make({id:'kam_luis',role:'kam'}),public:make({id:'public',role:'public'})};h.holderStore=holderStore;h.contact=holderStore.getContact(contact.id);h.provider=provider;h.exp=exp;
 h.app.navigate('doctor','contacts',contact.id);return h;
}
function current(client,id){const snapshot=client.snapshot();return {snapshot,version:snapshot.profiles[id].versions.find(v=>v.id===snapshot.profiles[id].currentVersionId)};}
function publish(h){let p=current(h.clients.holder,h.provider.id);h.clients.holder.confirm(h.provider.id,p.version.id,p.snapshot.revision);p=current(h.clients.admin,h.provider.id);h.clients.admin.review(h.provider.id,p.version.id,'approve','',p.snapshot.revision);p=current(h.clients.admin,h.provider.id);return h.clients.admin.publish(h.provider.id,p.version.id,p.snapshot.revision);}
const cases=[];const test=(name,run)=>cases.push({name,run});

test('Compact prospect form keeps two blocks, contextual help and unchanged attribution/defaults',async()=>{
 const h=sandbox.fixture.setup();h.app.handlers.newContact();let html=h.get('dialogContent').innerHTML;
 assert.match(html,/<legend>Datos de contacto<\/legend>/);assert.match(html,/<legend>Origen y responsable<\/legend>/);
 assert.match(html,/<input name="phone"[^>]+aria-describedby="prospectPhoneHelp"><span id="prospectPhoneHelp"/);
 assert.match(html,/<select name="originalSource" aria-describedby="prospectReferralHelp">[\s\S]*?<\/select><span id="prospectReferralHelp"/);
 assert.match(html,/<option value="manual" selected>/);assert.match(html,/<select name="assignedKam" disabled>/);
 assert.doesNotMatch(html,/name="referringKam"/);h.app.closeDialog();
 h.get('actorSelect').value='admin_demo';await h.get('actorSelect').dispatch('change');h.app.handlers.newContact();html=h.get('dialogContent').innerHTML;
 assert.match(html,/<select name="assignedKam">/);assert.match(html,/<option value="kam_ana" selected>/);
 h.app.destroy();
});

test('KAM editor creates only an audited draft; no implicit public profile or holder consent',async()=>{
 const h=await fixture();h.app.handlers.publicProfileEditor();const html=h.get('dialogContent').innerHTML;
 assert.match(html,/Fotografía opcional/);assert.match(html,/name="photo" type="file"/);assert.doesNotMatch(html,/data-action="(?:confirm|publish|approve)/);
 let result=await h.submit(fields);assert.equal(result.error,'');const state=current(h.clients.kam,h.provider.id),version=state.version;
 assert.equal(version.status,'draft');assert.equal(version.createdBy,'kam_ana');assert.equal(version.consent,null);assert.equal(version.review,null);assert.equal(state.snapshot.profiles[h.provider.id].publishedVersionId,null);
 assert.deepEqual(version.fields.services,['Consulta','Seguimiento']);assert.equal(h.clients.public.publicProfiles().length,0);assert.equal(h.app.state.store.listTasks().filter(t=>t.systemManaged).length,0);
 assert.throws(()=>h.clients.kam.confirm(h.provider.id,version.id,state.snapshot.revision),/titular/);assert.throws(()=>h.clients.kam.publish(h.provider.id,version.id,state.snapshot.revision),/backoffice/);
 assert.deepEqual(h.clients.foreign.snapshot().profiles,{});assert.throws(()=>h.clients.foreign.saveDraft(h.provider.id,{bio:'Ajeno'},state.snapshot.revision),/acceso|asignado|asignación|cartera/);
 h.app.destroy();
});

test('No-photo publication produces exactly one internal undated task in existing CRM surfaces',async()=>{
 const h=await fixture();h.app.handlers.publicProfileEditor();assert.equal((await h.submit(fields)).error,'');publish(h);
 const before=h.storage.getItem(Store.STORAGE_KEY),id='doctor-photo:'+h.provider.id;
 for(let i=0;i<3;i++){const tasks=h.app.state.store.listTasks({contactId:h.contact.id});assert.equal(tasks.length,1);assert.equal(tasks[0].id,id);assert.equal(tasks[0].status,'open');assert.equal(tasks[0].dueAt,null);assert.equal(tasks[0].assignedKam,'kam_ana');assert.equal(tasks[0].systemManaged,true);assert.equal(tasks[0].provenance,'published_doctor_profile');}
 assert.equal(h.storage.getItem(Store.STORAGE_KEY),before,'Canonical read is idempotent and does not append task copies');
 assert.equal(h.app.state.store.dashboard().counts.openTasks,1);assert.equal(h.app.state.store.dashboard().counts.overdueTasks,0);assert.equal(UI.taskBucket(h.app.state.store.listTasks()[0],now()),'unscheduled');
 const report=Analytics.buildReport(h.app.state.store.snapshot(),{month:10,year:2026,type:'doctor'},{now:now(),actor:{id:'kam_ana',role:'kam'}});assert.ok(report);
 assert.equal(Object.values(h.holderStore.snapshot().tasks).filter(t=>t.systemManaged).length,0);assert.deepEqual(h.clients.public.photoTasks(),[]);
 h.app.render();assert.match(h.get('contactDetail').innerHTML,/Fotografía pública pendiente/);assert.match(h.get('contactDetail').innerHTML,/sin fecha acordada/);
 h.app.navigate('doctor','tasks',h.contact.id);const html=h.get('taskBoard').innerHTML;
 assert.match(html,/Sin fecha acordada/);assert.match(html,/Seguimiento interno/);assert.match(html,/Preparar foto/);assert.doesNotMatch(html,/data-action="(?:close-task|edit-task)"/);assert.doesNotMatch(html,/1970/);
 const revision=h.app.state.store.snapshot().revision;assert.equal(h.app.state.store.closeTask(id,'Carga lista',revision).code,'system_task');assert.equal(h.app.state.store.updateTask(id,{dueAt:'2026-10-10T12:00:00Z'},revision).code,'system_task');
 const forged=h.app.state.store.transact(revision,(draft)=>{draft.tasks[id]={...h.app.state.store.listTasks()[0],status:'closed',closeReason:'Forjado'};});assert.equal(forged.ok,false);assert.equal(forged.code,'system_task');
 h.app.destroy();
});

test('Maximum-length stable provider IDs retain one canonical internal photo task',async()=>{
 const h=await fixture(),db=JSON.parse(h.storage.getItem(Office.BO_KEY)),longId='P'.repeat(180);db.providers[0].id=longId;h.provider=db.providers[0];h.storage.setItem(Office.BO_KEY,JSON.stringify(db));
 h.app.handlers.publicProfileEditor();assert.equal((await h.submit(fields)).error,'');publish(h);
 const id='doctor-photo:'+longId;assert.equal(id.length,193);
 for(let i=0;i<3;i++){const tasks=h.app.state.store.listTasks();assert.equal(tasks.length,1);assert.equal(tasks[0].id,id);assert.equal(tasks[0].status,'open');assert.equal(Object.keys(h.app.state.store.snapshot().tasks)[0],id);}
 assert.equal(h.app.state.store.closeTask(id,'No cierre manual',h.app.state.store.snapshot().revision).code,'system_task');h.app.destroy();
});

test('Photo upload leaves task open; only published photo closes; later published removal reopens the same task',async()=>{
 const h=await fixture();h.app.handlers.publicProfileEditor();assert.equal((await h.submit(fields)).error,'');publish(h);
 const id=h.app.state.store.listTasks()[0].id,createdAt=h.app.state.store.listTasks()[0].createdAt;
 h.window.FileReader=class{readAsDataURL(){this.result=photoData;this.onload();}};
 h.app.handlers.publicProfileEditor();assert.equal((await h.submit(fields,{photo:[{name:PHOTO.name,type:PHOTO.type,size:PHOTO.size}]})).error,'');
 assert.equal(current(h.clients.kam,h.provider.id).version.fields.photo.dataUrl,photoData);assert.equal(h.app.state.store.listTasks()[0].status,'open');h.app.render();assert.match(h.get('contactDetail').innerHTML,/Hay una fotografía en borrador/);
 const p=current(h.clients.holder,h.provider.id);h.clients.holder.confirm(h.provider.id,p.version.id,p.snapshot.revision);const r=current(h.clients.admin,h.provider.id);h.clients.admin.review(h.provider.id,r.version.id,'approve','',r.snapshot.revision);assert.equal(h.app.state.store.listTasks()[0].status,'open','Approval alone is not publication');const ready=current(h.clients.admin,h.provider.id);h.clients.admin.publish(h.provider.id,ready.version.id,ready.snapshot.revision);
 assert.equal(h.app.state.store.listTasks({status:'open'}).length,0);assert.equal(h.app.state.store.listTasks({status:'closed'})[0].id,id);assert.equal(h.app.state.store.listTasks()[0].closeReason,'Fotografía publicada en el directorio.');h.app.navigate('doctor','tasks');assert.match(h.get('taskBoard').innerHTML,/Tareas cerradas \(1\)/);assert.match(h.get('taskBoard').innerHTML,/Cierre por publicación/);
 h.app.navigate('doctor','contacts',h.contact.id);h.app.handlers.publicProfileEditor();assert.match(h.get('dialogContent').innerHTML,/name="removePhoto"/);assert.equal((await h.submit({...fields,removePhoto:true})).error,'');assert.equal(current(h.clients.kam,h.provider.id).version.fields.photo,null);assert.equal(h.app.state.store.listTasks()[0].status,'closed','Draft removal preserves published photo');publish(h);
 assert.equal(h.app.state.store.listTasks().length,1);assert.equal(h.app.state.store.listTasks()[0].id,id);assert.equal(h.app.state.store.listTasks()[0].createdAt,createdAt);assert.equal(h.app.state.store.listTasks()[0].status,'open');assert.equal(h.app.state.store.listTasks()[0].closedAt,null);
 h.app.destroy();
});

test('Reassignment scopes existing tasks and pending editor reads to the current responsible KAM',async()=>{
 const h=await fixture();h.app.handlers.publicProfileEditor();assert.equal((await h.submit(fields)).error,'');publish(h);
 const priorProfile=h.storage.getItem(Publication.STORAGE_KEY);let reader;h.window.FileReader=class{readAsDataURL(){reader=this;}};
 h.app.handlers.publicProfileEditor();const saving=h.submit(fields,{photo:[{name:PHOTO.name,type:PHOTO.type,size:PHOTO.size}]});await Promise.resolve();assert.ok(reader);
 const admin=Store.createStore({storage:h.storage,actor:{id:'admin_demo',role:'admin'},now});good(admin.reassignContact(h.contact.id,'kam_luis','Nuevo responsable',admin.snapshot().revision));
 reader.result=photoData;reader.onload();const result=await saving;assert.match(result.error,/cambió|disponible|acceso/);assert.equal(h.storage.getItem(Publication.STORAGE_KEY),priorProfile);
 assert.equal(h.app.state.store.listTasks().length,0);assert.deepEqual(h.clients.kam.snapshot().profiles,{});assert.equal(h.clients.kam.photoTasks().length,0);
 const luis=Store.createStore({storage:h.storage,actor:{id:'kam_luis',role:'kam'},now});assert.equal(luis.listTasks().length,1);assert.equal(luis.listTasks()[0].assignedKam,'kam_luis');assert.equal(admin.listTasks()[0].assignedKam,'kam_luis');assert.equal(luis.getContact(h.contact.id).originalSource,'manual');
 h.app.destroy();
});

test('Decoded-image validation and interrupted decode cannot save corrupt or stale photo drafts',async()=>{
 for(const interruption of ['decode-error','zero-size','reassign','navigate','dismiss','profile-revision']){
  const h=await fixture();h.app.handlers.publicProfileEditor();assert.equal((await h.submit(fields)).error,'');publish(h);
  const before=h.storage.getItem(Publication.STORAGE_KEY);let decoder;
  h.window.FileReader=class{readAsDataURL(){this.result=photoData;this.onload();}};
  h.window.Image=class{constructor(){decoder=this;this.naturalWidth=1;this.naturalHeight=1;}set src(value){this.source=value;}};
  h.app.handlers.publicProfileEditor();const pending=h.submit(fields,{photo:[{name:PHOTO.name,type:PHOTO.type,size:PHOTO.size}]});await Promise.resolve();assert.ok(decoder,interruption);
  if(interruption==='reassign'){const admin=Store.createStore({storage:h.storage,actor:{id:'admin_demo',role:'admin'},now});good(admin.reassignContact(h.contact.id,'kam_luis','Cambio durante decodificación',admin.snapshot().revision));}
  if(interruption==='navigate')h.app.navigate('doctor','tasks');if(interruption==='dismiss')h.app.closeDialog(true);
  if(interruption==='profile-revision'){const p=current(h.clients.holder,h.provider.id);h.clients.holder.saveDraft(h.provider.id,{bio:'Nueva versión del titular'},p.snapshot.revision);}
  const expected=h.storage.getItem(Publication.STORAGE_KEY);
  if(interruption==='decode-error')decoder.onerror();else{if(interruption==='zero-size')decoder.naturalWidth=0;decoder.onload();}
  const result=await pending;assert.ok(result.error,interruption);assert.equal(h.storage.getItem(Publication.STORAGE_KEY),expected,interruption);
  if(interruption!=='profile-revision')assert.equal(expected,before);assert.equal(decoder.onload,null);assert.equal(decoder.onerror,null);assert.equal(decoder.source,'');h.app.destroy();
 }
});

test('Preloaded legacy photos also require a successful image decode before their first public draft',async()=>{
 const h=await fixture(),db=JSON.parse(h.storage.getItem(Office.BO_KEY));db.providers[0].profilePhotoData=photoData;h.storage.setItem(Office.BO_KEY,JSON.stringify(db));
 h.window.Image=class{set src(value){if(value&&this.onerror)this.onerror();}};
 h.app.handlers.publicProfileEditor();assert.match(h.get('dialogContent').innerHTML,/Hay una fotografía guardada/);const result=await h.submit(fields);assert.match(result.error,/dañada|mostrar/);assert.equal(h.storage.getItem(Publication.STORAGE_KEY),null);h.app.destroy();
});

test('Stale public versions, invalid photo types and lost identity fail without changing published data',async()=>{
 const h=await fixture();h.app.handlers.publicProfileEditor();assert.equal((await h.submit(fields)).error,'');publish(h);
 h.app.handlers.publicProfileEditor();let p=current(h.clients.holder,h.provider.id);h.clients.holder.saveDraft(h.provider.id,{bio:'Titular cambió el borrador'},p.snapshot.revision);const before=h.storage.getItem(Publication.STORAGE_KEY);let r=await h.submit(fields);assert.match(r.error,/cambió|vigente/);assert.equal(h.storage.getItem(Publication.STORAGE_KEY),before);h.app.closeDialog();
 h.app.handlers.publicProfileEditor();r=await h.submit(fields,{photo:[{name:'bad.svg',type:'image/svg+xml',size:60}]});assert.match(r.error,/imagen PNG/);assert.equal(h.storage.getItem(Publication.STORAGE_KEY),before);h.app.closeDialog();
 const db=JSON.parse(h.storage.getItem(Office.BO_KEY));db.providers.push({...db.providers[0],id:'provider_ambiguous'});h.storage.setItem(Office.BO_KEY,JSON.stringify(db));assert.equal(h.app.state.store.listTasks().length,0);h.app.handlers.publicProfileEditor();assert.equal(h.get('editorDialog').open,false);assert.match(h.get('notice').textContent,/vinculados de forma exacta/);assert.equal(h.storage.getItem(Publication.STORAGE_KEY),before);
 h.app.destroy();
});

(async()=>{for(const {name,run} of cases){await run();console.log('PASS:',name);}console.log('PASS: CRM public draft and canonical photo task integration.');})().catch(error=>{console.error(error);process.exitCode=1;});
