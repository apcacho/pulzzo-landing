/* Scoped binary document review for the existing Backoffice review surface.
 * Local IndexedDB only. This adapter never approves, imports or uploads a file. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root){root.PulzzoCRMDocumentPreview=api;if(root.document)api.mount(root);}})(typeof window!=='undefined'?window:null,function(){
'use strict';
const safeText=value=>String(value??'').replace(/[<>&"'\\]/g,c=>({'<':'‹','>':'›','&':'＆','"':'”',"'":'’','\\':'＼'}[c]));
function exactReference(exp,id){
 if(JSON.stringify(exp.documents||[])!==JSON.stringify(exp.submissionSnapshot?.documents||[])||JSON.stringify(exp.onboarding||null)!==JSON.stringify(exp.submissionSnapshot?.onboarding||null))return false;
 if((exp.submissionSnapshot.documents||[]).some(d=>d.evidenceId===id))return true;
 const drafts=[exp.documentCorrectionSubmission,...Object.values(exp.documentCorrectionSubmissions||{})];
 return drafts.some(row=>row?.descriptor?.id===id&&row.contactId===exp.contactId&&row.expedientId===exp.id&&row.accountId===exp.holderIdentity?.id&&row.holderConfirmation?.confirmed===true&&row.holderConfirmation?.actorId===exp.holderIdentity?.id);
}
async function resolveBinary(options){
 const {metadata,record,storage,evidence,validateBlob,isCurrent}=options;
 const assert=()=>{if(!isCurrent())throw Error('La vista o los permisos cambiaron. Abre de nuevo el documento.');};
 assert();if(!metadata?.evidenceId||!record?.crmIntake)throw Error('No existe un archivo binario vinculado.');
 const raw=storage.getItem('pulzzo_crm_assisted_demo_v1'),state=JSON.parse(raw||'null'),intake=record.crmIntake,exp=state?.expedients?.[intake.expedientId];
 if(!exp||exp.contactId!==intake.contactId||exp.holderIdentity?.id!==intake.accountId||exp.submissionSnapshot?.submissionId!==intake.submissionId||exp.submissionSnapshot?.accountId!==intake.accountId||exp.submissionSnapshot?.contactId!==intake.contactId||JSON.stringify(exp.submissionSnapshot?.holderIdentity)!==JSON.stringify(exp.holderIdentity)||!exactReference(exp,metadata.evidenceId))throw Error('El documento no pertenece a este expediente enviado.');
 const file=await evidence.get(metadata.evidenceId);assert();
 if(!file?.blob||file.id!==metadata.evidenceId||file.contactId!==intake.contactId||file.size!==metadata.size||file.mimeType!==metadata.mimeType||metadata.uploadedBy&&file.actorId!==metadata.uploadedBy||metadata.uploadedAt&&file.uploadedAt!==metadata.uploadedAt||metadata.fileName&&file.name!==metadata.fileName&&safeText(file.name)!==metadata.fileName&&safeText(file.name.slice(0,120))!==metadata.fileName)throw Error('El archivo local falta o no coincide con esta versión. Vuelve a cargarlo desde el expediente.');
 if(await validateBlob(file.blob)!==file.mimeType)throw Error('El contenido real del archivo no coincide con el tipo registrado.');
 assert();if(storage.getItem('pulzzo_crm_assisted_demo_v1')!==raw)throw Error('El expediente cambió mientras se leía el archivo. Actualiza la revisión.');
 return file;
}
function mount(w){
 if(typeof w.renderDocumentReview!=='function'||typeof w.closeDocumentReview!=='function')return;
 const render=w.renderDocumentReview,close=w.closeDocumentReview;let epoch=0,url=null,activeTarget=null,activeMedia=null;
 function cleanup(){epoch++;if(activeMedia){activeMedia.pause?.();activeMedia.removeAttribute?.('src');activeMedia=null;}if(activeTarget){activeTarget.replaceChildren();activeTarget.textContent='Vista cerrada. Abre de nuevo el documento para consultarlo.';activeTarget=null;}if(url){w.URL.revokeObjectURL(url);url=null;}}
 w.renderDocumentReview=function(){cleanup();const result=render.apply(this,arguments);void load();return result;};
 w.closeDocumentReview=function(){cleanup();return close.apply(this,arguments);};
 async function load(){
  const turn=epoch,c=typeof reviewContext!=='undefined'?reviewContext:null,office=w.PulzzoCRMOfficeAdapter;
  if(!c||!office||!w.PulzzoCRMEvidence)return;
  const row=resolveReviewContext(c),meta=row?.file||row?.doc;
  if(row?.missing||!meta?.evidenceId||!row.record?.crmIntake||row.files.length&&c.attachmentIndex===null)return;
  const target=w.document.querySelector('#modal .review-preview-empty');if(!target)return;
  const actor=office.actorId(),actorEmail=office.actor(),loggedSession=typeof session!=='undefined'?session:null,raw=w.localStorage.getItem('pulzzo_backoffice_demo'),kind=c.kind==='patient'?'patient':'doctor';
  function current(){try{office.assertCurrent();const latest=resolveReviewContext(c);return turn===epoch&&reviewContext===c&&office.actorId()===actor&&office.actor()===actorEmail&&(typeof session==='undefined'||session===loggedSession)&&(office.canReadDocument?office.canReadDocument(kind):office.canReviewDocument(kind))&&w.localStorage.getItem('pulzzo_backoffice_demo')===raw&&!latest.missing&&(latest.file||latest.doc)===meta&&target.isConnected!==false;}catch(_){return false;}}
  if(!current())return;activeTarget=target;target.textContent='Abriendo el archivo ficticio guardado…';
  const service=w.PulzzoCRMEvidence.createEvidenceStore({isCurrent:current});
  try{
   const file=await resolveBinary({metadata:meta,record:row.record,storage:w.localStorage,evidence:service,validateBlob:w.PulzzoCRMEvidence.validateBlob,isCurrent:current});if(!current())return;
   url=w.URL.createObjectURL(file.blob);target.replaceChildren();
   const view=w.document.createElement(file.mimeType.startsWith('image/')?'img':file.mimeType.startsWith('video/')?'video':'iframe');view.src=url;
   if(view.tagName==='IFRAME'){view.setAttribute('sandbox','');view.title='Documento ficticio';view.className='review-preview-pdf';}else{view.className='review-preview-image';if(file.mimeType.startsWith('video/'))view.controls=true;else view.alt='Documento ficticio '+file.name;}
   activeMedia=view;target.appendChild(view);if(file.mimeType==='application/pdf')void w.PulzzoCRMEvidence.renderPDFFrame?.(view,file.blob,current);const link=w.document.createElement('a');link.href=url;link.download=file.name;link.textContent='Descargar archivo ficticio';target.appendChild(link);
  }catch(error){if(current())target.textContent=error.message;}
  finally{await service.close();}
 }
 w.addEventListener('pagehide',cleanup);w.addEventListener('storage',cleanup);
 w.document.getElementById('logoutBtn')?.addEventListener('click',cleanup);w.document.getElementById('loginBtn')?.addEventListener('click',cleanup);w.document.getElementById('loginPass')?.addEventListener('keydown',event=>{if(event.key==='Enter')cleanup();});
}
return {resolveBinary,exactReference,mount};
});
