'use strict';
// Full-audit lifecycle regressions execute shipped controls; not a browser/pixel test.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const Context=require('../assets/js/doctor-publication-context.js');
const decode=s=>String(s||'').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
function harness(){
 const state={doctorAccountId:'DOC-A',demoProviderId:'MED-A',submitted:true,profile:{name:'Ana Demo',prefix:'Dra.',email:'ana@example.test',state:'Yucatán',city:'Mérida'},specialties:['Cirugía plástica'],procedures:['Rinoplastia'],fiscal:{rfc:'PRIVATE',clabe:'BANK'},files:{},links:{instagram:'@wrong'}};
 const data=new Map([['pulzzo_doctor',JSON.stringify({doctorAccountId:'DOC-A',correo:'ana@example.test'})],['pulzzo_doctor_verified','true'],['pulzzoDoctorOnboardingCleanV3',JSON.stringify(state)],[Context.BO_KEY,JSON.stringify({patients:[],providers:[{id:'MED-A',doctorAccountId:'DOC-A',onboarding:{approved:true}}]})]]),nodes=new Map(),listeners={},fileReaders=[],images=[];
 const originalAccount=data.get('pulzzo_doctor'),originalState=data.get('pulzzoDoctorOnboardingCleanV3');
 class Node{
  constructor(id){this.id=id;this.events={};this.dataset={};this.value='';this.checked=false;this.disabled=false;this.open=false;this.textContent='';this.attrs={};this.classList={toggle(){},contains(){return false;}};}
  addEventListener(type,fn){this.events[type]=fn;}setAttribute(k,v){this.attrs[k]=v;}matches(){return !!this.dataset.publicationField;}
  querySelector(q){return q==='details'?nodes.get('details'):null;}querySelectorAll(){return [...nodes.values()].filter(n=>n.dataset.publicationField);}
  set innerHTML(v){this.html=v;if(this.id!=='doctor-publication-holder')return;const open=nodes.get('details')?.open;for(const k of [...nodes.keys()])if(k!=='doctor-publication-holder')nodes.delete(k);const details=new Node('details');details.open=/class="publication-panel" open/.test(v);nodes.set('details',details);for(const m of v.matchAll(/<(input|textarea|button|form|div|p|label)\b([^>]*\bid="([^"]+)"[^>]*)>([^<]*)/g)){const [,tag,attrs,id,content]=m,n=new Node(id);n.disabled=/\sdisabled(?:\s|$)/.test(attrs);n.value=decode(attrs.match(/\bvalue="([^"]*)"/)?.[1]||(tag==='textarea'?content:''));n.dataset.publicationField=attrs.match(/data-publication-field="([^"]*)"/)?.[1];n.textContent=decode(content);nodes.set(id,n);}}
  get innerHTML(){return this.html||'';}
 }
 nodes.set('doctor-publication-holder',new Node('doctor-publication-holder'));
 const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
 const document={readyState:'loading',getElementById:id=>nodes.get(id)||null,addEventListener(){}};
 const root={document,atob:s=>Buffer.from(s,'base64').toString('binary'),localStorage:storage,PulzzoDoctorPublicationContext:Context,addEventListener:(type,fn)=>(listeners[type]??=[]).push(fn),dispatchEvent:e=>(listeners[e.type]||[]).forEach(fn=>fn(e)),CustomEvent:class{constructor(type){this.type=type;}},confirm:()=>true,Image:class{constructor(){this.naturalWidth=1;this.naturalHeight=1;images.push(this);}set src(v){this._src=v;if(root.deferImages)return;if(root.invalidImage)this.onerror();else this.onload();}},FileReader:class{constructor(){fileReaders.push(this);}readAsDataURL(file){this.result=file.dataUrl;if(!root.deferFile)this.onload();}},PulzzoDoctorDemoBridge:{account:()=>data.get('pulzzo_doctor')===originalAccount?{doctorAccountId:'DOC-A'}:null,getState:()=>JSON.parse(data.get('pulzzoDoctorOnboardingCleanV3')),refresh(){}}};
 const ctx=vm.createContext({window:root,console,URL,Date,Math,Uint8Array,atob:s=>Buffer.from(s,'base64').toString('binary'),setTimeout,clearTimeout});
 for(const file of ['doctor-publication-context.js','doctor-publication.js','doctor-publication-ui.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js',file),'utf8'),ctx);
 root.PulzzoDoctorPublicationUI.mount();return {ctx,root,data,nodes,storage,originalState,fileReaders,images,node:id=>nodes.get(id),tick:()=>new Promise(resolve=>setImmediate(resolve)),snapshot:()=>root.PulzzoDoctorPublication.createStore({storage,actor:{id:'DOC-A',role:'holder'}}).snapshot()};
}

