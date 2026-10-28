/* PULZZO v62 · Indicadores comerciales y herramientas operativas del backoffice (demo local).
 * 1) Embudo de solicitudes con puntos de detención · 2) métricas por doctor y por KAM con metas
 * 3) bitácora por expediente · 4) búsqueda global · 5) exportación CSV / Excel.
 * Solo lee los módulos existentes; las escrituras usan addEntityEvent/addAudit/persist y respetan can().
 * No envía correos ni mensajes: la bitácora registra contactos hechos fuera de la demo.
 */
'use strict';
const INSIGHTS_GOALS_KEY='pulzzo.kam.goals.v1';
const INSIGHTS_STALL_DAYS=7;
const INSIGHTS_STEPS=[['solicitud','Solicitud'],['revision','En revisión'],['aprobada','Aprobada'],['aceptada','Aceptada / firmada'],['dispersada','Dispersada']];
const INSIGHTS_APPROVED=['approved_for_offer','offer_sent','offer_accepted','contract_pending_signature','contract_signed','offer_rejected_by_client'];
const INSIGHTS_ACCEPTED=['offer_accepted','contract_pending_signature','contract_signed'];
const INSIGHTS_REJECTED=['rejected','rejected_can_reapply','rejected_blocked','rechazada'];
const INSIGHTS_CHANNELS={call:'Llamada',whatsapp:'WhatsApp',email:'Correo',meeting:'Reunión',note:'Nota'};
const INSIGHTS_KIND_LABELS={call:'Llamada',whatsapp:'WhatsApp',email:'Correo',meeting:'Reunión',note:'Nota',system:'Sistema'};
const INSIGHTS_MONTHS=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
let insightsMetricsTab='doctor';
let insightsActivityFilter='all';

/* ---------- utilidades ---------- */
function insightsEsc(value){return String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function insightsMoney(value){return Number(value||0).toLocaleString('es-MX',{style:'currency',currency:'MXN',minimumFractionDigits:2,maximumFractionDigits:2});}
function insightsCents(value){return Math.round(Number(value||0)*100)/100;}
function insightsToday(){return typeof pulzzoBusinessDateMX==='function'?pulzzoBusinessDateMX():new Date().toISOString().slice(0,10);}
function insightsIsoDay(value){
  if(!value)return '';
  const s=String(value).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  if(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(s)&&typeof pulzzoBusinessDateMX==='function')return pulzzoBusinessDateMX(s);
  const d=typeof dashboardDate==='function'?dashboardDate(s):null;
  return d&&typeof toLocalISODate==='function'?toLocalISODate(d):'';
}
function insightsDMY(value){const iso=insightsIsoDay(value);return iso?iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4):'';}
function insightsStamp(value){
  const s=String(value||'').trim();if(!s)return '';
  if(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(s)){
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(s));
    const g=t=>(parts.find(p=>p.type===t)||{}).value;return `${g('day')}/${g('month')}/${g('year')} ${g('hour')}:${g('minute')}`;
  }
  const day=insightsDMY(s);if(!day)return s;
  const m=s.match(/(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?/i);
  if(!m)return day;
  let h=Number(m[1])%12;if(/p/i.test(m[3]))h+=12;return `${day} ${String(h).padStart(2,'0')}:${m[2]}`;
}
function insightsDaysBetween(from,to){
  const a=insightsIsoDay(from),b=insightsIsoDay(to);if(!a||!b)return null;
  return Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000);
}
function insightsCan(cap){return typeof can==='function'&&can(cap);}
// v71 (aprobado 27/10/2026): Solo lectura no exporta por defecto (solicitudes, cartera, cobranza). Admin otorga «Exportar datos»
// por persona con vencimiento (permiso individual, auditado). Los demás roles conservan su exportación.
function insightsCanExport(){
  if(insightsCan('exportData'))return true;
  const current=typeof staffCurrentSession==='function'?staffCurrentSession():null,roles=current&&Array.isArray(current.roles)?current.roles:[];
  if(roles.includes('admin'))return true;
  return !(roles.length&&roles.every(role=>role==='readonly'));
}
function insightsNorm(value){return typeof normalizeSearchText==='function'?normalizeSearchText(value):String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();}
function insightsPatientName(p){return (p.patient&&p.patient.fullName)||(p.application&&(p.application.patientName||p.application.borrowerName))||p.name||p.id;}
function insightsCode(p){return typeof dispersionApplicationCode==='function'?dispersionApplicationCode(p):(p.code||p.id);}
function insightsProviderName(provider){return typeof providerDisplayName==='function'?providerDisplayName(provider):((provider.profile&&provider.profile.name)||provider.id);}
function insightsStage(p){return typeof currentPatientStage==='function'?currentPatientStage(p):String((p.application||{}).stage||'');}
function insightsStageLabel(p){const s=insightsStage(p);return typeof dashboardStageLabel==='function'?dashboardStageLabel(s):s;}
function insightsDisbursed(p){return typeof portfolioDisbursed==='function'?portfolioDisbursed(p):false;}
function insightsDisbursedDay(p){const a=p.application||{};const rows=Array.isArray(a.providerDispersions)?a.providerDispersions:[];return insightsIsoDay(a.dispersionDate||a.disbursedAt||a.dispersedAt||p.dispersionDate||p.disbursedAt||(rows.find(r=>r&&r.dispersionDate)||{}).dispersionDate);}
function insightsRequested(p){return Number((p.application||{}).requestedAmount||(p.application||{}).amount||0)||0;}
function insightsApprovedAmount(p){return Number((p.offer||{}).approvedAmount||(p.application||{}).approvedAmount||0)||0;}
function insightsDispersedAmount(p){if(typeof portfolioDisbursedAmount==='function'){const v=Number(portfolioDisbursedAmount(p));if(v>0)return v;}const a=p.application||{};return Number(a.amountToDisperse||a.approvedAmount||(p.offer||{}).approvedAmount||0)||0;}
function insightsCreatedDay(p){const d=typeof dashboardEntityDate==='function'?dashboardEntityDate(p):null;return d&&typeof toLocalISODate==='function'?toLocalISODate(d):insightsIsoDay(p.applicationDate);}

