'use strict';
// Real, centrally issued demo sessions for source/VM regression harnesses.
// This never manufactures identity tokens or replaces production permission checks.
const vm = require('node:vm');
const Staff = require('../../assets/js/staff-access.js');

module.exports = function installStaffSessionFixture(context) {
  const access = Staff.createStore({
    storage: context.localStorage,
    // Loan-date scenarios deliberately move their Date clock by months. Keep
    // authentication's clock fixed so those cases continue to test loan math.
    now: () => '2026-10-12T12:00:00Z'
  });
  context.window ||= {};
  context.window.PulzzoStaffAccess = access;
  context.PulzzoStaffAccess = access;
  context.testStaffSession = roleOrId => {
    const user = access.listDemoUsers().find(entry => entry.id === roleOrId || entry.role === roleOrId);
    if (!user) throw Error('No seeded staff fixture: ' + roleOrId);
    return access.loginDemo(user.email, 'pulzzo-demo');
  };
  context.testStaffUser = roleOrId => access.listDemoUsers().find(user => user.id === roleOrId || user.role === roleOrId);
  // Configuration-only fixtures have no inline backoffice can() declaration.
  // Their checks still invoke the real central policy with the actual session.
  if (!context.can) context.can = capability => {
    const session = vm.runInContext('session', context), active = access.getSession();
    return !!active && active.sessionId === session?.sessionId && access.can(session, capability);
  };
  return access;
};

// Preserve historical no-write assertions while excluding only the two known
// authentication envelopes intentionally created by fixture login.
module.exports.applicationStorageSize = storage => [...storage.keys()].filter(key => key !== Staff.STORAGE_KEY && key !== Staff.SESSION_KEY).length;
