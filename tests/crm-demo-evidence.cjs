'use strict';
const assert = require('node:assert/strict');
const E = require('../assets/js/crm-demo-evidence.js');

// A small asynchronous IndexedDB transaction double. It serializes transactions,
// clones values (including Blobs), and commits neither store if a request aborts.
// Browser behavior is verified separately; this suite invokes the actual public API.
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
function wav(size=48){
  const bytes=new Uint8Array(size),view=new DataView(bytes.buffer);
  bytes.set(Buffer.from('RIFF'));view.setUint32(4,size-8,true);bytes.set(Buffer.from('WAVEfmt '),8);
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
  bytes.set(Buffer.from('data'),36);view.setUint32(40,size-44,true);return namedBlob(bytes,'audio/wav','audio-demo.wav');
}
function ebml(id,payload,unknown=false){
  const key=Buffer.from(id,'hex'),body=Buffer.from(payload),length=body.length;
  if(unknown)return Buffer.concat([key,Buffer.from([255]),body]);
  const size=length<127?Buffer.from([128|length]):Buffer.from([64|(length>>8),length&255]);
  return Buffer.concat([key,size,body]);
}
function webmFixture({unknownSegment=false,unknownCluster=false,video=true,packetTrack=1,packet=true,duplicate=false,audioTrack=false,codec='V_VP9',docType='webm'}={}){
  const number=ebml('d7',[1]),kind=ebml('83',[video?1:2]),encoding=ebml('86',Buffer.from(codec)),dimensions=ebml('e0',Buffer.concat([ebml('b0',[16]),ebml('ba',[16])])),entry=ebml('ae',Buffer.concat([number,kind,encoding,dimensions]));
  const header=ebml('1a45dfa3',ebml('4282',Buffer.from(docType))),info=ebml('1549a966',ebml('2ad7b1',[15,66,64]));
  const audio=ebml('ae',Buffer.concat([ebml('d7',[2]),ebml('83',[2]),ebml('86',Buffer.from('A_OPUS'))]));
  const tracks=ebml('1654ae6b',Buffer.concat(duplicate?[entry,entry]:audioTrack?[entry,audio]:[entry]));
  const block=ebml('a3',[128|packetTrack,0,0,128,1,2,3]),cluster=ebml('1f43b675',Buffer.concat([ebml('e7',[0]),...(packet?[block]:[])]),unknownCluster);
  return Buffer.concat([header,ebml('18538067',Buffer.concat([info,tracks,cluster]),unknownSegment)]);
}
function gifFixture(){return Buffer.from('47494638396101000100800000000000ffffff2c00000000010001000002024401003b','hex');}
function fixtureStore(factory=memoryIndexedDB()){
  let n=0;return {factory,store:E.createEvidenceStore({indexedDB:factory,now:()=>new Date('2026-10-09T05:00:00Z'),randomId:()=>`evidence-${++n}`})};
}
const details={actorId:'demo-operator',contactId:'contact-1',activityId:'activity-1',documentType:'contact_note'};
async function code(promise,expected){await assert.rejects(promise,error=>{assert.equal(error.code,expected,error.message);return true;});}

