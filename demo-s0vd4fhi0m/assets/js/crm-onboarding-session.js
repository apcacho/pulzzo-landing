/* One full onboarding form and one expediente. LOCAL DEMO ONLY.
 * This adapter isolates the legacy form's Storage contract; it never grants
 * real authentication, changes a portal account or manufactures holder actions.
 */
(function(root,factory){
  var api=factory(root,root&&root.PulzzoCRMStore||(typeof module==='object'&&module.exports?require('./crm-demo-store.js'):null),root&&root.PulzzoCRMAssisted||(typeof module==='object'&&module.exports?require('./crm-assisted.js'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PulzzoCRMOnboarding=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null,function(root,Store,Assisted){
  'use strict';
  var CONTEXT_KEY='pulzzo_crm_onboarding_context_v1',STAFF_KEY='pulzzo_crm_onboarding_staff_v1',HOLDER_KEY='pulzzo_crm_holder_demo_session',TTL=8*60*60*1000,HOLDER_IDLE=30*60*1000,HOLDER_MAX=12*60*60*1000;
  // Holder session: closes after 30 minutes WITHOUT activity (sliding expiresAt), bounded by a 12 h context.
  function copy(v){return v===undefined?undefined:JSON.parse(JSON.stringify(v));}
  function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
  function object(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
  function fail(code,message){var error=new Error(message);error.code=code;throw error;}
  function take(out){if(!out||!out.ok)fail(out&&out.code||'ONBOARDING_ERROR',out&&out.error||'No se pudo abrir el expediente.');return out.value;}
  function storages(options){var storage=options.storage||root&&root.localStorage,session=options.sessionStorage||root&&root.sessionStorage;if(!storage||!session||!storage.getItem||!storage.setItem||!session.getItem||!session.setItem)fail('STORAGE_UNAVAILABLE','La captura requiere almacenamiento local y una sesión en esta pestaña.');return {storage:storage,session:session};}
  function parse(raw){try{return raw?JSON.parse(raw):null;}catch(_){fail('INVALID_SESSION','La sesión de captura no se puede validar. Regresa al CRM.');}}
  function milliseconds(options){var time=options.now?options.now():Date.now();return typeof time==='number'?time:Date.parse(time);}
  function validActor(actor){return actor&&typeof actor.id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,179}$/.test(actor.id)&&['kam','admin','leader','holder'].includes(actor.role);}
  function safeReturn(url,role){var fallback=role==='holder'?'asistido-demo.html?review=1':'crm-demo.html';if(!url)return fallback;return /^(crm-demo|crm|backoffice|asistido-demo)\.html(?:[?#][^\s]*)?$/.test(url)?url:fallback;}
  function random(){return root&&root.crypto&&root.crypto.randomUUID?root.crypto.randomUUID():Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);}
  function setStaffSession(options){
    options=options||{};var session=options.sessionStorage||root&&root.sessionStorage,actor=options.actor;if(!session)fail('STORAGE_UNAVAILABLE','La sesión local no está disponible.');
    if(!actor||!['kam','admin','leader'].includes(actor.role)||typeof actor.id!=='string')fail('INVALID_ACTOR','Selecciona una sesión CRM válida.');
    var staff=root&&root.PulzzoStaffAccess||options.staffAccess;if(staff){var access=staff.crmContext(options.staffSession||staff.getSession());if(!access||!access.isCurrent()||!access.actor||access.actor.id!==actor.id||access.actor.role!==actor.role)fail('INVALID_ACTOR','La identidad debe coincidir con la sesión del directorio.');}
    var old=parse(session.getItem(STAFF_KEY));if(old&&same(old.actor,actor))return copy(old);
    var next={actor:{id:actor.id,role:actor.role},nonce:random(),demo:true};session.setItem(STAFF_KEY,JSON.stringify(next));session.removeItem(CONTEXT_KEY);return copy(next);
  }
  function clearStaffSession(options){var session=options&&options.sessionStorage||root&&root.sessionStorage;if(session){session.removeItem(STAFF_KEY);var ctx=parse(session.getItem(CONTEXT_KEY));if(ctx&&ctx.mode==='assisted')session.removeItem(CONTEXT_KEY);}}
  function seedRecords(exp,contact){
    var f=exp.fields||{},formId='draft:'+exp.id,records={};
    if(exp.kind==='patient'){
      var patient={patientAccountId:formId,nombre:f.fullName||contact.name,fullName:f.fullName||contact.name,correo:contact.email,email:contact.email,celular:contact.phone,phone:contact.phone,demo:true};
      records.pulzzo_patient=JSON.stringify(patient);
      records.pulzzo_application=JSON.stringify({patientAccountId:formId,applicationId:'application:'+exp.id,contactEmail:contact.email,patient:copy(patient),procedureDone:false,estimateDone:false,identityDone:false,incomeDone:false,documentsDone:false,referencesSaved:false,creditAuthConfirmed:false,applicationSubmitted:false,procedure:{procedures:f.procedure?[f.procedure]:[],specialties:[]},requestedAmount:f.requestedAmount||'',selectedTerm:f.termMonths||'',incomeMonthly:f.monthlyIncome||'',incomeType:f.employment||'',identity:{name:f.fullName||contact.name,nameParts:{first:'',second:'',paternal:'',maternal:''},curp:f.identityReference||'',address:{street:f.address||'',exterior:'',interior:'',zip:'',colony:'',city:'',state:''}},identityFiles:{},documentFiles:{},references:[]});
    }else{
      records.pulzzo_doctor=JSON.stringify({doctorAccountId:formId,nombre:f.fullName||contact.name,correo:contact.email,celular:contact.phone,accountType:'doctor',demo:true});
      records.pulzzoDoctorAccountType='doctor';records.pulzzoDoctorSpecialties=JSON.stringify(f.specialty?[f.specialty]:[]);records.pulzzoDoctorOnboardingCleanV3Status='perfil_incompleto';
      records.pulzzoDoctorOnboardingCleanV3=JSON.stringify({doctorAccountId:formId,currentStep:1,profile:{name:f.fullName||contact.name,email:contact.email,prefix:'',accountType:'doctor',establishmentType:'',state:'',city:''},files:{official_id:[],license:[],csf:[],office_address:[],bank_cover:[],profile_photo:[]},errors:{},fiscal:{rfc:'',banco:'',clabe:'',titular:''},medval:{method:'',procedureType:'',pendingQuestion:'',medicalLicenseNumber:f.professionalLicense||''},clinicDocs:{legalType:'',sanitaryDocType:'',certRequired:''},contact:{registered:contact.phone,officePhone:'',officeWhats:'',visible:'registered'},links:{website:'',instagram:'',facebook:'',doctoralia:'',linkedin:'',other:''},procedures:[],specialties:f.specialty?[f.specialty]:[],profileData:{clinicName:f.clinicName||'',address:f.clinicAddress||'',representativeName:f.representativeName||'',representativeRole:f.representativeRole||''},newProc:[],otherProc:'',photoMode:'',profilePhotoData:'',submitted:false});
    }
    return records;
  }
  function locked(exp){var a=exp.holderActions||{};return !!(exp.submittedAt||exp.submissionSnapshot||exp.demoBridgeCaseId||exp.offerAccepted||exp.contractSigned||a.finalConfirmation||a.offerAcceptance||a.contractSignature||['submitted','approved','rejected','needs_correction'].includes(exp.status));}
  function capturePath(pathname,kind){
    // Sites serves the same pages without .html. Keep the exact, kind-specific
    // allowlist, including the patient gateway that validates before redirecting.
    if(typeof pathname!=='string'||pathname.charAt(0)!=='/')return false;
    var page=pathname.split('/').pop();
    return kind==='patient'?/^(?:solicitud-paciente|registro-paciente)(?:\.html)?$/.test(page):kind==='doctor'&&/^registro-doctor(?:\.html)?$/.test(page);
  }
  function actorConnection(options,context,storage,session){
    var serialized=JSON.stringify(context);
    function current(){
      try{if(options.bindLocation){var live=options.location||root&&root.location||{},query=new URLSearchParams(live.search||'');if(query.get('crmExp')!==context.expId||query.get('crmMode')!==context.mode||!capturePath(live.pathname,context.kind))return false;}if(session.getItem(CONTEXT_KEY)!==serialized||milliseconds(options)>context.expiresAt)return false;var identity=parse(session.getItem(context.mode==='holder'?HOLDER_KEY:STAFF_KEY));if(context.mode==='holder'){var state=parse(storage.getItem(Store.STORAGE_KEY)),exp=state&&state.expedients[context.expId],contact=exp&&state.contacts[exp.contactId];if(!contact||contact.deletedAt||contact.stage==='not_interested'||identity&&identity.entryToken&&(!exp.entryLink||exp.entryLink.token!==identity.entryToken||exp.entryLink.status!=='active'))return false;return !!identity&&identity.demo===true&&Number.isFinite(identity.expiresAt)&&identity.expiresAt>milliseconds(options)&&identity.expId===context.expId&&identity.actor&&identity.actor.id===context.actor.id&&identity.actor.role==='holder';}return !!identity&&identity.nonce===context.staffNonce&&identity.actor.id===context.actor.id&&identity.actor.role===context.actor.role;}catch(_){return false;}
    }
    var store=Store.createStore({storage:storage,actor:context.actor,isCurrent:current,now:options.now}),evidence=null;
    function getEvidence(){if(!evidence){var module=options.evidenceModule||root&&root.PulzzoCRMEvidence;if(!module&&typeof require==='function')module=require('./crm-demo-evidence.js');if(!module)fail('STORAGE_UNAVAILABLE','El almacén local de archivos no está disponible.');evidence=options.evidenceStore||module.createEvidenceStore(Object.assign({},options.evidenceOptions||{},{store:store,isCurrent:current}));}return evidence;}
    var api=Assisted.createAssisted({store:store,actor:context.actor,now:options.now,getEvidenceStore:getEvidence});
    return {store:store,api:api,current:current,evidence:getEvidence};
  }
  function doctorCaptureHash(state){
    state=state||{};
    var progressed=Number(state.currentStep)>1||state.submitted||
      Object.values(state.files||{}).some(function(files){return Array.isArray(files)&&files.length>0;})||
      Object.values(state.fiscal||{}).some(function(value){return value!==null&&value!==undefined&&String(value).trim()!=='';})||
      !!(state.medval&&(state.medval.method||state.medval.procedureType))||
      !!(state.clinicDocs&&(state.clinicDocs.legalType||state.clinicDocs.sanitaryDocType))||
      !!(state.profile&&state.profile.state&&state.profile.city)||
      Object.values(state.links||{}).some(function(value){return !!String(value||'').trim();})||
      !!(state.procedures&&state.procedures.length)||!!state.photoMode||!!state.profilePhotoData||
      !!(state.contact&&(state.contact.officePhone||state.contact.officeWhats||state.contact.customPhone||state.contact.visible&&state.contact.visible!=='registered'))||
      Object.keys(state.profileData||{}).some(function(key){
        if(['clinicName','address','representativeName','representativeRole'].includes(key))return false;
        var value=state.profileData[key];return Array.isArray(value)?value.length>0:value!==null&&value!==undefined&&String(value).trim()!=='';
      });
    return progressed?'#perfil-medico':'#datos-medicos';
  }
  // Extends the holder session by 30 minutes from now; never revives an expired one.
  function touchHolderSession(options){options=options||{};try{var session=options.sessionStorage||root&&root.sessionStorage,saved=parse(session.getItem(HOLDER_KEY)),now=milliseconds(options);if(!saved||saved.demo!==true||!Number.isFinite(saved.expiresAt)||saved.expiresAt<=now)return false;saved.expiresAt=now+HOLDER_IDLE;session.setItem(HOLDER_KEY,JSON.stringify(saved));return true;}catch(_){return false;}}
  function watchHolderActivity(win){if(!win||!win.document||typeof win.document.addEventListener!=='function'||watchHolderActivity.bound)return;watchHolderActivity.bound=true;var last=0;var touch=function(){var t=Date.now();if(t-last<15000)return;last=t;touchHolderSession({sessionStorage:win.sessionStorage});};['input','change','click','keydown','touchstart','scroll'].forEach(function(type){win.document.addEventListener(type,touch,{capture:true,passive:true});});}
  function start(options){
    options=options||{};var disk=storages(options),actor=copy(options.actor);if(!validActor(actor))fail('FORBIDDEN','Solo el KAM asignado, administrador o titular puede abrir la captura.');
    var sessionIdentity,mode=actor.role==='holder'?'holder':'assisted';
    if(mode==='holder'){
      sessionIdentity=parse(disk.session.getItem(HOLDER_KEY));if(!sessionIdentity||sessionIdentity.demo!==true||!Number.isFinite(sessionIdentity.expiresAt)||sessionIdentity.expiresAt<=milliseconds(options)||sessionIdentity.expiresAt>milliseconds(options)+HOLDER_IDLE+60000||sessionIdentity.expId!==options.expId||!sessionIdentity.actor||sessionIdentity.actor.id!==actor.id||sessionIdentity.actor.role!=='holder')fail('HOLDER_REQUIRED','Primero verifica y abre la sesión demo del titular.');
    }else sessionIdentity=setStaffSession({sessionStorage:disk.session,actor:actor});
    var store=Store.createStore({storage:disk.storage,actor:actor}),api=Assisted.createAssisted({store:store,actor:actor}),exp=take(api.getExpedient(options.expId)).expedient,contact=store.getContact(exp.contactId);
    if(mode==='assisted'&&store.canEditContact&&!store.canEditContact(exp.contactId))fail('FORBIDDEN','Tu permiso vigente no permite capturar esta ficha.');
    if(mode==='assisted'&&(!exp.holderIdentity||!exp.initialRegistration))fail('INITIAL_REGISTRATION_REQUIRED','El titular aún no completa su registro inicial. Comparte su enlace para que se registre antes de ayudarle en su expediente.');
    if(options.kind&&options.kind!==exp.kind)fail('INVALID_KIND','El formulario no corresponde al expediente.');
    var timestamp=milliseconds(options);if(!Number.isFinite(timestamp))fail('INVALID_SESSION','La fecha de sesión no es válida.');
    var context={version:1,demo:true,mode:mode,actor:{id:actor.id,role:actor.role},expId:exp.id,kind:exp.kind,contactId:exp.contactId,staffNonce:mode==='assisted'?sessionIdentity.nonce:null,nonce:random(),createdAt:timestamp,expiresAt:mode==='holder'?timestamp+HOLDER_MAX:timestamp+TTL,returnUrl:safeReturn(options.returnUrl,actor.role)};
    disk.session.setItem(CONTEXT_KEY,JSON.stringify(context));
    try{
      var connection=actorConnection(options,context,disk.storage,disk.session);
      if(!exp.onboarding&&!locked(exp))take(connection.api.saveOnboarding(exp.id,{records:seedRecords(exp,contact)},connection.store.snapshot().revision));
    }catch(error){disk.session.removeItem(CONTEXT_KEY);throw error;}
    return {url:(exp.kind==='doctor'?'registro-doctor.html':'solicitud-paciente.html')+'?crmExp='+encodeURIComponent(exp.id)+'&crmMode='+mode+(exp.kind==='doctor'&&mode==='assisted'?'#perfil-medico':exp.kind==='doctor'?doctorCaptureHash(parse(exp.onboarding&&exp.onboarding.records&&exp.onboarding.records.pulzzoDoctorOnboardingCleanV3)):''),expId:exp.id,kind:exp.kind,mode:mode};
  }
  function open(options){
    options=options||{};var location=options.location||root&&root.location||{},params=new URLSearchParams(location.search||'');if(!params.has('crmExp')&&!params.has('crmMode'))return null;
    var disk=storages(options),context=parse(disk.session.getItem(CONTEXT_KEY));
    if(!context||!Number.isFinite(context.createdAt)||!Number.isFinite(context.expiresAt)||(context.mode==='holder'?context.expiresAt!==context.createdAt+HOLDER_MAX:context.expiresAt!==context.createdAt+TTL)||context.createdAt>milliseconds(options)+60000||typeof context.nonce!=='string'||!context.nonce||context.version!==1||context.demo!==true||!validActor(context.actor)||context.expId!==params.get('crmExp')||context.mode!==params.get('crmMode')||context.mode!==(context.actor.role==='holder'?'holder':'assisted')||options.kind&&context.kind!==options.kind)fail('INVALID_SESSION','Este enlace requiere la sesión que abrió el expediente. Regresa al CRM o verifica tu invitación.');
    var connection=actorConnection(Object.assign({},options,{bindLocation:true}),context,disk.storage,disk.session);if(!connection.current())fail('SESSION_EXPIRED','La sesión cambió o venció. Vuelve a abrir el expediente.');
    var exp=take(connection.api.getExpedient(context.expId)).expedient,contact=connection.store.getContact(exp.contactId);if(exp.kind!==context.kind||exp.contactId!==context.contactId)fail('IDENTITY_LOCK','La sesión no pertenece a este expediente.');
    if(context.mode==='assisted'&&!exp.initialRegistration)fail('INITIAL_REGISTRATION_REQUIRED','El titular debe completar primero su registro inicial.');
    if(context.mode==='holder'&&!options.storage&&root&&root.document)watchHolderActivity(root);
    var revision=connection.store.snapshot().revision,cached=exp,transient=Object.create(null),pending=Object.create(null);
    function assertFresh(){
      if(!connection.current())fail('SESSION_EXPIRED','La sesión cambió o venció. Vuelve a abrir el expediente.');
      // A different prospect/task can advance the global CAS revision. Rebase only
      // when this complete dossier AND its exact linked contact remain unchanged.
      var fresh=take(connection.api.getExpedient(context.expId)).expedient,snapshot=connection.store.snapshot(),linked=snapshot.contacts[context.contactId];
      if(fresh.id!==context.expId||fresh.kind!==context.kind||fresh.contactId!==context.contactId||!linked||linked.id!==context.contactId)fail('IDENTITY_LOCK','La sesión no pertenece a este expediente.');
      if(!same(fresh,snapshot.expedients[context.expId])||!same(fresh,cached)||!same(linked,contact))fail('STALE_REVISION','Otra ventana cambió el expediente. Recarga para revisar antes de guardar.');
      if(!connection.current())fail('SESSION_EXPIRED','La sesión cambió o venció. Vuelve a abrir el expediente.');
      revision=snapshot.revision;return true;
    }
    function acceptOwnSave(result){
      var saved=take(result),linked=result.state&&result.state.contacts[context.contactId];
      if(!linked||saved.id!==context.expId||saved.contactId!==context.contactId)fail('IDENTITY_LOCK','La escritura no corresponde al expediente abierto.');
      // Adopt only the committed transaction's contact, never a later concurrent read.
      cached=saved;contact=copy(linked);revision=result.revision;return saved;
    }
    function records(){assertFresh();return cached.onboarding&&cached.onboarding.records||seedRecords(cached,contact);}
    function state(){var recordsValue=records();try{return JSON.parse(recordsValue[context.kind==='doctor'?'pulzzoDoctorOnboardingCleanV3':'pulzzo_application']||'{}');}catch(_){fail('INVALID_ONBOARDING','El formulario guardado no se puede leer.');}}
    function canEdit(){assertFresh();return !locked(cached);}
    function assertHolderAction(){assertFresh();if(context.mode!=='holder'||!cached.holderIdentity||cached.holderIdentity.id!==context.actor.id)fail('HOLDER_REQUIRED','Esta acción debe realizarla personalmente el titular.');return true;}
    function descriptorEqual(a,b){return same(Assisted.evidenceDescriptor(a),Assisted.evidenceDescriptor(b));}
    function linkedDescriptor(descriptor){var all=Assisted.onboardingDocumentDescriptors(context.kind,records());Object.values(cached.onboarding&&cached.onboarding.identityFileHistory||{}).forEach(function(files){(files||[]).forEach(function(file){all.push({descriptor:file});});});return all.some(function(row){return descriptor.evidenceId?descriptorEqual(row.descriptor,descriptor):same(row.descriptor,descriptor);});}
    function linkedAnywhere(evidenceId){
      var snapshot=parse(disk.storage.getItem(Store.STORAGE_KEY)),found=false;function walk(value){if(!value||typeof value!=='object'||found)return;if(value.evidenceId===evidenceId){found=true;return;}Object.keys(value).forEach(function(key){if(key==='records'&&object(value[key]))Object.keys(value[key]).forEach(function(k){try{walk(JSON.parse(value[key][k]));}catch(_){}});else walk(value[key]);});}walk(snapshot);return found;
    }
    async function removeUncommittedFile(descriptor){
      var d=Assisted.evidenceDescriptor(descriptor),owned=d&&pending[d.evidenceId];if(!d||!owned||!descriptorEqual(owned,d)||d.actorId!==context.actor.id||d.contactId!==context.contactId)return false;
      if(linkedAnywhere(d.evidenceId)){delete pending[d.evidenceId];return false;}var evidence=connection.evidence();if(evidence.discardUncommitted){var removedOwn=await evidence.discardUncommitted({id:d.evidenceId,name:d.name,mimeType:d.type,size:d.size,uploadedAt:d.uploadedAt,actorId:d.actorId,contactId:d.contactId,activityId:null,documentType:d.documentType},function(){return !linkedAnywhere(d.evidenceId);});if(removedOwn)delete pending[d.evidenceId];return removedOwn;}var actual=await evidence.get(d.evidenceId);if(!actual){delete pending[d.evidenceId];return false;}
      if(actual.actorId!==context.actor.id||actual.contactId!==context.contactId||actual.name!==d.name||actual.size!==d.size||actual.mimeType!==d.type||actual.uploadedAt!==d.uploadedAt||actual.documentType!==d.documentType)return false;
      if(linkedAnywhere(d.evidenceId))return false;var removed=await connection.evidence().remove(d.evidenceId);if(removed)delete pending[d.evidenceId];return removed;
    }
    async function putFile(file,details){
      details=details||{};assertFresh();if(context.kind==='patient'&&Assisted.isHolderIdentityType(details.documentType))assertHolderAction();var mime=String(file&&file.type||'').toLowerCase().split(';')[0];if(mime==='image/gif'&&(context.kind!=='doctor'||details.documentType!=='profile_photo')||mime.startsWith('video/')&&(context.kind!=='patient'||details.documentType!=='selfieVideo'))fail('UNSUPPORTED_TYPE','Este formato no corresponde al documento seleccionado.');if(!canEdit())fail('SUBMITTED_LOCK','El expediente no está abierto para captura.');var started=revision,meta=null,descriptor=null;
      try{meta=await connection.evidence().put(file,{actorId:context.actor.id,contactId:context.contactId,expedientId:context.expId,documentType:String(details.documentType||'other')});
        descriptor={name:meta.name,type:meta.mimeType,mimeType:meta.mimeType,size:meta.size,lastModified:Number(file.lastModified)||0,evidenceId:meta.id,uploadedAt:meta.uploadedAt,actorId:meta.actorId,contactId:meta.contactId,documentType:meta.documentType,demo:true,status:'En revisión'};
        pending[meta.id]=copy(descriptor);assertFresh();if(revision!==started||!canEdit())fail('STALE_REVISION','La captura cambió mientras se guardaba el archivo.');
        take(await connection.api.verifyOnboardingEvidence(context.expId,descriptor,started));assertFresh();return copy(descriptor);
      }catch(error){if(descriptor)try{await removeUncommittedFile(descriptor);}catch(cleanup){error.cleanupError=cleanup;}throw error;}
    }
    async function getFile(descriptor){
      assertFresh();var started=revision,canonical=linkedDescriptor(descriptor),d=Assisted.evidenceDescriptor(descriptor);
      if(d){if(!canonical&&!(pending[d.evidenceId]&&descriptorEqual(pending[d.evidenceId],d)))fail('DOCUMENT_SCOPE','Este archivo no forma parte del expediente abierto.');var actual=take(await connection.api.verifyOnboardingEvidence(context.expId,d,started));assertFresh();if(revision!==started)fail('STALE_REVISION','La captura cambió durante la lectura.');return actual;}
      if(!canonical)fail('DOCUMENT_SCOPE','Este archivo no forma parte del expediente abierto.');var inline=Assisted.inlinePayload(descriptor);if(!inline)fail('INVALID_DOCUMENT','El documento local anterior no es válido.');var parts=inline.dataUrl.split(','),binary=typeof atob==='function'?atob(parts[1]):Buffer.from(parts[1],'base64').toString('binary'),bytes=new Uint8Array(binary.length);for(var i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);var blob=new Blob([bytes],{type:inline.mimeType});assertFresh();return Object.assign({},inline,{id:null,contactId:context.contactId,blob:blob});
    }
    async function validateDocuments(){
      assertFresh();var started=revision,list=Assisted.onboardingDocumentDescriptors(context.kind,records());for(var i=0;i<list.length;i++)await getFile(list[i].descriptor);assertFresh();if(revision!==started)fail('STALE_REVISION','El expediente cambió mientras se revisaban sus archivos.');return {ok:true,count:list.length,revision:started};
    }
    var allowed=Assisted.ONBOARDING_KEYS[context.kind];
    var facade={
      getItem:function(key){key=String(key);var r=records();if(key==='pulzzo_verified'&&context.kind==='patient'||key==='pulzzo_doctor_verified'&&context.kind==='doctor')return context.mode==='holder'&&cached.holderIdentity&&cached.holderIdentity.id===context.actor.id?'true':'false';
        if(context.kind==='doctor'&&key==='pulzzoDoctorAccountType')return state().profile&&state().profile.accountType||r[key]||'doctor';
        if(context.kind==='doctor'&&key==='pulzzoDoctorSpecialties')return JSON.stringify(state().specialties||[]);
        return allowed.indexOf(key)>=0&&Object.prototype.hasOwnProperty.call(r,key)?r[key]:null;
      },
      setItem:function(key,value){key=String(key);value=String(value);assertFresh();if(allowed.indexOf(key)<0)fail('STORAGE_SCOPE','Esta clave no pertenece al formulario del expediente.');if(!canEdit())fail('SUBMITTED_LOCK','El expediente revisado o enviado está bloqueado. Usa el flujo de correcciones.');if(facade.getItem(key)===value)return;
        var patch={};patch[key]=value;acceptOwnSave(connection.api.saveOnboarding(context.expId,{records:patch},revision));
      },
      removeItem:function(key){key=String(key);assertFresh();if(allowed.indexOf(key)>=0)fail('DELETE_FORBIDDEN','No se puede borrar el expediente desde el formulario.');},
      clear:function(){fail('DELETE_FORBIDDEN','El formulario no puede borrar el expediente ni otros registros.');},
      key:function(index){assertFresh();return allowed[index]||null;}
    };
    Object.defineProperty(facade,'length',{get:function(){assertFresh();return allowed.length;}});
    var sessionFacade={getItem:function(key){assertFresh();return Object.prototype.hasOwnProperty.call(transient,key)?transient[key]:null;},setItem:function(key,value){assertFresh();if(key!=='pulzzo_pending_estimate')fail('STORAGE_SCOPE','Esta preferencia no pertenece al formulario.');transient[key]=String(value);},removeItem:function(key){assertFresh();delete transient[key];},clear:function(){assertFresh();transient=Object.create(null);}};
    var ctx={mode:context.mode,kind:context.kind,actor:Object.freeze(copy(context.actor)),expId:context.expId,contactId:context.contactId,formIdentityId:'draft:'+context.expId,isHolder:context.mode==='holder',isAssistant:context.mode==='assisted',isVerified:context.mode==='holder'&&!!exp.holderIdentity&&exp.holderIdentity.id===context.actor.id,storage:facade,sessionStorage:sessionFacade,returnUrl:context.returnUrl,reviewUrl:'asistido-demo.html?review=1',putFile:putFile,getFile:getFile,removeUncommittedFile:removeUncommittedFile,validateDocuments:validateDocuments,assertFresh:assertFresh,assertHolderAction:assertHolderAction,canEdit:canEdit,isCurrent:connection.current,
      completeInitialRegistration:function(){assertHolderAction();acceptOwnSave(connection.api.completeInitialRegistration(context.expId,revision));return copy(cached.initialRegistration);},
      identityFileHistory:function(key){assertFresh();return copy(cached.onboarding&&cached.onboarding.identityFileHistory&&cached.onboarding.identityFileHistory[key]||[]);},
      holderIdentityFileComplete:function(key){assertFresh();return Assisted.holderIdentityFileComplete(cached,key);},
      getExpedient:function(){assertFresh();return copy(cached);},
      urlFor:function(page){if(!/^(solicitud-paciente|registro-paciente|registro-doctor|verificacion-cuenta|verificacion-doctor)\.html(?:#[^\s]*)?$/.test(page))fail('INVALID_ROUTE','La ruta no pertenece a este registro.');var parts=page.split('#');return parts[0]+'?crmExp='+encodeURIComponent(context.expId)+'&crmMode='+context.mode+(parts[1]?'#'+parts[1]:'');}
    };
    Object.defineProperty(ctx,'accountId',{get:function(){assertFresh();return cached.holderIdentity&&cached.holderIdentity.id||null;}});return Object.freeze(ctx);
  }
  async function validateDocuments(options){
    options=options||{};var disk=storages(options),actor=options.actor;if(!validActor(actor)||actor.role!=='holder')fail('HOLDER_REQUIRED','El titular debe verificar personalmente los archivos de su expediente.');
    var raw=disk.session.getItem(HOLDER_KEY),session=parse(raw);if(!session||session.demo!==true||!session.actor||session.actor.id!==actor.id||session.actor.role!=='holder'||session.expId!==options.expId)fail('HOLDER_REQUIRED','Abre la sesión del titular de este expediente.');
    function current(){var live;try{live=parse(disk.session.getItem(HOLDER_KEY));}catch(_){return false;}return !!live&&same(Object.assign({},live,{expiresAt:0}),Object.assign({},session,{expiresAt:0}))&&(!options.isCurrent||options.isCurrent()===true);}
    var store=Store.createStore({storage:disk.storage,actor:actor,isCurrent:current}),module=options.evidenceModule||root&&root.PulzzoCRMEvidence;if(!module&&typeof require==='function')module=require('./crm-demo-evidence.js');
    var evidence=options.evidenceStore||module&&module.createEvidenceStore(Object.assign({},options.evidenceOptions||{},{store:store,isCurrent:current})),api=Assisted.createAssisted({store:store,actor:actor,evidenceStore:evidence}),result=take(api.getExpedient(options.expId)),revision=store.snapshot().revision,list=Assisted.onboardingDocumentDescriptors(result.expedient.kind,result.expedient.onboarding&&result.expedient.onboarding.records||{});
    if(options.revision!==undefined&&options.revision!==revision)fail('STALE_REVISION','El expediente cambió antes de revisar sus archivos.');
    try{for(var i=0;i<list.length;i++){var descriptor=list[i].descriptor;if(descriptor.evidenceId)take(await api.verifyOnboardingEvidence(options.expId,descriptor,revision));else if(!Assisted.inlinePayload(descriptor))fail('INVALID_DOCUMENT','Un documento del expediente no tiene un archivo legible.');}if(!current()||store.snapshot().revision!==revision)fail('STALE_REVISION','El expediente cambió durante la verificación documental.');return {ok:true,count:list.length,revision:revision};}finally{if(!options.evidenceStore&&evidence&&evidence.close)await evidence.close();}
  }
  function summary(exp){
    var on=exp&&exp.onboarding,fields=on?Assisted.flattenOnboarding(on.records):{},missing=exp?Assisted.onboardingMissing(exp):[],actions=exp&&exp.holderActions||{};
    if(exp&&!exp.initialRegistration)missing.push('Registro inicial del titular');
    if(exp&&exp.kind==='patient'){var patient=parse(on&&on.records&&on.records.pulzzo_application)||{},geo=patient.geolocation||{};if(!(patient.geoDone&&geo.status==='authorized'&&geo.consent===true&&Number.isFinite(geo.latitude)&&Number.isFinite(geo.longitude)))missing.push('Ubicación pendiente del titular');}
    if(exp&&!exp.holderIdentity)missing.push('Verificación personal del titular');if(exp&&exp.kind==='patient'&&!actions.buroConsent)missing.push('Autorización de Buró del titular');if(on&&!actions.legalConsent)missing.push('Términos y privacidad del titular');if(exp&&!actions.finalConfirmation)missing.push('Confirmación personal del titular');
    return {started:!!on,fieldCount:Object.values(fields).filter(function(v){return v!==null&&v!==''&&v!==false&&(!Array.isArray(v)||v.length);}).length,documentCount:exp?(exp.documents||[]).length:0,lastUpdated:on&&on.updatedAt||exp&&exp.updatedAt||null,submitted:!!(exp&&exp.submittedAt),missing:missing};
  }
  return {doctorCaptureHash:doctorCaptureHash,validateDocuments:validateDocuments,getOnboardingDocument:Assisted&&Assisted.getOnboardingDocument,CONTEXT_KEY:CONTEXT_KEY,STAFF_KEY:STAFF_KEY,HOLDER_KEY:HOLDER_KEY,TTL:TTL,HOLDER_IDLE:HOLDER_IDLE,HOLDER_MAX:HOLDER_MAX,touchHolderSession:touchHolderSession,start:start,open:open,setStaffSession:setStaffSession,clearStaffSession:clearStaffSession,summary:summary,seedRecords:seedRecords,patientMissing:Assisted&&Assisted.patientMissing,doctorMissing:Assisted&&Assisted.doctorMissing};
});
