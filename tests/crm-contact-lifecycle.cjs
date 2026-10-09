'use strict';
const assert = require('node:assert/strict');
const S = require('../assets/js/crm-demo-store.js');
const A = require('../assets/js/crm-assisted.js');
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('PASS: ' + name); };
const good = result => { assert.equal(result.ok, true, result.error); return result.value; };
const bad = (result, code) => { assert.equal(result.ok, false, 'Expected rejection'); if (code) assert.equal(result.code, code, result.error); };
function fixture(type = 'patient') {
  const values = new Map(); let seq = 0, at = '2026-10-09T11:00:00.000Z';
  const storage = { failWrite: false, getItem: key => values.get(key) || null, setItem(key, value) { if (this.failWrite) throw Error('Quota exceeded'); values.set(key, String(value)); }, dump: () => JSON.stringify([...values]) };
  const make = (id, role, options = {}) => S.createStore({ storage, actor: { id, role }, now: () => at, randomId: () => 'lifecycle' + ++seq, ...options });
  const admin = make('admin_one', 'admin'), kam = make('kam_one', 'kam'), other = make('kam_other', 'kam'), holder = make('holder_one', 'holder');
  const rev = () => admin.snapshot().revision;
  const ref = good(kam.createReferral(type, rev()));
  const contact = good(kam.createContact({ type, name: 'Contacto ficticio', email: type + '@example.test', phone: '5512345678', referralToken: ref.token }, rev()));
  const query = { type, email: contact.email, phone: contact.phone };
  const archive = () => good(admin.deleteContact(contact.id, 'Prospecto archivado por revisión comercial', rev()));
  return { storage, admin, kam, other, holder, make, contact, query, archive, rev, now: () => at, setTime: value => { at = value; } };
}
function unchanged(f, action, code) { const before = f.storage.dump(); bad(action(), code); assert.equal(f.storage.dump(), before); }
function rawLifecycle(store, f, deletedAt, reason = 'Intento de archivo directo') {
  return store.transact(f.rev(), (draft, ctx) => { const contact = draft.contacts[f.contact.id]; contact.deletedAt = deletedAt === null ? null : ctx.now; contact.updatedAt = ctx.now; ctx.append('audit', { action: deletedAt === null ? 'contact_restored' : 'contact_archived', contactId: contact.id, reason }); });
}
function submitted(f) {
  const staff = A.createAssisted({ store: f.kam, actor: f.kam.actor, now: f.now });
  const exp = good(staff.beginDraft({ contactId: f.contact.id }, f.rev()));
  const invitation = good(staff.invite(exp.id, { email: f.contact.email }, f.rev()));
  const holder = A.createAssisted({ store: f.holder, actor: f.holder.actor, now: f.now });
  const challenge = good(holder.requestDemoVerification({ token: invitation.token, email: f.contact.email }));
  const proof = good(holder.verifyDemoCode(challenge.challengeId, challenge.demoCode));
  good(holder.claim(invitation.token, { email: f.contact.email, proofToken: proof.proofToken }, f.rev()));
  const patient = f.contact.type === 'patient';
  good(holder.editDraft(exp.id, { fields: patient ? { procedure: 'DEMO', requestedAmount: 10000, termMonths: 12, monthlyIncome: 20000, address: 'DEMO', identityReference: 'DEMO' } : { specialty: 'DEMO', professionalLicense: 'DEMO', clinicName: 'DEMO', clinicAddress: 'DEMO' }, documents: [{ label: patient ? 'identity' : 'license', fileName: 'demo.pdf', evidenceId: 'evidence_local', demo: true, mimeType: 'application/pdf', size: 100 }] }, f.rev()));
  good(holder.holderAction(exp.id, 'otp', { confirmed: true, demo: true }, f.rev()));
  if (patient) good(holder.holderAction(exp.id, 'buroConsent', { confirmed: true, demo: true }, f.rev()));
  good(holder.holderAction(exp.id, 'finalConfirmation', { confirmed: true, demo: true, capacity: 'holder', authorityConfirmed: true }, f.rev()));
  good(holder.submit(exp.id, f.rev()));
  return exp;
}

