'use strict';
// Actual local delegated DOM handlers, no browser or external services.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const file=path.join(__dirname,'crm-contextual-invitation-modal.cjs'),source=fs.readFileSync(file,'utf8');
const scope=vm.createContext({require:createRequire(file),__dirname,console,Blob,URL,setImmediate});
vm.runInContext(source.slice(0,source.indexOf('const cases = []'))+'\nglobalThis.fixture={setup,good,modalUrl};',scope,{filename:file});
const {setup,good,modalUrl}=scope.fixture,Template=require('../assets/js/crm-invitation-email.js');
const decode=text=>text.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
(async()=>{
 for(const kind of ['patient','doctor']){
  const h=setup(kind);h.window.PulzzoCRMInvitationEmail=Template;h.window.fetch=()=>{throw Error('Preview must never fetch');};
  let focused='';h.get('dialogContent').querySelector=q=>({focus(){focused=q;}});
  await h.click('invite-holder');const url=modalUrl(h),before=h.raw(),writes=h.writeCount();
  assert.match(h.get('dialogContent').innerHTML,/Vista previa del correo/);
  await h.click('preview-entry-email');let html=h.get('dialogContent').innerHTML;
  assert.equal(h.get('dialogTitle').textContent,'Vista previa del correo');assert.equal(focused,'[data-share-focus]');
  assert.match(html,/sandbox="" referrerpolicy="no-referrer"/);assert.match(html,/pulzzomx@gmail.com.*Sin conectar/);assert.match(html,/DEMO local · Vista previa · No enviado/);
  assert.match(html,/<button type="button" disabled aria-describedby="emailPreviewPending">Enviar correo/);assert.match(html,/Correo pendiente de configurar/);assert.match(html,/Ver versión de texto/);
  const doc=decode(html.match(/srcdoc="([^"]+)"/)[1]);assert.ok(doc.includes(url));assert.match(doc,/logo-pulzzo\.png/);assert.doesNotMatch(doc,/<script|<form/i);assert.doesNotMatch(doc,/<a\b[^>]*href=/i);assert.doesNotMatch(doc,/Tu información y documentos están guardados/);
  assert.equal(h.raw(),before);assert.equal(h.writeCount(),writes);assert.equal(h.clipboard.length,0);
  await h.click('send-entry-email');assert.equal(h.raw(),before);assert.equal(h.writeCount(),writes);
  await h.click('back-entry-email');assert.equal(modalUrl(h),url);assert.equal(focused,'[data-action="preview-entry-email"]');assert.equal(h.raw(),before);
  await h.click('copy-entry');await new Promise(r=>setImmediate(r));assert.equal(h.clipboard[0],url);assert.equal(h.audit('holder_entry_copied').length,1);
  await h.click('preview-entry-email');await h.role('leader_demo');assert.equal(h.get('editorDialog').open,false);assert.equal(h.get('dialogContent').innerHTML,'');assert.equal(h.app.state.emailPreview,null);h.app.destroy();
 }
 for(const change of ['revoke','renew','reassign','selected','session']){
  const h=setup('patient',{sessionGuard:true});h.window.PulzzoCRMInvitationEmail=Template;await h.click('invite-holder');await h.click('preview-entry-email');
  if(change==='revoke')good(h.app.state.assisted.revokeEntryLink(h.exp().id,{},h.snapshot().revision));
  if(change==='renew')good(h.app.state.assisted.renewEntryLink(h.exp().id,{},h.snapshot().revision));
  if(change==='reassign')good(h.admin.reassignContact(h.contact.id,'kam_luis','Test',h.snapshot().revision));
  if(change==='selected')h.app.state.selected='missing';
  if(change==='session')h.endSession();
  const before=h.raw();await h.click('back-entry-email');assert.equal(h.raw(),before);assert.equal(h.get('dialogContent').innerHTML,'',change);h.app.destroy();
 }
 const stale=setup();stale.window.PulzzoCRMInvitationEmail=Template;await stale.click('invite-holder');good(stale.app.state.assisted.renewEntryLink(stale.exp().id,{},stale.snapshot().revision));await stale.click('preview-entry-email');assert.equal(stale.get('dialogContent').innerHTML,'');stale.app.destroy();
 for(const kind of ['patient','doctor']){
  const h=setup(kind),Session=require('../assets/js/crm-onboarding-session.js'),data=new Map(),sessionStorage={getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};let captured;
  h.window.PulzzoCRMInvitationEmail={render(input){captured=input;return Template.render(input);}};
  await h.click('invite-holder');await h.click('cancel-dialog');
  require('./fixtures/registered-expedient.cjs')({storage:h.window.localStorage,staff:h.app.state.actor,expId:h.exp().id,now:()=> '2026-10-12T12:00:00.000Z'});
  const options={storage:h.window.localStorage,sessionStorage,actor:h.app.state.actor,kind,expId:h.exp().id,now:()=> '2026-10-12T12:00:00.000Z'};
  const launch=Session.start(options),location={pathname:kind==='doctor'?'/registro-doctor.html':'/solicitud-paciente.html',search:new URL(launch.url,'https://example.test').search,hash:new URL(launch.url,'https://example.test').hash},ctx=Session.open({...options,location});
  await h.click('invite-holder');const before=h.raw();await h.click('preview-entry-email');assert.equal(h.raw(),before);assert.equal(captured.progress.hasStarted,true,kind+' initial registration is already complete');assert.equal(captured.progress.hasSavedInformation,true,kind+' titular already saved initial data');
  await h.click('back-entry-email');const key=kind==='doctor'?'pulzzoDoctorOnboardingCleanV3':'pulzzo_application',record=JSON.parse(ctx.storage.getItem(key));if(kind==='doctor')record.profile.name='Proveedor editado';else record.incomeMonthly=23000;ctx.storage.setItem(key,JSON.stringify(record));
  await h.click('preview-entry-email');assert.equal(captured.progress.hasStarted,true);assert.equal(captured.progress.hasSavedInformation,true);assert.equal(captured.progress.hasSavedDocuments,false);h.app.destroy();
 }
 for(const scenario of ['stored','missing','cancel','revoke','wrong-contact']){
  const h=setup();let captured,resolve;h.window.PulzzoCRMInvitationEmail={render(input){captured=input;return Template.render(input);}};await h.click('invite-holder');await h.click('cancel-dialog');
  good(h.app.state.assisted.editDraft(h.exp().id,{documents:[{label:'income',fileName:'income.pdf',evidenceId:'preview-file',mimeType:'application/pdf',size:4,demo:true}]},h.snapshot().revision));const row=h.exp().documents[0];
  const saved={id:row.evidenceId,contactId:h.contact.id,actorId:row.uploadedBy,uploadedAt:row.uploadedAt,name:row.fileName,mimeType:row.mimeType,size:row.size,blob:new Blob(['demo'],{type:'application/pdf'})};
  h.app.state.evidence={get:async()=>scenario==='missing'?null:scenario==='wrong-contact'?{...saved,contactId:'other'}:scenario==='cancel'||scenario==='revoke'?new Promise(r=>{resolve=r;}):saved};
  await h.click('invite-holder');const before=h.raw(),writes=h.writeCount(),pending=h.click('preview-entry-email');
  if(scenario==='cancel')await h.click('cancel-dialog');if(scenario==='revoke')good(h.app.state.assisted.revokeEntryLink(h.exp().id,{},h.snapshot().revision));if(resolve)resolve(saved);await pending;
  if(scenario==='cancel'||scenario==='revoke'){assert.equal(captured,undefined);assert.equal(h.app.state.emailPreview,null);}else{assert.equal(captured.progress.hasSavedDocuments,scenario==='stored');assert.equal(h.raw(),before);assert.equal(h.writeCount(),writes);}
  h.app.destroy();
 }
 const escaped=setup();good(escaped.app.state.store.updateContact(escaped.contact.id,{name:'<img src=x onerror=alert(1)>'},escaped.snapshot().revision));let captured;
 escaped.window.PulzzoCRMInvitationEmail={render(input){captured=input;return Template.render(input);}};
 await escaped.click('invite-holder');await escaped.click('preview-entry-email');assert.equal(captured.progress.hasStarted,false);assert.equal(captured.progress.hasSavedInformation,false);assert.equal(captured.progress.hasSavedDocuments,false);
 assert.doesNotMatch(escaped.get('dialogContent').innerHTML,/<img src=x/);
 await escaped.click('back-entry-email');good(escaped.app.state.assisted.editDraft(escaped.exp().id,{fields:{procedure:'Tratamiento ficticio'}},escaped.snapshot().revision));await escaped.click('preview-entry-email');assert.equal(captured.progress.hasStarted,true);assert.equal(captured.progress.hasSavedInformation,true);assert.equal(captured.progress.hasSavedDocuments,false);escaped.app.destroy();
 const external=setup();external.window.PulzzoCRMInvitationEmail=Template;await external.click('invite-holder');await external.click('preview-entry-email');await external.storageEvent();assert.equal(external.get('dialogContent').innerHTML,'');external.app.destroy();
 console.log('PASS invitation email preview DOM: isolated template, planned sender, stable URL, no writes/outbound/events, independent copy, back/focus, role/session/contact/reassignment/revoke/renew/storage invalidation. Browser rendering not exercised.');
})().catch(error=>{console.error(error);process.exitCode=1;});
