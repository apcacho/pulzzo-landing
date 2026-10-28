// v71.1: frecuencia de pago (mensual, quincenal con dos días elegidos, semanal opcional).
// Reglas aprobadas:
//  - Mensual: día 1 a 28 o «Último día del mes».
//  - Quincenal: dos días del mes (1 a 28 o último) separados entre 13 y 17 días (mes de 30 días como referencia).
//  - Semanal: solo si Administración activa «Permitir pagos semanales» (apagado por defecto).
// El calendario usa las fechas elegidas; en saldos insolutos el interés se calcula por días reales (motor existente).
(function(root){
  'use strict';
  const LAST='last_day';
  const SETTINGS_KEY='pulzzo.paymentOptions.v1';
  const WEEKDAYS=['lunes','martes','miércoles','jueves','viernes','sábado','domingo'];
  const MIN_GAP=13, MAX_GAP=17, NOMINAL_MONTH=30;
  function dayToken(value){
    if(value===LAST)return LAST;
    const s=String(value==null?'':value).trim().toLowerCase();
    if(!s)return null;
    if(/last|fin|[uú]ltimo/.test(s))return LAST;
    if(!/^\d{1,2}$/.test(s))return null;
    const n=Number(s);return n>=1&&n<=28?n:null;
  }
  function nominal(t){return t===LAST?NOMINAL_MONTH:t;}
  function dayText(t){return t===LAST?'último día del mes':String(t);}
  function sortPair(a,b){return nominal(a)<=nominal(b)?[a,b]:[b,a];}
  function pairOption(a,b){return a+'_'+b;}
  function pairLabel(a,b){return (a===LAST?'Último día del mes':String(a))+' y '+(b===LAST?'fin de mes':String(b));}
  function validateBiweekly(first,second){
    const a=dayToken(first),b=dayToken(second);
    if(a===null||b===null)return {ok:false,message:'Elige los dos días de pago (del 1 al 28 o el último día del mes).'};
    if(a===b)return {ok:false,message:'Elige dos días distintos.'};
    const [x,y]=sortPair(a,b),gap=nominal(y)-nominal(x),wrap=NOMINAL_MONTH-gap;
    if(gap<MIN_GAP||gap>MAX_GAP||wrap<MIN_GAP||wrap>MAX_GAP){
      return {ok:false,gap,message:`Los días ${dayText(x)} y ${dayText(y)} quedan ${gap<MIN_GAP?'muy cerca':'muy lejos'} (${gap} días). Elige dos días separados entre 13 y 17 días; por ejemplo 5 y 20, 10 y 25 o 15 y último día del mes.`};
    }
    return {ok:true,gap,days:[x,y],option:pairOption(x,y),label:pairLabel(x,y)};
  }
  function parsePair(value){
    if(Array.isArray(value))return value.length===2?validateBiweekly(value[0],value[1]):{ok:false,message:'Elige los dos días de pago.'};
    const s=String(value==null?'':value).trim().toLowerCase();
    const parts=s.replace(/último día del mes|ultimo dia del mes|fin de mes|last_day/g,'l').split(/\s*(?:_|\by\b|,|\|)\s*/).filter(Boolean);
    if(parts.length!==2)return {ok:false,message:'Elige los dos días de pago.'};
    return validateBiweekly(parts[0]==='l'?LAST:parts[0],parts[1]==='l'?LAST:parts[1]);
  }
  function weekdayIndex(value){
    const s=String(value==null?'':value).trim().toLowerCase();
    const m=s.match(/^weekly_([1-7])$/);if(m)return Number(m[1]);
    const plain=s.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const idx=WEEKDAYS.findIndex(d=>plain.includes(d.normalize('NFD').replace(/[\u0300-\u036f]/g,'')));
    return idx>=0?idx+1:null;
  }
  function weeklyOption(n){return 'weekly_'+n;}
  function weeklyLabel(n){return 'Cada '+WEEKDAYS[(n||1)-1];}
  function weeklyPeriods(termMonths){return Math.max(1,Math.round(Number(termMonths||1)*52/12));}
  function iso(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
  function parseIso(s){const m=String(s||'').slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?new Date(Number(m[1]),Number(m[2])-1,Number(m[3])):null;}
  // Fechas semanales: el primer día elegido que quede al menos 7 días después de la fecha base y luego cada 7 días.
  function weeklyDates(base,weekday,count){
    const d=parseIso(base);if(!d||!(count>0))return [];
    const target=(Number(weekday)||1)%7; // getDay(): 0=domingo
    d.setDate(d.getDate()+7);
    while(d.getDay()!==target)d.setDate(d.getDate()+1);
    const out=[];for(let i=0;i<count;i++){out.push(iso(d));d.setDate(d.getDate()+7);}
    return out;
  }
  function canonical(frequency,value){
    const f=String(frequency||'').toLowerCase();
    if(/seman|^weekly$/.test(f)){const n=weekdayIndex(value);return n?weeklyOption(n):'';}
    if(/quinc|biweekly/.test(f)){const r=parsePair(value);return r.ok?r.option:'';}
    const t=dayToken(Array.isArray(value)?value[0]:value);return t===null?'':String(t);
  }
  function readSettings(storage){
    try{const raw=storage&&storage.getItem(SETTINGS_KEY);const v=raw?JSON.parse(raw):{};return {weekly:!!(v&&v.weekly===true),updatedAt:v&&v.updatedAt||'',updatedBy:v&&v.updatedBy||''};}
    catch(error){return {weekly:false,updatedAt:'',updatedBy:''};}
  }
  function writeSettings(storage,next){
    const value={weekly:next.weekly===true,updatedAt:next.updatedAt||'',updatedBy:next.updatedBy||''};
    storage.setItem(SETTINGS_KEY,JSON.stringify(value));return value;
  }
  const api={LAST,SETTINGS_KEY,WEEKDAYS,MIN_GAP,MAX_GAP,dayToken,validateBiweekly,parsePair,pairLabel,weekdayIndex,weeklyOption,weeklyLabel,weeklyPeriods,weeklyDates,canonical,readSettings,writeSettings};
  root.PulzzoPaymentFrequency=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
