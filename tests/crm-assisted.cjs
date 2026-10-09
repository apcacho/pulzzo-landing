'use strict';
const assert=require('node:assert/strict');
const Store=require('../assets/js/crm-demo-store.js');
const Assisted=require('../assets/js/crm-assisted.js');
let passed=0;
function test(name,fn){try{fn();passed++;console.log('PASS',name);}catch(e){console.error('FAIL',name);throw e;}}
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
function complete(f,h){const fields=f.kind==='patient'?{procedure:'Procedimiento demo',requestedAmount:20000,termMonths:12,monthlyIncome:15000,address:'Domicilio DEMO',identityReference:'INE-DEMO'}:{specialty:'Odontología',professionalLicense:'DEMO-1234',clinicName:'Clínica Demo',clinicAddress:'Domicilio DEMO'};ok(h.api.editDraft(f.exp.id,{fields,documents:[{label:f.kind==='patient'?'identity':'license',fileName:'documento-demo.pdf',evidenceId:'evidence_test',mimeType:'application/pdf',size:150,demo:true,actorId:f.person.id}]},f.rev()));ok(h.api.holderAction(f.exp.id,'otp',{confirmed:true,demo:true},f.rev()));if(f.kind==='patient')ok(h.api.holderAction(f.exp.id,'buroConsent',{confirmed:true,demo:true},f.rev()));ok(h.api.holderAction(f.exp.id,'finalConfirmation',{confirmed:true,demo:true,capacity:'holder',authorityConfirmed:true},f.rev()));}
test('assisted draft keeps stable contact and expediente IDs',()=>{const f=fixture();const same=ok(f.kam.api.beginDraft({contactId:f.contact.id,kind:'patient'},f.rev()));assert.equal(same.id,f.exp.id);const h=f.claim(f.invite());assert.equal(ok(h.api.getExpedient(f.exp.id)).expedient.contactId,f.contact.id);assert.equal(Object.keys(f.kam.store.snapshot().expedients).length,1);});
test('wrong invitation identity cannot request or claim',()=>{const f=fixture(),inv=f.invite(),h=f.make(f.person);denied(h.api.requestDemoVerification({token:inv.token,email:'wrong@example.test'}),'WRONG_IDENTITY');denied(h.api.claim(inv.token,{email:'wrong@example.test',proofToken:'bad'},f.rev()),'WRONG_IDENTITY');assert.equal(f.kam.store.snapshot().invitations[inv.id].status,'pending');});
test('staff cannot verify, claim or perform holder confirmations',()=>{const f=fixture(),inv=f.invite();denied(f.kam.api.requestDemoVerification({token:inv.token,email:f.person.email}),'HOLDER_REQUIRED');denied(f.kam.api.claim(inv.token,{email:f.person.email},f.rev()),'HOLDER_REQUIRED');denied(f.kam.api.holderAction(f.exp.id,'buroConsent',{confirmed:true,demo:true},f.rev()),'HOLDER_REQUIRED');});
test('expired invitations fail without mutation',()=>{const f=fixture(),inv=f.invite();f.setTime('2026-10-09T07:00:00.000Z');const before=f.disk.dump();denied(f.make(f.person).api.getInvitationInfo(inv.token));denied(f.make(f.person).api.claim(inv.token,{email:f.person.email,proofToken:'expired'},f.rev()),'INVITE_EXPIRED');assert.equal(f.disk.dump(),before);});
test('replacement revokes previous invitation and verification proof',()=>{const f=fixture(),inv=f.invite(),h=f.make(f.person),code=ok(h.api.requestDemoVerification({token:inv.token,email:f.person.email})),proof=ok(h.api.verifyDemoCode(code.challengeId,code.demoCode));f.invite();denied(h.api.claim(inv.token,{email:f.person.email,proofToken:proof.proofToken},f.rev()),'INVITE_USED');});
test('one-use link rejects duplicate click and back-forward replay',()=>{const f=fixture(),inv=f.invite(),h=f.claim(inv),before=f.disk.dump();denied(h.api.claim(inv.token,{email:f.person.email,proofToken:'replayed'},f.rev()),'INVITE_USED');denied(f.make(f.person).api.getInvitationInfo(inv.token),'INVITE_USED');assert.equal(f.disk.dump(),before);});
test('wrong OTP is rejected and code proof cannot be replayed',()=>{const f=fixture(),inv=f.invite(),h=f.make(f.person),c=ok(h.api.requestDemoVerification({token:inv.token,email:f.person.email}));denied(h.api.verifyDemoCode(c.challengeId,'000000'),'CODE_INVALID');ok(h.api.verifyDemoCode(c.challengeId,c.demoCode));denied(h.api.verifyDemoCode(c.challengeId,c.demoCode),'CODE_EXPIRED');});
test('stale tab cannot overwrite newer field edits',()=>{const f=fixture(),rev=f.rev();ok(f.kam.api.editDraft(f.exp.id,{fields:{procedure:'Primero'}},rev));denied(f.kam.api.editDraft(f.exp.id,{fields:{procedure:'Segundo'}},rev));assert.equal(f.kam.store.snapshot().expedients[f.exp.id].fields.procedure,'Primero');});
test('field history preserves original actor and value',()=>{const f=fixture();ok(f.kam.api.editDraft(f.exp.id,{fields:{procedure:'Uno'}},f.rev()));const h=f.claim(f.invite());ok(h.api.editDraft(f.exp.id,{fields:{procedure:'Dos'}},f.rev()));const hist=f.kam.store.snapshot().expedients[f.exp.id].fieldHistory.procedure;assert.deepEqual(hist.map(x=>[x.value,x.actorId]),[['Uno','kam_ana'],['Dos','holder_one']]);});
test('storage failure leaves invitation and identity unchanged; retry proof works',()=>{const f=fixture(),inv=f.invite(),h=f.make(f.person),c=ok(h.api.requestDemoVerification({token:inv.token,email:f.person.email})),p=ok(h.api.verifyDemoCode(c.challengeId,c.demoCode)),before=f.disk.dump();f.disk.fail=true;denied(h.api.claim(inv.token,{email:f.person.email,proofToken:p.proofToken},f.rev()));assert.equal(f.disk.dump(),before);f.disk.fail=false;ok(h.api.claim(inv.token,{email:f.person.email,proofToken:p.proofToken},f.rev()));});
test('mismatched wrapper actor and canonical store actor is refused',()=>{const f=fixture(),api=Assisted.createAssisted({store:f.kam.store,actor:{id:'admin_fake',role:'admin'}});denied(api.editDraft(f.exp.id,{fields:{procedure:'attack'}},f.rev()),'ACTOR_MISMATCH');denied(api.getExpedient(f.exp.id),'ACTOR_MISMATCH');});
test('final confirmation cannot strand an incomplete draft',()=>{const f=fixture(),h=f.claim(f.invite());denied(h.api.holderAction(f.exp.id,'finalConfirmation',{confirmed:true,demo:true},f.rev()),'INCOMPLETE');ok(h.api.editDraft(f.exp.id,{fields:{procedure:'Completable'}},f.rev()));assert.equal(f.kam.store.snapshot().expedients[f.exp.id].holderActions.finalConfirmation,undefined);});
test('unsafe metadata and consent field edits are refused',()=>{const f=fixture();denied(f.kam.api.editDraft(f.exp.id,{fields:{buroConsent:true}},f.rev()));denied(f.kam.api.editDraft(f.exp.id,{documents:[{label:'identity',fileName:'malware.html',evidenceId:'evil',mimeType:'text/html',size:20,demo:true}]},f.rev()),'INVALID_DOCUMENT');});
test('metadata-only document does not satisfy required evidence',()=>{const f=fixture(),h=f.claim(f.invite());ok(h.api.editDraft(f.exp.id,{documents:[{label:'identity',fileName:'demo.pdf',demo:true}]},f.rev()));assert.ok(ok(h.api.getExpedient(f.exp.id)).missing.includes('document:identity'));});
test('submitted snapshot locks edits/repeated submit; payload uses stable identity',()=>{const f=fixture(),h=f.claim(f.invite());complete(f,h);ok(h.api.submit(f.exp.id,f.rev()));const original=JSON.stringify(f.kam.store.snapshot().expedients[f.exp.id].submissionSnapshot);denied(h.api.editDraft(f.exp.id,{fields:{requestedAmount:1}},f.rev()),'SUBMITTED_LOCK');denied(h.api.submit(f.exp.id,f.rev()),'SUBMITTED_LOCK');const p=ok(h.api.submissionPayload(f.exp.id));assert.equal(p.accountId,f.person.id);assert.equal(p.contactId,f.contact.id);assert.equal(p.expedientId,f.exp.id);assert.equal(JSON.stringify(p),original);});
test('other holder cannot inspect or submit someone else expediente',()=>{const f=fixture();f.claim(f.invite());const other=f.make({id:'holder_other',role:'holder'});denied(other.api.getExpedient(f.exp.id));denied(other.api.submit(f.exp.id,f.rev()),'HOLDER_REQUIRED');});
test('doctor requires holder or verified authorized representative',()=>{const f=fixture('doctor'),h=f.claim(f.invite());ok(h.api.editDraft(f.exp.id,{fields:{specialty:'Demo',professionalLicense:'DEMO-1',clinicName:'Demo',clinicAddress:'Demo'},documents:[{label:'license',fileName:'demo.pdf',evidenceId:'evidence_license',mimeType:'application/pdf',size:100,demo:true}]},f.rev()));ok(h.api.holderAction(f.exp.id,'otp',{confirmed:true,demo:true},f.rev()));denied(h.api.holderAction(f.exp.id,'finalConfirmation',{confirmed:true,demo:true,capacity:'authorized_representative',authorityConfirmed:false},f.rev()),'AUTHORITY_REQUIRED');ok(h.api.holderAction(f.exp.id,'finalConfirmation',{confirmed:true,demo:true,capacity:'authorized_representative',authorityConfirmed:true},f.rev()));ok(h.api.submit(f.exp.id,f.rev()));});
test('real onboarding transitions commercial stages without regressing reused drafts',()=>{const f=fixture();assert.equal(f.kam.store.snapshot().contacts[f.contact.id].stage,'application_started');ok(f.kam.store.setStage(f.contact.id,'interested',{},f.rev()));ok(f.kam.api.beginDraft({contactId:f.contact.id,kind:'patient'},f.rev()));assert.equal(f.kam.store.snapshot().contacts[f.contact.id].stage,'interested');const h=f.claim(f.invite());complete(f,h);ok(h.api.submit(f.exp.id,f.rev()));assert.equal(f.kam.store.snapshot().contacts[f.contact.id].stage,'submitted');});
test('expired live offer cannot be personally accepted even if already received',()=>{const f=fixture(),base=f.claim(f.invite());complete(f,base);ok(base.api.submit(f.exp.id,f.rev()));const quote={id:'APP_TEST',offer:{status:'enviada',approvedAmount:20000,termMonths:12,validUntil:'2026-01-01'},offerFingerprint:'expired-quote',contractReady:false,expiryStatus:'expired',demo:true},h=f.make(f.person,{readOffer:()=>quote});ok(h.api.receiveOffer(f.exp.id,f.rev()));denied(h.api.holderAction(f.exp.id,'offerAcceptance',{confirmed:true,demo:true},f.rev()),'OFFER_EXPIRED');assert.equal(f.kam.store.snapshot().expedients[f.exp.id].holderActions.offerAcceptance,undefined);});
test('financial decisions require actual same-case offer and current terms',()=>{const f=fixture(),base=f.claim(f.invite());complete(f,base);ok(base.api.submit(f.exp.id,f.rev()));let quote=null;const h=f.make(f.person,{readOffer:()=>quote});denied(h.api.receiveOffer(f.exp.id,f.rev()),'NO_OFFER');quote={id:'APP_TEST',offer:{status:'enviada',approvedAmount:20000,termMonths:12,monthlyPayment:1800},offerFingerprint:'quoted-v1',contractReady:false,demo:true};ok(h.api.receiveOffer(f.exp.id,f.rev()));quote.offer.approvedAmount=21000;denied(h.api.holderAction(f.exp.id,'offerAcceptance',{confirmed:true,demo:true},f.rev()),'OFFER_CHANGED');quote.offer.approvedAmount=20000;ok(h.api.holderAction(f.exp.id,'offerAcceptance',{confirmed:true,demo:true},f.rev()));denied(h.api.holderAction(f.exp.id,'contractSignature',{confirmed:true,demo:true},f.rev()),'NO_CONTRACT');quote.offer.status='aceptada';quote.contractReady=true;ok(h.api.holderAction(f.exp.id,'contractSignature',{confirmed:true,demo:true},f.rev()));assert.equal(f.kam.store.snapshot().expedients[f.exp.id].holderActions.contractSignature.offerFingerprint,'quoted-v1');denied(h.api.holderAction(f.exp.id,'contractSignature',{confirmed:true,demo:true},f.rev()),'ACTION_REPLAY');});
test('self-service creates the same domain with unknown direct provenance',()=>{const disk=storage(),actor={id:'self_person',role:'holder'},store=Store.createStore({storage:disk,actor}),api=Assisted.createAssisted({store,actor});const c=ok(api.requestDemoVerification({email:'self@example.test',kind:'patient'})),p=ok(api.verifyDemoCode(c.challengeId,c.demoCode)),e=ok(api.createSelfService({kind:'patient',name:'Self Demo',email:'self@example.test',phone:'5512340000',proofToken:p.proofToken},store.snapshot().revision));assert.equal(store.snapshot().contacts[e.contactId].originalSource,'unknown');assert.equal(e.holderIdentity.id,actor.id);assert.equal(e.status,'claimed');assert.equal(Object.keys(store.snapshot().expedients).length,1);});

