'use strict';
// Source-level color/behavior contracts; browser rendering is a separate check.
// Reviewed snapshots: unified signup/explicit legacy continuation and compact
// shared capture shell; native patient forms and holder-owned identity evidence.
// Financial formulas and holder-only consent/submission boundaries remain unchanged.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const css=read('assets/css/portal-color-semantics.css');
const ruleText=css.replace(/\/\*[\s\S]*?\*\//g,'');
const pages={
 'login-paciente.html':'5a5e4b0d125e940ae6d95e7c05f28ba0ef14f5cece47acddf5538cc35b1cf642',
 'login-doctor.html':'9e374c373a12aa828ee366c3c253d890daef3f9c5b9e732c75ab658319d8a8b6',
 'registro-paciente.html':'ccfab7d3ea0e684fd2a201fb275b63414da7946e4c2b95b2c46da45a089145b3',
 'registro-doctor.html':'7c424706ad5224c4c0b6d3e7cc9113a06951b04950aa02cadf3136a135255596',
 'verificacion-cuenta.html':'ce2f4184c76a5a208fd0bdf68bdc18012774804fa13fd7835c54f87061c65843',
 'verificacion-doctor.html':'b8dd3e5c6f0ea646c19e78308eb77a151cfacecf169b38d2e41487238b790096',
 'solicitud-paciente.html':'41f48dad3ce330ee6c3bd65c92eaab18491e9cd05ae0e082975f4f0a815aa826'
};
const classRole='ui-(?:action-(?:primary|secondary|commitment|danger|warning)|selection(?:-current)?|choice)';
const stripRoles=text=>text.replace(new RegExp(' class="'+classRole+'"','g'),'').replace(new RegExp(' '+classRole+'\\b','g'),'');
for(const [file,originalScriptHash] of Object.entries(pages)){
 const html=read(file);
 const theme=file.includes('doctor')?'doctor':'patient';
 const native=['registro-doctor.html','solicitud-paciente.html'].includes(file);assert.match(html,new RegExp('<body[^>]*class="[^"]*'+(native?'native-original-onboarding':'ui-color-semantics')+' ui-'+theme+'"'),file+': original onboarding or scoped portal theme');
 const link='<link rel="stylesheet" href="assets/css/portal-color-semantics.css">';
 assert.equal(html.split(link).length-1,1,file+': one late semantic stylesheet');
 assert.ok(html.indexOf(link)>html.lastIndexOf('</style>'),file+': semantic colors follow legacy layout styles');
 // External central staff module adds no portal inline behavior. Preserve the prior inline hash.
 let scripts=[...html.replace('<script src="assets/js/staff-access.js"></script>','').replace('<script src="assets/js/native-registration.js"></script>','').replace('<script src="assets/js/pulzzo-v1.js"></script>','').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match=>match[1]).join('\n');
 scripts=require('./fixtures/restore-native-registration.cjs')(file,scripts);
 // Normalize only the reviewed shared-session branches; the unchanged organic
 // controller must still match the prior full script snapshot exactly.
 if(file==='registro-doctor.html'){
  // Explicit inverse patches for reviewed registration-shell, photo-row and dirty-guard fixes.
  // The existing full behavioral hash below remains unchanged.
  for(const {approved,previous} of JSON.parse(read('tests/fixtures/doctor-registration-parity-approved-changes.json'))){
   assert.equal(scripts.split(approved).length,2,'exact reviewed doctor registration correction');
   scripts=scripts.replace(approved,previous);
  }
  const sharedOnly=[
   ["    if(sharedContext&&type==='click'&&event.target?.closest?.('a[data-shared-return]')?.closest?.('#shared-doctor-banner'))return;\n",''],
   ['function updateAccountType(t,preserveSelection=false){','function updateAccountType(t){'],
   ['  if(preserveSelection){updateEspSummary();setProcedureSummary();return;}\n',''],
   ['e=>updateAccountType(e.target.value,!!window.PulzzoSharedDoctorOnboarding?.context)','e=>updateAccountType(e.target.value)'],
   ["if((!sharedContext&&location.hash!=='#perfil-medico')||doctorAccountCurrent())return;","if(location.hash!=='#perfil-medico'||doctorAccountCurrent())return;"],
   ["    if(sharedContext)sharedFlow.syncRoute();\n    let isProfile = !!sharedContext || location.hash === '#perfil-medico';","    let isProfile = location.hash === '#perfil-medico';"],
   ["document.title=sharedContext&&location.hash==='#datos-medicos'?'Datos principales | Pulzzo':'Perfil médico | Pulzzo';","document.title='Perfil médico | Pulzzo';"]
  ];
  for(const [approved,original] of sharedOnly){assert.equal(scripts.split(approved).length,2,'exact shared-only integration branch');scripts=scripts.replace(approved,original);}
 }
 assert.equal(sha(stripRoles(scripts)),originalScriptHash,file+': reviewed behavior snapshot (approved shared full-form integration and legacy lifecycle audited 2026-10-12) with explicit CSS roles');
 const controls=[...html.matchAll(/<(?:button|a)\b[^>]*>/g)].map(match=>match[0]);
 for(const tag of controls.filter(tag=>(tag.match(/class="([^"]*)"/)?.[1]||'').split(/\s+/).some(token=>['auth-btn','btn'].includes(token)))){
  assert.match(tag,/ui-action-(?:primary|secondary)/,file+': auth/application controls have explicit action roles');
  if(tag.startsWith('<a')&&tag.includes('href="index.html"'))assert.match(tag,/ui-action-secondary/,file+': back home is neutral');
 }
}
assert.match(ruleText,/@layer portal-color-semantics/,'A scoped important layer wins legacy unlayered color overrides');
assert.match(ruleText,/\.ui-doctor\{[\s\S]*?--ui-brand:var\(--coral,#FF8A5B\)/,'Doctor primary is orange');
assert.match(ruleText,/--ui-brand:var\(--aqua,#20C7D4\)/,'Patient primary is aqua');
assert.match(ruleText,/--ui-selection-bg:#EAF9FA/);
assert.match(ruleText,/--ui-selection-bg:#FFF1E9/);
assert.match(ruleText,/border-bottom-color:var\(--ui-selection-indicator\)!important/,'Selected navigation has a flat border indicator');
assert.match(ruleText,/outline-offset:-2px!important/,'Keyboard focus stays attached to the control');
assert.doesNotMatch(ruleText,/(?<![-\w])(?:min-height|height|width|padding|font-size|text-align)\s*:/,'Color layer does not change geometry, headings or compact-control dimensions');
assert.doesNotMatch(ruleText,/--ui-(?:brand|brand-hover):[^;]*(?:green|#16A34A|#22C55E)/i,'Commitments are not success-green');
const patient=read('solicitud-paciente.html');
const tags=[...patient.matchAll(/<button\b[^>]*>/g)].map(match=>match[0]);
for(const action of ['accept-offer','sign-contract','upload-signed-contract']){
 const matches=tags.filter(tag=>tag.includes('data-stage-action="'+action+'"'));
 assert.ok(matches.length,action+' is represented');
 for(const tag of matches)assert.match(tag,/ui-action-commitment/,action+' is an explicit commitment, not approval');
}
for(const tag of tags){
 if(/data-stage-action="view-[^"]+"/.test(tag)||tag.includes('onclick="closeDocumentModal()"')||(tag.includes('onclick="setPortalTab(')&&!tag.includes('ui-selection')))assert.match(tag,/ui-action-secondary/,'View/back/close actions stay neutral');
 if(tag.includes('data-stage-action="reject-offer"')||/data-remove-(?:identity|document)=/.test(tag))assert.match(tag,/ui-action-danger/,'Reject/remove actions stay destructive');
 if(tag.includes('data-resubmit-portal-file='))assert.match(tag,/ui-action-primary/,'Re-uploading a correction is not a rejection action');
 if(/class="portal-(?:tab|mobile-tab-option)\b/.test(tag))assert.match(tag,/ui-selection/,'Both patient navigation forms use selection styling');
}
const doctor=read('registro-doctor.html');
assert.match(doctor,/const tone=locked\?' ui-action-secondary':' profile-btn-primary ui-action-primary';/,'Edit/save attention keeps distinct secondary/primary roles');
assert.match(doctor,/class="profile-btn profile-btn-primary ui-action-primary"[^>]*data-profile-contact-save/);
for(const tag of [...doctor.matchAll(/<button\b[^>]*>/g)].map(match=>match[0])){
 if(/data-doctor-profile-(?:mobile-)?tab=/.test(tag))assert.match(tag,/ui-selection/,'Both doctor navigation forms use selection styling');
 if(/data-profile-doc=|data-profile-contact-cancel|data-profile-contact-edit|data-profile-correction-target=/.test(tag))assert.match(tag,/ui-action-secondary/,'Doctor review and navigation controls stay neutral');
}
console.log('PASS: seven scoped portal/auth themes, explicit action/selection roles, brand financial commitments, neutral review/back/close actions, inset focus, unchanged geometry and reviewed lifecycle-safe inline scripts. Browser rendering is separate.');
