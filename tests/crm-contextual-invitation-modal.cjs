'use strict';
// Functional DOM-handler regressions. No browser, outbound link, or real clipboard is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const UI = require('../assets/js/crm-demo-ui.js');
const Store = require('../assets/js/crm-demo-store.js');
const Assisted = require('../assets/js/crm-assisted.js');

// Reuse the UI suite's DOM primitives without running its unrelated scenarios.
const fixtureFile = path.join(__dirname, 'crm-demo-ui.cjs');
const source = fs.readFileSync(fixtureFile, 'utf8');
const scope = vm.createContext({require: createRequire(fixtureFile), __dirname, console, Blob, URL});
vm.runInContext(source.slice(0, source.indexOf('(async()=>{')) + '\nglobalThis.fixture={Element,Classes,MemoryStorage};', scope, {filename: fixtureFile});
const {Element, Classes, MemoryStorage} = scope.fixture;
const tick = () => new Promise(resolve => setImmediate(resolve));
const good = result => { assert.equal(result.ok, true, result.error); return result.value; };
const decode = text => text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; }
function setup(kind = 'patient', options = {}) {
  const nodes = new Map(), get = id => { if (!nodes.has(id)) nodes.set(id, new Element(id)); return nodes.get(id); };
  for (const match of fs.readFileSync(path.join(__dirname, '..', 'crm-demo.html'), 'utf8').matchAll(/\bid="([^"]+)"/g)) get(match[1]);
  const document = {body: {dataset: {}}, listeners: {}, getElementById: get, querySelectorAll: () => [], addEventListener(type, handler) { (this.listeners[type] ??= []).push(handler); }};
  const storage = new MemoryStorage(), clipboard = [], listeners = {};
  let instant = '2026-10-12T12:00:00.000Z', sessionCurrent = true, writes = 0, failWrites = false;
  const setItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => { if (failWrites) throw Error('QuotaExceededError'); writes++; return setItem(key, value); };
  const window = {document, localStorage: storage, indexedDB: {}, location: {href: 'https://demo.test/crm-demo.html', hash: ''}, navigator: {clipboard: {writeText: async text => { clipboard.push(text); }}}, history: {pushState(_state, _title, url) { window.location.hash = url; }, replaceState(_state, _title, url) { window.location.hash = url; }}, addEventListener(type, handler) { (listeners[type] ??= []).push(handler); }};
  const now = () => new Date(instant);
  const embedding = options.sessionGuard ? {actorId: 'kam_ana', allowActorSwitch: true, isCurrent: () => sessionCurrent, writeRoute: hash => { window.location.hash = hash; }, readRoute: () => window.location.hash} : undefined;
  const app = UI.createApp({window, document, storage, storeModule: Store, assistedModule: Assisted, now, embedding});
  const admin = Store.createStore({storage, actor: {id: 'admin_demo', role: 'admin'}, now});
  const contact = good(app.state.store.createContact({type: kind, name: 'Cliente contextual ' + kind, email: kind + '-context@example.test', phone: '5512345678', originalSource: 'organic'}, admin.snapshot().revision));
  app.navigate(kind, 'contacts', contact.id);
  async function click(action, attributes = {}) {
    const target = {dataset: {action}, disabled: false, getAttribute: key => attributes[key] ?? null};
    target.closest = selector => selector === '[data-analytics-view]' ? null : target;
    let prevented = false;
    for (const handler of document.listeners.click || []) await handler({target, preventDefault() { prevented = true; }});
    return {prevented};
  }
  async function submit(values = {email: contact.email}) {
    const error = new Element('formError');
    const form = {elements: {namedItem: name => ({value: values[name] ?? ''})}, classList: new Classes(), querySelector: () => error, checkValidity: () => true};
    let prevented = false;
    await get('dialogContent').dispatch('submit', {target: form, preventDefault() { prevented = true; }});
    return {error: error.textContent, prevented};
  }
  async function role(id) { get('actorSelect').value = id; await get('actorSelect').dispatch('change'); }
  const snapshot = () => admin.snapshot();
  const exp = () => Object.values(snapshot().expedients).find(row => row.contactId === contact.id);
  const invitation = () => snapshot().invitations[exp().activeInvitationId];
  const raw = () => storage.getItem(Store.STORAGE_KEY);
  const audit = type => Object.values(snapshot().audit).filter(row => row.type === type && row.contactId === contact.id);
  async function prepare() { await click('invite-holder'); return invitation(); }
  function claim(inv = invitation()) {
    const actor = {id: 'holder_context_' + kind, role: 'holder'}, store = Store.createStore({storage, actor, now}), api = Assisted.createAssisted({store, actor, now});
    const challenge = good(api.requestDemoVerification({entryToken: inv.token, email: contact.email}));
    const proof = good(api.verifyDemoCode(challenge.challengeId, challenge.demoCode));
    return good(api.openEntryLink(inv.token, {email: contact.email, proofToken: proof.proofToken}, snapshot().revision));
  }
  async function storageEvent() { for (const handler of listeners.storage || []) await handler({key: Store.STORAGE_KEY}); }
  return {app, get, window, clipboard, contact, admin, snapshot, exp, invitation, raw, audit, prepare, claim, click, submit, role, storageEvent, writeCount: () => writes, setTime: value => { instant = value; }, endSession: () => { sessionCurrent = false; }, setWriteFailure: value => { failWrites = value; }};
}
function modalUrl(h) {
  assert.equal(h.get('editorDialog').open, true, 'The contextual modal must stay open');
  const input = h.get('dialogContent').innerHTML.match(/<input\b[^>]*\bid="personalInvitationUrl"[^>]*>/);
  assert.ok(input, 'The modal itself exposes the personal URL');
  assert.match(input[0], /\breadonly(?:\s|=|>)/, 'The personal URL cannot be edited');
  const value = input[0].match(/\bvalue="([^"]*)"/);
  assert.ok(value, 'The read-only field has a URL value');
  return decode(value[1]);
}
function invitationUrl(h, invitation = h.invitation()) { return new URL('asistido-demo.html#entry=' + encodeURIComponent(invitation.token), h.window.location.href).href; }
function assertNoSuccess(h) { assert.doesNotMatch(h.get('notice').textContent, /^(?:Enlace|Enlace personal) copiado\.$/, 'A stale or failed operation must not report success'); }
function assertBusinessUnchanged(before, after) { for (const key of ['contacts', 'expedients', 'invitations', 'activities', 'tasks', 'referrals']) assert.deepEqual(after[key], before[key], key + ' must not change when copying'); }
const cases = [];
const test = (name, run) => cases.push({name, run});

