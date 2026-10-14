'use strict';
const assert = require('node:assert/strict');
const Store = require('../assets/js/crm-demo-store.js');
const Assisted = require('../assets/js/crm-assisted.js');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS', name); }
function ok(result) { assert.equal(result.ok, true, result.error); return result.value; }
function denied(result, code) { assert.equal(result.ok, false, 'Expected refusal'); if (code) assert.equal(result.code, code, result.error); }
function fixture(kind = 'patient', source = 'organic') {
  const data = new Map(); let instant = '2026-10-12T08:00:00.000Z', seq = 0, current = true;
  const disk = { fail: false, getItem: key => data.get(key) ?? null, setItem(key, value) { if (this.fail) throw Error('QuotaExceededError'); data.set(key, String(value)); }, dump: () => JSON.stringify([...data]) };
  const now = () => instant, randomId = prefix => `${prefix}_${++seq}`;
  const staff = { id: 'kam_ana', role: 'kam' }, person = { id: 'holder_person', role: 'holder' };
  const make = actor => { const store = Store.createStore({ storage: disk, actor, now, randomId, isCurrent: () => current }); return { store, api: Assisted.createAssisted({ store, actor, now, randomId }) }; };
  const admin = make({ id: 'admin_rosa', role: 'admin' }), kam = make(staff);
  const rev = () => admin.store.snapshot().revision;
  const referral = source === 'kam_referral' ? ok(admin.store.createReferral({ type: kind, kamId: 'kam_original' }, rev())) : null;
  const contact = ok(admin.store.createContact({ type: kind, name: 'Persona Demo', email: 'person@example.test', phone: '5512345678', assignedKam: staff.id, originalSource: referral ? 'manual' : source, referralToken: referral?.token }, rev()));
  const exp = ok(kam.api.beginDraft({ contactId: contact.id, kind }, rev()));
  const input = invitation => ({ contactId: contact.id, invitationId: invitation.id });
  return { disk, kind, staff, person, kam, admin, make, rev, contact, exp, input, setTime: value => { instant = value; }, setCurrent: value => { current = value; }, snapshot: () => admin.store.snapshot(),
    invite: () => ok(kam.api.invite(exp.id, { email: contact.email, ttlMinutes: 60 }, rev())),
    claim(invitation) { const h = make(person), challenge = ok(h.api.requestDemoVerification({ token: invitation.token, email: contact.email })), proof = ok(h.api.verifyDemoCode(challenge.challengeId, challenge.demoCode)); ok(h.api.claim(invitation.token, { email: contact.email, proofToken: proof.proofToken }, rev())); return h; },
    issue(api = kam.api) { return ok(api.recordAccessLinkIssued(exp.id, { contactId: contact.id }, rev())); },
    rewrite(fn) { const state = JSON.parse(disk.getItem(Store.STORAGE_KEY)); fn(state); disk.setItem(Store.STORAGE_KEY, JSON.stringify(state)); }
  };
}
function unchangedMaps(before, after) {
  for (const map of ['contacts', 'expedients', 'invitations', 'referrals', 'tasks', 'activities']) assert.deepEqual(after[map], before[map], map);
  for (const history of ['audit', 'events']) for (const [id, row] of Object.entries(before[history])) assert.deepEqual(after[history][id], row, 'Existing history stays immutable');
}
function copies(state) { return Object.values(state.audit).filter(row => /_copied$/.test(row.type || '')); }
function safeEntry(entry, expectedKeys) {
  assert.deepEqual(Object.keys(entry).sort(), expectedKeys.concat(['id', 'type', 'contactId', 'expedientId', 'generatedBy', 'demo', 'actorId', 'actorRole', 'createdAt']).sort());
  assert.equal(entry.demo, true);
  assert.ok(!JSON.stringify(entry).includes('example.test'));
  assert.ok(!JSON.stringify(entry).includes('5512345678'));
}
for (const kind of ['patient', 'doctor']) test(`${kind}: successful invitation copy only appends exact safe history`, () => {
  const f = fixture(kind), inv = f.invite(), before = f.snapshot(), dashboard = f.kam.store.dashboard();
  const row = ok(f.kam.api.recordInvitationCopy(f.exp.id, { ...f.input(inv), token: inv.token, url: 'https://irrelevant.example/', email: f.contact.email }, f.rev()));
  const after = f.snapshot(); unchangedMaps(before, after);
  safeEntry(row, ['invitationId']); assert.equal(row.type, 'holder_invitation_copied'); assert.equal(row.generatedBy, inv.createdBy); assert.equal(row.actorId, f.staff.id);
  assert.equal(row.invitationId, inv.id); assert.equal(row.contactId, f.contact.id); assert.equal(row.expedientId, f.exp.id);
  assert.equal(Object.keys(after.audit).length, Object.keys(before.audit).length + 1); assert.equal(Object.keys(after.events).length, Object.keys(before.events).length + 1);
  assert.equal(after.revision, before.revision + 1); assert.deepEqual(f.kam.store.dashboard().counts, dashboard.counts);
  assert.ok(!JSON.stringify(row).includes(inv.token));
});
test('copy retains organic provenance, original referrer, current owner and all prior invitations', () => {
  for (const source of ['organic', 'kam_referral']) {
    const f = fixture('patient', source), old = f.invite(); ok(f.kam.api.recordInvitationCopy(f.exp.id, f.input(old), f.rev()));
    const renewed = f.invite(), before = f.snapshot(); denied(f.kam.api.recordInvitationCopy(f.exp.id, f.input(old), f.rev()), 'INVITE_USED');
    ok(f.kam.api.recordInvitationCopy(f.exp.id, f.input(renewed), f.rev())); unchangedMaps(before, f.snapshot());
    assert.equal(f.snapshot().invitations[old.id].status, 'revoked'); assert.equal(f.snapshot().contacts[f.contact.id].originalSource, source);
    assert.equal(f.snapshot().contacts[f.contact.id].referringKam, source === 'organic' ? null : 'kam_original');
    f.claim(renewed); const claimed = f.snapshot(); denied(f.kam.api.recordInvitationCopy(f.exp.id, f.input(renewed), f.rev()), 'INVITE_USED');
    assert.deepEqual(f.snapshot(), claimed); assert.equal(claimed.invitations[renewed.id].status, 'consumed');
  }
});
test('expired, changed-revision and missing-revision invitation copies cannot append history', () => {
  const f = fixture(), inv = f.invite(), revision = f.rev();
  ok(f.kam.api.editDraft(f.exp.id, { fields: { procedure: 'Actualizado' } }, revision));
  const before = f.disk.dump(); denied(f.kam.api.recordInvitationCopy(f.exp.id, f.input(inv), revision), 'stale_revision');
  denied(f.kam.api.recordInvitationCopy(f.exp.id, f.input(inv)), 'revision_required');
  f.setTime(inv.expiresAt); denied(f.kam.api.recordInvitationCopy(f.exp.id, f.input(inv), f.rev()), 'INVITE_EXPIRED'); assert.equal(f.disk.dump(), before);
});
test('all identifiers are exact and generic login links do not create invitation copy history', () => {
  const f = fixture(), inv = f.invite();
  const other = ok(f.admin.store.createContact({ type: 'patient', name: 'Otra Persona', email: 'other@example.test', assignedKam: f.staff.id }, f.rev()));
  const otherExp = ok(f.kam.api.beginDraft({ contactId: other.id }, f.rev()));
  const before = f.disk.dump();
  denied(f.kam.api.recordInvitationCopy(f.exp.id, { contactId: other.id, invitationId: inv.id }, f.rev()), 'INVITE_MISMATCH');
  denied(f.kam.api.recordInvitationCopy(otherExp.id, { contactId: other.id, invitationId: inv.id }, f.rev()), 'INVITE_MISMATCH');
  denied(f.kam.api.recordInvitationCopy(f.exp.id, { contactId: f.contact.id }, f.rev()), 'INVITE_MISMATCH');
  assert.equal(f.disk.dump(), before);
});
test('leader, holder, unassigned KAM, changed actor and departed session cannot record copies', () => {
  const f = fixture(), inv = f.invite(), before = f.disk.dump();
  for (const actor of [{ id: 'leader_one', role: 'leader' }, f.person, { id: 'kam_other', role: 'kam' }]) denied(f.make(actor).api.recordInvitationCopy(f.exp.id, f.input(inv), f.rev()));
  const wrong = Assisted.createAssisted({ store: f.kam.store, actor: { id: 'admin_fake', role: 'admin' } });
  denied(wrong.recordInvitationCopy(f.exp.id, f.input(inv), f.rev()), 'ACTOR_MISMATCH');
  const rev = f.rev(); f.setCurrent(false); denied(f.kam.api.recordInvitationCopy(f.exp.id, f.input(inv), rev), 'forbidden');
  assert.equal(f.disk.dump(), before);
});
test('reassignment preserves generator attribution and rejects the former owner', () => {
  const f = fixture(), inv = f.invite(), next = f.make({ id: 'kam_next', role: 'kam' });
  ok(f.admin.store.reassignContact(f.contact.id, 'kam_next', 'Nueva cartera demo', f.rev()));
  denied(f.kam.api.recordInvitationCopy(f.exp.id, f.input(inv), f.rev()));
  const before = f.snapshot(), row = ok(next.api.recordInvitationCopy(f.exp.id, f.input(inv), f.rev()));
  assert.equal(row.generatedBy, f.staff.id); assert.equal(row.actorId, 'kam_next'); unchangedMaps(before, f.snapshot());
  ok(f.admin.api.recordInvitationCopy(f.exp.id, f.input(inv), f.rev()));
});
test('failed persistence adds no copy history and a fresh retry can succeed', () => {
  const f = fixture(), inv = f.invite(), before = f.disk.dump(), revision = f.rev(); f.disk.fail = true;
  denied(f.kam.api.recordInvitationCopy(f.exp.id, f.input(inv), revision), 'storage_write_failed'); assert.equal(f.disk.dump(), before);
  f.disk.fail = false; ok(f.kam.api.recordInvitationCopy(f.exp.id, f.input(inv), revision)); assert.equal(copies(f.snapshot()).length, 1);
});
for (const kind of ['patient', 'doctor']) test(`${kind}: authenticated access issuance and copy preserve exact holder and provenance`, () => {
  const f = fixture(kind), inv = f.invite(); f.claim(inv); const before = f.snapshot(), issued = f.issue();
  safeEntry(issued, []); assert.equal(issued.type, 'holder_access_link_issued'); assert.equal(issued.generatedBy, f.staff.id);
  const row = ok(f.kam.api.recordAccessLinkCopy(f.exp.id, { contactId: f.contact.id, issuedAuditId: issued.id }, f.rev()));
  safeEntry(row, ['issuedAuditId']); assert.equal(row.type, 'holder_access_link_copied'); assert.equal(row.issuedAuditId, issued.id); assert.equal(row.generatedBy, issued.actorId);
  unchangedMaps(before, f.snapshot()); assert.equal(f.snapshot().invitations[inv.id].status, 'consumed');
});
test('authenticated access requires a claimed exact record and a matching issuance', () => {
  const f = fixture(), inv = f.invite(), before = f.disk.dump();
  denied(f.kam.api.recordAccessLinkIssued(f.exp.id, { contactId: f.contact.id }, f.rev()), 'HOLDER_REQUIRED'); assert.equal(f.disk.dump(), before);
  f.claim(inv); const issued = f.issue(), claimed = f.disk.dump();
  denied(f.kam.api.recordAccessLinkIssued(f.exp.id, { contactId: 'ct_wrong' }, f.rev()), 'LINK_MISMATCH');
  for (const issuedAuditId of [undefined, inv.id, 'aud_missing']) denied(f.kam.api.recordAccessLinkCopy(f.exp.id, { contactId: f.contact.id, issuedAuditId }, f.rev()), 'LINK_MISMATCH');
  denied(f.kam.api.recordAccessLinkCopy(f.exp.id, { contactId: 'ct_wrong', issuedAuditId: issued.id }, f.rev()), 'LINK_MISMATCH'); assert.equal(f.disk.dump(), claimed);
});
test('access copy after reassignment records current copier and original generator separately', () => {
  const f = fixture(), inv = f.invite(); f.claim(inv); const issued = f.issue(), captured = f.rev();
  ok(f.admin.store.reassignContact(f.contact.id, 'kam_next', 'Nueva asistencia demo', f.rev()));
  const next = f.make({ id: 'kam_next', role: 'kam' }), before = f.snapshot();
  denied(next.api.recordAccessLinkCopy(f.exp.id, { contactId: f.contact.id, issuedAuditId: issued.id }, captured), 'stale_revision');
  denied(f.kam.api.recordAccessLinkCopy(f.exp.id, { contactId: f.contact.id, issuedAuditId: issued.id }, f.rev()));
  const copied = ok(next.api.recordAccessLinkCopy(f.exp.id, { contactId: f.contact.id, issuedAuditId: issued.id }, f.rev()));
  assert.equal(copied.generatedBy, f.staff.id); assert.equal(copied.actorId, 'kam_next'); unchangedMaps(before, f.snapshot());
});
test('read-only leader and holder cannot issue or record authenticated access links', () => {
  const f = fixture(); f.claim(f.invite()); const issued = f.issue(), before = f.disk.dump();
  for (const actor of [{ id: 'leader_one', role: 'leader' }, f.person, { id: 'kam_other', role: 'kam' }]) {
    const api = f.make(actor).api;
    denied(api.recordAccessLinkIssued(f.exp.id, { contactId: f.contact.id }, f.rev()));
    denied(api.recordAccessLinkCopy(f.exp.id, { contactId: f.contact.id, issuedAuditId: issued.id }, f.rev()));
  }
  assert.equal(f.disk.dump(), before);
});
function pair(ctx, value) { const row = ctx.append('audit', value); ctx.append('events', value); return row; }
test('transaction guard rejects fake generator, sensitive payload, unilateral history and business mutation', () => {
  const f = fixture(), inv = f.invite(), value = { type: 'holder_invitation_copied', contactId: f.contact.id, expedientId: f.exp.id, invitationId: inv.id, generatedBy: inv.createdBy, demo: true };
  const before = f.disk.dump();
  const attempts = [
    (s, ctx) => pair(ctx, { ...value, generatedBy: 'kam_fake' }),
    (s, ctx) => pair(ctx, { ...value, token: inv.token }),
    (s, ctx) => pair(ctx, { ...value, url: 'https://example.test/?token=secret' }),
    (s, ctx) => pair(ctx, { ...value, email: f.contact.email }),
    (s, ctx) => pair(ctx, { ...value, sent: true }),
    (s, ctx) => ctx.append('audit', value),
    (s, ctx) => { s.contacts[f.contact.id].notes = 'Mutación ajena'; return pair(ctx, value); },
    (s, ctx) => { ctx.append('audit', { type: 'unrelated', contactId: f.contact.id }); return pair(ctx, value); }
  ];
  for (const attempt of attempts) { denied(f.kam.store.transact(f.rev(), attempt), 'invalid_link_audit'); assert.equal(f.disk.dump(), before); }
});
test('transaction guard blocks expired and consumed invitation copies even through direct hooks', () => {
  for (const state of ['expired', 'consumed']) {
    const f = fixture(), inv = f.invite(); if (state === 'expired') f.setTime(inv.expiresAt); else f.claim(inv);
    const before = f.disk.dump(); denied(f.admin.store.transact(f.rev(), (s, ctx) => pair(ctx, { type: 'holder_invitation_copied', contactId: f.contact.id, expedientId: f.exp.id, invitationId: inv.id, generatedBy: inv.createdBy, demo: true })), 'invalid_link_audit'); assert.equal(f.disk.dump(), before);
  }
});
test('transaction guard blocks forged access issuance, wrong issuance, and changed identity', () => {
  const f = fixture(); f.claim(f.invite()); const issued = f.issue();
  const value = { type: 'holder_access_link_copied', contactId: f.contact.id, expedientId: f.exp.id, issuedAuditId: issued.id, generatedBy: issued.generatedBy, demo: true }, before = f.disk.dump();
  for (const patch of [{ issuedAuditId: 'aud_missing' }, { generatedBy: 'kam_fake' }, { token: 'forbidden' }]) { denied(f.admin.store.transact(f.rev(), (s, ctx) => pair(ctx, { ...value, ...patch })), 'invalid_link_audit'); assert.equal(f.disk.dump(), before); }
  denied(f.admin.store.transact(f.rev(), (s, ctx) => pair(ctx, { type: 'holder_access_link_issued', contactId: f.contact.id, expedientId: f.exp.id, generatedBy: 'kam_fake', demo: true })), 'invalid_link_audit');
  f.rewrite(state => { state.expedients[f.exp.id].holderIdentity.id = 'holder_wrong'; }); const corrupted = f.disk.dump();
  denied(f.kam.api.recordAccessLinkCopy(f.exp.id, { contactId: f.contact.id, issuedAuditId: issued.id }, f.rev()), 'HOLDER_REQUIRED'); assert.equal(f.disk.dump(), corrupted);
});
test('stale, failed-persistence and cross-record access copies preserve all history', () => {
  const f = fixture(); f.claim(f.invite()); const issued = f.issue(), input = { contactId: f.contact.id, issuedAuditId: issued.id }, captured = f.rev();
  ok(f.kam.api.editDraft(f.exp.id, { fields: { procedure: 'Actualizado después de copiar' } }, f.rev()));
  let before = f.disk.dump(); denied(f.kam.api.recordAccessLinkCopy(f.exp.id, input, captured), 'stale_revision'); assert.equal(f.disk.dump(), before);
  f.disk.fail = true; denied(f.kam.api.recordAccessLinkCopy(f.exp.id, input, f.rev()), 'storage_write_failed'); assert.equal(f.disk.dump(), before); f.disk.fail = false;
  ok(f.kam.api.recordAccessLinkCopy(f.exp.id, input, f.rev()));
  const other = ok(f.admin.store.createContact({ type: 'patient', name: 'Otro cliente', email: 'second@example.test', assignedKam: f.staff.id }, f.rev()));
  const otherExp = ok(f.kam.api.beginDraft({ contactId: other.id }, f.rev())), otherInvite = ok(f.kam.api.invite(otherExp.id, { email: other.email }, f.rev())), h = f.make({ id: 'holder_second', role: 'holder' });
  const challenge = ok(h.api.requestDemoVerification({ token: otherInvite.token, email: other.email })), proof = ok(h.api.verifyDemoCode(challenge.challengeId, challenge.demoCode));
  ok(h.api.claim(otherInvite.token, { email: other.email, proofToken: proof.proofToken }, f.rev()));
  before = f.disk.dump(); denied(f.kam.api.recordAccessLinkCopy(otherExp.id, { contactId: other.id, issuedAuditId: issued.id }, f.rev()), 'LINK_MISMATCH'); assert.equal(f.disk.dump(), before);
});
test('historical revocation, wrong active invitation and identity mismatch refuse a fresh copy', () => {
  const mutations = [
    [state => { state.invitations[Object.keys(state.invitations)[0]].revokedAt = '2026-10-12T07:30:00.000Z'; }, 'INVITE_USED'],
    [state => { state.expedients[Object.keys(state.expedients)[0]].activeInvitationId = null; }, 'INVITE_STALE'],
    [state => { state.invitations[Object.keys(state.invitations)[0]].intendedEmail = 'wrong@example.test'; }, 'WRONG_IDENTITY']
  ];
  for (const [mutate, code] of mutations) { const f = fixture(), inv = f.invite(); f.rewrite(mutate); const before = f.disk.dump(); denied(f.kam.api.recordInvitationCopy(f.exp.id, f.input(inv), f.rev()), code); assert.equal(f.disk.dump(), before); }
});
console.log(`PASS: ${passed} personal-link audit checks; no browser, network, Git, or publication.`);
