/* Native initial forms → explicit local verification → the same CRM expediente.
 * Passwords and personal confirmations are never copied into the draft. */
(function(root){'use strict';
const KEY='pulzzo_native_registration_v1';
const take=out=>{if(!out?.ok){const e=Error(out?.error||'No se pudo abrir el registro.');e.code=out?.code;throw e;}return out.value;};
const LOGIN_CODES=['EXISTING_ACCOUNT_EMAIL','EXISTING_ACCOUNT_PHONE','EXISTING_LOGIN_REQUIRED','IDENTITY_RECONCILIATION'];
function stage(kind,data){
 const p=new URLSearchParams(root.location.search), email=String(data.email||'').trim().toLowerCase();
 if(!['doctor','patient'].includes(kind)||!email||!String(data.name||'').trim()||!String(data.phone||'').trim())throw Error('Completa los datos iniciales.');
 if(kind==='doctor'){const p=data.initial?.profile||{},missing=[];if(!['doctor','clinica'].includes(p.accountType))missing.push('tipo de cuenta');if(!String(p.state||'').trim())missing.push('estado');if(!String(p.city||'').trim())missing.push('municipio');if(!Array.isArray(data.specialties)||!data.specialties.length)missing.push('al menos una especialidad');if(missing.length)throw Error('Para continuar completa: '+missing.join(', ')+'.');}
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
 const fail=e=>{message.className='toast err';message.textContent=e.message;
  // v36: duplicate registration → plain message plus a direct «Iniciar sesión» button to the right portal.
  if(LOGIN_CODES.includes(e&&e.code)&&typeof root.document.createElement==='function'&&message.appendChild){const login=root.document.createElement('a');login.className='btn btn-primary';login.dataset.duplicateLogin=draft&&draft.kind||'';const portal=e.code==='IDENTITY_RECONCILIATION'?(draft&&draft.kind==='doctor'?'patient':'doctor'):(draft&&draft.kind);login.href=portal==='doctor'?'login-doctor.html':'login-paciente.html';login.textContent='Iniciar sesión';login.style.marginTop='10px';login.style.display='inline-flex';message.appendChild(root.document.createElement('br'));message.appendChild(login);}
 };
 try{
 draft=JSON.parse(root.sessionStorage.getItem(KEY)||'null');
 if(!draft||draft.version!==1||!['doctor','patient'].includes(draft.kind)||!Number.isFinite(draft.createdAt)||draft.createdAt>Date.now()+60000)throw Error('Vuelve al formulario inicial para iniciar una verificación nueva.');
 const receipt=draft.verified;
 actor=receipt&&receipt.expiresAt>Date.now()?receipt.actor:{id:'holder_demo_'+root.crypto.randomUUID(),role:'holder',email:draft.email};
 store=root.PulzzoCRMStore.createStore({storage:root.localStorage,actor});api=root.PulzzoCRMAssisted.createAssisted({store,actor});
 if(receipt&&receipt.expiresAt>Date.now()){
 registeredExp=take(api.getExpedient(receipt.expId)).expedient;
 if(actor.role!=='holder'||registeredExp.kind!==draft.kind||registeredExp.holderIdentity?.id!==actor.id||registeredExp.holderIdentity?.email!==draft.email)throw Error('Vuelve a abrir el acceso de tu expediente.');
 root.document.getElementById('verify-copy').textContent='El acceso demo ya fue verificado. Continúa para terminar de guardar tus datos iniciales.';code.disabled=true;button.disabled=false;button.textContent='Continuar registro';
 }else{
 challenge=take(api.requestDemoVerification({email:draft.email,phone:draft.phone,kind:draft.kind,entryToken:draft.entry||undefined,token:draft.invite||undefined,mode:'new_account'}));
 root.document.getElementById('verify-copy').textContent='Simulación local para '+draft.email+'. Código de ejemplo: '+challenge.demoCode+'. No se envió correo; no acredita identidad real.';
 // v36c: KAM-created contact → the client continues the same expediente; show who is attending them.
 if(challenge.advisorMessage){const m=root.document.getElementById('message');if(m){m.className='toast ok';m.dataset.advisor='1';m.textContent=challenge.advisorMessage;}}
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
 const exp=draft.entry?take(api.openEntryLink(draft.entry,{email:draft.email,phone:draft.phone,proofToken:proof.proofToken},s.revision)):draft.invite?take(api.claim(draft.invite,{email:draft.email,phone:draft.phone,proofToken:proof.proofToken},s.revision)):take(api.createSelfService({kind:draft.kind,name:draft.name,email:draft.email,phone:draft.phone,proofToken:proof.proofToken,referralToken:draft.ref||undefined},s.revision));
 registeredExp=exp;
 draft.verified={actor,expId:exp.id,expiresAt:Date.now()+30*60*1000};root.sessionStorage.setItem(KEY,JSON.stringify(draft));
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
 root.sessionStorage.setItem(root.PulzzoCRMOnboarding.HOLDER_KEY,JSON.stringify({actor,expId:exp.id,demo:true,expiresAt:Date.now()+(root.PulzzoCRMOnboarding.HOLDER_IDLE||30*60*1000),entryToken:draft.entry||null}));
 const route=root.PulzzoCRMOnboarding.start({actor,expId:exp.id,kind:draft.kind,returnUrl:'asistido-demo.html?review=1'});
 completed=true;root.sessionStorage.removeItem(KEY);clearProgress();root.location.href=route.url;
 }catch(e){fail(e);button.disabled=false;}
 });
}
// Partial initial registration: every typed field is kept locally without time limit
// (never passwords, files, consents or other checkboxes) and restored on return with the same link.
const PROGRESS='pulzzo_native_registration_progress_v1';
function progressKey(kind){const p=new URLSearchParams(root.location.search);return PROGRESS+':'+kind+':'+(p.get('entry')||p.get('invite')||'self');}
function autosave(){
 const doc=root.document;if(!doc)return;const kind=doc.getElementById('correo_med')?'doctor':doc.getElementById('register-demo-btn')?'patient':null;if(!kind)return;
 const form=(kind==='doctor'?doc.getElementById('correo_med'):doc.getElementById('register-demo-btn')).closest('form');if(!form)return;
 const key=progressKey(kind),skip=el=>!el.id||['password','file','checkbox','radio','hidden','submit','button'].includes(el.type)||el.readOnly;
 let saved={};try{saved=JSON.parse(root.localStorage.getItem(key)||'{}')||{};}catch(_){saved={};}
 form.querySelectorAll('input,select,textarea').forEach(el=>{if(skip(el))return;if(typeof saved[el.id]==='string'&&el.value!==saved[el.id]){el.value=saved[el.id];el.dispatchEvent(new Event('input',{bubbles:true}));}});
 const persist=event=>{const el=event.target;if(!el||!form.contains(el)||skip(el))return;saved[el.id]=String(el.value||'').slice(0,500);try{root.localStorage.setItem(key,JSON.stringify(saved));}catch(_){}};
 form.addEventListener('input',persist);form.addEventListener('change',persist);
}
function clearProgress(){try{Object.keys(root.localStorage).filter(k=>k.indexOf(PROGRESS+':')===0).forEach(k=>root.localStorage.removeItem(k));}catch(_){}}
// Runs after the page's own demo defaults so the person's typed values win.
if(root.document&&root.addEventListener){if(root.document.readyState==='complete')setTimeout(autosave,0);else root.addEventListener('load',()=>setTimeout(autosave,0));}
root.PulzzoNativeRegistration={stage,verify,KEY,autosave,PROGRESS};
})(window);