for (const kind of ['patient', 'doctor']) {
  test(kind + ': prepare shows exact personal URL and copying appends only safe history', async () => {
    const h = setup(kind);
    await h.click('invite-holder');
    assert.equal(h.get('dialogTitle').textContent, 'El cliente lo completa');
    assert.match(h.get('dialogContent').innerHTML, /Activo · sin caducidad automática/);
    assert.equal(h.clipboard.length, 0);
    const saved = await h.submit();
    assert.equal(saved.error, ''); assert.equal(saved.prevented, true);
    const inv = h.invitation(), url = modalUrl(h);
    assert.equal(url, invitationUrl(h, inv));
    assert.equal(h.get('dialogTitle').textContent, 'El cliente lo completa');
    assert.match(h.get('dialogContent').innerHTML, /data-action="copy-entry">Copiar enlace/);
    assert.match(h.get('dialogContent').innerHTML, /Cliente contextual/);
    assert.match(h.get('dialogContent').innerHTML, /no significa enviarlo, abrirlo ni registrar contacto/);
    assert.doesNotMatch(url, /example\.test|5512345678|[?&]ref=/);
    assert.equal(h.audit('holder_entry_copied').length, 0, 'Preparing is not copying');
    const before = h.snapshot();
    await h.click('copy-entry'); await tick();
    assert.deepEqual(h.clipboard, [url]);
    assert.equal(modalUrl(h), url, 'Copy leaves the same contextual URL visible');
    assertBusinessUnchanged(before, h.snapshot());
    const copied = h.audit('holder_entry_copied');
    assert.equal(copied.length, 1); assert.equal(copied[0].expedientId, h.exp().id);
    assert.equal(copied[0].actorId, 'kam_ana');
    assert.ok(!JSON.stringify(copied).includes(inv.token), 'Audit must not retain the invitation token');
    assert.equal(h.snapshot().contacts[h.contact.id].originalSource, 'organic');
    h.app.destroy();
  });

  test(kind + ': valid reopening reads the same invite with no storage write or token rotation', async () => {
    const h = setup(kind), inv = await h.prepare(), before = h.raw(), writes = h.writeCount();
    await h.click('cancel-dialog');
    assert.equal(h.get('editorDialog').open, false);
    h.app.state.invite = null; // Opening must also work after its transient cache was lost.
    await h.click('invite-holder');
    assert.equal(modalUrl(h), invitationUrl(h, inv));
    assert.equal(h.raw(), before); assert.equal(h.writeCount(), writes);
    assert.equal(Object.keys(h.snapshot().invitations).length, 1);
    assert.doesNotMatch(h.get('dialogContent').innerHTML, /type="submit"/);
    h.app.destroy();
  });

  test(kind + ': elapsed time preserves URL; explicit revoke and renew rotate it', async () => {
    const h = setup(kind), old = await h.prepare(), url=modalUrl(h);
    h.setTime('2027-01-12T12:00:00Z');await h.click('cancel-dialog');await h.click('invite-holder');assert.equal(modalUrl(h),url);
    await h.click('revoke-entry');assert.equal((await h.submit()).error,'');assert.match(h.get('dialogContent').innerHTML,/Enlace revocado/);assert.doesNotMatch(h.get('dialogContent').innerHTML,/personalInvitationUrl/);
    await h.click('copy-entry');await tick();assert.equal(h.clipboard.length,0);
    await h.click('renew-entry');assert.equal((await h.submit()).error,'');const fresh=h.invitation();assert.notEqual(fresh.token,old.token);assert.equal(modalUrl(h),invitationUrl(h,fresh));assert.equal(Object.keys(h.snapshot().expedients).length,1);
    await h.click('copy-entry');await tick();assert.deepEqual(h.clipboard,[invitationUrl(h,fresh)]);h.app.destroy();
  });

  test(kind + ': verified holder retains the same stable URL without another invitation', async () => {
    const h=setup(kind),inv=await h.prepare(),url=modalUrl(h);h.claim(inv);await h.click('cancel-dialog');const before=h.raw(),writes=h.writeCount();await h.click('invite-holder');assert.equal(modalUrl(h),url);assert.equal(h.raw(),before);assert.equal(h.writeCount(),writes);
    await h.click('copy-entry');await tick();assert.deepEqual(h.clipboard,[url]);assert.equal(h.audit('holder_entry_copied').length,1);assert.equal(Object.keys(h.snapshot().invitations).length,1);h.app.destroy();
  });

}

