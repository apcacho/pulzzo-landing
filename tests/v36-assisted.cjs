'use strict';
// v36 regressions (VM, fictitious in-memory data; no browser): prerequisite dialog, phone+email rule,
// registration phone into the ficha, KAM Buró NIP capture, assisted resume step, holder inactivity session.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const fixture=path.join(__dirname,'crm-demo-ui.cjs'),src=fs.readFileSync(fixture,'utf8'),scope=vm.createContext({require:createRequire(fixture),__dirname,console,Blob,URL});
vm.runInContext(src.slice(0,src.indexOf('(async()=>{'))+'\nglobalThis.fixture={setup,MemoryStorage};',scope);
const {setup,MemoryStorage}=scope.fixture,Session=require('../assets/js/crm-onboarding-session.js'),Store=require('../assets/js/crm-demo-store.js'),Assisted=require('../assets/js/crm-assisted.js'),Patient=require('../assets/js/patient-onboarding.js');
const ok=r=>{assert.equal(r.ok,true,r.error);return r.value;};
(async()=>{
 // 1. Prerequisite dialog wording + same-browser note.
 for(const kind of ['patient','doctor']){
  const h=setup(),app=h.app,store=app.state.store;h.window.sessionStorage=new MemoryStorage();h.window.PulzzoCRMOnboarding=Session;
  const c=ok(store.createContact({type:kind,name:'Prerequisite fixture',email:kind+'.pre@example.test',phone:'5500000201'},store.snapshot().revision));
  app.navigate(kind,'contacts',c.id);await h.click('open-profile',c.id);await h.click('begin-onboarding');
  const html=h.get('dialogContent').innerHTML;
  assert.equal(h.get('dialogTitle').textContent,'Primero el cliente debe registrarse');
  assert.match(html,/Completar su registro inicial/);assert.match(html,/Verificar su acceso/);
  assert.match(html,/asistido-demo.html#entry=/);assert.match(html,/data-action="copy-entry"/);
  assert.match(html,/data-same-browser-note[^>]*>.*mismo navegador/);
  app.closeDialog(true);await h.click('invite-holder');
  assert.equal(h.get('dialogTitle').textContent,'El cliente lo completa','the client-completes option keeps its own title');
  console.log('PASS',kind,'prerequisite dialog title, missing steps, copyable link and same-browser note');
 }
 // 2. Phone and email both mandatory (store).
 {const disk=new MemoryStorage(),actor={id:'kam_ana',role:'kam'},store=Store.createStore({storage:disk,actor});
  for(const input of [{email:'only@example.test'},{phone:'5500000202'},{}]){const r=store.createContact({type:'patient',name:'X',...input},store.snapshot().revision);assert.equal(r.ok,false);assert.match(r.error,/Correo y teléfono son obligatorios/);}
  const c=ok(store.createContact({type:'patient',name:'Both',email:'both@example.test',phone:'55 0000 0203'},store.snapshot().revision));assert.equal(c.phone,'5500000203');
  assert.equal(store.updateContact(c.id,{phone:''},store.snapshot().revision).ok,false);assert.equal(store.updateContact(c.id,{email:''},store.snapshot().revision).ok,false);
  // Demo seed gets clearly fictitious phones for every owner.
  const admin=Store.createStore({storage:new MemoryStorage(),actor:{id:'admin_demo',role:'admin'}});ok(admin.seedExamples(admin.snapshot().revision));
  for(const row of admin.listContacts())assert.ok(row.phone&&/^\d{7,15}$/.test(row.phone),'seed phone '+row.phone);
  console.log('PASS phone+email mandatory on create/update; demo seed contacts carry fictitious phones');
 }
 // 3. Phone typed by the holder at registration lands in the same ficha; KAM Buró NIP; holder-only actions intact.
 for(const kind of ['patient','doctor']){
  const disk=new MemoryStorage(),kamActor={id:'kam_ana',role:'kam'},kamStore=Store.createStore({storage:disk,actor:kamActor}),kam=Assisted.createAssisted({store:kamStore,actor:kamActor});
  const c=ok(kamStore.createContact({type:kind,name:'Phone fixture',email:kind+'.phone@example.test',phone:'5500000204'},kamStore.snapshot().revision));
  const exp=ok(kam.beginDraft({contactId:c.id,kind},kamStore.snapshot().revision)),entry=ok(kam.getOrCreateEntryLink(exp.id,{},kamStore.snapshot().revision));
  const holder={id:'holder_v36_'+kind,role:'holder'},hStore=Store.createStore({storage:disk,actor:holder}),hApi=Assisted.createAssisted({store:hStore,actor:holder});
  const ch=ok(hApi.requestDemoVerification({email:c.email,kind,entryToken:entry.token,mode:'new_account'})),proof=ok(hApi.verifyDemoCode(ch.challengeId,ch.demoCode));
  ok(hApi.openEntryLink(entry.token,{email:c.email,phone:'55 0000 0299',proofToken:proof.proofToken},hStore.snapshot().revision));
  const after=kamStore.getContact(c.id);assert.equal(after.phone,'5500000299','registration phone saved into the ficha');assert.equal(after.assignedKam,'kam_ana','responsable preserved');
  assert.equal(Object.keys(kamStore.snapshot().expedients).length,1,'same expediente');
  assert.ok(Object.values(kamStore.snapshot().events).some(e=>e.type==='holder_phone_saved'&&e.expedientId===exp.id));
  // NIP: patient only, after initial registration; holder cannot fake it as KAM; acceptances remain holder-only.
  const before=ok(kam.recordBureauNip?{ok:true,value:true}:{ok:false,error:'missing'});assert.ok(before);
  const early=kam.recordBureauNip(exp.id,{nip:'123456'},kamStore.snapshot().revision);assert.equal(early.ok,false);
  require('./fixtures/registered-expedient.cjs')({storage:disk,staff:kamActor,expId:exp.id,holder,now:()=>new Date('2026-10-14T12:00:00Z')});
  const r=kam.recordBureauNip(exp.id,{nip:'123456'},kamStore.snapshot().revision);
  if(kind==='doctor'){assert.equal(r.ok,false);assert.match(r.error,/corresponde al paciente/);}
  else{
   assert.equal(r.ok,true,r.error);const saved=kamStore.snapshot().expedients[exp.id];
   assert.equal(saved.bureauNip.capturedBy,'kam_ana');assert.ok(saved.bureauNip.at);assert.equal(saved.bureauNip.masked,'••••56');assert.equal(JSON.stringify(saved).includes('123456'),false,'NIP not stored in clear');
   const ev=Object.values(kamStore.snapshot().audit).find(e=>e.type==='bureau_nip_captured_by_kam');assert.equal(ev.label,'NIP capturado por KAM');assert.equal(ev.actorId,'kam_ana');assert.ok(ev.capturedAt);
   assert.equal(saved.holderActions.buroConsent,undefined,'KAM NIP does not mark the patient authorization');
   assert.equal(kam.recordBureauNip(exp.id,{nip:'12'},kamStore.snapshot().revision).ok,false);
   const kamAccept=kam.holderAction(exp.id,'buroConsent',{confirmed:true,demo:true},kamStore.snapshot().revision);assert.equal(kamAccept.ok,false,'Buró acceptance stays holder-only');
   const kamSign=kam.holderAction(exp.id,'contractSignature',{confirmed:true,demo:true},kamStore.snapshot().revision);assert.equal(kamSign.ok,false,'signature stays holder-only');
  }
  console.log('PASS',kind,'registration phone into ficha (same expediente/responsable); Buró NIP',kind==='patient'?'captured by KAM with history, acceptances/signature holder-only':'rejected for doctor');
 }
 // 4. Assisted patient never opens on the personal location step.
 assert.equal(Patient.resumeView({},'',{assistant:true}),'procedimiento');
 assert.equal(Patient.resumeView({},'#geolocalizacion',{assistant:true}),'procedimiento');
 assert.equal(Patient.resumeView({procedureDone:true,estimateDone:true},'',{assistant:true}),'identidad');
 assert.equal(Patient.resumeView({},'',{}),'geolocalizacion','holder still starts with location');
 console.log('PASS assisted patient starts at the first KAM-capturable step; holder unchanged');
 // 5. Holder session: 30 minutes of inactivity, sliding, never revived.
 {const session=new MemoryStorage();let t=Date.parse('2026-10-14T12:00:00Z');const now=()=>t;
  session.setItem(Session.HOLDER_KEY,JSON.stringify({actor:{id:'holder_x',role:'holder'},expId:'exp_x',demo:true,expiresAt:t+Session.HOLDER_IDLE}));
  assert.equal(Session.HOLDER_IDLE,30*60*1000);
  t+=29*60*1000;assert.equal(Session.touchHolderSession({sessionStorage:session,now}),true);
  t+=29*60*1000;assert.ok(JSON.parse(session.getItem(Session.HOLDER_KEY)).expiresAt>t,'activity extends the session');
  t+=31*60*1000;assert.equal(Session.touchHolderSession({sessionStorage:session,now}),false,'expired session is not revived');
  console.log('PASS holder session closes after 30 min without activity and slides with activity');
 }
 const native=fs.readFileSync(path.join(__dirname,'..','assets','js','native-registration.js'),'utf8');
 assert.doesNotMatch(native,/1800000/,'partial initial registration has no 30-minute limit');assert.match(native,/pulzzo_native_registration_progress_v1/);
 console.log('PASS partial initial registration is kept without time limit (field autosave)');
})().catch(e=>{console.error(e);process.exitCode=1;});
