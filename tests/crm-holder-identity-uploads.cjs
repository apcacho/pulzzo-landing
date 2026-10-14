'use strict';
const assert=require('node:assert/strict');
const Store=require('../assets/js/crm-demo-store.js'),Assisted=require('../assets/js/crm-assisted.js'),Context=require('../assets/js/crm-onboarding-session.js'),Evidence=require('../assets/js/crm-demo-evidence.js');
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
function memory(){const data=new Map();return {getItem:key=>data.has(key)?data.get(key):null,setItem(key,value){if(this.fail)throw Error('Quota exceeded');data.set(key,String(value));},removeItem:key=>data.delete(key),dump:()=>JSON.stringify([...data]),keys:()=>[...data.keys()]};}
function ok(out){assert.equal(out.ok,true,out.error);return out.value;}
function error(fn,code){assert.throws(fn,e=>!code||e.code===code,code);}
function fixture(kind='patient',mail='holder@example.test'){
 const disk=memory(),session=memory(),actor={id:'kam_a',role:'kam'},holder={id:'holder_a',role:'holder'};let time=Date.parse('2026-10-12T06:00:00Z');
 const now=()=>new Date(time).toISOString(),store=Store.createStore({storage:disk,actor,now}),api=Assisted.createAssisted({store,actor,now});
 const contact=ok(store.createContact({type:kind,name:'Ejemplo Demo',email:mail,phone:'5512345678',assignedKam:actor.id,originalSource:'unknown',captureMechanism:'crm_manual'},store.snapshot().revision));
 const exp=ok(api.beginDraft({contactId:contact.id,kind},store.snapshot().revision));
 const idb=memoryIndexedDB(),options={storage:disk,sessionStorage:session,actor,kind,expId:exp.id,now,evidenceOptions:{indexedDB:idb}};
 require('./fixtures/registered-expedient.cjs')({storage:disk,staff:actor,expId:exp.id,holder,now});
 const launch=Context.start(options),location={pathname:kind==='doctor'?'/registro-doctor.html':'/solicitud-paciente.html',search:new URL(launch.url,'https://example.test').search,hash:new URL(launch.url,'https://example.test').hash};
 const open=()=>Context.open({...options,location}),read=()=>store.snapshot().expedients[exp.id];
 function claim(){const s=Store.createStore({storage:disk,actor:holder,now}),a=Assisted.createAssisted({store:s,actor:holder,now});session.setItem(Context.HOLDER_KEY,JSON.stringify({actor:holder,expId:exp.id,demo:true,expiresAt:Date.parse(now())+600000}));const next=Context.start({...options,actor:holder,returnUrl:'asistido-demo.html?review=1'});location.search=new URL(next.url,'https://example.test').search;location.hash=new URL(next.url,'https://example.test').hash;return {store:s,api:a,ctx:Context.open({...options,actor:holder,location})};}

 return {idb,disk,session,actor,holder,store,api,contact,exp,kind,now,options,location,launch,open,read,claim,advance(ms){time+=ms;}};
}
const document=(type='application/pdf')=>{const bytes=type==='video/webm'?Buffer.from([0x1a,0x45,0xdf,0xa3,1,2,3,4]):Buffer.from('%PDF-1.4\nFake local demo document');return {name:type==='video/webm'?'selfie-demo.webm':'document-demo.pdf',type,size:bytes.length,dataUrl:'data:'+type+';base64,'+bytes.toString('base64'),demo:true,status:'En revisión'};};
function completePatient(ctx){const s=JSON.parse(ctx.storage.getItem('pulzzo_application'));Object.assign(s,{procedure:{forWhom:'Para mí',specialties:['Odontología'],procedures:['Dental'],when:'Pronto',doctorSource:'pendiente',amount:20000,termMonths:12},selectedTerm:12,identity:{name:'Ejemplo Demo',nameParts:{first:'Ejemplo',paternal:'Demo'},curp:'DEMO-CURP',rfcBase:'DEMO123456',homoclave:'XXX',address:{street:'Ejemplo',exterior:'1',zip:'01000',colony:'Demo',city:'CDMX',state:'CDMX'},housingStatus:'Propia'},incomeType:'nomina',incomeMonthly:25000,comfortablePayment:3500,identityFiles:{proofAddress:document()},documentFiles:{bank:[document(),document(),document()],payroll:[document(),document(),document()]},references:[{name:'Una Demo',phone:'5511111111',relationship:'Amigo'},{name:'Otra Demo',phone:'5522222222',relationship:'Familiar'}]});ctx.storage.setItem('pulzzo_application',JSON.stringify(s));return s;}
const keys=['ineFront','ineBack','selfieVideo'];
async function rejects(promise,code){await assert.rejects(promise,e=>e.code===code,code);}
function refresh(f){return Context.open({...f.options,location:f.location});}
function rawIdentityChange(f,key,file){return f.store.transact(f.store.snapshot().revision,(s,tx)=>{
 const exp=s.expedients[f.exp.id],old=exp.onboarding,records={...old.records},state=JSON.parse(records.pulzzo_application);state.identityFiles={...state.identityFiles,[key]:file};records.pulzzo_application=JSON.stringify(state);
 exp.onboarding={...old,records,revision:old.revision+1,updatedBy:f.actor.id,updatedAt:tx.now};
 const projection=Assisted.onboardingProjection(exp,records);exp.fields=projection.fields;exp.documents=projection.documents.map(d=>({...d,uploadedBy:d.evidenceActorId||f.actor.id,uploadedAt:d.evidenceUploadedAt||tx.now}));return exp;
});}
function seedLegacy(f){ // Migration fixture representing bytes stored before holder-only capture.
 const snapshot=JSON.parse(f.disk.getItem(Store.STORAGE_KEY)),exp=snapshot.expedients[f.exp.id],state=JSON.parse(exp.onboarding.records.pulzzo_application);
 state.identityFiles={...state.identityFiles,...Object.fromEntries(keys.map(k=>[k,document()]))};exp.onboarding.records.pulzzo_application=JSON.stringify(state);
 for(const [path,value]of Object.entries(Assisted.flattenOnboarding(exp.onboarding.records)))if(path.startsWith('pulzzo_application.identityFiles.'))exp.onboarding.fieldHistory[path]=[{value,deleted:false,actorId:f.actor.id,actorRole:'kam',source:'assisted',at:f.now()}];
 const projection=Assisted.onboardingProjection(exp,exp.onboarding.records);exp.fields=projection.fields;exp.documents=projection.documents.map(d=>({...d,uploadedBy:f.actor.id,uploadedAt:f.now()}));f.disk.setItem(Store.STORAGE_KEY,JSON.stringify(snapshot));return state;
}
async function attach(ctx,key){const d=await ctx.putFile(pdf(),{documentType:key}),state=JSON.parse(ctx.storage.getItem('pulzzo_application'));state.identityFiles={...state.identityFiles,[key]:d};ctx.storage.setItem('pulzzo_application',JSON.stringify(state));return d;}
(async()=>{
 {
  const f=fixture(),ctx=f.open(),evidence=Evidence.createEvidenceStore({store:f.store,indexedDB:f.idb});
  for(const key of keys){
   await rejects(ctx.putFile(pdf(),{documentType:key}),'HOLDER_REQUIRED');
   await rejects(evidence.put(pdf(),{contactId:f.contact.id,documentType:key}),'HOLDER_UPLOAD_REQUIRED');
   const state=JSON.parse(ctx.storage.getItem('pulzzo_application'));state.identityFiles={...state.identityFiles,[key]:document()};
   error(()=>ctx.storage.setItem('pulzzo_application',JSON.stringify(state)),'HOLDER_UPLOAD_REQUIRED');
   const result=rawIdentityChange(f,key,document());assert.equal(result.ok,false);assert.equal(result.code,'HOLDER_UPLOAD_REQUIRED');
  }
  await attach(ctx,'proofAddress');await attach(ctx,'other');assert.equal(f.read().documents.length,2);
  const unscoped=Evidence.createEvidenceStore({indexedDB:f.idb});await rejects(unscoped.put(pdf(),{contactId:f.contact.id,actorId:f.holder.id,documentType:'ineFront'}),'HOLDER_UPLOAD_REQUIRED');
  const admin=Store.createStore({storage:f.disk,actor:{id:'admin',role:'admin'},now:f.now}),adminEvidence=Evidence.createEvidenceStore({store:admin,indexedDB:f.idb});await rejects(adminEvidence.put(pdf(),{contactId:f.contact.id,documentType:'ineBack'}),'HOLDER_UPLOAD_REQUIRED');
  console.log('PASS KAM input, direct put, raw transactions, admin and unscoped identity spoofing blocked; other documents continue.');
 }
 {
  const f=fixture(),ctx=f.open();const legacy=seedLegacy(f);const canonical=JSON.parse(f.disk.getItem(Store.STORAGE_KEY));
  const assistant=refresh(f);assert.equal((await assistant.getFile(legacy.identityFiles.ineFront)).blob.size,legacy.identityFiles.ineFront.size);
  const state=JSON.parse(assistant.storage.getItem('pulzzo_application'));state.incomeMonthly=35000;assistant.storage.setItem('pulzzo_application',JSON.stringify(state));
  assert.deepEqual(JSON.parse(f.read().onboarding.records.pulzzo_application).identityFiles,legacy.identityFiles);
  const h=f.claim();for(const key of keys)assert.equal(h.ctx.holderIdentityFileComplete(key),false);
  const reconfirm=JSON.parse(h.ctx.storage.getItem('pulzzo_application'));reconfirm.identityFiles.ineFront.actorId=f.holder.id;reconfirm.identityFiles.ineFront.status='Confirmado';h.ctx.storage.setItem('pulzzo_application',JSON.stringify(reconfirm));assert.equal(h.ctx.holderIdentityFileComplete('ineFront'),false);
  for(const key of keys){const d=await attach(h.ctx,key);assert.equal(d.actorId,f.holder.id);assert.equal(d.contactId,f.contact.id);assert.equal(h.ctx.holderIdentityFileComplete(key),true);assert.equal(h.ctx.expId,f.exp.id);}
  assert.equal((await h.ctx.getFile(legacy.identityFiles.ineFront)).blob.size,legacy.identityFiles.ineFront.size);
  const exp=f.read();for(const key of keys){assert.ok(exp.onboarding.identityFileHistory[key].some(file=>file.dataUrl===legacy.identityFiles[key].dataUrl));assert.deepEqual(exp.onboarding.fieldHistory['pulzzo_application.identityFiles.'+key+'.dataUrl'][0],canonical.expedients[f.exp.id].onboarding.fieldHistory['pulzzo_application.identityFiles.'+key+'.dataUrl'][0]);}
  assert.equal(Assisted.onboardingMissing(exp).some(m=>keys.some(k=>m==='Documento: '+k)),false);
  const own=Evidence.createEvidenceStore({store:h.store,indexedDB:f.idb});const front=JSON.parse(exp.onboarding.records.pulzzo_application).identityFiles.ineFront;
  await rejects(own.remove(front.evidenceId),'EVIDENCE_LINKED');
  await rejects(own.put(pdf(),{contactId:f.contact.id,documentType:'ineFront',expedientId:'exp_wrong'}),'HOLDER_UPLOAD_REQUIRED');
  const noReplay=JSON.parse(h.ctx.storage.getItem('pulzzo_application'));delete noReplay.identityFiles.ineFront;h.ctx.storage.setItem('pulzzo_application',JSON.stringify(noReplay));noReplay.identityFiles.ineFront=legacy.identityFiles.ineFront;
  error(()=>h.ctx.storage.setItem('pulzzo_application',JSON.stringify(noReplay)),'HOLDER_UPLOAD_REQUIRED');assert.equal(h.ctx.holderIdentityFileComplete('ineFront'),false);
  console.log('PASS legacy bytes and audit remain readable/preserved; reconfirmation is insufficient; actual holder uploads complete the same expediente.');
 }
 {
  const f=fixture(),h=f.claim();const e=Evidence.createEvidenceStore({store:h.store,indexedDB:f.idb,isCurrent:()=>false});await rejects(e.put(pdf(),{contactId:f.contact.id,documentType:'ineFront'}),'ACCESS_REVOKED');
  const snapshot=JSON.parse(f.disk.getItem(Store.STORAGE_KEY));snapshot.expedients[f.exp.id].holderActions.finalConfirmation={confirmed:true};f.disk.setItem(Store.STORAGE_KEY,JSON.stringify(snapshot));
  const locked=Evidence.createEvidenceStore({store:h.store,indexedDB:f.idb});await rejects(locked.put(pdf(),{contactId:f.contact.id,documentType:'selfieVideo'}),'SUBMITTED_LOCK');
  await rejects(h.ctx.putFile(pdf(),{documentType:'ineBack'}),'SUBMITTED_LOCK');
  console.log('PASS revoked sessions and reviewed/submitted identity writes remain locked.');
 }
 {
  const f=fixture(),compact=JSON.parse(f.disk.getItem(Store.STORAGE_KEY));compact.expedients[f.exp.id]=f.exp;f.disk.setItem(Store.STORAGE_KEY,JSON.stringify(compact));for(const label of ['identity','ineFront','ineBack','selfieVideo']){const result=f.api.editDraft(f.exp.id,{documents:[{demo:true,label,fileName:'demo.pdf'}]},f.store.snapshot().revision);assert.equal(result.ok,false);assert.equal(result.code,'HOLDER_UPLOAD_REQUIRED');}
  const d=fixture('doctor'),e=Evidence.createEvidenceStore({store:d.store,indexedDB:d.idb});const saved=await e.put(pdf(),{contactId:d.contact.id,documentType:'identity'});assert.equal(saved.actorId,d.actor.id);
  console.log('PASS legacy patient identity routes blocked while doctor document capture remains allowed.');
 }
 {
  const Office=require('../assets/js/crm-demo-office.js'),Corrections=require('../assets/js/crm-demo-corrections.js'),f=fixture(),h=f.claim();completePatient(h.ctx);for(const key of keys)await attach(h.ctx,key);
  for(const action of ['otp','buroConsent','legalConsent'])ok(h.api.holderAction(f.exp.id,action,{confirmed:true,demo:true,termsVersion:'demo-v1',privacyVersion:'demo-v1'},h.store.snapshot().revision));
  await Context.validateDocuments({...f.options,actor:f.holder});ok(h.api.holderAction(f.exp.id,'finalConfirmation',{confirmed:true,demo:true},h.store.snapshot().revision));await Context.validateDocuments({...f.options,actor:f.holder});ok(h.api.submit(f.exp.id,h.store.snapshot().revision));
  const baseline=JSON.stringify(f.read().submissionSnapshot);let db=Office.prepareImport({patients:[],providers:[],audit:[]},f.read(),'risk_demo').database;
  const doc=db.patients[0].documents.find(d=>d.type==='ineFront');db=Corrections.prepareDocumentRequest(db,f.read(),doc.id,'Carga de identidad legible demo','risk_demo').database;f.disk.setItem(Office.BO_KEY,JSON.stringify(db));
  const evidence=Evidence.createEvidenceStore({store:h.store,indexedDB:f.idb,now:f.now}),options={readDocumentReview:exp=>Corrections.readDocumentReview(f.disk,exp),createDocumentSubmission:Corrections.createDocumentSubmission},api=Assisted.createAssisted({store:h.store,actor:f.holder,evidenceStore:evidence,...options});
  ok(api.receiveDocumentCorrection(f.exp.id,h.store.snapshot().revision));
  const meta=await evidence.put(pdf(),{contactId:f.contact.id,expedientId:f.exp.id,documentType:'ineFront'});
  ok(await api.verifyOnboardingEvidence(f.exp.id,{...meta,evidenceId:meta.id,type:meta.mimeType},h.store.snapshot().revision));
  ok(api.editDocumentCorrectionDraft(f.exp.id,{descriptor:meta},h.store.snapshot().revision));ok(api.submitDocumentCorrection(f.exp.id,{confirmed:true,demo:true},h.store.snapshot().revision));
  assert.equal(f.read().documentCorrectionSubmission.descriptor.actorId,f.holder.id);assert.equal(JSON.stringify(f.read().submissionSnapshot),baseline);
  await rejects(evidence.put(pdf(),{contactId:f.contact.id,expedientId:f.exp.id,documentType:'ineFront'}),'SUBMITTED_LOCK');
  console.log('PASS personally uploaded observed identity correction succeeds for exact holder/case and freezes after sending; original submission remains intact.');
 }
 {
  const {setup,enterIdentity,finishVerification}=require('./crm-registration-layout.cjs'),signup=setup('patient','',{realOnboarding:true});
  await enterIdentity(signup,'restore-holder@example.test');await finishVerification(signup);
  const review=setup('patient','',{disk:signup.disk,session:signup.session,location:{search:'?review=1',hash:''},realOnboarding:true}),saved=review.session.getItem('pulzzo_crm_holder_demo_session');
  assert.ok(review.get('continueOnboarding'));review.listeners.pagehide.forEach(fn=>fn({}));review.listeners.pageshow.forEach(fn=>fn({persisted:true}));assert.ok(review.get('continueOnboarding'));assert.equal(review.session.getItem('pulzzo_crm_holder_demo_session'),saved);
  review.listeners.pagehide.forEach(fn=>fn({}));review.session.removeItem('pulzzo_crm_holder_demo_session');review.listeners.pageshow.forEach(fn=>fn({persisted:true}));assert.ok(review.get('identityForm'));assert.match(review.html(),/código demo nuevo/);assert.equal(review.get('continueOnboarding'),undefined);
  console.log('PASS cached holder view reconnects only its still-saved session; removed session returns to fresh verification.');
 }
 console.log('PASS holder-only identity upload domain and evidence regression suite.');
})().catch(error=>{console.error(error);process.exitCode=1;});
