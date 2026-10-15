'use strict';
// v36b: registration → CRM (VM, fictitious in-memory data). Organic origin, follow-up task, duplicates,
// same phone across types, KAM referral links (reusable, revocable with history).
const assert=require('node:assert/strict');
const Store=require('../assets/js/crm-demo-store.js'),Assisted=require('../assets/js/crm-assisted.js');
function storage(){const map=new Map();return {getItem(k){return map.has(k)?map.get(k):null;},setItem(k,v){map.set(k,String(v));},removeItem(k){map.delete(k);}};}
const ok=r=>{assert.equal(r.ok,true,r.error);return r.value;};
let t=Date.parse('2026-10-14T18:00:00.000Z');const now=()=>new Date(t).toISOString();
function holder(disk){const actor={id:'holder_'+Math.random().toString(36).slice(2),role:'holder'};const store=Store.createStore({storage:disk,actor,now}),api=Assisted.createAssisted({store,actor,now});return {actor,store,api};}
function signup(disk,{kind='patient',name,email,phone,ref}){const h=holder(disk);const ch=h.api.requestDemoVerification({email,phone,kind,mode:'new_account'});if(!ch.ok)return ch;const p=ok(h.api.verifyDemoCode(ch.value.challengeId,ch.value.demoCode));return h.api.createSelfService({kind,name,email,phone,proofToken:p.proofToken,referralToken:ref},h.store.snapshot().revision);}
const staff=(disk,actor)=>Store.createStore({storage:disk,actor,now});
const admin={id:'admin_demo',role:'admin'},ana={id:'kam_ana',role:'kam'};
// 1+2 organic origin and ONE follow-up task due in 24 h for the responsable
{const disk=storage();const exp=ok(signup(disk,{name:'Lucía Orgánica',email:'org@example.test',phone:'5500000811'}));
 const s=staff(disk,admin),c=s.getContact(exp.contactId);assert.equal(c.originalSource,'organic');assert.equal(c.assignedKam,'admin_demo');
 const tasks=s.listTasks({}).filter(x=>x.contactId===c.id);assert.equal(tasks.length,1);assert.equal(tasks[0].title,'Contactar a Lucía Orgánica · nuevo registro');assert.equal(tasks[0].kind,'registration_followup');
 assert.equal(Date.parse(tasks[0].dueAt)-t,24*3600000);assert.equal(tasks[0].status,'open');
 // re-entry with the same email never duplicates the task or the contact
 const again=signup(disk,{name:'Lucía Orgánica',email:'org@example.test',phone:'5500000811'});assert.equal(again.ok,false);assert.equal(again.code,'EXISTING_ACCOUNT_EMAIL');assert.equal(again.error,'Este correo ya está registrado. Inicia sesión aquí');
 assert.equal(s.listTasks({}).filter(x=>x.kind==='registration_followup').length,1);assert.equal(s.listContacts().length,1);
 console.log('PASS organic origin + one 24 h follow-up task for the responsable; no duplicates on re-entry');
 // 5 duplicate alert: one open alert, bumped on each new attempt
 const dupTasks=()=>s.listTasks({}).filter(x=>x.kind==='duplicate_registration');assert.equal(dupTasks().length,1);assert.equal(dupTasks()[0].title,'Lucía Orgánica intentó registrarse de nuevo');
 const byPhone=signup(disk,{name:'Otra',email:'otra@example.test',phone:'55 0000 0811'});assert.equal(byPhone.code,'EXISTING_ACCOUNT_PHONE','phone checked before the code');assert.equal(byPhone.error,'Este celular ya está registrado. Inicia sesión aquí');
 assert.equal(dupTasks().length,1,'deduped');assert.equal(dupTasks()[0].attempts,2);assert.equal(dupTasks()[0].lastMatchedBy,'celular');
 // a holder cannot forge other tasks
 const h=holder(disk);const forged=h.store.transact(h.store.snapshot().revision,(d,ctx)=>{d.tasks['x']={id:'x',contactId:c.id,kind:'duplicate_registration',title:'x',dueAt:ctx.now,status:'open',closeReason:null,createdAt:ctx.now,createdBy:h.actor.id,updatedAt:ctx.now,closedAt:null,closedBy:null,attempts:1};});assert.equal(forged.ok,false);
 // v36c: same phone, other type → blocked until the ficha toggle (see v36c-cross-type.cjs)
 const doc=signup(disk,{kind:'doctor',name:'Dr. Cruce DEMO',email:'cruce.doc@example.test',phone:'5500000811'});assert.equal(doc.code,'CROSS_TYPE_PHONE');
 console.log('PASS duplicates: field-specific messages, phone checked before code, one deduped alert; other type blocked without toggle');
}
// 2b no responsable → the task says so
{const disk=storage();const s=staff(disk,admin);const cfg=s.getIntakeRouting();
 const exp=ok(signup(disk,{name:'Sin Dueño',email:'sin@example.test',phone:'5500000821'}));const c=s.getContact(exp.contactId);
 const task=s.listTasks({}).find(x=>x.contactId===c.id);assert.ok(task);if(!c.assignedKam)assert.match(task.title,/Falta asignar responsable/);
 console.log('PASS follow-up task created'+(c.assignedKam?' (responsable '+c.assignedKam+')':' and states the responsable is missing'));}
