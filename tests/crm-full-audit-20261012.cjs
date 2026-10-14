'use strict';
// Adversarial shipped-handler tests. No browser is launched.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const Store=require('../assets/js/crm-demo-store.js');
function fixtures(file,marker,expose){
  const name=path.join(__dirname,file),source=fs.readFileSync(name,'utf8'),context=vm.createContext({require:createRequire(name),__dirname,console,Blob,URL,URLSearchParams});
  vm.runInContext(source.slice(0,source.indexOf(marker))+'\nglobalThis.fixture={'+expose+'};',context,{filename:name});return context.fixture;
}
const {shell,attachCRM}=fixtures('crm-backoffice-navigation.cjs','(async()=>{','shell,attachCRM');
const {setup}=fixtures('crm-demo-ui.cjs','(async()=>{','setup');
const good=r=>{assert.equal(r.ok,true,r.error);return r.value;};
const tests=[];function test(name,run){tests.push({name,run});}
function add(h){return good(h.app.state.store.createContact({phone:(globalThis.__pzPhone=(globalThis.__pzPhone||100000)+1,'5500'+globalThis.__pzPhone),type:'patient',name:'Fictional audit contact',email:'crm.audit@example.test',originalSource:'manual'},h.app.state.store.snapshot().revision));}
function admin(h){return Store.createStore({storage:h.storage,actor:{id:'admin_audit',role:'admin'},now:()=>new Date('2026-10-09T12:00:00Z')});}

