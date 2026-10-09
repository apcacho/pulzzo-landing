'use strict';
// Source/cascade regression checks, not browser geometry or visual verification.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const admin=read('assets/css/backoffice-responsive.css');
const registration=read('assets/css/registration-responsive.css');
for(const [file,css] of [['backoffice.html','backoffice-responsive.css'],['registro-paciente.html','registration-responsive.css'],['registro-doctor.html','registration-responsive.css']]){
 const head=file==='registro-doctor.html'?read(file):read(file).split('</head>')[0];
 assert.ok(head.lastIndexOf(`assets/css/${css}`)>head.lastIndexOf('</style>'),`${file}: fixes must win over original cascade`);
}
assert.match(registration,/min-width:1024px\) and \(max-width:1279px/);
assert.match(registration,/grid-template-columns:minmax\(0,1fr\)!important/);
assert.match(registration,/grid-template-columns:minmax\(0,1fr\) minmax\(0,700px\)!important/);
assert.match(registration,/auth-wrap>\*\{min-width:0\}/);
assert.match(registration,/profile-attention-tags-box input\{min-width:0;width:100%;max-width:100%/);
// Explicit budgets reproduce the two desktop defects without claiming browser geometry.
assert.ok(560+700+88+176>1440,'Original patient desktop tracks overflow 1440px');
assert.equal(1024-120-780-52,72,'Original doctor hero gets only72px at1024');
assert.equal(Math.min(1024-64,780),780,'New1024 single-column card fits');
for(const width of [1280,1440]){const pad=Math.min(88,Math.max(24,width*.04)),gap=Math.min(88,Math.max(32,width*.04));assert.ok(width-2*pad-gap-700>0);}
const publicCss=read('assets/css/public-responsive.css'),patientCss=read('assets/css/patient-responsive.css');
assert.match(publicCss,/min-width:768px\) and \(max-width:1023px/);
assert.match(publicCss,/#bloque-cards\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
assert.match(publicCss,/#faq \.faq-item.open \.faq-a\{max-height:none\}/);
assert.match(publicCss,/scroll-margin-top:80px/);
assert.match(patientCss,/max-width:900px\)\{#view-identidad \.identity-flow\{grid-template-columns:minmax\(0,1fr\)/);
for(const file of ['index.html','faq.html','aviso-privacidad.html','terminos-condiciones.html']){
 const html=read(file);assert.match(html,/assets\/css\/public-responsive.css/);assert.match(html,/<button[^>]*class="hamburger"[^>]*aria-expanded="false"/);assert.match(html,/setAttribute\('aria-expanded',String\(shouldOpen\)\)/);assert.match(html,/innerWidth\s*>\s*1279/);assert.doesNotMatch(html,/innerWidth\s*>\s*1023\)\s*toggleDrawer/);
}
for(const css of [admin,registration,publicCss,patientCss])assert.equal((css.match(/\{/g)||[]).length,(css.match(/\}/g)||[]).length,'Corrective stylesheet blocks are balanced');
assert.match(admin,/grid-template-columns:240px minmax\(0,1fr\)/);
assert.match(admin,/\.sidebar\{overflow-y:auto;[^}]*height:100dvh/);
assert.match(admin,/\.sidebar\{[^}]*visibility:hidden/);
assert.match(admin,/\.sidebar.open\{visibility:visible\}/);
assert.match(admin,/\.modal\{[^}]*100dvh[^}]*display:flex/);
assert.match(admin,/\.modal \.modal-body\{min-height:0;overflow:auto/);
assert.match(admin,/\.topbar\{height:auto;[^}]*flex-wrap:wrap/);
assert.match(admin,/\.table-wrap,[^{]+\{max-width:100%;min-width:0/);
assert.match(admin,/prefers-reduced-motion:reduce/);
const source=read('backoffice.html');
assert.match(source,/\$\('#logoutBtn'\)\.onclick=\(\)=>\{setSidebarOpen\(false\);session=null/);
assert.match(source,/id="mobileMenu" aria-label="Abrir menú" aria-controls="sidebar" aria-expanded="false"/);
const elements=new Map();
const el=s=>{if(!elements.has(s)){const classes=new Set();elements.set(s,{attributes:{},focused:false,classList:{toggle(k,on){if(on)classes.add(k);else classes.delete(k)},contains:k=>classes.has(k)},setAttribute(k,v){this.attributes[k]=v},focus(){this.focused=true}})}return elements.get(s)};
const handlers={};const context=vm.createContext({$:el,$$:()=>[el('#sidebarClose'),el('#logoutBtn')],innerWidth:390,window:{addEventListener:(type,fn)=>handlers[type]=fn},document:{addEventListener:(type,fn)=>handlers[type]=fn}});
vm.runInContext(source.slice(source.indexOf('function setSidebarOpen('),source.indexOf('function initApp()')),context);
context.setSidebarOpen(true);assert.equal(el('#sidebarClose').focused,true);assert.equal(el('.main').inert,true);assert.equal(el('#mobileMenu').attributes['aria-expanded'],'true');assert.equal(el('#sidebarShade').classList.contains('open'),true);
context.document.activeElement=el('#logoutBtn');let prevented=false;handlers.keydown({key:'Tab',shiftKey:false,preventDefault(){prevented=true}});assert.equal(prevented,true);assert.equal(el('#sidebarClose').focused,true);
context.document.activeElement=el('#sidebarClose');prevented=false;handlers.keydown({key:'Tab',shiftKey:true,preventDefault(){prevented=true}});assert.equal(prevented,true);assert.equal(el('#logoutBtn').focused,true);
handlers.keydown({key:'Escape'});assert.equal(el('.main').inert,false);assert.equal(el('#mobileMenu').attributes['aria-expanded'],'false');assert.equal(el('#sidebar').classList.contains('open'),false);assert.equal(el('#mobileMenu').focused,true);
context.setSidebarOpen(true);context.innerWidth=1024;handlers.resize();assert.equal(el('.main').inert,false);context.setSidebarOpen(false);assert.equal(el('#sidebarShade').classList.contains('open'),false);
console.log('PASS: responsive containment, source breakpoints, drawer dismissal/state, keyboard focus restoration. No browser rendering was performed.');
