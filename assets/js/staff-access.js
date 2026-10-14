/* Pulzzo staff directory and access policy. LOCAL DEMO ONLY.
 * Client storage is inspectable and is not a production authentication boundary.
 * Never enter a real password. Invite passwords use a salted PBKDF2 verifier;
 * plaintext passwords and password hints are never persisted or returned.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(root, require('node:crypto').webcrypto);
  else root.PulzzoStaffAccess = factory(root, root.crypto);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, defaultCrypto) {
  'use strict';
  const STORAGE_KEY = 'pulzzo.staff.directory.v1';
  const SESSION_KEY = 'pulzzo.staff.session.v1';
  const SCHEMA_VERSION = 1;
  const DAY = 86400000;
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const clone = value => JSON.parse(JSON.stringify(value));
  const lookup = (map, id) => typeof id === 'string' && own(map, id) ? map[id] : null;
  const dictionary = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const normalizeEmail = value => String(value || '').normalize('NFKC').trim().toLowerCase();
  const catalog = {
    viewDashboard: ['Dashboard', 'operations'], viewPatients: ['Consultar pacientes', 'patients'],
    viewProviders: ['Consultar doctores y clínicas', 'providers'], viewDocuments: ['Consultar documentos', 'documents'],
    viewPortfolio: ['Consultar cartera', 'portfolio'], viewHistory: ['Consultar historial operativo', 'operations'],
    patientActions: ['Gestión operativa de pacientes', 'patients'], riskActions: ['Análisis de riesgo y ofertas', 'patients'],
    providerActions: ['Gestión de doctores y clínicas', 'providers'], docs: ['Revisión documental', 'documents'],
    notes: ['Notas operativas', 'operations'], payload: ['Consultar datos técnicos', 'patients'],
    approveCredit: ['Aprobar crédito', 'patients'], registerPayments: ['Registrar pagos', 'portfolio'],
    authorizeDisbursement: ['Autorizar dispersiones', 'portfolio'], reversePayments: ['Revertir pagos', 'portfolio'],
    authorizeExtensions: ['Autorizar prórrogas de pago', 'portfolio'],
    manageCollections: ['Seguimiento de cobranza', 'portfolio'],
    crmView: ['Consultar CRM', 'crm'], crmEdit: ['Editar CRM', 'crm'], crmAssign: ['Asignar CRM', 'crm'],
    crmManage: ['Configurar CRM', 'crm'], users: ['Administrar usuarios', 'staff'],
    roles: ['Administrar roles', 'staff'], settings: ['Configuración', 'staff']
  };
  const adminOnly = ['users', 'roles', 'settings', 'crmManage', 'authorizeExtensions'];
  const roleOrder = ['admin', 'leader', 'kam', 'operations', 'risk', 'portfolio', 'provider', 'readonly'];
  function grants(names, scope) { return Object.fromEntries(names.map(name => [name, scope || 'all'])); }
  function seedRoles() {
    return {
      admin: { id: 'admin', label: 'Admin', grants: grants(Object.keys(catalog)), system: true },
      leader: { id: 'leader', label: 'Líder / gerente KAM', grants: grants(['crmView', 'crmAssign']), system: true },
      kam: { id: 'kam', label: 'KAM', grants: grants(['crmView', 'crmEdit'], 'own'), system: true },
      operations: { id: 'operations', label: 'Operaciones', grants: grants(['viewDashboard', 'viewPatients', 'viewDocuments', 'viewPortfolio', 'viewHistory', 'patientActions', 'docs', 'notes', 'manageCollections']), system: true },
      risk: { id: 'risk', label: 'Riesgo', grants: grants(['viewDashboard', 'viewPatients', 'viewPortfolio', 'viewHistory', 'riskActions', 'patientActions', 'notes', 'payload', 'approveCredit', 'manageCollections']), system: true },
      portfolio: { id: 'portfolio', label: 'Cartera / cobranza', grants: grants(['viewDashboard', 'viewPatients', 'viewPortfolio', 'viewHistory', 'notes', 'registerPayments', 'manageCollections']), system: true },
      provider: { id: 'provider', label: 'Gestión de proveedores', grants: grants(['viewDashboard', 'viewProviders', 'viewDocuments', 'viewHistory', 'providerActions', 'docs', 'notes']), system: true },
      readonly: { id: 'readonly', label: 'Solo lectura', grants: grants(['viewDashboard', 'viewPatients', 'viewProviders', 'viewDocuments', 'viewPortfolio', 'viewHistory']), system: true }
    };
  }
  const seeds = [
    ['admin_demo', 'admin@pulzzo.mx', 'Admin Pulzzo', 'admin'],
    ['kam_ana', 'ana.kam@pulzzo.mx', 'Ana · KAM demo', 'kam'],
    ['kam_luis', 'luis.kam@pulzzo.mx', 'Luis · KAM demo', 'kam'],
    ['leader_demo', 'lider.kam@pulzzo.mx', 'Líder KAM demo', 'leader'],
    ['operations_demo', 'operaciones@pulzzo.mx', 'Operaciones Pulzzo', 'operations'],
    ['risk_demo', 'riesgo@pulzzo.mx', 'Riesgo Pulzzo', 'risk'],
    ['portfolio_demo', 'cartera@pulzzo.mx', 'Cartera Pulzzo', 'portfolio'],
    ['provider_demo', 'medicos@pulzzo.mx', 'Equipo médico Pulzzo', 'provider'],
    ['readonly_demo', 'lectura@pulzzo.mx', 'Lectura Pulzzo', 'readonly']
  ];
  function failure(code, message) { const error = new Error(message); error.code = code; return error; }
  function memoryStorage() { const values = new Map(); return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) }; }
  function createStore(options) {
    options = options || {};
    let storage = options.storage;
    if (!storage) { try { storage = root.localStorage; } catch (_) {} }
    storage = storage || memoryStorage();
    const crypto = options.crypto || defaultCrypto;
    const clock = options.now || (() => Date.now());
    const milliseconds = () => { const time = clock(); return time instanceof Date ? time.getTime() : typeof time === 'string' ? Date.parse(time) : Number(time); };
    const stamp = () => new Date(milliseconds()).toISOString();
    const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    const random = prefix => {
      if (!crypto || typeof crypto.getRandomValues !== 'function') throw failure('CRYPTO_UNAVAILABLE', 'La simulación de acceso requiere un navegador con criptografía disponible.');
      return prefix + hex(crypto.getRandomValues(new Uint8Array(24)));
    };
    function fresh() {
      const at = stamp(), users = {};
      for (const [id, email, name, role] of seeds) users[id] = { id, email, name, roles: [role], active: true, status: 'active', demoSeed: true, authentication: 'demo', sessionVersion: 1, createdAt: at, updatedAt: at };
      return { schemaVersion: SCHEMA_VERSION, policyVersion: 2, revision: 1, users, roles: seedRoles(), sessions: {}, invitations: {}, audit: [] };
    }
    function save(state) {
      try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); }
      catch (_) { throw failure('STORAGE_UNAVAILABLE', 'No se pudo guardar el directorio local. No se aplicó el cambio.'); }
    }
    function load() {
      let raw;
      try { raw = storage.getItem(STORAGE_KEY); }
      catch (_) { throw failure('STORAGE_UNAVAILABLE', 'No se puede leer el directorio local.'); }
      if (raw === null || raw === undefined) { const state = fresh(); save(state); return state; }
      let state;
      try { state = JSON.parse(raw); } catch (_) { throw failure('DIRECTORY_INVALID', 'El directorio local no es válido; el acceso está bloqueado.'); }
      if (!state || state.schemaVersion !== SCHEMA_VERSION || !Number.isInteger(state.revision) || !dictionary(state.users) || !dictionary(state.roles) || !dictionary(state.sessions) || !dictionary(state.invitations) || !Array.isArray(state.audit) || state.policyVersion !== undefined && (!Number.isInteger(state.policyVersion) || state.policyVersion < 1 || state.policyVersion > 2)) throw failure('DIRECTORY_INVALID', 'El directorio local no es válido; el acceso está bloqueado.');
      // A narrowly versioned policy addition preserves all saved role edits. A
      // pre-upgrade Admin session must sign in again before using the new grant.
      if ((state.policyVersion || 1) < 2) {
        const admin = lookup(state.roles, 'admin');
        if (!dictionary(admin) || !dictionary(admin.grants) || Object.values(state.users).some(user => !dictionary(user) || !Array.isArray(user.roles) || !Number.isInteger(user.sessionVersion) || user.sessionVersion < 1)) throw failure('DIRECTORY_INVALID', 'El directorio local no tiene una estructura de usuarios y roles válida.');
        admin.grants.authorizeExtensions = 'all';
        for (const user of Object.values(state.users)) if (Array.isArray(user.roles) && user.roles.includes('admin')) invalidate(state, user);
        state.policyVersion = 2;
        state.audit.push({ id: 'migration_staff_extensions_v2', actorId: 'system_staff_policy', actorName: 'Migración demo', action: 'policy_updated', subjectId: 'admin', at: stamp(), before: { policyVersion: 1 }, after: { policyVersion: 2, authorizeExtensions: 'all' } });
        state.revision += 1;
        save(state);
      }
      return state;
    }
    function effective(state, user) {
      const result = {};
      for (const id of user.roles || []) {
        const role = lookup(state.roles, id);
        if (!role) continue;
        for (const [cap, scope] of Object.entries(role.grants || {})) {
          if (!own(catalog, cap) || !['own', 'all'].includes(scope) || adminOnly.includes(cap) && !user.roles.includes('admin')) continue;
          if (scope === 'all' || !result[cap]) result[cap] = scope;
        }
      }
      return result;
    }
    function publicUser(state, user) {
      const role = roleOrder.find(id => user.roles.includes(id)) || user.roles[0];
      return { id: user.id, userId: user.id, crmActorId: user.id, name: user.name, email: user.email, roles: user.roles.slice(), role,
        label: user.roles.map(id => state.roles[id] ? state.roles[id].label : id).join(' + '), active: user.active,
        status: user.status, demoSeed: !!user.demoSeed, sessionVersion: user.sessionVersion, createdAt: user.createdAt, updatedAt: user.updatedAt };
    }
    function savedSession() {
      try { return JSON.parse(storage.getItem(SESSION_KEY) || 'null'); } catch (_) { return null; }
    }
    function resolve(state, reference) {
      if (reference === undefined) reference = savedSession();
      if (!reference || typeof reference !== 'object' || typeof reference.sessionId !== 'string') return null;
      const session = lookup(state.sessions, reference.sessionId);
      if (!session || session.expiresAt <= milliseconds()) return null;
      const user = lookup(state.users, session.userId);
      if (!user || user.active !== true || user.status !== 'active' || session.sessionVersion !== user.sessionVersion || reference.sessionVersion !== user.sessionVersion || reference.userId !== user.id) return null;
      return { ...publicUser(state, user), sessionId: reference.sessionId, issuedAt: session.issuedAt, expiresAt: session.expiresAt };
    }
    function current(reference) { try { return resolve(load(), reference); } catch (_) { return null; } }
    function assertActor(state, reference, cap) {
      const actor = resolve(state, reference);
      if (!actor) throw failure('SESSION_INVALID', 'La sesión ya no es válida. Inicia sesión otra vez.');
      if (cap && !effective(state, state.users[actor.id])[cap]) throw failure('FORBIDDEN', 'Tu cuenta no tiene permiso para esta acción.');
      return actor;
    }
    function audit(state, actor, action, subjectId, before, after) {
      state.audit.push({ id: random('audit_'), actorId: actor.id, actorName: actor.name, action, subjectId, at: stamp(), before: clone(before === undefined ? null : before), after: clone(after === undefined ? null : after) });
    }
    function commit(state, expectedRevision) {
      const present = load();
      if (present.revision !== state.revision || expectedRevision !== undefined && expectedRevision !== state.revision) throw failure('STALE_REVISION', 'El directorio cambió. Actualiza e intenta otra vez.');
      state.revision += 1; save(state);
    }
    function invalidate(state, user) {
      user.sessionVersion += 1;
      for (const [id, session] of Object.entries(state.sessions)) if (session.userId === user.id) delete state.sessions[id];
    }
    function assertLastAdmin(state) {
      if (!Object.values(state.users).some(user => user.active && user.status === 'active' && user.roles.includes('admin'))) throw failure('LAST_ADMIN', 'Debe permanecer al menos un Admin activo con acceso aceptado.');
    }
    function validRoles(state, ids) {
      if (!Array.isArray(ids) || ids.length === 0 || ids.length > 20 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !own(state.roles, id))) throw failure('INVALID_ROLES', 'Selecciona uno o más roles válidos, sin duplicados.');
      return ids.slice().sort((a, b) => (roleOrder.indexOf(a) < 0 ? 99 : roleOrder.indexOf(a)) - (roleOrder.indexOf(b) < 0 ? 99 : roleOrder.indexOf(b)) || a.localeCompare(b));
    }
    function validIdentity(state, input, except) {
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      const email = normalizeEmail(input.email);
      if (!name || name.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw failure('INVALID_IDENTITY', 'Escribe un nombre y correo válidos.');
      if (Object.values(state.users).some(user => user.id !== except && user.email === email)) throw failure('DUPLICATE_EMAIL', 'Ya existe una cuenta con ese correo, incluso si está inactiva.');
      return { name, email };
    }
    function exactKeys(input, allowed) { if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) throw failure('INVALID_FIELDS', 'La solicitud contiene campos no permitidos.'); }
    function issue(state, user) {
      const sessionId = random('session_');
      const entry = { userId: user.id, sessionVersion: user.sessionVersion, issuedAt: stamp(), expiresAt: milliseconds() + DAY };
      state.sessions[sessionId] = entry;
      return { ...publicUser(state, user), sessionId, issuedAt: entry.issuedAt, expiresAt: entry.expiresAt };
    }
    function persistSession(session) {
      try { storage.setItem(SESSION_KEY, JSON.stringify({ sessionId: session.sessionId, userId: session.userId, sessionVersion: session.sessionVersion })); }
      catch (_) { throw failure('STORAGE_UNAVAILABLE', 'No se pudo conservar la sesión local.'); }
      return session;
    }
    function assertOperationCurrent(operation) {
      if (!operation || !own(operation, 'isCurrent')) return;
      let active = false;
      try { active = typeof operation.isCurrent === 'function' && operation.isCurrent() === true; } catch (_) {}
      if (!active) throw failure('OPERATION_CANCELLED', 'La operación fue cancelada. No se guardaron cambios.');
    }
    async function passwordVerifier(password, salt) {
      if (typeof password !== 'string' || password.length < 10 || password.length > 256) throw failure('INVALID_PASSWORD', 'Usa una contraseña exclusiva para esta demo, de 10 a 256 caracteres.');
      if (!crypto || !crypto.subtle || typeof root.TextEncoder !== 'function') throw failure('CRYPTO_UNAVAILABLE', 'No se puede preparar la contraseña demo en este navegador.');
      const key = await crypto.subtle.importKey('raw', new root.TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new root.TextEncoder().encode(salt), iterations: 210000 }, key, 256);
      return hex(new Uint8Array(bits));
    }
    function describe(state, user) {
      const all = effective(state, user), scopes = {};
      for (const [cap, scope] of Object.entries(all)) { const resource = catalog[cap][1]; if (!scopes[resource] || scope === 'all') scopes[resource] = scope; }
      return { capabilities: Object.keys(all), grants: all, scopes: { crm: 'none', patients: 'none', providers: 'none', documents: 'none', portfolio: 'none', operations: 'none', staff: 'none', ...scopes } };
    }
    const api = {
      STORAGE_KEY, SESSION_KEY, SCHEMA_VERSION, normalizeEmail,
      getVersion: () => load().revision,
      capabilityCatalog: () => Object.entries(catalog).map(([id, pair]) => ({ id, label: pair[0], resource: pair[1], adminOnly: adminOnly.includes(id), mandatoryAdmin: adminOnly.includes(id), scopes: pair[1] === 'crm' && !adminOnly.includes(id) ? ['none', 'own', 'all'] : ['none', 'all'] })),
      resolveSession: current, getSession: () => current(),
      loginDemo(email, password) {
        const state = load(), user = Object.values(state.users).find(entry => entry.email === normalizeEmail(email));
        if (!user || !user.active || user.status !== 'active' || !user.demoSeed || user.authentication !== 'demo' || password !== 'pulzzo-demo') throw failure('INVALID_LOGIN', 'Usuario o contraseña demo inválidos.');
        const session = issue(state, user); commit(state); return persistSession(session);
      },
      async login(email, password, operation) {
        assertOperationCurrent(operation);
        const initial = load(), user = Object.values(initial.users).find(entry => entry.email === normalizeEmail(email));
        if (!user || !user.active || user.status !== 'active') throw failure('INVALID_LOGIN', 'Usuario o contraseña demo inválidos.');
        let valid = false;
        if (user.authentication === 'demo' && user.demoSeed) valid = password === 'pulzzo-demo';
        else if (user.authentication === 'password' && user.verifier) valid = await passwordVerifier(password, user.verifier.salt).then(value => value === user.verifier.hash, () => false);
        assertOperationCurrent(operation);
        if (!valid) throw failure('INVALID_LOGIN', 'Usuario o contraseña demo inválidos.');
        const state = load(), live = state.users[user.id];
        if (!live || !live.active || live.status !== 'active' || live.sessionVersion !== user.sessionVersion || live.authentication !== user.authentication || JSON.stringify(live.verifier) !== JSON.stringify(user.verifier)) throw failure('SESSION_INVALID', 'La cuenta cambió. Inicia sesión otra vez.');
        const session = issue(state, live); commit(state); return persistSession(session);
      },
      authenticate(email, password, operation) { return api.login(email, password, operation); },
      logout(reference) {
        const state = load(), session = resolve(state, reference);
        if (session) { delete state.sessions[session.sessionId]; commit(state); }
        const saved = savedSession();
        if (reference === undefined || saved && reference && saved.sessionId === reference.sessionId) storage.removeItem(SESSION_KEY);
        return true;
      },
      can(reference, cap, record) {
        try {
          const state = load(), session = resolve(state, reference);
          if (!session || !own(catalog, cap)) return false;
          const scope = effective(state, state.users[session.id])[cap];
          if (!scope) return false;
          if (scope === 'all' || record === undefined || record === null) return true;
          const owner = typeof record === 'string' ? record : record.assignedKam || record.ownerId || record.assignedTo;
          return owner === session.id;
        } catch (_) { return false; }
      },
      describePermissions(reference) { const state = load(), actor = assertActor(state, reference); return describe(state, state.users[actor.id]); },
      scope(reference, resource) { try { return api.describePermissions(reference).scopes[resource] || 'none'; } catch (_) { return 'none'; } },
      getActor(reference) {
        const session = current(reference); if (!session) return null;
        const crmScope = api.scope(session, 'crm');
        const role = !api.can(session, 'crmView') ? null : session.roles.includes('admin') ? 'admin' : crmScope === 'all' ? 'leader' : crmScope === 'own' ? 'kam' : null;
        return { id: session.id, userId: session.id, name: session.name, email: session.email, roles: session.roles.slice(), role, crmScope, sessionId: session.sessionId, sessionVersion: session.sessionVersion };
      },
      crmContext(reference) {
        const session = current(reference), actor = session && api.getActor(session);
        if (!session || !actor || !actor.role) return { actor: null, scope: 'none', canWrite: false, canAssign: false, canConfigure: false, isCurrent: () => false };
        const scopes = api.describePermissions(session).grants;
        return { actor: { id: actor.id, name: actor.name, role: actor.role }, scope: actor.crmScope, viewScope: scopes.crmView || 'none', writeScope: scopes.crmEdit || 'none', assignScope: scopes.crmAssign || 'none',
          canWrite: api.can(session, 'crmEdit'), canAssign: api.can(session, 'crmAssign'), canConfigure: api.can(session, 'crmManage'), isCurrent: () => { const active = current(); return !!current(session) && !!active && active.sessionId === session.sessionId; } };
      },
      listDemoUsers() { const state = load(); return Object.values(state.users).filter(user => user.demoSeed && user.authentication === 'demo' && user.active && user.status === 'active').map(user => publicUser(state, user)); },
      listKamRoster() { const state = load(); return Object.values(state.users).filter(user => user.active && user.status === 'active' && user.roles.includes('kam') && effective(state, user).crmView).map(user => ({ id: user.id, name: user.name, roles: user.roles.slice(), active: true })); },
      getIntakeKamRoster() { return api.listKamRoster().map(user => ({ id: user.id, name: user.name })); },
      // Public signup needs routing eligibility, never staff identity/contact data.
      getIntakeRecipientRoster() {
        const state = load();
        return Object.values(state.users).filter(user => user.active && user.status === 'active' && effective(state, user).crmView)
          .flatMap(user => ['admin', 'leader'].filter(role => user.roles.includes(role)).map(role => ({ id: user.id, role })));
      },
      getCrmRoster(reference) {
        const state = load(); assertActor(state, reference, 'crmView');
        return Object.values(state.users).filter(user => effective(state, user).crmView || user.roles.some(role => ['admin', 'leader', 'kam'].includes(role))).map(user => {
          const access = describe(state, user), crmScope = access.scopes.crm;
          const role = !access.grants.crmView ? null : user.roles.includes('admin') ? 'admin' : crmScope === 'all' ? 'leader' : crmScope === 'own' ? 'kam' : null;
          return { id: user.id, name: user.name, role, crmScope, active: user.active && user.status === 'active' && !!access.grants.crmView };
        });
      },
      listAssignableUsers(reference, capabilities) {
        const state = load(), actor = assertActor(state, reference);
        const access = effective(state, state.users[actor.id]);
        if (!['viewPatients', 'viewProviders', 'viewDocuments'].some(cap => access[cap])) throw failure('FORBIDDEN', 'No tienes acceso al directorio operativo.');
        if (!Array.isArray(capabilities) || capabilities.some(cap => !own(catalog, cap))) throw failure('INVALID_CAPABILITIES', 'Los permisos de asignación no son válidos.');
        return Object.values(state.users).filter(user => user.active && user.status === 'active' && capabilities.every(cap => effective(state, user)[cap])).map(user => ({ id: user.id, name: user.name, email: user.email, roles: user.roles.slice(), grants: effective(state, user) }));
      },
      listUsers(reference) { const state = load(); assertActor(state, reference, 'users'); return Object.values(state.users).map(user => publicUser(state, user)); },
      listRoles(reference) { const state = load(); assertActor(state, reference, 'roles'); return clone(Object.values(state.roles)); },
      previewRoles(reference, roles) { const state = load(); assertActor(state, reference, 'roles'); return describe(state, { roles: validRoles(state, roles) }); },
      createUser(reference, input, expectedRevision) {
        const state = load(), actor = assertActor(state, reference, 'users'); exactKeys(input, ['name', 'email', 'roles']);
        const identity = validIdentity(state, input), roles = validRoles(state, input.roles), at = stamp(), id = random('staff_');
        const user = { ...identity, id, roles, active: true, status: 'invited', demoSeed: false, authentication: 'pending', sessionVersion: 1, createdAt: at, updatedAt: at };
        state.users[id] = user; audit(state, actor, 'user_created', id, null, publicUser(state, user)); commit(state, expectedRevision); return publicUser(state, user);
      },
      updateUser(reference, id, patch, expectedRevision) {
        const state = load(), actor = assertActor(state, reference, 'users'); exactKeys(patch, ['name', 'email', 'roles', 'active']);
        const user = lookup(state.users, id); if (!user) throw failure('USER_NOT_FOUND', 'La cuenta no existe.');
        const before = publicUser(state, user), identity = validIdentity(state, { name: own(patch, 'name') ? patch.name : user.name, email: own(patch, 'email') ? patch.email : user.email }, id);
        if (own(patch, 'active') && typeof patch.active !== 'boolean') throw failure('INVALID_ACTIVE', 'El estado de la cuenta no es válido.');
        const roles = own(patch, 'roles') ? validRoles(state, patch.roles) : user.roles.slice();
        const revoke = JSON.stringify(roles) !== JSON.stringify(user.roles) || own(patch, 'active') && patch.active !== user.active || identity.email !== user.email;
        Object.assign(user, identity, { roles, active: own(patch, 'active') ? patch.active : user.active, updatedAt: stamp() });
        assertLastAdmin(state);
        if (revoke) { invalidate(state, user); for (const [key, invite] of Object.entries(state.invitations)) if (invite.userId === id) delete state.invitations[key]; }
        audit(state, actor, 'user_updated', id, before, publicUser(state, user)); commit(state, expectedRevision); return publicUser(state, user);
      },
      updateRole(reference, id, patch, expectedRevision) {
        const state = load(), actor = assertActor(state, reference, 'roles'); exactKeys(patch, ['label', 'grants']);
        const role = lookup(state.roles, id); if (!role) throw failure('ROLE_NOT_FOUND', 'El rol no existe.');
        const before = clone(role);
        if (own(patch, 'label')) { if (typeof patch.label !== 'string' || !patch.label.trim() || patch.label.trim().length > 100) throw failure('INVALID_ROLE', 'El nombre del rol no es válido.'); role.label = patch.label.trim(); }
        if (own(patch, 'grants')) {
          if (!patch.grants || typeof patch.grants !== 'object' || Array.isArray(patch.grants)) throw failure('INVALID_GRANTS', 'Los permisos no son válidos.');
          const next = {};
          for (const [cap, scope] of Object.entries(patch.grants)) {
            if (!own(catalog, cap) || !['none', 'own', 'all'].includes(scope) || scope === 'own' && catalog[cap][1] !== 'crm') throw failure('INVALID_GRANTS', 'El permiso o alcance no es válido.');
            if (id !== 'admin' && adminOnly.includes(cap) && scope !== 'none') throw failure('ADMIN_ONLY_CAPABILITY', 'Este permiso está reservado a Admin.');
            if (scope !== 'none') next[cap] = scope;
          }
          if (id === 'admin' && adminOnly.some(cap => next[cap] !== 'all')) throw failure('ADMIN_REQUIRED', 'Admin debe conservar los permisos obligatorios de administración y autorización.');
          role.grants = next;
        }
        if (JSON.stringify(before.grants) !== JSON.stringify(role.grants)) for (const user of Object.values(state.users)) if (user.roles.includes(id)) { invalidate(state, user); user.updatedAt = stamp(); }
        audit(state, actor, 'role_updated', id, before, role); commit(state, expectedRevision); return clone(role);
      },
      createInvitation(reference, id, expectedRevision) {
        const state = load(), actor = assertActor(state, reference, 'users'), user = lookup(state.users, id);
        if (!user || !user.active) throw failure('USER_INACTIVE', 'La cuenta no existe o está inactiva.');
        const token = random('invite_'), invitation = { userId: id, sessionVersion: user.sessionVersion, issuedAt: stamp(), expiresAt: milliseconds() + 7 * DAY };
        for (const [key, old] of Object.entries(state.invitations)) if (old.userId === id) delete state.invitations[key];
        state.invitations[token] = invitation; audit(state, actor, 'invitation_created', id, null, { userId: id, expiresAt: invitation.expiresAt }); commit(state, expectedRevision);
        return { token, userId: id, name: user.name, email: user.email, expiresAt: invitation.expiresAt, demoOnly: true };
      },
      inspectInvitation(token) {
        const state = load(), invitation = lookup(state.invitations, token), user = invitation && lookup(state.users, invitation.userId);
        if (!invitation || !user || !user.active || invitation.expiresAt <= milliseconds() || invitation.sessionVersion !== user.sessionVersion) return null;
        return { userId: user.id, name: user.name, email: user.email, expiresAt: invitation.expiresAt, demoOnly: true };
      },
      async acceptInvitation(token, password, operation) {
        assertOperationCurrent(operation);
        const original = api.inspectInvitation(token); if (!original) throw failure('INVITATION_INVALID', 'La invitación ya no es válida.');
        const initial = load(), originalVersion = initial.users[original.userId].sessionVersion, salt = random('salt_');
        const hash = await passwordVerifier(password, salt);
        assertOperationCurrent(operation);
        const state = load(), invitation = lookup(state.invitations, token), user = lookup(state.users, original.userId);
        if (!invitation || !user || !user.active || invitation.userId !== user.id || user.sessionVersion !== originalVersion || invitation.sessionVersion !== user.sessionVersion || invitation.expiresAt <= milliseconds()) throw failure('INVITATION_INVALID', 'La invitación ya no es válida.');
        invalidate(state, user); user.status = 'active'; user.authentication = 'password'; user.verifier = { algorithm: 'PBKDF2-SHA256', iterations: 210000, salt, hash }; user.updatedAt = stamp();
        for (const [key, invite] of Object.entries(state.invitations)) if (invite.userId === user.id) delete state.invitations[key];
        audit(state, user, 'invitation_accepted', user.id, null, { userId: user.id, status: 'active' });
        const session = issue(state, user); commit(state); return persistSession(session);
      },
      listAudit(reference) { const state = load(); assertActor(state, reference, 'users'); return clone(state.audit).reverse(); }
    };
    return Object.freeze(api);
  }
  return Object.freeze({ ...createStore(), createStore });
});
