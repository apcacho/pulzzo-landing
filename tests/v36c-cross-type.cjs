'use strict';
// v36c: cross-type (patient ↔ doctor) access with the CRM ficha toggle, auto-closed request task,
// KAM-created contact continued by the client, revoked referral link, 24 h duplicate alert. Fictitious data only.
const assert=require('node:assert/strict');
const Store=require('../assets/js/crm-demo-store.js'),Assisted=require('../assets/js/crm-assisted.js');
function storage(){const map=new Map();return {getItem(k){return map.has(k)?map.get(k):null;},setItem(k,v){map.set(k,String(v));},removeItem(k){map.delete(k);}};}
const ok=r=>{assert.equal(r.ok,true,r.error);return r.value;};
let t=Date.parse('2026-10-14T18:00:00.000Z');const now=()=>new Date(t).toISOString();
function holder(disk){const actor={id:'holder_'+Math.random().toString(36).slice(2),role:'holder'};const store=Store.createStore({storage:disk,actor,now}),api=Assisted.createAssisted({store,actor,now});return {actor,store,api};}
function signup(disk,{kind='patient',name,email,phone,ref}){const h=holder(disk);const ch=h.api.requestDemoVerification({email,phone,kind,mode:'new_account'});if(!ch.ok)return ch;const p=ok(h.api.verifyDemoCode(ch.value.challengeId,ch.value.demoCode));const out=h.api.createSelfService({kind,name,email,phone,proofToken:p.proofToken,referralToken:ref},h.store.snapshot().revision);out.challenge=ch.value;return out;}
const staff=(disk,actor)=>Store.createStore({storage:disk,actor,now});
const admin={id:'admin_demo',role:'admin'},ana={id:'kam_ana',role:'kam'},luis={id:'kam_luis',role:'kam'},leader={id:'leader_demo',role:'leader'};
const audit=disk=>{const raw=JSON.parse(disk.getItem(Store.STORAGE_KEY)),st=raw.state||raw;return Object.values(st.audit);};
// 1 duplicate alert due 24 h later (not overdue at creation)
{const disk=storage();ok(signup(disk,{name:'Dup Uno',email:'dup@example.test',phone:'5500000901'}));
 const again=signup(disk,{name:'Dup Uno',email:'dup@example.test',phone:'5500000999'});assert.equal(again.code,'EXISTING_ACCOUNT_EMAIL');assert.equal(again.error,'Este correo ya está registrado. Inicia sesión aquí');
 const task=staff(disk,admin).listTasks({}).find(x=>x.kind==='duplicate_registration');assert.equal(Date.parse(task.dueAt)-t,24*3600000);
 console.log('PASS duplicate alert due 24 h later; field-specific message');}
