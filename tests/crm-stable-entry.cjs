'use strict';
const assert=require('node:assert/strict');
const Store=require('../assets/js/crm-demo-store.js');
const Assisted=require('../assets/js/crm-assisted.js');
const {holderIdentityDocument}=require('./fixtures/holder-identity-evidence.cjs');
let passed=0;const cases=[];
function test(name,fn){cases.push({name,fn});}
function storage(){const map=new Map();return {fail:false,getItem(k){return map.has(k)?map.get(k):null;},setItem(k,v){if(this.fail)throw Error('QuotaExceededError');map.set(k,String(v));},removeItem(k){map.delete(k);},dump(){return JSON.stringify([...map]);}};}
function ok(r){assert.equal(r.ok,true,r.error);return r.value;}
function denied(r,code){assert.equal(r.ok,false,'Expected refusal');if(code)assert.equal(r.code,code,r.error);return r;}
function fixture(kind='patient'){
 const disk=storage();let instant='2026-10-09T05:00:00.000Z',seq=0;
 const now=()=>instant,randomId=(prefix='id')=>prefix+'_'+(++seq);
 const staff={id:'kam_ana',role:'kam'},person={id:'holder_one',role:'holder',email:'demo.person@example.test'};
 const make=(actor,extra={})=>{const store=Store.createStore({storage:disk,actor,now,randomId});return {store,api:Assisted.createAssisted({store,actor,now,randomId,...extra})};};
 const kam=make(staff),contact=ok(kam.store.createContact({type:kind,name:'Persona Demo',email:person.email,phone:'5512345678',assignedKam:staff.id,originalSource:'manual'},kam.store.snapshot().revision));
 const exp=ok(kam.api.beginDraft({contactId:contact.id,kind},kam.store.snapshot().revision));
 return {disk,now,setTime(v){instant=v;},kind,make,kam,contact,exp,person,rev(){return kam.store.snapshot().revision;},invite(){return ok(kam.api.invite(exp.id,{email:person.email,ttlMinutes:60},this.rev()));},claim(inv,actor=person){const holder=make(actor),c=ok(holder.api.requestDemoVerification({token:inv.token,email:person.email,mode:'new_account'})),p=ok(holder.api.verifyDemoCode(c.challengeId,c.demoCode));ok(holder.api.claim(inv.token,{email:person.email,proofToken:p.proofToken},this.rev()));return holder;}};
}

