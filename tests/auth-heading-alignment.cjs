'use strict';
// Source-level scope checks. No browser rendering or computed alignment claim.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const css=fs.readFileSync(path.join(root,'assets/css/auth-headings.css'),'utf8');
const rules=css.replace(/\/\*[\s\S]*?\*\//g,'').trim();
assert.equal(rules,'.auth-card > .auth-card-head > :is(#login-title,#registro-title,#registro-doctor-title),\n#loginView .login-card > h2{\n text-align:center;\n}',
 'Only the explicit authentication headings are centered; no inherited parent, labels, subtitles, controls or platform headings are changed');
const targets={
 'login-paciente.html':'login-title',
 'login-doctor.html':'login-title',
 'registro-paciente.html':'registro-title',
 'registro-doctor.html':'registro-doctor-title'
};
const link='<link rel="stylesheet" href="assets/css/auth-headings.css">';
for(const file of [...Object.keys(targets),'backoffice.html']){
 const html=fs.readFileSync(path.join(root,file),'utf8');
 assert.equal(html.split(link).length-1,1,`${file}: one scoped heading stylesheet`);
 assert.ok(html.indexOf(link)<html.indexOf('</head>'),`${file}: heading stylesheet is in the document head`);
 if(targets[file]){
  const id=targets[file];
  assert.match(html,new RegExp('<section class="auth-card" aria-labelledby="'+id+'">\\s*<div class="auth-card-head">\\s*<div class="auth-card-kicker[^\"]*">[^<]*</div>\\s*<h1 id="'+id+'">'),`${file}: the target belongs only to the authentication form`);
 }else assert.match(html,/<div id="loginView" class="login-shell">[\s\S]*?<section class="login-card">\s*<span class="eyebrow">Backoffice<\/span>\s*<h2>Iniciar sesión<\/h2>/);
}
const bo=fs.readFileSync(path.join(root,'assets/css/backoffice-refinement.css'),'utf8');
assert.match(bo,/\.topbar>div:not\(\.top-actions\)\{grid-column:1;grid-row:1;min-width:0;text-align:left;/,'Internal backoffice titles remain left-aligned');
assert.match(bo,/--bo-control-height:36px;\s*--bo-field-height:38px;/,'Compact controls retain their existing sizes');
console.log('PASS: all five login/registration title selectors are centered in source; platform heading and compact-control contracts retained. Browser rendering is separate.');
