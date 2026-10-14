'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const M = require('../assets/js/doctor-publication.js');
function memory() {
  const data = new Map();
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
}
const fields = { displayName: 'Dra. Andrea Demo', specialty: 'Dermatología', city: 'Guadalajara', state: 'Jalisco', clinicName: 'Clínica ficticia', bio: 'Atención médica de demostración.', phone: '+52 33 0000 0000', whatsapp: '3300000000', website: 'https://example.test/perfil', services: ['Consulta', 'Seguimiento'], links: { instagram: 'https://instagram.com/example.test' }, photo: null };
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgKOgBAAFwAP0jhY/jAAAAAElFTkSuQmCC';
const JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDkaKKK90+LP//Z';
const WEBP = 'UklGRjoAAABXRUJQVlA4IC4AAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD+8U2v/EM9HqZLv/qcfmV/Mr/ZSAAA';
const GIF = 'R0lGODdhAQABAIEAAABwjAAAAAAAAAAAACwAAAAAAQABAAAIBAABBAQAOw==';
function photo(type = 'png', data = PNG) { return { dataUrl: 'data:image/' + type + ';base64,' + data, type: 'image/' + type, size: Buffer.from(data, 'base64').length, name: 'foto-demo.' + type }; }
function expectCode(fn, code) { assert.throws(fn, e => e.code === code, code); }
function setup() {
  const storage = memory();
  const providers = { PROV1: { id: 'PROV1', doctorAccountId: 'DOC1', contactId: 'CONTACT1', assignedKam: 'KAM1', eligible: true }, PROV2: { id: 'PROV2', doctorAccountId: 'DOC2', contactId: 'CONTACT2', assignedKam: 'KAM2', eligible: true } };
  let tick = 0;
  const resolveProvider = id => providers[id] ? structuredClone(providers[id]) : null;
  const store = (role, id) => M.createStore({ storage, actor: { role, id: id || ({ admin: 'BO1', readonly: 'BO_READ', kam: 'KAM1', holder: 'DOC1', public: 'public' })[role] }, resolveProvider, now: () => new Date(Date.UTC(2026, 9, 9, 12, 0, tick++)) });
  const admin = store('admin'), kam = store('kam'), holder = store('holder'), publicStore = store('public');
  const current = (s = admin, id = 'PROV1') => { const snapshot = s.snapshot(), profile = snapshot.profiles[id]; return { snapshot, profile, version: profile?.versions.find(v => v.id === profile.currentVersionId) }; };
  const save = (patch = fields, s = kam, id = 'PROV1') => s.saveDraft(id, patch, s.snapshot().revision);
  const confirm = (id = 'PROV1', s = holder) => { const x = current(s, id); return s.confirm(id, x.version.id, x.snapshot.revision); };
  const review = (decision = 'approve', reason = '', id = 'PROV1') => { const x = current(admin, id); return admin.review(id, x.version.id, decision, reason, x.snapshot.revision); };
  const publish = (id = 'PROV1') => { const x = current(admin, id); return admin.publish(id, x.version.id, x.snapshot.revision); };
  return { storage, providers, resolveProvider, store, admin, kam, holder, publicStore, current, save, confirm, review, publish };
}
// Every supported file is inspected independently of its MIME/name.
for (const [type, data] of [['png', PNG], ['webp', WEBP], ['gif', GIF]]) assert.equal(M.validatePhoto(photo(type, data)).type, 'image/' + type);
// Valid JPEG fixture is generated from a real 1x1 image, with SOF/SOS/EOI markers.
assert.equal(M.validatePhoto(photo('jpeg', JPEG)).type, 'image/jpeg');
assert.equal(M.validatePhoto(null), null);
expectCode(() => M.validatePhoto({ ...photo(), type: 'image/jpeg' }), 'invalid_photo');
expectCode(() => M.validatePhoto({ ...photo(), size: 999 }), 'invalid_photo');
expectCode(() => M.validatePhoto({ dataUrl: 'https://example.test/photo.png' }), 'invalid_photo');
expectCode(() => M.validatePhoto({ dataUrl: 'data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64') }), 'invalid_photo');
expectCode(() => M.validatePhoto(photo('png', Buffer.from('<script>alert(1)</script>').toString('base64'))), 'invalid_photo');
expectCode(() => M.validatePhoto(photo('png', Buffer.from(PNG, 'base64').subarray(0, 16).toString('base64'))), 'invalid_photo');
expectCode(() => M.validatePhoto(photo('png', Buffer.alloc(M.MAX_PHOTO_BYTES + 1).toString('base64'))), 'photo_too_large');
const corruptPng = Buffer.from(PNG, 'base64'); corruptPng[44] ^= 1;
expectCode(() => M.validatePhoto(photo('png', corruptPng.toString('base64'))), 'invalid_photo');
const wrongContainer = Buffer.from(WEBP, 'base64'); wrongContainer[4] = 0;
expectCode(() => M.validatePhoto(photo('webp', wrongContainer.toString('base64'))), 'invalid_photo');
const wrongGif = Buffer.from(GIF, 'base64'); wrongGif[wrongGif.length - 1] = 0;
expectCode(() => M.validatePhoto(photo('gif', wrongGif.toString('base64'))), 'invalid_photo');
// The documented five-MiB boundary is inclusive; excess bytes are rejected before decoding.
{
  const source = Buffer.from(PNG, 'base64'), extra = M.MAX_PHOTO_BYTES - source.length - 12;
  const chunk = Buffer.alloc(extra + 12); chunk.writeUInt32BE(extra, 0); chunk.write('npAD', 4, 'ascii');
  let crc = 0xffffffff;
  for (let i = 4; i < 8 + extra; i++) { crc ^= chunk[i]; for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1; }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
  const exact = Buffer.concat([source.subarray(0, source.length - 12), chunk, source.subarray(source.length - 12)]);
  assert.equal(exact.length, M.MAX_PHOTO_BYTES);
  assert.equal(M.validatePhoto(photo('png', exact.toString('base64'))).size, M.MAX_PHOTO_BYTES);
}
// Draft -> exact holder consent -> BO approval -> explicit publication; photo is optional.
{
  const h = setup();
  const initialRaw = h.storage.getItem(M.STORAGE_KEY);
  assert.equal(initialRaw, null);
  h.save();
  assert.equal(h.current().version.status, 'draft');
  assert.deepEqual(h.publicStore.publicProfiles(), []);
  assert.deepEqual(h.publicStore.snapshot().profiles, {});
  assert.deepEqual(h.admin.photoTasks(), []);
  expectCode(() => h.kam.confirm('PROV1', h.current().version.id, 1), 'holder_required');
  expectCode(() => h.admin.confirm('PROV1', h.current().version.id, 1), 'holder_required');
  expectCode(() => h.admin.review('PROV1', h.current().version.id, 'approve', '', 1), 'invalid_transition');
  expectCode(() => h.admin.publish('PROV1', h.current().version.id, 1), 'invalid_transition');
  h.confirm();
  assert.equal(h.current().version.consent.actorId, 'DOC1');
  assert.equal(h.current().version.consent.scope, 'public_directory');
  expectCode(() => h.confirm(), 'invalid_transition');
  expectCode(() => h.kam.review('PROV1', h.current().version.id, 'approve', '', 2), 'reviewer_required');
  h.review();
  assert.deepEqual(h.publicStore.publicProfiles(), [], 'approval is never publication');
  h.publish();
  const published = h.publicStore.publicProfiles();
  assert.equal(published.length, 1);
  assert.equal(published[0].photo, null);
  assert.equal(published[0].displayName, fields.displayName);
  assert.deepEqual(h.current().version.history.map(x => x.type), ['draft', 'confirm', 'review', 'publish']);
  assert.deepEqual(h.current().version.history.map(x => x.actorId), ['KAM1', 'DOC1', 'BO1', 'BO1']);
  for (const prohibited of ['accountId', 'doctorAccountId', 'contactId', 'assignedKam', 'consent', 'review', 'history', 'createdBy', 'financial', 'documents', 'clabe', 'rfc', 'email']) assert.equal(Object.hasOwn(published[0], prohibited), false, prohibited);
  assert.equal(Object.keys(published[0]).length, M.PUBLIC_FIELDS.length + 3);
  assert.equal(h.admin.photoTasks().length, 1);
  assert.equal(h.admin.photoTasks()[0].status, 'open');
  assert.equal(Object.hasOwn(h.admin.photoTasks()[0], 'dueAt'), false);
  assert.equal(Object.hasOwn(h.admin.photoTasks()[0], 'deadline'), false);
  assert.deepEqual(h.holder.photoTasks(), [], 'internal tasks are hidden from holder');
  assert.deepEqual(h.publicStore.photoTasks(), []);
  expectCode(() => h.publish(), 'invalid_transition');
  const readonly = h.store('readonly');
  assert.equal(Object.keys(readonly.snapshot().profiles).length, 1);
  expectCode(() => readonly.saveDraft('PROV1', fields, readonly.snapshot().revision), 'forbidden');
  expectCode(() => h.publicStore.saveDraft('PROV1', fields, h.publicStore.snapshot().revision), 'forbidden');
  assert.deepEqual(M.readPublicProfiles(h.storage, h.resolveProvider), published);
  const external = h.current().snapshot;
  external.profiles.PROV1.versions[0].fields.displayName = 'tamper only detached copy';
  assert.equal(h.publicStore.publicProfiles()[0].displayName, fields.displayName);
}
// Old published snapshot survives draft, confirmation, correction, rejection and approval.
{
  const h = setup(); h.save(); h.confirm(); h.review(); h.publish();
  const old = h.publicStore.publicProfiles(), task = h.admin.photoTasks()[0], firstVersion = structuredClone(h.current().version);
  h.save({ displayName: 'Nueva versión', photo: photo() });
  const second = h.current().version;
  assert.equal(second.number, 2); assert.equal(second.consent, null); assert.equal(second.review, null);
  assert.deepEqual(h.publicStore.publicProfiles(), old);
  assert.deepEqual(h.admin.photoTasks()[0], task, 'draft photo never closes or retimes the task');
  expectCode(() => h.holder.confirm('PROV1', firstVersion.id, h.holder.snapshot().revision), 'stale_version');
  h.confirm();
  expectCode(() => h.review('correction', ''), 'invalid_field');
  h.review('correction', 'Corrige el nombre público.');
  assert.equal(h.current().version.status, 'correction');
  assert.equal(h.current().version.review.reason, 'Corrige el nombre público.');
  assert.deepEqual(h.publicStore.publicProfiles(), old);
  expectCode(() => h.publish(), 'invalid_transition');
  h.save({ displayName: 'Nombre corregido' }); h.confirm(); h.review('reject', 'La información no corresponde a este perfil.');
  assert.equal(h.current().version.status, 'rejected');
  assert.deepEqual(h.publicStore.publicProfiles(), old);
  expectCode(() => h.confirm(), 'invalid_transition');
  h.save({ displayName: 'Versión revisada' }); h.confirm(); h.review();
  assert.deepEqual(h.publicStore.publicProfiles(), old);
  h.publish();
  assert.equal(h.publicStore.publicProfiles()[0].displayName, 'Versión revisada');
  assert.ok(h.publicStore.publicProfiles()[0].photo);
  assert.equal(h.publicStore.publicProfiles()[0].photo.name, undefined, 'Public image must not expose its original local filename');
  assert.deepEqual(h.current().profile.versions[0], firstVersion, 'superseded published snapshot is immutable');
  const closed = h.admin.photoTasks()[0]; assert.equal(closed.id, task.id); assert.equal(closed.status, 'closed'); assert.equal(closed.createdAt, task.createdAt); assert.notEqual(closed.updatedAt, task.updatedAt);
  h.save({ photo: null });
  assert.deepEqual(h.admin.photoTasks()[0], closed, 'removing draft photo cannot reopen task');
  h.confirm(); h.review(); h.publish();
  assert.equal(h.admin.photoTasks().length, 1); assert.equal(h.admin.photoTasks()[0].id, task.id); assert.equal(h.admin.photoTasks()[0].status, 'open');
  h.providers.PROV1.assignedKam = 'KAM2';
  assert.equal(h.admin.photoTasks()[0].assignedKam, 'KAM2');
  assert.equal(h.kam.photoTasks().length, 0);
  assert.equal(h.store('kam', 'KAM2').photoTasks().length, 1);
  assert.equal(h.kam.snapshot().profiles.PROV1, undefined);
  expectCode(() => h.save(), 'forbidden');
  h.save({ bio: 'Edición del nuevo asesor' }, h.store('kam', 'KAM2'));
}
// Distinct accounts and current KAM assignments are enforced without names/email matching.
{
  const h = setup(); h.save();
  expectCode(() => h.kam.saveDraft('PROV2', fields, 1), 'forbidden');
  expectCode(() => h.store('holder', 'DOC2').confirm('PROV1', h.current().version.id, 1), 'forbidden');
  assert.deepEqual(h.store('holder', 'DOC2').snapshot().profiles, {});
  h.save({ ...fields, displayName: 'Otro doctor' }, h.store('kam', 'KAM2'), 'PROV2');
  assert.deepEqual(Object.keys(h.holder.snapshot().profiles), ['PROV1']);
  assert.deepEqual(Object.keys(h.store('holder', 'DOC2').snapshot().profiles), ['PROV2']);
  h.providers.PROV1.doctorAccountId = 'ACCOUNT_SWAPPED';
  expectCode(() => h.admin.saveDraft('PROV1', fields, h.admin.snapshot().revision), 'identity_changed');
  assert.equal(h.admin.snapshot().profiles.PROV1, undefined);
  h.providers.PROV1.doctorAccountId = 'DOC1'; h.providers.PROV1.accountId = 'DOC2';
  expectCode(() => h.save(), 'identity_changed');
  delete h.providers.PROV1.accountId;
  h.providers.PROV2.doctorAccountId = 'DOC1';
  expectCode(() => h.admin.saveDraft('PROV2', fields, h.admin.snapshot().revision), 'identity_changed');
  h.providers.PROV3 = { id: 'PROV3', doctorAccountId: 'DOC1', assignedKam: 'KAM1', eligible: true };
  expectCode(() => h.admin.saveDraft('PROV3', fields, h.admin.snapshot().revision), 'duplicate_account');
}
// New publication needs approved membership, and later review status never erases a public version.
{
  const h = setup(); h.providers.PROV1.eligible = false; h.save(); h.confirm(); h.review();
  expectCode(() => h.publish(), 'provider_not_approved');
  assert.deepEqual(h.publicStore.publicProfiles(), []);
  h.providers.PROV1.eligible = true; h.publish();
  const old = h.publicStore.publicProfiles();
  h.providers.PROV1.eligible = false;
  assert.deepEqual(h.publicStore.publicProfiles(), old);
  h.save({ bio: 'Change still under review' }); h.confirm(); h.review('reject', 'No autorizado.');
  assert.deepEqual(h.publicStore.publicProfiles(), old);
  h.providers.PROV1.doctorAccountId = 'SWAPPED';
  assert.deepEqual(h.publicStore.publicProfiles(), [], 'account mismatch suppresses projection');
}
// Required fields, explicit field/link allowlists and holder re-confirmation after all edits.
{
  const h = setup(); h.save({ displayName: 'Sólo nombre' });
  expectCode(() => h.confirm(), 'incomplete_profile');
  for (const bad of [{ fiscal: { clabe: 'sensitive' } }, { documents: [] }, { accountId: 'forged' }, { contactId: 'other' }, { consent: { confirmed: true } }, JSON.parse('{"__proto__":{}}')]) expectCode(() => h.save(bad), 'private_field');
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'https://user:password@example.test', 'ftp://example.test']) expectCode(() => h.save({ website: bad }), 'invalid_url');
  expectCode(() => h.save({ links: { privateEmail: 'https://example.test' } }), 'invalid_url');
  expectCode(() => h.save({ links: { linkedin: 'javascript:alert(1)' } }), 'invalid_url');
  expectCode(() => h.save({ phone: '<script>' }), 'invalid_phone');
  expectCode(() => h.save({ services: [''] }), 'invalid_field');
  h.save(fields); h.confirm(); const consentVersion = h.current().version.id;
  h.save({ bio: 'Nuevo contenido requiere nuevo consentimiento' });
  assert.equal(h.current().version.consent, null);
  expectCode(() => h.admin.review('PROV1', consentVersion, 'approve', '', h.admin.snapshot().revision), 'stale_version');
  expectCode(() => h.review(), 'invalid_transition');
}
// Stale state, raw-value collisions, reentrant writes and quota failures never overwrite prior data.
{
  const h = setup(); const stale = h.kam.snapshot().revision; h.save(); const raw = h.storage.getItem(M.STORAGE_KEY);
  expectCode(() => h.kam.saveDraft('PROV1', fields, stale), 'stale_revision');
  expectCode(() => h.kam.saveDraft('PROV1', fields), 'revision_required');
  const set = h.storage.setItem; h.storage.setItem = () => { throw Error('QuotaExceededError'); };
  expectCode(() => h.save({ photo: photo() }), 'storage_write_failed');
  assert.equal(h.storage.getItem(M.STORAGE_KEY), raw); h.storage.setItem = set;
  h.confirm(); h.review();
  const beforePublish = h.storage.getItem(M.STORAGE_KEY); h.storage.setItem = () => { throw Error('QuotaExceededError'); };
  expectCode(() => h.publish(), 'storage_write_failed'); assert.equal(h.storage.getItem(M.STORAGE_KEY), beforePublish); assert.deepEqual(h.publicStore.publicProfiles(), []); h.storage.setItem = set;
  h.publish(); const published = h.publicStore.publicProfiles();
  h.storage.setItem = () => { throw Error('quota'); }; expectCode(() => h.save({ photo: photo() }), 'storage_write_failed'); assert.deepEqual(h.publicStore.publicProfiles(), published); h.storage.setItem = set;
  let resolutions = 0;
  const race = M.createStore({ storage: h.storage, actor: { id: 'BO1', role: 'admin' }, resolveProvider: id => { resolutions++; if (resolutions === 2) h.storage.setItem(M.STORAGE_KEY, h.storage.getItem(M.STORAGE_KEY) + ' '); return h.resolveProvider(id); } });
  const revision = h.admin.snapshot().revision;
  expectCode(() => race.saveDraft('PROV1', fields, revision), 'stale_revision');
  assert.deepEqual(h.publicStore.publicProfiles(), published);
  let flipCount = 0;
  const identityRace = M.createStore({ storage: h.storage, actor: { id: 'BO1', role: 'admin' }, resolveProvider: id => { const p = h.resolveProvider(id); if (++flipCount === 2) p.doctorAccountId = 'CHANGED'; return p; } });
  const beforeRace = h.storage.getItem(M.STORAGE_KEY);
  expectCode(() => identityRace.saveDraft('PROV1', fields, revision), 'identity_changed'); assert.equal(h.storage.getItem(M.STORAGE_KEY), beforeRace);
  let reentrant; let caught;
  reentrant = M.createStore({ storage: h.storage, actor: { id: 'BO1', role: 'admin' }, resolveProvider: id => { try { reentrant.saveDraft('PROV1', fields, revision); } catch (e) { caught = e.code; } return h.resolveProvider(id); } });
  reentrant.saveDraft('PROV1', fields, revision); assert.equal(caught, 'reentrant_write');
}
// Persisted tampering is rejected; errors do not reset or overwrite the damaged store.
for (const mutate of [
  s => { s.profiles.PROV1.versions[0].fields.displayName = 'Altered'; },
  s => { s.profiles.PROV1.versions[0].fields.clabe = 'private'; },
  s => { s.profiles.PROV1.versions[0].consent.actorId = 'DOC2'; },
  s => { s.profiles.PROV1.versions[0].review.decision = 'reject'; },
  s => { s.profiles.PROV1.versions[0].history[0].actorId = 'IMPOSTOR'; },
  s => { s.profiles.PROV1.publishedVersionId = 'other'; },
  s => { s.profiles.PROV1.versions[0].publication = null; },
  s => { s.profiles.PROV1.accountId = 'OTHER'; },
  s => { s.revision = -1; }
]) {
  const h = setup(); h.save(); h.confirm(); h.review(); h.publish();
  const changed = JSON.parse(h.storage.getItem(M.STORAGE_KEY)); mutate(changed); const raw = JSON.stringify(changed); h.storage.setItem(M.STORAGE_KEY, raw);
  assert.throws(() => h.publicStore.publicProfiles()); assert.throws(() => h.admin.saveDraft('PROV1', fields, changed.revision)); assert.equal(h.storage.getItem(M.STORAGE_KEY), raw);
}
{
  const storage = memory(); storage.setItem(M.STORAGE_KEY, '{broken');
  const s = M.createStore({ storage, actor: { id: 'admin', role: 'admin' }, resolveProvider: () => ({ id: 'P', accountId: 'D', eligible: true }) });
  expectCode(() => s.snapshot(), 'invalid_storage'); expectCode(() => s.saveDraft('P', fields, 0), 'invalid_storage'); assert.equal(storage.getItem(M.STORAGE_KEY), '{broken');
}
// An unreadable or unavailable store fails closed without attempting a write.
{
  let writes = 0;
  const storage = { getItem() { throw Error('SecurityError'); }, setItem() { writes++; } };
  const s = M.createStore({ storage, actor: { role: 'admin', id: 'BO1' }, resolveProvider: () => ({ id: 'PROV1', accountId: 'DOC1' }) });
  expectCode(() => s.snapshot(), 'storage_unavailable'); expectCode(() => s.saveDraft('PROV1', fields, 0), 'storage_unavailable'); assert.equal(writes, 0);
  expectCode(() => M.createStore({ storage: {} }), 'storage_unavailable');
  expectCode(() => M.createStore({ storage: memory(), actor: { id: 'X', role: 'forged-admin' } }), 'invalid_actor');
  const noResolver = M.createStore({ storage: memory(), actor: { id: 'BO1', role: 'admin' } });
  expectCode(() => noResolver.saveDraft('PROV1', fields, 0), 'resolver_required');
}
// Browser UMD export, default context, event dispatch, and read-only anonymous projection.
{
  const h = setup(); const events = [];
  const win = { localStorage: h.storage, PulzzoDoctorPublicationContext: { resolveProvider: (storage, id) => { assert.equal(storage, h.storage); return h.resolveProvider(id); } }, atob: x => Buffer.from(x, 'base64').toString('binary'), CustomEvent: function (type, x) { this.type = type; this.detail = x.detail; }, dispatchEvent: e => events.push(e) };
  const context = vm.createContext({ window: win, URL });
  win.providerJson = JSON.stringify(h.providers);
  vm.runInContext('window.PulzzoDoctorPublicationContext.resolveProvider = function(storage, id) { return JSON.parse(window.providerJson)[id] || null; };', context);
  vm.runInContext(fs.readFileSync(require.resolve('../assets/js/doctor-publication.js'), 'utf8'), context);
  const api = win.PulzzoDoctorPublication; assert.ok(api);
  // Cross-realm input is serialized in the browser realm to preserve plain-object checks.
  vm.runInContext(`window.PulzzoDoctorPublication.createStore({storage:window.localStorage,actor:{id:'KAM1',role:'kam'}}).saveDraft('PROV1',${JSON.stringify(fields)},0)`, context);
  assert.equal(events.length, 1); assert.equal(events[0].type, 'pulzzo:doctor-publication'); assert.equal(events[0].detail.revision, 1);
}
console.log('PASS: public profile exact-version consent/approval/publication, immutable version history, optional validated photo, task lifecycle, privacy, identities/roles, stale writes, atomic quota preservation, browser UMD.');
