'use strict';
// Independent, fixture-driven integration of the shipped CRM store, assisted
// registration and backoffice projection modules. No browser, network or server
// is launched; the only persistence is an isolated in-memory demo disk.
const assert = require('node:assert/strict');
const Store = require('../assets/js/crm-demo-store.js');
const Assisted = require('../assets/js/crm-assisted.js');
const Office = require('../assets/js/crm-demo-office.js');

const copy = value => JSON.parse(JSON.stringify(value));
const cases = [];
const test = (name, run) => cases.push({ name, run });
const good = result => { assert.equal(result.ok, true, result.error); return result.value; };
const denied = (result, code) => {
  assert.equal(result.ok, false, 'Expected the domain operation to be refused');
  if (code) assert.equal(result.code, code, result.error);
  return result;
};
const emptyChoices = () => ({ expedientId: [], creditId: [], providerId: [], requestId: [], registrationId: [] });
function disk() {
  const values = new Map();
  return {
    failWrite: false,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { if (this.failWrite) throw Error('QuotaExceededError'); values.set(key, String(value)); },
    dump() { return JSON.stringify([...values]); }
  };
}
function fixture(kind = 'patient', options = {}) {
  const storage = disk();
  let instant = '2026-10-09T05:00:00.000Z', sequence = 0;
  const now = () => instant, randomId = prefix => prefix + '_' + (++sequence);
  function make(id, role) {
    const actor = { id, role };
    let store;
    store = Store.createStore({
      storage, actor, now, randomId,
      validateExternalReference: (key, value, contact) => Office.validateExternalReference(storage, key, value, contact),
      getBackofficeStatus: contact => Office.operationalStatus(storage, contact, store)
    });
    return { store, api: Assisted.createAssisted({ store, actor, now, randomId }) };
  }
  const kam = make('kam_integration', 'kam'), admin = make('admin_integration', 'admin');
  const holder = make('holder_integration', 'holder'), foreignKam = make('kam_foreign', 'kam');
  const referral = options.referral ? good(kam.store.createReferral(kind, kam.store.snapshot().revision)) : null;
  const contact = good(kam.store.createContact({
    type: kind, name: 'Persona ficticia de integración', email: 'integration.' + kind + '@example.test',
    phone: '+52 55 0000 1001', originalSource: 'campaign', ...(referral ? { referralToken: referral.token } : {})
  }, kam.store.snapshot().revision));
  const h = {
    storage, now, kind, kam, admin, holder, foreignKam, contact, referral, make,
    revision() { return admin.store.snapshot().revision; },
    setTime(value) { instant = value; },
    currentContact() { return admin.store.snapshot().contacts[contact.id]; },
    currentExp() { return admin.store.snapshot().expedients[h.exp.id]; },
    status(target = kam.store) { return Office.operationalStatus(storage, contact.id, target); },
    choices(target = kam.store) { return Office.listReferenceChoices(storage, target, contact.id); },
    begin() {
      h.exp = good(kam.api.beginDraft({ contactId: contact.id, kind }, h.revision()));
      return h.exp;
    },
    invite() {
      h.invitation = good(kam.api.invite(h.exp.id, { email: contact.email, ttlMinutes: 60 }, h.revision()));
      return h.invitation;
    },
    claim() {
      const challenge = good(holder.api.requestDemoVerification({ token: h.invitation.token, email: contact.email, mode: 'new_account' }));
      const proof = good(holder.api.verifyDemoCode(challenge.challengeId, challenge.demoCode));
      good(holder.api.claim(h.invitation.token, { email: contact.email, proofToken: proof.proofToken }, h.revision()));
    },
    confirm() {
      const fields = kind === 'patient'
        ? { procedure: 'Procedimiento ficticio', requestedAmount: 42000, termMonths: 12, monthlyIncome: 18000, address: 'Domicilio ficticio', identityReference: 'INE-DEMO' }
        : { specialty: 'Especialidad ficticia', professionalLicense: 'DEMO-INTEGRATION', clinicName: 'Clínica ficticia', clinicAddress: 'Domicilio ficticio' };
      good(holder.api.editDraft(h.exp.id, { fields, documents: [{
        label: kind === 'patient' ? 'identity' : 'license', fileName: 'evidence-demo.pdf',
        evidenceId: 'integration_evidence', mimeType: 'application/pdf', size: 100, demo: true
      }] }, h.revision()));
      good(holder.api.holderAction(h.exp.id, 'otp', { confirmed: true, demo: true }, h.revision()));
      if (kind === 'patient') good(holder.api.holderAction(h.exp.id, 'buroConsent', { confirmed: true, demo: true }, h.revision()));
      good(holder.api.holderAction(h.exp.id, 'finalConfirmation', { confirmed: true, demo: true, capacity: 'holder', authorityConfirmed: true }, h.revision()));
    },
    submit() { return good(holder.api.submit(h.exp.id, h.revision())); },
    imported() {
      const baseline = Office.readDatabase(storage) || { patients: [], providers: [], audit: [] };
      const result = Office.prepareImport(baseline, h.currentExp(), 'reviewer.integration@example.test');
      if (!result.alreadyImported) storage.setItem(Office.BO_KEY, JSON.stringify(result.database));
      return result;
    },
    activity(reference, target = kam.store) {
      return target.addActivity({ contactId: contact.id, type: 'call', summary: 'Intento ficticio de seguimiento', outcome: 'no_response', ...reference }, h.revision());
    }
  };
  return h;
}
function submitted(kind = 'patient') {
  const h = fixture(kind);
  h.begin(); h.invite(); h.claim(); h.confirm(); h.submit();
  return h;
}
function assertSameBytes(h, before) { assert.equal(h.storage.dump(), before, 'A rejected/read-only operation changed persisted bytes'); }
function referenceIds(choices, key) { return choices[key].map(choice => choice.id); }
function assertNoExternalReferences(choices) {
  for (const key of ['creditId', 'requestId', 'providerId', 'registrationId']) assert.deepEqual(choices[key], [], key);
}
function rawArchive(h, target = h.admin.store, mutate) {
  return target.transact(h.revision(), (draft, ctx) => {
    const contact = draft.contacts[h.contact.id];
    contact.deletedAt = ctx.now; contact.updatedAt = ctx.now;
    ctx.append('audit', { action: 'contact_archived', contactId: contact.id, reason: 'Intento de archivo por transacción directa' });
    if (mutate) mutate(draft, ctx);
    return contact;
  });
}

