'use strict';
// Mounted handlers and real domain stores, using a deterministic form/select
// fixture. This suite does not launch a browser or claim rendering coverage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const UI = require('../assets/js/crm-demo-ui.js');
const Store = require('../assets/js/crm-demo-store.js');
const Office = require('../assets/js/crm-demo-office.js');
const fixtureFile = path.join(__dirname, 'crm-demo-ui.cjs');
const fixtureSource = fs.readFileSync(fixtureFile, 'utf8');
const marker = fixtureSource.indexOf('(async()=>{');
assert.ok(marker > 0, 'The shared mounted-handler fixture must be available');
const context = vm.createContext({require:createRequire(fixtureFile), __dirname, console, Blob, URL, URLSearchParams});
vm.runInContext(fixtureSource.slice(0, marker) + '\nglobalThis.fixture={setup,Element,Classes};', context, {filename:fixtureFile});
const cases = [];
const test = (name, run) => cases.push({name, run});
const good = result => { assert.equal(result.ok, true, result.error); return result.value; };
const decode = text => String(text).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function attributes(source) {
  const attrs = {};
  for (const match of source.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) attrs[match[1]] = decode(match[2] ?? '');
  return attrs;
}
function mountSelect(node, initialHTML) {
  let html = '', selected = '';
  Object.defineProperty(node, 'innerHTML', {
    get: () => html,
    set(value) {
      html = String(value);
      node.options = [...html.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map(match => {
        const attrs = attributes(match[1]);
        return {value:attrs.value ?? '', label:decode(match[2]), selected:Object.hasOwn(attrs, 'selected'), disabled:Object.hasOwn(attrs, 'disabled')};
      });
      const first = node.options.find(option => option.selected) || node.options[0];
      selected = first ? first.value : '';
    }
  });
  Object.defineProperty(node, 'value', {
    get: () => selected,
    // Native selects cannot hold a value absent from their option list.
    set(value) { selected = node.options.some(option => option.value === String(value)) ? String(value) : ''; }
  });
  node.innerHTML = initialHTML;
}
function setup() {
  const h = context.fixture.setup();
  h.window.PulzzoCRMOffice = Office;
  const originalGet = h.get, dialog = originalGet('dialogContent');
  let markup = '', mounted = new Map(), controls = [];
  const dynamicIds = new Set(['taskContactSearch', 'taskContactSelect', 'taskContactClear', 'taskContactStatus']);
  const originalDocumentGet = h.document.getElementById;
  h.document.getElementById = id => mounted.get(id) || (dynamicIds.has(id) ? null : originalDocumentGet(id));
  h.get = id => h.document.getElementById(id);
  Object.defineProperty(dialog, 'innerHTML', {
    get: () => markup,
    set(value) {
      markup = String(value); mounted = new Map(); controls = [];
      const pattern = /<(input|select|button|p)\b([^>]*)>(?:(?!<input\b)([\s\S]*?)<\/\1>)?/g;
      for (const match of markup.matchAll(pattern)) {
        const tag = match[1], attrs = attributes(match[2]);
        const node = new context.fixture.Element(attrs.id || '');
        node.tagName = tag.toUpperCase(); node.name = attrs.name || ''; node.type = attrs.type || '';
        node.value = attrs.value || ''; node.required = Object.hasOwn(attrs, 'required'); node.disabled = Object.hasOwn(attrs, 'disabled');
        node.attributes = attrs; node.textContent = decode(match[3] || '');
        node.removeEventListener = (type, handler) => { node.listeners[type] = (node.listeners[type] || []).filter(fn => fn !== handler); };
        node.focus = () => { h.document.activeElement = node; };
        node.getAttribute = name => Object.hasOwn(node.attributes, name) ? node.attributes[name] : null;
        node.closest = () => null;
        if (tag === 'select') mountSelect(node, match[3] || '');
        else node.innerHTML = match[3] || '';
        if (node.id) mounted.set(node.id, node);
        controls.push(node);
      }
    }
  });
  dialog.querySelector = selector => selector === 'input,select,textarea,button' ? controls.find(node => ['INPUT', 'SELECT', 'BUTTON'].includes(node.tagName)) || null : null;
  h.controls = () => controls;
  h.form = () => {
    const fields = controls.slice();
    const error = fields.find(node => Object.hasOwn(node.attributes, 'data-form-error')) || new context.fixture.Element();
    return {
      elements:{namedItem:name => fields.find(node => node.name === name) || null},
      classList:new context.fixture.Classes(),
      querySelector:selector => selector === '[data-form-error]' ? error : null,
      querySelectorAll:() => fields.filter(node => ['INPUT', 'SELECT', 'BUTTON'].includes(node.tagName)),
      checkValidity:() => fields.every(node => node.disabled || !node.required || !!node.value),
      reportValidity(){ this.reportedInvalid = true; },
      error
    };
  };
  h.submitMounted = async (values = {}, options = {}) => {
    const form = h.form();
    for (const [name, value] of Object.entries({title:'Seguimiento ficticio', dueAt:'2026-10-10T12:30', ...values})) {
      const field = form.elements.namedItem(name); if (field) field.value = value;
    }
    if (options.bypassValidity) form.checkValidity = () => true;
    await dialog.dispatch('submit', {target:form});
    return {error:form.error.textContent, form};
  };
  h.type = async query => { const input = h.get('taskContactSearch'); assert.ok(input, 'Search must be mounted'); input.value = query; await input.dispatch('input'); };
  h.select = async id => { const select = h.get('taskContactSelect'); assert.ok(select); select.value = id; await select.dispatch('change'); };
  h.clear = async () => { const button = h.get('taskContactClear'); assert.ok(button); await button.dispatch('click'); };
  h.optionIds = () => h.get('taskContactSelect').options.map(option => option.value).filter(Boolean);
  h.storageEvent = () => { for (const listener of h.window.listeners.storage || []) listener({key:Store.STORAGE_KEY}); };
  h.bytes = () => h.storage.getItem(Store.STORAGE_KEY);
  return h;
}
let sequence = 0;
function add(h, name, extra = {}, store = h.app.state.store) {
  sequence++;
  return good(store.createContact({type:'patient', name, email:'task.' + sequence + '@example.test', phone:'+1202555' + String(sequence).padStart(4, '0'), originalSource:'manual', ...extra}, store.snapshot().revision));
}
function admin(h) { return Store.createStore({storage:h.storage, actor:{id:'admin_external', role:'admin'}, now:() => new Date('2026-10-09T12:00:00Z')}); }
async function role(h, id) { h.get('actorSelect').value = id; await h.get('actorSelect').dispatch('change'); }
function sameIds(actual, expected) { assert.deepEqual([...actual].sort(), [...expected].sort()); }
function open(h, selected) { h.app.handlers.taskEditor(null, selected); assert.equal(h.get('editorDialog').open, true); }
async function rejectsWithoutWrite(h, values) {
  const before = h.bytes(), result = await h.submit(values);
  assert.ok(result.error, 'A forged or stale contact must produce an explicit error');
  assert.equal(h.bytes(), before, 'A rejected task must not mutate tasks, audit, events, or revision');
  return result;
}

test('Search normalizes case, accents, whitespace and telephone formatting without matching unrelated fields', () => {
  assert.equal(typeof UI.taskContactMatches, 'function');
  const contact = {id:'ct_private_internal', name:'José   Núñez Álvarez', email:'JOSE.NUNEZ@EXAMPLE.TEST', phone:'525512345678', rfc:'NUAJ900101AB1', curp:'NUAJ900101HDFNLN09', notes:'private note'};
  for (const query of ['jose', '  JOSÉ   NÚÑEZ  ', 'Nu\u0301n\u0303ez', 'jose.nunez@example.test', '+52 (55) 1234-5678', '55 1234 5678', 'nuaj900101ab1', ' NUAJ900101HDFNLN09 ', '', '  \t  ']) {
    assert.equal(UI.taskContactMatches(contact, query, {rfc:contact.rfc, curp:contact.curp}), true, JSON.stringify(query));
  }
  for (const query of ['other@example.test', 'ct_private_internal', 'private note', '5559999999']) assert.equal(UI.taskContactMatches(contact, query), false, query);
  assert.equal(UI.taskContactMatches(contact, contact.rfc), false, 'Unverified raw contact fields cannot bypass linked-identity checks');
  assert.equal(UI.taskContactMatches(contact, contact.curp), false, 'CURP must come from the scoped identity resolver');
  const withoutIdentity = {name:'Otra Persona', email:'other@example.test', phone:'12025559999'};
  assert.equal(UI.taskContactMatches(withoutIdentity, 'nuaj900101ab1', {rfc:contact.rfc, curp:contact.curp}), true);
  assert.equal(UI.taskContactMatches(withoutIdentity, 'nuaj900101hdfnln09', {rfc:contact.rfc, curp:contact.curp}), true);
  assert.equal(UI.taskContactMatches(withoutIdentity, 'nuaj900101ab1'), false, 'Identity is not guessed from another contact');
});

test('New-task picker has a required blank choice and lists only active contacts of the current type and role', async () => {
  const h = setup(), mine = add(h, 'Mi contacto'), doctor = add(h, 'Médico privado', {type:'doctor'}), owner = admin(h);
  const foreign = add(h, 'Contacto de Luis', {assignedKam:'kam_luis'}, owner);
  const archived = add(h, 'Prospecto archivado'); good(owner.deleteContact(archived.id, 'Archivo ficticio', owner.snapshot().revision));
  open(h);
  const html = h.get('dialogContent').innerHTML, select = h.get('taskContactSelect');
  assert.ok(h.get('taskContactSearch')); assert.ok(h.get('taskContactClear')); assert.ok(h.get('taskContactStatus'));
  assert.equal(select.name, 'contactId'); assert.equal(select.required, true); assert.equal(select.value, '');
  assert.equal(select.options[0].value, '', 'No eligible result may be implicitly selected');
  sameIds(h.optionIds(), [mine.id]);
  assert.doesNotMatch(html + select.innerHTML, new RegExp([foreign.name, doctor.name, archived.name].join('|')));
  assert.ok(h.get('taskContactStatus').getAttribute('aria-live') || h.get('taskContactStatus').getAttribute('role') === 'status', 'Result feedback must be announced');
  const before = h.bytes(), blank = await h.submitMounted();
  assert.equal(blank.form.reportedInvalid, true); assert.equal(h.bytes(), before);
  await role(h, 'admin_demo'); open(h); sameIds(h.optionIds(), [mine.id, foreign.id]);
  h.app.navigate('doctor', 'tasks'); open(h); sameIds(h.optionIds(), [doctor.id]);
  h.app.destroy();
});

test('Typing filters immediately; empty and unmatched searches do not choose a contact', async () => {
  const h = setup(), a = add(h, 'José Núñez', {email:'jose.search@example.test', phone:'+52 55 1234 5678'}), b = add(h, 'Otro contacto');
  open(h);
  for (const query of ['JOSE NUNEZ', 'SEARCH@EXAMPLE.TEST', '+52 (55) 1234-5678']) {
    await h.type(query); assert.equal(h.optionIds().includes(a.id), true, 'Expected a result for ' + query); sameIds(h.optionIds(), [a.id]); assert.equal(h.get('taskContactSelect').value, '');
  }
  await h.type('no-such-person'); sameIds(h.optionIds(), []); assert.equal(h.get('taskContactSelect').value, '');
  assert.match(h.get('taskContactStatus').textContent, /sin|no hay|ning[uú]n|0/i);
  await h.type(' \t '); sameIds(h.optionIds(), [a.id, b.id]); assert.equal(h.get('taskContactSelect').value, '');
  assert.equal(h.app.state.store.listTasks().length, 0); h.app.destroy();
});

test('RFC/CURP search uses only scoped linked identities and never adds full identifiers to result labels', async () => {
  const h = setup(), a = add(h, 'Identidad vinculada'), b = add(h, 'Sin identidad vinculada'), owner = admin(h);
  const foreign = add(h, 'Identidad inaccesible', {assignedKam:'kam_luis'}, owner);
  const identity = {rfc:'NUAJ900101AB1', curp:'NUAJ900101HDFNLN09'}, queried = [];
  const lookup = (storage, store, id) => {
    assert.equal(storage, h.storage); assert.equal(store, h.app.state.store); queried.push(id);
    return id === a.id ? {...identity} : {rfc:'', curp:''};
  };
  h.window.PulzzoCRMOffice = {...Office, taskContactIdentity:lookup, taskContactIdentities(storage, store, ids) {
    return Object.fromEntries(ids.map(id => [id, lookup(storage, store, id)]));
  }};
  open(h);
  for (const query of ['nuaj-900101-ab1', 'nuaj900101hdfnln09']) {
    await h.type(query); sameIds(h.optionIds(), [a.id]); assert.equal(h.get('taskContactSelect').value, '');
    const rendered = h.get('taskContactSelect').innerHTML + h.get('taskContactStatus').textContent;
    assert.doesNotMatch(rendered, /NUAJ900101AB1|NUAJ900101HDFNLN09/i);
  }
  assert.ok(queried.includes(a.id)); assert.ok(queried.includes(b.id)); assert.equal(queried.includes(foreign.id), false);
  await h.select(a.id); assert.equal((await h.submitMounted()).error, '');
  assert.equal(h.app.state.store.listTasks()[0].contactId, a.id); h.app.destroy();
});

test('An RFC/CURP match is revalidated at submit rather than trusting the cached picker result', async () => {
  const h = setup(), a = add(h, 'Registro con identidad'); let identity = {rfc:'NUAJ900101AB1', curp:'NUAJ900101HDFNLN09'};
  h.window.PulzzoCRMOffice = {...Office, taskContactIdentities(_storage, _store, ids) {
    return Object.fromEntries(ids.map(id => [id, {...identity}]));
  }, taskContactIdentity() { return {...identity}; }};
  open(h); await h.type('NUAJ900101AB1'); sameIds(h.optionIds(), [a.id]); await h.select(a.id);
  identity = {rfc:'OTRA900101AB1', curp:''};
  await rejectsWithoutWrite(h, {contactId:a.id, title:'Identidad vinculada cambió', dueAt:'2026-10-10T12:30'});
  h.app.destroy();
});

test('Directory filters do not silently remove eligible new-task contacts; labels escape contact markup', async () => {
  const h = setup(), a = add(h, 'Texto <img src=x onerror=evil()>', {email:'escape@example.test'}), b = add(h, 'Otra persona');
  h.get('contactSearch').value = 'No coincide'; h.get('stageFilter').value = 'submitted'; h.get('ownerFilter').value = 'kam_luis';
  open(h); sameIds(h.optionIds(), [a.id, b.id]);
  const html = h.get('taskContactSelect').innerHTML;
  assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img/); h.app.destroy();
});

