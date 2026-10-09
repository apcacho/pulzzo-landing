/* Explicit same-browser demo handoff. No networking, authentication or production writes. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root&&root.document){root.PulzzoDemoBridge=api;api.mount(root);}
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const outcomeKeys=['offerAccepted','offerRejected','offerRejectedAt','offerDecisionHistory','rejectionSource','reapplyAllowed','offerAcceptedAt','contractSigned','contractReady','signatureStatus','contractSignedAt','signedAt','preferredPaymentDay','paymentFrequency','paymentDayOption','paymentDays'];

  const cleanText=value=>String(value??'').replace(/[<>&"']/g,c=>({'<':'‹','>':'›','&':'＆','"':'”',"'":'’'}[c]));
  const copy=value=>JSON.parse(JSON.stringify(value));
  const number=value=>Number(String(value??'').replace(/[^\d.-]/g,''))||0;
  const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value[k]!==undefined).map(k=>[k,copy(value[k])]));
  const cleanData=value=>Array.isArray(value)?value.map(cleanData):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,cleanData(v)])):typeof value==='string'?cleanText(value):value;
  const hasEvidence=value=>value&&typeof value==='object'?Object.values(value).some(hasEvidence):typeof value==='string'?!!value.trim():typeof value==='number'?Number.isFinite(value):value===true;
  const completeReferences=refs=>Array.isArray(refs)&&refs.length>=2&&refs.every(ref=>ref&&String(ref.fullName||ref.name||'').trim()&&/^\d{10}$/.test(String(ref.phone||'').replace(/\D/g,''))&&String(ref.relationship||'').trim());
  function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
  function fingerprint(offer){const terms=copy(object(offer));delete terms.status;return JSON.stringify(canonical(terms));}
  function makeHandoff(state,patient){
    if(!state.applicationSubmitted||!state.applicationId)throw Error('Completa y envía primero la solicitud de ejemplo.');
    if(state.patientAccountId&&patient.patientAccountId&&state.patientAccountId!==patient.patientAccountId)throw Error('La cuenta cambió. No se exportó el expediente.');
    const patientAccountId=state.patientAccountId||patient.patientAccountId||null;
    const id=state.demoBridgeCaseId||('APP-DEMO-'+String(state.applicationId).replace(/[^a-zA-Z0-9-]/g,'').slice(0,70));
    const p=object(state.procedure);
    const names=Array.isArray(p.procedures)?p.procedures.map(cleanText):[cleanText(p.procedure||'Procedimiento de ejemplo')];
    const amount=number(p.amount??state.requestedAmount);
    if(amount<=0)throw Error('La solicitud necesita un monto válido antes del traspaso.');
    const costs=object(p.procedureCosts);
    const references=(Array.isArray(state.references)?state.references:[]).map(ref=>({fullName:cleanText(ref.fullName||ref.name||''),phone:cleanText(ref.phone||''),relationship:cleanText(ref.relationship||''),relationshipType:cleanText(ref.relationshipType||''),relationshipOther:cleanText(ref.relationshipOther||'')}));
    const identity=cleanData(pick(object(state.identity),['name','nameParts','registeredName','detectedName','curp','rfc','rfcBase','homoclave','housingStatus','housingPayment','address']));
    // Actual selections only. An empty category is never a selected document.
    // Names are anonymized deliberately; no original bytes are transported.
    const documentMetadata=Object.entries(object(state.documentFiles)).flatMap(([key,files])=>(Array.isArray(files)?files:[]).filter(file=>file&&String(file.name||'').trim()).map(file=>({type:cleanText(key),mimeType:cleanText(file.type||''),size:Math.max(0,number(file.size)),metadataOnly:true})));
    const geolocation=cleanData(pick(object(state.geolocation),['status','consent','latitude','longitude','accuracy','capturedAt','source','reason']));
    const creditAuth=cleanData(pick(object(state.creditAuth),['confirmedAt','authorizationVersion','channel','demo','provider','backendStatus','reusedForNewApplication']));
    const application={applicationId:id,sourceApplicationId:state.applicationId,applicationCreatedAt:state.applicationCreatedAt||new Date().toISOString(),applicationSubmittedAt:state.applicationSubmittedAt||new Date().toISOString(),applicationStatus:'en_evaluacion',stage:'En evaluación',requestedAmount:amount,selectedTerm:number(state.selectedTerm||p.termMonths),termMonths:number(state.selectedTerm||p.termMonths),procedureCost:amount,procedure:names.join(' + '),procedures:names,specialties:Array.isArray(p.specialties)?p.specialties.map(cleanText):[],procedureCosts:Object.fromEntries(Object.entries(costs).map(([k,v])=>[cleanText(k),number(v)])),doctorName:cleanText(p.doctorName||'Proveedor de ejemplo por definir'),doctorWhatsApp:cleanText(p.doctorWhatsApp||''),doctorSource:cleanText(p.doctorSource||''),forWhom:cleanText(p.forWhom||'Titular'),geoDone:!!state.geoDone&&['authorized','authorized_demo','permission_granted','captured','validated_by_backoffice'].includes(geolocation.status),geolocation,identityDone:!!state.identityDone&&hasEvidence(identity),identity,incomeDone:!!state.incomeDone&&number(state.incomeMonthly)>0&&!!state.incomeType,documentsDone:false,documentMetadataOnly:true,creditAuthConfirmed:!!state.creditAuthConfirmed&&!!creditAuth.confirmedAt,creditAuth,referencesSaved:!!state.referencesSaved&&completeReferences(references),offerReady:false,offerAccepted:false,offerRejected:false,contractSigned:false};
    const providers=Array.isArray(p.procedureProviders?.procedures)?p.procedureProviders.procedures:[];
    application.procedureProviderAssignments=Object.fromEntries(providers.map(row=>[cleanText(row.procedure),cleanText(row.provider||'Proveedor de ejemplo por definir')]));
    application.procedureProviderContacts=Object.fromEntries(providers.map(row=>[cleanText(row.procedure),cleanText(row.whatsapp||'')]));
    return {version:1,demo:true,id,patientAccountId,sourceApplicationId:state.applicationId,offerFingerprint:state.demoBridgeOfferFingerprint||null,patient:{fullName:cleanText(patient.fullName||[patient.nombre,patient.apellidoPaterno,patient.apellidoMaterno].filter(Boolean).join(' ')||'Paciente de ejemplo'),email:cleanText(patient.correo||patient.email||'paciente@example.test'),phone:cleanText(patient.celular||patient.phone||''),incomeMonthly:number(state.incomeMonthly),incomeType:cleanText(state.incomeType||'')},application,outcome:pick(state,outcomeKeys),references,documentMetadata,documentKeys:[...new Set(documentMetadata.map(file=>file.type))],createdAt:new Date().toISOString()};
  }
  function importHandoff(db,handoff){
    if(!handoff||handoff.version!==1||handoff.demo!==true||!handoff.id||!handoff.sourceApplicationId)throw Error('No hay un traspaso demo válido.');
    const existing=db.patients.find(p=>p.id===handoff.id);
    if(existing){
      if(existing.patientAccountId&&existing.patientAccountId!==handoff.patientAccountId)throw Error('El expediente pertenece a otra cuenta.');
      if(existing.demoBridge?.sourceApplicationId!==handoff.sourceApplicationId)throw Error('El identificador ya pertenece a otro expediente. No se sobrescribió.');
      if(!handoff.offerFingerprint||handoff.offerFingerprint!==fingerprint(existing.offer))throw Error('El caso ya existe o su oferta cambió. No se sobrescribieron datos.');
      // Only explicitly returned patient decisions may travel back. Never overwrite an offer.
      const outcome=pick(object(handoff.outcome),outcomeKeys);
      if(existing.application.contractSigned && !outcome.contractSigned)throw Error('No se puede revertir una firma de ejemplo ya registrada.');
      if(existing.application.offerAccepted && !outcome.offerAccepted)throw Error('No se puede revertir una oferta ya aceptada.');
      Object.assign(existing.application,outcome);
      if(handoff.application?.referencesSaved && completeReferences(handoff.references)){existing.references=cleanData(handoff.references);existing.application.referencesSaved=true;}
      if(outcome.offerAccepted){existing.application.applicationStatus='oferta_aceptada';existing.offer.status='aceptada';}
      if(outcome.offerRejected){existing.application.applicationStatus='offer_rejected_by_client';existing.offer.status='rechazada';}
      if(outcome.contractSigned)existing.application.applicationStatus='contrato_firmado';
      return existing;
    }
    const record={id:handoff.id,patientAccountId:handoff.patientAccountId||null,applicationDate:handoff.createdAt.slice(0,10),patient:copy(handoff.patient),application:copy(handoff.application),offer:null,references:cleanData(Array.isArray(handoff.references)?handoff.references:[]),documents:(Array.isArray(handoff.documentMetadata)?handoff.documentMetadata:[]).map((file,i)=>({id:handoff.id+'-DOC-'+i,type:cleanText(file.type),status:'pending',source:'patient',fileName:'Archivo demo '+(i+1)+' (solo metadatos)',mimeType:cleanText(file.mimeType),size:number(file.size),metadataOnly:true,simulatedPreview:'Solo metadatos de un archivo seleccionado. No contiene el archivo original.'})),timeline:[],notes:[],demoBridge:{sourceApplicationId:handoff.sourceApplicationId}};
    record.application.referencesSaved=!!record.application.referencesSaved&&completeReferences(record.references);
    record.application.identityDone=!!record.application.identityDone&&hasEvidence(object(record.application.identity));
    record.application.documentsDone=false;
    db.patients.push(record);return record;
  }
  function makeReply(record){
    if(!record?.demoBridge)throw Error('Selecciona el caso importado del paciente demo.');
    if(!record.offer||!record.application.offerReady||!['enviada','sent','offer_sent','oferta_enviada','aceptada','accepted'].includes(String(record.offer.status||'').toLowerCase()))throw Error('Prepara y envía la oferta en el backoffice antes de traspasarla.');
    const offer=copy(record.offer);
    if(number(offer.approvedAmount)<=0||number(offer.termMonths)<=0||number(offer.monthlyPayment)<=0)throw Error('La oferta necesita monto, plazo y pago válidos.');
    return {version:1,demo:true,id:record.id,patientAccountId:record.patientAccountId||null,sourceApplicationId:record.demoBridge.sourceApplicationId,offer,offerFingerprint:fingerprint(record.offer),application:pick(record.application,['applicationStatus','initialPaymentRequired','initialInstallments','initialPaymentPaid','doctorPaymentPaid','amortizationReady']),createdAt:new Date().toISOString()};
  }
  function applyReply(state,reply){
    if(!reply||reply.version!==1||reply.demo!==true||reply.id!==state.demoBridgeCaseId||reply.sourceApplicationId!==state.applicationId)throw Error('La respuesta no pertenece a esta solicitud. No se importó.');
    if(state.patientAccountId&&reply.patientAccountId!==state.patientAccountId)throw Error('La respuesta pertenece a otra cuenta.');
    if((state.offerAccepted||state.contractSigned||state.signatureStatus==='signed') && state.demoBridgeOfferFingerprint!==reply.offerFingerprint)throw Error('La oferta ya fue aceptada o firmada; no se sustituirán sus condiciones.');
    if(reply.offerFingerprint!==fingerprint(reply.offer))throw Error('La oferta del traspaso cambió. Vuelve a exportarla desde backoffice.');
    const previousFingerprint=state.demoBridgeOfferFingerprint;
    if(state.offerRejected && previousFingerprint && previousFingerprint!==reply.offerFingerprint){
      state.offerDecisionHistory=Array.isArray(state.offerDecisionHistory)?state.offerDecisionHistory:[];
      state.offerDecisionHistory.push({offerFingerprint:previousFingerprint,offer:copy(object(state.offer)),decision:'rejected',decidedAt:state.offerRejectedAt||null,replacedAt:new Date().toISOString()});
      state.offerRejected=false;delete state.offerRejectedAt;
      if(state.rejectionSource==='client_rejected_offer'){delete state.rejectionSource;delete state.reapplyAllowed;}
    }
    state.offer=copy(reply.offer);state.offerReady=true;
    state.demoBridgeOfferFingerprint=reply.offerFingerprint;
    const received=pick(object(reply.application),['applicationStatus','initialPaymentRequired','initialInstallments','initialPaymentPaid','doctorPaymentPaid','amortizationReady']);
    if(state.contractSigned)received.applicationStatus='contrato_firmado';
    else if(state.offerAccepted)received.applicationStatus='oferta_aceptada';
    else if(state.offerRejected)received.applicationStatus='offer_rejected_by_client';
    Object.assign(state,received);
    return state;
  }
  // Explicit local file import. Legacy names/metadata are never upload evidence.
  function localDocumentVersion(file,dataUrl){
    const types=['application/pdf','image/png','image/jpeg','image/webp','image/gif'];
    if(!file||!types.includes(file.type)||!Number.isInteger(file.size)||file.size<=0||file.size>524288)throw Error('Usa un PDF o imagen de hasta 512 KB, solo con datos ficticios.');
    const prefix='data:'+file.type+';base64,';
    if(typeof dataUrl!=='string'||!dataUrl.startsWith(prefix)||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(dataUrl.slice(prefix.length)))throw Error('El archivo no contiene bytes locales válidos.');
    const body=dataUrl.slice(prefix.length),size=body.length/4*3-(body.endsWith('==')?2:body.endsWith('=')?1:0);
    if(size!==file.size)throw Error('El archivo está incompleto. Vuelve a seleccionarlo.');
    const header=atob(body.slice(0,32));
    const valid=file.type==='application/pdf'?header.startsWith('%PDF-'):file.type==='image/png'?header.startsWith('\x89PNG\r\n\x1a\n'):file.type==='image/jpeg'?header.startsWith('\xff\xd8\xff'):file.type==='image/gif'?/^GIF8[79]a/.test(header):header.startsWith('RIFF')&&header.slice(8,12)==='WEBP';
    if(!valid)throw Error('El contenido no coincide con el tipo de archivo.');
    return {fileName:cleanText(file.name||'archivo'),name:cleanText(file.name||'archivo'),mimeType:file.type,size:file.size,dataUrl,status:'pending',source:'local_file_import'};
  }
  function saveMutation(target,mutate,save){
    const before=copy(target);
    try{const result=mutate();save();return result;}
    catch(error){Object.keys(target).forEach(key=>delete target[key]);Object.assign(target,before);throw error;}
  }
  function mount(window){
    const patient=window.PulzzoPatientDemoBridge, office=window.PulzzoBackofficeDemoBridge;
    if(!patient&&!office)return;
    const panel=window.document.createElement('details');
    panel.id='pulzzo-demo-handoff';panel.style.cssText='margin:16px;padding:12px;border:1px solid #d7e1ee;border-radius:12px;background:#fff;color:#07142f;font:14px system-ui;position:relative;z-index:1';
    const summary=window.document.createElement('summary');summary.textContent='Recorrido demo local: paciente ↔ backoffice';panel.appendChild(summary);
    const note=window.document.createElement('p');note.textContent='Solo datos ficticios, en este navegador y origen. Cada traspaso es manual. No envía datos ni crea operaciones reales.';panel.appendChild(note);
    const status=window.document.createElement('p');status.setAttribute('role','status');
    const confirm=()=>window.confirm('Confirma que este caso contiene solo datos ficticios. Se copiará únicamente dentro de este navegador; no se envía a un servidor.');
    const read=key=>{try{return JSON.parse(window.localStorage.getItem(key)||'null');}catch(_){return null;}};
    function button(label,action){const b=window.document.createElement('button');b.type='button';b.className='btn btn-secondary';b.textContent=label;b.style.margin='4px';b.addEventListener('click',()=>{try{action();}catch(error){status.textContent=error.message;}});panel.appendChild(b);}
    const mailbox=()=>{if(!window.PulzzoDemoServicing)throw Error('El módulo de integración demo no está disponible.');return window.PulzzoDemoServicing;};
    const patientId=()=>{const id=patient?.getAccount?.()?.patientAccountId;if(!id)throw Error('Recarga para crear la identidad estable de esta cuenta.');return id;};
    if(patient){
      button('1. Enviar caso / decisión al backoffice demo',()=>{
        if(!confirm())return;
        patient.assertFresh?.();
        const accountId=patientId(),state=patient.getState(),handoff=makeHandoff(state,object(read('pulzzo_patient')));
        if(handoff.patientAccountId!==accountId)throw Error('La solicitud no corresponde a la cuenta actual.');
        mailbox().publishAndSave(window.localStorage,'patient_handoff',accountId,state.applicationId,handoff,{},()=>saveMutation(state,()=>{state.demoBridgeCaseId=handoff.id;},()=>patient.save()));
        status.textContent='Caso listo. Abre backoffice.html y selecciona esta cuenta y solicitud en el traspaso demo: '+accountId+' / '+state.applicationId;
      });
      button('4. Recibir oferta del backoffice demo',()=>{
        patient.assertFresh?.();const state=patient.getState(),accountId=patientId();
        const e=mailbox().receive(window.localStorage,'patient_offer',accountId,state.applicationId,state.demoOfferEnvelope),reply=e.payload;
        if(!window.confirm('¿Importar la oferta de ejemplo: '+reply.offer.approvedAmount+' MXN, '+reply.offer.termMonths+' meses?'))return;
        patient.assertFresh?.();
        saveMutation(state,()=>{applyReply(state,reply);state.demoOfferEnvelope=e;},()=>patient.save());patient.refresh();status.textContent='Oferta de ejemplo recibida. Revisa sus condiciones antes de devolver tu decisión.';
      });
    }
    if(office){
      const selectLabel=window.document.createElement('label');selectLabel.textContent='Cuenta y solicitud demo para importar ';const inbox=window.document.createElement('select');inbox.setAttribute('aria-label','Cuenta y solicitud demo para importar');inbox.style.maxWidth='100%';selectLabel.appendChild(inbox);panel.appendChild(selectLabel);
      function refreshInbox(){const selected=inbox.value;inbox.replaceChildren();const empty=window.document.createElement('option');empty.value='';empty.textContent='Selecciona una cuenta y solicitud';inbox.appendChild(empty);mailbox().messages(window.localStorage,'patient_handoff').forEach(e=>{const option=window.document.createElement('option');option.value=JSON.stringify([e.accountId,e.applicationId]);option.textContent=e.accountId+' / '+e.applicationId;inbox.appendChild(option);});inbox.value=selected;}
      button('Actualizar casos demo disponibles',refreshInbox);
      button('2. Importar caso / decisión del paciente demo',()=>{
        if(!office.canImport())throw Error('El rol actual no puede importar o modificar casos.');
        window.PulzzoServicingOffice?.assertCurrent();
        if(!confirm())return;
        if(!inbox.value)throw Error('Selecciona la cuenta y solicitud que deseas importar.');const [accountId,appId]=JSON.parse(inbox.value),e=mailbox().receive(window.localStorage,'patient_handoff',accountId,appId);
        if(e.payload.patientAccountId!==accountId||e.payload.sourceApplicationId!==appId)throw Error('Identidad del traspaso inválida.');
        const database=office.getDatabase(),existing=database.patients.find(p=>p.id===e.payload.id),previous=existing?.demoBridge?.handoffEnvelope;
        if(previous&&(e.revision<previous.revision||e.revision===previous.revision&&e.fingerprint!==previous.fingerprint))throw Error('El caso recibido es antiguo o cambió sin revisión.');
        if(previous?.fingerprint===e.fingerprint){office.select?.(existing.id);status.textContent='Esta revisión ya fue importada.';return;}
        window.PulzzoServicingOffice?.assertCurrent();
        const record=saveMutation(database,()=>{const record=importHandoff(database,e.payload);record.demoBridge.handoffEnvelope=e;return record;},()=>office.save());office.select?.(record.id);office.refresh();
        status.textContent='Caso demo '+record.id+' importado. Revisa el expediente y usa el editor de oferta existente.';
      });
      button('3. Enviar oferta seleccionada al paciente demo',()=>{
        if(!office.canImport())throw Error('El rol actual no puede exportar ofertas.');
        window.PulzzoServicingOffice?.assertCurrent();
        const record=office.getSelected(),reply=makeReply(record);if(!reply.patientAccountId)throw Error('Concilia la cuenta del paciente antes de exportar.');
        if(!window.confirm('¿Enviar al portal demo la oferta de '+reply.offer.approvedAmount+' MXN a '+reply.offer.termMonths+' meses?'))return;
        window.PulzzoServicingOffice?.assertCurrent();mailbox().publish(window.localStorage,'patient_offer',reply.patientAccountId,reply.sourceApplicationId,reply);status.textContent='Oferta lista para esta cuenta y solicitud. Regresa al portal y pulsa “Recibir oferta”.';
      });
    }
    const link=window.document.createElement('a');link.href=patient?'backoffice.html':'solicitud-paciente.html#portal';link.textContent=patient?'Abrir backoffice demo':'Abrir portal del paciente demo';link.style.margin='8px';panel.appendChild(link);
    panel.appendChild(status);window.document.body.appendChild(panel);
  }
  return {makeHandoff,importHandoff,makeReply,applyReply,fingerprint,localDocumentVersion,saveMutation,mount};
});
