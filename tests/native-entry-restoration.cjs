'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const Store=require('../assets/js/crm-demo-store.js'),Assisted=require('../assets/js/crm-assisted.js'),Context=require('../assets/js/crm-onboarding-session.js'),Office=require('../assets/js/crm-demo-office.js'),Evidence=require('../assets/js/crm-demo-evidence.js');
const Files=require('./fixtures/onboarding-evidence.cjs');
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),dump:()=>JSON.stringify([...m])};};
const ok=r=>{assert.equal(r.ok,true,r.error);return r.value;};
function registration(kind,clinic=false,disk=memory(),interrupt=false){
 let interruptNext=interrupt;
 const session=memory(),events={},nodes={};for(const id of ['verify-form','code','verify-btn','message','verify-copy','resend'])nodes[id]={value:'',textContent:'',disabled:true,addEventListener:(name,fn)=>events[name]=fn};
 const w={location:{search:'',href:''},crypto:require('node:crypto').webcrypto,localStorage:disk,sessionStorage:session,document:{getElementById:id=>nodes[id]},PulzzoCRMStore:Store,PulzzoCRMAssisted:Assisted,PulzzoCRMOnboarding:{...Context,start:options=>{if(interruptNext){interruptNext=false;throw Error('Interrupción simulada');}return Context.start({...options,storage:disk,sessionStorage:session});}}};
 vm.runInNewContext(fs.readFileSync('assets/js/native-registration.js','utf8'),{window:w,URLSearchParams,Date,JSON,Error,Number,String});
 const profile={name:clinic?'Clínica Ficticia':'Doctor Ficticio',email:kind+(clinic?'clinic':'')+'@example.test',accountType:clinic?'clinica':'doctor',state:'Ciudad de México',city:'Benito Juárez',prefix:'Dr.',establishmentType:clinic?'Clínica':''};
 w.PulzzoNativeRegistration.stage(kind,{name:profile.name,email:profile.email,phone:(globalThis.__pzPhone=(globalThis.__pzPhone||100000)+1,'5500'+globalThis.__pzPhone),initial:{profile,procedures:['Consulta ficticia']},specialties:['Cardiología'],nameParts:{first:'Paciente',second:'Segundo',paternal:'Demo',maternal:'Ficticio'}});
 const saved=session.getItem(w.PulzzoNativeRegistration.KEY);assert.ok(saved);assert.doesNotMatch(saved,/password|consent|pass_med/);assert.equal(disk.dump(),'[]');
 assert.match(w.location.href,kind==='doctor'?/verificacion-doctor/:/verificacion-cuenta/);
 w.location.search='?native=1';w.PulzzoNativeRegistration.verify();assert.equal(nodes['verify-btn'].disabled,false,nodes.message.textContent);
 nodes.code.value='000000';events.submit({preventDefault(){}});assert.match(nodes.message.textContent,/no coincide/);assert.equal(nodes.message.className,'toast err');assert.equal(Object.keys(JSON.parse(disk.getItem(Store.STORAGE_KEY)||'{"expedients":{}}').expedients).length,0);
 nodes.code.value=nodes['verify-copy'].textContent.match(/Código de ejemplo: (\d+)/)[1];events.submit({preventDefault(){}});if(interrupt){const before=disk.getItem(Store.STORAGE_KEY);assert.match(nodes.message.textContent,/Interrupción simulada/);w.PulzzoNativeRegistration.verify();assert.match(nodes['verify-copy'].textContent,/ya fue verificado/);events.submit({preventDefault(){}});assert.equal(disk.getItem(Store.STORAGE_KEY),before,'Retry after verified persistence preserves the existing expediente');}assert.match(w.location.href,/crmExp=/,nodes.message.textContent);
 const db=JSON.parse(disk.getItem(Store.STORAGE_KEY)),exp=Object.values(db.expedients)[0];assert.ok(exp.initialRegistration);assert.equal(exp.initialRegistration.actorId,exp.holderIdentity.id);assert.equal(Object.keys(db.contacts).length,1);assert.equal(Object.keys(db.expedients).length,1);
 const state=JSON.parse(exp.onboarding.records[kind==='doctor'?'pulzzoDoctorOnboardingCleanV3':'pulzzo_application']);
 if(kind==='doctor'){assert.equal(state.profile.accountType,profile.accountType);assert.deepEqual(state.specialties,['Cardiología']);assert.match(w.location.href,/#perfil-medico$/);}else assert.deepEqual(state.identity.nameParts,{first:'Paciente',second:'Segundo',paternal:'Demo',maternal:'Ficticio'});
 const loc=new URL(w.location.href,'https://example.test');const context=Context.open({storage:disk,sessionStorage:session,kind,location:loc});return {disk,session,exp,context,state,holder:db.contacts[exp.contactId].holderId};
}
(async()=>{
 for(const [kind,clinic] of [['doctor',false],['doctor',true],['patient',false]]){
  const f=registration(kind,clinic),admin={id:'admin',role:'admin'};
  const route=Context.start({storage:f.disk,sessionStorage:f.session,actor:admin,expId:f.exp.id,kind});
  if(kind==='doctor')assert.match(route.url,/#perfil-medico$/);
  const ctx=Context.open({storage:f.disk,sessionStorage:f.session,kind,location:new URL(route.url,'https://example.test')});assert.equal(ctx.isAssistant,true);
  const key=kind==='doctor'?'pulzzoDoctorOnboardingCleanV3':'pulzzo_application',state=JSON.parse(ctx.storage.getItem(key));
  if(kind==='doctor')state.links={website:'https://example.test/?a=1&b="two"'};else state.incomeMonthly=20000;
  ctx.storage.setItem(key,JSON.stringify(state));assert.equal(Object.keys(JSON.parse(f.disk.getItem(Store.STORAGE_KEY)).expedients).length,1);
  if(kind==='patient'){
   state.geoDone=true;state.geolocation={status:'authorized',consent:true,latitude:1,longitude:2,accuracy:3,capturedAt:new Date().toISOString(),source:'browser_geolocation',actorId:f.holder};
   assert.throws(()=>ctx.storage.setItem(key,JSON.stringify(state)),/ubicación/);
   const holderRoute=Context.start({storage:f.disk,sessionStorage:f.session,actor:{id:f.holder,role:'holder'},expId:f.exp.id,kind});
   const holder=Context.open({storage:f.disk,sessionStorage:f.session,kind,location:new URL(holderRoute.url,'https://example.test')});
   const hs=JSON.parse(holder.storage.getItem(key));hs.geoDone=true;hs.geolocation=state.geolocation;holder.storage.setItem(key,JSON.stringify(hs));
   hs.geolocation.latitude=null;assert.throws(()=>holder.storage.setItem(key,JSON.stringify(hs)),/coordenadas/);
   hs.geoDone=false;hs.geolocation={status:'pending',consent:false,latitude:null,longitude:null,accuracy:null,source:'frontend_demo_mode',reason:'permission_denied',capturedAt:new Date().toISOString()};holder.storage.setItem(key,JSON.stringify(hs));
   assert.equal(JSON.parse(holder.storage.getItem(key)).geoDone,false);
  }
 }
 for(const kind of ['doctor','patient'])registration(kind,false,memory(),true);
 const disk=memory(),session=memory(),actor={id:'kam',role:'kam'},store=Store.createStore({storage:disk,actor}),api=Assisted.createAssisted({store,actor});
 const c=ok(store.createContact({name:'No registrado',type:'doctor',email:'pending@example.test',phone:(globalThis.__pzPhone=(globalThis.__pzPhone||100000)+1,'5500'+globalThis.__pzPhone),assignedKam:'kam'},store.snapshot().revision)),draft=ok(api.beginDraft({contactId:c.id,kind:'doctor'},store.snapshot().revision));
 assert.throws(()=>Context.start({storage:disk,sessionStorage:session,actor,expId:draft.id,kind:'doctor'}),/registro inicial/);
 assert.equal(api.completeInitialRegistration(draft.id,store.snapshot().revision).ok,false);
 // Real binary service over a deterministic IndexedDB test double; not browser pixels.
 const idb=Files.memoryIndexedDB(),service=Evidence.createEvidenceStore({indexedDB:idb}),file=Files.pdf();const meta=await service.put(file,{actorId:'holder',contactId:'contact',documentType:'license'});
 const descriptor={evidenceId:meta.id,mimeType:meta.mimeType,size:meta.size,uploadedBy:meta.actorId,uploadedAt:meta.uploadedAt};const database={patients:[],providers:[{id:'provider',crmIntake:{contactId:'contact'},files:[descriptor]}]};let allowed=true,current=true;
 const office={assertCurrent(){if(!current)throw Error('expired');},actorId:()=> 'admin',getDatabase:()=>database,canReadDocument:()=>allowed};const module={...Evidence,createEvidenceStore:options=>Evidence.createEvidenceStore({...options,indexedDB:idb})};
 const read=()=>Office.readEvidence({office,evidenceModule:module,kind:'provider',entityId:'provider',descriptor});assert.equal((await read()).blob.size,file.size);allowed=false;await assert.rejects(read,/acceso/);allowed=true;descriptor.size++;await assert.rejects(read,/no coincide/);descriptor.size--;current=false;await assert.rejects(read,/expired/);await service.close();
 console.log('PASS native patient/doctor/clinic registration, explicit verification, scoped continuation, KAM prerequisite, same expediente, holder-only location, null-coordinate rejection, real binary evidence with access and mismatch guards. VM/service tests only.');
})().catch(e=>{console.error(e);process.exitCode=1;});