// 4 referral links: one reusable per KAM and type; second person also referred; admin revokes with history; KAM gets a fresh one
{const disk=storage();const kam=staff(disk,ana);
 const rp=ok(kam.createReferral('patient',kam.snapshot().revision)),rd=ok(kam.createReferral('doctor',kam.snapshot().revision));
 assert.equal(ok(kam.createReferral('patient',kam.snapshot().revision)).token,rp.token,'reusable');assert.notEqual(rp.token,rd.token);
 for(const [i,em] of ['a.ref@example.test','b.ref@example.test'].entries()){const e=ok(signup(disk,{name:'Ref '+i,email:em,phone:'550000083'+i,ref:rp.token}));const c=staff(disk,admin).getContact(e.contactId);assert.equal(c.originalSource,'kam_referral');assert.equal(c.referringKam,'kam_ana');assert.equal(c.assignedKam,'kam_ana');}
 const d=ok(signup(disk,{kind:'doctor',name:'Dra. Ref DEMO',email:'d.ref@example.test',phone:'5500000839',ref:rd.token}));assert.equal(staff(disk,admin).getContact(d.contactId).referringKam,'kam_ana');
 assert.equal(kam.listReferrals().length,2);
 const k2=staff(disk,ana);assert.equal(k2.revokeReferral(rp.id,'x',k2.snapshot().revision).ok,false,'KAM cannot revoke');
 const a=staff(disk,admin);ok(a.revokeReferral(rp.id,'Cambio de cartera (prueba)',a.snapshot().revision));
 const rev=a.listReferrals().find(r=>r.id===rp.id);assert.equal(rev.active,false);assert.equal(rev.revokedBy,'admin_demo');assert.equal(rev.revokeReason,'Cambio de cartera (prueba)');
 {const raw=JSON.parse(disk.getItem(Store.STORAGE_KEY)),st=raw.state||raw;assert.ok(Object.values(st.audit).some(x=>x.action==='referral_revoked'&&x.referralId===rp.id&&x.reason==='Cambio de cartera (prueba)'),'revocation history');}
 const after=signup(disk,{name:'Tarde',email:'tarde@example.test',phone:'5500000840',ref:rp.token});assert.equal(after.ok,true,'v36c: revoked link still registers');{const c=staff(disk,admin).getContact(after.value.contactId);assert.equal(c.originalSource,'organic');assert.equal(c.referringKam,null);}
 const fresh=ok(kam.createReferral('patient',kam.snapshot().revision));assert.notEqual(fresh.token,rp.token);
 console.log('PASS referral links: 2 per KAM, reusable, admin revokes with history, KAM gets a new one');}
