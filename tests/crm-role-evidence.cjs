'use strict';
const assert = require('node:assert/strict');
const E = require('../assets/js/crm-demo-evidence.js');
const S = require('../assets/js/crm-demo-store.js');
const A = require('../assets/js/crm-assisted.js');

// Asynchronous, atomic IndexedDB double with one-shot race hooks.
function memoryIndexedDB() {
  const data = new Map();
  let tail = Promise.resolve();
  const factory = {openCalls:0,failOpen:false,failRequest:null,failCommit:false, data};
  const db = {
    objectStoreNames:{contains:name=>data.has(name)},
    createObjectStore(name){data.set(name,new Map());}, close(){},
    transaction(names,mode){
      let unlock;
      const previous=tail;
      tail=new Promise(resolve=>{unlock=resolve;});
      let started=false,finished=false,pending=[],snapshot,scheduled=false;
      const tx={error:null,abort(){
        if(finished)throw Error('TransactionInactiveError');
        finished=true;
        setImmediate(()=>{if(tx.onabort)tx.onabort();unlock();});
      },objectStore(name){
        if(!names.includes(name))throw Error('NotFoundError');
        function request(operation,key){
          if(finished)throw Error('TransactionInactiveError');
          const req={result:undefined,error:null};
          pending.push({name,operation,key,req});schedule();return req;
        }
        return {get:key=>request('get',key),getAll:()=>request('getAll'),add:value=>request('add',value),delete:key=>request('delete',key)};
      }};
      function schedule(){if(started&&!scheduled&&!finished){scheduled=true;setImmediate(run);}}
      function run(){
        scheduled=false;if(finished)return;
        const operation=pending.shift();
        if(!operation){
          if(factory.beforeCommit)factory.beforeCommit({mode,tx});
          if(factory.failCommit){factory.failCommit=false;tx.error=new Error('commit failed');tx.abort();return;}
          if(mode==='readwrite')for(const name of names)data.set(name,snapshot.get(name));
          finished=true;if(factory.afterCommit)factory.afterCommit({mode,tx});if(tx.oncomplete)tx.oncomplete();unlock();return;
        }
        const {name,operation:kind,key,req}=operation, store=snapshot.get(name);
        try{
          if(factory.beforeRequest)factory.beforeRequest({store:name,operation:kind,key,mode,tx});
          const fail=factory.failRequest;
          if(fail&&fail.store===name&&fail.operation===kind){factory.failRequest=null;const error=new Error('injected failure');error.name=fail.name||'UnknownError';throw error;}
          if(kind==='get')req.result=store.has(key)?structuredClone(store.get(key)):undefined;
          if(kind==='getAll')req.result=Array.from(store.values(),value=>structuredClone(value));
          if(kind==='add'){
            assert.equal(mode,'readwrite');
            if(store.has(key.id)){const error=new Error('duplicate id');error.name='ConstraintError';throw error;}
            store.set(key.id,structuredClone(key));req.result=key.id;
          }
          if(kind==='delete'){assert.equal(mode,'readwrite');store.delete(key);}
          if(req.onsuccess)req.onsuccess();
          if(factory.afterRequest)factory.afterRequest({store:name,operation:kind,key,mode,tx});
        }catch(error){req.error=error;tx.error=error;if(req.onerror)req.onerror();if(!finished)tx.abort();}
        schedule();
      }
      previous.then(()=>{
        snapshot=new Map(names.map(name=>[name,new Map(Array.from(data.get(name),([key,value])=>[key,structuredClone(value)]))]));
        started=true;schedule();
      });
      return tx;
    }
  };
  factory.open=function(){
    factory.openCalls++;
    const req={result:db,error:null};
    setImmediate(()=>{
      if(factory.failOpen){factory.failOpen=false;req.error=new Error('Open failed');if(req.onerror)req.onerror();return;}
      if(!data.size&&req.onupgradeneeded)req.onupgradeneeded();
      if(req.onsuccess)req.onsuccess();
    });return req;
  };
  return factory;
}
function namedBlob(bytes,type,name){const blob=new Blob([bytes],{type});Object.defineProperty(blob,'name',{value:name||'demo.bin'});return blob;}
function pdf(size=64){const bytes=new Uint8Array(size);bytes.fill(32);bytes.set(Buffer.from('%PDF-1.7\n'));bytes.set(Buffer.from('\n%%EOF\n'),size-7);return namedBlob(bytes,'application/pdf','nota-demo.pdf');}

