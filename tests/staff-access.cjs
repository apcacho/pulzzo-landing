'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;
const Staff = require('../assets/js/staff-access.js');
let count = 0;
function memory() { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem(key, value) { if (this.fail) throw Error('quota'); map.set(key, String(value)); }, removeItem: key => map.delete(key), map }; }
function environment() { const storage = memory(); let now = Date.parse('2026-10-12T12:00:00Z'); const access = Staff.createStore({ storage, crypto, now: () => now }); return { storage, access, admin: access.loginDemo('admin@pulzzo.mx', 'pulzzo-demo'), advance: delta => { now += delta; } }; }
function login(access, role) { const address = { admin: 'admin', kam: 'ana.kam', kam_luis: 'luis.kam', leader: 'lider.kam', operations: 'operaciones', risk: 'riesgo', provider: 'medicos', readonly: 'lectura', portfolio: 'cartera' }[role]; return access.loginDemo(address + '@pulzzo.mx', 'pulzzo-demo'); }
async function test(name, fn) { await fn(); count++; console.log('PASS', name); }
const throws = (fn, code) => assert.throws(fn, error => error.code === code);
const rejects = (fn, code) => assert.rejects(fn, error => error.code === code);
(async () => {
await test('stable demo identities migrate source users and CRM actors without credentials', () => {
  const e = environment(), users = e.access.listUsers(e.admin);
  assert.equal(users.length, 9);
  for (const [email, id] of [['admin@pulzzo.mx', 'admin_demo'], ['ana.kam@pulzzo.mx', 'kam_ana'], ['luis.kam@pulzzo.mx', 'kam_luis'], ['lider.kam@pulzzo.mx', 'leader_demo']]) assert.equal(users.find(user => user.email === email).id, id);
  assert.ok(users.every(user => Array.isArray(user.roles) && !('pass' in user) && !('verifier' in user)));
  assert.ok(!e.storage.getItem(Staff.STORAGE_KEY).includes('pulzzo-demo'));
  assert.equal(e.access.resolveSession({ role: 'admin', email: 'admin@pulzzo.mx', crmActorId: 'admin_demo' }), null);
});
await test('all eight role templates preserve operational caps and explicit sensitive defaults', () => {
  const e = environment();
  for (const role of ['admin', 'leader', 'kam', 'operations', 'risk', 'portfolio', 'provider', 'readonly']) {
    const session = login(e.access, role);
    assert.equal(e.access.can(session, 'approveCredit'), ['admin', 'risk'].includes(role), role + ' credit');
    assert.equal(e.access.can(session, 'registerPayments'), ['admin', 'portfolio'].includes(role), role + ' payments');
    assert.equal(e.access.can(session, 'authorizeDisbursement'), role === 'admin', role + ' disbursement');
    assert.equal(e.access.can(session, 'reversePayments'), role === 'admin', role + ' reversal');
    assert.equal(e.access.can(session, 'authorizeExtensions'), role === 'admin', role + ' extension authorization');
    for (const cap of ['users', 'roles', 'settings', 'crmManage']) assert.equal(e.access.can(session, cap), role === 'admin', role + ' ' + cap);
    assert.equal(e.access.can(session, 'manageCollections'), ['admin', 'operations', 'risk', 'portfolio'].includes(role));
  }
  assert.equal(e.access.can(login(e.access, 'operations'), 'patientActions'), true);
  assert.equal(e.access.can(login(e.access, 'risk'), 'riskActions'), true);
  assert.equal(e.access.can(login(e.access, 'provider'), 'providerActions'), true);
  assert.equal(e.access.can(login(e.access, 'portfolio'), 'patientActions'), false);
  assert.equal(e.access.can(login(e.access, 'readonly'), 'viewPortfolio'), true);
});
await test('multi-role union preserves per-resource own CRM and all operational scopes', () => {
  const e = environment();
  e.access.updateUser(e.admin, 'kam_ana', { roles: ['kam', 'operations'] });
  const kam = login(e.access, 'kam');
  assert.equal(e.access.scope(kam, 'crm'), 'own');
  assert.equal(e.access.scope(kam, 'patients'), 'all');
  assert.equal(e.access.getActor(kam).role, 'kam');
  assert.equal(e.access.can(kam, 'crmEdit', { assignedKam: 'kam_ana' }), true);
  assert.equal(e.access.can(kam, 'crmView', { assignedKam: 'kam_luis' }), false);
  assert.equal(e.access.can(kam, 'patientActions', { ownerId: 'someone_else' }), true);
  assert.equal(e.access.can(kam, 'approveCredit'), false);
  e.access.updateUser(e.admin, 'kam_ana', { roles: ['kam', 'leader', 'operations'] });
  const multi = login(e.access, 'kam'), context = e.access.crmContext(multi);
  assert.equal(context.viewScope, 'all'); assert.equal(context.writeScope, 'own'); assert.equal(context.assignScope, 'all');
  assert.equal(e.access.can(multi, 'crmView', { assignedKam: 'kam_luis' }), true);
  assert.equal(e.access.can(multi, 'crmEdit', { assignedKam: 'kam_luis' }), false);
});
await test('non-CRM roles cannot obtain CRM by operational read or actor spoofing', () => {
  const e = environment(), ops = login(e.access, 'operations');
  assert.equal(e.access.getActor(ops).role, null);
  assert.equal(e.access.crmContext(ops).actor, null);
  assert.equal(e.access.can(ops, 'crmView'), false);
  assert.equal(e.access.can({ ...ops, role: 'admin', roles: ['admin'], crmActorId: 'admin_demo' }, 'users'), false);
  assert.equal(e.access.can({ ...ops, userId: 'admin_demo' }, 'users'), false);
  assert.equal(e.access.can({ ...ops, sessionId: 'madeup' }, 'viewPatients'), false);
});
await test('sessions are independent, persisted, expiring and reject stale version', () => {
  const e = environment(), first = login(e.access, 'kam'), second = login(e.access, 'kam');
  assert.ok(e.access.resolveSession(first)); assert.ok(e.access.resolveSession(second));
  assert.equal(e.access.getSession().sessionId, second.sessionId);
  const other = Staff.createStore({ storage: e.storage, crypto, now: () => Date.parse('2026-10-12T12:00:00Z') });
  assert.equal(other.resolveSession(first).id, 'kam_ana');
  assert.equal(other.resolveSession({ ...first, sessionVersion: 900 }), null);
  e.access.logout(first); assert.equal(e.access.resolveSession(first), null); assert.ok(e.access.resolveSession(second));
  e.advance(86400000); assert.equal(e.access.getSession(), null);
});
await test('CRM UI context becomes stale after current account switches without revoking other issued API sessions', () => {
  const e = environment(), ana = login(e.access, 'kam'), context = e.access.crmContext(ana);
  assert.equal(context.isCurrent(), true);
  login(e.access, 'kam_luis');
  assert.equal(context.isCurrent(), false);
  assert.ok(e.access.resolveSession(ana));
});
await test('role changes revoke existing sessions and fail current-context callbacks immediately', () => {
  const e = environment(), session = login(e.access, 'kam'), context = e.access.crmContext(session);
  assert.equal(context.isCurrent(), true);
  e.access.updateUser(e.admin, 'kam_ana', { roles: ['kam', 'risk'] });
  assert.equal(e.access.resolveSession(session), null); assert.equal(context.isCurrent(), false);
  const next = login(e.access, 'kam'); assert.equal(next.id, session.id); assert.equal(next.sessionVersion, session.sessionVersion + 1); assert.equal(e.access.can(next, 'approveCredit'), true);
});
await test('deactivate/reactivate never revives stale sessions or invitations', () => {
  const e = environment(), kam = login(e.access, 'kam'), invite = e.access.createInvitation(e.admin, 'kam_ana');
  e.access.updateUser(e.admin, 'kam_ana', { active: false });
  assert.equal(e.access.resolveSession(kam), null); assert.equal(e.access.inspectInvitation(invite.token), null);
  throws(() => login(e.access, 'kam'), 'INVALID_LOGIN');
  assert.ok(!e.access.getIntakeKamRoster().some(user => user.id === 'kam_ana'));
  e.access.updateUser(e.admin, 'kam_ana', { active: true });
  assert.equal(e.access.resolveSession(kam), null); assert.ok(login(e.access, 'kam'));
});
await test('last active Admin cannot deactivate/demote even with a pending invited Admin', () => {
  const e = environment(), before = e.access.getVersion();
  throws(() => e.access.updateUser(e.admin, 'admin_demo', { active: false }), 'LAST_ADMIN');
  throws(() => e.access.updateUser(e.admin, 'admin_demo', { roles: ['risk'] }), 'LAST_ADMIN');
  assert.equal(e.access.getVersion(), before);
  e.access.createUser(e.admin, { name: 'Invited Admin', email: 'new.admin@example.test', phone:'5500000199', roles: ['admin'] });
  throws(() => e.access.updateUser(e.admin, 'admin_demo', { active: false }), 'LAST_ADMIN');
  e.access.updateUser(e.admin, 'kam_luis', { roles: ['kam', 'admin'] });
  e.access.updateUser(e.admin, 'admin_demo', { active: false });
  assert.equal(e.access.resolveSession(e.admin), null);
  assert.equal(e.access.can(login(e.access, 'kam_luis'), 'users'), true);
});
await test('normalized duplicate email rejected across create/update/inactive accounts', () => {
  const e = environment();
  throws(() => e.access.createUser(e.admin, { name: 'Duplicate', email: '  ANA.KAM@PULZZO.MX  ', phone:'5500000199', roles: ['risk'] }), 'DUPLICATE_EMAIL');
  throws(() => e.access.updateUser(e.admin, 'risk_demo', { email: 'ＡＮＡ.KAM@PULZZO.MX' }), 'DUPLICATE_EMAIL');
  e.access.updateUser(e.admin, 'kam_ana', { active: false });
  throws(() => e.access.createUser(e.admin, { name: 'Duplicate', email: 'ana.kam@pulzzo.mx', phone:'5500000199', roles: ['risk'] }), 'DUPLICATE_EMAIL');
  for (const email of ['', 'no-at', 'x@', 'two words@example.test']) throws(() => e.access.createUser(e.admin, { name: 'Invalid', email, phone:'5500000199', roles: ['risk'] }), 'INVALID_IDENTITY');
});
await test('directory and role management fail closed for every nonadmin', () => {
  const e = environment();
  for (const role of ['kam', 'leader', 'operations', 'risk', 'portfolio', 'provider', 'readonly']) {
    const session = login(e.access, role);
    for (const action of [() => e.access.listUsers(session), () => e.access.listRoles(session), () => e.access.listAudit(session), () => e.access.createUser(session, { name: 'No', email: 'no@example.test', phone:'5500000199', roles: ['admin'] }), () => e.access.updateUser(session, 'kam_ana', { roles: ['admin'] }), () => e.access.createInvitation(session, 'kam_ana'), () => e.access.updateRole(session, 'kam', { grants: { users: 'all' } }), () => e.access.previewRoles(session, ['admin'])]) throws(action, 'FORBIDDEN');
  }
  throws(() => e.access.listUsers(null), 'SESSION_INVALID');
});
await test('immutable identities/version/audit/credentials reject patch injection', () => {
  const e = environment();
  for (const patch of [{ id: 'admin_demo' }, { sessionVersion: 99 }, { password: 'adminchosen' }, { verifier: {} }, { actorId: 'forged' }, { status: 'active' }]) throws(() => e.access.updateUser(e.admin, 'kam_ana', patch), 'INVALID_FIELDS');
  throws(() => e.access.createUser(e.admin, { name: 'No', email: 'no@example.test', phone:'5500000199', roles: ['kam'], password: 'adminchosen' }), 'INVALID_FIELDS');
  const snapshot = e.access.listUsers(e.admin); snapshot[0].roles = ['readonly'];
  assert.equal(e.access.can(e.admin, 'users'), true);
});
await test('Admin role config is validated and cannot grant admin-only settings to another role', () => {
  const e = environment(), role = e.access.listRoles(e.admin).find(role => role.id === 'kam');
  for (const cap of ['users', 'roles', 'settings', 'crmManage', 'authorizeExtensions']) throws(() => e.access.updateRole(e.admin, 'kam', { grants: { ...role.grants, [cap]: 'all' } }), 'ADMIN_ONLY_CAPABILITY');
  throws(() => e.access.updateRole(e.admin, 'admin', { grants: { crmView: 'all' } }), 'ADMIN_REQUIRED');
  throws(() => e.access.updateRole(e.admin, 'kam', { grants: { nonexistent: 'all' } }), 'INVALID_GRANTS');
  throws(() => e.access.updateRole(e.admin, 'kam', { grants: { patientActions: 'own' } }), 'INVALID_GRANTS');
  throws(() => e.access.updateRole(e.admin, 'kam', { grants: { crmEdit: 'full' } }), 'INVALID_GRANTS');
});
await test('paid-extension authorization is nondelegable Admin permission with an explicit mandatory catalog flag', () => {
  const e = environment(), cap = e.access.capabilityCatalog().find(cap => cap.id === 'authorizeExtensions');
  assert.equal(cap.resource, 'portfolio'); assert.equal(cap.adminOnly, true); assert.equal(cap.mandatoryAdmin, true);
  for (const id of ['kam', 'leader', 'operations', 'risk', 'portfolio', 'provider', 'readonly']) {
    const role = e.access.listRoles(e.admin).find(role => role.id === id);
    throws(() => e.access.updateRole(e.admin, id, { grants: { ...role.grants, authorizeExtensions: 'all' } }), 'ADMIN_ONLY_CAPABILITY');
  }
  const adminRole = e.access.listRoles(e.admin).find(role => role.id === 'admin');
  throws(() => e.access.updateRole(e.admin, 'admin', { grants: { ...adminRole.grants, authorizeExtensions: 'none' } }), 'ADMIN_REQUIRED');
  assert.equal(e.access.previewRoles(e.admin, ['portfolio', 'risk']).grants.authorizeExtensions, undefined);
  assert.equal(e.access.previewRoles(e.admin, ['portfolio']).grants.registerPayments, 'all');
});
await test('existing demo directory migrates only new Admin extension grant and revokes pre-policy Admin sessions', () => {
  const e = environment(), ops = login(e.access, 'operations');
  const saved = JSON.parse(e.storage.getItem(Staff.STORAGE_KEY));
  delete saved.policyVersion; delete saved.roles.admin.grants.authorizeExtensions;
  delete saved.roles.operations.grants.docs;
  e.storage.setItem(Staff.STORAGE_KEY, JSON.stringify(saved));
  const fresh = Staff.createStore({ storage: e.storage, crypto, now: () => Date.parse('2026-10-12T12:00:00Z') });
  assert.equal(fresh.resolveSession(e.admin), null);
  assert.ok(fresh.resolveSession(ops));
  assert.equal(fresh.can(ops, 'docs'), false);
  const admin = fresh.loginDemo('admin@pulzzo.mx', 'pulzzo-demo');
  assert.equal(fresh.can(admin, 'authorizeExtensions'), true);
  assert.equal(fresh.can(ops, 'authorizeExtensions'), false);
  const migrated = JSON.parse(e.storage.getItem(Staff.STORAGE_KEY));
  assert.equal(migrated.policyVersion, 2);
  assert.equal(migrated.users.admin_demo.sessionVersion, saved.users.admin_demo.sessionVersion + 1);
  assert.equal(migrated.users.operations_demo.sessionVersion, saved.users.operations_demo.sessionVersion);
  assert.equal(fresh.listAudit(admin).filter(event => event.id === 'migration_staff_extensions_v2').length, 1);
  fresh.getVersion();
  assert.equal(fresh.listAudit(admin).filter(event => event.id === 'migration_staff_extensions_v2').length, 1);
});
await test('staff policy migration refuses missing or corrupt structures without resetting or partially upgrading', () => {
  for (const corrupt of [state => { delete state.roles.admin; }, state => { state.roles.admin.grants = []; }, state => { state.users = []; }, state => { state.users.admin_demo.roles = 'admin'; }, state => { state.users.admin_demo.sessionVersion = null; }, state => { state.policyVersion = 'invalid'; }]) {
    const e = environment(), state = JSON.parse(e.storage.getItem(Staff.STORAGE_KEY));
    delete state.policyVersion; delete state.roles.admin.grants.authorizeExtensions; corrupt(state);
    const before = JSON.stringify(state); e.storage.setItem(Staff.STORAGE_KEY, before);
    assert.equal(e.access.resolveSession(e.admin), null);
    throws(() => e.access.getVersion(), 'DIRECTORY_INVALID');
    assert.equal(e.storage.getItem(Staff.STORAGE_KEY), before);
  }
});
await test('role-template changes revoke all affected sessions and preview is effective union', () => {
  const e = environment(), ana = login(e.access, 'kam'), luis = login(e.access, 'kam_luis'), ops = login(e.access, 'operations');
  const role = e.access.listRoles(e.admin).find(role => role.id === 'kam');
  e.access.updateRole(e.admin, 'kam', { label: 'KAM editado', grants: { ...role.grants, crmEdit: 'none' } });
  assert.equal(e.access.resolveSession(ana), null); assert.equal(e.access.resolveSession(luis), null); assert.ok(e.access.resolveSession(ops));
  const next = login(e.access, 'kam'); assert.equal(e.access.can(next, 'crmView'), true); assert.equal(e.access.can(next, 'crmEdit'), false);
  const preview = e.access.previewRoles(e.admin, ['kam', 'operations']);
  assert.equal(preview.scopes.crm, 'own'); assert.equal(preview.grants.patientActions, 'all'); assert.ok(!preview.capabilities.includes('crmEdit'));
});
await test('minimal public intake roster excludes pending/inactive users and has no private directory fields', () => {
  const e = environment(), pending = e.access.createUser(e.admin, { name: 'Pending KAM', email: 'pending@example.test', phone:'5500000199', roles: ['kam'] });
  assert.deepEqual(e.access.getIntakeKamRoster().map(user => user.id), ['kam_ana', 'kam_luis']);
  assert.ok(e.access.getIntakeKamRoster().every(user => Object.keys(user).sort().join(',') === 'id,name'));
  const roster = e.access.getCrmRoster(e.admin);
  assert.ok(roster.find(user => user.id === pending.id && !user.active));
  assert.ok(!JSON.stringify(roster).includes('@'));
  throws(() => e.access.getCrmRoster(login(e.access, 'operations')), 'FORBIDDEN');
});
await test('configured operational CRM viewers appear in CRM roster without joining intake KAM pool', () => {
  const e = environment(), template = e.access.listRoles(e.admin).find(role => role.id === 'operations');
  assert.ok(!e.access.getCrmRoster(e.admin).some(user => user.id === 'operations_demo'));
  e.access.updateRole(e.admin, 'operations', { grants: { ...template.grants, crmView: 'all', crmEdit: 'all' } });
  let session = login(e.access, 'operations'), actor = e.access.getActor(session);
  let entry = e.access.getCrmRoster(e.admin).find(user => user.id === 'operations_demo');
  assert.equal(entry.active, true); assert.equal(entry.role, actor.role); assert.equal(entry.crmScope, actor.crmScope); assert.equal(entry.role, 'leader');
  assert.ok(!e.access.getIntakeKamRoster().some(user => user.id === entry.id));
  e.access.updateRole(e.admin, 'operations', { grants: { ...template.grants, crmView: 'own', crmEdit: 'own' } });
  session = login(e.access, 'operations'); actor = e.access.getActor(session);
  entry = e.access.getCrmRoster(e.admin).find(user => user.id === 'operations_demo');
  assert.equal(entry.role, actor.role); assert.equal(entry.crmScope, 'own'); assert.equal(entry.role, 'kam');
  assert.ok(!e.access.getIntakeKamRoster().some(user => user.id === entry.id));
  e.access.updateUser(e.admin, 'operations_demo', { active: false });
  assert.equal(e.access.getCrmRoster(e.admin).find(user => user.id === 'operations_demo').active, false);
  e.access.updateRole(e.admin, 'kam', { grants: {} });
  const historical = e.access.getCrmRoster(e.admin).find(user => user.id === 'kam_ana');
  assert.ok(historical); assert.equal(historical.active, false); assert.equal(historical.role, null);
});
await test('operational assignment uses all required effective grants and only active users', () => {
  const e = environment(), ops = login(e.access, 'operations');
  const eligible = e.access.listAssignableUsers(ops, ['patientActions', 'docs']);
  assert.deepEqual(eligible.map(user => user.id), ['admin_demo', 'operations_demo']);
  e.access.updateUser(e.admin, 'kam_ana', { roles: ['kam', 'operations'] });
  assert.ok(e.access.listAssignableUsers(ops, ['patientActions', 'docs']).some(user => user.id === 'kam_ana'));
  e.access.updateUser(e.admin, 'kam_ana', { active: false });
  assert.ok(!e.access.listAssignableUsers(ops, ['patientActions']).some(user => user.id === 'kam_ana'));
  throws(() => e.access.listAssignableUsers(login(e.access, 'leader'), ['docs']), 'FORBIDDEN');
});
await test('simulated invite lets invitee set own password, stores verifier only, and cannot be reused', async () => {
  const e = environment(), user = e.access.createUser(e.admin, { name: 'New KAM', email: ' New.Kam@EXAMPLE.TEST ', phone:'5500000199', roles: ['kam', 'portfolio'] });
  assert.equal(user.status, 'invited'); assert.equal(user.email, 'new.kam@example.test');
  await rejects(() => e.access.login(user.email, 'pulzzo-demo'), 'INVALID_LOGIN');
  const invite = e.access.createInvitation(e.admin, user.id);
  assert.ok(e.access.inspectInvitation(invite.token));
  await rejects(() => e.access.acceptInvitation(invite.token, 'short'), 'INVALID_PASSWORD');
  const password = 'unique-demo-passphrase-42';
  const session = await e.access.acceptInvitation(invite.token, password);
  assert.equal(session.id, user.id); assert.equal(session.status, 'active');
  assert.equal(e.access.can(session, 'registerPayments'), true);
  assert.equal(e.access.scope(session, 'crm'), 'own');
  assert.ok(e.access.getIntakeKamRoster().some(entry => entry.id === user.id));
  assert.ok(!e.storage.getItem(Staff.STORAGE_KEY).includes(password));
  const raw = JSON.parse(e.storage.getItem(Staff.STORAGE_KEY)).users[user.id];
  assert.equal(raw.verifier.algorithm, 'PBKDF2-SHA256'); assert.equal(raw.verifier.hash.length, 64); assert.ok(raw.verifier.salt);
  assert.equal(e.access.inspectInvitation(invite.token), null);
  await rejects(() => e.access.acceptInvitation(invite.token, password), 'INVITATION_INVALID');
  await rejects(() => e.access.login(user.email, 'wrong-password-demo'), 'INVALID_LOGIN');
  assert.equal((await e.access.login('NEW.KAM@example.test', password)).id, user.id);
  assert.ok(!JSON.stringify(e.access.listUsers(e.admin)).includes(raw.verifier.hash));
  assert.ok(!JSON.stringify(e.access.listAudit(e.admin)).includes(password));
});
await test('accepted invitation on demo seed disables shared phrase and revokes previous sessions', async () => {
  const e = environment(), old = login(e.access, 'kam'), invite = e.access.createInvitation(e.admin, 'kam_ana');
  await e.access.acceptInvitation(invite.token, 'ana-unique-demo-only');
  assert.equal(e.access.resolveSession(old), null);
  throws(() => e.access.loginDemo('ana.kam@pulzzo.mx', 'pulzzo-demo'), 'INVALID_LOGIN');
  await rejects(() => e.access.login('ana.kam@pulzzo.mx', 'pulzzo-demo'), 'INVALID_LOGIN');
  assert.ok(!e.access.listDemoUsers().some(user => user.id === 'kam_ana'));
  assert.equal((await e.access.login('ana.kam@pulzzo.mx', 'ana-unique-demo-only')).id, 'kam_ana');
});
await test('reissued, expired and concurrently deactivated invitations fail closed', async () => {
  const e = environment(), first = e.access.createInvitation(e.admin, 'kam_ana'), second = e.access.createInvitation(e.admin, 'kam_ana');
  assert.equal(e.access.inspectInvitation(first.token), null);
  const pending = e.access.acceptInvitation(second.token, 'not-a-real-password');
  e.access.updateUser(e.admin, 'kam_ana', { active: false });
  await rejects(() => pending, 'INVITATION_INVALID');
  const third = e.access.createInvitation(e.admin, 'kam_luis'); e.advance(7 * 86400000);
  assert.equal(e.access.inspectInvitation(third.token), null);
  await rejects(() => e.access.acceptInvitation(third.token, 'also-demo-only-password'), 'INVITATION_INVALID');
});
await test('cancelled login/invitation operations write nothing, including before initial directory creation', async () => {
  const storage = memory(), access = Staff.createStore({ storage, crypto });
  await rejects(() => access.login('admin@pulzzo.mx', 'pulzzo-demo', { isCurrent: () => false }), 'OPERATION_CANCELLED');
  await rejects(() => access.authenticate('admin@pulzzo.mx', 'pulzzo-demo', { isCurrent: () => { throw Error('closed'); } }), 'OPERATION_CANCELLED');
  await rejects(() => access.acceptInvitation('unused', 'only-a-demo-password', { isCurrent: () => false }), 'OPERATION_CANCELLED');
  assert.equal(storage.map.size, 0);
});
await test('Cancel/pagehide during invite password derivation leaves invitation, credentials and sessions untouched', async () => {
  const e = environment(), user = e.access.createUser(e.admin, { name: 'Cancelled Invite', email: 'cancel@example.test', phone:'5500000199', roles: ['kam'] });
  const invite = e.access.createInvitation(e.admin, user.id), before = e.storage.getItem(Staff.STORAGE_KEY), sessionBefore = e.storage.getItem(Staff.SESSION_KEY);
  let active = true;
  const pending = e.access.acceptInvitation(invite.token, 'not-a-real-password', { isCurrent: () => active });
  active = false;
  await rejects(() => pending, 'OPERATION_CANCELLED');
  assert.equal(e.storage.getItem(Staff.STORAGE_KEY), before);
  assert.equal(e.storage.getItem(Staff.SESSION_KEY), sessionBefore);
  assert.ok(e.access.inspectInvitation(invite.token));
  assert.equal(e.access.listUsers(e.admin).find(entry => entry.id === user.id).status, 'invited');
  const accepted = await e.access.acceptInvitation(invite.token, 'not-a-real-password', { isCurrent: () => true });
  assert.equal(accepted.id, user.id);
});
await test('Cancel/pagehide during password login never issues or replaces a session, including authenticate alias', async () => {
  const e = environment(), invite = e.access.createInvitation(e.admin, 'kam_ana');
  await e.access.acceptInvitation(invite.token, 'demo-login-password');
  for (const method of ['login', 'authenticate']) {
    const before = e.storage.getItem(Staff.STORAGE_KEY), sessionBefore = e.storage.getItem(Staff.SESSION_KEY);
    let active = true;
    const pending = e.access[method]('ana.kam@pulzzo.mx', 'demo-login-password', { isCurrent: () => active });
    active = false;
    await rejects(() => pending, 'OPERATION_CANCELLED');
    assert.equal(e.storage.getItem(Staff.STORAGE_KEY), before);
    assert.equal(e.storage.getItem(Staff.SESSION_KEY), sessionBefore);
  }
});
await test('invitation expiring during password derivation cannot activate account or issue session', async () => {
  const e = environment(), invite = e.access.createInvitation(e.admin, 'kam_ana');
  e.advance(7 * 86400000 - 1);
  const before = e.storage.getItem(Staff.STORAGE_KEY), sessionBefore = e.storage.getItem(Staff.SESSION_KEY);
  const pending = e.access.acceptInvitation(invite.token, 'demo-expiry-password', { isCurrent: () => true });
  e.advance(2);
  await rejects(() => pending, 'INVITATION_INVALID');
  assert.equal(e.storage.getItem(Staff.STORAGE_KEY), before);
  assert.equal(e.storage.getItem(Staff.SESSION_KEY), sessionBefore);
});
await test('audit actor IDs and historical names survive identity and role changes without caller injection', () => {
  const e = environment();
  e.access.updateUser(e.admin, 'kam_ana', { name: 'Renamed Ana' });
  e.access.updateUser(e.admin, 'admin_demo', { name: 'Admin renamed' });
  e.access.updateUser(e.admin, 'kam_luis', { roles: ['kam', 'risk'] });
  const audit = e.access.listAudit(e.admin);
  assert.ok(audit.every(event => event.actorId === 'admin_demo'));
  assert.equal(audit[0].actorName, 'Admin renamed'); assert.equal(audit.at(-1).actorName, 'Admin Pulzzo');
  audit[0].actorId = 'forged'; assert.equal(e.access.listAudit(e.admin)[0].actorId, 'admin_demo');
});
await test('stale mutations and storage failure do not partially change directory/audit', () => {
  const e = environment(), revision = e.access.getVersion();
  e.access.updateUser(e.admin, 'kam_ana', { name: 'Ana changed' }, revision);
  const before = e.storage.getItem(Staff.STORAGE_KEY);
  throws(() => e.access.updateUser(e.admin, 'kam_luis', { name: 'Luis changed' }, revision), 'STALE_REVISION');
  assert.equal(e.storage.getItem(Staff.STORAGE_KEY), before);
  e.storage.fail = true; throws(() => e.access.updateUser(e.admin, 'kam_luis', { active: false }), 'STORAGE_UNAVAILABLE'); e.storage.fail = false;
  assert.equal(e.storage.getItem(Staff.STORAGE_KEY), before);
  assert.equal(e.access.listUsers(e.admin).find(user => user.id === 'kam_luis').active, true);
});
await test('corrupt directory fails closed without reseeding Admin or accepting legacy role objects', () => {
  const e = environment(); e.storage.setItem(Staff.STORAGE_KEY, '{corrupt');
  assert.equal(e.access.resolveSession(e.admin), null); assert.equal(e.access.can(e.admin, 'settings'), false);
  throws(() => e.access.loginDemo('admin@pulzzo.mx', 'pulzzo-demo'), 'DIRECTORY_INVALID');
  assert.equal(e.storage.getItem(Staff.STORAGE_KEY), '{corrupt');
});
await test('inherited object keys are not valid users, roles, invitations or sessions', () => {
  const e = environment();
  for (const id of ['__proto__', 'constructor', 'toString']) {
    throws(() => e.access.updateRole(e.admin, id, { label: 'Injected' }), 'ROLE_NOT_FOUND');
    throws(() => e.access.updateUser(e.admin, id, { name: 'Injected' }), 'USER_NOT_FOUND');
    assert.equal(e.access.inspectInvitation(id), null);
    assert.equal(e.access.resolveSession({ ...e.admin, sessionId: id }), null);
  }
  assert.equal(Object.prototype.label, undefined);
});
await test('browser global UMD supports source VM with explicit crypto and same contract', () => {
  const storage = memory(), context = vm.createContext({ localStorage: storage, crypto, TextEncoder, Uint8Array, console });
  vm.runInContext(fs.readFileSync(require.resolve('../assets/js/staff-access.js'), 'utf8'), context);
  const api = context.PulzzoStaffAccess, session = api.loginDemo('admin@pulzzo.mx', 'pulzzo-demo');
  assert.equal(api.resolveSession(session).id, 'admin_demo'); assert.equal(api.can(session, 'users'), true);
  assert.equal(api.can(null, 'users'), false); assert.ok(api.capabilityCatalog().length > 20);
  assert.equal(Object.isFrozen(api), true);
});
console.log('PASS', count, 'staff directory/access groups; source VM only, local demo only.');
})().catch(error => { console.error(error); process.exitCode = 1; });
