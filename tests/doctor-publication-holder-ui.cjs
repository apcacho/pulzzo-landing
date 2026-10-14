'use strict';
// Executes shipped UI handlers in a minimal DOM. This is not a visual/browser test.
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
 root.PulzzoDoctorPublicationUI.mount();return {root,data,nodes,storage,originalState,fileReaders,images,node:id=>nodes.get(id),tick:()=>new Promise(resolve=>setImmediate(resolve)),snapshot:()=>root.PulzzoDoctorPublication.createStore({storage,actor:{id:'DOC-A',role:'holder'}}).snapshot()};
}
(async()=>{
 const h=harness(),{root}=h;h.node('details').open=true;assert.equal(h.node('publication-consent').disabled,true);assert.equal(h.node('publication-links-instagram').value,'');
 h.node('publication-editor').events.submit({preventDefault(){}});await h.tick();let s=h.snapshot();assert.ok(s.profiles['MED-A'],h.node('publication-message')?.textContent);let v=s.profiles['MED-A'].versions.at(-1);assert.equal(v.status,'draft');assert.equal(v.fields.photo,null);assert.equal(h.data.get('pulzzoDoctorOnboardingCleanV3'),h.originalState);
 await h.node('publication-confirm').events.click();assert.equal(h.snapshot().revision,s.revision,'programmatic click without consent cannot confirm');
 h.node('publication-consent').checked=true;h.node('publication-consent').events.change({target:h.node('publication-consent')});await h.node('publication-confirm').events.click();assert.equal(h.snapshot().profiles['MED-A'].versions.at(-1).status,'confirmed');
 const admin=root.PulzzoDoctorPublication.createStore({storage:h.storage,actor:{id:'ADMIN',role:'admin'}});s=admin.snapshot();admin.review('MED-A',v.id,'approve','',s.revision);s=admin.snapshot();admin.publish('MED-A',v.id,s.revision);
 h.node('publication-bio').value='Next draft';h.node('publication-editor').events.input({target:h.node('publication-bio')});assert.equal(h.node('publication-confirm').disabled,true);h.node('publication-editor').events.submit({preventDefault(){}});await h.tick();assert.equal(admin.publicProfiles()[0].bio,'');assert.equal(h.data.get('pulzzoDoctorOnboardingCleanV3'),h.originalState);
 const gif='R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',photo={type:'image/gif',size:42,name:'local.gif',dataUrl:'data:image/gif;base64,'+gif};
 h.node('publication-photo-file').events.change({target:{files:[photo],value:''}});assert.match(h.node('publication-message').textContent,/Foto validada/);assert.match(h.node('publication-preview').innerHTML,/<img/);
 h.node('publication-editor').events.submit({preventDefault(){}});await h.tick();assert.equal(h.snapshot().profiles['MED-A'].versions.at(-1).fields.photo.size,42);
 root.invalidImage=true;h.node('publication-consent').checked=true;await h.node('publication-confirm').events.click();assert.match(h.node('publication-message').textContent,/no se puede abrir/);assert.equal(h.snapshot().profiles['MED-A'].versions.at(-1).status,'draft');root.invalidImage=false;
 root.deferImages=true;h.node('publication-consent').checked=true;const inFlight=h.node('publication-confirm').events.click();h.node('publication-bio').value='Changed during decode';h.node('publication-editor').events.input({target:h.node('publication-bio')});h.images.at(-1).onload();await inFlight;assert.equal(h.snapshot().profiles['MED-A'].versions.at(-1).status,'draft');assert.match(h.node('publication-message').textContent,/confirmación cambió/);root.deferImages=false;
 root.deferFile=true;
 for(const bad of [{...photo,size:6*1024*1024},{...photo,type:'text/plain'},null]){
  h.node('publication-photo-file').events.change({target:{files:[photo],value:''}});const pending=h.fileReaders.at(-1);assert.equal(h.node('publication-save').disabled,true);
  h.node('publication-photo-file').events.change({target:{files:bad?[bad]:[],value:''}});assert.equal(h.node('publication-save').disabled,false,'interrupted invalid/empty photo releases save');pending.onload();assert.equal(h.node('publication-save').disabled,false,'superseded callback stays inert');
 }
 h.node('publication-photo-file').events.change({target:{files:[photo],value:''}});const before=h.data.get(root.PulzzoDoctorPublication.STORAGE_KEY);h.data.set('pulzzo_doctor',JSON.stringify({doctorAccountId:'OTHER'}));h.fileReaders.at(-1).onload();assert.equal(h.data.get(root.PulzzoDoctorPublication.STORAGE_KEY),before);assert.match(h.node('publication-message').textContent,/cambió durante la lectura/);
 console.log('PASS executable holder UI: draft/explicit consent, private submitted data immutable, old public snapshot survives edit, optional/decoded photo, invalid saved image blocks consent, edit during decode and account change during upload fail closed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