/* ---------- 1) embudo ---------- */
function insightsFunnelStep(p){
  const s=insightsStage(p);
  if(insightsDisbursed(p))return 'dispersada';
  if(INSIGHTS_ACCEPTED.includes(s))return 'aceptada';
  if(s==='offer_rejected_by_client')return 'oferta_rechazada';
  if(INSIGHTS_APPROVED.includes(s))return 'aprobada';
  if(INSIGHTS_REJECTED.includes(s))return 'rechazada';
  if(['in_review','correction_pending'].includes(s))return 'revision';
  return 'solicitud';
}
function insightsReached(step){
  return {solicitud:['solicitud','revision','rechazada','aprobada','oferta_rechazada','aceptada','dispersada'],revision:['revision','rechazada','aprobada','oferta_rechazada','aceptada','dispersada'],aprobada:['aprobada','oferta_rechazada','aceptada','dispersada'],aceptada:['aceptada','dispersada'],dispersada:['dispersada']}[step]||[];
}
function insightsLastMovement(p){
  const events=typeof entityHistoryEvents==='function'?entityHistoryEvents(p):(p.timeline||[]);
  let best='';
  for(const e of events){const day=insightsIsoDay(e.createdAt||e.at||e.date);if(day&&day>best)best=day;}
  return best||insightsCreatedDay(p)||'';
}
function insightsFunnel(patients,today){
  patients=patients||[];today=today||insightsToday();
  const info=patients.map(p=>{const step=insightsFunnelStep(p),last=insightsLastMovement(p),days=last?Math.max(insightsDaysBetween(last,today)||0,0):null;return {p,step,last,days};});
  const total=info.length;
  const steps=INSIGHTS_STEPS.map(([key,label],index)=>{
    const reached=info.filter(i=>insightsReached(key).includes(i.step));
    const stalled=key==='dispersada'?[]:info.filter(i=>i.step===key);
    const prev=index?info.filter(i=>insightsReached(INSIGHTS_STEPS[index-1][0]).includes(i.step)).length:total;
    const old=stalled.filter(i=>i.days!=null&&i.days>INSIGHTS_STALL_DAYS);
    const avg=stalled.length?Math.round(stalled.reduce((s,i)=>s+(i.days||0),0)/stalled.length):0;
    return {key,label,count:reached.length,share:total?Math.round(reached.length/total*100):0,conversion:index?(prev?Math.round(reached.length/prev*100):0):100,stalled:stalled.length,stalledOld:old.length,avgDays:avg,amount:insightsCents(reached.reduce((s,i)=>s+(key==='dispersada'?insightsDispersedAmount(i.p):key==='solicitud'||key==='revision'?insightsRequested(i.p):insightsApprovedAmount(i.p)),0))};
  });
  const exits=[{key:'rechazada',label:'No aprobadas por Pulzzo',from:'En revisión',count:info.filter(i=>i.step==='rechazada').length},{key:'oferta_rechazada',label:'Oferta rechazada por cliente',from:'Aprobada',count:info.filter(i=>i.step==='oferta_rechazada').length}];
  const stalledList=info.filter(i=>!['dispersada','rechazada','oferta_rechazada'].includes(i.step)).sort((a,b)=>(b.days||0)-(a.days||0)||String(a.p.id).localeCompare(String(b.p.id)));
  const worst=steps.filter(s=>s.key!=='dispersada').slice().sort((a,b)=>b.stalledOld-a.stalledOld||b.stalled*b.avgDays-a.stalled*a.avgDays||b.stalled-a.stalled)[0];
  return {total,steps,exits,stalledList:stalledList.map(i=>({id:i.p.id,name:insightsPatientName(i.p),code:insightsCode(i.p),step:i.step,stepLabel:(INSIGHTS_STEPS.find(s=>s[0]===i.step)||[])[1]||i.step,stage:insightsStageLabel(i.p),last:i.last,days:i.days})),bottleneck:worst&&worst.stalled?worst:null,thresholdDays:INSIGHTS_STALL_DAYS,today};
}
function insightsFunnelHtml(funnel){
  const max=Math.max(1,...funnel.steps.map(s=>s.count));
  const rows=funnel.steps.map(s=>`<div class="insights-funnel-row" data-funnel-step="${s.key}">
    <div class="insights-funnel-label"><strong>${insightsEsc(s.label)}</strong><span>${s.key==='solicitud'?'Base del periodo':`${s.conversion}% del paso anterior`}</span></div>
    <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${Math.max(4,Math.round(s.count/max*100))}%"></div></div>
    <div class="insights-funnel-value"><strong>${s.count}</strong><span>${s.share}% · ${insightsMoney(s.amount)}</span></div>
    <div class="insights-funnel-stall">${s.key==='dispersada'?'<span class="pill pill-green">Meta final</span>':s.stalled?`<span class="pill ${s.stalledOld?'pill-amber':'pill-aqua'}">${s.stalled} detenida${s.stalled===1?'':'s'}</span><small>${s.avgDays} días prom. sin movimiento${s.stalledOld?` · ${s.stalledOld} con más de ${funnel.thresholdDays} días`:''}</small>`:'<span class="pill pill-gray">Sin detenidas</span>'}</div>
  </div>`).join('');
  const exits=funnel.exits.map(e=>`<span class="insights-exit"><strong>${e.count}</strong> ${insightsEsc(e.label)} <small>(salen en ${insightsEsc(e.from)})</small></span>`).join('');
  const list=funnel.stalledList.slice(0,6).map(r=>`<li><div><strong>${insightsEsc(r.name)}</strong><span>${insightsEsc(r.code)} · ${insightsEsc(r.stepLabel)} · ${insightsEsc(r.stage)}</span></div><div class="insights-stall-days"><strong>${r.days==null?'—':r.days+' días'}</strong><span>Último movimiento ${r.last?insightsDMY(r.last):'sin fecha'}</span></div>${insightsCan('viewPatients')?`<button type="button" class="btn btn-sm btn-secondary" onclick="insightsOpenResult('patient','${insightsEsc(r.id)}')">Ver</button>`:''}</li>`).join('');
  const note=funnel.bottleneck?`Mayor detención: <strong>${insightsEsc(funnel.bottleneck.label)}</strong> con ${funnel.bottleneck.stalled} solicitud${funnel.bottleneck.stalled===1?'':'es'} (${funnel.bottleneck.avgDays} días prom.).`:'No hay solicitudes detenidas en el periodo.';
  return `<section class="dashboard-block insights-block" id="insightsFunnel" aria-labelledby="insightsFunnelTitle">
    <div class="dashboard-block-head"><div><h3 id="insightsFunnelTitle">Embudo de solicitudes</h3><p>Avance acumulado: solicitud → revisión → aprobada → aceptada / firmada → dispersada. ${funnel.total} solicitudes del periodo.</p></div></div>
    <div class="insights-grid-2">
      <section class="chart-card"><div class="chart-card-head"><div><h3>Conversión por paso</h3><p>Conteo, % de la base y monto. Detenidas = siguen en ese paso.</p></div></div><div class="chart-body"><div class="insights-funnel">${rows}</div><div class="insights-exits">${exits}</div></div></section>
      <section class="chart-card"><div class="chart-card-head"><div><h3>Dónde se detienen</h3><p>${note}</p></div></div><div class="chart-body">${list?`<ol class="insights-stall-list">${list}</ol>`:'<div class="chart-empty">Sin solicitudes detenidas.</div>'}<p class="provider-chart-note">Días sin movimiento desde el último evento del historial, al ${insightsDMY(funnel.today)} (Ciudad de México).</p></div></section>
    </div>
  </section>`;
}

