'use strict';
// Bounded orphan cleanup uses the actual evidence API and raceable IndexedDB fixture.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const sourcePath=path.join(__dirname,'crm-role-evidence.cjs'),source=fs.readFileSync(sourcePath,'utf8');
const context=vm.createContext({require:createRequire(sourcePath),console,Blob,Buffer,structuredClone,setImmediate});
vm.runInContext(source.slice(0,source.indexOf('(async()=>{'))+'\nglobalThis.testFixture={fixture,pdf,once};',context,{filename:sourcePath});
const {fixture,pdf,once}=context.testFixture;
const code=async(promise,expected)=>assert.rejects(promise,error=>{assert.equal(error.code,expected,error.message);return true;});
const cases=[];const test=(name,run)=>cases.push({name,run});
const put=f=>f.scoped.put(pdf(),{contactId:f.mine.id,documentType:'income'});

test('Post-put role revocation and closed context can discard only the exact new uncommitted upload',async()=>{
 for(const change of ['reassign','close']){
  const f=fixture(),meta=await put(f);
  if(change==='reassign')f.reassign();else await f.scoped.close();
  await assert.rejects(f.scoped.get(meta.id));await assert.rejects(f.scoped.remove(meta.id));
  assert.equal(await f.scoped.discardUncommitted(meta,()=>true),true);
  assert.equal(await f.raw.get(meta.id),null);assert.equal(f.factory.data.get('files').size,0);
  await code(f.scoped.discardUncommitted(meta,()=>true),'UNOWNED_UPLOAD');
 }
});

test('Foreign, old, tampered, and missing-reference-proof cleanup cannot remove a blob',async()=>{
 const f=fixture(),foreign=await f.seed(f.foreign),old=await f.seed(),own=await put(f);
 for(const meta of [foreign,old,{...own,name:'forged'}, {...own,contactId:f.foreign.id}])await code(f.scoped.discardUncommitted(meta,()=>true),'UNOWNED_UPLOAD');
 await code(f.scoped.discardUncommitted(own,null),'EVIDENCE_LINKED');await code(f.scoped.discardUncommitted(own,()=>false),'EVIDENCE_LINKED');await code(f.scoped.discardUncommitted(own,()=>Promise.resolve(true)),'EVIDENCE_LINKED');
 assert.ok(await f.raw.get(foreign.id));assert.ok(await f.raw.get(old.id));assert.ok(await f.raw.get(own.id));assert.equal(f.factory.data.get('files').size,3);
});

test('New canonical reference before or during cleanup aborts atomically; completion-race reference restores bytes',async()=>{
 for(const phase of ['beforeRequest','afterRequest','afterCommit']){
  const f=fixture(),own=await put(f);let linked=false;
  once(f.factory,phase,event=>phase==='afterCommit'?event.mode==='readwrite':event.store==='metadata'&&event.operation==='delete',()=>{linked=true;});
  await code(f.scoped.discardUncommitted(own,()=>!linked),'EVIDENCE_LINKED');
  const restored=await f.raw.get(own.id);assert.ok(restored,phase);assert.equal(restored.blob.size,own.size);assert.equal(restored.name,own.name);assert.equal(f.factory.data.get('files').size,1);
 }
});

test('Cleanup storage failure preserves metadata and binary together and remains retryable',async()=>{
 const f=fixture(),own=await put(f);f.reassign();f.factory.failRequest={store:'metadata',operation:'delete'};
 await code(f.scoped.discardUncommitted(own,()=>true),'STORAGE_FAILED');assert.ok(await f.raw.get(own.id));
 assert.equal(await f.scoped.discardUncommitted(own,()=>true),true);assert.equal(await f.raw.get(own.id),null);
});

test('A metadata collision and an already removed row never grant authority over a later blob',async()=>{
 const f=fixture(),own=await put(f);const stored=f.factory.data.get('metadata').get(own.id);f.factory.data.get('metadata').set(own.id,{...stored,name:'replacement'});
 assert.equal(await f.scoped.discardUncommitted(own,()=>true),false);assert.equal((await f.raw.get(own.id)).name,'replacement');
 await code(f.scoped.discardUncommitted({...own,name:'replacement'},()=>true),'UNOWNED_UPLOAD');
 const second=await put(f);await f.scoped.remove(second.id);await code(f.scoped.discardUncommitted(second,()=>true),'UNOWNED_UPLOAD');
});

(async()=>{for(const item of cases){await item.run();console.log('PASS: '+item.name);}console.log('PASS: '+cases.length+' narrowly owned evidence cleanup groups.');})().catch(error=>{console.error(error);process.exitCode=1;});
