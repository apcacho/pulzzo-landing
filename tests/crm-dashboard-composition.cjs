'use strict';
// Deterministic HTML/source-cascade contracts. The geometry model accounts for
// the BO shell and authored tracks; it is not a browser layout or pixel test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Analytics = require('../assets/js/crm-demo-analytics.js');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const css = read('assets/css/crm-demo.css') + '\n' + read('assets/css/crm-demo-embed.css');
const template = read('assets/js/crm-demo-template.js');
const typography = read('assets/css/backoffice-refinement.css');
const ADMIN = { id: 'admin_demo', role: 'admin' };
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS', name); }
function fixture() { return { contacts: {}, events: {}, activities: {}, tasks: {}, expedients: {} }; }
function add(s, id, stage = 'new', source = 'manual', actor = 'kam_ana') {
  const createdAt = '2026-10-03T12:00:00Z';
  s.contacts[id] = { id, type: 'patient', assignedKam: actor, createdAt, stage, originalSource: source };
  s.events['create_' + id] = { type: 'contact_created', contactId: id, createdAt };
}
function report(s) { return Analytics.buildReport(s, { month: 10, year: 2026, type: 'patient' }, { now: '2026-10-12T12:00:00Z', actor: ADMIN }); }
function render(s, options) { return Analytics.renderDashboard(report(s), { idPrefix: 'composition', ...options }); }
function figure(html, name) { return html.match(new RegExp('<figure[^>]*data-analytics-figure="composition-' + name + '"[\\s\\S]*?</figure>'))[0]; }
function graph(html, name) { return figure(html, name).split('data-analytics-panel="graph">')[1].split('<div id="composition-' + name + '-table"')[0]; }

