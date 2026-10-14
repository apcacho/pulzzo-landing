'use strict';
const assert=require('node:assert/strict');
const Office=require('../assets/js/crm-demo-office.js');
const S=require('../assets/js/demo-servicing.js');
const Corrections=require('../assets/js/crm-demo-corrections.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const hash=x=>S.digestText(S.fingerprint(x));
let count=0;function test(name,fn){fn();count++;console.log('PASS',name);}
function fixture(kind='patient'){
 const accountId='holder-'+kind,identity={id:accountId,email:kind+'@example.test',demo:true,verifiedAt:'2026-10-09T00:00:00Z'},actions=Object.fromEntries(['otp','buroConsent','finalConfirmation'].map(k=>[k,{actorId:accountId,actorRole:'holder',confirmed:true,demo:true,at:'2026-10-09T00:00:30Z',capacity:'holder',authorityConfirmed:true}]));
 const fields={fullName:'Persona DEMO',email:identity.email,phone:'5512345678',procedure:'Procedimiento DEMO',requestedAmount:100000,termMonths:12,monthlyIncome:30000,address:'Domicilio original',identityReference:'CURP-DEMO',employment:'Asalariado',professionalLicense:'DEMO-001',specialty:'Especialidad DEMO',payoutReference:'000000000000000001',clinicName:'Clínica DEMO',clinicAddress:'Clínica original'};
 const documents=[{id:'evidence1',label:kind==='patient'?'identity':'license',fileName:'demo.pdf',evidenceId:'evidence1',mimeType:'application/pdf',size:100,demo:true}];
 const exp={status:'submitted',submissionRevision:1,fields,documents,id:'exp-'+kind,contactId:'contact-'+kind,kind,holderIdentity:identity,holderActions:actions,createdAt:'2026-10-09T00:00:00Z',submittedAt:'2026-10-09T00:01:00Z'};
 exp.submissionSnapshot=clone({schema:'pulzzo.crm.submission.v1',demo:true,revision:1,submissionId:'submission_'+exp.id,expedientId:exp.id,contactId:exp.contactId,accountId,kind,fields,holderIdentity:identity,holderActions:actions,holderConfirmation:actions.finalConfirmation,submittedAt:exp.submittedAt,documents,provenance:{originalSource:'direct_unknown'}});
 const db=Office.prepareImport({patients:[],providers:[],audit:[]},exp,'reviewer').database;
 return {exp,db};
}
function record(db,kind){return (kind==='patient'?db.patients:db.providers)[0];}
function submit(exp,review,fields){const result=Corrections.createSubmission(exp,{fields,documents:[]},review);result.holderConfirmation={actorId:exp.holderIdentity.id,actorRole:'holder',confirmed:true,demo:true,at:'2026-10-09T00:02:00Z',capacity:'holder',authorityConfirmed:true};exp.correctionSubmission=result;return result;}
function rehash(sub){const copy=clone(sub);delete copy.holderConfirmation;delete copy.fingerprint;sub.fingerprint=hash(copy);return sub;}
function flow(kind,fields){const {exp,db}=fixture(kind),original=JSON.stringify(exp),dbOriginal=JSON.stringify(db),requested=Corrections.prepareRequest(db,exp,Object.keys(fields),'Corregir datos señalados','reviewer');assert.equal(JSON.stringify(db),dbOriginal);assert.equal(JSON.stringify(exp),original);submit(exp,requested.reviewProjection,fields);const received=Corrections.prepareReceive(requested.database,exp,'reviewer');assert.equal(received.reviewProjection.status,'re_review');const approved=Corrections.prepareApprove(received.database,exp,'reviewer');return {exp,db,requested,received,approved,original};}
test('patient canonical request → holder submission → receive → approval preserves original and finances',()=>{
 const calls={};for(const k of ['requestPatientCorrection','acceptPatientCorrectionSubmission','approvePatientCorrection','applyPatientRecordCorrection']){const original=S[k];S[k]=(...args)=>{calls[k]=(calls[k]||0)+1;return original(...args);};}
 const f=flow('patient',{fullName:'Nombre corregido',address:'Domicilio corregido',monthlyIncome:40000,identityReference:'CURP-NUEVA',employment:'Independiente'}),r=f.approved.database.patients[0];
 assert.equal(r.patient.fullName,'Nombre corregido');assert.equal(r.application.identity.address.street,'Domicilio corregido');assert.equal(r.patient.address,'Domicilio corregido');assert.equal(r.patient.incomeMonthly,'40000');assert.equal(r.patient.curp,'CURP-NUEVA');assert.equal(r.patient.incomeType,'Independiente');
 assert.equal(r.application.requestedAmount,100000);assert.equal(r.application.termMonths,12);assert.equal(r.application.offerAccepted,false);assert.equal(r.offer,null);
 assert.deepEqual(f.exp.fields,JSON.parse(f.original).fields);assert.deepEqual(f.exp.submissionSnapshot,JSON.parse(f.original).submissionSnapshot);assert.deepEqual(f.exp.documents,JSON.parse(f.original).documents);
 assert.equal(f.approved.reviewProjection.approvedFields.fullName,'Nombre corregido');assert.deepEqual(calls,{requestPatientCorrection:1,acceptPatientCorrectionSubmission:1,approvePatientCorrection:1,applyPatientRecordCorrection:1});
});
test('doctor uses canonical request, submission review, approval and applyReview',()=>{
 const calls={};for(const k of ['requestCorrection','acceptCorrectionSubmission','approveCorrection','applyReview']){const original=S[k];S[k]=(...args)=>{calls[k]=(calls[k]||0)+1;return original(...args);};}
 const f=flow('doctor',{professionalLicense:'DEMO-002',specialty:'Especialidad corregida',payoutReference:'000000000000000002'}),r=f.approved.database.providers[0];
 assert.equal(r.medval.medicalLicenseNumber,'DEMO-002');assert.equal(r.medval.pendingSpecialty,'Especialidad corregida');assert.equal(r.medval.specialty,'Especialidad corregida');assert.equal(r.fiscal.clabe,'000000000000000002');assert.equal(r.profile.name,'Persona DEMO');assert.deepEqual(r.files,f.db.providers[0].files);
 assert.deepEqual(calls,{requestCorrection:1,acceptCorrectionSubmission:1,approveCorrection:1,applyReview:1});assert.deepEqual(f.exp.submissionSnapshot,JSON.parse(f.original).submissionSnapshot);
});
test('only BO-observed CRM fields are editable; no amounts, documents or arbitrary canonical fields',()=>{
 const {exp,db}=fixture(),req=Corrections.prepareRequest(db,exp,['fullName'],'Motivo','reviewer');
 for(const field of ['requestedAmount','termMonths','email','documents','identity.name','__proto__'])assert.throws(()=>Corrections.prepareRequest(db,exp,[field],'Motivo','reviewer'),/habilitados/);
 for(const fields of [{address:'No'},{requestedAmount:1},{'incomeMonthly':'1'}])assert.throws(()=>Corrections.createSubmission(exp,{fields},req.reviewProjection),/autorizado/);
 assert.throws(()=>Corrections.createSubmission(exp,{fields:{fullName:'Valid'},documents:[{fileName:'attack.pdf'}]},req.reviewProjection),/documentos/);
 assert.throws(()=>Corrections.createSubmission(exp,{fields:{fullName:exp.fields.fullName}},req.reviewProjection),/Modifica/);
 assert.throws(()=>Corrections.prepareRequest(db,exp,['fullName'],'Motivo',{id:'kam_ana',role:'kam'}),/backoffice/);
});
test('wrong identity, forged scope, missing holder confirmation and doctor authority are refused',()=>{
 for(const kind of ['patient','doctor']){
  const {exp,db}=fixture(kind),field=kind==='patient'?'fullName':'professionalLicense',req=Corrections.prepareRequest(db,exp,[field],'Motivo','reviewer');submit(exp,req.reviewProjection,{[field]:'Corrección válida'});
  const bad=clone(exp);bad.correctionSubmission.accountId='other';rehash(bad.correctionSubmission);assert.throws(()=>Corrections.prepareReceive(req.database,bad,'reviewer'),/identidad/);
  const unauthorized=clone(exp);unauthorized.correctionSubmission.holderConfirmation.actorId='kam_ana';assert.throws(()=>Corrections.prepareReceive(req.database,unauthorized,'reviewer'),/titular/);
  const missing=clone(exp);delete missing.correctionSubmission.holderConfirmation;assert.throws(()=>Corrections.prepareReceive(req.database,missing,'reviewer'),/titular/);
  const injection=clone(exp);injection.correctionSubmission.payload.changes[kind==='patient'?'comfortablePayment':'fiscal.banco']='attack';rehash(injection.correctionSubmission);assert.throws(()=>Corrections.prepareReceive(req.database,injection,'reviewer'),/autorizado/);
  if(kind==='doctor'){const noAuthority=clone(exp);noAuthority.correctionSubmission.holderConfirmation.authorityConfirmed=false;assert.throws(()=>Corrections.prepareReceive(req.database,noAuthority,'reviewer'),/facultades/);}
 }
});
test('replay, stale request nonce/version and original snapshot tampering cannot be applied',()=>{
 const f=flow('patient',{fullName:'Corregido'});
 assert.throws(()=>Corrections.prepareReceive(f.received.database,f.exp,'reviewer'),/vigente|repetida|cambió/);
 assert.throws(()=>Corrections.prepareApprove(f.approved.database,f.exp,'reviewer'),/reen[vv]ío|reenvío/);
 assert.throws(()=>Corrections.createSubmission(f.exp,{fields:{fullName:'Otro'}},f.requested.reviewProjection),/ya fue enviada/);
 for(const key of ['nonce','version']){const bad=clone(f.exp);bad.correctionSubmission[key]=key==='version'?999:'stale';rehash(bad.correctionSubmission);assert.throws(()=>Corrections.prepareReceive(f.requested.database,bad,'reviewer'),/antigua/);}
 const wrong=clone(f.exp);wrong.fields.fullName='Tampered';assert.throws(()=>Corrections.prepareApprove(f.received.database,wrong,'reviewer'),/original/);
 const mutated=clone(f.exp);mutated.correctionSubmission.payload.changes['identity.name']='Tampered';assert.throws(()=>Corrections.prepareApprove(f.received.database,mutated,'reviewer'),/alterada/);
});
test('changed BO record or canonical review blocks stale correction and never mutates input',()=>{
 const {exp,db}=fixture(),req=Corrections.prepareRequest(db,exp,['fullName'],'Motivo','reviewer');submit(exp,req.reviewProjection,{fullName:'Cambio'});
 const altered=clone(req.database);altered.patients[0].patient.phone='changed';const original=JSON.stringify(altered);assert.throws(()=>Corrections.prepareReceive(altered,exp,'reviewer'),/backoffice cambiaron/);assert.equal(JSON.stringify(altered),original);
 const foreign=clone(req.database);foreign.patients[0].demoPatientReview.request.allowedFields.push('comfortablePayment');assert.throws(()=>Corrections.prepareReceive(foreign,exp,'reviewer'),/modificada/);
 const ambiguous=clone(req.database);ambiguous.patients.push(clone(ambiguous.patients[0]));assert.throws(()=>Corrections.prepareReceive(ambiguous,exp,'reviewer'),/único/);
});
test('accepted/signed legacy and current financial records cannot be corrected at any stage',()=>{
 for(const key of ['offerAccepted','contractSigned','offerAcceptedAt','contractSignedAt','signatureStatus']){
  const {exp,db}=fixture(),req=Corrections.prepareRequest(db,exp,['fullName'],'Motivo','reviewer');submit(exp,req.reviewProjection,{fullName:'Cambio'});
  const altered=clone(req.database);altered.patients[0].application[key]=key==='signatureStatus'?'signed':true;
  assert.throws(()=>Corrections.prepareRequest(altered,exp,['fullName'],'Motivo','reviewer'),/bloqueado/);assert.throws(()=>Corrections.prepareReceive(altered,exp,'reviewer'),/bloqueado/);
  const storage={getItem:()=>JSON.stringify(altered),setItem:()=>{throw Error('Must not write');}};assert.equal(Corrections.readReview(storage,exp).financialLocked,true);
 }
 const {exp,db}=fixture();exp.holderActions.offerAcceptance={confirmed:true};assert.throws(()=>Corrections.prepareRequest(db,exp,['fullName'],'Motivo','reviewer'),/bloqueado/);
 const f=flow('patient',{fullName:'Correct'}),signed=clone(f.received.database);signed.patients[0].application.contractSigned=true;assert.throws(()=>Corrections.prepareApprove(signed,f.exp,'reviewer'),/bloqueado/);
});
test('all legacy BO finance freeze aliases are honored',()=>{
 const variants=[...['signed','signed_manual','signed_digital','signed_autographic','firmado','firmada','contrato_firmado','firmado_demo'].flatMap(status=>[{application:{signatureStatus:status}},{contract:{signatureStatus:status}}]),...['signedAt','signedContractUrl'].flatMap(key=>[{application:{[key]:'legacy-value'}},{contract:{[key]:'legacy-value'}}]),...['aceptada','aceptado','accepted','oferta_aceptada','offer_accepted'].map(status=>({offer:{status}})),...['oferta_aceptada','offer_accepted'].map(applicationStatus=>({application:{applicationStatus}})),{offer:{accepted:true}}];
 for(const variant of variants){const {exp,db}=fixture();const r=db.patients[0];for(const [key,value]of Object.entries(variant))r[key]={...r[key],...value};const before=JSON.stringify(db);assert.throws(()=>Corrections.prepareRequest(db,exp,['fullName'],'Motivo','reviewer'),/bloqueado/);assert.equal(JSON.stringify(db),before);}
});
test('unobserved display aliases remain unchanged',()=>{
 const patient=flow('patient',{fullName:'Revised'});assert.equal(patient.approved.database.patients[0].patient.address,'Domicilio original');
 const doctor=flow('doctor',{professionalLicense:'NEW'});assert.equal(doctor.approved.database.providers[0].medval.specialty,'Especialidad DEMO');
});
test('whitelisted projection and helper calls never write storage or reveal BO secrets',()=>{
 const {exp,db}=fixture();db.patients[0].notes=['PRIVATE NOTE'];db.patients[0].offer={status:'draft',approvedAmount:12345,secretMargin:'VERY SECRET'};db.patients[0].application.identity.homoclave='UNRELATED PRIVATE';
 const req=Corrections.prepareRequest(db,exp,['fullName'],'Motivo','reviewer');let reads=0;const storage={getItem:key=>{assert.equal(key,Corrections.BO_KEY);reads++;return JSON.stringify(req.database);},setItem:()=>assert.fail('Unexpected storage write')};
 const view=Corrections.readReview(storage,exp);assert.equal(reads,1);assert.doesNotMatch(JSON.stringify(view),/PRIVATE NOTE|VERY SECRET|UNRELATED PRIVATE|secretMargin|approvedAmount/);
 const malformed=clone(req.database);malformed.patients[0].crmCorrection.approvedFields.secret='SHOULD NEVER LEAK';assert.throws(()=>Corrections.readReview({getItem:()=>JSON.stringify(malformed)},exp),/campos aprobados/);
 assert.equal(view.canonicalBaselineFingerprint.length,64);assert.deepEqual(view.supportedFieldLabels,Corrections.FIELD_LABELS.patient);submit(exp,view,{fullName:'Revised'});const received=Corrections.prepareReceive(req.database,exp,'reviewer'),approved=Corrections.prepareApprove(received.database,exp,'reviewer');
 assert.equal(approved.database.patients[0].application.identity.homoclave,'UNRELATED PRIVATE');assert.deepEqual(approved.database.patients[0].offer,db.patients[0].offer);assert.equal(exp.fields.fullName,'Persona DEMO');
});
test('second correction keeps previous approved values without replacing frozen base',()=>{
 const f=flow('patient',{fullName:'First'}),req=Corrections.prepareRequest(f.approved.database,f.exp,['address'],'Second observation','reviewer');assert.equal(req.reviewProjection.baseline.fullName,'First');assert.equal(req.reviewProjection.approvedFields.fullName,'First');submit(f.exp,req.reviewProjection,{address:'Second address'});const received=Corrections.prepareReceive(req.database,f.exp,'reviewer'),approved=Corrections.prepareApprove(received.database,f.exp,'reviewer');assert.deepEqual(approved.reviewProjection.approvedFields,{fullName:'First',address:'Second address'});assert.equal(f.exp.fields.fullName,'Persona DEMO');
});

function documentFixture(kind='patient'){
 const f=fixture(kind);f.docId=record(f.db,kind)[kind==='patient'?'documents':'files'][0].id;f.descriptor={id:'new_evidence_'+kind,name:'replacement.pdf',mimeType:'application/pdf',size:250,uploadedAt:'2026-10-09T01:00:00Z',actorId:'kam_ana',contactId:f.exp.contactId,activityId:null,documentType:kind==='patient'?'identity':'license'};return f;
}
function submitDocument(exp,descriptor,review){const submission=Corrections.createDocumentSubmission(exp,descriptor,review);submission.holderConfirmation={actorId:exp.holderIdentity.id,actorRole:'holder',confirmed:true,demo:true,at:'2026-10-09T02:00:00Z',capacity:'holder',authorityConfirmed:true};exp.documentCorrectionSubmission=submission;return submission;}
test('patient/provider document replacement uses canonical files, correction queue and version history',()=>{
 for(const kind of ['patient','doctor']){
  const f=documentFixture(kind);record(f.db,kind)[kind==='patient'?'documents':'files'][0].required=true;const frozen=clone(f.exp),initial=clone(record(f.db,kind)[kind==='patient'?'documents':'files'][0]),before=JSON.stringify(f.db);
  const req=Corrections.prepareDocumentRequest(f.db,f.exp,f.docId,'Nueva versión legible','reviewer');assert.equal(JSON.stringify(f.db),before);assert.equal(req.database.corrections.length,1);assert.equal(req.database.corrections[0].kind,kind==='patient'?'patient':'provider');assert.equal(req.database.corrections[0].docId,f.docId);assert.equal(req.reviewProjection.status,'requested');assert.equal(req.reviewProjection.activeDocument.evidenceId,initial.evidenceId);
  submitDocument(f.exp,f.descriptor,req.reviewProjection);const received=Corrections.prepareDocumentReceive(req.database,f.exp,'reviewer'),pending=record(received.database,kind)[kind==='patient'?'documents':'files'][0];
  assert.equal(received.reviewProjection.status,'re_review');assert.equal(pending.evidenceId,initial.evidenceId);assert.equal(pending.fileName,initial.fileName);assert.equal(pending.pendingCorrection.evidenceId,f.descriptor.id);assert.equal(pending.pendingCorrection.status,'pending');assert.equal(received.database.corrections[0].status,'received');
  const approved=Corrections.prepareDocumentApprove(received.database,f.exp,'reviewer'),doc=record(approved.database,kind)[kind==='patient'?'documents':'files'][0];assert.equal(doc.id,f.docId);assert.equal(doc.required,true);assert.equal(doc.evidenceId,f.descriptor.id);assert.equal(doc.fileName,'replacement.pdf');assert.equal(doc.status,'approved');assert.equal(doc.pendingCorrection,undefined);assert.equal(doc.versions.length,1);assert.equal(doc.versions[0].evidenceId,initial.evidenceId);assert.equal(doc.versions[0].fileName,initial.fileName);assert.equal(approved.reviewProjection.approvedDocuments[0].evidenceId,f.descriptor.id);assert.equal(approved.database.corrections[0].status,'resolved');assert.deepEqual(approved.database.corrections[0].history.map(h=>h.action),['crm_document_requested','crm_document_received','crm_document_approved']);
  assert.deepEqual(f.exp.documents,frozen.documents);assert.deepEqual(f.exp.submissionSnapshot,frozen.submissionSnapshot);assert.deepEqual(f.exp.fields,frozen.fields);assert.deepEqual(record(approved.database,kind).offer,record(f.db,kind).offer);assert.doesNotMatch(JSON.stringify(approved.database),/data:application\/pdf|base64/);
 }
});
test('rejected replacement preserves old active document and archives rejected evidence; retry needs a new request',()=>{
 for(const kind of ['patient','doctor']){
  const f=documentFixture(kind),req=Corrections.prepareDocumentRequest(f.db,f.exp,f.docId,'Legible','reviewer');submitDocument(f.exp,f.descriptor,req.reviewProjection);const received=Corrections.prepareDocumentReceive(req.database,f.exp,'reviewer'),rejected=Corrections.prepareDocumentReject(received.database,f.exp,'Todavía ilegible','reviewer'),doc=record(rejected.database,kind)[kind==='patient'?'documents':'files'][0],original=record(f.db,kind)[kind==='patient'?'documents':'files'][0];
  assert.equal(doc.evidenceId,original.evidenceId);assert.equal(doc.fileName,original.fileName);assert.equal(doc.mimeType,original.mimeType);assert.equal(doc.size,original.size);assert.equal(doc.status,'rejected');assert.equal(doc.versions[0].evidenceId,f.descriptor.id);assert.equal(doc.versions[0].active,false);assert.equal(doc.versions[0].status,'rejected');assert.equal(rejected.reviewProjection.history[0].document.evidenceId,f.descriptor.id);assert.equal(rejected.reviewProjection.approvedDocuments.length,0);
  assert.throws(()=>Corrections.prepareDocumentReceive(rejected.database,f.exp,'reviewer'),/cerrada/);assert.throws(()=>Corrections.prepareDocumentApprove(rejected.database,f.exp,'reviewer'),/recibida/);assert.throws(()=>Corrections.createDocumentSubmission(f.exp,{...f.descriptor,id:'another'},rejected.reviewProjection),/abierto/);
  const again=Corrections.prepareDocumentRequest(rejected.database,f.exp,f.docId,'Solicitar otra versión','reviewer');assert.notEqual(again.reviewProjection.nonce,req.reviewProjection.nonce);assert.ok(again.reviewProjection.version>req.reviewProjection.version);assert.equal(again.reviewProjection.history[0].status,'rejected');assert.equal(again.database.corrections.length,1);submitDocument(f.exp,{...f.descriptor,id:'final_evidence'},again.reviewProjection);const nextReceived=Corrections.prepareDocumentReceive(again.database,f.exp,'reviewer'),approved=Corrections.prepareDocumentApprove(nextReceived.database,f.exp,'reviewer');assert.equal(approved.reviewProjection.history.length,2);assert.equal(approved.reviewProjection.approvedDocuments[0].evidenceId,'final_evidence');assert.equal(record(approved.database,kind)[kind==='patient'?'documents':'files'][0].versions.length,2);
 }
});
test('document scope, immutable identity, replay, stale records and holder confirmation are enforced',()=>{
 const f=documentFixture(),req=Corrections.prepareDocumentRequest(f.db,f.exp,f.docId,'Legible','reviewer');assert.throws(()=>Corrections.prepareDocumentRequest(f.db,f.exp,'wrong','No','reviewer'),/documento/);assert.throws(()=>Corrections.prepareDocumentRequest(f.db,f.exp,f.docId,'No',{id:'kam_ana',role:'kam'}),/backoffice/);assert.throws(()=>Corrections.prepareDocumentRequest(req.database,f.exp,f.docId,'No','reviewer'),/pendiente/);
 submitDocument(f.exp,f.descriptor,req.reviewProjection);const wrong=clone(f.exp);wrong.documentCorrectionSubmission.docId='another';rehash(wrong.documentCorrectionSubmission);assert.throws(()=>Corrections.prepareDocumentReceive(req.database,wrong,'reviewer'),/identidad/);
 const impersonated=clone(f.exp);impersonated.documentCorrectionSubmission.holderConfirmation.actorId='kam_ana';assert.throws(()=>Corrections.prepareDocumentReceive(req.database,impersonated,'reviewer'),/titular/);
 const nonce=clone(f.exp);nonce.documentCorrectionSubmission.nonce='stale';rehash(nonce.documentCorrectionSubmission);assert.throws(()=>Corrections.prepareDocumentReceive(req.database,nonce,'reviewer'),/antigua/);
 const stale=clone(req.database);stale.patients[0].documents[0].fileName='tamper.pdf';assert.throws(()=>Corrections.prepareDocumentReceive(stale,f.exp,'reviewer'),/cambiaron/);const original=clone(f.exp);original.documents[0].evidenceId='changed';assert.throws(()=>Corrections.prepareDocumentReceive(req.database,original,'reviewer'),/original/);
 const received=Corrections.prepareDocumentReceive(req.database,f.exp,'reviewer');assert.throws(()=>Corrections.prepareDocumentReceive(received.database,f.exp,'reviewer'),/recibida/);assert.throws(()=>Corrections.createDocumentSubmission(f.exp,f.descriptor,req.reviewProjection),/ya fue enviada/);const altered=clone(f.exp);altered.documentCorrectionSubmission.descriptor.id='changed';assert.throws(()=>Corrections.prepareDocumentApprove(received.database,altered,'reviewer'),/alterada/);
 const doctor=documentFixture('doctor'),doctorReq=Corrections.prepareDocumentRequest(doctor.db,doctor.exp,doctor.docId,'No','reviewer');submitDocument(doctor.exp,doctor.descriptor,doctorReq.reviewProjection);doctor.exp.documentCorrectionSubmission.holderConfirmation.authorityConfirmed=false;assert.throws(()=>Corrections.prepareDocumentReceive(doctorReq.database,doctor.exp,'reviewer'),/facultades/);
});
test('document evidence metadata is exact-contact typed and bounded, with no binary or arbitrary fields',()=>{
 const f=documentFixture(),req=Corrections.prepareDocumentRequest(f.db,f.exp,f.docId,'Legible','reviewer');
 for(const patch of [{contactId:'other'},{mimeType:'text/html'},{size:5242881},{size:0},{uploadedAt:'bad'},{actorId:''},{dataUrl:'data:application/pdf;base64,AA'},{documentType:'unobserved'},{name:'../bad.pdf'}])assert.throws(()=>Corrections.createDocumentSubmission(f.exp,{...f.descriptor,...patch},req.reviewProjection),/metadatos/);
 assert.throws(()=>Corrections.createDocumentSubmission(f.exp,{...f.descriptor,id:req.reviewProjection.activeDocument.evidenceId},req.reviewProjection),/nueva versión/);
 const large=Corrections.createDocumentSubmission(f.exp,{...f.descriptor,size:5242880},req.reviewProjection);assert.equal(large.descriptor.size,5242880);
 const storage={getItem:()=>JSON.stringify(req.database),setItem:()=>assert.fail('Unexpected write')},view=Corrections.readDocumentReview(storage,f.exp),options=Corrections.listDocumentOptions(storage,f.exp);assert.equal(view.docId,f.docId);assert.equal(options.length,1);assert.equal(options[0].docId,f.docId);assert.ok(view.fingerprint);assert.doesNotMatch(JSON.stringify(view),/recordFingerprint|baseDocument|payload|provenance/);
});
test('document correction obeys accepted/signed freeze and serializes with field correction workflow',()=>{
 const f=documentFixture(),fields=Corrections.prepareRequest(f.db,f.exp,['fullName'],'Field first','reviewer');assert.throws(()=>Corrections.prepareDocumentRequest(fields.database,f.exp,f.docId,'Document','reviewer'),/campos pendiente/);
 const req=Corrections.prepareDocumentRequest(f.db,f.exp,f.docId,'Document first','reviewer');assert.throws(()=>Corrections.prepareRequest(req.database,f.exp,['fullName'],'Field','reviewer'),/documental pendiente/);
 for(const variant of [{application:{offerAccepted:true}},{contract:{signatureStatus:'signed_digital'}},{contract:{signedContractUrl:'legacy'}},{offer:{accepted:true}},{offer:{status:'oferta_aceptada'}}]){const locked=clone(f.db);for(const [key,value]of Object.entries(variant))locked.patients[0][key]={...locked.patients[0][key],...value};assert.throws(()=>Corrections.prepareDocumentRequest(locked,f.exp,f.docId,'No','reviewer'),/bloqueado/);}
 submitDocument(f.exp,f.descriptor,req.reviewProjection);const received=Corrections.prepareDocumentReceive(req.database,f.exp,'reviewer'),signed=clone(received.database);signed.patients[0].application.contractSigned=true;assert.throws(()=>Corrections.prepareDocumentApprove(signed,f.exp,'reviewer'),/bloqueado/);assert.throws(()=>Corrections.prepareDocumentReject(signed,f.exp,'No','reviewer'),/bloqueado/);assert.equal(Corrections.readDocumentReview({getItem:()=>JSON.stringify(signed)},f.exp).financialLocked,true);
});
test('settled field and document corrections can alternate without losing original snapshots or versions',()=>{
 const f=flow('patient',{fullName:'Field approved'}),docId=f.approved.database.patients[0].documents[0].id,req=Corrections.prepareDocumentRequest(f.approved.database,f.exp,docId,'Doc after field','reviewer'),descriptor={id:'alternating_evidence',name:'new.pdf',mimeType:'application/pdf',size:200,uploadedAt:'2026-10-09T03:00:00Z',actorId:'kam_ana',contactId:f.exp.contactId};submitDocument(f.exp,descriptor,req.reviewProjection);const received=Corrections.prepareDocumentReceive(req.database,f.exp,'reviewer'),approved=Corrections.prepareDocumentApprove(received.database,f.exp,'reviewer');assert.equal(Corrections.readReview({getItem:()=>JSON.stringify(approved.database)},f.exp).approvedFields.fullName,'Field approved');const next=Corrections.prepareRequest(approved.database,f.exp,['address'],'Field after doc','reviewer');submit(f.exp,next.reviewProjection,{address:'New address'});const fieldReceived=Corrections.prepareReceive(next.database,f.exp,'reviewer'),fieldApproved=Corrections.prepareApprove(fieldReceived.database,f.exp,'reviewer');assert.equal(Corrections.readDocumentReview({getItem:()=>JSON.stringify(fieldApproved.database)},f.exp).approvedDocuments[0].evidenceId,'alternating_evidence');assert.equal(fieldApproved.database.patients[0].documents[0].versions.length,1);
});
console.log(`PASS: ${count} CRM canonical correction adapter suites.`);
