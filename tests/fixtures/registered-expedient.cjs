// Current workflow fixture: an actual holder verification and initial registration
// precede KAM assistance. Uses production services, never patches their guards.
const assert=require('node:assert/strict');
const Store=require('../../assets/js/crm-demo-store.js'),Assisted=require('../../assets/js/crm-assisted.js'),Session=require('../../assets/js/crm-onboarding-session.js');
module.exports=function({storage,staff,expId,holder={id:'holder_fixture',role:'holder'},now}){
 const ok=r=>{assert.equal(r.ok,true,r.error);return r.value;};
 const staffStore=Store.createStore({storage,actor:staff,now}),staffApi=Assisted.createAssisted({store:staffStore,actor:staff,now});
 const old=ok(staffApi.getExpedient(expId)).expedient,contact=staffStore.getContact(old.contactId);
 const store=Store.createStore({storage,actor:holder,now}),api=Assisted.createAssisted({store,actor:holder,now});
 if(!old.holderIdentity){const invitation=ok(staffApi.invite(expId,{email:contact.email},staffStore.snapshot().revision));const challenge=ok(api.requestDemoVerification({kind:old.kind,email:contact.email,token:invitation.token})),proof=ok(api.verifyDemoCode(challenge.challengeId,challenge.demoCode));ok(api.claim(invitation.token,{email:contact.email,proofToken:proof.proofToken},store.snapshot().revision));}
 const exp=ok(api.getExpedient(expId)).expedient;
 if(!exp.initialRegistration){const records=exp.onboarding?.records||Session.seedRecords(exp,contact),key=exp.kind==='doctor'?'pulzzoDoctorOnboardingCleanV3':'pulzzo_application',state=JSON.parse(records[key]);
 if(exp.kind==='doctor'){Object.assign(state.profile,{state:'Ciudad de México',city:'Benito Juárez'});state.specialties=['Cardiología'];state.currentStep=2;}else state.identity.nameParts={first:'Persona',second:'',paternal:'Ficticia',maternal:''};
 records[key]=JSON.stringify(state);ok(api.saveOnboarding(expId,{records},store.snapshot().revision));ok(api.completeInitialRegistration(expId,store.snapshot().revision));}
 return {store,api,holder};
};