test('With no eligible contacts, New Task gives a useful message without opening an empty editor', () => {
  const h = setup(); h.app.handlers.taskEditor();
  assert.equal(h.get('editorDialog').open, false); assert.match(h.get('notice').textContent, /prospecto|contacto/i);
  assert.equal(h.app.state.store.listTasks().length, 0); h.app.destroy();
});

test('Duplicate names retain email/phone disambiguation and selecting the second ID creates exactly its task', async () => {
  const h = setup(), a = add(h, 'Nombre duplicado'), b = add(h, 'Nombre duplicado');
  open(h); await h.type('nombre duplicado');
  const choices = h.get('taskContactSelect').options.filter(option => option.value);
  assert.equal(choices.length, 2);
  for (const c of [a, b]) {
    const label = choices.find(option => option.value === c.id).label;
    assert.ok(label.includes(c.email), 'Duplicate names expose their own email for disambiguation');
    assert.ok(label.replace(/\D/g, '').includes(c.phone), 'Duplicate names expose their own phone for disambiguation');
  }
  await h.select(b.id); const saved = await h.submitMounted({title:'Tarea de la segunda identidad'});
  assert.equal(saved.error, ''); const tasks = h.app.state.store.listTasks();
  assert.equal(tasks.length, 1); assert.equal(tasks[0].contactId, b.id); assert.equal(tasks[0].title, 'Tarea de la segunda identidad');
  assert.equal(h.get('editorDialog').open, false);
  await h.submit({contactId:b.id, title:'Repetida', dueAt:'2026-10-10T12:30'}); assert.equal(h.app.state.store.listTasks().length, 1);
  h.app.destroy();
});

