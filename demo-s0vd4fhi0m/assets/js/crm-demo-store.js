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
    doctor: Object.freeze(['new', 'contacted_demo', 'meeting_scheduled', 'interested', 'registration_started', 'submitted', 'no_response', 'not_interested'])
  });
  // System stages remain readable, but may only be reached by their domain flow.
  const COMMERCIAL_STAGES = Object.freeze(Object.fromEntries(Object.entries(STAGES).map(([type, stages]) => [type, Object.freeze(stages.filter(stage => stage !== 'submitted'))])));
  const REGISTRATION_TASKS = Object.freeze(['registration_followup', 'duplicate_registration', 'cross_type_request', 'client_entered']);
  const TYPE_LABEL = Object.freeze({ patient: 'paciente', doctor: 'doctor' });
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
  function businessMonth(value) {
    const date = new Date(value); if (!Number.isFinite(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit' }).formatToParts(date);
    const year = Number(parts.find(p => p.type === 'year').value), month = Number(parts.find(p => p.type === 'month').value);
    return { year, month };
  }
  function isId(value) { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,179}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value); }
  function validEmail(email) { return email === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254; }
  function intakeConfig(value) {
    if(value===undefined)return {mode:'admin',kamIds:[],leaderCanAssign:true};
    if(!plain(value)||Object.keys(value).some(k=>!['mode','kamIds','leaderCanAssign','adminOwnerId','leaderOwnerId'].includes(k))||!['admin','leader','round_robin'].includes(value.mode)||typeof value.leaderCanAssign!=='boolean'||!Array.isArray(value.kamIds)||value.kamIds.length>100||value.kamIds.some(id=>!isId(id))||new Set(value.kamIds).size!==value.kamIds.length||['adminOwnerId','leaderOwnerId'].some(k=>has(value,k)&&value[k]!==null&&!isId(value[k])))fail('invalid_intake_config','Selecciona un responsable y una lista de KAM activos válida.');
    return clone(value);
  }
  function intakeCursor(state){const value=state.intakeCursor===undefined?0:state.intakeCursor;if(!Number.isSafeInteger(value)||value<0)fail('invalid_intake_cursor','El turno de asignación no es válido.');return value;}
  function initialState() { return { version: VERSION, revision: 0, demo: true, createdAt: null, updatedAt: null, contacts: {}, expedients: {}, invitations: {}, referrals: {}, tasks: {}, activities: {}, audit: {}, events: {} }; }
  function assertState(state) {
    if (!plain(state) || state.version !== VERSION) fail('unsupported_version', 'La versión de los datos CRM no es compatible. No se modificó el registro.');
    if (!Number.isSafeInteger(state.revision) || state.revision < 0 || MAPS.some(key => !plain(state[key]))) fail('invalid_storage', 'Los datos CRM no se pueden validar. No se modificó el registro.');
    for (const key of MAPS) for (const [id, record] of Object.entries(state[key])) if (!isId(id) || !plain(record) || record.id !== id) fail('invalid_storage', 'Un identificador CRM no coincide con su registro.');
    intakeConfig(state.intakeRouting);intakeCursor(state);
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
      const contactMatch = !!(input.contactId && row.crmIntake && row.crmIntake.contactId === input.contactId);
      if (!(mail && emails.includes(mail)) && !(phone && phones.includes(phone)) && !(input.accountId && id === input.accountId) && !contactMatch) return;
      matches.push({ type, source, accountId: id, recordId: row.id || null, matchedBy: mail && emails.includes(mail) ? 'email' : phone && phones.includes(phone) ? 'phone' : contactMatch ? 'contactId' : 'accountId', identityMismatch: !!(input.accountId && id === input.accountId && mail && emails.length && !emails.includes(mail)) });
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
  // v62.1: least-privilege KAM attribution for "Desempeño y metas KAM". It
  // returns only contactId -> assigned KAM id for submitted patient
  // expedients; no names, contact data, activities or expedient content.
  function createKamAttributionReader(options){
    options=options||{};const staff=(root&&root.PulzzoStaffAccess)||options.staffAccess,storage=options.storage||(root&&root.localStorage);
    if(!staff||!storage)fail('forbidden','La atribución KAM requiere una sesión del directorio.');
    const session=options.staffSession||staff.getSession(),actor=staff.getActor(session);
    if(!actor||!actor.id)fail('forbidden','Inicia sesión para consultar el desempeño KAM.');
    const identity=JSON.stringify([actor.id,actor.sessionId,actor.sessionVersion]);
    function assignments(){
      const live=staff.getActor(session),active=staff.getSession();if(!live||!active||active.sessionId!==actor.sessionId||JSON.stringify([live.id,live.sessionId,live.sessionVersion])!==identity)fail('forbidden','La sesión operativa cambió.');
      if(!staff.can(session,'viewKamPerformance'))fail('forbidden','No tienes permiso para consultar el desempeño KAM.');
      let state;try{const raw=storage.getItem(STORAGE_KEY);state=raw?assertState(JSON.parse(raw)):initialState();}catch(e){fail('invalid_storage','No se puede leer el registro operativo.');}
      const result={};
      for(const exp of Object.values(state.expedients))if(exp&&exp.kind==='patient'&&exp.submittedAt&&exp.submissionSnapshot){const contact=state.contacts[exp.contactId];result[exp.contactId]=contact&&typeof contact.assignedKam==='string'?contact.assignedKam:'';}
      return result;
    }
    assignments();return Object.freeze({actor:Object.freeze({id:actor.id,role:null}),assignments});
  }
  function createOperationalReader(options){
    options=options||{};const staff=(root&&root.PulzzoStaffAccess)||options.staffAccess,storage=options.storage||(root&&root.localStorage);
    if(!staff||!storage)fail('forbidden','El lector operativo requiere una sesión del directorio.');
    const session=options.staffSession||staff.getSession(),actor=staff.getActor(session);
    if(!actor||!actor.id)fail('forbidden','Inicia sesión para revisar expedientes enviados.');
    const identity=JSON.stringify([actor.id,actor.sessionId,actor.sessionVersion]);
    function snapshot(){
      const live=staff.getActor(session),active=staff.getSession();if(!live||!active||active.sessionId!==actor.sessionId||JSON.stringify([live.id,live.sessionId,live.sessionVersion])!==identity)fail('forbidden','La sesión operativa cambió.');
      const patient=staff.can(session,'viewPatients'),provider=staff.can(session,'viewProviders');if(!patient&&!provider)fail('forbidden','No tienes permiso para revisar estos expedientes.');
      let state;try{const raw=storage.getItem(STORAGE_KEY);state=raw?assertState(JSON.parse(raw)):initialState();}catch(e){fail('invalid_storage','No se puede leer el registro operativo.');}
      const result=clone(state),exps=Object.values(state.expedients).filter(e=>e.submittedAt&&e.submissionSnapshot&&(e.kind==='patient'?patient:e.kind==='doctor'&&provider)),ids=new Set(exps.map(e=>e.contactId)),expIds=new Set(exps.map(e=>e.id));
      for(const key of MAPS)result[key]=Object.fromEntries(Object.entries(state[key]).filter(([id,row])=>key==='contacts'?ids.has(id):key==='expedients'?expIds.has(id):['audit','events','activities'].includes(key)&&ids.has(row.contactId)));
      delete result.intakeRouting;delete result.intakeCursor;return result;
    }
    snapshot();return Object.freeze({actor:Object.freeze({id:actor.id,role:null}),snapshot});
  }
  function createStore(options) {
    options = options || {};
    let storage = options.storage;
    if (!storage && root) { try { storage = root.localStorage; } catch (_) {} }
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') fail('storage_unavailable', 'El almacenamiento local no está disponible.');
    const actor = Object.freeze(clone(options.actor || {}));
    const staffAccess=options.staffAccess===null?null:((root&&root.PulzzoStaffAccess)||options.staffAccess),centralStaff=!!staffAccess&&actor.role!=='holder';
    const staffSession=centralStaff?(options.staffSession||staffAccess.getSession()):null;
    const staffContext=centralStaff?staffAccess.crmContext(staffSession):null;
    function assertStaff(){if(centralStaff&&(!staffContext||!staffContext.isCurrent()||!staffContext.actor||staffContext.actor.id!==actor.id||staffContext.actor.role!==actor.role||staffContext.scope==='none'))fail('forbidden','La sesión del directorio cambió o no permite acceder al CRM.');}
    function staffAllows(flag){if(!centralStaff)return true;assertStaff();const current=staffAccess.crmContext(staffSession);return !!current&&current[flag]===true;}
    function eligibleKamIds(){if(staffAccess){const rows=staffAccess.getIntakeKamRoster();if(!Array.isArray(rows))fail('invalid_roster','No se pudo comprobar el directorio de KAMs activos.');return rows.map(r=>r.id).filter(isId);}return ['kam_ana','kam_luis'];}
    function intakeRecipients(){
      const rows=staffAccess?staffAccess.getIntakeRecipientRoster():[{id:'admin_demo',role:'admin'},{id:'leader_demo',role:'leader'}];
      if(!Array.isArray(rows)||rows.some(r=>!r||!isId(r.id)||!['admin','leader'].includes(r.role)))fail('invalid_roster','No se pudo comprobar el directorio de responsables activos.');
      return rows;
    }
    function intakeOwner(routing,role){
      const explicit=routing[role+'OwnerId'],ids=Array.from(new Set(intakeRecipients().filter(r=>r.role===role).map(r=>r.id)));
      // A configured inactive recipient never silently changes to another user.
      return has(routing,role+'OwnerId')?explicit&&ids.includes(explicit)?explicit:null:ids.length===1?ids[0]:null;
    }
    function validAssignment(id){if(id===null)return true;return eligibleKamIds().includes(id)||intakeRecipients().some(r=>r.id===id);}
    assertStaff();

    if (!isId(actor.id) || !['kam', 'admin', 'leader', 'holder'].includes(actor.role)) fail('invalid_actor', 'Selecciona una identidad DEMO válida.');
    const getNow = () => iso(typeof options.now === 'function' ? options.now() : options.now || new Date(), 'registro');
    const randomId = typeof options.randomId === 'function' ? options.randomId : randomPart;
    let running = false;
    // Private proof for review audit entries. The public transaction adapter cannot
    // fabricate a review decision, even though all roles here remain a DEMO.
    const reviewProofs = new WeakMap();
    const holderClaimProofs = new WeakMap(), crossTypeProofs = new WeakSet(), crossTypeAction = Object.freeze({});
    const intakeProofs = new WeakMap(), assignmentProofs = new WeakSet(), leaderAssignment = Object.freeze({}),configAction=Object.freeze({});
    function intakeProof(draft){let proof=intakeProofs.get(draft);if(!proof){proof={allocations:[],config:null};intakeProofs.set(draft,proof);}return proof;}

    function assertCurrent() { assertStaff();if (typeof options.isCurrent === 'function' && options.isCurrent() !== true) fail('forbidden', 'La sesión CRM cambió. Abre de nuevo la vista con tu rol actual.'); }
    function read() {
      assertCurrent();
      let raw;
      try { raw = storage.getItem(STORAGE_KEY); } catch (_) { fail('storage_unavailable', 'No se pudo leer el almacenamiento local. Tus cambios no se guardaron.'); }
      if (raw === null || raw === undefined || raw === '') return { raw: raw == null ? null : raw, state: initialState() };
      let state;
      try { state = JSON.parse(raw); } catch (_) { fail('invalid_storage', 'Los datos CRM están dañados. No se sobrescribieron.'); }
      return { raw, state: assertState(state) };
    }
    // Publication follow-up is a canonical, read-only system task projection. It
    // shares the CRM task surfaces without creating another mutable source of truth.
    // A photo upload is never evidence that the photo was published.
    function publicPhotoTasks(state) {
      if (!['admin', 'kam', 'leader'].includes(actor.role) || !Object.values(state.contacts).some(c => c.type === 'doctor' && canAccess(c))) return {};
      let rows;
      try {
        if (typeof options.getPublicPhotoTasks === 'function') rows = options.getPublicPhotoTasks();
        else {
          let publication = root && root.PulzzoDoctorPublication, context = root && root.PulzzoDoctorPublicationContext;
          if (typeof require === 'function') {
            if (!publication) { try { publication = require('./doctor-publication.js'); } catch (_) {} }
            if (!context) { try { context = require('./doctor-publication-context.js'); } catch (_) {} }
          }
          if (!publication || !context || typeof context.resolveProvider !== 'function') return {};
          rows = publication.createStore({ storage, actor, now: getNow, resolveProvider: id => context.resolveProvider(storage, id) }).photoTasks();
        }
      } catch (_) { return {}; } // Unavailable publication data never fabricates a closed task.
      const result = {}, seen = new Set();
      for (const row of Array.isArray(rows) ? rows : []) {
        const c = row && state.contacts[row.contactId], id = row && 'doctor-photo:' + row.providerId;
        // System task IDs use a fixed namespace plus the complete valid provider ID.
        // They may exceed the persisted CRM-ID bound and are never stored in that map.
        if (!c || !canAccess(c) || c.type !== 'doctor' || !isId(row.providerId) || row.id !== id || row.kind !== 'doctor_public_photo' || seen.has(id)) continue;
        if (!c.accountId || c.accountId !== c.holderId || row.accountId !== c.accountId || row.assignedKam !== c.assignedKam || !['open', 'closed'].includes(row.status) || row.status === 'closed' && row.publishedPhoto !== true || row.status === 'open' && row.publishedPhoto !== false) continue;
        if (!isId(row.publishedVersionId) || !Number.isFinite(Date.parse(row.createdAt)) || !Number.isFinite(Date.parse(row.updatedAt))) continue;
        seen.add(id);
        result[id] = { id, kind: 'doctor_public_photo', systemManaged: true, provenance: 'published_doctor_profile', providerId: row.providerId, contactId: c.id, assignedKam: c.assignedKam,
          title: 'Completar fotografía pública', dueAt: null, status: row.status, publishedVersionId: row.publishedVersionId,
          createdAt: row.createdAt, createdBy: 'doctor_publication', updatedAt: row.updatedAt,
          closedAt: row.status === 'closed' ? row.updatedAt : null, closedBy: null,
          closeReason: row.status === 'closed' ? 'Fotografía publicada en el directorio.' : null };
      }
      return result;
    }
    function taskRecords(state) { return Object.assign({}, state.tasks, publicPhotoTasks(state)); }
    function project(state, input, persistedOnly) {
      if (actor.role === 'admin'&&(!centralStaff||staffContext.viewScope==='all')) { const result = clone(state); result.tasks = clone(persistedOnly ? state.tasks : taskRecords(state)); return result; }
      const result = clone(state), allowed = new Set(Object.values(state.contacts).filter(c => canAccess(c)).map(c => c.id));
      let tokenInvitation = null, tokenExpedient = null;
      if (actor.role === 'holder' && input && input.invitationToken) {
        const invitation = Object.values(state.invitations).find(i => i.token === input.invitationToken);
        tokenInvitation = invitation;
        const exp = invitation && state.expedients[invitation.expedientId];
        if (exp && invitation.status === 'pending' && invitation.expiresAt > getNow() && exp.activeInvitationId === invitation.id && !exp.holderIdentity) tokenExpedient = { id: exp.id, contactId: exp.contactId, kind: exp.kind, activeInvitationId: exp.activeInvitationId, holderIdentity: null };
      }
      for (const key of MAPS) result[key] = Object.fromEntries(Object.entries(state[key]).filter(([, record]) => key === 'contacts' ? allowed.has(record.id) : key === 'referrals' ? centralStaff?(staffContext.viewScope==='all'||record.kamId===actor.id):actor.role === 'leader' || actor.role === 'kam' && record.kamId === actor.id : allowed.has(record.contactId)).map(([id, record]) => [id, clone(record)]));
      if(actor.role==='holder'&&input&&input.entryToken){const exp=Object.values(state.expedients).find(e=>e.entryLink&&e.entryLink.token===input.entryToken);if(exp&&!result.expedients[exp.id]){const c=state.contacts[exp.contactId];result.expedients[exp.id]={id:exp.id,contactId:exp.contactId,kind:exp.kind,entryLink:clone(exp.entryLink),entryEmail:c&&c.email,entryDisabled:!c||!!c.deletedAt||c.stage==='not_interested',holderIdentity:exp.holderIdentity?{id:exp.holderIdentity.id}:null};}}
      // A presented expired/revoked token can report its state, without exposing its dossier.
      if (tokenInvitation) result.invitations[tokenInvitation.id] = clone(tokenInvitation);
      if (tokenExpedient && !result.expedients[tokenExpedient.id]) result.expedients[tokenExpedient.id] = tokenExpedient;
      if (actor.role === 'leader') {
        for (const key of ['invitations', 'referrals']) for (const record of Object.values(result[key])) if(!centralStaff||!(key==='referrals'?record.kamId===actor.id&&eligibleKamIds().includes(actor.id):staffAccess.can(staffSession,'crmEdit',state.contacts[record.contactId])))delete record.token;
      }
      if (!persistedOnly) Object.assign(result.tasks, publicPhotoTasks(state));
      return result;
    }
    function snapshot(input) { return project(read().state, input); }
    function inspectIdentity(input) {
      input = input || {};
      const report = findLegacyIdentity(storage, input), state = read().state, mail = normalizeEmail(input && input.email), phone = normalizePhone(input && input.phone);
      for (const c of Object.values(state.contacts)) if (mail && c.email === mail || phone && c.phone === phone) report.matches.push({ type: c.type, source: STORAGE_KEY, accountId: c.accountId || c.holderId || null, contactId: canAccess(c) ? c.id : null, matchedBy: mail && c.email === mail ? 'email' : 'phone' });
      const ids = [...new Set(report.matches.map(m => m.accountId).filter(Boolean))];
      report.existingAccountId = ids.length === 1 ? ids[0] : null;
      report.requiresReconciliation = report.requiresReconciliation || ids.length > 1 || report.matches.some(m => input.type && m.type !== input.type);
      if (['kam', 'leader'].includes(actor.role)) {
        const allowed = report.matches.filter(m => m.source === STORAGE_KEY && m.contactId && canAccess(state.contacts[m.contactId]));
        const restricted = report.matches.length !== allowed.length;
        // A collision must still block creation, without turning the KAM check
        // into a directory of other portfolios or legacy account identifiers.
        return { matches: clone(allowed).concat(restricted ? [{ contactId: null, accountId: null, recordId: null, restricted: true }] : []), existingAccountId: ids.length === 1 && allowed.some(m => m.accountId === ids[0]) ? ids[0] : null, requiresReconciliation: report.requiresReconciliation || restricted, blocked: !!report.matches.length, requiresHolderLogin: report.matches.some(m => m.source !== STORAGE_KEY) };
      }
      return clone(report);
    }
    function requireAdmin(flag='canWrite') { if (actor.role !== 'admin'||!staffAllows(flag)) fail('forbidden', 'Esta acción corresponde a un administrador DEMO.'); }
    function identityReviewReport(input, state) {
      requireAdmin();
      if (!plain(input) || Object.keys(input).some(k => !['type', 'email', 'phone'].includes(k)) || !STAGES[input.type]) fail('invalid_input', 'Selecciona el tipo y los datos de contacto que deseas revisar.');
      const email = normalizeEmail(input.email), phone = normalizePhone(input.phone);
      if (!validEmail(email) || phone && !/^\d{7,15}$/.test(phone) || !email && !phone) fail('invalid_contact', 'Incluye un correo válido o un teléfono de 7 a 15 dígitos.');
      const legacy = findLegacyIdentity(storage, { type: input.type, email, phone });
      const candidates = Object.values(state.contacts).filter(c => email && c.email === email || phone && c.phone === phone);
      const matches = legacy.matches.map(m => Object.assign({}, m, { contactId: null, archived: false }));
      for (const c of candidates) matches.push({ type: c.type, source: STORAGE_KEY, contactId: c.id, accountId: c.accountId || c.holderId || null, recordId: null, matchedBy: email && c.email === email ? 'email' : 'phone', archived: !!c.deletedAt });
      const candidate = candidates.length === 1 ? candidates[0] : null;
      // Continuing this exact already-accessible record is navigation, not proof
      // that two identities belong to one person, an account claim, or a merger.
      const canContinue = !!candidate && !candidate.deletedAt && candidate.type === input.type && !legacy.matches.length && (!email || candidate.email === email) && (!phone || candidate.phone === phone);
      return { matches, canContinue, continuationContactId: canContinue ? candidate.id : null, requiresReconciliation: !!matches.length && !canContinue, revision: state.revision, demo: true };
    }
    function inspectIdentityReview(input) { return clone(identityReviewReport(input, read().state)); }
    function reviewIdentity(input, details, revision) {
      return transact(revision, (draft, ctx) => {
        requireAdmin();
        if (!plain(details) || Object.keys(details).some(k => !['status', 'reason', 'contactId'].includes(k)) || !['pending', 'resolved'].includes(details.status)) fail('invalid_review', 'Selecciona revisión pendiente o continuar un contacto CRM existente.');
        const reason = text(details.reason, 2000, true), report = identityReviewReport(input, draft);
        if (details.status === 'resolved' && (!report.canContinue || details.contactId !== report.continuationContactId)) fail('identity_reconciliation_required', 'La coincidencia sigue pendiente. Sólo se puede continuar un contacto CRM activo y exacto, sin unir identidades ni sustituir cuentas.');
        if (details.status === 'pending' && details.contactId) fail('invalid_review', 'Una revisión pendiente no selecciona ni vincula una identidad.');
        const reviewId = ctx.id('review');
        // No searched email/phone, matched account payload, or list of identities
        // is copied to the audit. Null scope keeps these entries admin-only.
        const record = audit(draft, ctx, 'identity_review_' + details.status, null, { reviewId, status: details.status, reason, requestedType: input.type, matchCount: report.matches.length, selectedContactId: details.status === 'resolved' ? report.continuationContactId : null });
        reviewProofs.set(ctx, clone(record));
        return { reviewId, status: record.status, contactId: record.selectedContactId, reason, matchCount: record.matchCount, createdAt: record.createdAt, actorId: record.actorId, demo: true };
      });
    }
    function listIdentityReviews(filter) {
      requireAdmin(); filter = filter || {};
      return Object.values(read().state.audit).filter(a => ['identity_review_pending', 'identity_review_resolved'].includes(a.action) && (!filter.reviewId || a.reviewId === filter.reviewId) && (!filter.status || a.status === filter.status)).reverse().map(clone);
    }
    function canAccess(contact) {
      return !!contact && !contact.deletedAt && (centralStaff?staffAccess.can(staffSession,'crmView',contact):(['admin', 'leader'].includes(actor.role) || actor.role === 'kam' && contact.assignedKam === actor.id || actor.role === 'holder' && contact.holderId === actor.id && (!contact.accountId || contact.accountId === actor.id)));
    }
    function requireContact(state, id) {
      const contact = state.contacts[id];
      if (!contact || contact.deletedAt) fail('contact_not_found', 'No se encontró el contacto activo.');
      if (!canAccess(contact)) fail('forbidden', 'Esta identidad DEMO no tiene acceso al contacto.');
      return contact;
    }
    function requireStaff() { if (centralStaff?!staffAllows('canWrite'):!['kam', 'admin'].includes(actor.role)) fail('forbidden', 'Esta acción corresponde a un KAM o administrador DEMO.'); }
    function uniqueId(prefix, draft) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const id = text(prefix || 'id', 25, true) + '_' + String(randomId(prefix)).replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 145);
        if (isId(id) && !MAPS.some(key => has(draft[key], id))) return id;
      }
      fail('id_collision', 'No se pudo generar un identificador único. No se guardó el registro.');
    }
    function referralFor(state, token, type) {
      const record = Object.values(state.referrals).find(r => r.token === token && r.active !== false);
      if (!record || record.type !== type||staffAccess&&!eligibleKamIds().includes(record.kamId)) fail('invalid_referral', 'El enlace de referido no es válido para este tipo de registro DEMO.');
      return record;
    }
    function makeContact(input, draft, ctx) {
      input = input || {};
      const type = input.type || input.kind;
      if (!STAGES[type]) fail('invalid_type', 'Selecciona paciente o doctor.');
      const email = normalizeEmail(input.email), phone = normalizePhone(input.phone);
      if (!email || !validEmail(email) || !phone || !/^\d{7,15}$/.test(phone)) fail('invalid_contact', 'Correo y teléfono son obligatorios: captura un correo válido y un teléfono de 7 a 15 dígitos.');
      let originalSource = input.originalSource || (actor.role === 'holder' ? 'unknown' : 'manual');
      let referringKam = null, doctorLink = null;
      if (input.referralToken) { const ref = referralFor(draft, input.referralToken, type); originalSource = 'kam_referral'; referringKam = ref.kamId; }
      else if (input.doctorReferralToken) {
        try {
          const resolver = options && options.resolveDoctorReferral || (root && root.PulzzoV1 && root.PulzzoV1.resolveDoctorReferral);
          doctorLink = typeof resolver === 'function' ? resolver(String(input.doctorReferralToken), storage) : null;
        } catch (ignore) { doctorLink = null; }
        if (doctorLink && doctorLink.doctorId) { originalSource = 'doctor_referral'; referringKam = null; }
        else doctorLink = null;
      }
      else if (['referral', 'kam_referral'].includes(originalSource) || input.referringKam) fail('invalid_referral', 'El origen referido requiere un token DEMO válido.');
      if (!SOURCES.includes(originalSource)) fail('invalid_source', 'El origen del contacto no es válido.');
      // v36c: same person enabled for the other type from its CRM ficha → new record linked to it, never a merged identity.
      const crossLinks = input.crossTypeLink === true ? Object.values(draft.contacts).filter(o => !o.deletedAt && o.type !== type && (o.email === email || o.phone === phone) && o.crossTypeAccess && o.crossTypeAccess[type] && o.crossTypeAccess[type].enabled === true).map(o => o.id) : [];
      const legacy = findLegacyIdentity(storage, { type, email, phone, accountId: actor.role === 'holder' ? actor.id : null });
      if (crossLinks.length) legacy.matches = legacy.matches.filter(m => m.type === type);
      if (legacy.matches.length) fail('existing_account_requires_login', 'Esta identidad ya existe en un portal o backoffice. Concilia el registro y usa el acceso explícito del titular; no se creó un duplicado.');
      if(centralStaff&&staffContext.writeScope==='own'&&!eligibleKamIds().includes(actor.id)&&!(staffSession.roles||[]).includes('admin'))fail('kam_role_required','Para crear contactos propios, Administración debe agregar el rol KAM a esta cuenta.');
      if(actor.role==='holder'&&input.assignedKam)fail('forbidden','El titular no puede elegir una asignación comercial.');
      let assignedKam = input.assignedKam || ((actor.role === 'kam'||centralStaff&&eligibleKamIds().includes(actor.id)) ? actor.id : referringKam);
      if (!assignedKam && doctorLink && isId(doctorLink.kamId)) assignedKam = doctorLink.kamId;
      let intakeRecipientRole=null,intakeRoutingMode=null;
      if(!assignedKam){const routing=intakeConfig(draft.intakeRouting);intakeRoutingMode=routing.mode;
        const eligible=eligibleKamIds(),pool=routing.kamIds.filter(id=>eligible.includes(id));if(routing.mode==='round_robin'&&pool.length){const cursor=intakeCursor(draft);assignedKam=pool[cursor%pool.length];draft.intakeCursor=cursor+1;}
        else {intakeRecipientRole=routing.mode==='leader'?'leader':'admin';assignedKam=intakeOwner(routing,intakeRecipientRole);}
      }

      if(centralStaff&&assignedKam&&!validAssignment(assignedKam))fail('invalid_actor','El responsable no está activo o no pertenece al directorio CRM.');
      if (assignedKam !== null && !isId(assignedKam)) fail('invalid_actor', 'La asignación KAM no es válida.');
      if (actor.role === 'kam' && assignedKam !== actor.id) fail('forbidden', 'Un KAM sólo puede crear contactos asignados a sí mismo.');
      let noteText = text(input.notes || '', 6000, false);
      if (doctorLink && doctorLink.doctorId) noteText = text((noteText ? noteText + '\n' : '') + 'Doctor vinculado: ' + String(doctorLink.doctorName || '').trim() + ' · ' + String(doctorLink.doctorId), 6000, false);
      const contact = { id: ctx.id('ct'), type, name: text(input.name, 160, true), email, phone, stage: 'new', stageReason: null,
        intakeRecipientRole, intakeRoutingMode, originalSource, captureMechanism: input.captureMechanism || (actor.role === 'holder' ? 'self_service' : 'crm_manual'), referringKam, assignedKam: assignedKam || null, assistingActors: actor.role === 'kam' ? [actor.id] : [],
        createdAt: ctx.now, updatedAt: ctx.now, createdBy: actor.id, deletedAt: null,
        holderId: null, accountId: null, accountExists: false, referringDoctorId:doctorLink ? doctorLink.doctorId : null, notes: noteText };
      if (crossLinks.length) contact.linkedContactIds = crossLinks;
      intakeProof(draft).allocations.push({id:contact.id,assignedKam:contact.assignedKam,intakeRecipientRole,intakeRoutingMode,referringDoctorId:contact.referringDoctorId});
      return contact;
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
          inv.consumedBy === actor.id && (!inv.claimedBy || inv.claimedBy === actor.id) && (old.entryVersion===1?old.expiresAt===null&&oldExp&&oldExp.entryLink&&oldExp.entryLink.token===old.token&&oldExp.entryLink.status==='active'&&oldContact&&!oldContact.deletedAt&&oldContact.stage!=='not_interested':iso(old.expiresAt) > now) &&
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
        if (!plain(descriptor) || Object.keys(descriptor).some(k => !['id', 'name', 'mimeType', 'size', 'uploadedAt', 'actorId', 'contactId', 'activityId', 'documentType'].includes(k)) || !isId(descriptor.id) || !isId(descriptor.actorId) || descriptor.contactId !== record.contactId || !(['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(descriptor.mimeType)||['video/webm','video/mp4'].includes(descriptor.mimeType)&&descriptor.documentType==='selfieVideo'||descriptor.mimeType==='image/gif'&&descriptor.documentType==='profile_photo') || !Number.isSafeInteger(descriptor.size) || descriptor.size <= 0 || descriptor.size > 5 * 1024 * 1024 || descriptor.activityId != null && !isId(descriptor.activityId)) fail('invalid_document_evidence', 'El documento requiere evidencia local válida del mismo contacto.');
        if(record.kind==='patient'){
          const types=['identity','ineFront','ineBack','selfieVideo','idFront','idBack','selfie'];
          const source=(record.documents||[]).find(d=>d.id===live.docId||d.evidenceId===live.docId);
          if(types.includes(descriptor.documentType)||types.includes(live.docId)||types.includes(live.documentType)||source&&(types.includes(source.label)||types.includes((source.onboardingPath||'').split('.')[1]))){
            if(live.documentType&&descriptor.documentType!==live.documentType)fail('document_scope','El reemplazo debe conservar el tipo exacto observado.');
            if(descriptor.actorId!==record.holderIdentity.id||uploading&&actor.role!=='holder')fail('holder_upload_required','El reemplazo de identidad requiere una carga personal del cliente.');
            if(uploading){let adapter=root&&root.PulzzoCRMAssisted;if(!adapter&&typeof require==='function')adapter=require('./crm-assisted.js');adapter.assertHolderDocumentUpload(record,descriptor,actor);}
          }
        }
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
    function assertOnboardingChange(old,record,contact,ctx){
      if(record.onboarding){
        let adapter=root&&root.PulzzoCRMAssisted;if(!adapter&&typeof require==='function'){try{adapter=require('./crm-assisted.js');}catch(_){}}
        if(!adapter||!adapter.onboardingProjection)fail('onboarding_unavailable','El adaptador del formulario no está disponible.');
        const projection=adapter.onboardingProjection(record,record.onboarding.records),actual=(record.documents||[]).filter(d=>d.onboardingPath);
        if(Object.entries(projection.fields).some(([key,value])=>!equal(record.fields[key],value))||Object.keys(record.fields).some(key=>!Object.prototype.hasOwnProperty.call(projection.fields,key))||actual.length!==projection.documents.length||projection.documents.some(d=>!actual.some(a=>Object.keys(d).every(k=>equal(a[k],d[k])))))fail('onboarding_projection','El resumen y documentos deben coincidir con el formulario completo.');
        const legacy=(record.documents||[]).filter(d=>!d.onboardingPath),oldLegacy=(old&&old.documents||[]).filter(d=>!d.onboardingPath);if(!equal(legacy,oldLegacy))fail('onboarding_projection','Los archivos anteriores se conservan; la captura nueva usa los documentos del formulario.');
        for(const document of actual){
          const oldDocument=old&&(old.documents||[]).find(d=>d.onboardingPath===document.onboardingPath),sameMetadata=oldDocument&&Object.keys(document).filter(k=>!['uploadedBy','uploadedAt'].includes(k)).every(k=>equal(document[k],oldDocument[k]));
          const expectedActor=document.evidenceActorId||(sameMetadata?oldDocument.uploadedBy:actor.id),expectedTime=document.evidenceUploadedAt||(sameMetadata?oldDocument.uploadedAt:ctx.now);
          if(document.uploadedBy!==expectedActor||document.uploadedAt!==expectedTime)fail('invalid_audit_actor','La autoría del documento proviene de su carga original.');
        }
      }
      if(equal(old&&old.onboarding,record.onboarding))return;
      const previous=old&&old.onboarding,next=record.onboarding;
      if(!plain(next)||next.schema!=='pulzzo.crm.onboarding.v1'||!plain(next.records)||!plain(next.fieldHistory)||next.revision!==(previous&&previous.revision||0)+1||next.updatedBy!==actor.id||next.updatedAt!==ctx.now)fail('invalid_onboarding','La captura completa debe conservar su esquema, revisión y autoría.');
      if(old&&(old.submittedAt||old.submissionSnapshot||old.demoBridgeCaseId||old.offerAccepted||old.contractSigned||old.holderActions&&(old.holderActions.finalConfirmation||old.holderActions.offerAcceptance||old.holderActions.contractSignature)))fail('submission_locked','El formulario revisado o enviado está bloqueado. Usa la corrección observada.');
      if(record.status==='needs_correction')fail('correction_scope','El formulario completo no puede sobrescribir una corrección observada.');
      let module=root&&root.PulzzoCRMAssisted;if(!module&&typeof require==='function'){try{module=require('./crm-assisted.js');}catch(_){}}
      if(!module||!module.validateOnboardingRecords)fail('onboarding_unavailable','El adaptador del formulario no está disponible.');
      module.validateOnboardingRecords(record.kind,next.records,previous&&previous.records,record,contact,actor);
      if(!equal(next.identityFileHistory||{},module.identityFileHistory(record.kind,previous,next.records)))fail('immutable_history','Las cargas de identidad anteriores se conservan exactamente.');
      const beforeFields=module.flattenOnboarding(previous&&previous.records||{}),afterFields=module.flattenOnboarding(next.records);
      for(const field of new Set([...Object.keys(beforeFields),...Object.keys(afterFields),...Object.keys(next.fieldHistory),...Object.keys(previous&&previous.fieldHistory||{})])){
        const beforeHistory=previous&&previous.fieldHistory[field]||[],history=next.fieldHistory[field]||[],changed=!equal(beforeFields[field],afterFields[field]);
        if(!Array.isArray(history)||!equal(history.slice(0,beforeHistory.length),beforeHistory)||history.length!==beforeHistory.length+(changed?1:0))fail('immutable_history','El historial de cada campo del formulario es inmutable y exacto.');
        if(changed){const entry=history[history.length-1];if(!plain(entry)||entry.actorId!==actor.id||entry.actorRole!==actor.role||entry.at!==ctx.now||entry.source!==(actor.role==='holder'?'holder':'assisted')||entry.deleted!==(afterFields[field]===undefined)||!equal(entry.value,afterFields[field]===undefined?null:afterFields[field]))fail('invalid_audit_actor','La modificación del formulario debe registrar su actor y valor exactos.');}
      }
      const projection=module.onboardingProjection(record,next.records);
      for(const [field,value] of Object.entries(projection.fields))if(!equal(record.fields[field],value))fail('onboarding_projection','El resumen debe coincidir con el formulario completo.');
      const actual=(record.documents||[]).filter(d=>d.onboardingPath);
      if(actual.length!==projection.documents.length||projection.documents.some(d=>!actual.some(a=>Object.keys(d).every(k=>equal(a[k],d[k])))))fail('onboarding_projection','Los documentos deben conservar exactamente su vínculo al formulario completo.');
    }
    // v36: a holder may only add the follow-up task of its own new self-service registration,
    // or the single open alert of a repeated registration attempt on an existing contact.
    function holderRegistrationTask(before, after, old, task) {
      if (!plain(task) || !REGISTRATION_TASKS.includes(task.kind) || task.status !== 'open' || task.systemManaged) return false;
      const contact = after.contacts[task.contactId];
      if (!contact || contact.deletedAt) return false;
      if (task.kind === 'registration_followup') return !old && !before.contacts[task.contactId] && contact.holderId === actor.id && contact.accountId === actor.id && contact.captureMechanism === 'self_service' && Object.values(after.tasks).filter(t => t.kind === 'registration_followup' && t.contactId === task.contactId).length === 1;
      if (task.kind === 'client_entered') return !old && validSelfClaim(before, after, task.contactId) && Object.values(after.tasks).filter(t => t.kind === 'client_entered' && t.contactId === task.contactId && !before.tasks[t.id]).length === 1;
      if (!equal(before.contacts[task.contactId], contact)) return false;
      if (task.kind === 'cross_type_request' && !STAGES[task.requestedType]) return false;
      if (Object.values(after.tasks).filter(t => t.kind === task.kind && t.contactId === task.contactId && t.status === 'open' && (t.kind !== 'cross_type_request' || t.requestedType === task.requestedType)).length !== 1) return false;
      if (!old) return task.attempts === 1;
      const changed = Object.keys(Object.assign({}, old, task)).filter(k => !equal(old[k], task[k]));
      return old.status === 'open' && changed.every(k => ['attempts', 'lastAttemptAt', 'lastMatchedBy', 'updatedAt'].includes(k)) && task.attempts === (old.attempts || 1) + 1;
    }
    // v36c: a KAM-created contact without an account may be claimed by the client who verified the same email or phone.
    function validSelfClaim(before, after, id) {
      if (actor.role !== 'holder' || holderClaimProofs.get(after) !== id) return false;
      const old = before.contacts[id], c = after.contacts[id];
      if (!old || !c || old.deletedAt || old.holderId || old.accountId || old.accountExists || old.type !== c.type) return false;
      if (c.holderId !== actor.id || c.accountId !== actor.id || c.accountExists !== true || !(old.email === c.email || old.phone === c.phone)) return false;
      return Object.values(after.audit).some(a => !before.audit[a.id] && a.action === 'kam_contact_self_claimed' && a.contactId === id);
    }
    function assertAuthorization(before, after, ctx) {
      if(centralStaff){
        const capability=assignmentProofs.has(after)?'crmAssign':'crmEdit';
        for(const map of ['contacts','tasks','activities','expedients','invitations','audit','events'])for(const [id,row] of Object.entries(after[map])){
          if(equal(before[map][id],row))continue;const contactId=map==='contacts'?id:row.contactId;if(!contactId)continue;
          const contact=before.contacts[contactId]||after.contacts[contactId];if(!contact||!(staffAccess.can(staffSession,capability,contact)||crossTypeProofs.has(after)&&staffAccess.can(staffSession,'crmAssign',contact)))fail('forbidden','El permiso vigente no permite modificar esta ficha.');
        }
      }

      for (const [id, contact] of Object.entries(after.contacts)) {
        const old = before.contacts[id];
        if (equal(old, contact)) continue;
        if (!centralStaff&&actor.role === 'kam' && (old ? old.assignedKam !== actor.id : contact.assignedKam !== actor.id)) fail('forbidden', 'Un KAM sólo puede modificar sus contactos asignados.');
        if (actor.role === 'holder') {
          const claim = sameWriteClaim(before, after, id, ctx.now);
          const own = old && old.holderId === actor.id && old.accountId === actor.id;
          const selfService = !old && contact.holderId === actor.id && contact.accountId === actor.id && contact.accountExists === true && Object.values(after.expedients).some(e => e.contactId === id && holderOwnsExp(e, after));
          if (!claim && !own && !selfService && !validSelfClaim(before, after, id)) fail('forbidden', 'El titular no tiene acceso a este contacto.');
          if (old && ['assignedKam', 'deletedAt', 'type', 'originalSource', 'referringKam', 'crossTypeAccess', 'crossTypeHistory', 'linkedContactIds'].some(k => !equal(old[k], contact[k]))) fail('forbidden', 'El titular no puede cambiar la asignación o la atribución comercial.');
        }
        if (old && ['holderId', 'accountId', 'accountExists'].some(k => !equal(old[k], contact[k])) && !(actor.role === 'holder' && (sameWriteClaim(before, after, id, ctx.now) || validSelfClaim(before, after, id)))) fail('identity_locked', 'La cuenta sólo se vincula con una invitación aceptada por su titular.');
        if (!old && actor.role !== 'holder' && (contact.holderId || contact.accountId || contact.accountExists)) fail('identity_locked', 'Un contacto CRM no concede acceso a una cuenta.');
      }
      for (const key of ['tasks', 'activities', 'expedients', 'invitations']) for (const [id, record] of Object.entries(after[key])) {
        const old = before[key][id];
        if (equal(old, record)) continue;
        const contact = after.contacts[record.contactId], previous = before.contacts[record.contactId];
        if (!contact || contact.deletedAt) fail('invalid_contact_reference', 'El registro requiere un contacto activo y exacto.');
        if (old && old.contactId !== record.contactId) fail('identity_locked', 'Un registro no puede trasladarse a otra identidad.');
        if (!centralStaff&&actor.role === 'kam' && (previous || contact).assignedKam !== actor.id) fail('forbidden', 'El expediente no está asignado a este KAM.');
        if (actor.role === 'holder') {
          if (key === 'tasks') { if (!holderRegistrationTask(before, after, old, record)) fail('forbidden', 'Las tareas CRM corresponden al equipo KAM.'); continue; }
          const claim = sameWriteClaim(before, after, record.contactId, ctx.now);
          if (!claim && !(contact.holderId === actor.id && contact.accountId === actor.id)) fail('forbidden', 'El titular no tiene acceso al expediente.');
          if (key === 'invitations' && !claim) fail('forbidden', 'El titular sólo puede aceptar su invitación vigente.');
        }
        if (key === 'expedients') {
          if(!equal(old?.profileChangeRequests,record.profileChangeRequests)){
            const module=(root&&root.PulzzoProfileChanges)||(typeof require==='function'?require('./profile-change-requests.js'):null);
            if(!module||!old||!old.submittedAt)fail('profile_change_invalid','Solo se admiten solicitudes posteriores al envío del titular.');
            module.validateAppend(old,record,actor,ctx.now,module.readStorage(storage,old));
          }

          if(!equal(old?.initialRegistration,record.initialRegistration)){
            const initial=record.initialRegistration;
            if(old?.initialRegistration||actor.role!=='holder'||!record.holderIdentity||record.holderIdentity.id!==actor.id||!initial||initial.actorId!==actor.id||initial.actorRole!=='holder'||initial.at!==ctx.now||initial.demo!==true)fail('holder_required','Solo el titular puede completar su registro inicial.');
            let registered;try{registered=JSON.parse(record.onboarding?.records?.[record.kind==='doctor'?'pulzzoDoctorOnboardingCleanV3':'pulzzo_application']||'null');}catch(_){fail('initial_registration_incomplete','Faltan los datos iniciales.');}
            const profile=registered?.profile||{},names=registered?.identity?.nameParts||{};
            if(!contact.email||!contact.phone||!registered||(record.kind==='doctor'?(!profile.name||profile.email!==contact.email||!['doctor','clinica'].includes(profile.accountType)||!profile.state||!profile.city||!registered.specialties?.length):(!names.first||!names.paternal)))fail('initial_registration_incomplete','Los datos iniciales no están completos.');

          }

          if(record.kind==='patient'&&!record.onboarding){
            const personal=d=>d&&(['identity','ineFront','ineBack','selfieVideo','idFront','idBack','selfie'].includes(d.label)||['identity','ineFront','ineBack','selfieVideo','idFront','idBack','selfie'].includes(d.documentType));
            const prior=(old&&old.documents||[]).filter(personal),next=(record.documents||[]).filter(personal);
            if(actor.role!=='holder'&&!equal(prior,next))fail('holder_upload_required','La INE y selfie deben ser cargadas personalmente por el cliente.');
            for(const d of next)if(!prior.some(p=>equal(p,d))){
              if(d.uploadedBy!==actor.id||!record.holderIdentity||record.holderIdentity.id!==actor.id)fail('holder_upload_required','La carga debe pertenecer al titular exacto.');
              if(d.evidenceId){let adapter=root&&root.PulzzoCRMAssisted;if(!adapter&&typeof require==='function')adapter=require('./crm-assisted.js');adapter.assertHolderDocumentUpload(record,d,actor);}
            }
          }
          if(actor.role==='holder'&&!equal(old&&old.entryLink,record.entryLink))fail('forbidden','El titular no administra enlaces de entrada.');
          if(record.entryLink){const link=record.entryLink;if(link.version!==1||!isId(link.token)||!['active','revoked'].includes(link.status))fail('invalid_entry','Enlace de entrada inválido.');if(old&&old.entryLink&&old.entryLink.token!==link.token&&!Object.values(after.audit).some(a=>!before.audit[a.id]&&a.type==='holder_entry_renewed'&&a.expedientId===record.id))fail('entry_renewal_required','Cambiar el enlace requiere renovación explícita.');if(old&&old.entryLink&&old.entryLink.status==='revoked'&&link.status==='active'&&old.entryLink.token===link.token)fail('entry_revoked','Un enlace revocado no puede reactivarse.');}
          assertOnboardingChange(old,record,contact,ctx);
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
            if (actor.role !== 'holder' || !record.holderIdentity || record.holderIdentity.id !== actor.id || !['otp', 'buroConsent', 'legalConsent', 'offerAcceptance', 'contractSignature', 'finalConfirmation'].includes(action) || !plain(value) || value.actorId !== actor.id || value.actorRole !== 'holder' || value.at !== ctx.now || value.confirmed !== true || value.demo !== true) fail('holder_action_required', 'La confirmación debe realizarla personalmente el titular de este expediente DEMO.');
            if(action==='legalConsent'&&(!record.onboarding||typeof value.termsVersion!=='string'||!value.termsVersion||value.termsVersion.length>80||typeof value.privacyVersion!=='string'||!value.privacyVersion||value.privacyVersion.length>80))fail('legal_version_required','La confirmación conserva las versiones de términos y privacidad revisadas.');
            if (action === 'buroConsent' && record.kind !== 'patient') fail('invalid_holder_action', 'Esta autorización corresponde al paciente.');
            if (['offerAcceptance', 'contractSignature'].includes(action)) {
              if (record.kind !== 'patient' || !record.submittedAt || !record.submissionSnapshot || !record.receivedOffer || !record.receivedOffer.offer || !record.receivedOffer.offerFingerprint || value.offerFingerprint !== record.receivedOffer.offerFingerprint) fail('offer_required', 'Primero recibe la oferta vigente del expediente enviado.');
              // Current BO contract readiness is checked by the assisted adapter;
              // receivedOffer is the immutable accepted quote, not a live BO status.
              if (action === 'contractSignature' && (!oldActions.offerAcceptance || oldActions.offerAcceptance.offerFingerprint !== value.offerFingerprint)) fail('contract_not_ready', 'El contrato requiere una oferta previamente aceptada.');
              if (action === 'contractSignature' && (!record.contractReadiness || record.contractReadiness.contractReady !== true || record.contractReadiness.offerFingerprint !== value.offerFingerprint || record.contractReadiness.checkedAt !== ctx.now)) fail('contract_not_ready', 'Vuelve a consultar la habilitación actual del contrato en administración.');
            }
            if(action==='finalConfirmation'&&record.onboarding){let full=root&&root.PulzzoCRMAssisted;if(!full&&typeof require==='function')full=require('./crm-assisted.js');if(!full||full.onboardingMissing(record).length)fail('incomplete_onboarding','Completa el formulario y documentos antes de confirmar.');full.assertOnboardingEvidence(record,before.revision,actor);}
            if (action === 'finalConfirmation' && (record.onboarding&&!nextActions.legalConsent || !nextActions.otp || record.kind === 'patient' && !nextActions.buroConsent || record.kind === 'doctor' && (!['holder', 'authorized_representative'].includes(value.capacity) || value.authorityConfirmed !== true))) fail('incomplete_confirmation', 'Faltan confirmaciones personales previas o facultades del representante.');
          }
          if (old && (old.submittedAt || oldActions.finalConfirmation || oldActions.offerAcceptance || oldActions.contractSignature) && ['fields', 'documents', 'fieldHistory', 'onboarding'].some(k => !equal(old[k], record[k]))) fail('submission_locked', 'Los datos revisados, enviados o aceptados están bloqueados.');
          if (old && old.submittedAt && record.status !== old.status) fail('submission_locked', 'El envío no puede reiniciarse desde CRM.');
          if (oldActions.offerAcceptance && !equal(old.receivedOffer, record.receivedOffer)) fail('financial_locked', 'La oferta aceptada es inmutable.');
          if (!equal(old && old.receivedOffer || null, record.receivedOffer || null) && (actor.role !== 'holder' || !record.submittedAt || !record.submissionSnapshot)) fail('offer_required', 'Una oferta sólo puede recibirse tras el envío confirmado.');
          if (record.submittedAt && !(old && old.submittedAt)) {
            if(record.onboarding){let full=root&&root.PulzzoCRMAssisted;if(!full&&typeof require==='function')full=require('./crm-assisted.js');if(!full||full.onboardingMissing(record).length)fail('incomplete_onboarding','El envío requiere todos los datos y archivos del formulario completo.');full.assertOnboardingEvidence(record,before.revision,actor);}
            const receipt = record.submissionSnapshot;
            if (actor.role !== 'holder' || record.status !== 'submitted' || record.submittedAt !== ctx.now || record.submissionRevision !== before.revision + 1 || !receipt || receipt.schema !== 'pulzzo.crm.submission.v1' || receipt.demo !== true || receipt.expedientId !== id || receipt.contactId !== record.contactId || receipt.accountId !== actor.id || !nextActions.finalConfirmation || !nextActions.otp || record.onboarding&&!nextActions.legalConsent || record.kind === 'patient' && !nextActions.buroConsent || !equal(receipt.fields, record.fields) || !equal(receipt.documents, record.documents) || !equal(receipt.holderIdentity, record.holderIdentity) || !equal(receipt.holderActions, nextActions) || !equal(receipt.onboarding||null,record.onboarding||null)) fail('invalid_submission', 'El envío requiere los datos revisados y las confirmaciones del titular exacto.');
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
            if (!live || !record.submittedAt || live.expedientId !== record.id || live.contactId !== record.contactId || live.accountId !== record.holderIdentity.id || !equal(live, record.correctionReview)) fail('review_mismatch', 'La revisión debe coincidir exactamente con la administración vigente.');
            if (!equal(old && old.approvedFields, record.approvedFields) && (live.status !== 'approved' || !equal(live.approvedFields || {}, record.approvedFields))) fail('approval_read_only', 'Los datos aprobados sólo se consultan desde una revisión aprobada en administración.');
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
            if (!record.submittedAt || !review || !Array.isArray(review.allowedFields) || Object.keys(correction.fields || {}).some(k => !review.allowedFields.includes(k)) || (correction.documents || []).length) fail('correction_scope', 'Sólo pueden prepararse los campos expresamente observados en administración.');
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
        const revocationOnly = old && old.active !== false && ref.active === false && ['admin', 'leader'].includes(actor.role);
        if (actor.role === 'holder' || actor.role === 'kam' && ref.kamId !== actor.id||!revocationOnly&&centralStaff&&(!eligibleKamIds().includes(ref.kamId)||actor.role!=='admin'&&ref.kamId!==actor.id)) fail('forbidden', 'El enlace debe pertenecer al KAM que lo genera.');
      }
    }
    function assertProspectLifecycle(state, contact) {
      if (Object.values(state.tasks).some(t => t.contactId === contact.id && t.status === 'open')) fail('open_tasks', 'Cierra las tareas pendientes antes de archivar o restaurar el contacto.');
      if (Object.values(state.expedients).some(e => e.contactId === contact.id) || Object.values(state.invitations).some(i => i.contactId === contact.id)) fail('open_expedient', 'El contacto tiene un expediente o invitación. Archivar o restaurar no cancela ni reinicia el registro; requiere revisión operativa.');
      if (contact.accountId || contact.holderId || contact.accountExists) fail('account_linked', 'El contacto ya está vinculado a una cuenta; conserva su registro operativo.');
      if (contact.stage === 'submitted' || ['creditId', 'requestId', 'registrationId', 'applicationId', 'submittedAt', 'offerAccepted', 'contractSigned'].some(k => contact[k]) || Object.values(state.activities).some(a => a.contactId === contact.id && ['creditId', 'requestId', 'registrationId'].some(k => a[k]))) fail('linked_operation', 'El contacto tiene una operación vinculada; esta acción sólo corresponde a prospectos sin cuenta ni operación.');
      const legacy = findLegacyIdentity(storage, { type: contact.type, email: contact.email, phone: contact.phone, contactId: contact.id });
      if (legacy.matches.length) fail('identity_reconciliation_required', 'Existe una cuenta o registro operativo coincidente. Revisa la identidad antes de archivar o restaurar; no se modificó el registro.');
      if (typeof options.findExistingAccount === 'function' && options.findExistingAccount(clone(contact))) fail('account_linked', 'Existe una cuenta vinculada; esta acción sólo corresponde a prospectos.');
    }
    function assertLifecycleChange(before, after, old, contact, ctx) {
      const restoring = !!old.deletedAt && !contact.deletedAt;
      requireAdmin();
      if (contact.updatedAt !== ctx.now || restoring && contact.deletedAt !== null || !restoring && contact.deletedAt !== ctx.now) fail('invalid_audit_actor', 'El archivo y la restauración conservan la fecha real de esta sesión.');
      for (const field of new Set([...Object.keys(old), ...Object.keys(contact)])) if (!['deletedAt', 'updatedAt'].includes(field) && !equal(old[field], contact[field])) fail('archived_contact', 'Archivar o restaurar conserva el mismo contacto, identidad, origen y responsable.');
      for (const key of MAPS) if (!['contacts', 'audit'].includes(key) && !equal(before[key], after[key])) fail('lifecycle_scope', 'Archivar o restaurar no modifica tareas, expedientes, invitaciones ni operaciones.');
      for (const [id, record] of Object.entries(after.contacts)) if (id !== contact.id && !equal(before.contacts[id], record)) fail('lifecycle_scope', 'La acción sólo puede cambiar el contacto seleccionado.');
      const action = restoring ? 'contact_restored' : 'contact_archived';
      const entries = Object.values(after.audit).filter(a => !before.audit[a.id]);
      if (entries.length !== 1 || entries[0].action !== action || entries[0].contactId !== contact.id || !text(entries[0].reason, 2000, false)) fail('audit_required', 'Archivar o restaurar requiere un motivo y su auditoría exacta.');
      if (restoring && !Object.values(before.audit).some(a => a.action === 'contact_archived' && a.contactId === contact.id && a.createdAt === old.deletedAt && text(a.reason, 2000, false))) fail('archive_review_required', 'No se pudo verificar el archivo previo. Mantén el contacto archivado para revisión.');
      assertProspectLifecycle(before, old);
    }
    function assertInvariants(before, after, ctx) {
      assertState(after);
      const routingProof=intakeProofs.get(after),configChanged=!equal(before.intakeRouting,after.intakeRouting),cursorChanged=!equal(before.intakeCursor,after.intakeCursor);
      if(configChanged&&(!routingProof||!routingProof.config||actor.role!=='admin'||!equal(after.intakeRouting,routingProof.config)))fail('protected_intake_config','La configuración sólo cambia desde Configuración CRM de Administración.');
      const configAudits=Object.values(after.audit).filter(a=>!before.audit[a.id]&&a.action==='intake_routing_changed');
      if(configChanged?(configAudits.length!==1||!equal(configAudits[0].before,intakeConfig(before.intakeRouting))||!equal(configAudits[0].after,intakeConfig(after.intakeRouting))||!text(configAudits[0].reason,2000,false)):configAudits.length)fail('invalid_intake_audit','La auditoría debe corresponder a un cambio real de configuración.');
      if(cursorChanged){const rotations=(routingProof&&routingProof.allocations||[]).filter(a=>a.intakeRoutingMode==='round_robin'&&a.assignedKam&&!a.intakeRecipientRole);if(!rotations.length||intakeCursor(after)!==intakeCursor(before)+rotations.length)fail('protected_intake_cursor','El turno sólo avanza al crear un contacto nuevo asignado.');}
      for(const a of routingProof&&routingProof.allocations||[]){const c=after.contacts[a.id];if(!c||before.contacts[a.id]||!equal(c.assignedKam,a.assignedKam)||!equal(c.intakeRecipientRole,a.intakeRecipientRole)||!equal(c.intakeRoutingMode,a.intakeRoutingMode)||!equal(c.referringDoctorId,a.referringDoctorId))fail('invalid_intake_allocation','Conserva la asignación inicial y la bandeja de entrada.');}
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
        if(!old&&!(routingProof&&routingProof.allocations.some(a=>a.id===id)))fail('invalid_intake_allocation','Crea los contactos mediante el flujo de alta para aplicar la regla de entrada.');
        if (!STAGES[c.type] || !STAGES[c.type].includes(c.stage)) fail('invalid_stage', 'La etapa no corresponde al tipo de contacto. Las decisiones de aprobación son de administración.');
        if(c.captureMechanism!==undefined&&!['crm_manual','self_service'].includes(c.captureMechanism))fail('invalid_capture_mechanism','El mecanismo de captura no es válido.');
        if (!SOURCES.includes(c.originalSource) || ['referral', 'kam_referral'].includes(c.originalSource) && !isId(c.referringKam) || !['referral', 'kam_referral'].includes(c.originalSource) && c.referringKam != null) fail('invalid_source', 'La atribución original no es válida.');
        if (normalizeEmail(c.email) !== c.email || !validEmail(c.email) || normalizePhone(c.phone) !== c.phone || c.phone && !/^\d{7,15}$/.test(c.phone) || !c.email && !c.phone) fail('invalid_contact', 'El correo y teléfono deben estar normalizados.');
        text(c.name, 160, true); iso(c.createdAt); iso(c.updatedAt);
        if (!isId(c.createdBy) || c.assignedKam !== null && !isId(c.assignedKam) || !Array.isArray(c.assistingActors) || c.assistingActors.some(x => !isId(x)) || new Set(c.assistingActors).size !== c.assistingActors.length) fail('invalid_actor', 'Los participantes del contacto no son válidos.');
        if (!old && c.deletedAt) fail('archived_contact', 'Primero crea un prospecto activo antes de archivarlo.');
        if (!old && (c.createdBy !== actor.id || c.createdAt !== ctx.now || c.updatedAt !== ctx.now)) fail('invalid_audit_actor', 'La identidad y hora de creación provienen de la sesión actual.');
        if (['no_response', 'not_interested'].includes(c.stage)) text(c.stageReason, 2000, true);
        if ((!old || old.stage !== c.stage) && c.stage === 'submitted') {
          const submittedNow = Object.values(after.expedients).some(exp => exp.contactId === id && exp.kind === c.type && exp.submittedAt === ctx.now && !(before.expedients[exp.id] && before.expedients[exp.id].submittedAt) && exp.holderIdentity && exp.holderIdentity.id === actor.id && Object.values(after.events).some(e => !before.events[e.id] && ['holder_submitted', 'onboarding_submitted', 'expedient_submitted'].includes(e.type) && e.expedientId === exp.id && e.contactId === id));
          if (actor.role !== 'holder' || !submittedNow) fail('holder_action_required', 'La etapa de envío sólo se actualiza con el envío confirmado del titular.');
        }
        if (old) {
          if (old.stage === 'submitted' && c.stage !== old.stage) fail('stage_read_only', 'El envío confirmado no puede deshacerse con un cambio comercial.');
          if (old.stage !== c.stage || (old.stageReason || '') !== (c.stageReason || '')) {
            const trackedAudit = Object.values(after.audit).some(a => !before.audit[a.id] && a.action === 'contact_stage_changed' && a.contactId === id && a.from === old.stage && a.to === c.stage);
            const trackedEvent = Object.values(after.events).some(e => !before.events[e.id] && e.type === 'contact_stage_changed' && e.contactId === id && e.from === old.stage && e.to === c.stage);
            if (!trackedAudit || !trackedEvent) fail('audit_required', 'El cambio de etapa requiere auditoría y un evento del mismo contacto.');
          }
          for (const field of ['id', 'type', 'createdAt', 'createdBy', 'originalSource', 'referringKam', 'referringDoctorId', 'captureMechanism', 'demoFixtureKey', 'intakeRecipientRole', 'intakeRoutingMode']) if (!equal(old[field], c[field])) fail('immutable_attribution', 'La identidad y la atribución original no se sobrescriben.');
          if (old.assistingActors.some(x => !c.assistingActors.includes(x))) fail('immutable_history', 'No se eliminan participantes del historial.');
          if(!old.email&&c.email){const match=findLegacyIdentity(storage,{email:c.email,type:c.type});if(match.matches.length)fail('identity_reconciliation_required','El correo existe en otro portal; concilia la identidad antes de vincularlo.');}
          // v36: at initial registration the holder's typed name becomes official; the KAM name stays in nameHistory.
          const holderNameAdoption = (o, n, cid) => actor.role === 'holder' && o.holderId === actor.id && o.accountId === actor.id && typeof n.name === 'string' && n.name.trim().length > 0 && n.name.length <= 160 && Array.isArray(n.nameHistory) && n.nameHistory.length === (o.nameHistory || []).length + 1 && equal(n.nameHistory.slice(0, -1), o.nameHistory || []) && n.nameHistory.at(-1).name === (o.name || '') && n.nameHistory.at(-1).label === 'nombre capturado por KAM' && Object.values(after.events).some(e => !before.events[e.id] && e.type === 'holder_name_saved' && e.contactId === cid);
          const identityLocked = old.accountId || old.holderId || old.accountExists || Object.values(before.expedients).some(e => e.contactId === id && (e.holderIdentity || e.submittedAt || e.activeInvitationId));
          if (identityLocked && ['name', 'email', 'phone'].some(k => old[k] !== c[k] && !(k === 'phone' && actor.role === 'holder' && /^\d{7,15}$/.test(String(c.phone || '')) && sameWriteClaim(before, after, id, ctx.now)) && !(k === 'name' && holderNameAdoption(old, c, id)) && !(['email', 'phone'].includes(k) && validSelfClaim(before, after, id) && Array.isArray(c[k + 'History']) && c[k + 'History'].length === (old[k + 'History'] || []).length + 1 && c[k + 'History'].at(-1)[k] === old[k]))) fail('identity_locked', 'La identidad ya está vinculada a una cuenta o invitación. Requiere conciliación; no se sobrescribió.');
          if (!equal(old.crossTypeAccess, c.crossTypeAccess) || !equal(old.crossTypeHistory, c.crossTypeHistory)) {
            if (!crossTypeProofs.has(after) || actor.role === 'holder' || !Object.values(after.audit).some(a => !before.audit[a.id] && a.action === 'cross_type_access_changed' && a.contactId === id)) fail('forbidden', 'La habilitación entre tipos se registra sólo desde la ficha CRM con su historial.');
          }
          if (!equal(old.linkedContactIds, c.linkedContactIds)) fail('identity_locked', 'El vínculo entre tipos se fija al crear el registro.');
          if (old.assignedKam !== c.assignedKam) {
            if (centralStaff?!assignmentProofs.has(after)||!staffAccess.can(staffSession,'crmAssign',old):actor.role !== 'admin' && !(actor.role==='leader'&&assignmentProofs.has(after)&&intakeConfig(before.intakeRouting).leaderCanAssign)) fail('forbidden', 'La reasignación requiere autorización vigente de Administración.');
            const tracked = Object.values(after.audit).some(a => !before.audit[a.id] && a.action === 'contact_reassigned' && a.contactId === id && a.from === old.assignedKam && a.to === c.assignedKam && text(a.reason, 2000, false));
            if (!tracked) fail('audit_required', 'La reasignación requiere motivo y auditoría.');
          }
          if (!!old.deletedAt !== !!c.deletedAt) assertLifecycleChange(before, after, old, c, ctx);
          else if (old.deletedAt && !equal(old, c)) fail('archived_contact', 'El contacto archivado conserva su identidad y su historial.');
        }
        // v36: the same phone may exist once per type (patient vs doctor); it is flagged for review on both fichas.
        for (const [index, value] of [[emails, c.email ? c.type + ':' + c.email : c.email], [phones, c.phone ? c.type + ':' + c.phone : c.phone]]) {
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
      // v36c: the same email/phone in patient and doctor requires the ficha toggle and a link on the new record.
      const crossPairs = state => { const out = new Set(), list = Object.values(state.contacts).filter(x => !x.deletedAt); for (const a of list) if (a.type === 'patient') for (const d of list) if (d.type === 'doctor' && (a.email && a.email === d.email || a.phone && a.phone === d.phone)) out.add(a.id + '|' + d.id); return out; };
      const beforePairs = crossPairs(before), crossLinked = (n, o) => (n.linkedContactIds || []).includes(o.id) && !!(o.crossTypeAccess && o.crossTypeAccess[n.type] && o.crossTypeAccess[n.type].enabled === true);
      for (const pair of crossPairs(after)) if (!beforePairs.has(pair)) { const [pa, da] = pair.split('|').map(x => after.contacts[x]); if (!crossLinked(pa, da) && !crossLinked(da, pa)) fail('identity_reconciliation_required', 'La identidad ya existe en otro tipo de registro. Requiere habilitarla desde la ficha CRM.'); }
      for (const key of IMMUTABLE_MAPS) for (const [id, record] of Object.entries(after[key])) if (!before[key][id]) {
        if (record.actorId !== actor.id || record.actorRole !== actor.role || record.createdAt !== ctx.now) fail('invalid_audit_actor', 'El actor y la hora de captura provienen de la sesión DEMO.');
        if (key === 'audit' && /^identity_review_/.test(record.action || '')) {
          requireAdmin();
          if (!equal(reviewProofs.get(ctx), record)) fail('invalid_review', 'La revisión debe comprobar la coincidencia vigente mediante el flujo administrativo.');
          for (const map of MAPS) if (map !== 'audit' && !equal(before[map], after[map])) fail('identity_locked', 'La revisión sólo registra la decisión de continuar o dejar pendiente; no cambia identidades.');
        }
        if (key === 'audit' && ['contact_archived', 'contact_restored'].includes(record.action)) {
          const old = before.contacts[record.contactId], contact = after.contacts[record.contactId];
          if (!old || !contact || (record.action === 'contact_archived' ? old.deletedAt || contact.deletedAt !== ctx.now : !old.deletedAt || contact.deletedAt !== null)) fail('invalid_lifecycle_audit', 'La auditoría debe corresponder al archivo o restauración real del contacto.');
        }
        if (['holder_invitation_copied', 'holder_access_link_issued', 'holder_access_link_copied'].includes(record.type)) {
          const contact = before.contacts[record.contactId], exp = before.expedients[record.expedientId];
          const fields = ['id', 'type', 'contactId', 'expedientId', 'generatedBy', 'demo', 'actorId', 'actorRole', 'createdAt'];
          const isInvitation = record.type === 'holder_invitation_copied', isAccessCopy = record.type === 'holder_access_link_copied';
          if (isInvitation) fields.push('invitationId');
          if (isAccessCopy) fields.push('issuedAuditId');
          if (!['audit', 'events'].includes(key) || (centralStaff?!staffAccess.can(staffSession,'crmEdit',contact):!['kam', 'admin'].includes(actor.role)) || !contact || contact.deletedAt || !centralStaff&&actor.role === 'kam' && contact.assignedKam !== actor.id ||
              !exp || exp.contactId !== contact.id || exp.kind !== contact.type || !isId(record.generatedBy) || record.demo !== true || Object.keys(record).some(field => !fields.includes(field))) {
            fail('invalid_link_audit', 'La referencia local requiere el contacto exacto y su equipo asignado, sin datos del enlace.');
          }
          if (isInvitation) {
            const inv = before.invitations[record.invitationId];
            if (exp.status !== 'invited' || exp.holderIdentity || exp.activeInvitationId !== record.invitationId ||
                exp.submittedAt || exp.submissionSnapshot || exp.demoBridgeCaseId || exp.offerAccepted || exp.contractSigned || exp.holderActions && (exp.holderActions.offerAcceptance || exp.holderActions.contractSignature) ||
                !inv || inv.contactId !== contact.id || inv.expedientId !== exp.id || inv.status !== 'pending' || inv.consumedAt || inv.consumedBy || inv.claimedBy || inv.revokedAt ||
                !Number.isFinite(Date.parse(inv.expiresAt)) || Date.parse(inv.expiresAt) <= Date.parse(ctx.now) || inv.intendedEmail !== contact.email || inv.intendedEmail !== exp.fields.email || record.generatedBy !== inv.createdBy) {
              fail('invalid_link_audit', 'La copia requiere una invitación vigente del expediente exacto.');
            }
          } else {
            if (!exp.holderIdentity || exp.holderIdentity.id !== contact.holderId || exp.holderIdentity.id !== contact.accountId || !contact.accountExists || exp.holderIdentity.email !== contact.email || !['claimed', 'submitted', 'needs_correction'].includes(exp.status)) fail('invalid_link_audit', 'El acceso requiere una cuenta ya vinculada al expediente.');
            const issued = isAccessCopy && before.audit[record.issuedAuditId];
            if (isAccessCopy ? !issued || issued.type !== 'holder_access_link_issued' || issued.contactId !== contact.id || issued.expedientId !== exp.id || issued.generatedBy !== issued.actorId || issued.generatedBy !== record.generatedBy : record.generatedBy !== actor.id) fail('invalid_link_audit', 'La referencia al acceso debe conservar quién lo generó.');
          }
          for (const map of MAPS) if (!['audit', 'events'].includes(map) && !equal(before[map], after[map])) fail('invalid_link_audit', 'Registrar un enlace no modifica contactos, atribución ni expedientes.');
          const content = entry => { const value = clone(entry); delete value.id; return value; };
          for (const history of ['audit', 'events']) {
            const added = Object.values(after[history]).filter(entry => !before[history][entry.id]);
            if (added.length !== 1 || !equal(content(added[0]), content(record))) fail('invalid_link_audit', 'El enlace requiere una sola constancia local y su evento correspondiente.');
          }
        }
        if (record.contactId && !after.contacts[record.contactId]) fail('invalid_contact_reference', 'La actividad requiere un identificador de contacto exacto.');
        const holderAlert = actor.role === 'holder' && record.taskId && after.tasks[record.taskId] && ['duplicate_registration', 'cross_type_request'].includes(after.tasks[record.taskId].kind) && after.tasks[record.taskId].contactId === record.contactId && (['task_created', 'task_updated'].includes(record.action) || ['duplicate_registration_attempt', 'cross_type_registration_attempt'].includes(record.type));
        if (record.contactId && !holderAlert && !canAccess(after.contacts[record.contactId]) && !(centralStaff&&assignmentProofs.has(after)&&before.contacts[record.contactId]&&staffAccess.can(staffSession,'crmAssign',before.contacts[record.contactId])&&['contact_reassigned'].includes(record.action||record.type)||actor.role === 'admin' || actor.role === 'kam' && before.contacts[record.contactId] && before.contacts[record.contactId].assignedKam === actor.id && after.contacts[record.contactId].deletedAt)) fail('forbidden', 'El actor no puede agregar historial a otro contacto.');
        if (key === 'events') {
          if (['contact_created', 'self_service_created'].includes(record.type) && before.contacts[record.contactId]) fail('invalid_event', 'Un evento de alta requiere un contacto nuevo.');
          if (['holder_submitted', 'onboarding_submitted', 'expedient_submitted'].includes(record.type)) {
            const exp = after.expedients[record.expedientId];
            if (actor.role !== 'holder' || !exp || exp.contactId !== record.contactId || exp.submittedAt !== ctx.now || !exp.holderIdentity || exp.holderIdentity.id !== actor.id || before.expedients[record.expedientId] && before.expedients[record.expedientId].submittedAt) fail('invalid_event', 'Un envío debe corresponder a un envío real del titular y del mismo contacto.');
          }
          if (['onboarding_started', 'expedient_created', 'assisted_draft_created', 'self_service_created'].includes(record.type)) {
            const exp = after.expedients[record.expedientId];
            if (!exp || before.expedients[exp.id] || exp.contactId !== record.contactId || exp.createdAt !== ctx.now || exp.createdBy !== actor.id) fail('invalid_event', 'Un inicio requiere un expediente nuevo del mismo contacto y actor.');
          }
          if (record.type === 'activity_recorded' && (!after.activities[record.activityId] || before.activities[record.activityId] || after.activities[record.activityId].contactId !== record.contactId)) fail('invalid_event', 'El evento requiere una actividad nueva del mismo contacto.');
        }
      }
      for (const [id, task] of Object.entries(after.tasks)) {
        if (id.startsWith('doctor-photo:') || task.kind === 'doctor_public_photo' || task.systemManaged) fail('system_task', 'La tarea de fotografía proviene de la publicación y no se modifica manualmente.');
        text(task.title, 300, true); iso(task.dueAt);
        if (!['open', 'closed'].includes(task.status)) fail('invalid_task', 'El estado de la tarea no es válido.');
        if (task.status === 'closed') { text(task.closeReason, 2000, true); iso(task.closedAt); }
        const old = before.tasks[id];
        if (!old) {
          const contact = after.contacts[task.contactId], owner = contact && contact.assignedKam;
          // Validate every new manual task at the atomic commit boundary, including
          // activity/stage follow-ups and raw extension transactions. Historical
          // tasks remain editable if their owner later becomes unavailable.
          // Standalone legacy demos support caller-defined actor IDs; integrated
          // sessions always require the current active directory assignment.
          const legacyOwnActor = !staffAccess && owner === actor.id && ['kam', 'admin'].includes(actor.role);
          if (!(REGISTRATION_TASKS.includes(task.kind) && actor.role === 'holder') && (!owner || !(validAssignment(owner) || legacyOwnActor))) fail('task_owner_required', 'Asigna un responsable antes de crear una tarea');
        }
        if (old && (old.createdAt !== task.createdAt || old.createdBy !== task.createdBy || old.status === 'closed' && !equal(old, task))) fail('immutable_history', 'Una tarea cerrada y sus datos de creación son inmutables.');
        if (!equal(old, task)) {
          // Generic transactions must preserve the same task evidence as the UI
          // methods. A caller cannot forge another actor, backdate a closure, or
          // skip its audit while still passing the full-payload commit boundary.
          if (task.updatedAt !== ctx.now || !old && (task.createdAt !== ctx.now || task.createdBy !== actor.id)) fail('invalid_audit_actor', 'La tarea conserva el actor y la hora reales de esta sesión.');
          if (task.status === 'closed' && (task.closedAt !== ctx.now || task.closedBy !== actor.id)) fail('invalid_audit_actor', 'El cierre conserva el actor y la hora reales de esta sesión.');
          if (task.status === 'open' && (task.closedAt != null || task.closedBy != null || task.closeReason != null)) fail('invalid_task', 'Una tarea pendiente no puede contener un cierre.');
          const action = task.status === 'closed' ? 'task_closed' : old ? 'task_updated' : 'task_created';
          const tracked = Object.values(after.audit).some(a => !before.audit[a.id] && a.action === action && a.contactId === task.contactId && a.taskId === id && (action !== 'task_closed' || a.reason === task.closeReason));
          if (!tracked) fail('audit_required', 'El cambio de tarea requiere su auditoría exacta y el motivo de cierre cuando corresponde.');
        }
      }
      for (const [id, ref] of Object.entries(after.referrals)) {
        if (!STAGES[ref.type] || !isId(ref.kamId) || !isId(ref.token)) fail('invalid_referral', 'El enlace DEMO no es válido.');
        const old = before.referrals[id];
        if (old && ['token', 'kamId', 'type', 'createdAt'].some(k => old[k] !== ref[k])) fail('immutable_attribution', 'Un enlace no puede cambiar de KAM ni de tipo.');
        if (old && old.active === false && !equal(old, ref)) fail('immutable_history', 'Un enlace revocado no se reactiva; genera uno nuevo.');
        if (old && old.active !== false && ref.active === false && (!['admin', 'leader'].includes(actor.role) || ref.revokedBy !== actor.id || ref.revokedAt !== ctx.now || !Object.values(after.audit).some(a => !before.audit[a.id] && a.action === 'referral_revoked' && a.referralId === id))) fail('audit_required', 'Revocar un enlace requiere Administración o líder, motivo y auditoría.');
      }
      for (const [id, invitation] of Object.entries(after.invitations)) {
        const old = before.invitations[id], exp = after.expedients[invitation.expedientId];
        if (!exp || exp.contactId !== invitation.contactId || !['pending', 'consumed', 'revoked'].includes(invitation.status) || !isId(invitation.token) || normalizeEmail(invitation.intendedEmail) !== invitation.intendedEmail) fail('invalid_invitation', 'La invitación no coincide con su expediente.');
        if(invitation.entryVersion===1){if(invitation.expiresAt!==null)fail('invalid_invitation','La vigencia corresponde al código, no al enlace de entrada.');}else iso(invitation.expiresAt);
        if (old && ['token', 'entryVersion', 'expedientId', 'contactId', 'intendedEmail', 'createdAt', 'createdBy', 'expiresAt'].some(k => old[k] !== invitation[k])) fail('immutable_invitation', 'La identidad y vigencia de una invitación son inmutables. Genera otra invitación.');
        if (old && old.status !== 'pending' && !equal(old, invitation)) fail('invitation_used', 'Una invitación utilizada o revocada no puede reabrirse.');
        if ((!old || old.status !== invitation.status) && invitation.status === 'consumed' && (actor.role !== 'holder' || !sameWriteClaim(before, after, invitation.contactId, ctx.now))) fail('invalid_claim', 'La invitación sólo puede consumirse con la identidad exacta del titular.');
      }
      assertAuthorization(before, after, ctx);
    }
    // Trusted, synchronous extension hook for the assisted-onboarding adapter.
    // Its callback receives the full clone to validate collisions and invitation
    // binding. Do not expose this callback boundary as production authorization.
    function transact(expectedRevision, fn, permission) {
      let base;
      let entered = false;
      try {
        if (actor.role === 'leader' && permission!==leaderAssignment&&permission!==crossTypeAction&&!(centralStaff&&staffAllows('canWrite'))) fail('forbidden', 'El líder KAM tiene acceso de consulta. No puede modificar registros ni iniciar acciones del titular.');
        if (running) fail('transaction_busy', 'Hay otra operación CRM en curso.');
        base = read();
        if(centralStaff&&(permission===crossTypeAction?!(staffAllows('canWrite')||staffAllows('canAssign')):!staffAllows(permission===configAction?'canConfigure':permission===leaderAssignment?'canAssign':'canWrite')))fail('forbidden','Tu acceso vigente no permite esta operación CRM.');
        if((centralStaff?(staffSession.roles||[]).includes('leader'):actor.role==='leader')&&permission===leaderAssignment&&!intakeConfig(base.state.intakeRouting).leaderCanAssign)fail('forbidden','La asignación por líderes está deshabilitada en Configuración CRM.');
        if (!Number.isSafeInteger(expectedRevision)) fail('revision_required', 'Actualiza el registro antes de guardar.');
        if (expectedRevision !== base.state.revision) fail('stale_revision', 'Los datos cambiaron en otra vista. Actualiza antes de guardar; no se aplicaron tus cambios.');
        if (typeof fn !== 'function') fail('invalid_transaction', 'La operación CRM no es válida.');
        running = true; entered = true;
        const directoryRevision=staffAccess?staffAccess.getVersion():null;
        const draft = clone(base.state), ctx = { actor, now: getNow() };
        if(permission===leaderAssignment)assignmentProofs.add(draft);
        if(permission===crossTypeAction)crossTypeProofs.add(draft);
        const reservedIds = new Set();
        ctx.id = prefix => { for (let n = 0; n < 20; n++) { const id = uniqueId(prefix, draft); if (!reservedIds.has(id)) { reservedIds.add(id); return id; } } fail('id_collision', 'No se pudo generar un identificador nuevo.'); };
        ctx.append = (key, record) => append(draft, key, record, ctx);
        ctx.canAccessContact = id => canAccess(draft.contacts[id]);
        ctx.canEditContact = id => centralStaff?staffAccess.can(staffSession,'crmEdit',draft.contacts[id]):['admin','kam'].includes(actor.role)&&canAccess(draft.contacts[id]);
        ctx.makeContact = input => makeContact(input, draft, ctx);
        // v36c: a holder marks the single KAM-created contact it claims by verified email/phone in this write.
        ctx.markSelfClaim = id => { if (actor.role !== 'holder' || holderClaimProofs.has(draft)) fail('forbidden', 'Reclamo no permitido.'); holderClaimProofs.set(draft, id); };
        const value = fn(draft, Object.freeze(ctx));
        if (value && typeof value.then === 'function') fail('async_transaction', 'La operación local debe ser síncrona.');
        for(const exp of Object.values(draft.expedients)){const c=draft.contacts[exp.contactId];if(exp.entryLink&&exp.entryLink.status==='active'&&c&&(c.stage==='not_interested'||c.deletedAt)){exp.entryLink.status='revoked';exp.entryLink.revokedAt=ctx.now;exp.entryLink.reason=c.deletedAt?'archived':'not_interested';}}
        assertInvariants(base.state, draft, ctx);
        // Compare the raw value, too: catches reentrant callbacks and same-revision edits.
        let current;
        try { current = storage.getItem(STORAGE_KEY); } catch (_) { fail('storage_unavailable', 'No se pudo comprobar el almacenamiento local.'); }
        if ((current == null ? null : current) !== base.raw) fail('stale_revision', 'Los datos cambiaron mientras se guardaban. Actualiza antes de continuar.');
        assertCurrent();
        if(staffAccess&&staffAccess.getVersion()!==directoryRevision)fail('stale_directory','El directorio cambió durante la operación. Actualiza antes de guardar.');
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
    // Public extension callbacks for a KAM receive only their current portfolio.
    // Merge the visible delta into the private full draft, then run the same global
    // collision, identity, holder and append-only checks used by domain methods.
    function scopedTransact(expectedRevision, fn) {
      if ((!centralStaff&&actor.role !== 'kam'||centralStaff&&actor.role==='admin') || typeof fn !== 'function') return transact(expectedRevision, fn);
      return transact(expectedRevision, (draft, ctx) => {
        const visible = project(draft, null, true), before = clone(visible);
        for (const key of MAPS) visible[key] = new Proxy(visible[key], { get(target, id, receiver) {
          if (typeof id === 'string' && !has(target, id) && has(draft[key], id)) fail('forbidden', 'El registro no está disponible en esta cartera.');
          return Reflect.get(target, id, receiver);
        } });
        const scopedContext = Object.freeze(Object.assign({}, ctx, {
          append: (key, record) => append(visible, key, record, ctx),
          canAccessContact: id => canAccess(visible.contacts[id])
        }));
        const result = fn(visible, scopedContext);
        if (result && typeof result.then === 'function') fail('async_transaction', 'La operación local debe ser síncrona.');
        for (const key of new Set([...Object.keys(before), ...Object.keys(visible)])) {
          if (!MAPS.includes(key)) { if (!equal(before[key], visible[key])) fail('protected_state', 'No se permite modificar los metadatos del almacén CRM.'); continue; }
          if (!plain(visible[key])) fail('invalid_storage', 'La colección CRM no es válida.');
          for (const id of Object.keys(before[key])) if (!has(visible[key], id)) delete draft[key][id];
          for (const [id, record] of Object.entries(visible[key])) {
            if (!has(before[key], id) && has(draft[key], id)) fail('forbidden', 'El identificador pertenece a un registro fuera de esta cartera.');
            if (!equal(before[key][id], record)) draft[key][id] = clone(record);
          }
        }
        return result;
      });
    }
    function getIntakeRouting(){return intakeConfig(read().state.intakeRouting);}
    function listIntakeRoutingHistory(){requireAdmin('canConfigure');return Object.values(read().state.audit).filter(a=>a.action==='intake_routing_changed').map(a=>({id:a.id,at:a.createdAt,actorId:a.actorId,actorRole:a.actorRole,before:clone(a.before),after:clone(a.after),reason:a.reason})).sort((a,b)=>b.at.localeCompare(a.at)||b.id.localeCompare(a.id));}
    function reassignContacts(contactIds,kamId,reason,revision){return transact(revision,(draft,ctx)=>{
      requireAdmin('canAssign');if(!Array.isArray(contactIds)||!contactIds.length||contactIds.length>500||new Set(contactIds).size!==contactIds.length||contactIds.some(id=>!isId(id)))fail('invalid_selection','Selecciona contactos distintos para reasignar.');
      if(kamId!==null&&!(centralStaff?validAssignment(kamId):kamId===actor.id||validAssignment(kamId)))fail('invalid_actor','Selecciona Administración o un KAM activo.');
      const note=text(reason,2000,true),contacts=contactIds.map(id=>requireContact(draft,id));
      for(const contact of contacts){if(contact.assignedKam===kamId)continue;const from=contact.assignedKam;contact.assignedKam=kamId;contact.updatedAt=ctx.now;audit(draft,ctx,'contact_reassigned',contact.id,{from,to:kamId,reason:note});event(draft,ctx,'contact_reassigned',contact,{from,to:kamId});}return contacts;
    },leaderAssignment);}

    function setIntakeRouting(config,reason,revision){return transact(revision,(draft,ctx)=>{
      requireAdmin('canConfigure');const next=intakeConfig(config);if(next.kamIds.some(id=>!eligibleKamIds().includes(id)))fail('invalid_intake_config','Selecciona únicamente KAMs activos del directorio.');
      if(next.mode==='round_robin'&&!next.kamIds.length)fail('invalid_intake_config','Selecciona al menos un KAM activo para el reparto por turnos.');
      for(const role of ['admin','leader'])if(next[role+'OwnerId']&&!intakeRecipients().some(r=>r.id===next[role+'OwnerId']&&r.role===role))fail('invalid_intake_config','Selecciona un responsable activo para '+(role==='admin'?'Administración':'Líder KAM')+'.');
      if(next.mode==='admin'||next.mode==='leader'){const owner=intakeOwner(next,next.mode);if(!owner)fail('invalid_intake_config','Selecciona un responsable activo para '+(next.mode==='admin'?'Administración':'Líder KAM')+'.');next[next.mode+'OwnerId']=owner;}
      const previous=intakeConfig(draft.intakeRouting),note=text(reason,2000,true);
      if(equal(previous,next))return next;
      draft.intakeRouting=next;intakeProof(draft).config=clone(next);
      audit(draft,ctx,'intake_routing_changed',null,{before:previous,after:clone(next),reason:note});return next;
    },configAction);}
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
    // Clearly fictitious demo numbers (55 0000 0xxx) used only by sample fixtures.
    function demoFixturePhone(owner,index){let hash=0;for(const ch of String(owner))hash=(hash*31+ch.codePointAt(0))%300;return '5500000'+String(100+hash*3+index).padStart(3,'0').slice(-3);}
    function seedExamples(revision) {
      return transact(revision, (draft, ctx) => {
        requireStaff();
        const owner=actor.role==='admin'?(centralStaff?actor.id:'kam_ana'):actor.id, suffix=owner==='kam_ana'?'':owner==='kam_luis'?'+kam_luis':'+kam_'+Array.from(owner).map(c=>c.codePointAt(0).toString(16).padStart(6,'0')).join('');
        const samples=[['patient','Mariana Flores · DEMO','mariana','manual','Confirmar dudas del registro ficticio',0],['patient','Pablo Reyes · DEMO','pablo','direct_unknown','Retomar contacto demo',-1],['doctor','Clínica Horizonte · DEMO','clinica','manual','Presentar recorrido para proveedor demo',2]];
        const contacts=[];let created=0;
        samples.forEach((sample,index)=>{
          const [type,name,handle,originalSource,title,offset]=sample,key=owner+':'+handle;
          const email=handle+'.demo'+suffix+'@example.test',phone=owner==='kam_ana'||owner==='kam_luis'?'+1202555010'+(index+1+(owner==='kam_luis'?3:0)):demoFixturePhone(owner,index);
          const candidates=Object.values(draft.contacts).filter(c=>c.demoFixtureKey===key||c.type===type&&c.email===email&&c.phone===normalizePhone(phone)&&c.name===name);
          if(candidates.length>1||candidates.some(c=>!canAccess(c)))fail('demo_unavailable','Los ejemplos anteriores no están disponibles en esta cartera. Crea un prospecto o consulta a Administración.');
          let contact=candidates[0],isNew=!contact;
          // Demo fixtures only: a legacy fixture saved without phone receives its clearly fictitious demo number.
          if(contact&&contact.demoFixtureKey===key&&!contact.phone){contact.phone=normalizePhone(phone);contact.updatedAt=ctx.now;audit(draft,ctx,'contact_updated',contact.id,{changedFields:['phone'],reason:'Teléfono ficticio de ejemplo DEMO'});}
          if(isNew){
            contact=ctx.makeContact({type,name,email,phone,originalSource,assignedKam:owner});
            if(typeof options.findExistingAccount==='function'&&options.findExistingAccount(clone(contact)))fail('demo_unavailable','No se pudieron cargar los ejemplos por un conflicto con datos existentes. No se modificó la cartera.');
            contact.demoFixtureKey=key;draft.contacts[contact.id]=contact;created++;
            audit(draft,ctx,'contact_created',contact.id);event(draft,ctx,'contact_created',contact);
          }
          // A completed, renamed or otherwise edited fixture task is never reset.
          // Legacy partial loads without any task can safely receive their first one.
          if(isNew||!contact.demoFixtureKey&&!Object.values(draft.tasks).some(t=>t.contactId===contact.id)){
            const due=new Date(ctx.now);due.setUTCDate(due.getUTCDate()+offset);
            const task={id:ctx.id('task'),contactId:contact.id,title,dueAt:due.toISOString(),status:'open',closeReason:null,createdAt:ctx.now,createdBy:actor.id,updatedAt:ctx.now,closedAt:null,closedBy:null};
            draft.tasks[task.id]=task;audit(draft,ctx,'task_created',contact.id,{taskId:task.id});event(draft,ctx,'task_created',contact,{taskId:task.id});
          }
          contacts.push(contact);
        });
        return {contacts,created};
      });
    }
    function updateContact(id, patch, revision) {
      return transact(revision, (draft, ctx) => {
        requireStaff();
        const contact = requireContact(draft, id), allowed = ['name', 'email', 'phone', 'notes', 'marketingConsent'];
        if (!plain(patch) || Object.keys(patch).some(k => !allowed.includes(k))) fail('protected_field', 'Actualiza sólo nombre, correo, teléfono, notas o el consentimiento de mensajes.');
        const before = clone(contact);
        if (has(patch, 'name')) contact.name = text(patch.name, 160, true);
        if (has(patch, 'email')) contact.email = normalizeEmail(patch.email);
        if (has(patch, 'phone')) contact.phone = normalizePhone(patch.phone);
        if (has(patch, 'email') && (!contact.email || !validEmail(contact.email))) fail('invalid_contact', 'El correo es obligatorio y debe ser válido.');
        if (has(patch, 'phone') && (!contact.phone || !/^\d{7,15}$/.test(contact.phone))) fail('invalid_contact', 'El teléfono es obligatorio: captura de 7 a 15 dígitos.');
        if (has(patch, 'notes')) contact.notes = text(patch.notes, 6000, false);
        if (has(patch, 'marketingConsent')) {
          if (typeof patch.marketingConsent !== 'boolean') fail('invalid_contact', 'El consentimiento de mensajes es sí o no.');
          contact.marketingConsent = patch.marketingConsent;
        }
        if (equal(before, contact)) return contact;
        // A failed attempt to assist may already have created an empty draft.
        // Keep its contact seed consistent when adding the first email, without
        // touching claimed, captured or submitted onboarding records.
        Object.values(draft.expedients||{}).forEach(exp=>{
          if(exp.contactId!==id||exp.holderIdentity||exp.initialRegistration||exp.onboarding||exp.submissionSnapshot)return;
          for(const [field,key] of [['fullName','name'],['email','email'],['phone','phone']]){
            if(!has(patch,key)||exp.fields[field]&&exp.fields[field]!==before[key])continue;
            exp.fields[field]=contact[key];
            (exp.fieldHistory[field]??=[]).push({value:contact[key],actorId:actor.id,actorRole:actor.role,at:ctx.now,source:'assisted'});
          }
          exp.updatedAt=ctx.now;
        });
        contact.updatedAt = ctx.now;
        audit(draft, ctx, 'contact_updated', id, { changedFields: Object.keys(patch) });
        return contact;
      });
    }
    // Canonical staff-only commercial transition. It never creates an expediente,
    // performs a holder submission or updates a backoffice/financial decision.
    // A repeated drop is a no-op, including its optional follow-up task.
    function moveCommercialStage(id, stage, details, revision) {
      if (typeof details === 'number' && revision === undefined) { revision = details; details = {}; }
      details = details || {};
      return transact(revision, (draft, ctx) => {
        requireStaff(); const contact = requireContact(draft, id);
        if (!plain(details) || Object.keys(details).some(key => !['reason', 'nextAction', 'nextActionAt', 'expectedStage'].includes(key))) fail('protected_field', 'El cambio comercial sólo admite motivo, siguiente acción y etapa de origen.');
        if (!COMMERCIAL_STAGES[contact.type].includes(stage)) fail('invalid_stage', 'Selecciona una etapa comercial del mismo tipo. El envío lo confirma el titular y la aprobación se consulta en administración.');
        if (has(details, 'expectedStage') && details.expectedStage !== contact.stage) fail('stale_stage', 'La etapa cambió desde que abriste esta tarjeta. Actualiza antes de moverla.');
        if (contact.stage === 'submitted') fail('stage_read_only', 'El contacto ya fue enviado a revisión. El envío y las decisiones de backoffice se conservan sin cambios.');
        const reason = text(has(details, 'reason') ? details.reason : contact.stage === stage ? contact.stageReason || '' : '', 2000, ['no_response', 'not_interested'].includes(stage));
        const nextAction = text(details.nextAction || '', 300, false), nextActionAt = details.nextActionAt ? iso(details.nextActionAt, 'próxima acción') : null;
        if (nextActionAt && !nextAction) fail('invalid_task', 'La próxima acción necesita una descripción.');
        if (contact.stage === stage && (contact.stageReason || '') === reason) return contact;
        const from = contact.stage;
        contact.stage = stage; contact.stageReason = reason || null; contact.updatedAt = ctx.now;
        const record = { contactId: id, type: 'stage_change', summary: from + ' → ' + stage + (reason ? ': ' + reason : ''), contactAt: ctx.now, evidence: [], nextAction, nextActionAt };
        if (nextAction && nextActionAt) {
          const task = { id: ctx.id('task'), contactId: id, title: nextAction, dueAt: nextActionAt, status: 'open', closeReason: null, createdAt: ctx.now, createdBy: actor.id, updatedAt: ctx.now, closedAt: null, closedBy: null };
          draft.tasks[task.id] = task; record.nextActionTaskId = task.id;
          audit(draft, ctx, 'task_created', id, { taskId: task.id }); event(draft, ctx, 'task_created', contact, { taskId: task.id });
        }
        const transition = { from, to: stage, reason, nextAction, nextActionAt, nextActionTaskId: record.nextActionTaskId || null, source: 'commercial' };
        audit(draft, ctx, 'contact_stage_changed', id, transition);
        event(draft, ctx, 'contact_stage_changed', contact, transition);
        ctx.append('activities', record);
        return contact;
      });
    }
    // Compatibility entry point shares the same validation and atomic boundary.
    function setStage(id, stage, details, revision) { return moveCommercialStage(id, stage, details, revision); }
    function reassignContact(id, kamId, reason, revision) {
      return transact(revision, (draft, ctx) => {
        if (centralStaff?!staffAllows('canAssign'):actor.role !== 'admin' && actor.role !== 'leader') fail('forbidden', 'Tu permiso vigente no permite reasignar contactos.');
        const contact = requireContact(draft, id); if (kamId !== null && !isId(kamId)) fail('invalid_actor', 'Selecciona un KAM válido.');
        if((centralStaff||actor.role==='leader')&&!validAssignment(kamId))fail('invalid_actor','Selecciona Administración o un KAM activo.');
        if(!staffAllows('canAssign'))fail('forbidden','La asignación ya no está autorizada para esta sesión.');
        const note = text(reason, 2000, true); if (contact.assignedKam === kamId) return contact;
        const from = contact.assignedKam; contact.assignedKam = kamId; contact.updatedAt = ctx.now;
        audit(draft, ctx, 'contact_reassigned', id, { from, to: kamId, reason: note });
        event(draft, ctx, 'contact_reassigned', contact, { from, to: kamId }); return contact;
      },leaderAssignment);
    }
    function deleteContact(id, reason, revision) {
      return transact(revision, (draft, ctx) => {
        requireAdmin(); const contact = requireContact(draft, id), note = text(reason, 2000, true);
        assertProspectLifecycle(draft, contact);
        contact.deletedAt = ctx.now; contact.updatedAt = ctx.now;
        audit(draft, ctx, 'contact_archived', id, { reason: note }); return contact;
      });
    }
    function restoreContact(id, reason, revision) {
      return transact(revision, (draft, ctx) => {
        requireAdmin(); const contact = draft.contacts[id], note = text(reason, 2000, true);
        if (!contact || !contact.deletedAt) fail('archived_contact_not_found', 'No se encontró el contacto archivado.');
        assertProspectLifecycle(draft, contact);
        contact.deletedAt = null; contact.updatedAt = ctx.now;
        audit(draft, ctx, 'contact_restored', id, { reason: note }); return contact;
      });
    }
    function listArchivedContacts(filter) {
      requireAdmin(); filter = filter || {};
      const query = String(filter.query || '').trim().toLowerCase();
      return Object.values(read().state.contacts).filter(c => c.deletedAt && (!filter.type || c.type === filter.type) && (!filter.stage || c.stage === filter.stage) && (!filter.assignedKam || c.assignedKam === filter.assignedKam) && (!query || [c.name, c.email, c.phone, c.id].some(x => String(x).toLowerCase().includes(query)))).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt) || a.id.localeCompare(b.id)).map(clone);
    }
    function getArchivedContact(id) {
      requireAdmin(); const contact = read().state.contacts[id];
      if (!contact || !contact.deletedAt) fail('archived_contact_not_found', 'No se encontró el contacto archivado.');
      return clone(contact);
    }
    // v36: repeated registration with an existing email/phone. Creates or bumps ONE open alert task
    // for the existing contact's responsable. Returns nothing about the contact (no data leak).
    function noteDuplicateRegistration(input, revision) {
      return transact(revision, (draft, ctx) => {
        if (actor.role !== 'holder') fail('holder_required', 'El aviso de registro repetido corresponde al titular.');
        const mail = normalizeEmail(input && input.email), phone = normalizePhone(input && input.phone), type = input && input.type, cross = !!(input && input.crossType);
        if (!STAGES[type]) fail('invalid_type', 'Tipo de registro inválido.');
        const matches = c => !c.deletedAt && (mail && c.email === mail || phone && c.phone === phone);
        const targets = cross ? Object.values(draft.contacts).filter(c => matches(c) && c.type !== type) : Object.values(draft.contacts).filter(c => matches(c) && c.type === type);
        const kind = cross ? 'cross_type_request' : 'duplicate_registration', due = new Date(Date.parse(ctx.now) + 24 * 3600000).toISOString();
        for (const c of targets.slice(0, 2)) {
          const by = mail && c.email === mail ? 'correo' : 'celular';
          const open = Object.values(draft.tasks).find(t => t.kind === kind && t.contactId === c.id && t.status === 'open' && (!cross || t.requestedType === type));
          if (open) { open.attempts = (open.attempts || 1) + 1; open.lastAttemptAt = ctx.now; open.lastMatchedBy = by; open.updatedAt = ctx.now; audit(draft, ctx, 'task_updated', c.id, { taskId: open.id }); continue; }
          const title = cross ? (c.name || 'El contacto') + ' quiere registrarse también como ' + TYPE_LABEL[type] + ' · revisa «Habilitar también como ' + TYPE_LABEL[type] + '»' : (c.name || 'El contacto') + ' intentó registrarse de nuevo';
          const task = { id: ctx.id('task'), contactId: c.id, kind, title: text((title + (c.assignedKam ? '' : ' · Asigna un responsable')).slice(0, 300), 300, true), dueAt: due, status: 'open', closeReason: null, createdAt: ctx.now, createdBy: actor.id, updatedAt: ctx.now, closedAt: null, closedBy: null, attempts: 1, lastAttemptAt: ctx.now, lastMatchedBy: by, demo: true };
          if (cross) task.requestedType = type;
          draft.tasks[task.id] = task; audit(draft, ctx, 'task_created', c.id, { taskId: task.id, reason: kind, matchedBy: by }); event(draft, ctx, cross ? 'cross_type_registration_attempt' : 'duplicate_registration_attempt', c, { taskId: task.id, matchedBy: by });
        }
        return { noted: targets.length > 0 };
      });
    }
    // v36c: «Habilitar también como paciente/doctor» on the CRM ficha. Responsable KAM, leader or admin; history keeps who, when and motivo.
    // Toggling also closes the open cross-type request task as done, with the resolution (enabled/rejected).
    function setCrossTypeAccess(contactId, type, enabled, reason, revision) {
      return transact(revision, (draft, ctx) => {
        if (!['admin', 'leader', 'kam'].includes(actor.role)) fail('forbidden', 'Sólo el equipo PULZZO cambia esta habilitación.'); const c = requireContact(draft, contactId);
        if (!STAGES[type] || type === c.type) fail('invalid_type', 'Selecciona el otro tipo de registro.');
        if (!centralStaff && !(actor.role === 'admin' || actor.role === 'leader' || actor.role === 'kam' && c.assignedKam === actor.id)) fail('forbidden', 'Sólo el KAM responsable, el líder o Administración pueden cambiarlo.');
        if (centralStaff && !(staffAccess.can(staffSession, 'crmEdit', c) || staffAccess.can(staffSession, 'crmAssign', c))) fail('forbidden', 'Sólo el KAM responsable, el líder o Administración pueden cambiarlo.');
        const on = enabled === true, why = reason == null || String(reason).trim() === '' ? null : text(reason, 500, true);
        const current = c.crossTypeAccess && c.crossTypeAccess[type];
        const openTasks = Object.values(draft.tasks).filter(t => t.kind === 'cross_type_request' && t.contactId === c.id && t.status === 'open' && t.requestedType === type);
        if (!!(current && current.enabled) === on && !openTasks.length) return clone(c);
        c.crossTypeAccess = Object.assign({}, c.crossTypeAccess || {}, { [type]: { enabled: on, changedAt: ctx.now, changedBy: actor.id, reason: why } });
        c.crossTypeHistory = (c.crossTypeHistory || []).concat([{ type, enabled: on, at: ctx.now, by: actor.id, byRole: actor.role, reason: why }]);
        c.updatedAt = ctx.now;
        audit(draft, ctx, 'cross_type_access_changed', c.id, { contactType: type, enabled: on, reason: why });
        event(draft, ctx, 'cross_type_access_changed', c, { contactType: type, enabled: on });
        for (const t of openTasks) {
          t.status = 'closed'; t.closedAt = ctx.now; t.closedBy = actor.id; t.updatedAt = ctx.now; t.resolution = on ? 'enabled' : 'rejected';
          t.closeReason = text((on ? 'Hecha: habilitado también como ' : 'Hecha: rechazado registro como ') + TYPE_LABEL[type] + ' desde la ficha CRM' + (why ? ' · ' + why : ''), 2000, true);
          audit(draft, ctx, 'task_closed', c.id, { taskId: t.id, reason: t.closeReason, resolution: t.resolution, auto: 'cross_type_toggle' }); event(draft, ctx, 'task_closed', c, { taskId: t.id, resolution: t.resolution });
        }
        return clone(c);
      }, crossTypeAction);
    }
    // v36c: what a self-registration may do when its email/phone already exists in the other type (no ids leaked to the holder).
    function crossTypeEligibility(input) {
      const state = read().state, mail = normalizeEmail(input && input.email), phone = normalizePhone(input && input.phone), type = input && input.type;
      const others = Object.values(state.contacts).filter(c => !c.deletedAt && STAGES[type] && c.type !== type && (mail && c.email === mail || phone && c.phone === phone));
      if (!others.length) return { match: false, allowed: false };
      const matchedBy = others.some(c => mail && c.email === mail) ? 'email' : 'phone';
      return { match: true, matchedBy, otherType: others[0].type, allowed: others.every(c => c.crossTypeAccess && c.crossTypeAccess[type] && c.crossTypeAccess[type].enabled === true) };
    }
    // v36c: state of a referral token at registration (active, revoked or KAM inactive) and the advisor of a matching KAM-created contact.
    function referralStatus(token, type) {
      const r = Object.values(read().state.referrals).find(x => x.token === token);
      if (!r || r.type !== type) return { status: 'invalid' };
      const status = r.active === false ? 'revoked' : staffAccess && !eligibleKamIds().includes(r.kamId) ? 'kam_inactive' : 'active';
      return { status, referralId: r.id, kamId: r.kamId };
    }
    function advisorFor(input) {
      const state = read().state, mail = normalizeEmail(input && input.email), phone = normalizePhone(input && input.phone), type = input && input.type;
      const c = Object.values(state.contacts).find(x => !x.deletedAt && x.type === type && !x.holderId && !x.accountId && !x.accountExists && (mail && x.email === mail || phone && x.phone === phone));
      if (!c) return null;
      let name = null; try { const row = staffAccess && staffAccess.getIntakeKamRoster().find(k => k.id === c.assignedKam); name = row ? row.name : null; } catch (_) { name = null; }
      return { kamId: c.assignedKam || null, kamName: name };
    }
    // v36: true when the same phone also belongs to a contact of the other type (review flag on both fichas).
    function sharedPhoneAcrossTypes(contactId) {
      const state = read().state, c = state.contacts[contactId];
      if (!c || !c.phone || !canAccess(c)) return false;
      return Object.values(state.contacts).some(o => o.id !== c.id && !o.deletedAt && o.phone === c.phone && o.type !== c.type);
    }
    // v36: referral links. One reusable link per KAM and type, no expiry; admin/leader may revoke with a reason.
    function listReferrals(filter) {
      const state = read().state; filter = filter || {};
      if (!['admin', 'leader', 'kam'].includes(actor.role)) fail('forbidden', 'Solo el equipo PULZZO consulta enlaces de referido.');
      return Object.values(state.referrals).filter(r => actor.role !== 'kam' ? true : r.kamId === actor.id).filter(r => !filter.type || r.type === filter.type).map(r => { const v = clone(r); v.kamActive = !staffAccess || eligibleKamIds().includes(r.kamId); if (actor.role === 'leader' && v.kamId !== actor.id) delete v.token; return v; });
    }
    function revokeReferral(id, reason, revision) {
      return transact(revision, (draft, ctx) => {
        if (!['admin', 'leader'].includes(actor.role)) fail('forbidden', 'Solo Administración o el líder pueden revocar un enlace de referido.');
        const ref = draft.referrals[id]; if (!ref) fail('not_found', 'No existe el enlace.');
        if (ref.active === false) fail('already_revoked', 'El enlace ya estaba revocado.');
        const why = text(reason, 500, true);
        ref.active = false; ref.revokedAt = ctx.now; ref.revokedBy = actor.id; ref.revokeReason = why;
        audit(draft, ctx, 'referral_revoked', null, { referralId: ref.id, kamId: ref.kamId, contactType: ref.type, reason: why });
        return clone(ref);
      });
    }
    function createReferral(type, revision) {
      return transact(revision, (draft, ctx) => {
        requireStaff(); const kamId = plain(type) ? type.kamId : actor.id, kind = plain(type) ? type.type : type;
        if (!STAGES[kind] || !isId(kamId) || actor.role === 'kam' && kamId !== actor.id||centralStaff&&(!eligibleKamIds().includes(kamId)||actor.role!=='admin'&&kamId!==actor.id)) fail('invalid_referral', 'Selecciona un KAM y tipo válidos.');
        const existing = Object.values(draft.referrals).find(r => r.kamId === kamId && r.type === kind && r.active !== false);
        if (existing) return existing;
        const ref = { id: ctx.id('ref'), token: ctx.id('r'), kamId, type: kind, active: true, createdAt: ctx.now, createdBy: actor.id, demo: true };
        draft.referrals[ref.id] = ref; audit(draft, ctx, 'referral_created', null, { referralId: ref.id, kamId, contactType: kind }); return ref;
      });
    }
    function resolveReferral(token, type) {
      try { const state = read().state, referral = referralFor(state, token, type); if (actor.role === 'kam' && referral.kamId !== actor.id) fail('forbidden', 'El enlace corresponde a otra cartera KAM.'); const value = clone(referral); if (actor.role === 'leader'&&!(centralStaff&&value.kamId===actor.id&&eligibleKamIds().includes(actor.id))) delete value.token; return { ok: true, value, revision: state.revision }; }
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
        requireStaff(); if (String(id).startsWith('doctor-photo:')) fail('system_task', 'La tarea se cierra únicamente cuando la fotografía se publica; cargarla como borrador no la cierra.'); const task = draft.tasks[id]; if (!task) fail('task_not_found', 'No se encontró la tarea.'); requireContact(draft, task.contactId);
        if (task.status !== 'open') fail('task_closed', 'La tarea ya está cerrada.');
        if (!plain(patch) || Object.keys(patch).some(k => !['title', 'dueAt'].includes(k))) fail('protected_field', 'Sólo puedes cambiar el título y vencimiento.');
        if (has(patch, 'title')) task.title = text(patch.title, 300, true);
        if (has(patch, 'dueAt')) task.dueAt = iso(patch.dueAt, 'próxima acción');
        task.updatedAt = ctx.now; audit(draft, ctx, 'task_updated', task.contactId, { taskId: id }); return task;
      });
    }
    function closeTask(id, reason, revision) {
      return transact(revision, (draft, ctx) => {
        requireStaff(); if (String(id).startsWith('doctor-photo:')) fail('system_task', 'La tarea se cierra únicamente cuando la fotografía se publica; cargarla como borrador no la cierra.'); const task = draft.tasks[id]; if (!task) fail('task_not_found', 'No se encontró la tarea.'); const contact = requireContact(draft, task.contactId);
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
          if (['requestId', 'registrationId', 'creditId', 'providerId'].includes(key) && (typeof options.validateExternalReference !== 'function' || options.validateExternalReference(key, input[key], clone(contact)) !== true)) fail('invalid_reference', 'La referencia no está vinculada exactamente a este contacto en administración o no se pudo verificar.');
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
      return Object.values(key === 'tasks' ? taskRecords(state) : state[key]).filter(item => (canAccess(state.contacts[item.contactId]) || key === 'audit' && filter.includeArchived === true && actor.role === 'admin' && state.contacts[item.contactId] && state.contacts[item.contactId].deletedAt) && (!filter.contactId || item.contactId === filter.contactId) && (!filter.status || item.status === filter.status)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).map(clone);
    }
    function operationalStatus(id) {
      const contact = getContact(id);
      if (typeof options.getBackofficeStatus !== 'function') return { status: 'not_linked', label: 'Sin vínculo de backoffice', source: 'backoffice', readOnly: true };
      const status = options.getBackofficeStatus(clone(contact));
      return typeof status === 'string' ? { status, label: status, source: 'backoffice', readOnly: true } : Object.assign({}, clone(status || { status: 'not_linked' }), { source: 'backoffice', readOnly: true });
    }
    function dashboard(filter) {
      filter = filter || {}; const state = read().state, date = new Date(getNow()), currentPeriod = businessMonth(date);
      const year = filter.year == null ? currentPeriod.year : Number(filter.year), month = filter.month == null ? currentPeriod.month : Number(filter.month);
      if (!Number.isInteger(year) || year < 2000 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) fail('invalid_period', 'Selecciona un mes y año válidos.');
      if (actor.role === 'kam' && filter.kamId && filter.kamId !== actor.id) fail('forbidden', 'Un KAM sólo puede consultar su cartera DEMO.');
      const contacts = Object.values(state.contacts).filter(c => canAccess(c) && (!filter.type || c.type === filter.type) && (!filter.kamId || c.assignedKam === filter.kamId));
      const ids = new Set(contacts.map(c => c.id));
      const events = Object.values(state.events).filter(e => {
        const at = e.type === 'activity_recorded' ? e.contactAt || state.activities[e.activityId] && state.activities[e.activityId].contactAt || e.createdAt : e.createdAt;
        const period = businessMonth(at);
        return ids.has(e.contactId) && period && period.year === year && period.month === month && Date.parse(at) <= date.getTime();
      });
      const createdEvents = events.filter(e => ['contact_created', 'self_service_created'].includes(e.type));
      const newIds = new Set(createdEvents.map(e => e.contactId));
      const activities = events.filter(e => e.type === 'activity_recorded');
      const submitted = new Set(events.filter(e => ['holder_submitted', 'onboarding_submitted', 'expedient_submitted'].includes(e.type) && e.expedientId && state.expedients[e.expedientId] && state.expedients[e.expedientId].contactId === e.contactId && state.expedients[e.expedientId].submittedAt === e.createdAt && e.actorRole === 'holder').map(e => e.contactId));
      const started = new Set(events.filter(e => ['onboarding_started', 'expedient_created', 'assisted_draft_created', 'self_service_created'].includes(e.type) && e.expedientId && state.expedients[e.expedientId] && state.expedients[e.expedientId].contactId === e.contactId && state.expedients[e.expedientId].createdAt === e.createdAt).map(e => e.contactId));
      const openTasks = Object.values(taskRecords(state)).filter(t => ids.has(t.contactId) && t.status === 'open');
      const byStage = { patient: {}, doctor: {} }; for (const type of Object.keys(STAGES)) for (const stage of STAGES[type]) byStage[type][stage] = 0;
      for (const contact of contacts) byStage[contact.type][contact.stage]++;
      const kams = new Set(contacts.map(c => c.assignedKam || 'unassigned'));
      const byKam = Array.from(kams).sort().map(kamId => { const ownIds = new Set(contacts.filter(c => (c.assignedKam || 'unassigned') === kamId).map(c => c.id)); return { kamId, newContacts: Array.from(newIds).filter(id => ownIds.has(id)).length, activities: activities.filter(e => ownIds.has(e.contactId)).length, submitted: Array.from(submitted).filter(id => ownIds.has(id)).length }; });
      return { period: { month, year }, counts: { newContacts: newIds.size, patients: contacts.filter(c => c.type === 'patient' && newIds.has(c.id)).length, doctors: contacts.filter(c => c.type === 'doctor' && newIds.has(c.id)).length, activities: activities.length, openTasks: openTasks.length, overdueTasks: openTasks.filter(t => t.dueAt && t.dueAt < getNow()).length, submitted: submitted.size, onboardingStarted: started.size, referralContacts: contacts.filter(c => newIds.has(c.id) && ['referral', 'kam_referral', 'doctor_referral'].includes(c.originalSource)).length }, byStage, byKam, events: clone(events), currentSnapshot: { contacts: contacts.length, openTasks: openTasks.length }, demo: true };
    }
    return Object.freeze({ actor, snapshot, getIntakeRouting, setIntakeRouting, listIntakeRoutingHistory, reassignContacts, transact: scopedTransact, createContact, seedExamples, updateContact, getContact, listContacts, moveCommercialStage, setStage, reassignContact, deleteContact, restoreContact, listArchivedContacts, getArchivedContact, createReferral, resolveReferral, applyReferral, createTask, updateTask, closeTask, addActivity,
      noteDuplicateRegistration, setCrossTypeAccess, crossTypeEligibility, referralStatus, advisorFor, sharedPhoneAcrossTypes, listReferrals, revokeReferral,
      listTasks: filter => listLinked('tasks', filter), listActivities: filter => listLinked('activities', filter), listAudit: filter => listLinked('audit', filter), dashboard, operationalStatus,
      canWriteCRM:()=>{assertCurrent();return centralStaff?staffAllows('canWrite'):['admin','kam'].includes(actor.role);}, canAccessContact: id => canAccess(read().state.contacts[id]), canEditContact:id=>{const c=read().state.contacts[id];return !!c&&(centralStaff?staffAccess.can(staffSession,'crmEdit',c):['admin','kam'].includes(actor.role)&&canAccess(c));}, inspectIdentity, inspectIdentityReview, reviewIdentity, listIdentityReviews, normalizeEmail, normalizePhone });
  }
  return Object.freeze({ STORAGE_KEY, STORE: STORAGE_KEY, VERSION, STAGES, COMMERCIAL_STAGES, SOURCES, ACTIVITY_TYPES, normalizeEmail, normalizePhone, findLegacyIdentity, createStore, createOperationalReader, createKamAttributionReader });
});

/* v70 · D-14: mensajes de validación del navegador en español (es-MX), aunque el navegador esté en inglés.
 * Solo traduce los avisos nativos; no cambia textos de la página ni reglas de validación.
 * Bloque idéntico en patient-demo.js y crm-demo-store.js; se instala una sola vez por página. */
(function(win){
  if(!win||!win.document||typeof win.document.addEventListener!=='function'||win.PulzzoValidacionEs)return;
  function mensaje(el){
    const v=el.validity||{},type=String(el.type||'').toLowerCase(),tag=String(el.tagName||'').toLowerCase();
    if(v.valueMissing){
      if(tag==='select')return 'Selecciona una opción de la lista.';
      if(type==='checkbox')return 'Marca esta casilla para continuar.';
      if(type==='radio')return 'Selecciona una de las opciones.';
      if(type==='file')return 'Selecciona un archivo.';
      return 'Completa este campo.';
    }
    if(v.typeMismatch){
      if(type==='email')return 'Escribe un correo válido, por ejemplo nombre@correo.com.';
      if(type==='url')return 'Escribe una dirección web válida.';
      return 'Revisa el formato de este dato.';
    }
    if(v.badInput)return type==='number'?'Escribe un número válido.':'Revisa el dato escrito.';
    if(v.patternMismatch)return el.getAttribute('title')||'Revisa el formato de este dato.';
    if(v.tooShort)return 'Escribe al menos '+el.minLength+' caracteres.';
    if(v.tooLong)return 'Escribe como máximo '+el.maxLength+' caracteres.';
    if(v.rangeUnderflow)return 'El valor mínimo permitido es '+el.min+'.';
    if(v.rangeOverflow)return 'El valor máximo permitido es '+el.max+'.';
    if(v.stepMismatch)return 'Escribe un valor válido.';
    return 'Revisa este campo.';
  }
  function limpiar(el){if(el&&el.dataset&&el.dataset.validacionEs==='1'){el.setCustomValidity('');delete el.dataset.validacionEs;}}
  function alInvalidar(event){
    const el=event.target;if(!el||typeof el.setCustomValidity!=='function'||!el.validity)return;
    if(el.validity.customError&&el.dataset.validacionEs!=='1')return; // mensaje propio de la página: se respeta
    limpiar(el);if(el.validity.valid)return;
    el.setCustomValidity(mensaje(el));el.dataset.validacionEs='1';
  }
  function alEditar(event){
    const el=event.target;limpiar(el);
    if(el&&el.type==='radio'&&el.name&&el.form)Array.prototype.forEach.call(el.form.querySelectorAll('input[type="radio"]'),r=>{if(r.name===el.name)limpiar(r);});
  }
  win.document.addEventListener('invalid',alInvalidar,true);
  win.document.addEventListener('input',alEditar,true);
  win.document.addEventListener('change',alEditar,true);
  win.PulzzoValidacionEs=Object.freeze({mensaje});
})(typeof window!=='undefined'?window:null);
