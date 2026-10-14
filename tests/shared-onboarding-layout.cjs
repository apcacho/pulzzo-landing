'use strict';
// Source + actual-handler VM coverage. Deliberately no browser/pixel assertions.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const patient=read('solicitud-paciente.html'),provider=read('assets/js/doctor-shared-onboarding.js');
const css=read('assets/css/shared-onboarding.css'),doctorCSS=read('assets/css/doctor-shared-onboarding.css');
const Shared=require('../assets/js/patient-onboarding.js');
function extract(name){
 const start=new RegExp('^(?:async )?function '+name+'\\(','m').exec(patient);assert.ok(start,name);
 for(let end=patient.indexOf('}',start.index);end>=0;end=patient.indexOf('}',end+1)){
  const source=patient.slice(start.index,end+1);try{new vm.Script('('+source+')');return source;}catch{}
 }
 throw Error('Cannot extract '+name);
}
function harness(holder=false){
 const nodes=new Map(),all=[],events={},messages=[],saves=[];
 function make(tag='div',id=''){
  const attrs={},classes=new Set(),el={tagName:tag.toUpperCase(),children:[],dataset:{},style:{},events:{},textContent:'',hidden:false,value:'',type:'',parent:null,
   setAttribute(key,value){attrs[key]=String(value);},getAttribute:key=>attrs[key]??null,removeAttribute(key){delete attrs[key];},hasAttribute:key=>key in attrs,
   appendChild(child){this.children.push(child);child.parent=this;return child;},prepend(child){this.children.unshift(child);child.parent=this;},
   before(child){const at=this.parent.children.indexOf(this);this.parent.children.splice(at,0,child);child.parent=this.parent;},
   addEventListener(type,fn){(this.events[type]??=[]).push(fn);},click(){for(const fn of this.events.click||[])fn({preventDefault(){}});},
   querySelectorAll(){return[];},querySelector(){return null;},closest(){return null;},
   classList:{add(...names){names.forEach(name=>classes.add(name));},remove(...names){names.forEach(name=>classes.delete(name));},contains:name=>classes.has(name),toggle(name,on){if(on===undefined)on=!classes.has(name);if(on)classes.add(name);else classes.delete(name);return on;}},
  };
  Object.defineProperty(el,'id',{get:()=>attrs.id||'',set:value=>{attrs.id=value;nodes.set(value,el);}});
  Object.defineProperty(el,'className',{get:()=>[...classes].join(' '),set:value=>{classes.clear();value.split(/\s+/).filter(Boolean).forEach(name=>classes.add(name));}});
  if(id)el.id=id;all.push(el);return el;
 }
 const body=make('body'),main=body.appendChild(make('main')),wrap=main.appendChild(make('div')),legacy=wrap.appendChild(make('header'));
 const password=wrap.appendChild(make('input','demo-password'));password.type='password';password.value='must-clear';
 wrap.className='app-wrap';legacy.className='app-head';
 const views=['geolocalizacion','procedimiento','estimacion','identidad','ingresos','documentos','autorizacion','portal'].map(view=>{const el=wrap.appendChild(make('section','view-'+view));el.className='panel module';return el;});
 const legacySteps=views.map(view=>{const el=legacy.appendChild(make('span'));el.dataset.step=view.id.replace('view-','');return el;});
 const docsActions=nodes.get('view-documentos').appendChild(make('div')),home=body.appendChild(make('a','back-home'));make('button','docsBtn');
 const identityCards=new Map(),identityActions=new Map(),cameras=[];
 for(const key of ['ineFront','ineBack','selfieVideo','proofAddress']){
  const card=nodes.get('view-identidad').appendChild(make('div'));card.dataset.doc=key;card.className='capture-card';identityCards.set(key,card);
  const actions=card.appendChild(make('div'));actions.className='capture-actions';identityActions.set(key,actions);
  const camera=make('button');camera.dataset.doc=key;camera.dataset.mode=key==='selfieVideo'?'video':'photo';camera.className='btn btn-primary camera-open ui-action-primary';camera.textContent=key==='selfieVideo'?'Grabar video':'Tomar foto';
  if(key==='proofAddress'){const upload=actions.appendChild(make('button'));upload.textContent='Subir archivo';actions.appendChild(camera);}else{actions.appendChild(camera);actions.appendChild(make('span'));}
  cameras.push(camera);const status=actions.appendChild(make('span',key+'Status'));status.textContent='Pendiente';status.className='doc-status';
  const input=card.appendChild(make('input',key+'Input'));input.type='file';
 }
 const auth=nodes.get('view-autorizacion');auth.querySelector=selector=>selector==='#preSubmitReferences'?nodes.get('preSubmitReferences'):null;
 const personalControls=['authCheckConsult','authCheckElectronic','authCheckValidity','sendNipBtn','confirmNipBtn','resendNipBtn','changeChannelBtn','nipInput'].map(id=>auth.appendChild(make(id.startsWith('authCheck')||id==='nipInput'?'input':'button',id)));
 const channel=auth.appendChild(make('button'));channel.dataset.authChannel='sms';personalControls.push(channel);
 const detail=auth.appendChild(make('button','authDetailToggle')),detailBox=auth.appendChild(make('div','authDetailBox'));detailBox.classList.add('hidden');
 const document={body,createElement:make,getElementById:id=>nodes.get(id)||null,addEventListener(type,fn){(events[type]??=[]).push(fn);},
  querySelector(selector){const key=selector.match(/^\[data-doc="([^"]+)"\]$/)?.[1];if(key)return identityCards.get(key)||null;return ({'.app-wrap':wrap,'.app-wrap > .app-head':legacy,'#view-documentos .actions':docsActions})[selector]||null;},
  querySelectorAll(selector){
   if(selector==='.camera-open')return cameras;
   if(selector==='[data-auth-channel]')return [channel];
   if(selector.startsWith('#view-autorizacion .auth-check'))return personalControls;
   if(selector==='#view-identidad input[type="file"],#view-documentos input[type="file"]')return [...identityCards.keys()].map(key=>nodes.get(key+'Input'));
   if(selector==='[data-shared-patient-view]')return all.filter(el=>el.dataset.sharedPatientView);
   if(selector==='#flowTimeline > span[data-step]')return legacySteps;
   if(selector==='input[type="password"]')return [password];
   if(selector==='.module')return views;
   if(selector==='[data-step="geolocalizacion"],[data-step="portal"]')return legacySteps.filter(el=>['geolocalizacion','portal'].includes(el.dataset.step));
   return [];
  }
 };
 const portal={holderIdentityFileComplete:()=>false,isAssistant:!holder,isHolder:holder,returnUrl:'backoffice.html#crm',reviewUrl:'asistido-demo.html?review=1'},state={lastView:'procedimiento'};
 const context={document,state,patientFromStorage:{email:'fiction@example.test'},sharedPatientCaptureInitialized:false,sharedPatientPendingFiles:0,
  window:{location:{href:'capture',hash:''},PulzzoPatientOnboarding:Shared,addEventListener(type,fn){(events[type]??=[]).push(fn);},scrollTo(){},confirm:()=>false},
  history:{replaceState(_a,_b,value){context.window.location.hash=value;}},
  getPatientPortalContext:()=>portal,isSharedPatientCapture:()=>true,PulzzoPatientDemo:{patientSubmitted:()=>false},selectedAuthChannel:()=> 'sms',syncAuthCheckboxClasses(){},updateNipTimer(){},updateAuthStatusUI(){},renderReferencesCard:()=>'<div>Original reference fields</div>',updateForm(){},
  saveState(){saves.push('save');},persistApplicationState(){saves.push('persist');},invalidateSharedPatientUploads(){},
  initGeoEvents(){},updateGeoUI(){},renderEstimate(){},showIdentitySubstep(){},restoreSharedPatientIdentityPreviews(){},updateDocumentsView(){},showValidationGuide(_view,message){messages.push(message);},console,
 };
 vm.createContext(context);for(const fn of ['isPersonalIdentityDocument','canCapturePatientIdentity','patientIdentityFileComplete','syncSharedPersonalIdentityStatus','initAuthUI','initAuthEvents','initializeSharedPatientCapture','showView','updateTimeline','returnToPatientReview'])vm.runInContext(extract(fn),context);
 return {context,portal,nodes,all,body,main,wrap,legacy,home,views,legacySteps,events,messages,saves,identityCards,identityActions,cameras,auth,personalControls,detail,detailBox};
}
for(const holder of [false,true]){
 const h=harness(holder);const originalActions=new Map([...h.identityActions].map(([key,area])=>[key,area.children.slice()]));h.context.initializeSharedPatientCapture();
 for(const [key,area]of h.identityActions){
  assert.deepEqual(area.children,originalActions.get(key),'native controls, spacer and status remain in original order');
  const camera=h.cameras.find(button=>button.dataset.doc===key),restricted=key!=='proofAddress';
  assert.equal(camera.hidden,false,'restricted native camera remains visible');assert.equal(camera.disabled,restricted&&!holder);
  if(restricted){assert.equal(h.nodes.get(key+'Input').disabled,!holder);assert.equal(h.nodes.get(key+'Status').textContent,holder?'Pendiente':'Pendiente: lo hace el paciente');}
 }
 assert.doesNotMatch(extract('initializeSharedPatientCapture'),/Adjuntar archivo ficticio|area\.prepend|selfieCopy/,'adapter must not insert a different button or change native selfie instructions');
 assert.equal(h.nodes.get('preSubmitReferences').parent,h.auth,'references stay in original authorization section');
 assert.equal(h.nodes.get('sharedPatientReferences'),undefined);assert.ok(h.personalControls.every(control=>control.disabled));
 h.detail.click();assert.equal(h.detailBox.classList.contains('hidden'),false,'read-only authorization detail remains accessible');
 assert.ok(h.body.classList.contains('crm-patient-onboarding'),'only shared initialization enables workspace styles');
 const shell=h.nodes.get('shared-patient-context'),status=h.nodes.get('sharedPatientSaveStatus');
 assert.equal(shell.getAttribute('aria-label'),'Contexto de captura compartida');assert.ok(shell.classList.contains('shared-capture-context'));
 assert.equal(h.wrap.children[0],h.legacy,'original heading remains first without a replacement banner');assert.equal(h.wrap.children.at(-1),shell,'role actions follow the original panels');
 assert.equal(h.nodes.get('sharedPatientTitle'),undefined,'no duplicate CRM heading');
 assert.equal(h.legacy.hidden,false);assert.equal(h.legacy.hasAttribute('inert'),false);assert.equal(h.legacy.getAttribute('aria-hidden'),null);
 assert.equal(h.nodes.get('demo-password').disabled,true);assert.equal(h.nodes.get('demo-password').value,'');
 assert.equal(status.getAttribute('role'),'status');assert.equal(status.getAttribute('aria-live'),'polite');
 const details=h.all.find(el=>el.tagName==='DETAILS');assert.ok(details);assert.equal(details.hasAttribute('open'),false);
 assert.match(details.children[1].textContent,/máximo 5 MiB por archivo y 25 MiB/);
 const tabs=h.all.filter(el=>el.dataset.sharedPatientView),expected=['geolocalizacion','procedimiento','estimacion','identidad','ingresos','documentos','autorizacion'];
 assert.deepEqual(tabs.map(el=>el.dataset.sharedPatientView),expected);
 assert.ok(tabs.every(el=>h.legacySteps.includes(el)),'shared navigation reuses native timeline elements');
 assert.equal(h.all.filter(el=>el.tagName==='NAV').length,0,'no parallel CRM navigation');
 assert.equal(h.all.filter(el=>el.classList.contains('shared-capture-return')).length,1);
 assert.equal(h.all.find(el=>el.classList.contains('shared-capture-badge')).textContent,holder?'Captura del titular':'Captura asistida');
 for(const tab of [...tabs,tabs[0],tabs[0]]){
  tab.click();const name=tab.dataset.sharedPatientView;
  assert.equal(h.context.state.lastView,name);assert.equal(h.context.window.location.hash,'#'+name);
  assert.equal(h.views.filter(el=>el.classList.contains('active')).length,1);assert.ok(h.nodes.get('view-'+name).classList.contains('active'));
  assert.equal(tabs.filter(el=>el.getAttribute('aria-current')==='step').length,1);assert.equal(tab.getAttribute('aria-current'),'step');
  assert.ok(tab.classList.contains('active'));assert.equal(tab.getAttribute('aria-controls'),'view-'+name);
  assert.equal(tab.getAttribute('role'),'button');assert.equal(tab.tabIndex,0);
  for(const key of ['Enter',' ']){let prevented=false;tab.events.keydown[0]({key,preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(h.context.state.lastView,name);}
 }
 for(const forbidden of ['portal']){
  h.context.showView('#'+forbidden);assert.equal(h.context.state.lastView,'geolocalizacion');
  const hidden=h.nodes.get('view-'+forbidden);assert.equal(hidden.hidden,true);assert.ok(hidden.hasAttribute('inert'));assert.equal(hidden.classList.contains('active'),false);
 }
 const back=h.all.find(el=>el.classList.contains('shared-capture-return'));
 h.context.sharedPatientPendingFiles=1;const savesBefore=h.saves.length;back.click();assert.equal(h.context.window.location.href,'capture');assert.equal(h.saves.length,savesBefore);assert.match(h.messages.at(-1),/termine de guardarse/);
 h.context.sharedPatientPendingFiles=0;back.click();assert.equal(h.context.window.location.href,holder?h.portal.reviewUrl:h.portal.returnUrl);assert.equal(h.saves.at(-1),'save');
 h.context.window.location.href='capture';h.context.saveState=()=>{throw Error('Sesión vencida');};back.click();assert.equal(h.context.window.location.href,'capture','cancel save failure keeps capture open');
 h.context.window.confirm=()=>true;back.click();assert.equal(h.context.window.location.href,holder?'asistido-demo.html?login=1&kind=patient':h.portal.returnUrl,'confirmed recovery keeps exact holder/assistant destination');
}
// Shared context does not hide or replace the native form/heading/timeline.
assert.match(css,/body\.crm-patient-onboarding \[hidden\]\{display:none!important\}/);
assert.doesNotMatch(css,/body\.crm-patient-onboarding \.(?:app-shell|app-wrap|module|panel|capture-card|capture-actions|field|option|navbar)(?:[\s.{>:]|$)/,'adapter cannot override native form geometry');
let reviewedDoctorCSS=doctorCSS;
for(const rule of [
 'body.crm-doctor-onboarding:not(.profile-mode) .auth-wrap{grid-template-columns:minmax(0,1fr)!important}',
 'body.crm-doctor-onboarding:not(.profile-mode) .auth-wrap{max-width:780px!important}'
]){assert.equal(reviewedDoctorCSS.split(rule).length,2,'only the reviewed omission of the marketing column');reviewedDoctorCSS=reviewedDoctorCSS.replace(rule,'');}
assert.doesNotMatch(reviewedDoctorCSS,/\.(?:auth-copy|auth-bg|auth-card|auth-wrap|profile-panel)(?:[\s.{>:]|$)/,'no other override of native card, field or panel geometry');
assert.match(css,/:focus-visible/);
assert.doesNotMatch(extract('initializeSharedPatientCapture'),/legacyHeading|shared-capture-nav|shared-capture-title/);
const credentialRuntime={isSharedPatientCapture:()=>true};vm.createContext(credentialRuntime);vm.runInContext(extract('renderFieldBlock'),credentialRuntime);
assert.doesNotMatch(credentialRuntime.renderFieldBlock({id:'secret'}),/<input|password/i);
// Execute the provider's shipped current-section updater across repeated hash changes.
const providerNavSource=provider.match(/function syncSharedNav\(\)\{[\s\S]*?\n    \}/)?.[0];assert.ok(providerNavSource);
const providerLinks=['basic','profile'].map(kind=>{const attributes={},classes=new Set();return {kind,style:{},hasAttribute:name=>name==='data-shared-'+kind,setAttribute(name,value){attributes[name]=value;},removeAttribute(name){delete attributes[name];},getAttribute:name=>attributes[name]??null,classList:{toggle(name,active){if(active)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)}};});
const providerRuntime={doc:{querySelector:()=>null},root:{location:{hash:''}},banner:{querySelectorAll:()=>providerLinks}};vm.createContext(providerRuntime);vm.runInContext(providerNavSource,providerRuntime);
for(const hash of ['','#datos-medicos','#perfil-medico','#perfil-medico','#datos-medicos']){
 providerRuntime.root.location.hash=hash;providerRuntime.syncSharedNav();
 const current=providerLinks.find(link=>link.kind===(hash==='#datos-medicos'?'basic':'profile'));
 assert.equal(current.hidden,true,'the current screen is not repeated as a second navigation action');
 assert.equal(providerLinks.filter(link=>!link.hidden).length,1,'one continuation link remains');
 assert.equal(providerLinks.find(link=>link!==current).style.display,'');
}
// Scope and static UI contracts complement handler tests; they cannot prove geometry.
assert.equal(patient.split('href="assets/css/shared-onboarding.css"').length-1,1);
assert.match(doctorCSS,/@import url\('\.\/shared-onboarding\.css'\)/);
assert.doesNotMatch(css,/\.app-wrap > \.app-head[^}]*display:none/);
assert.doesNotMatch(doctorCSS,/\.profile-hero[^}]*display:none/);
assert.match(provider,/shared-doctor-banner shared-capture-context/);
assert.doesNotMatch(provider,/shared-capture-shell|shared-capture-title|shared-capture-nav/);
assert.match(provider,/class="shared-capture-return ui-action-secondary" data-shared-return/);
assert.match(provider,/syncSharedNav/);assert.match(provider,/link\.hidden=current/);assert.match(provider,/removeAttribute\('aria-current'\)/);
for(const name of ['shared-capture-top','shared-capture-routes','shared-capture-status'])assert.ok(provider.includes(name),name);
for(const file of ['assets/css/shared-onboarding.css','assets/css/doctor-shared-onboarding.css']){
 const output=require('esbuild').transformSync(read(file),{loader:'css',logLevel:'silent'});assert.deepEqual(output.warnings,[]);
}
console.log('PASS: native patient form geometry and role-safe controls with shared context contracts; actual patient shell, seven-section/current-state navigation, provider hash/current-state navigation, repeated navigation, personal-only exclusions, pending-upload save/return and stale-save recovery. Browser pixels unverified.');