/* ---------- 2) métricas por doctor y KAM ---------- */
function insightsStaff(){return (typeof staffAccess!=='undefined'&&staffAccess)||(typeof window!=='undefined'&&window.PulzzoStaffAccess)||null;}
function insightsKamRoster(){try{const s=insightsStaff();return s&&typeof s.listKamRoster==='function'?s.listKamRoster().map(u=>({id:u.id,name:u.name})):[];}catch(e){return [];}}
function insightsKamName(id,roster){if(!id)return 'Sin KAM asignado';const u=(roster||insightsKamRoster()).find(r=>r.id===id);return u?u.name:id;}
function insightsCrmSnapshot(){
  if(typeof window==='undefined'||!window.PulzzoCRMStore)return null;
  if(typeof crmOfficeReader==='function'&&(insightsCan('viewPatients')||insightsCan('viewProviders'))){try{return crmOfficeReader().snapshot();}catch(e){}}
  // Perfil con solo «Consultar desempeño y metas KAM»: únicamente el KAM asignado por contacto enviado.
  if(insightsCan('viewKamPerformance')&&typeof window.PulzzoCRMStore.createKamAttributionReader==='function'){try{const staff=insightsStaff(),reader=window.PulzzoCRMStore.createKamAttributionReader({storage:localStorage,staffSession:typeof session!=='undefined'?session:null,staffAccess:staff}),map=reader.assignments(),contacts={};for(const [id,kam] of Object.entries(map))contacts[id]={assignedKam:kam};return {contacts};}catch(e){}}
  return null;
}
function insightsKamOf(p,snapshot){
  const contacts=snapshot&&snapshot.contacts||{},contact=p.crmIntake&&contacts[p.crmIntake.contactId];
  if(contact&&contact.assignedKam)return {id:contact.assignedKam,source:'crm'};
  const a=p.application||{};if(a.kamId)return {id:String(a.kamId),source:'manual'};
  return {id:'',source:'none'};
}
function insightsDoctorKeys(p){
  const links=typeof providerProcedureLinks==='function'?providerProcedureLinks(p).filter(l=>l.status==='linked'&&l.provider):[];
  const seen=new Map();links.forEach(l=>{if(!seen.has(String(l.providerId)))seen.set(String(l.providerId),{key:'provider:'+l.providerId,label:insightsProviderName(l.provider),linked:true,providerId:String(l.providerId)});});
  if(seen.size)return [...seen.values()];
  const a=p.application||{},name=String(a.doctorName||'').trim(),titled=/^(dr|dra|doctor|doctora)\.?\s/i.test(name);
  let declared=(titled||!a.doctorPrefix?name:[a.doctorPrefix,name].join(' ')).replace(/^(dr|dra)\.?\s+(dr|dra)\.?\s+/i,'$2. ').trim();
  if(!declared||/^(pendiente|sin doctor|n\/a|na)$/i.test(declared))return [{key:'declared:sin-doctor',label:'Sin doctor declarado',linked:false,providerId:''}];
  const bare=insightsNorm(declared).replace(/^(dr|dra|doctor|doctora)\.?\s+/,'').replace(/[^a-z0-9 ]/g,'').trim();
  const same=(db.providers||[]).filter(v=>insightsNorm(insightsProviderName(v)).replace(/^(dr|dra|doctor|doctora)\.?\s+/,'').replace(/[^a-z0-9 ]/g,'').trim()===bare);
  return [{key:'declared:'+bare,label:declared,linked:false,providerId:'',nameMatch:same.length===1?String(same[0].id):''}];
}
function insightsEmptyMetric(key,label){return {key,label,referred:0,approved:0,rejected:0,accepted:0,dispersed:0,requested:0,approvedAmount:0,dispersedAmount:0};}
function insightsAddMetric(m,p){
  const step=insightsFunnelStep(p);
  m.referred++;m.requested+=insightsRequested(p);
  if(insightsReached('aprobada').includes(step)){m.approved++;m.approvedAmount+=insightsApprovedAmount(p);}
  if(step==='rechazada')m.rejected++;
  if(insightsReached('aceptada').includes(step))m.accepted++;
  if(step==='dispersada'){m.dispersed++;m.dispersedAmount+=insightsDispersedAmount(p);}
}
function insightsFinishMetric(m){const decided=m.approved+m.rejected;return Object.assign(m,{decided,approvalRate:decided?Math.round(m.approved/decided*1000)/10:null,requested:insightsCents(m.requested),approvedAmount:insightsCents(m.approvedAmount),dispersedAmount:insightsCents(m.dispersedAmount)});}
function insightsDoctorMetrics(patients){
  const map=new Map();
  (patients||[]).forEach(p=>insightsDoctorKeys(p).forEach(k=>{if(!map.has(k.key))map.set(k.key,Object.assign(insightsEmptyMetric(k.key,k.label),{linked:k.linked,providerId:k.providerId,nameMatch:k.nameMatch||''}));insightsAddMetric(map.get(k.key),p);}));
  return [...map.values()].map(insightsFinishMetric).sort((a,b)=>b.referred-a.referred||b.dispersedAmount-a.dispersedAmount||a.label.localeCompare(b.label,'es'));
}
function insightsMonthKey(day){return String(day||insightsToday()).slice(0,7);}
function insightsMonthLabel(key){const [y,m]=String(key).split('-');return (INSIGHTS_MONTHS[Number(m)-1]||'')+' '+y;}
function insightsReadGoals(){
  try{const raw=typeof localStorage!=='undefined'&&localStorage.getItem(INSIGHTS_GOALS_KEY);if(!raw)return {schema:1,months:{}};const v=JSON.parse(raw);if(!v||typeof v!=='object'||!v.months||typeof v.months!=='object')throw Error('invalid');return v;}
  catch(e){return {schema:1,months:{},invalid:true};}
}
function insightsGoalFor(goals,month,kamId){const g=goals.months&&goals.months[month]&&goals.months[month][kamId];return g?{requests:Number(g.requests)||0,amount:Number(g.amount)||0}:{requests:0,amount:0};}
function insightsSaveGoals(month,entries){
  if(!insightsCan('manageKamGoals')){if(typeof toast==='function')toast('Tu sesión o tus permisos no permiten editar metas KAM.');return false;}
  if(!/^\d{4}-\d{2}$/.test(String(month||'')))return false;
  const goals=insightsReadGoals();if(goals.invalid){if(typeof toast==='function')toast('No se pudieron leer las metas guardadas. No se sobrescribieron.');return false;}
  const roster=insightsKamRoster().map(r=>r.id),clean={};
  for(const [id,g] of Object.entries(entries||{})){
    if(!roster.includes(id))return false;
    const requests=Number(g.requests),amount=Number(g.amount);
    if(!Number.isInteger(requests)||requests<0||requests>100000||!Number.isFinite(amount)||amount<0||amount>1e10){if(typeof toast==='function')toast('Captura metas válidas: solicitudes enteras y monto mayor o igual a $0.00.');return false;}
    clean[id]={requests,amount:insightsCents(amount)};
  }
  goals.months[month]=Object.assign({},goals.months[month]||{},clean);goals.updatedAt=new Date().toISOString();goals.updatedBy=typeof session!=='undefined'&&session?session.email:'';
  localStorage.setItem(INSIGHTS_GOALS_KEY,JSON.stringify(goals));
  if(typeof addAudit==='function')addAudit('Metas KAM actualizadas','KAM',insightsMonthLabel(month)+' · '+Object.entries(clean).map(([id,g])=>insightsKamName(id)+': '+g.requests+' solicitudes / '+insightsMoney(g.amount)).join(' · '));
  return true;
}
function insightsKamMetrics(patients,allPatients,options){
  options=options||{};const snapshot=options.snapshot===undefined?insightsCrmSnapshot():options.snapshot,roster=options.roster||insightsKamRoster(),month=options.month||insightsMonthKey(insightsToday()),goals=options.goals||insightsReadGoals();
  const map=new Map();roster.forEach(r=>map.set(r.id,insightsEmptyMetric(r.id,r.name)));
  (patients||[]).forEach(p=>{const k=insightsKamOf(p,snapshot),id=k.id||'';if(!map.has(id))map.set(id,insightsEmptyMetric(id,insightsKamName(id,roster)));insightsAddMetric(map.get(id),p);});
  const monthRows=new Map();
  (allPatients||patients||[]).forEach(p=>{const id=insightsKamOf(p,snapshot).id||'';if(!monthRows.has(id))monthRows.set(id,{requests:0,amount:0});const r=monthRows.get(id);if(insightsMonthKey(insightsCreatedDay(p))===month)r.requests++;if(insightsDisbursed(p)&&insightsMonthKey(insightsDisbursedDay(p))===month)r.amount+=insightsDispersedAmount(p);});
  return [...map.values()].map(m=>{insightsFinishMetric(m);const goal=m.key?insightsGoalFor(goals,month,m.key):{requests:0,amount:0},done=monthRows.get(m.key)||{requests:0,amount:0};
    return Object.assign(m,{goal,month,monthRequests:done.requests,monthAmount:insightsCents(done.amount),requestProgress:goal.requests?Math.round(done.requests/goal.requests*100):null,amountProgress:goal.amount?Math.round(done.amount/goal.amount*100):null});})
    .sort((a,b)=>(a.key?0:1)-(b.key?0:1)||b.referred-a.referred||a.label.localeCompare(b.label,'es'));
}
function insightsRate(v){return v==null?'Sin base':v.toLocaleString('es-MX',{maximumFractionDigits:1})+'%';}
function insightsProgress(pct,done,goal,money){
  if(pct==null)return '<span class="insights-muted">Sin meta</span>';
  return `<div class="insights-progress" title="${pct}%"><div class="chart-bar-track"><div class="chart-bar-fill" style="width:${Math.min(100,Math.max(2,pct))}%"></div></div><span>${money?insightsMoney(done):done} / ${money?insightsMoney(goal):goal} · ${pct}%</span></div>`;
}
function insightsMetricsHtml(patients,allPatients,options){
  options=options||{};
  const doctor=insightsDoctorMetrics(patients),kam=insightsKamMetrics(patients,allPatients),month=insightsMonthKey(insightsToday());
  const doctorRows=doctor.map(m=>`<tr><td><strong>${insightsEsc(m.label)}</strong>${m.linked?'<small>Vinculado al directorio</small>':m.key==='declared:sin-doctor'?'<small>La solicitud no indica doctor</small>':m.nameMatch?`<small>Nombre declarado · coincide con ${insightsEsc(m.nameMatch)} (sin vínculo por ID)</small>`:'<small>Nombre declarado · sin vínculo de directorio</small>'}</td><td class="insights-num">${m.referred}</td><td class="insights-num">${m.approved}</td><td class="insights-num">${insightsRate(m.approvalRate)}</td><td class="insights-num">${insightsMoney(m.requested)}</td><td class="insights-num">${insightsMoney(m.approvedAmount)}</td><td class="insights-num">${insightsMoney(m.dispersedAmount)}</td><td>${(m.providerId||m.nameMatch)&&insightsCan('viewProviders')?`<button type="button" class="btn btn-sm btn-secondary" onclick="insightsOpenResult('provider','${insightsEsc(m.providerId||m.nameMatch)}')">Ver ficha</button>`:''}</td></tr>`).join('');
  const kamRows=kam.map(m=>`<tr><td><strong>${insightsEsc(m.label)}</strong>${m.key?'':options.panel?'<small>Sin contacto CRM ni asignación manual en el expediente</small>':'<small>Asigna KAM en el resumen del expediente</small>'}</td><td class="insights-num">${m.referred}</td><td class="insights-num">${m.approved}</td><td class="insights-num">${insightsRate(m.approvalRate)}</td><td class="insights-num">${insightsMoney(m.approvedAmount)}</td><td class="insights-num">${insightsMoney(m.dispersedAmount)}</td><td>${m.key?insightsProgress(m.requestProgress,m.monthRequests,m.goal.requests,false):''}</td><td>${m.key?insightsProgress(m.amountProgress,m.monthAmount,m.goal.amount,true):''}</td></tr>`).join('');
  const tab=insightsMetricsTab==='kam'?'kam':'doctor';
  return `<section class="dashboard-block insights-block" id="insightsMetrics" aria-labelledby="insightsMetricsTitle">
    <div class="dashboard-block-head"><div><h3 id="insightsMetricsTitle">${options.panel?'Desempeño y metas KAM':'Desempeño por doctor y KAM'}</h3><p>Pacientes referidos, tasa de aprobación (aprobadas / decididas) y montos ${options.panel?insightsEsc(insightsPanelPeriodText()):'del periodo seleccionado'}.</p></div>
      <div class="insights-actions"><div class="period-tabs" role="tablist" aria-label="Agrupar por"><button type="button" role="tab" class="period-btn ${tab==='doctor'?'active':''}" aria-selected="${tab==='doctor'}" onclick="insightsSetMetricsTab('doctor')">Por doctor / clínica</button><button type="button" role="tab" class="period-btn ${tab==='kam'?'active':''}" aria-selected="${tab==='kam'}" onclick="insightsSetMetricsTab('kam')">Por KAM</button></div>${options.panel?insightsPanelPeriodHtml():''}${tab==='kam'&&insightsCan('manageKamGoals')?`<button type="button" class="btn btn-sm btn-secondary" onclick="insightsOpenGoals(${options.panel?'true':''})">Editar metas</button>`:''}</div></div>
    <div class="table-wrap insights-table-wrap">${tab==='doctor'?`<table class="table insights-table"><thead><tr><th>Doctor / clínica</th><th class="insights-num">Pacientes referidos</th><th class="insights-num">Aprobadas</th><th class="insights-num">Tasa de aprobación</th><th class="insights-num">Monto solicitado</th><th class="insights-num">Monto aprobado</th><th class="insights-num">Monto dispersado</th><th></th></tr></thead><tbody>${doctorRows||'<tr><td colspan="8" class="chart-empty">Sin solicitudes en el periodo.</td></tr>'}</tbody></table>`:`<table class="table insights-table"><thead><tr><th>KAM</th><th class="insights-num">Pacientes referidos</th><th class="insights-num">Aprobadas</th><th class="insights-num">Tasa de aprobación</th><th class="insights-num">Monto aprobado</th><th class="insights-num">Monto dispersado</th><th>Meta de solicitudes · ${insightsEsc(insightsMonthLabel(month))}</th><th>Meta de monto dispersado · ${insightsEsc(insightsMonthLabel(month))}</th></tr></thead><tbody>${kamRows}</tbody></table>`}</div>
    <p class="provider-chart-note">${tab==='doctor'?'Doctor por vínculo de directorio (ID por procedimiento); los nombres declarados sin vínculo se muestran aparte y no se asocian automáticamente.':'KAM tomado del contacto CRM vinculado al expediente o, si no existe, de la asignación manual en el expediente. Las metas son mensuales (Ciudad de México) y solo las edita un perfil con permiso de edición de metas KAM (Admin lo asigna por grupo o cuenta).'}</p>
  </section>`;
}
function insightsSetMetricsTab(tab){insightsMetricsTab=tab==='kam'?'kam':'doctor';if(insightsPanelRender())return;const el=typeof document!=='undefined'&&document.getElementById('insightsMetrics');if(el&&typeof dashboardFilteredPatients==='function'){el.outerHTML=insightsMetricsHtml(dashboardFilteredPatients(),db.patients||[]);}}
function insightsGoalsFormHtml(month,fromPanel){
  const goals=insightsReadGoals(),roster=insightsKamRoster();
  return roster.map(r=>{const g=insightsGoalFor(goals,month,r.id);return `<div class="insights-goal-row" data-kam="${insightsEsc(r.id)}"><strong>${insightsEsc(r.name)}</strong><label class="field"><label>Solicitudes</label><input type="number" min="0" step="1" inputmode="numeric" data-goal="requests" value="${g.requests}"></label><label class="field"><label>Monto dispersado (MXN)</label><input type="text" inputmode="decimal" data-goal="amount" value="${insightsEsc(insightsMoney(g.amount))}"></label></div>`;}).join('')||'<p>No hay KAM activos en el directorio.</p>';
}
function insightsOpenGoals(fromPanel){
  if(!insightsCan('manageKamGoals')){if(typeof toast==='function')toast('Tu sesión o tus permisos no permiten editar metas KAM.');return false;}
  const month=insightsMonthKey(insightsToday()),rows=insightsGoalsFormHtml(month);
  const head=`<div><h3>Metas KAM · ${insightsEsc(insightsMonthLabel(month))}</h3><p>Metas mensuales de solicitudes y monto dispersado. Quedan en el historial operativo con tu usuario.</p></div>`;
  if(fromPanel){const host=insightsPanelHost();if(!host)return false;host.innerHTML=`<div class="dashboard-block insights-block insights-goals-inline" role="form" aria-label="Editar metas KAM"><div class="dashboard-block-head">${head}</div><div id="insightsGoalsForm">${rows}</div><div class="modal-actions"><button class="btn btn-secondary" type="button" onclick="insightsOpenPerformance()">Volver</button><button class="btn btn-primary" type="button" onclick="insightsSubmitGoals('${month}',true)">Guardar metas</button></div></div>`;const first=host.querySelector('input');if(first&&first.focus)first.focus();return true;}
  modal(`<div class="modal-head">${head}<button class="x" type="button" onclick="closeModal()" aria-label="Cerrar">×</button></div><div class="modal-body" id="insightsGoalsForm">${rows}</div><div class="modal-actions"><button class="btn btn-secondary" type="button" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" type="button" onclick="insightsSubmitGoals('${month}',false)">Guardar metas</button></div>`);
  return true;
}

