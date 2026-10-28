// v71.1: selector de frecuencia de pago en el portal del paciente (oferta › Configura tus pagos).
// - Mensual: día 1 a 28 o «Último día del mes» (selector existente).
// - Quincenal: el paciente elige dos días (1 a 28 o último) separados entre 13 y 17 días.
// - Semanal: solo aparece si Administración activó «Permitir pagos semanales».
// No reemplaza el HTML de la página: completa el bloque ya dibujado después de cada render.
(function(){
'use strict';
const PF=globalThis.PulzzoPaymentFrequency;
if(!PF||typeof renderPortal!=='function'||typeof normalizeOfferPaymentState!=='function')return;
const store=()=>{try{return localStorage;}catch(error){return null;}};
function weeklyEnabled(){return PF.readSettings(store()).weekly;}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);}
function incomeAllowsBiweekly(){
 const src=String(state.incomeType||state.incomeProfile||(state.income&&(state.income.type||state.income.profile))||'').toLowerCase();
 return src.includes('nómina')||src.includes('nomina')||src.includes('empleado');
}
const orig={normalizePaymentFrequencyValue,isValidBiweeklyPaymentDay,normalizeOfferPaymentState,getPaymentScheduleLabel,readOfferPaymentSelection,handleOfferPaymentControlChange,renderPortal};
normalizePaymentFrequencyValue=function(value){
 const v=String(value||'').trim().toLowerCase();
 if(v==='semanal'||v==='weekly'){
  if(weeklyEnabled()||(state&&(state.offerAccepted||state.contractSigned)))return 'Semanal';
  return 'Mensual';
 }
 return orig.normalizePaymentFrequencyValue(value);
};
isValidBiweeklyPaymentDay=function(value){return PF.parsePair(value).ok;};
function isValidWeekly(value){return !!PF.weekdayIndex(value);}
normalizeOfferPaymentState=function(preferredFrequency){
 if(state.offerAccepted||state.contractSigned)return orig.normalizeOfferPaymentState(preferredFrequency);
 const frequency=normalizePaymentFrequencyValue(preferredFrequency||state.paymentFrequency||'Mensual');
 if(frequency!=='Semanal')return orig.normalizeOfferPaymentState(frequency);
 state.paymentFrequency='Semanal';
 if(!isValidWeekly(state.preferredPaymentDay))state.preferredPaymentDay=PF.weeklyLabel(1);
 delete state.firstPaymentDay;delete state.secondPaymentDay;
 return {frequency,paymentDay:state.preferredPaymentDay};
};
getPaymentScheduleLabel=function(){
 if(String(state.paymentFrequency||'')==='Semanal')return `Frecuencia: <b>Semanal</b> · Día: <b>${esc(state.preferredPaymentDay||'Pendiente')}</b>`;
 return orig.getPaymentScheduleLabel();
};
function quotedKey(quoted){
 const qf=quoted.paymentFrequency||quoted.frequency;if(!qf)return null;
 const f=String(qf).toLowerCase();
 const freq=/seman|^weekly$/.test(f)?'Semanal':/quinc|biweekly/.test(f)?'Quincenal':'Mensual';
 const raw=quoted.paymentDayOption||quoted.preferredPaymentDay||quoted.paymentDay||(Array.isArray(quoted.paymentDays)?quoted.paymentDays:'');
 return {freq,day:raw===''?'':PF.canonical(freq,raw)};
}
readOfferPaymentSelection=function(triggerElement){
 const root=getOfferActionRoot(triggerElement),paymentConfig=root.querySelector('.payment-config')||root;
 const freqEl=paymentConfig.querySelector('[data-payment-frequency]');
 const selectedFrequency=normalizePaymentFrequencyValue(freqEl?freqEl.value:state.paymentFrequency);
 const aEl=paymentConfig.querySelector('[data-biweekly-day-a]'),bEl=paymentConfig.querySelector('[data-biweekly-day-b]'),wEl=paymentConfig.querySelector('[data-weekly-day]');
 if(selectedFrequency==='Mensual'||(selectedFrequency==='Quincenal'&&!aEl&&!bEl))return orig.readOfferPaymentSelection(triggerElement);
 let paymentDay='';
 if(selectedFrequency==='Quincenal'){
  const r=aEl&&bEl?PF.validateBiweekly(aEl.value,bEl.value):PF.parsePair(state.preferredPaymentDay);
  if(!r.ok)return {ok:false,message:r.message,target:paymentConfig};
  paymentDay=r.label;
 }else{
  const n=PF.weekdayIndex(wEl?wEl.value:state.preferredPaymentDay);
  if(!n)return {ok:false,message:'Elige el día de la semana para tu pago.',target:paymentConfig};
  paymentDay=PF.weeklyLabel(n);
 }
 const q=quotedKey(state.offer||{});
 if(q&&(q.freq!==selectedFrequency||(q.day&&q.day!==PF.canonical(selectedFrequency,paymentDay))))return {ok:false,message:'El calendario elegido no coincide con la oferta cotizada. Solicita una oferta actualizada antes de aceptar.',target:paymentConfig};
 return {ok:true,frequency:selectedFrequency,paymentDay,target:paymentConfig};
};
handleOfferPaymentControlChange=function(target){
 if(!target||!target.matches||!target.matches('[data-biweekly-day-a],[data-biweekly-day-b],[data-weekly-day]'))return orig.handleOfferPaymentControlChange(target);
 if(state.offerAccepted||state.contractSigned)return false;
 try{assertApplicationFresh();}catch(error){return false;}
 const box=target.closest('[data-payment-config]')||target.closest('.payment-config')||document;
 if(target.matches('[data-weekly-day]')){
  const n=PF.weekdayIndex(target.value);if(!n)return false;
  state.paymentFrequency='Semanal';state.preferredPaymentDay=PF.weeklyLabel(n);delete state.v711BiweeklyDraft;
 }else{
  const a=(box.querySelector('[data-biweekly-day-a]')||{}).value,b=(box.querySelector('[data-biweekly-day-b]')||{}).value;
  const r=PF.validateBiweekly(a,b);
  state.paymentFrequency='Quincenal';
  if(r.ok){state.preferredPaymentDay=r.label;delete state.v711BiweeklyDraft;}
  else state.v711BiweeklyDraft={a:String(a||''),b:String(b||''),message:r.message};
 }
 saveState();prepareBackendPayload();renderPortal();
 return true;
};
function dayOptions(selected){
 const sel=PF.dayToken(selected);
 return '<option value="">Selecciona</option>'+Array.from({length:28},(_,i)=>i+1).map(d=>`<option value="${d}" ${sel===d?'selected':''}>${d}</option>`).join('')+`<option value="last_day" ${sel===PF.LAST?'selected':''}>Último día del mes</option>`;
}
function enhance(){
 if(typeof isSharedPatientCapture==='function'&&isSharedPatientCapture())return;
 const locked=!!(state.offerAccepted||state.contractSigned),weekly=weeklyEnabled(),freq=String(state.paymentFrequency||'Mensual');
 document.querySelectorAll('[data-payment-config]').forEach(box=>{
  if(box.dataset.v711Frequency==='1')return;box.dataset.v711Frequency='1';
  const fields=box.querySelector('.payment-config-fields');if(!fields)return;
  let fSel=fields.querySelector('[data-payment-frequency]');
  if(weekly&&!fSel){
   const wrap=document.createElement('div');
   const opts=['Mensual'].concat(incomeAllowsBiweekly()?['Quincenal']:[],['Semanal']);
   wrap.innerHTML=`<label>Frecuencia de pago</label><select data-payment-frequency>${opts.map(o=>`<option value="${o}" ${freq===o?'selected':''}>${o}</option>`).join('')}</select>`;
   fields.insertBefore(wrap,fields.firstChild);fSel=wrap.querySelector('select');
  }else if(fSel&&weekly&&!fSel.querySelector('option[value="Semanal"]')){
   const o=document.createElement('option');o.value='Semanal';o.textContent='Semanal';if(freq==='Semanal')o.selected=true;fSel.appendChild(o);
  }
  if(fSel)fSel.setAttribute('data-v711-frequency-select','1');
  if(freq==='Quincenal'){
   const pair=fields.querySelector('[data-biweekly-payment-pair]');const holder=pair&&pair.parentElement;
   if(holder){
    const draft=state.v711BiweeklyDraft,cur=PF.parsePair(state.preferredPaymentDay);
    const a=draft?draft.a:(cur.ok?cur.days[0]:''),b=draft?draft.b:(cur.ok?cur.days[1]:'');
    holder.setAttribute('data-v711-biweekly','1');
    holder.innerHTML=`<label>Fechas de pago quincenal</label><div class="v711-biweekly-days" style="display:flex;gap:8px;align-items:center"><select data-biweekly-day-a aria-label="Primer día de pago" ${locked?'disabled':''}>${dayOptions(a)}</select><span>y</span><select data-biweekly-day-b aria-label="Segundo día de pago" ${locked?'disabled':''}>${dayOptions(b)}</select></div><small class="v711-biweekly-help">Elige dos días separados entre 13 y 17 días (por ejemplo 5 y 20, 10 y 25 o 15 y último).</small>${draft&&draft.message?`<p class="payment-error-inline" role="alert" data-v711-biweekly-error style="color:#B42318;margin:6px 0 0">${esc(draft.message)}</p>`:''}`;
   }
  }else if(freq==='Semanal'){
   const day=fields.querySelector('[data-payment-day]');const holder=day&&day.parentElement;
   if(holder){
    const n=PF.weekdayIndex(state.preferredPaymentDay)||1;
    holder.setAttribute('data-v711-weekly','1');
    holder.innerHTML=`<label>Día de pago semanal</label><select data-weekly-day ${locked?'disabled':''}>${PF.WEEKDAYS.map((d,i)=>`<option value="${PF.weeklyOption(i+1)}" ${n===i+1?'selected':''}>${PF.weeklyLabel(i+1)}</option>`).join('')}</select><small>Pagas cada semana el día elegido.</small>`;
   }
  }else{
   const day=fields.querySelector('[data-payment-day]');
   if(day&&day.parentElement&&!day.parentElement.querySelector('.v711-monthly-help')){const s=document.createElement('small');s.className='v711-monthly-help';s.textContent='Elige un día del 1 al 28 o el último día del mes.';day.parentElement.appendChild(s);}
  }
 });
}
renderPortal=function(){const out=orig.renderPortal.apply(this,arguments);try{enhance();}catch(error){}return out;};
try{enhance();}catch(error){}
Object.assign(globalThis,{v711PortalEnhancePaymentConfig:enhance});
})();
