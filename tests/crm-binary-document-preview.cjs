'use strict';
// Executes the shipped preview resolver and DOM wrapper. No browser or network.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Preview=require('../assets/js/crm-document-preview.js');
const Evidence=require('../assets/js/crm-demo-evidence.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const cases=[];
const test=(name,run)=>cases.push({name,run});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const at='2026-10-12T06:00:00.000Z',evidenceId='evidence_original',contactId='contact_one',actorId='kam_ana',fileName='documento-demo.pdf',bytes=Buffer.from('%PDF-1.7\nDocumento ficticio\n%%EOF\n'),blob=new Blob([bytes],{type:'application/pdf'});
 const metadata={id:'MED-CRM-exp_one-DOC-0',evidenceId,sourceDocumentId:'full_exp_one_files_bank_cover_0',onboardingPath:'files.bank_cover.0',contactId,type:'bank_cover',fileName,size:blob.size,mimeType:blob.type,uploadedBy:actorId,uploadedAt:at,status:'pending',metadataOnly:true};
 const source={id:metadata.sourceDocumentId,evidenceId,contactId,label:'clinic',fileName,size:blob.size,mimeType:blob.type,uploadedBy:actorId,uploadedAt:at,onboardingPath:metadata.onboardingPath,demo:true};
 const holderIdentity={id:'holder_one',email:'holder@example.test',verifiedAt:at,demo:true},holderActions=Object.fromEntries(['otp','legalConsent','finalConfirmation'].map(action=>[action,{actorId:'holder_one',actorRole:'holder',at,confirmed:true,demo:true,capacity:'holder',authorityConfirmed:true,termsVersion:'demo-v1',privacyVersion:'demo-v1'}]));
 const exp={id:'exp_one',contactId,kind:'doctor',status:'submitted',submittedAt:at,submissionRevision:5,holderIdentity,holderActions,fields:{fullName:'Persona Ficticia',email:holderIdentity.email},documents:[source]};
 exp.submissionSnapshot={schema:'pulzzo.crm.submission.v1',submissionId:'submission_exp_one',expedientId:exp.id,contactId,accountId:holderIdentity.id,kind:exp.kind,submittedAt:at,revision:5,holderIdentity:clone(holderIdentity),holderActions:clone(holderActions),holderConfirmation:clone(holderActions.finalConfirmation),fields:clone(exp.fields),documents:clone(exp.documents),onboarding:null,demo:true};
 const record={id:'MED-CRM-exp_one',doctorAccountId:holderIdentity.id,files:[metadata],crmIntake:{expedientId:exp.id,contactId,accountId:holderIdentity.id,submissionId:exp.submissionSnapshot.submissionId,submittedAt:at}},file={id:evidenceId,name:fileName,contactId,actorId,size:blob.size,mimeType:blob.type,uploadedAt:at,documentType:'bank_cover',blob};
 const data=new Map([['pulzzo_crm_assisted_demo_v1',JSON.stringify({version:1,revision:5,expedients:{[exp.id]:exp}})],['pulzzo_backoffice_demo',JSON.stringify({providers:[record],patients:[]})]]),storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,String(value))};let current=true;
 const options={metadata,record,storage,evidence:{get:async id=>id===evidenceId?file:null},validateBlob:Evidence.validateBlob,isCurrent:()=>current};
 return {at,metadata,source,record,exp,file,storage,data,options,revoke:()=>{current=false;},saveExp:()=>storage.setItem('pulzzo_crm_assisted_demo_v1',JSON.stringify({version:1,revision:5,expedients:{[exp.id]:exp}}))};
}

test('binary resolver returns only exact owned reference with matching bytes and safe display filename',async()=>{
 const x=fixture();assert.equal(await Preview.resolveBinary(x.options),x.file);
 x.file.name='<img "quoted">.pdf';x.metadata.fileName='‹img ”quoted”›.pdf';assert.equal(await Preview.resolveBinary(x.options),x.file);
});

test('binary resolver rejects foreign identity, missing file, mismatched metadata and invalid container',async()=>{
 for(const change of [x=>x.record.crmIntake.contactId='foreign',x=>x.record.crmIntake.accountId='foreign',x=>x.record.crmIntake.submissionId='other',x=>x.metadata.evidenceId='unlinked',x=>x.metadata.uploadedBy='other',x=>x.metadata.uploadedAt='2020-01-01',x=>x.metadata.size++,x=>x.metadata.mimeType='image/png',x=>x.metadata.fileName='wrong.pdf',x=>x.options.evidence.get=async()=>null,x=>x.file.blob=new Blob(['not a PDF'],{type:'application/pdf'})]){const x=fixture();change(x);await assert.rejects(Preview.resolveBinary(x.options));}
});

test('binary resolver rejects altered original documents outside the frozen submission',async()=>{
 const x=fixture();x.exp.documents[0].evidenceId='forged_same_contact';x.metadata.evidenceId='forged_same_contact';x.file.id='forged_same_contact';x.options.evidence.get=async()=>x.file;x.saveExp();
 await assert.rejects(Preview.resolveBinary(x.options),'An original must be included in the frozen receipt, not only mutable live documents');
});