test('review detail, review history and archive reads are admin-only', () => {
  const f = fixture();
  for (const store of [f.kam, f.other, f.holder]) {
    for (const read of [() => store.inspectIdentityReview(f.query), () => store.listIdentityReviews(), () => store.listArchivedContacts(), () => store.getArchivedContact(f.contact.id)]) assert.throws(read, e => e.code === 'forbidden');
    unchanged(f, () => store.reviewIdentity(f.query, { status: 'pending', reason: 'Revisión DEMO' }, f.rev()), 'forbidden');
    unchanged(f, () => store.deleteContact(f.contact.id, 'Archivo DEMO', f.rev()), 'forbidden');
    unchanged(f, () => store.restoreContact(f.contact.id, 'Restaurar DEMO', f.rev()), 'forbidden');
  }
});
test('identity review is read-only and one exact active CRM record is a continuation candidate', () => {
  const f = fixture(), before = f.storage.dump(), report = f.admin.inspectIdentityReview({ ...f.query, email: ' PATIENT@EXAMPLE.TEST ', phone: '+52 55 1234 5678' });
  assert.equal(f.storage.dump(), before); assert.equal(report.canContinue, true); assert.equal(report.continuationContactId, f.contact.id); assert.equal(report.requiresReconciliation, false); assert.equal(report.revision, f.rev());
  report.matches[0].contactId = 'foreign'; assert.equal(f.admin.inspectIdentityReview(f.query).matches[0].contactId, f.contact.id);
});
test('safe continuation writes only an admin review audit and never rewrites identity or attribution', () => {
  const f = fixture(), before = f.admin.snapshot();
  const result = good(f.admin.reviewIdentity(f.query, { status: 'resolved', reason: 'Continuar ficha CRM existente', contactId: f.contact.id }, f.rev()));
  assert.equal(result.contactId, f.contact.id); assert.equal(result.status, 'resolved');
  const after = f.admin.snapshot();
  for (const key of ['contacts', 'expedients', 'invitations', 'referrals', 'tasks', 'activities', 'events']) assert.deepEqual(after[key], before[key], key);
  assert.equal(f.kam.listAudit().some(a => /^identity_review_/.test(a.action)), false);
  assert.equal(Object.values(f.kam.snapshot().audit).some(a => /^identity_review_/.test(a.action)), false);
  assert.equal(f.admin.listIdentityReviews()[0].selectedContactId, f.contact.id);
  unchanged(f, () => f.kam.createContact({ ...f.query, name: 'No duplicate' }, f.rev()), 'duplicate_contact');
});
test('split email/phone, conflicting identifiers and cross-type matches remain pending', () => {
  const f = fixture(); const second = good(f.kam.createContact({ type: 'patient', name: 'Otro contacto', email: 'other@example.test', phone: '5599998888' }, f.rev()));
  for (const query of [{ ...f.query, phone: second.phone }, { ...f.query, phone: '5588887777' }, { ...f.query, type: 'doctor' }]) {
    assert.equal(f.admin.inspectIdentityReview(query).canContinue, false);
    unchanged(f, () => f.admin.reviewIdentity(query, { status: 'resolved', reason: 'Sin política de identidad', contactId: f.contact.id }, f.rev()), 'identity_reconciliation_required');
    const result = good(f.admin.reviewIdentity(query, { status: 'pending', reason: 'Requiere decisión de identidad' }, f.rev())); assert.equal(result.status, 'pending'); assert.equal(result.contactId, null);
  }
});
test('legacy-only and CRM plus legacy matches cannot be marked resolved', () => {
  const f = fixture(); f.storage.setItem('pulzzo_patient', JSON.stringify({ patientAccountId: 'legacy_holder', correo: f.contact.email, celular: f.contact.phone }));
  const beforeLegacy = f.storage.getItem('pulzzo_patient');
  const report = f.admin.inspectIdentityReview(f.query); assert.equal(report.canContinue, false); assert.equal(report.matches.length, 2);
  unchanged(f, () => f.admin.reviewIdentity(f.query, { status: 'resolved', reason: 'No fusionar', contactId: f.contact.id }, f.rev()), 'identity_reconciliation_required');
  good(f.admin.reviewIdentity(f.query, { status: 'pending', reason: 'Esperar revisión autorizada' }, f.rev()));
  assert.equal(f.storage.getItem('pulzzo_patient'), beforeLegacy);
  unchanged(f, () => f.admin.createContact({ ...f.query, name: 'No duplicar' }, f.rev()), 'existing_account_requires_login');
});
test('review audit excludes automatic email, phone and account payloads and remains admin-private', () => {
  const f = fixture(); f.storage.setItem('pulzzo_demo_accounts_v1', JSON.stringify({ patient: { private_account: { email: f.contact.email, phone: f.contact.phone, medical: 'private payload' } }, doctor: {} }));
  good(f.admin.reviewIdentity(f.query, { status: 'pending', reason: 'Revisar coincidencia por canal autorizado' }, f.rev()));
  const entry = f.admin.listIdentityReviews()[0], serialized = JSON.stringify(entry);
  for (const sensitive of [f.contact.email, f.contact.phone, 'private_account', 'private payload']) assert.equal(serialized.includes(sensitive), false);
  assert.equal(entry.contactId, null); assert.equal(entry.actorId, 'admin_one'); assert.equal(entry.actorRole, 'admin'); assert.equal(entry.createdAt, f.now());
  for (const store of [f.kam, f.other, f.holder]) assert.equal(JSON.stringify(store.snapshot()).includes(entry.reviewId), false);
});
test('a later independent continuation never closes a prior pending review for another query', () => {
  const f = fixture(), pending = good(f.admin.reviewIdentity({ type: 'patient', email: 'unknown@example.test' }, { status: 'pending', reason: 'Falta contexto' }, f.rev()));
  unchanged(f, () => f.admin.reviewIdentity(f.query, { status: 'resolved', reason: 'Ficha distinta', contactId: f.contact.id, reviewId: pending.reviewId }, f.rev()), 'invalid_review');
  good(f.admin.reviewIdentity(f.query, { status: 'resolved', reason: 'Continuar ficha distinta', contactId: f.contact.id }, f.rev()));
  assert.equal(f.admin.listIdentityReviews({ reviewId: pending.reviewId })[0].status, 'pending');
});
test('review validates reason, selected target, captured revision, query fields and current collisions', () => {
  const f = fixture(), revision = f.rev();
  unchanged(f, () => f.admin.reviewIdentity(f.query, { status: 'pending', reason: '' }, f.rev()), 'invalid_input');
  unchanged(f, () => f.admin.reviewIdentity(f.query, { status: 'pending', reason: 'Pending', contactId: f.contact.id }, f.rev()), 'invalid_review');
  unchanged(f, () => f.admin.reviewIdentity(f.query, { status: 'resolved', reason: 'Wrong target', contactId: 'ct_wrong' }, f.rev()), 'identity_reconciliation_required');
  assert.throws(() => f.admin.inspectIdentityReview({ ...f.query, accountId: 'takeover' }), e => e.code === 'invalid_input');
  good(f.kam.updateContact(f.contact.id, { notes: 'A newer view' }, f.rev()));
  unchanged(f, () => f.admin.reviewIdentity(f.query, { status: 'pending', reason: 'Old view' }, revision), 'stale_revision');
  unchanged(f, () => f.admin.reviewIdentity(f.query, { status: 'pending', reason: 'No revision' }), 'revision_required');
  f.storage.setItem('pulzzo_patient', JSON.stringify({ email: f.contact.email, patientAccountId: 'changed_between_read_and_save' }));
  unchanged(f, () => f.admin.reviewIdentity(f.query, { status: 'resolved', reason: 'New collision', contactId: f.contact.id }, f.rev()), 'identity_reconciliation_required');
});
test('generic transactions cannot fabricate review decisions or rewrite existing review history', () => {
  const f = fixture();
  for (const store of [f.admin, f.kam]) unchanged(f, () => store.transact(f.rev(), (draft, ctx) => ctx.append('audit', { action: 'identity_review_resolved', contactId: null, selectedContactId: f.contact.id, status: 'resolved', reason: 'Forged review' })), store === f.admin ? 'invalid_review' : 'forbidden');
  good(f.admin.reviewIdentity(f.query, { status: 'pending', reason: 'Review only' }, f.rev())); const entry = f.admin.listIdentityReviews()[0];
  unchanged(f, () => f.admin.transact(f.rev(), draft => { draft.audit[entry.id].status = 'resolved'; }), 'immutable_history');
});
test('KAM identity check retains own contact IDs but masks foreign and legacy account identifiers', () => {
  const f = fixture(); const foreign = good(f.other.createContact({ type: 'doctor', name: 'Foreign DEMO', email: 'foreign@example.test', phone: '5588996677' }, f.rev()));
  const raw = JSON.parse(f.storage.getItem(S.STORAGE_KEY)); raw.contacts[foreign.id].accountId = 'foreign_account'; raw.contacts[foreign.id].holderId = 'foreign_account'; raw.contacts[foreign.id].accountExists = true; f.storage.setItem(S.STORAGE_KEY, JSON.stringify(raw));
  const query = { type: 'doctor', email: foreign.email };
  f.storage.setItem('pulzzo_backoffice_demo', JSON.stringify({ patients: [], providers: [{ id: 'FOREIGN_BO', doctorAccountId: 'foreign_account', profile: { email: foreign.email } }] }));
  const report = f.kam.inspectIdentity(query), serialized = JSON.stringify(report);
  for (const id of [foreign.id, 'foreign_account', 'FOREIGN_BO']) assert.equal(serialized.includes(id), false);
  assert.equal(report.existingAccountId, null); assert.equal(report.blocked, true); assert.equal(report.requiresReconciliation, true); assert.equal(report.requiresHolderLogin, true);
  assert.equal(f.kam.inspectIdentity(f.query).matches[0].contactId, f.contact.id);
  assert.equal(f.admin.inspectIdentity(query).existingAccountId, 'foreign_account');
  assert.equal(f.holder.inspectIdentity(query).existingAccountId, 'foreign_account', 'Legacy DEMO login lookup remains available; it is not real authentication');
});