for (const kind of ['patient', 'doctor']) test(kind + ': real holder flow distinguishes capture, confirmation, submission and imported review', () => {
  const h = fixture(kind), initialContact = copy(h.contact);
  let before = h.storage.dump();
  assert.equal(h.status(), 'Sin expediente');
  assert.deepEqual(h.choices(), emptyChoices());
  assertSameBytes(h, before);
  h.begin();
  assert.equal(h.status(), kind === 'patient' ? 'Borrador de solicitud' : 'Borrador de registro');
  assert.deepEqual(referenceIds(h.choices(), 'expedientId'), [h.exp.id]);
  h.invite(); assert.equal(h.status(), 'Invitación preparada · pendiente del titular');
  h.claim(); assert.equal(h.status(), 'En captura por el titular');
  h.confirm(); assert.equal(h.status(), 'Confirmado por el titular · pendiente de envío');
  const payload = h.submit().submissionSnapshot;
  assert.equal(h.status(), 'Enviado por el titular · pendiente de importar a backoffice');
  assert.equal(h.kam.store.operationalStatus(h.contact.id).readOnly, true);
  assertNoExternalReferences(h.choices());
  const crmBeforeImport = h.storage.getItem(Store.STORAGE_KEY), imported = h.imported();
  assert.equal(h.status(), kind === 'patient' ? 'en_evaluacion' : 'perfil_en_revision');
  assert.equal(h.storage.getItem(Store.STORAGE_KEY), crmBeforeImport, 'BO import must not rewrite CRM identity or attribution');
  assert.equal(imported.record.crmIntake.contactId, initialContact.id);
  assert.equal(imported.record.crmIntake.expedientId, h.exp.id);
  assert.equal(imported.record.crmIntake.accountId, h.holder.store.actor.id);
  assert.equal(imported.record.crmIntake.submissionId, payload.submissionId);
  assert.equal(imported.record.crmIntake.submittedAt, payload.submittedAt);
  assert.deepEqual(imported.record.crmIntake.provenance, payload.provenance);
  assert.equal(h.currentContact().originalSource, initialContact.originalSource);
  assert.equal(h.currentContact().assignedKam, initialContact.assignedKam);
  assert.deepEqual(h.currentExp().submissionSnapshot, payload);
  before = h.storage.dump();
  assert.equal(h.imported().alreadyImported, true);
  assertSameBytes(h, before);
  const keys = kind === 'patient' ? ['requestId', 'creditId'] : ['providerId', 'registrationId'];
  for (const key of keys) {
    assert.deepEqual(referenceIds(h.choices(), key), [imported.id]);
    assert.equal(good(h.activity({ [key]: imported.id }))[key], imported.id);
  }
  for (const choices of Object.values(h.choices())) for (const choice of choices) assert.deepEqual(Object.keys(choice).sort(), ['id', 'label']);
  assert.equal(Office.expedienteUrl(h.kam.store, h.contact.id, h.exp.id), 'backoffice.html#crm/' + kind + '/contacts/' + h.contact.id);
  assert.equal(kind === 'patient' ? imported.record.application.offerAccepted : imported.record.status === 'perfil_aprobado', false);
});

