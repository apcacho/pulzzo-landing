'use strict';
// Shipped handlers, real domain state and deterministic DOM fixtures only.
// No browser, outbound application, geometry or assistive-technology claims.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

// Reuse existing fixture definitions without executing their independent suites.
// Marker assertions fail explicitly if a fixture's structure changes.
function fixture(file, marker, names) {
  const filename = path.join(__dirname, file), source = fs.readFileSync(filename, 'utf8');
  const offset = source.indexOf(marker);
  assert.ok(offset > 0, 'Fixture runner boundary changed: ' + file);
  const context = vm.createContext({ require: createRequire(filename), __dirname, console, Blob, URL, URLSearchParams });
  vm.runInContext(source.slice(0, offset) + '\nglobalThis.fixtureAPI={' + names + '};', context, { filename });
  return context.fixtureAPI;
}
const ui = fixture('crm-demo-ui.cjs', '(async()=>{', 'setup');
const navigation = fixture('crm-backoffice-navigation.cjs', '(async()=>{for(const', 'shell,attachCRM');
const cases = [];
const test = (name, run) => cases.push({ name, run });
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function contactFixture(options) {
  const h = ui.setup(options);
  h.app.handlers.newContact();
  const result = await h.submit({ name: 'Seguimiento ficticio', email: 'continuity@example.test', phone: '+12025550109', type: 'patient', originalSource: 'manual' });
  assert.equal(result.error, '');
  h.contact = h.app.state.store.listContacts()[0];
  return h;
}
function clipboardGate(h) {
  const gate = deferred();
  h.window.navigator.clipboard.writeText = () => gate.promise;
  return gate;
}

test('Current clipboard success and failure preserve manual-contact semantics', async () => {
  const h = await contactFixture(), before = h.app.state.store.listActivities().length;
  await h.click('copy-phone'); await flush();
  assert.equal(h.get('notice').textContent, 'Teléfono copiado.');
  assert.equal(h.get('editorDialog').open, false);
  const gate = clipboardGate(h); await h.click('copy-phone'); gate.reject(new Error('Clipboard unavailable')); await flush();
  assert.equal(h.get('editorDialog').open, true);
  assert.equal(h.get('dialogTitle').textContent, 'Copiar teléfono');
  assert.match(h.get('dialogContent').innerHTML, /\+12025550109/);
  assert.equal(h.app.state.store.listActivities().length, before);
  h.app.closeDialog(); h.app.destroy();
});

test('Rejected clipboard promises never reopen a dialog after navigation, Back, role change or teardown', async () => {
  for (const interruption of ['navigate', 'back', 'actor', 'destroy']) {
    const h = await contactFixture(), gate = clipboardGate(h);
    await h.click('copy-phone');
    if (interruption === 'navigate') h.app.navigate('patient', 'tasks');
    if (interruption === 'back') { h.window.location.hash = '#patient/tasks'; for (const fn of h.window.listeners.popstate || []) fn({}); }
    if (interruption === 'actor') { h.get('actorSelect').value = 'kam_luis'; await h.get('actorSelect').dispatch('change'); }
    if (interruption === 'destroy') h.app.destroy();
    gate.reject(new Error('Clipboard unavailable')); await flush();
    assert.equal(h.get('editorDialog').open, false, interruption);
    assert.equal(h.app.state.dialogHandler, null, interruption);
    h.app.destroy();
  }
});

test('Stale clipboard successes cannot replace feedback from a newer page', async () => {
  const h = await contactFixture(), gate = clipboardGate(h);
  await h.click('copy-phone'); h.app.navigate('patient', 'tasks');
  h.get('notice').textContent = 'Feedback for the newer view';
  gate.resolve(); await flush();
  assert.equal(h.get('notice').textContent, 'Feedback for the newer view');
  h.app.destroy();
});

test('An older clipboard failure cannot replace a newly opened editor', async () => {
  const h = await contactFixture(), gate = clipboardGate(h);
  await h.click('copy-phone'); h.app.handlers.newContact();
  const content = h.get('dialogContent').innerHTML, handler = h.app.state.dialogHandler;
  gate.reject(new Error('Clipboard unavailable')); await flush();
  assert.equal(h.get('dialogTitle').textContent, 'Nuevo prospecto');
  assert.equal(h.get('dialogContent').innerHTML, content);
  assert.equal(h.app.state.dialogHandler, handler);
  h.app.destroy();
});

test('Repeated copy attempts honor the newest intent when promises settle out of order', async () => {
  const h = await contactFixture(), older = deferred(), newer = deferred(); let count = 0;
  h.window.navigator.clipboard.writeText = () => (++count === 1 ? older.promise : newer.promise);
  await h.click('copy-phone'); await h.click('copy-phone');
  newer.resolve(); await flush();
  assert.equal(h.get('notice').textContent, 'Teléfono copiado.');
  older.reject(new Error('Older request failed')); await flush();
  assert.equal(h.get('editorDialog').open, false);
  assert.equal(h.get('notice').textContent, 'Teléfono copiado.');
  h.app.destroy();
});

