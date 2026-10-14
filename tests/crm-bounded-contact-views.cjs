'use strict';
// Deterministic mounted-handler/markup bounds; no browser or timing claims.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const UI = require('../assets/js/crm-demo-ui.js');
const Store = require('../assets/js/crm-demo-store.js');
const fixtureFile = path.join(__dirname, 'crm-task-contact-search.cjs');
const source = fs.readFileSync(fixtureFile, 'utf8');
const ctx = vm.createContext({require:createRequire(fixtureFile), __dirname, console, Blob, URL, URLSearchParams});
vm.runInContext(source.slice(0, source.indexOf('let sequence = 0;')) + '\nglobalThis.mountedSetup=setup;', ctx, {filename:fixtureFile});
const setup = ctx.mountedSetup;
const count = (html, pattern) => [...html.matchAll(pattern)].length;
const ids = html => [...html.matchAll(/data-id="([^"]+)"/g)].map(match => match[1]);
const results = h => [...h.get('taskContactResults').innerHTML.matchAll(/data-task-contact="([^"]+)"/g)].map(match => match[1]);
const good = result => {assert.equal(result.ok, true, result.error);return result.value;};
function seed(h, total) {
  const sample = good(h.app.state.store.createContact({phone:(globalThis.__pzPhone=(globalThis.__pzPhone||100000)+1,'5500'+globalThis.__pzPhone),type:'patient',name:'Fictional scale seed',email:'seed@example.test',originalSource:'manual'}, h.app.state.store.snapshot().revision));
  const raw = JSON.parse(h.storage.getItem(Store.STORAGE_KEY)), stages = Object.keys(UI.STAGES.patient);
  raw.contacts = {}; raw.events = {}; raw.audit = {}; raw.tasks = {}; raw.activities = {};
  for (let i = 0; i < total; i++) {
    const id = 'scale_' + String(i).padStart(5, '0');
    raw.contacts[id] = {...sample,id,name:'Fictional contact ' + String(i).padStart(5,'0'),email:'scale.' + i + '@example.test',phone:'55'+String(10000000+i),stage:stages[i % stages.length],stageReason:['no_response','not_interested'].includes(stages[i % stages.length])?'Fictional closed-stage reason':null};
    if (i % 10 === 0) {
      const taskId='task_'+id, activityId='activity_'+id;
      raw.tasks[taskId]={id:taskId,contactId:id,title:'Fictional follow-up '+i,status:'open',dueAt:'2026-10-15T12:00:00Z',createdAt:sample.createdAt};
      raw.activities[activityId]={id:activityId,contactId:id,type:'call',contactAt:'2026-10-08T12:00:00Z',createdAt:sample.createdAt,summary:'Fictional attempt '+i};
    }
  }
  h.storage.setItem(Store.STORAGE_KEY, JSON.stringify(raw));
  let reads=0;
  const get=h.storage.getItem.bind(h.storage);
  h.storage.getItem=key=>{if(key===Store.STORAGE_KEY)reads++;return get(key);};
  h.reads=()=>reads; h.resetReads=()=>{reads=0;};
}
function layout(h, name) {h.app.handlers.click({target:{dataset:{contactLayout:name},closest(){return this;}}});}
async function pageSize(h, size) {h.get('contactPageSize').value=String(size);await h.get('contactPageSize').dispatch('change');}
async function more(h) {await h.get('taskContactMore').dispatch('click');}
const tests=[]; const test=(name,run)=>tests.push({name,run});

test('10,000 fictional contacts render 25 rows with full counts; page sizes and ordering stay bounded and stable', async()=>{
  const h=setup();seed(h,10000);h.app.render();
  const list=()=>ids(h.get('contactList').innerHTML);
  assert.equal(list().length,25);assert.equal(list()[0],'scale_00000');assert.equal(list()[24],'scale_00024');
  assert.equal(h.get('contactCount').textContent,'10000 contactos');assert.match(h.get('contactPageStatus').textContent,/1–25 de 10000/);
  await h.click('contact-page-next');assert.equal(list()[0],'scale_00025');assert.equal(list()[24],'scale_00049');
  await h.click('contact-page-prev');assert.equal(list()[0],'scale_00000');
  for(const size of [50,100]){await pageSize(h,size);assert.equal(list().length,size);assert.equal(list()[size-1],'scale_'+String(size-1).padStart(5,'0'));}
  await pageSize(h,9999);assert.equal(list().length,25,'Forged page sizes are clamped to supported values');
  h.get('contactSearch').value='Fictional contact 000';await h.get('contactSearch').dispatch('input');assert.equal(h.app.state.contactPage,0);assert.equal(list().length,25);assert.equal(h.get('contactCount').textContent,'100 contactos');
  h.app.destroy();
});

test('Filter edits retain exact selected identity; route Back/Forward brings its page into view without implicit selection', async()=>{
  const h=setup();seed(h,260);h.app.navigate('patient','contacts','scale_00153');
  assert.equal(h.app.state.contactPage,6);assert.ok(ids(h.get('contactList').innerHTML).includes('scale_00153'));
  await h.click('contact-page-next');assert.equal(h.app.state.selected,'scale_00153');assert.match(h.get('contactSelectionStatus').textContent,/otra página/);
  h.get('contactSearch').value='Fictional contact 002';await h.get('contactSearch').dispatch('input');assert.equal(h.app.state.selected,'scale_00153');assert.equal(h.app.state.contactPage,0);assert.match(h.get('contactSelectionStatus').textContent,/fuera de estos resultados/);
  h.get('contactSearch').value='';await h.get('contactSearch').dispatch('input');
  h.window.location.hash='#patient/contacts/scale_00212';for(const f of h.window.listeners.popstate||[])f({});
  assert.equal(h.app.state.selected,'scale_00212');assert.equal(h.app.state.contactPage,8);assert.ok(ids(h.get('contactList').innerHTML).includes('scale_00212'));
  h.window.location.hash='#patient/contacts/scale_00153';for(const f of h.window.listeners.popstate||[])f({});
  assert.equal(h.app.state.selected,'scale_00153');assert.equal(h.app.state.contactPage,6);
  h.app.destroy();
});