const Office=require('../assets/js/crm-demo-office.js'),Corrections=require('../assets/js/crm-demo-corrections.js');
function correctionFixture(kind='patient'){
 const f=fixture(kind),base=f.claim(f.invite());complete(f,base);ok(base.api.submit(f.exp.id,f.rev()));
 const current=()=>f.kam.store.snapshot().expedients[f.exp.id];
 let db=Office.prepareImport({patients:[],providers:[],audit:[]},current(),'risk_demo').database;
 const key=kind==='patient'?'address':'professionalLicense',value=kind==='patient'?'Domicilio corregido DEMO':'CEDULA-DEMO-999';
 db=Corrections.prepareRequest(db,current(),[key],'Corregir dato observado DEMO','risk_demo').database;
 f.disk.setItem(Office.BO_KEY,JSON.stringify(db));
 const opts={readReview:e=>Corrections.readReview(f.disk,e),createCorrectionSubmission:Corrections.createSubmission};
 return {f,current,key,value,holder:f.make(f.person,opts),staff:f.make({id:'kam_ana',role:'kam'},opts),db(){return JSON.parse(f.disk.getItem(Office.BO_KEY));},save(d){f.disk.setItem(Office.BO_KEY,JSON.stringify(d));}};
}
test('patient corrections use canonical BO transport, scoped staff edits, holder submit and approval sidecar',()=>{
 const x=correctionFixture(),{f}=x,baseline=JSON.stringify({fields:x.current().fields,documents:x.current().documents,snapshot:x.current().submissionSnapshot});
 ok(x.staff.api.receiveCorrection(f.exp.id,f.rev()));
 denied(x.staff.api.editCorrection(f.exp.id,{fields:{requestedAmount:99999}},f.rev()),'CORRECTION_SCOPE');
 ok(x.staff.api.editCorrection(f.exp.id,{fields:{address:x.value}},f.rev()));
 denied(x.staff.api.submitCorrection(f.exp.id,{confirmed:true,demo:true},f.rev()),'HOLDER_REQUIRED');
 ok(x.holder.api.submitCorrection(f.exp.id,{confirmed:true,demo:true},f.rev()));
 denied(x.holder.api.submitCorrection(f.exp.id,{confirmed:true,demo:true},f.rev()),'CORRECTION_SENT');
 x.save(Corrections.prepareReceive(x.db(),x.current(),'risk_demo').database);
 ok(x.holder.api.receiveCorrection(f.exp.id,f.rev()));
 assert.equal(x.current().correctionReview.status,'re_review');
 denied(x.holder.api.editCorrection(f.exp.id,{fields:{address:'otra'}},f.rev()),'CORRECTION_LOCK');
 x.save(Corrections.prepareApprove(x.db(),x.current(),'risk_demo').database);
 ok(x.holder.api.receiveCorrection(f.exp.id,f.rev()));
 assert.equal(x.current().approvedFields.address,x.value);
 assert.equal(JSON.stringify({fields:x.current().fields,documents:x.current().documents,snapshot:x.current().submissionSnapshot}),baseline);
 assert.equal(x.db().patients[0].application.identity.address.street,x.value);
});
test('doctor corrections require confirmed representative and preserve original submission',()=>{
 const x=correctionFixture('doctor'),{f}=x,before=JSON.stringify(x.current().submissionSnapshot);
 ok(x.holder.api.receiveCorrection(f.exp.id,f.rev()));
 ok(x.holder.api.editCorrection(f.exp.id,{fields:{professionalLicense:x.value}},f.rev()));
 denied(x.holder.api.submitCorrection(f.exp.id,{confirmed:true,demo:true,capacity:'authorized_representative'},f.rev()),'AUTHORITY_REQUIRED');
 ok(x.holder.api.submitCorrection(f.exp.id,{confirmed:true,demo:true,capacity:'authorized_representative',authorityConfirmed:true},f.rev()));
 x.save(Corrections.prepareReceive(x.db(),x.current(),'providers_demo').database);
 x.save(Corrections.prepareApprove(x.db(),x.current(),'providers_demo').database);
 ok(x.holder.api.receiveCorrection(f.exp.id,f.rev()));
 assert.equal(x.current().approvedFields.professionalLicense,x.value);
 assert.equal(x.db().providers[0].medval.medicalLicenseNumber,x.value);
 assert.equal(JSON.stringify(x.current().submissionSnapshot),before);
});
test('a new correction request preserves every prior submission and approved baseline',()=>{
 const x=correctionFixture(),{f}=x;ok(x.holder.api.receiveCorrection(f.exp.id,f.rev()));ok(x.holder.api.editCorrection(f.exp.id,{fields:{address:x.value}},f.rev()));ok(x.holder.api.submitCorrection(f.exp.id,{confirmed:true,demo:true},f.rev()));
 const oldId=x.current().correctionReview.requestId,prior=JSON.stringify(x.current().correctionSubmissions[oldId]);
 x.save(Corrections.prepareReceive(x.db(),x.current(),'risk_demo').database);x.save(Corrections.prepareApprove(x.db(),x.current(),'risk_demo').database);ok(x.holder.api.receiveCorrection(f.exp.id,f.rev()));
 x.save(Corrections.prepareRequest(x.db(),x.current(),['address'],'Nueva observación independiente','risk_demo').database);ok(x.holder.api.receiveCorrection(f.exp.id,f.rev()));
 assert.notEqual(x.current().correctionReview.requestId,oldId);assert.equal(x.current().correctionReview.baseline.address,x.value);
 ok(x.holder.api.editCorrection(f.exp.id,{fields:{address:'Segunda corrección DEMO'}},f.rev()));ok(x.holder.api.submitCorrection(f.exp.id,{confirmed:true,demo:true},f.rev()));
 assert.equal(JSON.stringify(x.current().correctionSubmissions[oldId]),prior);assert.equal(Object.keys(x.current().correctionSubmissions).length,2);
});
test('financial acceptance in BO blocks correction editing and submission',()=>{
 const x=correctionFixture(),{f}=x;ok(x.holder.api.receiveCorrection(f.exp.id,f.rev()));
 ok(x.holder.api.editCorrection(f.exp.id,{fields:{address:x.value}},f.rev()));
 const db=x.db();db.patients[0].application.offerAccepted=true;x.save(db);
 denied(x.holder.api.editCorrection(f.exp.id,{fields:{address:'attempt'}},f.rev()),'FINANCIAL_LOCK');
 denied(x.holder.api.submitCorrection(f.exp.id,{confirmed:true,demo:true},f.rev()),'FINANCIAL_LOCK');
});

