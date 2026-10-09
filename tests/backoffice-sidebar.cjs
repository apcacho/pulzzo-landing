'use strict';
// Executes shipped presentation/drawer code in DOM stubs. This is not browser QA.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'backoffice.html'),'utf8');
const js=fs.readFileSync(path.join(root,'assets/js/backoffice-sidebar.js'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/css/backoffice-sidebar.css'),'utf8');
const key='pulzzo.backoffice.sidebar.collapsed';
function runtime({saved,width=1200,failRead=false,failWrite=false}={}){
 const elements=new Map(),storage=new Map(saved===undefined?[]:[[key,saved]]),listeners={window:{},document:{}};
 const document={activeElement:null,addEventListener(type,fn){(listeners.document[type]??=[]).push(fn)},getElementById:id=>el(id)};
 function el(id){
  if(!elements.has(id)){
   const classes=new Set(),handlers={};
   const node={id,attributes:{},hidden:false,inert:false,style:{},firstElementChild:{textContent:''},handlers,dataset:{},
    classList:{toggle(c,on){if(on)classes.add(c);else classes.delete(c)},contains:c=>classes.has(c),add:c=>classes.add(c),remove:c=>classes.delete(c)},
    setAttribute(k,v){this.attributes[k]=v},getAttribute(k){return this.attributes[k]},
    addEventListener(t,fn){(handlers[t]??=[]).push(fn)},focus(){document.activeElement=this},
    contains(node){return node===this||(id==='sidebar'&&['sidebarToggle','sidebarClose','logoutBtn','nav1','nav2'].includes(node?.id))},
    closest(){return ['nav1','nav2','logoutBtn'].includes(id)?this:null},
    getBoundingClientRect(){return id==='sidebarTooltip'?{width:240,height:40}:{right:66,top:100,height:44}}
   };elements.set(id,node);
  }return elements.get(id);
 }
 const window={innerWidth:width,innerHeight:800,addEventListener(type,fn){(listeners.window[type]??=[]).push(fn)}};
 const context=vm.createContext({window,document,innerWidth:width,localStorage:{getItem(k){if(failRead)throw Error('blocked');return storage.get(k)??null},setItem(k,v){if(failWrite)throw Error('quota');storage.set(k,v)}},$:s=>el(s.replace(/^#/,'')),$$:()=>[el('sidebarToggle'),el('sidebarClose'),el('nav1'),el('nav2'),el('logoutBtn')],setTimeout,clearTimeout});
 vm.runInContext(html.slice(html.indexOf('function setSidebarOpen('),html.indexOf('function initApp()')),context);
 vm.runInContext(js,context);
 const emit=(node,type,event={})=>(node.handlers[type]||[]).forEach(fn=>fn(event));
 const global=(where,type,event={})=>(listeners[where][type]||[]).forEach(fn=>fn(event));
 const resize=w=>{window.innerWidth=context.innerWidth=w;global('window','resize')};
 return {el,storage,context,document,emit,global,resize,collapsed:()=>el('appView').classList.contains('sidebar-collapsed'),click:()=>emit(el('sidebarToggle'),'click')};
}
let count=0;function test(label,fn){fn();count++;console.log('PASS',label)}
test('Expanded default, malformed preferences, desktop restore and repeat toggles',()=>{
 for(const saved of [undefined,'false','invalid','1','TRUE'])assert.equal(runtime({saved}).collapsed(),false);
 const r=runtime();assert.equal(r.el('sidebarToggle').attributes['aria-expanded'],'true');
 r.el('sidebarToggle').focus();r.click();assert.equal(r.collapsed(),true);assert.equal(r.storage.get(key),'true');assert.equal(r.el('sidebarToggle').attributes['aria-label'],'Expandir menú lateral');assert.equal(r.el('sidebarToggle').attributes['aria-expanded'],'false');assert.equal(r.document.activeElement,r.el('sidebarToggle'));
 assert.equal(runtime({saved:r.storage.get(key)}).collapsed(),true);r.click();assert.equal(r.storage.get(key),'false');assert.equal(r.collapsed(),false);
});
test('Read/write storage failures never block an in-session toggle',()=>{
 const r=runtime({failRead:true,failWrite:true});assert.equal(r.collapsed(),false);assert.doesNotThrow(()=>r.click());assert.equal(r.collapsed(),true);r.click();assert.equal(r.collapsed(),false);
 const restored=runtime({saved:'true',failWrite:true});restored.click();assert.equal(restored.collapsed(),false);assert.equal(restored.storage.get(key),'true');
});
test('Mobile initialization preserves desktop preference, full drawer and focus trap',()=>{
 const r=runtime({saved:'true',width:390});assert.equal(r.collapsed(),true);assert.equal(r.el('sidebarToggle').hidden,true);assert.equal(r.el('sidebar').inert,true);r.click();assert.equal(r.storage.get(key),'true');
 r.context.setSidebarOpen(true);assert.equal(r.el('sidebar').inert,false);assert.equal(r.el('.main').inert,true);assert.equal(r.document.activeElement,r.el('sidebarClose'));
 let prevented=false;r.el('logoutBtn').focus();r.global('document','keydown',{key:'Tab',preventDefault(){prevented=true}});assert.equal(prevented,true);assert.equal(r.document.activeElement,r.el('sidebarClose'));
 r.global('document','keydown',{key:'Tab',shiftKey:true,preventDefault(){}});assert.equal(r.document.activeElement,r.el('logoutBtn'));
 r.global('document','keydown',{key:'Escape'});assert.equal(r.el('sidebar').inert,true);assert.equal(r.el('.main').inert,false);assert.equal(r.document.activeElement,r.el('mobileMenu'));assert.equal(r.el('mobileMenu').attributes['aria-expanded'],'false');
});
test('Viewport crossings clear drawer state and restore visible keyboard focus',()=>{
 const r=runtime({saved:'true'});r.el('sidebarToggle').focus();r.resize(820);assert.equal(r.document.activeElement,r.el('mobileMenu'));assert.equal(r.el('sidebar').inert,true);assert.equal(r.el('sidebarToggle').hidden,true);
 r.context.setSidebarOpen(true);r.resize(821);assert.equal(r.document.activeElement,r.el('sidebarToggle'));assert.equal(r.el('sidebar').inert,false);assert.equal(r.el('.main').inert,false);assert.equal(r.el('sidebarShade').classList.contains('open'),false);assert.equal(r.collapsed(),true);
 r.el('nav1').focus();r.resize(700);assert.equal(r.document.activeElement,r.el('mobileMenu'));r.resize(1200);assert.equal(r.document.activeElement,r.el('sidebarToggle'));
 r.el('appView').classList.add('hidden');r.el('loginEmail').focus();r.resize(400);assert.equal(r.document.activeElement,r.el('loginEmail'));
});
test('Collapsed hover/focus labels are bounded and dismissed on Escape/navigation/scroll',()=>{
 const r=runtime({saved:'true'}),nav=r.el('nav1'),tip=r.el('sidebarTooltip');nav.setAttribute('aria-label','Solicitudes de doctores y clínicas');
 for(const type of ['mouseover','focusin']){r.emit(r.el('sidebar'),type,{target:nav});assert.equal(tip.hidden,false);assert.equal(tip.textContent,nav.attributes['aria-label']);assert.equal(tip.style.left,'76px');r.global('document','keydown',{key:'Escape'});assert.equal(tip.hidden,true);}
 for(const type of ['click','scroll','focusout']){r.emit(r.el('sidebar'),'focusin',{target:nav});r.emit(r.el('sidebar'),type);assert.equal(tip.hidden,true);}
 r.click();r.emit(r.el('sidebar'),'mouseover',{target:nav});assert.equal(tip.hidden,true);
 r.resize(390);r.emit(r.el('sidebar'),'focusin',{target:nav});assert.equal(tip.hidden,true);
});
test('Native toggle, labeled icons, aria-current mapping and role filtering are retained',()=>{
 assert.match(html,/<button type="button" class="sidebar-toggle" id="sidebarToggle" aria-controls="sidebar" aria-expanded="true" aria-label="Contraer menú lateral">/);
 assert.match(html,/navItems.filter\(n=>n.roles.includes\(session.role\)\)/);
 assert.match(html,/data-id="\$\{n.id\}" aria-label="\$\{n.label\}" aria-current=/);
 assert.match(html,/class="nav-icon" aria-hidden="true"/);
 const r=runtime(),script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m=>m[1].includes('const navItems='))[1];
 const navSource=script.slice(script.indexOf('const navItems='),script.indexOf('const permissions='));
 const renderSource=script.slice(script.indexOf('function renderNav('),script.indexOf('\nfunction render(){'));
 vm.runInContext(navSource+"\nlet session={role:'provider'},currentView='providers';\n"+renderSource,r.context);
 r.context.renderNav();const out=r.el('nav').innerHTML;assert.match(out,/data-id="providers" aria-label="Doctores y clínicas" aria-current="page"/);assert.doesNotMatch(out,/data-id="patients"|data-id="settings"/);
 // Exercise the actual route-to-navigation mapping, while stubbing only rendering.
 const setView=html.slice(html.indexOf('function setView('),html.indexOf('\nfunction bootLogin'));
 r.context.$$=selector=>selector==='.nav-btn'?[r.el('nav1'),r.el('nav2')]:[];r.el('nav1').dataset.id='documents';r.el('nav2').dataset.id='patients';
 vm.runInContext("let correctionReturnContext=null;function render(){};\n"+setView,r.context);
 r.context.setView('corrections');assert.equal(r.el('nav1').attributes['aria-current'],'page');assert.equal(r.el('nav2').attributes['aria-current'],'false');r.context.setView('offers');assert.equal(r.el('nav2').attributes['aria-current'],'page');
});
test('Desktop logo/toggle clearance increases without changing rail or touch-target sizes',()=>{
 const desktop=css.slice(css.indexOf('@media(min-width:821px){'),css.indexOf('@media(min-width:821px) and (pointer:coarse)'));
 const toggle=desktop.match(/#sidebar \.sidebar-toggle\{([^}]+)\}/)[1];
 const collapsed=desktop.match(/#appView.sidebar-collapsed \.sidebar-toggle\{([^}]+)\}/)[1];
 // Absolute desktop toggle moves 8px toward the edge; collapsed flow adds 8px below it.
 // These inspect the shipped CSS contract, not browser-measured geometry.
 assert.match(toggle,/position:absolute/);assert.match(toggle,/right:10px/);assert.match(toggle,/top:24px/);
 assert.match(toggle,/width:36px;min-height:36px/);assert.match(toggle,/margin:0 0 4px/);
 assert.match(collapsed,/position:static/);assert.match(collapsed,/align-self:center/);assert.match(collapsed,/margin-bottom:12px/);
 assert.match(desktop,/#appView.sidebar-collapsed\{grid-template-columns:80px minmax\(0,1fr\)\}/);
 assert.match(desktop,/#appView.sidebar-collapsed \.side-brand\{justify-content:center;padding:4px 0 20px\}/);
 assert.match(css,/@media\(min-width:821px\) and \(pointer:coarse\)\{#sidebar \.sidebar-toggle\{width:44px;min-height:44px\}\}/);
 assert.match(css,/#sidebar \.sidebar-toggle\{display:none;/);
});
test('Styles are desktop-only, touch-aware, scroll-safe and isolated from portals/tabs',()=>{
 assert.match(css,/@media\(min-width:821px\)/);assert.match(css,/#appView.sidebar-collapsed\{grid-template-columns:80px minmax\(0,1fr\)\}/);assert.match(css,/pointer:coarse/);assert.match(css,/min-height:44px/);assert.match(css,/clip-path:inset\(50%\)/);assert.match(css,/forced-colors:active/);assert.doesNotMatch(css,/\.tabs?\b|\.topbar/);
 for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.html')&&f!=='backoffice.html'))assert.doesNotMatch(fs.readFileSync(path.join(root,file),'utf8'),/backoffice-sidebar/);
 assert.equal((html.match(/id="sidebarTooltip"/g)||[]).length,1);assert.equal((html.match(/src="assets\/js\/backoffice-sidebar.js"/g)||[]).length,1);
});
console.log(`PASS: ${count} sidebar regression groups. Source/DOM/VM only; browser geometry, keyboard and screen-reader QA remain unrun.`);
