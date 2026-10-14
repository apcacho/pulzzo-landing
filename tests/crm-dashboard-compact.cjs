'use strict';
// Pure analytics and DOM-contract checks. These do not replace rendered browser QA.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Analytics = require('../assets/js/crm-demo-analytics.js');
const ADMIN = { id: 'admin_demo', role: 'admin' }, LEADER = { id: 'leader_demo', role: 'leader' };
const NOW = '2026-11-02T12:00:00.000Z';
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS', name); }
function snapshot() { return { contacts: {}, expedients: {}, activities: {}, events: {}, tasks: {} }; }
function add(s, id, at, owner = 'kam_ana') {
  s.contacts[id] = { id, type: 'patient', createdAt: at, assignedKam: owner, originalSource: 'manual', stage: 'new' };
  s.events['create_' + id] = { id: 'create_' + id, type: 'contact_created', contactId: id, createdAt: at };
}
function report(s, options = {}, filter = {}) { return Analytics.buildReport(s, { month: 10, year: 2026, ...filter }, { now: NOW, actor: ADMIN, ...options }); }

test('CDMX modern month boundaries are exact instants, with year rollover', () => {
  const before = Analytics.periodFor({}, '2026-10-01T05:59:59.999Z');
  const at = Analytics.periodFor({}, '2026-10-01T06:00:00.000Z');
  assert.equal(before.month, 9); assert.equal(at.month, 10);
  assert.equal(at.startAt, '2026-10-01T06:00:00.000Z'); assert.equal(at.endAt, '2026-11-01T06:00:00.000Z');
  assert.equal(Analytics.periodFor({}, '2027-01-01T05:59:59.999Z').year, 2026);
  const next = Analytics.periodFor({}, '2027-01-01T06:00:00.000Z'); assert.equal(next.year, 2027); assert.equal(next.month, 1);
});
test('historical DST boundaries use the IANA zone rather than a permanent six-hour offset', () => {
  const april = Analytics.periodFor({ month: 4, year: 2021 }, NOW);
  const october = Analytics.periodFor({ month: 10, year: 2021 }, NOW);
  assert.equal(april.startAt, '2021-04-01T06:00:00.000Z'); assert.equal(april.endAt, '2021-05-01T05:00:00.000Z');
  assert.equal(october.startAt, '2021-10-01T05:00:00.000Z'); assert.equal(october.endAt, '2021-11-01T06:00:00.000Z');
  assert.equal(october.isPartial, false);
});
test('exact month boundaries apply to linked creation, start, submission and activity records', () => {
  const s = snapshot(), times = ['2026-10-01T05:59:59.999Z', '2026-10-01T06:00:00.000Z', '2026-11-01T05:59:59.999Z', '2026-11-01T06:00:00.000Z'];
  times.forEach((at, i) => {
    const id = 'c' + i, expId = 'exp' + i, holder = 'holder' + i; add(s, id, at);
    s.expedients[expId] = { id: expId, contactId: id, kind: 'patient', createdAt: at, submittedAt: at, holderIdentity: { id: holder }, submissionSnapshot: { schema: 'pulzzo.crm.submission.v1', contactId: id, expedientId: expId, kind: 'patient', accountId: holder, submittedAt: at } };
    s.events['start' + i] = { type: 'assisted_draft_created', contactId: id, expedientId: expId, createdAt: at };
    s.events['submit' + i] = { type: 'holder_submitted', contactId: id, expedientId: expId, createdAt: at, actorRole: 'holder', actorId: holder };
    s.activities['activity' + i] = { id: 'activity' + i, type: 'call', contactId: id, contactAt: at, actorId: 'kam_ana' };
  });
  const r = report(s); for (const key of ['newContacts', 'onboardingStarted', 'submitted', 'activities']) assert.equal(r.counts[key], 2, key);
  assert.equal(r.conversion.denominator, 2); assert.equal(r.conversion.numerator, 2);
  assert.equal(r.currentSnapshot.contacts, 4, 'Current portfolio intentionally includes contacts outside the selected month');
});
test('historical last hour remains in its CDMX month', () => {
  const s = snapshot(); add(s, 'last', '2021-11-01T05:59:59.999Z'); add(s, 'next', '2021-11-01T06:00:00.000Z');
  assert.equal(report(s, {}, { year: 2021 }).counts.newContacts, 1);
});
test('current task day includes the last CDMX millisecond and excludes next midnight', () => {
  const s = snapshot(); add(s, 'c', '2026-10-01T06:00:00Z');
  ['2026-10-10T02:59:59.999Z', '2026-10-10T03:00:00.000Z', '2026-10-10T05:59:59.999Z', '2026-10-10T06:00:00.000Z', null].forEach((dueAt, i) => { s.tasks[i] = { contactId: 'c', dueAt, status: 'open' }; });
  const r = report(s, { now: '2026-10-10T03:00:00Z' });
  assert.deepEqual(r.pendingRows.map(x => [x.key, x.value]), [['overdue', 1], ['today', 2], ['upcoming', 1], ['undated', 1]]);
  assert.match(r.pendingRows.find(x => x.key === 'today').label, /CDMX/);
});
test('historical DST task day resolves to its real next midnight', () => {
  const s = snapshot(); add(s, 'c', '2021-10-01T05:00:00Z');
  s.tasks.a = { contactId: 'c', status: 'open', dueAt: '2021-10-30T04:59:59.999Z' };
  s.tasks.b = { contactId: 'c', status: 'open', dueAt: '2021-10-30T05:00:00.000Z' };
  const r = report(s, { now: '2021-10-30T03:00:00Z' }, { year: 2021 });
  assert.equal(r.pendingRows.find(x => x.key === 'today').value, 1); assert.equal(r.pendingRows.find(x => x.key === 'upcoming').value, 1);
});
test('missing and unknown actor identities fail closed; leader reads all and KAM only owns its scope', () => {
  const s = snapshot(); add(s, 'ana', '2026-10-02T12:00:00Z'); add(s, 'luis', '2026-10-02T12:00:00Z', 'kam_luis');
  for (const actor of [undefined, null, {}, { id: 'x', role: 'readonly' }, { id: '', role: 'leader' }, { id: '  ', role: 'admin' }]) assert.throws(() => report(s, { actor }), e => e.code === 'invalid_actor');
  assert.equal(report(s, { actor: LEADER }).counts.newContacts, 2);
  assert.equal(report(s, { actor: LEADER }, { kamId: 'kam_luis' }).counts.newContacts, 1);
  assert.equal(report(s, { actor: { id: 'kam_ana', role: 'kam' } }).counts.newContacts, 1);
  assert.throws(() => report(s, { actor: { id: 'kam_ana', role: 'kam' } }, { kamId: 'kam_luis' }), e => e.code === 'forbidden');
  assert.equal(report(s, { actor: ADMIN }).counts.newContacts, 2);
});
test('activity notes count in monthly activity but never become contact attempts', () => {
  const s = snapshot(); add(s, 'c', '2026-10-02T12:00:00Z');
  ['call', 'whatsapp', 'email', 'meeting', 'note', 'other', 'stage_change'].forEach((type, i) => { s.activities[i] = { id: String(i), type, contactId: 'c', contactAt: '2026-10-03T12:00:00Z', actorId: 'kam_ana' }; });
  const r = report(s); assert.equal(r.counts.activities, 6); assert.deepEqual(r.activitySummary, { contactAttempts: 4, notes: 1, other: 1 });
  const html = Analytics.renderDashboard(r); assert.match(html, /4 intentos de contacto · 1 nota · 1 otra actividad/); assert.match(html, /Las notas no son intentos de contacto/);
});
test('unqualified local timestamps cannot vary counts with the machine timezone', () => {
  const s = snapshot(); add(s, 'ambiguous', '2026-10-01T00:00:00');
  s.activities.a = { id: 'a', type: 'call', contactId: 'ambiguous', contactAt: '2026-10-01T00:00:00' };
  const r = report(s); assert.equal(r.counts.newContacts, 0); assert.equal(r.counts.activities, 0);
  assert.throws(() => Analytics.periodFor({}, '2026-10-01T00:00:00'), e => e.code === 'invalid_date');
  const modulePath = path.resolve(__dirname, '../assets/js/crm-demo-analytics.js');
  const script = `const a=require(${JSON.stringify(modulePath)});console.log(JSON.stringify([a.periodFor({},'2026-10-01T05:59:59.999Z'),a.periodFor({year:2021,month:10},'2026-10-01T06:00:00Z')]));`;
  const run = TZ => execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' });
  assert.equal(run('Pacific/Auckland'), run('America/Los_Angeles')); assert.equal(run('UTC'), run('Asia/Tokyo'));
});
test('dashboard exposes five mutually exclusive chart/table pairs with native keyboard controls', () => {
  const s = snapshot(); add(s, 'c', '2026-10-02T12:00:00Z'); const html = Analytics.renderDashboard(report(s), { idPrefix: 'compact' });
  assert.equal((html.match(/<article class="metric">/g) || []).length, 4);
  assert.equal((html.match(/data-analytics-view="graph"/g) || []).length, 5);
  assert.equal((html.match(/data-analytics-view="table"/g) || []).length, 5);
  assert.equal((html.match(/data-analytics-panel="table" hidden/g) || []).length, 5);
  assert.equal((html.match(/data-analytics-panel="graph" hidden/g) || []).length, 0);
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 5);
  assert.equal((html.match(/aria-pressed="false"/g) || []).length, 5);
  for (const match of html.matchAll(/aria-controls="([^"]+)"/g)) assert.ok(html.includes(`id="${match[1]}"`));
  assert.doesNotMatch(html, /<details class="analytics-data"|\sonclick=|· UTC/);
  assert.match(html, /Cartera y pendientes actuales/); assert.match(html, /Estado de hoy; independiente del mes seleccionado/); assert.match(html, /Actividad del mes/);
  assert.match(html, /tabindex="0" aria-label="Cartera actual por etapa"/);
  assert.match(html, /<caption>Cartera actual por etapa<\/caption>/); assert.match(html, /<th scope="col">/); assert.match(html, /<th scope="row">/);
  assert.match(html, /Sólo etapas|La gráfica muestra etapas/); assert.match(html, /no es aprobación/);
});
test('empty dashboards keep four truthful zero KPIs and explain the missing conversion base', () => {
  const html = Analytics.renderDashboard(report(snapshot()));
  assert.equal((html.match(/<strong>0<\/strong><small>/g) || []).length, 4);
  assert.match(html, /no tiene denominador/); assert.match(html, /Sin base/); assert.doesNotMatch(html, /stroke-dasharray|NaN|Infinity/);
  assert.equal((html.match(/data-analytics-panel="table" hidden/g) || []).length, 5);
  assert.match(html, /Sin registros para esta selección/);
});
test('one occupied stage stays compact while the table retains all stages and zero counts', () => {
  const s = snapshot(); add(s, 'c', '2026-10-02T12:00:00Z'); const html = Analytics.renderDashboard(report(s));
  const stage = html.match(/data-analytics-figure="crm-analytics-stage"[\s\S]*?<\/figure>/)[0];
  const graph = stage.match(/data-analytics-panel="graph">([\s\S]*?)<\/div><div id="crm-analytics-stage-table"/)[1];
  assert.equal((graph.match(/analytics-bar-row/g) || []).length, 1); assert.match(graph, /Clientes · Nuevo prospecto/);
  assert.equal((stage.match(/<th scope="row">/g) || []).length, 15); assert.match(stage, /<td>0<\/td>/);
});
test('long Spanish labels and large counts remain exact, escaped and wrap within mobile columns', () => {
  const s = snapshot(); add(s, 'c', '2026-10-02T12:00:00Z'); const r = report(s);
  const long = 'María de los Ángeles Hernández de la Cruz y Villaseñor <DEMO>';
  r.activityByActor = [{ actorId: 'kam_ana', value: 123456789 }]; r.counts.activities = 123456789;
  const html = Analytics.renderDashboard(r, { kamLabels: { kam_ana: long } });
  assert.match(html, /123456789/); assert.match(html, /María de los Ángeles Hernández de la Cruz y Villaseñor &lt;DEMO&gt;/); assert.doesNotMatch(html, /<DEMO>/);
  const css = fs.readFileSync(path.resolve(__dirname, '../assets/css/crm-demo-embed.css'), 'utf8');
  assert.match(css, /\.analytics-metrics \.metric strong\{[^}]*overflow-wrap:anywhere/);
  assert.match(css, /\.analytics-bar-label>span\{overflow-wrap:anywhere;min-width:0/);
  assert.match(css, /@media\(max-width:820px\)\{[\s\S]*?\.analytics-monthly-grid\{grid-template-columns:minmax\(0,1fr\)/);
});
function viewFixture(id) {
  const buttons = ['graph', 'table'].map(view => ({ attrs: { 'data-analytics-view': view, 'data-analytics-card': id, 'aria-pressed': String(view === 'graph') }, getAttribute(k) { return this.attrs[k]; }, setAttribute(k, value) { this.attrs[k] = value; }, closest() { return card; } }));
  const panels = ['graph', 'table'].map(view => ({ hidden: view === 'table', getAttribute: () => view }));
  const card = { getAttribute: () => id, querySelectorAll: selector => selector === '[data-analytics-view]' ? buttons : panels };
  return { card, buttons, panels };
}
test('view switching is exclusive, repeatable, isolated to its card and rejects outside triggers', () => {
  const first = viewFixture('one'), second = viewFixture('two'), members = new Set([first.card, second.card, ...first.buttons, ...second.buttons]), container = { contains: node => members.has(node) };
  assert.equal(Analytics.selectView(container, first.buttons[1]), true); assert.deepEqual(first.panels.map(x => x.hidden), [true, false]);
  assert.deepEqual(first.buttons.map(x => x.attrs['aria-pressed']), ['false', 'true']); assert.deepEqual(second.panels.map(x => x.hidden), [false, true]);
  assert.equal(Analytics.selectView(container, first.buttons[1]), true); assert.deepEqual(first.panels.map(x => x.hidden), [true, false]);
  assert.equal(Analytics.selectView(container, first.buttons[0]), true); assert.deepEqual(first.panels.map(x => x.hidden), [false, true]);
  assert.equal(Analytics.selectView(container, viewFixture('foreign').buttons[1]), false);
  members.delete(second.buttons[1]); assert.equal(Analytics.selectView(container, second.buttons[1]), false, 'A stale detached button cannot switch any view');
  first.buttons[0].attrs['data-analytics-view'] = 'invalid'; assert.equal(Analytics.selectView(container, first.buttons[0]), false);
  first.buttons[0].attrs['data-analytics-view'] = 'table'; first.buttons[0].attrs['data-analytics-card'] = 'wrong'; assert.equal(Analytics.selectView(container, first.buttons[0]), false);
});
test('composed CSS aligns dashboard cards and overrides picker text without centering normal buttons differently', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../assets/css/crm-demo-embed.css'), 'utf8');
  assert.match(css, /\.analytics-metrics \.metric\{[^}]*min-height:0;[^}]*padding:14px 16px/);
  assert.match(css, /:is\(\.analytics-grid,\.analytics-bottom-grid\)\{[^}]*align-items:stretch/);
  assert.match(css, /\.analytics-empty\{[^}]*min-height:0/);
  assert.match(css, /\[data-analytics-panel\]\[hidden\]\{display:none!important\}/);
  assert.match(css, /\.task-contact-results \.task-contact-result\{[^}]*justify-content:space-between;[^}]*text-align:left/);
  assert.match(css, /\.task-contact-results \.task-contact-result-copy\{[^}]*flex:1 1 auto;[^}]*text-align:left/);
  assert.match(css, /\.task-contact-results \.task-contact-result-state\{[^}]*margin-left:auto;text-align:right/);
  assert.match(css, /:is\(button,\.button-link\)\{[^}]*text-align:center/);
  assert.match(css, /\.analytics-view-switch button\{min-height:44px\}/);
});
console.log('PASS: ' + passed + ' compact dashboard timezone, scope, metrics and accessibility contracts. Browser rendering remains unverified.');
