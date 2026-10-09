'use strict';
// Source-level color/behavior contracts; browser rendering is a separate check.
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
 'login-doctor.html':'3c85089afcc42177f33a5a58328cfb04a477a6820eaba3007421338f69f7df20',
 'registro-paciente.html':'3f560f65cf51d75a6ca502bf4d4d089d63c3bc297a29998eca5bd4e5d50cc416',
 'registro-doctor.html':'e9d399c64c0d64b1fdfb51178ab5ac6531f1b00b6ccde46cad3ec5f55ee6e2f7',
 'verificacion-cuenta.html':'ce2f4184c76a5a208fd0bdf68bdc18012774804fa13fd7835c54f87061c65843',
 'verificacion-doctor.html':'b84dc7bb90b744d4dcede23b3cae47e7e778028fb5efb1f59cc542135f96b047',
 'solicitud-paciente.html':'d22dd1566ab38bd12549fce9b3bd6a9d9b518026a48f83e3b9bfe1ade3113644'
};
const classRole='ui-(?:action-(?:primary|secondary|commitment|danger|warning)|selection(?:-current)?|choice)';
const stripRoles=text=>text.replace(new RegExp(' class="'+classRole+'"','g'),'').replace(new RegExp(' '+classRole+'\\b','g'),'');
for(const [file,originalScriptHash] of Object.entries(pages)){
 const html=read(file);
 const theme=file.includes('doctor')?'doctor':'patient';
 assert.match(html,new RegExp('<body[^>]*class="[^"]*ui-color-semantics ui-'+theme+'"'),file+': scoped theme');
 const link='<link rel="stylesheet" href="assets/css/portal-color-semantics.css">';
 assert.equal(html.split(link).length-1,1,file+': one late semantic stylesheet');
 assert.ok(html.indexOf(link)>html.lastIndexOf('</style>'),file+': semantic colors follow legacy layout styles');
 const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match=>match[1]).join('\n');
 assert.equal(sha(stripRoles(scripts)),originalScriptHash,file+': reviewed 2026-10-09 behavior snapshot with explicit CSS roles');
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
assert.match(ruleText,/box-shadow:inset 0 -2px 0 var\(--ui-selection-indicator\)!important/,'Selected navigation has a fine inset indicator');
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
console.log('PASS: seven scoped portal/auth themes, explicit action/selection roles, brand financial commitments, neutral review/back/close actions, inset focus, unchanged geometry and behavior-equivalent inline scripts. Browser rendering is separate.');
