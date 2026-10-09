/* Same-browser DEMO intake adapter. It never approves a record or changes an existing
 * financial record. Browser storage and role switches are not production security. */
(function(root,factory){const api=factory(root?.PulzzoDemoBridge||(typeof module==='object'&&module.exports?require('../pulzzo-demo-bridge.js'):null),root?.PulzzoPatientDemo||(typeof module==='object'&&module.exports?require('./patient-demo.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;if(root){root.PulzzoCRMOffice=api;if(root.document)api.mount(root);}})(typeof window!=='undefined'?window:null,function(bridge,patientDemo){
'use strict';
const BO_KEY='pulzzo_backoffice_demo';
const clone=x=>JSON.parse(JSON.stringify(x));
const text=(x,max=500)=>String(x??'').trim().slice(0,max);
const email=x=>text(x).toLowerCase();
const phone=x=>{let n=String(x||'').replace(/\D/g,'');if(n.length===13&&n.startsWith('521'))n=n.slice(3);else if(n.length===12&&n.startsWith('52'))n=n.slice(2);return n;};
const array=x=>Array.isArray(x)?x:[];
function readDatabase(storage){const raw=storage.getItem(BO_KEY);if(!raw)return null;const db=JSON.parse(raw);if(!db||!Array.isArray(db.patients)||!Array.isArray(db.providers))throw Error('El backoffice local no tiene un estado válido.');return db;}
function recordMatches(record,exp){return record?.crmIntake?.expedientId===exp.id&&record.crmIntake.contactId===exp.contactId&&record.crmIntake.accountId===exp.holderIdentity?.id;}
function readSubmittedRecord(storage,exp){if(!exp||!exp.holderIdentity?.id)return null;const db=readDatabase(storage);if(!db)return null;const rows=(exp.kind==='patient'?db.patients:db.providers).filter(r=>recordMatches(r,exp));if(rows.length>1)throw Error('Hay vínculos ambiguos en backoffice.');if(!rows[0])return null;const r=rows[0],a=r.application||{};const available=bridge&&r.offer&&a.offerReady&&['enviada','sent','offer_sent','oferta_enviada','aceptada','accepted'].includes(String(r.offer.status||'').toLowerCase());return {id:r.id,applicationStatus:text(a.applicationStatus||r.status),offer:available?bridge.publicOffer(r.offer):null,offerFingerprint:available?bridge.fingerprint(r.offer):null,contractReady:!!a.contractReady,expiryStatus:patientDemo?patientDemo.offerExpiryStatus({offer:r.offer,offerAccepted:a.offerAccepted,contractSigned:a.contractSigned}):'unavailable',demo:true};}
function operationalStatus(storage,contact){const id=typeof contact==='string'?contact:contact?.id;if(!id)return 'Sin expediente enviado';const db=readDatabase(storage);if(!db)return 'Backoffice todavía no inicializado';const rows=[...db.patients,...db.providers].filter(r=>r.crmIntake?.contactId===id);if(!rows.length)return 'Pendiente de importar a backoffice';if(rows.length!==1)return 'Requiere conciliación de identidades';const r=rows[0];return text(r.application?.applicationStatus||r.status||'en_revision');}
function validateExternalReference(storage,key,id,contact){
 const db=readDatabase(storage);if(!db||!contact?.id||typeof id!=='string')return false;
 if(['creditId','requestId'].includes(key))return db.patients.filter(r=>r.id===id&&r.crmIntake?.contactId===contact.id).length===1;
 if(!['providerId','registrationId'].includes(key))return false;
 const providers=db.providers.filter(r=>r.id===id);if(providers.length!==1)return false;
 if(providers[0].crmIntake?.contactId===contact.id)return true;
 if(contact.type!=='patient'||key==='registrationId')return false;
 const own=db.patients.filter(r=>r.crmIntake?.contactId===contact.id);
 return own.some(r=>[...array(r.application?.procedureProviders),...array(r.offer?.financedProcedures),...array(r.demoServicingIdentity?.procedures)].some(p=>p.providerId===id));
}
function accountExists(state,kind,id){return Object.values(state?.expedients||{}).some(e=>e.kind===kind&&e.holderIdentity?.id===id&&e.holderIdentity.demo===true&&e.submissionSnapshot?.accountId===id&&e.submittedAt);}
function requireSubmission(exp){
 const p=exp?.submissionSnapshot,identity=exp?.holderIdentity;
 if(!p||p.schema!=='pulzzo.crm.submission.v1'||p.demo!==true||!['submitted','accepted','signed'].includes(exp.status)||!exp.submittedAt||p.submittedAt!==exp.submittedAt||p.expedientId!==exp.id||p.contactId!==exp.contactId||p.accountId!==identity?.id||p.kind!==exp.kind)throw Error('El titular debe enviar primero este mismo expediente demo.');
 if(!identity?.demo||!identity.verifiedAt||!Number.isFinite(Date.parse(identity.verifiedAt))||JSON.stringify(p.holderIdentity)!==JSON.stringify(identity))throw Error('La identidad del titular no coincide con la constancia.');
 if(!Number.isSafeInteger(p.revision)||p.revision<1||p.revision!==exp.submissionRevision||JSON.stringify(p.fields)!==JSON.stringify(exp.fields)||JSON.stringify(p.documents)!==JSON.stringify(exp.documents))throw Error('La constancia de envío no coincide con los datos bloqueados.');
 const required=exp.kind==='patient'?['otp','buroConsent','finalConfirmation']:['otp','finalConfirmation'];
 for(const action of required){const a=p.holderActions?.[action];if(!a||a.actorId!==p.accountId||a.actorRole!=='holder'||a.confirmed!==true||a.demo!==true||!Number.isFinite(Date.parse(a.at)))throw Error('Falta una confirmación personal del titular.');}
 if(JSON.stringify(p.holderConfirmation)!==JSON.stringify(p.holderActions.finalConfirmation)||!p.submissionId)throw Error('Falta la confirmación del titular.');
 if(exp.kind==='doctor'&&!(['holder','authorized_representative'].includes(p.holderConfirmation.capacity)&&p.holderConfirmation.authorityConfirmed===true))throw Error('Faltan facultades confirmadas del titular o representante.');
 return clone(p);
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
 const at=new Date().toISOString(),files=array(payload.documents).map((d,i)=>({id:id+'-DOC-'+i,type:text(d.label||d.documentType||'Documento demo',100),status:'pending',source:'crm_demo',fileName:'Documento ficticio '+(i+1),mimeType:text(d.mimeType||d.type,100),size:Number(d.size)||0,metadataOnly:true,evidenceId:text(d.evidenceId||d.id,180),uploadedBy:text(d.uploadedBy||d.actorId,180),uploadedAt:text(d.uploadedAt,40),contactId:payload.contactId,simulatedPreview:'Archivo demo local. La revisión no acredita validez real; abre la evidencia en CRM.'}));
 const crmIntake={expedientId:exp.id,contactId:payload.contactId,accountId:payload.accountId,submissionId:payload.submissionId,submittedAt:payload.submittedAt,importedAt:at,importedBy:text(actor,180),provenance:clone(payload.provenance||{}),demo:true};
 const event={at,createdAt:at,user:text(actor,180),action:'Expediente CRM importado para revisión',comment:'Alta demo confirmada por titular. Sin aprobación automática.'};
 let record;
 if(kind==='patient'){
  const amount=Number(f.requestedAmount),term=Number(f.termMonths);if(!(amount>0&&Number.isFinite(amount)&&Number.isInteger(term)&&term>0))throw Error('Monto y plazo inválidos.');
  record={id,patientAccountId:payload.accountId,applicationDate:String(payload.submittedAt).slice(0,10),patient:{fullName:text(f.fullName||f.name,160),email:holderEmail,phone:text(f.phone,30),address:text(f.address,500),incomeMonthly:Number(f.monthlyIncome)||0,incomeType:text(f.incomeType||'Por revisar',100)},application:{applicationId:id,sourceApplicationId:exp.id,applicationCreatedAt:exp.createdAt,applicationSubmittedAt:payload.submittedAt,applicationStatus:'en_evaluacion',stage:'En evaluación',requestedAmount:amount,procedureCost:amount,selectedTerm:term,termMonths:term,procedure:text(f.procedure,200),procedures:[text(f.procedure,200)],doctorName:text(f.doctorName||'Proveedor por definir',160),identityDone:false,identity:{registeredName:text(f.fullName||f.name,160),address:text(f.address,500)},incomeDone:false,documentsDone:false,documentMetadataOnly:true,creditAuthConfirmed:false,creditAuth:{demo:true,backendStatus:'not_connected',channel:'holder_demo_simulation'},referencesSaved:false,offerReady:false,offerAccepted:false,offerRejected:false,contractSigned:false},offer:null,references:[],documents:files,timeline:[event],notes:[],demoBridge:{sourceApplicationId:exp.id},crmIntake};
 }else{
  record={id,doctorAccountId:payload.accountId,status:'perfil_en_revision',profile:{name:text(f.fullName||f.name||f.clinicName,160),email:holderEmail,prefix:'',accountType:f.representativeRole==='representative'?'Clínica u hospital':'Doctor',state:text(f.state,80),city:text(f.city,80)},contact:{registered:text(f.phone,30),officePhone:text(f.phone,30),officeWhats:text(f.phone,30),visible:false},files,fiscal:{},links:{},profileData:{},procedures:[],medval:{medicalLicenseNumber:text(f.professionalLicense,100),specialty:text(f.specialty,120)},clinicDocs:{street:text(f.clinicAddress,500)},timeline:[event],notes:[],crmIntake};
 }
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
function importExpedient({store,office},expedientId){
 if(!office)throw Error('Abre el backoffice para importar.');office.assertCurrent();const state=store.snapshot(),exp=state.expedients[expedientId];const kind=exp?.kind;
 if(kind==='patient'?!office.canImportPatient():!office.canImportProvider())throw Error('El rol actual no puede importar este expediente.');
 const result=prepareImport(office.getDatabase(),exp,office.actor());if(result.alreadyImported)return result;
 office.assertCurrent();if(store.snapshot().revision!==state.revision)throw Error('El expediente CRM cambió. Actualiza antes de importar.');
 const saved=office.commitNew(expedientId,state.revision);office.refresh();return {alreadyImported:!!saved.alreadyImported,id:saved.id};
}
function mount(w){
 const office=w.PulzzoCRMOfficeAdapter;if(!office||!w.PulzzoCRMStore)return;
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
   if(file.mimeType.startsWith('image/')){const image=make('img');image.src=previewURL;image.alt='Documento ficticio '+file.name;previewBody.appendChild(image);}else{const frame=make('iframe');frame.src=previewURL;frame.title='Documento ficticio';frame.setAttribute('sandbox','');previewBody.appendChild(frame);}
   const download=make('a','Descargar esta versión ficticia');download.href=previewURL;download.download=file.name;previewBody.appendChild(download);if(preview.showModal)preview.showModal();else preview.setAttribute('open','');
  }catch(e){if(epoch===previewEpoch)status.textContent=e.message;}
 }
 function evidenceButton(label,metadata){if(!metadata?.evidenceId)return;const b=make('button',label);b.type='button';b.className='btn btn-secondary btn-sm';b.addEventListener('click',()=>openEvidence(metadata));previewActions.appendChild(b);}

 const status=make('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');box.append(heading,help,pickerLabel,actions,review,docReview,status);(doc.querySelector('main')||doc.body).appendChild(box);
 const getStore=()=>w.PulzzoCRMStore.createStore({storage:w.localStorage,actor:{id:office.actorId(),role:'admin'}});
 function selected(){const s=getStore().snapshot(),exp=s.expedients[select.value];if(!exp||!(exp.kind==='patient'?(office.canReadPatient?.()??office.canImportPatient()):(office.canReadProvider?.()??office.canImportProvider())))throw Error('No tienes acceso a este expediente.');return {state:s,exp};}
 function showReview(){
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
   run.disabled=!select.options.length;decision.disabled=!patientAllowed||!select.options.length;review.hidden=!select.options.length;docReview.hidden=!select.options.length;status.textContent=select.options.length?'Selecciona un alta confirmada. El envío inicial y la revisión son pasos separados.':'No hay altas CRM enviadas por el titular.';if(select.options.length)showReview();
  }catch(e){status.textContent=e.message;run.disabled=true;decision.disabled=true;review.hidden=true;docReview.hidden=true;}
 }
 function correction(action){try{const {state}=selected();const result=office.commitCorrection(action,select.value,state.revision,{fields:Array.from(fields.querySelectorAll('input:checked')).map(n=>n.value),reason:reason.value});office.refresh();showReview();status.textContent=action==='request'?'Observación enviada al expediente. El titular puede recibir solo los campos habilitados.':action==='receive'?'Campos reenviados recibidos. Revisa las diferencias antes de aprobar.':'Correcciones aprobadas. El titular puede recibir el resultado.';return result;}catch(e){status.textContent=e.message;}}
 let documentBusy=false;async function documentCorrection(action){if(documentBusy)return;documentBusy=true;select.disabled=true;load.disabled=true;for(const b of [docRequest,docReceive,docApprove,docReject])b.disabled=true;try{const {state}=selected();const result=await office.commitDocumentCorrection(action,select.value,state.revision,{docId:docSelect.value,reason:docReason.value});office.refresh();showReview();status.textContent=action==='request'?'Se observó ese documento exacto; el titular puede preparar y reenviar una nueva versión.':action==='receive'?'Versión recibida, todavía pendiente de aprobación.':action==='approve'?'Versión documental aprobada; la versión anterior permanece en el historial.':'Versión rechazada; el archivo anterior se conserva y el rechazo queda registrado.';return result;}catch(e){status.textContent=e.message;}finally{documentBusy=false;select.disabled=false;load.disabled=false;for(const b of [docRequest,docReceive,docApprove,docReject])b.disabled=false;}}
 docRequest.addEventListener('click',()=>documentCorrection('request'));docReceive.addEventListener('click',()=>documentCorrection('receive'));docApprove.addEventListener('click',()=>documentCorrection('approve'));docReject.addEventListener('click',()=>documentCorrection('reject'));
 request.addEventListener('click',()=>correction('request'));receive.addEventListener('click',()=>correction('receive'));approve.addEventListener('click',()=>correction('approve'));
 select.addEventListener('change',showReview);load.addEventListener('click',refresh);
 run.addEventListener('click',()=>{try{selected();const r=importExpedient({store:getStore(),office},select.value);showReview();status.textContent=(r.alreadyImported?'Este expediente ya estaba importado: ':'Expediente importado, pendiente de revisión: ')+r.id;}catch(e){status.textContent=e.message;}});
 decision.addEventListener('click',()=>{try{const {state}=selected();const r=office.commitDecision(select.value,state.revision);office.refresh();status.textContent=r.alreadyImported?'La decisión ya había sido recibida.':'Decisión demo recibida; términos financieros preservados.';}catch(e){status.textContent=e.message;}});
 doc.getElementById('loginBtn')?.addEventListener('click',refresh);doc.getElementById('loginPass')?.addEventListener('keydown',e=>{if(e.key==='Enter')refresh();});doc.getElementById('logoutBtn')?.addEventListener('click',()=>{closePreview();previewActions.replaceChildren();select.replaceChildren();fields.replaceChildren();detail.textContent='';docSelect.replaceChildren();docDetail.textContent='';box.hidden=true;});refresh();
}

return {BO_KEY,readDatabase,readSubmittedRecord,operationalStatus,validateExternalReference,accountExists,prepareImport,prepareDecision,importExpedient,mount};
});
