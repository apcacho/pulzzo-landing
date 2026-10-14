'use strict';
const assert = require('node:assert/strict');

// Deliberately call the shipped Admin approval action before payment. This is a
// separate persisted step, never a synthesized authorization or payment bypass.
module.exports = function authorizeExtension(runtime, rowExpression = 'row.id', days = 15) {
  const before = JSON.parse(runtime.run('JSON.stringify(db.patients)'));
  const approval = runtime.run(`dispersionAuthorizeExtension(${rowExpression},${Number(days)},'Autorización ficticia de prueba')`);
  assert.ok(approval, 'A real Admin must approve the exact extension quote before its payment');
  const after = JSON.parse(runtime.run('JSON.stringify(db.patients)'));
  const financialState = patients => patients.map(({ timeline, extensionAuthorizations, ...patient }) => patient);
  assert.deepEqual(financialState(after), financialState(before),
    'Authorization alone must not alter patient data, balances, schedules, due dates, terms or receipts');
  // The authorization can append explicit evidence without rewriting history.
  before.forEach((patient, index) => {
    const previous = patient.timeline || [], current = after[index].timeline || [];
    assert.ok(current.length >= previous.length, 'Authorization cannot remove earlier timeline evidence');
    assert.deepEqual(current.slice(current.length - previous.length), previous,
      'Authorization cannot rewrite earlier timeline evidence');
    const priorApprovals = patient.extensionAuthorizations || [], approvals = after[index].extensionAuthorizations || [];
    assert.ok(approvals.length >= priorApprovals.length, 'Authorization evidence is append-only');
    assert.deepEqual(approvals.slice(0, priorApprovals.length), priorApprovals,
      'A later authorization cannot modify an earlier approved quote');
  });
  return approval;
};
