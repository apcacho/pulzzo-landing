'use strict';
// Actual delegated click/submit handlers with the local DOM harness. No browser launch.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const file=path.join(__dirname,'crm-contextual-invitation-modal.cjs'),source=fs.readFileSync(file,'utf8');
const scope=vm.createContext({require:createRequire(file),__dirname,console,Blob,URL,setImmediate});
vm.runInContext(source.slice(0,source.indexOf('const cases = []'))+'\nglobalThis.fixture={setup,good,modalUrl};',scope,{filename:file});
const {setup,good,modalUrl}=scope.fixture;
(async()=>{
 for(const kind of ['patient','doctor'])for(const state of ['active','legacy','revoked','legacy-revoked','blocked','missing-email']){
  const h=setup(kind),api=h.app.state.assisted,store=h.app.state.store;
  let focused='';h.get('dialogContent').querySelector=selector=>{
   if(selector!=='[data-share-focus]')return null;
   const tag=h.get('dialogContent').innerHTML.match(/<button[^>]*data-share-focus[^>]*>/);
   return tag?{focus(){focused=tag[0].match(/data-action="([^"]+)"/)[1];}}:null;
  };
  if(state==='missing-email')good(store.updateContact(h.contact.id,{email:''},h.snapshot().revision));
  else if(state==='legacy'||state==='legacy-revoked'){
   const exp=good(api.beginDraft({contactId:h.contact.id,kind},h.snapshot().revision));
   const inv=good(api.invite(exp.id,{email:h.contact.email},h.snapshot().revision));
   if(state==='legacy-revoked'){
    // Persist an existing revoked legacy fixture, then run the real UI migration/renewal handlers.
    const snapshot=h.snapshot();snapshot.invitations[inv.id].status='revoked';h.window.localStorage.setItem(require('../assets/js/crm-demo-store.js').STORAGE_KEY,JSON.stringify(snapshot));
   }
  }else{
   await h.click('invite-holder');await h.click('cancel-dialog');
   if(state==='revoked')good(api.revokeEntryLink(h.exp().id,{},h.snapshot().revision));
   if(state==='blocked')good(store.setStage(h.contact.id,'not_interested',{reason:'Demo'},h.snapshot().revision));
  }
  const before=h.raw();await h.click('invite-holder');let html=h.get('dialogContent').innerHTML;
  assert.equal(h.raw(),before,'Opening an existing state cannot migrate, renew or otherwise write');
  assert.ok(!html.includes(h.contact.id),'No contact ID in text, attributes or accessible labels');
  assert.match(html,/share-demo-note[^>]*>DEMO · Solo en este navegador/);
  assert.doesNotMatch(html,/<details[^>]*\bopen\b/);
  assert.doesNotMatch(html,/placeholder=/);
  if(state==='active')assert.match(html,/<button[^>]*disabled[^>]*>Enviar correo<\/button>/);else assert.doesNotMatch(html,/disabled/);
  const details=html.indexOf('<details');
  if(state==='active'){
   const url=modalUrl(h);assert.equal(focused,'copy-entry');assert.ok(html.indexOf('personalInvitationUrl')<details);assert.ok(html.indexOf('data-action="open-entry"')<details);
   assert.ok(html.indexOf('data-action="revoke-entry"')>details);await h.click('copy-entry');await new Promise(r=>setImmediate(r));assert.equal(h.clipboard.length,1);assert.equal(h.clipboard[0],url);
  }else{
   assert.doesNotMatch(html,/personalInvitationUrl|data-action="copy-entry"|data-action="open-entry"/);
   const action=state==='blocked'?'cancel-dialog':state==='missing-email'?'edit-contact':state==='legacy'?'migrate-entry':'renew-entry';
   assert.equal(focused,action);assert.ok(html.indexOf('data-action="'+action+'"')<details);
   if(state==='legacy'||state.includes('revoked')){
    assert.match(html,state==='legacy'?/Actualizar enlace/:/Renovar enlace/);assert.match(html,/anterior/);
    await h.click(action);assert.match(h.get('dialogContent').innerHTML,/anterior dejará de funcionar/);
    assert.equal(h.raw(),before,'Opening confirmation does not mutate');await h.click('cancel-dialog');assert.equal(h.raw(),before);
    await h.click('invite-holder');await h.click(action);assert.equal((await h.submit()).error,'');assert.match(modalUrl(h),/#entry=/);
   }
   if(state==='missing-email'){await h.click(action);assert.match(h.get('dialogContent').innerHTML,/name="email"/);}
  }
  await h.click('cancel-dialog');assert.equal(h.get('editorDialog').open,false);h.app.destroy();
 }
 const css=fs.readFileSync(path.join(__dirname,'../assets/css/crm-demo-embed.css'),'utf8');
 assert.equal((css.match(/\.crm-surface dialog\.share-dialog\{/g)||[]).length,2,'One desktop rule and its mobile override');
 assert.ok(css.indexOf('dialog.share-dialog')>css.indexOf('.crm-surface :is(p,'),'Canonical sharing styles come after global paragraph rules');
 for(const selector of ['.share-dialog .dialog-heading h2','.share-link-dialog .share-link-state','.share-link-dialog .share-link-explanation','.share-contact-context p','.share-link-dialog .share-demo-note'])assert.ok(css.includes(selector+'{'),'Scoped specificity: '+selector);
 assert.match(css,/dialog\.share-dialog\{[^}]*width:min\(520px,[^}]*max-height:calc\(100dvh - 32px\)[^}]*box-shadow:none/);
 assert.match(css,/@media\(max-width:820px\),\(pointer:coarse\)\{\s*\.crm-surface \.share-link-url input\{font-size:16px\}\s*\.crm-surface \.share-dialog \.dialog-heading button\{min-width:44px;min-height:44px\}/);
 assert.match(css,/\.share-link-dialog p\{margin:0\}/);assert.match(css,/\[data-link-status\]:empty\{display:none\}/);
 console.log('PASS compact share modal: active, legacy, revoked, legacy revoked, blocked, missing email; real copy/migration/renewal/edit/cancel handlers, focus and canonical responsive cascade contract. Browser rendering not exercised.');
})().catch(e=>{console.error(e);process.exitCode=1;});