(async()=>{
  const {store,factory}=fixtureStore();
  const source=pdf(),meta=await store.put(source,{...details,uploadedAt:'2000-01-01',contactAt:'1999-01-01'});
  assert.equal(meta.uploadedAt,'2026-10-09T05:00:00.000Z');assert.equal(meta.actorId,'demo-operator');assert.equal(meta.contactId,'contact-1');assert.equal(meta.contactAt,undefined);
  assert.equal(meta.name,'nota-demo.pdf');assert.equal(meta.mimeType,'application/pdf');assert.equal(meta.size,64);assert.equal(meta.blob,undefined);assert.ok(Object.isFrozen(meta));
  assert.throws(()=>{meta.uploadedAt='changed';},TypeError);
  const saved=await store.get(meta.id);assert.ok(saved.blob instanceof Blob);assert.equal(saved.blob.type,'application/pdf');assert.equal(saved.blob.size,source.size);
  assert.deepEqual(new Uint8Array(await saved.blob.arrayBuffer()),new Uint8Array(await source.arrayBuffer()));assert.ok(Object.isFrozen(saved));
  assert.deepEqual(await store.list({contactId:'contact-1'}),[meta]);assert.deepEqual(await store.list({actorId:'other'}),[]);assert.equal(await store.get('missing'),null);
  assert.equal(factory.data.get('metadata').size,1);assert.equal(factory.data.get('files').size,1);assert.ok(factory.data.get('files').get(meta.id).bytes instanceof ArrayBuffer);assert.equal(factory.data.get('files').get(meta.id).blob,undefined);
  await store.close();assert.equal((await store.get(meta.id)).id,meta.id,'persists through connection recreation');
  assert.equal(await store.remove(meta.id),true);assert.equal(await store.remove(meta.id),false);assert.equal(await store.get(meta.id),null);assert.equal(factory.data.get('files').size,0);
  console.log('PASS: binary persistence, round trip, immutable actor/upload time, metadata-only list, scoped filtering, missing evidence, removal.');

  await code(store.put(namedBlob('<svg></svg>','image/svg+xml','active.svg'),details),'UNSUPPORTED_TYPE');
  await code(store.put(namedBlob('data:text/plain,hello','text/plain'),details),'UNSUPPORTED_TYPE');
  await code(store.put(namedBlob('','application/pdf'),details),'INVALID_FILE');
  await code(store.put(pdf(E.MAX_FILE_BYTES+1),details),'FILE_TOO_LARGE');
  await code(store.put(pdf(),{contactId:'contact-1'}),'INVALID_METADATA');
  await code(store.put(pdf(),{actorId:'demo-operator',contactId:'\u0000bad'}),'INVALID_METADATA');
  await code(store.put(namedBlob(await pdf().arrayBuffer(),'image/png','spoof.png'),details),'TYPE_MISMATCH');
  await code(store.put(namedBlob('%PDF-1.7\n','application/pdf'),details),'INVALID_CONTENT');
  await code(store.put(namedBlob(new Uint8Array([137,80,78,71,13,10,26,10]),'image/png'),details),'INVALID_CONTENT');
  await code(store.put(namedBlob((await wav().arrayBuffer()).slice(0,30),'audio/wav'),details),'INVALID_CONTENT');
  await code(store.put({size:64,type:'application/pdf',slice:()=>pdf(),arrayBuffer:async()=>new ArrayBuffer(6)},details),'TRUNCATED_FILE');
  await code(store.put({size:64,type:'application/pdf',slice:()=>pdf(),arrayBuffer:async()=>{throw Error('read');}},details),'FILE_READ_FAILED');
  assert.equal((await store.list()).length,0,'invalid inputs never create evidence');
  console.log('PASS: unsupported MIME, size, empty, missing actor, mismatch, truncated signatures/containers and read errors.');

  // Non-browser regression: persist the bytes validated on upload, never invoke
  // a file-backed slice; reconnect and reconstruct a fresh preview Blob.
  const durable=fixtureStore(),durableInput=pdf(),expectedBytes=await durableInput.arrayBuffer();
  durableInput.slice=()=>{throw Error('file-backed slice must not be persisted');};
  const durableMeta=await durable.store.put(durableInput,details);
  await durable.store.close();
  assert.deepEqual(await (await durable.store.get(durableMeta.id)).blob.arrayBuffer(),expectedBytes);
  assert.equal(await E.validateBlob((await durable.store.get(durableMeta.id)).blob),'application/pdf');
  for(const bytes of [new ArrayBuffer(0),new ArrayBuffer(63),'not bytes']){
    durable.factory.data.get('files').set(durableMeta.id,{id:durableMeta.id,bytes});
    await code(durable.store.get(durableMeta.id),'STORAGE_CORRUPT');
  }
  // Legacy Blob rows remain readable and are not migrated or removed on failure.
  const legacyRecord={id:durableMeta.id,blob:pdf()};
  durable.factory.data.get('files').set(durableMeta.id,legacyRecord);
  assert.equal(await E.validateBlob((await durable.store.get(durableMeta.id)).blob),'application/pdf');
  assert.equal(durable.factory.data.get('files').get(durableMeta.id),legacyRecord);
  const previousReader=global.FileReader,originalArrayBuffer=Blob.prototype.arrayBuffer;
  try{
    let readerCalls=0,behavior='success';
    global.FileReader=class {
      readAsArrayBuffer(blob){readerCalls++;queueMicrotask(async()=>{
        if(behavior==='error'){this.error=Error('reader failed');this.onerror();return;}
        if(behavior==='abort'){this.onabort();return;}
        this.result=behavior==='truncated'?new ArrayBuffer(3):behavior==='corrupt'?new ArrayBuffer(blob.size):await originalArrayBuffer.call(blob);this.onload();
      });}
    };
    Blob.prototype.arrayBuffer=async function(){throw Error('synthetic browser Blob read rejection');};
    assert.equal(await E.validateBlob((await durable.store.get(durableMeta.id)).blob),'application/pdf');
    assert.equal(readerCalls,1);
    const fallback=fixtureStore(),fallbackRow=await fallback.store.put(pdf(),details);
    assert.equal(await E.validateBlob((await fallback.store.get(fallbackRow.id)).blob),'application/pdf');
    for(const [mode,error] of [['error','FILE_READ_FAILED'],['abort','FILE_READ_FAILED'],['truncated','TRUNCATED_FILE'],['corrupt','INVALID_CONTENT']]){
      behavior=mode;await code(E.validateBlob((await durable.store.get(durableMeta.id)).blob),error);
      assert.equal(durable.factory.data.get('files').get(durableMeta.id),legacyRecord);
    }
    behavior='success';Blob.prototype.arrayBuffer=undefined;
    assert.equal(await E.validateBlob(pdf()),'application/pdf');
  }finally{
    Blob.prototype.arrayBuffer=originalArrayBuffer;
    if(previousReader===undefined)delete global.FileReader;else global.FileReader=previousReader;
  }
  console.log('PASS: durable validated byte storage/reopen, legacy compatibility, bounded FileReader fallback, corrupt/truncated/failed reads preserved. Non-browser stubs only.');


  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
  const jpg=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDj6KKK8E/TD//Z','base64');
  const webp=Buffer.from('UklGRjoAAABXRUJQVlA4IC4AAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD+8iJf/ILSuW8Af/vYL7sF92C/1sAA','base64');
  const mp3=new Uint8Array(417);mp3.set([255,251,144,0]);
  const ogg=new Uint8Array(77);ogg.set(Buffer.from('OggS'));ogg[5]=2;ogg[26]=1;ogg[27]=19;ogg.set(Buffer.from('OpusHead'),28);ogg.set(Buffer.from('OggS'),47);ogg[52]=4;ogg[73]=1;ogg[74]=2;ogg[75]=1;ogg[76]=1;
  const m4a=new Uint8Array(89),m4av=new DataView(m4a.buffer);m4av.setUint32(0,24);m4a.set(Buffer.from('ftypM4A '),4);m4a.set(Buffer.from('M4A isom'),16);m4av.setUint32(24,56);m4a.set(Buffer.from('moov'),28);m4av.setUint32(32,48);m4a.set(Buffer.from('trak'),36);m4av.setUint32(40,40);m4a.set(Buffer.from('mdia'),44);m4av.setUint32(48,32);m4a.set(Buffer.from('hdlr'),52);m4a.set(Buffer.from('soun'),64);m4av.setUint32(80,9);m4a.set(Buffer.from('mdat'),84);
  for(const [bytes,type] of [[png,'image/png'],[jpg,'image/jpeg'],[webp,'image/webp'],[mp3,'audio/mpeg'],[ogg,'audio/ogg'],[m4a,'audio/mp4']]){
    const row=await store.put(namedBlob(bytes,type),details);assert.equal(row.mimeType,type);
  }
  const mp4video=m4a.slice();mp4video.set(Buffer.from('vide'),64);await code(store.put(namedBlob(mp4video,'audio/mp4'),details),'INVALID_CONTENT');
  await code(store.put(namedBlob(mp3.slice(0,416),'audio/mpeg'),details),'INVALID_CONTENT');
  await code(store.put(namedBlob(Buffer.concat([mp3,mp3.slice(0,100)]),'audio/mpeg'),details),'INVALID_CONTENT');
  await code(store.put(namedBlob(jpg.subarray(0,jpg.length-4),'image/jpeg'),details),'INVALID_CONTENT');
  await code(store.put(namedBlob(ogg.slice(0,47),'audio/ogg'),details),'INVALID_CONTENT');
  const audio=await store.put(wav(),details);assert.equal(audio.mimeType,'audio/wav');
  console.log('PASS: allowlisted PNG/JPEG/WebP/PDF/MP3/WAV/OGG/M4A containers.');

  const videoSource=namedBlob(mp4video,'video/mp4','identidad-demo.mp4'),mp4row=await store.put(videoSource,{...details,documentType:'identity_video'});
  assert.equal(mp4row.mimeType,'video/mp4');assert.deepEqual(new Uint8Array(await (await store.get(mp4row.id)).blob.arrayBuffer()),mp4video);
  await store.close();assert.equal((await store.get(mp4row.id)).mimeType,'video/mp4','Video survives adapter recreation');
  await code(store.put(namedBlob(m4a,'video/mp4','audio-disguised-as-video.mp4'),details),'INVALID_CONTENT');
  await code(store.put(namedBlob(mp4video,'audio/mp4','video-disguised-as-audio.m4a'),details),'INVALID_CONTENT');
  await code(store.put(namedBlob(mp4video.subarray(0,mp4video.length-1),'video/mp4'),details),'INVALID_CONTENT');
  await code(store.put(namedBlob(Buffer.concat([mp4video,Buffer.from('<script>')]),'video/mp4'),details),'INVALID_CONTENT');
  const mixedVideo=new Uint8Array(137),mixedView=new DataView(mixedVideo.buffer);mixedVideo.set(m4a.subarray(0,24));mixedView.setUint32(24,104);mixedVideo.set(Buffer.from('moov'),28);mixedVideo.set(m4a.subarray(32,80),32);mixedVideo.set(mp4video.subarray(32,80),80);mixedVideo.set(m4a.subarray(80),128);
  assert.equal(await E.validateBlob(namedBlob(mixedVideo,'video/mp4')),'video/mp4');await code(store.put(namedBlob(mixedVideo,'audio/mp4'),details),'INVALID_CONTENT');
  const misplacedHandler=new Uint8Array(73),misplacedView=new DataView(misplacedHandler.buffer);misplacedHandler.set(m4a.subarray(0,24));misplacedView.setUint32(24,40);misplacedHandler.set(Buffer.from('moov'),28);misplacedHandler.set(mp4video.subarray(48,80),32);misplacedHandler.set(m4a.subarray(80),64);await code(store.put(namedBlob(misplacedHandler,'video/mp4'),details),'INVALID_CONTENT');
  const videoNoMedia=mp4video.slice(0,80);await code(store.put(namedBlob(videoNoMedia,'video/mp4'),details),'INVALID_CONTENT');
  for(const options of [{},{unknownSegment:true},{unknownSegment:true,unknownCluster:true}]){
    const content=webmFixture(options),row=await store.put(namedBlob(content,'video/webm','identidad-demo.webm'),{...details,documentType:'identity_video'});
    assert.equal(row.mimeType,'video/webm');assert.deepEqual(Buffer.from(await (await store.get(row.id)).blob.arrayBuffer()),content);
  }
  for(const options of [{video:false,codec:'A_OPUS'},{packetTrack:2},{audioTrack:true,packetTrack:2},{packet:false},{duplicate:true},{codec:'V_FAKE'},{docType:'xxxx'}])await code(store.put(namedBlob(webmFixture(options),'video/webm'),details),'INVALID_CONTENT');
  const webm=webmFixture();for(const content of [webm.subarray(0,4),webm.subarray(0,webm.length-1),Buffer.concat([webm,Buffer.from('<html>')])])await code(store.put(namedBlob(content,'video/webm'),details),'INVALID_CONTENT');
  await code(store.put(namedBlob(webm,'audio/ogg'),details),'TYPE_MISMATCH');await code(store.put(namedBlob(webm,'audio/mp4'),details),'TYPE_MISMATCH');await code(store.put(namedBlob(await pdf().arrayBuffer(),'video/mp4'),details),'TYPE_MISMATCH');
  const oversizedVideo={size:E.MAX_FILE_BYTES+1,type:'video/webm',slice(){throw Error('Must not read oversized media');},arrayBuffer(){throw Error('Must not read oversized media');}};await code(store.put(oversizedVideo,details),'FILE_TOO_LARGE');
  // Tiny real containers generated with the installed FFmpeg from a solid-color frame.
  // They require no FFmpeg process, browser, network or recording when this suite runs.
  const realWebm=Buffer.from('GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAIIEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEjTbuMU6uEHFO7a1OsggHy7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjEuNy4xMDNXQYxMYXZmNjEuNy4xMDNEiYhAf0AAAAAAABZUrmvIrgEAAAAAAAA/14EBc8WIfBk7DfpqIBycgQAitZyDdW5kiIEAhoVWX1ZQOYOBASPjg4QO5rKA4JCwgSC6gSCagQJVsIRVuYEBElTDZ0B/c3OfY8CAZ8iZRaOHRU5DT0RFUkSHjExhdmY2MS43LjEwM3Nz2mPAi2PFiHwZOw36aiAcZ8ilRaOHRU5DT0RFUkSHmExhdmM2MS4xOS4xMDEgbGlidnB4LXZwOWfIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDAuNTAwMDAwMDAwAB9DtnXF54EAo6uBAACAgkmDQgAB8AH2ADgkHBhKAAAwYAAAEN///RVi/////5FWf///SMAAo5OBAPoAhgBAkpwAUAAAAyAAAENAHFO7a5G7j7OBALeK94EB8YIBqPCBAw==','base64');
  const realMp4=Buffer.from('AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMxbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAAfQAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAlx0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAAfQAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAACAAAAAgAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAH0AAAAAAABAAAAAAHUbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAIABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABf21pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAT9zdGJsAAAAv3N0c2QAAAAAAAAAAQAAAK9hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAACAAIABIAAAASAAAAAAAAAABFUxhdmM2MS4xOS4xMDEgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAANWF2Y0MBZAAK/+EAGGdkAAqs2UlsBEAAAAMAQAAAAwIDxIllgAEABmjr48siwP34+AAAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAAtwAAAAAAAAAAYc3R0cwAAAAAAAAABAAAAAgAAEAAAAAAUc3RzcwAAAAAAAAABAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAAAgAAAAEAAAAcc3RzegAAAAAAAAAAAAAAAgAAAs8AAAANAAAAFHN0Y28AAAAAAAAAAQAAA2EAAABhdWR0YQAAAFltZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAACxpbHN0AAAAJKl0b28AAAAcZGF0YQAAAAEAAAAATGF2ZjYxLjcuMTAzAAAACGZyZWUAAALkbWRhdAAAAq0GBf//qdxF6b3m2Ui3lizYINkj7u94MjY0IC0gY29yZSAxNjQgcjMxMDggMzFlMTlmOSAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMjMgLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0xIHJlZj0zIGRlYmxvY2s9MTowOjAgYW5hbHlzZT0weDM6MHgxMTMgbWU9aGV4IHN1Ym1lPTcgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MSBtZV9yYW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTEgOHg4ZGN0PTEgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz0xIGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MyBiX3B5cmFtaWQ9MiBiX2FkYXB0PTEgYl9iaWFzPTAgZGlyZWN0PTEgd2VpZ2h0Yj0xIG9wZW5fZ29wPTAgd2VpZ2h0cD0yIGtleWludD0yNTAga2V5aW50X21pbj00IHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAGmWIhAAR//7n4/wKba7/cTSgY7WtbXbPvwb5AAAACUGaIWxBD/6rgA==','base64');
  assert.equal(await E.validateBlob(namedBlob(realWebm,'video/webm')),'video/webm');assert.equal(await E.validateBlob(namedBlob(realMp4,'video/mp4')),'video/mp4');
  const gif=gifFixture(),gifrow=await store.put(namedBlob(gif,'image/gif','perfil-demo.gif'),{...details,documentType:'profile_photo'});assert.equal(gifrow.mimeType,'image/gif');assert.equal((await store.get(gifrow.id)).blob.type,'image/gif');
  await code(store.put(namedBlob(gif.subarray(0,gif.length-1),'image/gif'),details),'INVALID_CONTENT');await code(store.put(namedBlob(Buffer.concat([gif,Buffer.from('<script>')]),'image/gif'),details),'INVALID_CONTENT');
  const gifNoDimensions=Buffer.from(gif);gifNoDimensions[6]=0;await code(store.put(namedBlob(gifNoDimensions,'image/gif'),details),'INVALID_CONTENT');
  const gifTruncatedPalette=Buffer.from('GIF89a\x01\x00\x01\x00\x87\x00\x00','binary');await code(store.put(namedBlob(gifTruncatedPalette,'image/gif'),details),'INVALID_CONTENT');
  const gifBadBlock=Buffer.from(gif);gifBadBlock[30]=100;await code(store.put(namedBlob(gifBadBlock,'image/gif'),details),'INVALID_CONTENT');
  await code(store.put(namedBlob(gif,'image/png'),details),'TYPE_MISMATCH');await code(store.put(namedBlob('<html>','image/gif'),details),'INVALID_CONTENT');
  console.log('PASS: real and structural WebM/MP4 video, exact tracks and payloads, reload persistence, MIME separation, malformed/truncated/oversized video, and bounded GIF profile containers.');

  const quota=fixtureStore();
  for(let i=0;i<5;i++)await quota.store.put(pdf(E.MAX_FILE_BYTES),details);
  await code(quota.store.put(pdf(),details),'TOTAL_QUOTA');assert.equal((await quota.store.list()).length,5);assert.equal(quota.factory.data.get('files').size,5);
  const rows=await quota.store.list();await quota.store.remove(rows[0].id);await quota.store.put(pdf(E.MAX_FILE_BYTES),details);
  assert.equal((await quota.store.list()).reduce((sum,row)=>sum+row.size,0),E.MAX_TOTAL_BYTES);
  const raced=fixtureStore();for(let i=0;i<4;i++)await raced.store.put(pdf(E.MAX_FILE_BYTES),details);
  const simultaneous=await Promise.allSettled([raced.store.put(pdf(E.MAX_FILE_BYTES),details),raced.store.put(pdf(E.MAX_FILE_BYTES),details)]);
  assert.equal(simultaneous.filter(x=>x.status==='fulfilled').length,1);assert.equal(simultaneous.find(x=>x.status==='rejected').reason.code,'TOTAL_QUOTA');
  const capped=fixtureStore();for(let i=0;i<E.MAX_FILES;i++)await capped.store.put(pdf(),details);
  await code(capped.store.put(pdf(),details),'FILE_COUNT_LIMIT');
  console.log('PASS: total quota, released quota after deletion, concurrent uploads serialized, bounded evidence count.');

  const failed=fixtureStore();
  failed.factory.failRequest={store:'metadata',operation:'add'};
  await code(failed.store.put(pdf(),details),'STORAGE_FAILED');
  assert.equal(failed.factory.data.get('files').size,0,'blob rolls back when metadata fails');assert.equal(failed.factory.data.get('metadata').size,0);
  failed.factory.failRequest={store:'files',operation:'add',name:'QuotaExceededError'};
  await code(failed.store.put(pdf(),details),'STORAGE_QUOTA');assert.equal((await failed.store.list()).length,0);
  failed.factory.failCommit=true;await code(failed.store.put(pdf(),details),'STORAGE_FAILED');assert.equal(failed.factory.data.get('files').size,0,'never report success before commit');
  const keep=await failed.store.put(pdf(),details);
  failed.factory.failRequest={store:'metadata',operation:'delete'};await code(failed.store.remove(keep.id),'STORAGE_FAILED');assert.ok(await failed.store.get(keep.id),'failed removal is atomic');
  const fixedId=E.createEvidenceStore({indexedDB:failed.factory,randomId:()=>keep.id});await code(fixedId.put(wav(),details),'STORAGE_FAILED');assert.equal((await failed.store.get(keep.id)).name,'nota-demo.pdf','ID collision never overwrites attribution');
  failed.factory.data.get('files').set(keep.id,{id:keep.id,blob:namedBlob(new Uint8Array(64),'text/html')});await code(failed.store.get(keep.id),'STORAGE_CORRUPT','mismatched stored MIME is not returned for preview');
  failed.factory.data.get('files').delete(keep.id);await code(failed.store.get(keep.id),'STORAGE_CORRUPT');
  const recover=fixtureStore();recover.factory.failOpen=true;await code(recover.store.put(pdf(),details),'STORAGE_FAILED');assert.equal((await recover.store.put(pdf(),details)).size,64,'opening failures are retryable');
  await code(E.createEvidenceStore({indexedDB:null}).put(pdf(),details),'STORAGE_UNAVAILABLE');
  console.log('PASS: quota/storage failures, binary/metadata atomic rollback, commit failure, atomic removal, ID collision, corrupt file, retryable opening and unavailable storage.');
  console.log('PASS: CRM evidence functional tests. Browser preview/revocation is a separate UI check.');
  if(process.env.CRM_EVIDENCE_BROWSER==='1')await browserSmoke();
})().catch(error=>{console.error(error);process.exitCode=1;});