function good(result){assert.equal(result.ok,true,result.error);return result.value;}
async function code(promise,expected){await assert.rejects(promise,error=>{assert.equal(error.code,expected,error.message);return true;});}
function fixture(){
  const values=new Map(),factory=memoryIndexedDB();let seq=0,evidenceSeq=0;
  const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value))};
  const now=()=>new Date('2026-10-11T12:00:00Z');
  const make=(id,role)=>S.createStore({storage,actor:{id,role},now,randomId:()=>String(++seq)});
  const admin=make('admin_demo','admin'),kam=make('kam_one','kam'),other=make('kam_two','kam'),leader=make('leader_demo','leader'),holder=make('holder_demo','holder');
  const revision=()=>admin.snapshot().revision;
  const mine=good(kam.createContact({type:'patient',name:'Own contact',email:'own@example.test',phone:'5512340001'},revision()));
  const foreign=good(other.createContact({type:'doctor',name:'Foreign contact',email:'foreign@example.test',phone:'5512340002'},revision()));
  const evidence=(store,extra={})=>E.createEvidenceStore({indexedDB:factory,now,randomId:()=>`role-evidence-${++evidenceSeq}`,...(store?{store}:{}),...extra});
  const raw=evidence(),scoped=evidence(kam);
  const seed=(contact=mine)=>raw.put(pdf(),{actorId:'original_uploader',contactId:contact.id});
  const reassign=()=>good(admin.reassignContact(mine.id,other.actor.id,'Transfer DEMO contact',revision()));
  const archive=()=>good(admin.deleteContact(mine.id,'Archive DEMO prospect',revision()));
  return {factory,storage,make,admin,kam,other,leader,holder,mine,foreign,raw,scoped,evidence,seed,reassign,archive,revision};
}
function once(factory,phase,predicate,action){
  factory[phase]=event=>{if(predicate(event)){factory[phase]=null;action(event);}};
}
function empty(factory){
  assert.equal(factory.data.get('metadata')?.size||0,0,'no metadata remains');
  assert.equal(factory.data.get('files')?.size||0,0,'no binary remains');
}
async function deferredFile(){
  const blob=pdf(),bytes=await blob.arrayBuffer();let release;
  return {file:{type:blob.type,size:blob.size,name:blob.name,slice:blob.slice.bind(blob),arrayBuffer:()=>new Promise(resolve=>{release=()=>resolve(bytes);})},release:()=>release()};
}