/* ---------- v62.1) panel de desempeño y metas KAM (mínimo privilegio) ---------- */
let insightsPanelPeriod='month';
const INSIGHTS_PANEL_PERIODS=[['month','Mes'],['year','Año'],['all','Todo']];
function insightsPanelPeriodText(){const today=insightsToday();return insightsPanelPeriod==='month'?'de '+insightsMonthLabel(insightsMonthKey(today)):insightsPanelPeriod==='year'?'de '+today.slice(0,4):'de todo el historial';}
function insightsPanelPeriodHtml(){return `<div class="period-tabs" role="tablist" aria-label="Periodo">${INSIGHTS_PANEL_PERIODS.map(([id,label])=>`<button type="button" role="tab" class="period-btn ${insightsPanelPeriod===id?'active':''}" aria-selected="${insightsPanelPeriod===id}" onclick="insightsSetPanelPeriod('${id}')">${label}</button>`).join('')}</div>`;}
function insightsPanelPatients(all,period,today){
  today=today||insightsToday();period=period||insightsPanelPeriod;
  return (all||[]).filter(p=>{if(period==='all')return true;const d=insightsCreatedDay(p);if(!d)return false;return period==='year'?d.slice(0,4)===today.slice(0,4):d.slice(0,7)===today.slice(0,7);});
}
// Perfil que ve el panel aparte: tiene el permiso y no tiene el Dashboard
// (quien sí lo tiene ve el mismo bloque dentro del Dashboard).
function insightsPanelEligible(){return insightsCan('viewKamPerformance')&&!insightsCan('viewDashboard');}
let insightsPanelOpen=false;
function insightsPanelAll(){return typeof db!=='undefined'&&db&&Array.isArray(db.patients)?db.patients:[];}
function insightsPerformanceHtml(){
  if(!insightsCan('viewKamPerformance'))return '';
  const all=insightsPanelAll();
  return `<div id="insightsPerformancePanel">${insightsMetricsHtml(insightsPanelPatients(all),all,{panel:true})}</div><p class="insights-panel-scope">Solo indicadores agregados por KAM y por doctor / clínica · sin expedientes, cartera ni cobranza.</p>`;
}
function insightsPanelHost(){
  if(typeof document==='undefined'||typeof document.getElementById!=='function')return null;
  let host=document.getElementById('insightsPerformanceHost');
  if(!host){const crm=document.getElementById('crm');if(!crm||!crm.parentNode||typeof document.createElement!=='function')return null;host=document.createElement('section');host.id='insightsPerformanceHost';host.className='insights-performance-host';host.setAttribute('aria-label','Desempeño y metas KAM');crm.parentNode.insertBefore(host,crm);}
  return host;
}
function insightsPanelRender(){const el=typeof document!=='undefined'&&typeof document.getElementById==='function'&&document.getElementById('insightsPerformancePanel');if(!el)return false;if(!insightsCan('viewKamPerformance')){insightsClosePerformance();return true;}const all=insightsPanelAll();el.innerHTML=insightsMetricsHtml(insightsPanelPatients(all),all,{panel:true});return true;}
function insightsSetPanelPeriod(period){insightsPanelPeriod=INSIGHTS_PANEL_PERIODS.some(([id])=>id===period)?period:'month';insightsPanelRender();}
function insightsOpenPerformance(){
  if(!insightsCan('viewKamPerformance')){if(typeof toast==='function')toast('Tu sesión o tus permisos no permiten consultar el desempeño KAM.');insightsClosePerformance();return false;}
  const host=insightsPanelHost();if(!host)return false;insightsPanelOpen=true;host.innerHTML=insightsPerformanceHtml();host.hidden=false;insightsRefreshChrome();return true;
}
function insightsClosePerformance(){insightsPanelOpen=false;const host=typeof document!=='undefined'&&typeof document.getElementById==='function'&&document.getElementById('insightsPerformanceHost');if(host&&host.parentNode)host.parentNode.removeChild(host);const btn=typeof document!=='undefined'&&typeof document.getElementById==='function'&&document.getElementById('insightsPerformanceBtn');if(btn){btn.textContent='Desempeño y metas KAM';btn.setAttribute('aria-expanded','false');}return true;}
function insightsTogglePerformance(){return insightsPanelOpen?insightsClosePerformance():insightsOpenPerformance();}
function insightsRefreshChrome(){
  if(typeof document==='undefined'||typeof document.getElementById!=='function')return false;
  const btn=document.getElementById('insightsPerformanceBtn'),search=document.querySelector&&document.querySelector('.insights-search');
  const eligible=insightsPanelEligible()&&(typeof currentView==='undefined'||currentView==='crm');
  if(btn){btn.hidden=!eligible;btn.textContent=insightsPanelOpen&&eligible?'Ocultar desempeño KAM':'Desempeño y metas KAM';btn.setAttribute('aria-expanded',String(!!(insightsPanelOpen&&eligible)));}
  if(!eligible&&(insightsPanelOpen||document.getElementById('insightsPerformanceHost')))insightsClosePerformance();
  if(search)search.hidden=!(insightsCan('viewPatients')||insightsCan('viewProviders')||insightsCan('viewPortfolio'));
  return true;
}
function insightsParseAmount(value){const s=String(value||'').replace(/\s|MXN/gi,'').replace(/^\$/,'');if(!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{0,2})?$/.test(s))return NaN;return Number(s.replace(/,/g,''));}
function insightsSubmitGoals(month,fromPanel){
  const entries={};document.querySelectorAll('#insightsGoalsForm [data-kam]').forEach(row=>{entries[row.dataset.kam]={requests:Number(row.querySelector('[data-goal="requests"]').value),amount:insightsParseAmount(row.querySelector('[data-goal="amount"]').value)};});
  if(!insightsSaveGoals(month,entries)){if(typeof toast==='function')toast('Revisa las metas capturadas.');return false;}
  if(fromPanel){insightsOpenPerformance();}else{closeModal();if(typeof renderDashboard==='function'&&currentView==='dashboard')renderDashboard();}if(typeof toast==='function')toast('Metas KAM guardadas.');return true;
}
function insightsAssignKam(patientId,kamId){
  if(!insightsCan('crmAssign')){if(typeof toast==='function')toast('Tu sesión o tus permisos no permiten asignar KAM.');return false;}
  const p=(db.patients||[]).find(x=>x.id===patientId);if(!p)return false;
  kamId=String(kamId||'');if(kamId&&!insightsKamRoster().some(r=>r.id===kamId))return false;
  const a=p.application||(p.application={}),before=a.kamId||'';if(before===kamId)return true;
  if(kamId)a.kamId=kamId;else delete a.kamId;
  addEntityEvent(p,'KAM responsable actualizado',(before?insightsKamName(before):'Sin KAM')+' → '+(kamId?insightsKamName(kamId):'Sin KAM'));
  return true;
}
function insightsKamCardHtml(p){
  const k=insightsKamOf(p,insightsCrmSnapshot()),roster=insightsKamRoster(),edit=insightsCan('crmAssign')&&k.source!=='crm';
  return `<div class="patient-section-card insights-kam-card" id="insightsKamCard"><h3>KAM responsable</h3><p>${k.source==='crm'?'Asignado desde el contacto CRM vinculado; se cambia en CRM.':k.source==='manual'?'Asignación manual en el expediente.':'Sin KAM asignado. Se usa para las métricas y metas por KAM.'}</p>
    <div class="insights-kam-row"><strong>${insightsEsc(insightsKamName(k.id,roster))}</strong>${edit?`<select id="insightsKamSelect" aria-label="KAM responsable"><option value="">Sin KAM</option>${roster.map(r=>`<option value="${insightsEsc(r.id)}" ${r.id===k.id?'selected':''}>${insightsEsc(r.name)}</option>`).join('')}</select><button type="button" class="btn btn-sm btn-secondary" onclick="if(insightsAssignKam('${insightsEsc(p.id)}',document.getElementById('insightsKamSelect').value)){renderPatientDetail();toast('KAM responsable guardado.');}">Guardar</button>`:''}</div></div>`;
}