// Explicit opt-in only: the ordinary regression runner never launches a browser.
async function browserSmoke(){
  const {chromium}=require('playwright');
  const fs=require('node:fs'),path=require('node:path');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox'],env:{...process.env,XDG_CONFIG_HOME:'/tmp/pulzzo-evidence-browser-config'}});
  try{
    const page=await browser.newPage();
    // Route the synthetic origin entirely in-process. No HTTP requests leave the test.
    await page.route('http://evidence.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Evidence test</title>'}));
    await page.goto('http://evidence.test/');
    await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../assets/js/crm-demo-evidence.js'),'utf8')});
    const result=await page.evaluate(async()=>{
      const E=PulzzoCRMEvidence;let id=0;
      const store=E.createEvidenceStore({now:()=>new Date('2026-10-09T05:00:00Z'),randomId:()=>`real-${++id}`});
      function file(size=64){const bytes=new Uint8Array(size);bytes.fill(32);bytes.set(new TextEncoder().encode('%PDF-1.7\n'));bytes.set(new TextEncoder().encode('\n%%EOF\n'),size-7);return new File([bytes],'documento.pdf',{type:'application/pdf'});}
      const detail={actorId:'demo-operator',contactId:'contact-real'};
      const row=await store.put(file(),detail),got=await store.get(row.id);
      if(!(got.blob instanceof Blob)||got.blob.size!==64)throw Error('Blob did not round-trip');
      await store.close();if((await store.get(row.id)).uploadedAt!==row.uploadedAt)throw Error('Reopen lost metadata');
      const originalAdd=IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add=function(value){if(this.name==='metadata')throw new DOMException('forced metadata failure','QuotaExceededError');return originalAdd.call(this,value);};
      let failure;try{await store.put(file(),detail);}catch(error){failure=error.code;}finally{IDBObjectStore.prototype.add=originalAdd;}
      if(failure!=='STORAGE_QUOTA')throw Error('Missing metadata failure');
      const raw=await new Promise((resolve,reject)=>{const request=indexedDB.open(E.DB_NAME,1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
      const count=await new Promise((resolve,reject)=>{const tx=raw.transaction(['files','metadata'],'readonly'),req=tx.objectStore('files').count();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});raw.close();
      if(count!==1)throw Error('Orphan binary after metadata failure');
      await store.remove(row.id);
      for(let n=0;n<4;n++)await store.put(file(E.MAX_FILE_BYTES),detail);
      const results=await Promise.allSettled([store.put(file(E.MAX_FILE_BYTES),detail),store.put(file(E.MAX_FILE_BYTES),detail)]);
      if(results.filter(x=>x.status==='fulfilled').length!==1||results.find(x=>x.status==='rejected').reason.code!=='TOTAL_QUOTA')throw Error('Concurrent quota failure');
      for(const entry of await store.list({contactId:'contact-real'}))await store.remove(entry.id);
      if((await store.list()).length!==0)throw Error('Cleanup failed');
      await store.close();
      return navigator.userAgent;
    });
    console.log('PASS: real Chromium IndexedDB Blob round-trip, reopen, atomic metadata-failure rollback, concurrent quota and deletion. '+result);
  }finally{await browser.close();}
}
