// v71.1: frecuencia de pago en el backoffice.
// Extiende (sin reemplazar el motor) las funciones de calendario del backoffice:
//  - Quincenal con cualquier par de días válido (13 a 17 días de separación).
//  - Semanal (solo si Administración lo permite; los créditos semanales existentes conservan su calendario).
//  - Interruptor «Permitir pagos semanales» en Configuración › Pagos y liquidación, solo Admin, con historial.
(function(){
'use strict';
const PF=globalThis.PulzzoPaymentFrequency;
if(!PF||typeof dispersionTerms!=='function')return;
const orig={paymentFrequencyValue,normalizePaymentDayOption,paymentDaysFromOption,paymentCalendarTypeFromConfig,paymentFrequencyLabel,paymentDayOptionLabel,
 dispersionPeriodsPerYearForFrequency,dispersionGeneratePaymentDates,dispersionNextPeriodDateFrom,dispersionExtensionNewDueDate,dispersionNextSequentialDueDate,
 dispersionTerms,dispersionBuildSchedule,calculateOfferMonthlyPayment,paymentPeriodDisplayLabel};
const isWeekly=f=>String(f||'')==='weekly';
paymentFrequencyValue=function(value){
 const s=String(value||'').trim().toLowerCase();
 if(s.includes('seman')||s==='weekly')return 'weekly';
 return orig.paymentFrequencyValue(value);
};
normalizePaymentDayOption=function(value,frequency){
 if(isWeekly(frequency)){const n=PF.weekdayIndex(Array.isArray(value)?value[0]:value);return PF.weeklyOption(n||1);}
 if(frequency==='biweekly'){const r=PF.parsePair(value);if(r.ok)return r.option;}
 return orig.normalizePaymentDayOption(value,frequency);
};
paymentDaysFromOption=function(option,frequency){
 if(isWeekly(frequency))return [option&&/^weekly_[1-7]$/.test(option)?option:'weekly_1'];
 if(frequency==='biweekly'){const r=PF.parsePair(option);if(r.ok)return r.days.slice();}
 return orig.paymentDaysFromOption(option,frequency);
};
paymentCalendarTypeFromConfig=function(frequency,option){
 if(isWeekly(frequency))return 'weekly_fixed_weekday';
 if(frequency==='biweekly'&&/last_day$/.test(String(option||'')))return 'biweekly_last_day';
 return orig.paymentCalendarTypeFromConfig(frequency,option);
};
paymentFrequencyLabel=function(value){return paymentFrequencyValue(value)==='weekly'?'Semanal':orig.paymentFrequencyLabel(value);};
paymentDayOptionLabel=function(option,frequency){
 const f=paymentFrequencyValue(frequency);
 if(f==='weekly')return PF.weeklyLabel(PF.weekdayIndex(option)||1);
 if(f==='biweekly'){const r=PF.parsePair(option);if(r.ok)return r.label;}
 return orig.paymentDayOptionLabel(option,frequency);
};
dispersionPeriodsPerYearForFrequency=function(terms){return isWeekly(terms&&terms.paymentFrequency)?52:orig.dispersionPeriodsPerYearForFrequency(terms);};
function weekdayOf(terms){return PF.weekdayIndex(terms&&terms.paymentDayOption)||PF.weekdayIndex(terms&&Array.isArray(terms.paymentDays)&&terms.paymentDays[0])||1;}
dispersionGeneratePaymentDates=function(baseDate,terms,count){
 if(isWeekly(terms&&terms.paymentFrequency)){const base=dispersionDateOnly(baseDate)||dispersionDateOnly(getTodayLocalMX());return PF.weeklyDates(base,weekdayOf(terms),count);}
 return orig.dispersionGeneratePaymentDates(baseDate,terms,count);
};
dispersionNextPeriodDateFrom=function(date,terms){
 if(isWeekly(terms&&terms.paymentFrequency))return dispersionAddDaysToDateString(dispersionDateOnly(date),7);
 return orig.dispersionNextPeriodDateFrom(date,terms);
};
dispersionExtensionNewDueDate=function(row,terms,days){
 if(isWeekly(terms&&terms.paymentFrequency))return dispersionAddDaysToDateString(dispersionDateOnly(row.currentDueDate||row.dueDate),7);
 return orig.dispersionExtensionNewDueDate(row,terms,days);
};
dispersionNextSequentialDueDate=function(previousDate,terms){
 if(isWeekly(terms&&terms.paymentFrequency))return previousDate?dispersionAddDaysToDateString(dispersionDateOnly(previousDate),7):'';
 return orig.dispersionNextSequentialDueDate(previousDate,terms);
};
// Semanal: número de pagos = meses × 52 / 12; pago por periodo según la base (global: capital + interés anual/52 + IVA;
// insolutos: pago fijo calculado con las fechas reales y el interés por días reales).
dispersionTerms=function(p){
 const t=orig.dispersionTerms(p);
 if(!isWeekly(t.paymentFrequency)||(p&&p.application&&p.application.operationalPlan&&p.application.operationalPlan.rule))return t;
 const n=PF.weeklyPeriods(t.termMonths),principal=roundToCents(t.totalFinancedAmount||t.approvedAmount||0);
 const base=t.dispersionDate||t.signedAt||dispersionDateOnly(new Date());
 const probe={...t,numberOfPeriods:n};
 let per=0;
 if(t.interestCalculationBase==='outstanding_balance'){
  const dueDates=dispersionGeneratePaymentDates(base,probe,n);
  per=roundToCents(calculateFixedPeriodPayment({principal,totalPeriods:n,dueDates,startDate:base,terms:probe,interestCalculationBase:t.interestCalculationBase})||0);
 }else{
  const gi=roundToCents(principal*(t.ordinaryAnnualRate||0)/52);per=roundToCents(roundToCents(principal/n)+gi+roundToCents(gi*0.16));
 }
 const out={...t,numberOfPeriods:n,periodsPerMonth:52/12,paymentAmountPerPeriod:per,monthlyPayment:roundToCents(per*52/12),initialEach:per,initialTotal:roundToCents(per*(t.initialCount||0)),preferredDay:t.preferredDay};
 out.paymentCalendarSignature=getPaymentCalendarSignature({paymentFrequency:'weekly',paymentDayOption:t.paymentDayOption,paymentDays:t.paymentDays,termMonths:t.termMonths,periodsPerMonth:out.periodsPerMonth,numberOfPeriods:n,startDate:t.dispersionDate||t.signedAt,signedAt:t.signedAt,dispersionDate:t.dispersionDate});
 return out;
};
dispersionBuildSchedule=function(p){
 const rows=orig.dispersionBuildSchedule.apply(this,arguments);
 try{if(Array.isArray(rows)&&isWeekly(dispersionNormalizePaymentConfig(p).paymentFrequency))rows.forEach(r=>{if(r&&r.type==='Mensualidad ordinaria')r.type='Pago semanal ordinario';});}catch(error){}
 return rows;
};
calculateOfferMonthlyPayment=function(force){
 const currentPatient=(typeof db!=='undefined'&&db.patients||[]).find(x=>x.id===selectedPatientId)||{};
 let cfg={};try{cfg=dispersionNormalizePaymentConfig(currentPatient);}catch(error){}
 if(!isWeekly(cfg.paymentFrequency))return orig.calculateOfferMonthlyPayment.apply(this,arguments);
 const monthlyEl=document.getElementById('offerMonthlyPayment');if(!monthlyEl)return 0;
 const amount=parseOfferNumber(document.getElementById('offerApprovedAmount')&&document.getElementById('offerApprovedAmount').value);
 const months=Number(document.getElementById('offerTermMonths')&&document.getElementById('offerTermMonths').value||0);
 const annual=Number(document.getElementById('offerAnnualInterestRate')&&document.getElementById('offerAnnualInterestRate').value||0);
 const interestBase=document.getElementById('offerInterestCalculationBase')&&document.getElementById('offerInterestCalculationBase').value||'global';
 if(monthlyEl.dataset.manual==='true'&&!force&&monthlyEl.dataset.interestBase===interestBase)return parseOfferNumber(monthlyEl.value);
 if(!amount||!months)return 0;
 const n=PF.weeklyPeriods(months),startDate=dispersionBusinessDateMX(),rate=normalizePercentRate(annual,0.60,'percent');
 const terms={approvedAmount:amount,totalFinancedAmount:amount,ordinaryAnnualRate:rate,annualInterestRate:annual,interestCalculationBase:interestBase,paymentFrequency:'weekly',paymentDayOption:cfg.paymentDayOption,paymentDays:cfg.paymentDays,numberOfPeriods:n,termMonths:months};
 let per;
 if(interestBase==='outstanding_balance')per=calculateFixedPeriodPayment({principal:amount,totalPeriods:n,dueDates:dispersionGeneratePaymentDates(startDate,terms,n),startDate,terms,interestCalculationBase:interestBase});
 else{const gi=roundToCents(amount*rate/52);per=roundToCents(roundToCents(amount/n)+gi+roundToCents(gi*0.16));}
 const rounded=roundToCents((per||0)*52/12);
 monthlyEl.dataset.quoteStartDate=startDate;monthlyEl.dataset.raw=String(rounded);monthlyEl.dataset.interestBase=interestBase;monthlyEl.value=fmtMoney(rounded);
 if(force)monthlyEl.dataset.manual='true';
 return rounded;
};
paymentPeriodDisplayLabel=function(frequency,monthlyPayment,formatter){
 const fmt=formatter||fmtMoney;
 if(paymentFrequencyValue(frequency)==='weekly'){const monthly=roundToCents(monthlyPayment||0);return monthly?`Pago semanal aprox. ${fmt(roundToCents(monthly*12/52))}`:'No especificado';}
 return orig.paymentPeriodDisplayLabel(frequency,monthlyPayment,fmt);
};

// ---------- Configuración: «Permitir pagos semanales» (solo Admin, apagado por defecto, con historial) ----------
function v711Esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);}
function v711StaffSession(){return typeof session!=='undefined'?session:null;}
function v711WeeklyEnabled(){
 try{const sa=globalThis.PulzzoStaffAccess,s=v711StaffSession();if(sa&&s&&sa.getPaymentOptions)return sa.getPaymentOptions(s).weekly===true;}catch(error){}
 return PF.readSettings(globalThis.localStorage).weekly;
}
function v711SyncWeeklyMirror(){
 try{const sa=globalThis.PulzzoStaffAccess,s=v711StaffSession();if(!sa||!s||!sa.getPaymentOptions)return;const v=sa.getPaymentOptions(s);const cur=PF.readSettings(localStorage);if(cur.weekly!==v.weekly)PF.writeSettings(localStorage,{weekly:v.weekly,updatedAt:new Date().toISOString(),updatedBy:'sincronización'});}catch(error){}
}
function v711WeeklyHistory(){
 try{const sa=globalThis.PulzzoStaffAccess,s=v711StaffSession();return sa.listAudit(s).filter(e=>e.action==='payment_options_updated').slice(0,5);}catch(error){return [];}
}
function v711WeeklyPaymentsCard(){
 const on=v711WeeklyEnabled(),s=v711StaffSession(),isAdmin=!!(s&&(s.roles||[]).includes('admin'));
 const hist=v711WeeklyHistory();
 const fmt=d=>{try{return new Date(d).toLocaleString('es-MX',{timeZone:'America/Mexico_City',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch(error){return String(d||'');}};
 return `<section class="cfg-policy cfg-rules-card v711-weekly-card" data-v711-weekly-card><div class="cfg-rules-head"><div><h3>Frecuencia de pago</h3><p class="cfg-helper">Mensual: el paciente elige un día del 1 al 28 o el último día del mes. Quincenal: elige dos días separados entre 13 y 17 días (por ejemplo 5 y 20, 10 y 25 o 15 y último). Semanal: solo se ofrece si Administración lo permite.</p></div></div>`+
  `<dl class="cfg-current"><div><dt>Permitir pagos semanales</dt><dd id="v711WeeklyEstado" data-weekly-state="${on?'on':'off'}">${on?'Encendido · se ofrece al paciente':'Apagado · no se ofrece al paciente'}</dd></div></dl>`+
  (isAdmin?`<label class="pz-switch" for="v711WeeklyToggle"><input type="checkbox" id="v711WeeklyToggle" ${on?'checked':''} onchange="v711SetWeeklyPayments(this.checked)"><span>Permitir pagos semanales</span></label><p class="cfg-helper">Solo Administración puede cambiarlo. Cada cambio queda en el historial. Los créditos ya contratados conservan su calendario.</p>`:'<p class="pill pill-gray">Solo Administración puede cambiarlo</p>')+
  `<div id="v711WeeklyMsg" role="status" aria-live="polite"></div><h4>Historial del interruptor</h4>${hist.length?`<ul class="cfg-rule-list">${hist.map(e=>`<li>${v711Esc(fmt(e.at||e.createdAt))} · ${v711Esc(e.actorName||e.actorId||'Administración')}: ${e.before&&e.before.weekly?'Encendido':'Apagado'} → <strong>${e.after&&e.after.weekly?'Encendido':'Apagado'}</strong></li>`).join('')}</ul>`:'<p class="cfg-helper">Sin cambios: apagado por defecto.</p>'}</section>`;
}
function v711SetWeeklyPayments(value){
 const msg=document.getElementById('v711WeeklyMsg');
 try{
  const sa=globalThis.PulzzoStaffAccess,s=v711StaffSession();
  if(!sa||!s||!sa.setPaymentOptions)throw Error('Configuración no disponible en esta vista.');
  const next=sa.setPaymentOptions(s,{weekly:value===true});
  PF.writeSettings(localStorage,{weekly:next.weekly,updatedAt:new Date().toISOString(),updatedBy:(s.name||s.email||s.userId||'Administración')});
  const text=next.weekly?'Pagos semanales permitidos. Queda en el historial.':'Pagos semanales apagados. Queda en el historial.';
  if(msg)msg.textContent=text;if(typeof toast==='function')toast(text);
  if(typeof renderSettings==='function')try{renderSettings();}catch(error){}
  return {ok:true,weekly:next.weekly};
 }catch(error){
  if(msg)msg.textContent=error.message;if(typeof toast==='function')toast(error.message);
  const box=document.getElementById('v711WeeklyToggle');if(box)box.checked=!value;
  return {ok:false,error:error.message};
 }
}
v711SyncWeeklyMirror();
Object.assign(globalThis,{v711WeeklyEnabled,v711WeeklyPaymentsCard,v711SetWeeklyPayments,v711SyncWeeklyMirror});
})();
