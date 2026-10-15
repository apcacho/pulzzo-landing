/* Same-browser DEMO intake adapter. It never approves a record or changes an existing
 * financial record. Browser storage and role switches are not production security. */
(function(root,factory){const api=factory(root?.PulzzoDemoBridge||(typeof module==='object'&&module.exports?require('../pulzzo-demo-bridge.js'):null),root?.PulzzoPatientDemo||(typeof module==='object'&&module.exports?require('./patient-demo.js'):null),()=>root?.PulzzoCRMAssisted||(typeof module==='object'&&module.exports?require('./crm-assisted.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;if(root){root.PulzzoCRMOffice=api;if(root.document)api.mount(root);}})(typeof window!=='undefined'?window:null,function(bridge,patientDemo,readAssisted){
'use strict';
const BO_KEY='pulzzo_backoffice_demo';
const CRM_KEY='pulzzo_crm_assisted_demo_v1';
const clone=x=>JSON.parse(JSON.stringify(x));
const text=(x,max=500)=>String(x??'').trim().slice(0,max);
const displayText=x=>String(x??'');
const displayTree=x=>clone(x); // Preserve canonical values; escape only at rendering.
const email=x=>text(x).toLowerCase();
const phone=x=>{let n=String(x||'').replace(/\D/g,'');if(n.length===13&&n.startsWith('521'))n=n.slice(3);else if(n.length===12&&n.startsWith('52'))n=n.slice(2);return n;};
const array=x=>Array.isArray(x)?x:[];
function readDatabase(storage){const raw=storage.getItem(BO_KEY);if(!raw)return null;const db=JSON.parse(raw);if(!db||!Array.isArray(db.patients)||!Array.isArray(db.providers))throw Error('El backoffice local no tiene un estado válido.');return db;}
function recordMatches(record,exp){return !!exp&&!!record?.crmIntake&&recordBelongsToContact(record,exp.kind,{id:exp.contactId,type:exp.kind,accountId:exp.holderIdentity?.id},[exp]);}
function readSubmittedRecord(storage,exp){if(!exp||!exp.holderIdentity?.id)return null;const db=readDatabase(storage);if(!db)return null;const rows=(exp.kind==='patient'?db.patients:db.providers).filter(r=>recordMatches(r,exp));if(rows.length>1)throw Error('Hay vínculos ambiguos en backoffice.');if(!rows[0])return null;const r=rows[0],a=r.application||{};const available=bridge&&r.offer&&a.offerReady&&['enviada','sent','offer_sent','oferta_enviada','aceptada','accepted'].includes(String(r.offer.status||'').toLowerCase());return {id:r.id,applicationStatus:text(a.applicationStatus||r.status),offer:available?bridge.publicOffer(r.offer):null,offerFingerprint:available?bridge.fingerprint(r.offer):null,contractReady:!!a.contractReady,expiryStatus:patientDemo?patientDemo.offerExpiryStatus({offer:r.offer,offerAccepted:a.offerAccepted,contractSigned:a.contractSigned}):'unavailable',demo:true};}
const isId=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,179}$/.test(x)&&!['__proto__','constructor','prototype'].includes(x);
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
function localState(storage){
 const raw=storage.getItem(CRM_KEY);if(!raw)return null;
 const state=JSON.parse(raw);if(state?.version!==1||!object(state.contacts)||!object(state.expedients))throw Error('El CRM local no tiene un estado válido.');
 return state;
}
// Resolve the current contact through the actor-scoped store on every read. A
// caller's cached contact or guessed ID cannot widen these lookup results.
function scopedContact(store,contactId,staffOnly,state){
 if(!isId(contactId)||!store||!['admin','kam','leader',...(staffOnly?[]:['holder'])].includes(store.actor?.role))return null;
 const contact=state.contacts?.[contactId];
 if(!contact||contact.id!==contactId||contact.deletedAt||!['patient','doctor'].includes(contact.type))return null;
 if(store.actor.role==='kam'&&contact.assignedKam!==store.actor.id)return null;
 if(store.actor.role==='holder'&&(contact.holderId!==store.actor.id||contact.accountId&&contact.accountId!==store.actor.id))return null;
 return contact;
}
function scopedContext(store,contactId,staffOnly){
 if(!isId(contactId)||!store||!['admin','kam','leader',...(staffOnly?[]:['holder'])].includes(store.actor?.role))return null;
 try{
  const current=store.getContact(contactId),state=store.snapshot(),contact=scopedContact(store,contactId,staffOnly,state);
  if(!current||!contact||current.type!==contact.type||current.assignedKam!==contact.assignedKam)return null;
  return {contact,expedients:Object.values(state.expedients||{}).filter(e=>e.contactId===contactId)};
 }catch(_){return null;}
}
function contactAccount(contact){
 const ids=[contact?.accountId,contact?.holderId].filter(Boolean);
 return ids.length&&ids.every(id=>isId(id)&&id===ids[0])?ids[0]:null;
}
function recordBelongsToContact(record,kind,contact,expedients){
 if(!record||!isId(record.id)||!contact?.id||contact.type&&contact.type!==kind)return false;
 if(contact.accountId&&contact.holderId&&contact.accountId!==contact.holderId)return false;
 const intake=record.crmIntake,account=contactAccount(contact),recordAccounts=[kind==='patient'?record.patientAccountId:record.doctorAccountId,intake?.accountId].filter(Boolean);
 if(recordAccounts.some(id=>!isId(id)||id!==recordAccounts[0]))return false;
 // An explicit conflicting contact link always wins over account similarity.
 if(intake&&(intake.contactId!==contact.id||!isId(intake.expedientId)||!isId(intake.accountId)||!isId(intake.submissionId)||!Number.isFinite(Date.parse(intake.submittedAt))))return false;
 if(intake?.contactId!==contact.id&&!(account&&recordAccounts[0]===account))return false;
 if(account&&recordAccounts[0]!==account)return false;
 if(expedients&&intake){
  const matches=expedients.filter(e=>e.id===intake.expedientId&&e.kind===kind);
  if(matches.length!==1)return false;
  try{const receipt=requireSubmission(matches[0]);if(recordAccounts[0]!==receipt.accountId||intake.submissionId!==receipt.submissionId||intake.submittedAt!==receipt.submittedAt)return false;}catch(_){return false;}
 }
 return true;
}
function contactRecords(db,contact,expedients){
 if(!db)return [];
 const account=contactAccount(contact);
 return [...db.patients.map(record=>({record,kind:'patient'})),...db.providers.map(record=>({record,kind:'doctor'}))].filter(({record})=>record.crmIntake?.contactId===contact.id||array(expedients).some(e=>e.id===record.crmIntake?.expedientId)||account&&[record.patientAccountId,record.doctorAccountId,record.crmIntake?.accountId].includes(account));
}
function uniqueContactRecord(db,contact,expedients){
 const rows=contactRecords(db,contact,expedients);
 return rows.length===1&&recordBelongsToContact(rows[0].record,rows[0].kind,contact,expedients)?rows[0]:null;
}
// Search-only projection for the staff task picker. Never join by display name,
// email or phone, and never copy identifiers into CRM contacts or task records.
function taskIdentityIndex(db){
 const index={contacts:new Map(),expedients:new Map(),accounts:new Map(),ids:new Map()};if(!db)return index;
 const rows=[...db.patients.map(record=>({record,kind:'patient'})),...db.providers.map(record=>({record,kind:'doctor'}))];
 if(rows.some(({record})=>!object(record)||!isId(record.id)))throw Error('Identidad de backoffice inválida.');
 function add(map,id,row){if(!isId(id))return;if(!map.has(id))map.set(id,new Set());map.get(id).add(row);}
 for(const row of rows){
  const {record}=row;add(index.ids,record.id,row);add(index.contacts,record.crmIntake?.contactId,row);add(index.expedients,record.crmIntake?.expedientId,row);
  for(const id of [record.patientAccountId,record.doctorAccountId,record.crmIntake?.accountId])add(index.accounts,id,row);
 }
 return index;
}
function taskIdentityProjection(index,scope){
 const empty={rfc:'',curp:''},{contact,expedients}=scope;
 if(expedients.length>1||expedients.some(e=>e.kind!==contact.type)||[contact.accountId,contact.holderId].some(id=>id!=null&&id!==''&&!isId(id)))return empty;
 const linked=new Set(index.contacts.get(contact.id));
 for(const exp of expedients)for(const row of index.expedients.get(exp.id)||[])linked.add(row);
 for(const row of index.accounts.get(contactAccount(contact))||[])linked.add(row);
 if(linked.size!==1)return empty;
 const {record,kind}=[...linked][0];
 if(!recordBelongsToContact(record,kind,contact,expedients))return empty;
 const wrongAccount=record[kind==='patient'?'doctorAccountId':'patientAccountId'];
 if(index.ids.get(record.id)?.size!==1||wrongAccount!=null&&wrongAccount!=='')return empty;
 // Native handoffs use application.identity; legacy BO records use patient or
 // application. Conflicts fail closed. Clinic representatives are not the owner.
 const sources=kind==='patient'?[record.patient,record.application,record.application?.identity]:[];
 if((kind==='patient'?sources:[record.fiscal,record.medval]).some(source=>source!=null&&!object(source)))return empty;
 const values=key=>kind==='patient'?sources.map(source=>source?.[key]):[key==='rfc'?record.fiscal?.rfc:record.medval?.curp];
 function identifier(key){
  const candidates=values(key).filter(value=>value!=null&&value!=='');
  if(candidates.some(value=>typeof value!=='string'||value.length>80||/[\u0000-\u001f\u007f]/.test(value)))return null;
  const nonempty=candidates.map(value=>value.trim()).filter(Boolean),canonical=nonempty.map(value=>value.toUpperCase().replace(/[\s.-]/g,''));
  return new Set(canonical).size>1?null:nonempty[0]||'';
 }
 const rfc=identifier('rfc'),curp=identifier('curp');return rfc===null||curp===null?empty:{rfc,curp};
}
function taskContactIdentity(storage,store,contactId){
 const empty={rfc:'',curp:''};
 try{
  const scope=scopedContext(store,contactId,true);if(!scope)return empty;
  const identity=taskIdentityProjection(taskIdentityIndex(readDatabase(storage)),scope);
  // Recheck access after the BO read as well, rather than returning a cached
  // projection after a reassignment, archive or concurrent identity change.
  const current=scopedContext(store,contactId,true);
  if(!current||JSON.stringify(current)!==JSON.stringify(scope))return empty;
  return identity;
 }catch(_){return empty;}
}
// One scoped snapshot and BO index for a whole query, followed by one consistency
// check. The batch is ephemeral: callers must not keep it across search/submit.
function taskContactIdentities(storage,store,contactIds){
 try{
  if(!Array.isArray(contactIds)||!store||!['admin','kam','leader'].includes(store.actor?.role))return {};
  const state=store.snapshot(),version=JSON.stringify(state),actor=JSON.stringify(store.actor),byContact=new Map(),scopes=[];
  for(const exp of Object.values(state.expedients||{})){if(!byContact.has(exp.contactId))byContact.set(exp.contactId,[]);byContact.get(exp.contactId).push(exp);}
  for(const id of new Set(contactIds)){const contact=scopedContact(store,id,true,state);if(contact)scopes.push({contact,expedients:byContact.get(id)||[]});}
  if(!scopes.length)return {};
  const index=taskIdentityIndex(readDatabase(storage)),result={};
  for(const scope of scopes)result[scope.contact.id]=taskIdentityProjection(index,scope);
  if(JSON.stringify(store.actor)!==actor||JSON.stringify(store.snapshot())!==version)return {};
  return result;
 }catch(_){return {};}
}
function localExpedientStatus(exp){
 if(!exp)return 'Sin expediente';
 if(exp.submittedAt||exp.submissionSnapshot||['submitted','accepted','signed'].includes(exp.status)){
  try{requireSubmission(exp);return 'Enviado por el titular · pendiente de importar a backoffice';}
  catch(_){return 'Envío pendiente de verificación';}
 }
 if(exp.holderActions?.finalConfirmation)return 'Confirmado por el titular · pendiente de envío';
 return ({draft:exp.kind==='doctor'?'Borrador de registro':'Borrador de solicitud',invited:'Invitación preparada · pendiente del titular',claimed:'En captura por el titular',in_progress:'En captura por el titular',holder_review:'En revisión del titular',needs_correction:'Correcciones pendientes del titular',cancelled:'Expediente cancelado'})[exp.status]||'Expediente en curso';
}
function operationalStatus(storage,contact,store){
 const id=typeof contact==='string'?contact:contact?.id;if(!isId(id))return 'Sin expediente';
 let current=typeof contact==='object'?contact:{id},expedients=[],hasLocalState=false;
 if(store){hasLocalState=true;const scope=scopedContext(store,id,false);if(!scope)return 'Estado no disponible';current=scope.contact;expedients=scope.expedients;}
 else{
  const state=localState(storage);if(!state)return 'Estado no disponible';
  if(state){hasLocalState=true;current=state.contacts[id];if(!current||current.deletedAt)return 'Sin expediente';expedients=Object.values(state.expedients).filter(e=>e.contactId===id);}
 }
 if(expedients.length>1||expedients.some(e=>e.kind!==current.type))return 'Requiere conciliación de identidades';
 const db=readDatabase(storage),linked=contactRecords(db,current,expedients);
 if(linked.length){
  if(linked.length!==1||!recordBelongsToContact(linked[0].record,linked[0].kind,current,hasLocalState?expedients:undefined))return 'Requiere conciliación de identidades';
  const r=linked[0].record;return text(r.application?.applicationStatus||r.status||'en_revision');
 }
 return localExpedientStatus(expedients[0]);
}
function validExternalReference(db,key,id,contact,expedients){
 if(!db||!isId(contact?.id)||!isId(id))return false;
 const own=uniqueContactRecord(db,contact,expedients);
 if(['creditId','requestId'].includes(key))return own?.kind==='patient'&&own.record.id===id&&db.patients.filter(r=>r.id===id).length===1;
 if(!['providerId','registrationId'].includes(key))return false;
 const providers=db.providers.filter(r=>r.id===id);if(providers.length!==1)return false;
 if(own?.kind==='doctor'&&own.record.id===id)return true;
 if(contact.type!=='patient'||key==='registrationId'||own?.kind!=='patient')return false;
 const r=own.record;
 return [...array(r.application?.procedureProviders),...array(r.offer?.financedProcedures),...array(r.demoServicingIdentity?.procedures)].some(p=>p?.providerId===id);
}
function validateExternalReference(storage,key,id,contact){
 if(!isId(contact?.id))return false;
 const state=localState(storage);if(!state)return false;
 const current=state.contacts[contact.id];
 if(!current||current.deletedAt)return false;
 const expedients=state?Object.values(state.expedients).filter(e=>e.contactId===current.id):undefined;
 if(expedients?.length>1)return false;
 return validExternalReference(readDatabase(storage),key,id,current,expedients);
}
function referenceStatus(record){
 const status=text(record.application?.applicationStatus||record.status||'en_revision',100);
 const labels={en_revision:'En revisión',en_evaluacion:'En evaluación',aprobada:'Aprobada',aprobado:'Aprobado',rechazada:'Rechazada',rechazado:'Rechazado',perfil_en_revision:'Perfil en revisión',perfil_aprobado:'Perfil aprobado',oferta_enviada:'Oferta enviada',oferta_aceptada:'Oferta aceptada',contrato_firmado:'Contrato firmado',activo:'Activo',activa:'Activa',liquidado:'Liquidado'};
 return labels[status]||status.replace(/_/g,' ');
}
function listReferenceChoices(storage,store,contactId){
 const choices={expedientId:[],creditId:[],providerId:[],requestId:[],registrationId:[]},scope=scopedContext(store,contactId,true);if(!scope)return choices;
 const {contact,expedients}=scope,name=text(contact.name,160),db=readDatabase(storage);
 // A duplicate local identity must be reconciled instead of silently choosing it.
 if(expedients.length===1){
  const exp=expedients[0],linked=contactRecords(db,contact,expedients),own=uniqueContactRecord(db,contact,expedients);
  const status=linked.length&&!own?'Requiere conciliación de identidades':own?.record.crmIntake?.expedientId===exp.id?referenceStatus(own.record):localExpedientStatus(exp);
  if(isId(exp.id)&&exp.kind===contact.type)choices.expedientId.push({id:exp.id,label:(exp.kind==='doctor'?'Registro asistido':'Solicitud asistida')+' · '+name+' · '+status});
 }
 if(!db)return choices;
 for(const key of ['creditId','requestId','providerId','registrationId']){
  const rows=['creditId','requestId'].includes(key)?db.patients:db.providers;
  for(const record of rows){
   if(!validExternalReference(db,key,record.id,contact,expedients))continue;
   const own=recordBelongsToContact(record,rows===db.patients?'patient':'doctor',contact,expedients);
   const label=rows===db.patients?'Solicitud / crédito · '+name+' · '+record.id+' · '+referenceStatus(record):'Proveedor · '+text(record.profile?.name||record.name||'Proveedor vinculado',160)+' · '+record.id+(own?' · '+referenceStatus(record):'');
   choices[key].push({id:record.id,label});
  }
  choices[key].sort((a,b)=>a.label.localeCompare(b.label,'es')||a.id.localeCompare(b.id));
 }
 return choices;
}
// Canonical CRM ficha only: this is not a holder invitation or financial BO link.
// The existing route rechecks the active actor, and does not carry credentials.
function expedienteUrl(store,contactId,expedientId){
 const scope=scopedContext(store,contactId,true);if(!scope||!isId(expedientId)||scope.expedients.length!==1)return null;
 const exp=scope.expedients[0];if(exp.id!==expedientId||exp.kind!==scope.contact.type)return null;
 return 'backoffice.html#crm/'+scope.contact.type+'/contacts/'+encodeURIComponent(contactId);
}
function accountExists(state,kind,id){return Object.values(state?.expedients||{}).some(e=>e.kind===kind&&e.holderIdentity?.id===id&&e.holderIdentity.demo===true&&e.submissionSnapshot?.accountId===id&&e.submittedAt);}
function requireSubmission(exp){
 const p=exp?.submissionSnapshot,identity=exp?.holderIdentity;
 if(!p||p.schema!=='pulzzo.crm.submission.v1'||p.demo!==true||!['submitted','accepted','signed'].includes(exp.status)||!exp.submittedAt||!Number.isFinite(Date.parse(exp.submittedAt))||p.submittedAt!==exp.submittedAt||p.expedientId!==exp.id||p.contactId!==exp.contactId||p.accountId!==identity?.id||p.kind!==exp.kind)throw Error('El titular debe enviar primero este mismo expediente demo.');
 if(!identity?.demo||!identity.verifiedAt||!Number.isFinite(Date.parse(identity.verifiedAt))||JSON.stringify(p.holderIdentity)!==JSON.stringify(identity))throw Error('La identidad del titular no coincide con la constancia.');
 if(!Number.isSafeInteger(p.revision)||p.revision<1||p.revision!==exp.submissionRevision||JSON.stringify(p.fields)!==JSON.stringify(exp.fields)||JSON.stringify(p.documents)!==JSON.stringify(exp.documents))throw Error('La constancia de envío no coincide con los datos bloqueados.');
 if(JSON.stringify(p.onboarding||null)!==JSON.stringify(exp.onboarding||null))throw Error('La captura completa no coincide con la constancia bloqueada.');
 const required=exp.kind==='patient'?['otp','buroConsent','finalConfirmation']:['otp','finalConfirmation'];
 if(exp.onboarding)required.push('legalConsent');
 for(const action of required){const a=p.holderActions?.[action];if(!a||a.actorId!==p.accountId||a.actorRole!=='holder'||a.confirmed!==true||a.demo!==true||!Number.isFinite(Date.parse(a.at)))throw Error('Falta una confirmación personal del titular.');}
 if(exp.onboarding&&(!p.holderActions.legalConsent.termsVersion||!p.holderActions.legalConsent.privacyVersion))throw Error('Falta la revisión personal de términos y privacidad de la demo.');
 if(JSON.stringify(p.holderConfirmation)!==JSON.stringify(p.holderActions.finalConfirmation)||!p.submissionId)throw Error('Falta la confirmación del titular.');
 if(exp.kind==='doctor'&&!(['holder','authorized_representative'].includes(p.holderConfirmation.capacity)&&p.holderConfirmation.authorityConfirmed===true))throw Error('Faltan facultades confirmadas del titular o representante.');
 return clone(p);
}

// The complete shared form remains attached to its exact frozen intake. Only
// explicit capture fields project into operational records; financial decisions
// and verification flags can never be imported from editable form JSON.
function omitInlineBytes(value){if(Array.isArray(value))return value.map(omitInlineBytes);if(object(value))return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='dataUrl').map(([key,v])=>[key,omitInlineBytes(v)]));return value;}
function lightOnboarding(full){const value=clone(full);value.records=Object.fromEntries(Object.entries(value.records).map(([key,raw])=>{try{return [key,JSON.stringify(omitInlineBytes(JSON.parse(raw)))];}catch(_){return [key,raw];}}));return value;}
function applyFullOnboarding(record,payload){
 const full=payload.onboarding;if(!full)return;
 if(full.schema!=='pulzzo.crm.onboarding.v1'||!object(full.records))throw Error('Captura completa inválida.');
 const read=key=>{if(full.records[key]==null)return {};const value=JSON.parse(full.records[key]);if(!object(value))throw Error('Registro de captura inválido.');return value;};
 const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.prototype.hasOwnProperty.call(value,key)).map(key=>[key,clone(value[key])]));
 record.crmIntake.onboarding=lightOnboarding(full);
 if(payload.kind==='patient'){
  const capture=read('pulzzo_application'),person=read('pulzzo_patient');
  const state={...capture,applicationId:payload.expedientId,patientAccountId:payload.accountId,applicationSubmitted:true,applicationSubmittedAt:payload.submittedAt,geoDone:false,creditAuthConfirmed:false,offerAccepted:false,contractSigned:false,demoBridgeCaseId:record.id};
  // Reuse the established positive-whitelist transport for full procedure,
  // identity, income, references and provider assignments.
  const handoff=bridge.makeHandoff(state,{...person,patientAccountId:payload.accountId});
  record.patient={...handoff.patient,fullName:displayText(text(payload.fields.fullName,160)),email:email(payload.holderIdentity.email),phone:text(payload.fields.phone,30)};
  record.application={...handoff.application,applicationId:record.id,sourceApplicationId:payload.expedientId,applicationSubmittedAt:payload.submittedAt,geoDone:false,creditAuthConfirmed:false,creditAuth:{demo:true,backendStatus:'not_connected',channel:'holder_demo_simulation'},offerReady:false,offerAccepted:false,offerRejected:false,contractSigned:false};
  const procedure=object(capture.procedure)?capture.procedure:{};
  const beneficiary=object(procedure.patientRecipient)?procedure.patientRecipient:object(capture.patientRecipient)?capture.patientRecipient:{};
  record.application.patientRecipient=displayTree(pick(beneficiary,['forWhom','isForApplicant','borrowerName','patientName','relationship','relationshipDetail','relationshipOther']));
  for(const key of ['isForApplicant','borrowerName','patientName','patientRelationship','patientRelationshipDetail','patientRelationshipOther','doctorState','doctorPrefix','when','doctorId','doctorSource','forWhom']){const value=procedure[key]??capture[key];if(['string','boolean','number'].includes(typeof value))record.application[key]=displayTree(value);}
  record.locationCapture=clone({geoDone:!!capture.geoDone,geolocation:capture.geolocation||null});
  record.references=clone(handoff.references);
  record.application.comfortablePayment=Number(String(capture.comfortablePayment||'').replace(/[^\d.-]/g,''))||0;
  record.application.ciecChoice=['yes','no'].includes(capture.ciecChoice)?capture.ciecChoice:'';
 }else{
  const capture=read('pulzzoDoctorOnboardingCleanV3');
  for(const group of ['profile','contact','fiscal','links','profileData','medval','clinicDocs'])if(object(capture[group]))record[group]=displayTree(capture[group]);
  record.profile={...record.profile,name:displayText(text(payload.fields.fullName,160)),email:email(payload.holderIdentity.email),accountType:capture.profile?.accountType==='clinica'?'Clínica u hospital':'Doctor'};
  record.contact={...record.contact,registered:text(payload.fields.phone,30),capturedVisibilityPreference:capture.contact?.visible??null,visible:false};
  record.specialties=clone(array(capture.specialties));
  record.procedures=displayTree(array(capture.procedures));
  // Photo content is preserved as a candidate only. Publication retains its
  // independent holder confirmation, review and optional-photo task workflow.
  record.onboardingCapture=displayTree(omitInlineBytes(pick(capture,['files','photoMode'])));
  record.status='perfil_en_revision';
 }
}