test('Every query edit clears the old selection, including equivalent text; clear restores all choices without selecting', async () => {
  const h = setup(), a = add(h, 'Ana Pérez'), b = add(h, 'Ana segunda'); open(h, a.id);
  assert.equal(h.get('taskContactSelect').value, a.id, 'The explicitly requested contact is preselected');
  await h.type('Ana'); assert.equal(h.get('taskContactSelect').value, ''); await h.select(a.id);
  await h.type('ANA '); assert.equal(h.get('taskContactSelect').value, '', 'Even a query edit that keeps the match needs fresh selection');
  await h.select(b.id); await h.clear();
  assert.equal(h.get('taskContactSearch').value, ''); assert.equal(h.get('taskContactSelect').value, ''); sameIds(h.optionIds(), [a.id, b.id]);
  await rejectsWithoutWrite(h, {contactId:'', title:'No elegir implícitamente', dueAt:'2026-10-10T12:30'});
  await h.select(a.id); assert.equal((await h.submitMounted()).error, ''); assert.equal(h.app.state.store.listTasks()[0].contactId, a.id);
  h.app.destroy();
});

test('Forged, inaccessible, wrong-type and archived IDs are rejected even with native validation bypassed', async () => {
  const h = setup(), a = add(h, 'Elegible'), doctor = add(h, 'No es paciente', {type:'doctor'}), owner = admin(h);
  const foreign = add(h, 'Privado de otro KAM', {assignedKam:'kam_luis'}, owner), archived = add(h, 'Archivado');
  good(owner.deleteContact(archived.id, 'Archivo ficticio', owner.snapshot().revision));
  h.app.handlers.taskEditor(null, foreign.id); assert.equal(h.get('editorDialog').open, false, 'An explicitly inaccessible preselection must be refused');
  open(h); assert.equal(h.get('taskContactSelect').value, '');
  for (const id of ['ct_forged', foreign.id, doctor.id, archived.id, '', a.name]) {
    await rejectsWithoutWrite(h, {contactId:id, title:'Intento inválido', dueAt:'2026-10-10T12:30'});
  }
  await h.type('no-match');
  await rejectsWithoutWrite(h, {contactId:a.id, title:'ID válido fuera de la búsqueda', dueAt:'2026-10-10T12:30'});
  h.app.destroy();
});

