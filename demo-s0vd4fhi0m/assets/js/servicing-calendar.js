/* Shared read-only calendar renderer. No calculation or persistence. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PulzzoServicingCalendar=api;})(typeof window!=='undefined'?window:null,function(){
'use strict';
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PulzzoPatientDemo={money:value=>Number(value).toLocaleString('es-MX',{style:'currency',currency:'MXN',minimumFractionDigits:2,maximumFractionDigits:2})};
function servicingMoney(value){return typeof value==='number' && Number.isFinite(value)?PulzzoPatientDemo.money(value):'Pendiente de confirmar';}
function servicingDate(value){
  const date=String(value||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return 'Fecha pendiente';
  return date.slice(8,10)+'/'+date.slice(5,7)+'/'+date.slice(0,4);
}
function renderServicingPending(){return '<div class="post-note" role="status"><b>Calendario pendiente de recibir de administración.</b><br>Cuando esté disponible, usa “Recibir calendario y saldo de administración”. Solo se mostrarán las fechas, saldos y pagos registrados de esta solicitud; no se calcula un calendario ilustrativo.</div>';}
function renderServicingSummary(projection){
  const summary=projection.summary||{}, initial=projection.initialPayments||{}, fee=summary.openingFee||{};
  const upfront=fee.mode==='upfront'?`<div class="post-note"><b>Comisión de apertura al inicio (cobro separado):</b> ${escapeHtml(servicingMoney(fee.due))} · Pagado: ${escapeHtml(servicingMoney(fee.paid))} · Pendiente: ${escapeHtml(servicingMoney(fee.pending))}<br>No forma parte de los pagos iniciales del calendario.</div>`:fee.mode==='financed'?'<div class="post-note">La comisión de apertura está financiada dentro del capital del crédito; no hay cobro inicial separado.</div>':'';
  const calendar=summary.calendarStatus==='preliminary'?'<div class="post-note">Calendario preliminar recibido de administración; pendiente de dispersión.</div>':summary.calendarStatus==='blocked'?'<div class="post-note">Calendario bloqueado: la administración aún no tiene mensualidades disponibles.</div>':'';
  // v65: cuota nueva al final por extensión de la última cuota (dato recibido; no se calcula aquí).
  const rowsIn=Array.isArray(projection.rows)?projection.rows:[],extended=rowsIn.filter(row=>/Plazo extendido/.test(String(row.type||'')));
  const newEnd=extended.length?extended.reduce((max,row)=>{const d=String(row.currentDueDate||row.dueDate||'');return d>max?d:max;},''):'';
  const plazo=newEnd?`<div class="post-note" data-plazo-extendido><b>Plazo extendido:</b> nuevo fin del plazo ${escapeHtml(servicingDate(newEnd))}. Se agregó una cuota al final por la extensión de la última cuota.</div>`:'';
  const next=summary.settled?'Crédito liquidado':summary.nextDueDate?servicingMoney(summary.nextPaymentAmount)+' · '+servicingDate(summary.nextDueDate):'Sin próximo pago registrado';
  return `<div class="post-note" data-servicing-summary><b>${summary.settled?'Estatus:':'Próximo vencimiento pendiente:'}</b> ${escapeHtml(next)}<br><b>Saldo de capital:</b> ${escapeHtml(servicingMoney(summary.outstanding))} · <b>Monto vencido:</b> ${escapeHtml(servicingMoney(summary.overdue))}<br><small>Consulta de solo lectura · Crédito ${escapeHtml(projection.creditFolio||(/^APP-PUL-\d+$/.test(projection.creditId)?projection.creditId:'Folio pendiente de actualizar'))} · ${projection.demoCutDate?'Corte financiero demo: '+escapeHtml(servicingDate(projection.demoCutDate)):'Actualizado: '+escapeHtml(servicingDate(String(projection.calculatedAt||'').slice(0,10)))}</small></div>${Number(initial.required)>0?`<div class="post-note"><b>Pagos iniciales requeridos:</b> ${escapeHtml(String(initial.covered))} de ${escapeHtml(String(initial.required))} cubiertos · Pendiente: ${escapeHtml(servicingMoney(initial.pendingAmount))}<br>Son pagos iniciales del crédito. La comisión de apertura al inicio, cuando aplica, es un cobro separado.</div>`:''}${plazo}${upfront}${calendar}`;
}
function render(projection){
  const rows=projection.rows.map(row=>{
    const moneyKeys=['totalPayment','paidAmount','pendingAmount','capital','interest','interestIva','moratory','moratoryIva','commission','capitalPending'];
    const cells=moneyKeys.map(key=>`<td>${escapeHtml(servicingMoney(row[key]))}</td>`).join('');
    const statusClass=['Pagado','Pagado anticipado','Liquidado anticipadamente'].includes(row.status)?'ready':row.status==='Vencido'?'locked':'active';
    const extension=row.extensionStatus?`<br><small>Prórroga: ${escapeHtml(row.extensionStatus)}${row.extendedDueDate?' · '+escapeHtml(servicingDate(row.extendedDueDate)):''}</small>`:'';
    return `<tr><td>${escapeHtml(String(row.number??''))}</td><td>${escapeHtml(row.type||'Pago')}${row.paymentFrequency?`<br><small>${escapeHtml(({monthly:'Mensual',biweekly:'Quincenal',weekly:'Semanal'})[row.paymentFrequency]||row.paymentFrequency)}</small>`:''}</td><td>${escapeHtml(servicingDate(row.originalDueDate))}</td><td>${escapeHtml(servicingDate(row.currentDueDate||row.dueDate))}</td>${cells}<td><span class="chip ${statusClass}">${escapeHtml(row.status||'Pendiente de confirmar')}</span>${typeof row.dpd==='number'&&row.dpd>0?`<br><small>${escapeHtml(String(row.dpd))} días de atraso</small>`:''}${extension}${Number(row.finalInstallmentAdjustment)?`<br><small>Ajuste de última parcialidad: ${escapeHtml(servicingMoney(row.finalInstallmentAdjustment))}</small>`:''}</td></tr>`;
  }).join('');
  return `${renderServicingSummary(projection)}${renderServicingV71(projection)}<div class="post-note">Calendario recibido de administración demo. Conserva los pagos parciales, anticipos y ajustes registrados al momento del corte. Esta consulta no registra pagos ni actualiza saldos automáticamente; recibe una nueva actualización para consultar cambios posteriores.</div><div class="amort-table-wrap"><table class="amort-table"><thead><tr><th>#</th><th>Tipo</th><th>Fecha original</th><th>Vencimiento actual</th><th>Pago total</th><th>Pagado</th><th>Pendiente</th><th>Capital</th><th>Interés</th><th>IVA interés</th><th>Moratorio</th><th>IVA moratorio</th><th>Comisión</th><th>Capital pendiente</th><th>Estatus</th></tr></thead><tbody>${rows||'<tr><td colspan="15">No hay mensualidades registradas en el corte recibido.</td></tr>'}</tbody></table></div>`;
}
// v71 (aprobado 27/10/2026): opciones de extensión, cuota por adelantado, recibos y etiqueta del moratorio.
// Datos recibidos de administración (projection.v71); aquí solo se muestran.
function renderServicingV71(projection){
  const v=projection&&projection.v71;if(!v||typeof v!=='object')return '';
  const parts=[];
  const ext=v.extension;
  if(ext&&Array.isArray(ext.options)){
    const used=Number(ext.used)||0,max=Number(ext.max)||3;
    const options=ext.options.map(o=>{
      const head=`<b>${escapeHtml(o.label)}</b>${o.recommended&&o.available!==false?' <span class="chip ready">Recomendada</span>':''}`;
      if(!o.available)return `<li data-v71-option="${escapeHtml(o.modality)}">${head}<br><small>No disponible: ${escapeHtml(o.reason||'')}</small></li>`;
      // v71.1: explicación en español sencillo, con la fecha y el monto de la cuota que cambia.
      const d=v=>escapeHtml(servicingDate(v)),m=v=>escapeHtml(servicingMoney(v)),num=v=>typeof v==='number';
      let detail;
      if(o.modality==='CORTA'){
        detail=`Hoy pagas ${m(o.amountToday)}. Tu cuota del ${d(o.originalDue)} no lleva capital este mes; ese capital se suma a tu siguiente cuota (${d(o.nextDue)})${num(o.nextAmount)?`, que quedará en ${m(o.nextAmount)}`:''}.`;
        if(o.base==='insoluto'&&num(o.nextExtra)&&o.nextExtra>0)detail+=` Esa cuota también incluye ${m(o.nextExtra)} de interés por los días extra (con IVA); no se cobra hoy.`;
        detail+=' Si eliges Corta, tu siguiente extensión solo podrá ser «Al final».';
      }else if(o.lastCuota){
        detail=`Hoy pagas ${m(o.amountToday)}. Tu última cuota del ${d(o.originalDue)} no se cobra completa este mes; ese capital pasa a una cuota nueva (${d(o.lastDue)})${num(o.lastAmount)?` de ${m(o.lastAmount)}`:''}.`;
      }else if(o.base==='insoluto'){
        detail=`Hoy pagas ${m(o.amountToday)} (comisión con IVA). Tu cuota del ${d(o.originalDue)} queda solo con su interés${num(o.interestStillDue)&&o.interestStillDue>0?` (${m(o.interestStillDue)})`:''}, que pagas en esa fecha; ese capital se reparte en tus cuotas restantes${num(o.regularPayment)?`, que quedarán en ${m(o.regularPayment)}`:''}.`;
      }else{
        detail=`Hoy pagas ${m(o.amountToday)}. Tu cuota del ${d(o.originalDue)} no se cobra este mes; ese capital se suma a tu última cuota (${d(o.lastDue)})${num(o.lastAmount)?`, que quedará en ${m(o.lastAmount)}`:''}.`;
      }
      return `<li data-v71-option="${escapeHtml(o.modality)}">${head}<br>Pago de hoy: <b>${m(o.amountToday)}</b><br><small>${detail}</small></li>`;
    }).join('');
    parts.push(`<div class="post-note" data-v71-extension><b>Extensión de tu cuota:</b> ${escapeHtml(String(used))} de ${escapeHtml(String(max))} usadas.<ul>${options}</ul><small>Para usarla, paga el monto de hoy por el canal habitual y avisa a Pulzzo; al registrarse verás la tabla actualizada y tu recibo. Disponible si no tienes pagos vencidos.</small></div>`);
  }
  if(v.advance&&typeof v.advance.pending==='number'&&v.advance.pending>0)parts.push(`<div class="post-note" data-v71-advance><b>Pagar cuota por adelantado:</b> cuota ${escapeHtml(String(v.advance.number||''))} del ${escapeHtml(servicingDate(v.advance.dueDate))} · pendiente ${escapeHtml(servicingMoney(v.advance.pending))}. Puedes adelantar una parte; se aplica a IVA, interés y capital de esa cuota. No es un prepago.</div>`);
  if(Array.isArray(v.receipts)&&v.receipts.length)parts.push(`<div class="post-note" data-v71-receipts><b>Recibos:</b><ul>${v.receipts.map(r=>`<li>${escapeHtml(r.title)}${r.detail?' · '+escapeHtml(r.detail):''} · ${escapeHtml(servicingDate(r.date))} · ${escapeHtml(servicingMoney(r.amount))}</li>`).join('')}</ul></div>`);
  if(v.moratorioLabel)parts.push(`<div class="post-note" data-v71-mora><small>${escapeHtml(v.moratorioLabel)} · se calcula por día solo sobre el capital vencido, sin interés sobre interés.</small></div>`);
  return parts.join('');
}
return {render,summary:renderServicingSummary,pending:renderServicingPending,v71:renderServicingV71};
});
