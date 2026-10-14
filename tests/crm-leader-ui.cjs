'use strict';
// Mounted UI guards complement store authorization; no browser rendering claim.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const Store=require('../assets/js/crm-demo-store.js');
const fixtureFile=path.join(__dirname,'crm-demo-ui.cjs');
const source=fs.readFileSync(fixtureFile,'utf8');
const fixture=source.slice(0,source.indexOf('(async()=>{')).replace('UI.createApp({window,document,storage,','UI.createApp({window,document,storage,embedding:options.embedding,');
const ctx=vm.createContext({require:createRequire(fixtureFile),__dirname,console,Blob,URL,URLSearchParams});
vm.runInContext(fixture+'\nglobalThis.makeSetup=setup;',ctx,{filename:fixtureFile});
const setup=options=>{const h=ctx.makeSetup(options);const admin=Store.createStore({storage:h.storage,actor:{id:'fixture_admin',role:'admin'}});assert.equal(admin.setIntakeRouting({mode:'admin',kamIds:[],leaderCanAssign:false},'Strict read-only policy fixture',admin.snapshot().revision).ok,true);h.app.render();return h;};
const good=result=>{assert.equal(result.ok,true,result.error);return result.value;};
const mutations=['new-prospect','edit-contact','change-stage','move-card','reassign','activity','new-task','new-profile-task','close-task','edit-task','begin-onboarding','edit-onboarding','invite-holder','upload-document','refresh-corrections','edit-correction','refresh-document-corrections','upload-document-correction','referral','seed','edit-public-profile','identity-review','archive-contact','restore-contact'];
const handlers=['newContact','seedExamples','activityEditor','taskEditor','closeTask','changeStage','moveCard','reassign','beginOnboarding','onboardingEditor','inviteHolder','publicProfileEditor','refreshCorrections','editCorrection','refreshDocumentCorrections','uploadDocumentCorrection','uploadDocument','archiveContact','restoreContact','identityReview','myPhone'];
function embedding(actorId, allowActorSwitch=false){let hash='#patient/contacts',current=true;return {actorId,allowActorSwitch,readRoute:()=>hash,writeRoute:value=>{hash=value;},isCurrent:()=>current,expire:()=>{current=false;}};}
function add(h, owner, name){const admin=Store.createStore({storage:h.storage,actor:{id:'fixture_admin',role:'admin'},now:()=>new Date('2026-10-09T12:00:00Z')});return good(admin.createContact({type:'patient',name,email:name+'@example.test',assignedKam:owner,originalSource:'manual'},admin.snapshot().revision));}
const tests=[];const test=(name,run)=>tests.push({name,run});
test('Leader sees both portfolios, task/history details and nondraggable cards, with no mutation affordances',async()=>{
  const h=setup({embedding:embedding('leader_demo')});const a=add(h,'kam_ana','ana_fictional'),b=add(h,'kam_luis','luis_fictional');
  const admin=Store.createStore({storage:h.storage,actor:{id:'fixture_admin',role:'admin'},now:()=>new Date('2026-10-09T12:00:00Z')});
  good(admin.createTask({contactId:b.id,title:'Leader can read fictional task',dueAt:'2026-10-10T12:00:00Z'},admin.snapshot().revision));
  good(admin.addActivity({contactId:b.id,type:'call',note:'Leader can read fictional history',contactAt:'2026-10-08T12:00:00Z'},admin.snapshot().revision));
  h.app.navigate('patient','contacts',b.id);assert.equal(h.app.state.actor.role,'leader');assert.equal(h.app.state.store.listContacts().length,2);
  assert.match(h.get('contactList').innerHTML,/ana_fictional/);assert.match(h.get('contactList').innerHTML,/luis_fictional/);
  const detail=h.get('contactDetail').innerHTML;assert.match(detail,/Leader can read fictional task/);assert.match(detail,/Leader can read fictional history/);
  for(const action of mutations)assert.ok(!detail.includes('data-action="'+action+'"'),action+' must not be presented');
  for(const id of ['newContact','newTask','loadExamples','phoneSettings'])assert.equal(h.get(id).hidden,true,id);
  assert.equal(h.get('readOnlyRoleNotice').hidden,false);assert.equal(h.get('lifecycleFilterField').hidden,true);
  h.app.handlers.click({target:{dataset:{contactLayout:'kanban'},closest(){return this;}}});
  assert.doesNotMatch(h.get('commercialBoard').innerHTML,/draggable="true"|data-action="move-card"/);
  h.app.navigate('patient','tasks');assert.match(h.get('taskBoard').innerHTML,/Leader can read fictional task/);assert.doesNotMatch(h.get('taskBoard').innerHTML,/data-action="(?:edit-task|close-task|edit-public-profile)"/);
  h.app.navigate('patient','contacts',a.id);h.app.destroy();
});
test('Leader direct actions, exported handlers, forged drag and submit never open mutation dialogs or write state',async()=>{
  let puts=0;const h=setup({embedding:embedding('leader_demo'),evidenceModule:{createEvidenceStore:()=>({put(){puts++;throw new Error('Unexpected upload');}})}}),c=add(h,'kam_ana','guard_fictional');h.app.navigate('patient','contacts',c.id);
  const before=h.storage.getItem(Store.STORAGE_KEY);
  for(const name of handlers){await h.app.handlers[name](c.id);assert.equal(h.get('editorDialog').open,false,name+' must be blocked at entry');}
  for(const action of mutations){await h.click(action,c.id);assert.equal(h.get('editorDialog').open,false,action);}
  h.app.state.drag={id:c.id,stage:'new',revision:1,type:'patient',actor:'leader_demo'};
  h.app.handlers.drop({target:{closest:()=>({dataset:{dropStage:'contacted'}})},preventDefault(){}});
  await h.submit({contactId:c.id,title:'Forbidden',dueAt:'2026-10-10T12:00'});
  assert.equal(h.storage.getItem(Store.STORAGE_KEY),before);assert.equal(puts,0);assert.match(h.get('notice').textContent,/consulta/);h.app.destroy();
});
test('Embedded KAM and leader cannot escalate by forging the actor selector, including after a form save',async()=>{
  for(const actor of ['kam_ana','kam_luis','leader_demo']){
    const e=embedding(actor),h=setup({embedding:e});assert.equal(h.get('actorSelect').disabled,true);
    assert.ok(!h.get('actorSelect').innerHTML.includes('value="admin_demo"'));
    for(const target of ['admin_demo','leader_demo','kam_ana','kam_luis']){h.get('actorSelect').value=target;await h.get('actorSelect').dispatch('change');assert.equal(h.app.state.actor.id,actor);assert.equal(h.get('actorSelect').value,actor);}
    if(actor!=='leader_demo'){h.app.handlers.newContact();const result=await h.submit({name:'Created by '+actor,email:actor+'@example.test',phone:'',type:'patient',originalSource:'manual'});assert.equal(result.error,'');assert.equal(h.get('actorSelect').disabled,true);assert.equal(h.app.state.store.listContacts()[0].assignedKam,actor);}
    h.app.destroy();
  }
});
test('Admin-authorized simulation can select leader, and previous KAM store objects lose access after role change',async()=>{
  const h=setup({embedding:embedding('admin_demo',true)});const c=add(h,'kam_ana','current_fictional');
  h.get('actorSelect').value='kam_ana';await h.get('actorSelect').dispatch('change');const old=h.app.state.store;assert.equal(old.getContact(c.id).id,c.id);
  h.get('actorSelect').value='leader_demo';await h.get('actorSelect').dispatch('change');assert.equal(h.app.state.actor.role,'leader');assert.throws(()=>old.listContacts(),/acceso|sesión|sesion|vigente/i);
  assert.equal(h.app.state.store.listContacts().length,1);h.app.destroy();
});
test('Expired shell session blocks retained UI handlers and scoped stores before a stale save',async()=>{
  const e=embedding('kam_ana'),h=setup({embedding:e});const c=add(h,'kam_ana','expiry_fictional');h.app.navigate('patient','contacts',c.id);h.app.handlers.newContact(c);
  const before=h.storage.getItem(Store.STORAGE_KEY),oldStore=h.app.state.store;e.expire();
  await h.submit({name:'Stale edit',email:c.email,phone:''});assert.equal(h.storage.getItem(Store.STORAGE_KEY),before);assert.match(h.get('notice').textContent,/sesión cambió/);
  assert.throws(()=>oldStore.listContacts(),/acceso|sesión|sesion|vigente/i);h.app.destroy();
});
(async()=>{for(const {name,run} of tests){await run();console.log('PASS: '+name);}console.log('PASS: '+tests.length+' leader/embedded-role UI guard groups. Browser rendering remains unverified.');})().catch(error=>{console.error(error);process.exitCode=1;});
