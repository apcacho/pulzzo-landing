/* Versioned demo configuration. One append-only storage envelope; never rewrites credit data. */
const CONFIG_STORAGE_KEY='pulzzo_backoffice_configuration_v1';
const CONFIG_BASE=Object.freeze({extension15Rate:.03,extension15Minimum:300,extension30Rate:.05,extension30Minimum:500,extensionMonthlyDays:Object.freeze([15,30]),extensionBiweeklyDays:Object.freeze([15]),prepayWaitMonths:3,defaultInterestCalculationBase:'global',openingFeeRate:.05,openingFeeMode:'upfront',defaultPaymentFrequency:'monthly'});
let configTab='product',configFormRevision=0,configPreviewToken='',configVersionOpen=false;
function configEscape(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function configCreditId(p){return String(p?.id||'');}
function configCreditIds(){return [...new Set((db.patients||[]).map(configCreditId).filter(Boolean))].sort();}
function configValidDate(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;}
function configValidatePatch(patch){
 if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length)throw Error('Indica al menos una regla.');
 for(const [key,value] of Object.entries(patch)){
  if(!Object.prototype.hasOwnProperty.call(CONFIG_BASE,key))throw Error('Regla no soportada: '+key);
  if(key==='defaultInterestCalculationBase'){if(!['global','outstanding_balance'].includes(value))throw Error('Selecciona global o saldo insoluto.');}
  else if(key==='openingFeeMode'){if(!['upfront','financed'].includes(value))throw Error('Selecciona comisión anticipada o financiada.');}
  else if(key==='defaultPaymentFrequency'){if(!['monthly','biweekly'].includes(value))throw Error('Selecciona frecuencia mensual o quincenal.');}
  else if(key.endsWith('Days')){const allowed=CONFIG_BASE[key];if(!Array.isArray(value)||value.some(x=>!allowed.includes(x))||new Set(value).size!==value.length)throw Error('Solo puedes desactivar plazos existentes; no agregar días.');}
  else if(typeof value!=='number'||!Number.isFinite(value)||value<0||(key.endsWith('Rate')&&value>1)||(key==='prepayWaitMonths'&&!Number.isInteger(value)))throw Error('Valor inválido para '+key+'.');
 }
 return patch;
}
function configRead(){
 let raw;try{raw=localStorage.getItem(CONFIG_STORAGE_KEY);}catch(e){throw Error('No se puede leer la configuración local. Operación bloqueada.');}
 if(!raw)return {revision:0,versions:[]};
 try{const s=JSON.parse(raw);if(s.schema!==1||!Number.isInteger(s.revision)||!Array.isArray(s.versions)||s.revision!==s.versions.length)throw Error();
 s.versions.forEach((v,i)=>{if(v.id!=='config-v'+(i+1)||!configValidDate(v.effectiveDate)||!['newonly','existing_new','selected'].includes(v.scope)||!Array.isArray(v.excludedIds)||!Array.isArray(v.selectedIds))throw Error();configValidatePatch(v.patch);});return s;
 }catch(e){throw Error('Configuración local dañada o incompatible. No se aplicarán cambios; requiere revisión.');}
}
function configVersionApplies(v,p,date){const id=configCreditId(p);return v.effectiveDate<=date&&(v.scope==='existing_new'||(v.scope==='newonly'&&!v.excludedIds.includes(id))||(v.scope==='selected'&&v.selectedIds.includes(id)));}
function configResolveRules(p,effectiveDate=today()){
 if(!configValidDate(effectiveDate))throw Error('Fecha de consulta inválida.');
 const rules={...CONFIG_BASE,extensionMonthlyDays:[...CONFIG_BASE.extensionMonthlyDays],extensionBiweeklyDays:[...CONFIG_BASE.extensionBiweeklyDays],versionId:'config-base'};
 const versions=configRead().versions.filter(v=>configVersionApplies(v,p,effectiveDate)).sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate)||Number(a.id.slice(8))-Number(b.id.slice(8)));
 versions.forEach(v=>Object.assign(rules,v.patch,{versionId:v.id}));
 rules.extensionMonthlyDays=Object.freeze([...rules.extensionMonthlyDays]);rules.extensionBiweeklyDays=Object.freeze([...rules.extensionBiweeklyDays]);return Object.freeze(rules);
}
function configNormalizeChange(input){
 if(!input||!['newonly','existing_new','selected'].includes(input.scope))throw Error('Selecciona un alcance válido.');
 if(!configValidDate(input.effectiveDate)||input.effectiveDate<today())throw Error('La vigencia debe ser hoy o futura; no se permiten cambios retroactivos.');
 const patch=JSON.parse(JSON.stringify(configValidatePatch(input.patch))),ids=configCreditIds();
 if(['defaultInterestCalculationBase','openingFeeRate','openingFeeMode','defaultPaymentFrequency'].some(key=>key in patch)&&input.scope!=='newonly')throw Error('Los valores predeterminados de producto y comisión solo aplican a créditos nuevos; se conserva la selección de cada crédito.');
 const selectedIds=[...new Set(input.selectedIds||[])].map(String).sort();
 if(input.scope==='selected'&&(!selectedIds.length||selectedIds.some(id=>!ids.includes(id))))throw Error('Selecciona créditos existentes válidos.');
 if(input.scope!=='newonly'&&(!input.authorized||!String(input.authorizationReference||'').trim()))throw Error('Confirma autorización contractual demo y agrega su referencia para créditos existentes.');
 return {patch,scope:input.scope,effectiveDate:input.effectiveDate,selectedIds:input.scope==='selected'?selectedIds:[],excludedIds:input.scope==='newonly'?ids:[],authorizationReference:input.scope==='newonly'?'':String(input.authorizationReference).trim(),authorizationConfirmed:input.scope!=='newonly'};
}
function configPreviewChange(input){
 const change=configNormalizeChange(input),state=configRead(),ids=configCreditIds();
 const impacted=change.scope==='newonly'?[]:change.scope==='selected'?change.selectedIds:ids;
 const beforeRules=impacted.map(id=>({creditId:id,rules:configResolveRules(db.patients.find(p=>configCreditId(p)===id),change.effectiveDate)}));
 const simulations=impacted.map(id=>{const p=db.patients.find(p=>configCreditId(p)===id),before=configResolveRules(p,change.effectiveDate),after={...before,...change.patch};return {id,beforeFee:Math.max(before.extension15Minimum,10000*before.extension15Rate),afterFee:Math.max(after.extension15Minimum,10000*after.extension15Rate),before30Fee:Math.max(before.extension30Minimum,10000*before.extension30Rate),after30Fee:Math.max(after.extension30Minimum,10000*after.extension30Rate)};});
 return {change,revision:state.revision,impactedIds:impacted,beforeRules,simulations,token:JSON.stringify({revision:state.revision,change,ids,beforeRules}),futureExample:{...configResolveRules(null,change.effectiveDate),...change.patch}};
}
function configSaveChange(input,expectedRevision,previewToken){
 if(!can('settings'))return {ok:false,error:'Solo el administrador puede editar configuración.'};
 try{const preview=configPreviewChange(input),state=configRead();
 if(expectedRevision!==state.revision||previewToken!==preview.token)throw Error('El formulario o los créditos cambiaron. Actualiza y vuelve a previsualizar.');
 const original=localStorage.getItem(CONFIG_STORAGE_KEY),version={...preview.change,affectedIds:[...preview.impactedIds],beforeRules:JSON.parse(JSON.stringify(preview.beforeRules)),id:'config-v'+(state.revision+1),createdAt:new Date().toISOString(),actorId:session.id,createdBy:session.email||session.name||'Administrador demo',previousVersion:state.revision?'config-v'+state.revision:'config-base'};
 const next={schema:1,revision:state.revision+1,versions:[...state.versions,version]};
 if(localStorage.getItem(CONFIG_STORAGE_KEY)!==original)throw Error('Otro formulario cambió la configuración. Vuelve a cargar.');
 localStorage.setItem(CONFIG_STORAGE_KEY,JSON.stringify(next));
 if(localStorage.getItem(CONFIG_STORAGE_KEY)!==JSON.stringify(next))throw Error('No se pudo verificar el guardado. Recarga antes de continuar.');
 configPreviewToken='';return {ok:true,versionId:version.id};
 }catch(e){return {ok:false,error:e.message||'No se pudo guardar en este navegador.'};}
}
/* Display-only helpers: the versioned rules above continue to use fractional rates. */
const CONFIG_LABELS={extension15Rate:'Comisión a 15 días',extension15Minimum:'Comisión mínima a 15 días',extension30Rate:'Comisión a 30 días',extension30Minimum:'Comisión mínima a 30 días',extensionMonthlyDays:'Plazos para pagos mensuales',extensionBiweeklyDays:'Plazos para pagos quincenales',prepayWaitMonths:'Espera para prepago y liquidación',defaultInterestCalculationBase:'Cálculo de interés',openingFeeRate:'Comisión de apertura',openingFeeMode:'Forma de cobrar la apertura',defaultPaymentFrequency:'Frecuencia de pago'};
function configShiftDecimal(value,places){
 // Move the decimal in text so an unchanged high-precision rate round-trips exactly.
 const match=String(value).trim().match(/^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:e([+-]?\d+))?$/i);
 if(!match||!Number.isFinite(Number(value)))return 'NaN';
 const parts=match[2].split('.'),digits=parts.join(''),point=parts[0].length+Number(match[3]||0)+places;
 if(Math.abs(point)>400)return String(Number(value)*Math.pow(10,places));
 const moved=point<=0?'0.'+'0'.repeat(-point)+digits:point>=digits.length?digits+'0'.repeat(point-digits.length):digits.slice(0,point)+'.'+digits.slice(point);
 const normalized=moved.replace(/^0+(?=\d)/,'').replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');
 return (match[1]==='-'&&Number(normalized)!==0?'-':'')+normalized;
}
function configMoney(value){return '$'+Number(value).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})+' MXN';}
function configDisplayValue(key,value){
 if(key.endsWith('Rate'))return configShiftDecimal(value,2)+'%';
 if(key.endsWith('Minimum'))return configMoney(value);
 if(key.endsWith('Days'))return value.length?value.join(' y ')+' días':'Ninguno habilitado';
 if(key==='prepayWaitMonths')return value+' '+(value===1?'mes':'meses');
 return ({global:'Global',outstanding_balance:'Saldos insolutos',monthly:'Mensual',biweekly:'Quincenal',upfront:'Anticipada antes de liberar',financed:'Financiada'})[value]||String(value);
}
function configField(key,label,value,disabled,help=''){
 const rate=key.endsWith('Rate'),id='cfg-'+key,display=rate?configShiftDecimal(value,2):value;
 return `<label class="field" for="${id}"><span>${configEscape(label)}</span><span class="cfg-unit-input"><input id="${id}" type="number" inputmode="${key==='prepayWaitMonths'?'numeric':'decimal'}" min="0" ${rate?'max="100"':''} step="${key==='prepayWaitMonths'?'1':'any'}" value="${configEscape(display)}" ${help?`aria-describedby="${id}-help"`:''} ${disabled?'disabled':''} required>${rate?'<span class="cfg-unit" aria-hidden="true">%</span>':''}</span>${help?`<small class="cfg-helper" id="${id}-help">${configEscape(help)}</small>`:''}</label>`;
}
function configReadForm(){
 const get=id=>document.getElementById(id),patch={},number=key=>{
  const raw=get('cfg-'+key).value;if(!String(raw).trim())throw Error('Completa '+CONFIG_LABELS[key].toLowerCase()+'.');
  return key.endsWith('Rate')?Number(configShiftDecimal(raw,-2)):Number(raw);
 };
 if(configTab==='extensions'){
  for(const key of ['extension15Rate','extension15Minimum','extension30Rate','extension30Minimum'])patch[key]=number(key);
  patch.extensionMonthlyDays=[15,30].filter(d=>get('cfg-monthly-'+d).checked);patch.extensionBiweeklyDays=get('cfg-biweekly-15').checked?[15]:[];
 }else if(configTab==='product'){patch.defaultInterestCalculationBase=get('cfg-defaultInterestCalculationBase').value;patch.defaultPaymentFrequency=get('cfg-defaultPaymentFrequency').value;}
 else if(configTab==='tax'){patch.openingFeeRate=number('openingFeeRate');patch.openingFeeMode=get('cfg-openingFeeMode').value;}
 else patch.prepayWaitMonths=number('prepayWaitMonths');
 return {patch,scope:get('cfg-scope').value,effectiveDate:get('cfg-effective').value,selectedIds:(get('cfg-selected').value||'').split(',').map(x=>x.trim()).filter(Boolean),authorized:get('cfg-authorized').checked,authorizationReference:get('cfg-reference').value};
}
function configInvalidatePreview(message='Hay cambios por revisar. Revisa el resumen antes de confirmar una nueva versión.'){
 configPreviewToken='';const preview=document.getElementById('cfg-preview'),save=document.getElementById('cfg-save');
 if(preview)preview.textContent=message;if(save)save.disabled=true;
}
function configSyncScope(){
 const get=id=>document.getElementById(id),scope=get('cfg-scope')?.value||'newonly',existing=scope!=='newonly',selected=scope==='selected',readonly=!can('settings');
 if(get('cfg-selected-block'))get('cfg-selected-block').hidden=!selected;
 if(get('cfg-authorization-block'))get('cfg-authorization-block').hidden=!existing;
 for(const id of ['cfg-authorized','cfg-reference'])if(get(id)){get(id).disabled=readonly||!existing;get(id).required=existing;}
 if(get('cfg-selected')){get('cfg-selected').disabled=readonly||!selected;get('cfg-selected').required=selected;}
 if(get('cfg-scope-help'))get('cfg-scope-help').textContent=scope==='newonly'?'Los créditos que ya existen quedan excluidos de esta versión.':scope==='selected'?'Solo los IDs indicados recibirán la regla desde la fecha elegida.':'Aplica a créditos existentes y nuevos, solo en acciones futuras elegibles.';
}
function configDiffList(patch,before){
 return `<ul class="cfg-diff-list">${Object.entries(patch).map(([key,value])=>`<li class="cfg-diff-row"><span>${configEscape(CONFIG_LABELS[key])}</span><span class="cfg-diff-values"><span>Antes: ${configEscape(configDisplayValue(key,before[key]))}</span><span aria-hidden="true">→</span><strong>Después: ${configEscape(configDisplayValue(key,value))}</strong>${JSON.stringify(before[key])===JSON.stringify(value)?'<small class="cfg-helper">Sin cambio</small>':''}</span></li>`).join('')}</ul>`;
}
function configPreviewGroups(preview){
 const groups=[];
 preview.beforeRules.forEach(snapshot=>{
  const key=JSON.stringify(Object.keys(preview.change.patch).map(field=>snapshot.rules[field]));let group=groups.find(g=>g.key===key);
  if(!group){group={key,rules:snapshot.rules,ids:[]};groups.push(group);}group.ids.push(snapshot.creditId);
 });
 return groups.map(group=>`<section class="cfg-review-group"><h4>${group.ids.length===1?'Crédito existente':'Créditos existentes'} · ${group.ids.length}</h4><details><summary>Ver ${group.ids.length===1?'ID':'IDs'} de créditos</summary><p>${group.ids.map(configEscape).join(', ')}</p></details>${configDiffList(preview.change.patch,group.rules)}</section>`).join('')+(preview.change.scope!=='selected'?`<section class="cfg-review-group"><h4>Créditos nuevos</h4>${configDiffList(preview.change.patch,configResolveRules(null,preview.change.effectiveDate))}</section>`:'');
}
function configPreviewExamples(preview){
 if(Object.keys(preview.change.patch).some(key=>key.startsWith('extension'))){
  const before=configResolveRules(null,preview.change.effectiveDate),after=preview.futureExample;
  const examples=preview.simulations.map(s=>`<p>${configEscape(s.id)}: 15 días ${configMoney(s.beforeFee)} → ${configMoney(s.afterFee)}; 30 días ${configMoney(s.before30Fee)} → ${configMoney(s.after30Fee)}.</p>`).join('');
  const newExample=preview.change.scope!=='selected'?`<p>Nuevo crédito: 15 días ${configMoney(Math.max(before.extension15Minimum,10000*before.extension15Rate))} → ${configMoney(Math.max(after.extension15Minimum,10000*after.extension15Rate))}; 30 días ${configMoney(Math.max(before.extension30Minimum,10000*before.extension30Rate))} → ${configMoney(Math.max(after.extension30Minimum,10000*after.extension30Rate))}.</p>`:'';
  return `<details class="cfg-policy"><summary>Ejemplo de comisión sobre $10,000</summary><p>Capital diferido ilustrativo. Importes antes → después, más IVA 16%. Solo aplican los plazos habilitados y las acciones elegibles.</p>${examples}${newExample}</details>`;
 }
 if('openingFeeRate' in preview.change.patch||'openingFeeMode' in preview.change.patch)return `<details class="cfg-policy"><summary>Ejemplo de apertura sobre $10,000</summary><p>Con la nueva regla: comisión ${configMoney(10000*preview.futureExample.openingFeeRate)} + IVA ${configMoney(1600*preview.futureExample.openingFeeRate)} = ${configMoney(11600*preview.futureExample.openingFeeRate)}.</p><p>Cobro: ${configEscape(configDisplayValue('openingFeeMode',preview.futureExample.openingFeeMode))}.</p></details>`;
 return '';
}
function configShowPreview(){
 if(!can('settings'))return false;
 configInvalidatePreview();const message=document.getElementById('cfg-message');if(message)message.textContent='';
 try{const p=configPreviewChange(configReadForm());if(p.revision!==configFormRevision)throw Error('Hay una nueva versión. Recarga Configuración antes de continuar.');
  const scope={newonly:'Solo créditos nuevos',existing_new:'Existentes y nuevos',selected:'Créditos seleccionados'}[p.change.scope],preview=document.getElementById('cfg-preview');
  preview.innerHTML=`<h3>Revisa antes de guardar</h3><dl class="cfg-review-summary"><div><dt>Vigencia</dt><dd>${configEscape(p.change.effectiveDate)}</dd></div><div><dt>Alcance</dt><dd>${scope}</dd></div><div><dt>Créditos existentes afectados</dt><dd>${p.impactedIds.length}</dd></div></dl><p class="cfg-helper">Comparación con las reglas que aplicarían en esa fecha.</p>${configPreviewGroups(p)}${configPreviewExamples(p)}<div class="cfg-impact-note"><strong>Impacto de esta versión</strong><p>Solo cambia nuevas cotizaciones y acciones elegibles desde la vigencia indicada. No cambia saldos, pagos, tasas del crédito, contratos ni prórrogas ya activas.</p><p>${p.change.scope==='newonly'?'Los créditos existentes quedan fuera del alcance.':p.impactedIds.length?'Revisa la autorización de los créditos existentes antes de confirmar.':'No hay créditos existentes en este alcance.'} Se guarda en este navegador; no sustituye autorización legal.</p></div>${p.change.authorizationReference?`<p>Referencia de autorización demo: ${configEscape(p.change.authorizationReference)}</p>`:''}`;
  configPreviewToken=p.token;const save=document.getElementById('cfg-save');if(save)save.disabled=!can('settings');preview.focus?.();
 }catch(e){configInvalidatePreview(e.message);}
}
function configSubmit(){
 if(!can('settings'))return false;
 try{const result=configSaveChange(configReadForm(),configFormRevision,configPreviewToken);if(!result.ok){configInvalidatePreview('Vuelve a revisar los cambios antes de guardar.');const message=document.getElementById('cfg-message');if(message)message.textContent=result.error;return;}
  configVersionOpen=false;renderSettings();const message=document.getElementById('cfg-message');if(message){message.textContent='Versión '+result.versionId+' guardada en este navegador.';message.focus?.();}
 }catch(e){configInvalidatePreview();const message=document.getElementById('cfg-message');if(message)message.textContent=e.message;}
}
// v36h: «Crear una nueva versión» opens in its own panel below the current rules; closing it discards the unsaved draft.
const CONFIG_TAB_KEYS={product:['defaultInterestCalculationBase','defaultPaymentFrequency'],tax:['openingFeeRate','openingFeeMode'],payments:['prepayWaitMonths'],extensions:['extension15Rate','extension15Minimum','extension30Rate','extension30Minimum','extensionMonthlyDays','extensionBiweeklyDays']};
function configOpenVersion(open){if(!can('settings'))return false;configVersionOpen=!!open;configPreviewToken='';renderSettings();const target=document.getElementById(open?'cfg-version-panel':'cfg-new-version');target?.scrollIntoView?.({block:'start'});(open?document.querySelector('#cfg-version-panel input,#cfg-version-panel select'):target)?.focus?.();return true;}
function configOpenCrmSettings(){
 if(!can('crmManage')||typeof setView!=='function')return false;
 if(setView('crm')===false)return false;
 let tries=0;const find=()=>{for(const host of document.querySelectorAll('#crm *')){const b=host.shadowRoot&&host.shadowRoot.getElementById('crmSettings');if(b&&!b.hidden)return b;}return null;};
 const tick=()=>{const b=find();if(b){b.click();return;}if(++tries<40)setTimeout(tick,100);};tick();return true;
}
function configSelectTab(tab){configTab=tab;configVersionOpen=false;configPreviewToken='';renderSettings();document.getElementById('cfg-tab-'+tab)?.focus?.();}
function configEditor(rules){
 const disabled=!can('settings'),dis=disabled?'disabled':'',block=(title,help,content)=>`<fieldset class="cfg-block"><legend>${title}</legend><p class="cfg-helper">${help}</p><div class="info-grid">${content}</div></fieldset>`;
 let fields='';
 if(configTab==='product')fields=block('Condiciones de nuevos créditos','Estos valores se proponen al crear una oferta. Cada crédito conserva su selección.',`<label class="field" for="cfg-defaultInterestCalculationBase"><span>Cálculo de interés</span><select id="cfg-defaultInterestCalculationBase" ${dis} aria-describedby="cfg-interest-help"><option value="global" ${rules.defaultInterestCalculationBase==='global'?'selected':''}>Global</option><option value="outstanding_balance" ${rules.defaultInterestCalculationBase==='outstanding_balance'?'selected':''}>Saldos insolutos</option></select><small class="cfg-helper" id="cfg-interest-help">Selecciona el método predeterminado de la oferta.</small></label><label class="field" for="cfg-defaultPaymentFrequency"><span>Frecuencia de pago</span><select id="cfg-defaultPaymentFrequency" ${dis} aria-describedby="cfg-frequency-help"><option value="monthly" ${rules.defaultPaymentFrequency==='monthly'?'selected':''}>Mensual</option><option value="biweekly" ${rules.defaultPaymentFrequency==='biweekly'?'selected':''}>Quincenal</option></select><small class="cfg-helper" id="cfg-frequency-help">Mensual o quincenal para las nuevas ofertas.</small></label>`);
 else if(configTab==='tax')fields=block('Comisión de apertura','Solo para nuevos créditos. Los importes existentes se conservan.',configField('openingFeeRate','Porcentaje de apertura (%)',rules.openingFeeRate,disabled,'Escribe 5 para una comisión de 5%. Se agrega IVA 16%.')+`<label class="field" for="cfg-openingFeeMode"><span>Forma de cobro</span><select id="cfg-openingFeeMode" ${dis} aria-describedby="cfg-opening-mode-help"><option value="upfront" ${rules.openingFeeMode==='upfront'?'selected':''}>Anticipada antes de liberar</option><option value="financed" ${rules.openingFeeMode==='financed'?'selected':''}>Financiada</option></select><small class="cfg-helper" id="cfg-opening-mode-help">La modalidad debe corresponder al contrato.</small></label>`);
 else if(configTab==='extensions'){
  fields=[15,30].map(days=>block('Prórroga de '+days+' días','Se cobra el mayor entre el porcentaje del capital diferido y el mínimo, más IVA 16%.',configField('extension'+days+'Rate','Porcentaje de comisión (%)',rules['extension'+days+'Rate'],disabled,'Escribe '+(days===15?'3':'5')+' para '+(days===15?'3':'5')+'%.')+configField('extension'+days+'Minimum','Comisión mínima (MXN)',rules['extension'+days+'Minimum'],disabled,'Importe antes de IVA.'))).join('');
  fields+=block('Plazos disponibles','Puedes desactivar todos los plazos. No se agregan plazos nuevos.',`<div class="cfg-check-list pz-switch-list info-full">${[15,30].map(d=>`<label class="pz-switch" for="cfg-monthly-${d}"><input id="cfg-monthly-${d}" type="checkbox" role="switch" ${rules.extensionMonthlyDays.includes(d)?'checked':''} ${dis}><span class="pz-switch-track" aria-hidden="true"></span><span class="pz-switch-text">Pagos mensuales · ${d} días</span></label>`).join('')}<label class="pz-switch" for="cfg-biweekly-15"><input id="cfg-biweekly-15" type="checkbox" role="switch" ${rules.extensionBiweeklyDays.includes(15)?'checked':''} ${dis}><span class="pz-switch-track" aria-hidden="true"></span><span class="pz-switch-text">Pagos quincenales · 15 días</span></label></div>`);
 }else fields=block('Prepago y liquidación','La espera comienza en la fecha de dispersión.',configField('prepayWaitMonths','Meses de espera',rules.prepayWaitMonths,disabled,'Meses completos antes de permitir prepago o liquidación.'));
 return `<div class="cfg-editor-head"><h3>${disabled?'Valores de referencia':'Crear una nueva versión'}</h3><span class="pill pill-gray">${disabled?'Solo consulta':'Editable por administrador'}</span></div><p class="cfg-helper">Se muestran los valores para nuevos créditos hoy. El resumen compara las reglas en la fecha que elijas; las versiones futuras se consultan en el historial.</p><div class="cfg-editor" oninput="configInvalidatePreview()" onchange="configSyncScope();configInvalidatePreview()">${fields}${block('Cuándo y a quién aplica','La vigencia debe ser hoy o una fecha futura.',`<label class="field" for="cfg-scope"><span>Aplicar a</span><select id="cfg-scope" ${dis} aria-describedby="cfg-scope-help"><option value="newonly">Solo créditos nuevos</option>${['product','tax'].includes(configTab)?'':'<option value="existing_new">Créditos existentes y nuevos</option><option value="selected">Solo créditos seleccionados</option>'}</select><small class="cfg-helper" id="cfg-scope-help">Los créditos que ya existen quedan excluidos de esta versión.</small></label><label class="field" for="cfg-effective"><span>Vigencia</span><input id="cfg-effective" type="date" min="${today()}" value="${today()}" ${dis} required aria-describedby="cfg-date-help"><small class="cfg-helper" id="cfg-date-help">Sin cambios retroactivos.</small></label><div id="cfg-selected-block" class="info-full" hidden><label class="field" for="cfg-selected"><span>IDs de créditos seleccionados</span><input id="cfg-selected" placeholder="${configEscape(configCreditIds().slice(0,2).join(', '))}" disabled aria-describedby="cfg-selected-help"><small class="cfg-helper" id="cfg-selected-help">Separa los IDs con comas. Solo se aceptan créditos existentes.</small></label></div><div id="cfg-authorization-block" class="info-full" hidden><label class="cfg-check" for="cfg-authorized"><input id="cfg-authorized" type="checkbox" disabled><span>Confirmo que tengo autorización contractual demo para los créditos existentes afectados.</span></label><label class="field" for="cfg-reference"><span>Referencia de autorización</span><input id="cfg-reference" disabled aria-describedby="cfg-reference-help"><small class="cfg-helper" id="cfg-reference-help">Obligatoria para créditos existentes. Esta demo registra la referencia, sin validar documentos.</small></label></div>`)}</div><section id="cfg-preview" class="preview" aria-live="polite" tabindex="-1">Revisa los cambios para ver el antes y después, la vigencia y los créditos afectados.</section><div class="action-bar cfg-review-actions"><button type="button" class="btn btn-secondary" onclick="configShowPreview()" ${dis}>Revisar cambios</button><button type="button" id="cfg-save" class="btn btn-primary" onclick="configSubmit()" disabled>Confirmar y guardar versión</button></div><p class="cfg-helper">Cada cambio requiere una nueva revisión antes de guardar.</p>`;
}
function configUserPermissions(user){
 try { const preview=window.PulzzoStaffAccess.previewRoles(session,user.roles||[]); return Object.keys(preview.grants||{}).join(' · ')||'Solo consulta'; }
 catch(_){return 'Acceso no disponible';}
}

