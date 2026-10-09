/* Pulzzo CRM DEMO: browser-local data and role simulation only.
 * One versioned JSON write is atomic in localStorage. Revision/raw-value guards detect
 * stale and reentrant writes; localStorage is not a cross-tab CAS or server security.
 * No network, financial mutation, approval decision, real message, or binary upload.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PulzzoCRMStore = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null, function (root) {
  'use strict';
  const STORAGE_KEY = 'pulzzo_crm_assisted_demo_v1';
  const VERSION = 1;
  const MAPS = ['contacts', 'expedients', 'invitations', 'referrals', 'tasks', 'activities', 'audit', 'events'];
  const IMMUTABLE_MAPS = ['activities', 'audit', 'events'];
  const STAGES = Object.freeze({
    patient: Object.freeze(['new', 'contacted', 'interested', 'application_started', 'submitted', 'no_response', 'not_interested']),
    doctor: Object.freeze(['new', 'contacted_demo', 'interested', 'registration_started', 'submitted', 'no_response', 'not_interested'])
  });
  const SOURCES = Object.freeze(['unknown', 'direct', 'organic', 'campaign', 'kam_referral', 'doctor_referral', 'manual', 'direct_unknown', 'referral']);
  const ACTIVITY_TYPES = Object.freeze(['call', 'whatsapp', 'email', 'meeting', 'note', 'stage_change', 'other']);
  const plain = value => !!value && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const normalizeEmail = value => String(value || '').trim().toLowerCase();
  function normalizePhone(value) {
    if (value && !/^[+\d\s().-]+$/.test(String(value))) fail('invalid_phone', 'El teléfono sólo admite dígitos, espacios, paréntesis, guiones y prefijo +.');
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    // Canonical Mexican numbers: local 10 digits, +52, and historical +521.
    if (digits.length === 13 && digits.startsWith('521')) digits = digits.slice(3);
    else if (digits.length === 12 && digits.startsWith('52')) digits = digits.slice(2);
    return digits;
  }
  function problem(code, message) { const e = new Error(message); e.code = code; return e; }
  function fail(code, message) { throw problem(code, message); }
  function text(value, max, required) {
    const out = String(value == null ? '' : value).trim();
    if ((required && !out) || out.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(out)) fail('invalid_input', 'Revisa los datos y su longitud.');
    return out;
  }
  function iso(value, label) {
    const date = value instanceof Date ? value : new Date(value);
    if (!value || !Number.isFinite(date.getTime())) fail('invalid_date', 'Revisa la fecha de ' + (label || 'registro') + '.');
    return date.toISOString();
  }
  function isId(value) { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,179}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value); }
  function validEmail(email) { return email === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254; }
  function initialState() { return { version: VERSION, revision: 0, demo: true, createdAt: null, updatedAt: null, contacts: {}, expedients: {}, invitations: {}, referrals: {}, tasks: {}, activities: {}, audit: {}, events: {} }; }
  function assertState(state) {
    if (!plain(state) || state.version !== VERSION) fail('unsupported_version', 'La versión de los datos CRM no es compatible. No se modificó el registro.');
    if (!Number.isSafeInteger(state.revision) || state.revision < 0 || MAPS.some(key => !plain(state[key]))) fail('invalid_storage', 'Los datos CRM no se pueden validar. No se modificó el registro.');
    for (const key of MAPS) for (const [id, record] of Object.entries(state[key])) if (!isId(id) || !plain(record) || record.id !== id) fail('invalid_storage', 'Un identificador CRM no coincide con su registro.');
    return state;
  }
  function randomPart() {
    if (root && root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    if (root && root.crypto && typeof root.crypto.getRandomValues === 'function') { const a = new Uint32Array(4); root.crypto.getRandomValues(a); return Array.from(a, n => n.toString(16).padStart(8, '0')).join(''); }
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
  // Read-only identity collision check. Never imports, updates or grants access to
  // the legacy portals, their account directory or any financial record.
  function findLegacyIdentity(storage, input) {
    input = input || {};
    const mail = normalizeEmail(input.email), phone = normalizePhone(input.phone), matches = [];
    function readKey(key) { let raw; try { raw = storage.getItem(key); } catch (_) { fail('identity_lookup_failed', 'No se pudo comprobar el directorio de identidades existente.'); } if (!raw) return null; try { return JSON.parse(raw); } catch (_) { fail('identity_lookup_failed', 'Un registro previo no se puede leer; concilia la identidad antes de continuar.'); } }
    function inspect(row, type, source, accountId) {
      if (!plain(row)) return;
      const emails = [row.email, row.correo, row.patient && row.patient.email, row.profile && row.profile.email, row.crmIntake && row.crmIntake.email].filter(Boolean).map(normalizeEmail);
      const phones = [row.phone, row.celular, row.patient && row.patient.phone, row.profile && row.profile.phone, row.contact && row.contact.registered].filter(Boolean).map(v => { try { return normalizePhone(v); } catch (_) { return ''; } });
      const id = accountId || row.patientAccountId || row.doctorAccountId || row.accountId || row.crmIntake && row.crmIntake.accountId || null;
      if (!(mail && emails.includes(mail)) && !(phone && phones.includes(phone)) && !(input.accountId && id === input.accountId)) return;
      matches.push({ type, source, accountId: id, recordId: row.id || null, matchedBy: mail && emails.includes(mail) ? 'email' : phone && phones.includes(phone) ? 'phone' : 'accountId', identityMismatch: !!(input.accountId && id === input.accountId && mail && emails.length && !emails.includes(mail)) });
    }
    inspect(readKey('pulzzo_patient'), 'patient', 'pulzzo_patient');
    inspect(readKey('pulzzo_doctor'), 'doctor', 'pulzzo_doctor');
    const registry = readKey('pulzzo_demo_accounts_v1');
    if (registry) for (const type of ['patient', 'doctor']) for (const [id, row] of Object.entries(registry[type] || {})) inspect(row, type, 'pulzzo_demo_accounts_v1', id);
    const db = readKey('pulzzo_backoffice_demo');
    if (db) { for (const row of Array.isArray(db.patients) ? db.patients : []) inspect(row, 'patient', 'pulzzo_backoffice_demo'); for (const row of Array.isArray(db.providers) ? db.providers : []) inspect(row, 'doctor', 'pulzzo_backoffice_demo'); }
    const accountIds = [...new Set(matches.map(m => m.accountId).filter(Boolean))];
    return { matches, existingAccountId: accountIds.length === 1 ? accountIds[0] : null, requiresReconciliation: matches.some(m => !m.accountId || m.identityMismatch || input.type && m.type !== input.type) || accountIds.length > 1 };
  }
  function createStore(options) {
    options = options || {};
    let storage = options.storage;
    if (!storage && root) { try { storage = root.localStorage; } catch (_) {} }
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') fail('storage_unavailable', 'El almacenamiento local no está disponible.');
    const actor = Object.freeze(clone(options.actor || {}));
    if (!isId(actor.id) || !['kam', 'admin', 'holder'].includes(actor.role)) fail('invalid_actor', 'Selecciona una identidad DEMO válida.');
    const getNow = () => iso(typeof options.now === 'function' ? options.now() : options.now || new Date(), 'registro');
    const randomId = typeof options.randomId === 'function' ? options.randomId : randomPart;
    let running = false;
    function read() {
      let raw;
      try { raw = storage.getItem(STORAGE_KEY); } catch (_) { fail('storage_unavailable', 'No se pudo leer el almacenamiento local. Tus cambios no se guardaron.'); }
      if (raw === null || raw === undefined || raw === '') return { raw: raw == null ? null : raw, state: initialState() };
      let state;
      try { state = JSON.parse(raw); } catch (_) { fail('invalid_storage', 'Los datos CRM están dañados. No se sobrescribieron.'); }
      return { raw, state: assertState(state) };
    }
    function project(state, input) {
      if (actor.role === 'admin') return clone(state);
      const result = clone(state), allowed = new Set(Object.values(state.contacts).filter(c => canAccess(c)).map(c => c.id));
      let tokenInvitation = null, tokenExpedient = null;
      if (actor.role === 'holder' && input && input.invitationToken) {
        const invitation = Object.values(state.invitations).find(i => i.token === input.invitationToken);
        tokenInvitation = invitation;
        const exp = invitation && state.expedients[invitation.expedientId];
        if (exp && invitation.status === 'pending' && invitation.expiresAt > getNow() && exp.activeInvitationId === invitation.id && !exp.holderIdentity) tokenExpedient = { id: exp.id, contactId: exp.contactId, kind: exp.kind, activeInvitationId: exp.activeInvitationId, holderIdentity: null };
      }
      for (const key of MAPS) result[key] = Object.fromEntries(Object.entries(state[key]).filter(([, record]) => key === 'contacts' ? allowed.has(record.id) : key === 'referrals' ? actor.role === 'kam' && record.kamId === actor.id : allowed.has(record.contactId)).map(([id, record]) => [id, clone(record)]));
      // A presented expired/revoked token can report its state, without exposing its dossier.
      if (tokenInvitation) result.invitations[tokenInvitation.id] = clone(tokenInvitation);
      if (tokenExpedient && !result.expedients[tokenExpedient.id]) result.expedients[tokenExpedient.id] = tokenExpedient;
      return result;
    }
    function snapshot(input) { return project(read().state, input); }
    function inspectIdentity(input) {
      const report = findLegacyIdentity(storage, input), state = read().state, mail = normalizeEmail(input && input.email), phone = normalizePhone(input && input.phone);
      for (const c of Object.values(state.contacts)) if (mail && c.email === mail || phone && c.phone === phone) report.matches.push({ type: c.type, source: STORAGE_KEY, accountId: c.accountId || c.holderId || null, contactId: canAccess(c) ? c.id : null, matchedBy: mail && c.email === mail ? 'email' : 'phone' });
      const ids = [...new Set(report.matches.map(m => m.accountId).filter(Boolean))];
      report.existingAccountId = ids.length === 1 ? ids[0] : null;
      report.requiresReconciliation = report.requiresReconciliation || ids.length > 1 || report.matches.some(m => input.type && m.type !== input.type);
      return clone(report);
    }
    function canAccess(contact) {
      return !!contact && !contact.deletedAt && (actor.role === 'admin' || actor.role === 'kam' && contact.assignedKam === actor.id || actor.role === 'holder' && contact.holderId === actor.id && (!contact.accountId || contact.accountId === actor.id));
    }
    function requireContact(state, id) {
      const contact = state.contacts[id];
      if (!contact || contact.deletedAt) fail('contact_not_found', 'No se encontró el contacto activo.');
      if (!canAccess(contact)) fail('forbidden', 'Esta identidad DEMO no tiene acceso al contacto.');
      return contact;
    }
    function requireStaff() { if (!['kam', 'admin'].includes(actor.role)) fail('forbidden', 'Esta acción corresponde a un KAM o administrador DEMO.'); }
    function uniqueId(prefix, draft) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const id = text(prefix || 'id', 25, true) + '_' + String(randomId(prefix)).replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 145);
        if (isId(id) && !MAPS.some(key => has(draft[key], id))) return id;
      }
      fail('id_collision', 'No se pudo generar un identificador único. No se guardó el registro.');
    }
    function referralFor(state, token, type) {
      const record = Object.values(state.referrals).find(r => r.token === token && r.active !== false);
      if (!record || record.type !== type) fail('invalid_referral', 'El enlace de referido no es válido para este tipo de registro DEMO.');
      return record;
    }
    function makeContact(input, draft, ctx) {
      input = input || {};
      const type = input.type || input.kind;
      if (!STAGES[type]) fail('invalid_type', 'Selecciona paciente o doctor.');
      const email = normalizeEmail(input.email), phone = normalizePhone(input.phone);
      if (!validEmail(email) || phone && !/^\d{7,15}$/.test(phone) || !email && !phone) fail('invalid_contact', 'Incluye un correo válido o un teléfono de 7 a 15 dígitos.');
      let originalSource = input.originalSource || (actor.role === 'holder' ? 'unknown' : 'manual');
      let referringKam = null;
      if (input.referralToken) { const ref = referralFor(draft, input.referralToken, type); originalSource = 'kam_referral'; referringKam = ref.kamId; }
      else if (['referral', 'kam_referral'].includes(originalSource) || input.referringKam) fail('invalid_referral', 'El origen referido requiere un token DEMO válido.');
      if (!SOURCES.includes(originalSource)) fail('invalid_source', 'El origen del contacto no es válido.');
      const legacy = findLegacyIdentity(storage, { type, email, phone, accountId: actor.role === 'holder' ? actor.id : null });
      if (legacy.matches.length) fail('existing_account_requires_login', 'Esta identidad ya existe en un portal o backoffice. Concilia el registro y usa el acceso explícito del titular; no se creó un duplicado.');
      const assignedKam = input.assignedKam || (actor.role === 'kam' ? actor.id : referringKam);
      if (assignedKam !== null && !isId(assignedKam)) fail('invalid_actor', 'La asignación KAM no es válida.');
      if (actor.role === 'kam' && assignedKam !== actor.id) fail('forbidden', 'Un KAM sólo puede crear contactos asignados a sí mismo.');
      return { id: ctx.id('ct'), type, name: text(input.name, 160, true), email, phone, stage: 'new', stageReason: null,
        originalSource, referringKam, assignedKam: assignedKam || null, assistingActors: actor.role === 'kam' ? [actor.id] : [],
        createdAt: ctx.now, updatedAt: ctx.now, createdBy: actor.id, deletedAt: null,
        holderId: null, accountId: null, accountExists: false, notes: text(input.notes || '', 6000, false) };
    }
    function append(draft, key, record, ctx) {
      if (!IMMUTABLE_MAPS.includes(key) || !plain(record)) fail('invalid_append', 'Selecciona un historial válido.');
      const id = ctx.id(key === 'activities' ? 'act' : key === 'audit' ? 'aud' : 'evt');
      const entry = Object.assign({}, clone(record), { id, actorId: actor.id, actorRole: actor.role, createdAt: ctx.now });
      draft[key][id] = entry;
      return entry;
    }
    function audit(draft, ctx, action, contactId, details) { return ctx.append('audit', Object.assign({ action, contactId: contactId || null }, details || {})); }
    function event(draft, ctx, type, contact, details) { return ctx.append('events', Object.assign({ type, contactId: contact ? contact.id : null, contactType: contact ? contact.type : null, kamId: contact ? contact.assignedKam : actor.role === 'kam' ? actor.id : null }, details || {})); }
    function sameWriteClaim(before, after, contactId, now) {
      const oldContact = before.contacts[contactId], newContact = after.contacts[contactId];
      if (!newContact || newContact.holderId !== actor.id || newContact.accountId !== actor.id || newContact.accountExists !== true) return false;
      if (oldContact && oldContact.accountId && oldContact.accountId !== actor.id) return false;
      return Object.values(after.invitations).some(inv => {
        const old = before.invitations[inv.id], oldExp = old && before.expedients[old.expedientId], exp = after.expedients[inv.expedientId];
        return old && old.status === 'pending' && inv.status === 'consumed' && inv.contactId === contactId && old.contactId === contactId &&
          inv.consumedBy === actor.id && (!inv.claimedBy || inv.claimedBy === actor.id) && iso(old.expiresAt) > now &&
          inv.consumedAt === now && oldExp && oldExp.activeInvitationId === old.id && exp && exp.contactId === contactId && exp.holderIdentity && exp.holderIdentity.id === actor.id &&
          normalizeEmail(exp.holderIdentity.email) === normalizeEmail(old.intendedEmail) && normalizeEmail(newContact.email) === normalizeEmail(old.intendedEmail) &&
          (!oldExp.holderIdentity || oldExp.holderIdentity.id === actor.id);
      });
    }
    function holderOwnsExp(exp, state) {
      const c = exp && state.contacts[exp.contactId];
      return !!c && c.holderId === actor.id && c.accountId === actor.id && exp.holderIdentity && exp.holderIdentity.id === actor.id;
    }
    function canonicalCorrection(exp) {
      if (typeof options.getCorrectionReview === 'function') return options.getCorrectionReview(clone(exp));
      let module = root && root.PulzzoCRMCorrections;
      if (!module && typeof require === 'function') { try { module = require('./crm-demo-corrections.js'); } catch (_) {} }
      if (!module || typeof module.readReview !== 'function') fail('review_unavailable', 'No se pudo comprobar la revisión canónica de backoffice.');
      return module.readReview(storage, clone(exp));
    }
    function canonicalDocumentCorrection(exp) {
      if (typeof options.getDocumentCorrectionReview === 'function') return options.getDocumentCorrectionReview(clone(exp));
      let module = root && root.PulzzoCRMCorrections;
      if (!module && typeof require === 'function') { try { module = require('./crm-demo-corrections.js'); } catch (_) {} }
      if (!module || typeof module.readDocumentReview !== 'function') fail('review_unavailable', 'No se pudo comprobar la revisión documental canónica de backoffice.');
      return module.readDocumentReview(storage, clone(exp));
    }
    function assertDocumentCorrections(old, record, ctx) {
      const keys = ['documentCorrectionReview', 'documentCorrectionDraft', 'documentCorrectionDrafts', 'documentCorrectionSubmission', 'documentCorrectionSubmissions', 'documentCorrectionReceipts', 'approvedDocuments'];
      if (!keys.some(key => !equal(old && old[key], record[key]))) return;
      const live = canonicalDocumentCorrection(old || record);
      if (!live || live.schema !== 'pulzzo.crm.document-correction.review.v1' || live.demo !== true || !record.submittedAt || live.expedientId !== record.id || live.contactId !== record.contactId || live.accountId !== record.holderIdentity.id || live.kind !== record.kind || !equal(live, record.documentCorrectionReview)) fail('document_review_mismatch', 'La observación documental debe coincidir exactamente con la revisión vigente de backoffice.');
      if (!isId(live.docId) || !isId(live.requestId) || !Number.isSafeInteger(live.version) || live.version < 1) fail('invalid_document_review', 'La observación requiere documento, solicitud y versión exactos.');
      const oldSubmissions = old && old.documentCorrectionSubmissions || {}, submissions = record.documentCorrectionSubmissions || {};
      const oldReceipts = old && old.documentCorrectionReceipts || {}, receipts = record.documentCorrectionReceipts || {};
      if (!plain(submissions) || !plain(receipts)) fail('invalid_document_history', 'El historial de documentos no es válido.');
      for (const [requestId, submission] of Object.entries(oldSubmissions)) if (!equal(submission, submissions[requestId])) fail('immutable_history', 'Un documento reenviado conserva su constancia original.');
      for (const [requestId, receipt] of Object.entries(oldReceipts)) if (!equal(receipt, receipts[requestId])) fail('immutable_history', 'Una respuesta documental recibida es inmutable.');
      if (!equal(old && old.approvedDocuments, record.approvedDocuments)) {
        const prior = old && old.approvedDocuments || [];
        const verified = Array.isArray(record.approvedDocuments) && record.approvedDocuments.every(doc => prior.some(d => equal(d, doc)) || (live.history || []).some(h => h.status === 'approved' && (equal(h.document, doc) || equal(Object.assign({}, h.document, { requestId: h.requestId, docId: h.docId }), doc))) || live.status === 'approved' && equal(live.activeDocument, doc));
        if (!verified || !equal(record.approvedDocuments, live.approvedDocuments || [])) fail('approval_read_only', 'Los documentos aprobados sólo pueden copiarse de aprobaciones canónicas de backoffice.');
      }
      function validDescriptor(descriptor, uploading) {
        if (!plain(descriptor) || Object.keys(descriptor).some(k => !['id', 'name', 'mimeType', 'size', 'uploadedAt', 'actorId', 'contactId', 'activityId', 'documentType'].includes(k)) || !isId(descriptor.id) || !isId(descriptor.actorId) || descriptor.contactId !== record.contactId || !['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(descriptor.mimeType) || !Number.isSafeInteger(descriptor.size) || descriptor.size <= 0 || descriptor.size > 5 * 1024 * 1024 || descriptor.activityId != null && !isId(descriptor.activityId)) fail('invalid_document_evidence', 'El documento requiere evidencia local válida del mismo contacto.');
        text(descriptor.name, 180, true);
        if (iso(descriptor.uploadedAt, 'carga') > ctx.now || uploading && descriptor.actorId !== actor.id) fail('invalid_audit_actor', 'La carga documental debe conservar su autor y fecha reales.');
        if (descriptor.id === (live.activeDocument && live.activeDocument.evidenceId)) fail('document_unchanged', 'Adjunta una nueva versión del documento observado.');
      }
      const draft = record.documentCorrectionDraft, previousDraft = old && old.documentCorrectionDraft;
      if (!equal(previousDraft, draft)) {
        if (!plain(draft) || draft.requestId !== live.requestId || draft.docId !== live.docId || draft.version !== live.version || draft.updatedAt !== ctx.now || draft.updatedBy !== actor.id || !Array.isArray(draft.versions)) fail('document_scope', 'Sólo puede prepararse el documento exacto y la versión observados.');
        const sameRequest = previousDraft && previousDraft.requestId === draft.requestId;
        if (oldSubmissions[draft.requestId]) fail('submission_locked', 'El documento reenviado está bloqueado mientras se revisa.');
        if (draft.descriptor !== null) {
          if (live.status !== 'requested' || live.financialLocked || record.holderActions.offerAcceptance || record.holderActions.contractSignature) fail('document_correction_locked', 'La revisión documental no permite editar este documento ahora.');
          validDescriptor(draft.descriptor, true);
        }
        const previousVersions = sameRequest ? previousDraft.versions || [] : [];
        if (!equal(previousVersions, draft.versions.slice(0, previousVersions.length))) fail('immutable_history', 'Las versiones de una carga documental son inmutables.');
        for (const version of draft.versions.slice(previousVersions.length)) {
          if (!plain(version) || version.actorId !== actor.id || version.actorRole !== actor.role || version.at !== ctx.now) fail('invalid_audit_actor', 'Cada versión documental conserva su actor y hora de captura.');
          validDescriptor(version.descriptor, true);
        }
        if (draft.descriptor !== null && (!draft.versions.length || !equal(draft.versions[draft.versions.length - 1].descriptor, draft.descriptor)) || draft.descriptor === null && draft.versions.length) fail('invalid_document_history', 'El documento preparado debe coincidir con su última versión.');
        if (sameRequest && previousDraft.descriptor && draft.descriptor === null) fail('immutable_history', 'No se elimina una versión documental ya capturada.');
      }
      for (const [requestId, submission] of Object.entries(submissions)) if (!has(oldSubmissions, requestId)) {
        const confirmation = submission && submission.holderConfirmation;
        if (actor.role !== 'holder' || record.holderIdentity.id !== actor.id || live.status !== 'requested' || live.financialLocked || record.holderActions.offerAcceptance || record.holderActions.contractSignature || requestId !== live.requestId || !draft || !draft.descriptor || draft.requestId !== requestId || draft.docId !== live.docId || !confirmation || confirmation.actorId !== actor.id || confirmation.actorRole !== 'holder' || confirmation.confirmed !== true || confirmation.demo !== true || confirmation.at !== ctx.now) fail('holder_action_required', 'Sólo el titular puede confirmar y reenviar el documento observado vigente.');
        if (record.kind === 'doctor' && (!['holder', 'authorized_representative'].includes(confirmation.capacity) || confirmation.authorityConfirmed !== true)) fail('holder_action_required', 'El reenvío documental del médico requiere facultades confirmadas.');
        validDescriptor(submission.descriptor, false);
        if (submission.schema !== 'pulzzo.crm.document-correction.submission.v1' || submission.demo !== true || submission.expedientId !== record.id || submission.contactId !== record.contactId || submission.accountId !== actor.id || submission.kind !== record.kind || submission.requestId !== requestId || submission.docId !== live.docId || submission.nonce !== live.nonce || submission.version !== live.version || submission.baselineFingerprint !== live.baselineFingerprint || submission.reviewFingerprint !== live.fingerprint || !equal(submission.descriptor, draft.descriptor)) fail('invalid_document_submission', 'El reenvío debe coincidir con el documento, titular y revisión exactos.');
        let module = root && root.PulzzoCRMCorrections;
        if (!module && typeof require === 'function') { try { module = require('./crm-demo-corrections.js'); } catch (_) {} }
        if (!module || typeof module.createDocumentSubmission !== 'function') fail('review_unavailable', 'No se pudo validar la constancia canónica del documento.');
        const canonical = module.createDocumentSubmission(clone(old || record), clone(submission.descriptor), clone(live)), submitted = clone(submission);
        delete submitted.holderConfirmation;
        if (!equal(canonical, submitted)) fail('invalid_document_submission', 'La huella y constancia del documento no coinciden con el envío canónico.');
      }
      if (!equal(old && old.documentCorrectionSubmission, record.documentCorrectionSubmission) && !Object.values(submissions).some(s => equal(s, record.documentCorrectionSubmission))) fail('invalid_document_submission', 'El reenvío actual requiere una constancia histórica exacta.');
      for (const [requestId, receipt] of Object.entries(receipts)) if (!has(oldReceipts, requestId)) {
        const candidates = [live.activeDocument, live.candidate, ...(live.history || []).filter(h => h.requestId === requestId).map(h => h.document)].filter(Boolean);
        if (requestId !== live.requestId || !['approved', 'rejected'].includes(live.status) || !plain(receipt) || receipt.requestId !== requestId || receipt.docId !== live.docId || receipt.status !== live.status || receipt.reviewFingerprint !== live.fingerprint || receipt.receivedAt !== ctx.now || receipt.receivedBy !== actor.id || !candidates.some(d => equal(d, receipt.document))) fail('document_receipt_mismatch', 'La respuesta del documento debe provenir de la revisión canónica exacta.');
      }
    }
    function assertAuthorization(before, after, ctx) {
      for (const [id, contact] of Object.entries(after.contacts)) {
        const old = before.contacts[id];
        if (equal(old, contact)) continue;
        if (actor.role === 'kam' && (old ? old.assignedKam !== actor.id : contact.assignedKam !== actor.id)) fail('forbidden', 'Un KAM sólo puede modificar sus contactos asignados.');
        if (actor.role === 'holder') {
          const claim = sameWriteClaim(before, after, id, ctx.now);
          const own = old && old.holderId === actor.id && old.accountId === actor.id;
          const selfService = !old && contact.holderId === actor.id && contact.accountId === actor.id && contact.accountExists === true && Object.values(after.expedients).some(e => e.contactId === id && holderOwnsExp(e, after));
          if (!claim && !own && !selfService) fail('forbidden', 'El titular no tiene acceso a este contacto.');
          if (old && ['assignedKam', 'deletedAt', 'type', 'originalSource', 'referringKam'].some(k => !equal(old[k], contact[k]))) fail('forbidden', 'El titular no puede cambiar la asignación o la atribución comercial.');
        }
        if (old && ['holderId', 'accountId', 'accountExists'].some(k => !equal(old[k], contact[k])) && !(actor.role === 'holder' && sameWriteClaim(before, after, id, ctx.now))) fail('identity_locked', 'La cuenta sólo se vincula con una invitación aceptada por su titular.');
        if (!old && actor.role !== 'holder' && (contact.holderId || contact.accountId || contact.accountExists)) fail('identity_locked', 'Un contacto CRM no concede acceso a una cuenta.');
      }
      for (const key of ['tasks', 'activities', 'expedients', 'invitations']) for (const [id, record] of Object.entries(after[key])) {
        const old = before[key][id];
        if (equal(old, record)) continue;
        const contact = after.contacts[record.contactId], previous = before.contacts[record.contactId];
        if (!contact || contact.deletedAt) fail('invalid_contact_reference', 'El registro requiere un contacto activo y exacto.');
        if (old && old.contactId !== record.contactId) fail('identity_locked', 'Un registro no puede trasladarse a otra identidad.');
        if (actor.role === 'kam' && (previous || contact).assignedKam !== actor.id) fail('forbidden', 'El expediente no está asignado a este KAM.');
        if (actor.role === 'holder') {
          if (key === 'tasks') fail('forbidden', 'Las tareas CRM corresponden al equipo KAM.');
          const claim = sameWriteClaim(before, after, record.contactId, ctx.now);
          if (!claim && !(contact.holderId === actor.id && contact.accountId === actor.id)) fail('forbidden', 'El titular no tiene acceso al expediente.');
          if (key === 'invitations' && !claim) fail('forbidden', 'El titular sólo puede aceptar su invitación vigente.');
        }
        if (key === 'expedients') {
          if (!['patient', 'doctor'].includes(record.kind) || record.kind !== contact.type || !['draft', 'invited', 'claimed', 'submitted', 'needs_correction'].includes(record.status)) fail('invalid_expedient', 'El tipo o estado del expediente no es válido.');
          if (old && ['id', 'contactId', 'kind', 'createdAt', 'createdBy'].some(k => !equal(old[k], record[k]))) fail('identity_locked', 'La identidad original del expediente es inmutable.');
          if (old && old.holderIdentity && !equal(old.holderIdentity, record.holderIdentity)) fail('identity_locked', 'La identidad reclamada del expediente es inmutable.');
          if (actor.role !== 'holder' && !equal(old && old.holderIdentity || null, record.holderIdentity || null)) fail('holder_action_required', 'Un KAM o administrador no puede reclamar la identidad del titular.');
          if (record.holderIdentity && (record.holderIdentity.id !== contact.holderId || record.holderIdentity.id !== contact.accountId || normalizeEmail(record.holderIdentity.email) !== contact.email || record.holderIdentity.demo !== true)) fail('identity_locked', 'La identidad del expediente no coincide con su cuenta y contacto.');
          if (actor.role !== 'holder' && !equal(old && old.holderActions || {}, record.holderActions || {})) fail('holder_action_required', 'Las autorizaciones, autenticación y firma corresponden personalmente al titular.');
          if (actor.role !== 'holder' && ['submittedAt', 'submissionRevision', 'submissionSnapshot', 'receivedOffer', 'offerAccepted', 'contractSigned'].some(k => !equal(old && old[k] || null, record[k] || null))) fail('holder_action_required', 'El equipo comercial no puede fabricar un envío, oferta aceptada o firma del titular.');
          if (actor.role !== 'holder' && record.status === 'submitted' && (!old || old.status !== 'submitted')) fail('holder_action_required', 'Sólo el titular puede confirmar el envío final.');
          if (old && old.submittedAt && (!equal(old.submissionSnapshot, record.submissionSnapshot) || old.submittedAt !== record.submittedAt || old.submissionRevision !== record.submissionRevision)) fail('submission_locked', 'La constancia del envío anterior es inmutable.');
          const oldActions = old && old.holderActions || {}, nextActions = record.holderActions || {};
          if (!plain(nextActions)) fail('invalid_holder_action', 'Las confirmaciones del titular no son válidas.');
          for (const [action, value] of Object.entries(oldActions)) if (!equal(value, nextActions[action])) fail('immutable_history', 'Las confirmaciones personales ya registradas son inmutables.');
          for (const [action, value] of Object.entries(nextActions)) if (!has(oldActions, action)) {
            if (actor.role !== 'holder' || !record.holderIdentity || record.holderIdentity.id !== actor.id || !['otp', 'buroConsent', 'offerAcceptance', 'contractSignature', 'finalConfirmation'].includes(action) || !plain(value) || value.actorId !== actor.id || value.actorRole !== 'holder' || value.at !== ctx.now || value.confirmed !== true || value.demo !== true) fail('holder_action_required', 'La confirmación debe realizarla personalmente el titular de este expediente DEMO.');
            if (action === 'buroConsent' && record.kind !== 'patient') fail('invalid_holder_action', 'Esta autorización corresponde al paciente.');
            if (['offerAcceptance', 'contractSignature'].includes(action)) {
              if (record.kind !== 'patient' || !record.submittedAt || !record.submissionSnapshot || !record.receivedOffer || !record.receivedOffer.offer || !record.receivedOffer.offerFingerprint || value.offerFingerprint !== record.receivedOffer.offerFingerprint) fail('offer_required', 'Primero recibe la oferta vigente del expediente enviado.');
              // Current BO contract readiness is checked by the assisted adapter;
              // receivedOffer is the immutable accepted quote, not a live BO status.
              if (action === 'contractSignature' && (!oldActions.offerAcceptance || oldActions.offerAcceptance.offerFingerprint !== value.offerFingerprint)) fail('contract_not_ready', 'El contrato requiere una oferta previamente aceptada.');
              if (action === 'contractSignature' && (!record.contractReadiness || record.contractReadiness.contractReady !== true || record.contractReadiness.offerFingerprint !== value.offerFingerprint || record.contractReadiness.checkedAt !== ctx.now)) fail('contract_not_ready', 'Vuelve a consultar la habilitación actual del contrato en backoffice.');
            }
            if (action === 'finalConfirmation' && (!nextActions.otp || record.kind === 'patient' && !nextActions.buroConsent || record.kind === 'doctor' && (!['holder', 'authorized_representative'].includes(value.capacity) || value.authorityConfirmed !== true))) fail('incomplete_confirmation', 'Faltan confirmaciones personales previas o facultades del representante.');
          }
          if (old && (old.submittedAt || oldActions.finalConfirmation || oldActions.offerAcceptance || oldActions.contractSignature) && ['fields', 'documents', 'fieldHistory'].some(k => !equal(old[k], record[k]))) fail('submission_locked', 'Los datos revisados, enviados o aceptados están bloqueados.');
          if (old && old.submittedAt && record.status !== old.status) fail('submission_locked', 'El envío no puede reiniciarse desde CRM.');
          if (oldActions.offerAcceptance && !equal(old.receivedOffer, record.receivedOffer)) fail('financial_locked', 'La oferta aceptada es inmutable.');
          if (!equal(old && old.receivedOffer || null, record.receivedOffer || null) && (actor.role !== 'holder' || !record.submittedAt || !record.submissionSnapshot)) fail('offer_required', 'Una oferta sólo puede recibirse tras el envío confirmado.');
          if (record.submittedAt && !(old && old.submittedAt)) {
            const receipt = record.submissionSnapshot;
            if (actor.role !== 'holder' || record.status !== 'submitted' || record.submittedAt !== ctx.now || record.submissionRevision !== before.revision + 1 || !receipt || receipt.schema !== 'pulzzo.crm.submission.v1' || receipt.demo !== true || receipt.expedientId !== id || receipt.contactId !== record.contactId || receipt.accountId !== actor.id || !nextActions.finalConfirmation || !nextActions.otp || record.kind === 'patient' && !nextActions.buroConsent || !equal(receipt.fields, record.fields) || !equal(receipt.documents, record.documents) || !equal(receipt.holderIdentity, record.holderIdentity) || !equal(receipt.holderActions, nextActions)) fail('invalid_submission', 'El envío requiere los datos revisados y las confirmaciones del titular exacto.');
          }
          for (const [field, history] of Object.entries(old && old.fieldHistory || {})) if (!Array.isArray(record.fieldHistory && record.fieldHistory[field]) || !equal(history, record.fieldHistory[field].slice(0, history.length))) fail('immutable_history', 'El historial de captura de cada campo es inmutable.');
          for (const [field, history] of Object.entries(record.fieldHistory || {})) {
            if (!Array.isArray(history)) fail('invalid_history', 'El historial de campos no es válido.');
            const previous = old && old.fieldHistory && old.fieldHistory[field] || [];
            for (const entry of history.slice(previous.length)) if (entry.actorId !== actor.id || entry.actorRole !== actor.role || entry.at !== ctx.now) fail('invalid_audit_actor', 'La autoría y hora del campo son de la sesión actual.');
            if (history.length && !equal(history[history.length - 1].value, record.fields[field])) fail('invalid_history', 'El valor debe coincidir con la última captura del campo.');
          }
          const oldCorrections = old && old.correctionSubmissions || {}, nextCorrections = record.correctionSubmissions || {};
          const correctionChanged = ['correctionReview', 'approvedFields', 'correctionDraft', 'correctionDrafts', 'correctionSubmission', 'correctionSubmissions'].some(k => !equal(old && old[k], record[k]));
          if (correctionChanged) {
            const live = canonicalCorrection(old || record);
            if (!live || !record.submittedAt || live.expedientId !== record.id || live.contactId !== record.contactId || live.accountId !== record.holderIdentity.id || !equal(live, record.correctionReview)) fail('review_mismatch', 'La revisión debe coincidir exactamente con el backoffice vigente.');
            if (!equal(old && old.approvedFields, record.approvedFields) && (live.status !== 'approved' || !equal(live.approvedFields || {}, record.approvedFields))) fail('approval_read_only', 'Los datos aprobados sólo se consultan desde una revisión aprobada en backoffice.');
          }
          for (const [requestId, submission] of Object.entries(oldCorrections)) if (!equal(submission, nextCorrections[requestId])) fail('immutable_history', 'Una corrección enviada conserva su constancia original.');
          for (const [requestId, submission] of Object.entries(nextCorrections)) if (!has(oldCorrections, requestId)) {
            const confirmation = submission.holderConfirmation;
            if (actor.role !== 'holder' || !record.submittedAt || !record.correctionDraft || record.correctionDraft.requestId !== requestId || !confirmation || confirmation.actorId !== actor.id || confirmation.actorRole !== 'holder' || confirmation.at !== ctx.now || confirmation.confirmed !== true || confirmation.demo !== true) fail('holder_action_required', 'Sólo el titular puede confirmar y enviar su corrección vigente.');
            if (record.kind === 'doctor' && (!['holder', 'authorized_representative'].includes(confirmation.capacity) || confirmation.authorityConfirmed !== true)) fail('holder_action_required', 'La corrección del médico requiere facultades confirmadas.');
          }
          if (!equal(old && old.correctionSubmission || null, record.correctionSubmission || null) && !Object.values(nextCorrections).some(s => equal(s, record.correctionSubmission))) fail('invalid_correction', 'La corrección actual debe tener una constancia histórica exacta.');
          if (record.correctionDraft && !equal(old && old.correctionDraft, record.correctionDraft)) {
            const correction = record.correctionDraft, review = record.correctionReview;
            if (!record.submittedAt || !review || !Array.isArray(review.allowedFields) || Object.keys(correction.fields || {}).some(k => !review.allowedFields.includes(k)) || (correction.documents || []).length) fail('correction_scope', 'Sólo pueden prepararse los campos expresamente observados en backoffice.');
            if (Object.keys(correction.fields || {}).length && (oldActions.offerAcceptance || oldActions.contractSignature)) fail('financial_locked', 'No se cambian datos revisados después de aceptar o firmar.');
            if (correction.updatedBy !== actor.id || correction.updatedAt !== ctx.now) fail('invalid_audit_actor', 'La corrección debe conservar su autor y hora reales.');
            const oldDraft = old && old.correctionDraft && old.correctionDraft.requestId === correction.requestId ? old.correctionDraft : null;
            if (oldDraft && oldCorrections[correction.requestId] && !equal(oldDraft, correction)) fail('submission_locked', 'La corrección enviada está bloqueada.');
            for (const [field, history] of Object.entries(oldDraft && oldDraft.fieldHistory || {})) if (!Array.isArray(correction.fieldHistory[field]) || !equal(history, correction.fieldHistory[field].slice(0, history.length))) fail('immutable_history', 'El historial de corrección es inmutable.');
            for (const [field, history] of Object.entries(correction.fieldHistory || {})) {
              const previous = oldDraft && oldDraft.fieldHistory[field] || [];
              if (!Array.isArray(history) || history.slice(previous.length).some(e => e.actorId !== actor.id || e.actorRole !== actor.role || e.at !== ctx.now) || history.length && !equal(history[history.length - 1].value, correction.fields[field])) fail('invalid_history', 'La corrección debe coincidir con su historial de captura.');
            }
          }
          for (const [draftKey, archiveKey] of [['correctionDraft', 'correctionDrafts'], ['documentCorrectionDraft', 'documentCorrectionDrafts']]) {
            const archive = record[archiveKey] || {}, oldArchive = old && old[archiveKey] || {};
            if (!plain(archive)) fail('invalid_history', 'El archivo de correcciones no es válido.');
            for (const [requestId, historical] of Object.entries(oldArchive)) if (!equal(historical, archive[requestId])) fail('immutable_history', 'Los borradores históricos de corrección son inmutables.');
            for (const [requestId, historical] of Object.entries(archive)) if (!has(oldArchive, requestId) && (!old || !old[draftKey] || old[draftKey].requestId !== requestId || !equal(old[draftKey], historical))) fail('invalid_history', 'Sólo puede archivarse una copia exacta del borrador anterior.');
          }
          assertDocumentCorrections(old, record, ctx);
        }
      }
      for (const [id, ref] of Object.entries(after.referrals)) {
        const old = before.referrals[id];
        if (equal(old, ref)) continue;
        if (actor.role === 'holder' || actor.role === 'kam' && ref.kamId !== actor.id) fail('forbidden', 'El enlace debe pertenecer al KAM que lo genera.');
      }
    }
    function assertInvariants(before, after, ctx) {
      assertState(after);
      if (after.revision !== before.revision || after.version !== before.version || after.demo !== true) fail('invalid_revision', 'La versión y la revisión las controla el almacenamiento CRM.');
      for (const key of MAPS) for (const [id, old] of Object.entries(before[key])) {
        const next = after[key][id];
        if (!next) fail('deletion_forbidden', 'Los registros se archivan; no se elimina su historial.');
        if (IMMUTABLE_MAPS.includes(key) && !equal(old, next)) fail('immutable_history', 'La actividad y la auditoría son inmutables.');
        if (next.id !== id) fail('identity_locked', 'Los identificadores son inmutables.');
      }
      const emails = {}, phones = {}, accounts = {};
      for (const [id, c] of Object.entries(after.contacts)) {
        const old = before.contacts[id];
        if (!STAGES[c.type] || !STAGES[c.type].includes(c.stage)) fail('invalid_stage', 'La etapa no corresponde al tipo de contacto. Las decisiones de aprobación son del backoffice.');
        if (!SOURCES.includes(c.originalSource) || ['referral', 'kam_referral'].includes(c.originalSource) && !isId(c.referringKam) || !['referral', 'kam_referral'].includes(c.originalSource) && c.referringKam != null) fail('invalid_source', 'La atribución original no es válida.');
        if (normalizeEmail(c.email) !== c.email || !validEmail(c.email) || normalizePhone(c.phone) !== c.phone || c.phone && !/^\d{7,15}$/.test(c.phone) || !c.email && !c.phone) fail('invalid_contact', 'El correo y teléfono deben estar normalizados.');
        text(c.name, 160, true); iso(c.createdAt); iso(c.updatedAt);
        if (!isId(c.createdBy) || c.assignedKam !== null && !isId(c.assignedKam) || !Array.isArray(c.assistingActors) || c.assistingActors.some(x => !isId(x)) || new Set(c.assistingActors).size !== c.assistingActors.length) fail('invalid_actor', 'Los participantes del contacto no son válidos.');
        if (!old && (c.createdBy !== actor.id || c.createdAt !== ctx.now || c.updatedAt !== ctx.now)) fail('invalid_audit_actor', 'La identidad y hora de creación provienen de la sesión actual.');
        if (['no_response', 'not_interested'].includes(c.stage)) text(c.stageReason, 2000, true);
        if (old) {
          for (const field of ['id', 'type', 'createdAt', 'createdBy', 'originalSource', 'referringKam']) if (!equal(old[field], c[field])) fail('immutable_attribution', 'La identidad y la atribución original no se sobrescriben.');
          if (old.assistingActors.some(x => !c.assistingActors.includes(x))) fail('immutable_history', 'No se eliminan participantes del historial.');
          const identityLocked = old.accountId || old.holderId || old.accountExists || Object.values(before.expedients).some(e => e.contactId === id && (e.holderIdentity || e.submittedAt || e.activeInvitationId));
          if (identityLocked && ['name', 'email', 'phone'].some(k => old[k] !== c[k])) fail('identity_locked', 'La identidad ya está vinculada a una cuenta o invitación. Requiere conciliación; no se sobrescribió.');
          if (old.assignedKam !== c.assignedKam) {
            if (actor.role !== 'admin') fail('forbidden', 'Sólo un administrador DEMO puede reasignar un contacto.');
            const tracked = Object.values(after.audit).some(a => !before.audit[a.id] && a.action === 'contact_reassigned' && a.contactId === id && a.from === old.assignedKam && a.to === c.assignedKam && text(a.reason, 2000, false));
            if (!tracked) fail('audit_required', 'La reasignación requiere motivo y auditoría.');
          }
          if (!old.deletedAt && c.deletedAt && !Object.values(after.audit).some(a => !before.audit[a.id] && a.action === 'contact_archived' && a.contactId === id && a.reason)) fail('audit_required', 'Archivar requiere motivo e historial.');
          if (old.deletedAt && !equal(old, c)) fail('archived_contact', 'El contacto archivado conserva su identidad y su historial.');
        }
        for (const [index, value] of [[emails, c.email], [phones, c.phone]]) {
          if (!value) continue;
          if (has(index, value) && index[value] !== id) {
            const other = after.contacts[index[value]];
            fail(other.type === c.type ? 'duplicate_contact' : 'identity_reconciliation_required', other.type === c.type ? 'Ya existe un contacto con ese correo o teléfono. No se creó ni se concedió acceso a otro registro.' : 'La identidad ya existe en otro tipo de registro. Requiere conciliación explícita.');
          }
          index[value] = id;
        }
        for (const accountId of new Set([c.accountId, c.holderId].filter(Boolean))) {
          if (!isId(accountId)) fail('invalid_account', 'La cuenta requiere un identificador estable válido.');
          if (has(accounts, accountId) && accounts[accountId] !== id) fail('duplicate_account', 'Esta cuenta ya está vinculada a otro contacto. Continúa el registro existente o solicita conciliación.');
          accounts[accountId] = id;
        }
      }
      for (const key of IMMUTABLE_MAPS) for (const [id, record] of Object.entries(after[key])) if (!before[key][id]) {
        if (record.actorId !== actor.id || record.actorRole !== actor.role || record.createdAt !== ctx.now) fail('invalid_audit_actor', 'El actor y la hora de captura provienen de la sesión DEMO.');
        if (record.contactId && !after.contacts[record.contactId]) fail('invalid_contact_reference', 'La actividad requiere un identificador de contacto exacto.');
        if (record.contactId && !canAccess(after.contacts[record.contactId]) && !(actor.role === 'admin' || actor.role === 'kam' && before.contacts[record.contactId] && before.contacts[record.contactId].assignedKam === actor.id && after.contacts[record.contactId].deletedAt)) fail('forbidden', 'El actor no puede agregar historial a otro contacto.');
        if (key === 'events') {
          if (['contact_created', 'self_service_created'].includes(record.type) && before.contacts[record.contactId]) fail('invalid_event', 'Un evento de alta requiere un contacto nuevo.');
          if (['holder_submitted', 'onboarding_submitted', 'expedient_submitted'].includes(record.type) && (actor.role !== 'holder' || !after.expedients[record.expedientId] || !after.expedients[record.expedientId].submittedAt || before.expedients[record.expedientId] && before.expedients[record.expedientId].submittedAt)) fail('invalid_event', 'Un envío debe corresponder a un envío real del titular.');
          if (record.type === 'activity_recorded' && (!after.activities[record.activityId] || before.activities[record.activityId] || after.activities[record.activityId].contactId !== record.contactId)) fail('invalid_event', 'El evento requiere una actividad nueva del mismo contacto.');
        }
      }
      for (const [id, task] of Object.entries(after.tasks)) {
        text(task.title, 300, true); iso(task.dueAt);
        if (!['open', 'closed'].includes(task.status)) fail('invalid_task', 'El estado de la tarea no es válido.');
        if (task.status === 'closed') { text(task.closeReason, 2000, true); iso(task.closedAt); }
        const old = before.tasks[id];
        if (old && (old.createdAt !== task.createdAt || old.createdBy !== task.createdBy || old.status === 'closed' && !equal(old, task))) fail('immutable_history', 'Una tarea cerrada y sus datos de creación son inmutables.');
      }
      for (const [id, ref] of Object.entries(after.referrals)) {
        if (!STAGES[ref.type] || !isId(ref.kamId) || !isId(ref.token)) fail('invalid_referral', 'El enlace DEMO no es válido.');
        const old = before.referrals[id];
        if (old && ['token', 'kamId', 'type', 'createdAt'].some(k => old[k] !== ref[k])) fail('immutable_attribution', 'Un enlace no puede cambiar de KAM ni de tipo.');
      }
      for (const [id, invitation] of Object.entries(after.invitations)) {
        const old = before.invitations[id], exp = after.expedients[invitation.expedientId];
        if (!exp || exp.contactId !== invitation.contactId || !['pending', 'consumed', 'revoked'].includes(invitation.status) || !isId(invitation.token) || normalizeEmail(invitation.intendedEmail) !== invitation.intendedEmail) fail('invalid_invitation', 'La invitación no coincide con su expediente.');
        iso(invitation.expiresAt);
        if (old && ['token', 'expedientId', 'contactId', 'intendedEmail', 'createdAt', 'createdBy', 'expiresAt'].some(k => old[k] !== invitation[k])) fail('immutable_invitation', 'La identidad y vigencia de una invitación son inmutables. Genera otra invitación.');
        if (old && old.status !== 'pending' && !equal(old, invitation)) fail('invitation_used', 'Una invitación utilizada o revocada no puede reabrirse.');
        if ((!old || old.status !== invitation.status) && invitation.status === 'consumed' && (actor.role !== 'holder' || !sameWriteClaim(before, after, invitation.contactId, ctx.now))) fail('invalid_claim', 'La invitación sólo puede consumirse con la identidad exacta del titular.');
      }
      assertAuthorization(before, after, ctx);
    }
    // Trusted, synchronous extension hook for the assisted-onboarding adapter.
    // Its callback receives the full clone to validate collisions and invitation
    // binding. Do not expose this callback boundary as production authorization.
    function transact(expectedRevision, fn) {
      let base;
      let entered = false;
      try {
        if (running) fail('transaction_busy', 'Hay otra operación CRM en curso.');
        base = read();
        if (!Number.isSafeInteger(expectedRevision)) fail('revision_required', 'Actualiza el registro antes de guardar.');
        if (expectedRevision !== base.state.revision) fail('stale_revision', 'Los datos cambiaron en otra vista. Actualiza antes de guardar; no se aplicaron tus cambios.');
        if (typeof fn !== 'function') fail('invalid_transaction', 'La operación CRM no es válida.');
        running = true; entered = true;
        const draft = clone(base.state), ctx = { actor, now: getNow() };
        const reservedIds = new Set();
        ctx.id = prefix => { for (let n = 0; n < 20; n++) { const id = uniqueId(prefix, draft); if (!reservedIds.has(id)) { reservedIds.add(id); return id; } } fail('id_collision', 'No se pudo generar un identificador nuevo.'); };
        ctx.append = (key, record) => append(draft, key, record, ctx);
        ctx.canAccessContact = id => canAccess(draft.contacts[id]);
        ctx.makeContact = input => makeContact(input, draft, ctx);
        const value = fn(draft, Object.freeze(ctx));
        if (value && typeof value.then === 'function') fail('async_transaction', 'La operación local debe ser síncrona.');
        assertInvariants(base.state, draft, ctx);
        // Compare the raw value, too: catches reentrant callbacks and same-revision edits.
        let current;
        try { current = storage.getItem(STORAGE_KEY); } catch (_) { fail('storage_unavailable', 'No se pudo comprobar el almacenamiento local.'); }
        if ((current == null ? null : current) !== base.raw) fail('stale_revision', 'Los datos cambiaron mientras se guardaban. Actualiza antes de continuar.');
        const safeValue = clone(value);
        if (equal(base.state, draft)) return { ok: true, value: safeValue, revision: draft.revision, state: project(draft) };
        draft.revision = base.state.revision + 1;
        draft.createdAt = base.state.createdAt || ctx.now;
        draft.updatedAt = ctx.now;
        const serialized = JSON.stringify(draft);
        try { storage.setItem(STORAGE_KEY, serialized); } catch (_) { fail('storage_write_failed', 'No se pudo guardar en este navegador (espacio o permisos). No se aplicaron los cambios.'); }
        return { ok: true, value: safeValue, revision: draft.revision, state: project(draft) };
      } catch (e) {
        let revision = base ? base.state.revision : null;
        try { revision = read().state.revision; } catch (_) {}
        return { ok: false, code: e.code || 'transaction_failed', error: e.message || 'No se pudo guardar la operación CRM.', revision };
      } finally { if (entered) running = false; }
    }
    function createContact(input, revision) {
      return transact(revision, (draft, ctx) => {
        requireStaff();
        const contact = ctx.makeContact(input);
        if (typeof options.findExistingAccount === 'function' && options.findExistingAccount(clone(contact))) fail('existing_account_requires_login', 'Ya existe una cuenta para esta identidad. Se requiere conciliación y acceso del titular.');
        draft.contacts[contact.id] = contact;
        audit(draft, ctx, 'contact_created', contact.id);
        event(draft, ctx, 'contact_created', contact);
        return contact;
      });
    }
    function updateContact(id, patch, revision) {
      return transact(revision, (draft, ctx) => {
        requireStaff();
        const contact = requireContact(draft, id), allowed = ['name', 'email', 'phone', 'notes'];
        if (!plain(patch) || Object.keys(patch).some(k => !allowed.includes(k))) fail('protected_field', 'Actualiza sólo nombre, correo, teléfono o notas.');
        const before = clone(contact);
        if (has(patch, 'name')) contact.name = text(patch.name, 160, true);
        if (has(patch, 'email')) contact.email = normalizeEmail(patch.email);
        if (has(patch, 'phone')) contact.phone = normalizePhone(patch.phone);
        if (has(patch, 'notes')) contact.notes = text(patch.notes, 6000, false);
        if (equal(before, contact)) return contact;
        contact.updatedAt = ctx.now;
        audit(draft, ctx, 'contact_updated', id, { changedFields: Object.keys(patch) });
        return contact;
      });
    }
    function setStage(id, stage, details, revision) {
      if (typeof details === 'number' && revision === undefined) { revision = details; details = {}; }
      details = details || {};
      return transact(revision, (draft, ctx) => {
        requireStaff(); const contact = requireContact(draft, id);
        if (!STAGES[contact.type].includes(stage)) fail('invalid_stage', 'La etapa no corresponde al tipo de contacto. La aprobación se consulta en backoffice.');
        const reason = text(details.reason || '', 2000, ['no_response', 'not_interested'].includes(stage));
        if (contact.stage === stage && (contact.stageReason || '') === reason) return contact;
        const from = contact.stage; contact.stage = stage; contact.stageReason = reason || null; contact.updatedAt = ctx.now;
        audit(draft, ctx, 'contact_stage_changed', id, { from, to: stage, reason });
        event(draft, ctx, 'contact_stage_changed', contact, { from, to: stage, reason });
        ctx.append('activities', { contactId: id, type: 'stage_change', summary: from + ' → ' + stage + (reason ? ': ' + reason : ''), contactAt: ctx.now, evidence: [] });
        return contact;
      });
    }
    function reassignContact(id, kamId, reason, revision) {
      return transact(revision, (draft, ctx) => {
        if (actor.role !== 'admin') fail('forbidden', 'Sólo un administrador DEMO puede reasignar contactos.');
        const contact = requireContact(draft, id); if (kamId !== null && !isId(kamId)) fail('invalid_actor', 'Selecciona un KAM válido.');
        const note = text(reason, 2000, true); if (contact.assignedKam === kamId) return contact;
        const from = contact.assignedKam; contact.assignedKam = kamId; contact.updatedAt = ctx.now;
        audit(draft, ctx, 'contact_reassigned', id, { from, to: kamId, reason: note });
        event(draft, ctx, 'contact_reassigned', contact, { from, to: kamId }); return contact;
      });
    }
    function deleteContact(id, reason, revision) {
      return transact(revision, (draft, ctx) => {
        requireStaff(); const contact = requireContact(draft, id), note = text(reason, 2000, true);
        if (Object.values(draft.tasks).some(t => t.contactId === id && t.status === 'open')) fail('open_tasks', 'Cierra las tareas pendientes antes de archivar el contacto.');
        if (Object.values(draft.expedients).some(e => e.contactId === id && !['submitted', 'cancelled'].includes(e.status))) fail('open_expedient', 'El contacto tiene un expediente activo; no se archivó.');
        contact.deletedAt = ctx.now; contact.updatedAt = ctx.now;
        audit(draft, ctx, 'contact_archived', id, { reason: note }); return contact;
      });
    }
    function createReferral(type, revision) {
      return transact(revision, (draft, ctx) => {
        requireStaff(); const kamId = plain(type) ? type.kamId : actor.id, kind = plain(type) ? type.type : type;
        if (!STAGES[kind] || !isId(kamId) || actor.role === 'kam' && kamId !== actor.id) fail('invalid_referral', 'Selecciona un KAM y tipo válidos.');
        const existing = Object.values(draft.referrals).find(r => r.kamId === kamId && r.type === kind && r.active !== false);
        if (existing) return existing;
        const ref = { id: ctx.id('ref'), token: ctx.id('r'), kamId, type: kind, active: true, createdAt: ctx.now, createdBy: actor.id, demo: true };
        draft.referrals[ref.id] = ref; audit(draft, ctx, 'referral_created', null, { referralId: ref.id, kamId, contactType: kind }); return ref;
      });
    }
    function resolveReferral(token, type) {
      try { const state = read().state; return { ok: true, value: clone(referralFor(state, token, type)), revision: state.revision }; }
      catch (e) { return { ok: false, code: e.code || 'invalid_referral', error: e.message }; }
    }
    function applyReferral(id, token, revision) {
      return transact(revision, (draft, ctx) => {
        const contact = requireContact(draft, id), ref = referralFor(draft, token, contact.type);
        const crossing = !['referral', 'kam_referral'].includes(contact.originalSource) || contact.referringKam !== ref.kamId;
        audit(draft, ctx, crossing ? 'referral_crossing_preserved' : 'referral_revisited', id, { referralId: ref.id, attemptedKam: ref.kamId, preservedSource: contact.originalSource, preservedReferringKam: contact.referringKam });
        return { contact, crossing, attributionPreserved: true };
      });
    }
    function createTask(input, revision) {
      return transact(revision, (draft, ctx) => {
        requireStaff(); const contact = requireContact(draft, input && input.contactId);
        const task = { id: ctx.id('task'), contactId: contact.id, title: text(input.title, 300, true), dueAt: iso(input.dueAt, 'próxima acción'), status: 'open', closeReason: null, createdAt: ctx.now, createdBy: actor.id, updatedAt: ctx.now, closedAt: null, closedBy: null };
        draft.tasks[task.id] = task; audit(draft, ctx, 'task_created', contact.id, { taskId: task.id }); event(draft, ctx, 'task_created', contact, { taskId: task.id }); return task;
      });
    }
    function updateTask(id, patch, revision) {
      return transact(revision, (draft, ctx) => {
        requireStaff(); const task = draft.tasks[id]; if (!task) fail('task_not_found', 'No se encontró la tarea.'); requireContact(draft, task.contactId);
        if (task.status !== 'open') fail('task_closed', 'La tarea ya está cerrada.');
        if (!plain(patch) || Object.keys(patch).some(k => !['title', 'dueAt'].includes(k))) fail('protected_field', 'Sólo puedes cambiar el título y vencimiento.');
        if (has(patch, 'title')) task.title = text(patch.title, 300, true);
        if (has(patch, 'dueAt')) task.dueAt = iso(patch.dueAt, 'próxima acción');
        task.updatedAt = ctx.now; audit(draft, ctx, 'task_updated', task.contactId, { taskId: id }); return task;
      });
    }
    function closeTask(id, reason, revision) {
      return transact(revision, (draft, ctx) => {
        requireStaff(); const task = draft.tasks[id]; if (!task) fail('task_not_found', 'No se encontró la tarea.'); const contact = requireContact(draft, task.contactId);
        if (task.status === 'closed') fail('task_closed', 'La tarea ya está cerrada; no se duplicó el cierre.');
        task.closeReason = text(reason, 2000, true); task.status = 'closed'; task.closedAt = ctx.now; task.closedBy = actor.id; task.updatedAt = ctx.now;
        audit(draft, ctx, 'task_closed', contact.id, { taskId: id, reason: task.closeReason }); event(draft, ctx, 'task_closed', contact, { taskId: id }); return task;
      });
    }
    function evidenceMetadata(items, contactId, ctx) {
      if (items == null) return [];
      if (!Array.isArray(items) || items.length > 20) fail('invalid_evidence', 'Usa como máximo 20 referencias de evidencia.');
      return items.map(item => {
        if (!plain(item) || Object.keys(item).some(k => !['id', 'name', 'fileName', 'mimeType', 'type', 'size', 'url', 'note', 'reference', 'actorId', 'contactId', 'activityId', 'uploadedAt', 'documentType', 'demo'].includes(k))) fail('invalid_evidence', 'La evidencia guarda referencias y metadatos, no el contenido de archivos.');
        const result = { name: text(item.name || item.fileName || item.reference, 260, true), mimeType: text(item.mimeType || item.type || '', 120, false), size: item.size == null ? null : Number(item.size) };
        if (result.size !== null && (!Number.isSafeInteger(result.size) || result.size < 0)) fail('invalid_evidence', 'El tamaño del archivo no es válido.');
        if (item.id) result.id = text(item.id, 180, true);
        if (item.reference) result.reference = text(item.reference, 1000, true);
        if (item.note) result.note = text(item.note, 2000, false);
        if (item.actorId && item.actorId !== actor.id || item.contactId && item.contactId !== contactId) fail('invalid_evidence', 'La evidencia pertenece a otro actor o contacto.');
        result.actorId = actor.id; result.contactId = contactId; result.uploadedAt = item.uploadedAt ? iso(item.uploadedAt, 'carga') : ctx.now;
        if (result.uploadedAt > ctx.now) fail('invalid_evidence', 'La fecha de carga no puede ser futura.');
        if (item.documentType) result.documentType = text(item.documentType, 100, false);
        if (item.activityId != null) { if (!isId(item.activityId)) fail('invalid_evidence', 'La referencia de actividad no es válida.'); result.activityId = item.activityId; } else result.activityId = null;
        result.demo = true;
        if (item.url) { const url = text(item.url, 2000, true); if (!/^https:\/\//i.test(url)) fail('invalid_evidence', 'Las referencias web deben utilizar HTTPS.'); result.url = url; }
        return result;
      });
    }
    function addActivity(input, revision) {
      return transact(revision, (draft, ctx) => {
        requireStaff(); input = input || {}; const contact = requireContact(draft, input.contactId);
        if (!ACTIVITY_TYPES.includes(input.type || 'note')) fail('invalid_activity', 'Selecciona un tipo de actividad válido.');
        const record = { contactId: contact.id, type: input.type || 'note', summary: text(input.summary || input.note, 6000, true), contactAt: iso(input.contactAt || ctx.now, 'contacto'), evidence: evidenceMetadata(input.evidence, contact.id, ctx), outcome: input.outcome || 'other', note: text(input.note || '', 6000, false), nextAction: text(input.nextAction || '', 300, false), nextActionAt: input.nextActionAt ? iso(input.nextActionAt, 'próxima acción') : null };
        if (!['reached', 'no_response', 'not_interested', 'follow_up', 'other'].includes(record.outcome)) fail('invalid_outcome', 'El resultado del contacto no es válido.');
        if (record.contactAt > ctx.now) fail('invalid_date', 'La fecha real de contacto no puede estar en el futuro.');
        if (record.nextActionAt && !record.nextAction) fail('invalid_task', 'La próxima acción necesita una descripción.');
        for (const key of ['expedientId', 'requestId', 'registrationId', 'taskId', 'creditId', 'providerId']) if (input[key]) {
          if (!isId(input[key])) fail('invalid_reference', 'Usa un identificador exacto para vincular la actividad.');
          if (key === 'expedientId' && (!draft.expedients[input[key]] || draft.expedients[input[key]].contactId !== contact.id)) fail('invalid_reference', 'El expediente no pertenece al contacto.');
          if (key === 'taskId' && (!draft.tasks[input[key]] || draft.tasks[input[key]].contactId !== contact.id)) fail('invalid_reference', 'La tarea no pertenece al contacto.');
          if (key === 'registrationId' && contact.type !== 'doctor' || ['requestId', 'creditId'].includes(key) && contact.type !== 'patient') fail('invalid_reference', 'La referencia no corresponde al tipo de contacto.');
          if (['requestId', 'registrationId', 'creditId', 'providerId'].includes(key) && (typeof options.validateExternalReference !== 'function' || options.validateExternalReference(key, input[key], clone(contact)) !== true)) fail('invalid_reference', 'La referencia no está vinculada exactamente a este contacto en backoffice o no se pudo verificar.');
          record[key] = input[key];
        }
        if (record.nextAction && record.nextActionAt) {
          const task = { id: ctx.id('task'), contactId: contact.id, title: record.nextAction, dueAt: record.nextActionAt, status: 'open', closeReason: null, createdAt: ctx.now, createdBy: actor.id, updatedAt: ctx.now, closedAt: null, closedBy: null };
          draft.tasks[task.id] = task; record.nextActionTaskId = task.id;
          audit(draft, ctx, 'task_created', contact.id, { taskId: task.id }); event(draft, ctx, 'task_created', contact, { taskId: task.id });
        }
        const activity = ctx.append('activities', record); event(draft, ctx, 'activity_recorded', contact, { activityId: activity.id, activityType: activity.type, contactAt: activity.contactAt }); return activity;
      });
    }
    function listContacts(filter) {
      filter = filter || {};
      const query = String(filter.query || '').trim().toLowerCase(), state = read().state;
      return Object.values(state.contacts).filter(c => canAccess(c) && (!filter.type || c.type === filter.type) && (!filter.stage || c.stage === filter.stage) && (!filter.assignedKam || c.assignedKam === filter.assignedKam) && (!query || [c.name, c.email, c.phone, c.id].some(x => String(x).toLowerCase().includes(query)))).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)).map(clone);
    }
    function getContact(id) { const state = read().state; return clone(requireContact(state, id)); }
    function listLinked(key, filter) {
      filter = filter || {}; const state = read().state;
      return Object.values(state[key]).filter(item => canAccess(state.contacts[item.contactId]) && (!filter.contactId || item.contactId === filter.contactId) && (!filter.status || item.status === filter.status)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).map(clone);
    }
    function operationalStatus(id) {
      const contact = getContact(id);
      if (typeof options.getBackofficeStatus !== 'function') return { status: 'not_linked', label: 'Sin vínculo de backoffice', source: 'backoffice', readOnly: true };
      const status = options.getBackofficeStatus(clone(contact));
      return typeof status === 'string' ? { status, label: status, source: 'backoffice', readOnly: true } : Object.assign({}, clone(status || { status: 'not_linked' }), { source: 'backoffice', readOnly: true });
    }
    function dashboard(filter) {
      filter = filter || {}; const state = read().state, date = new Date(getNow());
      const year = filter.year == null ? date.getUTCFullYear() : Number(filter.year), month = filter.month == null ? date.getUTCMonth() + 1 : Number(filter.month);
      if (!Number.isInteger(year) || year < 2000 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) fail('invalid_period', 'Selecciona un mes y año válidos.');
      if (actor.role === 'kam' && filter.kamId && filter.kamId !== actor.id) fail('forbidden', 'Un KAM sólo puede consultar su cartera DEMO.');
      const contacts = Object.values(state.contacts).filter(c => canAccess(c) && (!filter.type || c.type === filter.type) && (!filter.kamId || c.assignedKam === filter.kamId));
      const ids = new Set(contacts.map(c => c.id)), period = year + '-' + String(month).padStart(2, '0');
      const events = Object.values(state.events).filter(e => ids.has(e.contactId) && String(e.type === 'activity_recorded' ? e.contactAt || state.activities[e.activityId] && state.activities[e.activityId].contactAt || e.createdAt : e.createdAt).slice(0, 7) === period);
      const createdEvents = events.filter(e => ['contact_created', 'self_service_created'].includes(e.type));
      const newIds = new Set(createdEvents.map(e => e.contactId));
      const activities = events.filter(e => e.type === 'activity_recorded');
      const submitted = new Set(events.filter(e => ['holder_submitted', 'onboarding_submitted', 'expedient_submitted'].includes(e.type) && e.expedientId && state.expedients[e.expedientId] && state.expedients[e.expedientId].submittedAt).map(e => e.contactId));
      const started = new Set(events.filter(e => ['onboarding_started', 'expedient_created', 'assisted_draft_created', 'self_service_created'].includes(e.type) || e.type === 'contact_stage_changed' && ['application_started', 'registration_started'].includes(e.to)).map(e => e.contactId));
      const openTasks = Object.values(state.tasks).filter(t => ids.has(t.contactId) && t.status === 'open');
      const byStage = { patient: {}, doctor: {} }; for (const type of Object.keys(STAGES)) for (const stage of STAGES[type]) byStage[type][stage] = 0;
      for (const contact of contacts) byStage[contact.type][contact.stage]++;
      const kams = new Set(contacts.map(c => c.assignedKam || 'unassigned'));
      const byKam = Array.from(kams).sort().map(kamId => { const ownIds = new Set(contacts.filter(c => (c.assignedKam || 'unassigned') === kamId).map(c => c.id)); return { kamId, newContacts: Array.from(newIds).filter(id => ownIds.has(id)).length, activities: activities.filter(e => ownIds.has(e.contactId)).length, submitted: Array.from(submitted).filter(id => ownIds.has(id)).length }; });
      return { period: { month, year }, counts: { newContacts: newIds.size, patients: contacts.filter(c => c.type === 'patient' && newIds.has(c.id)).length, doctors: contacts.filter(c => c.type === 'doctor' && newIds.has(c.id)).length, activities: activities.length, openTasks: openTasks.length, overdueTasks: openTasks.filter(t => t.dueAt < getNow()).length, submitted: submitted.size, onboardingStarted: started.size, referralContacts: contacts.filter(c => newIds.has(c.id) && ['referral', 'kam_referral', 'doctor_referral'].includes(c.originalSource)).length }, byStage, byKam, events: clone(events), currentSnapshot: { contacts: contacts.length, openTasks: openTasks.length }, demo: true };
    }
    return Object.freeze({ actor, snapshot, transact, createContact, updateContact, getContact, listContacts, setStage, reassignContact, deleteContact, createReferral, resolveReferral, applyReferral, createTask, updateTask, closeTask, addActivity,
      listTasks: filter => listLinked('tasks', filter), listActivities: filter => listLinked('activities', filter), listAudit: filter => listLinked('audit', filter), dashboard, operationalStatus,
      canAccessContact: id => canAccess(read().state.contacts[id]), inspectIdentity, normalizeEmail, normalizePhone });
  }
  return Object.freeze({ STORAGE_KEY, STORE: STORAGE_KEY, VERSION, STAGES, SOURCES, ACTIVITY_TYPES, normalizeEmail, normalizePhone, findLegacyIdentity, createStore });
});
