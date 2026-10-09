'use strict';
// Real shipped navigation handlers in a deterministic DOM/History VM.
// This deliberately does not launch a browser or claim visual/geometry coverage.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('backoffice.html');
function extract(source,name){
 const start=source.indexOf('function '+name+'(');assert.ok(start>=0,`Missing shipped ${name} handler`);
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
 class Element{
  constructor(tag='div',id=''){this.tagName=tag.toUpperCase();this.id=id;this.children=[];this.attributes={};this.dataset={};this.style={};this.classList=new Classes();this.listeners={};this.hidden=false;this.inert=false;this.disabled=false;this.open=false;this.value='';this.textContent='';this._innerHTML='';if(id)nodes.set(id,this);if(tag==='iframe'){this.contentWindow={};frames.push(this);}}
  get className(){return [...this.classList.values].join(' ');}set className(value){this.classList.values=new Set(String(value).split(/\s+/).filter(Boolean));}
  get innerHTML(){return this._innerHTML;}set innerHTML(value){this._innerHTML=String(value);this.replaceChildren();if(this.id==='nav'){for(const match of this._innerHTML.matchAll(/<button\b([^>]+)>/g)){const b=new Element('button');for(const attr of match[1].matchAll(/([\w-]+)="([^"]*)"/g))b.setAttribute(attr[1],attr[2]);this.appendChild(b);}}}
  appendChild(node){this.children.push(node);node.parentNode=this;node.parentElement=this;if(node.id)nodes.set(node.id,node);return node;}
  append(...children){children.forEach(c=>this.appendChild(c));}replaceChildren(...children){this.children.forEach(c=>{c.parentNode=null;if(c.id)nodes.delete(c.id);});this.children=[];this.append(...children);}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.parentNode=null;if(this.id)nodes.delete(this.id);}
  setAttribute(k,v){this.attributes[k]=String(v);if(k==='id'){this.id=String(v);nodes.set(this.id,this);}if(k==='class')this.className=v;if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(v);if(k==='src')this.src=String(v);if(k==='open')this.open=true;}
  getAttribute(k){return this.attributes[k]??null;}removeAttribute(k){delete this.attributes[k];if(k==='open')this.open=false;}
  addEventListener(t,fn){(this.listeners[t]??=[]).push(fn);}removeEventListener(t,fn){this.listeners[t]=(this.listeners[t]||[]).filter(f=>f!==fn);}
  dispatch(type,event={}){const e={type,target:this,preventDefault(){this.defaultPrevented=true;},...event};for(const fn of this.listeners[type]||[])fn(e);this['on'+type]?.(e);return e;}
  focus(){document.activeElement=this;}select(){}showModal(){this.open=true;}close(){this.open=false;this.dispatch('close');}
  contains(node){return node===this||this.children.some(c=>c.contains?.(node));}
  closest(selector){if(selector.split(',').some(s=>matches(this,s.trim())))return this;return this.parentNode?.closest?.(selector)||null;}
  querySelectorAll(selector){const all=[];const visit=node=>{for(const child of node.children){if(matches(child,selector))all.push(child);visit(child);}};visit(this);return all;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  get firstElementChild(){return this.children[0]||null;}getBoundingClientRect(){return {right:66,top:100,height:44,width:220};}
 }
 function matches(node,s){if(s==='iframe')return node.tagName==='IFRAME';if(s==='dialog[open]')return node.tagName==='DIALOG'&&node.open;if(s==='.nav-btn')return node.classList.contains('nav-btn');if(s.startsWith('#'))return node.id===s.slice(1);if(s.startsWith('.'))return node.classList.contains(s.slice(1));return node.tagName===s.toUpperCase();}
 document.createElement=tag=>new Element(tag);document.createTextNode=text=>({textContent:text});document.getElementById=id=>nodes.get(id)||null;
 document.body=new Element('body','body');document.documentElement=new Element('html','html');document.documentElement.appendChild(document.body);
 document.querySelectorAll=selector=>{if(selector==='.nav-btn')return document.getElementById('nav')?.children||[];if(selector.startsWith('.nav-btn[data-id=')){const id=selector.match(/data-id="([^"]+)"/)[1];return (document.getElementById('nav')?.children||[]).filter(n=>n.dataset.id===id);}if(selector==='.view')return [...nodes.values()].filter(n=>n.classList.contains('view'));if(selector==='#sidebar button:not([disabled]), #sidebar a[href]')return document.getElementById('sidebar').querySelectorAll('button').filter(n=>!n.disabled);return [...nodes.values()].filter(n=>matches(n,selector));};
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
function shell({width=1200,hash='',role=null}={}){
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
 const definitions=html.slice(html.indexOf('const users='),html.indexOf('const baseState='));
 assert.ok(definitions.includes('const navItems='));
 vm.runInContext('function dashboardPeriodBounds(){return {};};\n'+definitions+'\nlet correctionReturnContext=null;',context);
 for(const name of ['can','setView','bootLogin','login','initApp','renderNav','render'])vm.runInContext(extract(html,name),context);
 vm.runInContext(html.slice(html.indexOf('function setSidebarOpen('),html.indexOf('function initApp()')),context);
 for(const name of ['Dashboard','Patients','PatientProfiles','Providers','Documents','Corrections','Offers','History','Settings','Portfolio'])context['render'+name]=()=>rendered.push(name);
 vm.runInContext('var modalFocusOrigin=null,modalInertState=[];let reviewContext=null,reviewNested=false;function readonlyFinancialHtml(value){return value;}function renderDocumentReview(){};',context);
 for(const name of ['readonly','modalReleaseBackground','modalSetupAccessibility','modal','closeModal','reviewRestoreOrigin','closeDocumentReview'])vm.runInContext(extract(html,name),context);
 vm.runInContext(read('assets/js/backoffice-sidebar.js'),context);
 vm.runInContext(read('assets/js/backoffice-crm.js'),context);
 const evaluate=source=>vm.runInContext(source,context);
 const login=role=>{const user=evaluate(`users.find(u=>u.role===${JSON.stringify(role)})`);get('loginEmail').value=user.email;get('loginPass').value=user.pass;context.login();return user;};
 if(role)login(role);
 return {...d,window,context,history,storage,rendered,evaluate,login,view:()=>evaluate('currentView'),session:()=>evaluate('session'),navigate:id=>context.setView(id),clickNav:id=>get('nav').dispatch('click',{target:get('nav').children.find(n=>n.dataset.id===id)}),resize:width=>{window.innerWidth=context.innerWidth=width;window.dispatch('resize');}};
}
let groups=0;
function test(label,fn){fn();groups++;console.log('PASS',label);}
// The implementation-specific cases below execute the shipped bridge and iframe entry.
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
test('Actual CRM Back/Forward handlers close interrupted dialogs without adding history entries',()=>{
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
test('Entire original inline Backoffice program is byte-for-byte unchanged',()=>{
 const original=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).sort((a,b)=>b.length-a.length)[0];
 assert.equal(crypto.createHash('sha256').update(original).digest('hex'),'340933d3029764f13b37c3bc2fd70c71afa96bcba07a93d04bee08ed2ab4a990','Original financial and operational program changed since approved base 7f6b2a7');
});
test('CRM is a lazy-loaded Admin Backoffice section with stable shell and no duplicate navigation',()=>{
 const h=shell();assert.equal(h.get('crm').children.length,0);assert.equal(h.session(),null);
 h.login('admin');assert.equal(h.view(),'dashboard');assert.equal(h.get('crm').children.length,0);
 assert.equal(h.get('nav').children.filter(n=>n.dataset.id==='crm').length,1);
 h.clickNav('crm');assert.equal(h.view(),'crm');assert.equal(h.get('appView').getAttribute('data-crm-active'),'true');
 const frame=h.document.getElementById('crmWorkspaceFrame');assert.ok(frame);assert.equal(frame.src,'crm-demo.html?embedded=backoffice#patient/contacts');assert.equal(frame.getAttribute('referrerpolicy'),'no-referrer');assert.equal(h.window.location.hash,'#crm/patient/contacts');
 assert.equal(h.get('nav').children.find(n=>n.dataset.id==='crm').getAttribute('aria-current'),'page');assert.equal(h.get('crm').classList.contains('active'),true);assert.equal(h.get('dashboard').classList.contains('active'),false);assert.equal(h.get('appView').classList.contains('hidden'),false);
 h.clickNav('crm');assert.equal(h.get('crm').children.length,1);assert.equal(h.history.entries().length,2);
 const api=h.window.PulzzoCRMBackoffice;assert.equal(api.getContext(frame.contentWindow).section,'crm');assert.equal(api.getContext({}),null);assert.equal(api.navigate({},'#doctor/tasks'),false);assert.equal(api.sync({}),false);
 h.navigate('patients');assert.equal(h.view(),'patients');assert.equal(h.get('crm').children.length,0);assert.equal(h.document.getElementById('crmWorkspaceFrame'),null);assert.equal(api.getContext(frame.contentWindow),null);assert.equal(h.get('appView').getAttribute('data-crm-active'),null);assert.equal(h.window.location.hash,'#bo/patients');
 assert.equal(h.session().role,'admin');assert.ok(h.rendered.includes('Patients'));
});
function attachCRM(h){
 const frame=h.document.getElementById('crmWorkspaceFrame'),api=h.window.PulzzoCRMBackoffice;assert.ok(frame);
 let child;
 const embedding={actorId:api.getContext(frame.contentWindow).actorId,writeRoute(hash,replace){child.window.history.replaceState(null,'',hash);return api.navigate(child.window,hash,replace);}};
 child=uiHarness({hash:frame.src.slice(frame.src.indexOf('#')),embed:embedding,storage:h.window.localStorage});
 frame.contentWindow=child.window;child.window.crmDemoApp=child.app;assert.equal(api.sync(child.window),true);
 return child;
}
test('Parent owns CRM route history across tabs, contexts, BO sections, Back/Forward and modal interruption',()=>{
 const h=shell({role:'admin'});h.clickNav('crm');const child=attachCRM(h);
 child.app.navigate('doctor','tasks');assert.equal(h.window.location.hash,'#crm/doctor/tasks');assert.match(h.get('pageTitle').textContent,/Proveedores/);assert.equal(child.history.entries().length,1);
 child.app.navigate('doctor','dashboard');assert.equal(h.history.entries().length,4);assert.equal(child.history.entries().length,1);
 child.app.handlers.newContact();assert.equal(child.get('editorDialog').open,true);
 h.window.history.back();assert.equal(h.view(),'crm');assert.equal(child.app.state.view,'tasks');assert.equal(child.get('editorDialog').open,false);assert.equal(child.app.state.dialogHandler,null);assert.equal(h.history.entries().length,4);
 h.window.history.forward();assert.equal(child.app.state.view,'dashboard');assert.equal(child.history.entries().length,1);
 child.app.handlers.newContact();const epoch=child.app.state.intentEpoch;h.navigate('portfolio');assert.equal(child.get('editorDialog').open,false);assert.ok(child.app.state.intentEpoch>epoch);assert.equal(h.document.getElementById('crmWorkspaceFrame'),null);assert.equal(h.window.location.hash,'#bo/portfolio');assert.equal(h.session().role,'admin');
 h.window.history.back();assert.equal(h.view(),'crm');const returned=attachCRM(h);assert.equal(returned.app.state.type,'doctor');assert.equal(returned.app.state.view,'dashboard');assert.equal(h.history.entries().length,5);
 h.window.history.forward();assert.equal(h.view(),'portfolio');assert.equal(h.get('crm').children.length,0);assert.equal(h.get('nav').children.find(n=>n.dataset.id==='portfolio').getAttribute('aria-current'),'page');
});
test('Deep CRM login, role boundaries, exact child capability and logout/session invalidation',()=>{
 const h=shell({hash:'#crm/doctor/tasks/contact_123'});assert.equal(h.view(),'dashboard');assert.equal(h.get('crm').children.length,0);h.login('admin');assert.equal(h.view(),'crm');assert.equal(h.history.entries().length,1);assert.equal(h.window.location.hash,'#crm/doctor/tasks/contact_123');
 const child=attachCRM(h),api=h.window.PulzzoCRMBackoffice;assert.equal(child.app.state.selected,'contact_123');child.get('actorSelect').value='kam_luis';child.get('actorSelect').dispatch('change');assert.equal(child.app.state.actor.id,'kam_luis');assert.equal(api.getContext(child.window).actorId,'kam_luis');
 child.app.handlers.newContact();h.get('logoutBtn').dispatch('click');assert.equal(h.session(),null);assert.equal(h.get('appView').classList.contains('hidden'),true);assert.equal(h.get('loginView').classList.contains('hidden'),false);assert.equal(h.get('crm').children.length,0);assert.equal(child.get('editorDialog').open,false);assert.equal(api.getContext(child.window),null);assert.equal(api.navigate(child.window,'#patient/tasks'),false);
 h.window.history.back();h.window.history.forward();assert.equal(h.get('crm').children.length,0);
 h.login('admin');const fresh=attachCRM(h);assert.equal(fresh.app.state.actor.id,'kam_ana','CRM actor simulation resets on logout');h.evaluate('session=null');assert.equal(api.getContext(fresh.window),null);assert.equal(api.sync(fresh.window),false);assert.equal(api.navigate(fresh.window,'#doctor/dashboard'),false);
 for(const role of ['operations','risk','provider','readonly']){
  const denied=shell({hash:'#crm/doctor/tasks',role});assert.equal(denied.view(),'dashboard');assert.equal(denied.get('nav').children.some(n=>n.dataset.id==='crm'),false);assert.equal(denied.get('crm').children.length,0);assert.equal(denied.window.PulzzoCRMBackoffice.getContext({}),null);denied.navigate('crm');assert.equal(denied.view(),'dashboard');assert.equal(denied.get('crm').children.length,0);assert.equal(denied.session().role,role);
 }
});
test('Collapsed desktop shell and mobile drawer open/close/Escape preserve CRM route and dismiss child modal',()=>{
 const h=shell({role:'admin'});h.get('sidebarToggle').dispatch('click');assert.equal(h.get('appView').classList.contains('sidebar-collapsed'),true);h.clickNav('crm');const child=attachCRM(h);child.app.handlers.newContact();const route=h.window.location.hash;
 h.resize(390);assert.equal(h.get('sidebarToggle').hidden,true);assert.equal(h.get('sidebar').inert,true);h.get('mobileMenu').dispatch('click');assert.equal(h.get('sidebar').classList.contains('open'),true);assert.equal(h.get('main').inert,true);assert.equal(child.get('editorDialog').open,false);assert.equal(h.document.activeElement,h.get('sidebarClose'));assert.equal(h.window.location.hash,route);
 h.emit('keydown',{key:'Escape'});assert.equal(h.get('sidebar').classList.contains('open'),false);assert.equal(h.get('main').inert,false);assert.equal(h.document.activeElement,h.get('mobileMenu'));assert.equal(h.window.location.hash,route);
 h.get('mobileMenu').dispatch('click');h.clickNav('crm');assert.equal(h.get('sidebar').classList.contains('open'),false);assert.equal(h.get('main').inert,false);assert.equal(h.document.activeElement,h.get('mobileMenu'));assert.equal(h.get('crm').children.length,1);
 h.resize(1200);assert.equal(h.get('appView').classList.contains('sidebar-collapsed'),true);assert.equal(h.get('sidebar').inert,false);assert.equal(h.get('sidebarToggle').hidden,false);assert.equal(h.window.location.hash,route);
});
test('Direct CRM entry has one canonical replace redirect, cannot self-authorize and suppresses standalone boot',()=>{
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
 const direct=entry({hash:'#doctor/dashboard'}),target=new URL(direct.redirects[0],'https://demo.test/');const bo=shell({hash:target.hash,role:'admin'});assert.equal(bo.view(),'crm');assert.equal(bo.get('crm').children.length,1);assert.equal(bo.history.entries().length,1,'Canonical redirect followed by login never adds a return-to-standalone loop');
});
test('Actual embedded adapter accepts only recognized same-origin frame and uses parent-only history',()=>{
 const h=shell({role:'admin'});h.clickNav('crm');const frame=h.document.getElementById('crmWorkspaceFrame');
 const e=entry({hash:'#patient/contacts',search:'?embedded=backoffice',parentWindow:h.window,onWindow:child=>{frame.contentWindow=child;}});
 assert.equal(e.redirects.length,0);assert.equal(e.window.crmDemoEntryBlocked,undefined);assert.equal(e.document.documentElement.classList.contains('crm-embedded'),true);assert.equal(e.window.PulzzoCRMEmbedding.actorId,'kam_ana');
 const bridge=e.window.PulzzoCRMEmbedding;assert.equal(bridge.writeRoute('#doctor/tasks',false),true);assert.equal(e.window.location.hash,'#doctor/tasks');assert.equal(e.history.entries().length,1);assert.equal(h.window.location.hash,'#crm/doctor/tasks');assert.equal(h.history.entries().length,3);assert.doesNotThrow(()=>bridge.ready());
 const holder=new e.Element('a');holder.href='https://demo.test/asistido-demo.html#invite=fake';holder.setAttribute('href',holder.href);holder.closest=()=>holder;e.emit('click',{target:holder});assert.equal(holder.target,'_blank');assert.equal(holder.rel,'noopener noreferrer');
 h.get('logoutBtn').dispatch('click');const previous=e.window.location.hash;assert.equal(bridge.writeRoute('#patient/dashboard',false),false);assert.equal(e.window.location.hash,previous);assert.equal(h.get('crm').children.length,0);
});
test('Integration surface stays scoped and there are no wildcard cross-window messages or financial writes',()=>{
 const code=read('assets/js/backoffice-crm.js'),embed=read('assets/js/crm-demo-embed.js'),css=read('assets/css/backoffice-crm.css'),childCSS=read('assets/css/crm-demo-embed.css'),crmHTML=read('crm-demo.html');
 assert.match(html,/<section id="crm" class="view" aria-label="CRM"><\/section>/);assert.equal((html.match(/src="assets\/js\/backoffice-crm.js"/g)||[]).length,1);assert.doesNotMatch(html,/<a[^>]+href="crm-demo.html"/);
 assert.match(css,/#appView\[data-crm-active="true"\]/);assert.match(css,/#crmWorkspaceFrame\{[^}]*width:100%/);assert.match(childCSS,/\.crm-embedded \.app-shell\{display:block/);assert.match(childCSS,/\.app-header \.brand[^}]*display:none/);assert.match(childCSS,/@media\(max-width:680px\)/);
 assert.ok(crmHTML.indexOf('crm-demo-embed.js')<crmHTML.indexOf('crm-demo-ui.js'));assert.doesNotMatch(code+'\n'+embed,/postMessage\s*\(|localStorage\s*\.\s*setItem|\bpersist\s*\(|\.offer\s*=|\.application\s*=/);
 for(const filename of fs.readdirSync(root).filter(name=>name.endsWith('.html')&&name!=='backoffice.html'))assert.doesNotMatch(read(filename),/assets\/(?:js|css)\/backoffice-crm\./);
});
test('Browser Back into CRM dismisses real Backoffice modal and nested document review without committing',()=>{
 const h=shell({role:'admin'});h.clickNav('crm');h.navigate('patients');
 h.context.modal('<h3>Nota ficticia sin guardar</h3>');assert.equal(h.get('modalBackdrop').classList.contains('show'),true);assert.equal(h.get('appView').inert,true);
 h.window.history.back();assert.equal(h.view(),'crm');assert.equal(h.get('modalBackdrop').classList.contains('show'),false);assert.equal(h.get('appView').inert,false);assert.equal(h.evaluate('modalInertState.length'),0);assert.equal(h.document.activeElement,h.get('nav').children.find(n=>n.dataset.id==='crm'));
 h.window.history.forward();assert.equal(h.view(),'patients');h.evaluate("reviewContext={origin:{view:'patients',patientTab:'documentos',providerTab:'perfil'},focus:null};reviewNested=true;");h.context.modal('<h3>Corrección documental sin enviar</h3>');
 h.window.history.back();assert.equal(h.view(),'crm');assert.equal(h.get('modalBackdrop').classList.contains('show'),false);assert.equal(h.get('appView').inert,false);assert.equal(h.evaluate('reviewContext'),null);assert.equal(h.evaluate('reviewNested'),false);
});
test('Pagehide teardown followed by bfcache pageshow restores exactly one recognized CRM frame',()=>{
 const h=shell({hash:'#crm/doctor/tasks',role:'admin'}),child=attachCRM(h);child.get('actorSelect').value='kam_luis';child.get('actorSelect').dispatch('change');child.app.handlers.newContact();const route=h.window.location.hash,count=h.history.entries().length;
 h.window.dispatch('pagehide');assert.equal(h.get('crm').children.length,0);assert.equal(child.get('editorDialog').open,false);assert.equal(h.window.PulzzoCRMBackoffice.getContext(child.window),null);
 h.window.dispatch('pageshow',{persisted:true});assert.equal(h.view(),'crm');assert.equal(h.get('crm').children.length,1);assert.equal(h.window.location.hash,route);assert.equal(h.history.entries().length,count);const resumed=attachCRM(h);assert.equal(resumed.app.state.type,'doctor');assert.equal(resumed.app.state.view,'tasks');assert.equal(resumed.app.state.actor.id,'kam_luis');
 h.window.dispatch('pageshow',{persisted:true});assert.equal(h.get('crm').children.length,1);assert.equal(h.history.entries().length,count);
});
test('Portfolio payment drawer uses its existing close handler and cannot be interrupted while saving',()=>{
 const h=shell({role:'admin'});h.clickNav('crm');h.navigate('portfolio');
 vm.runInContext('let portfolioPaymentSession=null;function portfolioPaymentKeydown(){};',h.context);vm.runInContext(extract(read('assets/js/backoffice-portfolio-payment.js'),'portfolioClosePayment'),h.context);
 h.get('portfolioPaymentOverlay');h.get('appView').inert=true;h.evaluate("portfolioPaymentSession={saving:false,inertNodes:[{node:document.getElementById('appView'),wasInert:false}],bodyStyle:{overflow:''},scrollY:0};");
 h.window.history.back();assert.equal(h.view(),'crm');assert.equal(h.document.getElementById('portfolioPaymentOverlay'),null);assert.equal(h.evaluate('portfolioPaymentSession'),null);assert.equal(h.get('appView').inert,false);
 h.window.history.forward();h.get('portfolioPaymentOverlay');h.evaluate("portfolioPaymentSession={saving:true,inertNodes:[],bodyStyle:{},scrollY:0};");const entries=h.history.entries().length;
 h.window.history.back();assert.equal(h.view(),'portfolio');assert.equal(h.window.location.hash,'#bo/portfolio');assert.ok(h.document.getElementById('portfolioPaymentOverlay'));assert.equal(h.evaluate('portfolioPaymentSession.saving'),true);assert.equal(h.get('crm').children.length,0);assert.equal(h.history.entries().length,entries);
});
console.log(`PASS: ${groups} CRM-in-Backoffice integration groups. Actual handler/DOM/History tests; browser geometry, rendering and assistive-technology checks are separate.`);
