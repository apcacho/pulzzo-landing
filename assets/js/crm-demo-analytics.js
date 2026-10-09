/* Pulzzo CRM DEMO analytics: pure, read-only calculations over a projected snapshot.
 * Calendar periods are UTC. Historical events are scoped to the CURRENT active
 * portfolio; these reports are not historical ownership or approval reports.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PulzzoCRMAnalytics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var STAGES = {
    patient: {new:'Nuevo prospecto',contacted:'Contactado',interested:'Interesado',application_started:'Solicitud en captura',submitted:'Enviado a revisión',no_response:'Sin respuesta',not_interested:'No interesado'},
    doctor: {new:'Nuevo prospecto',contacted_demo:'Contactado / demo',meeting_scheduled:'Reunión agendada',interested:'Interesado',registration_started:'Registro en captura',submitted:'Enviado a revisión',no_response:'Sin respuesta',not_interested:'No interesado'}
  };
  var SOURCES = {unknown:'Desconocido',direct:'Directo',organic:'Orgánico declarado',campaign:'Campaña declarada',kam_referral:'Referido por KAM',doctor_referral:'Referido por médico',manual:'Captura manual',direct_unknown:'Directo / desconocido',referral:'Enlace de referido'};
  var MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var CREATED = ['contact_created','self_service_created'];
  var STARTED = ['onboarding_started','expedient_created','assisted_draft_created','self_service_created'];
  var SUBMITTED = ['holder_submitted','onboarding_submitted','expedient_submitted'];
  var ACTIVITY_TYPES = ['call','whatsapp','email','meeting','note','other'];
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function rows(map) { return map && typeof map === 'object' ? Object.values(map).filter(function(r){return r && typeof r === 'object';}) : []; }
  function stamp(value) { if (value === null || value === undefined || value === '') return NaN; return new Date(value).getTime(); }
  function error(code,message) { var e = new Error(message); e.code = code; throw e; }
  function safeId(value) { return String(value || 'crm-analytics').replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,100); }
  function count(value) { return Number.isFinite(Number(value)) && Number(value) > 0 ? Math.floor(Number(value)) : 0; }
  function numeric(value) { return String(Math.round(Math.max(0,Number(value) || 0)*1000)/1000); }
  function rate(n,d) { return d ? n/d*100 : null; }
  function percent(value) { return value == null ? 'Sin base' : Number(value).toLocaleString('es-MX',{maximumFractionDigits:1})+' %'; }
  function owner(contact) { return contact.assignedKam || 'unassigned'; }
  function periodFor(filter,now) {
    filter = filter || {};
    var date = new Date(now == null ? new Date() : now), instant = date.getTime();
    if (!Number.isFinite(instant)) error('invalid_date','No se pudo determinar la fecha actual.');
    var month = filter.month == null || filter.month === '' ? date.getUTCMonth()+1 : Number(filter.month);
    var year = filter.year == null || filter.year === '' ? date.getUTCFullYear() : Number(filter.year);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 9999) error('invalid_period','Selecciona un mes y año válidos.');
    var start = Date.UTC(year,month-1,1), end = Date.UTC(year,month,1);
    return {month:month,year:year,label:MONTHS[month-1]+' '+year,startAt:new Date(start).toISOString(),endAt:new Date(end).toISOString(),timezone:'UTC',asOf:date.toISOString(),isPartial:instant>=start && instant<end};
  }
  function buildReport(snapshot,filter,options) {
    snapshot = snapshot || {}; filter = filter || {}; options = options || {};
    var now = typeof options.now === 'function' ? options.now() : options.now;
    var period = periodFor(filter,now), nowMs = stamp(period.asOf), startMs = stamp(period.startAt), endMs = stamp(period.endAt);
    var actor = options.actor, type = filter.type || null, kamId = filter.kamId || null;
    if (type && !Object.prototype.hasOwnProperty.call(STAGES,type)) error('invalid_type','Selecciona clientes o proveedores.');
    if (actor && (typeof actor.id !== 'string' || !actor.id || !['admin','kam','holder'].includes(actor.role))) error('invalid_actor','No se pudo verificar la identidad DEMO.');
    if (actor && actor.role === 'kam' && kamId && kamId !== actor.id) error('forbidden','Un KAM sólo puede consultar su cartera DEMO.');
    function inPeriod(value) {var n=stamp(value); return Number.isFinite(n) && n>=startMs && n<endMs && n<=nowMs;}
    function canRead(c) {
      if (!c.id || c.deletedAt || !Object.prototype.hasOwnProperty.call(STAGES,c.type)) return false;
      if (type && c.type !== type || kamId && owner(c) !== kamId) return false;
      if (!actor || actor.role === 'admin') return true;
      if (actor.role === 'kam') return c.assignedKam === actor.id;
      return c.holderId === actor.id && (!c.accountId || c.accountId === actor.id);
    }
    var contacts = rows(snapshot.contacts).filter(canRead), contactMap = new Map(contacts.map(function(c){return [c.id,c];}));
    var events = rows(snapshot.events).filter(function(e){return contactMap.has(e.contactId);});
    var newIds = new Set(), startedIds = new Set(), submittedIds = new Set();
    var expedientMap = new Map(rows(snapshot.expedients).map(function(e){return [e.id,e];}));
    events.forEach(function(event){
      var c = contactMap.get(event.contactId), exp = expedientMap.get(event.expedientId);
      // The immutable creation event and record must describe the same actual creation.
      if (CREATED.includes(event.type) && inPeriod(event.createdAt) && stamp(event.createdAt) === stamp(c.createdAt)) newIds.add(c.id);
      var linked = exp && exp.contactId === c.id && exp.kind === c.type;
      if (STARTED.includes(event.type) && linked && inPeriod(exp.createdAt) && stamp(event.createdAt) === stamp(exp.createdAt)) startedIds.add(c.id);
      if (!SUBMITTED.includes(event.type) || !linked || event.actorRole !== 'holder' || !inPeriod(exp.submittedAt) || stamp(event.createdAt) !== stamp(exp.submittedAt)) return;
      var receipt = exp.submissionSnapshot, holder = exp.holderIdentity;
      // Stage labels, corrections, repeated aliases and unlinked events cannot
      // manufacture conversion. Count each contact once, after exact linkage.
      if (!receipt || receipt.schema !== 'pulzzo.crm.submission.v1' || receipt.contactId !== c.id || receipt.expedientId !== exp.id || receipt.kind !== c.type || stamp(receipt.submittedAt) !== stamp(exp.submittedAt) || !holder || receipt.accountId !== holder.id || event.actorId !== holder.id) return;
      submittedIds.add(c.id);
    });
    // Use immutable activity records, not event aliases. A stage mutation adds
    // an activity record too, but is not commercial outreach and is excluded.
    var seenActivities = new Set(), activities = rows(snapshot.activities).filter(function(a){
      if (!a.id || seenActivities.has(a.id) || !contactMap.has(a.contactId) || !ACTIVITY_TYPES.includes(a.type) || !inPeriod(a.contactAt)) return false;
      seenActivities.add(a.id); return true;
    });
    var currentTasks = rows(snapshot.tasks).filter(function(t){return contactMap.has(t.contactId) && t.status === 'open';});
    var todayEnd = Date.UTC(new Date(nowMs).getUTCFullYear(),new Date(nowMs).getUTCMonth(),new Date(nowMs).getUTCDate()+1);
    function taskBucket(t) {var due=stamp(t.dueAt); return !Number.isFinite(due)?'undated':due<nowMs?'overdue':due<todayEnd?'today':'upcoming';}
    var taskCounts = {overdue:0,today:0,upcoming:0,undated:0};
    currentTasks.forEach(function(t){taskCounts[taskBucket(t)]++;});
    var byStage = {patient:{},doctor:{}}, stageRows = [];
    Object.keys(STAGES).forEach(function(kind){Object.keys(STAGES[kind]).forEach(function(stage){byStage[kind][stage]=0;});});
    contacts.forEach(function(c){var stage=Object.prototype.hasOwnProperty.call(STAGES[c.type],c.stage)?c.stage:'unknown';byStage[c.type][stage]=(byStage[c.type][stage]||0)+1;});
    (type?[type]:Object.keys(STAGES)).forEach(function(kind){Object.keys(byStage[kind]).forEach(function(stage){stageRows.push({key:kind+':'+stage,label:(type?'':kind==='patient'?'Clientes · ':'Proveedores · ')+(STAGES[kind][stage]||'Etapa desconocida'),value:byStage[kind][stage]});});});
    var sources = {};
    contacts.forEach(function(c){if (newIds.has(c.id)) {var source=Object.prototype.hasOwnProperty.call(SOURCES,c.originalSource)?c.originalSource:'unknown';sources[source]=(sources[source]||0)+1;}});
    var originRows = Object.keys(sources).map(function(key){return {key:key,label:SOURCES[key],value:sources[key],share:rate(sources[key],newIds.size)};}).sort(function(a,b){return b.value-a.value || a.label.localeCompare(b.label,'es');});
    var cohortSubmitted = Array.from(submittedIds).filter(function(id){return newIds.has(id);}).length;
    var cohortStarted = Array.from(startedIds).filter(function(id){return newIds.has(id);}).length;
    var kams = new Map();
    contacts.forEach(function(c){var id=owner(c);if(!kams.has(id))kams.set(id,{kamId:id,contacts:0,newContacts:0,activities:0,submitted:0,openTasks:0,overdueTasks:0});var k=kams.get(id);k.contacts++;if(newIds.has(c.id))k.newContacts++;if(submittedIds.has(c.id))k.submitted++;});
    activities.forEach(function(a){kams.get(owner(contactMap.get(a.contactId))).activities++;});
    currentTasks.forEach(function(t){var k=kams.get(owner(contactMap.get(t.contactId)));k.openTasks++;if(taskBucket(t)==='overdue')k.overdueTasks++;});
    var byKam = Array.from(kams.values()).sort(function(a,b){return b.activities-a.activities || b.openTasks-a.openTasks || a.kamId.localeCompare(b.kamId);});
    var actorCounts = new Map();
    activities.forEach(function(a){var id=a.actorId || 'unknown_actor';if(!actorCounts.has(id))actorCounts.set(id,{actorId:id,actorRole:a.actorRole || null,value:0});actorCounts.get(id).value++;});
    var activityByActor = Array.from(actorCounts.values()).sort(function(a,b){return b.value-a.value || a.actorId.localeCompare(b.actorId);});
    return {
      schema:'pulzzo.crm.analytics.v1',demo:true,period:period,scope:{type:type,kamId:actor&&actor.role==='kam'?actor.id:kamId,currentAssignment:true,activeContactsOnly:true},
      counts:{newContacts:newIds.size,patients:contacts.filter(function(c){return c.type==='patient'&&newIds.has(c.id);}).length,doctors:contacts.filter(function(c){return c.type==='doctor'&&newIds.has(c.id);}).length,activities:activities.length,onboardingStarted:startedIds.size,submitted:submittedIds.size,openTasks:currentTasks.length,overdueTasks:taskCounts.overdue,referralContacts:contacts.filter(function(c){return newIds.has(c.id)&&['referral','kam_referral','doctor_referral'].includes(c.originalSource);}).length},
      currentSnapshot:{contacts:contacts.length,openTasks:currentTasks.length},byStage:byStage,stageRows:stageRows,originRows:originRows,byKam:byKam,activityByActor:activityByActor,
      conversion:{numerator:cohortSubmitted,denominator:newIds.size,rate:rate(cohortSubmitted,newIds.size),started:cohortStarted,denominatorLabel:'Prospectos creados en el mes',numeratorLabel:'De esos prospectos, enviados por el titular en el mismo mes'},
      pendingRows:[{key:'overdue',label:'Vencidas a esta hora',value:taskCounts.overdue},{key:'today',label:'Por vencer hoy (UTC)',value:taskCounts.today},{key:'upcoming',label:'Próximas',value:taskCounts.upcoming},{key:'undated',label:'Sin fecha válida',value:taskCounts.undated}].filter(function(r){return r.key!=='undated'||r.value>0;}),
      empty:contacts.length===0,periodEmpty:newIds.size===0&&activities.length===0&&startedIds.size===0&&submittedIds.size===0
    };
  }
  function table(caption,headings,data) {
    return '<details class="analytics-data"><summary>Ver datos de '+esc(caption.toLowerCase())+'</summary><div class="analytics-table-scroll" tabindex="0" role="region" aria-label="'+esc(caption)+'"><table><caption>'+esc(caption)+'</caption><thead><tr>'+headings.map(function(h){return '<th scope="col">'+esc(h)+'</th>';}).join('')+'</tr></thead><tbody>'+data.map(function(row){return '<tr>'+row.map(function(cell,i){return i?'<td>'+esc(cell)+'</td>':'<th scope="row">'+esc(cell)+'</th>';}).join('')+'</tr>';}).join('')+'</tbody></table></div></details>';
  }
  function emptyChart(text) { return '<div class="analytics-empty"><span aria-hidden="true">○</span><p>'+esc(text)+'</p></div>'; }
  function barChart(data,options) {
    options=options||{}; var total=data.reduce(function(n,r){return n+count(r.value);},0), max=Math.max(0,...data.map(function(r){return count(r.value);}));
    if(!total)return emptyChart(options.empty || 'Sin registros para esta selección.');
    var color=options.tone==='navy'?'var(--crm-chart-navy, #07142F)':options.tone==='coral'?'var(--crm-chart-coral, #FF8A5B)':'var(--crm-chart-aqua, #20C7D4)';
    return '<ol class="analytics-bars" aria-label="'+esc(options.label || 'Gráfica de conteos')+'">'+data.map(function(row){
      var v=count(row.value),width=max?v/max*100:0;
      return '<li class="analytics-bar-row"><div class="analytics-bar-label"><span>'+esc(row.label)+'</span><strong>'+v+'</strong></div><svg class="analytics-bar" viewBox="0 0 100 9" preserveAspectRatio="none" height="9" width="100%" aria-hidden="true" focusable="false"><rect x="0" y="0" width="100" height="9" rx="2" fill="var(--crm-chart-track, #EAF0F6)"/><rect x="0" y="0" width="'+numeric(width)+'" height="9" rx="2" fill="'+color+'"/></svg></li>';
    }).join('')+'</ol><p class="analytics-scale">Escala desde 0 hasta '+max+' '+esc(options.unit || 'contactos')+'.</p>';
  }
  function figure(id,title,subtitle,content) {return '<figure class="analytics-card" aria-labelledby="'+id+'"><figcaption><h3 id="'+id+'">'+esc(title)+'</h3><p>'+esc(subtitle)+'</p></figcaption>'+content+'</figure>';}
  function renderDashboard(report,options) {
    options=options||{}; var prefix=safeId(options.idPrefix), labels=options.kamLabels||{}, p=report.period, c=report.counts, cv=report.conversion;
    function labelKam(id) {return id==='unassigned'?'Sin responsable':id==='unknown_actor'?'Usuario sin identificar':Object.prototype.hasOwnProperty.call(labels,id)?labels[id]:id;}
    var periodLabel=p.label+(p.isPartial?' · en curso':'')+' · UTC';
    var metricData=[['Nuevos prospectos',c.newContacts,'Altas únicas del mes'],['Actividades registradas',c.activities,'Por fecha real de contacto'],['Onboardings iniciados',c.onboardingStarted,'Expedientes reales creados'],['Enviados a revisión',c.submitted,'Envíos únicos del titular']];
    var html='<div class="analytics-heading"><p class="analytics-period">'+esc(periodLabel)+'</p><p>Resultados de la cartera activa seleccionada.</p></div><div class="metric-grid analytics-metrics">'+metricData.map(function(m){return '<article class="metric"><span>'+esc(m[0])+'</span><strong>'+count(m[1])+'</strong><small>'+esc(m[2])+'</small></article>';}).join('')+'</div>';
    if(report.empty)html+='<div class="analytics-empty analytics-empty-portfolio"><h3>Aún no hay contactos en esta cartera</h3><p>Los gráficos aparecerán con los registros que crees o recibas. No se incluyen resultados de ejemplo.</p></div>';
    else if(report.periodEmpty)html+='<p class="analytics-period-empty">No hay actividad ni altas registradas en '+esc(p.label)+'. La cartera y los pendientes actuales se muestran por separado.</p>';
    html+='<div class="analytics-grid">';
    html+=figure(prefix+'-stage','Cartera actual por etapa',report.currentSnapshot.contacts+' contactos activos · estado actual',barChart(report.stageRows,{label:'Cartera actual por etapa',empty:'Aún no hay contactos activos.',tone:'aqua'})+table('Cartera actual por etapa',['Etapa','Contactos'],report.stageRows.map(function(r){return [r.label,r.value];})));
    html+=figure(prefix+'-origin','Origen de nuevos prospectos','Altas de '+p.label+' · origen original conservado',barChart(report.originRows,{label:'Origen de nuevos prospectos',empty:'Sin nuevos prospectos en este mes.',tone:'navy'})+(report.originRows.length?table('Origen de nuevos prospectos',['Origen','Contactos','Del total de altas'],report.originRows.map(function(r){return [r.label,r.value,percent(r.share)];})):''));
    var ring='';
    if(cv.denominator){var progress=Math.min(100,Math.max(0,cv.rate));ring='<div class="analytics-conversion-layout"><div class="analytics-donut"><svg viewBox="0 0 120 120" width="144" height="144" role="img" aria-labelledby="'+prefix+'-conversion-svg-title '+prefix+'-conversion-svg-desc"><title id="'+prefix+'-conversion-svg-title">Conversión de altas del mes: '+esc(percent(cv.rate))+'</title><desc id="'+prefix+'-conversion-svg-desc">'+count(cv.numerator)+' de '+count(cv.denominator)+' prospectos nuevos enviados por su titular en el mismo mes.</desc><circle cx="60" cy="60" r="47" fill="none" stroke="var(--crm-chart-track, #EAF0F6)" stroke-width="12"/><circle cx="60" cy="60" r="47" fill="none" stroke="var(--crm-chart-aqua, #20C7D4)" stroke-width="12" pathLength="100" stroke-dasharray="'+numeric(progress)+' '+numeric(100-progress)+'" transform="rotate(-90 60 60)"/></svg><strong class="analytics-donut-value" aria-hidden="true">'+esc(percent(cv.rate))+'</strong></div><div class="analytics-conversion-copy"><p><strong>'+count(cv.numerator)+' de '+count(cv.denominator)+'</strong> prospectos nuevos enviados a revisión</p><ul class="analytics-legend"><li><span class="analytics-legend-dot aqua" aria-hidden="true"></span>'+count(cv.numerator)+' enviados en el mes</li><li><span class="analytics-legend-dot neutral" aria-hidden="true"></span>'+count(cv.denominator-cv.numerator)+' sin envío en el mismo mes</li></ul></div></div>';}else ring=emptyChart('Sin altas en este mes. La conversión no tiene denominador.');
    ring+='<p class="analytics-definition"><strong>Base:</strong> '+esc(cv.denominatorLabel)+'. <strong>Conversión:</strong> '+esc(cv.numeratorLabel)+'. Un cambio manual de etapa no cuenta como envío.</p>'+table('Conversión de altas del mes',['Medida','Valor'],[[cv.denominatorLabel,cv.denominator],[cv.numeratorLabel,cv.numerator],['Tasa de conversión',percent(cv.rate)]]);
    html+=figure(prefix+'-conversion','Conversión de altas del mes','Misma cohorte y mismo mes · no es una tasa de aprobación',ring);
    var actorRows=report.activityByActor.map(function(a){return {key:a.actorId,label:labelKam(a.actorId),value:a.value};});
    html+=figure(prefix+'-activity','Actividad por usuario','Quién registró la actividad · fecha real de contacto',barChart(actorRows,{label:'Actividad por usuario',empty:'Sin actividades de seguimiento en este mes.',tone:'coral',unit:'actividades'})+(actorRows.length?table('Actividad por usuario',['Usuario','Actividades'],actorRows.map(function(r){return [r.label,r.value];})):''));
    html+='</div><div class="analytics-bottom-grid">';
    html+=figure(prefix+'-pending','Pendientes actuales',c.openTasks+' tareas abiertas · todos los meses',barChart(report.pendingRows,{label:'Pendientes actuales',empty:'No hay tareas abiertas en esta cartera.',tone:'coral',unit:'tareas'})+table('Pendientes actuales',['Vencimiento','Tareas'],report.pendingRows.map(function(r){return [r.label,r.value];})));
    var ownership=report.byKam.length?'<div class="analytics-table-scroll" tabindex="0" role="region" aria-label="Cartera por responsable actual"><table class="analytics-kam-table"><caption>Cartera por responsable actual</caption><thead><tr><th scope="col">Responsable</th><th scope="col">Contactos</th><th scope="col">Altas del mes</th><th scope="col">Enviados del mes</th><th scope="col">Pendientes actuales</th><th scope="col">Vencidas</th></tr></thead><tbody>'+report.byKam.map(function(k){return '<tr><th scope="row">'+esc(labelKam(k.kamId))+'</th><td>'+count(k.contacts)+'</td><td>'+count(k.newContacts)+'</td><td>'+count(k.submitted)+'</td><td>'+count(k.openTasks)+'</td><td>'+count(k.overdueTasks)+'</td></tr>';}).join('')+'</tbody></table></div>':emptyChart('Sin responsables con cartera en esta selección.');
    html+=figure(prefix+'-kam','Seguimiento por responsable','Asignación actual de la cartera seleccionada',ownership);
    html+='</div><p class="dashboard-note analytics-method">Período: '+esc(periodLabel)+'. Altas, inicios y envíos se cuentan una vez por contacto con registros vinculados; actividades por su fecha real, sin cambios de etapa. Origen y conversión usan sólo altas del mes. Los envíos del indicador superior pueden incluir contactos de meses anteriores. Etapas, responsables y tareas muestran el estado actual, no un corte histórico. Sólo se incluyen contactos activos y accesibles. Enviado significa enviado a revisión, sin aprobación comercial o clínica.</p>';
    return html;
  }
  return Object.freeze({buildReport:buildReport,renderDashboard:renderDashboard,renderBarChart:barChart,periodFor:periodFor,escapeHtml:esc});
});
