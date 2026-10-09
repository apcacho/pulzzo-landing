'use strict';
// Source/cascade contracts only: these checks do not claim rendered geometry.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'backoffice.html'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/css/backoffice-refinement.css'),'utf8');
const layoutCss=css.split('/* BACKOFFICE SHARED TYPOGRAPHY')[0];
const clean=layoutCss.replace(/\/\*[\s\S]*?\*\//g,'');
const rules=[...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m=>!m[1].trim().startsWith('@'));
assert.ok(rules.length>50,'Retained scoped layout rules loaded');
assert.equal((css.match(/\{/g)||[]).length,(css.match(/\}/g)||[]).length);
for(const [,selectors,body] of rules){
 for(const s of selectors.trim().split(',')){
  assert.match(s.trim(),/^(#(?:providers|providerRequests)\s|#offers\s|#history\s|body:has\(#(?:providers|providerRequests|offers|history)\.active\) \.topbar h1$)/,'No global or other-view selectors');
  if(/#offers|#history/.test(s))assert.doesNotMatch(body,/coral|#FF8A5B|#F9734A/i,'Orange remains provider-scoped');
 }
 assert.doesNotMatch(body,/font-weight:\s*[6-9]\d\d/,'Typography remains light');
}
const rule=selector=>rules.filter(m=>m[1].split(',').some(s=>s.trim()===selector)).map(m=>m[2]).join(';');
assert.ok(html.indexOf('assets/css/backoffice-refinement.css')>html.indexOf('assets/css/backoffice-responsive.css'));
for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.html')&&f!=='backoffice.html'))assert.ok(!fs.readFileSync(path.join(root,file),'utf8').includes('backoffice-refinement.css'),file);
assert.doesNotMatch(layoutCss,/(?:font-(?:size|weight|family)|letter-spacing|line-height|text-transform):/,'Legacy module-specific typography was consolidated into shared roles');
assert.match(rule('#providers .patient-profile-name'),/white-space:normal/);
assert.match(rule('#providers .patient-profile-view-btn'),/min-height:44px/);
assert.match(css,/body\.backoffice-typography :where\(input,select,textarea\)\{font-size:16px!important\}/,'Shared mobile input scale replaces the provider-only exception');
assert.match(rule('#offers .table-wrap'),/overflow-x:auto/);
assert.match(rule('#offers .table'),/min-width:1100px/);
assert.match(rule('#offers .table td:nth-child(3)'),/text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums/);
assert.match(css,/@layer backoffice-controls/,'Action chrome belongs to the shared control role contract');
assert.match(rule('#offers .pill'),/white-space:normal/);
for(const view of ['#providers','#history']){
 assert.match(rule(view+' .timeline'),/grid-template-columns:minmax\(0,1fr\)/);
 assert.match(rule(view+' .event'),/grid-template-columns:20px minmax\(0,1fr\)/);
 assert.match(rule(view+' .event>div:first-child'),/display:none/);
 assert.match(rule(view+' .event-card'),/grid-column:2;grid-row:1;min-width:0;width:100%/);
 assert.match(rule(view+' .event-card'),/overflow-wrap:anywhere/);
 assert.match(rule(view+' .event::before'),/grid-column:1;grid-row:1/);
 assert.match(rule(view+' .event:last-child::after'),/display:none/);
}
assert.match(css,/@media\(max-width:760px\)/);
assert.match(rule('#providers .provider-row'),/grid-template-columns:minmax\(0,1fr\);/);
assert.match(rule('#history .event'),/grid-template-columns:16px minmax\(0,1fr\)/);
const behaviorHtml=require('./fixtures/restore-pre-sidebar.cjs')(html);
const scripts=[...behaviorHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>crypto.createHash('sha256').update(m[1]).digest('hex'));
assert.deepEqual(scripts,require('./fixtures/backoffice-script-baseline.json'),'Inline scripts match the reviewed backoffice baseline');
console.log('PASS: retained scoped layout, table readability, timeline grid placement, mobile controls and reviewed backoffice scripts. Browser visual QA remains unrun.');
