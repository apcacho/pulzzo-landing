'use strict';
// Modal DOM wiring/handler tests only. No browser is launched.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const fixture=path.join(__dirname,'crm-demo-ui.cjs'),source=fs.readFileSync(fixture,'utf8'),scope=vm.createContext({require:createRequire(fixture),__dirname,console,Blob,URL});
vm.runInContext(source.slice(0,source.indexOf('(async()=>{'))+'\nglobalThis.fixture={setup,Element};',scope,{filename:fixture});
const {setup,Element}=scope.fixture;
const good=r=>{assert.equal(r.ok,true,r.error);return r.value;};
(async()=>{
 for(const kind of ['patient','doctor']) {
  const h=setup(),app=h.app,store=app.state.store;
  const c=good(store.createContact({type:kind,name:'Ficha popup '+kind,email:'popup-'+kind+'@example.test',phone:'5512345678'},store.snapshot().revision));
  app.navigate(kind,'contacts',null);app.state.contactLayout='kanban';h.get('contactSearch').value='Ficha';h.get('ownerFilter').value='kam_ana';app.render();
  const original=h.get('contactWorkspace'),detail=h.get('contactDetail'),host=h.get('contactProfileContent'),columns={scrollLeft:480,scrollTop:60};
  h.window.scrollX=0;h.window.scrollY=920;h.window.scrollTo=(x,y)=>{h.window.scrollX=x;h.window.scrollY=y;};original.scrollTop=360;original.scrollLeft=0;detail.parentNode=original;original.insertBefore=node=>{node.parentNode=original;};host.appendChild=node=>{node.parentNode=host;};h.get('commercialBoard').querySelector=()=>columns;
  const opener=new Element('opener');opener.isConnected=true;let focused=0;opener.focus=()=>focused++;h.document.activeElement=opener;
  const route=h.window.location.hash,filters=[h.get('contactSearch').value,h.get('ownerFilter').value];
  await h.click('open-profile',c.id);
  assert.equal(h.get('contactProfileDialog').open,true);assert.equal(h.get('editorDialog').open,false);assert.equal(detail.parentNode,host);assert.match(detail.innerHTML,/Ficha popup/);assert.equal(h.window.location.hash,route);assert.equal(columns.scrollLeft,480);
  await h.click('edit-contact');assert.equal(h.get('editorDialog').open,true);assert.equal(h.get('contactProfileDialog').open,true);assert.equal(detail.parentNode,host);
  await h.click('cancel-dialog');assert.equal(h.get('editorDialog').open,false);assert.equal(h.get('contactProfileDialog').open,true);
  await h.click('new-profile-task');assert.equal(h.get('editorDialog').open,true);await h.click('cancel-dialog');assert.equal(h.get('editorDialog').open,false);assert.equal(h.get('contactProfileDialog').open,true);assert.equal(detail.parentNode,host);assert.equal(h.window.scrollY,920);assert.equal(columns.scrollLeft,480);
  await h.click('new-profile-task');assert.equal(h.get('editorDialog').open,true);const saved=await h.submit({contactId:c.id,title:'Seguimiento popup',dueAt:'2026-10-12T12:00'});assert.equal(saved.error,'');assert.equal(h.get('editorDialog').open,false);assert.equal(h.get('contactProfileDialog').open,true);assert.match(detail.innerHTML,/Seguimiento popup/);
  await h.click('change-stage');const moved=await h.submit({stage:kind==='doctor'?'contacted_demo':'contacted',reason:'Seguimiento'});assert.equal(moved.error,'');assert.equal(h.window.scrollY,920);assert.equal(original.scrollTop,360);
  await h.click('close-profile');assert.equal(h.get('contactProfileDialog').open,false);assert.equal(detail.parentNode,original);assert.equal(detail.hidden,true);assert.equal(columns.scrollLeft,480);assert.equal(columns.scrollTop,60);assert.deepEqual([h.get('contactSearch').value,h.get('ownerFilter').value],filters);assert.ok(focused>0);
  await h.click('move-card',c.id);assert.equal(h.get('editorDialog').open,true);assert.equal(h.get('contactProfileDialog').open,false);app.closeDialog();
  await h.click('open-profile',c.id);await h.get('contactProfileDialog').dispatch('cancel');assert.equal(h.get('contactProfileDialog').open,false);assert.equal(detail.parentNode,original);
  await h.click('open-profile',c.id);app.navigate(kind,'tasks',null);assert.equal(h.get('contactProfileDialog').open,false);assert.equal(detail.parentNode,original);await h.click('open-task-contact',c.id);assert.equal(app.state.contactLayout,'kanban');assert.equal(h.get('contactProfileDialog').open,true);assert.equal(detail.parentNode,host);assert.equal(app.state.selected,c.id);await h.click('close-profile');
  h.get('actorSelect').value='leader_demo';await h.get('actorSelect').dispatch('change');app.navigate(kind,'contacts',null);await h.click('open-profile',c.id);assert.equal(h.get('contactProfileDialog').open,true);assert.doesNotMatch(detail.innerHTML,/data-action="(?:edit-contact|new-profile-task|invite-holder)"/);app.destroy();assert.equal(h.get('contactProfileDialog').open,false);
 }
 for(const file of ['crm-demo.html','assets/js/crm-demo-template.js']){const text=fs.readFileSync(path.join(__dirname,'..',file),'utf8');assert.equal((text.match(/id="contactDetail"/g)||[]).length,1);assert.match(text,/<dialog id="contactProfileDialog"[^>]*aria-labelledby="contactProfileTitle"/);}
 console.log('PASS: Kanban profile popup, reused singular detail, nested editors, task save, independent move, filters/scroll/focus restoration, Escape/navigation and read-only leader for both contact types. Browser rendering not exercised.');
})().catch(e=>{console.error(e);process.exitCode=1;});