test('Current scoped matches and captured IDs are rechecked at save, including contacts introduced after opening', async () => {
  const h = setup(), a = add(h, 'Contacto inicial'); open(h); await h.type('inicial'); await h.select(a.id);
  const later = add(h, 'Contacto inicial posterior');
  const introduced = await rejectsWithoutWrite(h, {contactId:later.id, title:'No estaba al abrir', dueAt:'2026-10-10T12:30'});
  assert.match(introduced.error, /Selecciona un contacto/, 'A newly introduced ID fails the captured-option gate before the domain revision check');
  await rejectsWithoutWrite(h, {contactId:a.id, title:'Revisión antigua', dueAt:'2026-10-10T12:30'});
  h.app.closeDialog(); open(h); await h.select(later.id); assert.equal((await h.submitMounted()).error, '');
  assert.equal(h.app.state.store.listTasks()[0].contactId, later.id); h.app.destroy();
});

for (const transition of ['reassign', 'archive']) test('A contact ' + transition + ' between selection and submission cannot be saved or remain visible', async () => {
  const h = setup(), a = add(h, 'Contacto que cambia'), owner = admin(h); open(h); await h.select(a.id);
  if (transition === 'reassign') good(owner.reassignContact(a.id, 'kam_luis', 'Transferencia ficticia', owner.snapshot().revision));
  else good(owner.deleteContact(a.id, 'Archivo ficticio', owner.snapshot().revision));
  await rejectsWithoutWrite(h, {contactId:a.id, title:'Acceso antiguo', dueAt:'2026-10-10T12:30'});
  h.storageEvent(); assert.equal(h.get('editorDialog').open, false); assert.equal(h.get('dialogContent').innerHTML, '');
  assert.equal(h.app.state.dialogHandler, null); assert.equal(h.app.state.store.listTasks().length, 0); h.app.destroy();
});

