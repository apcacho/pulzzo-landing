'use strict';
// Shipped entry scripts and gateway DOM handlers in Node VM. No browser execution.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {setup,storage,enterIdentity,finishVerification,assertFullDestination}=require('./crm-registration-layout.cjs');
const Store=require('../assets/js/crm-demo-store.js'),Assisted=require('../assets/js/crm-assisted.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const patientEntry=read('registro-paciente.html').match(/<script>\s*(\(function \(\) \{\s*\/\/ Preserve the referral[\s\S]*?)<\/script>/)[1];
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS',name);}
function entry(kind,search='',hash='',disk=storage()){
 const start='https://demo.example.test/'+(kind==='doctor'?'registro-doctor':'registro-paciente')+'.html'+search+hash;
 let url=new URL(start);const location={get href(){return url.href;},set href(v){url=new URL(v,url);},get search(){return url.search;},get hash(){return url.hash;},replace(v){this.href=v;}};
 const root={location,localStorage:disk,addEventListener(){}};root.window=root;
 const document={getElementById:()=>({querySelectorAll:()=>[],addEventListener(){}})};const ctx=vm.createContext({window:root,document,URLSearchParams,console});
 // Patient's explicit legacy recovery is covered by patient-auth.cjs. All entry
 // decisions before that recovery execute unchanged here.
 vm.runInContext(kind==='doctor'?read('assets/js/doctor-shared-onboarding.js'):patientEntry.slice(0,patientEntry.indexOf('  var form = '))+'})();',ctx);
 return {root,url:new URL(location.href),start};
}
function count(h){return Object.keys(h.state()?.expedients||{}).length;}
function fixtureEmail(kind,suffix=''){return kind+suffix+'@example.test';}
async function signup(kind,options={},suffix=''){
 const h=setup(kind,'',{...options,realOnboarding:true});
 await enterIdentity(h,fixtureEmail(kind,suffix));await finishVerification(h);
 assert.equal(count(h),options.expectedCount||1,h.toast.textContent);
 const exp=Object.values(h.state().expedients).find(e=>e.holderIdentity.email===fixtureEmail(kind,suffix));
 assertFullDestination(h,kind,exp.id);return {h,exp};
}
function recordAccess(kind,record,options={}){
 return setup(kind,'',{...options,realOnboarding:true,location:{search:'?login=1&kind='+kind+'&record='+encodeURIComponent(record),hash:''}});
}
(async()=>{
 for(const kind of ['patient','doctor']){
  await test(kind+': ordinary and referral entry preserve the original native page without legacy writes',()=>{
   const disk=storage(),legacyKey=kind==='patient'?'pulzzo_patient':'pulzzo_doctor';disk.setItem(legacyKey,'{"accountId":"old","email":"old@example.test"}');
   const unchanged=disk.getItem(legacyKey);
   for(const query of ['', '?utm_source=landing','?ref=valid-ref','?legacy=1&ref=valid-ref']){
    const out=entry(kind,query,'',disk);assert.equal(out.url.pathname,kind==='doctor'?'/registro-doctor.html':'/registro-paciente.html');assert.equal(out.url.href,out.start);
    assert.equal(out.url.searchParams.get('ref'),query.includes('ref=')?'valid-ref':null);assert.equal(disk.getItem(legacyKey),unchanged);assert.equal(disk.getItem(Store.STORAGE_KEY),null);
   }
   const emptyLegacy=entry(kind,'?legacy=1');assert.equal(emptyLegacy.url.href,emptyLegacy.start);
  });
  await test(kind+': cancellation, wrong/used codes never create CRM; success creates exactly one Admin-owned full-form record',async()=>{
   const h=setup(kind,'',{realOnboarding:true});assert.equal(h.disk.getItem(Store.STORAGE_KEY),null);
   await enterIdentity(h,fixtureEmail(kind));assert.equal(count(h),0);assert.equal(h.disk.getItem(Store.STORAGE_KEY),null);
   const cancelled=h.native.nodes['verify-form'].submit;h.native.events.pagehide.forEach(fn=>fn({}));cancelled({preventDefault(){}});assert.equal(count(h),0);
   h.context.location.href=(kind==='doctor'?'registro-doctor.html':'registro-paciente.html');await enterIdentity(h,fixtureEmail(kind));
   const realCode=h.native.nodes['verify-copy'].textContent.match(/Código de ejemplo: (\d{6})/)[1];
   for(let i=0;i<5;i++){h.native.submit('000000');assert.equal(count(h),0);}
   h.native.submit(realCode);assert.equal(count(h),0);assert.match(h.toast.textContent,/venció|usó/);
   h.context.location.href=(kind==='doctor'?'registro-doctor.html':'registro-paciente.html');await enterIdentity(h,fixtureEmail(kind));const used=h.native.nodes['verify-form'].submit;await finishVerification(h);
   const exp=Object.values(h.state().expedients)[0],contact=h.state().contacts[exp.contactId],snapshot=h.disk.getItem(Store.STORAGE_KEY);
   assert.equal(contact.assignedKam,'admin_demo');assert.equal(contact.referringKam,null);assert.equal(contact.accountId,exp.holderIdentity.id);assert.deepEqual(exp.holderActions,{});
   assertFullDestination(h,kind,exp.id);assert.equal(h.disk.getItem(kind==='patient'?'pulzzo_patient':'pulzzo_doctor'),null);
   used({preventDefault(){}});assert.equal(h.disk.getItem(Store.STORAGE_KEY),snapshot);assert.equal(count(h),1);
   // Back/forward creates a fresh access view, never silently resumes a stale owner.
   const again=setup(kind,'',{disk:h.disk,session:h.session,realOnboarding:true});assert.equal(again.get('identityForm'),undefined);assert.match(again.context.location.href,/registro-/);
  });
  await test(kind+': valid referral retains KAM and invalid referral creates no record',async()=>{
   const disk=storage(),actor={id:'organic_kam',role:'kam'},staff=Store.createStore({storage:disk,actor});
   const ref=staff.createReferral(kind,staff.snapshot().revision);assert.ok(ref.ok,ref.error);
   const h=setup(kind,'&ref='+ref.value.token,{disk,realOnboarding:true});await enterIdentity(h,fixtureEmail(kind,'-referred'));await finishVerification(h);
   const exp=Object.values(h.state().expedients)[0],contact=h.state().contacts[exp.contactId];assert.equal(contact.assignedKam,actor.id);assert.equal(contact.referringKam,actor.id);assertFullDestination(h,kind,exp.id);
   const invalid=setup(kind,'&ref=not-a-valid-referral',{realOnboarding:true});await enterIdentity(invalid,fixtureEmail(kind,'-invalid'));await finishVerification(invalid);assert.equal(count(invalid),0);assert.equal(invalid.context.location.href,undefined);
  });
  await test(kind+': exact per-record link verifies its holder and never resumes another existing record',async()=>{
   const first=await signup(kind),second=await signup(kind,{disk:first.h.disk,session:first.h.session,expectedCount:2},'-other');
   const disk=first.h.disk,before=disk.getItem(Store.STORAGE_KEY);
   const exact=recordAccess(kind,first.exp.id,{disk,session:second.h.session});assert.ok(exact.get('identityForm'),'Even an existing session must verify');assert.equal(exact.get('continueOnboarding'),undefined);assert.equal(exact.field('identityForm','existing').disabled,true);
   await enterIdentity(exact,fixtureEmail(kind),false);await finishVerification(exact);assertFullDestination(exact,kind,first.exp.id);assert.equal(disk.getItem(Store.STORAGE_KEY),before);
   for(const [record,email] of [[first.exp.id,fixtureEmail(kind,'-other')],['missing-record',fixtureEmail(kind)],['',fixtureEmail(kind)]]){
    const denied=recordAccess(kind,record,{disk,session:storage()});await enterIdentity(denied,email,true);await finishVerification(denied);assert.equal(denied.context.location.href,undefined);assert.match(denied.html(),/no corresponde a un expediente/);assert.equal(denied.session.getItem('pulzzo_crm_holder_demo_session'),null);assert.equal(disk.getItem(Store.STORAGE_KEY),before);
    assert.doesNotMatch(denied.html(),/href="[^\"]*(?:record=|crmMode=|crmExp=)/,'Alternate access does not carry scoped record or privileged form parameters');
   }
   const stripped=setup(kind,'',{disk,session:second.h.session,realOnboarding:true,location:{search:'?kind='+kind+'&record='+first.exp.id,hash:''}});assert.ok(stripped.get('identityForm'),'Removing login cannot bypass record verification');
   for(const badKind of ['garbage','']){const bad=setup(kind,'',{disk,session:storage(),realOnboarding:true,location:{search:'?record='+first.exp.id+'&kind='+badKind,hash:''}});assert.equal(bad.get('identityForm'),undefined);assert.equal(bad.context.location.href,undefined);assert.match(bad.html(),/tipo de expediente válido/);}
   const mixed=setup(kind,'',{disk,session:storage(),realOnboarding:true,location:{search:'?kind='+kind+'&record='+first.exp.id,hash:'#invite=other'}});assert.equal(mixed.get('identityForm'),undefined);assert.match(mixed.html(),/mezcla una invitación/);assert.equal(disk.getItem(Store.STORAGE_KEY),before);
  });
  await test(kind+': same-email other-kind and matching legacy identities never merge or duplicate',async()=>{
   const otherKind=kind==='patient'?'doctor':'patient',first=await signup(kind),before=first.h.disk.getItem(Store.STORAGE_KEY);
   const other=setup(otherKind,'',{disk:first.h.disk,realOnboarding:true});await enterIdentity(other,fixtureEmail(kind));assert.equal(other.get('codeForm'),undefined);assert.equal(first.h.disk.getItem(Store.STORAGE_KEY),before);
   const wrongKind=recordAccess(otherKind,first.exp.id,{disk:first.h.disk});await enterIdentity(wrongKind,fixtureEmail(kind),true);assert.equal(wrongKind.get('codeForm'),undefined);assert.equal(wrongKind.context.location.href,undefined);assert.equal(first.h.disk.getItem(Store.STORAGE_KEY),before);
   const disk=storage(),legacyKey=kind==='patient'?'pulzzo_patient':'pulzzo_doctor',idKey=kind==='patient'?'patientAccountId':'doctorAccountId',stateKey=kind==='patient'?'pulzzo_application':'pulzzoDoctorOnboardingCleanV3';
   disk.setItem(legacyKey,JSON.stringify({[idKey]:'legacy_identity',correo:'old@example.test'}));disk.setItem(stateKey,'{"files":{"original":"preserve"},"progress":"keep"}');
   const savedAccount=disk.getItem(legacyKey),savedState=disk.getItem(stateKey),legacy=setup(kind,'',{disk,realOnboarding:true});
   await enterIdentity(legacy,'old@example.test');assert.equal(legacy.get('codeForm'),undefined);assert.equal(count(legacy),0);
   const login=setup(kind,'&login=1',{disk,realOnboarding:true});await enterIdentity(login,'old@example.test',true);await finishVerification(login);assert.equal(login.context.location.href,undefined);assert.match(login.html(),/portal anterior/);assert.equal(count(login),0);
   assert.equal(disk.getItem(legacyKey),savedAccount);assert.equal(disk.getItem(stateKey),savedState);assert.equal(disk.getItem(Store.STORAGE_KEY),null);
  });
 }
 await test('cached verification after pagehide requires a fresh demo code',async()=>{
  const h=setup('patient','',{realOnboarding:true});await enterIdentity(h,'cached@example.test');const old=h.native.nodes['verify-form'].submit;h.native.events.pagehide.forEach(fn=>fn({}));old({preventDefault(){}});assert.equal(count(h),0);h.native.events.pageshow.forEach(fn=>fn({persisted:true}));old({preventDefault(){}});assert.equal(count(h),0);await finishVerification(h);assert.equal(count(h),1);

 });
 await test('provider legacy bookmarks remain read-only during routing and explicit continuation reaches old login',()=>{
  const disk=storage();disk.setItem('pulzzo_doctor','{"doctorAccountId":"old","correo":"old@example.test"}');disk.setItem('pulzzoDoctorOnboardingCleanV3','{"doctorAccountId":"old","profile":{"email":"old@example.test"},"files":{"keep":["original"]}}');
  const before=[disk.getItem('pulzzo_doctor'),disk.getItem('pulzzoDoctorOnboardingCleanV3')];
  for(const query of ['', '?legacy=1']){const route=entry('doctor',query,'#perfil-medico',disk);assert.equal(route.url.href,route.start);assert.equal(route.root.PulzzoSharedDoctorOnboarding.requested,false);}
  assert.equal(entry('doctor','?legacy=1','',disk).url.pathname,'/registro-doctor.html');assert.equal(entry('doctor','','#perfil-medico').url.pathname,'/registro-doctor.html');
  assert.deepEqual([disk.getItem('pulzzo_doctor'),disk.getItem('pulzzoDoctorOnboardingCleanV3')],before);
  for(const file of ['login-doctor.html','verificacion-doctor.html'])assert.match(read(file),/registro-doctor\.html\?legacy=1#perfil-medico/);
 });
 await test('expired simulated verification fails without a contact or expediente',()=>{
  const disk=storage(),actor={id:'expired_demo_holder',role:'holder'};let now=Date.now();const clock=()=>new Date(now).toISOString(),store=Store.createStore({storage:disk,actor,now:clock}),api=Assisted.createAssisted({store,actor,now:clock});
  const challenge=api.requestDemoVerification({kind:'patient',email:'expired@example.test'});assert.ok(challenge.ok);now+=11*60000;
  const expired=api.verifyDemoCode(challenge.value.challengeId,challenge.value.demoCode);assert.equal(expired.ok,false);assert.equal(expired.code,'CODE_EXPIRED');assert.equal(disk.getItem(Store.STORAGE_KEY),null);
 });
 console.log('PASS: '+passed+' organic/signup, exact-record access and legacy preservation regressions. Node VM only; browser rendering unverified.');
})().catch(error=>{console.error(error);process.exitCode=1;});
