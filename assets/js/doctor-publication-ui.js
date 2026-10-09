/* Public directory and holder controls for a same-browser demo. No network publication. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;if(root){root.PulzzoDoctorPublicationUI=api;if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',api.mount);else api.mount();}}})(typeof window!=='undefined'?window:null,function(root){
'use strict';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const linkLabels={website:'Sitio web',instagram:'Instagram',facebook:'Facebook',doctoralia:'Doctoralia',linkedin:'LinkedIn',other:'Otro enlace'};
const statuses={draft:'Borrador',confirmed:'Autorizado por el titular · pendiente de revisión',approved:'Aprobado · pendiente de publicación',correction:'Cambios solicitados',rejected:'No aprobado',published:'Publicado en esta demo'};
let directoryMounted=false,holderMounted=false,directoryProfiles=[],holderModel=null,readSerial=0,renderGeneration=0,performing=false;
const get=id=>root.document.getElementById(id);
const context=()=>root?.PulzzoDoctorPublicationContext;
const core=()=>root?.PulzzoDoctorPublication;
function safeUrl(value){if(context())return context().safeUrl(value);try{if(typeof value!=='string'||!/^https?:\/\//i.test(value)||/[\u0000-\u0020\u007f]/.test(value))return '';const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&u.hostname.includes('.')?u.href:'';}catch(_){return '';}}
function validPhoto(photo){try{return photo&&core()&&core().validatePhoto(photo)?photo:null;}catch(_){return null;}}
function filterProfiles(profiles,filters={}){
 const q=norm(filters.text).split(/\s+/).filter(Boolean);
 return profiles.filter(p=>(!filters.specialty||norm(p.specialty)===norm(filters.specialty))&&(!filters.procedure||(p.services||[]).some(s=>norm(s)===norm(filters.procedure)))&&(!filters.state||norm(p.state)===norm(filters.state))&&(!filters.city||norm(p.city)===norm(filters.city))&&q.every(word=>norm([p.displayName,p.specialty,p.city,p.state,p.clinicName,p.bio,...(p.services||[])].join(' ')).includes(word)));
}
function profileCardHtml(p,{preview=false}={}){
 const photo=validPhoto(p.photo),initials=String(p.displayName||'Perfil').trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
 const links={...p.links};if(p.website)links.website=p.website;
 const anchors=Object.entries(linkLabels).map(([key,label])=>{const href=safeUrl(links[key]);return href?`<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}<span aria-hidden="true"> ↗</span></a>`:'';}).join('');
 const phone=String(p.phone||'').trim(),whatsapp=String(p.whatsapp||'').trim();
 const services=(p.services||[]).filter(x=>typeof x==='string');
 return `<article class="directory-doctor-card${preview?' is-preview':''}"><div class="directory-doctor-top">${photo?`<img class="directory-doctor-photo" src="${esc(photo.dataUrl)}" alt="Foto de ${esc(p.displayName)}" loading="lazy">`:`<div class="directory-doctor-avatar" role="img" aria-label="Perfil sin foto">${esc(initials)}</div>`}<div><span class="publication-eyebrow">${preview?'Vista previa de la ficha':'Ficha publicada · demo local'}</span><h3>${esc(p.displayName||'Nombre público')}</h3><p class="directory-specialty">${esc(p.specialty||'Especialidad por completar')}</p><p class="directory-location">${esc([p.city,p.state].filter(Boolean).join(', ')||'Ubicación por completar')}</p></div></div>${p.clinicName?`<p class="directory-clinic">${esc(p.clinicName)}</p>`:''}${p.bio?`<p class="directory-bio">${esc(p.bio)}</p>`:''}${services.length?`<div class="directory-services" aria-label="Procedimientos">${services.map(s=>`<span>${esc(s)}</span>`).join('')}</div>`:''}${phone||whatsapp?`<div class="directory-contact">${phone?`<p><strong>Teléfono:</strong> ${esc(phone)}</p>`:''}${whatsapp?`<p><strong>WhatsApp:</strong> ${esc(whatsapp)}</p>`:''}</div>`:''}${anchors?`<div class="directory-links" aria-label="Enlaces profesionales">${anchors}</div>`:''}${!photo&&preview?'<p class="publication-help">La foto es opcional. Así se verá tu ficha sin ella.</p>':''}</article>`;
}
function filters(){return {specialty:get('filter-categoria')?.value||'',procedure:get('filter-procedimiento')?.value||'',state:get('filter-estado')?.value||'',city:get('filter-municipio')?.value||'',text:get('filter-descripcion')?.value||''};}
function selectOptions(id,label,values){
 const el=get(id),old=el.value;el.replaceChildren(new root.Option(label,''));
 [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')).forEach(v=>el.add(new root.Option(v,v)));
 if([...el.options].some(o=>o.value===old))el.value=old;
}
function updateDirectoryOptions(){
 const f=filters();selectOptions('filter-categoria','Todas las especialidades',directoryProfiles.map(p=>p.specialty));
 selectOptions('filter-estado','Todos los estados',directoryProfiles.map(p=>p.state));
 selectOptions('filter-procedimiento','Todos los procedimientos',directoryProfiles.filter(p=>!f.specialty||norm(p.specialty)===norm(f.specialty)).flatMap(p=>p.services||[]));
 selectOptions('filter-municipio','Todas las ciudades',directoryProfiles.filter(p=>!f.state||norm(p.state)===norm(f.state)).map(p=>p.city));
}
function searchDirectory(){
 if(!get('doctor-directory-results'))return;
 try{
  directoryProfiles=core().readPublicProfiles(root.localStorage,(id)=>context().resolveProvider(root.localStorage,id));
  updateDirectoryOptions();const rows=filterProfiles(directoryProfiles,filters());
  get('directory-count').textContent=`${rows.length} ${rows.length===1?'resultado':'resultados'}${directoryProfiles.length?` de ${directoryProfiles.length} fichas publicadas`:''}`;
  get('doctor-directory-results').innerHTML=rows.length?rows.map(p=>profileCardHtml(p)).join(''):`<div class="publication-empty"><h4>${directoryProfiles.length?'No encontramos coincidencias':'Aún no hay fichas publicadas en este navegador'}</h4><p>${directoryProfiles.length?'Prueba con otros filtros o limpia la búsqueda.':'Un borrador o un expediente aprobado no aparece automáticamente. Primero el titular autoriza su ficha y después se revisa y publica en la demo.'}</p></div>`;
 }catch(_){directoryProfiles=[];get('directory-count').textContent='Directorio no disponible';get('doctor-directory-results').innerHTML='<div class="publication-empty" role="alert">No se pudo leer el directorio local. No se muestran fichas sin validar. Revisa el almacenamiento y recarga.</div>';}
}
function mountDirectory(){
 const form=get('doctor-directory-search');if(!form||directoryMounted)return;directoryMounted=true;
 form.addEventListener('submit',e=>{e.preventDefault();searchDirectory();});
 form.addEventListener('change',searchDirectory);get('filter-descripcion').addEventListener('input',searchDirectory);
 get('directory-clear').addEventListener('click',()=>{form.reset();searchDirectory();});searchDirectory();
}
function currentIdentity(){
 const a=root.PulzzoDoctorDemoBridge?.account();if(!a?.doctorAccountId||root.localStorage.getItem('pulzzo_doctor_verified')!=='true')return null;
 const state=root.PulzzoDoctorDemoBridge.getState(),p=context().holderProvider(root.localStorage,a.doctorAccountId);
 if(state.doctorAccountId!==a.doctorAccountId||p&&state.demoProviderId&&state.demoProviderId!==p.id)return null;
 return {accountId:a.doctorAccountId,provider:p,state,accountRaw:root.localStorage.getItem('pulzzo_doctor')};
}
function assertModel(model){
 const id=currentIdentity();
 if(!id||!id.provider||!model||id.accountId!==model.accountId||id.provider.id!==model.providerId||id.accountRaw!==model.accountRaw)throw Error('La cuenta o el expediente vinculado cambió. Recarga antes de continuar.');
 if(root.localStorage.getItem(core().STORAGE_KEY)!==model.storageRaw)throw Error('La ficha cambió en otra ventana. Actualiza antes de guardar o autorizar.');
 return id;
}
function field(name,label,value,options={}){
 const id='publication-'+name.replaceAll('.','-'),attrs=`id="${id}" data-publication-field="${esc(name)}" ${options.required?'required':''} maxlength="${options.max||160}"`;
 return `<label class="publication-field${options.wide?' publication-field-wide':''}" for="${id}"><span>${label}${options.required?' <span aria-hidden="true">*</span>':''}</span>${options.area?`<textarea ${attrs} rows="${options.rows||3}" placeholder="${esc(options.placeholder||'')}">${esc(value||'')}</textarea>`:`<input ${attrs} type="${options.type||'text'}" value="${esc(value||'')}" placeholder="${esc(options.placeholder||'')}">`}</label>`;
}
function formFields(){
 const f={...holderModel.fields,links:{...holderModel.fields.links}};
 get('publication-editor').querySelectorAll('[data-publication-field]').forEach(el=>{const k=el.dataset.publicationField;if(k.startsWith('links.'))f.links[k.slice(6)]=el.value.trim();else if(k==='services')f.services=el.value.split('\n').map(x=>x.trim()).filter(Boolean);else f[k]=el.value.trim();});
 f.website=f.links.website||'';f.photo=holderModel.photo;return f;
}
function setMessage(message,error=false){const el=get('publication-message');if(el){el.textContent=message;el.classList.toggle('is-error',error);el.setAttribute('role',error?'alert':'status');}}
function markEdited(){
 if(!holderModel)return;holderModel.dirty=true;holderModel.editRevision++;get('publication-consent').checked=false;get('publication-confirm').disabled=true;
 get('publication-preview').innerHTML=profileCardHtml(formFields(),{preview:true});get('publication-save').disabled=holderModel.reading;
 get('publication-confirm-help').textContent='Tienes cambios sin guardar. Guarda la versión y revisa la vista previa antes de autorizarla.';
}
async function action(callback){
 try{assertModel(holderModel);performing=true;await callback();}catch(e){setMessage(e.message||'No se pudo guardar. La versión anterior se conservó.',true);}finally{performing=false;}
}
function photoStillCurrent(model,serial,generation,editRevision){try{return holderModel===model&&serial===readSerial&&generation===renderGeneration&&model.editRevision===editRevision&&!!assertModel(model);}catch(_){return false;}}
function readPhoto(file){
 const model=holderModel,serial=++readSerial,generation=renderGeneration,editRevision=model.editRevision;
 model.reading=false;get('publication-save').disabled=false;
 get('publication-confirm').disabled=!get('publication-consent').checked||model.dirty||model.version?.status!=='draft';
 if(!file){setMessage('Selección cancelada. La foto anterior se conservó.');return;}
 if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||!Number.isInteger(file.size)||file.size<=0||file.size>core().MAX_PHOTO_BYTES){setMessage('Elige PNG, JPEG, WebP o GIF de hasta 5 MiB. La foto anterior se conservó.',true);return;}
 try{assertModel(model);}catch(e){setMessage(e.message,true);return;}
 model.reading=true;get('publication-save').disabled=true;get('publication-confirm').disabled=true;setMessage('Leyendo y validando foto…');
 const finishError=message=>{if(holderModel===model&&serial===readSerial){model.reading=false;get('publication-save').disabled=false;setMessage(message,true);}};
 const reader=new root.FileReader();
 reader.onerror=()=>finishError('No se pudo leer la imagen. La foto anterior se conservó.');reader.onabort=()=>finishError('Lectura cancelada. La foto anterior se conservó.');
 reader.onload=()=>{
  if(!photoStillCurrent(model,serial,generation,editRevision)){finishError('La cuenta, la ficha o el formulario cambió durante la lectura. Vuelve a elegir la foto; no se guardó.');return;}
  const photo={dataUrl:reader.result,type:file.type,size:file.size,name:file.name};
  try{core().validatePhoto(photo);}catch(e){finishError(e.message||'La imagen no es válida. La foto anterior se conservó.');return;}
  const img=new root.Image();
  img.onerror=()=>finishError('El archivo no contiene una imagen legible. La foto anterior se conservó.');
  img.onload=()=>{
   if(!photoStillCurrent(model,serial,generation,editRevision)){finishError('La cuenta, la ficha o el formulario cambió durante la lectura. Vuelve a elegir la foto; no se guardó.');return;}
   if(!img.naturalWidth||!img.naturalHeight){finishError('La imagen no tiene dimensiones válidas.');return;}
   model.photo=photo;model.reading=false;markEdited();get('publication-photo-state').textContent='Foto lista en la vista previa. Guarda el borrador para conservarla.';setMessage('Foto validada. Aún no se ha guardado ni publicado.');
  };img.src=photo.dataUrl;
 };
 try{reader.readAsDataURL(file);}catch(_){finishError('No se pudo abrir el archivo. La foto anterior se conservó.');}
}
function renderHolder(message){
 const host=get('doctor-publication-holder');if(!host)return;
 const expanded=host.querySelector('details')?.open||false;readSerial++;renderGeneration++;holderModel=null;
 try{
  const identity=currentIdentity();
  if(!identity){host.innerHTML='<div class="publication-empty">Inicia sesión con la misma cuenta médica verificada de la demo para preparar tu ficha pública.</div>';return;}
  if(!identity.provider){host.innerHTML='<details class="publication-panel"><summary><span><span class="publication-eyebrow">Directorio · demo local</span><strong>Tu ficha pública</strong></span><span class="publication-status">Vinculación pendiente</span></summary><div class="publication-panel-body"><p>Tu cuenta aún no tiene un expediente médico vinculado de forma inequívoca en el backoffice. La revisión debe vincular tu ID de cuenta antes de preparar o autorizar la ficha.</p><p class="publication-help">Tu foto es opcional. Los datos y documentos de tu registro permanecen separados del directorio.</p></div></details>';return;}
  const store=core().createStore({storage:root.localStorage,actor:{id:identity.accountId,role:'holder'},resolveProvider:id=>context().resolveProvider(root.localStorage,id)}),snapshot=store.snapshot(),profile=snapshot.profiles[identity.provider.id],version=profile?.versions.find(v=>v.id===profile.currentVersionId),published=profile?.versions.find(v=>v.id===profile.publishedVersionId);
  const initial=version?.fields||context().fields(identity.state);if(initial.photo&&!validPhoto(initial.photo))initial.photo=null;
  holderModel={store,accountId:identity.accountId,accountRaw:identity.accountRaw,providerId:identity.provider.id,revision:snapshot.revision,version,fields:initial,photo:initial.photo||null,storageRaw:root.localStorage.getItem(core().STORAGE_KEY),dirty:false,reading:false,editRevision:0};
  const canConfirm=version&&version.status==='draft';
  host.innerHTML=`<details class="publication-panel" ${expanded?'open':''}><summary><span><span class="publication-eyebrow">Directorio · demo local</span><strong>Tu ficha pública</strong></span><span class="publication-status">${esc(version?statuses[version.status]:'Aún sin borrador')}</span></summary><div class="publication-panel-body"><div class="publication-intro"><h2>Elige qué mostrar en el directorio</h2><p>Prepara una ficha pública, revisa su vista previa y autoriza personalmente esa versión. El equipo podrá revisarla y simular su publicación después.</p><div class="directory-demo-note"><strong>Simulación en este navegador</strong><span>Usa solo datos ficticios. No se publica en internet ni se verifica una identidad real. Tu autorización incluye únicamente el contenido de esta ficha; no incluye documentos, datos fiscales o bancarios.</span></div></div>${published?`<p class="publication-kept">La versión ${published.number} sigue publicada en esta demo${version?.id!==published.id?' mientras se revisan tus cambios':''}.</p>`:'<p class="publication-help">La ficha todavía no está publicada. La foto es opcional en todo el proceso.</p>'}${version?.review?.reason?`<p class="publication-review-note"><strong>Comentario de revisión:</strong> ${esc(version.review.reason)}</p>`:''}<div class="publication-workspace"><form id="publication-editor" class="publication-editor" novalidate><div class="publication-form-grid">${field('displayName','Nombre público',initial.displayName,{required:true})}${field('specialty','Especialidad',initial.specialty,{required:true})}${field('state','Estado',initial.state,{required:true})}${field('city','Municipio / ciudad',initial.city,{required:true})}${field('clinicName','Consultorio, clínica u hospital',initial.clinicName,{wide:true})}${field('bio','Presentación breve',initial.bio,{area:true,wide:true,max:1500,placeholder:'Describe tu práctica con información profesional verificable.'})}${field('services','Procedimientos (uno por línea)',(initial.services||[]).join('\n'),{area:true,wide:true,max:5000})}${field('phone','Teléfono público (opcional)',initial.phone,{max:30})}${field('whatsapp','WhatsApp público (opcional)',initial.whatsapp,{max:30})}${Object.entries(linkLabels).map(([k,label])=>field('links.'+k,label+' (opcional)',initial.links?.[k]||(k==='website'?initial.website:''),{type:'url',max:2048,placeholder:'https://…'})).join('')}</div><p class="publication-help">Los campos con * son necesarios al autorizar; puedes guardar un borrador incompleto. Pega la URL completa del perfil o sitio. No se crean enlaces a partir de nombres de usuario.</p><div class="publication-photo-editor"><h3>Foto de perfil <span>Opcional</span></h3><p id="publication-photo-state">${holderModel.photo?'Se usará la foto mostrada en la vista previa.':'Sin foto: se mostrará un avatar con tus iniciales.'}</p><label class="publication-photo-upload" for="publication-photo-file">Elegir foto<input type="file" id="publication-photo-file" accept="image/png,image/jpeg,image/webp,image/gif"></label><button type="button" class="publication-button publication-button-secondary" id="publication-photo-remove">Continuar sin foto</button><p class="publication-help">PNG, JPEG, WebP o GIF · máximo 5 MiB. El archivo se guarda solo en este navegador.</p></div><div class="publication-actions"><button type="submit" id="publication-save" class="publication-button publication-button-primary">Guardar borrador${version?' de una nueva versión':''}</button><button type="button" id="publication-refresh" class="publication-button publication-button-secondary">Actualizar ficha</button></div></form><aside class="publication-preview-panel"><div id="publication-preview">${profileCardHtml(initial,{preview:true})}</div><div class="publication-consent-panel"><label for="publication-consent"><input type="checkbox" id="publication-consent" ${canConfirm?'':'disabled'}><span>Soy el titular o representante autorizado. Revisé esta versión y autorizo mostrar exactamente estos datos y, si la incluí, esta foto en el directorio de demostración local.</span></label><button type="button" id="publication-confirm" class="publication-button publication-button-primary" disabled>Autorizar esta versión para revisión</button><p id="publication-confirm-help" class="publication-help">${canConfirm?'Marca la casilla después de revisar la versión guardada.':version?(['correction','rejected'].includes(version.status)?'Guarda un nuevo borrador con los cambios antes de volver a autorizarlo.':'Esta versión ya fue autorizada. Si cambias algo, guarda un nuevo borrador y autorízalo.'):'Primero guarda un borrador para poder autorizar exactamente esa versión.'}</p></div><a class="publication-directory-link" href="index.html#buscar-doctor" target="_blank" rel="noopener">Ver directorio de la demo ↗</a></aside></div><p id="publication-message" class="publication-message" role="status" aria-live="polite">${esc(message||'')}</p></div></details>`;
  const model=holderModel;
  get('publication-editor').addEventListener('input',e=>{if(e.target.matches('[data-publication-field]'))markEdited();});
  get('publication-editor').addEventListener('submit',e=>{e.preventDefault();action(()=>{if(model.reading)throw Error('Espera a que termine la lectura de la foto.');const f=formFields();for(const v of Object.values(f.links))if(v&&!safeUrl(v))throw Error('Usa enlaces completos http:// o https://, sin credenciales.');model.store.saveDraft(model.providerId,f,model.revision);renderHolder('Borrador guardado localmente. Revisa la vista previa y autoriza esta versión para revisión.');});});
  get('publication-refresh').addEventListener('click',()=>{if(model.dirty&&!root.confirm('Se descartarán los cambios que no hayas guardado. ¿Actualizar la ficha?'))return;renderHolder('Ficha actualizada desde el almacenamiento local.');});
  get('publication-photo-file').addEventListener('change',e=>{const file=e.target.files?.[0];e.target.value='';readPhoto(file);});
  get('publication-photo-remove').addEventListener('click',()=>{readSerial++;model.reading=false;model.photo=null;markEdited();get('publication-photo-state').textContent='Sin foto: el avatar aparecerá al guardar esta versión.';setMessage('La foto se quitará de este borrador al guardarlo. La versión publicada no cambia.');});
  get('publication-consent').addEventListener('change',e=>{get('publication-confirm').disabled=!e.target.checked||model.dirty||model.reading||!canConfirm;});
  get('publication-confirm').addEventListener('click',()=>action(async()=>{
   if(!get('publication-consent').checked||model.dirty||model.reading||!canConfirm)throw Error('Guarda y revisa la versión, y confirma personalmente la casilla.');
   const generation=renderGeneration,editRevision=model.editRevision;get('publication-confirm').disabled=true;
   if(version.fields.photo){core().validatePhoto(version.fields.photo);setMessage('Comprobando la foto de esta versión…');await new Promise((resolve,reject)=>{const img=new root.Image();img.onload=()=>img.naturalWidth&&img.naturalHeight?resolve():reject(Error('La foto no tiene dimensiones válidas. Guarda un nuevo borrador con otra foto o sin foto.'));img.onerror=()=>reject(Error('La foto guardada no se puede abrir. Guarda un nuevo borrador con otra foto o sin foto.'));img.src=version.fields.photo.dataUrl;});}
   assertModel(model);
   if(holderModel!==model||renderGeneration!==generation||model.editRevision!==editRevision||model.dirty||model.reading||!get('publication-consent').checked)throw Error('La versión o tu confirmación cambió. Revisa y autoriza nuevamente.');
   model.store.confirm(model.providerId,version.id,model.revision);renderHolder('Autorización personal registrada en la demo. La publicación requiere revisión y aprobación del equipo.');
  }));
 }catch(e){host.innerHTML=`<div class="publication-empty" role="alert">${esc(e.message||'No se pudo leer la ficha pública.')}<p>No se modificaron tus documentos ni datos privados. Recarga para volver a comprobar la cuenta.</p></div>`;}
}
function mountHolder(){
 if(!get('doctor-publication-holder')||holderMounted)return;holderMounted=true;renderHolder();
 const bridge=root.PulzzoDoctorDemoBridge;if(bridge?.refresh){const previous=bridge.refresh;bridge.refresh=(...args)=>{const result=previous.apply(bridge,args);renderHolder();return result;};}
 root.addEventListener('hashchange',()=>renderHolder());
}
function mount(){
 mountDirectory();mountHolder();
 if(mount.listening)return;mount.listening=true;
 const refresh=()=>{if(performing)return;if(directoryMounted)searchDirectory();if(holderMounted)renderHolder('La ficha se actualizó. Revisa la versión antes de continuar.');};
 root.addEventListener('pulzzo:doctor-publication',refresh);
 root.addEventListener('storage',e=>{if(e.key===null||[core()?.STORAGE_KEY,context()?.BO_KEY,context()?.CRM_KEY,'pulzzo_doctor','pulzzo_doctor_verified','pulzzoDoctorOnboardingCleanV3'].includes(e.key))refresh();});
}
return {mount,searchDirectory,renderHolder,filterProfiles,profileCardHtml,safeUrl};
});
