/* CRM projection of the existing servicing correction workflow. Local DEMO only.
 * No storage writes: the BO adapter commits the returned database in one write.
 * The original CRM submission is immutable; revisions are separate sidecars. */
(function(root,factory){const api=factory(root?.PulzzoDemoServicing||(typeof module==='object'&&module.exports?require('./demo-servicing.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PulzzoCRMCorrections=api;})(typeof window!=='undefined'?window:null,function(S){
'use strict';
const BO_KEY='pulzzo_backoffice_demo';
const FIELD_MAP=Object.freeze({patient:Object.freeze({fullName:'identity.name',address:'identity.address.street',monthlyIncome:'incomeMonthly',identityReference:'identity.curp',employment:'incomeType'}),doctor:Object.freeze({professionalLicense:'medval.medicalLicenseNumber',specialty:'medval.pendingSpecialty',payoutReference:'fiscal.clabe'})});
const FIELD_LABELS=Object.freeze({patient:Object.freeze({fullName:'Nombre completo',address:'Domicilio',monthlyIncome:'Ingreso mensual',identityReference:'CURP / referencia de identidad DEMO',employment:'Actividad / tipo de ingreso'}),doctor:Object.freeze({professionalLicense:'Cédula profesional',specialty:'Especialidad',payoutReference:'CLABE / referencia de pago DEMO'})});
const clone=x=>JSON.parse(JSON.stringify(x));
const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const token=x=>typeof x==='string'&&x.length>0&&x.length<=180&&!/[\u0000-\u001f]/.test(x);
const hash=x=>S.digestText(S.fingerprint(x));
const equal=(a,b)=>S.fingerprint(a)===S.fingerprint(b);
function supportedFields(kind){if(!FIELD_MAP[kind])throw Error('Tipo de expediente no válido.');return clone(FIELD_LABELS[kind]);}
function source(exp){
 if(!S)throw Error('El motor de correcciones no está disponible.');
 const p=exp?.submissionSnapshot,i=exp?.holderIdentity;
 if(!plain(p)||p.schema!=='pulzzo.crm.submission.v1'||p.demo!==true||!FIELD_MAP[exp.kind]||!token(exp.id)||!token(exp.contactId)||!token(i?.id)||i.demo!==true||!Number.isFinite(Date.parse(i.verifiedAt))||!exp.submittedAt||p.submittedAt!==exp.submittedAt||p.expedientId!==exp.id||p.contactId!==exp.contactId||p.accountId!==i.id||p.kind!==exp.kind||!token(p.submissionId)||p.revision!==exp.submissionRevision||!Number.isSafeInteger(p.revision)||p.revision<1||!equal(p.fields,exp.fields)||!equal(p.documents,exp.documents)||!equal(p.holderIdentity,i))throw Error('La identidad o la constancia original del expediente cambió.');
 return p;
}
function normalizedStatus(value){return String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s\-]+/g,'_').replace(/[^a-z0-9_]+/g,'').replace(/_+/g,'_').replace(/^_|_$/g,'');}
function locked(exp,record){
 const a=record?.application||{},o=record?.offer||{},c=record?.contract||{},h=exp?.holderActions||{};
 const signed=value=>['signed','signed_manual','signed_digital','signed_autographic','firmado','firmada','contrato_firmado','firmado_demo'].includes(normalizedStatus(value));
 const accepted=value=>['aceptada','aceptado','accepted','oferta_aceptada','offer_accepted'].includes(normalizedStatus(value));
 return !!(exp?.offerAccepted||exp?.contractSigned||['accepted','signed'].includes(exp?.status)||h.offerAcceptance||h.contractSignature||a.offerAccepted||o.accepted||accepted(o.status)||accepted(a.applicationStatus)||accepted(a.offerStatus)||a.contractSigned||a.offerAcceptedAt||a.signedAt||a.signedContractUrl||a.contractSignedAt||c.signedAt||c.signedContractUrl||signed(a.signatureStatus)||signed(c.signatureStatus)||record?.offerAccepted||record?.contractSigned||record?.crmIntake?.holderDecisionAt||record?.crmIntake?.holderSignedAt);
}
function requireUnlocked(exp,record){if(locked(exp,record))throw Error('El expediente con oferta aceptada o contrato firmado está bloqueado; no admite correcciones CRM.');}
function exactRecord(db,exp){
 const p=source(exp),rows=exp.kind==='patient'?db?.patients:db?.providers;
 if(!Array.isArray(rows))throw Error('El backoffice local no tiene un estado válido.');
 const matches=rows.filter(r=>r.crmIntake?.expedientId===exp.id);
 if(matches.length!==1)throw Error('No hay un único expediente vinculado en backoffice.');
 const r=matches[0],c=r.crmIntake;
 if(!token(r.id)||c.contactId!==exp.contactId||c.accountId!==p.accountId||c.submissionId!==p.submissionId||c.submittedAt!==p.submittedAt||r[exp.kind==='patient'?'patientAccountId':'doctorAccountId']!==p.accountId)throw Error('El expediente está vinculado a otra identidad o envío.');
 if(exp.kind==='patient'){const id=S.patientRecordIdentity(r);if(id.applicationId!==exp.id||id.patientAccountId!==p.accountId||id.recordId!==r.id)throw Error('La solicitud de paciente cambió de identidad.');}
 return r;
}
function recordHash(record){const copy=clone(record);delete copy.crmCorrection;delete copy.demoPatientReview;delete copy.demoProfileReview;return hash(copy);}
function reviewOf(record,kind){return record[kind==='patient'?'demoPatientReview':'demoProfileReview'];}
function canonicalEnvelope(kind,accountId,applicationId,payload,providerId){const mem=new Map(),storage={getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v)};return S.publish(storage,kind,accountId,applicationId,payload,providerId?{providerId}:{});}
function setPath(target,path,value){const parts=path.split('.');for(let i=0;i<parts.length-1;i++){const key=parts[i];if(!plain(target[key]))target[key]={};target=target[key];}target[parts.at(-1)]=clone(value);}
function crmValues(snapshot,kind){return Object.fromEntries(Object.entries(FIELD_MAP[kind]).map(([key,path])=>[key,snapshot[path]]));}
function mappedChanges(changes,kind){const out={};for(const [key,path]of Object.entries(FIELD_MAP[kind]))if(Object.hasOwn(changes||{},path))out[key]=clone(changes[path]);return out;}
function baseSnapshot(record,exp){
 const existing=exp.kind==='patient'?S.patientSnapshot({...record.application,identity:record.application?.identity||{},incomeMonthly:record.patient?.incomeMonthly,incomeType:record.patient?.incomeType}):S.profileSnapshot(record);
 // Import the exact submitted CRM values into the review only. Approvals apply
 // only submitted changes, so absent/unobserved canonical fields never overwrite BO.
 for(const [key,path]of Object.entries(FIELD_MAP[exp.kind]))existing[path]=String(exp.fields[key]??'');
 return exp.kind==='patient'?S.validatePatientSnapshot(existing):S.validateSnapshot(existing);
}
function requireTracked(record,exp,allowLocked=false){
 const c=record.crmCorrection,r=reviewOf(record,exp.kind),p=source(exp);
 if(!c||!r||c.expedientId!==exp.id||c.contactId!==exp.contactId||c.accountId!==p.accountId||c.submissionId!==p.submissionId||c.recordId!==record.id||c.submissionFingerprint!==hash(p)||c.reviewFingerprint!==hash(r))throw Error('La revisión no corresponde al envío vigente o fue modificada.');
 if(!plain(c.approvedFields)||Object.entries(c.approvedFields).some(([key,value])=>!Object.hasOwn(FIELD_MAP[exp.kind],key)||typeof value!=='string'||value!==r.snapshot[FIELD_MAP[exp.kind][key]]))throw Error('Los campos aprobados no corresponden a la revisión.');
 if(!allowLocked||!locked(exp,record)){requireUnlocked(exp,record);if(c.recordFingerprint!==recordHash(record))throw Error('Los datos de backoffice cambiaron desde la revisión. Revisa el expediente antes de continuar.');}
 return r;
}
function project(record,exp){
 const r=requireTracked(record,exp,true),c=record.crmCorrection,q=r.request;
 if(!q)throw Error('No hay una solicitud de corrección vigente.');
 const reverse=Object.fromEntries(Object.entries(FIELD_MAP[exp.kind]).map(([k,v])=>[v,k]));
 if(q.allowedFields.some(k=>!reverse[k]))throw Error('La revisión contiene campos ajenos al alcance CRM.');
 const baseline=crmValues(q.baseline,exp.kind),allowedFields=q.allowedFields.map(k=>reverse[k]);
 const out={schema:'pulzzo.crm.correction.review.v1',demo:true,expedientId:exp.id,contactId:exp.contactId,accountId:c.accountId,recordId:record.id,kind:exp.kind,submissionId:c.submissionId,submissionFingerprint:c.submissionFingerprint,status:r.status,version:r.version,requestId:q.requestId,nonce:q.nonce,requestVersion:q.version,allowedFields,reason:q.reason,baseline,baselineFingerprint:hash(baseline),canonicalBaselineFingerprint:hash(q.baseline),changes:mappedChanges(r.submittedChanges||{},exp.kind),approvedFields:clone(c.approvedFields||{}),supportedFieldLabels:supportedFields(exp.kind),financialLocked:locked(exp,record),request:{requestId:q.requestId,nonce:q.nonce,version:q.version,allowedFields:allowedFields.slice(),reason:q.reason,baseline:clone(baseline),status:q.status}};
 out.fingerprint=hash(out);return out;
}
function readReview(storage,exp){const raw=storage.getItem(BO_KEY);if(!raw)return null;let db;try{db=JSON.parse(raw);}catch(_){throw Error('No se pudo leer el backoffice local.');}const rows=exp?.kind==='patient'?db.patients:db.providers;if(!Array.isArray(rows))throw Error('El backoffice local no tiene un estado válido.');if(!rows.some(r=>r.crmIntake?.expedientId===exp?.id))return null;const record=exactRecord(db,exp);return record.crmCorrection?project(record,exp):null;}
function actorLabel(actor){if(plain(actor)&&['kam','holder'].includes(actor.role))throw Error('Solo backoffice puede revisar y aprobar correcciones.');const id=plain(actor)?actor.email||actor.id:actor;if(!token(id))throw Error('Falta el revisor de backoffice.');return id;}
function audit(db,record,exp,actor,action){if(!Array.isArray(db.audit))db.audit=[];db.audit.unshift({at:new Date().toISOString(),user:actorLabel(actor),entity:record.id,entityKind:exp.kind==='patient'?'patient':'provider',action,comment:'Corrección DEMO de campos observados. Constancia original y términos financieros preservados.'});}
function prepareRequest(database,exp,fields,reason,actor){
 actorLabel(actor);const db=clone(database),record=exactRecord(db,exp);requireUnlocked(exp,record);assertNoOpenDocument(db,exp);const map=FIELD_MAP[exp.kind];
 if(!Array.isArray(fields)||!fields.length||new Set(fields).size!==fields.length||fields.some(k=>!Object.hasOwn(map,k)))throw Error('Selecciona únicamente campos CRM habilitados.');
 let review=reviewOf(record,exp.kind);
 if(record.crmCorrection){review=requireTracked(record,exp);if(!['approved','re_review'].includes(review.status))throw Error('Ya hay una corrección pendiente de envío del titular.');}
 else {
  if(review)throw Error('Hay una revisión previa fuera de CRM. Termínala antes de solicitar otra.');
  const snapshot=baseSnapshot(record,exp),accountId=exp.holderIdentity.id;
  if(exp.kind==='patient')review=S.importPatientProfile(record,canonicalEnvelope('patient_profile',accountId,exp.id,{...S.patientRecordIdentity(record),snapshot}));
  else review=S.importProfile(record,canonicalEnvelope('doctor_profile',accountId,accountId,{doctorAccountId:accountId,snapshot}));
  record.crmCorrection={expedientId:exp.id,contactId:exp.contactId,accountId,recordId:record.id,submissionId:exp.submissionSnapshot.submissionId,submissionFingerprint:hash(exp.submissionSnapshot),approvedFields:{}};
 }
 if(exp.kind==='patient')S.requestPatientCorrection(review,fields.map(k=>map[k]),reason);else S.requestCorrection(review,fields.map(k=>map[k]),reason);
 record.crmCorrection.recordFingerprint=recordHash(record);record.crmCorrection.reviewFingerprint=hash(review);
 audit(db,record,exp,actor,'Corrección CRM solicitada');return {database:db,id:record.id,reviewProjection:project(record,exp)};
}
function validateProjection(exp,review){
 const p=source(exp);requireUnlocked(exp);
 if(!plain(review)||review.schema!=='pulzzo.crm.correction.review.v1'||review.demo!==true||review.expedientId!==exp.id||review.contactId!==exp.contactId||review.accountId!==p.accountId||review.kind!==exp.kind||review.submissionId!==p.submissionId||review.submissionFingerprint!==hash(p)||!token(review.recordId)||!token(review.requestId)||!token(review.nonce)||!Number.isSafeInteger(review.requestVersion)||review.requestVersion<1||!plain(review.baseline)||review.baselineFingerprint!==hash(review.baseline)||review.financialLocked)throw Error('La revisión no corresponde al expediente o está bloqueada.');
 const copy=clone(review);delete copy.fingerprint;if(review.fingerprint!==hash(copy))throw Error('La revisión fue alterada.');
 const map=FIELD_MAP[exp.kind];if(!Array.isArray(review.allowedFields)||!review.allowedFields.length||new Set(review.allowedFields).size!==review.allowedFields.length||review.allowedFields.some(k=>!Object.hasOwn(map,k)))throw Error('Campos de corrección no permitidos.');
 return p;
}
function createSubmission(exp,draft,review){
 const p=validateProjection(exp,review);if(review.status!=='requested'||review.request?.status!=='requested')throw Error('La corrección no está abierta para captura.');
 if(exp.correctionSubmission?.requestId===review.requestId&&exp.correctionSubmission?.nonce===review.nonce)throw Error('Esta corrección ya fue enviada.');
 if(!plain(draft)||!plain(draft.fields)||Object.keys(draft).some(k=>!['fields','documents','requestId','version','fieldHistory','updatedAt','updatedBy'].includes(k))||(draft.documents&&(!Array.isArray(draft.documents)||draft.documents.length)))throw Error('Solo se admiten los campos observados; documentos no habilitados.');
 if(draft.requestId!==undefined&&draft.requestId!==review.requestId||draft.version!==undefined&&draft.version!==review.requestVersion)throw Error('El borrador pertenece a otra versión de la corrección.');
 const changes={},crmChanges={};for(const [key,value]of Object.entries(draft.fields)){
  if(!review.allowedFields.includes(key)||!Object.hasOwn(FIELD_MAP[exp.kind],key)||(typeof value!=='string'&&typeof value!=='number')||typeof value==='number'&&!Number.isFinite(value)||String(value).length>(exp.kind==='doctor'?500:2000)||!String(value).trim())throw Error('La corrección contiene un campo no autorizado o inválido.');
  if(key==='monthlyIncome'&&!(Number(value)>0))throw Error('El ingreso mensual debe ser positivo.');
  const v=String(value).trim();if(v!==String(review.baseline[key])){changes[FIELD_MAP[exp.kind][key]]=v;crmChanges[key]=v;}
 }
 if(!Object.keys(changes).length)throw Error('Modifica al menos un campo observado.');
 const payload={requestId:review.requestId,nonce:review.nonce,version:review.requestVersion,baselineFingerprint:review.canonicalBaselineFingerprint,changes};
 if(exp.kind==='patient')Object.assign(payload,{patientAccountId:p.accountId,applicationId:exp.id,recordId:review.recordId});else Object.assign(payload,{doctorAccountId:p.accountId,providerId:review.recordId});
 const out={schema:'pulzzo.crm.correction.submission.v1',demo:true,expedientId:exp.id,contactId:exp.contactId,accountId:p.accountId,kind:exp.kind,recordId:review.recordId,submissionId:p.submissionId,submissionFingerprint:hash(p),requestId:review.requestId,nonce:review.nonce,version:review.requestVersion,reviewFingerprint:review.fingerprint,changes:crmChanges,payload};
 out.fingerprint=hash(out);return out;
}
function checkedSubmission(exp,record,review,receiving=true){
 const sub=exp.correctionSubmission,confirmation=sub?.holderConfirmation;
 if(!plain(sub)||sub.schema!=='pulzzo.crm.correction.submission.v1'||sub.demo!==true||sub.expedientId!==exp.id||sub.contactId!==exp.contactId||sub.kind!==exp.kind||sub.accountId!==exp.holderIdentity.id||sub.recordId!==record.id||sub.submissionId!==exp.submissionSnapshot.submissionId||sub.submissionFingerprint!==hash(exp.submissionSnapshot)||sub.requestId!==review.request.requestId||sub.nonce!==review.request.nonce||sub.version!==review.request.version)throw Error('Corrección antigua, repetida o de otra identidad.');
 const copy=clone(sub);delete copy.holderConfirmation;delete copy.fingerprint;if(sub.fingerprint!==hash(copy))throw Error('La corrección enviada fue alterada.');
 if(!confirmation||confirmation.actorId!==sub.accountId||confirmation.actorRole&&confirmation.actorRole!=='holder'||confirmation.confirmed!==true||confirmation.demo!==true||!Number.isFinite(Date.parse(confirmation.at)))throw Error('El titular debe confirmar personalmente el reenvío.');
 if(exp.kind==='doctor'&&(!['holder','authorized_representative'].includes(confirmation.capacity)||confirmation.authorityConfirmed!==true))throw Error('Faltan facultades confirmadas del titular o representante.');
 const current=project(record,exp);if(receiving&&sub.reviewFingerprint!==current.fingerprint||sub.payload?.baselineFingerprint!==hash(review.request.baseline)||!equal(sub.changes,mappedChanges(sub.payload?.changes,exp.kind)))throw Error('La revisión vigente cambió o contiene datos no permitidos.');
 return sub;
}
function prepareReceive(database,exp,actor){
 actorLabel(actor);const db=clone(database),record=exactRecord(db,exp);requireUnlocked(exp,record);const review=requireTracked(record,exp),sub=checkedSubmission(exp,record,review);
 const payload={...clone(sub.payload),baselineFingerprint:S.fingerprint(review.request.baseline)};
 if(exp.kind==='patient')S.acceptPatientCorrectionSubmission(review,canonicalEnvelope('patient_correction',sub.accountId,exp.id,payload));else S.acceptCorrectionSubmission(review,canonicalEnvelope('doctor_correction',sub.accountId,record.id,payload,record.id));
 record.crmCorrection.receivedSubmissionFingerprint=sub.fingerprint;record.crmCorrection.reviewFingerprint=hash(review);audit(db,record,exp,actor,'Corrección CRM recibida para revisión');return {database:db,id:record.id,reviewProjection:project(record,exp)};
}
function prepareApprove(database,exp,actor){
 actorLabel(actor);const db=clone(database),record=exactRecord(db,exp);requireUnlocked(exp,record);const review=requireTracked(record,exp);
 if(review.status!=='re_review'||record.crmCorrection.receivedSubmissionFingerprint!==exp.correctionSubmission?.fingerprint)throw Error('No hay un reenvío vigente por aprobar.');
 checkedSubmission(exp,record,review,false);
 if(exp.kind==='patient'){
  S.approvePatientCorrection(review);
  if(Object.hasOwn(review.request.approvedChanges,'identity.address.street')){
   if(typeof record.application?.identity?.address==='string')record.application.identity.address={street:record.application.identity.address};
   record.patient.address=review.request.approvedChanges['identity.address.street'];
  }
  S.applyPatientRecordCorrection(record);
 }else{
  S.approveCorrection(review);
  const state={doctorAccountId:exp.holderIdentity.id,demoProviderId:record.id,demoCorrection:{...clone(review.request),status:'submitted'}};
  for(const [path,value]of Object.entries(review.request.baseline))setPath(state,path,value);
  const envelope=canonicalEnvelope('doctor_review',exp.holderIdentity.id,record.id,{doctorAccountId:exp.holderIdentity.id,providerId:record.id,snapshot:review.snapshot,version:review.version,status:review.status,request:review.request},record.id);
  S.applyReview(state,envelope,exp.holderIdentity.id);
  for(const [path,value]of Object.entries(review.request.approvedChanges))setPath(record,path,value);
  if(Object.hasOwn(review.request.approvedChanges,'medval.pendingSpecialty'))record.medval.specialty=review.request.approvedChanges['medval.pendingSpecialty'];
 }
 record.crmCorrection.approvedFields={...record.crmCorrection.approvedFields,...mappedChanges(review.request.approvedChanges,exp.kind)};
 record.crmCorrection.reviewFingerprint=hash(review);record.crmCorrection.recordFingerprint=recordHash(record);refreshSettledDocumentGuards(db,record,exp);audit(db,record,exp,actor,'Corrección CRM aprobada');return {database:db,id:record.id,reviewProjection:project(record,exp)};
}
// Document replacement uses the existing BO documents/files and corrections queue.
// Only the candidate is pending; the active document changes after BO approval.
const DOC_REVIEW='pulzzo.crm.document-correction.review.v1',DOC_SUBMISSION='pulzzo.crm.document-correction.submission.v1';
const documentKind=exp=>exp.kind==='patient'?'patient':'provider';
const documentRows=(db,exp)=>(db.corrections||[]).filter(c=>c.kind===documentKind(exp)&&c.crmDocument?.expedientId===exp.id);
const latestDocumentRow=(db,exp)=>documentRows(db,exp).sort((a,b)=>b.crmDocument.current.version-a.crmDocument.current.version)[0]||null;
function assertNoOpenDocument(db,exp){if(documentRows(db,exp).some(c=>['requested','re_review'].includes(c.crmDocument.current.status)))throw Error('Termina la corrección documental pendiente antes de abrir otra revisión.');}
function exactDocument(record,exp,docId){const docs=record[exp.kind==='patient'?'documents':'files'];if(!Array.isArray(docs)||!token(docId))throw Error('Documento no válido.');const found=docs.filter(d=>d.id===docId);if(found.length!==1)throw Error('No hay un único documento observado en este expediente.');return found[0];}
function publicDocument(doc){const out={id:doc.id,type:String(doc.type||''),fileName:String(doc.fileName||''),mimeType:String(doc.mimeType||''),size:Number(doc.size)||0,evidenceId:String(doc.evidenceId||''),status:String(doc.status||'pending')};for(const k of ['uploadedAt','uploadedBy'])if(typeof doc[k]==='string')out[k]=doc[k];return out;}
function metadataDescriptor(exp,value,documentType){
 const keys=['id','name','mimeType','size','uploadedAt','actorId','contactId','activityId','documentType'];
 if(!plain(value)||Object.keys(value).some(k=>!keys.includes(k))||!token(value.id)||!token(value.actorId)||value.contactId!==exp.contactId||typeof value.name!=='string'||!value.name.trim()||value.name.length>180||/[\u0000-\u001f\u007f/\\]/.test(value.name)||!['application/pdf','image/png','image/jpeg','image/webp'].includes(value.mimeType)||!Number.isSafeInteger(value.size)||value.size<=0||value.size>5242880||!Number.isFinite(Date.parse(value.uploadedAt))||value.activityId!=null&&!token(value.activityId)||value.documentType!=null&&value.documentType!==documentType)throw Error('La evidencia documental tiene metadatos inválidos o pertenece a otro contacto.');
 return clone(value);
}
function activeDocumentBase(doc){const base=clone(doc);delete base.versions;delete base.pendingCorrection;return base;}
function docCurrentFingerprint(current){const copy=clone(current);delete copy.fingerprint;return hash(copy);}
function documentQueueEvent(row,user,action,previous,next){if(!Array.isArray(row.history))row.history=[];row.history.push({at:new Date().toISOString(),user,action,previous,next,requestId:row.crmDocument.current.requestId,docId:row.docId});}
function trackDocument(row,record){row.crmDocument.current.recordFingerprint=recordHash(record);row.crmDocument.current.fingerprint=docCurrentFingerprint(row.crmDocument.current);if(record.crmCorrection){record.crmCorrection.recordFingerprint=recordHash(record);}}
function refreshSettledDocumentGuards(db,record,exp){for(const row of documentRows(db,exp))if(['approved','rejected'].includes(row.crmDocument.current.status))trackDocument(row,record);}
function trackedDocument(db,record,exp,allowLocked=false){
 const row=latestDocumentRow(db,exp),m=row?.crmDocument,q=m?.current,p=source(exp);
 if(!row||!q||row.entityId!==record.id||m.contactId!==exp.contactId||m.accountId!==p.accountId||m.submissionId!==p.submissionId||m.submissionFingerprint!==hash(p)||!token(q.requestId)||!token(q.nonce)||q.docId!==row.docId||q.fingerprint!==docCurrentFingerprint(q))throw Error('La corrección documental no corresponde al expediente o fue alterada.');
 const doc=exactDocument(record,exp,row.docId);
 if(!allowLocked||!locked(exp,record)){requireUnlocked(exp,record);if(q.recordFingerprint!==recordHash(record))throw Error('Los datos de backoffice cambiaron desde la revisión documental.');}
 return {row,current:q,doc};
}
function projectDocument(db,record,exp){
 const {row,current:q,doc}=trackedDocument(db,record,exp,true),p=source(exp),activeDocument=publicDocument(doc);
 const history=documentRows(db,exp).flatMap(c=>[...(c.crmDocument.history||[]),...(['approved','rejected'].includes(c.crmDocument.current.status)?[c.crmDocument.current]:[])]).sort((a,b)=>a.version-b.version).map(h=>({requestId:h.requestId,docId:h.docId,status:h.status,reason:h.decisionReason||h.reason,document:publicDocument(h.candidate||h.baseDocument)}));
 const out={schema:DOC_REVIEW,demo:true,expedientId:exp.id,contactId:exp.contactId,accountId:p.accountId,recordId:record.id,kind:exp.kind,submissionId:p.submissionId,submissionFingerprint:hash(p),docId:doc.id,documentType:String(doc.type||''),status:q.status,version:q.version,requestVersion:q.version,requestId:q.requestId,nonce:q.nonce,reason:q.reason,decisionReason:q.decisionReason||'',baselineFingerprint:q.baselineFingerprint,financialLocked:locked(exp,record),activeDocument,candidate:q.candidate?publicDocument(q.candidate):null,observedDocuments:[{...activeDocument,docId:doc.id,documentType:String(doc.type||'')}],history,approvedDocuments:history.filter(h=>h.status==='approved').map(h=>({...h.document,requestId:h.requestId,docId:h.docId})),request:{requestId:q.requestId,nonce:q.nonce,version:q.version,docId:doc.id,status:q.status,reason:q.reason}};
 out.fingerprint=hash(out);return out;
}
function documentDatabase(storage){const raw=storage.getItem(BO_KEY);if(!raw)return null;try{const db=JSON.parse(raw);if(!Array.isArray(db.patients)||!Array.isArray(db.providers)||db.corrections&&!Array.isArray(db.corrections))throw Error();return db;}catch(_){throw Error('No se pudo leer el backoffice local.');}}
function listDocumentOptions(storage,exp){const db=documentDatabase(storage);if(!db)return [];const rows=exp?.kind==='patient'?db.patients:db.providers;if(!rows.some(r=>r.crmIntake?.expedientId===exp?.id))return [];const record=exactRecord(db,exp);return (record[exp.kind==='patient'?'documents':'files']||[]).map(doc=>({docId:doc.id,documentType:String(doc.type||''),fileName:String(doc.fileName||''),evidenceId:String(doc.evidenceId||''),status:String(doc.status||'pending')}));}
function readDocumentReview(storage,exp){const db=documentDatabase(storage);if(!db)return null;const rows=exp?.kind==='patient'?db.patients:db.providers;if(!rows.some(r=>r.crmIntake?.expedientId===exp?.id))return null;const record=exactRecord(db,exp);return latestDocumentRow(db,exp)?projectDocument(db,record,exp):null;}
function prepareDocumentRequest(database,exp,docId,reason,actor){
 const reviewer=actorLabel(actor),db=clone(database),record=exactRecord(db,exp);requireUnlocked(exp,record);assertNoOpenDocument(db,exp);
 if(['requested','re_review'].includes(reviewOf(record,exp.kind)?.status))throw Error('Termina la corrección de campos pendiente antes de observar un documento.');
 if(record.crmCorrection)requireTracked(record,exp);
 const doc=exactDocument(record,exp,docId);if(Array.isArray(doc.files)&&doc.files.length)throw Error('Este documento agrupa varios archivos; revisa cada archivo desde backoffice.');if(doc.pendingCorrection)throw Error('Ya hay una versión documental pendiente.');if(!String(reason||'').trim())throw Error('Indica el motivo de corrección documental.');
 if(!Array.isArray(db.corrections))db.corrections=[];const kind=documentKind(exp),matches=db.corrections.filter(c=>c.kind===kind&&c.entityId===record.id&&c.docId===docId);if(matches.length>1)throw Error('Hay correcciones documentales ambiguas.');let row=matches[0];if(row&&!row.crmDocument&&row.status!=='resolved')throw Error('Hay una corrección documental previa fuera de CRM.');
 const prior=latestDocumentRow(db,exp),version=(prior?.crmDocument.current.version||0)+1,at=new Date().toISOString();
 if(prior)trackedDocument(db,record,exp);
 if(!row){row={id:'crm-doc-correction-'+record.id+'-'+docId,kind,entityId:record.id,docId,field:String(doc.type||'Documento'),assignee:''};db.corrections.push(row);}
 if(!row.crmDocument)row.crmDocument={expedientId:exp.id,contactId:exp.contactId,accountId:exp.holderIdentity.id,submissionId:exp.submissionSnapshot.submissionId,submissionFingerprint:hash(exp.submissionSnapshot),history:[]};
 if(row.crmDocument.current)row.crmDocument.history.push(clone(row.crmDocument.current));
 const requestId='doc-request-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),baseDocument=activeDocumentBase(doc);
 row.crmDocument.current={requestId,nonce:'doc-nonce-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),version,docId,status:'requested',reason:String(reason).trim().slice(0,1000),requestedAt:at,requestedBy:reviewer,baselineFingerprint:hash(baseDocument),baseDocument,candidate:null};
 Object.assign(row,{status:'pending',reason:row.crmDocument.current.reason,createdAt:at,updatedAt:at,requestedBy:reviewer,lastDocumentStatus:'correction_required'});
 Object.assign(doc,{status:'correction_required',rejectionReason:row.reason,correctionRequestedAt:at,reviewedBy:reviewer,reviewedAt:at});documentQueueEvent(row,reviewer,'crm_document_requested',null,'pending');trackDocument(row,record);audit(db,record,exp,actor,'Corrección documental CRM solicitada');return {database:db,id:record.id,docId,reviewProjection:projectDocument(db,record,exp)};
}
function validateDocumentProjection(exp,review){
 const p=source(exp);requireUnlocked(exp);if(!plain(review)||review.schema!==DOC_REVIEW||review.demo!==true||review.expedientId!==exp.id||review.contactId!==exp.contactId||review.accountId!==p.accountId||review.kind!==exp.kind||review.submissionId!==p.submissionId||review.submissionFingerprint!==hash(p)||!token(review.recordId)||!token(review.docId)||!token(review.requestId)||!token(review.nonce)||!Number.isSafeInteger(review.version)||review.version<1||typeof review.baselineFingerprint!=='string'||review.financialLocked)throw Error('La revisión documental no corresponde al expediente o está bloqueada.');
 const copy=clone(review);delete copy.fingerprint;if(review.fingerprint!==hash(copy))throw Error('La revisión documental fue alterada.');return p;
}
function createDocumentSubmission(exp,descriptor,review){
 const p=validateDocumentProjection(exp,review);if(review.status!=='requested')throw Error('Este documento no está abierto para corrección.');if(exp.documentCorrectionSubmission?.requestId===review.requestId)throw Error('La corrección documental ya fue enviada.');
 const metadata=metadataDescriptor(exp,descriptor,review.documentType);if(metadata.id===review.activeDocument?.evidenceId)throw Error('Carga una nueva versión del documento observado.');
 const out={schema:DOC_SUBMISSION,demo:true,expedientId:exp.id,contactId:exp.contactId,accountId:p.accountId,recordId:review.recordId,kind:exp.kind,submissionId:p.submissionId,submissionFingerprint:hash(p),docId:review.docId,requestId:review.requestId,nonce:review.nonce,version:review.version,baselineFingerprint:review.baselineFingerprint,reviewFingerprint:review.fingerprint,descriptor:metadata};out.fingerprint=hash(out);return out;
}
function checkedDocumentSubmission(db,record,exp,current,receiving=true){
 const sub=exp.documentCorrectionSubmission,confirmation=sub?.holderConfirmation;
 if(!plain(sub)||sub.schema!==DOC_SUBMISSION||sub.demo!==true||sub.expedientId!==exp.id||sub.contactId!==exp.contactId||sub.accountId!==exp.holderIdentity.id||sub.recordId!==record.id||sub.kind!==exp.kind||sub.submissionId!==exp.submissionSnapshot.submissionId||sub.submissionFingerprint!==hash(exp.submissionSnapshot)||sub.docId!==current.docId||sub.requestId!==current.requestId||sub.nonce!==current.nonce||sub.version!==current.version||sub.baselineFingerprint!==current.baselineFingerprint)throw Error('Corrección documental antigua, repetida o de otra identidad.');
 const copy=clone(sub);delete copy.holderConfirmation;delete copy.fingerprint;if(sub.fingerprint!==hash(copy))throw Error('La corrección documental enviada fue alterada.');
 if(!confirmation||confirmation.actorId!==sub.accountId||confirmation.actorRole&&confirmation.actorRole!=='holder'||confirmation.confirmed!==true||confirmation.demo!==true||!Number.isFinite(Date.parse(confirmation.at)))throw Error('El titular debe confirmar personalmente el reenvío documental.');
 if(exp.kind==='doctor'&&(!['holder','authorized_representative'].includes(confirmation.capacity)||confirmation.authorityConfirmed!==true))throw Error('Faltan facultades confirmadas del titular o representante.');
 const doc=exactDocument(record,exp,current.docId);metadataDescriptor(exp,sub.descriptor,String(doc.type||''));if(receiving&&sub.reviewFingerprint!==projectDocument(db,record,exp).fingerprint)throw Error('La revisión documental vigente cambió.');if(!receiving&&sub.fingerprint!==current.receivedSubmissionFingerprint)throw Error('El reenvío documental cambió después de recibirse.');return sub;
}
function prepareDocumentReceive(database,exp,actor){
 const reviewer=actorLabel(actor),db=clone(database),record=exactRecord(db,exp);requireUnlocked(exp,record);const {row,current:q,doc}=trackedDocument(db,record,exp);if(q.status!=='requested')throw Error('La corrección documental ya fue recibida o cerrada.');
 const sub=checkedDocumentSubmission(db,record,exp,q),m=sub.descriptor,at=new Date().toISOString();q.candidate={id:doc.id,type:String(doc.type||''),status:'pending',source:'crm_demo',fileName:m.name,mimeType:m.mimeType,size:m.size,evidenceId:m.id,metadataOnly:true,uploadedAt:m.uploadedAt,uploadedBy:m.actorId,contactId:m.contactId,correctionRequestId:q.requestId,simulatedPreview:'Evidencia DEMO local. Abre la evidencia en CRM para revisar la versión recibida.'};
 q.status='re_review';q.receivedAt=at;q.receivedBy=reviewer;q.receivedSubmissionFingerprint=sub.fingerprint;doc.pendingCorrection=clone(q.candidate);doc.status='pending';Object.assign(row,{status:'received',receivedAt:at,receivedBy:reviewer,updatedAt:at,lastDocumentStatus:'pending'});documentQueueEvent(row,reviewer,'crm_document_received','pending','received');trackDocument(row,record);audit(db,record,exp,actor,'Corrección documental CRM recibida para revisión');return {database:db,id:record.id,docId:doc.id,reviewProjection:projectDocument(db,record,exp)};
}
function decideDocument(database,exp,actor,approved,reason){
 const reviewer=actorLabel(actor),db=clone(database),record=exactRecord(db,exp);requireUnlocked(exp,record);const {row,current:q,doc}=trackedDocument(db,record,exp);if(q.status!=='re_review'||!q.candidate||!equal(doc.pendingCorrection,q.candidate))throw Error('No hay una versión documental recibida por revisar.');checkedDocumentSubmission(db,record,exp,q,false);
 if(!approved&&!String(reason||'').trim())throw Error('Indica el motivo del rechazo documental.');const at=new Date().toISOString(),status=approved?'approved':'rejected',versions=Array.isArray(doc.versions)?clone(doc.versions):[];
 q.status=status;q.decisionAt=at;q.decisionBy=reviewer;q.decisionReason=approved?'':String(reason).trim().slice(0,1000);q.candidate={...q.candidate,status,reviewedAt:at,reviewedBy:reviewer,rejectionReason:q.decisionReason};
 if(approved){versions.push({...clone(q.baseDocument),supersededAt:at,supersededByCorrection:q.requestId});
  const next={...clone(q.baseDocument),...q.candidate,versions};for(const key of ['pendingCorrection','dataUrl','previewUrl','url','fileUrl','approvedAt','approvedBy','correctionReason','correctionRequestedAt'])delete next[key];for(const key of Object.keys(doc))delete doc[key];Object.assign(doc,next);}
 else {versions.push({...clone(q.candidate),active:false,rejectedCandidate:true});delete doc.pendingCorrection;Object.assign(doc,{versions,status:'rejected',rejectionReason:q.decisionReason,reviewedAt:at,reviewedBy:reviewer});}
 Object.assign(row,{status:'resolved',resolvedAt:at,resolvedBy:reviewer,updatedAt:at,lastDocumentStatus:status});documentQueueEvent(row,reviewer,approved?'crm_document_approved':'crm_document_rejected','received','resolved');trackDocument(row,record);refreshSettledDocumentGuards(db,record,exp);audit(db,record,exp,actor,approved?'Corrección documental CRM aprobada':'Corrección documental CRM rechazada');return {database:db,id:record.id,docId:doc.id,reviewProjection:projectDocument(db,record,exp)};
}
function prepareDocumentApprove(database,exp,actor){return decideDocument(database,exp,actor,true,'');}
function prepareDocumentReject(database,exp,reason,actor){return decideDocument(database,exp,actor,false,reason);}

return {BO_KEY,FIELD_MAP,FIELD_LABELS,supportedFields,readReview,prepareRequest,createSubmission,prepareReceive,prepareApprove,readDocumentReview,listDocumentOptions,prepareDocumentRequest,createDocumentSubmission,prepareDocumentReceive,prepareDocumentApprove,prepareDocumentReject};
});