// Small source-selector evaluator for the selectors in these contracts. It
// models specificity, source order, !important and width/coarse media queries.
// It deliberately does not model inheritance, intrinsic sizes, fonts or layout.
function splitTop(value, delimiter = ',') {
  const out = []; let start = 0, depth = 0, quote = '';
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quote) { if (c === quote && value[i - 1] !== '\\') quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if ('(['.includes(c)) depth++;
    else if (')]'.includes(c)) depth--;
    else if (!depth && c === delimiter) { out.push(value.slice(start, i).trim()); start = i + 1; }
  }
  out.push(value.slice(start).trim()); return out.filter(Boolean);
}
function endGroup(s, at, open = '(', close = ')') {
  let depth = 0, quote = '';
  for (let i = at; i < s.length; i++) {
    const c = s[i];
    if (quote) { if (c === quote && s[i - 1] !== '\\') quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === open) depth++;
    if (c === close && --depth === 0) return i;
  }
  throw new Error('Unbalanced source group: ' + s.slice(at));
}
function tokens(selector) {
  const out = [];
  for (let i = 0; i < selector.length;) {
    const c = selector[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '[') { const end = endGroup(selector, i, '[', ']'); out.push({ kind: 'attr', value: selector.slice(i + 1, end) }); i = end + 1; continue; }
    const m = selector.slice(i).match(/^([.#:]?)([-\w]+)/);
    if (m) {
      const prefix = m[1], value = m[2]; i += m[0].length;
      if (prefix === ':' && selector[i] === '(') { const end = endGroup(selector, i); out.push({ kind: 'pseudo', value, args: selector.slice(i + 1, end) }); i = end + 1; }
      else out.push({ kind: prefix === '.' ? 'class' : prefix === '#' ? 'id' : prefix === ':' ? 'pseudo' : 'tag', value });
      continue;
    }
    i++; // Universal selector and combinators carry no specificity.
  }
  return out;
}
function compare(a, b) { return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]; }
function specificity(selector) {
  return tokens(selector).reduce((score, t) => {
    let add = [0, 0, 0];
    if (t.kind === 'id') add[0]++;
    else if (t.kind === 'class' || t.kind === 'attr') add[1]++;
    else if (t.kind === 'tag') add[2]++;
    else if (t.value !== 'where') add = t.args && ['is', 'not', 'has'].includes(t.value) ? splitTop(t.args).map(specificity).sort(compare).at(-1) : [0, 1, 0];
    return score.map((n, i) => n + add[i]);
  }, [0, 0, 0]);
}
function compounds(selector) {
  const out = []; let start = 0, depth = 0, quote = '', relation = ' ';
  function push(end) { const part = selector.slice(start, end).trim(); if (part) { out.push({ part, relation }); relation = ' '; } }
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (quote) { if (c === quote && selector[i - 1] !== '\\') quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if ('(['.includes(c)) depth++;
    else if (')]'.includes(c)) depth--;
    else if (!depth && (c === '>' || /\s/.test(c))) { push(i); if (c === '>') relation = '>'; start = i + 1; }
  }
  push(selector.length); return out;
}
function node(tag, classes = '', parent = null, attrs = {}) {
  const result = { tag, attrs: { class: classes, ...attrs }, parent, children: [] };
  if (parent) parent.children.push(result); return result;
}
function all(n) { return [n, ...n.children.flatMap(all)]; }
function matches(n, selector) {
  if (!n) return false;
  function simple(n, value) {
    return tokens(value).every(t => {
      if (t.kind === 'tag') return n.tag === t.value;
      if (t.kind === 'id') return n.attrs.id === t.value;
      if (t.kind === 'class') return (n.attrs.class || '').split(/\s+/).includes(t.value);
      if (t.kind === 'attr') { const m = t.value.match(/^([^=\s]+)(?:\s*=\s*["']?([^"']*)["']?)?$/); return m && (m[2] === undefined ? Object.hasOwn(n.attrs, m[1]) : n.attrs[m[1]] === m[2]); }
      if (t.value === 'is' || t.value === 'where') return splitTop(t.args).some(s => matches(n, s));
      if (t.value === 'not') return !splitTop(t.args).some(s => matches(n, s));
      if (t.value === 'has') return all(n).slice(1).some(child => splitTop(t.args).some(s => matches(child, s)));
      if (t.value === 'first-child') return n.parent?.children[0] === n;
      if (t.value === 'last-child') return n.parent?.children.at(-1) === n;
      return t.value === 'disabled' && Object.hasOwn(n.attrs, 'disabled');
    });
  }
  const parts = compounds(selector);
  function walk(n, i) {
    if (!n || !simple(n, parts[i].part)) return false;
    if (!i) return true;
    if (parts[i].relation === '>') return walk(n.parent, i - 1);
    for (let p = n.parent; p; p = p.parent) if (walk(p, i - 1)) return true;
    return false;
  }
  return parts.length > 0 && walk(n, parts.length - 1);
}
function parseRules(source, media = [], out = []) {
  source = source.replace(/\/\*[\s\S]*?\*\//g, '');
  for (let i = 0; i < source.length;) {
    const open = source.indexOf('{', i); if (open < 0) break;
    const header = source.slice(i, open).trim(), close = endGroup(source, open, '{', '}'), body = source.slice(open + 1, close);
    if (header.startsWith('@media')) parseRules(body, [...media, header.slice(6)], out);
    else if (!header.startsWith('@')) for (const selector of splitTop(header)) {
      const declarations = splitTop(body, ';').map(d => { const at = d.indexOf(':'); return [d.slice(0, at).trim(), d.slice(at + 1).trim()]; }).filter(d => d[0]);
      out.push({ selector, declarations, media, weight: specificity(selector) });
    }
    i = close + 1;
  }
  return out;
}
function mediaMatches(query, width, coarse) {
  return splitTop(query).some(part => {
    if (/forced-colors|prefers-|print/.test(part)) return false;
    if (/pointer\s*:\s*coarse/.test(part) && !coarse) return false;
    for (const m of part.matchAll(/(max|min)-width\s*:\s*(\d+)px/g)) if (m[1] === 'max' ? width > +m[2] : width < +m[2]) return false;
    return true;
  });
}
const rules = parseRules(css);
function style(n, property, width = 1440, coarse = false) {
  let winner;
  for (const rule of rules) {
    if (!rule.media.every(q => mediaMatches(q, width, coarse)) || !matches(n, rule.selector)) continue;
    for (const [key, raw] of rule.declarations) if (key === property) {
      const important = /!important\s*$/.test(raw), value = raw.replace(/!important\s*$/, '').trim();
      if (!winner || Number(important) > Number(winner.important) || important === winner.important && compare(rule.weight, winner.weight) >= 0) winner = { value, important, weight: rule.weight, selector: rule.selector };
    }
  }
  return winner?.value;
}
function pixels(value) { return parseFloat(value) || 0; }
function inset(value) { const values = value.split(/\s+/).map(pixels); return values.length === 1 ? values[0] * 2 : values[1] * 2; }
function columns(value) { return /^repeat\((\d+)/.test(value) ? +value.match(/^repeat\((\d+)/)[1] : (value.match(/minmax\(/g) || []).length; }
const surface = node('div', 'crm-surface');
const dashboard = node('section', '', surface, { id: 'dashboardView' });
const panel = node('div', 'panel crm-dashboard-panel', dashboard);
const heading = node('div', 'panel-heading crm-dashboard-heading', panel);
const headingCopy = node('div', '', heading); node('h2', '', headingCopy);
const filters = node('div', 'period-controls', heading);
const metricGrid = node('div', 'metric-grid analytics-metrics', panel);
const metric = node('article', 'metric', metricGrid), metricValue = node('strong', '', metric);
const current = node('div', 'analytics-grid analytics-current-grid', panel);
const monthly = node('div', 'analytics-grid analytics-monthly-grid', panel);
const card = node('figure', 'analytics-card', current), caption = node('figcaption', '', card);
const cardTitle = node('h4', '', node('div', '', caption));
const sectionTitle = node('h3', '', node('div', 'analytics-section-heading', panel));
const pending = node('dl', 'analytics-pending', card);
const explanation = node('details', 'analytics-explanation', card), summary = node('summary', '', explanation);
const definition = node('p', 'analytics-definition', explanation);

test('source evaluator distinguishes real specificity and width-dependent cascade', () => {
  assert.deepEqual(specificity('.crm-surface :is(p,.info-grid dd)'), [0, 2, 1]);
  assert.deepEqual(specificity('.crm-surface p:is(.analytics-scale,.analytics-definition)'), [0, 2, 1]);
  assert.deepEqual(specificity('.crm-surface :where(.a,#b)'), [0, 1, 0]);
  assert.equal(matches(headingCopy.children[0], '.crm-surface :is(.panel-heading h2,.dialog-heading h2)'), true);
  assert.equal(matches(headingCopy.children[0], '.crm-surface .dialog-heading h2'), false);
  assert.equal(style(node('div', '', card, { 'data-analytics-panel': 'table', hidden: '' }), 'display'), 'none');
});
test('empty composition keeps true zero counts and accessible explanations without empty bars', () => {
  const html = render(fixture());
  assert.equal((html.match(/<article class="metric">/g) || []).length, 4);
  assert.equal((html.match(/<strong>0<\/strong><small>/g) || []).length, 4);
  assert.match(html, /Sin altas en este mes\. La conversión no tiene denominador/);
  assert.match(html, /Sin base/);
  assert.doesNotMatch(html, /stroke-dasharray|class="analytics-bar"|NaN|Infinity/);
  assert.equal((graph(html, 'pending').match(/<dd>0<\/dd>/g) || []).length, 3);
  assert.doesNotMatch(graph(html, 'pending'), /is-overdue/);
  assert.match(figure(html, 'activity'), /Sin actividades registradas en este mes/);
  assert.match(html, /analytics-card--activity/);
});
test('sparse stage, origin and activity render exact single-category summaries', () => {
  const s = fixture(); add(s, 'one');
  s.activities.a = { id: 'a', type: 'note', actorId: 'kam_ana', contactId: 'one', contactAt: '2026-10-04T12:00:00Z' };
  const html = render(s);
  for (const id of ['stage', 'origin', 'activity']) {
    assert.match(graph(html, id), /analytics-single/); assert.match(graph(html, id), /<strong>1<\/strong>/);
    assert.doesNotMatch(graph(html, id), /<svg|width="100"/);
  }
  assert.match(html, /0 intentos de contacto · 1 nota · 0 otras actividades/);
  assert.match(html, /Las notas no son intentos de contacto/);
  assert.match(figure(html, 'stage'), /<td>0<\/td>/, 'The table retains empty stages');
  assert.match(figure(html, 'conversion'), /0 %/);
});
test('dense categories and all pending buckets remain exact and data tables retain full detail', () => {
  const s = fixture(), stages = ['new', 'contacted', 'interested', 'application_started'], sources = ['manual', 'organic', 'campaign', 'kam_referral'];
  for (let i = 0; i < 160; i++) {
    const id = 'c' + i; add(s, id, stages[i % 4], sources[i % 4], 'kam_' + i % 8);
    s.activities[id] = { id, type: i % 3 ? 'call' : 'note', actorId: 'user_' + i % 20, contactId: id, contactAt: '2026-10-04T12:00:00Z' };
    s.tasks[id] = { contactId: id, status: 'open', dueAt: ['2026-10-11T12:00:00Z', '2026-10-12T18:00:00Z', '2026-10-14T12:00:00Z', null][i % 4] };
  }
  const r = report(s), before = JSON.stringify(r), html = Analytics.renderDashboard(r, { idPrefix: 'composition' });
  assert.equal(JSON.stringify(r), before, 'Presentation never mutates report data');
  assert.equal((graph(html, 'pending').match(/<dd>40<\/dd>/g) || []).length, 4);
  assert.equal((graph(html, 'pending').match(/is-overdue/g) || []).length, 1);
  assert.match(graph(html, 'pending'), /Sin fecha válida/);
  assert.equal((graph(html, 'activity').match(/analytics-bar-row/g) || []).length, 20);
  assert.equal((figure(html, 'activity').match(/<th scope="row">/g) || []).length, 20);
  assert.match(graph(html, 'origin'), /Escala desde 0 hasta 40 contactos/);
  assert.equal((figure(html, 'kam').match(/<th scope="row">/g) || []).length, 8);
});
test('native disclosures, labels and five chart/table pairs remain keyboard-accessible and uniquely linked', () => {
  const html = render(fixture());
  const ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const m of html.matchAll(/aria-(?:controls|labelledby)="([^"]+)"/g)) for (const id of m[1].split(' ')) assert.ok(ids.includes(id), id);
  assert.equal((html.match(/data-analytics-view="graph"/g) || []).length, 5);
  assert.equal((html.match(/data-analytics-panel="table" hidden/g) || []).length, 5);
  assert.equal((html.match(/<details class="analytics-explanation"><summary>/g) || []).length, 4);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b|\sonclick=|role="button"/);
  assert.match(html, /<summary>Cómo se calculan los indicadores<\/summary>/);
  const monthlySection = html.split('aria-labelledby="composition-monthly">')[1].split('</section>')[0];
  assert.match(monthlySection, /data-analytics-figure="composition-origin"/);
  assert.match(monthlySection, /data-analytics-figure="composition-conversion"/);
  assert.match(monthlySection, /class="analytics-activity-row"[\s\S]*data-analytics-figure="composition-activity"/);
  assert.doesNotMatch(monthlySection, /data-analytics-figure="composition-kam"/);
  assert.match(template, /class="period-controls" role="group" aria-label="Filtros del dashboard"/);
  for (const [label, id] of [['Mes', 'dashboardMonth'], ['Año', 'dashboardYear'], ['Responsable', 'dashboardKam']]) assert.match(template, new RegExp('<label>' + label + '<(?:select|input) id="' + id + '"'));
  for (const width of [320, 390, 768]) assert.equal(style(summary, 'min-height', width), '44px');
  const touchSwitcher = node('div', 'analytics-view-switch', caption);
  const touchButton = node('button', '', touchSwitcher);
  const methodSummary = node('summary', '', node('details', 'analytics-method', panel));
  for (const width of [1440, 2048]) for (const control of [touchButton, summary, methodSummary]) assert.equal(style(control, 'min-height', width, true), '44px', width + ' coarse-pointer control');
});
test('BO typography and disclosure copy win the effective source cascade', () => {
  assert.match(typography, /--bo-size-section:21px/); assert.match(typography, /--bo-size-card:17px/);
  assert.equal(style(sectionTitle, 'font-size'), 'var(--bo-size-section)');
  assert.equal(style(cardTitle, 'font-size'), 'var(--bo-size-card)');
  assert.equal(style(metricValue, 'font-size'), 'var(--bo-size-kpi)');
  assert.equal(style(definition, 'font-size'), 'var(--bo-size-label)');
  assert.equal(style(definition, 'color'), 'var(--muted)');
  assert.equal(style(node('p', 'analytics-single-note', card), 'font-size'), 'var(--bo-size-meta)');
  assert.equal(style(node('p', 'analytics-scale', card), 'font-size'), 'var(--bo-size-label)');
  assert.equal(style(card, 'align-self'), 'stretch');
  assert.equal(style(current, 'align-items'), 'stretch');
  assert.equal(style(metric, 'min-height'), '0');
});
test('long unbroken labels and large exact counts have wrap and shrink contracts', () => {
  const s = fixture(); add(s, 'one'); const r = report(s);
  const label = 'María de los Ángeles Hernández <DEMO> ' + 'Apellido'.repeat(40);
  r.activityByActor = [{ actorId: 'one', value: 123456789 }];
  r.counts.activities = 123456789;
  const html = Analytics.renderDashboard(r, { idPrefix: 'composition', kamLabels: { one: label } });
  assert.match(html, /123456789/); assert.match(html, /&lt;DEMO&gt;/); assert.doesNotMatch(html, /<DEMO>/);
  const barLabel = node('div', 'analytics-bar-label', node('li', 'analytics-bar-row', card));
  assert.equal(style(node('span', '', barLabel), 'overflow-wrap'), 'anywhere');
  assert.equal(style(node('strong', '', barLabel), 'overflow-wrap'), 'anywhere');
  assert.equal(style(metricValue, 'overflow-wrap'), 'anywhere');
  assert.equal(style(card, 'min-width'), '0');
  const table = node('div', 'analytics-table-scroll', card);
  assert.equal(style(table, 'max-width'), '100%'); assert.equal(style(table, 'overflow'), 'auto');
  assert.equal(style(table, 'max-height'), '280px');
});
test('320/390/768/1440/2048 source geometry keeps compact KPIs, aligned rows and contained controls', () => {
  const shell = read('backoffice.html');
  assert.match(shell, /grid-template-columns:282px minmax\(0,1fr\)/);
  assert.match(shell, /\.content\{padding:28px 30px 44px\}/);
  assert.match(shell, /\.content\{padding:20px 16px\}/);
  assert.equal(style(dashboard, 'max-width'), '1440px');
  for (const width of [320, 390, 768, 821, 1100, 1180, 1440, 2048]) {
    const content = Math.min(1440, width <= 820 ? width - 32 : width - (width <= 1180 ? 240 : 282) - 60);
    const kpiColumns = columns(style(metricGrid, 'grid-template-columns', width));
    const currentColumns = columns(style(current, 'grid-template-columns', width));
    const monthlyColumns = columns(style(monthly, 'grid-template-columns', width));
    assert.equal(kpiColumns, width <= 1100 ? 2 : 4, width + ' KPI columns');
    assert.equal(currentColumns, width <= 1100 ? 1 : 2, width + ' current columns');
    assert.equal(monthlyColumns, width <= 820 ? 1 : 2, width + ' monthly columns');
    assert.equal(columns(style(filters, 'grid-template-columns', width)), width <= 520 ? 2 : 3, width + ' filter columns');
    assert.equal(columns(style(pending, 'grid-template-columns', width)), width <= 520 ? 1 : 3, width + ' pending columns');
    assert.equal(inset(style(heading, 'padding', width)), 0, width + ' heading and card edges align');
    assert.equal(inset(style(current, 'padding', width)), 0, width + ' current row has no nested horizontal inset');
    assert.equal(inset(style(monthly, 'padding', width)), 0, width + ' monthly row has no nested horizontal inset');
    const kpiInner = (content - (kpiColumns - 1) * pixels(style(metricGrid, 'gap', width))) / kpiColumns - inset(style(metric, 'padding', width)) - 2;
    const cardInner = (content - (currentColumns - 1) * pixels(style(current, 'gap', width))) / currentColumns - inset(style(card, 'padding', width)) - 2;
    assert.ok(kpiInner >= 100, width + ' KPI leaves a useful wrapping text area: ' + kpiInner);
    assert.ok(cardInner >= 250, width + ' card leaves usable graph/counter width: ' + cardInner);
    const switcher = node('div', 'analytics-view-switch', caption), button = node('button', '', switcher);
    assert.equal(style(button, 'min-height', width), width <= 820 ? '44px' : '32px');
  }
  assert.equal(style(node('ol', 'analytics-bars', node('figure', 'analytics-card analytics-card--activity', panel)), 'max-height'), '156px');
  assert.equal(style(node('div', 'analytics-empty', card), 'min-height'), '0');
});
console.log('PASS: ' + passed + ' dashboard composition, semantic, source-cascade and authored geometry contracts. Browser rendering remains unverified.');