test('Actor/type/navigation/dismissal transitions close the picker and remove old input listeners', async () => {
  for (const transition of ['actor', 'type', 'navigation', 'back-forward', 'dismiss', 'pagehide', 'destroy']) {
    const h = setup(), a = add(h, 'Selección anterior'); open(h); await h.select(a.id);
    const oldSearch = h.get('taskContactSearch'), oldSelect = h.get('taskContactSelect'), oldClear = h.get('taskContactClear');
    if (transition === 'actor') await role(h, 'kam_luis');
    if (transition === 'type') h.app.navigate('doctor', 'tasks');
    if (transition === 'navigation') h.app.navigate('patient', 'dashboard');
    if (transition === 'back-forward') { h.window.location.hash = '#doctor/tasks'; for (const listener of h.window.listeners.popstate || []) listener({}); }
    if (transition === 'dismiss') h.app.closeDialog();
    if (transition === 'pagehide') for (const listener of h.window.listeners.pagehide || []) listener({});
    if (transition === 'destroy') h.app.destroy();
    assert.equal(h.get('editorDialog').open, false, transition); assert.equal(h.app.state.dialogHandler, null, transition);
    for (const node of [oldSearch, oldSelect, oldClear]) assert.equal(Object.values(node.listeners).flat().length, 0, transition + ': detached picker listeners must be removed');
    const before = h.bytes(); await oldSearch.dispatch('input'); await oldSelect.dispatch('change'); await oldClear.dispatch('click');
    await h.submit({contactId:a.id, title:'Evento tardío', dueAt:'2026-10-10T12:30'}); assert.equal(h.bytes(), before, transition);
    if (transition === 'pagehide') { open(h); await h.type('anterior'); sameIds(h.optionIds(), [a.id]); await h.select(a.id); assert.equal((await h.submitMounted()).error, '', 'A bfcache-style resume can open a working fresh picker'); }
    h.app.destroy();
  }
});

