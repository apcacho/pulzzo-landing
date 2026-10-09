'use strict';
// Independent integration audit: real domain modules and shipped DOM handlers.
// No browser, network, subprocess image viewer, or external communication is used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Core=require('../assets/js/doctor-publication.js'),Context=require('../assets/js/doctor-publication-context.js'),CRM=require('../assets/js/crm-demo-store.js'),Office=require('../assets/js/crm-demo-office.js'),UI=require('../assets/js/crm-demo-ui.js'),Assisted=require('../assets/js/crm-assisted.js');
const root=path.resolve(__dirname,'..'),at='2026-10-09T12:00:00.000Z',copy=x=>JSON.parse(JSON.stringify(x));
class Storage{constructor(){this.data=new Map();this.fail=false;}getItem(k){return this.data.get(k)??null;}setItem(k,v){if(this.fail)throw Error('QuotaExceeded');this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
const must=r=>{assert.equal(r.ok,true,r.error);return r.value;};
function fixture(){
 const storage=new Storage(),crm=CRM.createStore({storage,actor:{id:'kam_ana',role:'kam'},now:()=>at});
 const c=must(crm.createContact({type:'doctor',name:'Dra. Persona Demo',email:'doctor@example.test',phone:'5512345678',originalSource:'manual'},0));
 const identity={id:'holder_1',email:c.email,demo:true,verifiedAt:at},actions=Object.fromEntries(['otp','finalConfirmation'].map(k=>[k,{actorId:identity.id,actorRole:'holder',confirmed:true,demo:true,at,capacity:'holder',authorityConfirmed:true}]));
 const exp={id:'exp_1',contactId:c.id,kind:'doctor',status:'submitted',submissionRevision:1,fields:{fullName:c.name,email:c.email,phone:c.phone,professionalLicense:'DEMO123',specialty:'Consulta DEMO',clinicAddress:'Clínica demo'},documents:[{id:'doc_1',label:'identity',fileName:'demo.pdf',demo:true}],holderIdentity:identity,holderActions:actions,createdAt:at,submittedAt:at};
 exp.submissionSnapshot={schema:'pulzzo.crm.submission.v1',demo:true,revision:1,submissionId:'submission_exp_1',expedientId:exp.id,contactId:c.id,accountId:identity.id,kind:'doctor',fields:copy(exp.fields),documents:copy(exp.documents),holderIdentity:copy(identity),holderActions:copy(actions),holderConfirmation:copy(actions.finalConfirmation),submittedAt:at,provenance:{originalSource:'manual'}};
 const state=crm.snapshot();Object.assign(state.contacts[c.id],{accountId:identity.id,holderId:identity.id,accountExists:true});state.expedients[exp.id]=exp;storage.setItem(CRM.STORAGE_KEY,JSON.stringify(state));
 const imported=Office.prepareImport({patients:[],providers:[],audit:[]},exp,'admin@example.test'),provider=imported.record;
 provider.onboarding={approved:true,approvedAt:at};provider.profile={...provider.profile,prefix:'Dra.',name:'Persona Demo',city:'Ciudad Demo',state:'Estado Demo'};provider.contact={registered:'5512345678',visible:false};provider.fiscal={rfc:'PRIVATE_RFC',clabe:'PRIVATE_ACCOUNT'};provider.notes=[{text:'PRIVATE_NOTE'}];storage.setItem(Context.BO_KEY,JSON.stringify(imported.database));
 const make=actor=>Core.createStore({storage,actor,now:()=>at,resolveProvider:id=>Context.resolveProvider(storage,id)});
 const kam=make({id:'kam_ana',role:'kam'}),holder=make({id:identity.id,role:'holder'}),admin=make({id:'admin_demo',role:'admin'}),pub=make({id:'public',role:'public'});
 assert.equal(Context.resolveProvider(storage,provider.id).contactId,c.id);
 return {storage,crm,c,exp,provider,make,kam,holder,admin,pub,fields:{displayName:'Dra. Persona Demo',specialty:'Consulta DEMO',city:'Ciudad Demo',state:'Estado Demo',services:['Consulta'],photo:null}};
}
function current(h){const s=h.admin.snapshot(),p=s.profiles[h.provider.id];return {s,p,v:p&&p.versions.find(v=>v.id===p.currentVersionId)};}
function draft(h,fields=h.fields){h.kam.saveDraft(h.provider.id,fields,h.kam.snapshot().revision);return current(h).v;}
function confirm(h){const {s,v}=current(h);h.holder.confirm(h.provider.id,v.id,s.revision);}
function approve(h){const {s,v}=current(h);h.admin.review(h.provider.id,v.id,'approve','',s.revision);}
function publish(h){const {s,v}=current(h);h.admin.publish(h.provider.id,v.id,s.revision);}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNMYWBgYGBgYmBgYGBgAAAFPgBokdFUUQAAAABJRU5ErkJggg==','base64');
// A PNG fixture generated from a 2x2 RGB image. Container and browser decode are
// tested separately: the UI must await its Image success before committing.
function photo(){return {dataUrl:'data:image/png;base64,'+png.toString('base64'),type:'image/png',size:png.length,name:'demo.png'};}
let total=0,failed=0;async function test(name,fn){try{await fn();total++;console.log('PASS',name);}catch(error){failed++;process.exitCode=1;console.error('FAIL',name, error.message.slice(0,300));}}
class Classes{constructor(){this.values=new Set();}add(x){this.values.add(x);}remove(x){this.values.delete(x);}contains(x){return this.values.has(x);}toggle(x,on){on?this.add(x):this.remove(x);}}
class Element{constructor(id){Object.assign(this,{id,value:'',textContent:'',innerHTML:'',dataset:{},listeners:{},classList:new Classes(),attributes:{},open:false,disabled:false});}addEventListener(t,f){(this.listeners[t]??=[]).push(f);}removeEventListener(){}async dispatch(t,e={}){for(const f of this.listeners[t]||[])await f({target:this,preventDefault(){},...e});}setAttribute(k,v){this.attributes[k]=v;}removeAttribute(k){delete this.attributes[k];}showModal(){this.open=true;}close(){this.open=false;}querySelector(){return null;}querySelectorAll(){return [];}focus(){}select(){}}
function crmUI(h){
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id);};
 const contexts=['patient','doctor'].map(x=>{const e=new Element(x);e.dataset.contextSwitch=x;return e;}),views=['contacts','tasks','dashboard'].map(x=>{const e=new Element(x);e.dataset.view=x;return e;});
 const document={body:{dataset:{}},listeners:{},getElementById:get,querySelectorAll:q=>q==='[data-context-switch]'?contexts:q==='[data-view]'?views:[],addEventListener(t,f){(this.listeners[t]??=[]).push(f);}};
 const readers=[],images=[],listeners={},window={document,localStorage:h.storage,location:{href:'https://example.test/crm-demo.html',hash:''},navigator:{},URL,history:{pushState(_s,_t,u){window.location.hash=u;},replaceState(_s,_t,u){window.location.hash=u;}},addEventListener(t,f){(listeners[t]??=[]).push(f);},FileReader:class{constructor(){readers.push(this);}readAsDataURL(file){this.file=file;}},Image:class{constructor(){images.push(this);}set src(value){this.source=value;}}};
 const app=UI.createApp({window,document,storage:h.storage,storeModule:CRM,assistedModule:Assisted,publicationModule:Core,publicationContextModule:Context,analyticsModule:require('../assets/js/crm-demo-analytics.js'),now:()=>at});
 app.navigate('doctor','contacts',h.c.id);
 async function submit(values={},files={}){const error=new Element('error'),form={elements:{namedItem:name=>files[name]?{files:files[name]}:{value:values[name]??''}},classList:new Classes(),querySelector:()=>error,querySelectorAll:()=>[],checkValidity:()=>true};await get('dialogContent').dispatch('submit',{target:form});return error.textContent;}
 return {app,get,window,readers,images,listeners,submit};
}
function boUI(h){
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id);},listeners=[],images=[];
 const sandbox={console,URL,Buffer,addEventListener(){},Image:class{constructor(){images.push(this);}set src(value){this.source=value;}},currentView:'providers',providerMode:'detail',selectedProviderId:h.provider.id,localStorage:h.storage,session:{email:'admin@pulzzo.mx',role:'admin'},db:JSON.parse(h.storage.getItem(Context.BO_KEY)),DEMO_STORAGE_KEY:Context.BO_KEY,providerFieldLabels:{website:'Sitio web'},providerLinksHtml:()=>'',providerIsApproved:p=>p.onboarding?.approved,can:()=>sandbox.session?.role==='admin'||sandbox.session?.role==='provider',servicingOfficeAssertCurrent:()=>{},renderProviderDetail:()=>{},toast:text=>{sandbox.lastToast=text;},document:{getElementById:get,addEventListener:(type,fn)=>{if(type==='click')listeners.push(fn);}},modal:html=>{get('modalBackdrop').classList.add('show');get('publicationDialog').innerHTML=html;},closeModal:()=>get('modalBackdrop').classList.remove('show'),FormData:class{constructor(form){this.form=form;}get(k){return this.form.values?.[k]||'';}}};sandbox.window=sandbox;
 vm.createContext(sandbox);for(const file of ['doctor-publication-context.js','doctor-publication.js','doctor-publication-backoffice.js'])vm.runInContext(fs.readFileSync(path.join(root,'assets/js',file),'utf8'),sandbox,{filename:file});
 return {sandbox,get,images,open:(action)=>sandbox.PulzzoDoctorPublicationBO.open(action,h.provider.id),commit:()=>listeners.forEach(fn=>fn({preventDefault(){},target:{closest:()=>({dataset:{publicationAction:'commit'}})}})),render:()=>sandbox.PulzzoDoctorPublicationBO.render(sandbox.db.providers[0])};
}
function holderUI(h){
 const nodes=new Map(),readers=[],images=[],fields=[];let host;
 const get=id=>nodes.get(id)||null;
 function fresh(id){const e=new Element(id);nodes.set(id,e);return e;}
 host=fresh('doctor-publication-holder');
 Object.defineProperty(host,'innerHTML',{get(){return this.markup||'';},set(html){this.markup=html;for(const id of Array.from(nodes.keys()))if(id!=='doctor-publication-holder')nodes.delete(id);fields.length=0;for(const m of html.matchAll(/\bid="([^"]+)"/g))fresh(m[1]);for(const m of html.matchAll(/<(input|textarea)\b([^>]*data-publication-field="([^"]+)"[^>]*)>([^<]*)/g)){const id=/\bid="([^"]+)"/.exec(m[2])?.[1],el=get(id);if(!el)continue;el.dataset.publicationField=m[3];el.value=m[1]==='textarea'?m[4]:(/\bvalue="([^"]*)"/.exec(m[2])?.[1]||'');el.matches=s=>s==='[data-publication-field]';fields.push(el);}if(get('publication-editor'))get('publication-editor').querySelectorAll=()=>fields;if(get('publication-confirm'))get('publication-confirm').disabled=true;}});
 host.querySelector=()=>null;
 const document={readyState:'loading',getElementById:get,addEventListener(){}};
 const sandbox={console,URL,Buffer,document,localStorage:h.storage,addEventListener(){},confirm:()=>true,FileReader:class{constructor(){readers.push(this);}readAsDataURL(file){this.file=file;}},Image:class{constructor(){images.push(this);}set src(value){this.source=value;}},PulzzoDoctorDemoBridge:{account:()=>({doctorAccountId:'holder_1'}),getState:()=>({...copy(h.provider),doctorAccountId:'holder_1',demoProviderId:h.provider.id}),refresh(){}}};sandbox.window=sandbox;
 h.storage.setItem('pulzzo_doctor',JSON.stringify({doctorAccountId:'holder_1'}));h.storage.setItem('pulzzo_doctor_verified','true');vm.createContext(sandbox);for(const file of ['doctor-publication-context.js','doctor-publication.js','doctor-publication-ui.js'])vm.runInContext(fs.readFileSync(path.join(root,'assets/js',file),'utf8'),sandbox,{filename:file});sandbox.PulzzoDoctorPublicationUI.mount();
 async function pick(file){get('publication-photo-file').files=file?[file]:[];await get('publication-photo-file').dispatch('change');}
 return {sandbox,get,readers,images,pick,host};
}
(async()=>{
 await test('Real Office import identity resolves; public allowlist rejects documents and keeps private provider data out',()=>{
  const h=fixture();assert.equal(Context.fields(h.provider).phone,'');assert.throws(()=>draft(h,{...h.fields,documents:[]}),e=>e.code==='private_field');draft(h);confirm(h);approve(h);assert.deepEqual(h.pub.publicProfiles(),[]);publish(h);const row=h.pub.publicProfiles()[0];assert.equal(row.photo,null);assert.doesNotMatch(JSON.stringify(row),/PRIVATE|holder_1|accountId|contactId|documents|fiscal|notes/);assert.equal(Object.keys(h.pub.snapshot().profiles).length,0);
 });
 await test('Exact-version holder consent and BO review are required; pending/rejected edits retain old public snapshot',()=>{
  const h=fixture();draft(h);assert.throws(()=>h.kam.confirm(h.provider.id,current(h).v.id,current(h).s.revision),e=>e.code==='holder_required');confirm(h);approve(h);publish(h);const prior=h.pub.publicProfiles()[0];draft(h,{bio:'new draft'});assert.equal(h.pub.publicProfiles()[0].versionId,prior.versionId);assert.throws(()=>h.admin.publish(h.provider.id,current(h).v.id,current(h).s.revision),e=>e.code==='invalid_transition');confirm(h);const {s,v}=current(h);h.admin.review(h.provider.id,v.id,'reject','Revise description',s.revision);assert.deepEqual(h.pub.publicProfiles()[0],prior);draft(h,{bio:'corrected'});assert.equal(current(h).v.consent,null);assert.throws(()=>h.admin.review(h.provider.id,current(h).v.id,'approve','',current(h).s.revision),e=>e.code==='invalid_transition');
 });
 await test('System photo task is unique, unscheduled, cannot close manually, waits for publication, reopens, and follows fresh KAM assignment',()=>{
  const h=fixture();draft(h);confirm(h);approve(h);publish(h);const id='doctor-photo:'+h.provider.id;let task=h.crm.listTasks()[0];assert.equal(task.id,id);assert.equal(task.dueAt,null);assert.equal(task.status,'open');assert.equal(UI.taskBucket(task,at),'unscheduled');assert.equal(h.crm.dashboard().counts.overdueTasks,0);assert.equal(h.crm.closeTask(id,'done',h.crm.snapshot().revision).code,'system_task');
  draft(h,{photo:photo()});assert.equal(h.crm.listTasks()[0].status,'open');confirm(h);approve(h);assert.equal(h.crm.listTasks()[0].status,'open');publish(h);assert.equal(h.crm.listTasks()[0].status,'closed');draft(h,{photo:null});confirm(h);approve(h);publish(h);assert.equal(h.crm.listTasks().length,1);assert.equal(h.crm.listTasks()[0].status,'open');
  const admin=CRM.createStore({storage:h.storage,actor:{id:'admin_demo',role:'admin'},now:()=>at});must(admin.reassignContact(h.c.id,'kam_luis','Reassignment test',admin.snapshot().revision));assert.equal(h.crm.listTasks().length,0);assert.equal(h.kam.photoTasks().length,0);assert.throws(()=>h.kam.saveDraft(h.provider.id,{bio:'stale KAM'},h.kam.snapshot().revision),e=>e.code==='forbidden');const luis=CRM.createStore({storage:h.storage,actor:{id:'kam_luis',role:'kam'},now:()=>at});assert.equal(luis.listTasks()[0].id,id);assert.equal(luis.listTasks()[0].assignedKam,'kam_luis');
 });
 await test('Maximum-length valid provider IDs still project one CRM follow-up; readonly BO can inspect but never mutate',()=>{
  const h=fixture(),db=JSON.parse(h.storage.getItem(Context.BO_KEY)),id='P'.repeat(180);db.providers[0].id=id;h.provider.id=id;h.storage.setItem(Context.BO_KEY,JSON.stringify(db));draft(h);confirm(h);approve(h);publish(h);assert.equal(h.crm.listTasks().length,1);assert.equal(h.crm.listTasks()[0].id,'doctor-photo:'+id);const readonly=h.make({id:'bo_readonly',role:'readonly'});assert.equal(readonly.snapshot().profiles[id].publishedVersionId,current(h).v.id);const before=h.storage.getItem(Core.STORAGE_KEY);assert.throws(()=>readonly.saveDraft(id,{bio:'forbidden'},readonly.snapshot().revision),e=>e.code==='forbidden');assert.equal(h.storage.getItem(Core.STORAGE_KEY),before);const ui=boUI(h);ui.sandbox.session={email:'lectura@pulzzo.mx',role:'readonly'};assert.match(ui.render(),/Publicada|Publicado/);assert.doesNotMatch(ui.render(),/data-publication-action="(?:edit|approve|publish)"/);
 });
 await test('Storage quota, identity collision, and stale revision leave published and draft bytes untouched',()=>{
  const h=fixture();draft(h);confirm(h);approve(h);publish(h);const before=h.storage.getItem(Core.STORAGE_KEY);h.storage.fail=true;assert.throws(()=>draft(h,{bio:'fail'}),e=>e.code==='storage_write_failed');h.storage.fail=false;assert.equal(h.storage.getItem(Core.STORAGE_KEY),before);assert.throws(()=>h.holder.saveDraft(h.provider.id,{bio:'stale'},0),e=>e.code==='stale_revision');const db=JSON.parse(h.storage.getItem(Context.BO_KEY));db.patients.push({id:'patient_collision',patientAccountId:'holder_1'});h.storage.setItem(Context.BO_KEY,JSON.stringify(db));assert.equal(Context.resolveProvider(h.storage,h.provider.id),null);assert.equal(h.pub.publicProfiles().length,0);assert.throws(()=>draft(h,{bio:'cross-account'}),e=>e.code==='invalid_provider');assert.equal(h.storage.getItem(Core.STORAGE_KEY),before);
 });
 await test('Actual BO module accepts real email sessions and performs separated review/publication; stale role is blocked',()=>{
  const h=fixture();draft(h);confirm(h);const ui=boUI(h);assert.match(ui.render(),/Aprobar esta versión/);ui.open('approve');ui.commit();assert.equal(current(h).v.status,'approved');assert.equal(h.pub.publicProfiles().length,0);ui.open('publish');ui.sandbox.session={email:'lectura@pulzzo.mx',role:'readonly'};ui.commit();assert.equal(current(h).v.status,'approved');assert.match(ui.get('publicationError').textContent,/sesión|expediente|ventana/);ui.sandbox.session={email:'admin@pulzzo.mx',role:'admin'};ui.open('publish');ui.commit();assert.equal(current(h).v.status,'published');assert.equal(h.pub.publicProfiles().length,1);
 });
 await test('Actual BO decode guards rejected image, double click, changed role, replacement modal, and navigation',async()=>{
  for(const mode of ['decode_error','double','role','new_dialog','navigation']){
   const h=fixture();draft(h,{...h.fields,photo:photo()});confirm(h);const ui=boUI(h),before=h.storage.getItem(Core.STORAGE_KEY);ui.open('approve');ui.commit();assert.equal(ui.images.length,1);assert.equal(current(h).v.status,'confirmed');
   if(mode==='double'){ui.commit();assert.equal(ui.images.length,1,'Repeated click cannot start another decode');}
   if(mode==='role')ui.sandbox.session={email:'lectura@pulzzo.mx',role:'readonly'};
   if(mode==='new_dialog'){ui.sandbox.closeModal();ui.open('preview');}
   if(mode==='navigation'){ui.sandbox.currentView='dashboard';ui.sandbox.selectedProviderId='OTHER';}
   if(mode==='decode_error')ui.images[0].onerror();else{ui.images[0].naturalWidth=2;ui.images[0].naturalHeight=2;ui.images[0].onload();}
   await Promise.resolve();await Promise.resolve();
   if(mode==='double')assert.equal(current(h).v.status,'approved');else assert.equal(h.storage.getItem(Core.STORAGE_KEY),before,mode+' must not approve an old view');
  }
 });
 await test('Actual CRM photo editor blocks late reads after navigation and surfaces quota without altering public content',async()=>{
  const h=fixture();draft(h);confirm(h);approve(h);publish(h);const ui=crmUI(h),before=h.storage.getItem(Core.STORAGE_KEY);ui.app.handlers.publicProfileEditor();assert.match(ui.get('dialogContent').innerHTML,/Fotografía opcional/);const pending=ui.submit(h.fields,{photo:[{name:'demo.png',type:'image/png',size:png.length}]});await Promise.resolve();ui.app.navigate('doctor','tasks',null);ui.readers[0].result=photo().dataUrl;ui.readers[0].onload();await Promise.resolve();if(ui.images[0]){ui.images[0].naturalWidth=2;ui.images[0].naturalHeight=2;ui.images[0].onload();}assert.match(await pending,/vista|cambió/);assert.equal(h.storage.getItem(Core.STORAGE_KEY),before);ui.app.navigate('doctor','contacts',h.c.id);ui.app.handlers.publicProfileEditor();h.storage.fail=true;const error=await ui.submit({...h.fields,services:'Consulta'});h.storage.fail=false;assert.match(error,/almacenamiento|guardar/);assert.equal(h.storage.getItem(Core.STORAGE_KEY),before);
 });
 await test('Actual CRM photo editor waits for image decode and does not save a corrupt raster',async()=>{
  const h=fixture(),ui=crmUI(h),before=h.storage.getItem(Core.STORAGE_KEY);ui.app.handlers.publicProfileEditor();const pending=ui.submit({...h.fields,services:'Consulta'},{photo:[{name:'broken.png',type:'image/png',size:png.length}]});await Promise.resolve();ui.readers[0].result=photo().dataUrl;ui.readers[0].onload();await Promise.resolve();assert.equal(ui.images.length,1,'KAM upload must await actual Image decode, not just FileReader/container signature');assert.equal(h.storage.getItem(Core.STORAGE_KEY),before);ui.images[0].onerror();assert.match(await pending,/imagen|foto|legible|leer/);assert.equal(h.storage.getItem(Core.STORAGE_KEY),before);
 });
 await test('Actual holder upload interruption by invalid replacement cannot leave save permanently locked',async()=>{
  for(const invalid of [{name:'wrong.txt',type:'text/plain',size:10},{name:'oversize.png',type:'image/png',size:Core.MAX_PHOTO_BYTES+1}]){
   const h=fixture();draft(h);const ui=holderUI(h),before=h.storage.getItem(Core.STORAGE_KEY);assert.match(ui.host.innerHTML,/Autorizar esta versión/);await ui.pick({name:'demo.png',type:'image/png',size:png.length});assert.equal(ui.get('publication-save').disabled,true);await ui.pick(invalid);ui.readers[0].result=photo().dataUrl;ui.readers[0].onload();await Promise.resolve();if(ui.images[0]){ui.images[0].naturalWidth=2;ui.images[0].naturalHeight=2;ui.images[0].onload();}await Promise.resolve();assert.equal(ui.get('publication-save').disabled,false,'Invalid replacement must release reading state');assert.equal(h.storage.getItem(Core.STORAGE_KEY),before);
  }
 });
 console.log(`${failed?'FAIL':'PASS'}: ${total} passed, ${failed} failed independent publication integration audit cases. DOM/VM and domain validation; pixel QA unrun.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