test('Rejected stale evidence reads cannot overwrite newer-page feedback', async () => {
  const gate = deferred(), metadata = { id: 'ev_async_read', name: 'ficticio.png', mimeType: 'image/png', size: 10, uploadedAt: '2026-10-09T12:00:00.000Z', actorId: 'kam_ana' };
  const evidence = { async put(file, context) { return { ...metadata, contactId: context.contactId }; }, get() { return gate.promise; }, async remove() {}, async close() {} };
  const h = await contactFixture({ evidenceModule: { createEvidenceStore: () => evidence } });
  h.app.handlers.activityEditor();
  const result = await h.submit({ type: 'note', outcome: 'other', note: 'Evidencia ficticia', contactAt: '2026-10-08T10:00' }, { evidence: [{ name: metadata.name, type: metadata.mimeType, size: metadata.size }] });
  assert.equal(result.error, '');
  const pending = h.app.handlers.viewEvidence(metadata.id);
  h.app.navigate('patient', 'tasks'); h.get('notice').textContent = 'Newer task feedback';
  gate.reject(new Error('Old evidence lookup failed')); await pending;
  assert.equal(h.get('editorDialog').open, false);
  assert.equal(h.get('notice').textContent, 'Newer task feedback');
  h.app.destroy();
});

function nativeFixture(width = 1280) {
  const h = navigation.shell({ role: 'admin', width }); h.clickNav('crm');
  const child = navigation.attachCRM(h), root = child.root;
  // Model browser connectivity and ShadowRoot.activeElement, omitted by the
  // original general navigation fixture but required for focus-restoration QA.
  Object.defineProperty(h.Element.prototype, 'isConnected', { configurable: true, get() { let node = this; while (node) { if (node === h.document.documentElement) return true; node = node.parentNode || node.host; } return false; } });
  Object.defineProperty(root, 'activeElement', { configurable: true, get() { return root.contains(h.document.activeElement) ? h.document.activeElement : null; } });
  const result = child.app.state.store.createContact({ name: 'Prospecto con teclado', email: 'keyboard@example.test', phone: '+12025550108', type: 'patient', assignedKam: 'kam_ana', originalSource: 'manual' }, child.app.state.store.snapshot().revision);
  assert.equal(result.ok, true, result.error);
  child.app.navigate('patient', 'contacts', result.value.id);
  return { ...h, child, contact: result.value };
}

test('Native contact selection focuses stable detail at desktop and mobile widths', () => {
  for (const width of [1280, 390]) {
    const h = nativeFixture(width), { root, get } = h.child;
    const oldButton = root.querySelector('[data-action="select-contact"]'); oldButton.focus();
    oldButton.dispatch('click');
    assert.equal(h.document.activeElement, get('contactDetail'));
    assert.equal(h.document.activeElement.focusOptions.preventScroll, true);
    assert.equal((get('contactDetail').scrollCalls || []).length, width <= 820 ? 1 : 0);
    assert.equal(root.contains(oldButton), false, 'The old selected button was replaced');
    const scrollCount = (get('contactDetail').scrollCalls || []).length;
    h.child.app.navigate('patient', 'tasks'); h.window.history.back();
    assert.equal((get('contactDetail').scrollCalls || []).length, scrollCount, 'History restoration must not invoke explicit-selection scrolling');
  }
});

test('Dialog Cancel and close restore connected openers in the CRM shadow tree', () => {
  for (const action of ['cancel', 'close']) {
    const h = nativeFixture(), { root, get } = h.child, opener = get('newContact');
    opener.focus(); opener.dispatch('click'); assert.equal(get('editorDialog').open, true);
    assert.equal(h.child.app.state.dialogOpener, opener);
    if (action === 'cancel') root.querySelector('[data-action="cancel-dialog"]').dispatch('click');
    else get('closeDialog').dispatch('click');
    assert.equal(get('editorDialog').open, false);
    assert.equal(h.document.activeElement, opener);
    assert.equal(h.child.app.state.dialogHandler, null);
  }
});

test('Keyboard stage saves focus the replacement card and announce the selected contact state', async () => {
  const h = nativeFixture(), { root, app, get } = h.child;
  root.querySelector('[data-contact-layout="kanban"]').dispatch('click');
  const oldMove = root.querySelector('[data-action="move-card"]'); oldMove.focus(); oldMove.dispatch('click');
  assert.equal(get('editorDialog').open, true);
  const form = get('dialogContent').querySelector('form'); form.elements.namedItem('stage').value = 'contacted';
  form.elements.namedItem('reason').value = 'Seguimiento ficticio';
  await app.handlers.submit({ target: form, preventDefault() {} });
  assert.equal(get('editorDialog').open, false);
  assert.equal(app.state.store.getContact(h.contact.id).stage, 'contacted');
  const newMove = root.querySelector('[data-action="move-card"]');
  assert.notEqual(newMove, oldMove);
  assert.equal(h.document.activeElement, newMove);
  assert.equal(newMove.dataset.id, h.contact.id);
  assert.equal(root.querySelector('[data-action="select-contact"]').getAttribute('aria-pressed'), 'true');
  assert.equal(get('commercialBoard').getAttribute('role'), 'region');
});

(async () => {
  let passed = 0;
  for (const { name, run } of cases) { await run(); passed++; console.log('PASS: ' + name); }
  console.log(`PASS: ${passed} CRM UX adversarial handler groups. Browser rendering, actual focus behavior, touch and screen-reader output remain unverified.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