test('Per-render storage read counts stay constant between 100 and 10,000 contacts; attention and next tasks remain accurate',()=>{
  const counts=[];
  for(const size of [100,10000]){
    const h=setup();seed(h,size);h.resetReads();h.app.render();const directory=h.reads();
    h.resetReads();layout(h,'kanban');const board=h.reads();
    assert.ok(directory<=8,'Directory must not parse storage per contact: '+directory);
    assert.ok(board<=8,'Kanban must not parse storage per card: '+board);
    assert.match(h.get('attentionFilter').innerHTML,new RegExp('Sin próxima tarea · '+(size-size/10)));
    assert.match(h.get('commercialBoard').innerHTML,/Fictional follow-up 0/);
    assert.equal(h.get('contactList').innerHTML,'','Inactive list does not retain a hidden full or duplicate DOM');
    counts.push({directory,board});h.app.destroy();
  }
  assert.deepEqual(counts[0],counts[1]);
});

test('Kanban starts at 20 cards per stage, Load more touches one stage, and filters reset the bounds',async()=>{
  const h=setup();seed(h,10000);layout(h,'kanban');
  const cards=()=>count(h.get('commercialBoard').innerHTML,/class="kanban-card"/g);
  assert.equal(cards(),Object.keys(UI.STAGES.patient).length*20);
  assert.match(h.get('commercialBoard').innerHTML,/20 de 1429/);
  await h.click('load-more-stage',null,{stage:'new'});assert.equal(cards(),Object.keys(UI.STAGES.patient).length*20+20);
  h.app.navigate('patient','contacts','scale_09996');assert.equal(h.app.state.selected,'scale_09996');assert.equal(cards(),160,'Deep-linked detail does not instantiate thousands of prior cards');
  h.get('stageFilter').value='new';await h.get('stageFilter').dispatch('change');assert.equal(cards(),20);
  layout(h,'list');assert.equal(h.get('commercialBoard').innerHTML,'');assert.ok(count(h.get('contactList').innerHTML,/<button class="contact-row[ "]/g)<=25);
  h.app.destroy();
});

test('Large task picker begins at 20, keeps hidden choices bounded and preserves chosen stable IDs across Load more',async()=>{
  const h=setup();seed(h,10000);h.app.handlers.taskEditor();
  assert.equal(results(h).length,20);assert.match(h.get('taskContactStatus').textContent,/Mostrando 20 de 10000/);
  assert.ok(h.get('taskContactSelect').options.length<=22);assert.equal(h.get('taskContactSelect').value,'');
  await h.chooseResult('scale_09999');assert.equal(h.get('taskContactSelect').value,'','A forged invisible result is not a selection');
  await more(h);assert.equal(results(h).length,40);
  await h.chooseResult('scale_00031');assert.equal(h.get('taskContactSelect').value,'scale_00031');
  await more(h);assert.equal(results(h).length,60);assert.equal(h.get('taskContactSelect').value,'scale_00031');assert.ok(h.get('taskContactSelect').options.length<=22);
  await h.type('Fictional contact');assert.equal(results(h).length,20);assert.equal(h.get('taskContactSelect').value,'','Even equivalent query edits clear selection');
  await h.type('Fictional contact 09999');assert.deepEqual(results(h),['scale_09999']);await h.chooseResult('scale_09999');
  assert.equal((await h.submitMounted()).error,'');assert.equal(h.app.state.store.listTasks().filter(t=>t.title==='Seguimiento ficticio')[0].contactId,'scale_09999');
  h.app.destroy();
});

test('Task search identity reads and storage-event access validation are collection-bounded',async()=>{
  const h=setup();seed(h,10000);let batches=0, singles=0;
  h.window.PulzzoCRMOffice={taskContactIdentities(_storage,_store,contactIds){batches++;assert.equal(contactIds.length,10000);return {scale_09999:{rfc:'SCALE900101AB1'}};},taskContactIdentity(){singles++;return {rfc:'SCALE900101AB1'};}};
  h.app.handlers.taskEditor();h.resetReads();await h.type('SCALE900101AB1');
  assert.equal(batches,1);assert.equal(singles,0);assert.deepEqual(results(h),['scale_09999']);assert.ok(h.reads()<=2);
  await h.chooseResult('scale_09999');h.resetReads();h.storageEvent();assert.ok(h.reads()<=10,'Cross-tab access check must use one allowed-ID set');
  assert.equal(h.get('editorDialog').open,true);assert.equal(h.get('taskContactSelect').value,'scale_09999');
  h.app.destroy();
});

(async()=>{for(const {name,run} of tests){await run();console.log('PASS: '+name);}console.log('PASS: '+tests.length+' deterministic contact-scaling groups. Browser layout and elapsed-time performance were not measured.');})().catch(error=>{console.error(error);process.exitCode=1;});
