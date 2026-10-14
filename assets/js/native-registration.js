/* Native initial forms → explicit local verification → the same CRM expediente.
 * Passwords and personal confirmations are never copied into the draft. */
(function(root){'use strict';
const KEY='pulzzo_native_registration_v1';
const take=out=>{if(!out?.ok)throw Error(out?.error||'No se pudo abrir el registro.');return out.value;};
function stage(kind,data){
 const p=new URLSearchParams(root.location.search), email=String(data.email||'').trim().toLowerCase();
 if(!['doctor','patient'].includes(kind)||!email||!String(data.name||'').trim()||!String(data.phone||'').trim())throw Error('Completa los datos iniciales.');
 // Explicit allowlist: never serialize FormData, passwords, terms or permissions.
 const draft={version:1,kind,name:data.name,email,phone:data.phone,createdAt:Date.now(),ref:p.get('ref'),entry:p.get('entry'),invite:p.get('invite')};
 if(kind==='patient')draft.nameParts={first:data.nameParts.first,second:data.nameParts.second,paternal:data.nameParts.paternal,maternal:data.nameParts.maternal};
 if(kind==='doctor')draft.doctor={profile:data.initial.profile,contact:{registered:data.phone},specialties:data.specialties,procedures:data.initial.procedures};
 root.sessionStorage.setItem(KEY,JSON.stringify(draft));
 root.location.href=(kind==='doctor'?'verificacion-doctor.html':'verificacion-cuenta.html')+'?native=1';
}
function verify(){
 if(new URLSearchParams(root.location.search).get('native')!=='1')return;
 const form=root.document.getElementById('verify-form'),code=root.document.getElementById('code'),button=root.document.getElementById('verify-btn'),message=root.document.getElementById('message');
 let draft,store,api,actor,challenge,completed=false,registeredExp=null,pageActive=true,restored=false;
 root.addEventListener?.('pagehide',()=>{pageActive=false;});
 root.addEventListener?.('pageshow',event=>{if(event.persisted&&!pageActive&&!restored){restored=true;verify();}});
 const fail=e=>{message.className='toast err';message.textContent=e.message;};
 try{
 draft=JSON.parse(root.sessionStorage.getItem(KEY)||'null');
 if(!draft||draft.version!==1||!['doctor','patient'].includes(draft.kind)||!Number.isFinite(draft.createdAt)||Date.now()-draft.createdAt>1800000||draft.createdAt>Date.now())throw Error('Vuelve al formulario inicial para iniciar una verificación nueva.');
 const receipt=draft.verified;
 actor=receipt&&receipt.expiresAt>Date.now()?receipt.actor:{id:'holder_demo_'+root.crypto.randomUUID(),role:'holder',email:draft.email};
 store=root.PulzzoCRMStore.createStore({storage:root.localStorage,actor});api=root.PulzzoCRMAssisted.createAssisted({store,actor});
 if(receipt&&receipt.expiresAt>Date.now()){
 registeredExp=take(api.getExpedient(receipt.expId)).expedient;
 if(actor.role!=='holder'||registeredExp.kind!==draft.kind||registeredExp.holderIdentity?.id!==actor.id||registeredExp.holderIdentity?.email!==draft.email)throw Error('Vuelve a abrir el acceso de tu expediente.');
 root.document.getElementById('verify-copy').textContent='El acceso demo ya fue verificado. Continúa para terminar de guardar tus datos iniciales.';code.disabled=true;button.disabled=false;button.textContent='Continuar registro';
 }else{
 challenge=take(api.requestDemoVerification({email:draft.email,kind:draft.kind,entryToken:draft.entry||undefined,token:draft.invite||undefined,mode:'new_account'}));
 root.document.getElementById('verify-copy').textContent='Simulación local para '+draft.email+'. Código de ejemplo: '+challenge.demoCode+'. No se envió correo; no acredita identidad real.';
 code.disabled=false;button.disabled=false;
 }
 root.document.getElementById('resend').onclick=()=>{message.className='toast ok';message.textContent=challenge?'Código demo: '+challenge.demoCode:'Tu acceso demo ya está verificado.';};
 }catch(e){fail(e);button.disabled=true;return;}
 form.addEventListener('submit',event=>{
 event.preventDefault();if(completed||!pageActive)return;
 try{
 if(!registeredExp){
 const proof=take(api.verifyDemoCode(challenge.challengeId,code.value));
 const s=store.snapshot();
 const exp=draft.entry?take(api.openEntryLink(draft.entry,{email:draft.email,proofToken:proof.proofToken},s.revision)):draft.invite?take(api.claim(draft.invite,{email:draft.email,proofToken:proof.proofToken},s.revision)):take(api.createSelfService({kind:draft.kind,name:draft.name,email:draft.email,phone:draft.phone,proofToken:proof.proofToken,referralToken:draft.ref||undefined},s.revision));
 registeredExp=exp;
 draft.verified={actor,expId:exp.id,expiresAt:Date.now()+600000};root.sessionStorage.setItem(KEY,JSON.stringify(draft));
 }
 const exp=take(api.getExpedient(registeredExp.id)).expedient;button.disabled=true;
 if(!exp.initialRegistration){
 let records=exp.onboarding?.records||root.PulzzoCRMOnboarding.seedRecords(exp,store.getContact(exp.contactId));
 if(draft.kind==='doctor'){
 const state=JSON.parse(records.pulzzoDoctorOnboardingCleanV3);
 Object.assign(state,{profile:{...state.profile,...draft.doctor.profile,email:exp.holderIdentity.email},contact:{...state.contact,registered:draft.phone},specialties:draft.doctor.specialties,procedures:draft.doctor.procedures,currentStep:Math.max(2,state.currentStep||1)});
 records={...records,pulzzoDoctorOnboardingCleanV3:JSON.stringify(state)};
 }
 if(draft.kind==='patient'){const state=JSON.parse(records.pulzzo_application);state.identity={...state.identity,name:draft.name,nameParts:draft.nameParts};records={...records,pulzzo_application:JSON.stringify(state)};}
 take(api.saveOnboarding(exp.id,{records},store.snapshot().revision));
 take(api.completeInitialRegistration(exp.id,store.snapshot().revision));
 }
 root.sessionStorage.setItem(root.PulzzoCRMOnboarding.HOLDER_KEY,JSON.stringify({actor,expId:exp.id,demo:true,expiresAt:Date.now()+600000,entryToken:draft.entry||null}));
 const route=root.PulzzoCRMOnboarding.start({actor,expId:exp.id,kind:draft.kind,returnUrl:'asistido-demo.html?review=1'});
 completed=true;root.sessionStorage.removeItem(KEY);root.location.href=route.url;
 }catch(e){fail(e);button.disabled=false;}
 });
}
root.PulzzoNativeRegistration={stage,verify,KEY};
})(window);
