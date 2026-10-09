'use strict';
// Real store and shipped shadow-root adapter, with deterministic DOM/event
// fixtures. No browser is launched and no visual/pixel coverage is claimed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Store = require('../assets/js/crm-demo-store.js');
const UI = require('../assets/js/crm-demo-ui.js');
const Assisted = require('../assets/js/crm-assisted.js');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const cases = [];
const test = (name, run) => cases.push({name, run});
const good = result => { assert.equal(result.ok, true, result.error); return result.value; };
const denied = result => { assert.equal(result.ok, false, 'The operation must be refused'); return result; };
const now = () => new Date('2026-10-09T12:00:00.000Z');
const samples = [
  {type:'patient', name:'Mariana Flores · DEMO', email:'mariana.demo@example.test', phone:'+12025550101', originalSource:'manual'},
  {type:'patient', name:'Pablo Reyes · DEMO', email:'pablo.demo@example.test', phone:'+12025550102', originalSource:'direct_unknown'},
  {type:'doctor', name:'Clínica Horizonte · DEMO', email:'clinica.demo@example.test', phone:'+12025550103', originalSource:'manual'}
];
function disk() {
  const values = new Map();
  return {
    writes:0, failWrite:false,
    getItem:key => values.get(key) ?? null,
    setItem(key, value) { if (this.failWrite) throw Error('QuotaExceededError'); values.set(key, String(value)); this.writes++; },
    removeItem:key => values.delete(key),
    dump:() => JSON.stringify([...values])
  };
}
function fixture(options = {}) {
  const storage = options.storage || disk(); let sequence = 0;
  const make = (actor = {id:'kam_ana', role:'kam'}, overrides = {}) => Store.createStore({storage, actor, now, randomId:() => String(++sequence), ...overrides});
  const store = make(options.actor);
  return {storage, store, make, seed:() => store.seedExamples(store.snapshot().revision)};
}
function create(store, input) { return good(store.createContact(input, store.snapshot().revision)); }
function realContact(store, extra = {}) { return create(store, {type:'patient', name:'Contacto previo real', email:'existing@example.test', phone:'+12025550900', notes:'Conservar sin cambios', originalSource:'organic', ...extra}); }
function assertNoIdentityLeak(result, contacts) {
  const text = JSON.stringify(result);
  for (const c of contacts) for (const secret of [c.id, c.email, c.phone].filter(Boolean)) assert.doesNotMatch(text, new RegExp('(?:^|[^A-Za-z0-9_.:@+-])' + secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[^A-Za-z0-9_.:@+-])'), 'A foreign identifier must not be returned: ' + secret);
}

class Element {
  constructor(tagName = 'div', attrs = {}) {
    this.tagName = tagName.toUpperCase(); this.id = attrs.id || ''; this.attributes = attrs;
    this.dataset = {}; this.listeners = {}; this.value = attrs.value || ''; this.innerHTML = ''; this.textContent = '';
    this.disabled = false; this.hidden = false; this.open = false; this.style = {}; this.isConnected = true;
    const classes = new Set(); this.classList = {add:value => classes.add(value), remove:value => classes.delete(value), toggle:(value, on) => on ? classes.add(value) : classes.delete(value)};
    for (const [name, value] of Object.entries(attrs)) if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(listener => listener !== fn); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  querySelector() { return null; }
  focus() { this.focused = true; }
  scrollIntoView() { this.scrolled = true; }
  closest(selector) { return selector === 'a[href]' ? null : Object.keys(this.dataset).length ? this : null; }
}
function attrs(source) { return Object.fromEntries([...source.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)].map(match => [match[1], match[2] ?? ''])); }
function embedded(options = {}) {
  const storage = options.storage || disk(), nodes = new Map(), staticNodes = [];
  const context = vm.createContext({window:null, document:null, URL, console});
  vm.runInContext(read('assets/js/crm-demo-template.js'), context);
  const template = context.PulzzoCRMTemplate;
  for (const match of template.matchAll(/<(\w+)\b([^>]*)>/g)) {
    const element = new Element(match[1], attrs(match[2])); staticNodes.push(element);
    if (element.id) nodes.set(element.id, element);
  }
  const shadow = new Element();
  shadow.appendChild = () => {};
  shadow.getElementById = id => nodes.get(id) || null;
  shadow.querySelector = () => null;
  shadow.querySelectorAll = selector => {
    const key = {'[data-context-switch]':'contextSwitch', '[data-view]':'view', '[data-contact-layout]':'contactLayout'}[selector];
    return key ? staticNodes.filter(node => Object.hasOwn(node.dataset, key)) : [];
  };
  const owner = {createElement:tag => new Element(tag), querySelector:() => null};
  const window = new Element();
  window.document = owner; window.innerWidth = 1280; window.localStorage = storage;
  window.location = {pathname:'/backoffice.html', origin:'https://fixture.test', href:'https://fixture.test/backoffice.html#crm', hash:'#crm'};
  window.history = {}; window.PulzzoCRMTemplate = template;
  window.PulzzoCRMUI = {createApp:config => UI.createApp({...config, storeModule:Store, assistedModule:Assisted, storage, now})};
  context.window = window; context.document = owner; context.location = window.location;
  vm.runInContext(read('assets/js/crm-demo-embed.js'), context);
  let route = '#' + (options.type || 'patient') + '/contacts';
  const host = {ownerDocument:owner, attachShadow:mode => { assert.equal(mode.mode, 'open'); return shadow; }};
  const mounted = window.PulzzoCRMEmbedding.mount({host, embedding:{actorId:options.actorId || 'kam_ana', renderHeader(){}, readRoute:() => route, writeRoute:value => { route = value; }}});
  async function dispatch(node, type = 'click', nested = false) {
    const target = nested ? {closest:selector => node.closest(selector)} : node;
    const event = {type, target, preventDefault(){}};
    for (const fn of [...(node.listeners[type] || [])]) await fn(event);
    for (const fn of [...(shadow.listeners[type] || [])]) await fn(event);
  }
  function button(label) {
    const match = [...nodes.get('contactDetail').innerHTML.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(match => match[2].replace(/<[^>]*>/g, '').trim().replace(/^[＋+]\s*/, '') === label);
    assert.ok(match, 'Expected a rendered empty-state button: ' + label);
    const node = new Element('button', attrs(match[1]));
    assert.equal(node.attributes.type, 'button', label + ' cannot submit a surrounding form');
    assert.equal(Object.keys(node.attributes).some(key => /^on/i.test(key)), false, 'Actions must use native listeners, never inline JavaScript');
    return node;
  }
  return {app:mounted.app, storage, window, shadow, get:id => nodes.get(id), route:() => route, button, dispatch, destroy:() => mounted.destroy()};
}
async function change(h, id, value) { const node = h.get(id); node.value = value; await h.dispatch(node, id === 'contactSearch' ? 'input' : 'change'); }
async function restrictFilters(h) {
  for (const [id, value] of Object.entries({contactSearch:'No coincide', stageFilter:'submitted', ownerFilter:'kam_luis', attentionFilter:'inactive', inactivityMode:'date', inactivityDays:'27', inactivityDate:'2026-09-01', lifecycleFilter:'archived'})) await change(h, id, value);
}
function assertFiltersCleared(h) {
  for (const id of ['contactSearch', 'stageFilter', 'ownerFilter', 'attentionFilter', 'inactivityDays', 'inactivityDate']) assert.equal(h.get(id).value, '', id + ' must visibly reset');
  assert.equal(h.get('lifecycleFilter').value, 'active');
  assert.equal(h.app.state.filters.lifecycle, 'active');
  assert.equal(h.app.state.filters.attention, '');
  assert.equal(h.get('inactivityControls').hidden, true);
}

test('One seed atomically writes three scoped contacts, three linked tasks and their provenance', () => {
  const h = fixture(); assert.equal(typeof h.store.seedExamples, 'function');
  const result = good(h.seed()), state = h.store.snapshot();
  assert.equal(result.created, 3); assert.equal(result.contacts.length, 3);
  assert.equal(h.storage.writes, 1); assert.equal(state.revision, 1);
  assert.equal(Object.keys(state.contacts).length, 3); assert.equal(Object.keys(state.tasks).length, 3);
  assert.equal(Object.keys(state.audit).length, 6); assert.equal(Object.keys(state.events).length, 6);
  assert.equal(Object.keys(state.expedients).length, 0); assert.equal(Object.keys(state.invitations).length, 0);
  assert.deepEqual(result.contacts.map(c => c.type), ['patient', 'patient', 'doctor']);
  for (const contact of result.contacts) {
    assert.equal(contact.assignedKam, 'kam_ana'); assert.equal(contact.accountExists, false); assert.equal(contact.holderId, null);
    assert.ok(contact.demoFixtureKey); assert.equal(h.store.listTasks({contactId:contact.id}).length, 1);
    assert.equal(Object.values(state.events).filter(event => event.type === 'contact_created' && event.contactId === contact.id).length, 1);
  }
  assert.deepEqual(h.store.listTasks().map(t => t.dueAt).sort(), ['2026-10-08T12:00:00.000Z', '2026-10-09T12:00:00.000Z', '2026-10-11T12:00:00.000Z']);
});

test('Repeated seed is a byte-for-byte no-op and retains an edited sample and closed task', () => {
  const h = fixture(), original = good(h.seed()), contact = original.contacts[0];
  good(h.store.updateContact(contact.id, {name:'Nombre editado del ejemplo', notes:'Seguimiento que no debe borrarse'}, h.store.snapshot().revision));
  const task = h.store.listTasks({contactId:contact.id})[0];
  good(h.store.closeTask(task.id, 'Ya se resolvió el seguimiento', h.store.snapshot().revision));
  const bytes = h.storage.dump(), writes = h.storage.writes, result = good(h.seed());
  assert.equal(result.created, 0); assert.deepEqual(result.contacts.map(c => c.id), original.contacts.map(c => c.id));
  assert.equal(result.contacts[0].name, 'Nombre editado del ejemplo');
  assert.equal(h.storage.dump(), bytes); assert.equal(h.storage.writes, writes);
});

test('Exact legacy sample identities are reused and real contacts, tasks and portal records remain untouched', () => {
  const h = fixture(), real = realContact(h.store), legacy = samples.map(sample => create(h.store, sample));
  const task = good(h.store.createTask({contactId:real.id, title:'Tarea previa ajena al ejemplo', dueAt:'2026-10-20T12:00:00Z'}, h.store.snapshot().revision));
  h.storage.setItem('pulzzo_patient', JSON.stringify({id:'REAL_PORTAL', email:'portal@example.test', phone:'12025550999'}));
  const portal = h.storage.getItem('pulzzo_patient'), before = copy(h.store.snapshot()), result = good(h.seed()), after = h.store.snapshot();
  assert.equal(result.created, 0); assert.deepEqual(result.contacts.map(c => c.id), legacy.map(c => c.id));
  assert.deepEqual(after.contacts[real.id], before.contacts[real.id]); assert.deepEqual(after.tasks[task.id], before.tasks[task.id]);
  for (const contact of legacy) assert.deepEqual(after.contacts[contact.id], before.contacts[contact.id]);
  assert.equal(h.storage.getItem('pulzzo_patient'), portal);
  for (const kind of ['expedients', 'invitations', 'referrals']) assert.deepEqual(after[kind], before[kind]);
});

test('Partial legacy loads recover atomically without replacing IDs or reopening an existing task', () => {
  for (const count of [1, 2]) {
    const h = fixture(), legacy = samples.slice(0, count).map(sample => create(h.store, sample));
    const existingTask = good(h.store.createTask({contactId:legacy[0].id, title:'Seguimiento ya personalizado', dueAt:'2026-11-01T12:00:00Z'}, h.store.snapshot().revision));
    good(h.store.closeTask(existingTask.id, 'Ya resuelta antes de completar los ejemplos', h.store.snapshot().revision));
    const before = copy(h.store.snapshot()), writes = h.storage.writes, result = good(h.seed());
    assert.equal(result.created, 3 - count); assert.equal(h.storage.writes, writes + 1);
    assert.equal(h.store.snapshot().revision, before.revision + 1);
    assert.equal(h.store.listContacts().length, 3); assert.equal(h.store.listTasks().length, 3);
    for (const contact of legacy) assert.deepEqual(h.store.getContact(contact.id), contact);
    assert.deepEqual(h.store.snapshot().tasks[existingTask.id], before.tasks[existingTask.id]);
    const bytes = h.storage.dump(); assert.equal(good(h.seed()).created, 0); assert.equal(h.storage.dump(), bytes);
  }
});

test('Fixture provenance is immutable and cannot be reassigned to an ordinary contact', () => {
  const h = fixture(), example = good(h.seed()).contacts[0], real = realContact(h.store);
  for (const [id, value] of [[example.id, 'kam_luis:mariana'], [real.id, example.demoFixtureKey]]) {
    const bytes = h.storage.dump();
    denied(h.store.transact(h.store.snapshot().revision, draft => { draft.contacts[id].demoFixtureKey = value; }));
    assert.equal(h.storage.dump(), bytes);
  }
});

test('Each KAM gets only its own examples; admin reuse never changes ownership or session identity', () => {
  const h = fixture(), ana = good(h.seed()).contacts;
  const luis = h.make({id:'kam_luis', role:'kam'}), result = good(luis.seedExamples(luis.snapshot().revision));
  assert.equal(result.created, 3); assert.equal(result.contacts.every(c => c.assignedKam === 'kam_luis'), true);
  assertNoIdentityLeak(result, ana); assertNoIdentityLeak(luis.snapshot(), ana);
  assert.equal(new Set([...ana, ...result.contacts].map(c => c.email)).size, 6);
  assert.equal(new Set([...ana, ...result.contacts].map(c => c.phone)).size, 6);
  const admin = h.make({id:'admin_demo', role:'admin'}), bytes = h.storage.dump();
  const reused = good(admin.seedExamples(admin.snapshot().revision));
  assert.deepEqual(reused.contacts.map(c => c.id), ana.map(c => c.id)); assert.equal(reused.created, 0);
  assert.equal(h.storage.dump(), bytes); assert.deepEqual(admin.actor, {id:'admin_demo', role:'admin'});
});

test('Inaccessible or archived fixtures fail without revealing identity, granting access, restoring or reassigning', () => {
  for (const mode of ['reassigned', 'archived']) {
    const h = fixture(), contacts = good(h.seed()).contacts, admin = h.make({id:'admin_demo', role:'admin'}), contact = contacts[1];
    if (mode === 'reassigned') good(admin.reassignContact(contact.id, 'kam_luis', 'Prueba de alcance', admin.snapshot().revision));
    else {
      for (const task of admin.listTasks({contactId:contact.id})) good(admin.closeTask(task.id, 'Cerrar para archivar', admin.snapshot().revision));
      good(admin.deleteContact(contact.id, 'Archivo explícito del ejemplo', admin.snapshot().revision));
    }
    const bytes = h.storage.dump(), result = denied(h.seed());
    assert.equal(h.storage.dump(), bytes); assertNoIdentityLeak(result, [contact]);
    assert.equal(h.store.canAccessContact(contact.id), false);
  }
});

test('A real identity matching any fixture email is never mistaken for that fixture or partially seeded', () => {
  for (const sample of samples) {
    const h = fixture(), contact = realContact(h.store, {type:sample.type, email:sample.email});
    const bytes = h.storage.dump(), result = denied(h.seed());
    assert.equal(h.storage.dump(), bytes); assert.equal(h.store.listContacts().length, 1);
    assert.deepEqual(h.store.getContact(contact.id), contact);
    assert.equal(h.store.listTasks().length, 0); assertNoIdentityLeak(result, [contact]);
  }
});

test('Legacy portal collision, late validation, quota failure, stale revision and nonstaff all leave no partial seed', () => {
  const portal = fixture(); portal.storage.setItem('pulzzo_doctor', JSON.stringify({id:'existing_doctor', email:samples[2].email, phone:samples[2].phone}));
  let bytes = portal.storage.dump(); denied(portal.seed()); assert.equal(portal.storage.dump(), bytes);
  const late = fixture(), guarded = late.make(undefined, {findExistingAccount:c => c.type === 'doctor'});
  bytes = late.storage.dump(); denied(guarded.seedExamples(0)); assert.equal(late.storage.dump(), bytes);
  const quota = fixture(); quota.storage.failWrite = true; bytes = quota.storage.dump(); denied(quota.seed()); assert.equal(quota.storage.dump(), bytes);
  quota.storage.failWrite = false; assert.equal(good(quota.seed()).created, 3, 'A failed write must remain retryable');
  const stale = fixture(); realContact(stale.store); bytes = stale.storage.dump(); denied(stale.store.seedExamples(0)); assert.equal(stale.storage.dump(), bytes);
  const holder = fixture({actor:{id:'holder_demo', role:'holder'}}); bytes = holder.storage.dump(); denied(holder.seed()); assert.equal(holder.storage.dump(), bytes);
});

test('Mounted empty-state actions use shadow-root listeners and select the correct patient or provider sample', async () => {
  for (const type of ['patient', 'doctor']) {
    const h = embedded({type});
    await h.dispatch(h.button('Crear prospecto'), 'click', true);
    assert.equal(h.get('editorDialog').open, true); assert.match(h.get('dialogTitle').textContent, /prospecto/i);
    assert.match(h.get('dialogContent').innerHTML, new RegExp('value="' + type + '"[^>]*selected'));
    h.app.closeDialog();
    await h.dispatch(h.button('Cargar ejemplos ficticios'), 'click', true);
    assert.equal(h.storage.writes, 1); assert.equal(h.app.state.actor.id, 'kam_ana'); assert.equal(h.app.state.type, type);
    const selected = h.app.state.store.getContact(h.app.state.selected);
    assert.equal(selected.type, type); assert.match(h.get('contactDetail').innerHTML, new RegExp(selected.name));
    assert.equal(h.route(), '#' + type + '/contacts/' + selected.id);
    assert.match(h.get('contactList').innerHTML, new RegExp('data-id="' + selected.id + '"'));
    assert.doesNotMatch(h.get('contactDetail').innerHTML, /data-action="seed"/);
    h.destroy();
  }
});

test('Repeated toolbar seed visibly clears every filter and selects an existing type-correct sample without writes', async () => {
  for (const type of ['patient', 'doctor']) {
    const h = embedded({type, actorId:'admin_demo'}); await h.dispatch(h.get('loadExamples'));
    const ids = h.app.state.store.listContacts({type}).map(c => c.id), bytes = h.storage.dump();
    await restrictFilters(h); h.app.navigate(type, 'contacts', null);
    assert.match(h.get('contactList').innerHTML, /No hay contactos/);
    await h.dispatch(h.get('loadExamples'));
    assertFiltersCleared(h); assert.equal(h.app.state.type, type); assert.equal(h.app.state.actor.id, 'admin_demo');
    assert.equal(ids.includes(h.app.state.selected), true); assert.equal(h.storage.dump(), bytes);
    assert.match(h.get('contactList').innerHTML, new RegExp('data-id="' + h.app.state.selected + '"'));
    assert.doesNotMatch(h.get('contactDetail').innerHTML, /data-action="seed"/);
    h.destroy();
  }
});

test('Populated but unselected or filtered views offer Ver contactos, never pretend to be empty or seed', async () => {
  const h = embedded({actorId:'admin_demo'}), patient = realContact(h.app.state.store), provider = realContact(h.app.state.store, {type:'doctor', name:'Proveedor previo', email:'provider@example.test', phone:'+12025550901'});
  const bytes = h.storage.dump();
  for (const [type, expected] of [['patient', patient], ['doctor', provider]]) {
    h.app.navigate(type, 'contacts', null);
    assert.doesNotMatch(h.get('contactDetail').innerHTML, /data-action="seed"/); assert.ok(h.button('Ver contactos'));
    await restrictFilters(h); h.app.navigate(type, 'contacts', null);
    assert.doesNotMatch(h.get('contactDetail').innerHTML, /data-action="seed"/);
    await h.dispatch(h.button('Ver contactos'), 'click', true);
    assertFiltersCleared(h); assert.equal(h.app.state.selected, expected.id); assert.equal(h.storage.dump(), bytes);
    assert.match(h.get('contactDetail').innerHTML, new RegExp(expected.name));
  }
  h.destroy();
});

test('Empty-state availability is current-type and access scoped, and role changes never expose previous samples', async () => {
  const h = embedded(), provider = realContact(h.app.state.store, {type:'doctor'});
  h.app.render(); assert.ok(h.button('Cargar ejemplos ficticios'));
  h.app.navigate('doctor', 'contacts', null); assert.doesNotMatch(h.get('contactDetail').innerHTML, /data-action="seed"/);
  assert.ok(h.button('Ver contactos'));
  await change(h, 'actorSelect', 'kam_luis'); assert.ok(h.button('Cargar ejemplos ficticios'));
  await h.dispatch(h.button('Cargar ejemplos ficticios'));
  assert.equal(h.app.state.actor.id, 'kam_luis'); assert.equal(h.app.state.type, 'doctor');
  assertNoIdentityLeak(h.get('contactList').innerHTML + h.get('contactDetail').innerHTML, [provider]);
  assert.equal(h.app.state.store.getContact(h.app.state.selected).assignedKam, 'kam_luis');
  h.destroy();
});

test('An already-rendered Ver contactos action rechecks access before selecting or revealing a contact', async () => {
  const h = embedded(), contact = realContact(h.app.state.store); h.app.render();
  const oldAction = h.button('Ver contactos');
  const admin = Store.createStore({storage:h.storage, actor:{id:'admin_external', role:'admin'}, now});
  good(admin.reassignContact(contact.id, 'kam_luis', 'Cambio antes del clic', admin.snapshot().revision));
  const bytes = h.storage.dump(); await h.dispatch(oldAction);
  assert.equal(h.app.state.selected, null); assert.equal(h.app.state.actor.id, 'kam_ana'); assert.equal(h.storage.dump(), bytes);
  assertNoIdentityLeak(h.get('contactList').innerHTML + h.get('contactDetail').innerHTML + h.get('notice').textContent, [contact]);
  assert.ok(h.button('Cargar ejemplos ficticios')); h.destroy();
});

test('Mounted seed error leaves the empty action retryable, shows an error and never switches the current role', async () => {
  const h = embedded({type:'doctor', actorId:'kam_luis'}); h.storage.failWrite = true;
  await h.dispatch(h.button('Cargar ejemplos ficticios'));
  assert.equal(h.app.state.selected, null); assert.equal(h.app.state.actor.id, 'kam_luis'); assert.equal(h.app.state.type, 'doctor');
  assert.equal(h.app.state.store.listContacts().length, 0); assert.equal(h.app.state.store.listTasks().length, 0);
  assert.equal(h.get('notice').hidden, false); assert.match(h.get('notice').className, /error/); assert.ok(h.button('Cargar ejemplos ficticios'));
  h.storage.failWrite = false; await h.dispatch(h.button('Cargar ejemplos ficticios'));
  assert.equal(h.app.state.store.listContacts().length, 3); assert.equal(h.app.state.store.listTasks().length, 3);
  h.destroy();
});

(async () => {
  for (const {name, run} of cases) { await run(); console.log('PASS: ' + name); }
  console.log('PASS: ' + cases.length + ' CRM empty-state, atomic-example and native embedded-handler regression groups. Browser rendering remains unverified.');
})().catch(error => { console.error(error); process.exitCode = 1; });