test('Patient import exposes only verified public offer fields and leaves the commercial submission unchanged', () => {
  const h = submitted(), imported = h.imported(), db = Office.readDatabase(h.storage), record = db.patients[0];
  record.application.offerReady = true;
  record.offer = { status: 'enviada', approvedAmount: 42000, termMonths: 12, monthlyPayment: 3800, secretMargin: 'PRIVATE-MARGIN' };
  record.notes = ['PRIVATE-NOTE'];
  h.storage.setItem(Office.BO_KEY, JSON.stringify(db));
  const before = h.storage.dump(), publicRecord = Office.readSubmittedRecord(h.storage, h.currentExp());
  assert.equal(publicRecord.id, imported.id);
  assert.equal(publicRecord.offer.approvedAmount, 42000);
  assert.doesNotMatch(JSON.stringify(publicRecord), /PRIVATE-MARGIN|PRIVATE-NOTE|secretMargin|incomeMonthly/);
  assert.equal(h.currentContact().stage, 'submitted');
  assert.equal(h.currentExp().holderActions.offerAcceptance, undefined);
  assertSameBytes(h, before);
});

for (const kind of ['patient', 'doctor']) test(kind + ': another KAM cannot read status, references, dossier route or write linked activity', () => {
  const h = submitted(kind), imported = h.imported(), before = h.storage.dump();
  assert.equal(h.status(h.foreignKam.store), 'Estado no disponible');
  assert.deepEqual(h.choices(h.foreignKam.store), emptyChoices());
  assert.equal(Office.expedienteUrl(h.foreignKam.store, h.contact.id, h.exp.id), null);
  assert.throws(() => h.foreignKam.store.operationalStatus(h.contact.id), /acceso/);
  assert.equal(h.foreignKam.api.getExpedient(h.exp.id).ok, false);
  denied(h.activity({ [kind === 'patient' ? 'creditId' : 'providerId']: imported.id }, h.foreignKam.store));
  assertSameBytes(h, before);
});

test('A selected reference is rechecked against current ownership after the contact is reassigned', () => {
  const h = submitted(), imported = h.imported();
  assert.deepEqual(referenceIds(h.choices(), 'creditId'), [imported.id]);
  good(h.admin.store.reassignContact(h.contact.id, h.foreignKam.store.actor.id, 'Transferencia ficticia de cartera', h.revision()));
  const before = h.storage.dump();
  assert.equal(h.status(h.kam.store), 'Estado no disponible');
  assert.deepEqual(h.choices(h.kam.store), emptyChoices());
  assert.equal(Office.expedienteUrl(h.kam.store, h.contact.id, h.exp.id), null);
  denied(h.activity({ creditId: imported.id }, h.kam.store), 'forbidden');
  assert.equal(h.status(h.foreignKam.store), 'en_evaluacion');
  assert.deepEqual(referenceIds(h.choices(h.foreignKam.store), 'creditId'), [imported.id]);
  assertSameBytes(h, before);
});