function documentFixture(kind='patient'){
 const f=fixture(kind),base=f.claim(f.invite());complete(f,base);ok(base.api.submit(f.exp.id,f.rev()));const current=()=>f.kam.store.snapshot().expedients[f.exp.id];
 let db=Office.prepareImport({patients:[],providers:[],audit:[],corrections:[]},current(),'risk_demo').database,doc=(kind==='patient'?db.patients[0].documents:db.providers[0].files)[0];
 db=Corrections.prepareDocumentRequest(db,current(),doc.id,'Adjuntar versión ficticia legible','risk_demo').database;f.disk.setItem(Office.BO_KEY,JSON.stringify(db));
 const opts={readDocumentReview:e=>Corrections.readDocumentReview(f.disk,e),createDocumentSubmission:Corrections.createDocumentSubmission};
 return {f,current,docId:doc.id,holder:f.make(f.person,opts),staff:f.make({id:'kam_ana',role:'kam'},opts),db(){return JSON.parse(f.disk.getItem(Office.BO_KEY));},save(d){f.disk.setItem(Office.BO_KEY,JSON.stringify(d));},descriptor(id,actor='kam_ana'){return {id,name:id+'.pdf',mimeType:'application/pdf',size:250,uploadedAt:f.now(),actorId:actor,contactId:f.contact.id,activityId:null,documentType:kind==='patient'?'identity':'license'};}};
}
test('document correction stages exact observed ID and requires holder confirmation before independent approval',()=>{
 const x=documentFixture(),{f}=x,baseline=JSON.stringify({documents:x.current().documents,snapshot:x.current().submissionSnapshot});
 ok(x.staff.api.receiveDocumentCorrection(f.exp.id,f.rev()));
 denied(x.staff.api.editDocumentCorrectionDraft(f.exp.id,{descriptor:{...x.descriptor('replacement_one'),contactId:'someone_else'}},f.rev()),'INVALID_DOCUMENT');
 ok(x.staff.api.editDocumentCorrectionDraft(f.exp.id,{descriptor:x.descriptor('replacement_one')},f.rev()));
 denied(x.staff.api.submitDocumentCorrection(f.exp.id,{confirmed:true,demo:true},f.rev()),'HOLDER_REQUIRED');
 ok(x.holder.api.submitDocumentCorrection(f.exp.id,{confirmed:true,demo:true},f.rev()));
 denied(x.holder.api.submitDocumentCorrection(f.exp.id,{confirmed:true,demo:true},f.rev()),'DOCUMENT_CORRECTION_SENT');
 x.save(Corrections.prepareDocumentReceive(x.db(),x.current(),'risk_demo').database);ok(x.holder.api.receiveDocumentCorrection(f.exp.id,f.rev()));
 denied(x.staff.api.editDocumentCorrectionDraft(f.exp.id,{descriptor:x.descriptor('forbidden_after_send')},f.rev()),'DOCUMENT_CORRECTION_LOCK');
 assert.equal(x.db().patients[0].documents[0].evidenceId,'evidence_test','Pending candidate must not replace active document');
 x.save(Corrections.prepareDocumentApprove(x.db(),x.current(),'risk_demo').database);ok(x.holder.api.receiveDocumentCorrection(f.exp.id,f.rev()));
 assert.equal(x.db().patients[0].documents[0].evidenceId,'replacement_one');assert.equal(x.current().approvedDocuments[0].evidenceId,'replacement_one');assert.equal(Object.keys(x.current().documentCorrectionReceipts).length,1);
 assert.equal(JSON.stringify({documents:x.current().documents,snapshot:x.current().submissionSnapshot}),baseline);
});
test('doctor rejection preserves the active document and opens a fresh versioned replacement only after new BO request',()=>{
 const x=documentFixture('doctor'),{f}=x;ok(x.holder.api.receiveDocumentCorrection(f.exp.id,f.rev()));
 ok(x.holder.api.editDocumentCorrectionDraft(f.exp.id,{descriptor:x.descriptor('doctor_bad','holder_one')},f.rev()));
 denied(x.holder.api.submitDocumentCorrection(f.exp.id,{confirmed:true,demo:true,capacity:'authorized_representative'},f.rev()),'AUTHORITY_REQUIRED');
 ok(x.holder.api.submitDocumentCorrection(f.exp.id,{confirmed:true,demo:true,capacity:'authorized_representative',authorityConfirmed:true},f.rev()));
 const originalRequest=x.current().documentCorrectionReview.requestId,oldReceipt=JSON.stringify(x.current().documentCorrectionSubmission);
 x.save(Corrections.prepareDocumentReceive(x.db(),x.current(),'providers_demo').database);x.save(Corrections.prepareDocumentReject(x.db(),x.current(),'Ilegible en revisión ficticia','providers_demo').database);ok(x.holder.api.receiveDocumentCorrection(f.exp.id,f.rev()));
 assert.equal(x.db().providers[0].files[0].evidenceId,'evidence_test');assert.equal(x.current().documentCorrectionReview.status,'rejected');assert.equal(x.current().documentCorrectionReceipts[originalRequest].status,'rejected');
 denied(x.holder.api.editDocumentCorrectionDraft(f.exp.id,{descriptor:x.descriptor('premature','holder_one')},f.rev()),'DOCUMENT_CORRECTION_LOCK');
 x.save(Corrections.prepareDocumentRequest(x.db(),x.current(),x.docId,'Nueva captura legible DEMO','providers_demo').database);ok(x.holder.api.receiveDocumentCorrection(f.exp.id,f.rev()));
 assert.notEqual(x.current().documentCorrectionReview.requestId,originalRequest);assert.equal(x.current().documentCorrectionDrafts[originalRequest].versions[0].descriptor.id,'doctor_bad');ok(x.holder.api.editDocumentCorrectionDraft(f.exp.id,{descriptor:x.descriptor('doctor_good','holder_one')},f.rev()));ok(x.holder.api.submitDocumentCorrection(f.exp.id,{confirmed:true,demo:true,capacity:'holder',authorityConfirmed:true},f.rev()));
 x.save(Corrections.prepareDocumentReceive(x.db(),x.current(),'providers_demo').database);x.save(Corrections.prepareDocumentApprove(x.db(),x.current(),'providers_demo').database);ok(x.holder.api.receiveDocumentCorrection(f.exp.id,f.rev()));
 assert.equal(x.db().providers[0].files[0].evidenceId,'doctor_good');assert.equal(JSON.stringify(x.current().documentCorrectionSubmissions[originalRequest]),oldReceipt);assert.equal(Object.keys(x.current().documentCorrectionReceipts).length,2);
});
test('later document request refresh includes historical approvals even if holder skipped viewing approval',()=>{
 const x=documentFixture(),{f}=x;ok(x.holder.api.receiveDocumentCorrection(f.exp.id,f.rev()));ok(x.holder.api.editDocumentCorrectionDraft(f.exp.id,{descriptor:x.descriptor('first_approved','holder_one')},f.rev()));ok(x.holder.api.submitDocumentCorrection(f.exp.id,{confirmed:true,demo:true},f.rev()));x.save(Corrections.prepareDocumentReceive(x.db(),x.current(),'risk_demo').database);x.save(Corrections.prepareDocumentApprove(x.db(),x.current(),'risk_demo').database);
 x.save(Corrections.prepareDocumentRequest(x.db(),x.current(),x.docId,'Nueva revisión de evidencia','risk_demo').database);ok(x.holder.api.receiveDocumentCorrection(f.exp.id,f.rev()));assert.equal(x.current().documentCorrectionReview.status,'requested');assert.equal(x.current().approvedDocuments[0].evidenceId,'first_approved');
});
test('document draft versions survive replacement, stale writes and persisted-submission failure',()=>{
 const x=documentFixture(),{f}=x;ok(x.staff.api.receiveDocumentCorrection(f.exp.id,f.rev()));const rev=f.rev();ok(x.staff.api.editDocumentCorrectionDraft(f.exp.id,{descriptor:x.descriptor('version_one')},rev));denied(x.staff.api.editDocumentCorrectionDraft(f.exp.id,{descriptor:x.descriptor('stale_version')},rev));ok(x.staff.api.editDocumentCorrectionDraft(f.exp.id,{descriptor:x.descriptor('version_two')},f.rev()));assert.deepEqual(x.current().documentCorrectionDraft.versions.map(v=>v.descriptor.id),['version_one','version_two']);
 const before=f.disk.dump();f.disk.fail=true;denied(x.holder.api.submitDocumentCorrection(f.exp.id,{confirmed:true,demo:true},f.rev()));assert.equal(f.disk.dump(),before);f.disk.fail=false;ok(x.holder.api.submitDocumentCorrection(f.exp.id,{confirmed:true,demo:true},f.rev()));
});
test('financial freeze blocks document replacement and resubmission',()=>{const x=documentFixture(),{f}=x;ok(x.holder.api.receiveDocumentCorrection(f.exp.id,f.rev()));ok(x.holder.api.editDocumentCorrectionDraft(f.exp.id,{descriptor:x.descriptor('frozen_doc','holder_one')},f.rev()));const db=x.db();db.patients[0].application.contractSigned=true;x.save(db);denied(x.holder.api.editDocumentCorrectionDraft(f.exp.id,{descriptor:x.descriptor('later_doc','holder_one')},f.rev()),'FINANCIAL_LOCK');denied(x.holder.api.submitDocumentCorrection(f.exp.id,{confirmed:true,demo:true},f.rev()),'FINANCIAL_LOCK');});
console.log(`PASS: ${passed} assisted onboarding state-machine tests.`);

