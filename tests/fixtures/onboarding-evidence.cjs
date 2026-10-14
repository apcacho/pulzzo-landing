'use strict';
const assert=require('node:assert/strict');
// IndexedDB transaction double extracted from the existing evidence API suite.
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
          if(factory.failCommit){factory.failCommit=false;tx.error=new Error('commit failed');tx.abort();return;}
          if(mode==='readwrite')for(const name of names)data.set(name,snapshot.get(name));
          finished=true;if(tx.oncomplete)tx.oncomplete();unlock();return;
        }
        const {name,operation:kind,key,req}=operation, store=snapshot.get(name);
        try{
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
function mp4(){const bytes=new Uint8Array(89),view=new DataView(bytes.buffer);view.setUint32(0,24);bytes.set(Buffer.from('ftypisom'),4);bytes.set(Buffer.from('isommp42'),16);view.setUint32(24,56);bytes.set(Buffer.from('moov'),28);view.setUint32(32,48);bytes.set(Buffer.from('trak'),36);view.setUint32(40,40);bytes.set(Buffer.from('mdia'),44);view.setUint32(48,32);bytes.set(Buffer.from('hdlr'),52);bytes.set(Buffer.from('vide'),64);view.setUint32(80,9);bytes.set(Buffer.from('mdat'),84);return namedBlob(bytes,'video/mp4','selfie-DEMO.mp4');}
module.exports={memoryIndexedDB,namedBlob,pdf,mp4};
