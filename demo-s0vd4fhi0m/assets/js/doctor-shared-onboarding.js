/* Full medical onboarding in an explicitly scoped CRM session. Local demo only. */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PulzzoSharedDoctorOnboarding=api;
})(typeof window!=='undefined'?window:null,function(root){
'use strict';
const STATE_KEY='pulzzoDoctorOnboardingCleanV3';
const MAX_FILE_BYTES=5*1024*1024,MAX_TOTAL_BYTES=25*1024*1024;
const FILE_TYPES=['application/pdf','image/png','image/jpeg','image/webp'];
let context=null,error=null,requested=false,basicBaseline=null,basicDirty=false,restoreBasic=null,readVersion=0,pageActive=true,previewVersion=0,photoVersion=0,previewURL=null,photoURL=null;
const clone=value=>JSON.parse(JSON.stringify(value));
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
if(root){
  const params=new URLSearchParams(root.location.search||'');
  requested=params.has('crmExp')||params.has('crmMode');
  if(requested&&!error)try{context=root.PulzzoCRMOnboarding.open({kind:'doctor'});if(!context)throw Error('La sesión compartida no está disponible.');}catch(e){error=e;}
  root.addEventListener('pagehide',()=>{pageActive=false;invalidateReads();});
  root.addEventListener('hashchange',invalidateReads);
  root.addEventListener('pageshow',()=>{pageActive=true;});
}
// Keep old shared URLs and clean deployment paths in the full native shell.
// Replacing only the hash avoids a reload, duplicate history entry or new session.
function replaceRoute(hash){
  if(root.history?.replaceState)root.history.replaceState(root.history.state,'',root.location.pathname+root.location.search+hash);
  else root.location.hash=hash;
}
function syncRoute(){
  if(!context)return;
  let hash=root.location.hash;
  if(hash!=='#datos-medicos'&&hash!=='#perfil-medico'){
    try{hash=root.PulzzoCRMOnboarding.doctorCaptureHash?.(readState())||'#datos-medicos';}
    catch(e){hash='#datos-medicos';showError(e);}
    replaceRoute(hash);
  }
  if(basicDirty&&hash!=='#datos-medicos'){
    if(!root.confirm('Los datos principales tienen cambios sin guardar. ¿Salir sin guardarlos?')){replaceRoute('#datos-medicos');hash='#datos-medicos';}
    else{basicDirty=false;try{const state=readState();basicBaseline=context.storage.getItem(STATE_KEY);restoreBasic?.(state);}catch(e){showError(e);}}
  }
  root.document.body.classList.toggle('shared-doctor-basic',hash==='#datos-medicos');
}
function markBasicDirty(){
  if(!context||root.location.hash!=='#datos-medicos')return;
  basicDirty=true;showMessage('Tienes cambios en los datos principales sin guardar. Usa Guardar y continuar antes de salir.');
}
function assertContext(){if(!context)throw error||Error('Abre el expediente desde el CRM o tu acceso de titular.');context.assertFresh();return context;}
function readState(){return JSON.parse(assertContext().storage.getItem(STATE_KEY));}
function readReviewStatus(ctx,storage,office){
 ctx.assertFresh();
 const exp=ctx.getExpedient();
 if(!ctx.isHolder||!ctx.isVerified||exp.kind!=='doctor'||exp.id!==ctx.expId||!ctx.accountId||ctx.accountId!==exp.holderIdentity?.id)throw Error('La sesión no corresponde al titular de este perfil.');
 if(!office||typeof office.readSubmittedRecord!=='function')throw Error('No está disponible la consulta del estado del perfil.');
 const record=office.readSubmittedRecord(storage,exp);
 if(!record)return 'En revisión';
 return ({aprobado:'Aprobado',approved:'Aprobado',rechazado:'Rechazado',rejected:'Rechazado',correccion:'Corrección requerida',correction_required:'Corrección requerida'})[record.applicationStatus]||'En revisión';
}
function reviewStatus(){
 if(!context||!context.isHolder)return 'En revisión';
 return readReviewStatus(assertContext(),root.localStorage,root.PulzzoCRMOffice);
}

function showMessage(message,isError=false){
  if(!root)return;
  for(const id of ['shared-doctor-message','doctor-registration-message']){const el=root.document.getElementById(id);if(el){el.textContent=String(message||'');el.setAttribute('role',isError?'alert':'status');}}
}
function showError(e){
  showMessage((e||error)?.message||'No se puede abrir este expediente. Regresa a tu sesión y vuelve a abrirlo.',true);
  if(root&&requested&&!context){
    const message=root.document.getElementById('doctor-registration-message');
    if(message){const holder=new URLSearchParams(root.location.search||'').get('crmMode')==='holder',back=root.document.createElement('a');back.id='shared-doctor-recovery';back.href=holder?'asistido-demo.html?login=1&kind=doctor':'backoffice.html#crm';back.textContent=holder?' Volver al acceso del titular':' Volver al CRM';message.appendChild(back);}
  }
}
function saveBasic(initial,specialties){
  try{
    const ctx=assertContext();if(!ctx.canEdit())throw Error('El expediente está enviado. Las correcciones requieren una observación autorizada.');
    const raw=ctx.storage.getItem(STATE_KEY);
    if(basicBaseline===null||raw!==basicBaseline)throw Error('El expediente cambió desde que abriste estos datos. Recarga antes de guardar.');
    const previous=JSON.parse(raw);
    const next={...previous,currentStep:Math.max(2,Number(previous.currentStep)||1),profile:{...previous.profile,...initial.profile},contact:{...previous.contact,registered:initial.contact.registered},specialties:clone(specialties),procedures:clone(initial.procedures)};
    // One guarded write retains every non-basic field and the complete document collection.
    ctx.storage.setItem(STATE_KEY,JSON.stringify(next));
    if(ctx.isHolder&&ctx.getExpedient&&!ctx.getExpedient().initialRegistration)ctx.completeInitialRegistration();
    basicBaseline=ctx.storage.getItem(STATE_KEY);basicDirty=false;
    const email=root.document.getElementById('correo_med');if(email)email.readOnly=!!next.profile.email;
    showMessage('Datos principales guardados en este expediente.');
    root.location.hash='#perfil-medico';
    return true;
  }catch(e){showError(e);return false;}
}
function prepareBasic(restore){
  if(!requested)return;
  const doc=root.document;
  doc.body.classList.add('crm-doctor-onboarding');
  for(const selector of ['.consent-box','.crm-demo-entry','.auth-switch','.auth-divider','.auth-copy','#pass_field','#pass2_field'])doc.querySelectorAll(selector).forEach(el=>{el.hidden=true;el.style.display='none';el.querySelectorAll('input,button').forEach(input=>{input.disabled=true;});});
  const passwordRow=doc.getElementById('pass_field')?.closest?.('.form-row');if(passwordRow){passwordRow.hidden=true;passwordRow.style.display='none';}
  const securityLabel=Array.from(doc.querySelectorAll('.section-label')).find(el=>el.textContent.trim()==='Seguridad');if(securityLabel)securityLabel.hidden=true;
  doc.querySelectorAll('input[type="password"]').forEach(input=>{input.disabled=true;input.value='';});
  const submit=doc.querySelector('.form-grid button[type="submit"]');if(submit)submit.textContent='Guardar y continuar al perfil completo';
  try{
    const ctx=assertContext(),state=readState();basicBaseline=ctx.storage.getItem(STATE_KEY);restoreBasic=restore;restore(state);
    const form=doc.querySelector('.form-grid');
    // Keep the original form in its native registration shell, with its listeners.
    const card=doc.querySelector('main.auth-shell .auth-card'),view=doc.getElementById('doctorProfileView');
    if(card&&view){
      card.id='shared-doctor-basic-editor';
      const heading=doc.getElementById('registro-doctor-title');if(heading)heading.textContent='Completar registro';
      const kicker=card.querySelector('.auth-card-kicker');if(kicker)kicker.textContent=ctx.isAssistant?'Captura asistida':'Registro médico';
      card.querySelectorAll('.auth-card-head > p:not(.crm-demo-entry)').forEach(el=>{el.textContent='Completa o actualiza los datos de este expediente. Después continúa con el perfil, los documentos y el banco.';});
      const label=card.querySelector('label[for="tipo"]');if(label)label.textContent='Tipo de perfil';
      const option=doc.getElementById('tipo')?.options?.[0];if(option)option.textContent='Selecciona tipo de perfil';
      card.querySelectorAll('.section-label').forEach(el=>{if(el.textContent.trim()==='Tipo de cuenta')el.textContent='Tipo de perfil';});
      const cancel=doc.createElement('button');cancel.type='button';cancel.id='shared-doctor-basic-cancel';cancel.className='profile-btn ui-action-secondary';cancel.textContent='Cancelar y volver al perfil';
      cancel.addEventListener('click',()=>{root.location.hash='#perfil-medico';});form.appendChild(cancel);
    }
    syncRoute();
    root.addEventListener('hashchange',syncRoute);
    if(form){['input','change'].forEach(type=>form.addEventListener(type,event=>{if(['esp_search','proc_search'].includes(event.target?.id))return;markBasicDirty();}));}
    root.addEventListener('hashchange',()=>{
      if(root.location.hash!=='#datos-medicos'||basicDirty)return;
      try{const current=readState();basicBaseline=ctx.storage.getItem(STATE_KEY);restoreBasic(current);if(!ctx.canEdit())doc.querySelectorAll('.form-grid input,.form-grid select,.form-grid button').forEach(el=>{if(el.id!=='shared-doctor-basic-cancel')el.disabled=true;});}catch(e){showError(e);}
    });
    root.addEventListener('beforeunload',event=>{if(basicDirty){event.preventDefault();event.returnValue='';}});
    const email=doc.getElementById('correo_med');if(email){email.readOnly=!!state.profile?.email;email.title=email.readOnly?'El correo pertenece al contacto del expediente y no puede cambiarse desde la captura.':'Captura el correo de acceso del titular; se vinculará a este contacto al guardar.';}
    const banner=doc.createElement('section');banner.id='shared-doctor-banner';banner.className='shared-doctor-banner shared-capture-context';banner.setAttribute('aria-label','Sesión del expediente compartido');
    banner.innerHTML='<div class="shared-capture-top"><div class="shared-capture-heading"><span class="shared-capture-badge">'+esc(ctx.isAssistant?'Captura asistida':ctx.canEdit()?'Titular':'Expediente enviado')+'</span><p class="shared-capture-copy">'+(ctx.isAssistant?'Mismo expediente. El titular verifica y confirma el envío.':ctx.canEdit()?'Revisa este expediente antes de confirmar el envío.':'Consulta el estado de tu expediente y las observaciones del equipo.')+'</p></div><a class="shared-capture-return ui-action-secondary" data-shared-return href="'+esc(ctx.isHolder?ctx.reviewUrl:ctx.returnUrl)+'">'+(ctx.isHolder?(ctx.canEdit()?'Revisar y confirmar':'Ver estado del expediente'):'Volver al CRM')+'</a></div><div class="shared-capture-routes"><a class="shared-capture-route ui-action-secondary" data-shared-basic href="#datos-medicos">Editar datos principales</a><a class="shared-capture-route ui-action-secondary" data-shared-profile href="#perfil-medico">Continuar al perfil y documentos</a></div><p id="shared-doctor-message" class="shared-capture-status" role="status" aria-live="polite"></p>';
    function syncSharedNav(){
      const profile=root.location.hash!=='#datos-medicos';
      const hero=doc.querySelector('#doctorProfileView > .profile-hero');
      const form=doc.querySelector('.form-grid');
      if(profile&&hero)hero.after(banner);
      else if(form)form.before(banner);
      banner.querySelectorAll('[data-shared-basic],[data-shared-profile]').forEach(link=>{
        const current=link.hasAttribute('data-shared-profile')===profile||(!ctx.canEdit()&&link.hasAttribute('data-shared-basic'));
        link.hidden=current;link.style.display=current?'none':'';
        link.removeAttribute('aria-current');
      });
    }
    syncSharedNav();root.addEventListener('hashchange',syncSharedNav);

    banner.querySelectorAll('a').forEach(link=>link.addEventListener('click',event=>{try{if(!link.hasAttribute('data-shared-return'))assertContext();if(link.hasAttribute('data-shared-return')&&basicDirty&&!root.confirm('Los datos principales tienen cambios sin guardar. ¿Salir sin guardarlos?')){event.preventDefault();return;}if(link.hasAttribute('data-shared-return')&&basicDirty)basicDirty=false;}catch(e){event.preventDefault();showError(e);}}));
    if(!ctx.canEdit()){doc.querySelectorAll('.form-grid input,.form-grid select,.form-grid button').forEach(el=>{if(el.id!=='shared-doctor-basic-cancel')el.disabled=true;});showMessage('Los datos enviados se conservan; las correcciones requieren revisión.');}
    const publication=doc.getElementById('doctor-publication-holder');if(publication)publication.remove();
  }catch(e){error=e;showError(e);doc.querySelectorAll('.form-grid input,.form-grid select,.form-grid button').forEach(el=>{el.disabled=true;});}
}
function validateDocument(file,photo=false){
  const types=photo?['image/png','image/jpeg','image/webp','image/gif']:FILE_TYPES;
  if(!file||!types.includes(file.type)||!Number.isSafeInteger(file.size)||file.size<=0||file.size>MAX_FILE_BYTES)throw Error(photo?'Usa una foto ficticia PNG, JPEG, WebP o GIF de hasta 5 MiB.':'Usa un archivo ficticio PDF, PNG, JPEG o WebP de hasta 5 MiB.');
}
async function cleanupFiles(ctx,files){
  let failed=false;
  for(const descriptor of files)try{await ctx.removeUncommittedFile(descriptor);}catch(_){failed=true;}
  if(failed)showMessage('No se pudo liberar un archivo nuevo sin vincular. El expediente anterior se conservó; revisa el almacenamiento local antes de intentar otra carga.',true);
}
async function uploadDocuments(input,hooks){
  const selected=Array.from(input.files||[]);if(!selected.length)return false;
  const version=++readVersion,created=[];let ctx,committed=false;input.disabled=true;
  try{
    ctx=assertContext();if(!ctx.canEdit())throw Error('El expediente enviado está bloqueado.');
    const key=input.dataset.profileUploadDoc;if(!/^[a-z][a-z0-9_]{0,100}$/.test(key))throw Error('Documento no válido.');
    selected.forEach(file=>validateDocument(file));
    const next=hooks.getState(),raw=ctx.storage.getItem(STATE_KEY);
    const active=()=>{assertContext();if(!pageActive||version!==readVersion||input.isConnected===false||!ctx.canEdit()||ctx.storage.getItem(STATE_KEY)!==raw)throw Error('El expediente, el formulario o la sesión cambió durante la carga. Vuelve a seleccionar el archivo.');};
    showMessage('Guardando archivos ficticios en este expediente…');
    // Sequential writes let every created orphan be rolled back if a later file fails.
    for(const file of selected){active();created.push(await ctx.putFile(file,{documentType:key}));active();}
    const files=created.map(file=>({...file,type:file.mimeType||file.type,status:'En revisión',reason:'',metadataOnly:false,demo:true}));
    next.files={...next.files};const index=input.dataset.profileFileIndex;
    if(index!==undefined&&index!==null&&index!==''){
      if(!/^\d+$/.test(index)||!Array.isArray(next.files[key])||Number(index)>=next.files[key].length)throw Error('La versión del documento cambió. Recarga antes de reemplazarla.');
      next.files[key]=[...next.files[key]];next.files[key][Number(index)]=files[0];
      // A replacement field accepts just one file; ignore no uncommitted extras.
      if(files.length!==1)throw Error('Selecciona un solo archivo para reemplazar esta versión.');
    }else next.files[key]=files;
    active();hooks.saveState(next);committed=true;hooks.refresh();showMessage('Archivo guardado en el mismo expediente. Pendiente de revisión.');return true;
  }catch(e){showError(e);return false;}finally{if(!committed&&ctx)await cleanupFiles(ctx,created);input.disabled=false;input.value='';}
}
function closePreview(){previewVersion++;if(previewURL){root.URL.revokeObjectURL(previewURL);previewURL=null;}}
function closePhoto(){photoVersion++;if(photoURL){root.URL.revokeObjectURL(photoURL);photoURL=null;}}
async function previewDocument(body,key,index){
  closePreview();const version=previewVersion;body.replaceChildren();
  try{
    const ctx=assertContext(),state=readState(),descriptor=state.files?.[key]?.[index];
    if(!descriptor)throw Error('No hay un archivo guardado en esta casilla del expediente.');
    const item=await ctx.getFile(descriptor);
    assertContext();const current=readState().files?.[key]?.[index];
    if(!pageActive||version!==previewVersion||body.isConnected===false||JSON.stringify(current)!==JSON.stringify(descriptor))return;
    if(!item?.blob)throw Error('El archivo ya no está disponible en este navegador. Vuelve a cargarlo antes de continuar.');
    const type=item.mimeType||item.blob.type;if(!FILE_TYPES.includes(type)&&!(key==='profile_photo'&&type==='image/gif'))throw Error('El tipo de archivo no permite una vista previa segura.');
    const element=root.document.createElement(type==='application/pdf'?'iframe':'img');
    if(type==='application/pdf'){element.setAttribute('sandbox','');element.title='Documento ficticio de este expediente';element.style.cssText='width:100%;min-height:460px;border:0';}
    else{element.alt='Documento ficticio '+(item.name||descriptor.name);element.style.cssText='max-width:100%;height:auto';}
    previewURL=root.URL.createObjectURL(item.blob);element.src=previewURL;body.appendChild(element);
    if(type==='application/pdf')void root.PulzzoCRMEvidence?.renderPDFFrame?.(element,item.blob,()=>{assertContext();return pageActive&&version===previewVersion&&JSON.stringify(readState().files?.[key]?.[index])===JSON.stringify(descriptor);});
  }catch(e){if(pageActive&&version===previewVersion){body.textContent=e.message;showError(e);}}
}
async function hydratePhoto(image){
  closePhoto();const version=photoVersion;if(!image)return;
  try{
    const ctx=assertContext(),descriptor=readState().files?.profile_photo?.[0];if(!descriptor)return;
    const item=await ctx.getFile(descriptor);assertContext();
    if(!pageActive||version!==photoVersion||image.isConnected===false||JSON.stringify(readState().files?.profile_photo?.[0])!==JSON.stringify(descriptor))return;
    if(!item?.blob)throw Error('La foto guardada ya no está disponible en este navegador. Puedes volver a cargarla o continuar sin foto.');
    photoURL=root.URL.createObjectURL(item.blob);image.src=photoURL;
  }catch(e){if(pageActive&&version===photoVersion){image.removeAttribute?.('src');showError(e);}}
}
async function uploadPhoto(file,hooks,options={}){
  const version=++readVersion,created=[];let ctx,committed=false;
  try{
    validateDocument(file,true);ctx=assertContext();const next=hooks.getState(),raw=ctx.storage.getItem(STATE_KEY);
    const active=()=>{assertContext();if(!pageActive||version!==readVersion||!ctx.canEdit()||ctx.storage.getItem(STATE_KEY)!==raw||options.expectedState!==undefined&&options.expectedState!==raw||options.isCurrent&&!options.isCurrent())throw Error('La sesión, la foto o el perfil cambió durante la carga. El archivo anterior se conservó.');};
    active();showMessage('Guardando foto ficticia…');const descriptor=await ctx.putFile(file,{documentType:'profile_photo'});created.push(descriptor);active();
    next.files={...next.files,profile_photo:[{...descriptor,type:descriptor.mimeType||descriptor.type,status:'En revisión',reason:'',metadataOnly:false,demo:true}]};next.profilePhotoData='';next.photoMode=options.mode||'upload';
    hooks.saveState(next);committed=true;hooks.refresh();showMessage('Foto opcional guardada en este expediente. No se publicó en el directorio.');return true;
  }catch(e){showError(e);return false;}finally{if(!committed&&ctx)await cleanupFiles(ctx,created);}
}
function invalidateReads(){readVersion++;closePreview();closePhoto();}
return {readReviewStatus,reviewStatus,context,error,requested,markBasicDirty,STATE_KEY,MAX_FILE_BYTES,MAX_TOTAL_BYTES,FILE_TYPES,assertContext,readState,syncRoute,saveBasic,prepareBasic,showError,showMessage,uploadDocuments,previewDocument,closePreview,hydratePhoto,uploadPhoto,invalidateReads};
});