// Run the shipped holder preview/close/pagehide handlers in a tiny DOM fixture.
// The test-only hook is injected in-memory; no test hook ships in the application.
(async function holderPreviewHandlers(){
 const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(require.resolve('../assets/js/crm-holder-ui.js'),'utf8');
 const f=fixture(),h=f.claim(f.invite());
 ok(h.api.editDraft(f.exp.id,{documents:['a','b'].map(n=>({label:'identity',fileName:n+'-demo.pdf',evidenceId:'evidence_'+n,mimeType:'application/pdf',size:100,demo:true}))},f.rev()));
 const queuedCloses=[];
 function element(){return {listeners:{},children:[],open:false,textContent:'',classList:{add(){},remove(){}},addEventListener(k,fn){this.listeners[k]=fn;},replaceChildren(){this.children=[];},appendChild(n){this.children.push(n);},setAttribute(){},showModal(){this.open=true;this.opens=(this.opens||0)+1;},close(){this.open=false;queuedCloses.push(()=>this.listeners.close?.());}};}
 const body=element(),title=element(),modal=element(),close=element(),toast=element(),app=element();modal.querySelector=q=>q==='h2'?title:body;
 const nodes={holderApp:app,evidencePreview:modal,closeEvidence:close,toast},events={},pending=[],created=[],revoked=[];
 const disk=f.disk,window={addEventListener(k,fn){events[k]=fn;},PulzzoCRMEvidence:true};
 const document={getElementById:id=>nodes[id],createElement:()=>element()};
 const evidence={get(id){return new Promise(resolve=>pending.push({id,resolve}));}};
 const context={window,document,location:{hash:'',search:'?kind=patient'},URLSearchParams,localStorage:disk,sessionStorage:storage(),PulzzoCRMStore:Store,PulzzoCRMAssisted:Assisted,PulzzoCRMEvidence:{createEvidenceStore:()=>evidence},URL:{createObjectURL(b){const u='blob:test-'+created.length;created.push(u);return u;},revokeObjectURL(u){revoked.push(u);}},setTimeout(){return 1;},clearTimeout(){},crypto:{randomUUID:()=> 'test-id'},console};
 context.globalThis=context;
 const instrumented=source.replace(/init\(\);\s*\}\(\)\);\s*$/,"globalThis.__holderTest={connect:connect,select:function(id){expId=id;},preview:previewEvidence};\n}());");
 assert.notEqual(instrumented,source,'Holder fixture must instrument the actual source tail');vm.runInNewContext(instrumented,context);
 const ui=context.__holderTest,resolve=(p,contact=f.contact.id)=>p.resolve({name:p.id+'.pdf',contactId:contact,mimeType:'application/pdf',blob:{size:100}});
 ui.connect(f.person);ui.select(f.exp.id);
 const first=ui.preview('evidence_a',f.contact.id),second=ui.preview('evidence_b',f.contact.id);assert.equal(pending.length,2);resolve(pending[1]);await second;assert.equal(title.textContent,'evidence_b.pdf');resolve(pending[0]);await first;assert.equal(modal.opens,1,'Old async preview cannot replace newer evidence');
 const replacement=ui.preview('evidence_a',f.contact.id);assert.equal(queuedCloses.length,1,'Closing a native dialog queues its close event');resolve(pending[2]);await replacement;assert.equal(modal.opens,2);while(queuedCloses.length)queuedCloses.shift()();assert.equal(modal.open,true,'Queued close from the previous dialog must not dismiss a newer preview');assert.equal(title.textContent,'evidence_a.pdf');assert.equal(revoked.length,1,'Queued old close must not revoke the newly opened Blob');
 close.onclick();assert.equal(modal.open,false);assert.equal(revoked.length,2);while(queuedCloses.length)queuedCloses.shift()();
 const canceled=ui.preview('evidence_a',f.contact.id);close.onclick();resolve(pending[3]);await canceled;assert.equal(modal.opens,2,'Closing cancels a pending preview');
 const otherSession=ui.preview('evidence_a',f.contact.id);ui.connect({id:'different_holder',role:'holder'});ui.select(null);resolve(pending[4]);await otherSession;assert.equal(modal.opens,2,'A prior holder preview cannot open after logout/actor change');
 ui.connect(f.person);ui.select(f.exp.id);const pageHidden=ui.preview('evidence_a',f.contact.id);events.pagehide();resolve(pending[5]);await pageHidden;assert.equal(modal.opens,2,'Pagehide cancels pending preview intent');
 const mismatched=ui.preview('evidence_a',f.contact.id);resolve(pending[6],'another_contact');await mismatched;assert.equal(modal.opens,2,'Metadata must belong to current contact');
 const calls=pending.length;await ui.preview('unlinked_evidence',f.contact.id);assert.equal(pending.length,calls,'Unlinked evidence never reaches file storage');
 console.log('PASS: shipped holder DOM handlers enforce latest-preview wins, queued native-close isolation, close/pagehide/session cancellation, document ownership and Blob revocation. No browser or network used.');
})().catch(e=>{console.error(e);process.exitCode=1;});
