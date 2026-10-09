'use strict';
// Source/CSS and generated native-control markup contracts, not browser pixels.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'backoffice.html'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/css/backoffice-refinement.css'),'utf8');
const contract=css.split('/* BACKOFFICE SELECT INDICATORS')[1].split('/* Shared workflow composition')[0];
assert.ok(contract);
const clean=contract.replace(/^[\s\S]*?\*\//,'').trim();
const selector='body.backoffice-typography select:not([multiple]):is(:not([size]),[size="0"],[size="1"])';
const blocks=[...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
assert.equal(blocks.length,2);
for(const [,s] of blocks)assert.equal(s.trim(),selector);
const normal=blocks[0][2],fallback=blocks[1][2];
for(const prefix of ['-webkit-','-moz-','']){
 assert.ok(normal.includes(`${prefix}appearance:none;`));
 assert.ok(fallback.includes(`${prefix}appearance:auto;`));
}
assert.match(normal,/padding-right:44px!important/);
assert.match(normal,/background-position:right 14px center!important/);
assert.match(normal,/background-size:12px 12px!important/);
assert.match(normal,/background-repeat:no-repeat!important/);
assert.match(normal,/background-image:url\("data:image\/svg\+xml,[^\"]+"\)!important/);
assert.equal((normal.match(/background-image:/g)||[]).length,1);
assert.match(clean,/@media\(forced-colors:active\)/);
assert.match(fallback,/background-image:none!important/);
assert.doesNotMatch(clean,/(?:^|[;{\s])(?:background|background-color|color|border|outline|box-shadow|opacity|pointer-events|font-size|font-family|font-weight|padding):/,'Only arrow rendering and right text space change');
assert.doesNotMatch(clean,/::(?:before|after)|forced-color-adjust|input|button/);
const svg=decodeURIComponent(normal.match(/data:image\/svg\+xml,([^\"]+)/)[1]);
assert.equal((svg.match(/<path /g)||[]).length,1);
assert.match(svg,/stroke='#475569'/);
// Selector's attribute truth table: size 0/1 are native dropdowns; all other
// explicit sizes are conservatively left native, including multi-row listboxes.
const applies=(tag,attrs={},inBackoffice=true)=>inBackoffice&&tag==='select'&&!Object.hasOwn(attrs,'multiple')&&(!Object.hasOwn(attrs,'size')||['0','1'].includes(attrs.size));
for(const attrs of [{},{size:'0'},{size:'1'},{disabled:''}])assert.ok(applies('select',attrs));
for(const attrs of [{multiple:''},{multiple:'false'},{size:'2'},{size:'4'},{size:'10'},{multiple:'',size:'1'}])assert.ok(!applies('select',attrs));
assert.ok(!applies('input',{type:'date'}));assert.ok(!applies('input',{type:'file'}));assert.ok(!applies('select',{},false));
assert.match(html,/<body class="backoffice-typography">/);
for(const f of fs.readdirSync(root).filter(f=>f.endsWith('.html')&&f!=='backoffice.html'))assert.doesNotMatch(fs.readFileSync(path.join(root,f),'utf8'),/backoffice-typography|backoffice-refinement.css/);
const elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{id,value:'',dataset:{},style:{},innerHTML:'',textContent:'',checked:false,disabled:false,files:[],classList:{add(){},remove(){},toggle(){},contains(){return false}},querySelector:s=>el(id+' '+s),querySelectorAll(){return []},addEventListener(){},setAttribute(){},scrollIntoView(){},focus(){}});return elements.get(id)}
const storage=new Map();const document={querySelector:s=>el(s.replace(/^#/,'')),querySelectorAll:()=>[],getElementById:el,addEventListener(){},createElement:el,body:{appendChild(){}}};
const context=vm.createContext({document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},window:{},Date,console,Intl,Blob,URL,setTimeout(){},clearTimeout(){},innerWidth:1200});
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m=>m[1].includes('const baseState='))[1];vm.runInContext(script,context);const run=c=>vm.runInContext(c,context);run("session=users.find(u=>u.role==='admin')");
function controls(markup){return [...markup.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)].map(m=>({attrs:Object.fromEntries([...m[1].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(a=>[a[1],a[2]||''])),options:m[2]}))}
let count=0;
function check(markup,requiredIds=[]){
 const selects=controls(markup);
 for(const c of selects){assert.ok(applies('select',c.attrs));assert.match(c.options,/<option\b/);count++;}
 for(const id of requiredIds)assert.ok(selects.some(c=>c.attrs.id===id),`Generated select ${id}`);
 return selects;
}
for(const id of ['dashboard','patients','patientProfiles','providerRequests','providers','documents','corrections','offers','history','settings']){
 run(`setView('${id}')`);
 check(el(id).innerHTML,id==='patientProfiles'?['ppStatus']:id==='providers'?['dfType','dfStatus']:id==='providerRequests'?['request-dfType','request-dfStatus','request-dfHistory']:id==='patients'?['pfStatus','pfStage','pfReapply']:[]);
}
const status=check(el('patientProfiles').innerHTML,['ppStatus']).find(c=>c.attrs.id==='ppStatus');
assert.equal(status.attrs['aria-label'],'Estatus del paciente');
assert.equal(status.attrs.onchange,'setPatientProfilesStatus(this.value)');
for(const tab of ['datos','referencias','oferta','contrato','dispersion']){run(`patientTab='${tab}';renderPatientDetail()`);check(el('patientDetail').innerHTML);}
run("openCorrection('patient','APP-PUL-1001')");check(el('modal').innerHTML,['modalReason']);
run("openReject('patient','APP-PUL-1001')");check(el('modal').innerHTML,['rejectType']);
run("openDocReject('patient','APP-PUL-1001','doc-1')");check(el('modal').innerHTML,['modalReason']);
assert.ok(count>=15,`Broad generated-control coverage: ${count}`);
console.log(`PASS: shared chevron CSS, reserved spacing, forced-colors native fallback, listbox exclusions and ${count} generated select controls across modules, detail tabs and dialogs. Browser visual QA remains unrun.`);