function configRuleList(rules){
 return `<ul class="cfg-rule-list">${Object.entries(rules).filter(([key])=>Object.prototype.hasOwnProperty.call(CONFIG_BASE,key)).map(([key,value])=>`<li><span>${configEscape(CONFIG_LABELS[key])}:</span> <strong>${configEscape(configDisplayValue(key,value))}</strong></li>`).join('')}</ul>`;
}
function renderSettings(){
 const target=document.getElementById('settings');if(!target)return;
 if(!can('settings')){target.innerHTML='<p role="alert">Solo el administrador puede abrir Configuración.</p>';return;}
 let state,rules;try{state=configRead();rules=configResolveRules(null);}catch(e){target.innerHTML=`<div class="card"><div class="card-body">${configEscape(e.message)}</div></div>`;return;}
 configFormRevision=state.revision;configPreviewToken='';
 const tabs=[['product','Condiciones del producto'],['tax','Comisiones e impuestos'],['payments','Pagos y liquidación'],['extensions','Prórrogas'],['collections','Mora y cobranza'],['disbursement','Dispersión'],['staff','Usuarios y grupos'],['crm','CRM'],['mail','Correo CRM'],['history','Historial de configuración']];
 // v36f: one main tab per area; areas with several sections show a second row of tabs (same ids cfg-tab-<id>).
 const groups=[['staff','Usuarios y grupos',['staff']],['crm','CRM',['crm']],['mail','Correo CRM',['mail']],['products','Productos',['product','tax']],['portfolio','Cartera',['payments','extensions','collections','disbursement']],['history','Historial',['history']]];
 const activeGroup=groups.find(g=>g[2].includes(configTab))||groups[3];
 const sections={
  product:{intro:'Define las condiciones que se proponen al crear un crédito.',fixed:['Las selecciones global / insolutos y mensual / quincenal de cada oferta se conservan.','Cambiar el predeterminado no modifica precios ni selecciones de créditos existentes.']},
  tax:{intro:'Ajusta la comisión de apertura de los nuevos créditos.',fixed:['IVA fijo 16% sobre interés ordinario, moratorio y comisiones; nunca sobre capital. No se puede desactivar.','Los créditos históricos sin desglose fiscal conservan sus importes y requieren revisión.'],pending:['Validación fiscal del artículo 18-A pendiente.']},
  payments:{intro:'Configura la espera para realizar prepagos y liquidaciones.',fixed:['Primero se atiende la cuota más antigua elegible. El prepago a capital reduce plazo.','Prelación vigente: interés ordinario, IVA interés, interés mora, IVA mora, comisiones, moratorios sin intereses, ordinarios sin intereses y capital.'],pending:['Condonaciones, reasignaciones y devolución de excedentes: pendientes, sin acciones simuladas.']},
  extensions:{intro:'Define la comisión y los plazos habilitados para nuevas prórrogas.',fixed:['Mensual: 15 o 30 días. Quincenal: 15 días.','Solo se bloquea otra prórroga activa sobre la misma cuota; no existe un máximo global nuevo. Las prórrogas activas conservan su cálculo original.']},
  collections:{intro:'Consulta el alcance actual de mora y cobranza.',fixed:['Se muestran el atraso y los moratorios e IVA ya registrados.','No se envían comunicaciones desde esta demo.'],pending:['El devengo automático de nueva mora y la edición de tasa moratoria requieren definición y un motor validado.','Convenios y recordatorios automáticos: etapa 2, pendientes de backend.']},
  disbursement:{intro:'Consulta las validaciones necesarias para liberar un crédito.',fixed:['Expediente, contrato, cuenta y pagos iniciales deben cumplir las validaciones existentes.','La comisión anticipada se cubre antes de liberar. La financiada se integra según la oferta.','Estos requisitos no se pueden omitir desde Configuración.']}
 };
 const scopeLabel={newonly:'Solo créditos nuevos',existing_new:'Créditos existentes y nuevos',selected:'Créditos seleccionados'};
 const history=`<h3>Historial de versiones · ${state.revision}</h3><p class="cfg-helper">Historial acumulativo, sin editar ni borrar versiones. Las vigencias futuras se conservan hasta su fecha.</p><details class="cfg-policy"><summary>Consultar reglas base</summary>${configRuleList(CONFIG_BASE)}<p>Los selectores de cada crédito se conservan.</p></details>${state.versions.slice().reverse().map(v=>`<article class="info cfg-history-version"><h4>${configEscape(v.id)} · vigencia ${configEscape(v.effectiveDate)}</h4><p>Autor: ${configEscape(v.createdBy)} · ${configEscape(v.createdAt)}</p><p>Alcance: ${configEscape(scopeLabel[v.scope])}</p>${configRuleList(v.patch)}<details><summary>Consultar alcance y reglas anteriores</summary><p>Seleccionados: ${v.selectedIds.map(configEscape).join(', ')||'—'} · excluidos: ${v.excludedIds.map(configEscape).join(', ')||'—'}</p><p>Reglas previas preservadas: ${(v.beforeRules||[]).length} créditos · IDs al activar: ${(v.affectedIds||[]).map(configEscape).join(', ')||'Ninguno'}</p>${(v.beforeRules||[]).map(snapshot=>`<section><h4>${configEscape(snapshot.creditId)}</h4>${configRuleList(snapshot.rules)}</section>`).join('')}</details><p>Referencia de autorización demo: ${configEscape(v.authorizationReference)||'No aplica: solo nuevos'}</p></article>`).join('')||'<p>Sin versiones personalizadas.</p>'}`;
 const section=sections[configTab]||sections.product,editable=['product','tax','payments','extensions'].includes(configTab);
 const crmCard=`<section class="cfg-area-card"><h3>Configuración del CRM</h3><p class="cfg-helper">Quién recibe las nuevas entradas, el reparto por turnos entre KAMs y si el líder puede asignar responsables. Solo afecta entradas futuras y queda en el historial del CRM.</p>${can('crmManage')?'<button type="button" class="btn btn-primary btn-sm" id="cfg-open-crm-settings" onclick="configOpenCrmSettings()">Abrir configuración del CRM</button>':'<p class="pill pill-gray">Solo Admin</p>'}</section>`;
 const mailCard=`<section class="cfg-area-card"><h3>Correo CRM</h3><p class="cfg-helper">La conexión de Gmail del CRM se configura en una pantalla separada y permanece inactiva hasta configurar el servicio. En esta demo no se envían correos.</p><a class="btn btn-secondary btn-sm" href="crm.html">Abrir Correo CRM</a></section>`;
 const content=configTab==='staff'?'<div id="staffAdministration"></div>':configTab==='crm'?crmCard:configTab==='mail'?mailCard:configTab==='history'?history:`<section class="cfg-policy cfg-rules-card"><div class="cfg-rules-head"><div><h3>Reglas vigentes · solo consulta</h3><p class="cfg-helper">${section.intro}</p></div>${editable&&can('settings')?`<button type="button" class="btn btn-primary btn-sm" id="cfg-new-version" aria-controls="cfg-version-panel" aria-expanded="${configVersionOpen}" onclick="configOpenVersion(true)">Crear una nueva versión</button>`:''}</div>${(CONFIG_TAB_KEYS[configTab]||[]).length?`<dl class="cfg-current">${CONFIG_TAB_KEYS[configTab].map(key=>`<div><dt>${configEscape(CONFIG_LABELS[key])}</dt><dd>${configEscape(configDisplayValue(key,rules[key]))}</dd></div>`).join('')}</dl>`:''}<ul>${section.fixed.map(text=>`<li>${text}</li>`).join('')}</ul></section>${editable?`<section class="cfg-version-panel" id="cfg-version-panel" data-open="${configVersionOpen||!can('settings')?'1':'0'}">${configEditor(rules)}${can('settings')?'<div class="cfg-version-close"><button type="button" class="btn btn-secondary btn-sm" onclick="configOpenVersion(false)">Cerrar sin guardar</button></div>':''}</section>`:'<p class="pill pill-gray">Solo consulta</p>'}${section.pending?`<section class="cfg-pending"><h3>Pendiente · no disponible en esta demo</h3><ul>${section.pending.map(text=>`<li>${text}</li>`).join('')}</ul></section>`:''}`;
 target.innerHTML=`<div class="section-head cfg-head-compact"><div><p>Reglas y versiones de la demo.</p></div><span class="pill pill-gray">${can('settings')?'Administrador':'Solo consulta'}</span></div><aside class="cfg-impact-note"><strong>Demo local, sin respaldo de servidor</strong><p>Se guarda únicamente en este navegador. No usar en producción ni editar en varias pestañas a la vez.</p><details><summary>Ver límites de almacenamiento y autorización</summary><p>El historial no es una auditoría legal ni almacenamiento inalterable; puede perderse o modificarse fuera de la app. La autorización se registra como evidencia demo, no se valida contra documentos.</p></details></aside><div class="card cfg-shell"><div class="tabs cfg-main-tabs" aria-label="Secciones de configuración">${groups.map(([gid,glabel,ids])=>ids.length===1?`<button type="button" id="cfg-tab-${ids[0]}" class="tab ${configTab===ids[0]?'active':''}" aria-pressed="${configTab===ids[0]}" onclick="configSelectTab('${ids[0]}')">${glabel}</button>`:`<button type="button" id="cfg-group-${gid}" class="tab ${activeGroup[0]===gid?'active':''}" aria-pressed="${activeGroup[0]===gid}" onclick="configSelectTab('${ids[0]}')">${glabel}</button>`).join('')}</div>${activeGroup[2].length>1?`<div class="tabs cfg-sub-tabs" aria-label="${activeGroup[1]}">${tabs.filter(([id])=>activeGroup[2].includes(id)).map(([id,label])=>`<button type="button" id="cfg-tab-${id}" class="tab ${configTab===id?'active':''}" aria-pressed="${configTab===id}" onclick="configSelectTab('${id}')">${label}</button>`).join('')}</div>`:''}<div class="card-body"><div id="cfg-message" tabindex="-1" role="status" aria-live="polite"></div>${content}</div></div>`;
 if(configTab==='staff'&&typeof renderStaffAdministration==='function')renderStaffAdministration();
}