// 2 cross-type: blocked + task; toggle ON closes task as done (enabled) and lets the client register linked; OFF/reject closes as rejected
{const disk=storage();const kam=staff(disk,ana);
 const docExp=ok(signup(disk,{kind:'doctor',name:'Dra. Doble DEMO',email:'doble@example.test',phone:'5500000911'}));
 // put the doctor under Ana (admin reassigns) so the responsable KAM toggles
 const a=staff(disk,admin);const docId=docExp.contactId;
 if(a.getContact(docId).assignedKam!=='kam_ana')ok(a.reassignContact?a.reassignContact(docId,'kam_ana','prueba',a.snapshot().revision):a.updateContact(docId,{assignedKam:'kam_ana'},a.snapshot().revision));
 const byMail=signup(disk,{kind:'patient',name:'Doble Paciente',email:'doble@example.test',phone:'5500000912'});
 assert.equal(byMail.code,'CROSS_TYPE_EMAIL');assert.equal(byMail.error,'Este correo ya está registrado como doctor. Si quieres pedir un crédito como paciente, tu asesor te ayuda.');
 const byPhone=signup(disk,{kind:'patient',name:'Doble Paciente',email:'otro.doble@example.test',phone:'5500000911'});assert.equal(byPhone.code,'CROSS_TYPE_PHONE');assert.match(byPhone.error,/^Este celular ya está registrado como doctor/);
 const reqs=()=>staff(disk,admin).listTasks({}).filter(x=>x.kind==='cross_type_request'&&x.contactId===docId);
 assert.equal(reqs().length,1,'one deduped request task');assert.equal(reqs()[0].requestedType,'patient');assert.equal(Date.parse(reqs()[0].dueAt)-t,24*3600000);assert.match(reqs()[0].title,/Habilitar también como paciente/);
 // holder and a KAM who is not responsable cannot toggle
 const h=holder(disk);assert.equal(h.store.setCrossTypeAccess?h.store.setCrossTypeAccess(docId,'patient',true,null,h.store.snapshot().revision).ok:false,false);
 const other=staff(disk,luis);assert.equal(other.setCrossTypeAccess(docId,'patient',true,null,other.snapshot().revision).ok,false);
 t+=60000;ok(kam.setCrossTypeAccess(docId,'patient',true,'Cliente pidió crédito (prueba)',kam.snapshot().revision));
 const done=reqs()[0];assert.equal(done.status,'closed');assert.equal(done.resolution,'enabled');assert.equal(done.closedBy,'kam_ana');assert.match(done.closeReason,/^Hecha: habilitado también como paciente/);
 assert.ok(audit(disk).some(x=>x.action==='task_closed'&&x.taskId===done.id&&x.resolution==='enabled'&&x.actorId==='kam_ana'),'history: who + enabled');
 const c=staff(disk,admin).getContact(docId);assert.equal(c.crossTypeAccess.patient.enabled,true);assert.equal(c.crossTypeHistory.at(-1).by,'kam_ana');assert.equal(c.crossTypeHistory.at(-1).reason,'Cliente pidió crédito (prueba)');
 const pat=ok(signup(disk,{kind:'patient',name:'Doble Paciente',email:'doble@example.test',phone:'5500000911'}));
 const pc=staff(disk,admin).getContact(pat.contactId);assert.deepEqual(pc.linkedContactIds,[docId]);assert.equal(pc.email,c.email);assert.notEqual(pc.id,docId);
 assert.equal(staff(disk,admin).listContacts().filter(x=>x.email==='doble@example.test').length,2,'one record per type, linked; no merged identity');
 // same type still blocked
 assert.equal(signup(disk,{kind:'patient',name:'X',email:'doble@example.test',phone:'5500000919'}).code,'EXISTING_ACCOUNT_EMAIL');
 // reject path: another doctor, request, leader rejects → task done (rejected), still blocked
 const d2=ok(signup(disk,{kind:'doctor',name:'Dr. Rechazo DEMO',email:'rechazo@example.test',phone:'5500000921'}));
 assert.equal(signup(disk,{kind:'patient',name:'R',email:'rechazo@example.test',phone:'5500000922'}).code,'CROSS_TYPE_EMAIL');
 const L=staff(disk,leader);ok(L.setCrossTypeAccess(d2.contactId,'patient',false,'No procede (prueba)',L.snapshot().revision));
 const rj=staff(disk,admin).listTasks({}).find(x=>x.kind==='cross_type_request'&&x.contactId===d2.contactId);assert.equal(rj.status,'closed');assert.equal(rj.resolution,'rejected');assert.equal(rj.closedBy,'leader_demo');assert.match(rj.closeReason,/^Hecha: rechazado/);
 assert.equal(signup(disk,{kind:'patient',name:'R',email:'rechazo@example.test',phone:'5500000922'}).code,'CROSS_TYPE_EMAIL','still blocked after reject');
 // turning it off later is recorded too
 ok(kam.setCrossTypeAccess(docId,'patient',false,null,kam.snapshot().revision));assert.equal(staff(disk,admin).getContact(docId).crossTypeHistory.length,2);
 // a holder cannot forge the toggle in a raw write
 const h2=holder(disk);assert.equal(h2.store.transact(h2.store.snapshot().revision,d=>{d.contacts[d2.contactId].crossTypeAccess={patient:{enabled:true}};}).ok,false);
 console.log('PASS cross-type: blocked with message + one request task; toggle closes it as Hecha (enabled/rejected, who) and links the new record');}
