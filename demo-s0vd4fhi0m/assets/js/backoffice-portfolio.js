/* Shared portfolio views. Financial calculations and posting stay in the credit ledger. */
'use strict';
const portfolioState={tab:'summary',query:'',creditState:'active',due:'all',from:'',to:'',movementMonth:'',moreFilters:false,filterOpen:false,collectionFocus:'',cutDate:'',stage:'all',aging:'all',casos:'all'};
const portfolioTabs=[['summary','Resumen'],['credits','Créditos'],['movements','Pagos y movimientos'],['calendar','Calendario'],['collections','Cobranza']];
const portfolioNoteKey='pulzzo.backoffice.collectionNotes.v1';
function portfolioDate(value){
  const s=String(value||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';
  const d=new Date(s+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===s?s:'';
}
function portfolioToday(){return dispersionBusinessDateMX();}
function portfolioFormatDate(iso){const date=portfolioDate(iso);if(!date)return '';const parts=date.split('-');return parts[2]+'/'+parts[1]+'/'+parts[0];}
function portfolioFormatMoney(n){return Number(n||0).toLocaleString('es-MX',{style:'currency',currency:'MXN',minimumFractionDigits:2,maximumFractionDigits:2});}
function portfolioMonthEnd(ym){if(!/^\d{4}-\d{2}$/.test(String(ym||'')))return '';const parts=ym.split('-').map(Number),last=new Date(Date.UTC(parts[0],parts[1],0)).getUTCDate();return ym+'-'+String(last).padStart(2,'0');}
function portfolioPreviousMonthEnd(day){return portfolioMonthEnd(portfolioShiftMonth(String(day||portfolioToday()).slice(0,7),-1));}
function portfolioAsOf(){const today=portfolioToday(),cut=portfolioDate(portfolioState.cutDate);return cut&&cut<today?cut:today;}
function portfolioResolveAsOf(asOf){const today=portfolioToday(),date=portfolioDate(asOf);if(!date||date>=today)return {date:today,historical:false};return {date,historical:true};}
function portfolioSetCut(value){const today=portfolioToday(),date=portfolioDate(value);portfolioState.cutDate=date&&date<today?date:'';if(portfolioState.tab==='summary')renderPortfolioBody();}
function portfolioSetCutPreset(preset){portfolioState.cutDate=preset==='previous-month'?portfolioPreviousMonthEnd(portfolioToday()):'';if(portfolioState.tab==='summary')renderPortfolioBody();}
function portfolioDatePlus(date,days){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function portfolioInDates(date){return (!portfolioState.from||date&&date>=portfolioState.from)&&(!portfolioState.to||date&&date<=portfolioState.to);}
function portfolioDisbursed(p){const a=p.application||{};return !!(a.dispersionDate||a.disbursedAt||a.dispersedAt||p.dispersionDate||p.disbursedAt||(a.providerDispersions||[]).some(r=>r.dispersionDate));}
// v70 · D-15: el pendiente por cuota se guarda redondeado a centavos (antes 4595.139999… en APP-CARTERA-1005).
function portfolioPending(row){return dispersionExtensionIsClosedRow(row)?0:roundToCents(Math.max(dispersionNumber(row.pendingAmount,dispersionNumber(row.totalPayment,0)-dispersionNumber(row.paidAmount,0)),0));}
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
  if(!portfolioCasoPruebaMatches(c))return false;
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
function portfolioMetrics(credits,receiptCredits=portfolioReceiptCredits(credits).filter(portfolioMatches),asOf){
  const active=credits.filter(c=>!c.settled),today=portfolioDate(asOf)||portfolioToday(),month=today.slice(0,7),moves=portfolioMovements(receiptCredits).filter(m=>m.date&&m.date<=today);
  return {active:active.length,principal:roundToCents(active.reduce((s,c)=>s+c.outstanding,0)),overdue:roundToCents(active.reduce((s,c)=>s+c.overdue,0)),latePrincipal:roundToCents(active.filter(c=>c.overdue>0).reduce((s,c)=>s+c.outstanding,0)),received:roundToCents(moves.filter(m=>m.date.startsWith(month)).reduce((s,m)=>s+dispersionNumber(m.amountReceived,0),0)),upcoming:roundToCents(active.flatMap(c=>c.installments).filter(r=>r.pending>0&&r.date>=today&&r.date<=portfolioDatePlus(today,30)).reduce((s,r)=>s+r.pending,0))};
}
function portfolioReadNotes(){try{const value=localStorage.getItem(portfolioNoteKey);if(!value)return {notes:[],ok:true};const notes=JSON.parse(value);if(!Array.isArray(notes))throw new Error('invalid');return {notes:notes.filter(n=>n&&typeof n.creditId==='string'),ok:true};}catch(error){return {notes:[],ok:false};}}
function portfolioSaveNote(id,note,nextAction,nextDate){
  if(!requireCapability('manageCollections')||!requireCapability('notes'))return false;
  if(!portfolioCredits().some(c=>c.id===id)){toast('No se encontró el crédito.');return false;}
  note=String(note||'').trim();nextAction=String(nextAction||'').trim();nextDate=String(nextDate||'');
  if(!note||note.length>2000||nextAction.length>300||nextDate&&!portfolioDate(nextDate)){toast('Escribe una nota de hasta 2,000 caracteres y una fecha válida.');return false;}
  const saved=portfolioReadNotes();if(!saved.ok){toast('No se pudieron leer las notas guardadas. No se sobrescribieron.');return false;}
  const entry={creditId:id,note,nextAction,nextDate,actor:session.email,actorId:session.id,createdAt:new Date().toISOString()};
  try{localStorage.setItem(portfolioNoteKey,JSON.stringify([...saved.notes,entry]));}catch(error){toast('No se guardó la nota: almacenamiento local no disponible. Conserva el texto e inténtalo de nuevo.');return false;}
  closeModal();renderPortfolio();toast('Gestión guardada en esta demo local.');return true;
}
function portfolioOpenNote(id){
  if(!requireCapability('manageCollections')||!requireCapability('notes'))return false;const c=portfolioCredits().find(c=>c.id===id);if(!c)return false;
  modal(`<div class="modal-head"><div><h3>Registrar gestión</h3><p>${escapeHtml(c.code)} · ${escapeHtml(c.name)}</p></div><button class="x" onclick="closeModal()" aria-label="Cerrar">×</button></div><div class="modal-body"><label class="field">Nota interna<textarea id="portfolioNoteText" maxlength="2000" rows="4"></textarea></label><label class="field">Próxima acción<input id="portfolioNextAction" maxlength="300" placeholder="Acción manual pendiente"></label><label class="field">Fecha de seguimiento<input id="portfolioNextDate" type="date"></label><p class="muted">Registro local interno. No envía mensajes ni realiza contactos.</p></div><div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button id="portfolioSaveNote" class="btn btn-primary">Guardar gestión</button></div>`);
  $('#portfolioSaveNote').onclick=()=>portfolioSaveNote(id,$('#portfolioNoteText').value,$('#portfolioNextAction').value,$('#portfolioNextDate').value);$('#portfolioNoteText').focus();return true;
}
function portfolioOpenCredit(id,action='detail',rowId=''){
  const c=portfolioReceiptCredits().find(c=>c.id===id);if(!c)return false;
  if(action==='payment'){
    if(!requireCapability('registerPayments')||!portfolioCanPayCredit(c))return false;
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
  portfolioSetFiltersOpen(false,false);portfolioState.tab=tab;portfolioState.due='all';portfolioState.movementMonth='';portfolioState.collectionFocus='';if(typeof carteraClearDigest==='function')carteraClearDigest();renderPortfolio();document.getElementById('portfolioTab-'+tab)?.focus();
}
function portfolioOpenCollections(focus){
  const allowed=['cobranza','vence_hoy','precobranza','sin_accion'];
  portfolioSetFiltersOpen(false,false);
  portfolioState.tab='collections';portfolioState.due='all';portfolioState.from='';portfolioState.to='';portfolioState.movementMonth='';portfolioState.creditState='active';portfolioState.stage='all';portfolioState.aging='all';
  portfolioState.collectionFocus=allowed.includes(focus)?focus:'';
  if(typeof carteraClearDigest==='function')carteraClearDigest();
  renderPortfolio();document.getElementById('portfolioTab-collections')?.focus();
}
function portfolioDrill(kind){
  portfolioSetFiltersOpen(false,false);
  portfolioState.creditState='active';portfolioState.due='all';portfolioState.from='';portfolioState.to='';portfolioState.movementMonth='';
  const day=portfolioAsOf();
  if(kind==='received'){portfolioState.tab='movements';portfolioState.movementMonth=day.slice(0,7);}
  else if(['overdue','latePrincipal'].includes(kind)){portfolioState.tab='credits';portfolioState.due='late';}
  else if(kind==='upcoming'){portfolioState.tab='calendar';portfolioState.due='pending';portfolioState.from=day;portfolioState.to=portfolioDatePlus(day,30);}
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
function portfolioFilterConfig(){const tab=portfolioState.tab;return {credit:['credits','calendar','collections'].includes(tab),dates:tab!=='summary',due:['credits','calendar'].includes(tab),month:tab==='movements',stage:tab==='collections',aging:tab==='collections'};}
function portfolioStageOptions(){return [['all','Todas'],['al_corriente','Al corriente'],['precobranza','Precobranza'],['vence_hoy','Vence hoy'],['seguimiento','Seguimiento'],['mora_temprana','Mora 31–60'],['candidato_reestructura','Candidato reestructura'],['candidato_externa','Cobranza externa']];}
function portfolioAgingOptions(){return [['all','Todos'],['current','Al corriente (0)'],['d30','1–30'],['d60','31–60'],['d90','61–90'],['d91','90+']];}
function portfolioOptionText(options,value){const found=(options||[]).find(item=>item[0]===value);return found?found[1]:value;}
function portfolioActiveFilters(){
  const f=portfolioFilterConfig(),s=portfolioState,filters=[];
  if(s.query)filters.push(['query','Búsqueda: '+s.query]);
  if(s.casos==='only')filters.push(['casos','Solo casos de prueba']);
  if(f.credit&&s.creditState!=='all')filters.push(['creditState','Estado: '+({active:'Activos',settled:'Liquidados',all:'Todos'}[s.creditState]||'Activos')]);
  if(f.due&&s.due!=='all')filters.push(['due','Vencimiento: '+({late:'Vencidos',today:'Hoy',upcoming:'Próximos 30 días',pending:'Con saldo pendiente'}[s.due]||s.due)]);
  if(f.stage&&s.stage&&s.stage!=='all')filters.push(['stage','Etapa: '+portfolioOptionText(portfolioStageOptions(),s.stage)]);
  if(f.aging&&s.aging&&s.aging!=='all')filters.push(['aging','Días de atraso: '+portfolioOptionText(portfolioAgingOptions(),s.aging)]);
  if(f.dates&&s.from)filters.push(['from',(f.stage?'Próximo vencimiento desde: ':'Desde: ')+portfolioFormatDate(s.from)]);
  if(f.dates&&s.to)filters.push(['to',(f.stage?'Próximo vencimiento hasta: ':'Hasta: ')+portfolioFormatDate(s.to)]);
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
  const defaults={query:'',creditState:'all',due:'all',from:'',to:'',movementMonth:'',stage:'all',aging:'all',casos:'all'};if(!Object.prototype.hasOwnProperty.call(defaults,key))return;
  portfolioState[key]=defaults[key];renderPortfolio();
  const mobile=typeof window.matchMedia==='function'&&window.matchMedia('(max-width: 820px)').matches;
  document.getElementById(mobile&&!portfolioState.filterOpen?'portfolioFilterToggle':'portfolioSearch')?.focus();
}
function renderPortfolio(){
  portfolioReleaseFilterBackground();
  const tab=portfolioState.tab,f=portfolioFilterConfig(),more=f.due||f.month,sheet=tab==='collections';
  $('#portfolio').innerHTML=`<div class="portfolio-head portfolio-head-compact"><div><p>Consulta saldos, vencimientos y pagos de tus créditos.</p></div><span class="pill pill-aqua">Demo local</span></div>
  <div class="portfolio-tabs" role="tablist" aria-label="Secciones de cartera">${portfolioTabs.map(([id,label])=>`<button role="tab" id="portfolioTab-${id}" aria-controls="portfolioContent" aria-selected="${id===tab}" tabindex="${id===tab?'0':'-1'}" data-portfolio-tab="${id}">${label}</button>`).join('')}</div>
  <div class="portfolio-filter-toolbar"><button id="portfolioFilterToggle" class="btn btn-secondary portfolio-filter-mobile-toggle" aria-controls="portfolioFilterShell" aria-expanded="${portfolioState.filterOpen}">Filtros <span id="portfolioFilterCount"></span></button><span class="portfolio-filter-context">${tab==='summary'?'Corte al '+escapeHtml(portfolioFormatDate(portfolioAsOf()))+' · MXN':'Filtra la consulta · importes en MXN'}</span></div>
  <div id="portfolioFilterBackdrop" class="portfolio-filter-backdrop" hidden></div>
  <section id="portfolioFilterShell" class="portfolio-filter-shell portfolio-filters${sheet?' is-sheet':''}${portfolioState.filterOpen?' is-open':''}">
    <div class="portfolio-filter-heading"><h3 id="portfolioFilterTitle">Filtrar cartera</h3><button id="portfolioFilterClose" class="btn btn-secondary portfolio-filter-close" aria-label="Cerrar filtros">Cerrar</button></div>
    <div class="portfolio-filter-main"><label class="portfolio-search">${sheet?'Buscar':'Crédito o cliente'}<input id="portfolioSearch" type="search" placeholder="Nombre o dato del cliente"${sheet?'':' aria-describedby="portfolioSearchHelp"'} value="${escapeAttr(portfolioState.query)}"></label>
      ${f.credit?portfolioSelect('portfolioCreditState','Estado',portfolioState.creditState,[['active','Activos'],['settled','Liquidados'],['all','Todos']],'portfolio-filter-status'):''}
      ${f.stage?portfolioSelect('portfolioStage','Etapa',portfolioState.stage||'all',portfolioStageOptions(),'portfolio-filter-stage'):''}
      ${f.aging?portfolioSelect('portfolioAging','Días de atraso',portfolioState.aging||'all',portfolioAgingOptions(),'portfolio-filter-aging'):''}
      ${f.dates?`<label class="portfolio-filter-date">${sheet?'Venc. desde':'Desde'}<input id="portfolioFrom" type="date" lang="es-MX" aria-label="${sheet?'Próximo vencimiento desde':'Desde'}" value="${escapeAttr(portfolioState.from)}"></label><label class="portfolio-filter-date">${sheet?'Venc. hasta':'Hasta'}<input id="portfolioTo" type="date" lang="es-MX" aria-label="${sheet?'Próximo vencimiento hasta':'Hasta'}" value="${escapeAttr(portfolioState.to)}"></label>`:''}
      <div class="portfolio-filter-buttons">${portfolioCasosPruebaToggle()}${more?`<button id="portfolioMoreToggle" class="btn btn-secondary" aria-controls="portfolioMoreFilters" aria-expanded="${portfolioState.moreFilters}">Más filtros</button>`:''}<button class="btn btn-secondary" id="portfolioClear">Limpiar</button></div>
    </div>
    ${sheet?'':`<p id="portfolioSearchHelp" class="portfolio-search-help">Busca por teléfono, RFC, CURP, nombre, número de crédito o correo electrónico.</p>`}
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
  for(const [id,key] of [['portfolioCreditState','creditState'],['portfolioDue','due'],['portfolioStage','stage'],['portfolioAging','aging'],['portfolioFrom','from'],['portfolioTo','to'],['portfolioMonth','movementMonth']]){const el=document.getElementById(id);if(el)el.onchange=e=>{portfolioState[key]=e.target.value;renderPortfolioBody();portfolioRenderFilterChips();};}
  $('#portfolioClear').onclick=()=>{Object.assign(portfolioState,{query:'',creditState:'active',due:'all',from:'',to:'',movementMonth:'',collectionFocus:'',stage:'all',aging:'all',casos:'all'});if(typeof carteraClearDigest==='function')carteraClearDigest();renderPortfolio();$('#portfolioSearch').focus();};
  $('#portfolioFilterToggle').onclick=()=>portfolioSetFiltersOpen(!portfolioState.filterOpen);
  for(const id of ['portfolioFilterClose','portfolioFilterDone','portfolioFilterBackdrop'])document.getElementById(id).onclick=()=>portfolioSetFiltersOpen(false);
  const moreToggle=document.getElementById('portfolioMoreToggle');if(moreToggle)moreToggle.onclick=portfolioToggleMore;
  const casosToggle=document.getElementById('portfolioCasosToggle');if(casosToggle)casosToggle.onclick=()=>{portfolioState.casos=portfolioState.casos==='only'?'all':'only';renderPortfolio();document.getElementById('portfolioCasosToggle')?.focus();};
  renderPortfolioBody();portfolioRenderFilterChips();if(portfolioState.filterOpen)portfolioSetFiltersOpen(true,false);
}
function portfolioCreditCell(c){return `<button class="portfolio-link" data-credit="${escapeAttr(c.id)}" data-action="detail">${escapeHtml(c.name)}</button><small>${escapeHtml(c.code)}</small>${c.disbursed===false?'<small>Crédito aún no dispersado</small>':''}${portfolioPlazoExtendidoBadge(c)}${portfolioCasoPruebaBadge(c)}`;}
// v65: crédito con plazo extendido (cuota nueva al final por extensión de la última cuota).
function portfolioPlazoExtendido(c){const m=c&&c.record&&c.record.application&&c.record.application.plazoExtendido;return m&&m.newEnd?m:null;}
function portfolioPlazoExtendidoBadge(c){const m=portfolioPlazoExtendido(c);return m?`<small class="portfolio-plazo-extendido" data-plazo-extendido="1">Plazo extendido · nuevo fin ${escapeHtml(String(m.newEnd).replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$3/$2/$1'))}</small>`:'';}
function portfolioCanPayCredit(c){return can('registerPayments')&&!c.settled&&dispersionContractSigned(JSON.parse(JSON.stringify(c.record)));}
function portfolioActionCell(c,rowId=''){return `<div class="portfolio-actions"><button class="btn btn-sm btn-secondary" data-credit="${escapeAttr(c.id)}" data-action="detail" aria-label="Ver crédito ${escapeAttr(c.code)}">Ver crédito</button>${portfolioCanPayCredit(c)?`<button class="btn btn-sm btn-primary" data-credit="${escapeAttr(c.id)}" data-action="payment" data-row="${escapeAttr(rowId)}" aria-label="Registrar pago de ${escapeAttr(c.code)}">Registrar pago</button>`:''}</div>`;}
function portfolioStatus(c){return `<span class="pill portfolio-status ${c.settled?'pill-green':c.overdue?'pill-amber':'pill-aqua'}">${c.settled?'Liquidado':c.overdue?'En mora':'Activo'}</span>`;}
function portfolioCardValues(values){return `<dl class="portfolio-card-values">${values.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;}
function portfolioTable(headers,rows,countLabel,cards=[]){return `<p class="portfolio-count" role="status" aria-live="polite">${rows.length} ${countLabel}</p><div class="table-wrap portfolio-desktop-table" tabindex="0" aria-label="Tabla de cartera; desplaza horizontalmente para ver todas las columnas"><table class="portfolio-table"><thead><tr>${headers.map(h=>`<th scope="col"${Array.isArray(h)?` class="${h[1]}"`:''}>${Array.isArray(h)?h[0]:h}</th>`).join('')}</tr></thead><tbody>${rows.join('')||`<tr><td colspan="${headers.length}" class="portfolio-empty">Sin resultados con estos filtros.</td></tr>`}</tbody></table></div><div class="portfolio-mobile-cards">${cards.join('')||'<p class="portfolio-empty">Sin resultados con estos filtros.</p>'}</div>`;}
function portfolioCreditCard(c){return `<article class="portfolio-mobile-card"><div class="portfolio-card-head"><div>${portfolioCreditCell(c)}</div>${portfolioStatus(c)}</div>${portfolioCardValues([['Capital pendiente',portfolioFormatMoney(c.outstanding)],['Vencido',portfolioFormatMoney(c.overdue)],['Próxima cuota',c.next?`${portfolioFormatMoney(c.next.pending)}<small>${escapeHtml(portfolioFormatDate(c.next.date)||c.next.date)}</small>`:'Sin pendientes']])}<details><summary>Datos del crédito</summary><p>Proveedor: ${escapeHtml(c.terms.provider||'No registrado')}</p></details><div class="portfolio-card-actions">${portfolioActionCell(c)}</div></article>`;}
function portfolioDaysBetween(from,to){
  const start=portfolioDate(from),end=portfolioDate(to);
  if(!start||!end)return null;
  return Math.round((Date.parse(end+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000);
}
function portfolioCreditDpd(credit,today){
  today=today||portfolioToday();
  const overdue=(credit.installments||[]).filter(row=>row.pending>0&&row.date&&row.date<today);
  if(!overdue.length)return 0;
  const oldest=overdue.map(row=>row.date).sort()[0];
  return Math.max(portfolioDaysBetween(oldest,today)||0,0);
}
function portfolioAgingId(dpd){
  if(dpd<=0)return 'current';
  if(dpd<=30)return 'd30';
  if(dpd<=60)return 'd60';
  if(dpd<=90)return 'd90';
  return 'd91';
}
function portfolioPrecobranzaDays(){
  try{
    if(typeof carteraCobranzaRead==='function'){
      const days=Number(carteraCobranzaRead().days&&carteraCobranzaRead().days.precobranza);
      if(Number.isInteger(days)&&days>=0)return days;
    }
  }catch(error){}
  return 3;
}
function portfolioCollectionBucket(credit,today){
  today=today||portfolioToday();
  if(!credit||credit.settled)return '';
  if(typeof carteraCollectionStage==='function'){
    try{
      const stage=carteraCollectionStage(credit,today)||{};
      const id=stage.id||'';
      if((stage.dpd||0)>0||['cobranza_1','cobranza_3','seguimiento','mora_temprana','candidato_reestructura','candidato_externa'].includes(id))return 'cobranza';
      if(id==='vence_hoy'||id==='acuerdo_hoy')return 'vence_hoy';
      if(id==='precobranza')return 'precobranza';
      return 'sin_accion';
    }catch(error){}
  }
  if(portfolioCreditDpd(credit,today)>0)return 'cobranza';
  const next=(credit.installments||[]).filter(row=>row.pending>0&&row.date&&row.date>=today).sort((a,b)=>a.date.localeCompare(b.date))[0];
  if(next&&next.date===today)return 'vence_hoy';
  const until=next?portfolioDaysBetween(today,next.date):null;
  if(until===portfolioPrecobranzaDays())return 'precobranza';
  return 'sin_accion';
}
function portfolioCollectionCounts(credits,today){
  const counts={cobranza:0,vence_hoy:0,precobranza:0,sin_accion:0};
  for(const credit of credits||[]){const bucket=portfolioCollectionBucket(credit,today);if(Object.prototype.hasOwnProperty.call(counts,bucket))counts[bucket]+=1;}
  return counts;
}
function portfolioShiftMonth(ym,offset){
  const parts=String(ym||'').split('-'),year=Number(parts[0]),month=Number(parts[1]);
  if(!year||!month)return '';
  const date=new Date(Date.UTC(year,month-1+offset,1));
  return date.getUTCFullYear()+'-'+String(date.getUTCMonth()+1).padStart(2,'0');
}
function portfolioMonthLabel(ym){
  const parts=String(ym||'').split('-'),year=Number(parts[0]),month=Number(parts[1]);
  if(!year||!month)return '';
  try{return new Intl.DateTimeFormat('es-MX',{month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,1,12))).replace(/\./g,'');}
  catch(error){return ym;}
}
function portfolioScheduledAmount(item){
  const row=item.row||{};
  const explicit=dispersionNumber(row.totalPayment,NaN);
  if(Number.isFinite(explicit)&&explicit>0)return roundToCents(explicit);
  return roundToCents(Math.max(0,item.pending)+Math.max(0,dispersionNumber(row.paidAmount,0)));
}
function portfolioDisbursedAmount(record,asOf){
  const app=record&&record.application||{},offer=record&&record.offer||{},cut=portfolioDate(asOf);
  const rows=Array.isArray(app.providerDispersions)&&app.providerDispersions.length?app.providerDispersions:(Array.isArray(offer.providerDispersions)?offer.providerDispersions:[]);
  const released=rows.filter(row=>{
    const dispersed=typeof dispersionProviderIsDispersed==='function'?dispersionProviderIsDispersed(row):['dispersada','dispersado','dispersed','paid','pagado','pagada'].includes(String(row&&row.status||'').trim().toLowerCase())||/^\d{4}-\d{2}-\d{2}$/.test(String(row&&(row.dispersionDate||row.dispersedAt)||'').slice(0,10));
    if(!dispersed)return false;
    if(!cut)return true;
    const date=portfolioDate(row&&(row.dispersionDate||row.dispersedAt));
    return !date||date<=cut;
  });
  if(released.length)return roundToCents(released.reduce((sum,row)=>sum+dispersionNumber(row.amount!=null?row.amount:row.cost!=null?row.cost:row.monto,0),0));
  const direct=dispersionNumber(app.amountToDisperse!=null?app.amountToDisperse:offer.amountToDisperse,NaN);
  if(Number.isFinite(direct)&&direct>0)return roundToCents(direct);
  return null;
}
function portfolioNetDisbursed(credits,asOf){
  return roundToCents((credits||[]).reduce((sum,credit)=>{
    const known=portfolioDisbursedAmount(credit.record,asOf);
    if(known!=null)return sum+known;
    return sum+(credit.installments||[]).reduce((inner,item)=>inner+Math.max(0,dispersionNumber((item.row||{}).capital,0)),0);
  },0));
}
function portfolioContractualPending(credits){
  let interest=0;
  for(const credit of credits||[]){
    if(credit.settled)continue;
    for(const item of credit.installments||[]){
      const row=item.row||{};
      const pending=typeof dispersionInterestPendingForSettlement==='function'?dispersionInterestPendingForSettlement(row):dispersionNumber(row.interestPending,0);
      if(pending>0)interest+=pending;
    }
  }
  const capital=roundToCents((credits||[]).reduce((sum,credit)=>sum+(credit.settled?0:dispersionNumber(credit.outstanding,0)),0));
  interest=roundToCents(interest);
  return {capital,interest,total:roundToCents(capital+interest)};
}
function portfolioAgingBuckets(credits,today){
  const defs=[{id:'current',label:'Al corriente',color:'#20C7D4'},{id:'d30',label:'1-30',color:'#DC2626'},{id:'d60',label:'31-60',color:'#DC2626'},{id:'d90',label:'61-90',color:'#DC2626'},{id:'d91',label:'90+',color:'#DC2626'},{id:'settled',label:'Liquidado',color:'#20C7D4'}];
  const map=Object.fromEntries(defs.map(item=>[item.id,{...item,capital:0,count:0}]));
  for(const credit of credits||[]){
    const id=credit.settled?'settled':portfolioAgingId(portfolioCreditDpd(credit,today));
    const bucket=map[id];
    bucket.count+=1;
    bucket.capital+=credit.settled?0:dispersionNumber(credit.outstanding,0);
  }
  return defs.map(item=>{const bucket=map[item.id];bucket.capital=roundToCents(bucket.capital);return bucket;});
}
function portfolioMonthSeries(credits,today){
  const anchor=portfolioDate(today)||portfolioToday();
  const start=anchor.slice(0,7);
  const moves=portfolioMovements(portfolioReceiptCredits(credits).filter(portfolioMatches)).filter(move=>move.date&&move.date<=anchor);
  const months=[];
  for(let index=0;index<12;index++){
    const month=portfolioShiftMonth(start,index);
    const scheduled=roundToCents((credits||[]).flatMap(credit=>credit.installments||[]).filter(row=>row.date&&row.date.startsWith(month)).reduce((sum,row)=>sum+portfolioScheduledAmount(row),0));
    const collected=roundToCents(moves.filter(move=>move.date&&String(move.date).startsWith(month)).reduce((sum,move)=>sum+dispersionNumber(move.amountReceived,0),0));
    months.push({month,label:portfolioMonthLabel(month),scheduled,collected,current:month===anchor.slice(0,7)});
  }
  return months;
}
function portfolioPaymentDate(payment){return portfolioDate(payment&&(payment.effectiveDate||payment.date||payment.createdAt));}
function portfolioRecordDispersionDate(record){
  const app=record&&record.application||{};
  const dates=[app.dispersionDate,app.disbursedAt,app.dispersedAt,record&&record.dispersionDate,record&&record.disbursedAt].map(portfolioDate).filter(Boolean);
  for(const row of [...(app.providerDispersions||[]),...((record&&record.offer||{}).providerDispersions||[])]){const date=portfolioDate(row&&(row.dispersionDate||row.dispersedAt));if(date)dates.push(date);}
  return dates.sort()[0]||'';
}
function portfolioScheduleShowsPayment(rows){
  return (rows||[]).some(row=>dispersionNumber(row.paidAmount,0)>0||dispersionNumber(row.capitalPaid,0)>0||['Pagado','Pagado anticipado','Parcial','Parcial anticipado','Liquidado anticipadamente','Cancelada por liquidación'].includes(String(row.status||'')));
}
function portfolioConceptDef(concept){
  const name=String(concept||'');
  const defs=typeof dispersionConceptDefs==='function'?dispersionConceptDefs():[];
  return defs.find(def=>[def.key,def.total,def.paid,def.pending,def.label].includes(name))||null;
}
function portfolioUnwindRows(rows,payments){
  const copy=JSON.parse(JSON.stringify(rows||[]));
  const byId=new Map(copy.map(row=>[String(row.id),row]));
  for(const payment of payments||[]){
    const direction=payment.reversalOf?-1:1;
    for(const alloc of payment.allocations||[]){
      const row=byId.get(String(alloc.rowId||alloc.installmentId||alloc.id||''));
      const def=portfolioConceptDef(alloc.concept);
      const amount=roundToCents(dispersionNumber(alloc.amount,0)*direction);
      if(!row||!def||direction>0&&dispersionNumber(row[def.paid],0)+0.001<amount)return null;
      row[def.paid]=roundToCents(Math.max(0,dispersionNumber(row[def.paid],0)-amount));
      if(Object.prototype.hasOwnProperty.call(row,def.total))row[def.pending]=roundToCents(Math.max(dispersionNumber(row[def.total],0)-dispersionNumber(row[def.paid],0),0));
    }
  }
  for(const row of copy){
    if(typeof dispersionHydrateConcepts==='function'){try{dispersionHydrateConcepts(row,row);}catch(error){}}
    if(dispersionNumber(row.pendingAmount,0)>0&&['Pagado','Pagado anticipado'].includes(String(row.status||'')))row.status='Pendiente';
  }
  return copy;
}
function portfolioRebuildRows(record){
  const clone=JSON.parse(JSON.stringify(record||{}));
  clone.payments=[];clone.paymentSchedule=[];
  if(clone.application)clone.application.earlySettlementApplied=false;
  let built=[];
  try{built=typeof dispersionBuildSchedule==='function'?dispersionBuildSchedule(clone)||[]:[];}catch(error){return null;}
  return built.some(row=>dispersionNumber(row.capital,0)>0||dispersionNumber(row.capitalPending,0)>0||dispersionNumber(row.pendingAmount,0)>0||dispersionNumber(row.totalPayment,0)>0)?built:null;
}
function portfolioMapCredit(record,rows,today,notes){
  const seen=new Set();
  const unique=(rows||[]).filter(row=>{const key=String(row&&row.id);if(seen.has(key))return false;seen.add(key);return true;});
  const installments=unique.map(row=>({row,id:row.id,date:portfolioDate(row.currentDueDate||row.dueDate),original:portfolioDate(row.originalDueDate||row.dueDate),pending:portfolioPending(row)}));
  const outstanding=roundToCents(dispersionActiveCapitalRowsForSettlement(unique).reduce((sum,row)=>sum+dispersionCapitalPendingForSettlement(row),0));
  const settled=dispersionIsCreditLiquidated(record)||(unique.length>0&&installments.every(row=>row.pending<=0));
  const overdue=roundToCents(installments.filter(row=>row.date&&row.date<today).reduce((sum,row)=>sum+row.pending,0));
  const next=installments.filter(row=>row.pending>0&&row.date).sort((a,b)=>a.date.localeCompare(b.date))[0];
  return {record,disbursed:true,id:record.id,code:dispersionApplicationCode(record),name:record.patient?.fullName||record.name||'Sin nombre',terms:dispersionTerms(record),installments,outstanding:settled?0:outstanding,settled,overdue,next,replayNotes:notes||[]};
}
function portfolioReplayCredit(credit,asOf){
  const record=credit&&credit.record||{};
  const notes=[];
  const dispersion=portfolioRecordDispersionDate(record);
  if(dispersion&&dispersion>asOf)return {excluded:true,notes:['Los créditos dispersados después del corte no entran a la cartera.']};
  if(!dispersion)notes.push('Sin fecha de dispersión; el crédito se conserva en el corte.');
  const payments=Array.isArray(record.payments)?record.payments:[];
  if(payments.some(payment=>!portfolioPaymentDate(payment)))notes.push('Hay pagos sin fecha; no entran al corte.');
  const later=payments.filter(payment=>{const date=portfolioPaymentDate(payment);return date&&date>asOf;});
  const earlier=payments.filter(payment=>{const date=portfolioPaymentDate(payment);return date&&date<=asOf;});
  const stored=(credit.installments||[]).map(item=>item.row).filter(Boolean);
  let rows=stored;
  if(later.length&&portfolioScheduleShowsPayment(stored)){
    if(later.every(payment=>Array.isArray(payment.allocations)&&payment.allocations.length)){
      const unwound=portfolioUnwindRows(stored,later);
      if(unwound)rows=unwound;
      else notes.push('No se pudo revertir el desglose de los pagos posteriores. El saldo es el calendario guardado.');
    }else if(!earlier.length){
      const rebuilt=portfolioRebuildRows(record);
      if(rebuilt)rows=rebuilt;
      else notes.push('El saldo de capital no se pudo reconstruir cuota por cuota: los pagos posteriores no traen desglose. Se muestra el calendario guardado.');
    }else notes.push('Hay pagos anteriores y posteriores sin desglose por cuota. El saldo de capital es el calendario guardado.');
  }
  const view=JSON.parse(JSON.stringify(record));
  view.payments=(view.payments||[]).filter(payment=>{const date=portfolioPaymentDate(payment);return date&&date<=asOf;});
  if(view.application&&Array.isArray(view.application.carteraAgreements)){
    const kept=view.application.carteraAgreements.filter(item=>{const date=portfolioDate(item&&(item.agreementDate||item.createdAt||item.at));return date&&date<=asOf;});
    if(kept.length!==view.application.carteraAgreements.length)notes.push('Hay acuerdos posteriores al corte o sin fecha; no cuentan en la cobranza al corte.');
    view.application.carteraAgreements=kept;
  }
  if(view.application&&later.some(payment=>payment.paymentType==='early_settlement')){
    view.application.earlySettlementApplied=false;
    const status=String(view.application.financialStatus||view.application.creditStatus||'');
    if(status.toLowerCase().includes('liquid')){view.application.financialStatus='active';view.application.creditStatus='active';}
  }
  const mapped=portfolioMapCredit(view,rows,asOf,notes);
  const released=[...(record.application&&record.application.providerDispersions||[]),...(record.offer&&record.offer.providerDispersions||[])];
  if(released.some(row=>{const date=portfolioDate(row&&(row.dispersionDate||row.dispersedAt));const dispersed=typeof dispersionProviderIsDispersed==='function'?dispersionProviderIsDispersed(row):!!date;return dispersed&&date&&date>asOf;}))mapped.replayNotes.push('Hay dispersiones posteriores al corte; no entran al monto dispersado.');
  return mapped;
}
function portfolioReplayBook(credits,asOf){
  const notes=[],list=[];
  for(const credit of credits||[]){
    const next=portfolioReplayCredit(credit,asOf);
    if(!next||next.excluded){if(next&&next.notes)notes.push(...next.notes);continue;}
    notes.push(...(next.replayNotes||[]));
    list.push(next);
  }
  return {credits:list,notes:[...new Set(notes)]};
}
function portfolioTopClients(credits,principal){
  const groups=new Map();
  for(const credit of credits||[]){
    if(credit.settled||!(credit.outstanding>0))continue;
    const patient=credit.record&&credit.record.patient||{};
    const key=String(patient.rfc||patient.curp||credit.name||credit.id);
    if(!groups.has(key))groups.set(key,{name:credit.name,outstanding:0,credits:[]});
    const group=groups.get(key);
    group.outstanding=roundToCents(group.outstanding+credit.outstanding);
    group.credits.push(credit);
  }
  return [...groups.values()].map(group=>{
    const lead=group.credits.slice().sort((a,b)=>b.outstanding-a.outstanding||String(a.code).localeCompare(String(b.code),'es'))[0];
    return {name:group.name,outstanding:group.outstanding,creditId:lead.id,code:lead.code,share:principal>0?Math.round(group.outstanding/principal*1000)/10:0};
  }).sort((a,b)=>b.outstanding-a.outstanding||String(a.name).localeCompare(String(b.name),'es')||String(a.code).localeCompare(String(b.code),'es')).slice(0,5);
}
function portfolioUpcomingRows(credits,today){
  today=today||portfolioToday();
  const until=portfolioDatePlus(today,30);
  return (credits||[]).filter(credit=>!credit.settled).flatMap(credit=>(credit.installments||[]).filter(row=>row.pending>0&&row.date&&row.date>=today&&row.date<=until).map(row=>({credit,date:row.date,pending:row.pending,days:portfolioDaysBetween(today,row.date)||0}))).sort((a,b)=>a.date.localeCompare(b.date)||String(a.credit.code).localeCompare(String(b.credit.code),'es')).slice(0,6);
}
function portfolioShareText(value){
  const number=Number(value)||0;
  const text=Number.isInteger(number)?String(number):number.toLocaleString('es-MX',{minimumFractionDigits:1,maximumFractionDigits:1});
  return text+'%';
}
function portfolioAxisTicks(max){
  const safe=Math.max(Number(max)||0,0);
  if(!(safe>0))return [0,1];
  const raw=safe/4,pow=Math.pow(10,Math.floor(Math.log10(raw))),ratio=raw/pow;
  const step=ratio<=1?pow:ratio<=2?2*pow:ratio<=2.5?2.5*pow:ratio<=5?5*pow:10*pow;
  const ticks=[];
  for(let value=0;value<=safe*1.001;value+=step)ticks.push(roundToCents(value));
  if(ticks[ticks.length-1]<safe)ticks.push(roundToCents(ticks[ticks.length-1]+step));
  return ticks;
}
function portfolioAxisMoney(value){
  const amount=roundToCents(value),abs=Math.abs(amount),sign=amount<0?'-':'';
  if(abs>=1000000)return sign+'$'+(abs/1000000).toLocaleString('es-MX',{minimumFractionDigits:1,maximumFractionDigits:1})+'M';
  if(abs>=1000)return sign+'$'+Math.round(abs/1000).toLocaleString('es-MX')+'K';
  return sign+'$'+abs.toLocaleString('es-MX',{maximumFractionDigits:0});
}
function portfolioBarPath(x,y,w,h,r){
  const radius=Math.max(0,Math.min(r,w/2,h)),right=x+w,bottom=y+h;
  if(!(h>0)||!(w>0))return '';
  if(radius<=0)return `M${x.toFixed(1)} ${bottom.toFixed(1)}H${right.toFixed(1)}V${y.toFixed(1)}H${x.toFixed(1)}Z`;
  return `M${x.toFixed(1)} ${bottom.toFixed(1)}V${(y+radius).toFixed(1)}Q${x.toFixed(1)} ${y.toFixed(1)} ${(x+radius).toFixed(1)} ${y.toFixed(1)}H${(right-radius).toFixed(1)}Q${right.toFixed(1)} ${y.toFixed(1)} ${right.toFixed(1)} ${(y+radius).toFixed(1)}V${bottom.toFixed(1)}Z`;
}
function portfolioChartSvg(title,bars,grouped){
  const width=720,height=248,padL=52,padR=12,padT=12,padB=28;
  const plotW=width-padL-padR,plotH=height-padT-padB,slot=plotW/Math.max(bars.length,1);
  const peak=Math.max(...bars.map(bar=>Math.max(bar.value||0,bar.value2||0)),0);
  const ticks=portfolioAxisTicks(peak),scaleMax=Math.max(ticks[ticks.length-1]||1,1);
  const yOf=value=>padT+plotH-(Math.max(value,0)/scaleMax)*plotH;
  const baseline=padT+plotH;
  const grid=ticks.map(tick=>{const y=yOf(tick);return `<line class="portfolio-grid" x1="${padL}" y1="${y.toFixed(1)}" x2="${width-padR}" y2="${y.toFixed(1)}"></line><text class="portfolio-axis-label" x="${padL-6}" y="${(y+3).toFixed(1)}" text-anchor="end">${escapeHtml(portfolioAxisMoney(tick))}</text>`;}).join('');
  const shapes=bars.map((bar,index)=>{
    const x=padL+index*slot,cx=x+slot/2;
    const tipLines=grouped?[bar.label,'Programado '+portfolioFormatMoney(bar.value||0),'Cobrado '+portfolioFormatMoney(bar.value2||0)]:[bar.label,portfolioFormatMoney(bar.value||0),(bar.count||0)+' créditos'];
    const tipW=Math.min(188,Math.max(88,...tipLines.map(line=>String(line).length*6.2+16))),tipH=tipLines.length*14+10;
    let tipX=cx-tipW/2;if(tipX<4)tipX=4;if(tipX+tipW>width-4)tipX=width-4-tipW;
    const tipY=Math.max(4,yOf(Math.max(bar.value||0,bar.value2||0))-tipH-6);
    const tip=`<g class="portfolio-tip"><rect x="${tipX.toFixed(1)}" y="${tipY.toFixed(1)}" width="${tipW.toFixed(1)}" height="${tipH.toFixed(1)}" rx="4"></rect><text>${tipLines.map((line,lineIndex)=>`<tspan x="${(tipX+8).toFixed(1)}" y="${(tipY+14+lineIndex*14).toFixed(1)}">${escapeHtml(line)}</tspan>`).join('')}</text></g>`;
    if(grouped){
      const barW=Math.max(5,Math.min(9,slot*0.18)),gap=Math.max(2,Math.min(4,slot*0.06)),pair=barW*2+gap,origin=x+(slot-pair)/2;
      const h1=(bar.value||0)/scaleMax*plotH,h2=(bar.value2||0)/scaleMax*plotH;
      const mark=bar.current?`<rect class="portfolio-month-current" x="${(x+1).toFixed(1)}" y="${padT}" width="${(slot-2).toFixed(1)}" height="${plotH.toFixed(1)}"></rect>`:'';
      const scheduled=h1>0?`<path class="portfolio-svg-bar is-scheduled" d="${portfolioBarPath(origin,baseline-h1,barW,h1,2)}" style="fill:#20C7D4"><title>${escapeHtml(bar.label)} programado ${escapeHtml(portfolioFormatMoney(bar.value||0))}</title></path>`:'';
      const collected=h2>0?`<path class="portfolio-svg-bar is-collected" d="${portfolioBarPath(origin+barW+gap,baseline-h2,barW,h2,2)}" style="fill:#16A34A"><title>${escapeHtml(bar.label)} cobrado ${escapeHtml(portfolioFormatMoney(bar.value2||0))}</title></path>`:'';
      return `<g class="portfolio-bar-group${bar.current?' is-current':''}">${mark}${scheduled}${collected}${tip}</g>`;
    }
    const barW=Math.max(14,Math.min(28,slot*0.42)),h=(bar.value||0)/scaleMax*plotH;
    const path=h>0?`<path class="portfolio-svg-bar" d="${portfolioBarPath(x+(slot-barW)/2,baseline-h,barW,h,2)}" style="fill:${bar.color||'#20C7D4'}"><title>${escapeHtml(bar.label)} ${escapeHtml(portfolioFormatMoney(bar.value||0))}</title></path>`:'';
    return `<g class="portfolio-bar-group">${path}${tip}</g>`;
  }).join('');
  const labels=bars.map((bar,index)=>`<text class="portfolio-axis-label${bar.current?' is-current':''}" x="${(padL+index*slot+slot/2).toFixed(1)}" y="${height-8}" text-anchor="middle">${escapeHtml(bar.label)}</text>`).join('');
  return `<svg class="portfolio-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(title)}"><g class="portfolio-axis">${grid}<line class="portfolio-axis-line" x1="${padL}" y1="${padT}" x2="${padL}" y2="${baseline.toFixed(1)}"></line><line class="portfolio-axis-line" x1="${padL}" y1="${baseline.toFixed(1)}" x2="${width-padR}" y2="${baseline.toFixed(1)}"></line></g>${shapes}${labels}</svg>`;
}
function portfolioDashboard(credits,asOf){
  const resolved=portfolioResolveAsOf(asOf);
  const source=Array.isArray(credits)?credits:[];
  const replay=resolved.historical?portfolioReplayBook(source,resolved.date):{credits:source,notes:[]};
  const list=replay.credits;
  const today=resolved.date;
  const metrics=resolved.historical?portfolioMetrics(list,portfolioReceiptCredits(list).filter(portfolioMatches),today):portfolioMetrics(list);
  const contractual=portfolioContractualPending(list);
  const lateShare=metrics.principal>0?Math.round(metrics.latePrincipal/metrics.principal*1000)/10:0;
  return {today,historical:resolved.historical,notes:replay.notes,principal:metrics.principal,disbursed:portfolioNetDisbursed(list,resolved.historical?today:undefined),overdue:metrics.overdue,latePrincipal:metrics.latePrincipal,lateShare,received:metrics.received,upcoming:metrics.upcoming,contractual,active:metrics.active,buckets:portfolioAgingBuckets(list,today),months:portfolioMonthSeries(list,today),clients:portfolioTopClients(list,metrics.principal),dues:portfolioUpcomingRows(list,today),collections:portfolioCollectionCounts(list,today)};
}
function portfolioSummaryHtml(credits){
  const asOf=portfolioAsOf();
  const board=portfolioDashboard(credits,asOf);
  const kpis=[
    ['principal','','Cartera vigente',portfolioFormatMoney(board.principal)],
    ['disbursed','','Monto dispersado neto',portfolioFormatMoney(board.disbursed)],
    ['overdue','alert','Vencido + moratorios',portfolioFormatMoney(board.overdue)],
    ['latePrincipal','alert','% de cartera con atraso',portfolioShareText(board.lateShare)],
    ['received','good','Cobrado en el mes',portfolioFormatMoney(board.received)],
    ['upcoming','','Por cobrar próximos 30 días',portfolioFormatMoney(board.upcoming)],
    ['contractual','','Flujo contractual pendiente',portfolioFormatMoney(board.contractual.total)],
    ['active','','Créditos activos',String(board.active)]
  ];
  const agingEmpty=board.buckets.every(bucket=>!(bucket.capital>0));
  const agingBars=board.buckets.map(bucket=>({label:bucket.label,value:bucket.capital,color:bucket.color,count:bucket.count}));
  const aging=portfolioChartSvg('Saldo de capital por días de atraso',agingBars,false);
  const months=portfolioChartSvg('Programado vs. cobrado por mes',board.months.map(month=>({label:month.label,value:month.scheduled,value2:month.collected,current:month.current})),true);
  const cutStamp=portfolioFormatDate(board.today);
  const cutBar=`<header class="portfolio-sheet-head${board.historical?' is-historical':''}" data-cut="${escapeAttr(board.today)}"><div class="portfolio-cut-copy"><h2>Resumen</h2><strong>Corte al ${escapeHtml(cutStamp)}</strong><span>${board.historical?'Vista histórica de solo lectura. Solo cuentan pagos, dispersiones y cuotas hasta esta fecha.':'Vista al día de hoy, en hora de Ciudad de México.'}</span></div><div class="portfolio-cut-controls"><button type="button" class="btn btn-secondary" data-cut-preset="today" aria-pressed="${board.historical?'false':'true'}">Hoy</button><button type="button" class="btn btn-secondary" data-cut-preset="previous-month" aria-pressed="${board.today===portfolioPreviousMonthEnd(portfolioToday())?'true':'false'}">Fin del mes anterior</button><label>Corte al<input id="portfolioCutDate" type="date" max="${escapeAttr(portfolioToday())}" value="${escapeAttr(board.today)}"></label></div>${board.notes.length?`<p class="portfolio-cut-notes">${board.notes.map(note=>escapeHtml(note)).join(' ')}</p>`:''}</header>`;
  const clientRows=board.clients.map(client=>`<tr data-credit="${escapeAttr(client.creditId)}"><td class="portfolio-sheet-client"><button class="portfolio-link" data-credit="${escapeAttr(client.creditId)}" data-action="detail">${escapeHtml(client.name)}</button><small>${escapeHtml(client.code)}</small></td><td class="portfolio-number">${portfolioFormatMoney(client.outstanding)}</td><td class="portfolio-number">${portfolioShareText(client.share)}<span class="portfolio-share" aria-hidden="true"><i style="width:${Math.max(0,Math.min(100,client.share))}%"></i></span></td></tr>`).join('');
  const clientCards=board.clients.map(client=>`<article class="portfolio-mobile-card" data-credit="${escapeAttr(client.creditId)}"><button class="portfolio-link" data-credit="${escapeAttr(client.creditId)}" data-action="detail">${escapeHtml(client.name)}</button><small>${escapeHtml(client.code)}</small>${portfolioCardValues([['Saldo',portfolioFormatMoney(client.outstanding)],['% de cartera',portfolioShareText(client.share)]])}<span class="portfolio-share" aria-hidden="true"><i style="width:${Math.max(0,Math.min(100,client.share))}%"></i></span></article>`).join('');
  const dueRows=board.dues.map(row=>`<tr data-credit="${escapeAttr(row.credit.id)}"><td class="portfolio-sheet-client"><button class="portfolio-link" data-credit="${escapeAttr(row.credit.id)}" data-action="detail">${escapeHtml(row.credit.name)}</button><small>${escapeHtml(row.credit.code)}</small></td><td>${escapeHtml(portfolioFormatDate(row.date))}</td><td class="portfolio-number">${row.days===0?'Hoy':String(row.days)}</td><td class="portfolio-number">${portfolioFormatMoney(row.pending)}</td></tr>`).join('');
  const dueCards=board.dues.map(row=>`<article class="portfolio-mobile-card portfolio-priority-item" data-credit="${escapeAttr(row.credit.id)}"><button class="portfolio-link" data-credit="${escapeAttr(row.credit.id)}" data-action="detail">${escapeHtml(row.credit.name)}</button>${portfolioCardValues([['Fecha',escapeHtml(portfolioFormatDate(row.date))],['En días',row.days===0?'Hoy':String(row.days)],['Monto',portfolioFormatMoney(row.pending)]])}</article>`).join('');
  const todayCards=[['cobranza','alert','En cobranza (vencidos)',board.collections.cobranza],['vence_hoy','warn','Vence hoy',board.collections.vence_hoy],['precobranza','warn','Precobranza',board.collections.precobranza],['sin_accion','mute','Sin acción',board.collections.sin_accion]];
  const sheet=(headers,widths,rows,cards,empty)=>`<div class="portfolio-sheet-wrap"><table class="portfolio-sheet"><colgroup>${widths.map(width=>`<col style="width:${width}">`).join('')}</colgroup><thead><tr>${headers.map((header,index)=>`<th scope="col"${index?' class="portfolio-number"':''}>${header}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td class="portfolio-empty" colspan="${headers.length}">${empty}</td></tr>`}</tbody></table></div><div class="portfolio-mobile-cards">${cards||`<p class="portfolio-empty">${empty}</p>`}</div>`;
  return `${credits.length?'':'<p class="portfolio-empty">No hay créditos con esta búsqueda.</p>'}<div class="portfolio-sheet-dashboard">${cutBar}<div class="portfolio-kpis" data-dashboard="resumen">${kpis.map(([kind,accent,label,value])=>`<button class="portfolio-metric" data-drill="${kind}"${accent?` data-accent="${accent}"`:''}><span>${label}</span><strong>${value}</strong></button>`).join('')}</div>
  <div class="portfolio-charts"><section class="portfolio-chart"><h3>Saldo de capital por días de atraso</h3>${aging}${agingEmpty?'<p class="portfolio-empty">Sin saldo de capital en esta consulta.</p>':''}</section><section class="portfolio-chart"><h3>Programado vs. cobrado por mes</h3>${months}<p class="portfolio-legend"><span class="is-scheduled">Programado</span><span class="is-collected">Cobrado</span></p></section></div>
  <div class="portfolio-dashboard-split"><section class="portfolio-sheet-block"><h3>Top clientes por saldo</h3>${sheet(['Cliente','Saldo','% cartera'],['52%','24%','24%'],clientRows,clientCards,'Sin clientes con saldo en esta consulta.')}</section><section class="portfolio-sheet-block portfolio-priority-list"><h3>Próximos vencimientos</h3>${sheet(['Cliente','Fecha','En días','Monto'],['46%','22%','14%','18%'],dueRows,dueCards,'Sin vencimientos próximos en esta consulta.')}</section></div>
  <section class="portfolio-today"><h3>Cobranza de hoy</h3><div class="portfolio-today-grid">${todayCards.map(([id,tone,label,count])=>`<button type="button" class="portfolio-today-card" data-collection="${id}" data-tone="${tone}"><span>${label}</span><strong>${count}</strong></button>`).join('')}</div></section>
  <p class="portfolio-summary-note">Importes en MXN. Corte al ${escapeHtml(cutStamp)}. Los próximos vencimientos son las cuotas de los 30 días siguientes.</p></div>`;
}
// v64: un pago normal con excedente genera dos movimientos ligados (pago normal + prepago a capital).
function portfolioSplitNote(m){if(!m||!m.splitGroup)return '';const mode=m.splitModality==='reduce_cuota'?'reducir cuota':'reducir plazo';return `<small class="portfolio-split-note">${m.splitRole==='prepago'?'Excedente aplicado a prepago a capital':'Parte exigible (pago normal)'} de un pago de ${portfolioFormatMoney(m.splitReceived)}: pago normal ${portfolioFormatMoney(m.splitNormal)} + prepago ${portfolioFormatMoney(m.splitPrepay)} (${mode}).</small>`;}
function portfolioMovementDetails(m){return portfolioSplitNote(m)+`<details><summary>Detalle del movimiento</summary><p>${escapeHtml(m.reversalOf?'Reverso':dispersionPaymentTypeLabel(m.paymentType))} · ${escapeHtml(m.method||'Sin método')}<br>Referencia: ${escapeHtml(m.reference||'Sin referencia')}<br>Usuario: ${escapeHtml(m.actor||'No registrado')}</p>${(m.allocations||[]).length?m.allocations.map(a=>`<small>${escapeHtml(a.rowId||'Crédito')} · ${escapeHtml(a.concept||'Sin concepto')}: ${portfolioFormatMoney(a.amount)}</small>`).join(''):(typeof carteraExtensionMovementHtml==='function'&&carteraExtensionMovementHtml(m)?`<small>${escapeHtml(carteraExtensionMovementHtml(m))}</small>`:'<small>Sin desglose histórico</small>')}</details><button class="portfolio-link" data-credit="${escapeAttr(m.credit.id)}" data-action="movements">Ver movimientos del crédito</button>`;}
function portfolioVisibleDate(value){const formatted=portfolioFormatDate(value);return formatted||String(value||'');}
function portfolioNoteHtml(saved,creditId){const notes=saved.notes.filter(n=>n.creditId===creditId),note=notes.slice(-1)[0];return note?`${escapeHtml(note.note)}<small>${escapeHtml(note.actor)} · ${escapeHtml(portfolioVisibleDate(note.createdAt))}</small><small>${escapeHtml(note.nextAction||'Sin próxima acción')} ${escapeHtml(portfolioVisibleDate(note.nextDate))}</small><details><summary>Historial de gestiones</summary>${notes.map(n=>`<small>${escapeHtml(portfolioVisibleDate(n.createdAt))} · ${escapeHtml(n.actor)}: ${escapeHtml(n.note)} · ${escapeHtml(n.nextAction||'')} ${escapeHtml(portfolioVisibleDate(n.nextDate))}</small>`).join('')}</details>`:'Sin gestión registrada';}
function renderPortfolioBody(){
  const target=$('#portfolioContent'),all=portfolioCredits(),credits=all.filter(portfolioMatches),tab=portfolioState.tab;
  if(tab!=='summary'&&portfolioState.from&&portfolioState.to&&portfolioState.from>portfolioState.to){target.innerHTML='<p class="portfolio-warning" role="alert">La fecha desde no puede ser posterior a la fecha hasta.</p>';return;}
  if(tab==='summary')target.innerHTML=portfolioSummaryHtml(credits);
  else if(tab==='credits'){
    const filtered=portfolioState.due!=='all'||portfolioState.from||portfolioState.to,rows=all.filter(portfolioCreditMatches).filter(c=>!filtered||c.installments.some(portfolioDueMatches));
    target.innerHTML=portfolioTable(['Cliente / crédito',['Capital pendiente','portfolio-number'],['Próxima cuota','portfolio-number'],['Vencido','portfolio-number'],'Estado','Acciones'],rows.map(c=>`<tr><td>${portfolioCreditCell(c)}</td><td class="portfolio-number">${portfolioFormatMoney(c.outstanding)}</td><td class="portfolio-number">${c.next?`${portfolioFormatMoney(c.next.pending)}<small>${escapeHtml(portfolioVisibleDate(c.next.date))}</small>`:'Sin pendientes'}</td><td class="portfolio-number">${portfolioFormatMoney(c.overdue)}</td><td>${portfolioStatus(c)}</td><td>${portfolioActionCell(c)}</td></tr>`),'créditos',rows.map(portfolioCreditCard));
  }else if(tab==='movements'){
    const receiptCredits=portfolioReceiptCredits(all).filter(portfolioMatches);
    const rows=portfolioMovements(receiptCredits).filter(m=>portfolioInDates(m.date)&&(!portfolioState.movementMonth||m.date.startsWith(portfolioState.movementMonth)));
    const totals=rows.reduce((t,m)=>({received:t.received+dispersionNumber(m.amountReceived,0),applied:t.applied+dispersionNumber(m.totalApplied,0),unapplied:t.unapplied+dispersionNumber(m.unappliedAmount,0)}),{received:0,applied:0,unapplied:0});
    target.innerHTML=(can('registerPayments')?`<div class="portfolio-payment-quick"><label class="portfolio-search">Registrar pago en un crédito<select id="portfolioPaymentCredit"><option value="">Selecciona un crédito</option>${receiptCredits.filter(portfolioCanPayCredit).map(c=>`<option value="${escapeAttr(c.id)}">${escapeHtml(c.code)} · ${escapeHtml(c.name)}${c.disbursed===false?' · Aún no dispersado':''}</option>`).join('')}</select></label><button class="btn btn-primary" data-register-payment="true">Registrar pago</button></div>`:'')+`<div class="portfolio-movement-totals"><span>Recibido <strong>${portfolioFormatMoney(totals.received)}</strong></span><span>Aplicado <strong>${portfolioFormatMoney(totals.applied)}</strong></span><span>No aplicado <strong>${portfolioFormatMoney(totals.unapplied)}</strong></span></div>`+portfolioTable(['Cliente / crédito','Fecha / folio',['Recibido','portfolio-number'],['Aplicado','portfolio-number'],['No aplicado','portfolio-number'],'Detalle'],rows.map(m=>`<tr><td>${portfolioCreditCell(m.credit)}</td><td>${escapeHtml(portfolioVisibleDate(m.date)||'Sin fecha')}<small>${escapeHtml(m.receiptId||'Sin folio')}</small></td><td class="portfolio-number">${portfolioFormatMoney(m.amountReceived)}</td><td class="portfolio-number">${portfolioFormatMoney(m.totalApplied)}</td><td class="portfolio-number">${portfolioFormatMoney(m.unappliedAmount)}</td><td>${portfolioMovementDetails(m)}</td></tr>`),'movimientos',rows.map(m=>`<article class="portfolio-mobile-card"><div class="portfolio-card-head"><div>${portfolioCreditCell(m.credit)}</div><span>${escapeHtml(portfolioVisibleDate(m.date)||'Sin fecha')}</span></div><p>${escapeHtml(m.receiptId||'Sin folio')}${m.reversalOf?' · Reverso':''}</p>${portfolioCardValues([['Recibido',portfolioFormatMoney(m.amountReceived)],['Aplicado',portfolioFormatMoney(m.totalApplied)],['No aplicado',portfolioFormatMoney(m.unappliedAmount)]])}${portfolioMovementDetails(m)}</article>`));
  }else {
    let rows=all.filter(portfolioCreditMatches).flatMap(c=>c.installments.map(r=>({...r,credit:c}))).filter(portfolioDueMatches);
    if(tab==='collections')rows=rows.filter(r=>r.pending>0&&r.date&&r.date<=portfolioToday());
    rows.sort((a,b)=>a.date.localeCompare(b.date)||a.credit.code.localeCompare(b.credit.code));
    const saved=portfolioReadNotes(),status=r=>{const late=r.pending>0&&r.date&&r.date<portfolioToday();return `<span class="pill portfolio-status ${r.pending<=0?'pill-green':late?'pill-amber':'pill-aqua'}">${escapeHtml(r.row.status||'Pendiente')}</span>${late?`<small>${Math.floor((new Date(portfolioToday()+'T12:00:00Z')-new Date(r.date+'T12:00:00Z'))/86400000)} días de atraso</small>`:''}`;},noteAction=r=>tab==='collections'&&can('manageCollections')&&can('notes')?`<button class="btn btn-sm btn-secondary" data-note="${escapeAttr(r.credit.id)}">Registrar gestión</button>`:'';
    target.innerHTML=(tab==='collections'?`<p>Vencimientos hasta hoy. Gestión interna; sin contacto automático.</p>${saved.ok?'':'<p class="portfolio-warning" role="alert">No se pudieron leer las notas locales. No se sobrescribirán.</p>'}`:'<p>Una fila por cuota. Se conserva la fecha original cuando existe una prórroga.</p>')+portfolioTable(['Cliente / crédito','Cuota','Fecha vigente / original',['Pendiente','portfolio-number'],'Estado',...(tab==='collections'?['Última gestión / próxima acción']:[]),'Acciones'],rows.map(r=>`<tr><td>${portfolioCreditCell(r.credit)}</td><td>${escapeHtml(String(r.row.number||r.id))}<small>${escapeHtml(r.row.type||'Cuota')}</small></td><td>${escapeHtml(portfolioVisibleDate(r.date)||'Sin fecha')}<small>Original: ${escapeHtml(portfolioVisibleDate(r.original)||'Sin fecha')}</small>${r.date!==r.original?'<small>Prórroga / fecha ajustada</small>':''}</td><td class="portfolio-number">${portfolioFormatMoney(r.pending)}</td><td>${status(r)}</td>${tab==='collections'?`<td class="portfolio-note">${portfolioNoteHtml(saved,r.credit.id)}</td>`:''}<td>${portfolioActionCell(r.credit,r.id)}${noteAction(r)}</td></tr>`),'cuotas',rows.map(r=>`<article class="portfolio-mobile-card"><div class="portfolio-card-head"><div>${portfolioCreditCell(r.credit)}</div><div>${status(r)}</div></div>${portfolioCardValues([['Cuota',escapeHtml(String(r.row.number||r.id))],['Pendiente',portfolioFormatMoney(r.pending)],['Vencimiento',escapeHtml(portfolioVisibleDate(r.date)||'Sin fecha')]])}<details><summary>Detalle de la cuota${tab==='collections'?' y gestión':''}</summary><p>${escapeHtml(r.row.type||'Cuota')}<br>Original: ${escapeHtml(portfolioVisibleDate(r.original)||'Sin fecha')}${r.date!==r.original?'<br>Prórroga / fecha ajustada':''}</p>${tab==='collections'?`<div class="portfolio-note">${portfolioNoteHtml(saved,r.credit.id)}</div>`:''}</details><div class="portfolio-card-actions">${portfolioActionCell(r.credit,r.id)}${noteAction(r)}</div></article>`));
  }
  if(tab==='summary'){const cutInput=document.getElementById('portfolioCutDate');if(cutInput)cutInput.onchange=e=>portfolioSetCut(e.target.value);}
  target.onclick=e=>{const b=e.target.closest('button');if(b){if(b.dataset.registerPayment){const id=$('#portfolioPaymentCredit').value;if(id)portfolioOpenCredit(id,'payment');else {toast('Selecciona un crédito para registrar el pago.');$('#portfolioPaymentCredit').focus();}}else if(b.dataset.cutPreset)portfolioSetCutPreset(b.dataset.cutPreset);else if(b.dataset.digest&&typeof carteraToggleDigest==='function')carteraToggleDigest(b.dataset.digest);else if(b.dataset.collection)portfolioOpenCollections(b.dataset.collection==='clear'?'':b.dataset.collection);else if(b.dataset.drill)portfolioDrill(b.dataset.drill);else if(b.dataset.rangeFrom)portfolioDrillRange(b.dataset.rangeFrom,b.dataset.rangeTo);else if(b.dataset.credit)portfolioOpenCredit(b.dataset.credit,b.dataset.action,b.dataset.row||'');else if(b.dataset.note)portfolioOpenNote(b.dataset.note);return;}const row=e.target.closest('[data-credit]');if(row)portfolioOpenCredit(row.dataset.credit,row.dataset.action||'detail',row.dataset.row||'');};
}

// A drawer open on a phone must not leave the desktop document scroll-locked after rotation.
if(typeof window.matchMedia==='function'){
  const portfolioMobileQuery=window.matchMedia('(max-width: 820px)');
  const portfolioViewportChanged=e=>{if(!e.matches&&portfolioState.filterOpen){portfolioSetFiltersOpen(false,false);document.getElementById('portfolioSearch')?.focus();}};
  if(portfolioMobileQuery.addEventListener)portfolioMobileQuery.addEventListener('change',portfolioViewportChanged);
  else if(portfolioMobileQuery.addListener)portfolioMobileQuery.addListener(portfolioViewportChanged);
}

document.addEventListener('keydown',portfolioFilterKeydown);
// v68: casos de prueba fijos (créditos ficticios APP-PRUEBA-*). Filtro rápido y etiqueta en Cartera.
function portfolioIsCasoPrueba(c){const record=c&&c.record||c;return typeof isCasoPrueba==='function'?isCasoPrueba(record):/^APP-PRUEBA-/.test(String(record&&record.id||''));}
function portfolioCasoPruebaMatches(c){const mode=portfolioState.casos||'all';if(mode==='all')return true;const test=portfolioIsCasoPrueba(c);return mode==='only'?test:!test;}
function portfolioCasoPruebaBadge(c){if(!portfolioIsCasoPrueba(c))return '';const info=typeof carteraCasoPruebaInfo==='function'?carteraCasoPruebaInfo(c&&c.record||c):null;return `<small class="portfolio-caso-prueba" data-caso-prueba="1"${info&&info.tryText?` title="${escapeAttr('Qué probar: '+info.tryText)}"`:''}>Caso de prueba${info&&info.group?' · '+escapeHtml(info.group):''}</small>`;}
function portfolioCasosPruebaToggle(){const any=typeof db!=='undefined'&&Array.isArray(db?.patients)&&db.patients.some(p=>portfolioIsCasoPrueba(p));if(!any&&portfolioState.casos!=='only')return '';const on=portfolioState.casos==='only';return `<button type="button" id="portfolioCasosToggle" class="btn btn-secondary portfolio-casos-toggle${on?' is-active':''}" aria-pressed="${on}" title="Muestra solo los créditos ficticios de prueba (APP-PRUEBA-…)">Casos de prueba</button>`;}
// v70 · D-15: la proyección del portal usa la misma regla que Cartera; el pendiente también se entrega a centavos.
// Envoltura externa: la función en línea (con hash) no cambia.
(function(){
  const host=typeof window!=='undefined'?window:globalThis,office=host&&host.PulzzoServicingOffice;
  if(!office||typeof office.patientProjection!=='function'||office.patientProjection.v70Cents||Object.isFrozen(office))return;
  const base=office.patientProjection;
  const wrapped=function(){const out=base.apply(this,arguments);
    if(out&&Array.isArray(out.rows))out.rows.forEach(row=>{if(typeof row.pendingAmount==='number')row.pendingAmount=roundToCents(row.pendingAmount);});
    if(out&&out.summary&&typeof out.summary.nextPaymentAmount==='number')out.summary.nextPaymentAmount=roundToCents(out.summary.nextPaymentAmount);
    return out;};
  wrapped.v70Cents=true;office.patientProjection=wrapped;
})();
