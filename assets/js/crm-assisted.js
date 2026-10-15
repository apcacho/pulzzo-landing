/* Pulzzo assisted onboarding. LOCAL DEMO ONLY: this is not authentication, consent evidence or server authorization. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PulzzoCRMAssisted = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var PATIENT_FIELDS = ['fullName','email','phone','procedure','requestedAmount','termMonths','monthlyIncome','address','identityReference','employment'];
  var DOCTOR_FIELDS = ['fullName','email','phone','specialty','professionalLicense','clinicName','clinicAddress','representativeName','representativeRole','payoutReference'];
  var REQUIRED = {patient:['fullName','email','phone','procedure','requestedAmount','termMonths','monthlyIncome','address','identityReference'],doctor:['fullName','email','phone','specialty','professionalLicense','clinicName','clinicAddress']};
  var challenges = Object.create(null), proofs = Object.create(null), onboardingEvidenceProofs = Object.create(null), onboardingEvidenceRevisions = Object.create(null);
  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function quoteTerms(v){var clean=copy(v);delete clean.status;return JSON.stringify(clean);}
  function email(v) { return String(v || '').trim().toLowerCase(); }
  function fail(code, message) { var err = new Error(message); err.code = code; throw err; }
  function id(prefix) { var a = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); return prefix + '_' + a; }
  var ONBOARDING_SCHEMA='pulzzo.crm.onboarding.v1';
  var ONBOARDING_KEYS={patient:['pulzzo_patient','pulzzo_application'],doctor:['pulzzo_doctor','pulzzoDoctorOnboardingCleanV3','pulzzoDoctorAccountType','pulzzoDoctorSpecialties','pulzzoDoctorOnboardingCleanV3Status']};
  var ONBOARDING_LIMIT=6*1024*1024;
  function object(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
  function equal(a,b){return JSON.stringify(a)===JSON.stringify(b);}
  function decodeRecord(records,key){try{var v=JSON.parse(records[key]||'null');return object(v)?v:{};}catch(ignore){fail('INVALID_ONBOARDING','El formulario guardado no tiene JSON válido.');}}
  function stateRecord(kind,records){return decodeRecord(records,kind==='doctor'?'pulzzoDoctorOnboardingCleanV3':'pulzzo_application');}
  function fullState(exp){return stateRecord(exp.kind,exp.onboarding&&exp.onboarding.records||{});}
  function amount(v){return Number(String(v==null?'':v).replace(/[^\d.-]/g,''))||0;}
  function present(v){return v!==null&&v!==undefined&&String(v).trim()!=='';}
  function filesAt(value){return Array.isArray(value)?value:value&&typeof value==='object'?[value]:[];}
  function inlinePayload(f){
    if(!object(f)||typeof f.dataUrl!=='string'||!Number.isInteger(f.size)||f.size<=0||f.size>5242880||!present(f.name||f.fileName))return null;
    var match=/^data:(application\/pdf|image\/(?:png|jpeg|webp|gif)|video\/(?:webm|mp4));base64,([A-Za-z0-9+/]*={0,2})$/.exec(f.dataUrl);if(!match||match[2].length%4!==0||match[1]!==(f.type||f.mimeType))return null;
    var bytes=match[2].length*3/4-(match[2].endsWith('==')?2:match[2].endsWith('=')?1:0);if(bytes!==f.size)return null;
    var head;try{head=typeof atob==='function'?atob(match[2].slice(0,32)):typeof Buffer!=='undefined'?Buffer.from(match[2].slice(0,32),'base64').toString('binary'):null;}catch(ignore){return null;}if(!head)return null;
    var signature=match[1]==='image/gif'?/^GIF8[79]a/.test(head):match[1]==='application/pdf'?head.indexOf('%PDF-')===0:match[1]==='image/png'?head.slice(0,8)==='\x89PNG\r\n\x1a\n':match[1]==='image/jpeg'?head.charCodeAt(0)===255&&head.charCodeAt(1)===216&&head.charCodeAt(2)===255:match[1]==='image/webp'?head.slice(0,4)==='RIFF'&&head.slice(8,12)==='WEBP':match[1]==='video/webm'?head.slice(0,4)==='\x1a\x45\xdf\xa3':head.slice(4,8)==='ftyp';
    if(!signature)return null;return {name:String(f.name||f.fileName),mimeType:match[1],size:bytes,dataUrl:f.dataUrl};
  }
  function evidenceDescriptor(f){
    if(!object(f)||typeof f.evidenceId!=='string'||!/^[A-Za-z0-9_-]{1,180}$/.test(f.evidenceId)||!present(f.name)||typeof f.name!=='string'||f.name.length>180||!Number.isInteger(f.size)||f.size<=0||f.size>5242880||!(['application/pdf','image/png','image/jpeg','image/webp'].includes(f.type||f.mimeType)||['video/webm','video/mp4'].includes(f.type||f.mimeType)&&f.documentType==='selfieVideo'||(f.type||f.mimeType)==='image/gif'&&f.documentType==='profile_photo')||!Number.isFinite(Date.parse(f.uploadedAt))||!present(f.actorId)||!present(f.contactId)||!present(f.documentType))return null;
    return {evidenceId:f.evidenceId,name:f.name,type:f.type||f.mimeType,size:f.size,uploadedAt:f.uploadedAt,actorId:f.actorId,contactId:f.contactId,documentType:f.documentType};
  }
  var HOLDER_IDENTITY_TYPES=['ineFront','ineBack','selfieVideo','identity','idFront','idBack','selfie'];
  function isHolderIdentityType(type){return HOLDER_IDENTITY_TYPES.indexOf(type)>=0;}
  function holderIdentityFileComplete(exp,key){
    if(!exp||exp.kind!=='patient'||!exp.onboarding||!exp.holderIdentity)return false;
    var f=(fullState(exp).identityFiles||{})[key],holderId=exp.holderIdentity.id,d=evidenceDescriptor(f);
    if(!genuineFile(f)||d&&(d.actorId!==holderId||d.contactId!==exp.contactId||d.documentType!==key))return false;
    var path='pulzzo_application.identityFiles.'+key+'.'+(d?'evidenceId':'dataUrl'),history=exp.onboarding.fieldHistory&&exp.onboarding.fieldHistory[path]||[],last=history[history.length-1];
    return !!last&&last.actorRole==='holder'&&last.actorId===holderId&&!last.deleted&&equal(last.value,d?d.evidenceId:auditValue(f.dataUrl));
  }
  function identityFileHistory(kind,previous,records){
    var history=copy(previous&&previous.identityFileHistory||{});if(kind!=='patient')return history;
    var old=stateRecord(kind,previous&&previous.records||{}).identityFiles||{},next=stateRecord(kind,records).identityFiles||{};
    HOLDER_IDENTITY_TYPES.forEach(function(key){if(genuineFile(old[key])&&!equal(old[key],next[key])){if(!history[key])history[key]=[];history[key].push(copy(old[key]));}});return history;
  }
  function genuineFile(f){return !!inlinePayload(f)||!!evidenceDescriptor(f);}
  function onboardingDocumentDescriptors(kind,records){
    var s=stateRecord(kind,records),out=[];function add(value,path){filesAt(value).forEach(function(file,index){if(object(file)&&present(file.name||file.fileName))out.push({path:path+'.'+index,descriptor:file});});}
    if(kind==='doctor')Object.keys(s.files||{}).forEach(function(k){add(s.files[k],'files.'+k);});else{Object.keys(s.identityFiles||{}).forEach(function(k){add(s.identityFiles[k],'identityFiles.'+k);});Object.keys(s.documentFiles||{}).forEach(function(k){add(s.documentFiles[k],'documentFiles.'+k);});}return out;
  }
  function assertOnboardingEvidence(exp,revision,actor){
    if(!exp.onboarding)return true;
    onboardingDocumentDescriptors(exp.kind,exp.onboarding.records).forEach(function(row){var descriptor=evidenceDescriptor(row.descriptor);if(!descriptor)return;var proof=onboardingEvidenceRevisions[exp.id+'|'+descriptor.evidenceId];if(!proof||proof.revision!==revision||proof.actorId!==actor.id||!equal(proof.descriptor,descriptor))fail('EVIDENCE_RECHECK_REQUIRED','Vuelve a comprobar los archivos locales antes de confirmar o enviar.');});return true;
  }
  function verifiedEvidence(exp,descriptor){var value=evidenceDescriptor(descriptor);return !!value&&value.contactId===exp.contactId&&equal(onboardingEvidenceProofs[exp.id+'|'+value.evidenceId],value);}

  function assertHolderDocumentUpload(exp,file,actor){
    var descriptor={evidenceId:file.evidenceId||file.id,name:file.name||file.fileName,type:file.type||file.mimeType,size:file.size,uploadedAt:file.evidenceUploadedAt||file.uploadedAt,actorId:file.evidenceActorId||file.actorId||file.uploadedBy,contactId:file.contactId||exp.contactId,documentType:file.documentType||file.label};
    if(!exp.holderIdentity||actor.role!=='holder'||actor.id!==exp.holderIdentity.id||descriptor.actorId!==actor.id||!verifiedEvidence(exp,descriptor))fail('HOLDER_UPLOAD_REQUIRED','Comprueba una carga nueva realizada personalmente por el cliente; los metadatos no sustituyen el archivo.');
    return evidenceDescriptor(descriptor);
  }

  function getOnboardingDocument(exp,id){
    if(!exp||!exp.onboarding)return null;var row=(exp.documents||[]).find(function(d){return d.id===id||d.evidenceId&&d.evidenceId===id;});if(!row||!row.onboardingPath)return null;
    var path=row.onboardingPath.split('.');if(path.some(function(k){return ['__proto__','prototype','constructor'].includes(k);}))return null;
    var value=fullState(exp);for(var i=0;i<path.length;i++){if(i===path.length-1&&!Array.isArray(value)&&path[i]==='0')break;value=value&&value[path[i]];}var payload=inlinePayload(value);if(!payload||payload.size!==row.size||payload.mimeType!==row.mimeType||payload.name.slice(0,120)!==row.fileName)return null;
    return Object.assign(payload,{id:row.id,documentType:path[1]||row.label,label:row.label,onboardingPath:row.onboardingPath,uploadedBy:row.uploadedBy,uploadedAt:row.uploadedAt,demo:true});
  }
  function patientMissing(s){
    s=s||{};var missing=[],p=object(s.procedure)?s.procedure:s,identity=s.identity||{},parts=identity.nameParts||{},addr=identity.address||{},docs=s.documentFiles||{},ids=s.identityFiles||{};
    function need(test,key){if(!test)missing.push(key);}
    need(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.contactEmail||s.patient&&s.patient.email||s.patient&&s.patient.correo||''),'Contacto: correo del titular');
    need(present(p.forWhom||s.forWhom),'Solicitud: beneficiario');
    need(Array.isArray(p.specialties||s.specialties)&&(p.specialties||s.specialties).length>0,'Solicitud: especialidad');
    need((Array.isArray(p.procedures||s.procedures)&&(p.procedures||s.procedures).length>0)||typeof p.procedure==='string'&&present(p.procedure),'Solicitud: procedimiento');
    need(present(p.when||s.when),'Solicitud: fecha prevista');
    var source=p.doctorSource||s.doctorSource;need(['propio','directorio','pendiente'].includes(source),'Solicitud: médico');
    if(source==='propio'){need(present(p.doctorName||s.doctorName)&&present(p.doctorState||s.doctorState)&&String(p.doctorWhatsApp||s.doctorWhatsApp||'').replace(/\D/g,'').length===10,'Solicitud: datos del médico');}
    if(source==='directorio')need(present(p.doctorId||s.doctorId),'Solicitud: médico del directorio');
    need(amount(p.amount!==undefined?p.amount:s.requestedAmount||p.requestedAmount||s.procedureCost||p.procedureCost)>=5000,'Solicitud: monto mínimo $5,000');
    need([6,12,18,24].includes(Number(s.selectedTerm||p.termMonths||p.selectedTerm)),'Solicitud: plazo');
    need(present(parts.first)&&present(parts.paternal),'Identidad: nombre y apellido');
    need(present(identity.curp)&&present(identity.rfcBase)&&present(identity.homoclave),'Identidad: CURP y RFC');
    need(['street','exterior','zip','colony','city','state'].every(function(k){return present(addr[k]);}),'Identidad: domicilio completo');
    need(present(identity.housingStatus),'Identidad: vivienda');
    if(['Pago renta','Pago hipoteca'].includes(identity.housingStatus))need(amount(identity.housingPayment)>0,'Identidad: pago de vivienda');
    ['ineFront','ineBack','proofAddress','selfieVideo'].forEach(function(k){need(genuineFile(ids[k]),'Documento: '+k);});
    need(['nomina','independiente'].includes(s.incomeType),'Ingresos: actividad');
    need(amount(s.incomeMonthly)>0&&amount(s.comfortablePayment)>0,'Ingresos: monto y pago disponible');
    need(filesAt(docs.bank).filter(genuineFile).length>=3,'Documento: 3 estados de cuenta');
    if(s.incomeType==='nomina')need(filesAt(docs.payroll).filter(genuineFile).length>=3,'Documento: 3 recibos de nómina');
    if(s.incomeType==='independiente'){
      need(['yes','no'].includes(s.ciecChoice),'Ingresos: opción CIEC');
      if(s.ciecChoice==='no')[['csf',1],['annualReturns',2],['monthlyReturn',1],['complianceOpinion',1]].forEach(function(pair){need(filesAt(docs[pair[0]]).filter(genuineFile).length>=pair[1],'Documento: '+pair[0]);});
    }
    need(Array.isArray(s.references)&&s.references.length>=2&&s.references.slice(0,2).every(function(r){return present(r.name||r.fullName)&&String(r.phone||'').replace(/\D/g,'').length===10&&present(r.relationship||r.relationshipType); }),'Referencias: dos contactos completos');
    return missing;
  }
  function doctorMissing(s){
    s=s||{};var missing=[],p=s.profile||{},f=s.fiscal||{},m=s.medval||{},c=s.clinicDocs||{},docs=s.files||{},specialties=s.specialties||[];
    function need(test,key){if(!test)missing.push(key);}
    function doc(key){need(filesAt(docs[key]).some(genuineFile),'Documento: '+key);}
    need(['name','email','state','city'].every(function(k){return present(p[k]);}),'Perfil: nombre, correo y ubicación');
    need(['doctor','clinica'].includes(p.accountType),'Perfil: tipo de profesional');need(present((s.contact||{}).registered),'Perfil: teléfono');
    need(Array.isArray(specialties)&&specialties.length>0,'Perfil: especialidades');need(Array.isArray(s.procedures)&&s.procedures.length>0,'Perfil: procedimientos');
    need(['rfc','banco','clabe','titular'].every(function(k){return present(f[k]);}),'Fiscal: RFC y datos bancarios');doc('bank_cover');
    if(p.accountType==='clinica'){
      need(['physical','moral'].includes(c.legalType),'Clínica: personalidad jurídica');need(['notice','license','responsible','other'].includes(c.sanitaryDocType),'Clínica: permiso sanitario');need(['yes','no'].includes(c.certRequired),'Clínica: certificación');
      ['csf','clinic_rep_ine','cofepris_permit','clinic_address_proof'].forEach(doc);if(c.legalType==='moral')doc('legal_power');if(c.certRequired==='yes'){doc('treatment_cert');need(present(c.certProcedure),'Clínica: procedimiento certificado');}
    }else{
      ['official_id','csf','office_address'].forEach(doc);need(['non_surgical','surgical','both'].includes(m.procedureType),'Validación médica: procedimientos');need(['upload','validate'].includes(m.method),'Validación médica: método');need(['yes','no'].includes(m.pendingQuestion),'Validación médica: documentos pendientes');
      if(m.method==='validate')need(present(m.curp),'Validación médica: CURP');
      if(m.method==='upload'){
        doc('med_license');specialties.forEach(function(label){doc('specialty_license_'+String(label).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,54));});
        if(['surgical','both'].includes(m.procedureType)&&!m.generalSurgeryNotApplicable)doc('gen_surgery_license');
      }
      if(m.pendingQuestion==='yes'){need(present(m.pendingDocType),'Validación médica: documento pendiente');doc('pending_proof');}
    }
    return missing;
  }
  function onboardingMissing(exp){var missing=exp.onboarding?(exp.kind==='doctor'?doctorMissing:patientMissing)(fullState(exp)):[];if(exp.onboarding&&exp.kind==='patient')['ineFront','ineBack','selfieVideo'].forEach(function(key){if(!holderIdentityFileComplete(exp,key)&&missing.indexOf('Documento: '+key)<0)missing.push('Documento: '+key);});return missing;}
  var PROTECTED_STATE=/^(?:verified|accountVerified|applicationSubmitted(?:At)?|submitted(?:At)?|submission(?:Snapshot|Revision)?|offer(?:Accepted|Ready|Signed|Status|Fingerprint)?|contract(?:Signed|Ready|Status)?|creditAuth.*|otp.*|buro.*|consent.*|authorization.*|signature.*|demoBridge.*|demoPatientCorrection.*|demoDoctorCorrection.*|demoDocumentCorrection.*|servicing.*|geolocation|geoDone|paymentStatus|loanStatus)$/i;
  function protectedEmpty(v){return v===false||v===null||v===''||v===0||v===undefined||Array.isArray(v)&&!v.length||object(v)&&!Object.keys(v).length;}
  function safeTree(value,path,depth){
    if(depth>30)fail('INVALID_ONBOARDING','El formulario excede la profundidad permitida.');
    if(value===null||typeof value==='boolean'||typeof value==='number'){if(typeof value==='number'&&!Number.isFinite(value))fail('INVALID_ONBOARDING','Valor numérico inválido.');return;}
    if(typeof value==='string'){if(value.length>ONBOARDING_LIMIT)fail('ONBOARDING_TOO_LARGE','El archivo excede el espacio local de la demo.');if(value.indexOf('data:')===0){var raw=/^data:([^;]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(value),size=raw?raw[2].length*3/4-(raw[2].endsWith('==')?2:raw[2].endsWith('=')?1:0):0;if(!raw||!inlinePayload({name:'archivo-demo',type:raw[1],size:size,dataUrl:value})||path.endsWith('.profilePhotoData')&&!raw[1].startsWith('image/'))fail('INVALID_DOCUMENT','El contenido del archivo local no tiene un tipo y formato admitidos.');}if(path.endsWith('.profilePhotoData')&&value&&value.indexOf('data:image/')!==0)fail('INVALID_DOCUMENT','La foto local debe ser una imagen válida del expediente.');return;}
    if(!value||typeof value!=='object')fail('INVALID_ONBOARDING','El formulario contiene un valor no válido.');
    if(object(value)&&value.dataUrl&&!inlinePayload(value)&&!(path.endsWith('profile')||path.endsWith('profilePhoto')))fail('INVALID_DOCUMENT','El archivo ficticio no coincide con sus bytes, tamaño o tipo permitido.');
    Object.keys(value).forEach(function(k){if((PROTECTED_STATE.test(k)||/^(termsAccepted|privacyAccepted|legalConsent|holderActions|holderIdentity|approved|accepted|signed|authenticated|authorized|authorityConfirmed|identityVerified|emailVerified|phoneVerified|initialPaymentPaid|providerDispersions|disbursementPaid|paymentPaid)$/i.test(k))&&!protectedEmpty(value[k]))fail('HOLDER_ACTION_REQUIRED','El formulario no puede guardar confirmaciones ni verificaciones del titular.');if(['reviewStatus','status'].includes(k)&&/^(approved|aprobado|aprobada|verified|verificado|verified_account|accepted|aceptada|signed|firmado)$/i.test(String(value[k])))fail('REVIEW_REQUIRED','La captura no puede aprobar archivos ni operaciones.');if(['__proto__','prototype','constructor'].includes(k)||/password|^(passwd|pwd|pass|pass2|pass_med|pass_med2|ciecKey|apiKey|accessToken|refreshToken|secret)$/i.test(k))fail('SECRET_FORBIDDEN','No se guardan contraseñas, claves ni credenciales en el expediente.');safeTree(value[k],path+'.'+k,depth+1);});
  }
  function validateOnboardingRecords(kind,records,previous,exp,contact,actor){
    if(!object(records)||!Object.keys(records).length||Object.keys(records).some(function(k){return ONBOARDING_KEYS[kind].indexOf(k)<0;}))fail('INVALID_ONBOARDING','Clave de formulario fuera de este expediente.');
    if(JSON.stringify(records).length>ONBOARDING_LIMIT)fail('ONBOARDING_TOO_LARGE','La captura excede 6 MiB locales. Reduce el tamaño de los archivos ficticios.');
    var parsed={};Object.keys(records).forEach(function(key){var raw=records[key];if(typeof raw!=='string')fail('INVALID_ONBOARDING','El formulario debe conservar su valor serializado.');if(['pulzzoDoctorAccountType','pulzzoDoctorOnboardingCleanV3Status'].includes(key)){if(raw.length>80)fail('INVALID_ONBOARDING','Estado inválido.');parsed[key]=raw;return;}try{parsed[key]=JSON.parse(raw);}catch(ignore){fail('INVALID_ONBOARDING','El formulario no es JSON válido.');}var check=parsed[key];if(kind==='patient'&&key==='pulzzo_application'&&object(check)){check=copy(check);delete check.geoDone;delete check.geolocation;}safeTree(check,key,0);});
    var key=kind==='doctor'?'pulzzoDoctorOnboardingCleanV3':'pulzzo_application',state=parsed[key]||{},old=stateRecord(kind,previous||{});
    if(!object(state))fail('INVALID_ONBOARDING','El formulario completo debe ser un objeto.');
    if(kind==='patient'){
      var changedGeo=!equal(state.geoDone,old.geoDone)||!equal(state.geolocation,old.geolocation);
      if(changedGeo){
        if(!actor||actor.role!=='holder'||!exp.holderIdentity||actor.id!==exp.holderIdentity.id)fail('HOLDER_ACTION_REQUIRED','La ubicación solo puede registrarla el titular desde su dispositivo.');
        var g=state.geolocation;
        if(state.geoDone===true&&(!object(g)||g.status!=='authorized'||g.consent!==true||g.source!=='browser_geolocation'||g.actorId!==actor.id||!Number.isFinite(g.latitude)||Math.abs(g.latitude)>90||!Number.isFinite(g.longitude)||Math.abs(g.longitude)>180||!Number.isFinite(g.accuracy)||g.accuracy<0||!Number.isFinite(Date.parse(g.capturedAt))))fail('INVALID_GEOLOCATION','Solo una ubicación autorizada con coordenadas válidas puede quedar completa.');
        if(state.geoDone!==true&&g&&(!object(g)||g.consent!==false||g.latitude!==null||g.longitude!==null||g.status!=='pending'))fail('INVALID_GEOLOCATION','La ubicación sin coordenadas debe quedar pendiente y sin consentimiento.');
        if(g&&Object.keys(g).some(function(k){return !['status','consent','source','actorId','latitude','longitude','accuracy','capturedAt','reason'].includes(k);}))fail('INVALID_GEOLOCATION','Metadatos de ubicación no permitidos.');
      }
    }
    Object.keys(state).forEach(function(field){if(!(kind==='patient'&&['geoDone','geolocation'].includes(field))&&PROTECTED_STATE.test(field)&&!equal(state[field],old[field])&&!protectedEmpty(state[field]))fail('HOLDER_ACTION_REQUIRED','Las verificaciones, autorizaciones y envío final se realizan en la revisión personal del titular.');});
    var account=parsed[kind==='doctor'?'pulzzo_doctor':'pulzzo_patient']||{},identityKey=kind==='doctor'?'doctorAccountId':'patientAccountId',formId='draft:'+exp.id;
    if(!object(account)||state[identityKey]!==formId||account[identityKey]!==formId)fail('IDENTITY_LOCK','El formulario debe conservar la identidad provisional del expediente.');
    if(kind==='patient'&&state.applicationId!=='application:'+exp.id)fail('IDENTITY_LOCK','La solicitud no puede cambiar de expediente.');
    [state.contactEmail,account.email,account.correo,kind==='doctor'&&state.profile&&state.profile.email,state.patient&&state.patient.email,state.patient&&state.patient.correo].filter(function(v){return v!==undefined&&v!==false&&v!=='';}).forEach(function(mail){if(email(mail)!==email(contact.email))fail('IDENTITY_LOCK','El correo debe coincidir con el contacto e invitación.');});
    if(kind==='patient')HOLDER_IDENTITY_TYPES.forEach(function(key){var prior=(old.identityFiles||{})[key],next=(state.identityFiles||{})[key];if(equal(prior,next))return;if(!actor||actor.role!=='holder'||!exp.holderIdentity||exp.holderIdentity.id!==actor.id)fail('HOLDER_UPLOAD_REQUIRED','La INE y selfie deben ser cargadas personalmente por el cliente.');var descriptor=evidenceDescriptor(next);if(next&&inlinePayload(next)&&(!prior||next.dataUrl!==prior.dataUrl))fail('HOLDER_UPLOAD_REQUIRED','Carga la INE o selfie como un archivo nuevo desde la sesión del cliente; volver a guardar bytes históricos no es una carga.');if(descriptor&&descriptor.actorId!==actor.id)fail('HOLDER_UPLOAD_REQUIRED','La identidad requiere una carga nueva del titular, no una confirmación de un archivo del KAM.');});
    var oldDocuments=onboardingDocumentDescriptors(kind,previous||{});
    onboardingDocumentDescriptors(kind,records).forEach(function(row){var mime=row.descriptor.type||row.descriptor.mimeType;if(mime==='image/gif'&&(kind!=='doctor'||row.path.split('.')[1]!=='profile_photo')||String(mime||'').startsWith('video/')&&(kind!=='patient'||row.path.split('.')[1]!=='selfieVideo'))fail('INVALID_DOCUMENT','El formato no corresponde a este documento.');var d=evidenceDescriptor(row.descriptor);if(row.descriptor.evidenceId){if(!d||d.contactId!==exp.contactId||d.documentType!==row.path.split('.')[1]||d.type==='image/gif'&&(kind!=='doctor'||d.documentType!=='profile_photo')||d.type.startsWith('video/')&&(kind!=='patient'||d.documentType!=='selfieVideo'))fail('INVALID_DOCUMENT','La evidencia no pertenece a este expediente o tipo de documento.');if(!oldDocuments.some(function(old){return equal(evidenceDescriptor(old.descriptor),d);})&&!verifiedEvidence(exp,d))fail('EVIDENCE_NOT_VERIFIED','Comprueba el archivo local antes de vincularlo al formulario.');}});
    return parsed;
  }
  function auditValue(value){
    function hash(text){var h=2166136261;for(var i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16);}
    if(typeof value==='string'&&value.indexOf('data:')===0)return {type:'inline-document',length:value.length,fingerprint:'fnv1a:'+hash(value)};
    if(Array.isArray(value))return value.map(auditValue);if(object(value)){var next={};Object.keys(value).forEach(function(k){next[k]=auditValue(value[k]);});return next;}return value;
  }
  function flattenOnboarding(records){
    var out={};function walk(value,path){if(value===null||typeof value!=='object'||Array.isArray(value)){out[path]=copy(auditValue(value));return;}var keys=Object.keys(value);if(!keys.length)out[path]={};else keys.forEach(function(k){walk(value[k],path+'.'+k);});}
    Object.keys(records).sort().forEach(function(k){var value;try{value=JSON.parse(records[k]);}catch(ignore){value=records[k];}walk(value,k);});return out;
  }
  function onboardingProjection(exp,records){
    var state=stateRecord(exp.kind,records),account=decodeRecord(records,exp.kind==='doctor'?'pulzzo_doctor':'pulzzo_patient'),fields={},documents=[];
    function addFiles(value,label,path){filesAt(value).forEach(function(f,i){if(!object(f)||!present(f.name||f.fileName))return;var origin=path+'.'+i,token='full_'+exp.id.replace(/[^A-Za-z0-9_-]/g,'_')+'_'+origin.replace(/[^A-Za-z0-9_-]/g,'_');documents.push({id:token,label:label,fileName:String(f.name||f.fileName).slice(0,120),demo:true,evidenceId:f.evidenceId||null,mimeType:f.type||f.mimeType||null,size:Number(f.size)||0,onboardingPath:origin,inlineEvidence:!!inlinePayload(f),evidenceActorId:f.actorId||null,evidenceUploadedAt:f.uploadedAt||null});});}
    if(exp.kind==='patient'){
      var p=object(state.procedure)?state.procedure:state,ident=state.identity||{},addr=ident.address||{};
      fields={fullName:ident.name||[ident.nameParts&&ident.nameParts.first,ident.nameParts&&ident.nameParts.second,ident.nameParts&&ident.nameParts.paternal,ident.nameParts&&ident.nameParts.maternal].filter(Boolean).join(' ')||account.fullName||account.nombre||exp.fields.fullName||'',email:state.contactEmail||account.email||account.correo||exp.fields.email||'',phone:account.phone||account.celular||exp.fields.phone||'',procedure:typeof p.procedure==='string'?p.procedure:(p.procedures||state.procedures||[]).join(', '),requestedAmount:amount(p.amount!==undefined?p.amount:state.requestedAmount||p.requestedAmount||state.procedureCost||p.procedureCost),termMonths:Number(state.selectedTerm||p.termMonths||p.selectedTerm)||0,monthlyIncome:amount(state.incomeMonthly),address:['street','exterior','interior','colony','zip','city','state'].map(function(k){return addr[k];}).filter(Boolean).join(', '),identityReference:ident.curp||ident.rfc||'',employment:state.incomeType||''};
      Object.keys(state.identityFiles||{}).forEach(function(k){addFiles(state.identityFiles[k],k==='ineFront'||k==='ineBack'?'identity':'other','identityFiles.'+k);});Object.keys(state.documentFiles||{}).forEach(function(k){addFiles(state.documentFiles[k],'income','documentFiles.'+k);});
    }else{
      var profile=state.profile||{},m=state.medval||{},data=state.profileData||{};
      fields={fullName:profile.name||account.nombre||exp.fields.fullName||'',email:profile.email||account.correo||exp.fields.email||'',phone:state.contact&&state.contact.registered||account.celular||exp.fields.phone||'',specialty:(state.specialties||[]).join(', '),professionalLicense:m.medicalLicenseNumber||m.licenseNumber||m.curp||(state.files&&filesAt(state.files.med_license).some(genuineFile)?'Documento de cédula en expediente':''),clinicName:profile.accountType==='clinica'?profile.name:(data.clinicName||profile.clinicName||profile.name||''),clinicAddress:[data.address||data.street||profile.address,profile.city,profile.state].filter(Boolean).join(', '),representativeName:data.representativeName||'',representativeRole:data.representativeRole||'',payoutReference:state.fiscal&&state.fiscal.banco||''};
      Object.keys(state.files||{}).forEach(function(k){addFiles(state.files[k],k==='license'||k==='med_license'||k.indexOf('specialty_license_')===0?'license':k==='official_id'||k==='clinic_rep_ine'?'identity':'clinic','files.'+k);});
    }
    Object.keys(fields).forEach(function(k){if(typeof fields[k]==='string')fields[k]=fields[k].slice(0,500);if(['requestedAmount','termMonths','monthlyIncome'].includes(k)&&!fields[k])fields[k]='';});return {fields:fields,documents:documents};
  }
  function createAssisted(options) {
    options = options || {};
    var store = options.store, actor = Object.freeze(Object.assign({}, options.actor || {}));
    if (!store || !store.snapshot || !store.transact || !actor.id) throw new Error('Store y actor explícitos requeridos.');
    var clock = options.now || function () { return new Date().toISOString(); }, randomId = options.randomId || id;
    function now() { return new Date(clock()).toISOString(); }
    function currentRevision(){try{return store.snapshot().revision;}catch(ignore){return null;}}
    function result(fn) { try { if(store.actor&&(store.actor.id!==actor.id||store.actor.role!==actor.role))fail('ACTOR_MISMATCH','La identidad de esta sesión no coincide con el acceso al almacén.');return {ok:true,value:fn(),revision:currentRevision()}; } catch(e) { return {ok:false,code:e.code || 'INVALID',error:e.message,revision:currentRevision()}; } }
    function transact(rev, fn) { return store.transact(rev, function (state, ctx) { if (!ctx.actor || ctx.actor.id!==actor.id || ctx.actor.role!==actor.role) fail('ACTOR_MISMATCH','La sesión demo cambió. Abre el expediente con el actor correcto.'); return fn(state,ctx); }); }
    function expFor(state, expId) { var exp=state.expedients[expId]; if (!exp) fail('NOT_FOUND','El expediente no existe.'); return exp; }
    function contactFor(state, exp) { var c=state.contacts[exp.contactId]; if (!c || c.deletedAt) fail('NOT_FOUND','El contacto no está disponible.'); return c; }
    function staff(ctx, contactId) { if (ctx.canEditContact?!ctx.canEditContact(contactId):actor.role !== 'kam' && actor.role !== 'admin') fail('FORBIDDEN','Esta acción corresponde al equipo asignado.'); if (!ctx.canAccessContact(contactId)) fail('FORBIDDEN','Solo puedes trabajar con contactos asignados.'); }
    function holder(exp) { if (actor.role !== 'holder' || !exp.holderIdentity || exp.holderIdentity.id !== actor.id) fail('HOLDER_REQUIRED','Solo el titular verificado puede realizar esta acción.'); }
    function editable(exp, fields) {
      if (exp.submittedAt || exp.submissionSnapshot || exp.demoBridgeCaseId || exp.offerAccepted || exp.contractSigned || exp.holderActions.offerAcceptance || exp.holderActions.contractSignature || exp.status === 'submitted' || exp.status === 'approved' || exp.status === 'rejected') fail('SUBMITTED_LOCK','El expediente enviado está bloqueado.');
      if (exp.status === 'needs_correction') {
        var allowed=exp.correctionFields || [];
        (fields || []).forEach(function (key) { if (allowed.indexOf(key) < 0) fail('CORRECTION_SCOPE','Solo pueden corregirse los campos solicitados.'); });
      }
    }
    function record(ctx, type, exp, details) {
      var event=Object.assign({type:type,contactId:exp.contactId,expedientId:exp.id,demo:true},details || {});
      ctx.append('audit',event); ctx.append('events',event);
    }
    function advanceStage(ctx,contact,stage){if(contact.stage===stage)return;var previous=contact.stage;contact.stage=stage;contact.stageReason=null;contact.updatedAt=ctx.now;ctx.append('events',{type:'contact_stage_changed',contactId:contact.id,from:previous,to:stage,reason:'onboarding_confirmed',demo:true});ctx.append('audit',{action:'contact_stage_changed',contactId:contact.id,from:previous,to:stage,reason:'onboarding_confirmed',demo:true});}
    function baseExp(ctx, contact, kind, identity) {
      var exp={id:ctx.id('exp'),contactId:contact.id,kind:kind,status:identity?'claimed':'draft',fields:{},fieldHistory:{},documents:[],holderIdentity:identity || null,holderActions:{},assistingActors:[],activeInvitationId:null,createdAt:ctx.now,updatedAt:ctx.now,createdBy:actor.id,submittedAt:null,submissionRevision:null,submissionSnapshot:null,correctionFields:[]};
      setFields(exp,{fullName:contact.name,email:contact.email,phone:contact.phone},ctx,!!identity);
      return exp;
    }
    function setFields(exp, fields, ctx, isHolder) {
      var allowed=exp.kind==='doctor'?DOCTOR_FIELDS:PATIENT_FIELDS;
      Object.keys(fields).forEach(function (key) {
        if (allowed.indexOf(key)<0) fail('FIELD_FORBIDDEN','No se permite capturar el campo: '+key);
        var value=fields[key];
        if (typeof value!=='string' && typeof value!=='number') fail('INVALID_FIELD','El campo debe ser texto o número.');
        value=typeof value==='string'?value.trim():value;
        if (String(value).length>500) fail('INVALID_FIELD','El campo supera el límite de 500 caracteres.');
        if (key==='email') value=email(value);
        if (['requestedAmount','termMonths','monthlyIncome'].indexOf(key)>=0 && value!=='') {
          value=Number(value); if (!Number.isFinite(value) || value<=0 || value>100000000 || (key==='termMonths' && (!Number.isInteger(value)||value>120))) fail('INVALID_FIELD','Captura un valor válido para '+key+'.');
        }
        if (exp.fields[key]===value) return;
        exp.fields[key]=value;
        if (!exp.fieldHistory[key]) exp.fieldHistory[key]=[];
        exp.fieldHistory[key].push({value:value,actorId:actor.id,actorRole:actor.role,at:ctx.now,source:isHolder?'holder':'assisted'});
      });
    }
    function saveOnboarding(expId,patch,revision) { return transact(revision,function(s,ctx){
      var exp=expFor(s,expId),contact=contactFor(s,exp);if(actor.role==='holder')holder(exp);else staff(ctx,contact.id);
      editable(exp,[]);if(exp.holderActions.finalConfirmation)fail('REVIEW_LOCK','La revisión final ya bloqueó los datos.');if(exp.status==='needs_correction')fail('CORRECTION_SCOPE','Usa la captura de correcciones para los campos observados.');
      var old=exp.onboarding||null,records=Object.assign({},old&&old.records||{},patch&&patch.records||{});
      var state=stateRecord(exp.kind,records),candidate=email(exp.kind==='doctor'?state.profile&&state.profile.email:state.contactEmail||state.patient&&state.patient.email||decodeRecord(records,'pulzzo_patient').email);
      if(candidate&&candidate!==email(contact.email)){
        if(contact.email||actor.role==='holder'||exp.holderIdentity||exp.activeInvitationId||contact.accountId||contact.holderId)fail('IDENTITY_LOCK','El correo ya vinculado no puede cambiarse desde el formulario.');
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)||candidate.length>254)fail('INVALID_EMAIL','Captura un correo válido del contacto.');
        var identity=store.inspectIdentity&&store.inspectIdentity({email:candidate,type:exp.kind});if(identity&&(identity.blocked||identity.requiresReconciliation||identity.matches&&identity.matches.length))fail('IDENTITY_RECONCILIATION','Este correo ya está registrado. Solicita conciliación sin crear otro titular.');
        contact.email=candidate;contact.updatedAt=ctx.now;ctx.append('audit',{action:'contact_updated',contactId:contact.id,changedFields:['email'],reason:'onboarding_first_email',demo:true});
      }
      validateOnboardingRecords(exp.kind,records,old&&old.records,exp,contact,actor);
      var prior=flattenOnboarding(old&&old.records||{}),next=flattenOnboarding(records),history=copy(old&&old.fieldHistory||{}),changed=[];
      Array.from(new Set(Object.keys(prior).concat(Object.keys(next)))).sort().forEach(function(path){if(equal(prior[path],next[path]))return;changed.push(path);if(!history[path])history[path]=[];history[path].push({value:next[path]===undefined?null:copy(next[path]),deleted:next[path]===undefined,actorId:actor.id,actorRole:actor.role,at:ctx.now,source:actor.role==='holder'?'holder':'assisted'});});
      if(old&&!changed.length)return exp;
      exp.onboarding={schema:ONBOARDING_SCHEMA,records:records,identityFileHistory:identityFileHistory(exp.kind,old,records),revision:(old&&old.revision||0)+1,fieldHistory:history,updatedAt:ctx.now,updatedBy:actor.id};
      var projected=onboardingProjection(exp,records);setFields(exp,projected.fields,ctx,actor.role==='holder');
      var previous=exp.documents||[],retained=previous.filter(function(d){return !d.onboardingPath;});
      exp.documents=retained.concat(projected.documents.map(function(d){var before=previous.find(function(x){return x.onboardingPath===d.onboardingPath;});if(before&&equal(Object.assign({},before,{uploadedBy:undefined,uploadedAt:undefined}),Object.assign({},d,{uploadedBy:undefined,uploadedAt:undefined})))return before;return Object.assign(d,{uploadedBy:d.evidenceActorId||actor.id,uploadedAt:d.evidenceUploadedAt||ctx.now});}));
      if(actor.role!=='holder'&&exp.assistingActors.indexOf(actor.id)<0)exp.assistingActors.push(actor.id);exp.updatedAt=ctx.now;record(ctx,'onboarding_fields_updated',exp,{fields:changed,form:exp.kind});return exp;
    }); }
    async function verifyOnboardingEvidence(expId,descriptor,revision){
      try{
        var first=getExpedient(expId);if(!first.ok)return first;var exp=first.value.expedient,expected=store.snapshot().revision;if(revision!==undefined&&revision!==expected)fail('STALE_REVISION','El expediente cambió antes de verificar el archivo.');
        var d=evidenceDescriptor(descriptor);if(!d||d.contactId!==exp.contactId)fail('INVALID_DOCUMENT','La evidencia no pertenece al expediente.');
        var evidence=typeof options.getEvidenceStore==='function'?options.getEvidenceStore():options.evidenceStore;if(!evidence||typeof evidence.get!=='function')fail('STORAGE_UNAVAILABLE','El almacén local de documentos no está disponible.');
        var actual=await evidence.get(d.evidenceId);if(!actual||actual.id!==d.evidenceId||actual.contactId!==d.contactId||actual.actorId!==d.actorId||actual.name!==d.name||actual.size!==d.size||actual.mimeType!==d.type||actual.uploadedAt!==d.uploadedAt||actual.documentType!==d.documentType||!actual.blob||actual.blob.size!==d.size||actual.blob.type!==d.type)fail('INVALID_DOCUMENT','El archivo local no coincide con los metadatos guardados.');
        var module=typeof globalThis!=='undefined'&&globalThis.PulzzoCRMEvidence;if(!module&&typeof require==='function')module=require('./crm-demo-evidence.js');if(!module||await module.validateBlob(actual.blob)!==d.type)fail('INVALID_DOCUMENT','No se pudo validar el contenido del archivo.');
        var last=getExpedient(expId);if(!last.ok)return last;if(store.snapshot().revision!==expected)fail('STALE_REVISION','El expediente cambió mientras se verificaba el archivo.');
        onboardingEvidenceProofs[exp.id+'|'+d.evidenceId]=copy(d);onboardingEvidenceRevisions[exp.id+'|'+d.evidenceId]={revision:expected,actorId:actor.id,descriptor:copy(d)};return {ok:true,value:actual,revision:expected};
      }catch(error){
        // A reopen validates persisted evidence without selecting a new file.
        // Keep the failure and evidence reference; explain which stored file
        // requires an honest reload instead of blaming a new selection.
        var message=error.message;
        if(error.code==='FILE_READ_FAILED'&&d)message='No se pudo leer el documento guardado «'+d.name+'» ('+d.documentType+'). Su referencia se conserva; vuelve a cargar ese documento ficticio.';
        return {ok:false,code:error.code||'INVALID_DOCUMENT',error:message,revision:currentRevision()};
      }
    }
    // A stable entry token locates the verification gateway; it is never a document credential.
    function entryValue(exp){return {token:exp.entryLink.token,url:'asistido-demo.html#entry='+encodeURIComponent(exp.entryLink.token),kind:exp.kind,status:exp.entryLink.status,expiresAt:null,expedientId:exp.id,contactId:exp.contactId};}
    function entryRecord(state,token){
      var exp=Object.values(state.expedients).find(function(e){return e.entryLink&&e.entryLink.token===token;});
      if(!exp)fail('ENTRY_INVALID','El enlace no está disponible en este navegador.');
      var c=state.contacts[exp.contactId];
      if(exp.entryLink.status!=='active'||exp.entryDisabled||c&&(c.deletedAt||c.stage==='not_interested'))fail('ENTRY_REVOKED','Este enlace fue desactivado. Solicita una renovación explícita a tu asesor.');
      return exp;
    }
    function issueEntry(expId,input,revision,renew){return transact(revision,function(s,ctx){
      input=input||{};var exp=expFor(s,expId),c=contactFor(s,exp);staff(ctx,c.id);
      if(c.stage==='not_interested')fail('ENTRY_DISABLED','Reactiva primero el contacto antes de renovar su enlace.');
      if(exp.entryLink&&!renew){if(exp.entryLink.status!=='active')fail('ENTRY_REVOKED','El enlace requiere renovación explícita.');return entryValue(exp);}
      var oldInv=exp.activeInvitationId&&s.invitations[exp.activeInvitationId];
      if(!exp.entryLink&&oldInv&&!input.migrateLegacy&&!renew)fail('LEGACY_MIGRATION_REQUIRED','La invitación anterior tenía vigencia. Confirma migrarla a un enlace estable nuevo.');
      if(!exp.entryLink&&oldInv&&oldInv.status==='revoked'&&!renew)fail('ENTRY_REVOKED','La invitación revocada requiere renovación explícita.');
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)||email(exp.fields.email)!==email(c.email))fail('INVALID_EMAIL','Guarda primero el correo del titular en su contacto y expediente.');
      if(oldInv&&oldInv.status==='pending'){oldInv.status='revoked';oldInv.revokedAt=ctx.now;}
      var token=ctx.id('entry');exp.entryLink={version:1,token:token,status:'active',createdAt:ctx.now,createdBy:actor.id,renewedFrom:exp.entryLink?exp.entryLink.token:null};
      if(!exp.holderIdentity){var inv={id:ctx.id('inv'),token:token,entryVersion:1,expedientId:exp.id,contactId:c.id,intendedEmail:email(c.email),status:'pending',createdAt:ctx.now,createdBy:actor.id,expiresAt:null,consumedAt:null,consumedBy:null,claimedBy:null};s.invitations[inv.id]=inv;exp.activeInvitationId=inv.id;exp.status='invited';}
      record(ctx,renew?'holder_entry_renewed':oldInv?'holder_entry_migrated':'holder_entry_created',exp);return entryValue(exp);
    });}
    function getOrCreateEntryLink(expId,input,revision){return issueEntry(expId,input,revision,false);}
    function renewEntryLink(expId,input,revision){return issueEntry(expId,input,revision,true);}
    function revokeEntryLink(expId,input,revision){return transact(revision,function(s,ctx){var exp=expFor(s,expId);staff(ctx,exp.contactId);if(!exp.entryLink)fail('ENTRY_INVALID','No hay un enlace estable.');if(exp.entryLink.status==='revoked')return entryValue(exp);exp.entryLink.status='revoked';exp.entryLink.revokedAt=ctx.now;exp.entryLink.reason=String(input&&input.reason||'manual').slice(0,300);record(ctx,'holder_entry_revoked',exp);return entryValue(exp);});}
    function recordEntryLinkCopy(expId,input,revision){return transact(revision,function(s,ctx){var exp=entryRecord(s,input&&input.token);if(exp.id!==expId)fail('ENTRY_INVALID','El enlace no corresponde al expediente.');staff(ctx,exp.contactId);record(ctx,'holder_entry_copied',exp);return entryValue(exp);});}
    function resolveEntryLink(token){return result(function(){var s=store.snapshot({entryToken:token}),exp=entryRecord(s,token);return {kind:exp.kind,existingLoginRequired:!!exp.holderIdentity,existingActorId:exp.holderIdentity&&exp.holderIdentity.id||null,expiresAt:null,demo:true};});}
    // The celular typed by the holder at registration becomes the CRM ficha phone (same contact, audited).
    function holderPhone(c,raw,ctx,exp){if(raw==null||String(raw).trim()==='')return;var value=store.normalizePhone?store.normalizePhone(raw):String(raw).replace(/\D/g,'');if(!/^\d{7,15}$/.test(value))fail('INVALID_PHONE','Captura un celular de 7 a 15 dígitos.');if(c.phone===value)return;var from=c.phone||null;c.phone=value;c.updatedAt=ctx.now;record(ctx,'holder_phone_saved',exp,{from:from?'registrado':'vacío',source:'registro_inicial_titular'});}
    // Buró NIP: the patient receives it personally and may forward it (e.g. WhatsApp) to the assigned KAM.
    // The KAM may type it; only a masked trace is stored. Acceptances and signature remain holder-only.
    function recordBureauNip(expId,input,revision){return transact(revision,function(s,ctx){var exp=expFor(s,expId);staff(ctx,exp.contactId);if(exp.kind!=='patient')fail('INVALID_ACTION','El NIP de Buró corresponde al paciente.');if(!exp.holderIdentity||!exp.initialRegistration)fail('INITIAL_REGISTRATION_REQUIRED','El paciente debe completar primero su registro inicial.');editable(exp,[]);var nip=String(input&&input.nip||'').trim();if(!/^\d{4,8}$/.test(nip))fail('INVALID_NIP','Captura el NIP de 4 a 8 dígitos que te envió el paciente.');exp.bureauNip={capturedBy:actor.id,actorRole:actor.role,at:ctx.now,channel:'whatsapp',masked:'••••'+nip.slice(-2),demo:true};exp.updatedAt=ctx.now;record(ctx,'bureau_nip_captured_by_kam',exp,{actorId:actor.id,actorRole:actor.role,capturedAt:ctx.now,channel:'whatsapp',label:'NIP capturado por KAM'});return exp;});}
    function openEntryLink(token,input,revision){
      var proof,out=transact(revision,function(s,ctx){var exp=entryRecord(s,token),c=contactFor(s,exp);if(actor.role!=='holder')fail('HOLDER_REQUIRED','Solo el titular puede verificar este acceso.');
        if(email(input.email)!==email(c.email))fail('WRONG_IDENTITY','El correo no corresponde al titular.');proof=consumeProof(input.proofToken,input.email,'entry',token);
        if(exp.holderIdentity){holder(exp);if(proof.mode!=='existing_login')fail('EXISTING_LOGIN_REQUIRED','Verifica la cuenta demo existente.');return exp;}
        var inv=s.invitations[exp.activeInvitationId];if(!inv||inv.entryVersion!==1||inv.token!==token||inv.status!=='pending')fail('ENTRY_REVOKED','La invitación inicial ya no está vigente.');
        var existing=knownIdentity(s,c.email,exp.kind);if(existing&&(proof.mode!=='existing_login'||existing!==actor.id))fail('EXISTING_LOGIN_REQUIRED','Verifica la cuenta demo existente.');
        inv.status='consumed';inv.consumedAt=ctx.now;inv.consumedBy=actor.id;inv.claimedBy=actor.id;exp.holderIdentity={id:actor.id,email:c.email,verifiedAt:proof.verifiedAt,demo:true};exp.status='claimed';exp.updatedAt=ctx.now;c.holderId=actor.id;c.accountId=actor.id;c.accountExists=true;c.updatedAt=ctx.now;holderPhone(c,input&&input.phone,ctx,exp);record(ctx,'holder_claimed',exp,{invitationId:inv.id,identityVerification:'local_demo'});return exp;
      });if(out.ok&&proof)proof.used=true;return out;
    }
    function invitation(state,token) {
      var inv=Object.values(state.invitations).find(function (i) { return i.token===token; });
      if (!inv) fail('INVITE_INVALID','El enlace no existe o fue reemplazado.');
      if (inv.status!=='pending' || inv.consumedAt) fail('INVITE_USED','El enlace ya fue utilizado o revocado. Inicia una sesión demo para continuar.');
      if (Date.parse(inv.expiresAt)<=Date.parse(now())) fail('INVITE_EXPIRED','El enlace venció. Solicita una nueva invitación.');
      var exp=expFor(state,inv.expedientId);
      if (exp.activeInvitationId!==inv.id || exp.holderIdentity) fail('INVITE_STALE','Esta invitación dejó de estar vigente.');
      return inv;
    }
    function knownIdentity(state,mail,kind) {
      var inspected=store.inspectIdentity?store.inspectIdentity({email:mail,type:kind}):null;if(inspected&&inspected.requiresReconciliation)fail('IDENTITY_RECONCILIATION','Ya existe una identidad que requiere conciliación. No se creará otra cuenta ni se abrirán expedientes existentes.');
      var contacts=Object.values(state.contacts).filter(function(c){return !c.deletedAt && c.type===kind && email(c.email)===mail;});
      var found=contacts.find(function(c){return c.accountId || c.holderId || c.accountExists;});
      return found ? (found.accountId || found.holderId || 'existing-account-unresolved') : (inspected&&inspected.existingAccountId)||null;
    }
    function consumeProof(proofToken, mail, purpose, token) {
      var proof=proofs[proofToken];
      if (!proof || proof.used || proof.actorId!==actor.id || proof.email!==email(mail) || proof.purpose!==purpose || proof.token!==(token || null) || Date.parse(proof.expiresAt)<=Date.parse(now())) fail('IDENTITY_REQUIRED','Verifica la identidad demo con un código vigente antes de continuar.');
      return proof;
    }
    function getInvitationInfo(token) { return result(function(){var s=store.snapshot({invitationToken:token}),inv=invitation(s,token),exp=expFor(s,inv.expedientId),known=knownIdentity(s,inv.intendedEmail,exp.kind);return {kind:exp.kind,expiresAt:inv.expiresAt,existingLoginRequired:!!known,existingActorId:known,demo:true};}); }
    function requestDemoVerification(input) {
      return result(function(){
        input=input || {}; if(actor.role!=='holder')fail('HOLDER_REQUIRED','La verificación demo corresponde al titular.'); var s=store.snapshot(input.entryToken?{entryToken:input.entryToken}:input.token?{invitationToken:input.token}:undefined),mail=email(input.email),kind=input.kind || 'patient',purpose=input.entryToken?'entry':input.token?'invite':'self',existing;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) fail('INVALID_EMAIL','Captura un correo válido.');
        if(input.entryToken){var entry=entryRecord(s,input.entryToken);kind=entry.kind;var intended=entry.entryEmail||(s.contacts[entry.contactId]||{}).email;if(mail!==intended)fail('WRONG_IDENTITY','Este correo no corresponde al titular del enlace.');}
        if (input.token) { var inv=invitation(s,input.token); kind=expFor(s,inv.expedientId).kind; if (mail!==inv.intendedEmail) fail('WRONG_IDENTITY','Este correo no corresponde al destinatario de la invitación.'); }
        if (kind!=='patient' && kind!=='doctor') fail('INVALID_KIND','Tipo de registro inválido.');
        var phoneDigits=input.phone==null||String(input.phone).trim()===''?'':(store.normalizePhone?store.normalizePhone(input.phone):String(input.phone).replace(/\D/g,''));
        if(purpose==='self'&&input.mode!=='existing_login'){
          if(phoneDigits&&!/^\d{7,15}$/.test(phoneDigits))fail('INVALID_PHONE','Captura un celular de 7 a 15 dígitos.');
          var dup=selfDuplicate(mail,phoneDigits,kind),advisor=null;
          if(dup==='EXISTING_ACCOUNT_EMAIL'||dup==='EXISTING_ACCOUNT_PHONE'){noteDuplicate(mail,phoneDigits,kind);fail(dup,DUPLICATE_MESSAGES[dup]);}
          if(dup==='CROSS_TYPE_EMAIL'||dup==='CROSS_TYPE_PHONE'){var ct=store.crossTypeEligibility({email:mail,phone:phoneDigits,type:kind});noteDuplicate(mail,phoneDigits,kind,true);fail(dup,crossMessage(ct.matchedBy,ct.otherType));}
          if(dup==='KAM_CONTACT'){advisor=store.advisorFor?store.advisorFor({email:mail,phone:phoneDigits,type:kind}):null;existing=null;}
          else if(dup==='CROSS_ENABLED')existing=null;
          else{try{existing=knownIdentity(s,mail,kind);}catch(e){if(e.code==='IDENTITY_RECONCILIATION'){noteDuplicate(mail,'',kind);fail('IDENTITY_RECONCILIATION',DUPLICATE_MESSAGES.IDENTITY_RECONCILIATION);}throw e;}}
        } else existing=knownIdentity(s,mail,kind);
        if (existing && (input.mode!=='existing_login' || actor.id!==existing)) fail('EXISTING_LOGIN_REQUIRED','Ya tienes una cuenta con este correo. Inicia sesión para continuar.');
        if (!existing && input.mode==='existing_login') fail('ACCOUNT_NOT_FOUND','No hay una cuenta demo existente con ese correo.');
        var challengeId=randomId('challenge'),code=String(Math.floor(100000 + Math.random()*900000));
        challenges[challengeId]={actorId:actor.id,email:mail,purpose:purpose,token:input.entryToken || input.token || null,mode:existing?'existing_login':'new_account',code:code,expiresAt:new Date(Date.parse(now())+10*60000).toISOString(),attempts:0};
        var outChallenge={challengeId:challengeId,demoCode:code,expiresAt:challenges[challengeId].expiresAt,demo:true,notice:'Simulación local: no se envió correo y este código no acredita identidad real.'};if(typeof advisor!=='undefined'&&advisor){outChallenge.continuesKamContact=true;outChallenge.advisorName=advisor.kamName||null;outChallenge.advisorMessage=advisor.kamName?'Te está atendiendo '+advisor.kamName+', tu asesor(a) PULZZO':'Te está atendiendo tu asesor(a) PULZZO';}return outChallenge;
      });
    }
    function verifyDemoCode(challengeId,code) {
      return result(function(){var c=challenges[challengeId]; if(!c || c.actorId!==actor.id || c.used || c.attempts>=5 || Date.parse(c.expiresAt)<=Date.parse(now())) fail('CODE_EXPIRED','El código demo venció o ya se usó.'); c.attempts++; if(String(code)!==c.code) fail('CODE_INVALID','El código demo no coincide.'); c.used=true; var p=randomId('proof'); proofs[p]=Object.assign({},c,{used:false,verifiedAt:now()}); return {proofToken:p,email:c.email,mode:c.mode,demo:true};});
    }
    function beginDraft(input,revision) { return transact(revision,function(s,ctx){var c=s.contacts[input.contactId];if(!c || c.deletedAt)fail('NOT_FOUND','No existe el contacto.');staff(ctx,c.id);var existing=Object.values(s.expedients).find(function(e){return e.contactId===c.id;});if(existing) return existing;var kind=input.kind || c.type;if(kind!==c.type || ['patient','doctor'].indexOf(kind)<0)fail('INVALID_KIND','El tipo no coincide con el contacto.');var exp=baseExp(ctx,c,kind,null);s.expedients[exp.id]=exp;advanceStage(ctx,c,kind==='doctor'?'registration_started':'application_started');record(ctx,'assisted_draft_created',exp);return exp;}); }
    function editDraft(expId,patch,revision) { return transact(revision,function(s,ctx){var exp=expFor(s,expId),c=contactFor(s,exp);if(actor.role==='holder')holder(exp);else staff(ctx,c.id);patch=patch || {};var keys=Object.keys(patch.fields || {});editable(exp,keys);if(exp.holderActions.finalConfirmation)fail('REVIEW_LOCK','Ya confirmaste la revisión final. No pueden cambiarse los datos antes del envío.');if(exp.holderIdentity && patch.fields && Object.prototype.hasOwnProperty.call(patch.fields,'email') && email(patch.fields.email)!==exp.holderIdentity.email)fail('IDENTITY_LOCK','El correo verificado no puede cambiarse en este expediente.');if(patch.fields && Object.prototype.hasOwnProperty.call(patch.fields,'email') && email(patch.fields.email)!==email(c.email))fail('IDENTITY_LOCK','El correo debe coincidir con el contacto y la invitación.');setFields(exp,patch.fields || {},ctx,actor.role==='holder');if(exp.onboarding&&(keys.length||patch.documents&&patch.documents.length))fail('ONBOARDING_REQUIRED','Edita el formulario completo para mantener un solo expediente.');if(patch.documents){if(exp.status==='needs_correction' && (exp.correctionFields || []).indexOf('documents')<0)fail('CORRECTION_SCOPE','Los documentos no están habilitados para corrección.');if(!Array.isArray(patch.documents) || patch.documents.length>12)fail('INVALID_DOCUMENT','Documentos inválidos.');patch.documents.forEach(function(d){if(exp.kind==='patient'&&d&&(isHolderIdentityType(d.documentType)||isHolderIdentityType(d.label))&&actor.role!=='holder')fail('HOLDER_UPLOAD_REQUIRED','La INE y selfie deben ser cargadas personalmente por el cliente.');if(!d || d.demo!==true || !['identity','income','license','clinic','other'].includes(d.label) || !/^[^\/\\]{1,120}$/.test(d.fileName || ''))fail('DEMO_DOCUMENT_ONLY','Solo se admiten metadatos de documentos DEMO. No cargues archivos reales.');if(d.evidenceId && (!/^[a-zA-Z0-9_-]{1,180}$/.test(d.evidenceId)||!['application/pdf','image/png','image/jpeg','image/webp'].includes(d.mimeType)||!Number.isInteger(d.size)||d.size<=0||d.size>5242880||d.actorId&&d.actorId!==actor.id))fail('INVALID_DOCUMENT','La evidencia demo tiene metadatos inválidos.');var personal=exp.kind==='patient'&&(isHolderIdentityType(d.label)||isHolderIdentityType(d.documentType)),proof=personal&&d.evidenceId?assertHolderDocumentUpload(exp,d,actor):null;exp.documents.push(Object.assign({id:ctx.id('doc'),label:d.label,fileName:d.fileName,demo:true,evidenceId:d.evidenceId||null,mimeType:d.mimeType||null,size:d.size||0,uploadedBy:actor.id,uploadedAt:d.uploadedAt||ctx.now},proof?{documentType:proof.documentType,evidenceActorId:proof.actorId,evidenceUploadedAt:proof.uploadedAt}:{}));});}if(actor.role!=='holder' && exp.assistingActors.indexOf(actor.id)<0)exp.assistingActors.push(actor.id);exp.updatedAt=ctx.now;record(ctx,'assisted_fields_updated',exp,{fields:keys,documentsAdded:(patch.documents || []).length});return exp;}); }
    function invite(expId,input,revision) { return transact(revision,function(s,ctx){var exp=expFor(s,expId),c=contactFor(s,exp);staff(ctx,c.id);editable(exp,[]);if(exp.holderIdentity)fail('ALREADY_CLAIMED','El titular ya tomó este expediente.');var mail=email(input.email || c.email);if(mail!==email(c.email) || mail!==email(exp.fields.email))fail('WRONG_IDENTITY','La invitación debe usar el correo del contacto.');var ttl=Number(input.ttlMinutes || 60);if(!Number.isFinite(ttl)||ttl<1||ttl>1440)fail('INVALID_EXPIRY','Vigencia válida: de 1 minuto a 24 horas.');Object.values(s.invitations).forEach(function(i){if(i.expedientId===exp.id&&i.status==='pending'){i.status='revoked';i.revokedAt=ctx.now;}});var inv={id:ctx.id('inv'),token:ctx.id('token'),expedientId:exp.id,contactId:c.id,intendedEmail:mail,status:'pending',createdAt:ctx.now,createdBy:actor.id,expiresAt:new Date(Date.parse(ctx.now)+ttl*60000).toISOString(),consumedAt:null,consumedBy:null,claimedBy:null};s.invitations[inv.id]=inv;exp.activeInvitationId=inv.id;exp.status='invited';exp.updatedAt=ctx.now;record(ctx,'holder_invitation_created',exp,{invitationId:inv.id,expiresAt:inv.expiresAt});return inv;}); }
    // Call only after the exact invitation URL was successfully copied. The caller
    // keeps the pre-copy revision; this local record proves no sending or opening.
    function recordInvitationCopy(expId,input,revision) { return transact(revision,function(s,ctx){
      var exp=expFor(s,expId),c=contactFor(s,exp);staff(ctx,c.id);input=input||{};
      if(input.contactId!==c.id||typeof input.invitationId!=='string'||!input.invitationId)fail('INVITE_MISMATCH','El enlace debe corresponder a este contacto y expediente.');
      var inv=s.invitations[input.invitationId];
      if(!inv||inv.expedientId!==exp.id||inv.contactId!==c.id)fail('INVITE_MISMATCH','El enlace debe corresponder a este contacto y expediente.');
      if(inv.status!=='pending'||inv.consumedAt||inv.consumedBy||inv.claimedBy||inv.revokedAt)fail('INVITE_USED','El enlace ya fue utilizado o revocado.');
      if(exp.activeInvitationId!==inv.id||exp.holderIdentity||exp.status!=='invited')fail('INVITE_STALE','Esta invitación dejó de estar vigente.');
      if(!Number.isFinite(Date.parse(inv.expiresAt))||Date.parse(inv.expiresAt)<=Date.parse(ctx.now))fail('INVITE_EXPIRED','El enlace venció. Genera una nueva invitación.');
      if(inv.intendedEmail!==email(c.email)||inv.intendedEmail!==email(exp.fields.email))fail('WRONG_IDENTITY','La invitación no coincide con la identidad del expediente.');
      editable(exp,[]);
      var event={type:'holder_invitation_copied',contactId:c.id,expedientId:exp.id,invitationId:inv.id,generatedBy:inv.createdBy,demo:true};
      var entry=ctx.append('audit',event);ctx.append('events',event);return entry;
    }); }
    function accessLinkContext(s,ctx,expId,input){
      var exp=expFor(s,expId),c=contactFor(s,exp);staff(ctx,c.id);
      if(!input||input.contactId!==c.id)fail('LINK_MISMATCH','El acceso debe corresponder a este contacto y expediente.');
      if(!exp.holderIdentity||exp.holderIdentity.id!==c.holderId||exp.holderIdentity.id!==c.accountId||!c.accountExists||exp.holderIdentity.email!==email(c.email)||!['claimed','submitted','needs_correction'].includes(exp.status))fail('HOLDER_REQUIRED','El acceso personal requiere una cuenta ya vinculada al expediente.');
      return exp;
    }
    // These are local follow-up records for a non-bearer, exact-record login URL.
    // The URL grants no access: the gateway must still verify the exact holder.
    function recordAccessLinkIssued(expId,input,revision){return transact(revision,function(s,ctx){
      var exp=accessLinkContext(s,ctx,expId,input),event={type:'holder_access_link_issued',contactId:exp.contactId,expedientId:exp.id,generatedBy:actor.id,demo:true};
      var entry=ctx.append('audit',event);ctx.append('events',event);return entry;
    });}
    function recordAccessLinkCopy(expId,input,revision){return transact(revision,function(s,ctx){
      var exp=accessLinkContext(s,ctx,expId,input),issued=s.audit[input.issuedAuditId];
      if(!issued||issued.type!=='holder_access_link_issued'||issued.contactId!==exp.contactId||issued.expedientId!==exp.id||issued.generatedBy!==issued.actorId)fail('LINK_MISMATCH','La copia debe conservar la referencia al acceso generado para este expediente.');
      var event={type:'holder_access_link_copied',contactId:exp.contactId,expedientId:exp.id,issuedAuditId:issued.id,generatedBy:issued.generatedBy,demo:true};
      var entry=ctx.append('audit',event);ctx.append('events',event);return entry;
    });}
    function claim(token,input,revision) {
      var proof;
      var out=transact(revision,function(s,ctx){if(actor.role!=='holder')fail('HOLDER_REQUIRED','La invitación solo puede abrirla el titular.');var inv=invitation(s,token),exp=expFor(s,inv.expedientId),c=contactFor(s,exp);if(email(input.email)!==inv.intendedEmail)fail('WRONG_IDENTITY','El correo no corresponde al destinatario.');proof=consumeProof(input.proofToken,input.email,'invite',token);var existing=knownIdentity(s,inv.intendedEmail,exp.kind);if(existing && (proof.mode!=='existing_login' || existing!==actor.id))fail('EXISTING_LOGIN_REQUIRED','Debes conectar la cuenta demo existente.');inv.status='consumed';inv.consumedAt=ctx.now;inv.consumedBy=actor.id;inv.claimedBy=actor.id;exp.holderIdentity={id:actor.id,email:inv.intendedEmail,verifiedAt:proof.verifiedAt,demo:true};exp.status='claimed';exp.updatedAt=ctx.now;c.holderId=actor.id;c.accountId=actor.id;c.accountExists=true;c.updatedAt=ctx.now;holderPhone(c,input&&input.phone,ctx,exp);record(ctx,'holder_claimed',exp,{invitationId:inv.id,identityVerification:'local_demo'});return exp;});
      if(out.ok && proof)proof.used=true;return out;
    }
    // v36: one follow-up task for the responsable of every new self-service registration (organic or referral).
    function registrationTask(ctx,s,c){var due=new Date(Date.parse(ctx.now)+24*3600000).toISOString(),title=('Contactar a '+(c.name||'nuevo cliente')+' · nuevo registro'+(c.assignedKam?'':' · Falta asignar responsable')).slice(0,300);
      var task={id:ctx.id('task'),contactId:c.id,kind:'registration_followup',title:title,dueAt:due,status:'open',closeReason:null,createdAt:ctx.now,createdBy:actor.id,updatedAt:ctx.now,closedAt:null,closedBy:null,demo:true};
      s.tasks[task.id]=task;ctx.append('audit',{action:'task_created',contactId:c.id,taskId:task.id,reason:'registration_followup'});return task;}
    // v36: plain-Spanish duplicate answers, checked BEFORE the code; the existing contact's responsable gets one alert.
    var DUPLICATE_MESSAGES={EXISTING_ACCOUNT_EMAIL:'Este correo ya está registrado. Inicia sesión aquí',EXISTING_ACCOUNT_PHONE:'Este celular ya está registrado. Inicia sesión aquí',IDENTITY_RECONCILIATION:'Este correo ya está registrado con otro tipo de cuenta (paciente o médico). Inicia sesión con esa cuenta o escríbenos para revisarlo.'};
    // v36c: same email/phone already registered in the other type → the advisor enables it from the CRM ficha.
    function crossMessage(by,other){var field=by==='email'?'Este correo':'Este celular';return other==='doctor'?field+' ya está registrado como doctor. Si quieres pedir un crédito como paciente, tu asesor te ayuda.':field+' ya está registrado como paciente. Si quieres registrarte como doctor o clínica, tu asesor te ayuda.';}
    function noteDuplicate(mail,phone,kind,cross){try{if(store.noteDuplicateRegistration)store.noteDuplicateRegistration({email:mail,phone:phone,type:kind,crossType:!!cross},store.snapshot().revision);}catch(ignore){}}
    // Returns null (new), 'KAM_CONTACT' (KAM-created contact without account: continue it), or a blocking code.
    function selfDuplicate(mail,phone,kind){
      if(!store.inspectIdentity)return null;
      var same=function(m){return m.type===kind;},crm=function(m){return m.source==='pulzzo_crm_assisted_demo_v1'&&!m.accountId;},byMail=(store.inspectIdentity({email:mail,type:kind}).matches||[]).filter(same),byPhone=phone?(store.inspectIdentity({phone:phone,type:kind}).matches||[]).filter(same):[];
      if(byMail.some(function(m){return m.accountId;}))return 'EXISTING_ACCOUNT_EMAIL';
      if(byPhone.some(function(m){return m.accountId;}))return 'EXISTING_ACCOUNT_PHONE';
      if(byMail.length||byPhone.length)return byMail.concat(byPhone).every(crm)?'KAM_CONTACT':'EXISTING_ACCOUNT_'+(byMail.length?'EMAIL':'PHONE');
      var cross=store.crossTypeEligibility?store.crossTypeEligibility({email:mail,phone:phone,type:kind}):{match:false};
      if(cross.match&&!cross.allowed)return cross.matchedBy==='email'?'CROSS_TYPE_EMAIL':'CROSS_TYPE_PHONE';
      if(cross.match)return 'CROSS_ENABLED';
      return null;
    }
    function createSelfService(input,revision) {
      var proof;
      var out=transact(revision,function(s,ctx){if(actor.role!=='holder')fail('HOLDER_REQUIRED','El registro independiente corresponde al titular.');var mail=email(input.email),kind=input.kind || 'patient';proof=consumeProof(input.proofToken,mail,'self',null);
        var phoneDigits=input.phone==null?'':(store.normalizePhone?store.normalizePhone(input.phone):String(input.phone).replace(/\D/g,''));
        var identity={id:actor.id,email:mail,verifiedAt:proof.verifiedAt,demo:true};
        // v36c: KAM-created contact without account, same type, same email or phone → the client continues that SAME expediente now.
        var kamContact=Object.values(s.contacts).find(function(c){return !c.deletedAt&&c.type===kind&&!c.holderId&&!c.accountId&&!c.accountExists&&email(c.email)===mail;})||Object.values(s.contacts).find(function(c){return !c.deletedAt&&c.type===kind&&!c.holderId&&!c.accountId&&!c.accountExists&&phoneDigits&&c.phone===phoneDigits;});
        if(kamContact)return claimKamContact(s,ctx,kamContact,mail,phoneDigits,identity,kind);
        var duplicate=Object.values(s.contacts).find(function(c){return !c.deletedAt&&c.type===kind&&email(c.email)===mail;});if(duplicate)fail('EXISTING_ACCOUNT_EMAIL',DUPLICATE_MESSAGES.EXISTING_ACCOUNT_EMAIL);
        // v36c: a revoked link (or one of an inactive KAM) does not stop the registration; routing follows the CRM rule.
        var ref=input.referralToken&&store.referralStatus?store.referralStatus(input.referralToken,kind):null,token=input.referralToken||undefined;
        if(ref&&(ref.status==='revoked'||ref.status==='kam_inactive'))token=undefined;
        var cross=store.crossTypeEligibility?store.crossTypeEligibility({email:mail,phone:phoneDigits,type:kind}):{match:false};
        if(cross.match&&!cross.allowed)fail(cross.matchedBy==='email'?'CROSS_TYPE_EMAIL':'CROSS_TYPE_PHONE',crossMessage(cross.matchedBy,cross.otherType));
        var c=ctx.makeContact({type:kind,name:input.name,email:mail,phone:input.phone,originalSource:'organic',referralToken:token,crossTypeLink:cross.match&&cross.allowed});c.holderId=actor.id;c.accountId=actor.id;c.accountExists=true;s.contacts[c.id]=c;var exp=baseExp(ctx,c,kind,identity);s.expedients[exp.id]=exp;advanceStage(ctx,c,kind==='doctor'?'registration_started':'application_started');record(ctx,'self_service_created',exp,{identityVerification:'local_demo'});
        if(token===undefined&&ref&&ref.status!=='invalid'&&ref.status!=='active')record(ctx,'revoked_referral_used',exp,{referralId:ref.referralId,referralKamId:ref.kamId,referralState:ref.status,note:'Llegó por el enlace '+(ref.status==='revoked'?'revocado':'de un KAM inactivo')+'; el responsable se asignó con la regla CRM.'});
        if(c.linkedContactIds)record(ctx,'cross_type_linked',exp,{linkedContactIds:c.linkedContactIds.slice()});
        registrationTask(ctx,s,c);return exp;});if(out.ok&&proof)proof.used=true;return out;
    }
    function claimKamContact(s,ctx,c,mail,phoneDigits,identity,kind){
      if(Object.values(s.expedients).some(function(e){return e.contactId===c.id&&e.holderIdentity;}))fail('EXISTING_ACCOUNT_EMAIL',DUPLICATE_MESSAGES.EXISTING_ACCOUNT_EMAIL);
      ctx.markSelfClaim(c.id);
      c.holderId=actor.id;c.accountId=actor.id;c.accountExists=true;c.updatedAt=ctx.now;
      if(c.email!==mail){c.emailHistory=(c.emailHistory||[]).concat([{email:c.email,label:'correo capturado por KAM',replacedAt:ctx.now,replacedBy:actor.id}]);c.email=mail;}
      if(phoneDigits&&c.phone!==phoneDigits){c.phoneHistory=(c.phoneHistory||[]).concat([{phone:c.phone,label:'celular capturado por KAM',replacedAt:ctx.now,replacedBy:actor.id}]);c.phone=phoneDigits;}
      ctx.append('audit',{action:'kam_contact_self_claimed',contactId:c.id,kamId:c.assignedKam||null,demo:true});
      var exp=Object.values(s.expedients).find(function(e){return e.contactId===c.id;});
      if(exp){exp.holderIdentity=identity;if(exp.status==='draft'||exp.status==='invited')exp.status='claimed';setFields(exp,{email:mail,phone:c.phone},ctx,true);exp.updatedAt=ctx.now;}
      else{exp=baseExp(ctx,c,kind,identity);s.expedients[exp.id]=exp;}
      advanceStage(ctx,c,kind==='doctor'?'registration_started':'application_started');
      ctx.append('events',{type:'kam_contact_self_claimed',contactId:c.id,expedientId:exp.id,demo:true});
      var task={id:ctx.id('task'),contactId:c.id,kind:'client_entered',title:((c.name||'Tu cliente')+' entró a su registro · continúa con su solicitud').slice(0,300),dueAt:new Date(Date.parse(ctx.now)+24*3600000).toISOString(),status:'open',closeReason:null,createdAt:ctx.now,createdBy:actor.id,updatedAt:ctx.now,closedAt:null,closedBy:null,demo:true};
      s.tasks[task.id]=task;ctx.append('audit',{action:'task_created',contactId:c.id,taskId:task.id,reason:'client_entered'});
      return exp;
    }
    function completeInitialRegistration(expId,revision){return transact(revision,function(s,ctx){
      var exp=expFor(s,expId);holder(exp);var state=fullState(exp),contact=contactFor(s,exp);
      if(exp.initialRegistration)return exp;
      var names=state.identity&&state.identity.nameParts||{},p=state.profile||{};
      if(!contact.email||!contact.phone||(exp.kind==='doctor'?(!p.name||p.email!==contact.email||!['doctor','clinica'].includes(p.accountType)||!p.state||!p.city||!state.specialties?.length):(!names.first||!names.paternal)))fail('INITIAL_REGISTRATION_INCOMPLETE','Completa los datos iniciales del formulario del titular.');
      var typed=String(exp.kind==='doctor'?p.name:[names.first,names.second,names.paternal,names.maternal].filter(Boolean).join(' ')).replace(/\s+/g,' ').trim().slice(0,160);
      if(typed&&typed!==contact.name){var prev=contact.name||'';contact.nameHistory=(contact.nameHistory||[]).concat([{name:prev,label:'nombre capturado por KAM',replacedAt:ctx.now,replacedBy:actor.id}]);contact.name=typed;contact.updatedAt=ctx.now;record(ctx,'holder_name_saved',exp,{previousName:prev,label:'nombre capturado por KAM',source:'registro_inicial_titular'});}
      exp.initialRegistration={actorId:actor.id,actorRole:'holder',at:ctx.now,demo:true};record(ctx,'initial_registration_completed',exp);return exp;
    });}
    function holderAction(expId,action,input,revision) { return transact(revision,function(s,ctx){var exp=expFor(s,expId);holder(exp);input=input || {};if(!['otp','buroConsent','legalConsent','offerAcceptance','contractSignature','finalConfirmation'].includes(action))fail('INVALID_ACTION','Confirmación desconocida.');if((exp.status==='submitted'||exp.status==='approved') && !['offerAcceptance','contractSignature'].includes(action))fail('SUBMITTED_LOCK','Las confirmaciones del envío están bloqueadas.');if(input.confirmed!==true || input.demo!==true)fail('CONFIRMATION_REQUIRED','Debes confirmar personalmente esta simulación.');if(action==='legalConsent'&&(!exp.onboarding||typeof input.termsVersion!=='string'||!input.termsVersion||input.termsVersion.length>80||typeof input.privacyVersion!=='string'||!input.privacyVersion||input.privacyVersion.length>80))fail('LEGAL_VERSION_REQUIRED','Revisa las versiones de términos y privacidad de esta demo.');if(action==='buroConsent'&&exp.kind!=='patient')fail('INVALID_ACTION','Esta confirmación corresponde al paciente.');var currentOffer=null;if(['offerAcceptance','contractSignature'].includes(action)){if(exp.kind!=='patient'||!exp.submissionSnapshot||!options.readOffer)fail('NO_OFFER','Aún no hay una oferta disponible.');currentOffer=options.readOffer(copy(exp));if(!currentOffer||!currentOffer.offer||!currentOffer.offerFingerprint||!exp.receivedOffer||currentOffer.offerFingerprint!==exp.receivedOffer.offerFingerprint||quoteTerms(currentOffer.offer)!==quoteTerms(exp.receivedOffer.offer))fail('OFFER_CHANGED','Recibe y revisa la oferta vigente antes de confirmar.');if(action==='offerAcceptance'&&currentOffer.expiryStatus&&!['active','accepted'].includes(currentOffer.expiryStatus))fail('OFFER_EXPIRED','La oferta está vencida o no tiene una vigencia válida. Solicita una revisión en backoffice.');if(action==='contractSignature'&&(!currentOffer.contractReady||!exp.holderActions.offerAcceptance||exp.holderActions.offerAcceptance.offerFingerprint!==currentOffer.offerFingerprint))fail('NO_CONTRACT','No hay contrato habilitado para la oferta aceptada.');}if(action==='finalConfirmation'){assertOnboardingEvidence(exp,s.revision,actor);var incomplete=missing(exp).filter(function(k){return k!=='holder:finalConfirmation';});if(incomplete.length)fail('INCOMPLETE','Completa antes de confirmar: '+incomplete.join(', '));}if(action==='finalConfirmation'&&exp.kind==='doctor'&&!((input.capacity==='holder'||input.capacity==='authorized_representative')&&input.authorityConfirmed===true))fail('AUTHORITY_REQUIRED','Debe confirmar el titular o un representante con facultades verificadas.');if(action==='contractSignature')exp.contractReadiness={offerFingerprint:currentOffer.offerFingerprint,contractReady:true,checkedAt:ctx.now};if(exp.holderActions[action])fail('ACTION_REPLAY','Esta confirmación ya fue registrada.');exp.holderActions[action]={actorId:actor.id,actorRole:'holder',at:ctx.now,demo:true,confirmed:true,capacity:input.capacity || 'holder',authorityConfirmed:!!input.authorityConfirmed,version:input.version || 'demo-v1',termsVersion:action==='legalConsent'?input.termsVersion:null,privacyVersion:action==='legalConsent'?input.privacyVersion:null,offerFingerprint:currentOffer?currentOffer.offerFingerprint:null};record(ctx,'holder_'+action,exp);return exp;}); }
    function missing(exp) { if(exp.onboarding){var full=onboardingMissing(exp);if(!exp.holderActions.otp)full.push('holder:otp');if(exp.kind==='patient'&&!exp.holderActions.buroConsent)full.push('holder:buroConsent');if(!exp.holderActions.legalConsent)full.push('holder:legalConsent');if(!exp.holderActions.finalConfirmation)full.push('holder:finalConfirmation');return full;} var items=REQUIRED[exp.kind].filter(function(k){return exp.fields[k]==null || String(exp.fields[k]).trim()==='';});var doc=exp.kind==='doctor'?'license':'identity';if(!exp.documents.some(function(d){return d.label===doc&&d.demo&&d.evidenceId&&(exp.kind!=='patient'||exp.holderIdentity&&d.uploadedBy===exp.holderIdentity.id);}))items.push('document:'+doc);if(!exp.holderActions.otp)items.push('holder:otp');if(exp.kind==='patient'&&!exp.holderActions.buroConsent)items.push('holder:buroConsent');if(!exp.holderActions.finalConfirmation)items.push('holder:finalConfirmation');return items; }
    function getExpedient(expId) { return result(function(){var s=store.snapshot(),exp=expFor(s,expId),c=contactFor(s,exp);if(actor.role==='holder')holder(exp);else if(!['admin','leader'].includes(actor.role) && (actor.role!=='kam'||c.assignedKam!==actor.id))fail('FORBIDDEN','No tienes acceso a este expediente.');var currentOffer=null;try{if(options.readOffer&&exp.submittedAt)currentOffer=options.readOffer(copy(exp));}catch(ignore){}return {expedient:copy(exp),missing:missing(exp),currentOffer:currentOffer};}); }
    function submit(expId,revision) { return transact(revision,function(s,ctx){var exp=expFor(s,expId),c=contactFor(s,exp);holder(exp);editable(exp,[]);assertOnboardingEvidence(exp,s.revision,actor);var absent=missing(exp);if(absent.length)fail('INCOMPLETE','Falta completar: '+absent.join(', '));if(email(exp.fields.email)!==exp.holderIdentity.email)fail('WRONG_IDENTITY','El correo no coincide con la identidad verificada.');exp.status='submitted';exp.submittedAt=ctx.now;exp.submissionRevision=Number(revision)+1;exp.updatedAt=ctx.now;exp.submissionSnapshot={schema:'pulzzo.crm.submission.v1',submissionId:'submission_'+exp.id,contactId:c.id,expedientId:exp.id,accountId:exp.holderIdentity.id,kind:exp.kind,type:exp.kind,fields:copy(exp.fields),documents:copy(exp.documents),onboarding:exp.onboarding?copy(exp.onboarding):null,holderIdentity:copy(exp.holderIdentity),holderActions:copy(exp.holderActions),holderConfirmation:copy(exp.holderActions.finalConfirmation),provenance:{originalSource:c.originalSource,referringKam:c.referringKam,assignedKam:c.assignedKam,assistingActors:copy(exp.assistingActors),fieldHistory:copy(exp.fieldHistory)},submittedAt:ctx.now,revision:exp.submissionRevision,demo:true};advanceStage(ctx,c,'submitted');record(ctx,'holder_submitted',exp,{submissionId:exp.submissionSnapshot.submissionId});return exp;}); }
    function correctionRequestId(review){return review&&(review.requestId||review.request&&review.request.requestId);}
    function liveReview(exp){if(!options.readReview)fail('NO_CORRECTION','La revisión de correcciones no está disponible.');var review=options.readReview(copy(exp));if(!review||review.expedientId!==exp.id||review.contactId!==exp.contactId||review.accountId!==exp.holderIdentity.id)fail('NO_CORRECTION','No hay observaciones vinculadas a este expediente.');return review;}
    function correctionAccess(exp,ctx){if(!exp.submissionSnapshot||!exp.holderIdentity)fail('NOT_SUBMITTED','Primero debe enviarse el expediente.');if(actor.role==='holder')holder(exp);else staff(ctx,exp.contactId);}
    function correctionEditable(exp){var fresh=liveReview(exp),saved=exp.correctionReview;if(exp.holderActions.offerAcceptance||exp.holderActions.contractSignature||exp.offerAccepted||exp.contractSigned||fresh.financialLocked)fail('FINANCIAL_LOCK','La aceptación financiera bloquea nuevas correcciones.');if(!saved||saved.fingerprint!==fresh.fingerprint||correctionRequestId(saved)!==correctionRequestId(fresh))fail('CORRECTION_STALE','Las observaciones cambiaron. Recibe la revisión vigente.');if(fresh.status!=='requested')fail('CORRECTION_LOCK','Las correcciones no están abiertas para captura.');var requestId=correctionRequestId(fresh);if(exp.correctionSubmissions&&exp.correctionSubmissions[requestId])fail('CORRECTION_SENT','Esta corrección ya fue enviada.');return fresh;}
    function receiveCorrection(expId,revision){return transact(revision,function(s,ctx){var exp=expFor(s,expId);correctionAccess(exp,ctx);var review=liveReview(exp),requestId=correctionRequestId(review);exp.correctionReview=copy(review);if(review.status==='approved')exp.approvedFields=copy(review.approvedFields||{});if(!exp.correctionDraft||exp.correctionDraft.requestId!==requestId){if(exp.correctionDraft){if(!exp.correctionDrafts)exp.correctionDrafts={};if(!exp.correctionDrafts[exp.correctionDraft.requestId])exp.correctionDrafts[exp.correctionDraft.requestId]=copy(exp.correctionDraft);}exp.correctionDraft={requestId:requestId,version:review.requestVersion||review.version,fields:{},documents:[],fieldHistory:{},updatedAt:ctx.now,updatedBy:actor.id};}record(ctx,'correction_review_received',exp,{requestId:requestId,reviewStatus:review.status});return exp;});}
    function editCorrection(expId,patch,revision){return transact(revision,function(s,ctx){var exp=expFor(s,expId);correctionAccess(exp,ctx);var review=correctionEditable(exp),requestId=correctionRequestId(review);patch=patch||{};if(patch.documents&&patch.documents.length)fail('CORRECTION_SCOPE','Esta revisión solo habilita los campos observados, no documentos.');var fields=patch.fields||{},keys=Object.keys(fields);if(!keys.length)fail('EMPTY_CORRECTION','Captura al menos un campo observado.');keys.forEach(function(key){if((review.allowedFields||[]).indexOf(key)<0)fail('CORRECTION_SCOPE','El campo no está observado: '+key);});var draft=exp.correctionDraft;if(!draft||draft.requestId!==requestId)fail('CORRECTION_STALE','Recibe las observaciones antes de corregir.');var temp={kind:exp.kind,fields:copy(draft.fields),fieldHistory:copy(draft.fieldHistory)};setFields(temp,fields,ctx,actor.role==='holder');draft.fields=temp.fields;draft.fieldHistory=temp.fieldHistory;draft.updatedAt=ctx.now;draft.updatedBy=actor.id;record(ctx,'correction_draft_updated',exp,{requestId:requestId,fields:keys});return exp;});}
    function submitCorrection(expId,input,revision){return transact(revision,function(s,ctx){var exp=expFor(s,expId);holder(exp);var review=correctionEditable(exp),requestId=correctionRequestId(review),draft=exp.correctionDraft;input=input||{};if(input.confirmed!==true||input.demo!==true)fail('CONFIRMATION_REQUIRED','El titular debe revisar y confirmar personalmente la corrección.');if(exp.kind==='doctor'&&(!['holder','authorized_representative'].includes(input.capacity)||input.authorityConfirmed!==true))fail('AUTHORITY_REQUIRED','Debe confirmar el titular o su representante con facultades verificadas.');if(!draft||draft.requestId!==requestId||!Object.keys(draft.fields).length)fail('EMPTY_CORRECTION','No hay cambios observados guardados.');if(!options.createCorrectionSubmission)fail('NO_CORRECTION','El adaptador de correcciones no está disponible.');var submission=options.createCorrectionSubmission(copy(exp),{fields:copy(draft.fields),documents:[]},copy(review));submission.holderConfirmation={actorId:actor.id,actorRole:'holder',confirmed:true,demo:true,at:ctx.now,capacity:input.capacity||'holder',authorityConfirmed:!!input.authorityConfirmed};if(!exp.correctionSubmissions)exp.correctionSubmissions={};exp.correctionSubmissions[requestId]=copy(submission);exp.correctionSubmission=copy(submission);record(ctx,'holder_correction_submitted',exp,{requestId:requestId});return exp;});}
    function liveDocumentReview(exp){if(!options.readDocumentReview)fail('NO_DOCUMENT_CORRECTION','La revisión documental no está disponible.');var review=options.readDocumentReview(copy(exp));if(!review||review.expedientId!==exp.id||review.contactId!==exp.contactId||review.accountId!==exp.holderIdentity.id||!review.docId||!review.requestId)fail('NO_DOCUMENT_CORRECTION','No hay un documento observado vinculado a este expediente.');return review;}
    function documentCorrectionEditable(exp){var fresh=liveDocumentReview(exp),saved=exp.documentCorrectionReview;if(exp.holderActions.offerAcceptance||exp.holderActions.contractSignature||exp.offerAccepted||exp.contractSigned||fresh.financialLocked)fail('FINANCIAL_LOCK','La operación aceptada o firmada no admite reemplazos documentales.');if(!saved||saved.fingerprint!==fresh.fingerprint||saved.requestId!==fresh.requestId||saved.docId!==fresh.docId)fail('DOCUMENT_CORRECTION_STALE','La observación documental cambió. Consulta la revisión vigente.');if(fresh.status!=='requested')fail('DOCUMENT_CORRECTION_LOCK','El documento no está abierto para sustitución.');if(exp.documentCorrectionSubmissions&&exp.documentCorrectionSubmissions[fresh.requestId])fail('DOCUMENT_CORRECTION_SENT','Este reemplazo ya fue enviado a revisión.');return fresh;}
    function validateEvidenceDescriptor(descriptor,contactId){if(!descriptor||typeof descriptor!=='object'||!/^[A-Za-z0-9_-]{1,180}$/.test(descriptor.id||'')||typeof descriptor.name!=='string'||!descriptor.name.trim()||descriptor.name.length>180||!(['application/pdf','image/png','image/jpeg','image/webp'].includes(descriptor.mimeType)||['video/webm','video/mp4'].includes(descriptor.mimeType)&&descriptor.documentType==='selfieVideo'||descriptor.mimeType==='image/gif'&&descriptor.documentType==='profile_photo')||!Number.isInteger(descriptor.size)||descriptor.size<=0||descriptor.size>5242880||!Number.isFinite(Date.parse(descriptor.uploadedAt))||descriptor.actorId!==actor.id||descriptor.contactId!==contactId)fail('INVALID_DOCUMENT','La evidencia no pertenece a esta captura o tiene metadatos inválidos.');return {id:descriptor.id,name:descriptor.name,mimeType:descriptor.mimeType,size:descriptor.size,uploadedAt:descriptor.uploadedAt,actorId:descriptor.actorId,contactId:descriptor.contactId,activityId:descriptor.activityId||null,documentType:descriptor.documentType||null};}
    function receiveDocumentCorrection(expId,revision){return transact(revision,function(s,ctx){var exp=expFor(s,expId);correctionAccess(exp,ctx);var review=liveDocumentReview(exp);exp.documentCorrectionReview=copy(review);if(!exp.documentCorrectionDraft||exp.documentCorrectionDraft.requestId!==review.requestId){if(exp.documentCorrectionDraft){if(!exp.documentCorrectionDrafts)exp.documentCorrectionDrafts={};if(!exp.documentCorrectionDrafts[exp.documentCorrectionDraft.requestId])exp.documentCorrectionDrafts[exp.documentCorrectionDraft.requestId]=copy(exp.documentCorrectionDraft);}exp.documentCorrectionDraft={requestId:review.requestId,docId:review.docId,version:review.version,descriptor:null,versions:[],updatedAt:ctx.now,updatedBy:actor.id};}if(review.approvedDocuments)exp.approvedDocuments=copy(review.approvedDocuments);if(['approved','rejected'].includes(review.status)){if(!exp.documentCorrectionReceipts)exp.documentCorrectionReceipts={};if(!exp.documentCorrectionReceipts[review.requestId]){var historical=(review.history||[]).find(function(row){return row.requestId===review.requestId;});exp.documentCorrectionReceipts[review.requestId]={requestId:review.requestId,docId:review.docId,status:review.status,document:copy(historical&&historical.document||(review.status==='approved'?review.activeDocument:review.candidate)||null),reviewFingerprint:review.fingerprint,receivedAt:ctx.now,receivedBy:actor.id};}}record(ctx,'document_correction_review_received',exp,{requestId:review.requestId,docId:review.docId,reviewStatus:review.status});return exp;});}
    function editDocumentCorrectionDraft(expId,patch,revision){return transact(revision,function(s,ctx){var exp=expFor(s,expId);correctionAccess(exp,ctx);var review=documentCorrectionEditable(exp),draft=exp.documentCorrectionDraft;if(!draft||draft.requestId!==review.requestId||draft.docId!==review.docId)fail('DOCUMENT_CORRECTION_STALE','Recibe la observación documental antes de cargar el reemplazo.');var descriptor=validateEvidenceDescriptor(patch&&patch.descriptor,exp.contactId);if(exp.kind==='patient'&&(isHolderIdentityType(descriptor.documentType)||isHolderIdentityType(review.docId)||isHolderIdentityType(review.documentType)||(exp.documents||[]).some(function(d){return d.id===review.docId&&(isHolderIdentityType(d.label)||isHolderIdentityType((d.onboardingPath||'').split('.')[1]));}))){holder(exp);if(review.documentType&&descriptor.documentType!==review.documentType)fail('DOCUMENT_SCOPE','El archivo debe conservar el tipo exacto observado.');assertHolderDocumentUpload(exp,descriptor,actor);}draft.descriptor=descriptor;draft.updatedAt=ctx.now;draft.updatedBy=actor.id;if(!draft.versions)draft.versions=[];draft.versions.push({descriptor:copy(descriptor),actorId:actor.id,actorRole:actor.role,at:ctx.now});record(ctx,'document_correction_draft_uploaded',exp,{requestId:review.requestId,docId:review.docId,evidenceId:descriptor.id});return exp;});}
    function submitDocumentCorrection(expId,input,revision){return transact(revision,function(s,ctx){var exp=expFor(s,expId);holder(exp);var review=documentCorrectionEditable(exp),draft=exp.documentCorrectionDraft;input=input||{};if(input.confirmed!==true||input.demo!==true)fail('CONFIRMATION_REQUIRED','El titular debe revisar y confirmar personalmente el documento de reemplazo.');if(exp.kind==='doctor'&&(!['holder','authorized_representative'].includes(input.capacity)||input.authorityConfirmed!==true))fail('AUTHORITY_REQUIRED','Debe confirmar el titular o un representante con facultades verificadas.');if(!draft||draft.requestId!==review.requestId||draft.docId!==review.docId||!draft.descriptor)fail('MISSING_DOCUMENT','Carga primero el documento observado de reemplazo.');if(!options.createDocumentSubmission)fail('NO_DOCUMENT_CORRECTION','El adaptador de reemplazos no está disponible.');var submission=options.createDocumentSubmission(copy(exp),copy(draft.descriptor),copy(review));submission.holderConfirmation={actorId:actor.id,actorRole:'holder',confirmed:true,demo:true,at:ctx.now,capacity:input.capacity||'holder',authorityConfirmed:!!input.authorityConfirmed};if(!exp.documentCorrectionSubmissions)exp.documentCorrectionSubmissions={};exp.documentCorrectionSubmissions[review.requestId]=copy(submission);exp.documentCorrectionSubmission=copy(submission);record(ctx,'holder_document_correction_submitted',exp,{requestId:review.requestId,docId:review.docId,evidenceId:draft.descriptor.id});return exp;});}
    function receiveOffer(expId,revision) {return transact(revision,function(s,ctx){var exp=expFor(s,expId);holder(exp);if(exp.kind!=='patient'||!exp.submissionSnapshot||!options.readOffer)fail('NO_OFFER','No hay una oferta disponible para este expediente.');var quote=options.readOffer(copy(exp));if(!quote||!quote.offer||!quote.offerFingerprint)fail('NO_OFFER','El equipo de revisión todavía no ha emitido una oferta.');if(exp.holderActions.offerAcceptance){if(exp.holderActions.offerAcceptance.offerFingerprint!==quote.offerFingerprint)fail('FINANCIAL_LOCK','La oferta aceptada está bloqueada. Requiere conciliación en backoffice.');return exp;}exp.receivedOffer=copy(quote);record(ctx,'holder_offer_received',exp,{offerFingerprint:quote.offerFingerprint});return exp;});}
    function submissionPayload(expId) { var out=getExpedient(expId);if(!out.ok)return out;return result(function(){var exp=out.value.expedient;if(!exp.submissionSnapshot)fail('NOT_SUBMITTED','El expediente todavía no se ha enviado.');return exp.submissionSnapshot;}); }
    return {recordBureauNip:recordBureauNip,getOrCreateEntryLink:getOrCreateEntryLink,renewEntryLink:renewEntryLink,revokeEntryLink:revokeEntryLink,recordEntryLinkCopy:recordEntryLinkCopy,resolveEntryLink:resolveEntryLink,openEntryLink:openEntryLink,verifyOnboardingEvidence:verifyOnboardingEvidence,saveOnboarding:saveOnboarding,beginDraft:beginDraft,editDraft:editDraft,invite:invite,recordInvitationCopy:recordInvitationCopy,recordAccessLinkIssued:recordAccessLinkIssued,recordAccessLinkCopy:recordAccessLinkCopy,getInvitationInfo:getInvitationInfo,requestDemoVerification:requestDemoVerification,verifyDemoCode:verifyDemoCode,claim:claim,createSelfService:createSelfService,completeInitialRegistration:completeInitialRegistration,holderAction:holderAction,submit:submit,receiveOffer:receiveOffer,receiveCorrection:receiveCorrection,editCorrection:editCorrection,submitCorrection:submitCorrection,receiveDocumentCorrection:receiveDocumentCorrection,editDocumentCorrectionDraft:editDocumentCorrectionDraft,submitDocumentCorrection:submitDocumentCorrection,getExpedient:getExpedient,submissionPayload:submissionPayload};
  }
  return {assertHolderDocumentUpload:assertHolderDocumentUpload,isHolderIdentityType:isHolderIdentityType,holderIdentityFileComplete:holderIdentityFileComplete,identityFileHistory:identityFileHistory,assertOnboardingEvidence:assertOnboardingEvidence,evidenceDescriptor:evidenceDescriptor,onboardingDocumentDescriptors:onboardingDocumentDescriptors,getOnboardingDocument:getOnboardingDocument,inlinePayload:inlinePayload,ONBOARDING_SCHEMA:ONBOARDING_SCHEMA,ONBOARDING_KEYS:ONBOARDING_KEYS,ONBOARDING_LIMIT:ONBOARDING_LIMIT,validateOnboardingRecords:validateOnboardingRecords,flattenOnboarding:flattenOnboarding,onboardingProjection:onboardingProjection,onboardingMissing:onboardingMissing,patientMissing:patientMissing,doctorMissing:doctorMissing,createAssisted:createAssisted,PATIENT_FIELDS:PATIENT_FIELDS,DOCTOR_FIELDS:DOCTOR_FIELDS,REQUIRED:REQUIRED};
}));