/* ---------- 3) bitácora por expediente ---------- */
function insightsKindOf(e){
  const ch=String(e.channel||'').toLowerCase();
  if(INSIGHTS_CHANNELS[ch])return ch;
  if(ch==='llamada')return 'call';if(ch==='correo')return 'email';
  const t=String(e.action||e.title||e.type||'');
  if(/llamada/i.test(t))return 'call';if(/whatsapp/i.test(t))return 'whatsapp';if(/correo|e-?mail/i.test(t))return 'email';if(/reuni[oó]n/i.test(t))return 'meeting';if(/nota/i.test(t))return 'note';
  return 'system';
}
function insightsActivity(p,options){
  options=options||{};const out=[],a=p.application||{},contactAts=new Set();
  (Array.isArray(a.carteraContacts)?a.carteraContacts:[]).forEach(c=>{contactAts.add(c.at);out.push({at:c.at,kind:c.channel==='llamada'?'call':insightsKindOf(c),title:c.channel==='llamada'?'Llamada de cobranza':'Contacto de cobranza',text:c.note||'',user:c.actor||'',source:'Cobranza'});});
  (Array.isArray(a.carteraMessages)?a.carteraMessages:[]).forEach(m=>{contactAts.add(m.at);out.push({at:m.at,kind:m.channel==='correo'?'email':m.channel==='whatsapp'?'whatsapp':insightsKindOf(m),title:m.action||'Mensaje de cobranza',text:m.subject||m.comment||'',user:m.actor||m.user||'Sistema (envío simulado)',source:'Cobranza (simulado)'});});
  const events=typeof entityHistoryEvents==='function'?entityHistoryEvents(p):(p.timeline||[]);
  events.forEach(e=>{if(contactAts.has(e.at)&&!e.user)return;out.push({at:e.activityAt||e.createdAt||e.at||e.date,kind:insightsKindOf(e),title:e.action||e.title||e.type||'Evento',text:e.comment||e.text||e.description||'',user:e.user||'',role:e.role||'',source:'Expediente'});});
  (Array.isArray(p.notes)?p.notes:[]).forEach(n=>{if(n&&typeof n==='object'&&(n.text||n.note))out.push({at:n.createdAt||n.at,kind:'note',title:'Nota',text:n.text||n.note,user:n.user||n.author||'',source:'Notas'});});
  const notes=options.collectionNotes||(typeof portfolioReadNotes==='function'?portfolioReadNotes().notes:[]);
  (notes||[]).filter(n=>n.creditId===p.id).forEach(n=>out.push({at:n.createdAt,kind:'note',title:'Gestión de cobranza',text:[n.note,n.nextAction?'Próxima acción: '+n.nextAction+(n.nextDate?' ('+insightsDMY(n.nextDate)+')':''):''].filter(Boolean).join(' · '),user:n.actor||'',source:'Cobranza'}));
  const snap=options.snapshot===undefined?(p.crmIntake?insightsCrmSnapshot():null):options.snapshot;
  if(snap&&p.crmIntake){Object.values(snap.activities||{}).filter(x=>x&&x.contactId===p.crmIntake.contactId).forEach(x=>out.push({at:x.contactAt||x.createdAt,kind:INSIGHTS_CHANNELS[x.type]?x.type:'note',title:(INSIGHTS_KIND_LABELS[x.type]||'Actividad')+' (CRM)',text:x.summary||x.note||x.notes||'',user:x.actorId||'',source:'CRM'}));}
  const time=v=>{const s=String(v||'');if(/^\d{4}-\d{2}-\d{2}T/.test(s))return Date.parse(s)||0;const stamp=insightsStamp(s).match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}))?$/);if(stamp)return Date.parse(`${stamp[3]}-${stamp[2]}-${stamp[1]}T${stamp[4]||'12'}:${stamp[5]||'00'}:00-06:00`)||0;const d=typeof dashboardDate==='function'?dashboardDate(s):null;return d?d.getTime():0;};
  return out.map(x=>Object.assign(x,{when:insightsStamp(x.at),ts:time(x.at)})).sort((x,y)=>y.ts-x.ts);
}
function insightsRegisterActivity(patientId,input){
  if(!insightsCan('notes')){if(typeof toast==='function')toast('Tu sesión o tus permisos no permiten registrar actividad.');return false;}
  const p=(db.patients||[]).find(x=>x.id===patientId);if(!p)return false;
  input=input||{};const channel=String(input.channel||''),text=String(input.text||'').trim(),date=String(input.date||'');
  if(!INSIGHTS_CHANNELS[channel]){if(typeof toast==='function')toast('Selecciona el tipo de actividad.');return false;}
  if(text.length<3||text.length>1000){if(typeof toast==='function')toast('Describe la actividad (3 a 1,000 caracteres).');return false;}
  if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>insightsToday())){if(typeof toast==='function')toast('La fecha de la actividad no puede ser futura.');return false;}
  const label=INSIGHTS_CHANNELS[channel]+' registrada';
  if(addEntityEvent(p,channel==='note'?'Nota registrada':label,text)===false)return false;
  const ev=p.timeline[0];ev.channel=channel;ev.kind='activity';if(date&&date!==insightsToday())ev.activityAt=date;
  if(typeof persist==='function')persist();
  return true;
}
function insightsActivityHtml(p){
  const items=insightsActivity(p),counts={all:items.length};items.forEach(i=>{const g=i.kind==='whatsapp'||i.kind==='email'?'message':i.kind==='meeting'?'call':i.kind;counts[g]=(counts[g]||0)+1;});
  const filters=[['all','Todo'],['call','Llamadas y reuniones'],['message','Mensajes'],['note','Notas'],['system','Sistema']];
  const group=i=>i.kind==='whatsapp'||i.kind==='email'?'message':i.kind==='meeting'?'call':i.kind;
  const form=insightsCan('notes')?`<div class="insights-activity-form" id="insightsActivityForm"><label class="field"><label>Tipo</label><select id="insightsActivityChannel">${Object.entries(INSIGHTS_CHANNELS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label class="field"><label>Fecha</label><input id="insightsActivityDate" type="date" lang="es-MX" max="${insightsToday()}" value="${insightsToday()}"></label><label class="field insights-activity-text"><label>Detalle</label><textarea id="insightsActivityText" maxlength="1000" rows="2" placeholder="Ej. Llamé al paciente para confirmar la fecha de su procedimiento."></textarea></label><button type="button" class="btn btn-primary" onclick="insightsSubmitActivity('${insightsEsc(p.id)}')">Registrar actividad</button><p class="insights-muted">Solo registra el contacto; esta demo no envía correos ni WhatsApp.</p></div>`:'<p class="insights-muted">Tu perfil puede consultar la bitácora, pero no registrar actividad.</p>';
  const list=items.map(i=>`<li class="insights-activity-item" data-activity-kind="${group(i)}"${insightsActivityFilter!=='all'&&group(i)!==insightsActivityFilter?' hidden':''}><span class="pill ${i.kind==='system'?'pill-gray':i.kind==='note'?'pill-blue':i.kind==='call'||i.kind==='meeting'?'pill-aqua':'pill-coral'}">${insightsEsc(INSIGHTS_KIND_LABELS[i.kind]||'Evento')}</span><div><strong>${insightsEsc(i.title)}</strong>${i.text?`<p>${insightsEsc(i.text)}</p>`:''}<small>${insightsEsc(i.when||'Sin fecha')} · ${insightsEsc(i.user||'Usuario no registrado')}${i.role?' ('+insightsEsc(i.role)+')':''} · ${insightsEsc(i.source)}</small></div></li>`).join('');
  return `<div class="patient-section-card insights-activity" id="insightsActivity"><div class="insights-activity-head"><div><h3>Bitácora del expediente</h3><p>Llamadas, mensajes, notas y eventos del sistema con fecha y usuario. Fechas de Ciudad de México.</p></div></div>
    ${form}
    <div class="period-tabs insights-activity-filters" role="group" aria-label="Filtrar bitácora">${filters.map(([k,l])=>`<button type="button" class="period-btn ${insightsActivityFilter===k?'active':''}" aria-pressed="${insightsActivityFilter===k}" onclick="insightsFilterActivity('${k}')">${l} <span>${counts[k]||0}</span></button>`).join('')}</div>
    ${list?`<ol class="insights-activity-list">${list}</ol>`:'<div class="patient-procedure-ok">Sin actividad registrada.</div>'}</div>`;
}
function insightsFilterActivity(kind){
  insightsActivityFilter=['all','call','message','note','system'].includes(kind)?kind:'all';
  document.querySelectorAll('#insightsActivity .insights-activity-item').forEach(li=>{li.hidden=insightsActivityFilter!=='all'&&li.dataset.activityKind!==insightsActivityFilter;});
  document.querySelectorAll('#insightsActivity .insights-activity-filters .period-btn').forEach(b=>{const on=(b.getAttribute('onclick')||'').includes("'"+insightsActivityFilter+"'");b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
}
function insightsSubmitActivity(patientId){
  const ok=insightsRegisterActivity(patientId,{channel:document.getElementById('insightsActivityChannel').value,date:document.getElementById('insightsActivityDate').value,text:document.getElementById('insightsActivityText').value});
  if(ok){patientTab='historial';renderPatientDetail();if(typeof toast==='function')toast('Actividad registrada en la bitácora.');}
  return ok;
}

/* ---------- 4) búsqueda global ---------- */
function insightsSearch(query,limit){
  limit=limit||6;const raw=String(query||'').trim(),q=insightsNorm(raw),digits=raw.replace(/\D/g,''),compact=q.replace(/[\s-]+/g,'');
  const out={patients:[],providers:[],credits:[],total:0};if(q.length<2)return out;
  const phoneLike=/^[+\d\s().-]+$/.test(raw)&&digits.length>=4;
  const hit=(texts,ids,phones)=>texts.some(t=>insightsNorm(t).includes(q))||(compact.length>=3&&ids.some(t=>insightsNorm(t).replace(/[\s-]+/g,'').includes(compact)))||(phoneLike&&phones.some(t=>String(t||'').replace(/\D/g,'').includes(digits)));
  if(insightsCan('viewPatients'))(db.patients||[]).forEach(p=>{const pt=p.patient||{},a=p.application||{};if(hit([insightsPatientName(p),pt.email,a.doctorName,a.procedure],[p.id,insightsCode(p),pt.curp,pt.rfc,a.applicationId],[pt.phone]))out.patients.push({kind:'patient',id:p.id,title:insightsPatientName(p),meta:`${insightsCode(p)} · ${insightsStageLabel(p)}${a.doctorName?' · '+a.doctorName:''}`});});
  if(insightsCan('viewProviders'))(db.providers||[]).forEach(v=>{const pr=v.profile||{},c=v.contact||{};if(hit([insightsProviderName(v),pr.name,pr.email,pr.city,pr.state],[v.id],[c.registered,c.officePhone,c.officeWhats]))out.providers.push({kind:'provider',id:v.id,title:insightsProviderName(v),meta:[pr.accountType||'Médico / clínica',pr.city,pr.state].filter(Boolean).join(' · ')});});
  if(insightsCan('viewPortfolio'))(db.patients||[]).filter(insightsDisbursed).forEach(p=>{const pt=p.patient||{};if(hit([insightsPatientName(p),pt.email],[p.id,insightsCode(p),pt.curp,pt.rfc],[pt.phone]))out.credits.push({kind:'credit',id:p.id,title:`Crédito ${insightsCode(p)}`,meta:`${insightsPatientName(p)} · Dispersado ${insightsDMY(insightsDisbursedDay(p))||'sin fecha'} · ${insightsMoney(insightsDispersedAmount(p))}`});});
  out.total=out.patients.length+out.providers.length+out.credits.length;
  out.patients=out.patients.slice(0,limit);out.providers=out.providers.slice(0,limit);out.credits=out.credits.slice(0,limit);
  return out;
}
function insightsOpenResult(kind,id){
  if(typeof insightsCloseSearch==='function')insightsCloseSearch();
  if(kind==='patient'){if(!insightsCan('viewPatients'))return false;if(typeof closeModal==='function')closeModal();selectedPatientId=id;setView('patients');patientRequestMode='detail';patientTab='resumen';renderPatients();return true;}
  if(kind==='provider'){if(!insightsCan('viewProviders'))return false;if(typeof closeModal==='function')closeModal();openProviderProfile(id);return true;}
  if(kind==='credit'){if(!insightsCan('viewPortfolio'))return false;if(typeof closeModal==='function')closeModal();return portfolioOpenCredit(id,'detail');}
  return false;
}
function insightsSearchResultsHtml(result,query){
  const groups=[['patients','Pacientes y solicitudes'],['providers','Doctores y clínicas'],['credits','Créditos']].filter(([k])=>result[k].length);
  if(!groups.length)return `<p class="insights-search-empty">Sin resultados para “${insightsEsc(query)}”.</p>`;
  return groups.map(([k,l])=>`<div class="insights-search-group"><p>${l}</p>${result[k].map(r=>`<button type="button" role="option" class="insights-search-item" data-kind="${r.kind}" data-id="${insightsEsc(r.id)}"><strong>${insightsEsc(r.title)}</strong><span>${insightsEsc(r.meta)}</span></button>`).join('')}</div>`).join('');
}
function insightsCloseSearch(){const box=typeof document!=='undefined'&&document.getElementById('insightsSearchResults');if(box&&box.hidden!==undefined){box.hidden=true;const input=document.getElementById('insightsSearch');if(input&&input.setAttribute)input.setAttribute('aria-expanded','false');}}
function insightsMountSearch(){
  if(typeof document==='undefined'||typeof document.querySelector!=='function')return false;
  const actions=document.querySelector('.topbar .top-actions');if(!actions||typeof actions.insertAdjacentHTML!=='function'||document.getElementById('insightsSearch'))return false;
  actions.insertAdjacentHTML('afterbegin',`<div class="insights-search" role="search"><label class="insights-sr" for="insightsSearch">Búsqueda global</label><input id="insightsSearch" type="search" autocomplete="off" placeholder="Buscar paciente, doctor o crédito" aria-controls="insightsSearchResults" aria-expanded="false" maxlength="120"><div id="insightsSearchResults" class="insights-search-results" role="listbox" aria-label="Resultados de búsqueda" hidden></div></div><button type="button" id="insightsPerformanceBtn" class="btn btn-sm btn-secondary insights-performance-btn" onclick="insightsTogglePerformance()" aria-controls="insightsPerformanceHost" aria-expanded="false" hidden>Desempeño y metas KAM</button>`);
  const input=document.getElementById('insightsSearch'),box=document.getElementById('insightsSearchResults');
  const paint=()=>{const q=input.value.trim();if(q.length<2){insightsCloseSearch();return;}box.innerHTML=insightsSearchResultsHtml(insightsSearch(q),q);box.hidden=false;input.setAttribute('aria-expanded','true');};
  input.addEventListener('input',paint);input.addEventListener('focus',()=>{if(input.value.trim().length>=2)paint();});
  input.addEventListener('keydown',e=>{const items=[...box.querySelectorAll('.insights-search-item')],i=items.indexOf(document.activeElement);
    if(e.key==='Escape'){insightsCloseSearch();input.blur();}
    else if(e.key==='ArrowDown'&&items.length){e.preventDefault();items[0].focus();}
    else if(e.key==='Enter'&&items.length){e.preventDefault();insightsOpenResult(items[0].dataset.kind,items[0].dataset.id);input.value='';}});
  box.addEventListener('keydown',e=>{const items=[...box.querySelectorAll('.insights-search-item')],i=items.indexOf(document.activeElement);if(e.key==='ArrowDown'&&i<items.length-1){e.preventDefault();items[i+1].focus();}else if(e.key==='ArrowUp'){e.preventDefault();(i>0?items[i-1]:input).focus();}else if(e.key==='Escape'){insightsCloseSearch();input.focus();}});
  box.addEventListener('click',e=>{const b=e.target.closest('.insights-search-item');if(b){insightsOpenResult(b.dataset.kind,b.dataset.id);input.value='';}});
  document.addEventListener('click',e=>{if(!e.target.closest||!e.target.closest('.insights-search'))insightsCloseSearch();});
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&String(e.key).toLowerCase()==='k'&&document.getElementById('appView')&&!document.getElementById('appView').classList.contains('hidden')){e.preventDefault();input.focus();input.select();}});
  return true;
}