for (const kind of ['patient', 'doctor']) test(kind + ': copied contact ID with foreign holder and dossier reveals no BO status or reference', () => {
  const h = submitted(kind), imported = h.imported(), db = Office.readDatabase(h.storage);
  const collection = kind === 'patient' ? 'patients' : 'providers', record = db[collection][0];
  record.crmIntake.expedientId = 'foreign_expedient';
  record.crmIntake.accountId = 'foreign_holder';
  record[kind === 'patient' ? 'patientAccountId' : 'doctorAccountId'] = 'foreign_holder';
  if (kind === 'patient') {
    record.application.applicationStatus = 'FOREIGN-FINANCIAL-STATUS';
    record.application.offerReady = true;
    record.offer = { status: 'enviada', approvedAmount: 999999, termMonths: 12 };
  } else record.status = 'FOREIGN-PROVIDER-STATUS';
  h.storage.setItem(Office.BO_KEY, JSON.stringify(db));
  const before = h.storage.dump();
  assert.equal(h.status(), 'Requiere conciliación de identidades');
  assertNoExternalReferences(h.choices());
  assert.doesNotMatch(JSON.stringify(h.choices()), /FOREIGN-|999999|foreign_holder|foreign_expedient/);
  assert.equal(Office.readSubmittedRecord(h.storage, h.currentExp()), null);
  for (const key of kind === 'patient' ? ['requestId', 'creditId'] : ['providerId', 'registrationId']) denied(h.activity({ [key]: imported.id }), 'invalid_reference');
  assertSameBytes(h, before);
});

test('A copied contact ID cannot link foreign credit to an unclaimed draft through the activity write gate', () => {
  const h = fixture(); h.begin();
  const foreign = {
    id: 'APP-FOREIGN', patientAccountId: 'foreign_holder',
    patient: { fullName: 'Foreign fictitious person', email: 'foreign@example.test' },
    crmIntake: { contactId: h.contact.id, expedientId: 'foreign_expedient', accountId: 'foreign_holder', submissionId: 'foreign_submission', demo: true },
    application: { applicationStatus: 'FOREIGN-PRIVATE-STATUS' }
  };
  h.storage.setItem(Office.BO_KEY, JSON.stringify({ patients: [foreign], providers: [], audit: [] }));
  const before = h.storage.dump();
  assert.equal(h.status(), 'Requiere conciliación de identidades');
  assertNoExternalReferences(h.choices());
  for (const key of ['requestId', 'creditId']) denied(h.activity({ [key]: foreign.id }), 'invalid_reference');
  assertSameBytes(h, before);
});

test('A receipt belonging to another submission is not a selectable reference for a genuine holder submission', () => {
  for (const field of ['submissionId', 'submittedAt']) {
    const h = submitted(), imported = h.imported(), db = Office.readDatabase(h.storage);
    db.patients[0].crmIntake[field] = field === 'submissionId' ? 'other_submission' : '2026-10-08T05:00:00.000Z';
    h.storage.setItem(Office.BO_KEY, JSON.stringify(db));
    const before = h.storage.dump();
    assert.equal(h.status(), 'Requiere conciliación de identidades', field);
    assertNoExternalReferences(h.choices());
    denied(h.activity({ creditId: imported.id }), 'invalid_reference');
    assertSameBytes(h, before);
  }
});

for (const kind of ['patient', 'doctor']) test(kind + ': active and submitted dossiers cannot be archived through public or raw transactions', () => {
  const draft = fixture(kind); draft.begin();
  let before = draft.storage.dump();
  denied(draft.admin.store.deleteContact(draft.contact.id, 'Archivo inválido de captura activa', draft.revision()), 'open_expedient');
  denied(rawArchive(draft));
  assertSameBytes(draft, before);
  const h = submitted(kind), snapshot = copy(h.currentExp().submissionSnapshot);
  for (const imported of [false, true]) {
    if (imported) h.imported();
    before = h.storage.dump();
    denied(h.admin.store.deleteContact(h.contact.id, 'Archivo inválido de envío confirmado', h.revision()), 'open_expedient');
    denied(h.kam.store.deleteContact(h.contact.id, 'Archivo inválido por KAM', h.revision()), 'forbidden');
    denied(rawArchive(h));
    denied(rawArchive(h, h.kam.store));
    denied(rawArchive(h, h.admin.store, state => { delete state.expedients[h.exp.id]; }));
    assert.deepEqual(h.currentExp().submissionSnapshot, snapshot);
    assert.equal(h.currentContact().deletedAt, null);
    assertSameBytes(h, before);
  }
});

