'use strict';
// Source, CSS-context and actual-adapter DOM tests only. No layout engine or pixel QA.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('registro-doctor.html'),css=read('assets/css/doctor-shared-onboarding.css');
// Reuse the production-profile VM fixture without running its independent suite.
const fixtureFile=path.join(__dirname,'doctor-shared-onboarding.cjs');
const fixture=read('tests/doctor-shared-onboarding.cjs').split('(async()=>{')[0];
const runtime={require:require('node:module').createRequire(fixtureFile),__dirname,console,Blob,URL,URLSearchParams,Buffer,atob};
vm.createContext(runtime);vm.runInContext(fixture+'\nglobalThis.makeHarness=harness;',runtime);
for(const holder of [false,true])for(const first of ['#datos-medicos','#perfil-medico']){
 const h=runtime.makeHarness({holder}),doc=h.win.document,placements=[];
 const registration=h.node('native-registration'),hero=h.node('native-hero');
 registration.before=banner=>placements.push({at:'registration',banner});
 h.node('form').before=banner=>placements.push({at:'form',banner});
 hero.after=banner=>placements.push({at:'hero',banner});
 const query=doc.querySelector;
 doc.querySelector=selector=>selector==='#doctorProfileView > .profile-hero'?hero:selector==='main.auth-shell'||selector==='main'?registration:query(selector);
 h.win.location.hash=first;h.helper.prepareBasic(()=>{});
 assert.equal(placements.at(-1).at,first==='#datos-medicos'?'form':'hero');
 const banner=placements.at(-1).banner;assert.equal(banner.id,'shared-doctor-banner');
 for(const hash of ['#perfil-medico','#datos-medicos','#perfil-medico','#perfil-medico']){
  h.win.location.hash=hash;for(const callback of h.events.hashchange)callback();
  assert.equal(placements.at(-1).at,hash==='#datos-medicos'?'form':'hero');
  assert.equal(placements.at(-1).banner,banner,'navigation moves the same context, never duplicates it');
 }
 assert.equal(h.win.location.href,'','layout navigation never redirects or opens another expediente');
 assert.equal(JSON.stringify([...h.globalData]),h.baseline,'layout does not modify unrelated account state');
}
assert.equal((html.match(/id="doctorProfileView"/g)||[]).length,1);
assert.match(html,/<main id="doctorProfileView" class="doctor-profile-view"[^>]*>\s*<section class="profile-hero">/);
assert.match(html,/\.doctor-profile-view\{display:none;max-width:1320px;margin:0 auto;padding:104px 32px 72px/,'native desktop geometry retained');
assert.match(html,/body.profile-mode \.profile-hero\{background:var\(--navy\);margin:0!important;padding:112px 24px 34px!important/,'native mobile hero retained');
assert.match(css,/body\.crm-doctor-onboarding\.profile-mode\{background:var\(--offwhite\)!important;overflow-x:clip\}/,'scoped backdrop replaces fixed body-coordinate cutoff and contains full bleed');
assert.match(css,/\.profile-hero\{position:relative;isolation:isolate\}/,'hero owns its backdrop stacking context');
assert.match(css,/\.profile-hero::before\{[^}]*pointer-events:none;[^}]*width:100vw;[^}]*top:-104px;bottom:-32px;[^}]*background:var\(--navy\)/,'backdrop height tracks content, not a fixed pixel height');
assert.match(css,/@media\(max-width:900px\)\{\s*body\.crm-doctor-onboarding\.profile-mode \.profile-hero::before\{top:0;bottom:0\}/);
assert.match(css,/#shared-doctor-banner\{width:calc\(100% - 24px\);margin:16px 12px\}/,'mobile context stays inside viewport');
assert.doesNotMatch(css.split('/* Visual comparison v34:')[0],/box-shadow\s*:|height\s*:|font-size\s*:|\.profile-panel|\.profile-card/,'no new elevation, fixed hero height, typography or form overrides');
assert.deepEqual(require('esbuild').transformSync(css,{loader:'css',logLevel:'silent'}).warnings,[]);
console.log('PASS doctor shared visual parity: native single profile DOM; assistant/holder repeated navigation moves one context between native form and profile hero; content-bound navy backdrop at desktop/mobile, unchanged native form geometry. Browser pixels unverified.');

assert.match(css,/body\.crm-doctor-onboarding:not\(\.profile-mode\) \.auth-wrap\{grid-template-columns:minmax\(0,1fr\)!important\}/);
assert.doesNotMatch(css,/#shared-doctor-basic-editor\{/,'native card gets no relocation sizing override');

// Fiscal-only parity correction may style capture inputs; all earlier shell rules
// remain under the unchanged guard above. Every new style is confined to fiscal.
const fiscalCSS=css.split('/* Visual comparison v34:')[1];
assert.ok(fiscalCSS);
const fiscalRules=[...fiscalCSS.matchAll(/(body[^{}]+)\{([^{}]*)\}/g)];
assert.ok(fiscalRules.length>=5);
for(const [,selector] of fiscalRules)assert.match(selector,/^body\.crm-doctor-onboarding\.profile-mode #doctorProfilePanel \.profile-fiscal-grid/);
assert.match(fiscalCSS,/input:focus\{outline:2px solid #ff8a5b;outline-offset:4px/);
assert.doesNotMatch(fiscalCSS,/pointer-events:none|display:none|visibility:hidden/);
