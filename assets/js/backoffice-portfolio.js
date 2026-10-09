/* Shared portfolio views. Financial calculations and posting stay in the credit ledger. */
'use strict';
const portfolioState={tab:'summary',query:'',creditState:'active',due:'all',from:'',to:'',movementMonth:'',moreFilters:false,filterOpen:false};
const portfolioTabs=[['summary','Resumen'],['credits','Créditos'],['movements','Pagos y movimientos'],['calendar','Calendario'],['collections','Cobranza']];
const portfolioNoteKey='pulzzo.backoffice.collectionNotes.v1';
function portfolioDate(value){
  const s=String(value||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';
  const d=new Date(s+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===s?s:'';
}
function portfolioToday(){return dispersionDateOnly(new Date());}
function portfolioDatePlus(date,days){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function portfolioInDates(date){return (!portfolioState.from||date&&date>=portfolioState.from)&&(!portfolioState.to||date&&date<=portfolioState.to);}
function portfolioDisbursed(p){const a=p.application||{};return !!(a.dispersionDate||a.disbursedAt||a.dispersedAt||p.dispersionDate||p.disbursedAt||(a.providerDispersions||[]).some(r=>r.dispersionDate));}
function portfolioPending(row){return dispersionExtensionIsClosedRow(row)?0:Math.max(dispersionNumber(row.pendingAmount,dispersionNumber(row.totalPayment,0)-dispersionNumber(row.paidAmount,0)),0);}
function portfolioCredits(){
  const today=portfolioToday();
  return (db.patients||[]).filter(portfolioDisbursed).map(record=>{
    // Some legacy normalization helpers hydrate their input: never give them the stored entity on read.
    const p=JSON.parse(JSON.stringify(record)),terms=dispersionTerms(p),seen=new Set();
    const rows=dispersionBuildSchedule(p).filter(r=>{const key=String(r.id);if(seen.has(key))return false;seen.add(key);return true;});
    const installments=rows.map(row=>({row,id:row.id,date:portfolioDate(row.currentDueDate||row.dueDate),original:portfolioDate(row.originalDueDate||row.dueDate),pending:portfolioPending(row)}));
    const outstanding=roundToCents(dispersionActiveCapitalRowsForSettlement(rows).reduce((sum,r)=>sum+dispersionCapitalPendingForSettlement(r),0));
    const settled=dispersionIsCreditLiquidated(p)||(rows.length>0&&installments.every(r=>r.pending<=0));
    const overdue=roundToCents(installments.filter(r=>r.date&&r.date<today).reduce((sum,r)=>sum+r.pending,0));
    const next=installments.filter(r=>r.pending>0&&r.date).sort((a,b)=>a.date.localeCompare(b.date))[0];
    return {record,disbursed:true,id:record.id,code:dispersionApplicationCode(p),name:p.patient?.fullName||p.name||'Sin nombre',terms,installments,outstanding:settled?0:outstanding,settled,overdue,next};
  });
}
function portfolioReceiptCredits(credits=portfolioCredits()){
  const seen=new Set(credits.map(c=>c.id));
  return [...credits,...(db.patients||[]).filter(p=>!seen.has(p.id)&&(p.payments||[]).length).map(record=>{const p=JSON.parse(JSON.stringify(record));return {record,id:p.id,code:dispersionApplicationCode(p),name:p.patient?.fullName||p.name||'Sin nombre',terms:dispersionTerms(p),installments:[],outstanding:0,overdue:0,settled:dispersionIsCreditLiquidated(p),disbursed:false};})];
}
function portfolioMatches(c){
  const query=normalizeSearchText(portfolioState.query);if(!query)return true;
  // Search only this credit's borrower identity; never join profiles by name/contact.
  // Keep fields separate so a query cannot match across unrelated field boundaries.
  const patient=c.record.patient||{};
  if([c.name,patient.email].some(value=>normalizeSearchText(value).includes(query)))return true;
  const compact=value=>normalizeSearchText(value).replace(/[\s-]+/g,'');
  const identifierQuery=compact(query);
  if(identifierQuery&&[c.id,c.code,patient.rfc,patient.curp].some(value=>compact(value).includes(identifierQuery)))return true;
  // Formatting is ignored only for phone-shaped queries, never for arbitrary text.
  const phoneQuery=/^[+\d\s().-]+$/.test(query)?query.replace(/\D/g,''):'';
  return !!phoneQuery&&String(patient.phone||'').replace(/\D/g,'').includes(phoneQuery);
}
function portfolioCreditMatches(c){return portfolioMatches(c)&&(portfolioState.creditState==='all'||(portfolioState.creditState==='settled'?c.settled:!c.settled));}
function portfolioDueMatches(r){const today=portfolioToday(),filter=portfolioState.due;return portfolioInDates(r.date)&&(filter==='all'||filter==='late'&&r.pending>0&&r.date&&r.date<today||filter==='today'&&r.pending>0&&r.date===today||filter==='upcoming'&&r.pending>0&&r.date>today&&r.date<=portfolioDatePlus(today,30)||filter==='pending'&&r.pending>0);}
function portfolioMovements(credits){return credits.flatMap(c=>getPortfolioLedgerRows(c.record).map(m=>({...m,credit:c,date:portfolioDate(m.date||m.createdAt)}))).sort((a,b)=>String(b.date).localeCompare(String(a.date)));}
function portfolioMetrics(credits,receiptCredits=portfolioReceiptCredits(credits).filter(portfolioMatches)){
  const active=credits.filter(c=>!c.settled),today=portfolioToday(),month=today.slice(0,7),moves=portfolioMovements(receiptCredits);
  return {active:active.length,principal:roundToCents(active.reduce((s,c)=>s+c.outstanding,0)),overdue:roundToCents(active.reduce((s,c)=>s+c.overdue,0)),latePrincipal:roundToCents(active.filter(c=>c.overdue>0).reduce((s,c)=>s+c.outstanding,0)),received:roundToCents(moves.filter(m=>m.date.startsWith(month)).reduce((s,m)=>s+dispersionNumber(m.amountReceived,0),0)),upcoming:roundToCents(active.flatMap(c=>c.installments).filter(r=>r.pending>0&&r.date>=today&&r.date<=portfolioDatePlus(today,30)).reduce((s,r)=>s+r.pending,0))};
}
function portfolioReadNotes(){try{const value=localStorage.getItem(portfolioNoteKey);if(!value)return {notes:[],ok:true};const notes=JSON.parse(value);if(!Array.isArray(notes))throw new Error('invalid');return {notes:notes.filter(n=>n&&typeof n.creditId==='string'),ok:true};}catch(error){return {notes:[],ok:false};}}
function portfolioSaveNote(id,note,nextAction,nextDate){
  if(!requireCapability('patientActions')||!requireCapability('notes'))return false;
  if(!portfolioCredits().some(c=>c.id===id)){toast('No se encontró el crédito.');return false;}
  note=String(note||'').trim();nextAction=String(nextAction||'').trim();nextDate=String(nextDate||'');
  if(!note||note.length>2000||nextAction.length>300||nextDate&&!portfolioDate(nextDate)){toast('Escribe una nota de hasta 2,000 caracteres y una fecha válida.');return false;}
  const saved=portfolioReadNotes();if(!saved.ok){toast('No se pudieron leer las notas guardadas. No se sobrescribieron.');return false;}
  const entry={creditId:id,note,nextAction,nextDate,actor:session.email,createdAt:new Date().toISOString()};
  try{localStorage.setItem(portfolioNoteKey,JSON.stringify([...saved.notes,entry]));}catch(error){toast('No se guardó la nota: almacenamiento local no disponible. Conserva el texto e inténtalo de nuevo.');return false;}
  closeModal();renderPortfolio();toast('Gestión guardada en esta demo local.');return true;
}
function portfolioOpenNote(id){
  if(!requireCapability('patientActions')||!requireCapability('notes'))return false;const c=portfolioCredits().find(c=>c.id===id);if(!c)return false;
  modal(`<div class="modal-head"><div><h3>Registrar gestión</h3><p>${escapeHtml(c.code)} · ${escapeHtml(c.name)}</p></div><button class="x" onclick="closeModal()" aria-label="Cerrar">×</button></div><div class="modal-body"><label class="field">Nota interna<textarea id="portfolioNoteText" maxlength="2000" rows="4"></textarea></label><label class="field">Próxima acción<input id="portfolioNextAction" maxlength="300" placeholder="Acción manual pendiente"></label><label class="field">Fecha de seguimiento<input id="portfolioNextDate" type="date"></label><p class="muted">Registro local interno. No envía mensajes ni realiza contactos.</p></div><div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button id="portfolioSaveNote" class="btn btn-primary">Guardar gestión</button></div>`);
  $('#portfolioSaveNote').onclick=()=>portfolioSaveNote(id,$('#portfolioNoteText').value,$('#portfolioNextAction').value,$('#portfolioNextDate').value);$('#portfolioNoteText').focus();return true;
}
function portfolioOpenCredit(id,action='detail',rowId=''){
  const c=portfolioReceiptCredits().find(c=>c.id===id);if(!c)return false;
  if(action==='payment'){
    if(!requireCapability('patientActions')||!portfolioCanPayCredit(c))return false;
    return portfolioOpenPayment(id,rowId);
  }
  selectedPatientId=id;setView('patients');
  const returnFocus=typeof window.matchMedia==='function'&&window.matchMedia('(max-width: 820px)').matches?'portfolioFilterToggle':'portfolioSearch';
  operationalReturnContext={view:'portfolio',focus:returnFocus,kind:'patient',ref:id};
  patientRequestMode='detail';patientTab='dispersion';dispersionInnerTab=action==='movements'?'movimientos':'resumen';renderPatients();
  const focus=document.getElementById('patientDetail');focus?.scrollIntoView({block:'center',behavior:'smooth'});focus?.focus({preventScroll:true});return true;
}
function portfolioSetTab(tab){
  if(!portfolioTabs.some(([id])=>id===tab))return;
  portfolioSetFiltersOpen(false,false);portfolioState.tab=tab;portfolioState.due='all';portfolioState.movementMonth='';renderPortfolio();document.getElementById('portfolioTab-'+tab)?.focus();
}
function portfolioDrill(kind){
  portfolioSetFiltersOpen(false,false);
  portfolioState.creditState='active';portfolioState.due='all';portfolioState.from='';portfolioState.to='';portfolioState.movementMonth='';
  if(kind==='received'){portfolioState.tab='movements';portfolioState.movementMonth=portfolioToday().slice(0,7);}
  else if(['overdue','latePrincipal'].includes(kind)){portfolioState.tab='credits';portfolioState.due='late';}
  else if(kind==='upcoming'){portfolioState.tab='calendar';portfolioState.due='pending';portfolioState.from=portfolioToday();portfolioState.to=portfolioDatePlus(portfolioToday(),30);}
  else if(kind==='settled'){portfolioState.tab='credits';portfolioState.creditState='settled';}
  else {portfolioState.tab='credits';}
  renderPortfolio();document.getElementById('portfolioTab-'+portfolioState.tab)?.focus();
}
function portfolioDrillRange(from,to){
  if(!portfolioDate(from)||!portfolioDate(to)||from>to)return;
  portfolioSetFiltersOpen(false,false);Object.assign(portfolioState,{tab:'calendar',creditState:'active',due:'pending',from,to,movementMonth:''});
  renderPortfolio();document.getElementById('portfolioTab-calendar')?.focus();
}
function portfolioSelect(id,label,value,options,className=''){return `<label class="${className}">${label}<select id="${id}">${options.map(([key,text])=>`<option value="${key}" ${value===key?'selected':''}>${text}</option>`).join('')}</select></label>`;}
function portfolioFilterConfig(){const tab=portfolioState.tab;return {credit:['credits','calendar','collections'].includes(tab),dates:tab!=='summary',due:['credits','calendar','collections'].includes(tab),month:tab==='movements'};}
function portfolioActiveFilters(){
  const f=portfolioFilterConfig(),s=portfolioState,filters=[];
  if(s.query)filters.push(['query','Búsqueda: '+s.query]);
  if(f.credit&&s.creditState!=='all')filters.push(['creditState','Estado: '+({active:'Activos',settled:'Liquidados',all:'Todos'}[s.creditState]||'Activos')]);
  if(f.due&&s.due!=='all')filters.push(['due','Vencimiento: '+({late:'Vencidos',today:'Hoy',upcoming:'Próximos 30 días',pending:'Con saldo pendiente'}[s.due]||s.due)]);
  if(f.dates&&s.from)filters.push(['from','Desde: '+s.from]);
  if(f.dates&&s.to)filters.push(['to','Hasta: '+s.to]);
  if(f.month&&s.movementMonth)filters.push(['movementMonth','Mes: '+s.movementMonth]);
  return filters;
}
function portfolioRenderFilterChips(){
  const target=document.getElementById('portfolioFilterChips');if(!target)return;
  const filters=portfolioActiveFilters();target.innerHTML=filters.map(([key,label])=>`<button class="portfolio-filter-chip" data-clear-filter="${key}" aria-label="Quitar filtro ${escapeAttr(label)}">${escapeHtml(label)}<span aria-hidden="true"> ×</span></button>`).join('');
  const count=document.getElementById('portfolioFilterCount');if(count)count.textContent=filters.length?String(filters.length):'';
}
let portfolioFilterInertState=[];
function portfolioReleaseFilterBackground(){for(const item of portfolioFilterInertState)item.node.inert=item.wasInert;portfolioFilterInertState=[];}
function portfolioIsolateFilters(shell,backdrop){
  portfolioReleaseFilterBackground();let branch=shell;
  while(branch?.parentElement){for(const sibling of branch.parentElement.children||[])if(sibling!==branch&&sibling!==backdrop&&!['SCRIPT','STYLE','LINK'].includes(sibling.tagName)){portfolioFilterInertState.push({node:sibling,wasInert:sibling.inert});sibling.inert=true;}branch=branch.parentElement;if(branch===document.body)break;}
}
function portfolioSetFiltersOpen(open,restoreFocus=true){
  portfolioState.filterOpen=!!open;
  const shell=document.getElementById('portfolioFilterShell'),backdrop=document.getElementById('portfolioFilterBackdrop'),toggle=document.getElementById('portfolioFilterToggle');
  document.body.classList?.toggle('portfolio-filters-open',!!open);shell?.classList?.toggle('is-open',!!open);
  if(backdrop)backdrop.hidden=!open;
  toggle?.setAttribute('aria-expanded',String(!!open));
  if(open){portfolioIsolateFilters(shell,backdrop);shell?.setAttribute('role','dialog');shell?.setAttribute('aria-modal','true');shell?.setAttribute('aria-labelledby','portfolioFilterTitle');document.getElementById('portfolioSearch')?.focus();}
  else {portfolioReleaseFilterBackground();shell?.removeAttribute?.('role');shell?.removeAttribute?.('aria-modal');shell?.removeAttribute?.('aria-labelledby');if(restoreFocus)toggle?.focus();}
}
function portfolioFilterKeydown(e){
  if(!portfolioState.filterOpen)return;
  if(e.key==='Escape'){e.preventDefault();portfolioSetFiltersOpen(false);return;}
  if(e.key!=='Tab')return;
  const shell=document.getElementById('portfolioFilterShell');
  const controls=Array.from(shell?.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled])')||[]).filter(el=>!el.closest('[hidden]')&&el.getClientRects().length);
  if(!controls.length)return;
  const first=controls[0],last=controls[controls.length-1];
  if(e.shiftKey&&(document.activeElement===first||!shell?.contains?.(document.activeElement))){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&(document.activeElement===last||!shell?.contains?.(document.activeElement))){e.preventDefault();first.focus();}
}
function portfolioToggleMore(){
  portfolioState.moreFilters=!portfolioState.moreFilters;
  const region=document.getElementById('portfolioMoreFilters'),toggle=document.getElementById('portfolioMoreToggle');
  if(region)region.hidden=!portfolioState.moreFilters;
  toggle?.setAttribute('aria-expanded',String(portfolioState.moreFilters));
}
function portfolioClearFilter(key){
  const defaults={query:'',creditState:'all',due:'all',from:'',to:'',movementMonth:''};if(!Object.prototype.hasOwnProperty.call(defaults,key))return;
  portfolioState[key]=defaults[key];renderPortfolio();
  const mobile=typeof window.matchMedia==='function'&&window.matchMedia('(max-width: 820px)').matches;
  document.getElementById(mobile&&!portfolioState.filterOpen?'portfolioFilterToggle':'portfolioSearch')?.focus();
}
function renderPortfolio(){
  portfolioReleaseFilterBackground();
  const tab=portfolioState.tab,f=portfolioFilterConfig(),more=f.due||f.month;
  $('#portfolio').innerHTML=`<div class="portfolio-head"><div><h2>Cartera</h2><p>Consulta saldos, vencimientos y pagos de tus créditos.</p></div><span class="pill pill-aqua">Demo local</span></div>
  <div class="portfolio-tabs" role="tablist" aria-label="Secciones de cartera">${portfolioTabs.map(([id,label])=>`<button role="tab" id="portfolioTab-${id}" aria-controls="portfolioContent" aria-selected="${id===tab}" tabindex="${id===tab?'0':'-1'}" data-portfolio-tab="${id}">${label}</button>`).join('')}</div>
  <div class="portfolio-filter-toolbar"><button id="portfolioFilterToggle" class="btn btn-secondary portfolio-filter-mobile-toggle" aria-controls="portfolioFilterShell" aria-expanded="${portfolioState.filterOpen}">Filtros <span id="portfolioFilterCount"></span></button><span class="portfolio-filter-context">${tab==='summary'?'Resumen al día de hoy · MXN':'Filtra la consulta · importes en MXN'}</span></div>
  <div id="portfolioFilterBackdrop" class="portfolio-filter-backdrop" hidden></div>
  <section id="portfolioFilterShell" class="portfolio-filter-shell portfolio-filters${portfolioState.filterOpen?' is-open':''}">
    <div class="portfolio-filter-heading"><h3 id="portfolioFilterTitle">Filtrar cartera</h3><button id="portfolioFilterClose" class="btn btn-secondary portfolio-filter-close" aria-label="Cerrar filtros">Cerrar</button></div>
    <div class="portfolio-filter-main"><label class="portfolio-search">Crédito o cliente<input id="portfolioSearch" type="search" placeholder="Nombre o dato del cliente" aria-describedby="portfolioSearchHelp" value="${escapeAttr(portfolioState.query)}"></label>
      ${f.credit?portfolioSelect('portfolioCreditState','Estado',portfolioState.creditState,[['active','Activos'],['settled','Liquidados'],['all','Todos']],'portfolio-filter-status'):''}
      ${f.dates?`<label class="portfolio-filter-date">Desde<input id="portfolioFrom" type="date" value="${escapeAttr(portfolioState.from)}"></label><label class="portfolio-filter-date">Hasta<input id="portfolioTo" type="date" value="${escapeAttr(portfolioState.to)}"></label>`:''}
      <div class="portfolio-filter-buttons">${more?`<button id="portfolioMoreToggle" class="btn btn-secondary" aria-controls="portfolioMoreFilters" aria-expanded="${portfolioState.moreFilters}">Más filtros</button>`:''}<button class="btn btn-secondary" id="portfolioClear">Limpiar</button></div>
    </div>
    <p id="portfolioSearchHelp" class="portfolio-search-help">Busca por teléfono, RFC, CURP, nombre, número de crédito o correo electrónico.</p>
    ${more?`<div id="portfolioMoreFilters" class="portfolio-more-filters"${portfolioState.moreFilters?'':' hidden'}>${f.due?portfolioSelect('portfolioDue','Vencimiento',portfolioState.due,[['all','Todos'],['late','Vencidos'],['today','Vencen hoy'],['upcoming','Próximos 30 días'],['pending','Con saldo pendiente']]):''}${f.month?`<label>Mes del movimiento<input id="portfolioMonth" type="month" value="${escapeAttr(portfolioState.movementMonth)}"></label>`:''}<p>Los filtros se aplican al cambiar cada campo.</p></div>`:''}
    <div class="portfolio-filter-footer"><button id="portfolioFilterDone" class="btn btn-primary">Ver resultados</button></div>
  </section>
  <div id="portfolioFilterChips" class="portfolio-filter-chips" aria-label="Filtros activos"></div><div id="portfolioContent" role="tabpanel" aria-labelledby="portfolioTab-${tab}"></div>`;
  $('#portfolio').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.portfolioTab)portfolioSetTab(b.dataset.portfolioTab);else if(b.dataset.clearFilter)portfolioClearFilter(b.dataset.clearFilter);};
  $('#portfolio').onkeydown=e=>{
    const tabButton=e.target.closest('[data-portfolio-tab]');if(!tabButton||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    e.preventDefault();const ids=portfolioTabs.map(([id])=>id),index=ids.indexOf(portfolioState.tab),next=e.key==='Home'?0:e.key==='End'?ids.length-1:(index+(e.key==='ArrowRight'?1:-1)+ids.length)%ids.length;
    portfolioSetTab(ids[next]);document.getElementById('portfolioTab-'+ids[next])?.focus();
  };
  $('#portfolioSearch').oninput=e=>{portfolioState.query=e.target.value;renderPortfolioBody();portfolioRenderFilterChips();};
  for(const [id,key] of [['portfolioCreditState','creditState'],['portfolioDue','due'],['portfolioFrom','from'],['portfolioTo','to'],['portfolioMonth','movementMonth']]){const el=document.getElementById(id);if(el)el.onchange=e=>{portfolioState[key]=e.target.value;renderPortfolioBody();portfolioRenderFilterChips();};}
  $('#portfolioClear').onclick=()=>{Object.assign(portfolioState,{query:'',creditState:'active',due:'all',from:'',to:'',movementMonth:''});renderPortfolio();$('#portfolioSearch').focus();};
  $('#portfolioFilterToggle').onclick=()=>portfolioSetFiltersOpen(!portfolioState.filterOpen);
  for(const id of ['portfolioFilterClose','portfolioFilterDone','portfolioFilterBackdrop'])document.getElementById(id).onclick=()=>portfolioSetFiltersOpen(false);
  const moreToggle=document.getElementById('portfolioMoreToggle');if(moreToggle)moreToggle.onclick=portfolioToggleMore;
  renderPortfolioBody();portfolioRenderFilterChips();if(portfolioState.filterOpen)portfolioSetFiltersOpen(true,false);
}
function portfolioCreditCell(c){return `<button class="portfolio-link" data-credit="${escapeAttr(c.id)}" data-action="detail">${escapeHtml(c.name)}</button><small>${escapeHtml(c.code)}</small>${c.disbursed===false?'<small>Crédito aún no dispersado</small>':''}`;}
function portfolioCanPayCredit(c){return can('patientActions')&&!c.settled&&dispersionContractSigned(JSON.parse(JSON.stringify(c.record)));}
function portfolioActionCell(c,rowId=''){return `<div class="portfolio-actions"><button class="btn btn-sm btn-secondary" data-credit="${escapeAttr(c.id)}" data-action="detail" aria-label="Ver crédito ${escapeAttr(c.code)}">Ver crédito</button>${portfolioCanPayCredit(c)?`<button class="btn btn-sm btn-primary" data-credit="${escapeAttr(c.id)}" data-action="payment" data-row="${escapeAttr(rowId)}" aria-label="Registrar pago de ${escapeAttr(c.code)}">Registrar pago</button>`:''}</div>`;}
function portfolioStatus(c){return `<span class="pill portfolio-status ${c.settled?'pill-green':c.overdue?'pill-amber':'pill-aqua'}">${c.settled?'Liquidado':c.overdue?'En mora':'Activo'}</span>`;}
function portfolioCardValues(values){return `<dl class="portfolio-card-values">${values.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;}
function portfolioTable(headers,rows,countLabel,cards=[]){return `<p class="portfolio-count" role="status" aria-live="polite">${rows.length} ${countLabel}</p><div class="table-wrap portfolio-desktop-table" tabindex="0" aria-label="Tabla de cartera; desplaza horizontalmente para ver todas las columnas"><table class="portfolio-table"><thead><tr>${headers.map(h=>`<th scope="col"${Array.isArray(h)?` class="${h[1]}"`:''}>${Array.isArray(h)?h[0]:h}</th>`).join('')}</tr></thead><tbody>${rows.join('')||`<tr><td colspan="${headers.length}" class="portfolio-empty">Sin resultados con estos filtros.</td></tr>`}</tbody></table></div><div class="portfolio-mobile-cards">${cards.join('')||'<p class="portfolio-empty">Sin resultados con estos filtros.</p>'}</div>`;}
function portfolioCreditCard(c){return `<article class="portfolio-mobile-card"><div class="portfolio-card-head"><div>${portfolioCreditCell(c)}</div>${portfolioStatus(c)}</div>${portfolioCardValues([['Capital pendiente',fmtMoney(c.outstanding)],['Vencido',fmtMoney(c.overdue)],['Próxima cuota',c.next?`${fmtMoney(c.next.pending)}<small>${escapeHtml(c.next.date)}</small>`:'Sin pendientes']])}<details><summary>Datos del crédito</summary><p>Proveedor: ${escapeHtml(c.terms.provider||'No registrado')}</p></details><div class="portfolio-card-actions">${portfolioActionCell(c)}</div></article>`;}
function portfolioSummaryHtml(credits){
  const m=portfolioMetrics(credits),metrics=[['principal','Capital pendiente',fmtMoney(m.principal),'Capital real pendiente de créditos activos'],['overdue','Importe vencido',fmtMoney(m.overdue),'Cuotas vencidas pendientes, con sus conceptos'],['received','Recibido este mes',fmtMoney(m.received),'Entradas del mes, netas de reversos'],['upcoming','Por vencer · 30 días',fmtMoney(m.upcoming),'Cuotas pendientes desde hoy']];
  const active=credits.filter(c=>!c.settled),late=active.filter(c=>c.overdue>0),settled=credits.filter(c=>c.settled).length,max=Math.max(active.length,settled,1),today=portfolioToday();
  const bar=(label,value,kind,success=false)=>`<button class="portfolio-bar ${success?'portfolio-success':''}" data-drill="${kind}"><span>${label}</span><span class="portfolio-bar-track" aria-hidden="true"><i class="portfolio-bar-fill" style="width:${Math.max(0,value/max*100)}%"></i></span><strong>${value} créditos</strong></button>`;
  const buckets=[['Hoy',0,0],['En 1–7 días',1,7],['En 8–30 días',8,30]].map(([label,start,end])=>{const from=portfolioDatePlus(today,start),to=portfolioDatePlus(today,end);return {label,from,to,amount:roundToCents(active.flatMap(c=>c.installments).filter(r=>r.pending>0&&r.date>=from&&r.date<=to).reduce((s,r)=>s+r.pending,0))};}),maxAmount=Math.max(...buckets.map(b=>b.amount),1);
  const priorities=(late.length?[...late].sort((a,b)=>b.overdue-a.overdue||a.code.localeCompare(b.code)):active.filter(c=>c.next&&c.next.date>=today&&c.next.date<=portfolioDatePlus(today,30)).sort((a,b)=>a.next.date.localeCompare(b.next.date)||a.code.localeCompare(b.code))).slice(0,5);
  return `<div class="portfolio-kpis">${metrics.map(([kind,label,value,copy])=>`<button class="portfolio-metric" data-drill="${kind}"><span>${label}</span><strong>${value}</strong><small>${copy}</small></button>`).join('')}</div>
  <div class="portfolio-charts"><section class="portfolio-chart"><h3>Estado de la cartera</h3>${bar('Activos',active.length,'active')}${bar('Con atraso',late.length,'overdue')}${bar('Liquidados',settled,'settled',true)}<p>Los créditos con atraso forman parte de los activos.</p><button class="portfolio-link" data-drill="latePrincipal">Capital de créditos en mora: ${fmtMoney(m.latePrincipal)}</button></section><section class="portfolio-chart"><h3>Próximos vencimientos · MXN</h3>${buckets.map(b=>`<button class="portfolio-bar" data-range-from="${b.from}" data-range-to="${b.to}"><span>${b.label}</span><span class="portfolio-bar-track" aria-hidden="true"><i class="portfolio-bar-fill" style="width:${b.amount/maxAmount*100}%"></i></span><strong>${fmtMoney(b.amount)}</strong></button>`).join('')}<p>Cuotas pendientes; selecciona un periodo para ver el calendario.</p></section></div>
  <section class="portfolio-chart portfolio-priorities"><div class="portfolio-priority-heading"><div><h3>Atención prioritaria</h3><p>${late.length?'Créditos con atraso, de mayor a menor importe vencido.':'Próximas cuotas pendientes en 30 días, por fecha.'}</p></div><button class="btn btn-secondary" data-drill="${late.length?'overdue':'upcoming'}">Ver todos</button></div><ul class="portfolio-priority-list">${priorities.map(c=>`<li class="portfolio-priority-item"><div class="portfolio-priority-copy">${portfolioCreditCell(c)}</div><div class="portfolio-priority-meta"><strong>${fmtMoney(late.length?c.overdue:c.next.pending)}</strong><small>${late.length?'Vencido':'Vence '+escapeHtml(c.next.date)}</small></div>${portfolioActionCell(c,c.next?.id||'')}</li>`).join('')||'<li class="portfolio-empty">No hay créditos para esta prioridad con la búsqueda actual.</li>'}</ul></section>
  <p class="portfolio-summary-note">Capital y cuotas vencidas son conceptos distintos y no se suman. Se usan el calendario vigente y los recibos del crédito; las prórrogas sustituyen la fecha original.</p>`;
}
function portfolioMovementDetails(m){return `<details><summary>Detalle del movimiento</summary><p>${escapeHtml(m.reversalOf?'Reverso':dispersionPaymentTypeLabel(m.paymentType))} · ${escapeHtml(m.method||'Sin método')}<br>Referencia: ${escapeHtml(m.reference||'Sin referencia')}<br>Usuario: ${escapeHtml(m.actor||'No registrado')}</p>${(m.allocations||[]).length?m.allocations.map(a=>`<small>${escapeHtml(a.rowId||'Crédito')} · ${escapeHtml(a.concept||'Sin concepto')}: ${fmtMoney(a.amount)}</small>`).join(''):'<small>Sin desglose histórico</small>'}</details><button class="portfolio-link" data-credit="${escapeAttr(m.credit.id)}" data-action="movements">Ver movimientos del crédito</button>`;}
function portfolioNoteHtml(saved,creditId){const notes=saved.notes.filter(n=>n.creditId===creditId),note=notes.slice(-1)[0];return note?`${escapeHtml(note.note)}<small>${escapeHtml(note.actor)} · ${escapeHtml(note.createdAt.slice(0,10))}</small><small>${escapeHtml(note.nextAction||'Sin próxima acción')} ${escapeHtml(note.nextDate||'')}</small><details><summary>Historial de gestiones</summary>${notes.map(n=>`<small>${escapeHtml(n.createdAt.slice(0,10))} · ${escapeHtml(n.actor)}: ${escapeHtml(n.note)} · ${escapeHtml(n.nextAction||'')} ${escapeHtml(n.nextDate||'')}</small>`).join('')}</details>`:'Sin gestión registrada';}
function renderPortfolioBody(){
  const target=$('#portfolioContent'),all=portfolioCredits(),credits=all.filter(portfolioMatches),tab=portfolioState.tab;
  if(tab!=='summary'&&portfolioState.from&&portfolioState.to&&portfolioState.from>portfolioState.to){target.innerHTML='<p class="portfolio-warning" role="alert">La fecha desde no puede ser posterior a la fecha hasta.</p>';return;}
  if(tab==='summary')target.innerHTML=portfolioSummaryHtml(credits);
  else if(tab==='credits'){
    const filtered=portfolioState.due!=='all'||portfolioState.from||portfolioState.to,rows=all.filter(portfolioCreditMatches).filter(c=>!filtered||c.installments.some(portfolioDueMatches));
    target.innerHTML=portfolioTable(['Cliente / crédito',['Capital pendiente','portfolio-number'],['Próxima cuota','portfolio-number'],['Vencido','portfolio-number'],'Estado','Acciones'],rows.map(c=>`<tr><td>${portfolioCreditCell(c)}</td><td class="portfolio-number">${fmtMoney(c.outstanding)}</td><td class="portfolio-number">${c.next?`${fmtMoney(c.next.pending)}<small>${escapeHtml(c.next.date)}</small>`:'Sin pendientes'}</td><td class="portfolio-number">${fmtMoney(c.overdue)}</td><td>${portfolioStatus(c)}</td><td>${portfolioActionCell(c)}</td></tr>`),'créditos',rows.map(portfolioCreditCard));
  }else if(tab==='movements'){
    const receiptCredits=portfolioReceiptCredits(all).filter(portfolioMatches);
    const rows=portfolioMovements(receiptCredits).filter(m=>portfolioInDates(m.date)&&(!portfolioState.movementMonth||m.date.startsWith(portfolioState.movementMonth)));
    const totals=rows.reduce((t,m)=>({received:t.received+dispersionNumber(m.amountReceived,0),applied:t.applied+dispersionNumber(m.totalApplied,0),unapplied:t.unapplied+dispersionNumber(m.unappliedAmount,0)}),{received:0,applied:0,unapplied:0});
    target.innerHTML=(can('patientActions')?`<div class="portfolio-payment-quick"><label class="portfolio-search">Registrar pago en un crédito<select id="portfolioPaymentCredit"><option value="">Selecciona un crédito</option>${receiptCredits.filter(portfolioCanPayCredit).map(c=>`<option value="${escapeAttr(c.id)}">${escapeHtml(c.code)} · ${escapeHtml(c.name)}${c.disbursed===false?' · Aún no dispersado':''}</option>`).join('')}</select></label><button class="btn btn-primary" data-register-payment="true">Registrar pago</button></div>`:'')+`<div class="portfolio-movement-totals"><span>Recibido <strong>${fmtMoney(totals.received)}</strong></span><span>Aplicado <strong>${fmtMoney(totals.applied)}</strong></span><span>No aplicado <strong>${fmtMoney(totals.unapplied)}</strong></span></div>`+portfolioTable(['Cliente / crédito','Fecha / folio',['Recibido','portfolio-number'],['Aplicado','portfolio-number'],['No aplicado','portfolio-number'],'Detalle'],rows.map(m=>`<tr><td>${portfolioCreditCell(m.credit)}</td><td>${escapeHtml(m.date||'Sin fecha')}<small>${escapeHtml(m.receiptId||'Sin folio')}</small></td><td class="portfolio-number">${fmtMoney(m.amountReceived)}</td><td class="portfolio-number">${fmtMoney(m.totalApplied)}</td><td class="portfolio-number">${fmtMoney(m.unappliedAmount)}</td><td>${portfolioMovementDetails(m)}</td></tr>`),'movimientos',rows.map(m=>`<article class="portfolio-mobile-card"><div class="portfolio-card-head"><div>${portfolioCreditCell(m.credit)}</div><span>${escapeHtml(m.date||'Sin fecha')}</span></div><p>${escapeHtml(m.receiptId||'Sin folio')}${m.reversalOf?' · Reverso':''}</p>${portfolioCardValues([['Recibido',fmtMoney(m.amountReceived)],['Aplicado',fmtMoney(m.totalApplied)],['No aplicado',fmtMoney(m.unappliedAmount)]])}${portfolioMovementDetails(m)}</article>`));
  }else {
    let rows=all.filter(portfolioCreditMatches).flatMap(c=>c.installments.map(r=>({...r,credit:c}))).filter(portfolioDueMatches);
    if(tab==='collections')rows=rows.filter(r=>r.pending>0&&r.date&&r.date<=portfolioToday());
    rows.sort((a,b)=>a.date.localeCompare(b.date)||a.credit.code.localeCompare(b.credit.code));
    const saved=portfolioReadNotes(),status=r=>{const late=r.pending>0&&r.date&&r.date<portfolioToday();return `<span class="pill portfolio-status ${r.pending<=0?'pill-green':late?'pill-amber':'pill-aqua'}">${escapeHtml(r.row.status||'Pendiente')}</span>${late?`<small>${Math.floor((new Date(portfolioToday()+'T12:00:00Z')-new Date(r.date+'T12:00:00Z'))/86400000)} días de atraso</small>`:''}`;},noteAction=r=>tab==='collections'&&can('patientActions')&&can('notes')?`<button class="btn btn-sm btn-secondary" data-note="${escapeAttr(r.credit.id)}">Registrar gestión</button>`:'';
    target.innerHTML=(tab==='collections'?`<p>Vencimientos hasta hoy. Gestión interna; sin contacto automático.</p>${saved.ok?'':'<p class="portfolio-warning" role="alert">No se pudieron leer las notas locales. No se sobrescribirán.</p>'}`:'<p>Una fila por cuota. Se conserva la fecha original cuando existe una prórroga.</p>')+portfolioTable(['Cliente / crédito','Cuota','Fecha vigente / original',['Pendiente','portfolio-number'],'Estado',...(tab==='collections'?['Última gestión / próxima acción']:[]),'Acciones'],rows.map(r=>`<tr><td>${portfolioCreditCell(r.credit)}</td><td>${escapeHtml(String(r.row.number||r.id))}<small>${escapeHtml(r.row.type||'Cuota')}</small></td><td>${escapeHtml(r.date||'Sin fecha')}<small>Original: ${escapeHtml(r.original||'Sin fecha')}</small>${r.date!==r.original?'<small>Prórroga / fecha ajustada</small>':''}</td><td class="portfolio-number">${fmtMoney(r.pending)}</td><td>${status(r)}</td>${tab==='collections'?`<td class="portfolio-note">${portfolioNoteHtml(saved,r.credit.id)}</td>`:''}<td>${portfolioActionCell(r.credit,r.id)}${noteAction(r)}</td></tr>`),'cuotas',rows.map(r=>`<article class="portfolio-mobile-card"><div class="portfolio-card-head"><div>${portfolioCreditCell(r.credit)}</div><div>${status(r)}</div></div>${portfolioCardValues([['Cuota',escapeHtml(String(r.row.number||r.id))],['Pendiente',fmtMoney(r.pending)],['Vencimiento',escapeHtml(r.date||'Sin fecha')]])}<details><summary>Detalle de la cuota${tab==='collections'?' y gestión':''}</summary><p>${escapeHtml(r.row.type||'Cuota')}<br>Original: ${escapeHtml(r.original||'Sin fecha')}${r.date!==r.original?'<br>Prórroga / fecha ajustada':''}</p>${tab==='collections'?`<div class="portfolio-note">${portfolioNoteHtml(saved,r.credit.id)}</div>`:''}</details><div class="portfolio-card-actions">${portfolioActionCell(r.credit,r.id)}${noteAction(r)}</div></article>`));
  }
  target.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.registerPayment){const id=$('#portfolioPaymentCredit').value;if(id)portfolioOpenCredit(id,'payment');else {toast('Selecciona un crédito para registrar el pago.');$('#portfolioPaymentCredit').focus();}}else if(b.dataset.drill)portfolioDrill(b.dataset.drill);else if(b.dataset.rangeFrom)portfolioDrillRange(b.dataset.rangeFrom,b.dataset.rangeTo);else if(b.dataset.credit)portfolioOpenCredit(b.dataset.credit,b.dataset.action,b.dataset.row||'');else if(b.dataset.note)portfolioOpenNote(b.dataset.note);};
}

// A drawer open on a phone must not leave the desktop document scroll-locked after rotation.
if(typeof window.matchMedia==='function'){
  const portfolioMobileQuery=window.matchMedia('(max-width: 820px)');
  const portfolioViewportChanged=e=>{if(!e.matches&&portfolioState.filterOpen){portfolioSetFiltersOpen(false,false);document.getElementById('portfolioSearch')?.focus();}};
  if(portfolioMobileQuery.addEventListener)portfolioMobileQuery.addEventListener('change',portfolioViewportChanged);
  else if(portfolioMobileQuery.addListener)portfolioMobileQuery.addListener(portfolioViewportChanged);
}

document.addEventListener('keydown',portfolioFilterKeydown);