const Context=require('../assets/js/crm-onboarding-session.js');
for(const kind of ['patient','doctor']){
 const f=fixture(kind),h=f.make(f.person),entry=ok(f.kam.api.getOrCreateEntryLink(f.exp.id,{},f.rev()));
 assert.equal(entry.expiresAt,null);assert.ok(!entry.url.includes(f.person.email));assert.equal(entry.url,'asistido-demo.html#entry='+entry.token);
 assert.equal(ok(f.kam.api.getOrCreateEntryLink(f.exp.id,{},f.rev())).token,entry.token);
 const anon=f.make({id:'other',role:'holder'}),projected=anon.store.snapshot({entryToken:entry.token});assert.equal(projected.expedients[f.exp.id].fields,undefined);assert.equal(projected.expedients[f.exp.id].documents,undefined);
 denied(anon.api.getExpedient(f.exp.id));denied(h.api.requestDemoVerification({entryToken:entry.token,email:'wrong@example.test'}),'WRONG_IDENTITY');
 f.setTime('2026-10-10T05:00:00.000Z');assert.equal(ok(h.api.resolveEntryLink(entry.token)).kind,kind);
 const challenge=ok(h.api.requestDemoVerification({entryToken:entry.token,email:f.person.email,kind}));
 f.setTime('2026-10-10T05:11:00.000Z');denied(h.api.verifyDemoCode(challenge.challengeId,challenge.demoCode),'CODE_EXPIRED');
 const challenge2=ok(h.api.requestDemoVerification({entryToken:entry.token,email:f.person.email,kind})),proof=ok(h.api.verifyDemoCode(challenge2.challengeId,challenge2.demoCode));
 const claimed=ok(h.api.openEntryLink(entry.token,{email:f.person.email,proofToken:proof.proofToken},f.rev()));assert.equal(claimed.id,f.exp.id);assert.equal(ok(f.kam.api.getOrCreateEntryLink(f.exp.id,{},f.rev())).token,entry.token);
 assert.equal(Object.values(f.kam.store.snapshot().invitations).find(i=>i.token===entry.token).status,'consumed');
 denied(h.api.openEntryLink(entry.token,{email:f.person.email,proofToken:proof.proofToken},f.rev()),'IDENTITY_REQUIRED');
 denied(anon.api.requestDemoVerification({entryToken:entry.token,email:f.person.email,kind,mode:'existing_login'}),'EXISTING_LOGIN_REQUIRED');
 const c3=ok(h.api.requestDemoVerification({entryToken:entry.token,email:f.person.email,kind,mode:'existing_login'})),p3=ok(h.api.verifyDemoCode(c3.challengeId,c3.demoCode));assert.equal(ok(h.api.openEntryLink(entry.token,{email:f.person.email,proofToken:p3.proofToken},f.rev())).id,f.exp.id);
 const session=storage();session.setItem(Context.HOLDER_KEY,JSON.stringify({actor:f.person,expId:f.exp.id,demo:true}));assert.throws(()=>Context.start({storage:f.disk,sessionStorage:session,actor:f.person,expId:f.exp.id,now:f.now}),/verifica/);
 session.setItem(Context.HOLDER_KEY,JSON.stringify({actor:f.person,expId:f.exp.id,demo:true,expiresAt:Date.parse(f.now())+600000,entryToken:entry.token}));
 const route=Context.start({storage:f.disk,sessionStorage:session,actor:f.person,expId:f.exp.id,now:f.now});const context=JSON.parse(session.getItem(Context.CONTEXT_KEY));assert.equal(context.expiresAt,Date.parse(f.now())+Context.HOLDER_MAX,'v36: holder context bounded at 12 h; inactivity (30 min) is enforced by the sliding holder session');
 const loc={pathname:kind==='doctor'?'/registro-doctor.html':'/solicitud-paciente.html',search:new URL(route.url,'https://example.test').search,hash:new URL(route.url,'https://example.test').hash};
 const open=Context.open({storage:f.disk,sessionStorage:session,location:loc,kind,now:f.now});assert.ok(open);
 ok(f.kam.api.revokeEntryLink(f.exp.id,{reason:'Manual'},f.rev()));denied(h.api.resolveEntryLink(entry.token),'ENTRY_REVOKED');assert.throws(()=>Context.open({storage:f.disk,sessionStorage:session,location:loc,kind,now:f.now}),/sesión/);
 denied(f.kam.api.getOrCreateEntryLink(f.exp.id,{},f.rev()),'ENTRY_REVOKED');const renewed=ok(f.kam.api.renewEntryLink(f.exp.id,{},f.rev()));assert.notEqual(renewed.token,entry.token);denied(h.api.resolveEntryLink(entry.token),'ENTRY_INVALID');
 ok(f.kam.store.setStage(f.contact.id,'not_interested',{reason:'Sin interés'},f.rev()));denied(h.api.resolveEntryLink(renewed.token),'ENTRY_REVOKED');ok(f.kam.store.setStage(f.contact.id,'interested',{},f.rev()));denied(f.kam.api.getOrCreateEntryLink(f.exp.id,{},f.rev()),'ENTRY_REVOKED');
 console.log('PASS stable entry lifecycle '+kind);
}
const legacy=fixture();const old=legacy.invite();denied(legacy.kam.api.getOrCreateEntryLink(legacy.exp.id,{},legacy.rev()),'LEGACY_MIGRATION_REQUIRED');const migrated=ok(legacy.kam.api.getOrCreateEntryLink(legacy.exp.id,{migrateLegacy:true},legacy.rev()));assert.notEqual(migrated.token,old.token);assert.equal(legacy.kam.store.snapshot().invitations[old.id].status,'revoked');
console.log('PASS explicit legacy migration and short session separation');
