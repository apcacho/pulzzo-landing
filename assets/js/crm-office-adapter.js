// CRM intake is append-only. It never updates an existing financial record.
function crmOfficeCommitNew(expedientId,expectedRevision){
  servicingOfficeAssertCurrent();
  if(!window.PulzzoCRMStore||!window.PulzzoCRMOffice)throw Error('Módulo CRM no disponible.');
  const store=window.PulzzoCRMStore.createStore({storage:localStorage,actor:{id:'bo_'+String(session?.role||'signedout'),role:'admin'}});
  const state=store.snapshot(),exp=state.expedients[expedientId];
  if(state.revision!==expectedRevision)throw Error('El expediente CRM cambió. Actualiza antes de importar.');
  servicingOfficeRequire(exp?.kind==='patient'?'riskActions':'providerActions');
  const prepared=window.PulzzoCRMOffice.prepareImport(db,exp,session.email);
  if(prepared.alreadyImported)return prepared;
  const next=JSON.stringify(prepared.database);
  servicingOfficeAssertCurrent();
  if(store.snapshot().revision!==expectedRevision)throw Error('El expediente CRM cambió.');
  localStorage.setItem(DEMO_STORAGE_KEY,next);
  // Single-key commit; only adopt in-memory state after persistence succeeds.
  db=prepared.database;dispersionLedgerStorageVersion=next;operationalAuditBaseline=operationalSnapshot();
  return {id:prepared.id,alreadyImported:false};
}
function crmOfficeCommitDecision(expedientId,expectedRevision){
  servicingOfficeRequire('riskActions');servicingOfficeAssertCurrent();
  const store=window.PulzzoCRMStore.createStore({storage:localStorage,actor:{id:'bo_'+String(session?.role||'signedout'),role:'admin'}});
  const state=store.snapshot();if(state.revision!==expectedRevision)throw Error('El expediente CRM cambió.');
  const prepared=window.PulzzoCRMOffice.prepareDecision(db,state.expedients[expedientId],session.email);
  if(prepared.alreadyImported)return prepared;
  const next=JSON.stringify(prepared.database);servicingOfficeAssertCurrent();
  if(store.snapshot().revision!==expectedRevision)throw Error('La decisión del titular cambió.');
  localStorage.setItem(DEMO_STORAGE_KEY,next);db=prepared.database;dispersionLedgerStorageVersion=next;operationalAuditBaseline=operationalSnapshot();
  return {id:prepared.id,alreadyImported:false};
}
function crmOfficeCommitCorrection(action,expedientId,expectedRevision,input){
  servicingOfficeAssertCurrent();
  if(!window.PulzzoCRMCorrections)throw Error('El módulo de correcciones no está disponible.');
  const store=window.PulzzoCRMStore.createStore({storage:localStorage,actor:{id:'bo_'+String(session?.role||'signedout'),role:'admin'}});
  const state=store.snapshot(),exp=state.expedients[expedientId];
  if(state.revision!==expectedRevision)throw Error('El expediente CRM cambió.');
  servicingOfficeRequire(exp?.kind==='patient'?'riskActions':'providerActions');
  const module=window.PulzzoCRMCorrections;
  let prepared;
  if(action==='request')prepared=module.prepareRequest(db,exp,input?.fields||[],input?.reason||'',session.email);
  else if(action==='receive')prepared=module.prepareReceive(db,exp,session.email);
  else if(action==='approve')prepared=module.prepareApprove(db,exp,session.email);
  else throw Error('Acción de corrección desconocida.');
  const next=JSON.stringify(prepared.database);servicingOfficeAssertCurrent();
  if(store.snapshot().revision!==expectedRevision)throw Error('La corrección CRM cambió.');
  localStorage.setItem(DEMO_STORAGE_KEY,next);db=prepared.database;dispersionLedgerStorageVersion=next;operationalAuditBaseline=operationalSnapshot();
  return {id:prepared.id,reviewProjection:prepared.reviewProjection};
}
async function crmOfficeCommitDocumentCorrection(action,expedientId,expectedRevision,input){
  servicingOfficeAssertCurrent();
  if(!window.PulzzoCRMCorrections)throw Error('El módulo de correcciones no está disponible.');
  const store=window.PulzzoCRMStore.createStore({storage:localStorage,actor:{id:'bo_'+String(session?.role||'signedout'),role:'admin'}});
  const state=store.snapshot(),exp=state.expedients[expedientId];
  if(state.revision!==expectedRevision)throw Error('El expediente CRM cambió.');
  servicingOfficeRequire('docs');servicingOfficeRequire(exp?.kind==='patient'?'patientActions':'providerActions');
  const actor=session,sourceRaw=localStorage.getItem(DEMO_STORAGE_KEY);
  if(['receive','approve'].includes(action)){
    if(!window.PulzzoCRMEvidence)throw Error('No se pueden verificar los archivos locales.');
    const descriptor=exp?.documentCorrectionSubmission?.descriptor;
    if(!descriptor?.id)throw Error('Falta la versión documental enviada por el titular.');
    const evidence=window.PulzzoCRMEvidence.createEvidenceStore();
    try{
      const file=await evidence.get(descriptor.id);
      if(!file||!file.blob||file.contactId!==exp.contactId||['id','name','mimeType','size','actorId','uploadedAt','contactId'].some(k=>file[k]!==descriptor[k]))throw Error('El archivo local no coincide con la versión enviada.');
      if(await window.PulzzoCRMEvidence.validateBlob(file.blob)!==descriptor.mimeType)throw Error('El tipo real del documento no coincide.');
    }finally{await evidence.close();}
    if(session!==actor||localStorage.getItem(DEMO_STORAGE_KEY)!==sourceRaw||store.snapshot().revision!==expectedRevision)throw Error('La sesión, el expediente o la revisión cambió mientras se verificaba el archivo.');
    servicingOfficeRequire('docs');servicingOfficeRequire(exp?.kind==='patient'?'patientActions':'providerActions');
  }
  const module=window.PulzzoCRMCorrections;let prepared;
  if(action==='request')prepared=module.prepareDocumentRequest(db,exp,input?.docId||'',input?.reason||'',session.email);
  else if(action==='receive')prepared=module.prepareDocumentReceive(db,exp,session.email);
  else if(action==='approve')prepared=module.prepareDocumentApprove(db,exp,session.email);
  else if(action==='reject')prepared=module.prepareDocumentReject(db,exp,input?.reason||'',session.email);
  else throw Error('Acción documental desconocida.');
  const next=JSON.stringify(prepared.database);servicingOfficeAssertCurrent();
  if(store.snapshot().revision!==expectedRevision)throw Error('La corrección documental cambió.');
  localStorage.setItem(DEMO_STORAGE_KEY,next);db=prepared.database;dispersionLedgerStorageVersion=next;operationalAuditBaseline=operationalSnapshot();
  return {id:prepared.id,reviewProjection:prepared.reviewProjection};
}
window.PulzzoCRMOfficeAdapter={getDatabase:()=>db,actor:()=>session?.email||'',actorId:()=> 'bo_'+String(session?.role||'signedout'),assertCurrent:servicingOfficeAssertCurrent,canImportPatient:()=>can('riskActions'),canImportProvider:()=>can('providerActions'),canReadPatient:()=>can('patientActions')||can('riskActions'),canReadProvider:()=>can('providerActions'),canReviewDocument:kind=>can('docs')&&can(kind==='patient'?'patientActions':'providerActions'),commitNew:crmOfficeCommitNew,commitDecision:crmOfficeCommitDecision,commitCorrection:crmOfficeCommitCorrection,commitDocumentCorrection:crmOfficeCommitDocumentCorrection,refresh:()=>render()};

// Prefer the existing account registry; recognize only exact, submitted CRM identities.
const crmOriginalOfficeAccount=servicingOfficeAccount;
servicingOfficeAccount=function(kind,id){
  try{return crmOriginalOfficeAccount(kind,id);}catch(original){
    if(!window.PulzzoCRMStore||!window.PulzzoCRMOffice)throw original;
    const state=window.PulzzoCRMStore.createStore({storage:localStorage,actor:{id:'bo_'+String(session?.role||'signedout'),role:'admin'}}).snapshot();
    if(!window.PulzzoCRMOffice.accountExists(state,kind,id))throw original;
    return id;
  }
};