test('Mutable presentation fields cannot impersonate a different central CRM identity',async()=>{
  for(const patch of ["session.crmActorId='kam_luis'","session.role='admin';session.crmActorId='admin_demo'","session.email='admin@pulzzo.mx'"]){
    const h=await shell({role:'kam'}),child=attachCRM(h),old=child.app.state.store;
    h.evaluate(patch);h.navigate('crm');const current=attachCRM(h);
    assert.equal(current.app.state.actor.id,'kam_ana');assert.equal(current.app.state.actor.role,'kam');
    assert.equal(current.get('actorSelect').disabled,true);assert.equal(old.actor.id,'kam_ana');
  }
});
test('A real central session switch revokes the old client and binds the newly authenticated identity',async()=>{
  const h=await shell({role:'kam'}),old=attachCRM(h);h.get('loginEmail').value='luis.kam@pulzzo.mx';h.get('loginPass').value='pulzzo-demo';await h.context.login();h.navigate('crm');
  const current=attachCRM(h);assert.notEqual(current.host,old.host);assert.equal(current.app.state.actor.id,'kam_luis');assert.throws(()=>old.app.state.store.snapshot());
});
test('A directory administrator downgrade revokes all old CRM reads and writes',async()=>{
  const h=await shell({role:'admin',hash:'#crm'}),child=attachCRM(h),staff=h.window.PulzzoStaffAccess,session=staff.getSession();
  assert.equal(child.app.state.actor.role,'admin');assert.equal(child.get('actorSelect').disabled,true);
  staff.updateUser(session,'operations_demo',{roles:['admin','operations']},staff.getVersion());
  staff.updateUser(session,'admin_demo',{roles:['leader']},staff.getVersion());
  assert.throws(()=>child.app.state.store.snapshot());assert.equal(child.app.state.store.createContact({phone:(globalThis.__pzPhone=(globalThis.__pzPhone||100000)+1,'5500'+globalThis.__pzPhone),type:'patient',name:'Revoked',email:'revoked@example.test'},0).ok,false);
});
test('Second dialog and immediate-write actions cannot replace or mutate an active asynchronous save',async()=>{
  let release,puts=0,removes=0;
  const h=setup({evidenceModule:{createEvidenceStore:()=>({put(file,meta){puts++;return new Promise(resolve=>{release=()=>resolve({id:'evidence_audit',name:'audit.pdf',mimeType:file.type,size:file.size,uploadedAt:'2026-10-09T12:00:00.000Z',...meta});});},remove:async()=>{removes++;}})}}),c=add(h);
  h.app.navigate('patient','contacts',c.id);h.app.handlers.activityEditor();const oldHandler=h.app.state.dialogHandler,oldMarkup=h.get('dialogContent').innerHTML,before=h.app.state.store.snapshot().revision;
  const pending=h.submit({type:'call',outcome:'reached',contactAt:'2026-10-08T11:00',note:'Fictional call'}, {evidence:[new Blob(['%PDF-1.7 demo'],{type:'application/pdf'})]});
  assert.equal(h.app.state.busy,true);assert.equal(puts,1);
  h.app.handlers.newContact();assert.equal(h.app.state.dialogHandler,oldHandler);assert.equal(h.get('dialogContent').innerHTML,oldMarkup);
  h.app.handlers.beginOnboarding();assert.equal(h.app.state.store.snapshot().revision,before);
  release();assert.equal((await pending).error,'');assert.equal(h.app.state.store.listActivities().length,1);assert.equal(removes,0);assert.equal(h.get('editorDialog').open,false);h.app.destroy();
});
test('Cached invitation copy rechecks current contact assignment before exposing the bearer link',async()=>{
  const h=setup(),c=add(h);h.app.navigate('patient','contacts',c.id);h.app.handlers.beginOnboarding();h.app.closeDialog();h.app.handlers.inviteHolder();assert.ok(Object.values(h.app.state.store.snapshot().expedients)[0].entryLink);
  const a=admin(h);good(a.reassignContact(c.id,'kam_luis','Fictional reassignment',a.snapshot().revision));
  await h.click('copy-entry');assert.equal(h.clipboard.length,0);assert.equal(h.get('editorDialog').open,false);assert.doesNotMatch(h.get('dialogContent').innerHTML,/#entry=/);h.app.destroy();
});
test('Clipboard fallback never displays an invitation revoked while the clipboard promise is pending',async()=>{
  const h=setup(),c=add(h);h.app.navigate('patient','contacts',c.id);h.app.handlers.beginOnboarding();h.app.closeDialog();h.app.handlers.inviteHolder();
  let reject;h.window.navigator.clipboard.writeText=()=>new Promise((_resolve,fail)=>{reject=fail;});await h.click('copy-entry');assert.equal(typeof reject,'function');
  const a=admin(h);good(a.reassignContact(c.id,'kam_luis','Fictional concurrent reassignment',a.snapshot().revision));reject(new Error('Clipboard unavailable'));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.get('editorDialog').open,false);assert.doesNotMatch(h.get('dialogContent').innerHTML,/#entry=/);h.app.destroy();
});
test('Storage refresh errors clear stale contact and token surfaces without throwing or overwriting saved data',()=>{
  const h=setup(),c=add(h);h.app.navigate('patient','contacts',c.id);h.app.handlers.newContact(c);const raw=h.storage.getItem(Store.STORAGE_KEY),read=h.storage.getItem.bind(h.storage);
  h.storage.getItem=key=>{if(key===Store.STORAGE_KEY)throw new Error('Unavailable storage');return read(key);};
  assert.doesNotThrow(()=>{for(const listener of h.window.listeners.storage)listener({key:Store.STORAGE_KEY});});
  assert.equal(h.get('editorDialog').open,false);assert.doesNotMatch(h.get('contactDetail').innerHTML,/Fictional audit contact/);assert.match(h.get('notice').textContent,/almacenamiento|leer/);assert.equal(read(Store.STORAGE_KEY),raw);
  h.storage.getItem=read;assert.doesNotThrow(()=>h.app.render());assert.match(h.get('contactList').innerHTML,/Fictional audit contact/);h.app.destroy();
});
test('A stale invitation anchor is blocked before opening the holder route after reassignment',async()=>{
  const h=setup(),c=add(h);h.app.navigate('patient','contacts',c.id);h.app.handlers.beginOnboarding();h.app.closeDialog();h.app.handlers.inviteHolder();
  assert.match(h.get('dialogContent').innerHTML,/data-action="open-entry"/);const href='asistido-demo.html#entry='+Object.values(h.app.state.store.snapshot().expedients)[0].entryLink.token,a=admin(h);good(a.reassignContact(c.id,'kam_luis','Fictional reassignment',a.snapshot().revision));
  let blocked=false;const target={dataset:{action:'open-entry'},getAttribute:()=>href,closest(){return this;}};h.app.handlers.click({target,preventDefault(){blocked=true;}});assert.equal(blocked,true);assert.equal(h.get('editorDialog').open,false);assert.doesNotMatch(h.get('dialogContent').innerHTML,/#entry=/);h.app.destroy();
});
test('A storage clear event with a null key revokes invitation state, clears the detail and closes scoped forms',async()=>{
  const h=setup(),c=add(h);h.app.navigate('patient','contacts',c.id);h.app.handlers.beginOnboarding();h.app.closeDialog();h.app.handlers.inviteHolder();h.app.handlers.newContact(c);
  h.storage.removeItem(Store.STORAGE_KEY);for(const listener of h.window.listeners.storage)await listener({key:null});
  assert.equal(h.app.state.invite,null);assert.equal(h.get('editorDialog').open,false);assert.doesNotMatch(h.get('contactDetail').innerHTML,/Fictional audit contact|#entry=/);assert.equal(h.storage.getItem(Store.STORAGE_KEY),null);h.app.destroy();
});
test('Known asynchronous read failures are handled at the event boundary without a rejected event promise',async()=>{
  const h=setup(),c=add(h);h.app.navigate('patient','contacts',c.id);h.app.handlers.beginOnboarding();h.app.closeDialog();const exp=Object.values(h.app.state.store.snapshot().expedients)[0];
  const read=h.storage.getItem.bind(h.storage);h.storage.getItem=key=>{if(key===Store.STORAGE_KEY)throw new Error('Storage permission lost');return read(key);};
  await assert.doesNotReject(h.click('view-expedient',exp.id));assert.match(h.get('notice').textContent,/almacenamiento|leer/);assert.equal(h.get('editorDialog').open,false);h.app.destroy();
});
(async()=>{for(const {name,run}of tests){try{await run();console.log('PASS: '+name);}catch(error){console.error('FAIL: '+name);console.error(error);process.exitCode=1;}}if(!process.exitCode)console.log('PASS: '+tests.length+' full-audit CRM handler groups; browser rendering remains unverified.');})().catch(error=>{console.error(error);process.exitCode=1;});