const Core=require('../assets/js/doctor-publication.js');
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgKOgBAAFwAP0jhY/jAAAAAElFTkSuQmCC';
const PHOTO={dataUrl:'data:image/png;base64,'+PNG,type:'image/png',size:Buffer.from(PNG,'base64').length,name:'fictitious.png'};
function draft(h,photo=null){
 const store=h.root.PulzzoDoctorPublication.createStore({storage:h.storage,actor:{id:'DOC-A',role:'holder'}});
 vm.runInContext('window.PulzzoDoctorPublication.createStore({storage:window.localStorage,actor:{id:\'DOC-A\',role:\'holder\'}}).saveDraft(\'MED-A\','+JSON.stringify({displayName:'Ana Demo',specialty:'Consulta demo',city:'Mérida',state:'Yucatán',photo})+','+store.snapshot().revision+')',h.ctx);
 h.root.PulzzoDoctorPublicationUI.renderHolder();return store;
}
function current(h){return h.snapshot().profiles['MED-A'].versions.at(-1);}
function consent(h){const box=h.node('publication-consent');box.checked=true;box.events.change({target:box});return h.node('publication-confirm').events.click();}
function hide(h){h.root.dispatchEvent({type:'pagehide',persisted:true});}
function restore(h){h.root.dispatchEvent({type:'pageshow',persisted:true});}
function finishImage(h,index=0){h.images[index].naturalWidth=1;h.images[index].naturalHeight=1;h.images[index].onload();}
function boHarness(h){
 const nodes=new Map(),images=[],listeners={},get=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',classList:{show:false,contains(){return this.show;},add(){this.show=true;},remove(){this.show=false;}}});return nodes.get(id);};
 const sandbox={console,URL,Buffer,Image:class{constructor(){images.push(this);}set src(v){this.source=v;}},addEventListener:(t,f)=>(listeners[t]??=[]).push(f),currentView:'providers',providerMode:'detail',selectedProviderId:'MED-A',localStorage:h.storage,session:null,db:JSON.parse(h.storage.getItem(Context.BO_KEY)),DEMO_STORAGE_KEY:Context.BO_KEY,providerFieldLabels:{website:'Sitio web'},providerLinksHtml:()=>'',providerIsApproved:p=>p.onboarding?.approved,servicingOfficeAssertCurrent:()=>{},renderProviderDetail:()=>{},renderProviderList:()=>{},toast:t=>sandbox.lastToast=t,document:{getElementById:get,addEventListener:(t,f)=>(listeners['doc:'+t]??=[]).push(f)},modal:html=>{get('modalBackdrop').classList.add('show');get('publicationDialog').innerHTML=html;},closeModal:()=>get('modalBackdrop').classList.remove('show')};
 sandbox.window=sandbox;vm.createContext(sandbox);require('./fixtures/staff-session.cjs')(sandbox);sandbox.session=sandbox.testStaffSession('admin');for(const file of ['doctor-publication-context.js','doctor-publication.js','doctor-publication-backoffice.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js',file),'utf8'),sandbox,{filename:file});
 return {sandbox,images,get,open:a=>sandbox.PulzzoDoctorPublicationBO.open(a,'MED-A'),commit:()=>listeners['doc:click'].forEach(f=>f({preventDefault(){},target:{closest:()=>({dataset:{publicationAction:'commit'}})}})),event:(t,e={})=>(listeners[t]||[]).forEach(f=>f({type:t,...e}))};
}

