/* Full patient form, scoped to one CRM expediente. Local DEMO only. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PulzzoPatientOnboarding=api;})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const steps=['geolocalizacion','procedimiento','estimacion','identidad','ingresos','documentos','autorizacion'];
  const maxFileBytes=5*1024*1024, maxAggregateBytes=25*1024*1024;
  const mime=/^(?:application\/pdf|image\/(?:png|jpeg|webp)|video\/(?:webm|mp4))$/;
  function metadata(file){
    const result={name:String(file.name||'Documento ficticio'),type:String(file.type||file.mimeType||''),size:Number(file.size)||0,lastModified:Number(file.lastModified)||0,status:file.status||'En revisión',reason:file.reason||''};
    for(const key of ['evidenceId','mimeType','actorId','contactId','documentType','uploadedAt','demo'])if(file[key]!==undefined)result[key]=file[key];
    result.metadataOnly=!result.evidenceId;return result;
  }
  function storedBytes(state){return Object.values(state.identityFiles||{}).concat(Object.values(state.documentFiles||{}).flat()).reduce((sum,file)=>sum+(file?.evidenceId?Number(file.size)||0:0),0);}
  function validateFile(file){
    if(!file||!Number.isFinite(file.size)||file.size<=0||file.size>maxFileBytes)throw Error('Usa un archivo ficticio de hasta 5 MiB.');
    if(!mime.test(file.type||''))throw Error('Usa PDF, PNG, JPEG, WebP, WebM o MP4 ficticios.');
    return true;
  }
  function resumeView(state,requested){const value=String(requested||'').replace(/^#/,'');if(steps.includes(value))return value;const flags=['geoDone','procedureDone','estimateDone','identityDone','incomeDone','documentsDone','referencesSaved'];const first=flags.findIndex(key=>!state[key]);return steps[first<0?steps.length-1:first];}
  function open(win){
    let ctx=null;
    try{
      const hasScope=/(?:[?&])crm(?:Exp|Mode)=/.test(win.location.search||'');
      if(!win.PulzzoCRMOnboarding){if(hasScope)throw Error('No está disponible el expediente compartido. Regresa al CRM y vuelve a abrirlo.');return null;}
      ctx=win.PulzzoCRMOnboarding.open({kind:'patient'});
      if(ctx&&!ctx.canEdit())throw Error('Este expediente está bloqueado para captura. Regresa a su revisión para consultar el estado o las correcciones.');
      return ctx;
    }catch(error){
      const panel=win.document.createElement('section');panel.setAttribute('role','alert');panel.style.cssText='padding:24px;background:white;border:2px solid #a52a2a;margin:24px';panel.textContent=error.message;
      const holderEntry=ctx?ctx.isHolder:new URLSearchParams(win.location.search||'').get('crmMode')==='holder';
      const back=win.document.createElement('a');back.href=ctx?(ctx.isHolder?ctx.reviewUrl:ctx.returnUrl):holderEntry?'asistido-demo.html?login=1&kind=patient':'backoffice.html#crm';back.textContent=holderEntry?(ctx?' Volver a la revisión del expediente':' Volver al acceso del titular'):' Volver al CRM';panel.appendChild(back);win.document.body.replaceChildren(panel);throw error;
    }
  }
  return {steps,maxFileBytes,maxAggregateBytes,metadata,storedBytes,validateFile,resumeView,open};
});