(async()=>{
  {
    const f=fixture(),own=await f.seed(),foreign=await f.seed(f.foreign),leader=f.evidence(f.leader);
    assert.equal((await f.scoped.get(own.id)).actorId,'original_uploader');
    await code(f.scoped.get(foreign.id),'FORBIDDEN');
    await code(f.scoped.remove(foreign.id),'FORBIDDEN');
    await code(f.scoped.list({contactId:f.foreign.id}),'FORBIDDEN');
    assert.deepEqual((await f.scoped.list()).map(row=>row.id),[own.id]);
    assert.deepEqual(await f.scoped.list({actorId:'unknown'}),[]);
    assert.equal((await leader.get(foreign.id)).id,foreign.id);
    assert.equal((await leader.list()).length,2);
    await code(leader.put(pdf(),{contactId:f.mine.id}),'FORBIDDEN');
    await code(leader.put(pdf(),{actorId:f.admin.actor.id,contactId:f.mine.id}),'FORBIDDEN');
    await code(leader.remove(own.id),'FORBIDDEN');
    await code(leader.remove('missing'),'FORBIDDEN');
    assert.equal((await f.raw.list()).length,2);
    const staff=await f.scoped.put(pdf(),{contactId:f.mine.id});
    assert.equal(staff.actorId,f.kam.actor.id,'scoped attribution comes from the actual actor');
    await code(f.scoped.put(pdf(),{contactId:f.mine.id,actorId:f.admin.actor.id}),'FORBIDDEN');
    await code(f.scoped.put(pdf(),{contactId:f.foreign.id,actorId:f.kam.actor.id}),'FORBIDDEN');
    const admin=f.evidence(f.admin),adminUpload=await admin.put(pdf(),{contactId:f.foreign.id});
    assert.equal(adminUpload.actorId,f.admin.actor.id);assert.equal(await admin.remove(adminUpload.id),true);
    assert.equal(await f.scoped.get('missing'),null);assert.equal(await f.scoped.remove('missing'),false);
    assert.equal((await f.raw.get(foreign.id)).id,foreign.id,'denied remove preserves foreign files');
    console.log('PASS: KAM evidence scope, leader read-only access, admin writes and non-forgeable actor attribution.');
  }
  {
    const f=fixture(),foreign=await f.seed(),holder=f.evidence(f.holder);
    await code(holder.get(foreign.id),'FORBIDDEN');await code(holder.remove(foreign.id),'FORBIDDEN');
    assert.deepEqual(await holder.list(),[]);
    const api=A.createAssisted({store:f.holder,actor:f.holder.actor});
    const challenge=good(api.requestDemoVerification({email:'holder@example.test',kind:'patient'}));
    const proof=good(api.verifyDemoCode(challenge.challengeId,challenge.demoCode));
    const exp=good(api.createSelfService({kind:'patient',name:'Holder DEMO',email:'holder@example.test',phone:'5512340003',proofToken:proof.proofToken},f.revision()));
    const own=await holder.put(pdf(),{contactId:exp.contactId});
    assert.equal(own.actorId,f.holder.actor.id);assert.equal((await holder.get(own.id)).id,own.id);
    assert.deepEqual((await holder.list()).map(row=>row.id),[own.id]);
    await code(f.evidence(f.make('different_holder','holder')).get(own.id),'FORBIDDEN');
    assert.equal(await holder.remove(own.id),true);
    console.log('PASS: holder evidence remains limited to the holder’s own active contact.');
  }
  {
    const f=fixture(),meta=await f.seed();f.archive();
    for(const store of [f.scoped,f.evidence(f.leader),f.evidence(f.admin)]){
      await code(store.get(meta.id),'FORBIDDEN');await code(store.list({contactId:f.mine.id}),'FORBIDDEN');
      assert.deepEqual(await store.list(),[]);
    }
    await code(f.scoped.put(pdf(),{contactId:f.mine.id}),'FORBIDDEN');await code(f.scoped.remove(meta.id),'FORBIDDEN');
    assert.ok(await f.raw.get(meta.id),'archiving never deletes stored history');
    console.log('PASS: archived contacts expose neither metadata nor blobs to scoped readers.');
  }
  for(const change of ['reassign','archive','logout','close']){
    const f=fixture(),pendingFile=await deferredFile();let current=true;
    const scoped=f.evidence(f.kam,{isCurrent:()=>current});
    const pending=scoped.put(pendingFile.file,{contactId:f.mine.id});
    if(change==='logout')current=false;else if(change==='close')await scoped.close();else f[change]();
    pendingFile.release();await code(pending,['logout','close'].includes(change)?'ACCESS_REVOKED':'FORBIDDEN');empty(f.factory);
  }
  console.log('PASS: reassignment, archive, logout and close revoke uploads during file validation.');

  for(const phase of ['beforeRequest','afterRequest','afterCommit']){
    const f=fixture(),meta=await f.seed();
    once(f.factory,phase,event=>phase==='afterCommit'||event.store==='files'&&event.operation==='get',()=>f.reassign());
    await code(f.scoped.get(meta.id),'FORBIDDEN');
    assert.ok(await f.raw.get(meta.id),'denied read never changes evidence');
  }
  {
    const f=fixture(),meta=await f.seed();
    once(f.factory,'afterCommit',event=>event.mode==='readonly',()=>f.reassign());
    assert.deepEqual(await f.scoped.list(),[],'completion re-filters newly inaccessible evidence');
    assert.ok(await f.raw.get(meta.id));
  }
  {
    const f=fixture();await f.seed();
    once(f.factory,'afterCommit',event=>event.mode==='readonly',()=>f.archive());
    await code(f.scoped.list({contactId:f.mine.id}),'FORBIDDEN');
  }
  console.log('PASS: asynchronous blob and list reads recheck live contact access through transaction completion.');

  for(const phase of ['beforeRequest','afterRequest','afterCommit']){
    const f=fixture();
    once(f.factory,phase,event=>phase==='afterCommit'||event.store==='metadata'&&event.operation==='add',()=>f.reassign());
    await code(f.scoped.put(pdf(),{contactId:f.mine.id}),'FORBIDDEN');empty(f.factory);
  }
  for(const change of ['logout','close','archive']){
    const f=fixture();let current=true,closing;
    const scoped=f.evidence(f.kam,{isCurrent:()=>current});
    once(f.factory,'afterCommit',event=>event.mode==='readwrite',()=>{if(change==='logout')current=false;else if(change==='close')closing=scoped.close();else f.archive();});
    await code(scoped.put(pdf(),{contactId:f.mine.id}),change==='archive'?'FORBIDDEN':'ACCESS_REVOKED');
    if(closing)await closing;empty(f.factory);
  }
  console.log('PASS: revoked writes abort atomically or clean up only their own just-committed upload.');

  for(const phase of ['beforeRequest','afterRequest','afterCommit']){
    const f=fixture(),meta=await f.seed();
    once(f.factory,phase,event=>phase==='afterCommit'||event.store==='metadata'&&event.operation==='delete',()=>f.reassign());
    await code(f.scoped.remove(meta.id),'FORBIDDEN');
    assert.equal((await f.raw.get(meta.id)).id,meta.id,'revoked removal preserves or restores the exact evidence');
    assert.equal(f.factory.data.get('metadata').size,1);assert.equal(f.factory.data.get('files').size,1);
  }
  {
    const f=fixture(),meta=await f.seed(),scoped=f.evidence(f.kam);await scoped.close();
    for(const pending of [scoped.get(meta.id),scoped.list(),scoped.put(pdf(),{contactId:f.mine.id}),scoped.remove(meta.id)])await code(pending,'ACCESS_REVOKED');
    await f.raw.close();assert.equal((await f.raw.get(meta.id)).id,meta.id,'legacy close/reopen remains supported');
    assert.throws(()=>E.createEvidenceStore({store:null}),error=>error.code==='INVALID_SCOPE');
    const broken=f.evidence(f.kam,{isCurrent:()=>{throw Error('stale session');}});
    await code(broken.get(meta.id),'ACCESS_REVOKED');
  }
  console.log('PASS: revoked removal rolls back, scoped close is final, raw adapter compatibility and fail-closed sessions.');
  console.log('PASS: CRM role evidence regressions.');
})().catch(error=>{console.error(error);process.exitCode=1;});
