'use strict';
// Full URL/session regressions. These execute the real adapters and page entry
// scripts in Node VM; they do not claim browser rendering or a deployed HTTP test.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Store=require('../assets/js/crm-demo-store.js'),Assisted=require('../assets/js/crm-assisted.js'),Session=require('../assets/js/crm-onboarding-session.js');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
let count=0;
function test(name,fn){fn();count++;console.log('PASS',name);}
function memory(){const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key),snapshot:()=>JSON.stringify([...data])};}
function ok(result){assert.equal(result.ok,true,result.error);return result.value;}
function denied(fn,code){assert.throws(fn,error=>error.code===code,code);}
function fixture(kind='patient',role='kam'){
  const storage=memory(),sessionStorage=memory(),staff={id:role==='admin'?'admin_demo':'kam_demo',role:role==='admin'?'admin':'kam'},holder={id:'holder_demo',role:'holder'};
  let time=Date.now();const now=()=>new Date(time).toISOString();
  const store=Store.createStore({storage,actor:staff,now}),api=Assisted.createAssisted({store,actor:staff,now});
  const contact=ok(store.createContact({type:kind,name:'Persona de prueba',email:'route@example.test',phone:'5512345678',assignedKam:'kam_demo',originalSource:'manual'},store.snapshot().revision));
  const exp=ok(api.beginDraft({contactId:contact.id,kind},store.snapshot().revision));
  let actor=staff;
  require('./fixtures/registered-expedient.cjs')({storage,staff,expId:exp.id,holder,now});
  if(role==='holder'){sessionStorage.setItem(Session.HOLDER_KEY,JSON.stringify({actor:holder,expId:exp.id,demo:true,expiresAt:Date.parse(now())+600000}));actor=holder;}
  const options={storage,sessionStorage,actor,expId:exp.id,kind,now,returnUrl:role==='holder'?'asistido-demo.html?review=1':'backoffice.html#crm'};
  const launch=Session.start(options),location=new URL(launch.url,'https://pulzzo.example.test/demo/');
  const key=kind==='patient'?'pulzzo_application':'pulzzoDoctorOnboardingCleanV3';
  return {kind,storage,sessionStorage,staff,actor,store,api,contact,exp,options,launch,location,key,now,advance:ms=>{time+=ms;},open:(overrides={})=>Session.open({...options,location,...overrides})};
}
function saveDraft(context,kind,value){
  const key=kind==='patient'?'pulzzo_application':'pulzzoDoctorOnboardingCleanV3',draft=JSON.parse(context.storage.getItem(key));
  if(kind==='patient')draft.incomeMonthly=value;else draft.fiscal.banco='Banco ficticio '+value;
  context.storage.setItem(key,JSON.stringify(draft));return context.storage.getItem(key);
}
function browserLocation(url){
  let current=new URL(url);
  return {get href(){return current.href;},set href(value){current=new URL(value,current.href);},get pathname(){return current.pathname;},set pathname(value){current.pathname=value;},get search(){return current.search;},set search(value){current.search=value;},get searchParams(){return current.searchParams;},get hash(){return current.hash;},set hash(value){current.hash=value;},assign(value){this.href=value;},replace(value){this.href=value;}};
}
function runtime(f,url){
  const nodes=new Map(),events={};
  function node(id){if(!nodes.has(id))nodes.set(id,{id,value:'',textContent:'',innerHTML:'',style:{},children:[],classList:{add(){},toggle(){}},setAttribute(key,value){this[key]=value;},appendChild(child){this.children.push(child);},replaceChildren(...children){this.children=children;},querySelectorAll(){return[];},querySelector(){return null;},addEventListener(){},remove(){},before(){}});return nodes.get(id);}
  const document={body:node('body'),createElement:tag=>node(tag+'-'+nodes.size),getElementById:node,querySelector:()=>null,querySelectorAll:()=>[]};
  const win={document,localStorage:f.storage,sessionStorage:f.sessionStorage,location:browserLocation(url),URL,URLSearchParams,crypto:require('node:crypto').webcrypto,console,addEventListener(type,fn){(events[type]??=[]).push(fn);},scrollTo(){}};
  win.window=win;vm.createContext(win);
  const run=file=>vm.runInContext(read(file),win,{filename:file});
  for(const file of ['assets/js/crm-demo-store.js','assets/js/crm-assisted.js','assets/js/crm-onboarding-session.js'])run(file);
  return {win,node,events,run};
}
function beginFromCRM(f,r){
  // Exercise the shipping handler: staff identity -> start -> exact destination.
  const line=read('assets/js/crm-demo-ui.js').split('\n').find(line=>line.trim().startsWith('function onboardingEditor()'));
  assert.ok(line,'real CRM continuation handler');
  Object.assign(r.win,{win:r.win,storage:f.storage,state:{actor:f.staff,assisted:true},config:{},requireWrite:()=>true,contact:()=>f.contact,findDraft:()=>f.exp,closeDialog(){},notice(message){throw Error(message);}});
  vm.runInContext(line+'\nonboardingEditor();',r.win);
  assert.equal(r.win.location.searchParams.get('crmExp'),f.exp.id);
  assert.equal(r.win.location.searchParams.get('crmMode'),'assisted');
}
function patientEntry(r){
  r.run('assets/js/patient-onboarding.js');r.run('assets/js/patient-demo.js');
  const source=read('solicitud-paciente.html'),begin=source.indexOf('const sharedPatientContext=window.PulzzoPatientOnboarding.open(window);'),end=source.indexOf('let applicationStorageSnapshot=',begin);
  assert.ok(begin>=0&&end>begin,'real patient bootstrap and ordinary-account redirect guards');
  vm.runInContext(source.slice(begin,end)+'\nglobalThis.routeContext=sharedPatientContext;',r.win);
  return r.win.routeContext;
}
for(const kind of ['patient','doctor'])for(const role of ['kam','admin','holder'])for(const suffix of ['.html','']){
  test(`${kind} ${role}: exact ${suffix||'clean'} route opens, saves and resumes the same expediente`,()=>{
    const f=fixture(kind,role);f.location.pathname=f.location.pathname.replace(/\.html$/,suffix);
    const before=f.storage.snapshot(),context=f.open();assert.equal(f.storage.snapshot(),before,'opening does not create or rewrite a record');
    const saved=saveDraft(context,kind,21000);const reopened=f.open();assert.equal(reopened.storage.getItem(f.key),saved);
    assert.equal(reopened.expId,f.exp.id);assert.equal(reopened.contactId,f.contact.id);
    assert.equal(reopened.isVerified,role==='holder');assert.equal(reopened.isAssistant,role!=='holder');
    assert.equal(Object.keys(f.store.snapshot().expedients).length,1);assert.equal(f.storage.getItem(kind==='patient'?'pulzzo_patient':'pulzzo_doctor'),null);
    assert.equal(f.storage.getItem(kind==='patient'?'pulzzo_verified':'pulzzo_doctor_verified'),null);
  });
}
for(const kind of ['patient','doctor'])for(const suffix of ['.html','']){
  test(`${kind}: actual CRM continuation and page bootstrap at ${suffix||'clean'} deployment path`,()=>{
    const f=fixture(kind),r=runtime(f,'https://pulzzo.example.test/demo/backoffice'+suffix+'#crm');
    beginFromCRM(f,r);r.win.location.pathname=r.win.location.pathname.replace(/\.html$/,suffix);
    r.win.location.search+='&ref=must-not-replace-scoped-record&legacy=1';
    const expected=r.win.location.href;
    const context=kind==='patient'?patientEntry(r):(r.run('assets/js/doctor-shared-onboarding.js'),r.win.PulzzoSharedDoctorOnboarding.context);
    assert.ok(context,'real page adapter opens the session');assert.equal(context.expId,f.exp.id);
    assert.equal(context.isAssistant,true);assert.equal(context.isVerified,false);assert.equal(r.win.location.href,expected,'no erroneous normal-account verification redirect');
    saveDraft(context,kind,22000);
    if(kind==='doctor'){
      const helper=r.win.PulzzoSharedDoctorOnboarding;helper.prepareBasic(()=>{});const state=helper.readState();
      assert.equal(helper.saveBasic({profile:state.profile,contact:state.contact,procedures:state.procedures},state.specialties),true,r.node('shared-doctor-message').textContent);
      assert.equal(r.win.location.hash,'#perfil-medico');assert.equal(r.win.location.searchParams.get('crmExp'),f.exp.id);
      r.win.location.pathname=r.win.location.pathname.replace(/\.html$/,suffix);
      assert.equal(helper.assertContext().expId,f.exp.id,'profile transition preserves exact scope');
    }
  });
}
for(const role of ['kam','holder'])for(const suffix of ['.html','']){
  test(`patient ${role}: actual registration gateway redirects from ${suffix||'clean'} path without legacy writes`,()=>{
    const f=fixture('patient',role),url=new URL(f.launch.url,'https://pulzzo.example.test/demo/');url.pathname='/demo/registro-paciente'+suffix;url.searchParams.set('ref','must-not-replace-scoped-record');url.searchParams.set('legacy','1');
    const r=runtime(f,url.href);r.run('assets/js/patient-onboarding.js');
    const inline=[...read('registro-paciente.html').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match=>match[1]).find(script=>script.includes('var entryParams'));
    const before=f.storage.snapshot();vm.runInContext(inline,r.win);
    assert.equal(f.storage.snapshot(),before);assert.equal(r.win.location.pathname,'/demo/solicitud-paciente.html');
    assert.equal(r.win.location.searchParams.get('crmExp'),f.exp.id);assert.equal(r.win.location.searchParams.get('crmMode'),role==='holder'?'holder':'assisted');
    // A redirect reload creates a fresh page runtime, as it does in a browser.
    r.win.location.pathname=r.win.location.pathname.replace(/\.html$/,suffix);
    const next=runtime(f,r.win.location.href),context=patientEntry(next);assert.equal(context.expId,f.exp.id);assert.equal(context.isVerified,role==='holder');
  });
}
for(const role of ['kam','holder']){
  test(`patient ${role}: invalid session recovery returns to its own access flow`,()=>{
    const f=fixture('patient',role),r=runtime(f,f.location.href.replace('.html?','?'));
    f.sessionStorage.removeItem(Session.CONTEXT_KEY);if(role==='holder')f.sessionStorage.removeItem(Session.HOLDER_KEY);r.run('assets/js/patient-onboarding.js');
    const before=f.storage.snapshot();assert.throws(()=>r.win.PulzzoPatientOnboarding.open(r.win));
    const alert=r.win.document.body.children[0],back=alert.children[0];
    assert.equal(alert.role,'alert');assert.equal(back.href,role==='holder'?'asistido-demo.html?login=1&kind=patient':'backoffice.html#crm');
    assert.match(back.textContent,role==='holder'?/titular/:/CRM/);assert.equal(f.storage.snapshot(),before);
  });
}
for(const kind of ['patient','doctor']){
  test(`${kind}: unrelated, other-kind, malformed and absent paths fail closed`,()=>{
    const f=fixture(kind),base=kind==='patient'?'solicitud-paciente':'registro-doctor';
    const bad=['/','/backoffice','/backoffice.html','/asistido-demo','/asistido-demo.html','/login-paciente.html','/verificacion-cuenta','/verificacion-cuenta.html','/verificacion-doctor.html','/unrelated/'+base+'-copy','/'+base+'.html.bak','/'+base+'.php','/'+base+'/', '/'+base+'.HTML','/'+base+'%2Ehtml','/prefix-'+base,'',undefined];
    bad.push(...(kind==='patient'?['/registro-doctor','/registro-doctor.html']:['/solicitud-paciente','/solicitud-paciente.html','/registro-paciente','/registro-paciente.html']));
    for(const pathname of bad){const before=f.storage.snapshot();denied(()=>f.open({location:{pathname,search:f.location.search}}),'SESSION_EXPIRED');assert.equal(f.storage.snapshot(),before,String(pathname));}
  });
  test(`${kind}: clean path retains exact query scope, identity, nonce and expiration checks`,()=>{
    for(const mutate of [
      f=>f.location.searchParams.set('crmExp','other_exp'),f=>f.location.searchParams.set('crmMode','holder'),f=>f.location.searchParams.delete('crmExp'),f=>f.location.searchParams.delete('crmMode'),
      f=>Session.clearStaffSession(f.options),f=>Session.setStaffSession({...f.options,actor:{id:'other_kam',role:'kam'}}),
      f=>{const identity=JSON.parse(f.sessionStorage.getItem(Session.STAFF_KEY));identity.nonce='replacement_nonce';f.sessionStorage.setItem(Session.STAFF_KEY,JSON.stringify(identity));},
      f=>{const identity=JSON.parse(f.sessionStorage.getItem(Session.STAFF_KEY));identity.actor.role='admin';f.sessionStorage.setItem(Session.STAFF_KEY,JSON.stringify(identity));},
      f=>f.advance(Session.TTL+1),
    ]){
      const f=fixture(kind);f.location.pathname=f.location.pathname.replace(/\.html$/,'');const context=f.open();const raw=context.storage.getItem(f.key);mutate(f);const before=f.storage.snapshot();
      denied(()=>context.storage.getItem(f.key),'SESSION_EXPIRED');denied(()=>context.storage.setItem(f.key,raw),'SESSION_EXPIRED');assert.throws(()=>f.open());assert.equal(f.storage.snapshot(),before);
    }
  });
  test(`${kind}: old context cannot replay after reopening; clean path does not bypass reassignment or stale revisions`,()=>{
    let f=fixture(kind);f.location.pathname=f.location.pathname.replace(/\.html$/,'');let context=f.open();
    Session.start(f.options);denied(()=>context.assertFresh(),'SESSION_EXPIRED');assert.equal(f.open().expId,f.exp.id);
    f=fixture(kind);f.location.pathname=f.location.pathname.replace(/\.html$/,'');context=f.open();const newer=f.open();saveDraft(newer,kind,23000);const saved=f.storage.snapshot();
    denied(()=>context.assertFresh(),'STALE_REVISION');denied(()=>saveDraft(context,kind,1),'STALE_REVISION');assert.equal(f.storage.snapshot(),saved);assert.equal(f.open().expId,f.exp.id);
    const admin=Store.createStore({storage:f.storage,actor:{id:'admin_demo',role:'admin'},now:f.now});ok(admin.reassignContact(f.contact.id,'kam_other','Reasignación demo',admin.snapshot().revision));const reassigned=f.storage.snapshot();
    denied(()=>newer.assertFresh(),'NOT_FOUND');denied(()=>f.open(),'NOT_FOUND');denied(()=>Session.start(f.options),'NOT_FOUND');assert.equal(f.storage.snapshot(),reassigned);
  });
  test(`${kind}: clean holder path retains exact owner, expediente and logout scope`,()=>{
    for(const patch of [{actor:{id:'another_holder',role:'holder'}},{actor:{id:'holder_demo',role:'kam'}},{expId:'another_exp'},{demo:false},null]){
      const f=fixture(kind,'holder');f.location.pathname=f.location.pathname.replace(/\.html$/,'');const context=f.open(),raw=context.storage.getItem(f.key);
      if(patch===null)f.sessionStorage.removeItem(Session.HOLDER_KEY);else f.sessionStorage.setItem(Session.HOLDER_KEY,JSON.stringify({...JSON.parse(f.sessionStorage.getItem(Session.HOLDER_KEY)),...patch}));
      const before=f.storage.snapshot();denied(()=>context.assertFresh(),'SESSION_EXPIRED');denied(()=>context.storage.setItem(f.key,raw),'SESSION_EXPIRED');denied(()=>f.open(),'SESSION_EXPIRED');assert.equal(f.storage.snapshot(),before);
    }
  });
  test(`${kind}: changing a live clean path to another page invalidates the already-open adapter`,()=>{
    const f=fixture(kind);f.location.pathname=f.location.pathname.replace(/\.html$/,'');const context=f.open();f.location.hash='#same-form-section';assert.equal(context.assertFresh(),true);
    f.location.pathname='/demo/asistido-demo';denied(()=>context.assertFresh(),'SESSION_EXPIRED');
  });
}
console.log(`PASS: ${count} full-path onboarding routing and session regressions; VM execution only, no browser/network.`);
