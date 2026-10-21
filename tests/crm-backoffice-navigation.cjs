'use strict';
// Real shipped navigation handlers in a deterministic DOM/History VM.
// This deliberately does not launch a browser or claim visual/geometry coverage.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('backoffice.html');
function extract(source,name){
 let start=source.indexOf('function '+name+'(');if(start>=6&&source.slice(start-6,start)==='async ')start-=6;assert.ok(start>=0,`Missing shipped ${name} handler`);
 for(let end=source.indexOf('}',start);end>=0;end=source.indexOf('}',end+1)){
  const code=source.slice(start,end+1);try{new vm.Script('('+code+')');return code;}catch(error){if(error.name!=='SyntaxError')throw error;}
 }throw Error('Cannot parse '+name);
}
class Classes{
 constructor(){this.values=new Set();}add(...names){names.forEach(n=>this.values.add(n));}remove(...names){names.forEach(n=>this.values.delete(n));}contains(n){return this.values.has(n);}toggle(n,on){if(on===undefined)on=!this.contains(n);if(on)this.add(n);else this.remove(n);return on;}
}
function dom(){
 const nodes=new Map(),listeners={},frames=[];
 const document={readyState:'complete',activeElement:null,listeners,addEventListener(t,fn){(listeners[t]??=[]).push(fn);},removeEventListener(t,fn){listeners[t]=(listeners[t]||[]).filter(f=>f!==fn);}};
 const decode=s=>String(s).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
 class Element{
  constructor(tag='div',id=''){this.tagName=tag.toUpperCase();this.id=id;this.ownerDocument=document;this.children=[];this.attributes={};this.dataset={};this.style={};this.classList=new Classes();this.listeners={};this.hidden=false;this.inert=false;this.disabled=false;this.open=false;this.value='';this.textContent='';this._innerHTML='';if(id)nodes.set(id,this);if(tag==='iframe'){this.contentWindow={};frames.push(this);}}
  get className(){return [...this.classList.values].join(' ');}set className(value){this.classList.values=new Set(String(value).split(/\s+/).filter(Boolean));}
  get innerHTML(){return this._innerHTML;}set innerHTML(value){this._innerHTML=String(value);this.replaceChildren();const stack=[this];for(const token of this._innerHTML.matchAll(/<!--[\s\S]*?-->|<\/?[^>]+>|[^<]+/g)){const part=token[0];if(part.startsWith('<!--'))continue;if(part.startsWith('</')){if(stack.length>1)stack.pop();continue;}if(part.startsWith('<')){const tag=part.match(/^<([\w-]+)/)?.[1];if(!tag)continue;const node=new Element(tag);const attrs=part.slice(tag.length+1,part.length-1);for(const attr of attrs.matchAll(/([\w-]+)(?:="([^"]*)"|='([^']*)')?/g))node.setAttribute(attr[1],decode(attr[2]??attr[3]??''));stack[stack.length-1].appendChild(node);if(!/^(input|link|img|br|hr|meta|source|area|base|embed|param|wbr)$/i.test(tag)&&!part.endsWith('/>'))stack.push(node);}else stack[stack.length-1].textContent+=decode(part);}}
  appendChild(node){if(node.parentNode)node.remove();this.children.push(node);node.parentNode=this;node.parentElement=this;if(node.id)nodes.set(node.id,node);return node;}
  append(...children){children.forEach(c=>this.appendChild(c));}replaceChildren(...children){for(const child of [...this.children])child.remove();this.append(...children);}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.parentNode=null;const clear=node=>{if(node.id&&nodes.get(node.id)===node)nodes.delete(node.id);node.children?.forEach(clear);};clear(this);}
  setAttribute(k,v){this.attributes[k]=String(v);if(k==='id'){this.id=String(v);nodes.set(this.id,this);}if(k==='class')this.className=v;if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(v);if(['src','href','value'].includes(k))this[k]=String(v);if(['open','hidden','disabled','selected'].includes(k))this[k]=true;}
  getAttribute(k){return this.attributes[k]??null;}removeAttribute(k){delete this.attributes[k];if(['open','hidden','disabled'].includes(k))this[k]=false;}
  addEventListener(t,fn){(this.listeners[t]??=[]).push(fn);}removeEventListener(t,fn){this.listeners[t]=(this.listeners[t]||[]).filter(f=>f!==fn);}
  dispatch(type,event={}){const e={type,target:this,preventDefault(){this.defaultPrevented=true;},...event};let current=this;do{for(const fn of [...(current.listeners[type]||[])])fn(e);current['on'+type]?.(e);current=current.parentNode;}while(current);return e;}
  focus(options){document.activeElement=this;this.focusOptions=options;}scrollIntoView(options){(this.scrollCalls??=[]).push(options);}select(){}showModal(){this.open=true;}close(){this.open=false;this.dispatch('close');}
  contains(node){return node===this||this.children.some(c=>c.contains?.(node));}
  closest(selector){if(matches(this,selector))return this;return this.parentNode?.closest?.(selector)||null;}
  querySelectorAll(selector){const all=[];const visit=node=>{for(const child of node.children){if(matches(child,selector))all.push(child);visit(child);}};visit(this);return all;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  getElementById(id){return this.querySelector('#'+id);}
  attachShadow(){assert.equal(this.shadowRoot,undefined,'A host mounts once');this.shadowRoot=new Element('shadow-root');this.shadowRoot.host=this;return this.shadowRoot;}
  get elements(){return {namedItem:name=>this.querySelector('[name="'+name+'"]')};}checkValidity(){return true;}reportValidity(){}
  get firstElementChild(){return this.children[0]||null;}getBoundingClientRect(){return {right:66,top:100,height:44,width:220};}
 }
 function matches(node,selector){return selector.split(',').some(part=>{let s=part.trim();if(s.includes(':not([disabled])')){if(node.disabled)return false;s=s.replace(':not([disabled])','');}if(s.includes(' ')){const parts=s.split(/\s+/);const last=parts.pop();return matches(node,last)&&!!node.parentNode?.closest(parts.join(' '));}const attrs=[...s.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)];for(const attr of attrs){const value=attr[1]==='open'?(node.open?'':null):node.getAttribute(attr[1]);if(value===null||attr[2]!==undefined&&value!==attr[2])return false;}s=s.replace(/\[[^\]]+\]/g,'');if(s.startsWith('#'))return node.id===s.slice(1);if(s.startsWith('.'))return node.classList.contains(s.slice(1));return !s||s==='*'||node.tagName===s.toUpperCase();});}
 document.createElement=tag=>new Element(tag);document.createTextNode=text=>({textContent:text});
 document.body=new Element('body','body');document.documentElement=new Element('html','html');document.documentElement.appendChild(document.body);
 document.getElementById=id=>document.documentElement.getElementById(id);
 document.querySelectorAll=selector=>document.documentElement.querySelectorAll(selector);
 document.querySelector=selector=>document.querySelectorAll(selector)[0]||null;
 const get=(id,tag='div')=>nodes.get(id)||document.body.appendChild(new Element(tag,id));
 const emit=(type,event={})=>{for(const fn of listeners[type]||[])fn(event);};
 return {document,nodes,frames,Element,get,emit};
}
function historyFor(window){
 let entries=[window.location.href],index=0;
 function set(url){const parsed=new URL(url,window.location.href);for(const key of ['href','hash','pathname','search','origin'])window.location[key]=parsed[key];}
 window.history={state:null,pushState(state,_title,url){set(url);entries=entries.slice(0,index+1);entries.push(window.location.href);index++;this.state=state;},replaceState(state,_title,url){set(url);entries[index]=window.location.href;this.state=state;},back(){if(index>0){set(entries[--index]);window.dispatch('popstate',{state:this.state});window.dispatch('hashchange');}},forward(){if(index<entries.length-1){set(entries[++index]);window.dispatch('popstate',{state:this.state});window.dispatch('hashchange');}}};
 return {entries:()=>entries.slice(),index:()=>index,set};
}
async function shell({width=1200,hash='',role=null,beforeCRM=null}={}){
 const d=dom(),{get,document}=d,listeners={},storage=new Map(),rendered=[];
 for(const id of ['appView','loginView','sidebar','sidebarShade','mobileMenu','sidebarToggle','sidebarClose','sidebarTooltip','nav','logoutBtn','pageTitle','pageSub','sideUser','sideRole','sideEmail','roleBadge','resetBtn','loginEmail','loginPass','loginBtn','demoUsers','crm','modalBackdrop','modal'])get(id);
 get('sidebarToggle').appendChild(new d.Element('span'));for(const id of ['sidebarToggle','sidebarClose','nav','logoutBtn'])get('sidebar').appendChild(get(id));
 get('appView').classList.add('hidden');get('main').classList.add('main');
 for(const id of ['dashboard','patients','patientProfiles','providerRequests','providers','documents','corrections','offers','history','portfolio','settings','crm'])get(id).classList.add('view');
 const url=new URL('https://demo.test/backoffice.html'+hash);
 const window={document,location:{href:url.href,hash:url.hash,pathname:url.pathname,search:url.search,origin:url.origin},innerWidth:width,innerHeight:900,listeners,addEventListener(t,fn){(listeners[t]??=[]).push(fn);},removeEventListener(t,fn){listeners[t]=(listeners[t]||[]).filter(f=>f!==fn);},dispatch(t,event={}){for(const fn of listeners[t]||[])fn(event);},requestAnimationFrame(fn){fn();},setTimeout(fn){fn();},clearTimeout(){}};
 window.window=window;window.parent=window;window.top=window;
 const history=historyFor(window),localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
 window.localStorage=localStorage;
 const context=vm.createContext(Object.assign(window,{document,localStorage,URL,URLSearchParams,console,$:s=>s[0]==='#'?document.getElementById(s.slice(1)):document.querySelector(s),$$:s=>document.querySelectorAll(s),toast(){},requireCapability:()=>true}));
 require('./fixtures/staff-session.cjs')(context);
 const definitions=html.slice(html.indexOf('const staffAccess='),html.indexOf('const baseState='));
 assert.ok(definitions.includes('const navItems='));
 vm.runInContext('function dashboardPeriodBounds(){return {};};\n'+definitions+'\nlet correctionReturnContext=null;',context);
 vm.runInContext(html.slice(html.indexOf('function staffCurrentSession('),html.indexOf('function contractSignatureIsSigned(')),context);
 for(const name of ['can','setView','bootLogin','login','initApp','renderNav','render'])vm.runInContext(extract(html,name),context);
 vm.runInContext(html.slice(html.indexOf('function setSidebarOpen('),html.indexOf('function initApp()')),context);
 for(const name of ['Dashboard','Patients','PatientProfiles','Providers','Documents','Corrections','Offers','History','Settings','Portfolio'])context['render'+name]=()=>rendered.push(name);
 vm.runInContext('var modalFocusOrigin=null,modalInertState=[];let reviewContext=null,reviewNested=false,reviewEvidenceEpoch=0,reviewEvidenceURL=null;function readonlyFinancialHtml(value){return value;}function staffFinancialHtml(value){return value;}function renderDocumentReview(){};',context);
 for(const name of ['clearReviewEvidence','readonly','modalReleaseBackground','modalSetupAccessibility','modal','closeModal','reviewRestoreOrigin','closeDocumentReview'])vm.runInContext(extract(html,name),context);
 vm.runInContext(read('assets/js/backoffice-sidebar.js'),context);
 for(const file of ['crm-demo-store.js','crm-assisted.js','crm-demo-template.js','crm-demo-embed.js','crm-demo-analytics.js','crm-demo-ui.js','backoffice-crm.js']){if(file==='backoffice-crm.js'&&beforeCRM)beforeCRM(context);vm.runInContext(read('assets/js/'+file),context);}
 const evaluate=source=>vm.runInContext(source,context);
 const login=async role=>{const user=evaluate(`staffDemoUsers().find(u=>u.id===${JSON.stringify(role)}||u.role===${JSON.stringify(role)})`);get('loginEmail').value=user.email;get('loginPass').value='pulzzo-demo';await context.login();return user;};
 if(role)await login(role);
 return {...d,window,context,history,storage,rendered,evaluate,login,view:()=>evaluate('currentView'),session:()=>evaluate('session'),navigate:id=>context.setView(id),clickNav:id=>get('nav').dispatch('click',{target:get('nav').children.find(n=>n.dataset.id===id)}),resize:width=>{window.innerWidth=context.innerWidth=width;window.dispatch('resize');}};
}
let groups=0;const cases=[];
function test(label,fn){cases.push({label,fn});}
// Native tests run the shipped template, scoped adapter, UI and Backoffice handlers.
function entry({hash='#doctor/tasks',search='',parentAPI=null,isFrame=false,parentWindow=null,onWindow}={}){
 const d=dom(),listeners={},redirects=[],url=new URL('https://demo.test/crm-demo.html'+search+hash);
 for(const m of read('crm-demo.html').matchAll(/\bid="([^"]+)"/g))d.get(m[1]);
 const window={document:d.document,location:{href:url.href,hash:url.hash,search:url.search,pathname:url.pathname,origin:url.origin,replace(url){redirects.push(url);}},addEventListener(t,fn){(listeners[t]??=[]).push(fn);},dispatch(t,event={}){for(const fn of listeners[t]||[])fn(event);}};
 window.window=window;window.parent=parentWindow||(isFrame?{PulzzoCRMBackoffice:parentAPI,location:{origin:url.origin}}:window);window.top=window.parent;
 const history=historyFor(window);
 const context=vm.createContext(Object.assign(window,{URL,URLSearchParams,console}));if(onWindow)onWindow(vm.runInContext("window",context));
 vm.runInContext(read('assets/js/crm-demo-embed.js'),context);
 return {...d,window,context,redirects,history};
}
function uiHarness({hash='#patient/contacts',embed,storage:providedStorage}={}){
 const UI=require('../assets/js/crm-demo-ui.js'),Store=require('../assets/js/crm-demo-store.js'),Assisted=require('../assets/js/crm-assisted.js'),d=dom(),listeners={},storageMap=new Map();
 for(const m of read('crm-demo.html').matchAll(/\bid="([^"]+)"/g))d.get(m[1]);
 const contexts=['patient','doctor'].map(value=>{const n=new d.Element('button');n.dataset.contextSwitch=value;return n;}),views=['contacts','tasks','dashboard'].map(value=>{const n=new d.Element('button');n.dataset.view=value;return n;});
 const queryAll=d.document.querySelectorAll;d.document.querySelectorAll=selector=>selector==='[data-context-switch]'?contexts:selector==='[data-view]'?views:queryAll(selector);
 const storage=providedStorage||{getItem:k=>storageMap.get(k)??null,setItem:(k,v)=>storageMap.set(k,String(v)),removeItem:k=>storageMap.delete(k)};
 const url=new URL('https://demo.test/crm-demo.html'+hash),window={document:d.document,localStorage:storage,location:{href:url.href,hash:url.hash,origin:url.origin,pathname:url.pathname,search:url.search},listeners,navigator:{},addEventListener(t,fn){(listeners[t]??=[]).push(fn);},dispatch(t,event={}){for(const fn of listeners[t]||[])fn(event);}};
 if(embed)window.PulzzoCRMEmbedding=embed;
 const history=historyFor(window),app=UI.createApp({window,document:d.document,storage,storeModule:Store,assistedModule:Assisted,embedding:embed,now:()=>new Date('2026-10-09T12:00:00.000Z')});
 return {...d,app,window,history,storage,contexts,views};
}
test('Actual CRM Back/Forward handlers close interrupted dialogs without adding history entries',async()=>{
 const h=uiHarness();
 h.app.navigate('doctor','tasks');h.app.navigate('doctor','dashboard');
 const entries=h.history.entries();assert.equal(entries.length,3);
 h.app.handlers.newContact();assert.equal(h.get('editorDialog').open,true);
 h.window.history.back();assert.equal(h.app.state.type,'doctor');assert.equal(h.app.state.view,'tasks');assert.equal(h.get('editorDialog').open,false);assert.equal(h.app.state.dialogHandler,null);assert.equal(h.history.entries().length,3);
 h.app.handlers.newContact();h.window.history.forward();assert.equal(h.app.state.view,'dashboard');assert.equal(h.get('editorDialog').open,false);assert.equal(h.history.entries().length,3);
 h.app.handlers.newContact();h.get('closeDialog').dispatch('click');assert.equal(h.get('editorDialog').open,false);assert.equal(h.app.state.dialogHandler,null);assert.equal(h.app.state.view,'dashboard');assert.deepEqual(h.history.entries(),entries);
 h.app.handlers.newContact();const epoch=h.app.state.intentEpoch;h.get('editorDialog').dispatch('cancel');assert.equal(h.app.state.dialogHandler,null);assert.ok(h.app.state.intentEpoch>epoch);assert.deepEqual(h.history.entries(),entries);
 h.window.location.hash='#doctor/tasks/%E0%A4%A';assert.doesNotThrow(()=>h.window.dispatch('hashchange'));assert.equal(h.app.state.selected,null);assert.equal(h.app.state.view,'tasks');
});
// Original 2026-10-12 finance checkpoint: b14a6209e39d34fd3898bb27f105a959df8eaa167db1e50d9826c2c22635a929.
// Re-pinned after reviewed central staff permissions, holder-only consent, and
// explicit Admin authorization before a paid extension. Financial assertions remain intact.
test('Reviewed inline Backoffice program remains pinned after finance and staff integration',async()=>{
 const original=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).sort((a,b)=>b.length-a.length)[0];
 assert.equal(crypto.createHash('sha256').update(require('./fixtures/restore-onboarding-render-safety.cjs')(original)).digest('hex'),'9991a47d98c584b8dae5d870e2c8787b56ba907c26e88d735b70b2b479f98c0d','Reviewed inline program changed in v53: two-decimal money, DD/MM/AAAA dashboard dates and the Contrato firmado label');
});
test('Admin CRM mounts natively with scoped DOM and one Backoffice shell',async()=>{
 const h=await shell();assert.equal(h.get('crm').children.length,0);assert.equal(h.session(),null);
 await h.login('admin');assert.equal(h.view(),'dashboard');assert.equal(h.get('crm').children.length,0);
 assert.equal(h.get('nav').children.filter(n=>n.dataset.id==='crm').length,1);
 h.clickNav('crm');assert.equal(h.view(),'crm');assert.equal(h.get('appView').getAttribute('data-crm-active'),'true');
 const host=h.document.getElementById('crmWorkspace');assert.ok(host);assert.ok(host.shadowRoot);assert.equal(h.frames.length,0);assert.equal(h.window.location.hash,'#crm/patient/contacts');
 assert.equal(host.shadowRoot.querySelectorAll('link').length,0,'No CRM stylesheet network requests on entry');assert.equal(host.shadowRoot.querySelectorAll('style').length,1);assert.equal(host.shadowRoot.children[0].tagName,'STYLE','Styles precede all CRM content');assert.equal(host.shadowRoot.querySelector('h1'),null);assert.equal(host.shadowRoot.querySelector('.app-header'),null);assert.equal(host.shadowRoot.querySelector('.sidebar'),null);
 assert.ok(host.shadowRoot.getElementById('contactList'));assert.equal(h.document.getElementById('contactList'),null,'CRM IDs cannot leak into Backoffice selectors');assert.equal(h.document.body.dataset.context,undefined,'CRM context never restyles the Backoffice body');
 assert.equal(h.get('nav').children.find(n=>n.dataset.id==='crm').getAttribute('aria-current'),'page');assert.equal(h.get('crm').classList.contains('active'),true);assert.equal(h.get('dashboard').classList.contains('active'),false);assert.equal(h.get('appView').classList.contains('hidden'),false);
 h.clickNav('crm');assert.equal(h.document.getElementById('crmWorkspace'),host);assert.equal(h.get('crm').children.length,1);assert.equal(h.history.entries().length,2);
 const api=h.window.PulzzoCRMBackoffice;assert.equal(api.getContext(host).section,'crm');assert.equal(api.getContext({}),null);assert.equal(api.getApp({}),null);assert.equal(api.navigate({},'#doctor/tasks'),false);assert.equal(api.sync({}),false);
 h.navigate('patients');assert.equal(h.view(),'patients');assert.equal(h.get('crm').children.length,0);assert.equal(h.document.getElementById('crmWorkspace'),null);assert.equal(api.getContext(host),null);assert.equal(api.getApp(host),null);assert.equal(h.get('appView').getAttribute('data-crm-active'),null);assert.equal(h.window.location.hash,'#bo/patients');
 assert.equal(h.session().role,'admin');assert.ok(h.rendered.includes('Patients'));
});
function attachCRM(h){
 const host=h.document.getElementById('crmWorkspace'),api=h.window.PulzzoCRMBackoffice;assert.ok(host);const app=api.getApp(host);assert.ok(app);
 return {host,app,root:host.shadowRoot,window:h.window,history:h.history,get:id=>host.shadowRoot.getElementById(id)};
}
test('Parent owns CRM route history across tabs, contexts, BO sections, Back/Forward and modal interruption',async()=>{
 const h=await shell({role:'admin'});h.clickNav('crm');const child=attachCRM(h);
 child.app.navigate('doctor','tasks');assert.equal(h.window.location.hash,'#crm/doctor/tasks');assert.match(h.get('pageTitle').textContent,/Proveedores/);assert.equal(child.history.entries().length,h.history.entries().length);
 child.app.navigate('doctor','dashboard');assert.equal(h.history.entries().length,4);assert.equal(child.history.entries().length,h.history.entries().length);
 child.app.handlers.newContact();assert.equal(child.get('editorDialog').open,true);
 h.window.history.back();assert.equal(h.view(),'crm');assert.equal(child.app.state.view,'tasks');assert.equal(child.get('editorDialog').open,false);assert.equal(child.app.state.dialogHandler,null);assert.equal(h.history.entries().length,4);
 h.window.history.forward();assert.equal(child.app.state.view,'dashboard');assert.equal(child.history.entries().length,h.history.entries().length);
 child.app.handlers.newContact();const epoch=child.app.state.intentEpoch;h.navigate('portfolio');assert.equal(child.get('editorDialog').open,false);assert.ok(child.app.state.intentEpoch>epoch);assert.equal(h.document.getElementById('crmWorkspace'),null);assert.equal(h.window.location.hash,'#bo/portfolio');assert.equal(h.session().role,'admin');
 h.window.history.back();assert.equal(h.view(),'crm');const returned=attachCRM(h);assert.equal(returned.app.state.type,'doctor');assert.equal(returned.app.state.view,'dashboard');assert.equal(h.history.entries().length,5);
 h.window.history.forward();assert.equal(h.view(),'portfolio');assert.equal(h.get('crm').children.length,0);assert.equal(h.get('nav').children.find(n=>n.dataset.id==='portfolio').getAttribute('aria-current'),'page');
});
test('Deep CRM login, role boundaries, exact mounted-host capability and logout/session invalidation',async()=>{
 const h=await shell({hash:'#crm/doctor/tasks/contact_123'});assert.equal(h.view(),'dashboard');assert.equal(h.get('crm').children.length,0);await h.login('admin');assert.equal(h.view(),'crm');assert.equal(h.history.entries().length,1);assert.equal(h.window.location.hash,'#crm/doctor/tasks/contact_123');
 const child=attachCRM(h),api=h.window.PulzzoCRMBackoffice;assert.equal(child.app.state.selected,'contact_123');child.get('actorSelect').value='kam_luis';child.get('actorSelect').dispatch('change');assert.equal(child.get('actorSelect').disabled,true);assert.equal(child.app.state.actor.id,'admin_demo');assert.equal(api.getContext(child.host).actorId,'admin_demo');
 child.app.handlers.newContact();h.get('logoutBtn').dispatch('click');assert.equal(h.session(),null);assert.equal(h.get('appView').classList.contains('hidden'),true);assert.equal(h.get('loginView').classList.contains('hidden'),false);assert.equal(h.get('crm').children.length,0);assert.equal(child.get('editorDialog').open,false);assert.equal(api.getContext(child.host),null);assert.equal(api.navigate(child.host,'#patient/tasks'),false);
 h.window.history.back();h.window.history.forward();assert.equal(h.get('crm').children.length,0);
 await h.login('admin');const fresh=attachCRM(h);assert.equal(fresh.app.state.actor.id,'admin_demo','Admin starts in its own intake scope after logout');h.evaluate('session=null');assert.equal(api.getContext(fresh.host),null);assert.equal(api.sync(fresh.host),false);assert.equal(api.navigate(fresh.host,'#doctor/dashboard'),false);
 for(const role of ['operations','risk','provider','readonly']){
  const denied=await shell({hash:'#crm/doctor/tasks',role});assert.equal(denied.view(),'dashboard');assert.equal(denied.get('nav').children.some(n=>n.dataset.id==='crm'),false);assert.equal(denied.get('crm').children.length,0);assert.equal(denied.window.PulzzoCRMBackoffice.getContext({}),null);denied.navigate('crm');assert.equal(denied.view(),'dashboard');assert.equal(denied.get('crm').children.length,0);assert.equal(denied.session().role,role);
 }
});
test('Collapsed desktop shell and mobile drawer open/close/Escape preserve CRM route and dismiss CRM modal',async()=>{
 const h=await shell({role:'admin'});h.get('sidebarToggle').dispatch('click');assert.equal(h.get('appView').classList.contains('sidebar-collapsed'),true);h.clickNav('crm');const child=attachCRM(h);child.app.handlers.newContact();const route=h.window.location.hash;
 h.resize(390);assert.equal(h.get('sidebarToggle').hidden,true);assert.equal(h.get('sidebar').inert,true);h.get('mobileMenu').dispatch('click');assert.equal(h.get('sidebar').classList.contains('open'),true);assert.equal(h.get('main').inert,true);assert.equal(child.get('editorDialog').open,false);assert.equal(h.document.activeElement,h.get('sidebarClose'));assert.equal(h.window.location.hash,route);
 h.emit('keydown',{key:'Escape'});assert.equal(h.get('sidebar').classList.contains('open'),false);assert.equal(h.get('main').inert,false);assert.equal(h.document.activeElement,h.get('mobileMenu'));assert.equal(h.window.location.hash,route);
 h.get('mobileMenu').dispatch('click');h.clickNav('crm');assert.equal(h.get('sidebar').classList.contains('open'),false);assert.equal(h.get('main').inert,false);assert.equal(h.document.activeElement,h.get('mobileMenu'));assert.equal(h.get('crm').children.length,1);
 h.resize(1200);assert.equal(h.get('appView').classList.contains('sidebar-collapsed'),true);assert.equal(h.get('sidebar').inert,false);assert.equal(h.get('sidebarToggle').hidden,false);assert.equal(h.window.location.hash,route);
});
test('Direct CRM entry has one canonical replace redirect, cannot self-authorize and suppresses standalone boot',async()=>{
 for(const options of [
  {hash:'#doctor/tasks/contact_123'},
  {hash:'#doctor/tasks/contact_123',search:'?embedded=backoffice'},
  {hash:'#doctor/tasks/contact_123',search:'?embedded=backoffice',isFrame:true,parentAPI:{getContext:()=>null}},
  {hash:'#doctor/tasks/contact_123',search:'?embedded=backoffice',isFrame:true,parentWindow:{location:{origin:'https://other.test'},PulzzoCRMBackoffice:{getContext(){throw Error('Cross-origin capability must not be consulted');}}}}
 ]){
  const e=entry(options);assert.equal(e.window.crmDemoEntryBlocked,true);assert.deepEqual(e.redirects,['backoffice.html#crm/doctor/tasks/contact_123']);assert.equal(e.window.PulzzoCRMEmbedding,undefined);vm.runInContext(read('assets/js/crm-demo-ui.js'),e.context);assert.equal(e.window.crmDemoApp,undefined,'Standalone CRM app cannot mount while redirecting');
 }
 const malformed=entry({hash:'#doctor/unsupported/%E0%A4%A'});assert.deepEqual(malformed.redirects,['backoffice.html#crm/doctor/contacts']);
 const malicious=entry({hash:'#patient/tasks/%3Cscript%3E'});assert.deepEqual(malicious.redirects,['backoffice.html#crm/patient/tasks']);
 const direct=entry({hash:'#doctor/dashboard'}),target=new URL(direct.redirects[0],'https://demo.test/');const bo=await shell({hash:target.hash,role:'admin'});assert.equal(bo.view(),'crm');assert.equal(bo.get('crm').children.length,1);assert.equal(bo.history.entries().length,1,'Canonical redirect followed by login never adds a return-to-standalone loop');
});
test('Native adapter scopes clicks and external holder links and releases listeners on every unmount',async()=>{
 const h=await shell({role:'admin'});const count=type=>(h.window.listeners[type]||[]).length;const baseline={storage:count('storage'),pagehide:count('pagehide'),popstate:count('popstate'),hashchange:count('hashchange')};
 for(let i=0;i<3;i++){
  h.clickNav('crm');const crm=attachCRM(h);
  assert.equal(count('popstate'),baseline.popstate);assert.equal(count('hashchange'),baseline.hashchange,'Only Backoffice subscribes to native navigation');assert.equal(count('storage'),baseline.storage+1);assert.equal(count('pagehide'),baseline.pagehide+1);
  const doctor=crm.root.querySelector('[data-context-switch="doctor"]');doctor.dispatch('click');assert.equal(crm.app.state.type,'doctor');assert.equal(h.window.location.hash,'#crm/doctor/contacts');assert.equal(crm.root.querySelector('.crm-surface').dataset.context,'doctor');
  const holder=crm.root.querySelector('.holder-entry');holder.dispatch('click');assert.equal(holder.target,'_blank');assert.equal(holder.rel,'noopener noreferrer');
  crm.get('newContact').dispatch('click');assert.equal(crm.get('editorDialog').open,true);const epoch=crm.app.state.intentEpoch;h.navigate('patients');assert.equal(crm.get('editorDialog').open,false);assert.ok(crm.app.state.intentEpoch>epoch);assert.equal((crm.root.listeners.click||[]).length,0);assert.equal((crm.get('newContact').listeners.click||[]).length,0);assert.equal(count('storage'),baseline.storage);assert.equal(count('pagehide'),baseline.pagehide);
  const previous=h.window.location.hash;doctor.dispatch('click');crm.app.navigate('patient','tasks');assert.equal(h.window.location.hash,previous,'Detached CRM controls and stale app cannot navigate');assert.equal(h.window.crmDemoStore,undefined);
 }
});
test('Explicit mobile contact selections reveal the detail, without scrolling desktop or history restores',async()=>{
 for(const width of [390,820,1200]){
  const h=await shell({role:'admin',width});h.get('testTopbar').classList.add('topbar');h.clickNav('crm');const crm=attachCRM(h);crm.get('loadExamples').dispatch('click');const detail=crm.get('contactDetail');assert.equal(detail.getAttribute('tabindex'),'-1');assert.equal((detail.scrollCalls||[]).length,width<=820?1:0,'Explicit sample loading reveals the selected mobile detail');
  const row=crm.get('contactList').querySelectorAll('[data-action="select-contact"]').find(node=>node.dataset.id!==crm.app.state.selected),prior=h.history.entries().length;row.dispatch('click');assert.equal(crm.app.state.selected,row.dataset.id);assert.equal(h.history.entries().length,prior+1);assert.equal((detail.scrollCalls||[]).length,width<=820?2:0);
  if(width<=820){assert.equal(h.document.activeElement,detail);assert.equal(detail.focusOptions.preventScroll,true);assert.equal(detail.style.scrollMarginTop,'60px');assert.equal(detail.scrollCalls[0].block,'start');assert.equal(detail.scrollCalls[0].behavior,'instant');}
  crm.root.querySelector('[data-view="tasks"]').dispatch('click');const taskContact=crm.get('taskBoard').querySelector('[data-action="open-task-contact"]');assert.ok(taskContact);const beforeOpen=h.history.entries().length;taskContact.dispatch('click');assert.equal(crm.app.state.view,'contacts');assert.equal(crm.app.state.selected,taskContact.dataset.id);assert.equal(h.history.entries().length,beforeOpen+1);assert.equal((detail.scrollCalls||[]).length,width<=820?3:0);
  const calls=(detail.scrollCalls||[]).length;h.window.history.back();h.window.history.forward();crm.app.render();assert.equal((detail.scrollCalls||[]).length,calls,'Back, Forward and render preserve user scroll');
 }
});
test('A failed native mount reports a local error and retries without leaving a host or listeners',async()=>{
 const h=await shell({role:'admin'}),ui=h.window.PulzzoCRMUI,count=type=>(h.window.listeners[type]||[]).length,baseline=count('storage');h.window.PulzzoCRMUI=null;
 h.clickNav('crm');assert.equal(h.document.getElementById('crmWorkspace'),null);assert.equal(h.get('crm').querySelector('[role="alert"]').textContent,'El módulo CRM no está disponible. Recarga Backoffice para intentarlo de nuevo.');assert.equal(count('storage'),baseline);assert.equal(h.frames.length,0);
 h.window.PulzzoCRMUI=ui;h.clickNav('crm');assert.ok(attachCRM(h).app);assert.equal(h.get('crm').querySelector('[role="alert"]'),null);assert.equal(h.get('crm').children.length,1);assert.equal(h.history.entries().length,2);assert.equal(count('storage'),baseline+1);
});
test('Mounted native forms preserve contact/task/assisted behavior and cancel pending evidence on section exit',async()=>{
 const h=await shell({role:'admin'});let finishPut,removed=[],closed=0;
 const evidence={async put(file,context){await new Promise(resolve=>{finishPut=resolve;});return {id:'native_evidence_1',name:file.name,mimeType:file.type,size:file.size,actorId:context.actorId,contactId:context.contactId,uploadedAt:new Date().toISOString()};},async remove(id){removed.push(id);},async close(){closed++;}};
 h.window.PulzzoCRMEvidence={createEvidenceStore:()=>evidence};h.clickNav('crm');const crm=attachCRM(h);
 const submit=async values=>{const form=crm.get('dialogContent').querySelector('form');assert.ok(form,'The shipped dialog form must exist in the native root');for(const [name,value]of Object.entries(values)){const field=form.elements.namedItem(name);assert.ok(field,name);if(name==='file'||name==='evidence')field.files=value;else field.value=value;}await crm.app.handlers.submit({target:form,preventDefault(){}});return form;};
 crm.get('newContact').dispatch('click');await submit({name:'Native demo client',assignedKam:'kam_ana',email:'native@example.test',phone:'+12025550111',originalSource:'unknown'});
 const contact=crm.app.state.store.listContacts()[0];assert.ok(contact);assert.equal(contact.accountExists,false);assert.equal(contact.assignedKam,'kam_ana');assert.match(h.window.location.hash,new RegExp('/'+contact.id+'$'));assert.match(crm.get('contactDetail').innerHTML,/Native demo client/);
 crm.root.querySelector('[data-action="new-profile-task"]').dispatch('click');await submit({contactId:contact.id,title:'Native follow-up',dueAt:'2026-10-20T12:00'});assert.equal(crm.app.state.store.listTasks().length,1);
 crm.root.querySelector('[data-view="tasks"]').dispatch('click');assert.match(crm.get('taskBoard').innerHTML,/Native follow-up/);assert.match(h.window.location.hash,/#crm\/patient\/tasks/);
 crm.root.querySelector('[data-view="contacts"]').dispatch('click');crm.root.querySelector('[data-action="begin-onboarding"]').dispatch('click');assert.equal(Object.values(crm.app.state.store.snapshot().expedients).length,1);crm.app.closeDialog();
 crm.root.querySelector('[data-action="activity"]').dispatch('click');const pending=submit({evidence:[{name:'native-demo.png',type:'image/png',size:100}],type:'note',outcome:'other',note:'Evidencia ficticia',contactAt:'2026-10-08T10:00'});assert.equal(crm.app.state.busy,true);const epoch=crm.app.state.intentEpoch;
 h.navigate('patients');assert.ok(crm.app.state.intentEpoch>epoch);finishPut();await pending;assert.deepEqual(removed,['native_evidence_1']);assert.throws(()=>crm.app.state.store.snapshot(),error=>error.code==='forbidden');assert.equal(Object.values(JSON.parse(h.window.localStorage.getItem('pulzzo_crm_assisted_demo_v1')).expedients)[0].documents.length,0);assert.equal(closed,1);assert.equal(h.window.location.hash,'#bo/patients');assert.equal(h.document.getElementById('crmWorkspace'),null);
 h.clickNav('crm');const fresh=attachCRM(h);assert.equal(fresh.app.state.store.listContacts().length,1);assert.equal(fresh.app.state.store.listTasks().length,1);assert.equal(fresh.app.state.store.listContacts()[0].originalSource,'unknown');assert.equal(h.window.localStorage.getItem('pulzzo_backoffice_demo'),null,'CRM forms do not write the Backoffice financial database');
});
test('Integration surface stays scoped and there are no wildcard cross-window messages or financial writes',async()=>{
 const code=read('assets/js/backoffice-crm.js'),embed=read('assets/js/crm-demo-embed.js'),css=read('assets/css/backoffice-crm.css'),childCSS=read('assets/css/crm-demo-embed.css'),crmHTML=read('crm-demo.html');
 assert.match(html,/<section id="crm" class="view" aria-label="CRM"><\/section>/);assert.equal((html.match(/src="assets\/js\/backoffice-crm.js"/g)||[]).length,1);assert.doesNotMatch(html,/<a[^>]+href="crm-demo.html"/);
 assert.match(css,/#appView\[data-crm-active="true"\]/);assert.match(css,/#crmWorkspace/);assert.match(childCSS,/:host/);assert.match(childCSS,/\.crm-surface/);
 assert.doesNotMatch(code,/createElement\(['"]iframe|contentWindow|sizeFrame/);assert.match(embed,/attachShadow\(\{mode:'open'\}\)/);assert.match(read('assets/js/crm-demo-template.js'),/crm-toolbar/);
 assert.ok(crmHTML.indexOf('crm-demo-embed.js')<crmHTML.indexOf('crm-demo-ui.js'));assert.doesNotMatch(code+'\n'+embed,/postMessage\s*\(|localStorage\s*\.\s*setItem|\bpersist\s*\(|\.offer\s*=|\.application\s*=/);
 for(const filename of fs.readdirSync(root).filter(name=>name.endsWith('.html')&&name!=='backoffice.html'))assert.doesNotMatch(read(filename),/assets\/(?:js|css)\/backoffice-crm\./);
});
test('Browser Back into CRM dismisses real Backoffice modal and nested document review without committing',async()=>{
 const h=await shell({role:'admin'});h.clickNav('crm');h.navigate('patients');
 h.context.modal('<h3>Nota ficticia sin guardar</h3>');assert.equal(h.get('modalBackdrop').classList.contains('show'),true);assert.equal(h.get('appView').inert,true);
 h.window.history.back();assert.equal(h.view(),'crm');assert.equal(h.get('modalBackdrop').classList.contains('show'),false);assert.equal(h.get('appView').inert,false);assert.equal(h.evaluate('modalInertState.length'),0);assert.equal(h.document.activeElement,h.get('nav').children.find(n=>n.dataset.id==='crm'));
 h.window.history.forward();assert.equal(h.view(),'patients');h.evaluate("reviewContext={origin:{view:'patients',patientTab:'documentos',providerTab:'perfil'},focus:null};reviewNested=true;");h.context.modal('<h3>Corrección documental sin enviar</h3>');
 h.window.history.back();assert.equal(h.view(),'crm');assert.equal(h.get('modalBackdrop').classList.contains('show'),false);assert.equal(h.get('appView').inert,false);assert.equal(h.evaluate('reviewContext'),null);assert.equal(h.evaluate('reviewNested'),false);
});
test('Pagehide teardown followed by bfcache pageshow restores exactly one native CRM mount',async()=>{
 const h=await shell({hash:'#crm/doctor/tasks',role:'kam_luis'}),child=attachCRM(h);child.app.handlers.newContact();const route=h.window.location.hash,count=h.history.entries().length;
 h.window.dispatch('pagehide');assert.equal(h.get('crm').children.length,0);assert.equal(child.get('editorDialog').open,false);assert.equal(h.window.PulzzoCRMBackoffice.getContext(child.host),null);
 h.window.dispatch('pageshow',{persisted:true});assert.equal(h.view(),'crm');assert.equal(h.get('crm').children.length,1);assert.equal(h.window.location.hash,route);assert.equal(h.history.entries().length,count);const resumed=attachCRM(h);assert.equal(resumed.app.state.type,'doctor');assert.equal(resumed.app.state.view,'tasks');assert.equal(resumed.app.state.actor.id,'kam_luis');
 h.window.dispatch('pageshow',{persisted:true});assert.equal(h.get('crm').children.length,1);assert.equal(h.history.entries().length,count);
});
test('Portfolio payment drawer uses its existing close handler and cannot be interrupted while saving',async()=>{
 const h=await shell({role:'admin'});h.clickNav('crm');h.navigate('portfolio');
 vm.runInContext('let portfolioPaymentSession=null;function portfolioPaymentKeydown(){};',h.context);vm.runInContext(extract(read('assets/js/backoffice-portfolio-payment.js'),'portfolioClosePayment'),h.context);
 h.get('portfolioPaymentOverlay');h.get('appView').inert=true;h.evaluate("portfolioPaymentSession={saving:false,inertNodes:[{node:document.getElementById('appView'),wasInert:false}],bodyStyle:{overflow:''},scrollY:0};");
 h.window.history.back();assert.equal(h.view(),'crm');assert.equal(h.document.getElementById('portfolioPaymentOverlay'),null);assert.equal(h.evaluate('portfolioPaymentSession'),null);assert.equal(h.get('appView').inert,false);
 h.window.history.forward();h.get('portfolioPaymentOverlay');h.evaluate("portfolioPaymentSession={saving:true,inertNodes:[],bodyStyle:{},scrollY:0};");const entries=h.history.entries().length;
 h.window.history.back();assert.equal(h.view(),'portfolio');assert.equal(h.window.location.hash,'#bo/portfolio');assert.ok(h.document.getElementById('portfolioPaymentOverlay'));assert.equal(h.evaluate('portfolioPaymentSession.saving'),true);assert.equal(h.get('crm').children.length,0);assert.equal(h.history.entries().length,entries);
});
test('Cold CRM mount installs complete styles before UI with no dependency on CSS load events',async()=>{
 const h=await shell({role:'admin'}),original=h.document.createElement,events=[];
 h.document.createElement=function(tag){
  assert.notEqual(tag,'link','Blocked or indefinitely delayed CSS requests cannot affect CRM mount');
  const node=original(tag);events.push(tag);return node;
 };
 const api=h.window.PulzzoCRMUI,createApp=api.createApp;
 api.createApp=function(config){
  const host=h.document.getElementById('crmWorkspace');
  assert.equal(host.shadowRoot.children[0].tagName,'STYLE');
  assert.equal(host.shadowRoot.children[0].textContent,read('assets/css/flat-design-tokens.css')+'\n'+read('assets/css/crm-demo.css')+'\n'+read('assets/css/crm-demo-embed.css'));
  return createApp(config);
 };
 h.clickNav('crm');const first=attachCRM(h);assert.ok(events.includes('style'));assert.equal(first.root.querySelectorAll('link').length,0);
 h.navigate('patients');h.window.history.back();const second=attachCRM(h);assert.notEqual(first.host,second.host);assert.equal(second.root.children[0].tagName,'STYLE');
 h.get('logoutBtn').dispatch('click');assert.equal(h.document.getElementById('crmWorkspace'),null);assert.equal(h.window.PulzzoCRMBackoffice.getApp(second.host),null);
 await h.login('admin');assert.equal(attachCRM(h).root.children[0].tagName,'STYLE');
});
test('Failed style installation never creates raw CRM UI; retry is scoped and restores active shell',async()=>{
 const h=await shell({role:'admin'}),original=h.document.createElement;
 h.document.createElement=function(tag){const node=original(tag);if(tag==='style')node.sheet=null;return node;};
 h.clickNav('crm');assert.equal(h.document.getElementById('crmWorkspace'),null);assert.equal(h.get('crm').querySelector('.crm-load-error').getAttribute('role'),'alert');
 assert.equal(h.get('crm').querySelector('.crm-surface'),null);
 const retry=h.get('crm').querySelector('button');assert.equal(retry.textContent,'Reintentar CRM');
 h.document.createElement=original;retry.dispatch('click');const fresh=attachCRM(h);assert.equal(h.get('appView').getAttribute('data-crm-active'),'true');assert.equal(fresh.root.children[0].tagName,'STYLE');
 retry.dispatch('click');assert.equal(attachCRM(h).host,fresh.host,'Detached retry cannot duplicate a live mount');
 h.navigate('patients');retry.dispatch('click');assert.equal(h.view(),'patients');assert.equal(h.document.getElementById('crmWorkspace'),null);
 h.get('logoutBtn').dispatch('click');retry.dispatch('click');assert.equal(h.session(),null);assert.equal(h.document.getElementById('crmWorkspace'),null);
});
test('UI initialization failure can retry on a fresh host without leaked event handlers',async()=>{
 const h=await shell({role:'admin'}),api=h.window.PulzzoCRMUI,createApp=api.createApp;let failedRoot;
 api.createApp=function(){failedRoot=h.document.getElementById('crmWorkspace').shadowRoot;throw Error('Simulated initialization failure');};
 h.clickNav('crm');assert.equal(h.document.getElementById('crmWorkspace'),null);assert.equal(failedRoot.listeners.click.length,0);
 api.createApp=createApp;h.get('crm').querySelector('button').dispatch('click');assert.ok(attachCRM(h).app);assert.equal(h.get('crm').querySelector('.crm-load-error'),null);
});
test('Dedicated KAM and leader logins mount only their bound CRM actor without an admin selector',async()=>{
 for(const role of ['kam','leader']){
  const h=await shell({role}),crm=attachCRM(h),expected=role==='kam'?'kam_ana':'leader_demo';
  assert.equal(h.view(),'crm');assert.equal(crm.app.state.actor.id,expected);assert.equal(crm.app.state.actor.role,role);
  assert.deepEqual(h.get('nav').children.map(n=>n.dataset.id),['crm']);
  assert.equal(crm.get('actorSelect').disabled,true);assert.equal(h.window.PulzzoCRMBackoffice.getContext(crm.host).allowActorSwitch,false);
  for(const id of ['admin_demo','kam_luis','leader_demo']){crm.get('actorSelect').value=id;crm.get('actorSelect').dispatch('change');assert.equal(crm.app.state.actor.id,expected);}
  for(const capability of ['riskActions','patientActions','providerActions','docs','settings','payload'])assert.equal(h.evaluate('can('+JSON.stringify(capability)+')'),false);
  for(const view of ['dashboard','patients','patientProfiles','providers','documents','portfolio','settings']){h.navigate(view);assert.equal(h.view(),'crm');assert.equal(attachCRM(h).app.state.actor.id,expected);}
  h.window.location.hash='#bo/portfolio';h.window.dispatch('hashchange');assert.equal(h.view(),'crm');assert.match(h.window.location.hash,/^#crm\//);assert.equal(h.rendered.length,0);
 }
});
test('A second login without logout replaces the old CRM session and revokes retained stores',async()=>{
 const h=await shell({hash:'#crm/doctor/contacts',role:'admin'}),old=attachCRM(h);
 old.get('actorSelect').value='admin_demo';old.get('actorSelect').dispatch('change');const oldStore=old.app.state.store;
 old.app.handlers.newContact();assert.equal(old.get('editorDialog').open,true);
 await h.login('leader');const leader=attachCRM(h);assert.notEqual(leader.host,old.host);assert.equal(leader.app.state.actor.role,'leader');
 assert.equal(old.get('editorDialog').open,false);assert.throws(()=>oldStore.snapshot(),error=>error.code==='forbidden');
 assert.equal(oldStore.createContact({phone:(globalThis.__pzPhone=(globalThis.__pzPhone||100000)+1,'5500'+globalThis.__pzPhone),type:'patient',name:'Forbidden retained admin',email:'retained@example.test'},0).ok,false);
 h.get('loginEmail').value='luis.kam@pulzzo.mx';h.get('loginPass').value='pulzzo-demo';await h.context.login();
 const luis=attachCRM(h);assert.equal(luis.app.state.actor.id,'kam_luis');assert.notEqual(luis.host,leader.host);assert.throws(()=>leader.app.state.store.snapshot(),error=>error.code==='forbidden');
 h.get('logoutBtn').dispatch('click');assert.throws(()=>luis.app.state.store.snapshot(),error=>error.code==='forbidden');assert.equal(h.get('crm').children.length,0);
});
test('KAM deep links and restored history cannot expose another portfolio after reassignment',async()=>{
 const h=await shell({role:'admin',hash:'#crm/patient/contacts'}),adminApp=attachCRM(h);adminApp.get('actorSelect').value='admin_demo';adminApp.get('actorSelect').dispatch('change');
 const admin=adminApp.app.state.store,r=admin.createContact({phone:(globalThis.__pzPhone=(globalThis.__pzPhone||100000)+1,'5500'+globalThis.__pzPhone),type:'patient',name:'Luis-only demo',email:'luis-only@example.test',assignedKam:'kam_luis'},admin.snapshot().revision);assert.equal(r.ok,true);const id=r.value.id;
 await h.login('kam');const ana=attachCRM(h);ana.app.navigate('patient','contacts',id);assert.equal(ana.app.state.store.listContacts().length,0);assert.throws(()=>ana.app.state.store.getContact(id),e=>e.code==='forbidden');assert.doesNotMatch(ana.get('contactDetail').innerHTML,/Luis-only demo|luis-only@example/);
 h.window.history.back();h.window.history.forward();assert.doesNotMatch(ana.get('contactDetail').innerHTML,/Luis-only demo|luis-only@example/);
 await h.login('leader');const leader=attachCRM(h);leader.app.navigate('patient','contacts',id);assert.equal(leader.app.state.store.getContact(id).name,'Luis-only demo');assert.match(leader.get('contactDetail').innerHTML,/Luis-only demo/);
});
test('Legacy operational bridges and direct entry points cannot bypass CRM-only session read scope',async()=>{
 const beforeCRM=context=>vm.runInContext(`window.bridgeReads=0;window.PulzzoBackofficeDemoBridge={getDatabase(){bridgeReads++;return {private:true};},getSelected(){bridgeReads++;return {};},save(){bridgeReads++;},select(){bridgeReads++;}};window.PulzzoServicingOffice={getDatabase(){bridgeReads++;return {};},getSelected(){bridgeReads++;return {};},getProvider(){bridgeReads++;return {};},patientProjection(){bridgeReads++;return {};},doctorProjection(){bridgeReads++;return {};},identityCandidates(){bridgeReads++;return [];},getStorageVersion(){bridgeReads++;return 'raw';}};window.PulzzoDoctorPublicationBO={render(){bridgeReads++;return 'private publication';},badge(){bridgeReads++;return 'private badge';},preview(){return 'public fields';}};window.openPatientProfile=function(){bridgeReads++;};window.backToPatientProfiles=function(){bridgeReads++;};window.openDocumentReview=function(){bridgeReads++;};`,context);
 for(const role of ['kam','leader',null]){
  const h=await shell({role,beforeCRM});
  for(const bridge of [h.window.PulzzoBackofficeDemoBridge,h.window.PulzzoServicingOffice])for(const method of Object.values(bridge))assert.throws(()=>method());
  assert.equal(h.context.openPatientProfile('foreign'),false);assert.equal(h.context.backToPatientProfiles(),false);assert.equal(h.context.openDocumentReview('patient','foreign','doc'),false);
  assert.equal(h.window.PulzzoDoctorPublicationBO.render({id:'foreign'}),'');assert.equal(h.window.PulzzoDoctorPublicationBO.badge({id:'foreign'}),'');assert.equal(h.window.PulzzoDoctorPublicationBO.preview({}),'public fields');assert.equal(h.window.bridgeReads,0);
 }
 for(const role of ['admin','operations','risk','provider','readonly']){const h=await shell({role,beforeCRM});assert.equal(h.window.PulzzoBackofficeDemoBridge.getDatabase().private,true);assert.equal(h.window.PulzzoDoctorPublicationBO.render({}),'private publication');assert.equal(h.window.bridgeReads,2);}
});
test('A document-only operational template opens its allowed section and keeps history secondary',async()=>{
 const h=await shell({role:'admin'});
 h.evaluate("staffAccess.updateRole(session,'operations',{grants:{viewDocuments:'all',viewHistory:'all'}},staffAccess.getVersion())");
 await h.login('operations');
 assert.equal(h.view(),'documents');assert.deepEqual(h.get('nav').children.map(node=>node.dataset.id),['documents']);
 assert.equal(h.navigate('patients'),false);assert.equal(h.view(),'documents');
 h.navigate('history');assert.equal(h.view(),'history');assert.ok(h.rendered.includes('History'));
 assert.equal(h.navigate('crm'),false);assert.equal(h.get('crm').children.length,0);assert.equal(h.view(),'history');
});
test('Missing or invalid CRM identities fail closed to login without operational fallback',async()=>{
 for(const role of ['kam','leader'])for(const value of ['unknown_actor',null]){
  const h=await shell({role}),old=attachCRM(h);
  h.evaluate('session={...session,sessionId:'+JSON.stringify(value)+'}');
  assert.equal(h.navigate('crm'),false);assert.equal(h.session(),null);assert.equal(h.get('appView').classList.contains('hidden'),true);assert.equal(h.get('loginView').classList.contains('hidden'),false);
  assert.equal(h.get('crm').children.length,0);assert.equal(h.rendered.length,0);assert.throws(()=>old.app.state.store.snapshot(),e=>e.code==='forbidden');
  await h.login(role);assert.equal(h.view(),'crm');assert.equal(attachCRM(h).app.state.actor.role,role);
 }
});
test('Unknown roles fail closed for direct navigation, history and operational bridge methods',async()=>{
 for(const entry of ['navigation','history']){
  const h=await shell({role:'admin',hash:'#crm'}),old=attachCRM(h),before=h.rendered.length;
  h.evaluate("session={email:'unknown@example.test',role:'unexpected',crmActorId:'admin_demo'}");
  if(entry==='navigation')assert.equal(h.navigate('dashboard'),false);else{h.window.location.hash='#bo/dashboard';h.window.dispatch('hashchange');}
  assert.equal(h.session(),null);assert.equal(h.get('appView').classList.contains('hidden'),true);assert.equal(h.rendered.length,before);assert.throws(()=>old.app.state.store.snapshot(),e=>e.code==='forbidden');
 }
 const h=await shell({role:'admin',beforeCRM:context=>vm.runInContext('window.PulzzoBackofficeDemoBridge={getDatabase:()=>({private:true})};',context)});
 h.evaluate("session={role:'unknown'}");assert.throws(()=>h.window.PulzzoBackofficeDemoBridge.getDatabase());
});
(async()=>{for(const {label,fn} of cases){await fn();groups++;console.log('PASS',label);}console.log(`PASS: ${groups} CRM-in-Backoffice integration groups. Actual handler/DOM/History tests; browser geometry, rendering and assistive-technology checks are separate.`);})().catch(error=>{console.error(error);process.exitCode=1;});