test('KAM portfolio, Admin access, and leader denial apply to modal opening and copy handlers', async () => {
  const h = setup(), inv = await h.prepare();
  await h.role('kam_luis'); h.app.navigate('patient', 'contacts', h.contact.id);
  let before = h.raw();
  await h.click('invite-holder'); await h.click('copy-entry'); await tick();
  assert.equal(h.get('editorDialog').open, false); assert.equal(h.clipboard.length, 0); assert.equal(h.raw(), before);
  await h.role('leader_demo'); h.app.navigate('patient', 'contacts', h.contact.id);
  before = h.raw(); await h.click('invite-holder'); await h.click('copy-entry'); await h.click('copy-entry'); await tick();
  assert.equal(h.get('editorDialog').open, false); assert.equal(h.clipboard.length, 0); assert.equal(h.raw(), before);
  assert.doesNotMatch(h.get('contactDetail').innerHTML, /data-action="invite-holder"/);
  await h.role('admin_demo'); h.app.navigate('patient', 'contacts', h.contact.id);
  before = h.raw(); await h.click('invite-holder'); assert.equal(modalUrl(h), invitationUrl(h, inv)); assert.equal(h.raw(), before);
  await h.click('copy-entry'); await tick();
  assert.equal(h.audit('holder_entry_copied')[0].actorId, 'admin_demo');

  h.app.destroy();
});