function prepareImport(database,exp,actor){
 const payload=requireSubmission(exp),db=clone(database),kind=payload.kind,rows=kind==='patient'?db.patients:db.providers;
 if(!['patient','doctor'].includes(kind)||!Array.isArray(rows))throw Error('Tipo de expediente inválido.');
 const exact=rows.filter(r=>r.crmIntake?.expedientId===exp.id);
 if(exact.length){if(exact.length===1&&recordMatches(exact[0],exp)&&exact[0].crmIntake.submissionId===payload.submissionId)return {alreadyImported:true,id:exact[0].id};throw Error('La identidad ya tiene otro vínculo.');}
 if(exp.holderActions?.offerAcceptance||exp.holderActions?.contractSignature||exp.offerAccepted||exp.contractSigned)throw Error('Este expediente ya tiene una decisión financiera. Recupera su vínculo previo de backoffice; no se recreará como una solicitud nueva.');
 const f=payload.fields||{},holderEmail=email(payload.holderIdentity?.email||f.email);
 if(!holderEmail||holderEmail!==email(f.email))throw Error('El correo del expediente no corresponde al titular verificado.');
 const existing=[...array(db.patients),...array(db.providers)].find(r=>r.patientAccountId===payload.accountId||r.doctorAccountId===payload.accountId||r.crmIntake?.contactId===payload.contactId||email(r.patient?.email||r.profile?.email||r.email)===holderEmail||phone(f.phone)&&phone(r.patient?.phone||r.contact?.registered||r.contact?.officePhone||r.phone)===phone(f.phone));
 if(existing)throw Error('Ya existe una cuenta o expediente con esta identidad en backoffice. Concilia el registro existente; no se creó un duplicado.');
 const id=(kind==='patient'?'APP-CRM-':'MED-CRM-')+exp.id;
 if([...db.patients,...db.providers].some(r=>r.id===id))throw Error('El ID ya existe.');
 const at=new Date().toISOString(),files=array(payload.documents).map((d,i)=>{
  const sourceExp={id:payload.expedientId,kind:payload.kind,documents:payload.documents,onboarding:payload.onboarding};
  const inline=payload.onboarding?readAssisted()?.getOnboardingDocument(sourceExp,d.id):null;
  if(d.inlineEvidence&&!inline)throw Error('El documento completo ya no coincide con sus bytes registrados.');
  return {id:id+'-DOC-'+i,type:displayText(text(inline?.documentType||(d.onboardingPath?d.onboardingPath.split('.')[1]:null)||d.label||d.documentType||'Documento demo',100)),status:'pending',source:'crm_demo',fileName:inline||d.evidenceId?displayText(text(inline?.name||d.fileName,120)):'Documento ficticio '+(i+1),mimeType:text(inline?.mimeType||d.mimeType||d.type,100),size:Number(inline?.size||d.size)||0,metadataOnly:!inline,evidenceId:text(d.evidenceId||'',180),onboardingPath:text(d.onboardingPath||'',240),sourceDocumentId:text(d.id||'',180),...(inline?{dataUrl:inline.dataUrl}:{}),uploadedBy:text(d.uploadedBy||d.actorId,180),uploadedAt:text(d.uploadedAt,40),contactId:payload.contactId,simulatedPreview:inline?'Archivo ficticio compartido del mismo expediente.':'Archivo demo local. La revisión no acredita validez real; abre la evidencia en CRM.'};
 });
 const crmIntake={expedientId:exp.id,contactId:payload.contactId,accountId:payload.accountId,submissionId:payload.submissionId,submittedAt:payload.submittedAt,importedAt:at,importedBy:text(actor,180),provenance:displayTree(payload.provenance||{}),demo:true};
 const event={at,createdAt:at,user:text(actor,180),action:'Expediente CRM importado para revisión',comment:'Alta demo confirmada por titular. Sin aprobación automática.'};
 let record;
 if(kind==='patient'){
  const amount=Number(f.requestedAmount),term=Number(f.termMonths);if(!(amount>0&&Number.isFinite(amount)&&Number.isInteger(term)&&term>0))throw Error('Monto y plazo inválidos.');
  record={id,patientAccountId:payload.accountId,applicationDate:String(payload.submittedAt).slice(0,10),patient:{fullName:text(f.fullName||f.name,160),email:holderEmail,phone:text(f.phone,30),address:text(f.address,500),incomeMonthly:Number(f.monthlyIncome)||0,incomeType:text(f.incomeType||'Por revisar',100)},application:{applicationId:id,sourceApplicationId:exp.id,applicationCreatedAt:exp.createdAt,applicationSubmittedAt:payload.submittedAt,applicationStatus:'en_evaluacion',stage:'En evaluación',requestedAmount:amount,procedureCost:amount,selectedTerm:term,termMonths:term,procedure:text(f.procedure,200),procedures:[text(f.procedure,200)],doctorName:text(f.doctorName||'Proveedor por definir',160),identityDone:false,identity:{registeredName:text(f.fullName||f.name,160),address:text(f.address,500)},incomeDone:false,documentsDone:false,documentMetadataOnly:true,creditAuthConfirmed:false,creditAuth:{demo:true,backendStatus:'not_connected',channel:'holder_demo_simulation'},referencesSaved:false,offerReady:false,offerAccepted:false,offerRejected:false,contractSigned:false},offer:null,references:[],documents:files,timeline:[event],notes:[],demoBridge:{sourceApplicationId:exp.id},crmIntake};
 }else{
  record={id,doctorAccountId:payload.accountId,status:'perfil_en_revision',profile:{name:text(f.fullName||f.name||f.clinicName,160),email:holderEmail,prefix:'',accountType:f.representativeRole==='representative'?'Clínica u hospital':'Doctor',state:text(f.state,80),city:text(f.city,80)},contact:{registered:text(f.phone,30),officePhone:text(f.phone,30),officeWhats:text(f.phone,30),visible:false},files,fiscal:{},links:{},profileData:{},procedures:[],medval:{medicalLicenseNumber:text(f.professionalLicense,100),specialty:text(f.specialty,120)},clinicDocs:{street:text(f.clinicAddress,500)},timeline:[event],notes:[],crmIntake};
 }
 applyFullOnboarding(record,payload);
 rows.push(record);if(!Array.isArray(db.audit))db.audit=[];db.audit.unshift({...event,entity:id,entityKind:kind==='patient'?'patient':'provider'});return {alreadyImported:false,id,record,database:db};
}
function prepareDecision(database,exp,actor){
 if(!bridge)throw Error('El puente financiero demo no está disponible.');
 const payload=requireSubmission(exp),db=clone(database),matches=array(db.patients).filter(r=>recordMatches(r,exp)),record=matches[0];
 if(exp.kind!=='patient'||matches.length!==1)throw Error('No hay una solicitud de paciente vinculada de forma única.');
 const accepted=exp.holderActions?.offerAcceptance,signed=exp.holderActions?.contractSignature,received=exp.receivedOffer;
 if(!accepted||accepted.actorId!==payload.accountId||accepted.demo!==true||accepted.confirmed!==true||!received?.offerFingerprint||accepted.offerFingerprint!==received.offerFingerprint)throw Error('Falta la aceptación personal del titular de esta oferta.');
 if(!bridge.matchesFingerprint(received.offerFingerprint,record.offer))throw Error('La oferta cambió. El titular debe recibir y revisar la versión vigente.');
 if(!record.application?.offerAccepted){const acceptedAt=new Date(accepted.at);if(!Number.isFinite(acceptedAt.getTime())||acceptedAt.getTime()>Date.now()||!patientDemo||['expired','invalid'].includes(patientDemo.offerExpiryStatus({offer:record.offer},acceptedAt)))throw Error('La aceptación no corresponde a una oferta vigente.');}
 if(signed&&(signed.actorId!==payload.accountId||signed.demo!==true||signed.confirmed!==true||signed.offerFingerprint!==received.offerFingerprint||!record.application?.contractReady))throw Error('El contrato no está habilitado o no pertenece a la oferta aceptada.');
 if(record.crmIntake?.holderDecisionAt===accepted.at&&(!signed||record.crmIntake?.holderSignedAt===signed.at))return {alreadyImported:true,id:record.id};
 const o=received.offer||{},outcome={offerAccepted:true,offerAcceptedAt:accepted.at,contractSigned:!!signed||!!record.application?.contractSigned};
 if(signed){outcome.signatureStatus='firmado_demo';outcome.contractSignedAt=signed.at;}
 for(const k of ['paymentFrequency','paymentDayOption','paymentDays','preferredPaymentDay'])if(o[k]!==undefined)outcome[k]=clone(o[k]);
 bridge.importHandoff(db,{version:1,demo:true,id:record.id,patientAccountId:payload.accountId,sourceApplicationId:exp.id,offerFingerprint:received.offerFingerprint,outcome,application:{}});
 record.crmIntake.holderDecisionAt=accepted.at;if(signed)record.crmIntake.holderSignedAt=signed.at;
 if(!Array.isArray(db.audit))db.audit=[];db.audit.unshift({at:new Date().toISOString(),user:text(actor,180),entity:record.id,entityKind:'patient',action:signed?'Firma DEMO del titular recibida':'Aceptación DEMO del titular recibida',comment:'Decisión personal simulada, contrastada contra la oferta exacta. No constituye firma ni autorización real.'});
 return {alreadyImported:false,id:record.id,database:db};
}
async function importExpedient({store,office,evidenceModule,isCurrent},expedientId){
 if(!office)throw Error('Abre el backoffice para importar.');office.assertCurrent();const state=store.snapshot(),exp=state.expedients[expedientId];const kind=exp?.kind;
 if(kind==='patient'?!office.canImportPatient():!office.canImportProvider())throw Error('El rol actual no puede importar este expediente.');
 const actor=office.actor(),originalDatabase=JSON.stringify(office.getDatabase());
 function current(){try{office.assertCurrent();return (!isCurrent||isCurrent())&&office.actor()===actor&&store.snapshot().revision===state.revision&&JSON.stringify(office.getDatabase())===originalDatabase&&(kind==='patient'?office.canImportPatient():office.canImportProvider());}catch(_){return false;}}
 const result=prepareImport(office.getDatabase(),exp,actor);if(result.alreadyImported)return result;
 if(exp.onboarding){
  const rows=(exp.documents||[]).filter(d=>d.evidenceId);
  if(rows.length){
   const module=evidenceModule||(typeof globalThis!=='undefined'&&globalThis.PulzzoCRMEvidence);if(!module)throw Error('No se pueden verificar los archivos locales antes de importar.');
   const service=module.createEvidenceStore({isCurrent:current});
   try{for(const row of rows){
    if(!current())throw Error('La vista o el expediente cambió durante la comprobación.');
    const file=await service.get(row.evidenceId);
    if(!file?.blob||file.id!==row.evidenceId||file.contactId!==exp.contactId||file.size!==row.size||file.mimeType!==row.mimeType||file.name.slice(0,120)!==row.fileName||row.uploadedBy&&file.actorId!==row.uploadedBy||row.uploadedAt&&file.uploadedAt!==row.uploadedAt)throw Error('Falta un archivo o no coincide con el expediente. No se importó ningún registro.');
    if(await module.validateBlob(file.blob)!==row.mimeType)throw Error('El contenido del archivo no coincide con su tipo. No se importó ningún registro.');
   }}finally{await service.close();}
  }
 }
 if(!current())throw Error('La sesión, el expediente o backoffice cambió durante la comprobación.');
 office.assertCurrent();if(store.snapshot().revision!==state.revision)throw Error('El expediente CRM cambió. Actualiza antes de importar.');
 const saved=office.commitNew(expedientId,state.revision);office.refresh();return {alreadyImported:!!saved.alreadyImported,id:saved.id};
}
async function readEvidence({office,evidenceModule,kind,entityId,descriptor,isCurrent}){
 office.assertCurrent();const actor=office.actorId(),raw=JSON.stringify(office.getDatabase()),database=office.getDatabase();
 const row=(kind==='patient'?database.patients:database.providers).find(r=>r.id===entityId);
 const documents=kind==='patient'?row?.documents:row?.files;
 const linked=(documents||[]).flatMap(d=>[d,...(d.files||[])]).some(d=>JSON.stringify(d)===JSON.stringify(descriptor));
 if(!office.canReadDocument(kind)||!row?.crmIntake?.contactId||!linked||!descriptor?.evidenceId)throw Error('No tienes acceso a esta evidencia vinculada.');
 function current(){try{office.assertCurrent();return office.actorId()===actor&&office.canReadDocument(kind)&&JSON.stringify(office.getDatabase())===raw&&(!isCurrent||isCurrent());}catch(_){return false;}}
 const service=evidenceModule.createEvidenceStore({isCurrent:current});
 try{
  const file=await service.get(descriptor.evidenceId);
  if(!current())throw Error('La sesión o el expediente cambió durante la lectura.');
  if(!file?.blob||file.id!==descriptor.evidenceId||file.contactId!==row.crmIntake.contactId||file.size!==descriptor.size||file.mimeType!==descriptor.mimeType||descriptor.uploadedBy&&file.actorId!==descriptor.uploadedBy||descriptor.uploadedAt&&file.uploadedAt!==descriptor.uploadedAt)throw Error('El archivo no está disponible o no coincide con este expediente.');
  if(await evidenceModule.validateBlob(file.blob)!==file.mimeType||!current())throw Error('El archivo o la sesión no permiten una vista previa.');
  return file;
 }finally{await service.close();}
}
function mount(w){
 const office=w.PulzzoCRMOfficeAdapter;if(!office||!w.PulzzoCRMStore)return;let importEpoch=0,importing=false;w.addEventListener?.('pagehide',()=>{importEpoch++;});
 const doc=w.document,box=doc.createElement('section');box.id='crm-intake-panel';box.className='card crm-office-panel';box.hidden=true;
 const make=(tag,label)=>{const node=doc.createElement(tag);if(label)node.textContent=label;return node;};
 const heading=make('h2','Altas CRM y registro asistido · DEMO');
 const help=make('p','Importa altas confirmadas por el titular. El backoffice conserva revisión y aprobación independientes. Datos y autorizaciones ficticios.');
 const pickerLabel=make('label','Expediente enviado');const select=make('select');select.setAttribute('aria-label','Expediente CRM enviado');pickerLabel.appendChild(select);
 const actions=make('div');actions.className='crm-office-actions';
 const button=label=>{const b=make('button',label);b.type='button';b.className='btn btn-secondary btn-sm';actions.appendChild(b);return b;};
 const load=button('Actualizar altas'),run=button('Importar expediente seleccionado'),decision=button('Recibir decisión del titular');
 const link=make('a','Abrir CRM demo');link.href='backoffice.html#crm';actions.appendChild(link);
 const review=make('div');review.className='crm-office-review';review.appendChild(make('h3','Observaciones y reenvío de campos'));
 const scopeHelp=make('p','Selecciona solo campos observados. El titular reenvía los cambios y backoffice los aprueba después de revisar. No se modifican importes ni contratos.');review.appendChild(scopeHelp);
 const fields=make('fieldset');fields.appendChild(make('legend','Campos habilitados para corrección'));review.appendChild(fields);
 const reasonLabel=make('label','Motivo de la observación');const reason=make('textarea');reason.maxLength=1000;reason.rows=2;reasonLabel.appendChild(reason);review.appendChild(reasonLabel);
 const reviewActions=make('div');reviewActions.className='crm-office-actions';
 const reviewButton=label=>{const b=make('button',label);b.type='button';b.className='btn btn-secondary btn-sm';reviewActions.appendChild(b);return b;};
 const request=reviewButton('Solicitar corrección seleccionada'),receive=reviewButton('Recibir campos reenviados'),approve=reviewButton('Aprobar correcciones revisadas');review.appendChild(reviewActions);
 const detail=make('pre');detail.className='crm-office-detail';review.appendChild(detail);
 const docReview=make('div');docReview.className='crm-office-review';docReview.appendChild(make('h3','Corrección de un documento exacto'));
 const docLabel=make('label','Documento observado');const docSelect=make('select');docSelect.setAttribute('aria-label','Documento CRM observado');docLabel.appendChild(docSelect);docReview.appendChild(docLabel);
 const docReasonLabel=make('label','Motivo documental / motivo de rechazo');const docReason=make('textarea');docReason.rows=2;docReason.maxLength=1000;docReasonLabel.appendChild(docReason);docReview.appendChild(docReasonLabel);
 const docActions=make('div');docActions.className='crm-office-actions';const docButton=label=>{const b=make('button',label);b.type='button';b.className='btn btn-secondary btn-sm';docActions.appendChild(b);return b;};
 const docRequest=docButton('Solicitar nueva versión'),docReceive=docButton('Recibir versión reenviada'),docApprove=docButton('Aprobar versión revisada'),docReject=docButton('Rechazar versión con motivo');docReject.className='btn btn-danger btn-sm';docReview.appendChild(docActions);
 const docDetail=make('pre');docDetail.className='crm-office-detail';docReview.appendChild(docDetail);
 const previewActions=make('div');previewActions.className='crm-office-actions';docReview.appendChild(previewActions);
 const preview=make('dialog');preview.className='crm-office-preview';const previewTitle=make('h3','Documento ficticio');const previewBody=make('div');const previewClose=make('button','Cerrar vista previa');previewClose.type='button';previewClose.className='btn btn-secondary btn-sm';preview.append(previewTitle,previewBody,previewClose);docReview.appendChild(preview);
 let previewURL=null,previewEpoch=0;function clearPreview(){previewEpoch++;if(previewURL){w.URL.revokeObjectURL(previewURL);previewURL=null;}previewBody.replaceChildren();}
 function closePreview(){clearPreview();if(preview.open&&preview.close)preview.close();else preview.removeAttribute?.('open');}
 previewClose.addEventListener('click',closePreview);preview.addEventListener('cancel',clearPreview);
 w.addEventListener?.('pagehide',closePreview);w.addEventListener?.('storage',closePreview);
 async function openEvidence(metadata){
  closePreview();const epoch=previewEpoch;
  try{const {state,exp}=selected(),actor=office.actorId(),selectedId=select.value,raw=w.localStorage.getItem(BO_KEY);
   if(!office.canReviewDocument?.(exp.kind)||!w.PulzzoCRMEvidence||!metadata?.evidenceId)throw Error('No hay una evidencia documental disponible para este rol.');
   const service=w.PulzzoCRMEvidence.createEvidenceStore();let file;
   try{file=await service.get(metadata.evidenceId);if(!file||file.contactId!==exp.contactId||file.mimeType!==metadata.mimeType||file.size!==metadata.size)throw Error('La evidencia local no coincide con esta versión.');await w.PulzzoCRMEvidence.validateBlob(file.blob);}finally{await service.close();}
   if(epoch!==previewEpoch||select.value!==selectedId||office.actorId()!==actor||!office.canReviewDocument?.(exp.kind)||getStore().snapshot().revision!==state.revision||w.localStorage.getItem(BO_KEY)!==raw)return;
   previewURL=w.URL.createObjectURL(file.blob);previewTitle.textContent='Archivo ficticio · '+file.name;previewBody.replaceChildren();
   if(file.mimeType.startsWith('image/')){const image=make('img');image.src=previewURL;image.alt='Documento ficticio '+file.name;previewBody.appendChild(image);}else{const frame=make('iframe');frame.src=previewURL;frame.title='Documento ficticio';frame.setAttribute('sandbox','');previewBody.appendChild(frame);void w.PulzzoCRMEvidence.renderPDFFrame?.(frame,file.blob,()=>epoch===previewEpoch&&select.value===selectedId&&office.actorId()===actor&&office.canReviewDocument?.(exp.kind)&&getStore().snapshot().revision===state.revision&&w.localStorage.getItem(BO_KEY)===raw);}
   const download=make('a','Descargar esta versión ficticia');download.href=previewURL;download.download=file.name;previewBody.appendChild(download);if(preview.showModal)preview.showModal();else preview.setAttribute('open','');
  }catch(e){if(epoch===previewEpoch)status.textContent=e.message;}
 }
 function evidenceButton(label,metadata){if(!metadata?.evidenceId)return;const b=make('button',label);b.type='button';b.className='btn btn-secondary btn-sm';b.addEventListener('click',()=>openEvidence(metadata));previewActions.appendChild(b);}

 const status=make('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');box.append(heading,help,pickerLabel,actions,review,docReview,status);(doc.querySelector('main')||doc.body).appendChild(box);
 const getStore=()=>w.PulzzoCRMStore.createStore({storage:w.localStorage,actor:{id:office.actorId(),role:'admin'}});
 function selected(){const s=getStore().snapshot(),exp=s.expedients[select.value];if(!exp||!(exp.kind==='patient'?(office.canReadPatient?.()??office.canImportPatient()):(office.canReadProvider?.()??office.canImportProvider())))throw Error('No tienes acceso a este expediente.');return {state:s,exp};}
 function showReview(){importEpoch++;
  closePreview();previewActions.replaceChildren();fields.replaceChildren(make('legend','Campos habilitados para corrección'));reason.value='';detail.textContent='';docSelect.replaceChildren();docDetail.textContent='';docReason.value='';
  try{const {exp}=selected(),module=w.PulzzoCRMCorrections;decision.disabled=exp.kind!=='patient'||!office.canImportPatient();run.disabled=!(exp.kind==='patient'?office.canImportPatient():office.canImportProvider());const canFields=exp.kind==='patient'?office.canImportPatient():office.canImportProvider();for(const b of [request,receive,approve])b.disabled=!canFields;review.hidden=!module;docReview.hidden=!module||!office.canReviewDocument?.(exp.kind);
   if(!module)return;
   for(const [key,label] of Object.entries(module.FIELD_LABELS[exp.kind]||{})){const wrap=make('label'),check=make('input');check.type='checkbox';check.value=key;wrap.append(check,doc.createTextNode(label));fields.appendChild(wrap);}
   const r=module.readReview(w.localStorage,exp);detail.textContent=r?JSON.stringify(r,null,2):'No hay observaciones para este expediente. Importa el alta primero.';
   if(!docReview.hidden){for(const d of module.listDocumentOptions(w.localStorage,exp)){const option=make('option');option.value=d.id||d.docId;option.textContent=(d.documentType||d.type||d.label||'Documento')+' · '+(d.fileName||'Versión local')+' · '+option.value;docSelect.appendChild(option);}const dr=module.readDocumentReview(w.localStorage,exp);docDetail.textContent=dr?JSON.stringify(dr,null,2):'Sin observación documental activa. Elige el documento exacto antes de solicitar una versión.';if(dr){evidenceButton('Ver versión actual',dr.activeDocument);evidenceButton('Ver versión recibida',dr.candidate);for(const [i,h] of (dr.history||[]).entries())evidenceButton('Ver historial '+(i+1)+' · '+h.status,h.document);}docRequest.disabled=!docSelect.options.length;}

  }catch(e){detail.textContent=e.message;docDetail.textContent=e.message;}
 }
 function refresh(){
  select.replaceChildren();
  try{const patientAllowed=office.canReadPatient?.()??office.canImportPatient(),providerAllowed=office.canReadProvider?.()??office.canImportProvider();box.hidden=!patientAllowed&&!providerAllowed;if(box.hidden){run.disabled=true;decision.disabled=true;return;}
   const state=getStore().snapshot();for(const exp of Object.values(state.expedients)){if(!exp.submittedAt||exp.kind==='patient'&&!patientAllowed||exp.kind==='doctor'&&!providerAllowed)continue;const option=make('option');option.value=exp.id;option.textContent=(exp.kind==='patient'?'Paciente':'Doctor/clínica')+' · '+(state.contacts[exp.contactId]?.name||exp.contactId)+' · '+exp.id;select.appendChild(option);}
   run.disabled=!select.options.length;decision.disabled=!patientAllowed||!select.options.length;review.hidden=!select.options.length;docReview.hidden=!select.options.length;status.textContent=select.options.length?'Selecciona un alta confirmada. El envío inicial y la revisión son pasos separados.':'No hay altas CRM enviadas por el titular.';if(select.options.length)showReview();void autoImport();
  }catch(e){status.textContent=e.message;run.disabled=true;decision.disabled=true;review.hidden=true;docReview.hidden=true;}
 }
 // v36: submitted expedientes are imported automatically (idempotent; the manual button keeps working).
 let autoBusy=false;async function autoImport(){if(autoBusy||importing||box.hidden)return;autoBusy=true;let imported=0;
  try{const state=getStore().snapshot();for(const exp of Object.values(state.expedients)){if(!exp.submittedAt||(exp.kind==='patient'?!office.canImportPatient():!office.canImportProvider()))continue;
    let done=false;try{done=!!readSubmittedRecord(w.localStorage,exp);}catch(_){done=true;}if(done)continue;
    try{const r=await importExpedient({store:getStore(),office,evidenceModule:w.PulzzoCRMEvidence},exp.id);if(!r.alreadyImported)imported++;}catch(e){status.textContent='No se pudo incorporar automáticamente '+exp.id+': '+e.message;}}
  }catch(_){/* v37: accounts without CRM directory access (Cartera, Operaciones, Riesgo, Solo lectura) cannot open the CRM store; nothing to auto-import, no uncaught error. */}finally{autoBusy=false;}if(imported){try{office.refresh();}catch(_){}status.textContent=imported+' solicitud(es) enviada(s) incorporada(s) automáticamente a revisión.';}}
 // v36: registrations appear in Solicitudes from registration time as «En captura» (read-only; evaluation/offer disabled until the client submits).
 function inCaptureRows(kind){let state;try{state=getStore().snapshot();}catch(_){return [];}const session=w.PulzzoCRMOnboarding;return Object.values(state.expedients).filter(exp=>exp.kind===kind&&!exp.submittedAt&&(exp.initialRegistration||exp.holderIdentity)&&state.contacts[exp.contactId]&&!state.contacts[exp.contactId].deletedAt).map(exp=>{let summary=null;try{summary=session&&session.summary?session.summary(exp):null;}catch(_){summary=null;}const missing=Array.isArray(summary?.missing)?summary.missing.length:null,docs=summary?.documentCount??(exp.documents||[]).length;return {exp,contact:state.contacts[exp.contactId],missing,docs};}).sort((a,b)=>String(b.exp.createdAt).localeCompare(String(a.exp.createdAt)));}
 function inCapturePanel(kind){const rows=inCaptureRows(kind),panel=make('section');panel.dataset.crmInCapture=kind;panel.className='patient-request-list-card crm-in-capture';
  // v36j: same card as «Bandeja de solicitudes» (head with title, help and count badge); compact one-line empty state.
  const head=make('div');head.className='patient-request-list-head';const titles=make('div');const h=make('h2',(kind==='patient'?'Solicitudes':'Altas')+' en captura');
  const help=make('p',kind==='patient'?'Registros iniciados por el paciente. Se muestran desde su registro. La evaluación y la oferta se habilitan cuando el paciente envíe su solicitud.':'Registros iniciados por el doctor o la clínica. Se muestran desde su registro. La revisión y la aprobación del alta se habilitan cuando envíe su registro.');
  const count=make('div',rows.length+' en captura');count.className='patient-request-count';titles.append(h,help);head.append(titles,count);panel.append(head);
  if(!rows.length){panel.classList.add('is-empty');const empty=make('p','No hay registros en captura.');empty.className='crm-in-capture-empty';panel.appendChild(empty);return panel;}
  const list=make('ul');list.className='crm-in-capture-list';
  for(const r of rows){const li=make('li');li.dataset.expedientId=r.exp.id;li.className='crm-in-capture-row';
   const name=make('strong',r.contact.name||r.contact.email||r.exp.id);const meta=make('span',[r.contact.email,r.contact.phone].filter(Boolean).join(' · '));meta.className='muted';
   const pill=make('span','En captura');pill.className='pill pill-amber';pill.dataset.status='en_captura';
   const progress=make('span',(r.missing==null?'Avance guardado':r.missing+' pendientes')+' · '+r.docs+' documentos');progress.className='muted';
   const evalBtn=make('button','Evaluar');evalBtn.type='button';evalBtn.className='btn btn-secondary btn-sm';evalBtn.disabled=true;evalBtn.title='Se habilita cuando el cliente envíe su solicitud';
   const offerBtn=make('button',kind==='patient'?'Generar oferta':'Aprobar alta');offerBtn.type='button';offerBtn.className='btn btn-secondary btn-sm';offerBtn.disabled=true;offerBtn.title=evalBtn.title;
   li.append(name,meta,pill,progress,evalBtn,offerBtn);
   let href=null;try{href=expedienteUrl(getStore(),r.contact.id,r.exp.id);}catch(_){href=null;}if(href){const a=make('a','Ver ficha CRM');a.href=href;li.appendChild(a);}
   list.appendChild(li);}
  panel.appendChild(list);return panel;}
 function injectInCapture(){for(const [id,kind,can] of [['patients','patient',()=>office.canReadPatient?.()??office.canImportPatient()],['providerRequests','doctor',()=>office.canReadProvider?.()??office.canImportProvider()]]){const host=doc.getElementById(id);if(!host)continue;const view=host.querySelector('.patient-request-list-view');if(!view||view.querySelector('[data-crm-in-capture]'))continue;let allowed=false;try{allowed=can();}catch(_){allowed=false;}if(!allowed)continue;try{view.insertBefore(inCapturePanel(kind),view.firstChild);}catch(_){}}}
 if(typeof w.MutationObserver==='function'){const watch=new w.MutationObserver(()=>{injectInCapture();if(!autoBusy)void autoImport();});for(const id of ['patients','providerRequests']){const host=doc.getElementById(id);if(host)watch.observe(host,{childList:true});}}
 function correction(action){try{const {state}=selected();const result=office.commitCorrection(action,select.value,state.revision,{fields:Array.from(fields.querySelectorAll('input:checked')).map(n=>n.value),reason:reason.value});office.refresh();showReview();status.textContent=action==='request'?'Observación enviada al expediente. El titular puede recibir solo los campos habilitados.':action==='receive'?'Campos reenviados recibidos. Revisa las diferencias antes de aprobar.':'Correcciones aprobadas. El titular puede recibir el resultado.';return result;}catch(e){status.textContent=e.message;}}
 let documentBusy=false;async function documentCorrection(action){if(documentBusy)return;documentBusy=true;select.disabled=true;load.disabled=true;for(const b of [docRequest,docReceive,docApprove,docReject])b.disabled=true;try{const {state}=selected();const result=await office.commitDocumentCorrection(action,select.value,state.revision,{docId:docSelect.value,reason:docReason.value});office.refresh();showReview();status.textContent=action==='request'?'Se observó ese documento exacto; el titular puede preparar y reenviar una nueva versión.':action==='receive'?'Versión recibida, todavía pendiente de aprobación.':action==='approve'?'Versión documental aprobada; la versión anterior permanece en el historial.':'Versión rechazada; el archivo anterior se conserva y el rechazo queda registrado.';return result;}catch(e){status.textContent=e.message;}finally{documentBusy=false;select.disabled=false;load.disabled=false;for(const b of [docRequest,docReceive,docApprove,docReject])b.disabled=false;}}
 docRequest.addEventListener('click',()=>documentCorrection('request'));docReceive.addEventListener('click',()=>documentCorrection('receive'));docApprove.addEventListener('click',()=>documentCorrection('approve'));docReject.addEventListener('click',()=>documentCorrection('reject'));
 request.addEventListener('click',()=>correction('request'));receive.addEventListener('click',()=>correction('receive'));approve.addEventListener('click',()=>correction('approve'));
 select.addEventListener('change',showReview);load.addEventListener('click',refresh);
 run.addEventListener('click',async()=>{if(importing)return;importing=true;run.disabled=true;const epoch=++importEpoch,id=select.value,actor=office.actor();function current(){return epoch===importEpoch&&select.value===id&&office.actor()===actor&&!box.hidden;}try{selected();const r=await importExpedient({store:getStore(),office,evidenceModule:w.PulzzoCRMEvidence,isCurrent:current},id);if(!current())return;showReview();status.textContent=(r.alreadyImported?'Este expediente ya estaba importado: ':'Expediente importado, pendiente de revisión: ')+r.id;}catch(e){if(current())status.textContent=e.message;}finally{importing=false;run.disabled=false;}});
 decision.addEventListener('click',()=>{try{const {state}=selected();const r=office.commitDecision(select.value,state.revision);office.refresh();status.textContent=r.alreadyImported?'La decisión ya había sido recibida.':'Decisión demo recibida; términos financieros preservados.';}catch(e){status.textContent=e.message;}});
 doc.getElementById('loginBtn')?.addEventListener('click',refresh);doc.getElementById('loginPass')?.addEventListener('keydown',e=>{if(e.key==='Enter')refresh();});doc.getElementById('logoutBtn')?.addEventListener('click',()=>{closePreview();previewActions.replaceChildren();select.replaceChildren();fields.replaceChildren();detail.textContent='';docSelect.replaceChildren();docDetail.textContent='';box.hidden=true;});refresh();
}

return {BO_KEY,readDatabase,readSubmittedRecord,operationalStatus,taskContactIdentity,taskContactIdentities,validateExternalReference,listReferenceChoices,expedienteUrl,accountExists,prepareImport,prepareDecision,importExpedient,readEvidence,mount};
});