const doctorSource=fs.readFileSync(path.join(__dirname,'../registro-doctor.html'),'utf8');
function doctorHarness(seed={}){
 const data=new Map(Object.entries(seed).map(([k,v])=>[k,typeof v==='string'?v:JSON.stringify(v)])),nodes=new Map(),selectors=new Map(),listeners={window:[],document:[]};
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',style:{},dataset:{},events:{},classList:{toggle(){},add(){},remove(){},contains(){return false}},setAttribute(){},querySelector(){return null},querySelectorAll(){return []},insertAdjacentHTML(_pos,html){this.innerHTML=html+this.innerHTML},addEventListener(type,fn){this.events[type]=fn;}});return nodes.get(id)};
 const ctx={console,JSON,Date,Array,Object,Number,String,Set,Map,location:{hash:''},norm:s=>String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''),especialidadesLabels:{},procedimientosData:[],window:{location:{href:''},addEventListener(type,fn){listeners.window.push([type,fn]);},scrollTo(){}},document:{body:node('body'),getElementById:node,querySelector:()=>null,querySelectorAll:q=>selectors.get(q)||[],addEventListener(type,fn){listeners.document.push([type,fn]);}},localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},setTimeout(){}};
 let script=doctorSource.match(/<script id="doctor-profile-integrated-script">([\s\S]*?)<\/script>/)[1];
 script=script.replace('  syncProfileMode();\n})();','  globalThis.testProfile={getState,renderProfile,setProfileState,syncProfileMode,bindProfileDataInputs,openProfileRequestModal,closeProfileRequestModal,handleProfileRequestModalKey,openProfileDoc,closeProfileDoc,handleProfileDocModalKey,bindProfileDocModal,updateProfilePhotoFromFile,persistProfilePhoto,openProfilePhotoCamera,closeProfilePhotoCamera,tab:t=>{activeTab=t;renderProfile()}};\n  syncProfileMode();\n})();');
 vm.createContext(ctx);vm.runInContext(script,ctx);return {ctx,data,node,selectors,listeners};
}
function legacyDoctor(){
 const h=doctorHarness({pulzzo_doctor:{doctorAccountId:'DOC-A',correo:'demo@example.test'},pulzzo_doctor_verified:'true',pulzzoDoctorOnboardingCleanV3:{doctorAccountId:'DOC-A',profile:{email:'demo@example.test'},profilePhotoData:'data:image/png;base64,b2xk',submitted:false}});
 const requests=[],streams=[],readers=[];h.ctx.navigator={mediaDevices:{getUserMedia:()=>new Promise((resolve,reject)=>requests.push({resolve,reject}))}};
 h.ctx.FileReader=function(){readers.push(this);this.readAsDataURL=()=>{}};
 h.node('profileCameraVideo').play=()=>Promise.resolve();
 h.node('profileCameraModal').classList={open:false,add(){this.open=true;},remove(){this.open=false;},contains(){return this.open;}};
 h.node('profilePhotoCameraInput').click=()=>{h.fallbacks=(h.fallbacks||0)+1;};
 h.event=(type,e={})=>h.listeners.window.filter(([t])=>t===type).forEach(([,fn])=>fn(e));
 h.resolveCamera=index=>{const stream={stopped:false,getTracks:()=>[{stop:()=>{stream.stopped=true;}}]};streams.push(stream);requests[index].resolve(stream);return stream;};
 return Object.assign(h,{requests,streams,readers});
}


function holderDocumentSubmit(kind='patient'){
 const source=fs.readFileSync(path.join(__dirname,'../assets/js/crm-holder-ui.js'),'utf8'),start=source.indexOf("var submitDocument=document.getElementById('submitDocumentCorrection')"),end=source.indexOf("var submit=document.getElementById('submitExp')",start);
 assert.ok(start>=0&&end>start,'Shipped document submit handler must be present');
 let release;const descriptor={id:'EVIDENCE1',actorId:'KAM1',size:100,mimeType:'application/pdf'},nodes={submitDocumentCorrection:{disabled:false},documentCorrectionConfirm:{checked:true},documentCorrectionCapacity:{value:'authorized_representative'},documentCorrectionAuthority:{checked:true}},calls=[],messages=[];
 const ctx={document:{getElementById:id=>nodes[id]},actor:{id:'HOLDER1'},expId:'EXP1',sessionEpoch:1,viewRevision:7,kind,exp:{contactId:'CONTACT1',documentCorrectionDraft:{descriptor}},evidence:{get:()=>new Promise(resolve=>{release=resolve;})},api:{submitDocumentCorrection:(...args)=>{calls.push(args);return {ok:true};}},render(){},toast:message=>messages.push(message),error:()=>assert.fail('Unexpected API error')};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
 return {ctx,nodes,calls,messages,finish:patch=>release({...descriptor,contactId:'CONTACT1',...patch}),click:()=>nodes.submitDocumentCorrection.onclick()};
}