for (const consumed of [false, true]) for (const interruption of ['actor switch', 'session expiry', 'reassignment', 'close', 'navigation', 'destroy']) {
  test((consumed ? 'holder access' : 'invitation') + ' pending clipboard: ' + interruption + ' cannot report success or append audit', async () => {
    const h = setup('patient', {sessionGuard: interruption === 'session expiry'}); await h.prepare();
    if (consumed) { h.claim(); await h.click('cancel-dialog'); await h.click('invite-holder'); }
    const sourceUrl = modalUrl(h);
    const gate = deferred(); let calls = 0;
    h.window.navigator.clipboard.writeText = async () => { calls++; await gate.promise; };
    await h.click(consumed ? 'copy-entry' : 'copy-entry'); assert.equal(calls, 1); assert.equal(h.audit('holder_entry_copied').length, 0);
    if (interruption === 'actor switch') await h.role('kam_luis');
    if (interruption === 'session expiry') h.endSession();
    if (interruption === 'reassignment') good(h.admin.reassignContact(h.contact.id, 'kam_luis', 'Cambio durante la copia', h.snapshot().revision));
    if (interruption === 'close') await h.click('cancel-dialog');
    if (interruption === 'navigation') h.app.navigate('doctor', 'contacts', null);
    if (interruption === 'destroy') h.app.destroy();
    const afterInterruption = h.raw(); gate.resolve(); await tick();
    assert.equal(h.raw(), afterInterruption); assert.equal(h.audit('holder_entry_copied').length, 0); assert.equal(h.audit('holder_access_link_issued').length, 0); assert.equal(h.audit('holder_access_link_copied').length, 0); assertNoSuccess(h);
    if (interruption === 'session expiry' || interruption === 'reassignment') {
      assert.equal(h.get('editorDialog').open, false, 'Invalidated personal-link modal must close');
      assert.ok(!decode(h.get('dialogContent').innerHTML).includes(sourceUrl), 'Invalidated URL must be cleared');
      assert.doesNotMatch(h.get('dialogContent').innerHTML, /#invite=/);
    }
    h.app.destroy();
  });
}

for (const consumed of [false, true]) {
  test((consumed ? 'holder access' : 'invitation') + ': clipboard failure leaves manual URL and no success or audit', async () => {
    const h = setup(); await h.prepare();
    if (consumed) { h.claim(); await h.click('cancel-dialog'); await h.click('invite-holder'); }
    const expected = modalUrl(h), before = h.raw();
    h.window.navigator.clipboard.writeText = async () => { throw Error('Clipboard denied'); };
    await h.click(consumed ? 'copy-entry' : 'copy-entry'); await tick();
    assert.equal(h.raw(), before); assertNoSuccess(h);
    assert.equal(h.get('editorDialog').open, true); assert.equal(h.get('dialogTitle').textContent, 'El cliente lo completa');
    assert.match(h.get('notice').textContent, /manualmente/);
    assert.ok(decode(h.get('dialogContent').innerHTML).includes(expected));
    assert.equal(h.audit('holder_entry_copied').length, 0); assert.equal(h.audit('holder_access_link_issued').length, 0); assert.equal(h.audit('holder_access_link_copied').length, 0);
    h.app.destroy();
  });
}

test('double submit and overlapping copy perform only one operation and permit a later intentional copy', async () => {
  const h = setup(); await h.click('invite-holder');
  const submissions = await Promise.all([h.submit(), h.submit()]);
  assert.ok(submissions.every(row => row.prevented)); assert.equal(submissions[0].error, '');
  assert.equal(Object.keys(h.snapshot().invitations).length, 1); assert.equal(h.audit('holder_entry_created').length, 1);
  const url = modalUrl(h), gate = deferred(); let calls = 0;
  h.window.navigator.clipboard.writeText = async text => { calls++; assert.equal(text, url); await gate.promise; };
  await h.click('copy-entry'); await h.click('copy-entry');
  assert.equal(calls, 1); assert.equal(h.audit('holder_entry_copied').length, 0);
  gate.resolve(); await tick();
  assert.equal(calls, 1); assert.equal(h.audit('holder_entry_copied').length, 1); assert.equal(modalUrl(h), url);
  await h.click('copy-entry'); await tick(); assert.equal(calls, 2); assert.equal(h.audit('holder_entry_copied').length, 2);
  h.app.destroy();
});

for (const consumed of [false, true]) for (const failure of ['stale revision', 'persistence failure']) {
  test((consumed ? 'holder access' : 'invitation') + ': ' + failure + ' cannot record a successful copy', async () => {
    const h = setup(); await h.prepare();
    if (consumed) { h.claim(); await h.click('cancel-dialog'); await h.click('invite-holder'); }
    const gate = deferred();
    h.window.navigator.clipboard.writeText = async () => { await gate.promise; };
    await h.click(consumed ? 'copy-entry' : 'copy-entry');
    if (failure === 'stale revision') good(h.admin.createTask({contactId: h.contact.id, title: 'Cambio posterior', dueAt: '2026-10-13T12:00:00Z'}, h.snapshot().revision));
    else h.setWriteFailure(true);
    const before = h.raw(); gate.resolve(); await tick();
    assert.equal(h.raw(), before); assertNoSuccess(h);
    assert.equal(h.audit('holder_entry_copied').length, 0); assert.equal(h.audit('holder_access_link_issued').length, 0); assert.equal(h.audit('holder_access_link_copied').length, 0);
    assert.match(h.get('notice').textContent, /no se pudo registrar/);
    h.setWriteFailure(false); h.app.destroy();
  });
}

test('new contact copy supersedes a stale pending copy without unlocking its own duplicate guard', async () => {
  const h = setup(); await h.prepare();
  const first = deferred(), second = deferred(), writes = [];
  h.window.navigator.clipboard.writeText = async text => { writes.push(text); await (writes.length === 1 ? first.promise : second.promise); };
  await h.click('copy-entry'); assert.equal(writes.length, 1);
  await h.click('cancel-dialog');
  const other = good(h.app.state.store.createContact({type: 'patient', name: 'Segundo cliente', email: 'second-context@example.test', phone: '5512349999'}, h.snapshot().revision));
  h.app.navigate('patient', 'contacts', other.id); await h.click('invite-holder');
  assert.equal((await h.submit({email: other.email})).error, '');
  const otherUrl = modalUrl(h), otherExp = Object.values(h.snapshot().expedients).find(row => row.contactId === other.id);
  await h.click('copy-entry'); assert.equal(writes.length, 2, 'The new modal must not be blocked by the old pending copy');
  assert.equal(writes[1], otherUrl);
  first.resolve(); await tick();
  assert.equal(h.audit('holder_entry_copied').length, 0, 'The old modal cannot append a late copy audit');
  await h.click('copy-entry'); assert.equal(writes.length, 2, 'Settling the old promise must not release the new modal copy lock');
  second.resolve(); await tick();
  const copies = Object.values(h.snapshot().audit).filter(row => row.type === 'holder_entry_copied');
  assert.equal(copies.length, 1); assert.equal(copies[0].contactId, other.id); assert.equal(copies[0].expedientId, otherExp.id);
  assert.equal(modalUrl(h), otherUrl);
  h.app.destroy();
});

test('cross-tab reassignment closes personal-link modal and removes stale URL', async () => {
  const h = setup(); await h.prepare(); const url = modalUrl(h);
  good(h.admin.reassignContact(h.contact.id, 'kam_luis', 'Otra cartera', h.snapshot().revision));
  await h.storageEvent();
  assert.equal(h.get('editorDialog').open, false); assert.ok(!h.get('dialogContent').innerHTML.includes(url));
  const before = h.raw(); await h.click('copy-entry'); await tick();
  assert.equal(h.clipboard.length, 0); assert.equal(h.raw(), before);
  h.app.destroy();
});

(async () => {
  let passed = 0;
  for (const {name, run} of cases) {
    try { await run(); passed++; console.log('PASS:', name); }
    catch (error) { console.error('FAIL:', name); console.error(error); process.exitCode = 1; }
  }
  console.log(`${process.exitCode ? 'FAIL' : 'PASS'}: ${passed}/${cases.length} contextual invitation modal checks. DOM handlers only; browser rendering is separate.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
