'use strict';
const assert=require('node:assert/strict');
const {setup,storage,enterIdentity,finishVerification}=require('./crm-registration-layout.cjs');
const Store=require('../assets/js/crm-demo-store.js'),Assisted=require('../assets/js/crm-assisted.js');
(async()=>{
 for(const kind of ['patient','doctor']){
 const disk=storage(),session=storage(),actor={id:'kam_entry',role:'kam'},store=Store.createStore({storage:disk,actor}),api=Assisted.createAssisted({store,actor});
 const ok=r=>{assert.equal(r.ok,true,r.error);return r.value;};
 const c=ok(store.createContact({type:kind,name:'Entry Demo',email:kind+'@entry.test',phone:'5512345678',assignedKam:actor.id,originalSource:'manual'},store.snapshot().revision));
 const exp=ok(api.beginDraft({contactId:c.id,kind},store.snapshot().revision)),entry=ok(api.getOrCreateEntryLink(exp.id,{},store.snapshot().revision));
 const h=setup(kind,'',{disk,session,location:{search:'',hash:'#entry='+entry.token},realOnboarding:true});
 await enterIdentity(h,c.email);await finishVerification(h);assert.ok(h.context.location.href,h.toast.textContent);
 let saved=JSON.parse(session.getItem('pulzzo_crm_holder_demo_session'));assert.equal(saved.entryToken,entry.token);assert.ok(saved.expiresAt>Date.now());
 const review=setup(kind,'',{disk,session,location:{search:'?review=1',hash:''},realOnboarding:true});assert.ok(review.get('continueOnboarding'),review.html());
 await review.get('continueOnboarding').dispatch('click');saved=JSON.parse(session.getItem('pulzzo_crm_holder_demo_session'));assert.equal(saved.entryToken,entry.token,'Review must preserve stable-entry provenance');
 const expirySession=storage();expirySession.setItem('pulzzo_crm_holder_demo_session',JSON.stringify(saved));
 const expiry=setup(kind,'',{disk,session:expirySession,location:{search:'?review=1',hash:''},realOnboarding:true});
 require('node:vm').runInContext('Date.now=()=>'+(saved.expiresAt+1),expiry.context);
 await expiry.get('refreshView').dispatch('click');assert.ok(expiry.get('identityForm'),'Expired render must return to usable verification');
 await enterIdentity(expiry,c.email,true);await finishVerification(expiry);assert.ok(expiry.context.location.href,expiry.toast.textContent);assert.equal(JSON.parse(expirySession.getItem('pulzzo_crm_holder_demo_session')).entryToken,entry.token);
 const frozenSession=storage();frozenSession.setItem('pulzzo_crm_holder_demo_session',JSON.stringify(saved));const frozen=setup(kind,'',{disk,session:frozenSession,location:{search:'?review=1',hash:''},realOnboarding:true});
 frozen.listeners.pagehide.forEach(fn=>fn({}));require('node:vm').runInContext('Date.now=()=>'+(saved.expiresAt+1),frozen.context);frozen.listeners.pageshow.forEach(fn=>fn({persisted:true}));assert.ok(frozen.get('identityForm'));await enterIdentity(frozen,c.email,true);await finishVerification(frozen);assert.ok(frozen.context.location.href,frozen.toast.textContent);
 const review2=setup(kind,'',{disk,session,location:{search:'?review=1',hash:''},realOnboarding:true});
 ok(api.revokeEntryLink(exp.id,{},store.snapshot().revision));await review2.get('continueOnboarding').dispatch('click');assert.equal(review2.context.location.href,undefined,'Revoked entry cannot resume native form from review');
 const reuse=setup(kind,'',{disk,session:storage(),location:{search:'',hash:'#entry='+entry.token},realOnboarding:true});assert.match(reuse.html(),/desactivado/);
 // Actual NoInteresado transition must revoke already-open claimed sessions,
 // including both the native capture adapter and review page event handlers.
 const renewed=ok(api.renewEntryLink(exp.id,{},store.snapshot().revision)),stageSession=storage();
 const stageHolder=setup(kind,'',{disk,session:stageSession,location:{search:'',hash:'#entry='+renewed.token},realOnboarding:true});
 await enterIdentity(stageHolder,c.email,true);await finishVerification(stageHolder);
 const Session=require('../assets/js/crm-onboarding-session.js'),capture=Session.open({storage:disk,sessionStorage:stageSession,kind,location:new URL(stageHolder.context.location.href,'https://demo.example.test')});
 assert.equal(capture.isCurrent(),true);assert.equal(capture.getExpedient().id,exp.id);
 const stageReview=setup(kind,'',{disk,session:stageSession,location:{search:'?review=1',hash:''},realOnboarding:true});
 assert.ok(stageReview.action('otp'));stageReview.get('check_otp').checked=true;
 ok(store.setStage(c.id,'not_interested',{reason:'No desea continuar'},store.snapshot().revision));
 assert.equal(store.snapshot().expedients[exp.id].entryLink.status,'revoked');assert.equal(capture.isCurrent(),false);assert.throws(()=>capture.assertHolderAction(),/sesión/);assert.throws(()=>capture.storage.getItem(kind==='doctor'?'pulzzoDoctorOnboardingCleanV3':'pulzzo_application'),/sesión/);
 const afterStage=disk.getItem(Store.STORAGE_KEY);await stageReview.action('otp').dispatch('click');assert.equal(disk.getItem(Store.STORAGE_KEY),afterStage,'Open review action must not mutate claimed record after NoInteresado');
 await stageReview.get('continueOnboarding').dispatch('click');assert.equal(stageReview.context.location.href,undefined,'Current review cannot reopen capture after NoInteresado');
 ok(store.setStage(c.id,'interested',{},store.snapshot().revision));assert.equal(store.snapshot().expedients[exp.id].entryLink.status,'revoked');assert.equal(capture.isCurrent(),false);
 const restored=setup(kind,'',{disk,session:storage(),location:{search:'',hash:'#entry='+renewed.token},realOnboarding:true});assert.match(restored.html(),/desactivado/,'Returning to active commercial stage must not resurrect old link');
 console.log('PASS stable entry roundtrip, current-session NoInteresado revocation, sticky reactivation and TTL recovery '+kind);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