let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e.message);}}
(async()=>{
 await test('holder consent cannot finish after pagehide or BFCache restoration',async()=>{
  for(const restored of [false,true]){
   const h=harness();draft(h,PHOTO);h.root.deferImages=true;const before=h.storage.getItem(Core.STORAGE_KEY),pending=consent(h);
   assert.equal(h.images.length,1);hide(h);if(restored)restore(h);finishImage(h);await pending;await h.tick();
   assert.equal(h.storage.getItem(Core.STORAGE_KEY),before,'Deferred consent must not commit after leaving the page');
   if(restored){assert.equal(h.node('publication-consent').checked,false);assert.equal(h.node('publication-confirm').disabled,true);}
  }
 });
 await test('holder duplicate consent is single-flight while decoding',async()=>{
  const h=harness();draft(h,PHOTO);h.root.deferImages=true;const first=consent(h),second=h.node('publication-confirm').events.click();
  assert.equal(h.images.length,1,'A disabled button must also be guarded at handler entry');finishImage(h);await Promise.all([first,second]);
  assert.equal(current(h).status,'confirmed');assert.equal(current(h).history.filter(x=>x.type==='confirm').length,1);
 });
 await test('late public photo read after pagehide cannot replace a resumed draft',async()=>{
  const h=harness();draft(h);h.root.deferFile=true;h.root.deferImages=true;
  h.node('publication-photo-file').events.change({target:{files:[{...PHOTO,dataUrl:PHOTO.dataUrl}],value:''}});
  hide(h);restore(h);h.fileReaders[0].onload();await h.tick();
  assert.equal(h.images.length,0,'Canceled file intent must not start a new image decode');
  assert.equal(h.node('publication-save').disabled,false);assert.equal(current(h).fields.photo,null);
 });
 await test('backoffice deferred approval and publication stop on pagehide and close restored dialogs',async()=>{
  for(const action of ['approve','publish'])for(const restored of [false,true]){
   const h=harness(),holder=draft(h,PHOTO);holder.confirm('MED-A',current(h).id,h.snapshot().revision);
   const admin=h.root.PulzzoDoctorPublication.createStore({storage:h.storage,actor:{id:'admin',role:'admin'}});
   if(action==='publish')admin.review('MED-A',current(h).id,'approve','',h.snapshot().revision);
   const ui=boHarness(h),before=h.storage.getItem(Core.STORAGE_KEY);ui.open(action);ui.commit();assert.equal(ui.images.length,1);
   ui.event('pagehide',{persisted:true});if(restored)ui.event('pageshow',{persisted:true});ui.images[0].naturalWidth=1;ui.images[0].naturalHeight=1;ui.images[0].onload();await h.tick();
   assert.equal(h.storage.getItem(Core.STORAGE_KEY),before,'Navigation canceled the pending '+action);
   assert.equal(ui.get('modalBackdrop').classList.contains('show'),false,'Stale editorial dialogs must close before history restoration');
  }
 });

 await test('legacy doctor camera cannot reopen after Cancel, route navigation, or pagehide',async()=>{
  for(const mode of ['cancel','route','pagehide']){
   const h=legacyDoctor(),pending=h.ctx.testProfile.openProfilePhotoCamera();assert.equal(h.requests.length,1);
   if(mode==='cancel')h.ctx.testProfile.closeProfilePhotoCamera();
   if(mode==='route'){h.ctx.location.hash='#otra-vista';h.event('hashchange');}
   if(mode==='pagehide')h.event('pagehide',{persisted:true});
   const stream=h.resolveCamera(0);await pending;
   assert.equal(stream.stopped,true,mode+' must stop canceled camera tracks');
   assert.equal(h.node('profileCameraModal').classList.open,false);assert.equal(h.fallbacks||0,0);
  }
 });
 await test('legacy doctor replacement camera request wins when permission results arrive out of order',async()=>{
  const h=legacyDoctor(),first=h.ctx.testProfile.openProfilePhotoCamera(),second=h.ctx.testProfile.openProfilePhotoCamera();
  const latest=h.resolveCamera(1);await second;const stale=h.resolveCamera(0);await first;
  assert.equal(stale.stopped,true);assert.equal(latest.stopped,false);assert.equal(h.node('profileCameraVideo').srcObject,latest);
  h.event('pagehide',{persisted:true});assert.equal(latest.stopped,true);assert.equal(h.node('profileCameraVideo').srcObject,null);
 });
 await test('legacy doctor photo read is canceled by pagehide or changing profile tabs',()=>{
  for(const mode of ['pagehide','tab']){
   const h=legacyDoctor(),before=h.data.get('pulzzoDoctorOnboardingCleanV3');
   h.ctx.testProfile.updateProfilePhotoFromFile({type:'image/png',size:3});
   if(mode==='pagehide')h.event('pagehide',{persisted:true});else h.ctx.testProfile.tab('Fiscal y banco');
   h.readers[0].result='data:image/png;base64,bmV3';h.readers[0].onload();
   assert.equal(h.data.get('pulzzoDoctorOnboardingCleanV3'),before,mode+' must invalidate the pending photo read');
  }
 });

 await test('legacy doctor deferred file cannot overwrite a newer same-account payload',()=>{
  const h=legacyDoctor();h.ctx.testProfile.updateProfilePhotoFromFile({type:'image/png',size:3});
  const latest=JSON.parse(h.data.get('pulzzoDoctorOnboardingCleanV3'));latest.profilePhotoData='data:image/png;base64,bGF0ZXN0';latest.fiscal={titular:'Newer saved edit'};const raw=JSON.stringify(latest);h.data.set('pulzzoDoctorOnboardingCleanV3',raw);
  h.readers[0].result='data:image/png;base64,bmV3';h.readers[0].onload();
  assert.equal(h.data.get('pulzzoDoctorOnboardingCleanV3'),raw);assert.match(h.node('profilePhotoMessage').textContent,/perfil cambió/);
 });
 await test('legacy camera permission rejection after cancellation cannot open file fallback',async()=>{
  const h=legacyDoctor(),pending=h.ctx.testProfile.openProfilePhotoCamera();h.ctx.testProfile.closeProfilePhotoCamera();h.requests[0].reject(Error('Permission denied'));await pending;assert.equal(h.fallbacks||0,0);
 });

 await test('patient and provider correction submit honor consent withdrawal, authority changes, and refreshed views',async()=>{
  for(const kind of ['patient','doctor'])for(const change of ['withdraw','refresh','pagehide','identity',...(kind==='doctor'?['authority','capacity']:[])]){
   const h=holderDocumentSubmit(kind),pending=h.click();
   if(change==='withdraw')h.nodes.documentCorrectionConfirm.checked=false;
   if(change==='authority')h.nodes.documentCorrectionAuthority.checked=false;
   if(change==='capacity')h.nodes.documentCorrectionCapacity.value='holder';
   if(change==='refresh')h.nodes.submitDocumentCorrection={disabled:false};
   if(change==='pagehide')h.ctx.sessionEpoch++;
   if(change==='identity')h.ctx.actor={id:'OTHER'};
   h.finish();await pending;assert.equal(h.calls.length,0,kind+' '+change+' cancels the stale personal confirmation');
  }
 });
 await test('correction submit remains single-flight and preserves holder attribution for KAM-prepared evidence',async()=>{
  for(const kind of ['patient','doctor']){
   const h=holderDocumentSubmit(kind),first=h.click(),second=h.click();h.finish();await Promise.all([first,second]);
   assert.equal(h.calls.length,1);assert.equal(h.calls[0][0],'EXP1');assert.equal(h.calls[0][1].confirmed,true);assert.equal(h.calls[0][2],7);assert.equal(h.nodes.submitDocumentCorrection.disabled,false);
  }
 });
 await test('correction submit rejects changed evidence metadata and permits a fresh retry after failure',async()=>{
  const h=holderDocumentSubmit('doctor'),bad=h.click();h.finish({actorId:'OTHER'});await bad;assert.equal(h.calls.length,0);assert.equal(h.nodes.submitDocumentCorrection.disabled,false);assert.match(h.messages.at(-1),/archivo de reemplazo/);
  const retry=h.click();h.finish();await retry;assert.equal(h.calls.length,1);
 });
 console.log(`${failed?'FAIL':'PASS'}: ${passed} lifecycle scenarios passed, ${failed} failed.`);if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