// 3 KAM-created contact (no account) registers without link → same expediente, KAM kept, advisor message, KAM notified
{const disk=storage();const kam=staff(disk,ana);
 const c=ok(kam.createContact({type:'patient',name:'Marta KAM',email:'marta@example.test',phone:'5500000931'},kam.snapshot().revision));
 const kapi=Assisted.createAssisted({store:kam,actor:ana,now});const draft=ok(kapi.beginDraft({contactId:c.id},kam.snapshot().revision));
 const h=holder(disk);const ch=ok(h.api.requestDemoVerification({email:'marta@example.test',phone:'5500000931',kind:'patient',mode:'new_account'}));
 assert.equal(ch.continuesKamContact,true);assert.match(ch.advisorMessage,/^Te está atendiendo .*tu asesor\(a\) PULZZO$/);
 const p=ok(h.api.verifyDemoCode(ch.challengeId,ch.demoCode));const exp=ok(h.api.createSelfService({kind:'patient',name:'Marta Cliente',email:'marta@example.test',phone:'5500000931',proofToken:p.proofToken},h.store.snapshot().revision));
 assert.equal(exp.id,draft.id,'same expediente');const after=staff(disk,admin).getContact(c.id);assert.equal(after.assignedKam,'kam_ana');assert.equal(after.holderId,h.actor.id);
 assert.equal(staff(disk,admin).listContacts().length,1,'no duplicate');
 const note=staff(disk,ana).listTasks({}).find(x=>x.kind==='client_entered'&&x.contactId===c.id);assert.ok(note,'KAM notified');assert.match(note.title,/entró a su registro/);
 // by phone with a different verified email: same expediente; KAM email kept in history
 const c2=ok(kam.createContact({type:'doctor',name:'Dr. Tel DEMO',email:'kam.cap@example.test',phone:'5500000932'},kam.snapshot().revision));
 const h2=holder(disk);const ch2=ok(h2.api.requestDemoVerification({email:'propio@example.test',phone:'5500000932',kind:'doctor',mode:'new_account'}));assert.equal(ch2.continuesKamContact,true);
 const p2=ok(h2.api.verifyDemoCode(ch2.challengeId,ch2.demoCode));const e2=ok(h2.api.createSelfService({kind:'doctor',name:'Dr. Tel DEMO',email:'propio@example.test',phone:'5500000932',proofToken:p2.proofToken},h2.store.snapshot().revision));
 const cc=staff(disk,admin).getContact(c2.id);assert.equal(e2.contactId,c2.id);assert.equal(cc.email,'propio@example.test');assert.equal(cc.emailHistory[0].email,'kam.cap@example.test');assert.equal(cc.emailHistory[0].label,'correo capturado por KAM');
 // once claimed, a second person cannot take it
 assert.equal(signup(disk,{name:'Intruso',email:'marta@example.test',phone:'5500000939'}).code,'EXISTING_ACCOUNT_EMAIL');
 // and a holder cannot forge a claim without the self-claim path
 const h3=holder(disk);const c3=ok(kam.createContact({type:'patient',name:'Nadie',email:'nadie@example.test',phone:'5500000938'},kam.snapshot().revision));
 assert.equal(h3.store.transact(h3.store.snapshot().revision,d=>{Object.assign(d.contacts[c3.id],{holderId:h3.actor.id,accountId:h3.actor.id,accountExists:true});}).ok,false);
 console.log('PASS KAM-created contact: client continues SAME expediente now, KAM kept, advisor message, KAM task; email change kept in history');}
// 4 revoked / inactive KAM referral link: registration proceeds via CRM rule, history records the link
{const disk=storage();const kam=staff(disk,ana);const rp=ok(kam.createReferral('patient',kam.snapshot().revision));
 const a=staff(disk,admin);ok(a.revokeReferral(rp.id,'Salida (prueba)',a.snapshot().revision));
 const e=ok(signup(disk,{name:'Llega Tarde',email:'tarde2@example.test',phone:'5500000941',ref:rp.token}));const c=staff(disk,admin).getContact(e.contactId);
 assert.equal(c.originalSource,'organic');assert.equal(c.referringKam,null);assert.notEqual(c.assignedKam,null);
 assert.ok(audit(disk).some(x=>(x.action||x.type)==='revoked_referral_used'&&x.contactId===c.id&&x.referralKamId==='kam_ana'&&x.referralState==='revoked'));
 assert.equal(signup(disk,{name:'Inválido',email:'inv@example.test',phone:'5500000942',ref:'r_no_existe'}).ok,false,'unknown token still rejected');
 console.log('PASS revoked referral link: registers via CRM rule ('+c.assignedKam+'), history keeps the KAM link, not a KAM referral');}