test('admin archives a bare prospect without changing source, assignment, tasks or records', () => {
  const f = fixture(), before = f.admin.snapshot(), contact = f.contact;
  f.setTime('2026-10-09T12:00:00.000Z'); f.archive(); const after = f.admin.snapshot();
  assert.deepEqual({ ...after.contacts[contact.id], deletedAt: null, updatedAt: contact.updatedAt }, contact);
  for (const key of ['expedients', 'invitations', 'referrals', 'tasks', 'activities', 'events']) assert.deepEqual(after[key], before[key]);
  assert.equal(f.admin.listContacts().length, 0); assert.equal(f.admin.listArchivedContacts()[0].id, contact.id); assert.equal(f.admin.getArchivedContact(contact.id).deletedAt, f.now());
  const log = f.admin.listAudit({ contactId: contact.id, includeArchived: true }).find(a => a.action === 'contact_archived'); assert.equal(log.actorRole, 'admin'); assert.ok(log.reason);
  assert.deepEqual(f.admin.listAudit({ contactId: contact.id }), []); assert.deepEqual(f.kam.listAudit({ contactId: contact.id, includeArchived: true }), []); assert.deepEqual(f.kam.snapshot().contacts, {});
});
test('archive and restore require reason and captured revision; repeat archive does not rewrite history', () => {
  const f = fixture(), stale = f.rev(); good(f.kam.updateContact(f.contact.id, { notes: 'New context' }, f.rev()));
  unchanged(f, () => f.admin.deleteContact(f.contact.id, '', f.rev()), 'invalid_input');
  unchanged(f, () => f.admin.deleteContact(f.contact.id, 'Stale', stale), 'stale_revision');
  unchanged(f, () => f.admin.deleteContact(f.contact.id, 'Missing revision'), 'revision_required');
  f.archive(); unchanged(f, () => f.admin.deleteContact(f.contact.id, 'Again', f.rev()), 'contact_not_found');
  unchanged(f, () => f.admin.restoreContact(f.contact.id, '', f.rev()), 'invalid_input');
  unchanged(f, () => f.admin.restoreContact(f.contact.id, 'Stale', stale), 'stale_revision');
});
test('archive rejects open tasks through API and generic transaction without closing tasks', () => {
  const f = fixture(); const task = good(f.kam.createTask({ contactId: f.contact.id, title: 'Follow-up', dueAt: '2026-10-10' }, f.rev()));
  unchanged(f, () => f.admin.deleteContact(f.contact.id, 'Archive', f.rev()), 'open_tasks');
  unchanged(f, () => rawLifecycle(f.admin, f, true), 'open_tasks'); assert.equal(f.kam.listTasks()[0].status, 'open');
  good(f.kam.closeTask(task.id, 'Terminada explícitamente', f.rev())); f.archive();
});
test('archive refuses genuine assisted drafts and invitations without cancelling onboarding', () => {
  const f = fixture(), staff = A.createAssisted({ store: f.kam, actor: f.kam.actor, now: f.now }); const exp = good(staff.beginDraft({ contactId: f.contact.id }, f.rev()));
  unchanged(f, () => f.admin.deleteContact(f.contact.id, 'Archive', f.rev()), 'open_expedient'); unchanged(f, () => rawLifecycle(f.admin, f, true), 'open_expedient');
  const invitation = good(staff.invite(exp.id, { email: f.contact.email }, f.rev()));
  unchanged(f, () => f.admin.deleteContact(f.contact.id, 'Archive', f.rev()), 'open_expedient');
  assert.equal(f.admin.snapshot().invitations[invitation.id].status, 'pending');
});
for (const type of ['patient', 'doctor']) test('archive refuses real submitted ' + type + ' through API and raw transaction', () => {
  const f = fixture(type), exp = submitted(f), snapshot = f.admin.snapshot().expedients[exp.id];
  unchanged(f, () => f.admin.deleteContact(f.contact.id, 'Archive submitted', f.rev()), 'open_expedient'); unchanged(f, () => rawLifecycle(f.admin, f, true), 'open_expedient');
  assert.deepEqual(f.admin.snapshot().expedients[exp.id], snapshot); assert.equal(f.admin.getContact(f.contact.id).stage, 'submitted');
});
test('archive refuses account-only contacts, legacy accounts and exact BO links without touching financial data', () => {
  for (const kind of ['account', 'portal', 'backoffice']) {
    const f = fixture(); f.storage.setItem('pulzzo_application', JSON.stringify({ offerAccepted: true, contractSigned: true, payments: [{ amount: 10 }] }));
    if (kind === 'account') { const raw = f.admin.snapshot(); raw.contacts[f.contact.id].accountId = 'linked_account'; f.storage.setItem(S.STORAGE_KEY, JSON.stringify(raw)); }
    if (kind === 'portal') f.storage.setItem('pulzzo_patient', JSON.stringify({ correo: f.contact.email, patientAccountId: 'linked_account' }));
    if (kind === 'backoffice') f.storage.setItem('pulzzo_backoffice_demo', JSON.stringify({ patients: [{ id: 'CREDIT_exact', crmIntake: { contactId: f.contact.id }, application: { offerAccepted: true, contractSigned: true } }], providers: [] }));
    unchanged(f, () => f.admin.deleteContact(f.contact.id, 'Archive linked', f.rev()), kind === 'account' ? 'account_linked' : 'identity_reconciliation_required');
    unchanged(f, () => rawLifecycle(f.admin, f, true), kind === 'account' ? 'account_linked' : 'identity_reconciliation_required');
  }
});
test('validated external credit references block prospect archival', () => {
  const f = fixture(), store = f.make('kam_one', 'kam', { validateExternalReference: () => true });
  good(store.addActivity({ contactId: f.contact.id, type: 'note', summary: 'Operación vinculada DEMO', creditId: 'CREDIT_exact' }, f.rev()));
  unchanged(f, () => f.admin.deleteContact(f.contact.id, 'Archive', f.rev()), 'linked_operation');
});
test('raw lifecycle writes cannot bypass admin, bundle identity changes or close tasks incidentally', () => {
  const f = fixture(); unchanged(f, () => rawLifecycle(f.kam, f, true), 'forbidden'); unchanged(f, () => rawLifecycle(f.holder, f, true), 'forbidden');
  unchanged(f, () => f.admin.transact(f.rev(), (draft, ctx) => { const c = draft.contacts[f.contact.id]; c.deletedAt = ctx.now; c.updatedAt = ctx.now; c.name = 'Changed during archive'; ctx.append('audit', { action: 'contact_archived', contactId: c.id, reason: 'Archive' }); }), 'archived_contact');
  const task = good(f.kam.createTask({ contactId: f.contact.id, title: 'Pending', dueAt: '2026-10-10' }, f.rev()));
  unchanged(f, () => f.admin.transact(f.rev(), (draft, ctx) => { const c = draft.contacts[f.contact.id]; c.deletedAt = ctx.now; c.updatedAt = ctx.now; draft.tasks[task.id].status = 'closed'; draft.tasks[task.id].closedAt = ctx.now; draft.tasks[task.id].closeReason = 'Implicit'; ctx.append('audit', { action: 'contact_archived', contactId: c.id, reason: 'Archive' }); }), 'lifecycle_scope');
});
test('restore reactivates the same reserved identity and retains all prior archive and source history', () => {
  const f = fixture(), original = f.admin.getContact(f.contact.id); f.archive(); const archived = f.admin.getArchivedContact(f.contact.id), audit = f.admin.snapshot().audit;
  unchanged(f, () => f.kam.createContact({ ...f.query, name: 'Archived duplicate' }, f.rev()), 'duplicate_contact');
  assert.equal(f.admin.inspectIdentityReview(f.query).canContinue, false); assert.equal(f.admin.inspectIdentityReview(f.query).matches[0].archived, true);
  f.setTime('2026-10-10T11:00:00.000Z'); const restored = good(f.admin.restoreContact(f.contact.id, 'Reabrir seguimiento del prospecto', f.rev()));
  assert.deepEqual({ ...restored, updatedAt: original.updatedAt }, original); assert.equal(restored.createdAt, archived.createdAt); assert.deepEqual(f.admin.listArchivedContacts(), []);
  for (const [id, entry] of Object.entries(audit)) assert.deepEqual(f.admin.snapshot().audit[id], entry);
  assert.equal(f.kam.getContact(f.contact.id).id, f.contact.id); assert.equal(f.other.listContacts().length, 0);
  unchanged(f, () => f.admin.restoreContact(f.contact.id, 'Restore twice', f.rev()), 'archived_contact_not_found');
});
test('restore rejects CRM collisions and newly appeared portal or BO identity matches', () => {
  for (const kind of ['crm', 'portal', 'backoffice']) {
    const f = fixture(); f.archive();
    if (kind === 'crm') { const raw = f.admin.snapshot(); raw.contacts.ct_collision = { ...f.contact, id: 'ct_collision', email: 'other@example.test', phone: f.contact.phone, deletedAt: null }; f.storage.setItem(S.STORAGE_KEY, JSON.stringify(raw)); }
    if (kind === 'portal') f.storage.setItem('pulzzo_doctor', JSON.stringify({ email: f.contact.email, doctorAccountId: 'other_account' }));
    if (kind === 'backoffice') f.storage.setItem('pulzzo_backoffice_demo', JSON.stringify({ patients: [{ id: 'BO_other', crmIntake: { contactId: f.contact.id } }], providers: [] }));
    unchanged(f, () => f.admin.restoreContact(f.contact.id, 'Restore', f.rev()), kind === 'crm' ? 'duplicate_contact' : 'identity_reconciliation_required');
  }
});
test('restore fails closed for unverifiable historical archive and active operations in old archived records', () => {
  const f = fixture(); const raw = f.admin.snapshot(); raw.contacts[f.contact.id].deletedAt = f.now(); f.storage.setItem(S.STORAGE_KEY, JSON.stringify(raw));
  unchanged(f, () => f.admin.restoreContact(f.contact.id, 'Restore without audit', f.rev()), 'archive_review_required');
  const second = fixture(); submitted(second); const state = second.admin.snapshot(); state.contacts[second.contact.id].deletedAt = second.now(); second.storage.setItem(S.STORAGE_KEY, JSON.stringify(state));
  unchanged(second, () => second.admin.restoreContact(second.contact.id, 'Unsafe old archive', second.rev()), 'open_expedient');
});
test('restore cannot change archived name, assignment, source or history as a side effect', () => {
  const f = fixture(); f.archive(); unchanged(f, () => rawLifecycle(f.kam, f, null), 'forbidden');
  for (const [key, value] of [['name', 'Rewritten'], ['assignedKam', 'kam_other'], ['originalSource', 'organic']]) unchanged(f, () => f.admin.transact(f.rev(), (draft, ctx) => { const c = draft.contacts[f.contact.id]; c.deletedAt = null; c.updatedAt = ctx.now; c[key] = value; ctx.append('audit', { action: 'contact_restored', contactId: c.id, reason: 'Restore' }); }));
});
test('archive and restore fail atomically on persistence and unreadable legacy directories', () => {
  const f = fixture(); f.storage.failWrite = true; unchanged(f, () => f.admin.deleteContact(f.contact.id, 'Archive', f.rev()), 'storage_write_failed'); f.storage.failWrite = false; f.archive();
  f.storage.failWrite = true; unchanged(f, () => f.admin.restoreContact(f.contact.id, 'Restore', f.rev()), 'storage_write_failed'); f.storage.failWrite = false;
  f.storage.setItem('pulzzo_demo_accounts_v1', '{broken'); unchanged(f, () => f.admin.restoreContact(f.contact.id, 'Restore', f.rev()), 'identity_lookup_failed');
});
console.log('PASS: ' + passed + ' CRM identity review and contact lifecycle tests.');