test('Unrelated storage notifications preserve task query, selection and entered fields, while later writes block stale saves', async () => {
  const h = setup(), a = add(h, 'Contacto elegido'), b = add(h, 'Otra ficha'), owner = admin(h);
  open(h); await h.type('elegido'); await h.select(a.id);
  const fields = h.form(); fields.elements.namedItem('title').value = 'Borrador que debe conservarse';
  fields.elements.namedItem('dueAt').value = '2026-10-15T17:45';
  const search = h.get('taskContactSearch'), select = h.get('taskContactSelect');
  h.storageEvent(); assert.equal(h.get('editorDialog').open, true);
  assert.equal(h.get('taskContactSearch'), search); assert.equal(search.value, 'elegido'); assert.equal(select.value, a.id);
  assert.equal(h.form().elements.namedItem('title').value, 'Borrador que debe conservarse');
  assert.equal(h.form().elements.namedItem('dueAt').value, '2026-10-15T17:45');
  good(owner.updateContact(b.id, {notes:'Cambio concurrente en otra ficha'}, owner.snapshot().revision)); h.storageEvent();
  assert.equal(h.get('editorDialog').open, true); assert.equal(search.value, 'elegido'); assert.equal(select.value, a.id);
  const result = await rejectsWithoutWrite(h, {contactId:a.id, title:'Borrador que debe conservarse', dueAt:'2026-10-15T17:45'});
  assert.match(result.error, /cambi|actualiz/i); h.app.destroy();
});

test('Reopening has fresh query and selection, and stale DOM controls cannot alter the new picker', async () => {
  const h = setup(), a = add(h, 'Primero'), b = add(h, 'Segundo'); open(h); await h.type('Primero'); await h.select(a.id);
  const old = h.get('taskContactSearch'); h.app.closeDialog(); open(h); assert.equal(h.get('taskContactSearch').value, ''); assert.equal(h.get('taskContactSelect').value, '');
  await h.type('Segundo'); old.value = 'Primero'; await old.dispatch('input'); sameIds(h.optionIds(), [b.id]);
  await h.select(b.id); assert.equal((await h.submitMounted()).error, ''); assert.equal(h.app.state.store.listTasks()[0].contactId, b.id); h.app.destroy();
});

test('Editing an existing task keeps its original contact even if a different contact ID is submitted', async () => {
  const h = setup(), a = add(h, 'Contacto original'), b = add(h, 'Otro contacto');
  const task = good(h.app.state.store.createTask({contactId:a.id, title:'Tarea original', dueAt:'2026-10-10T12:00:00Z'}, h.app.state.store.snapshot().revision));
  h.app.handlers.taskEditor(task);
  assert.doesNotMatch(h.get('dialogContent').innerHTML, /id="taskContactSearch"/);
  const result = await h.submit({contactId:b.id, title:'Fecha actualizada', dueAt:'2026-10-11T10:00'}); assert.equal(result.error, '');
  const updated = h.app.state.store.listTasks().find(row => row.id === task.id);
  assert.equal(updated.contactId, a.id); assert.equal(updated.title, 'Fecha actualizada'); assert.equal(h.app.state.store.listTasks().length, 1); h.app.destroy();
});

(async () => {
  let failed = 0;
  for (const {name, run} of cases) {
    try { await run(); console.log('PASS: ' + name); }
    catch (error) { failed++; console.error('FAIL: ' + name); console.error(error); }
  }
  if (failed) { process.exitCode = 1; console.error('FAIL: ' + failed + ' task-contact-search groups failed.'); }
  else console.log('PASS: ' + cases.length + ' task-contact-search mounted-handler groups. Browser rendering remains unverified.');
})().catch(error => { console.error(error); process.exitCode = 1; });
