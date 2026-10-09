'use strict';
// Navigation presentation contracts; rendered checks are separate from this suite.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'backoffice.html'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/css/backoffice-sidebar.css'),'utf8');
const navSource=html.slice(html.indexOf('const navItems='),html.indexOf('const permissions='));
const context=vm.createContext({});
vm.runInContext(navSource+'\nglobalThis.items=navItems;',context);
const before=vm.runInNewContext(require('./fixtures/backoffice-navigation-before.json')+'\nnavItems;');
const withoutIcons=items=>JSON.parse(JSON.stringify(items)).map(({icon,...item})=>item);
assert.deepEqual(withoutIcons(context.items.filter(n=>n.id!=='portfolio')),withoutIcons(before),'Routes, order, labels and role permissions stay identical');
assert.deepEqual(Array.from(context.items,n=>n.icon),['dashboard','patientRequest','people','providerRequest','stethoscope','documentSearch','portfolio','settings']);
assert.deepEqual(JSON.parse(JSON.stringify(context.items.find(n=>n.id==='portfolio'))),{id:'portfolio',label:'Cartera',icon:'portfolio',roles:['admin','operations','risk','readonly']});
const icons=[...context.items.map(n=>n.icon),'history'];
const markup=icons.map(icon=>context.backofficeNavIcon(icon));
assert.equal(new Set(markup).size,9,'Every destination has its own semantic geometry');
for(const svg of markup){
 for(const attribute of ['width="20"','height="20"','viewBox="0 0 24 24"','fill="none"','stroke="currentColor"','stroke-width="1.75"','stroke-linecap="round"','stroke-linejoin="round"','aria-hidden="true"','focusable="false"'])assert.ok(svg.includes(attribute),attribute);
 assert.match(svg,/^<svg[^>]+>(?:<(?:path|circle|rect)\s[^>]+\/>)+<\/svg>$/);
 assert.doesNotMatch(svg,/<(?:title|text|image|use|script)\b|#[\da-f]{3,8}|on\w+=/i);
}
assert.equal(context.backofficeNavIcon('unknown'),'');
assert.equal((context.backofficeNavIcon('dashboard').match(/<rect /g)||[]).length,4);
assert.match(context.backofficeNavIcon('patientRequest'),/<circle cx="17" cy="15"/,'Form with person');
assert.match(context.backofficeNavIcon('providerRequest'),/M16 12h3v3h3v3/,'Form with medical cross');
assert.match(context.backofficeNavIcon('documentSearch'),/<circle cx="16" cy="16" r="4"/,'Document magnifier');
assert.match(context.backofficeNavIcon('stethoscope'),/<circle cx="20" cy="10" r="3"/);
assert.match(context.backofficeNavIcon('history'),/M3 4v7h7M12 7v5l3 2/);
assert.match(context.backofficeNavIcon('settings'),/<circle cx="12" cy="12" r="3"/);
assert.match(html,/<span class="nav-icon" aria-hidden="true">\$\{backofficeNavIcon\(n.icon\)\}<\/span><span class="sidebar-label">\$\{n.label\}<\/span>/);
assert.equal((html.match(/\$\{backofficeNavIcon\('history'\)\}Historial operativo/g)||[]).length,1);
assert.match(css,/#sidebar \.nav-icon\{flex:0 0 24px;background:transparent;border-radius:0\}/);
assert.match(css,/#sidebar \.backoffice-nav-svg,#dashboard \.workflow-secondary \.backoffice-nav-svg\{display:block;flex:0 0 20px;width:20px;height:20px\}/);
console.log('PASS: seven preserved destinations plus Cartera and history use consistent accessible line SVGs; role mapping, sizes, colors and semantic geometry verified.');