test('Archive and admin restore preserve referral identity, source, owner and prior audit without creating a dossier', () => {
  const h = fixture('patient', { referral: true });
  good(h.kam.store.setStage(h.contact.id, 'not_interested', { reason: 'Sin interés comercial por ahora' }, h.revision()));
  const original = copy(h.currentContact()), beforeMaps = h.admin.store.snapshot();
  assert.equal(original.deletedAt, null, 'A commercial refusal must not archive automatically');
  h.setTime('2026-10-09T05:05:00.000Z');
  const activeBytes = h.storage.dump();
  denied(h.kam.store.deleteContact(h.contact.id, 'Intento de archivo por KAM', h.revision()), 'forbidden');
  denied(rawArchive(h, h.kam.store), 'forbidden');
  assertSameBytes(h, activeBytes);
  good(h.admin.store.deleteContact(h.contact.id, 'Archivo manual del prospecto', h.revision()));
  assert.deepEqual(h.kam.store.listContacts(), []);
  assert.equal(h.admin.store.listArchivedContacts().length, 1);
  assert.equal(h.admin.store.getArchivedContact(h.contact.id).originalSource, 'kam_referral');
  assert.deepEqual(h.choices(), emptyChoices());
  const archivedBytes = h.storage.dump();
  denied(h.kam.store.restoreContact(h.contact.id, 'Intento de recuperación por KAM', h.revision()), 'forbidden');
  denied(h.admin.store.restoreContact(h.contact.id, '', h.revision()));
  assertSameBytes(h, archivedBytes);
  h.setTime('2026-10-09T05:10:00.000Z');
  good(h.admin.store.restoreContact(h.contact.id, 'Retomar el mismo prospecto', h.revision()));
  const restored = h.currentContact();
  for (const key of Object.keys(original).filter(key => !['updatedAt', 'deletedAt'].includes(key))) assert.deepEqual(restored[key], original[key], key);
  assert.equal(restored.id, h.contact.id);
  assert.equal(restored.referringKam, h.kam.store.actor.id);
  assert.equal(restored.deletedAt, null);
  assert.equal(h.status(), 'Sin expediente');
  assert.equal(h.kam.store.listContacts().length, 1);
  assert.deepEqual(h.admin.store.listArchivedContacts(), []);
  const after = h.admin.store.snapshot();
  for (const key of ['expedients', 'invitations', 'tasks', 'referrals', 'activities', 'events']) assert.deepEqual(after[key], beforeMaps[key], key);
  for (const [id, record] of Object.entries(beforeMaps.audit)) assert.deepEqual(after.audit[id], record);
  assert.deepEqual(h.admin.store.listAudit({ contactId: h.contact.id }).filter(record => ['contact_archived', 'contact_restored'].includes(record.action)).map(record => record.action).sort(), ['contact_archived', 'contact_restored']);
  const completedBytes = h.storage.dump();
  denied(h.admin.store.restoreContact(h.contact.id, 'No recuperar dos veces', h.revision()), 'archived_contact_not_found');
  assertSameBytes(h, completedBytes);
});

test('Restore rechecks a new backoffice identity conflict and refuses atomically', () => {
  const h = fixture();
  good(h.admin.store.deleteContact(h.contact.id, 'Prospecto archivado', h.revision()));
  h.storage.setItem(Office.BO_KEY, JSON.stringify({ patients: [{ id: 'APP-LATER', patientAccountId: 'holder_later', patient: { email: h.contact.email } }], providers: [], audit: [] }));
  const before = h.storage.dump();
  denied(h.admin.store.restoreContact(h.contact.id, 'Revisar si todavía es elegible', h.revision()), 'identity_reconciliation_required');
  assert.ok(h.admin.store.getArchivedContact(h.contact.id).deletedAt);
  assertSameBytes(h, before);
});

