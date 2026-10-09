'use strict';
// Actual render-template coverage and source-level role resolution. This does
// not simulate browser rendering, computed geometry, fonts or screenshots.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'backoffice.html'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/css/backoffice-refinement.css'),'utf8');
const contract=css.split('/* BACKOFFICE SHARED TYPOGRAPHY')[1].split('/* BACKOFFICE SELECT INDICATORS')[0];
assert.ok(contract);assert.match(html,/<body class="backoffice-typography">/);
assert.doesNotMatch(contract,/[;{]\s*(?:color|background|padding|margin|display|grid-template|width|height|overflow):/,'Shared roles do not alter layout or colors');
const clean=contract.replace(/\/\*[\s\S]*?\*\//g,'');
const desktop=clean.split('@media')[0];
const tokens=Object.fromEntries([...desktop.matchAll(/(--bo-[\w-]+):([^;]+);/g)].map(m=>[m[1],m[2].trim()]));
const roles=[...desktop.matchAll(/body\.backoffice-typography :where\(([^{}]+)\)\{([^{}]*)\}/g)].map(m=>({selectors:m[1].split(','),props:Object.fromEntries(m[2].split(';').filter(Boolean).map(p=>p.split(':').map(s=>s.trim())))}));
assert.ok(roles.length>20);
// Minimal template parser and matching for this contract's descendant selectors.
function parse(markup){
 const body={tag:'body',classes:['backoffice-typography'],children:[],parent:null};let stack=[body];const all=[body];
 for(const m of markup.matchAll(/<\/?[a-z][^>]*>/gi)){
  const s=m[0];if(s.startsWith('</')){const tag=s.match(/^<\/(\w+)/)[1].toLowerCase();for(let i=stack.length-1;i>0;i--)if(stack[i].tag===tag){stack.length=i;break}continue;}
  const tag=s.match(/^<(\w+)/)[1].toLowerCase(),attrs={};for(const a of s.matchAll(/([\w-]+)="([^"]*)"/g))attrs[a[1]]=a[2];
  const node={tag,classes:(attrs.class||'').split(/\s+/),attrs,parent:stack.at(-1),children:[]};node.parent.children.push(node);all.push(node);
  if(!/^(input|br|hr|img|source|meta|link|area|wbr)$/.test(tag))stack.push(node);
 }return all;
}
function atom(n,s){
 const attrs=[...s.matchAll(/\[([\w-]+)(\*?=)"([^\"]*)"\]/g)];for(const a of attrs){const v=n.attrs?.[a[1]]||'';if(a[2]==='*='?!v.includes(a[3]):v!==a[3])return false;s=s.replace(a[0],'');}
 const pseudo=s.match(/:(first-child|nth-child\((\d+)\))/);if(pseudo){if(n.parent?.children.indexOf(n)+1!==(pseudo[1]==='first-child'?1:+pseudo[2]))return false;s=s.replace(pseudo[0],'');}
 if(s==='*')return true;const tag=s.match(/^[a-z][\w-]*/);if(tag&&n.tag!==tag[0])return false;
 const id=s.match(/#([\w-]+)/);if(id&&n.attrs?.id!==id[1])return false;
 return [...s.matchAll(/\.([\w-]+)/g)].every(m=>n.classes.includes(m[1]));
}
function matches(n,s){if(s.includes('+')){const [left,right]=s.split('+');const siblings=n.parent?.children||[],previous=siblings[siblings.indexOf(n)-1];return matches(n,right)&&!!previous&&matches(previous,left);}const parts=s.trim().split(/\s+/);if(!atom(n,parts.pop()))return false;let parent=n.parent;while(parts.length){const part=parts.pop();while(parent&&!atom(parent,part))parent=parent.parent;if(!parent)return false;parent=parent.parent}return true;}
function role(n){if(n.resolved)return n.resolved;const out={...(n.parent?role(n.parent):{'font-size':tokens['--bo-size-body'],'font-weight':tokens['--bo-weight-body'],'font-family':'var(--font-body)'})};for(const r of roles)if(r.selectors.some(s=>matches(n,s)))for(const [key,value]of Object.entries(r.props)){let v=value.replace(/!important/g,'').trim();if(v==='inherit')continue;out[key]=v.replace(/var\((--bo-[\w-]+)\)/g,(_,k)=>tokens[k]);}return n.resolved=out;}
const find=(nodes,selector)=>nodes.filter(n=>matches(n,selector));
function expectRole(nodes,selector,expected){const hits=find(nodes,selector);assert.ok(hits.length,`Actual template contains ${selector}`);for(const n of hits)for(const [key,value]of Object.entries(expected))assert.equal(role(n)[key],value,`${selector} ${key}`);}
const elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{id,value:'',dataset:{},style:{},innerHTML:'',textContent:'',checked:false,disabled:false,files:[],classList:{add(){},remove(){},toggle(){},contains(){return false}},querySelector:s=>el(id+' '+s),querySelectorAll(){return []},addEventListener(){},setAttribute(){},scrollIntoView(){},focus(){}});return elements.get(id)}
const storage=new Map();const document={querySelector:s=>el(s.replace(/^#/,'')),querySelectorAll:()=>[],getElementById:el,addEventListener(){},createElement:el,body:{appendChild(){}}};
const context=vm.createContext({document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},window:{},Date,console,Intl,Blob,URL,setTimeout(){},clearTimeout(){},innerWidth:1200});
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m=>m[1].includes('const baseState='))[1];vm.runInContext(script,context);const run=c=>vm.runInContext(c,context);run("session=users.find(u=>u.role==='admin')");
const ids=['dashboard','patients','patientProfiles','providerRequests','providers','documents','corrections','offers','history','settings'],maps={};
for(const id of ids){run(`setView('${id}')`);assert.ok(el(id).innerHTML.length>100,id);maps[id]=parse(`<section id="${id}" class="view">${el(id).innerHTML}${id==='providers'?el('providerList').innerHTML:id==='providerRequests'?el('request-providerList').innerHTML:''}${id==='patients'?el('patientList').innerHTML:''}</section>`);}
const section={'font-size':'21px','font-weight':'650'};
expectRole(maps.dashboard,'.dashboard-block-head h3',section);
// The two pre-existing !important numeric selectors outrank the bridge, but
// intentionally agree with its values; do not mislabel this as a computed-style test.
assert.match(html,/#dashboard \.kpi strong\{\s*font-weight:560 !important/);assert.match(html,/#dashboard \.metric-row strong\{\s*font-weight:520 !important/);
expectRole(maps.dashboard,'.kpi strong',{'font-weight':'560'});expectRole(maps.dashboard,'.metric-row strong',{'font-weight':'520'});expectRole(maps.patients,'.patient-request-list-head h2',section);
for(const id of ['patientProfiles','providerRequests','providers'])expectRole(maps[id],'.patient-profiles-head h2',section);
for(const id of ['settings'])expectRole(maps[id],'.section-head h2',section);
const entity={'font-size':'16px','font-weight':'600','font-family':'var(--font-body)','line-height':'1.45'};
for(const id of ['patientProfiles','providerRequests','providers'])expectRole(maps[id],'.patient-profile-name',entity);
const filter={'font-size':'14px','font-weight':'600','font-family':'var(--font-display)'};expectRole(maps.patients,'.tray-head strong',filter);for(const id of ['patientProfiles','providerRequests','providers'])expectRole(maps[id],'.patient-profiles-filters h3',filter);
for(const id of ids){const nodes=maps[id];for(const selector of ['button','.pill','input','select','table th','table td','p'])for(const n of find(nodes,selector)){
 const r=role(n);assert.ok(+r['font-weight']<=650,`${id}: ${selector} has unnecessary heavy emphasis`);if(selector==='table th')assert.equal(r['font-size'],'11px');if(selector==='input'||selector==='select')assert.equal(r['font-size'],'13px');
 }console.log(`PASS typography module: ${id} (${nodes.length} generated elements)`);}
const chrome=parse(html.slice(html.indexOf('<body'),html.indexOf('<script>')));
expectRole(chrome,'.topbar h1',{'font-size':'25px','font-weight':'700'});expectRole(chrome,'.role-badge',{'font-size':'12px','font-weight':'500'});expectRole(chrome,'.top-actions .btn',{'font-size':'12px','font-weight':'500'});expectRole(chrome,'.user-card strong',{'font-weight':'500'});
run("patientRequestMode='detail';currentView='patients';renderPatients()");const requestDetail=parse(`<section class="view">${el('patientDetail').innerHTML}</section>`);
expectRole(requestDetail,'.detail-hero h3',{'font-size':'21px','font-weight':'600'});
for(const tab of ['resumen','documentos','fiscal','contacto','datos','procedimientos','interesados','operar','historial']){run(`providerTab='${tab}';renderProviderDetail()`);const nodes=parse(`<section class="view">${el(run("providerElementId('providerDetail')")).innerHTML}</section>`);expectRole(nodes,'.patient-profile-hero h2',{'font-size':'21px','font-weight':'600'});expectRole(nodes,'.patient-profile-tabbar .tab',{'font-size':'12px'});for(const n of find(nodes,'.info small'))assert.equal(role(n)['font-size'],'11px');}
for(const tab of ['resumen','datos','documentos','buro','oferta','referencias','contrato','dispersion','historial','payload']){
 run(`patientTab='${tab}';renderPatientDetail()`);const nodes=parse(`<section class="view">${el('patientDetail').innerHTML}</section>`);
 expectRole(nodes,'.detail-hero h3',{'font-size':'21px','font-weight':'600'});expectRole(nodes,'.patient-detail-tabs .tab',{'font-size':'12px'});
 if(tab==='contrato'){expectRole(nodes,'.patient-detail-section small',{'font-size':'11px','font-weight':'500','text-transform':'none'});expectRole(nodes,'.patient-detail-section small+strong',{'font-size':'13px','font-weight':'400'});expectRole(nodes,'.patient-detail-section span[style*="border-radius:999px"]',{'font-size':'11px','font-weight':'500','text-transform':'none','letter-spacing':'normal'});}
 for(const selector of ['input','select','textarea','table td','table th','.info small','.mini small'])for(const n of find(nodes,selector))assert.equal(role(n)['font-size'],selector==='table th'||selector.endsWith('small')?'11px':'13px',`Request ${tab} ${selector}`);
}
for(const tab of ['perfil','solicitudes','historial','payload']){
 run(`patientProfileTab='${tab}';renderPatientProfileDetail(buildPatientProfiles()[0])`);const nodes=parse(`<section class="view">${el('patientProfiles').innerHTML}</section>`);
 expectRole(nodes,'.patient-profile-detail-title h2',section);expectRole(nodes,'.patient-profile-hero h2',{'font-size':'21px','font-weight':'600'});expectRole(nodes,'.patient-profile-tabbar .tab',{'font-size':'12px'});
}
run("openNote('patient','APP-PUL-1001')");const dialog=parse(`<div class="modal">${el('modal').innerHTML}</div>`);expectRole(dialog,'.modal-head h3',section);expectRole(dialog,'textarea',{'font-size':'13px','font-weight':'400'});expectRole(dialog,'.modal-actions .btn',{'font-size':'12px','font-weight':'500'});
assert.match(clean,/@media\(max-width:820px\)[\s\S]*:where\(input,select,textarea\)\{font-size:16px!important\}/);assert.match(clean,/--bo-size-page:20px;--bo-size-section:20px/);assert.doesNotMatch(desktop,/body:has/);
for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.html')&&f!=='backoffice.html'))assert.doesNotMatch(fs.readFileSync(path.join(root,file),'utf8'),/backoffice-typography|backoffice-refinement.css/);
console.log('PASS: shared source roles for all ten modules, chrome, ten request tabs, four patient tabs, nine provider tabs and dialog; desktop/mobile contracts. Visual browser QA remains unrun.');
