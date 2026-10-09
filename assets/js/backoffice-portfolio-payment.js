/* Cartera payment surface: explicit credit identity and the existing receipt engine only. */
'use strict';
let portfolioPaymentSession=null;
function portfolioPaymentCredit(session=portfolioPaymentSession){return session?db.patients.find(p=>p.id===session.creditId):null;}
function portfolioPaymentFingerprint(p){return JSON.stringify(p);}
function portfolioPaymentConfiguration(){return typeof configRead==='function'?JSON.stringify(configRead()):'';}
function portfolioPaymentIsCurrent(){
 const s=portfolioPaymentSession,p=portfolioPaymentCredit(s);
 try{return !!(s&&p&&currentView==='portfolio'&&can('patientActions')&&s.fingerprint===portfolioPaymentFingerprint(p)&&s.configuration===portfolioPaymentConfiguration()&&localStorage.getItem(DEMO_STORAGE_KEY)===s.storageVersion);}
 catch(error){return false;}
}
function portfolioPaymentInput(){
 const value=id=>document.getElementById('portfolioPayment'+id)?.value||'';
 return {creditId:portfolioPaymentSession?.creditId,amount:value('Amount'),type:value('Type'),date:value('Date'),reference:value('Reference').trim(),method:value('Method'),target:value('Target')||'auto',settlementQuote:portfolioPaymentSession?.quote||null,retrospectiveReason:value('RetrospectiveReason').trim()};
}
function portfolioPaymentReturnFocus(){const mobile=typeof window.matchMedia==='function'&&window.matchMedia('(max-width: 820px)').matches;return document.getElementById(mobile?'portfolioFilterToggle':'portfolioSearch');}
function portfolioPaymentNotify(text){const el=document.getElementById('portfolioPaymentPreview');if(el)el.textContent=text;}
function portfolioPaymentRefresh(resetTarget=false){
 const s=portfolioPaymentSession;if(!s)return false;
 const save=document.getElementById('portfolioPaymentSave');if(save)save.disabled=true;
 if(!portfolioPaymentIsCurrent()){portfolioPaymentNotify('Los datos o permisos cambiaron. Cierra y vuelve a abrir el crédito. Si el cambio viene de otra pestaña, recarga la página antes de registrar el pago.');return false;}
 const input=portfolioPaymentInput(),p=JSON.parse(JSON.stringify(portfolioPaymentCredit())),target=document.getElementById('portfolioPaymentTarget');
 if(resetTarget&&target){target.innerHTML=dispersionPaymentTargetOptions(dispersionBuildSchedule(p),input.type,input.date);input.target=target.value||'auto';}
 if(target)target.disabled=!['ordinary','advance_installment'].includes(input.type);
 const review=document.getElementById('portfolioPaymentReview');if(review)review.innerHTML=dispersionPrepaymentReviewNoticeHtml(dispersionBuildSchedule(p));
 const hint=document.getElementById('portfolioPaymentHint');if(hint)hint.textContent=dispersionPaymentTypeCopy(input.type,p);
 const settlement=document.getElementById('portfolioPaymentSettlement');if(settlement)settlement.hidden=input.type!=='early_liquidation';
 if(s.quote&&s.quote.calculationDate!==input.date){s.quote=null;input.settlementQuote=null;}
 const quoteStatus=document.getElementById('portfolioPaymentSettlementQuote');if(quoteStatus)quoteStatus.textContent=input.type==='early_liquidation'&&s.quote?'Liquidación calculada al '+s.quote.calculationDate+': '+fmtMoney(s.quote.total)+'. Captura por separado el monto realmente recibido.':'';
 const retro=document.getElementById('portfolioPaymentRetrospective');if(retro)retro.hidden=!(input.date&&input.date<dispersionBusinessDateMX());
 const reason=document.getElementById('portfolioPaymentRetrospectiveReason');if(reason)reason.required=!!(input.date&&input.date<dispersionBusinessDateMX());
 const amount=Number(input.amount);
 if(!Number.isFinite(amount)||amount<=0||Math.abs(amount-roundToCents(amount))>0.0000001||!portfolioDate(input.date)){portfolioPaymentNotify('Captura el monto y una fecha válida para ver cómo se distribuirá el pago.');return false;}
 if(input.type==='early_liquidation'&&!s.quote){portfolioPaymentNotify('Calcula la liquidación con la fecha del pago para revisar el importe.');return false;}
 // Preview posts to a detached clone through the exact same receipt/allocation engine.
 let validationError='';
 const receipt=dispersionApplyPayment({...input,reference:input.reference||'VISTA-PREVIA-'+s.creditId},{preview:true,quiet:true,onError:message=>{validationError=message}});
 s.preview=receipt||null;
 if(!receipt){portfolioPaymentNotify(validationError||'No hay una aplicación válida con estos datos. Revisa tipo, fecha, referencia y amortización.');return false;}
 const names={capital:'Capital',interes:'Interés',ivaInteres:'IVA de interés',moratorio:'Interés moratorio',ivaMoratorio:'IVA moratorio',commission:'Comisiones',comision:'Comisiones',capital_prepay:'Prepago a capital',commission_upfront:'Comisión de apertura',commission_upfront_iva:'IVA de apertura'};
 const totals=new Map();for(const allocation of receipt.allocations||[])totals.set(allocation.concept,roundToCents((totals.get(allocation.concept)||0)+allocation.amount));
 document.getElementById('portfolioPaymentPreview').innerHTML=`<h4>Distribución del pago</h4><dl>${[...totals].map(([concept,total])=>`<div><dt>${escapeHtml(names[concept]||concept)}</dt><dd>${fmtMoney(total)}</dd></div>`).join('')}<div><dt>Total aplicado</dt><dd>${fmtMoney(receipt.totalApplied)}</dd></div><div><dt>Sobrante sin aplicar</dt><dd>${fmtMoney(receipt.unappliedAmount)}</dd></div></dl><p>Vista previa. El registro se confirma al guardar.</p>`;
 if(save)save.disabled=!input.reference||!input.method||s.saving;
 return true;
}
function portfolioPaymentCalculateSettlement(){
 if(!portfolioPaymentIsCurrent())return portfolioPaymentRefresh();
 const input=portfolioPaymentInput(),p=JSON.parse(JSON.stringify(portfolioPaymentCredit()));
 if(!portfolioDate(input.date)||!dispersionCanSimulateEarlySettlement(p,input.date)){portfolioPaymentNotify('La liquidación aún no está habilitada para este crédito o la fecha es inválida.');return false;}
 portfolioPaymentSession.quote=dispersionCalculateEarlySettlement(p,input.date);
 portfolioPaymentRefresh();return true;
}
function portfolioPaymentSave(){
 const s=portfolioPaymentSession;if(!s||s.saving||!portfolioPaymentIsCurrent())return portfolioPaymentRefresh();
 if(!portfolioPaymentRefresh())return false;
 const input=portfolioPaymentInput();if(!input.reference||!input.method)return false;
 s.saving=true;document.getElementById('portfolioPaymentSave').disabled=true;
 let saved=false;
 try{saved=dispersionApplyPayment(input,{quiet:true})===true;}
 finally{if(portfolioPaymentSession===s)s.saving=false;}
 if(!saved){portfolioPaymentRefresh();return false;}
 portfolioClosePayment(false);renderPortfolio();
 portfolioPaymentReturnFocus()?.focus({preventScroll:true});toast('Pago registrado. La cartera está actualizada.');return true;
}
function portfolioPaymentKeydown(event){
 const s=portfolioPaymentSession;if(!s)return;
 if(event.key==='Escape'){event.preventDefault();portfolioClosePayment();return;}
 if(event.key!=='Tab')return;
 const panel=document.getElementById('portfolioPaymentDrawer');
 const focusable=[...panel.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(el=>!el.closest('[hidden]'));
 if(!focusable.length){event.preventDefault();panel.focus();return;}
 const first=focusable[0],last=focusable.at(-1);
 if(event.shiftKey&&(document.activeElement===first||!panel.contains(document.activeElement))){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&(document.activeElement===last||!panel.contains(document.activeElement))){event.preventDefault();first.focus();}
}
function portfolioClosePayment(restoreFocus=true){
 const s=portfolioPaymentSession;if(!s||s.saving)return false;
 portfolioPaymentSession=null;
 document.removeEventListener('keydown',portfolioPaymentKeydown);
 document.getElementById('portfolioPaymentOverlay')?.remove();
 for(const item of s.inertNodes)item.node.inert=item.wasInert;
 document.body.classList.remove('portfolio-payment-open');
 Object.assign(document.body.style,s.bodyStyle);window.scrollTo?.(0,s.scrollY);
 if(restoreFocus){const focus=s.trigger?.isConnected?s.trigger:portfolioPaymentReturnFocus();focus?.focus({preventScroll:true});}
 return true;
}
function portfolioOpenPayment(id,rowId=''){
 if(!requireCapability('patientActions')||currentView!=='portfolio')return false;
 const source=db.patients.find(p=>p.id===id);
 if(!source||!dispersionContractSigned(source)||dispersionIsCreditLiquidated(source)){toast('Este crédito no está habilitado para registrar pagos.');return false;}
 if(portfolioPaymentSession){if(portfolioPaymentSession.saving)return false;portfolioClosePayment(false);}
 let configuration;try{configuration=portfolioPaymentConfiguration();}catch(error){toast('No se pudo validar la configuración. Revisa los datos antes de registrar un pago.');return false;}
 const p=JSON.parse(JSON.stringify(source)),rows=dispersionBuildSchedule(p),code=dispersionApplicationCode(p),name=p.patient?.fullName||p.name||'Sin nombre';
 const overlay=document.createElement('div');overlay.id='portfolioPaymentOverlay';overlay.className='portfolio-payment-overlay';
 overlay.innerHTML=`<section id="portfolioPaymentDrawer" class="portfolio-payment-drawer" role="dialog" aria-modal="true" aria-labelledby="portfolioPaymentTitle" aria-describedby="portfolioPaymentContext" tabindex="-1">
  <header class="portfolio-payment-header"><div><p>Cartera</p><h3 id="portfolioPaymentTitle">Registrar pago</h3></div><button type="button" class="btn btn-secondary" id="portfolioPaymentClose" aria-label="Cerrar registro de pago">Cerrar</button></header>
  <div class="portfolio-payment-context" id="portfolioPaymentContext"><strong>${escapeHtml(name)}</strong><span>Crédito ${escapeHtml(code)}</span></div>
  <div class="portfolio-payment-body"><div class="payment-apply-grid">
  <label class="field">Monto recibido<input id="portfolioPaymentAmount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" required></label>
  <label class="field">Tipo de pago<select id="portfolioPaymentType"><option value="ordinary">Pago ordinario</option>${dispersionUpfrontOpeningFeePending(p)>0?'<option value="commission_upfront">Comisión de apertura</option>':''}<option value="advance_installment">Pago anticipado de mensualidad</option><option value="capital_prepay">Prepago a capital</option><option value="early_liquidation">Liquidación anticipada</option></select></label>
  <label class="field">Fecha de pago<input id="portfolioPaymentDate" type="date" value="${dispersionBusinessDateMX()}" max="${dispersionBusinessDateMX()}" required></label>
  <label class="field">Método<select id="portfolioPaymentMethod"><option>SPEI</option><option>Transferencia</option><option>Tarjeta</option><option>Efectivo</option><option>Otro</option></select></label>
  <label class="field">Referencia real del pago<input id="portfolioPaymentReference" maxlength="200" autocomplete="off" placeholder="Folio o referencia de la transferencia" required></label>
  <label class="field">Aplicar a<select id="portfolioPaymentTarget">${dispersionPaymentTargetOptions(rows,'ordinary')}</select></label>
  <label class="field" id="portfolioPaymentRetrospective" hidden>Motivo del registro retroactivo (solo administrador)<textarea id="portfolioPaymentRetrospectiveReason" maxlength="500" placeholder="Explica por qué se registra hoy un pago recibido antes"></textarea></label>
  </div><p id="portfolioPaymentHint" class="muted"></p><div id="portfolioPaymentSettlement" hidden><button type="button" class="btn btn-secondary" id="portfolioPaymentCalculate">Calcular liquidación a la fecha del pago</button><p id="portfolioPaymentSettlementQuote" role="status" aria-live="polite" aria-atomic="true"></p></div>
  <div id="portfolioPaymentReview"></div><div id="portfolioPaymentPreview" class="portfolio-payment-preview" role="status" aria-live="polite" aria-atomic="true"></div></div>
  <footer class="portfolio-payment-footer"><button type="button" class="btn btn-secondary" id="portfolioPaymentCancel">Cancelar</button><button type="button" class="btn btn-primary" id="portfolioPaymentSave" disabled>Confirmar y registrar pago</button></footer></section>`;
 const inertNodes=[...document.body.children].filter(node=>!['SCRIPT','STYLE','LINK'].includes(node.tagName)).map(node=>({node,wasInert:node.inert}));
 const bodyStyle={position:document.body.style.position,top:document.body.style.top,width:document.body.style.width},scrollY=window.scrollY||0;
 portfolioPaymentSession={creditId:id,fingerprint:portfolioPaymentFingerprint(source),configuration,storageVersion:dispersionLedgerStorageVersion,trigger:document.activeElement,inertNodes,bodyStyle,scrollY,saving:false,quote:null,preview:null};
 document.body.appendChild(overlay);for(const item of inertNodes)item.node.inert=true;
 document.body.classList.add('portfolio-payment-open');Object.assign(document.body.style,{position:'fixed',top:`-${scrollY}px`,width:'100%'});
 for(const suffix of ['Close','Cancel'])document.getElementById('portfolioPayment'+suffix).onclick=()=>portfolioClosePayment();
 document.getElementById('portfolioPaymentSave').onclick=portfolioPaymentSave;
 document.getElementById('portfolioPaymentCalculate').onclick=portfolioPaymentCalculateSettlement;
 overlay.addEventListener('click',event=>{if(event.target===overlay)portfolioClosePayment();});
 for(const suffix of ['Amount','Date','Reference','Method','Target','RetrospectiveReason'])document.getElementById('portfolioPayment'+suffix).addEventListener(['Amount','Reference','RetrospectiveReason'].includes(suffix)?'input':'change',()=>portfolioPaymentRefresh(suffix==='Date'));
 document.getElementById('portfolioPaymentType').addEventListener('change',()=>portfolioPaymentRefresh(true));
 if(rowId){const row=rows.find(item=>String(item.id)===String(rowId));if(row&&dispersionIsAdvancePayableRow(row)&&!dispersionIsOrdinaryPayableRow(row)){document.getElementById('portfolioPaymentType').value='advance_installment';document.getElementById('portfolioPaymentTarget').innerHTML=dispersionPaymentTargetOptions(rows,'advance_installment');}document.getElementById('portfolioPaymentTarget').value=rowId;}
 document.addEventListener('keydown',portfolioPaymentKeydown);portfolioPaymentRefresh();document.getElementById('portfolioPaymentAmount').focus();return true;
}
// Any subsequent navigation invalidates the surface before another credit can be selected.
const portfolioPaymentOriginalSetView=setView;
setView=function(id,options={}){if(id!=='portfolio'&&typeof portfolioSetFiltersOpen==='function')portfolioSetFiltersOpen(false,false);if(portfolioPaymentSession)portfolioClosePayment(false);return portfolioPaymentOriginalSetView(id,options);};
window.addEventListener('popstate',()=>portfolioClosePayment());
window.addEventListener('hashchange',()=>portfolioClosePayment());
window.addEventListener('pagehide',()=>portfolioClosePayment(false));