/* ---------- 5) exportación CSV / Excel ---------- */
function insightsCsvCell(value){
  let s=String(value==null?'':value);
  if(/^[=+@\t\r]/.test(s)||/^-[^\d$]/.test(s))s="'"+s;
  return /[",\r\n;]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
function insightsFormatCell(value,type){if(value==null||value==='')return '';if(type==='money')return insightsMoney(value);if(type==='date')return insightsDMY(value);return String(value);}
function insightsCsv(dataset){return '\ufeff'+[dataset.columns.map(c=>c[0]),...dataset.rows.map(r=>r.map((v,i)=>insightsFormatCell(v,dataset.columns[i][1])))].map(r=>r.map(insightsCsvCell).join(',')).join('\r\n')+'\r\n';}
function insightsSolicitudesDataset(rows){
  const snap=insightsCrmSnapshot(),roster=insightsKamRoster(),today=insightsToday();
  rows=rows||(typeof getFilteredPatientApplications==='function'?getFilteredPatientApplications():db.patients||[]);
  return {name:'solicitudes',title:'Solicitudes',columns:[['Folio','text'],['Fecha de solicitud','date'],['Paciente','text'],['Correo','text'],['Teléfono','text'],['Doctor / clínica','text'],['Procedimiento','text'],['Monto solicitado','money'],['Monto aprobado','money'],['Etapa','text'],['Paso del embudo','text'],['Días sin movimiento','int'],['KAM','text']],
    rows:rows.map(p=>{const a=p.application||{},pt=p.patient||{},step=insightsFunnelStep(p),last=insightsLastMovement(p),k=insightsKamOf(p,snap);return [insightsCode(p),insightsCreatedDay(p),insightsPatientName(p),pt.email||'',pt.phone?(typeof pzPhone==='function'?pzPhone(pt.phone):pt.phone):'',insightsDoctorKeys(p).map(d=>d.label).join(' / '),Array.isArray(a.procedures)&&a.procedures.length?a.procedures.map(x=>typeof x==='object'?(x.procedure||x.name||''):x).join(' / '):(a.procedure||''),insightsRequested(p),insightsReached('aprobada').includes(step)?insightsApprovedAmount(p):'',insightsStageLabel(p),({solicitud:'Solicitud',revision:'En revisión',aprobada:'Aprobada',aceptada:'Aceptada / firmada',dispersada:'Dispersada',rechazada:'No aprobada',oferta_rechazada:'Oferta rechazada'})[step],last?Math.max(insightsDaysBetween(last,today)||0,0):'',k.id?insightsKamName(k.id,roster):'Sin KAM'];})};
}
function insightsCarteraDataset(credits){
  credits=credits||(typeof portfolioCredits==='function'?portfolioCredits().filter(typeof portfolioCreditMatches==='function'?portfolioCreditMatches:()=>true):[]);
  return {name:'cartera',title:'Cartera',columns:[['Folio','text'],['Cliente','text'],['Estado','text'],['Fecha de dispersión','date'],['Monto dispersado','money'],['Capital pendiente','money'],['Vencido','money'],['Próxima cuota','date'],['Monto próxima cuota','money'],['Días de atraso','int'],['Proveedor','text'],['Plazo','text'],['Fin del plazo','date']],
    rows:credits.map(c=>[c.code,c.name,c.settled?'Liquidado':c.overdue?'En mora':'Activo',insightsDisbursedDay(c.record),insightsDispersedAmount(c.record),c.outstanding,c.overdue,c.next?c.next.date:'',c.next?c.next.pending:'',typeof portfolioCreditDpd==='function'?portfolioCreditDpd(c):0,(c.terms&&c.terms.provider)||'',insightsPlazoExtendido(c.record)?'Plazo extendido':'Original',insightsPlazoFin(c)])};
}
// v65: el plazo extendido (cuota nueva al final) se exporta con el nuevo fin del plazo.
function insightsPlazoExtendido(p){const m=p&&p.application&&p.application.plazoExtendido;return m&&m.newEnd?m:null;}
function insightsPlazoFin(c){const m=insightsPlazoExtendido(c.record);if(m)return m.newEnd;const rows=Array.isArray(c.installments)?c.installments:[];return rows.reduce((max,row)=>{const d=String(row&&(row.currentDueDate||row.dueDate||row.date)||'');return d>max?d:max;},'');
}
// v66 (D-13): dos fechas separadas: «Vencida más antigua» (vacía si no hay) y «Próximo vencimiento» (la misma que muestra la pantalla de Cobranza).
function insightsCobranzaDataset(model){
  model=model||(typeof carteraCollectionModel==='function'?carteraCollectionModel():{listed:[]});
  const notes=typeof portfolioReadNotes==='function'?portfolioReadNotes().notes:[];
  const listed=(model.listed||[]).filter(c=>c&&!c.settled);
  return {name:'cobranza',title:'Cobranza',columns:[['Folio','text'],['Cliente','text'],['Teléfono','text'],['Etapa de cobranza','text'],['Días de atraso','int'],['Monto exigible','money'],['Saldo','money'],['Vencida más antigua','date'],['Próximo vencimiento','date'],['Última gestión','date'],['Detalle de la última gestión','text'],['Usuario','text']],
    rows:listed.map(c=>{const facts=typeof carteraCreditFacts==='function'?carteraCreditFacts(c):{dpd:0,amount:c.overdue,balance:c.outstanding,due:''},stage=typeof carteraCollectionStage==='function'?carteraCollectionStage(c):null,last=insightsActivity(c.record,{collectionNotes:notes,snapshot:null}).find(x=>x.kind!=='system');const pt=c.record.patient||{};
      return [c.code,c.name,pt.phone?(typeof pzPhone==='function'?pzPhone(pt.phone):pt.phone):'',stage?(typeof carteraStageShort==='function'?carteraStageShort(stage):stage.label):'',facts.dpd||0,facts.amount,facts.balance,facts.oldest&&facts.oldest.date||'',facts.next&&facts.next.date||'',last?insightsIsoDay(last.at):'',last?[last.title,last.text].filter(Boolean).join(': '):'Sin gestión registrada',last?last.user:''];})};
}
function insightsDatasetFor(kind){
  if(!insightsCanExport())return null;
  if(kind==='solicitudes'){if(!insightsCan('viewPatients'))return null;return insightsSolicitudesDataset();}
  if(kind==='cartera'){if(!insightsCan('viewPortfolio'))return null;return insightsCarteraDataset();}
  if(kind==='cobranza'){if(!insightsCan('viewPortfolio')||!insightsCan('manageCollections'))return null;return insightsCobranzaDataset();}
  return null;
}
/* XLSX mínimo (Office Open XML, sin compresión) generado en el navegador. */
const INSIGHTS_CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function insightsCrc32(bytes){let c=0xFFFFFFFF;for(let i=0;i<bytes.length;i++)c=INSIGHTS_CRC[(c^bytes[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function insightsZip(files){
  const enc=new TextEncoder(),chunks=[],central=[];let offset=0;
  const u16=v=>[v&255,(v>>>8)&255],u32=v=>[v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255];
  for(const f of files){const name=enc.encode(f.name),data=enc.encode(f.data),crc=insightsCrc32(data);
    const head=[...u32(0x04034b50),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0)];
    chunks.push(Uint8Array.from(head),name,data);
    central.push(Uint8Array.from([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset)]),name);
    offset+=head.length+name.length+data.length;}
  const size=central.reduce((s,c)=>s+c.length,0),end=Uint8Array.from([...u32(0x06054b50),...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(size),...u32(offset),...u16(0)]);
  const all=[...chunks,...central,end],out=new Uint8Array(all.reduce((s,c)=>s+c.length,0));let p=0;for(const c of all){out.set(c,p);p+=c.length;}return out;
}
function insightsXml(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');}
function insightsColName(i){let s='';i++;while(i){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}return s;}
function insightsXlsx(dataset){
  const serial=iso=>Math.round((Date.parse(iso+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000);
  const cell=(v,type,ref)=>{if(v==null||v==='')return '';if(type==='money'&&Number.isFinite(Number(v)))return `<c r="${ref}" s="2"><v>${insightsCents(v)}</v></c>`;if(type==='int'&&Number.isFinite(Number(v)))return `<c r="${ref}"><v>${Number(v)}</v></c>`;if(type==='date'){const iso=insightsIsoDay(v);if(iso)return `<c r="${ref}" s="3"><v>${serial(iso)}</v></c>`;}return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${insightsXml(v)}</t></is></c>`;};
  const head=`<row r="1">${dataset.columns.map((c,i)=>`<c r="${insightsColName(i)}1" s="1" t="inlineStr"><is><t>${insightsXml(c[0])}</t></is></c>`).join('')}</row>`;
  const body=dataset.rows.map((r,ri)=>`<row r="${ri+2}">${r.map((v,i)=>cell(v,dataset.columns[i][1],insightsColName(i)+(ri+2))).join('')}</row>`).join('');
  const cols=`<cols>${dataset.columns.map((c,i)=>`<col min="${i+1}" max="${i+1}" width="${c[1]==='money'?16:c[1]==='date'?13:Math.min(40,Math.max(12,c[0].length+4))}" customWidth="1"/>`).join('')}</cols>`;
  const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${head}${body}</sheetData><autoFilter ref="A1:${insightsColName(dataset.columns.length-1)}${dataset.rows.length+1}"/></worksheet>`;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF07142F"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8FAFB"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return insightsZip([
    {name:'[Content_Types].xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'},
    {name:'_rels/.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
    {name:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${insightsXml(dataset.title).slice(0,31)}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${insightsXml(dataset.title).slice(0,31)}'!$A$1:$${insightsColName(dataset.columns.length-1)}$${dataset.rows.length+1}</definedName></definedNames></workbook>`},
    {name:'xl/_rels/workbook.xml.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'},
    {name:'xl/styles.xml',data:styles},
    {name:'xl/worksheets/sheet1.xml',data:sheet}
  ]);
}
function insightsExportFile(kind,format){
  const dataset=insightsDatasetFor(kind);
  if(!dataset){if(typeof toast==='function')toast('Tu sesión o tus permisos no permiten exportar esta información.');return null;}
  const stamp=insightsToday().replace(/-/g,''),xlsx=format==='xlsx';
  return {dataset,fileName:`pulzzo-${dataset.name}-${stamp}.${xlsx?'xlsx':'csv'}`,mime:xlsx?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/csv;charset=utf-8',content:xlsx?insightsXlsx(dataset):insightsCsv(dataset)};
}
function insightsExport(kind,format){
  const file=insightsExportFile(kind,format);if(!file)return false;
  if(typeof addAudit==='function')addAudit('Exportación de '+file.dataset.title.toLowerCase(),file.fileName,file.dataset.rows.length+' registros · '+(format==='xlsx'?'Excel':'CSV'));
  try{const url=URL.createObjectURL(new Blob([file.content],{type:file.mime})),a=document.createElement('a');a.href=url;a.download=file.fileName;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  catch(e){if(typeof toast==='function')toast('No se pudo preparar la descarga en este navegador.');return false;}
  if(typeof toast==='function')toast(`${file.dataset.title}: ${file.dataset.rows.length} registros exportados (${format==='xlsx'?'Excel':'CSV'}). Datos ficticios de demo.`);
  return true;
}
function insightsExportBarHtml(kind,label){
  return `<div class="insights-export" data-export="${kind}"><span>${insightsEsc(label)}</span><button type="button" class="btn btn-sm btn-secondary" onclick="insightsExport('${kind}','csv')">Exportar CSV</button><button type="button" class="btn btn-sm btn-secondary" onclick="insightsExport('${kind}','xlsx')">Exportar Excel</button></div>`;
}

/* ---------- montaje sobre las vistas existentes ---------- */
function insightsInstall(){
  if(typeof window==='undefined'||window.__pulzzoInsightsInstalled)return false;window.__pulzzoInsightsInstalled=true;
  if(typeof renderDashboard==='function'){const original=renderDashboard;renderDashboard=function(){const result=original.apply(this,arguments);try{const host=document.getElementById('dashboard');if(host&&result!==false&&typeof host.querySelector==='function'){const view=dashboardFilters.view||'general',patients=dashboardFilteredPatients(),anchor=host.querySelector('.dashboard-charts')||host.querySelector('.dashboard-block');const html=(insightsCan('viewPatients')&&(view==='general'||view==='patients')?insightsFunnelHtml(insightsFunnel(patients)):'')+((insightsCan('viewPatients')||insightsCan('viewKamPerformance'))&&view!=='operation'?insightsMetricsHtml(patients,db.patients||[]):'');if(anchor&&html)anchor.insertAdjacentHTML('afterend',html);}}catch(e){console.error(e);}return result;};}
  if(typeof renderHistoryTab==='function'){renderHistoryTab=function(p){return insightsActivityHtml(p);};}
  if(typeof renderSummaryProfileTab==='function'){const original=renderSummaryProfileTab;renderSummaryProfileTab=function(p){const html=original.apply(this,arguments);try{return html+insightsKamCardHtml(p);}catch(e){return html;}};}
  if(typeof renderPatients==='function'){const original=renderPatients;renderPatients=function(){const result=original.apply(this,arguments);try{if(patientRequestMode!=='detail'&&insightsCan('viewPatients')&&insightsCanExport()){const head=document.querySelector('#patients .patient-request-list-head');if(head&&!head.querySelector('.insights-export'))head.insertAdjacentHTML('beforeend',insightsExportBarHtml('solicitudes','Solicitudes filtradas'));}}catch(e){console.error(e);}return result;};}
  if(typeof renderPortfolioBody==='function'){const original=renderPortfolioBody;renderPortfolioBody=function(){const result=original.apply(this,arguments);try{const tab=portfolioState.tab,target=document.getElementById('portfolioContent');if(target){const bar=!insightsCanExport()?'':tab==='credits'&&insightsCan('viewPortfolio')?insightsExportBarHtml('cartera','Cartera filtrada'):tab==='collections'&&insightsCan('viewPortfolio')&&insightsCan('manageCollections')?insightsExportBarHtml('cobranza','Cobranza filtrada'):'';if(bar&&!target.querySelector('.insights-export'))target.insertAdjacentHTML('afterbegin',bar);}}catch(e){console.error(e);}return result;};}
  if(typeof setView==='function'){const original=setView;setView=function(){const result=original.apply(this,arguments);try{insightsRefreshChrome();}catch(e){}return result;};}
  const mount=()=>{insightsMountSearch();insightsRefreshChrome();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
  window.addEventListener('pulzzo:office-ready',mount);
  return true;
}
const PulzzoInsights=Object.freeze({funnel:insightsFunnel,funnelStep:insightsFunnelStep,doctorMetrics:insightsDoctorMetrics,kamMetrics:insightsKamMetrics,saveGoals:insightsSaveGoals,readGoals:insightsReadGoals,assignKam:insightsAssignKam,activity:insightsActivity,registerActivity:insightsRegisterActivity,search:insightsSearch,openPerformance:insightsOpenPerformance,closePerformance:insightsClosePerformance,performanceHtml:insightsPerformanceHtml,panelPatients:insightsPanelPatients,panelEligible:insightsPanelEligible,csv:insightsCsv,xlsx:insightsXlsx,exportFile:insightsExportFile,datasets:{solicitudes:insightsSolicitudesDataset,cartera:insightsCarteraDataset,cobranza:insightsCobranzaDataset},stamp:insightsStamp,dmy:insightsDMY});
if(typeof window!=='undefined'){window.PulzzoInsights=PulzzoInsights;if(typeof document!=='undefined'&&document.readyState)insightsInstall();}
