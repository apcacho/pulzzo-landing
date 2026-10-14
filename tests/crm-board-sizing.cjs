'use strict';
// CSS/source invariants only. Actual browser geometry is a separate check.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const css = fs.readFileSync(path.join(__dirname, '../assets/css/crm-demo-embed.css'), 'utf8');
const rule = selector => {
  const start = css.indexOf(selector + '{');
  assert.notEqual(start, -1, selector);
  return css.slice(start + selector.length + 1, css.indexOf('}', start));
};
for (const board of ['.task-board', '.kanban-columns']) {
  const value = rule('.crm-surface ' + board);
  assert.match(value, /align-items:stretch/, 'Sibling columns grow to the largest content');
  assert.match(value, /gap:var\(--crm-board-gap\)/, 'Both boards share spacing');
  assert.doesNotMatch(value, /(?:^|;)(?:height|max-height):/, 'No fixed-height board clipping');
}
for (const column of ['.task-column', '.kanban-column']) {
  const value = rule('.crm-surface ' + column);
  assert.match(value, /border-radius:var\(--crm-board-radius\)/);
  assert.doesNotMatch(value, /(?:^|;)(?:height|max-height):/, 'Content sets natural row height');
}
for (const card of ['.task-card', '.kanban-card']) {
  assert.match(rule('.crm-surface ' + card), /padding:var\(--crm-card-pad\)/);
}
const titles = rule('.crm-surface :is(.kanban-column h3,.task-column h3,.kanban-open strong,.task-card h4)');
for (const value of ['font-family:var(--bo-display)', 'font-size:var(--bo-size-item)', 'font-weight:var(--bo-weight-entity)', 'line-height:1.4', 'overflow-wrap:anywhere', 'text-align:left']) assert.ok(titles.includes(value));
assert.match(rule('.crm-surface .task-column>.empty-state'), /padding:18px 14px/);
assert.match(rule('.crm-surface .task-column>.empty-state p'), /font-size:var\(--bo-size-meta\)/);
assert.match(css, /\.kanban-columns\{grid-auto-flow:row;grid-auto-columns:auto;grid-template-columns:minmax\(0,1fr\)/, 'Mobile pipeline remains stacked');
assert.match(css, /\.crm-surface \.contact-workspace,\.crm-surface \.dashboard-split,\.crm-surface \.task-board\{grid-template-columns:minmax\(0,1fr\)\}/);
assert.match(css, /--bo-control-height:44px;--bo-field-height:44px/, 'Touch controls preserved');
assert.match(css, /\.task-column\.unscheduled\{grid-column:1\/-1\}/, 'Unscheduled row preserved');
console.log('PASS: CRM boards share stretch, spacing, card padding, type and radius; natural content height, wrapping, mobile stacking and touch tokens retained. Source contracts only, no pixel verification.');
