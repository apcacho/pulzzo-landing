/* Patient prototype helpers. No authentication, underwriting or external service.
 * Existing LANDING demo flat-cost factors are shared unchanged across estimates.
 * These are illustrative total-cost multipliers, NOT annual commercial rates.
 * Replace only after an approved pricing specification exists.
 */
(function(root, factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.PulzzoPatientDemo=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const costFactorsFlat=Object.freeze({6:.18,12:.28,18:.38,24:.48});
  const money=value=>Number(value||0).toLocaleString('es-MX',{style:'currency',currency:'MXN',minimumFractionDigits:2,maximumFractionDigits:2});
  function parseAmount(value){
    if(typeof value==='number') return Number.isFinite(value)?value:0;
    const n=Number(String(value||'').replace(/\s+a\s+\d+\s+meses\s*\.?$/i,'').replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)?n:0;
  }
  function quote(amount,term){
    amount=parseAmount(amount); term=Number(term);
    const factor=costFactorsFlat[term];
    if(amount<=0 || factor===undefined) return null;
    const total=Math.round(amount*(1+factor)*100)/100;
    return {amount,termMonths:term,factor,total,monthly:Math.round(total/term*100)/100,illustrative:true};
  }
  function readStorage(storage,key,fallback={}){
    try { const value=JSON.parse(storage.getItem(key)||'null'); return value && typeof value==='object' && !Array.isArray(value)?value:fallback; } catch(e){return fallback;}
  }
  function newPatientAccountId(){
    const token=typeof crypto!=='undefined' && typeof crypto.randomUUID==='function'
      ? crypto.randomUUID() : Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);
    return 'PAT-'+token;
  }
  // Add only identity bindings to legacy records. Never rewrite an accepted offer,
  // signed contract, application ID, or payment facts during this migration.
  function migratePatientAccount(storage){
    const patientRaw=storage.getItem('pulzzo_patient'), applicationRaw=storage.getItem('pulzzo_application');
    if(!patientRaw)return null;
    const patient=JSON.parse(patientRaw);
    if(!patient || typeof patient!=='object' || Array.isArray(patient) || !(patient.correo||patient.email))return null;
    const application=applicationRaw?JSON.parse(applicationRaw):null;
    if(applicationRaw && (!application || typeof application!=='object' || Array.isArray(application)))throw Error('La solicitud local no es válida.');
    const accountId=patient.patientAccountId || newPatientAccountId();
    if(typeof accountId!=='string' || accountId.length>180 || /[\u0000-\u001f]/.test(accountId))throw Error('La cuenta local no tiene una identidad válida.');
    if(application?.patientAccountId && application.patientAccountId!==accountId)throw Error('La solicitud pertenece a otra cuenta.');
    patient.patientAccountId=accountId;
    if(application && !application.patientAccountId)application.patientAccountId=accountId;
    const nextPatient=JSON.stringify(patient), nextApplication=application?JSON.stringify(application):applicationRaw;
    if(storage.getItem('pulzzo_patient')!==patientRaw || storage.getItem('pulzzo_application')!==applicationRaw)throw Error('La solicitud cambió en otra pestaña.');
    try{
      if(nextPatient!==patientRaw)storage.setItem('pulzzo_patient',nextPatient);
      if(nextApplication!==applicationRaw){
        if(storage.getItem('pulzzo_patient')!==nextPatient || storage.getItem('pulzzo_application')!==applicationRaw)throw Error('La solicitud cambió en otra pestaña.');
        storage.setItem('pulzzo_application',nextApplication);
      }
    }catch(error){
      // Restore only our own write; never erase a newer tab's account.
      if(nextPatient!==patientRaw && storage.getItem('pulzzo_patient')===nextPatient){try{storage.setItem('pulzzo_patient',patientRaw);}catch(_){}}
      throw error;
    }
    return patient;
  }
  function scrubSecrets(value){
    if(!value || typeof value!=='object') return value;
    Object.keys(value).forEach(key=>{
      if(/^(ciecPassword|satPassword|password|password2|confirmPassword|passwordConfirmation|contrasena|contraseña|satCredential|ciecCredential)$/i.test(key)) delete value[key];
      else scrubSecrets(value[key]);
    });
    return value;
  }
  const storageKeys=['pulzzo_patient','pulzzo_application','pulzzo_backend_payload','pulzzo_register_backend_payload','pulzzo_verification_backend_payload','pulzzo_patient_demo_recovery_backup'];
  function scrubKnownStorage(storage){
    storageKeys.forEach(key=>{
      const raw=storage.getItem(key); if(!raw) return;
      try {const value=JSON.parse(raw); scrubSecrets(value); const next=JSON.stringify(value); if(next!==raw) storage.setItem(key,next);} catch(e){/* Invalid state is read safely; never log stored content. */}
    });
    ['ciecPassword','satPassword','pulzzoPatientPassword'].forEach(key=>storage.removeItem(key));
  }
  function normalizeDocuments(documents={}){
    const aliases={annualTax:'annualReturns',monthlyTax:'monthlyReturn',compliance:'complianceOpinion'};
    Object.entries(aliases).forEach(([old,key])=>{
      const canonical=Array.isArray(documents[key])?documents[key]:[];
      const legacy=Array.isArray(documents[old])?documents[old]:[];
      const unique=[...canonical];
      legacy.forEach(file=>{if(!unique.some(f=>f.name===file.name && f.size===file.size)) unique.push(file);});
      if(unique.length || key in documents || old in documents) documents[key]=unique;
      delete documents[old];
    });
    return documents;
  }
  function offerExpiryStatus(state,now=new Date()){
    if(state.offerAccepted||state.contractSigned||state.signatureStatus==='signed')return 'accepted';
    const until=state.offer?.validUntil;
    if(!until)return 'missing';
    const day=String(until).trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return 'invalid';
    const parsed=new Date(day+'T12:00:00Z');
    if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==day)return 'invalid';
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
    const today=values.year+'-'+values.month+'-'+values.day;
    return today>day?'expired':'active';
  }
  function offerAvailable(state,now=new Date()){
    return !!state.offerReady && !state.denied && !state.pulzzoRejected && !state.reapplyBlocked && !['expired','invalid'].includes(offerExpiryStatus(state,now));
  }
  function resumeView(state={},requested=''){
    const steps=['geolocalizacion','procedimiento','estimacion','identidad','ingresos','documentos','autorizacion','portal'];
    const flags=['geoDone','procedureDone','estimateDone','identityDone','incomeDone','documentsDone','creditAuthConfirmed'];
    let index=flags.findIndex(key=>!state[key]); if(index<0) index=7;
    const wanted=String(requested||'').replace(/^#/,'');
    if(wanted==='dashboard' && state.geoDone) return wanted;
    const requestIndex=steps.indexOf(wanted);
    return requestIndex>=0 && requestIndex<=index?wanted:steps[index];
  }
  function clearPostApproval(state){
    Object.keys(state).forEach(key=>{
      if(/^(offer|contract|signature|signStatus|signed|initialPayment|initialInstallments|downPayment|requiredInitialPayment|doctorPayment|amortization|paymentReady|paymentReference|paymentDate|paymentFrequency|preferredPaymentDay|firstPaymentDay|secondPaymentDay)/i.test(key)) delete state[key];
    });
    return state;
  }
  function paymentSchedule({termMonths,monthlyPayment,frequency='Mensual',paymentDay='15',start=new Date()}={}){
    const term=Number(termMonths); if(!Number.isInteger(term)||term<1||term>120) return [];
    const biweekly=String(frequency).toLowerCase()==='quincenal';
    const pairs={'15 y fin de mes':[15,'end'],'5 y 20':[5,20],'1 y 16':[1,16]};
    const days=biweekly?pairs[paymentDay]:(paymentDay==='Último día del mes'?['end']:[Number(paymentDay)]);
    if(!days || days.some(d=>d!=='end' && (!Number.isInteger(d)||d<1||d>28))) return [];
    const anchor=new Date(start); if(Number.isNaN(anchor.getTime())) return [];
    const amount=parseAmount(monthlyPayment);
    if(!Number.isFinite(amount)||amount<=0) return [];
    const monthlyCents=Math.round(amount*100);
    if(monthlyCents<=0) return [];
    const rows=[];
    for(let month=1;month<=term;month++){
      const end=new Date(anchor.getFullYear(),anchor.getMonth()+month+1,0).getDate();
      days.forEach((day,index)=>{
        const date=new Date(anchor.getFullYear(),anchor.getMonth()+month,day==='end'?end:day);
        const cents=biweekly?(index===0?Math.floor(monthlyCents/2):monthlyCents-Math.floor(monthlyCents/2)):monthlyCents;
        rows.push({n:rows.length+1,date:date.toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}),isoDate:[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-'),payment:money(cents/100),paymentAmount:cents/100,capital:'Por definir',interest:'Por definir',balance:'Por definir',status:rows.length?'Pendiente':'Próximo'});
      });
    }
    return rows;
  }
  // Fixed correction paths; never include terms, contract, ledger, or account IDs.
  const patientCorrectionFields=Object.freeze(Object.fromEntries([
    'incomeType','incomeMonthly','comfortablePayment','ciecChoice',
    'identity.name','identity.curp','identity.rfc','identity.rfcBase','identity.homoclave','identity.housingStatus','identity.housingPayment',
    ...['first','second','paternal','maternal'].map(k=>'identity.nameParts.'+k),
    ...['street','exterior','interior','zip','colony','city','state'].map(k=>'identity.address.'+k),
    ...[0,1].flatMap(i=>['name','phone','relationship','relationshipType','relationshipOther'].map(k=>'references.'+i+'.'+k)),
    ...['bank','payroll','csf','annualReturns','monthlyReturn','complianceOpinion'].map(k=>'documentFiles.'+k),
    ...['ineFront','ineBack','proofAddress','selfieVideo'].map(k=>'identityFiles.'+k)
  ].map(k=>[k,k])));
  const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  function patientDocumentMetadata(value){if(!value||typeof value!=='object')return null;return Object.fromEntries(['name','type','size','lastModified','updatedAt','reviewStatus','canRepeat'].filter(k=>value[k]!==undefined).map(k=>[k,copy(value[k])]));}
  function patientSnapshot(state){return Object.fromEntries(Object.keys(patientCorrectionFields).map(path=>{let value=state;for(const key of path.split('.'))value=value?.[key];return [path,path.startsWith('documentFiles.')?(Array.isArray(value)?value:[]).map(patientDocumentMetadata).filter(Boolean):path.startsWith('identityFiles.')?patientDocumentMetadata(value):String(value??'')];}));}
  function patientSubmitted(state){return !!(state.applicationSubmitted||state.applicationSubmittedAt||state.submittedAt||state.demoBridgeCaseId||state.offerAccepted||state.contractSigned);}
  const patientLockedKeys=['patient','patientRecipient','forWhom','procedure','specialties','procedures','otherSpecialty','otherProcedure','procedureCosts','procedureProviderAssignments','procedureProviderContacts','providerAssignmentMode','doctorSource','doctorId','doctorName','doctorPrefix','doctorState','doctorWhatsApp','doctorDirectoryState','when','requestedAmount','procedureCost','selectedTerm','selectedMonthly','selectedFactor','identity','identityFiles','identityDetectedName','incomeType','incomeMonthly','comfortablePayment','ciecChoice','documentFiles','documentProfile','references','referencesSaved','geolocation'];
  function assertPatientDataUnchanged(before,after,approvedCorrection=false){
    if(!patientSubmitted(before))return;
    if(before.offerAccepted&&after.offerAccepted!==true||before.contractSigned&&after.contractSigned!==true)throw Error('La aceptación y el contrato existentes deben conservarse.');
    if(before.offerAccepted||before.contractSigned){for(const key of ['offer','demoBridgeOfferFingerprint','paymentFrequency','preferredPaymentDay','paymentDayOption','paymentDays','firstPaymentDay','secondPaymentDay'])if(JSON.stringify(before[key])!==JSON.stringify(after[key]))throw Error('Las condiciones financieras aceptadas no pueden cambiar durante una corrección.');}
    const expected=copy(before);
    if(approvedCorrection){
      const r=before.demoPatientCorrection;
      if(!r||!['submitted','requested'].includes(r.status)||after.demoPatientCorrection?.status!=='approved')throw Error('No hay corrección aprobada para aplicar.');
      for(const path of Object.keys(after.demoPatientCorrection.approvedChanges||{})){
        if(!(path in patientCorrectionFields)||!r.allowedFields?.includes(path))throw Error('Campo de corrección no autorizado.');
        let target=expected;const parts=path.split('.');for(const key of parts.slice(0,-1))target=target[key]||(target[key]={});
        let value=after;for(const key of parts)value=value?.[key];target[parts.at(-1)]=copy(value);
      }
      if(expected.incomeType!==before.incomeType||expected.ciecChoice!==before.ciecChoice)expected.documentProfile=expected.incomeType;
      if(Object.keys(after.demoPatientCorrection.approvedChanges||{}).some(k=>k.startsWith('references.'))&&Array.isArray(after.references)&&after.references.length>=2&&after.references.every(r=>String(r.name||r.fullName||'').trim()&&String(r.phone||'').replace(/\D/g,'').length===10&&String(r.relationship||r.relationshipType||'').trim()))expected.referencesSaved=true;
    }
    for(const key of patientLockedKeys)if(JSON.stringify(expected[key])!==JSON.stringify(after[key]))throw Error('Los datos enviados están bloqueados. Solo puedes corregir los campos observados por backoffice.');
    if(before.applicationId!==after.applicationId||before.applicationSubmitted&&!after.applicationSubmitted)throw Error('La solicitud enviada no puede reiniciarse desde una corrección.');
  }
  return {patientCorrectionFields,patientSnapshot,patientSubmitted,assertPatientDataUnchanged,costFactorsFlat,money,parseAmount,quote,readStorage,scrubSecrets,scrubKnownStorage,normalizeDocuments,offerExpiryStatus,offerAvailable,resumeView,clearPostApproval,paymentSchedule,newPatientAccountId,migratePatientAccount};
});
