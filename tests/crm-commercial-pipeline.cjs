'use strict';
const assert = require('node:assert/strict');
const API = require('../assets/js/crm-demo-store.js');
const Assisted = require('../assets/js/crm-assisted.js');
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS: ' + name); }
function good(result) { assert.equal(result.ok, true, result.error); return result.value; }
function bad(result, code) { assert.equal(result.ok, false, 'Expected rejection'); assert.equal(result.code, code, result.error); return result; }
function fixture(type = 'patient') {
  const values = new Map(); let seq = 0, now = '2026-10-09T10:00:00.000Z';
  const storage = { writes: 0, failWrite: false, getItem: key => values.has(key) ? values.get(key) : null, setItem(key, value) { if (this.failWrite) throw new Error('Quota exceeded'); this.writes++; values.set(key, String(value)); }, dump: () => JSON.stringify([...values]) };
  const make = (id = 'kam_one', role = 'kam', extras = {}) => API.createStore({ storage, actor: { id, role }, randomId: () => 'sequence' + ++seq, now: () => now, ...extras });
  const store = make(), ref = good(store.createReferral(type, 0));
  const contact = good(store.createContact({ type, name: 'Prospecto ficticio', email: type + '@example.test', phone: '5512345678', referralToken: ref.token }, store.snapshot().revision));
  return { storage, make, store, contact, now: () => now, setTime: value => { now = value; }, rev: () => store.snapshot().revision, move(stage, details = {}, revision) { return store.moveCommercialStage(contact.id, stage, details, revision === undefined ? this.rev() : revision); } };
}
function completeSubmission(f) {
  const kam = Assisted.createAssisted({ store: f.store, actor: f.store.actor, now: f.now });
  const exp = good(kam.beginDraft({ contactId: f.contact.id }, f.rev()));
  const inv = good(kam.invite(exp.id, { email: f.contact.email }, f.rev()));
  const store = f.make('holder_one', 'holder'), holder = Assisted.createAssisted({ store, actor: store.actor, now: f.now });
  const challenge = good(holder.requestDemoVerification({ token: inv.token, email: f.contact.email }));
  const proof = good(holder.verifyDemoCode(challenge.challengeId, challenge.demoCode));
  good(holder.claim(inv.token, { email: f.contact.email, proofToken: proof.proofToken }, f.rev()));
  const patient = f.contact.type === 'patient';
  good(holder.editDraft(exp.id, { fields: patient ? { procedure: 'DEMO', requestedAmount: 10000, termMonths: 12, monthlyIncome: 20000, address: 'DEMO', identityReference: 'DEMO' } : { specialty: 'DEMO', professionalLicense: 'DEMO', clinicName: 'DEMO', clinicAddress: 'DEMO' }, documents: [{ label: patient ? 'identity' : 'license', fileName: 'ficticio.pdf', demo: true, evidenceId: 'evidence_demo', mimeType: 'application/pdf', size: 100 }] }, f.rev()));
  good(holder.holderAction(exp.id, 'otp', { confirmed: true, demo: true }, f.rev()));
  if (patient) good(holder.holderAction(exp.id, 'buroConsent', { confirmed: true, demo: true }, f.rev()));
  good(holder.holderAction(exp.id, 'finalConfirmation', { confirmed: true, demo: true, capacity: 'holder', authorityConfirmed: true }, f.rev()));
  good(holder.submit(exp.id, f.rev()));
  return { exp: f.store.snapshot().expedients[exp.id], holder, holderStore: store };
}
test('commercial stage catalogs are immutable, type-specific and exclude submission/approval', () => {
  assert.equal(Object.isFrozen(API.COMMERCIAL_STAGES), true);
  for (const type of ['patient', 'doctor']) {
    assert.equal(Object.isFrozen(API.COMMERCIAL_STAGES[type]), true);
    assert.equal(API.COMMERCIAL_STAGES[type].includes('submitted'), false);
    assert.equal(API.COMMERCIAL_STAGES[type].includes('approved'), false);
    assert.equal(API.STAGES[type].includes('submitted'), true);
  }
  assert.ok(API.COMMERCIAL_STAGES.doctor.includes('meeting_scheduled'));
  assert.ok(!API.COMMERCIAL_STAGES.patient.includes('meeting_scheduled'));
});
test('a canonical move writes contact, activity, audit and event in one atomic revision', () => {
  const f = fixture(), rev = f.rev(), writes = f.storage.writes;
  const result = f.move('contacted', { expectedStage: 'new', reason: 'Conversación ficticia' });
  const contact = good(result), state = f.store.snapshot();
  assert.equal(result.revision, rev + 1); assert.equal(f.storage.writes, writes + 1); assert.equal(contact.stage, 'contacted');
  const activity = f.store.listActivities()[0], audit = f.store.listAudit().find(a => a.action === 'contact_stage_changed'), event = Object.values(state.events).find(e => e.type === 'contact_stage_changed');
  for (const entry of [activity, audit, event]) { assert.equal(entry.contactId, contact.id); assert.equal(entry.actorId, 'kam_one'); assert.equal(entry.actorRole, 'kam'); assert.equal(entry.createdAt, f.now()); }
  assert.equal(audit.from, 'new'); assert.equal(audit.to, 'contacted'); assert.equal(event.source, 'commercial');
  assert.equal(activity.type, 'stage_change'); assert.equal(activity.contactAt, f.now());
  assert.deepEqual(state.expedients, {}); assert.equal(f.store.dashboard().counts.submitted, 0);
});
test('commercial move preserves attribution, assigned owner, account and assisting actors', () => {
  const f = fixture(), before = f.store.getContact(f.contact.id); good(f.move('interested'));
  const after = f.store.getContact(f.contact.id);
  for (const key of ['id', 'type', 'createdAt', 'createdBy', 'originalSource', 'referringKam', 'assignedKam', 'assistingActors', 'holderId', 'accountId', 'accountExists']) assert.deepEqual(after[key], before[key], key);
});
test('patient stages reject provider stages and provider stages include a meeting', () => {
  const p = fixture(), d = fixture('doctor');
  for (const stage of ['contacted_demo', 'meeting_scheduled', 'registration_started']) bad(p.move(stage), 'invalid_stage');
  for (const stage of ['contacted', 'application_started']) bad(d.move(stage), 'invalid_stage');
  good(d.move('contacted_demo')); good(d.move('meeting_scheduled')); good(d.move('registration_started'));
  assert.equal(d.store.getContact(d.contact.id).stage, 'registration_started');
});
test('manual submission and approval reject through both entry points without writes', () => {
  const f = fixture(), before = f.storage.dump();
  for (const method of ['moveCommercialStage', 'setStage']) for (const stage of ['submitted', 'approved', 'rejected', 'active']) bad(f.store[method](f.contact.id, stage, {}, f.rev()), 'invalid_stage');
  assert.equal(f.storage.dump(), before); assert.equal(f.store.dashboard().counts.submitted, 0);
});
test('raw transaction cannot manufacture submitted commercial state or submission events', () => {
  const f = fixture(), before = f.storage.dump();
  bad(f.store.transact(f.rev(), d => { d.contacts[f.contact.id].stage = 'submitted'; }), 'holder_action_required');
  bad(f.store.transact(f.rev(), (d, ctx) => ctx.append('events', { type: 'holder_submitted', contactId: f.contact.id, expedientId: 'exp_fake' })), 'invalid_event');
  assert.equal(f.storage.dump(), before);
});
test('the trusted transaction boundary also requires matching stage audit and event', () => {
  const f = fixture(), before = f.storage.dump();
  bad(f.store.transact(f.rev(), d => { d.contacts[f.contact.id].stage = 'contacted'; }), 'audit_required');
  bad(f.store.transact(f.rev(), (d, ctx) => { d.contacts[f.contact.id].stage = 'contacted'; ctx.append('audit', { action: 'contact_stage_changed', contactId: f.contact.id, from: 'new', to: 'contacted' }); }), 'audit_required');
  assert.equal(f.storage.dump(), before);
});
test('staff, owner and missing-contact guards apply before any mutation', () => {
  const f = fixture(), before = f.storage.dump();
  bad(f.make('holder_one', 'holder').moveCommercialStage(f.contact.id, 'contacted', {}, f.rev()), 'forbidden');
  bad(f.make('kam_other').moveCommercialStage(f.contact.id, 'contacted', {}, f.rev()), 'forbidden');
  bad(f.store.moveCommercialStage('ct_missing', 'contacted', {}, f.rev()), 'contact_not_found');
  assert.equal(f.storage.dump(), before);
});
test('admin move retains the existing owner and uses admin audit identity', () => {
  const f = fixture(), admin = f.make('admin_one', 'admin'); good(admin.moveCommercialStage(f.contact.id, 'contacted', {}, f.rev()));
  assert.equal(admin.getContact(f.contact.id).assignedKam, 'kam_one');
  assert.equal(admin.listActivities()[0].actorId, 'admin_one'); assert.equal(admin.listActivities()[0].actorRole, 'admin');
});
test('captured revision is mandatory and stale cards cannot move', () => {
  const f = fixture(), rev = f.rev();
  bad(f.store.moveCommercialStage(f.contact.id, 'contacted', {}), 'revision_required');
  good(f.store.updateContact(f.contact.id, { notes: 'Changed elsewhere' }, rev)); const before = f.storage.dump();
  bad(f.move('contacted', {}, rev), 'stale_revision'); assert.equal(f.storage.dump(), before);
});
test('expectedStage catches the wrong source even when the supplied revision is current', () => {
  const f = fixture(), before = f.storage.dump(); bad(f.move('interested', { expectedStage: 'contacted' }), 'stale_stage'); assert.equal(f.storage.dump(), before);
});
test('same-stage drop returns a detached contact without new events, tasks or writes', () => {
  const f = fixture(), before = f.storage.dump(), rev = f.rev(), writes = f.storage.writes;
  const result = f.move('new', { nextAction: 'No duplicate task', nextActionAt: '2026-10-10T10:00:00Z' });
  const value = good(result); value.name = 'Detached'; assert.equal(f.storage.dump(), before); assert.equal(f.rev(), rev); assert.equal(f.storage.writes, writes); assert.equal(result.revision, rev);
});
test('repeated transition with the current revision is a no-op and does not duplicate follow-up', () => {
  const f = fixture(), details = { reason: 'Seguimiento', nextAction: 'Volver a llamar', nextActionAt: '2026-10-10T10:00:00Z' }, stale = f.rev();
  good(f.move('contacted', details)); const before = f.storage.dump();
  good(f.move('contacted', details)); bad(f.move('contacted', details, stale), 'stale_revision');
  assert.equal(f.storage.dump(), before); assert.equal(f.store.listTasks().length, 1); assert.equal(f.store.listActivities().length, 1);
});
test('negative stages require a nonempty reason and preserve it on a same-stage drop', () => {
  const f = fixture();
  for (const stage of ['no_response', 'not_interested']) {
    const before = f.storage.dump(); bad(f.move(stage), 'invalid_input'); bad(f.move(stage, { reason: '   ' }), 'invalid_input'); assert.equal(f.storage.dump(), before);
    good(f.move(stage, { reason: 'Motivo ficticio' })); const committed = f.storage.dump(); good(f.move(stage)); assert.equal(f.storage.dump(), committed);
  }
});
test('an explicit reason correction retains its audit without duplicating an identical edit', () => {
  const f = fixture(); good(f.move('not_interested', { reason: 'Motivo inicial' }));
  good(f.move('not_interested', { reason: 'Motivo corregido' })); const before = f.storage.dump();
  assert.equal(f.store.getContact(f.contact.id).stageReason, 'Motivo corregido'); assert.equal(f.store.listActivities().length, 2);
  good(f.move('not_interested', { reason: 'Motivo corregido' })); assert.equal(f.storage.dump(), before);
});
test('moving back to an active commercial stage clears an old closure reason', () => {
  const f = fixture(); good(f.move('not_interested', { reason: 'Sin interés actual' })); good(f.move('interested'));
  assert.equal(f.store.getContact(f.contact.id).stageReason, null);
});
test('a next action with date creates exactly one linked task in the stage transaction', () => {
  const f = fixture(), before = f.rev(), writes = f.storage.writes;
  good(f.move('no_response', { reason: 'No respondió', nextAction: 'Reintentar llamada', nextActionAt: '2026-10-10T11:00:00-06:00' }));
  const task = f.store.listTasks()[0], activity = f.store.listActivities()[0];
  assert.equal(f.rev(), before + 1); assert.equal(f.storage.writes, writes + 1); assert.equal(task.contactId, f.contact.id); assert.equal(task.createdBy, 'kam_one');
  assert.equal(task.title, 'Reintentar llamada'); assert.equal(task.dueAt, '2026-10-10T17:00:00.000Z'); assert.equal(activity.nextActionTaskId, task.id);
  assert.equal(activity.nextAction, task.title); assert.equal(activity.nextActionAt, task.dueAt);
  const transition = Object.values(f.store.snapshot().events).find(e => e.type === 'contact_stage_changed'); assert.equal(transition.nextActionTaskId, task.id);
});
test('next action without a date is retained in history and creates no task', () => {
  const f = fixture(); good(f.move('contacted', { nextAction: 'Pedir disponibilidad' }));
  assert.equal(f.store.listActivities()[0].nextAction, 'Pedir disponibilidad'); assert.equal(f.store.listTasks().length, 0);
});
test('invalid follow-up data rolls the entire commercial transition back', () => {
  const f = fixture(), before = f.storage.dump();
  bad(f.move('contacted', { nextActionAt: '2026-10-10' }), 'invalid_task');
  bad(f.move('contacted', { nextAction: 'Call', nextActionAt: 'invalid' }), 'invalid_date');
  bad(f.move('contacted', { nextAction: 'x'.repeat(301) }), 'invalid_input');
  bad(f.move('contacted', { reason: 'x'.repeat(2001) }), 'invalid_input'); assert.equal(f.storage.dump(), before);
});
test('unknown sidecar fields cannot turn a commercial move into an owner or submission edit', () => {
  const f = fixture(), before = f.storage.dump();
  for (const details of [{ assignedKam: 'kam_other' }, { submittedAt: f.now() }, { actorId: 'spoof' }, { approved: true }, []]) bad(f.move('contacted', details), 'protected_field');
  assert.equal(f.storage.dump(), before);
});
test('storage failure leaves contact, task, activity, event and revision byte-identical', () => {
  const f = fixture(), before = f.storage.dump(); f.storage.failWrite = true;
  bad(f.move('contacted', { nextAction: 'Call', nextActionAt: '2026-10-10' }), 'storage_write_failed'); assert.equal(f.storage.dump(), before);
  f.storage.failWrite = false; good(f.move('contacted', { nextAction: 'Call', nextActionAt: '2026-10-10' })); assert.equal(f.store.listTasks().length, 1);
});
test('same-revision concurrent storage changes win over a stale commercial transaction', () => {
  const f = fixture(); let concurrent;
  const store = f.make('kam_one', 'kam', { now() {
    const state = JSON.parse(f.storage.getItem(API.STORAGE_KEY)); state.contacts[f.contact.id].notes = 'Changed by another view';
    concurrent = JSON.stringify(state); f.storage.setItem(API.STORAGE_KEY, concurrent); return f.now();
  } });
  bad(store.moveCommercialStage(f.contact.id, 'contacted', {}, f.rev()), 'stale_revision');
  assert.equal(f.storage.getItem(API.STORAGE_KEY), concurrent); assert.equal(f.store.getContact(f.contact.id).stage, 'new'); assert.equal(f.store.listActivities().length, 0);
});
test('archived contacts cannot move or receive stage history', () => {
  const f = fixture(); good(f.store.deleteContact(f.contact.id, 'Archivo ficticio', f.rev())); const before = f.storage.dump();
  bad(f.move('contacted'), 'contact_not_found'); assert.equal(f.storage.dump(), before);
});
test('legacy setStage shares the atomic follow-up path and revision overload', () => {
  const f = fixture(); good(f.store.setStage(f.contact.id, 'contacted', f.rev()));
  good(f.store.setStage(f.contact.id, 'interested', { nextAction: 'Call', nextActionAt: '2026-10-10' }, f.rev())); assert.equal(f.store.listTasks().length, 1);
});
test('capture-stage cards do not count as real onboarding or submission', () => {
  for (const type of ['patient', 'doctor']) {
    const f = fixture(type), stage = type === 'patient' ? 'application_started' : 'registration_started'; good(f.move(stage));
    const report = f.store.dashboard(); assert.equal(report.counts.onboardingStarted, 0); assert.equal(report.counts.submitted, 0); assert.equal(report.counts.activities, 0);
    assert.equal(report.byStage[type][stage], 1); assert.deepEqual(f.store.snapshot().expedients, {});
  }
});
test('only genuine expediente creation counts a start and reusing it adds no event', () => {
  const f = fixture(), api = Assisted.createAssisted({ store: f.store, actor: f.store.actor, now: f.now });
  good(f.move('application_started')); good(api.beginDraft({ contactId: f.contact.id }, f.rev())); assert.equal(f.store.dashboard().counts.onboardingStarted, 1);
  const before = f.storage.dump(); good(api.beginDraft({ contactId: f.contact.id }, f.rev())); assert.equal(f.storage.dump(), before);
});
test('fabricated or replayed onboarding events cannot inflate a later reporting month', () => {
  const f = fixture(), api = Assisted.createAssisted({ store: f.store, actor: f.store.actor, now: f.now });
  bad(f.store.transact(f.rev(), (d, ctx) => ctx.append('events', { type: 'assisted_draft_created', contactId: f.contact.id, expedientId: 'exp_fake' })), 'invalid_event');
  const exp = good(api.beginDraft({ contactId: f.contact.id }, f.rev())); f.setTime('2026-11-01T00:00:00.000Z'); const before = f.storage.dump();
  bad(f.store.transact(f.rev(), (d, ctx) => ctx.append('events', { type: 'onboarding_started', contactId: f.contact.id, expedientId: exp.id })), 'invalid_event');
  assert.equal(f.storage.dump(), before); assert.equal(f.store.dashboard().counts.onboardingStarted, 0); assert.equal(f.store.dashboard({ year: 2026, month: 10 }).counts.onboardingStarted, 1);
});
test('genuine patient and provider holder submissions still set submitted and count once', () => {
  for (const type of ['patient', 'doctor']) {
    const f = fixture(type), submitted = completeSubmission(f);
    assert.equal(f.store.getContact(f.contact.id).stage, 'submitted'); assert.equal(f.store.dashboard().counts.submitted, 1); assert.equal(f.store.dashboard().counts.onboardingStarted, 1);
    const before = f.storage.dump(); bad(f.move('contacted' + (type === 'doctor' ? '_demo' : '')), 'stage_read_only'); bad(f.move('submitted'), 'invalid_stage');
    bad(f.store.transact(f.rev(), d => { d.contacts[f.contact.id].stage = 'new'; }), 'stage_read_only'); assert.equal(f.storage.dump(), before); assert.deepEqual(f.store.snapshot().expedients[submitted.exp.id].submissionSnapshot, submitted.exp.submissionSnapshot);
    assert.equal(submitted.holder.submit(submitted.exp.id, f.rev()).ok, false); assert.equal(f.store.dashboard().counts.submitted, 1);
  }
});
test('submissions are reported by genuine event month, independent of later commercial tasks', () => {
  const f = fixture(); completeSubmission(f); f.setTime('2026-11-02T10:00:00.000Z');
  good(f.store.createTask({ contactId: f.contact.id, title: 'Seguimiento de revisión', dueAt: '2026-11-03T10:00:00Z' }, f.rev()));
  assert.equal(f.store.dashboard().counts.submitted, 0); assert.equal(f.store.dashboard({ year: 2026, month: 10 }).counts.submitted, 1);
  assert.equal(f.store.dashboard().byStage.patient.submitted, 1);
});
console.log('PASS: ' + passed + ' commercial pipeline store tests.');