test('A raw restore with a forged audit cannot rewrite the archived identity, attribution or owner', () => {
  const h = fixture('patient', { referral: true });
  good(h.admin.store.deleteContact(h.contact.id, 'Archivo de prospecto referido', h.revision()));
  const before = h.storage.dump();
  for (const patch of [{ email: 'replacement@example.test' }, { originalSource: 'manual', referringKam: null }, { assignedKam: h.foreignKam.store.actor.id }]) {
    denied(h.admin.store.transact(h.revision(), (draft, ctx) => {
      const contact = draft.contacts[h.contact.id];
      Object.assign(contact, patch, { deletedAt: null, updatedAt: ctx.now });
      ctx.append('audit', { action: 'contact_restored', contactId: contact.id, reason: 'Intento de recuperación alterando identidad' });
      return contact;
    }));
    assertSameBytes(h, before);
  }
});

test('Admin identity review continues the exact prospect without granting holder identity or changing attribution', () => {
  const h = fixture('patient', { referral: true }), input = { type: h.kind, email: h.contact.email, phone: h.contact.phone };
  const before = h.admin.store.snapshot(), bytes = h.storage.dump();
  const report = h.admin.store.inspectIdentityReview(input);
  assert.equal(report.canContinue, true);
  assert.equal(report.continuationContactId, h.contact.id);
  assert.throws(() => h.kam.store.inspectIdentityReview(input), /administrador/);
  assertSameBytes(h, bytes);
  const resolved = good(h.admin.store.reviewIdentity(input, { status: 'resolved', contactId: h.contact.id, reason: 'Continuar la misma ficha existente' }, h.revision()));
  assert.equal(resolved.contactId, h.contact.id);
  const after = h.admin.store.snapshot();
  for (const key of ['contacts', 'expedients', 'invitations', 'referrals', 'tasks', 'activities', 'events']) assert.deepEqual(after[key], before[key], key);
  assert.equal(h.currentContact().holderId, null);
  assert.equal(h.currentContact().accountId, null);
  assert.equal(h.currentContact().originalSource, 'kam_referral');
  assert.equal(h.status(), 'Sin expediente');
  h.begin(); h.invite();
  const unverified = h.storage.dump();
  denied(h.holder.api.claim(h.invitation.token, { email: h.contact.email, proofToken: 'identity_review_is_not_verification' }, h.revision()), 'IDENTITY_REQUIRED');
  assertSameBytes(h, unverified);
  h.claim(); h.confirm(); h.submit();
  assert.equal(h.status(), 'Enviado por el titular · pendiente de importar a backoffice');
});

test('Archive and restore honor captured revisions and failed storage writes', () => {
  const h = fixture(), stale = h.revision();
  good(h.kam.store.updateContact(h.contact.id, { notes: 'Cambio posterior de otra vista' }, h.revision()));
  let before = h.storage.dump();
  denied(h.admin.store.deleteContact(h.contact.id, 'Intento con revisión antigua', stale), 'stale_revision');
  h.storage.failWrite = true;
  denied(h.admin.store.deleteContact(h.contact.id, 'Archivo que no se puede persistir', h.revision()), 'storage_write_failed');
  assertSameBytes(h, before);
  h.storage.failWrite = false;
  good(h.admin.store.deleteContact(h.contact.id, 'Archivo persistido', h.revision()));
  before = h.storage.dump(); h.storage.failWrite = true;
  denied(h.admin.store.restoreContact(h.contact.id, 'Recuperación que no se puede persistir', h.revision()), 'storage_write_failed');
  assertSameBytes(h, before);
  h.storage.failWrite = false;
  good(h.admin.store.restoreContact(h.contact.id, 'Recuperación persistida', h.revision()));
  assert.equal(h.currentContact().deletedAt, null);
});

let passed = 0;
for (const { name, run } of cases) {
  try { run(); passed++; console.log('PASS: ' + name); }
  catch (error) { process.exitCode = 1; console.error('FAIL: ' + name + '\n' + error.stack); }
}
console.log('Operational cross-module integration: ' + passed + '/' + cases.length + ' passed. No browser or production access exercised.');