test('role revocation and CRM changes during either async stage discard returned bytes',async()=>{
 for(const stage of ['read','validate'])for(const change of ['role','state']){const x=fixture();let release;
  if(stage==='read')x.options.evidence.get=()=>new Promise(resolve=>{release=()=>resolve(x.file);});else x.options.validateBlob=()=>new Promise(resolve=>{release=()=>resolve('application/pdf');});
  const pending=Preview.resolveBinary(x.options);await tick();if(change==='role')x.revoke();else{x.exp.updatedAt='new';x.saveExp();}release();await assert.rejects(pending);
 }
});

function mounted(){
 const x=fixture(),listeners={},created=[],revoked=[],pending=[],nodes=[],target={children:[],isConnected:true,textContent:'',replaceChildren(){this.children=[];},appendChild(node){this.children.push(node);}},logout={addEventListener(type,handler){listeners['logout:'+type]=handler;}};
 let allowed=true,actor='readonly_demo',actorEmail='readonly@example.test';
 const context={kind:'provider',attachmentIndex:null},resolved={record:x.record,doc:x.metadata,files:[],missing:false};
 const window={document:{querySelector:selector=>selector==='#modal .review-preview-empty'?target:null,getElementById:id=>id==='logoutBtn'?logout:null,createElement(tag){const node={tagName:tag.toUpperCase(),attributes:{},setAttribute(key,value){this.attributes[key]=value;},pause(){this.paused=true;},removeAttribute(key){delete this[key];}};nodes.push(node);return node;}},URL:{createObjectURL:blob=>{created.push(blob);return 'blob:demo-'+created.length;},revokeObjectURL:url=>revoked.push(url)},localStorage:x.storage,renderDocumentReview(){target.replaceChildren();target.textContent='';},closeDocumentReview(){target.replaceChildren();},addEventListener:(type,handler)=>(listeners[type]??=[]).push(handler),PulzzoCRMOfficeAdapter:{actorId:()=>actor,actor:()=>actorEmail,assertCurrent(){if(!allowed)throw Error('denied');},canReadDocument:()=>allowed,canReviewDocument:()=>false},PulzzoCRMEvidence:{validateBlob:Evidence.validateBlob,createEvidenceStore:()=>({get:()=>new Promise(resolve=>pending.push(()=>resolve(x.file))),close:async()=>{}})}};
 const sandbox={window,console,Blob,JSON,session:{email:actorEmail,role:'readonly'},reviewContext:context,resolveReviewContext:()=>resolved};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js/crm-document-preview.js'),'utf8'),sandbox);
 return {x,window,sandbox,target,created,revoked,pending,nodes,emit:type=>(listeners[type]||[]).forEach(fn=>fn()),logout:()=>listeners['logout:click']?.(),revoke(){allowed=false;},switchActor(){actor='another';},switchEmail(){actorEmail='other@example.test';},replaceSession(){sandbox.session={email:actorEmail,role:'readonly'};},resolve(){pending.shift()();},tick:async()=>{await tick();await tick();}};
}

test('readonly BO can preview a sandboxed PDF and closing revokes its URL',async()=>{
 const h=mounted();h.window.renderDocumentReview();assert.equal(h.pending.length,1);h.resolve();await h.tick();assert.equal(h.created.length,1);assert.equal(h.target.children[0].tagName,'IFRAME');assert.equal(h.target.children[0].attributes.sandbox,'');assert.equal(h.target.children[1].download,h.x.file.name);
 h.window.closeDocumentReview();assert.deepEqual(h.revoked,['blob:demo-1']);assert.equal(h.target.children.length,0);
});

test('pending mounted preview cannot display after newer render, storage, logout, pagehide or role change',async()=>{
 for(const change of ['render','storage','logout','pagehide','role','actor','email','session']){const h=mounted();h.window.renderDocumentReview();if(change==='render')h.window.renderDocumentReview();else if(change==='logout')h.logout();else if(change==='role')h.revoke();else if(change==='actor')h.switchActor();else if(change==='email')h.switchEmail();else if(change==='session')h.replaceSession();else h.emit(change);h.resolve();await h.tick();assert.equal(h.created.length,0,change+' must not display a stale Blob');if(change==='render'){h.resolve();await h.tick();assert.equal(h.created.length,1);}}
});

test('rendered private bytes are removed from the DOM on storage/logout/pagehide invalidation',async()=>{
 for(const change of ['storage','logout','pagehide']){const h=mounted();h.window.renderDocumentReview();h.resolve();await h.tick();assert.equal(h.target.children.length,2);if(change==='logout')h.logout();else h.emit(change);assert.equal(h.revoked.length,1);assert.equal(h.target.children.length,0,'Revoking the URL alone must not leave decoded private pixels visible after '+change);}
});

(async()=>{let failed=0;for(const {name,run} of cases){try{await run();console.log('PASS',name);}catch(error){failed++;console.error('FAIL',name);console.error(error.stack);}}console.log(`Binary document preview audit: ${cases.length-failed} passed, ${failed} failed. DOM/VM only.`);if(failed)process.exitCode=1;})();
