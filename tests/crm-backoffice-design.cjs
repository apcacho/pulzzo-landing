'use strict';
// Source/cascade contracts, not a browser-rendering or pixel-comparison test.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const css=read('assets/css/crm-demo-embed.css'),shell=read('assets/css/backoffice-crm.css');
const reference=read('assets/css/backoffice-refinement.css'),html=read('backoffice.html');
const template=read('assets/js/crm-demo-template.js'),adapter=read('assets/js/crm-demo-embed.js');
const tokenNames=['--bo-font','--bo-display','--bo-size-body','--bo-size-meta','--bo-size-label','--bo-size-action','--bo-size-section','--bo-size-card','--bo-size-entity','--bo-size-item','--bo-size-kpi','--bo-weight-body','--bo-weight-control','--bo-weight-label','--bo-weight-entity','--bo-weight-heading','--bo-weight-number','--bo-weight-metric','--bo-control-height','--bo-field-height','--bo-control-radius','--bo-control-pad','--bo-control-ink','--bo-control-focus'];
for(const name of tokenNames){assert.ok(reference.includes(name+':'),`Backoffice owns ${name}`);assert.ok(css.includes(`var(${name})`),`CRM consumes ${name}`);}
assert.match(css,/--ink:var\(--navy\);--canvas:var\(--bg\);--card:var\(--white\)/);
assert.match(css,/--accent:var\(--aqua\);--soft:var\(--aqua-bg\)/);
assert.match(css,/\.crm-surface\[data-context="doctor"\]\{--accent:var\(--coral\);--soft:var\(--coral-s\)/);
assert.doesNotMatch(css,/#2477ba|#b95c37|#20323f|#f6f8fa/i,'No independent legacy CRM palette survives the native style contract');
assert.match(css,/\.primary\{background:var\(--accent\);border-color:var\(--accent\);color:var\(--bo-control-ink\)\}/);
for(const selector of ['context-link','tab'])assert.match(css,new RegExp(`\\.${selector}\\.active\\{background:var\\(--soft\\);border-color:var\\(--crm-selection-line\\);color:var\\(--bo-control-ink\\)`));
assert.match(css,/\.notice\{background:var\(--soft\)/,'Ordinary success feedback is not an approval-green status');
assert.match(css,/\.detail-name>div\{min-width:0;flex:1\}/);
assert.match(css,/\.detail-name h2\{overflow-wrap:anywhere;/);
assert.match(css,/\.contact-list\{max-height:none;overflow:visible\}/);
assert.match(css,/\.capture-history>\.timeline\{max-height:none;overflow:visible\}/);
assert.doesNotMatch(shell,/height:100(?:d)?vh|overflow:hidden|padding:0|iframe|crmWorkspaceFrame/,'Native CRM keeps the existing content scroll and inset');
assert.match(shell,/#crmWorkspace\{display:block;min-width:0;width:100%\}/);
assert.match(adapter,/host\.attachShadow\(\{mode:'open'\}\)/);
assert.ok(adapter.indexOf("'assets/css/crm-demo.css'")<adapter.indexOf("'assets/css/crm-demo-embed.css'"));
assert.match(adapter,/surface\.className = 'crm-surface'/);
assert.match(adapter,/body:surface, documentElement:surface/);
assert.doesNotMatch(template,/<iframe|class="app-header"|class="sidebar"|class="page-heading"|id="pageTitle"|<h1/,'Backoffice is the only page shell and title');
for(const cls of ['crm-toolbar','crm-contexts','crm-toolbar-actions']){assert.ok(template.includes(`class="${cls}"`));assert.ok(css.includes('.'+cls+'{'));}
assert.match(css,/\.crm-surface \.task-card \.task-actions button\{min-height:var\(--bo-control-height\)\}/,'Scoped task action height beats legacy mobile rule without overriding row/icon roles');
assert.match(css,/@media\(max-width:820px\),\(pointer:coarse\)\{\.crm-surface\{--bo-control-height:44px;--bo-field-height:44px\}/);
assert.match(css,/@media\(max-width:820px\)\{\s*\.crm-surface :is\(input,select,textarea\)\{font-size:16px\}/);
assert.match(css,/:is\(input,select\):not\(:where\(/,'Field exclusions have zero specificity so select padding-right wins');
assert.match(css,/select:not\(\[multiple\]\):is\(:not\(\[size\]\),\[size="0"\],\[size="1"\]\)\{[^}]*padding-right:44px;[^}]*background-position:right 14px center;background-size:12px 12px/);
const chevron=s=>s.match(/data:image\/svg\+xml,[^"]+/)[0];assert.equal(chevron(css),chevron(reference),'Exact Backoffice select indicator');
assert.match(css,/:focus-visible\{outline:2px solid var\(--bo-control-focus\);outline-offset:-2px;box-shadow:none\}/);
assert.match(css,/\.panel\{border:1px solid var\(--line2\);border-radius:20px;box-shadow:0 4px 18px rgba\(7,20,47,\.025\)/);
assert.match(reference,/#providers \.patient-profiles-card[^}]*border-radius:20px;box-shadow:0 4px 18px rgba\(7,20,47,\.025\)/);
assert.match(css,/\.metric\{border:1px solid var\(--line2\);border-radius:22px;padding:18px;min-height:120px/);
assert.match(html,/\.kpi\{[^}]*border-radius:22px;padding:18px;[^}]*min-height:120px/);
assert.match(css,/\.metric strong\{font:var\(--bo-weight-number\) var\(--bo-size-kpi\)\/1.2 var\(--bo-display\)/);
assert.match(css,/\.dialog-heading\{padding:22px 24px/);assert.match(css,/#dialogContent\{padding:22px 24px\}/);
assert.match(css,/\.badge\{font:var\(--bo-weight-control\) var\(--bo-size-label\)\/1.4 var\(--bo-font\)/);
assert.match(css,/@media\(forced-colors:active\)\{\.crm-surface select:not\(\[multiple\]\):is\(:not\(\[size\]\),\[size="0"\],\[size="1"\]\)\{appearance:auto;-webkit-appearance:auto;background-image:none\}/,'High-contrast native indicator matches regular selector specificity');
require('esbuild').transform(css,{loader:'css',logLevel:'silent'}).then(result=>{
 assert.equal(result.warnings.length,0,JSON.stringify(result.warnings));
 return require('esbuild').transform(shell,{loader:'css',logLevel:'silent'});
}).then(result=>{
 assert.equal(result.warnings.length,0,JSON.stringify(result.warnings));
 console.log('PASS: native CRM shared Backoffice palette, type/control tokens, select glyph, cards, KPIs, modal, responsive and single-scroll source contracts; CSS parses without warnings. Visual rendering remains unverified.');
}).catch(e=>{console.error(e);process.exit(1);});
