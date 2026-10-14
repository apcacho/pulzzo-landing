'use strict';
const assert = require('node:assert/strict');
const S = require('../assets/js/crm-demo-store.js');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS: '+name); }
function fixture() {
 const values = new Map(); let time='2026-10-12T01:00:00.000Z', n=0;
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v))};
 const make=actor=>S.createStore({storage,actor,now:()=>time,randomId:()=>String(++n)});
 const store=make({id:'kam_a',role:'kam'}), admin=make({id:'admin_a',role:'admin'});
 const contact=store.createContact({type:'patient',name:'Fictitious audit',email:'audit@example.test'},0).value;
 const task=store.createTask({contactId:contact.id,title:'Demo task',dueAt:'2026-10-13'},store.snapshot().revision).value;
 return {storage,store,admin,contact,task,rev:()=>store.snapshot().revision,setTime:t=>time=t};
}
function rejectedWithoutWrite(f, fn, code) { const raw=f.storage.getItem(S.STORAGE_KEY),result=fn();assert.equal(result.ok,false);if(code)assert.equal(result.code,code,result.error);assert.equal(f.storage.getItem(S.STORAGE_KEY),raw); }
test('generic task closure rejects forged actor and backdated capture',()=>{
 for(const patch of [{closedBy:'admin_other'},{closedAt:'2000-01-01T00:00:00.000Z'},{updatedAt:'2000-01-01T00:00:00.000Z'}]) {
  const f=fixture();rejectedWithoutWrite(f,()=>f.store.transact(f.rev(),(d,ctx)=>{Object.assign(d.tasks[f.task.id],{status:'closed',closeReason:'Completed',closedAt:ctx.now,closedBy:ctx.actor.id,updatedAt:ctx.now},patch);ctx.append('audit',{action:'task_closed',contactId:f.contact.id,taskId:f.task.id,reason:'Completed'});}), 'invalid_audit_actor');
 }
});
test('generic task closure requires exact audit contact, task and reason',()=>{
 for(const patch of [null,{taskId:'other_task'},{reason:'Different reason'}]) {const f=fixture();rejectedWithoutWrite(f,()=>f.store.transact(f.rev(),(d,ctx)=>{Object.assign(d.tasks[f.task.id],{status:'closed',closeReason:'Completed',closedAt:ctx.now,closedBy:ctx.actor.id,updatedAt:ctx.now});if(patch)ctx.append('audit',{action:'task_closed',contactId:f.contact.id,taskId:f.task.id,reason:'Completed',...patch});}),'audit_required');}
});
test('open task cannot carry fake closed metadata',()=>{
 const f=fixture();rejectedWithoutWrite(f,()=>f.store.transact(f.rev(),(d,ctx)=>{d.tasks[f.task.id].closedBy='admin_other';ctx.append('audit',{action:'task_updated',contactId:f.contact.id,taskId:f.task.id});}),'invalid_task');
});
test('generic task creation preserves exact creator and creation time',()=>{
 for(const patch of [{createdBy:'admin_other'},{createdAt:'2000-01-01T00:00:00.000Z'}]) {const f=fixture();rejectedWithoutWrite(f,()=>f.store.transact(f.rev(),(d,ctx)=>{const id=ctx.id('task');d.tasks[id]={...f.task,id,createdBy:ctx.actor.id,createdAt:ctx.now,updatedAt:ctx.now,...patch};ctx.append('audit',{action:'task_created',contactId:f.contact.id,taskId:id});}),'invalid_audit_actor');}
});
test('normal update and close keep exact current actor and immutable closure',()=>{
 const f=fixture();f.setTime('2026-10-12T02:00:00.000Z');assert.equal(f.store.updateTask(f.task.id,{title:'Changed'},f.rev()).ok,true);f.setTime('2026-10-12T03:00:00.000Z');assert.equal(f.admin.closeTask(f.task.id,'Reviewed by admin',f.rev()).ok,true);const t=f.store.snapshot().tasks[f.task.id];assert.equal(t.closedBy,'admin_a');assert.equal(t.closedAt,'2026-10-12T03:00:00.000Z');rejectedWithoutWrite(f,()=>f.admin.closeTask(f.task.id,'Repeated',f.rev()),'task_closed');
});
test('stale reassignment and write failure cannot partially change a task',()=>{
 const f=fixture(),rev=f.rev();assert.equal(f.admin.reassignContact(f.contact.id,'kam_b','Coverage demo',rev).ok,true);rejectedWithoutWrite(f,()=>f.store.closeTask(f.task.id,'Stale close',rev),'stale_revision');const raw=f.storage.getItem(S.STORAGE_KEY);f.storage.setItem=()=>{throw Error('quota');};const out=f.admin.closeTask(f.task.id,'Failed save',f.rev());assert.equal(out.code,'storage_write_failed');assert.equal(f.storage.getItem(S.STORAGE_KEY),raw);
});
console.log(`PASS: ${passed} full-store transaction audit scenarios.`);
