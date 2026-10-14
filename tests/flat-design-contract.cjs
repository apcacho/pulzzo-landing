'use strict';
// Source contracts only: these assertions do not claim browser rendering QA.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const tokens=read('assets/css/flat-design-tokens.css');
assert.match(tokens,/:root,:host\{/,'Same tokens are available in native documents and the CRM shadow root');
assert.match(tokens,/--ui-surface-shadow:none;/);
assert.match(tokens,/--ui-patient-accent:#20C7D4;/);
assert.match(tokens,/--ui-provider-accent:#FF8A5B;/);
assert.match(tokens,/--ui-surface-radius:12px;/);
assert.match(tokens,/:focus-visible\{\s*outline:2px solid var\(--ui-focus-ink,#14263D\)!important;/);
assert.match(tokens,/@media\(forced-colors:active\)/);
const pages=['solicitud-paciente.html','registro-doctor.html','registro-paciente.html','login-doctor.html','login-paciente.html','backoffice.html','asistido-demo.html','crm-demo.html','verificacion-cuenta.html','verificacion-doctor.html'];
const checkShadows=(css,name)=>{
 for(const m of css.matchAll(/(--[\w-]*shadow[\w-]*)\s*:\s*([^;}]+)/g)){
  assert.equal(m[2].trim(),m[1]==='--ui-surface-shadow'?'none':'var(--ui-surface-shadow,none)',`${name}: every shadow alias consumes the canonical flat token`);
 }
 for(const m of css.matchAll(/(?<![\w-])box-shadow\s*:\s*([^;}]+)/g)){
  assert.match(m[1].trim(),/^(?:none|var\(--ui-surface-shadow,none\))\s*(?:!important)?$/,`${name}: no decorative or selection shadow`);
 }
};
for(const page of pages){
 const html=read(page);assert.equal(html.split('href="assets/css/flat-design-tokens.css"').length-1,1,page+': one shared token source');
 if(['registro-doctor.html','solicitud-paciente.html'].includes(page)){assert.match(html,/native-original-onboarding/);const crypto=require('node:crypto');assert.deepEqual([...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(m=>crypto.createHash('sha256').update(m[1]).digest('hex')),require('./fixtures/native-original-styles.json')[page].styles);continue;}
 for(const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g))checkShadows(m[1],page);
}
for(const name of fs.readdirSync(path.join(root,'assets/css')).filter(n=>n.endsWith('.css')))checkShadows(read('assets/css/'+name),name);
const shared=read('assets/css/shared-onboarding.css');
assert.match(shared,/--capture-accent:var\(--ui-patient-accent\)/);
assert.match(shared,/--capture-accent:var\(--ui-provider-accent\)/);
assert.match(shared,/\.shared-capture-context\{[^}]*border-radius:var\(--ui-surface-radius\)/);
assert.doesNotMatch(shared,/\.app-head[^}]*display:none|\.flow-timeline[^}]*display:none/,'Native timeline and heading remain visible');
const doctor=read('assets/css/doctor-shared-onboarding.css');
assert.doesNotMatch(doctor,/\.auth-copy|\.auth-bg|\.auth-card\{/,'Shared context does not replace native provider registration shell; content-bound hero background tested separately');
assert.match(read('solicitud-paciente.html'),/box-shadow:/,'Original camera and surface styles are pinned to the uploaded reference');
const semantics=read('assets/css/portal-color-semantics.css');
assert.match(semantics,/border-bottom-color:var\(--ui-selection-indicator\)!important/);
const build=read('scripts/build-crm-embed.mjs');
assert.match(build,/const sources=\['assets\/css\/flat-design-tokens.css'/);
assert.ok(read('scripts/mail-public-assets.mjs').includes("'assets/css/flat-design-tokens.css'"));
console.log('PASS: canonical flat native/Shadow DOM surfaces, patient aqua/provider orange, preserved native shells, border selection, camera masking and visible keyboard focus. Browser rendering unverified.');
