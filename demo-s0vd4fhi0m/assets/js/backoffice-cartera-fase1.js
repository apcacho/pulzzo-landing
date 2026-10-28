/* Cartera fase 1. Wraps the pinned payment engine; does not rewrite it. */
'use strict';
var carteraUiState={action:'pago',modality:'',token:'',preview:null,draft:{},hostId:'',rowId:'',surface:'',comprobante:null};
var carteraCallContext=null;
var carteraLastDuplicateWarning='';
var CARTERA_PRELACION=['ivaInteres','ivaMoratorio','commission','moratorio','moratorioSinInteres','interes','ordinarioSinInteres','capital'];
if(!globalThis.__pulzzoCarteraFase1&&typeof dispersionApplyAmountToConcepts==='function'){
globalThis.__pulzzoCarteraFase1=true;

function carteraWithContext(ctx,fn){
 const prev=carteraCallContext;carteraCallContext=ctx||null;
 try{return fn();}finally{carteraCallContext=prev;}
}
function carteraRules(p,date){
 try{if(typeof configResolveRules==='function')return configResolveRules(p,date||today());}catch(error){}
 return {ivaEnabled:true,ivaRate:.16,preventiveExtensionMax:3,preventiveFeeInsolutoRate:.02,preventiveFeeGlobalRate:.03,preventiveExtensionModality:'COLA_FINAL',restructureCommissionARate:.03,restructureCommissionBRate:.02,versionId:'config-base'};
}
function carteraIvaFactor(rules){
 if(rules&&rules.ivaEnabled===false)return 0;
 const rate=Number(rules&&rules.ivaRate);
 return Number.isFinite(rate)?rate:.16;
}
// v71 (aprobado 27/10/2026): IVA de intereses ordinarios y de moratorios con interruptor propio y vigencia;
// las comisiones (apertura, extensión, reestructura) siempre llevan IVA con el porcentaje vigente.
function carteraIvaInterestFactor(rules){return rules&&rules.ivaInterestEnabled===false?0:carteraIvaFactor(rules);}
function carteraIvaMoratoryFactor(rules){return rules&&rules.ivaMoratoryEnabled===false?0:carteraIvaFactor(rules);}
function carteraIvaCommissionFactor(rules){const rate=Number(rules&&rules.ivaRate);return Number.isFinite(rate)?rate:.16;}
function carteraResave(){
 db.__version=DEMO_VERSION;
 const serialized=JSON.stringify(db);
 localStorage.setItem(DEMO_STORAGE_KEY,serialized);
 dispersionLedgerStorageVersion=serialized;
}
function carteraMutate(p,capability,fn){
 if(!requireCapability(capability))return {ok:false,error:'Tu sesión no puede registrar esta operación.'};
 if(!(db.patients||[]).includes(p))return {ok:false,error:'El crédito no está en la cartera de esta sesión.'};
 const token=dispersionCaptureRollback(p,capability);
 if(!token)return {ok:false,error:'No se pudo abrir la operación.'};
 try{
  if(localStorage.getItem(DEMO_STORAGE_KEY)!==dispersionLedgerStorageVersion)throw Error('Los datos cambiaron en otra pestaña. Recarga antes de continuar.');
  const result=fn();
  if(!result||result.ok===false)throw Error(result&&result.error||'No se aplicó la operación.');
  carteraResave();
  dispersionRollbackSnapshots.delete(token);
  return result;
 }catch(error){
  dispersionRollbackReceipt(token);
  return {ok:false,error:error.message||'No se guardó la operación.'};
 }
}
function carteraActivePayments(p){
 const ledger=p&&p.payments||[];
 return ledger.filter(m=>m.paymentType!=='reversal'&&!ledger.some(r=>r.reversalOf&&r.reversalOf===m.receiptId));
}
function carteraAccountKey(value){return String(value||'').trim().toLowerCase();}
function carteraFindDuplicate(p,amount,cuenta,date){
 const amt=roundToCents(amount),acc=carteraAccountKey(cuenta),day=String(date||'');
 return carteraActivePayments(p).find(m=>roundToCents(m.amountReceived??m.amount)===amt&&carteraAccountKey(m.cuenta||m.carteraCuenta)===acc&&String(m.effectiveDate||m.date||'')===day)||null;
}
function carteraDuplicateMessage(){return 'Ya existe un pago con el mismo monto, cuenta y fecha en este crédito. La referencia es solo informativa.';}
function carteraAddDuplicate(p,result,input={},date){
 if(!result||result.ok===false)return result;
 const amount=roundToCents(Number(result.amount??result.total)||0);
 return {...result,duplicate:amount>0?carteraFindDuplicate(p,amount,input.cuenta||'',date||input.date||dispersionBusinessDateMX()):null};
}
function carteraAcceptDuplicate(p,input,amount,date){
 if(input.confirmDuplicate||!carteraFindDuplicate(p,amount,input.cuenta||'',date))return true;
 return typeof confirm==='function'&&confirm(carteraDuplicateMessage()+' ¿Quieres registrarlo de todos modos?');
}
function carteraEvidenceFrom(options){
 const ctx=carteraCallContext||{};
 const cuenta=String(options.cuenta??ctx.cuenta??'').trim();
 const origen=String(options.origen??ctx.origen??'').trim();
 const file=options.comprobante||ctx.comprobante||null;
 const evidence={};
 if(cuenta)evidence.cuenta=cuenta.slice(0,80);
 if(origen)evidence.origen=origen.slice(0,80);
 if(file&&file.name)evidence.comprobanteName=String(file.name).slice(0,180);
 if(file&&file.dataUrl)evidence.comprobante=String(file.dataUrl).slice(0,180000);
 else if(typeof file==='string'&&file)evidence.comprobante=file.slice(0,180000);
 return {cuenta,origen,evidence};
}
function carteraCopyEvidence(tx){
 try{
  const ticket=tx&&dispersionReceiptTransactions.get(tx);
  const evidence=ticket&&ticket.fields&&ticket.fields.carteraEvidence;
  const p=tx&&tx.patient,m=p&&p.payments&&p.payments[p.payments.length-1];
  if(!m||!evidence)return;
  Object.assign(m,evidence);
  if(Object.keys(evidence).length)m.carteraFase1=true;
 }catch(error){}
}

const carteraOriginalApplyConcepts=dispersionApplyAmountToConcepts;
dispersionApplyAmountToConcepts=function(row,amount,date,reference,method){
 let remaining=roundToCents(amount),appliedTotal=0;
 const defs=dispersionConceptDefs();
 CARTERA_PRELACION.forEach(key=>{
  const d=defs.find(item=>item.key===key);
  if(!d||remaining<=0)return;
  const total=dispersionNumber(row[d.total],0),paid=dispersionNumber(row[d.paid],0);
  const pending=roundToCents(Math.max(total-paid,0));
  if(pending<=0)return;
  const applied=roundToCents(Math.min(remaining,pending));
  row[d.paid]=roundToCents(paid+applied);
  row[d.pending]=roundToCents(Math.max(total-row[d.paid],0));
  remaining=roundToCents(remaining-applied);
  appliedTotal=roundToCents(appliedTotal+applied);
 });
 row.paidAmount=roundToCents(defs.reduce((sum,d)=>sum+dispersionNumber(row[d.paid],0),0));
 row.pendingAmount=roundToCents(defs.reduce((sum,d)=>sum+dispersionNumber(row[d.pending],0),0));
 if(appliedTotal>0){row.paymentDate=date;row.reference=reference;row.method=method;}
 row.status=row.pendingAmount<=0?'Pagado':dispersionDaysPastDue(row.currentDueDate||row.dueDate)>0?'Vencido':(row.paidAmount>0?'Parcial':row.status);
 return {applied:appliedTotal,remaining};
};
function carteraAllocateOldestFirst(rows,amount,date,reference,method){
 const ordered=[...(rows||[])].sort((a,b)=>String(a.currentDueDate||a.dueDate||'').localeCompare(String(b.currentDueDate||b.dueDate||''))||Number(a.number||0)-Number(b.number||0));
 let remaining=roundToCents(amount);
 ordered.forEach(row=>{
  if(remaining<=0)return;
  remaining=dispersionApplyAmountToConcepts(row,remaining,date,reference,method).remaining;
 });
 return {remaining,rows:ordered};
}

const carteraOriginalBeginReceipt=dispersionBeginReceipt;
dispersionBeginReceipt=function(p,amount,date,reference,method,options={}){
 if(!requireCapability(options.reversal?'reversePayments':'registerPayments'))return null;
 if(options.preview&&(options.extension||(db.patients||[]).includes(p)))return null;
 if(!options.preview&&!(db.patients||[]).includes(p))return null;
 if(options.extension){const authorization=dispersionCurrentExtensionAuthorization(p,options.extensionRowId,options.extensionDays);if(!authorization||authorization.id!==options.extensionAuthorizationId){toast('No hay una autorización vigente de Admin para este pago de prórroga.');return null;}}
 const notify=message=>{if(typeof options.onError==='function')options.onError(message);if(!options.preview&&!options.quiet)toast(message);};
 if(!options.reversal&&normalizeFinancialBreakdown(p).financialTermsReviewPending){notify(openingFeeTaxNotice(p));return null;}
 if(!Number.isFinite(Number(amount))||!Number.isSafeInteger(Math.round(Number(amount)*100))||Number(amount)<=0||Math.abs(Number(amount)-roundToCents(amount))>0.0000001||!/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))||dispersionDateOnly(date)!==date||!String(reference||'').trim()||!String(method||'').trim()){notify('Captura monto recibido con máximo dos decimales, fecha válida, método y referencia real del pago.');return null;}
 const businessDate=dispersionBusinessDateMX();
 const retrospectiveReason=String(options.retrospectiveReason||'').trim();
 if(date>businessDate){notify('No es posible registrar pagos con fecha futura. Usa la fecha real de recepción en Ciudad de México.');return null;}
 if(date<businessDate&&!can('settings')){notify('El registro retroactivo requiere autorización de administrador.');return null;}
 if(date<businessDate&&!retrospectiveReason){notify('Captura el motivo del registro retroactivo.');return null;}
 const ledger=p.payments||[];
 const laterReceipt=ledger.find(m=>m.paymentType!=='reversal'&&!ledger.some(r=>r.reversalOf&&r.reversalOf===m.receiptId)&&String(m.effectiveDate||m.date||'')>date);
 if(laterReceipt){notify('Existe una operación posterior ya registrada. No se puede insertar este pago sin reconstruir la secuencia: revisa o revierte las operaciones posteriores antes de capturarlo.');return null;}
 const captured=carteraEvidenceFrom(options);
 carteraLastDuplicateWarning='';
 if(!options.reversal){
  const duplicate=carteraFindDuplicate(p,amount,captured.cuenta,date);
  if(duplicate){
   const message='Ya existe un pago con el mismo monto, cuenta y fecha en este crédito. Confirma para registrarlo. La referencia es solo informativa.';
   carteraLastDuplicateWarning=message;
   if(!options.preview&&!options.confirmDuplicate){
    const accepted=typeof confirm==='function'&&confirm(message);
    if(!accepted){notify(message);return null;}
   }
  }
 }
 try{if(localStorage.getItem(DEMO_STORAGE_KEY)!==dispersionLedgerStorageVersion){notify('Los datos cambiaron en otra pestaña. Recarga antes de registrar el pago.');return null;}}
 catch(error){notify('No se pudo verificar el almacenamiento. El pago no se aplicó.');return null;}
 const transaction={extensionAuthorizationId:options.extension?options.extensionAuthorizationId:null,actorId:staffActor().actorId,actorName:session.name,sessionId:session.sessionId,preview:!!options.preview,quiet:!!options.quiet,onError:options.onError,patient:p,before:JSON.parse(JSON.stringify(p)),dbBefore:JSON.stringify(db),storageBefore:dispersionLedgerStorageVersion,receiptId:dispersionReceiptId(),amount:roundToCents(amount),date,reference:String(reference).trim(),method,recordedAt:new Date().toISOString(),retrospective:date<businessDate,retrospectiveReason:date<businessDate?retrospectiveReason:'',carteraEvidence:captured.evidence};
 const rollbackToken=options.preview?null:dispersionCaptureRollback(p,options.reversal?'reversePayments':'registerPayments');if(!options.preview&&!rollbackToken)return null;
 const fields={...transaction};delete fields.patient;delete fields.onError;dispersionReceiptTransactions.set(transaction,{patient:p,fields:JSON.parse(JSON.stringify(fields)),onError:transaction.onError,rollbackToken});return transaction;
};
const carteraOriginalCommitReceipt=dispersionCommitReceipt;
dispersionCommitReceipt=function(tx){carteraCopyEvidence(tx);return carteraOriginalCommitReceipt(tx);};

function carteraRowBooked(row){
 return dispersionNumber(row.ivaInteresPaid,0)>0||dispersionNumber(row.interestPaid,0)>0||dispersionNumber(row.capitalPaid,0)>0||dispersionNumber(row.paidAmount,0)>0||dispersionNumber(row.moratoryPaid,0)>0||dispersionNumber(row.ivaMoratorioPaid,0)>0||dispersionNumber(row.commissionPaid,0)>0;
}
function carteraRepriceIva(p,rows){
 if(!Array.isArray(rows))return rows;
 rows.forEach(row=>{
  if(!row||dispersionIsClosedPaymentStatus(row.status)||carteraRowBooked(row))return;
  const due=dispersionDateOnly(row.currentDueDate||row.dueDate||row.scheduledDate||'');
  const when=typeof configValidDate==='function'&&configValidDate(due)?due:today();
  const rules=carteraRules(p,when),factor=carteraIvaInterestFactor(rules),moraFactor=carteraIvaMoratoryFactor(rules);
  // A later explicit tax version may restore 16% after a previous 8%/OFF projection.
  // Keep the original base snapshot alone; never skip an applicable version merely for using 16%.
  if(Math.abs(factor-.16)<1e-9&&Math.abs(moraFactor-.16)<1e-9&&rules.versionId==='config-base')return;
  row.interestIva=roundToCents(dispersionNumber(row.interest,0)*factor);
  row.moratoryIva=roundToCents(dispersionNumber(row.moratory,0)*moraFactor);
  dispersionRecalculateRowTotals(row);
  row.payment=roundToCents(dispersionNumber(row.capital,0)+dispersionNumber(row.interest,0)+dispersionNumber(row.interestIva,0));
  row.totalPayment=roundToCents(dispersionConceptDefs().reduce((sum,d)=>sum+dispersionNumber(row[d.total],0),0));
 });
 return rows;
}
function carteraSortByDue(rows){
 if(!Array.isArray(rows))return rows;
 const due=row=>String(row.currentDueDate||row.dueDate||'');
 const ordered=rows.every((row,index)=>index===0||due(row)>=due(rows[index-1]));
 return ordered?rows:rows.slice().sort((a,b)=>due(a).localeCompare(due(b))||Number(a.number||0)-Number(b.number||0));
}
function carteraProjectLocked(p){
 const freeze=String(p.application&&p.application.preventiveMoraFreezeUntil||'');
 const todayMx=dispersionBusinessDateMX();
 const rows=(p.paymentSchedule||[]).map(row=>{
  const copy={...row};
  const pending=dispersionNumber(copy.pendingAmount,0);
  const due=String(copy.currentDueDate||copy.dueDate||'');
  if(freeze&&todayMx<=freeze){copy.dpd=0;if(copy.status==='Vencido')copy.status=pending>0&&dispersionNumber(copy.paidAmount,0)>0?'Parcial':'Pendiente';}
  else if(pending>0){copy.dpd=due?dispersionDaysPastDue(due):0;if(copy.dpd>0&&!dispersionIsClosedPaymentStatus(copy.status))copy.status='Vencido';}
  return copy;
 });
 carteraRepriceIva(p,rows);
 return carteraSortByDue(rows);
}
const carteraOriginalBuildSchedule=dispersionBuildSchedule;
dispersionBuildSchedule=function(p){
 if(p&&p.application&&p.application.carteraScheduleLock&&Array.isArray(p.paymentSchedule)&&p.paymentSchedule.length)return carteraProjectLocked(p);
 const rows=carteraOriginalBuildSchedule(p);
 carteraRepriceIva(p,rows);
 return carteraSortByDue(rows);
};
const carteraOriginalApplyPayment=dispersionApplyPayment;
dispersionApplyPayment=function(input,options){
 const read=id=>{try{return document.getElementById(id)?.value;}catch(error){return '';}};
 const ctx={cuenta:input&&input.cuenta!=null?input.cuenta:read('portfolioPaymentCuenta')||read('dispersionPaymentCuenta')||'',origen:input&&input.origen!=null?input.origen:read('portfolioPaymentOrigen')||'',comprobante:input&&input.comprobante||null};
 return carteraWithContext(ctx,()=>carteraOriginalApplyPayment(input,options));
};

function carteraPending(row,total,paid,pending){
 if(row&&Object.prototype.hasOwnProperty.call(row,pending))return Math.max(dispersionNumber(row[pending],0),0);
 return Math.max(dispersionNumber(row&&row[total],0)-dispersionNumber(row&&row[paid],0),0);
}
function carteraCapitalPending(row){return carteraPending(row,'capital','capitalPaid','capitalPending');}
function carteraOpenRows(rows){return (rows||[]).filter(row=>row&&row.type!=='Pago inicial requerido'&&!dispersionIsClosedPaymentStatus(row.status));}
function carteraDue(row){return String(row&&(row.currentDueDate||row.dueDate)||'');}
function carteraHasMora(rows){
 const todayMx=dispersionBusinessDateMX();
 return (rows||[]).some(row=>{
  if(!row||dispersionIsClosedPaymentStatus(row.status))return false;
  const mora=carteraPending(row,'moratory','moratoryPaid','moratoryPending')+carteraPending(row,'moratoryIva','ivaMoratorioPaid','ivaMoratorioPending');
  const pending=carteraCapitalPending(row)+carteraPending(row,'interest','interestPaid','interestPending');
  return mora>0.009||Number(row.dpd)>0||row.status==='Vencido'||(carteraDue(row)&&carteraDue(row)<todayMx&&pending>0.009);
 });
}
function carteraScheduleRows(p){
 const rows=Array.isArray(p.paymentSchedule)&&p.paymentSchedule.length?p.paymentSchedule:dispersionBuildSchedule(p);
 // v71: los interruptores de IVA con vigencia aplican también a las cuotas guardadas aún no pagadas (no retroactivo).
 return carteraRepriceIva(p,rows.map(row=>({...row})));
}
function carteraExtensionCount(p){return Array.isArray(p&&p.application&&p.application.preventiveExtensions)?p.application.preventiveExtensions.length:0;}
// Approved extension rule: remaining insoluto installments amortize the outstanding
// principal over their original dates. Original installment interest stays due.
function carteraExtensionInsolutoPlan(rows,source,principal,terms,rules){
 const targets=rows.filter(row=>row.id!==source.id&&carteraDue(row)>carteraDue(source)).sort((a,b)=>carteraDue(a).localeCompare(carteraDue(b)));
 if(!targets.length)return {ok:false,error:'No quedan cuotas dentro del plazo original para recalcular.'};
 if(targets.some(row=>dispersionNumber(row.paidAmount,0)>0||dispersionNumber(row.commission,0)>0||dispersionNumber(row.moratory,0)>0))return {ok:false,error:'Las cuotas siguientes tienen movimientos o cargos; requieren revisión antes de recalcular.'};
 const annual=Number(terms.ordinaryAnnualRate)||0,factor=carteraIvaInterestFactor(rules);
 let previous=carteraDue(source),product=1,discount=0;
 const periods=targets.map(row=>{const days=Math.round((Date.parse(carteraDue(row)+'T12:00:00Z')-Date.parse(previous+'T12:00:00Z'))/86400000);previous=carteraDue(row);return {id:row.id,days};});
 if(periods.some(item=>!(item.days>0)))return {ok:false,error:'Las fechas no permiten un plan de cuotas válido.'};
 periods.forEach(item=>{product*=1+annual/360*item.days*(1+factor);discount+=1/product;});
 const regularPayment=roundToCents(principal/discount);let balance=principal;
 const plan=periods.map((item,index)=>{const start=balance,interest=roundToCents(start*annual/360*item.days),interestIva=roundToCents(interest*factor),capital=index===periods.length-1?balance:roundToCents(regularPayment-interest-interestIva);balance=roundToCents(balance-capital);return {...item,capital,interest,interestIva,payment:roundToCents(capital+interest+interestIva),balanceStart:start,balanceEnd:balance};});
 if(plan.some(row=>row.capital<0||row.balanceEnd<0))return {ok:false,error:'La cuota no conserva el capital; requiere revisión.'};
 return {ok:true,rows:plan,regularPayment,finalPayment:plan.at(-1).payment};
}
// v71.1: «Corta, 30 días» en saldos insolutos (regla aprobada 27/10/2026): hoy se cobra el interés de la cuota + IVA
// y la comisión + IVA; el capital de la cuota pasa a la cuota siguiente y el interés extra de esos días (saldo más alto)
// se cobra en esa cuota siguiente, no hoy. El gancho v71 queda reemplazado por esta regla.
// v71.1 regla 5: después de una extensión «Corta», la siguiente extensión solo puede ser «Al final».
const CARTERA_CORTA_REPETIDA_MSG='Tu extensión anterior fue «Corta, 30 días». Esta vez solo puedes usar «Al final».';
function carteraLastExtensionWasCorta(p){const list=Array.isArray(p&&p.application&&p.application.preventiveExtensions)?p.application.preventiveExtensions:[];const last=list[list.length-1];return !!(last&&last.modality==='CORTA');}
function carteraQuoteExtension(p,input={}){
 const todayMx=dispersionBusinessDateMX(),rules=carteraRules(p,todayMx),rows=carteraScheduleRows(p);
 const max=Number.isInteger(rules.preventiveExtensionMax)?rules.preventiveExtensionMax:3;
 if(dispersionIsCreditLiquidated(p))return {ok:false,error:'Este crédito ya está liquidado.'};
 if(carteraHasMora(rows))return {ok:false,error:'La extensión preventiva solo está disponible si el crédito no tiene mora.'};
 if(carteraExtensionCount(p)>=max)return {ok:false,error:'Este crédito ya tiene el máximo de extensiones ('+max+'). La siguiente operación debe ser una reestructura.'};
 const candidates=carteraOpenRows(rows).filter(row=>carteraDue(row)>todayMx&&carteraCapitalPending(row)>0).sort((a,b)=>carteraDue(a).localeCompare(carteraDue(b)));
 const row=input.rowId?rows.find(item=>item.id===input.rowId):candidates[0];
 if(!row)return {ok:false,error:'No hay una cuota vigente para extender.'};
 const originalDue=carteraDue(row);
 if(!(originalDue>todayMx))return {ok:false,error:'La extensión debe pedirse antes del vencimiento de la cuota.'};
 const later=carteraOpenRows(rows).filter(item=>item.id!==row.id&&carteraDue(item)>originalDue).sort((a,b)=>carteraDue(a).localeCompare(carteraDue(b)))[0];
 const terms=dispersionTerms(p);
 // v65: la última cuota se extiende creando una cuota nueva un periodo después (plazo extendido).
 const lastCuota=!later;
 // Mensual: mismo día del mes siguiente (15/10/2027 → 15/11/2027). Quincenal: siguiente fecha del patrón de pago.
 const nextDue=later?carteraDue(later):lastCuota&&terms.paymentFrequency!=='biweekly'&&typeof dispersionAddMonthsToDateString==='function'?dispersionAddMonthsToDateString(originalDue,1):(typeof dispersionNextPeriodDateFrom==='function'?dispersionNextPeriodDateFrom(originalDue,terms):'');
 let maxDue,requested;
 if(lastCuota){
  if(input.modality==='CORTA')return {ok:false,code:carteraLastExtensionWasCorta(p)?'EXTENSION_CORTA_REPETIDA':'EXTENSION_CORTA_LAST',error:'La última cuota no admite la extensión corta; usa «Al final».'};
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(nextDue||''))||nextDue<=originalDue)return {ok:false,code:'EXTENSION_LAST_NO_PERIOD',error:'No se pudo calcular la fecha de la cuota nueva al final del plazo.'};
  maxDue=nextDue;requested=nextDue;
  if(input.newDueDate&&String(input.newDueDate)!==nextDue)return {ok:false,code:'EXTENSION_LAST_DATE',error:'En la última cuota la extensión crea una cuota nueva un periodo después: '+carteraDmy(nextDue)+'. Deja la nueva fecha vacía o usa esa fecha.'};
 }else{
  maxDue=nextDue?dispersionAddDaysToDateString(nextDue,-1):'';
  if(!maxDue||maxDue<=originalDue)return {ok:false,error:'No hay un día hábil entre esta cuota y la siguiente.'};
  requested=String(input.newDueDate||maxDue);
  if(input.modality==='CORTA'){
   // v71 «Corta, 30 días»: el capital pasa a la cuota siguiente. Globales: interés extra de 30 días hoy.
   // v71.1 insolutos: el interés extra va en la cuota siguiente (fecha de referencia = esa cuota).
   if(carteraLastExtensionWasCorta(p))return {ok:false,code:'EXTENSION_CORTA_REPETIDA',error:CARTERA_CORTA_REPETIDA_MSG};
   requested=terms.interestCalculationBase==='outstanding_balance'?nextDue:dispersionAddDaysToDateString(originalDue,30);
  }else if(!/^\d{4}-\d{2}-\d{2}$/.test(requested)||requested<=originalDue||requested>maxDue)return {ok:false,error:'La nueva fecha debe ser posterior a la cuota y como máximo un día antes de la siguiente.'};
 }
 const modality=lastCuota?'CUOTA_NUEVA_FINAL':['COLA_FINAL','PRORRATEADO','CORTA'].includes(input.modality)?input.modality:(rules.preventiveExtensionModality==='PRORRATEADO'?'PRORRATEADO':'COLA_FINAL');
 const outstanding=roundToCents(carteraOpenRows(rows).reduce((sum,item)=>sum+carteraCapitalPending(item),0));
 const cuota=roundToCents(dispersionNumber(row.payment,dispersionNumber(row.capital,0)+dispersionNumber(row.interest,0)+dispersionNumber(row.interestIva,0)));
 const insoluto=terms.interestCalculationBase==='outstanding_balance';
 if(carteraCapitalPending(row)<=0)return {ok:false,error:'La cuota no tiene capital pendiente para diferir.'};
 // v63 bloqueaba la última cuota (el capital diferido desaparecía). v65: el capital va a una cuota nueva al final; nunca se borra.
 if(insoluto&&row.id!==candidates[0]?.id)return {ok:false,error:'Selecciona la primera cuota con capital pendiente para conservar el plan completo.'};
 const feeRate=insoluto?Number(rules.preventiveFeeInsolutoRate)||0:Number(rules.preventiveFeeGlobalRate)||0;
 const fee=roundToCents((insoluto?outstanding:cuota)*feeRate);
 const factor=carteraIvaInterestFactor(rules);
 const feeVat=roundToCents(fee*carteraIvaCommissionFactor(rules));
 const interestPending=roundToCents(carteraPending(row,'interest','interestPaid','interestPending'));
 const ivaPending=roundToCents(carteraPending(row,'interestIva','ivaInteresPaid','ivaInteresPending'));
 const extraDays=Math.max(0,Math.round((Date.parse(requested+'T12:00:00Z')-Date.parse(originalDue+'T12:00:00Z'))/86400000));
 const annual=Number(terms.ordinaryAnnualRate)||0;
 const capitalDeferred=roundToCents(carteraCapitalPending(row));
 const extraInterest=insoluto?0:roundToCents(capitalDeferred*annual/360*extraDays);
 const extraIva=roundToCents(extraInterest*factor);
 const insolutoCorta=insoluto&&!lastCuota&&modality==='CORTA';
 const interestPaid=insoluto?(insolutoCorta?interestPending:0):roundToCents(interestPending+extraInterest);
 const interestIvaPaid=insoluto?(insolutoCorta?ivaPending:0):roundToCents(ivaPending+extraIva);
 const insolutoPlan=insoluto&&!lastCuota&&!insolutoCorta?carteraExtensionInsolutoPlan(rows,row,outstanding,terms,rules):null;
 // v71.1: cuota siguiente después de la extensión (portal y vista previa).
 let nextExtraInterest=0,nextExtraIva=0,nextInterestNew=null,nextIvaNew=null,nextAmountAfter=null;
 if(modality==='CORTA'&&later){
  if(insolutoCorta){
   const days=Math.max(0,Math.round((Date.parse(carteraDue(later)+'T12:00:00Z')-Date.parse(originalDue+'T12:00:00Z'))/86400000));
   nextInterestNew=roundToCents(outstanding*annual/360*days);nextIvaNew=roundToCents(nextInterestNew*factor);
   nextExtraInterest=roundToCents(nextInterestNew-dispersionNumber(later.interest,0));nextExtraIva=roundToCents(nextIvaNew-dispersionNumber(later.interestIva,0));
   if(nextExtraInterest<0||nextExtraIva<0)return {ok:false,error:'No se pudo calcular el interés de la cuota siguiente; requiere revisión.'};
  }
  nextAmountAfter=roundToCents(Math.max(dispersionNumber(later.pendingAmount,dispersionNumber(later.payment,0)),0)+capitalDeferred+nextExtraInterest+nextExtraIva);
 }
 const openAfter=carteraOpenRows(rows).filter(item=>item.id!==row.id&&item.type!=='Pago inicial requerido').sort((a,b)=>carteraDue(a).localeCompare(carteraDue(b)));
 const lastRow=openAfter[openAfter.length-1]||null;
 const lastDue=lastRow?carteraDue(lastRow):'';
 const lastAmountAfter=modality==='COLA_FINAL'&&!insoluto&&lastRow?roundToCents(Math.max(dispersionNumber(lastRow.pendingAmount,dispersionNumber(lastRow.payment,0)),0)+capitalDeferred):null;
 if(insolutoPlan&&!insolutoPlan.ok)return insolutoPlan;
 const total=roundToCents(interestPaid+interestIvaPaid+fee+feeVat);
 // Cuota nueva: capital diferido. Globales: el interés de los días extra ya se cobra hoy (regla aprobada), no se duplica.
 // Insolutos: interés del capital diferido por días reales/360 + IVA, en la cuota nueva.
 let newCuota=null;
 if(lastCuota){
  const newInterest=insoluto?roundToCents(capitalDeferred*annual/360*extraDays):0,newIva=roundToCents(newInterest*factor);
  const maxNumber=rows.reduce((m,item)=>Math.max(m,Number(item.number)||0),0);
  newCuota={dueDate:requested,number:maxNumber+1,capital:capitalDeferred,interest:newInterest,interestIva:newIva,payment:roundToCents(capitalDeferred+newInterest+newIva),days:extraDays,contractEndBefore:originalDue,contractEndAfter:requested};
 }
 const audit={rule:lastCuota?(insoluto?'insoluto-last-installment-new-cuota-v1':'global-last-installment-new-cuota-v1'):insolutoCorta?'insoluto-corta-30-v1':insoluto?'insoluto-original-dates-equal-iva-v1':modality==='CORTA'?'global-corta-30-v1':'global-deferred-capital-days-v1',...(modality==='CORTA'?{nextRowId:later.id,nextDue:carteraDue(later),nextAmountAfter,nextExtraInterest,nextExtraIva}:{}),...(lastAmountAfter!=null?{lastDue,lastAmountAfter}:{}),...(newCuota?{lastCuota:true,newCuota,plazoExtendido:true,legalReview:'Pendiente de revisión legal: alarga el plazo contratado'}:{}),max,count:carteraExtensionCount(p)+1,modality,originalDue,extendedDue:requested,fee,feeVat,interestPaid,interestIvaPaid,extraInterest,extraIva,capitalDeferred,rowId:row.id,outstanding,cuota,extraDays,feeRate,feeBase:insoluto?outstanding:cuota,originalInterest:interestPending,originalInterestIva:ivaPending,...(insolutoPlan?{regularPayment:insolutoPlan.regularPayment,finalPayment:insolutoPlan.finalPayment,recalculatedInstallments:insolutoPlan.rows.length}:{})};
 return {ok:true,rows,row,later,rules,insoluto,insolutoPlan,insolutoCorta,nextInterestNew,nextIvaNew,nextExtraInterest,nextExtraIva,nextAmountAfter,lastDue,lastAmountAfter,modality,originalDue,extendedDue:requested,fee,feeVat,interestPaid,interestIvaPaid,extraInterest,extraIva,capitalDeferred,total,audit,maxDue,lastCuota,newCuota};
}
function carteraMoveCapital(rows,source,amount,modality){
 let left=roundToCents(amount);
 if(left<=0)return;
 const targets=carteraOpenRows(rows).filter(row=>row.id!==source.id).sort((a,b)=>carteraDue(a).localeCompare(carteraDue(b)));
 if(!targets.length)return;
 if(modality==='CORTA'){
  targets[0].capital=roundToCents(dispersionNumber(targets[0].capital,0)+left);
  return;
 }
 if(modality==='PRORRATEADO'){
  targets.forEach((row,index)=>{
   const share=index===targets.length-1?left:roundToCents(left/(targets.length-index));
   const applied=roundToCents(Math.min(left,Math.max(share,0)));
   row.capital=roundToCents(dispersionNumber(row.capital,0)+applied);
   left=roundToCents(left-applied);
  });
 }else{
  const last=targets[targets.length-1];
  last.capital=roundToCents(dispersionNumber(last.capital,0)+left);
 }
}
function carteraApplyExtension(p,input={}){
 if(input.preview)return carteraPreviewExtension(p,input);
 if(!can('registerPayments'))return {ok:false,error:'Registrar una extensión requiere permiso de cartera.'};
 const quote=carteraQuoteExtension(p,input);
 if(!quote.ok)return quote;
 if(!carteraAcceptDuplicate(p,input,quote.total,dispersionBusinessDateMX()))return {ok:false,error:'Registro cancelado; no se modificó el crédito.'};
 return carteraMutate(p,'registerPayments',()=>{
  const live=carteraQuoteExtension(p,input);
  if(!live.ok)return live;
  const row=live.rows.find(item=>item.id===live.row.id);
  row.interest=roundToCents(dispersionNumber(row.interest,0)+live.extraInterest);
  row.interestIva=roundToCents(dispersionNumber(row.interestIva,0)+live.extraIva);
  row.interestPaid=roundToCents(dispersionNumber(row.interestPaid,0)+live.interestPaid);
  row.ivaInteresPaid=roundToCents(dispersionNumber(row.ivaInteresPaid,0)+live.interestIvaPaid);
  const deferred=roundToCents(carteraCapitalPending(row));
  let addedRow=null;
  if(live.lastCuota){
   const n=live.newCuota,type=row.type||(dispersionTerms(p).paymentFrequency==='biweekly'?'Pago quincenal ordinario':'Mensualidad ordinaria');
   if(Math.abs(n.capital-deferred)>0.009)return {ok:false,error:'El capital diferido cambió; vuelve a calcular la extensión.'};
   addedRow={id:'plazo-extendido-'+live.audit.count+'-'+String(n.dueDate).replace(/-/g,''),number:n.number,type:type+' · Plazo extendido',dueDate:n.dueDate,currentDueDate:n.dueDate,originalDueDate:n.dueDate,scheduledDate:n.dueDate,capital:n.capital,interest:n.interest,interestIva:n.interestIva,capitalPaid:0,interestPaid:0,ivaInteresPaid:0,moratory:0,moratoryIva:0,commission:0,moratoryPaid:0,ivaMoratorioPaid:0,commissionPaid:0,status:'Programado',dpd:0,plazoExtendido:true,extendedFromRowId:row.id,extendedFromDue:live.originalDue,extensionCount:live.audit.count};
   if(typeof dispersionHydrateConcepts==='function')dispersionHydrateConcepts(addedRow,{...addedRow});
   // Saldos de la tabla: la cuota extendida no amortiza (inicial = final = capital diferido); la cuota nueva lo lleva a cero.
   const carried=roundToCents(deferred+dispersionNumber(row.capitalPaid,0));
   addedRow.balanceStart=deferred;addedRow.balanceEnd=0;
   live.rows.push(addedRow);
   row.balanceStart=carried;row.balanceEnd=deferred;
   row.extendedToRowId=addedRow.id;row.extendedToDue=n.dueDate;
  }else if(live.insoluto&&live.insolutoPlan){
   live.insolutoPlan.rows.forEach(next=>{const target=live.rows.find(item=>item.id===next.id);Object.assign(target,{capital:next.capital,interest:next.interest,interestIva:next.interestIva,payment:next.payment,balanceStart:next.balanceStart,balanceEnd:next.balanceEnd});});
  }else{
   carteraMoveCapital(live.rows,row,deferred,live.modality);
   // v71.1 insolutos «Corta»: la cuota siguiente lleva el interés de sus días sobre el saldo que ya incluye el capital diferido.
   if(live.insolutoCorta){const next=live.rows.find(item=>item.id===live.later.id);next.interest=live.nextInterestNew;next.interestIva=live.nextIvaNew;}
  }
  row.capital=roundToCents(dispersionNumber(row.capitalPaid,0));
  const keepsDue=live.insoluto||live.lastCuota||live.modality==='CORTA';
  row.currentDueDate=keepsDue?live.originalDue:live.extendedDue;row.dueDate=row.currentDueDate;
  const freezeUntil=keepsDue?live.originalDue:live.extendedDue;
  if(live.modality==='CORTA'){row.extensionCorta=true;row.extensionCortaMovedTo=live.later.id;}
  row.preventiveExtensionActive=true;row.preventiveMoraFreeze=true;row.preventiveFreezeUntil=freezeUntil;row.preventiveOriginalDue=live.originalDue;row.dpd=0;
  live.rows.forEach(item=>{
   dispersionRecalculateRowTotals(item);
   item.payment=roundToCents(dispersionNumber(item.capital,0)+dispersionNumber(item.interest,0)+dispersionNumber(item.interestIva,0));
   item.totalPayment=roundToCents(dispersionConceptDefs().reduce((sum,d)=>sum+dispersionNumber(item[d.total],0),0));
   item.pendingAmount=roundToCents(dispersionNumber(item.pendingAmount,0));
   if(item.pendingAmount<=0.009)item.status='Pagado';
  });
  row.dpd=0;if(row.status==='Vencido')row.status='Pendiente';
  // v65: la cuota cuyo capital pasó a la cuota nueva no se muestra como pagada.
  if(live.lastCuota&&row.status==='Pagado')row.status='Extendida';
  if(addedRow)live.rows.sort((a,b)=>carteraDue(a).localeCompare(carteraDue(b))||Number(a.number||0)-Number(b.number||0));
  if(live.lastCuota){const total=roundToCents(carteraOpenRows(live.rows).reduce((sum,item)=>sum+carteraCapitalPending(item),0));if(Math.abs(total-live.audit.outstanding)>0.009)return {ok:false,error:'La extensión no conserva el saldo de capital; no se registró.'};}
  carteraReconcileExtensionBalances(live.rows);
  p.paymentSchedule=live.rows;
  p.application=p.application||{};
  p.application.carteraScheduleLock='extension';
  p.application.preventiveMoraFreezeUntil=freezeUntil;
  p.application.preventiveExtensions=[...(p.application.preventiveExtensions||[]),live.audit];
  if(live.lastCuota){const prev=p.application.plazoExtendido||null;p.application.plazoExtendido={originalEnd:prev&&prev.originalEnd||live.originalDue,newEnd:live.newCuota.dueDate,count:(prev&&prev.count||0)+1,at:dispersionBusinessDateMX(),extension:live.audit.count,rowId:addedRow.id,legalReview:'Pendiente de revisión legal: alarga el plazo contratado'};}
  if(!Array.isArray(p.payments))p.payments=[];
  p.payments.push({...live.audit,paymentType:'preventive_extension',carteraFase1:true,cuenta:String(input.cuenta||'').trim(),date:dispersionBusinessDateMX(),amount:live.total,amountReceived:live.total,totalApplied:live.total,unappliedAmount:0,reference:String(input.reference||'EXT-PREVENTIVA').trim(),method:String(input.method||'SPEI').trim(),receiptId:dispersionReceiptId(),createdAt:new Date().toISOString(),actor:session&&(session.email||session.name)});
  const dmy=value=>String(value||'').replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$3/$2/$1');
  if(live.lastCuota)dispersionReceiptEvent(p,'Plazo extendido','Extensión '+live.audit.count+' de la última cuota · '+(live.insoluto?'Saldos insolutos':'Saldos globales')+' · cuota nueva '+dmy(live.newCuota.dueDate)+' '+fmtMoney(live.newCuota.payment)+' (capital '+fmtMoney(live.newCuota.capital)+(live.newCuota.interest?' + interés '+fmtMoney(live.newCuota.interest)+' + IVA '+fmtMoney(live.newCuota.interestIva):'')+') · fin del plazo '+dmy(p.application.plazoExtendido.originalEnd)+' → '+dmy(live.newCuota.dueDate)+' · Comisión '+fmtMoney(live.fee)+' + IVA '+fmtMoney(live.feeVat)+' · Cobro '+fmtMoney(live.total)+' · Saldo de capital '+fmtMoney(live.audit.outstanding)+' sin cambio');
  else dispersionReceiptEvent(p,'Extensión preventiva aplicada','Extensión '+live.audit.count+' · '+(live.insolutoCorta?'Saldo insoluto · Corta, 30 días · interés de la cuota '+dmy(live.originalDue)+' cobrado hoy; capital '+fmtMoney(live.capitalDeferred)+' e interés adicional '+fmtMoney(roundToCents(live.nextExtraInterest+live.nextExtraIva))+' (con IVA) pasan a la cuota '+dmy(live.audit.nextDue)+' ('+fmtMoney(live.nextAmountAfter)+')':live.insoluto?'Saldo insoluto: cuotas restantes recalculadas; interés original con vencimiento '+dmy(live.originalDue):(live.modality==='CORTA'?'Corta, 30 días · cuota '+dmy(live.originalDue)+' pagada sin capital; capital '+fmtMoney(live.capitalDeferred)+' pasa a la cuota '+dmy(live.audit.nextDue):(live.modality==='PRORRATEADO'?'Prorrateado':'Al final (cola final)')+' · '+dmy(live.originalDue)+' → '+dmy(live.extendedDue)))+' · Comisión '+fmtMoney(live.fee)+' + IVA '+fmtMoney(live.feeVat)+' · Cobro '+fmtMoney(live.total));
  return {ok:true,audit:live.audit,total:live.total,lastCuota:!!live.lastCuota,newCuota:live.newCuota||null};
 });
}
// v68.1: saldo inicial/final por cuota después de una extensión preventiva.
// La extensión deja la cuota extendida sin capital (o mueve capital a otra cuota) pero el motor de
// la tabla conserva los saldos guardados cuando el crédito tiene foto financiera. Desde la primera
// cuota extendida se recalculan en cadena: inicial = final anterior; final = inicial − capital de la cuota.
// Solo cambia la presentación de saldos; montos, capital, intereses y estatus no se tocan.
function carteraReconcileExtensionBalances(rows){
 if(!Array.isArray(rows))return rows;
 const chain=rows.filter(row=>row&&row.type!=='Pago inicial requerido');
 const start=chain.findIndex(row=>row.preventiveExtensionActive);
 if(start<0)return rows;
 // Saldo al inicio de la cuota extendida = capital de esa cuota y de las siguientes (la cadena termina en $0.00).
 let running=roundToCents(chain.slice(start).reduce((sum,row)=>sum+dispersionNumber(row.capital,0),0));
 for(let i=start;i<chain.length;i++){
  const row=chain[i],end=roundToCents(Math.max(running-dispersionNumber(row.capital,0),0));
  if(Math.abs(dispersionNumber(row.balanceStart,0)-running)>0.004)row.balanceStart=running;
  if(Math.abs(dispersionNumber(row.balanceEnd,0)-end)>0.004)row.balanceEnd=end;
  running=end;
 }
 return rows;
}
// Extensiones ya guardadas antes de v68.1: la tabla del expediente (y su PDF) se arma con saldos
// conciliados sin modificar el registro guardado.
if(typeof dispersionBuildSchedule==='function'&&!dispersionBuildSchedule.carteraExtensionBalances){
 const carteraOriginalBuildSchedule=dispersionBuildSchedule;
 dispersionBuildSchedule=function(p,...rest){
  const rows=carteraOriginalBuildSchedule.call(this,p,...rest);
  if(!Array.isArray(rows)||!rows.some(row=>row&&row.preventiveExtensionActive))return rows;
  return carteraReconcileExtensionBalances(rows.map(row=>row&&typeof row==='object'?{...row}:row));
 };
 dispersionBuildSchedule.carteraExtensionBalances=true;
}
function carteraPreviewExtension(p,input={}){
 const before=JSON.stringify(p.paymentSchedule||null);
 const quote=carteraQuoteExtension(p,input||{preview:true});
 if(JSON.stringify(p.paymentSchedule||null)!==before)return {ok:false,error:'La vista previa intentó modificar el crédito.'};
 return quote.ok?carteraAddDuplicate(p,{...quote,rows:undefined,row:undefined,later:undefined,rules:undefined},input,dispersionBusinessDateMX()):quote;
}

function carteraPeriods(rows){return carteraOpenRows(rows).filter(row=>carteraCapitalPending(row)>0.009).length;}
function carteraBalance(rows){return roundToCents(carteraOpenRows(rows).reduce((sum,row)=>sum+carteraCapitalPending(row),0));}
// v71 (aprobado 27/10/2026): abono parcial a capital desde «Meses mínimos para abonar a capital» (3)
// y liquidación total desde «Meses mínimos para liquidar» (6), ambos contados desde la dispersión.
// Entre ambos plazos un abono no puede pagar todo el capital. La reestructura conserva su propia regla.
function carteraSettlementWaitMonths(p,date){const value=Number(carteraRules(p,date).settlementWaitMonths);return Number.isInteger(value)&&value>=0?value:6;}
function carteraSettlementAllowedDate(p,date){
 const base=p?dispersionTerms(p).dispersionDate:'';
 if(!base||typeof dispersionAddMonthsToDateString!=='function')return '';
 return dispersionAddMonthsToDateString(base,carteraSettlementWaitMonths(p,date||dispersionBusinessDateMX()));
}
function carteraCanSettle(p,date){
 const when=String(date||dispersionBusinessDateMX()),allowed=carteraSettlementAllowedDate(p,when);
 return !!allowed&&when>=allowed;
}
function carteraSettlementLockedText(p,date){
 const allowed=carteraSettlementAllowedDate(p,date);
 return 'La liquidación total está disponible desde el mes '+carteraSettlementWaitMonths(p,date)+(allowed?' ('+carteraDmy(allowed)+')':'')+'. Antes de esa fecha un abono a capital no puede cubrir todo el capital.';
}
if(typeof dispersionApplyEarlySettlement==='function'&&!dispersionApplyEarlySettlement.v71SettlementGate){
 const carteraOriginalEarlySettlement=dispersionApplyEarlySettlement;
 dispersionApplyEarlySettlement=function(p,amount,date,reference,method,options={}){
  const when=String(date||dispersionBusinessDateMX());
  if(p&&!carteraCanSettle(p,when)){const message=carteraSettlementLockedText(p,when);if(typeof options.onError==='function')options.onError(message);if(!options.preview&&!options.quiet&&typeof toast==='function')toast(message);return false;}
  return carteraOriginalEarlySettlement.apply(this,arguments);
 };
 dispersionApplyEarlySettlement.v71SettlementGate=true;
}
if(typeof dispersionEarlySettlementAvailableText==='function'&&!dispersionEarlySettlementAvailableText.v71SettlementGate){
 const carteraOriginalSettlementText=dispersionEarlySettlementAvailableText;
 dispersionEarlySettlementAvailableText=function(p){
  try{if(p&&dispersionTerms(p).dispersionDate&&!carteraCanSettle(p))return 'Disponible a partir de '+carteraDmy(carteraSettlementAllowedDate(p))+'.';}catch(error){}
  return carteraOriginalSettlementText.apply(this,arguments);
 };
 dispersionEarlySettlementAvailableText.v71SettlementGate=true;
}
function carteraPreviewPrepay(p,input={}){
 if(!p||dispersionIsCreditLiquidated(p))return {ok:false,error:'Este crédito ya está liquidado; no admite otro prepago ni liquidación.'};
 const modality=input.modality||'reduce_plazo';
 const date=input.date||dispersionBusinessDateMX();
 const amount=roundToCents(dispersionNumber(input.amount,0));
 const rows=carteraScheduleRows(p);
 const balanceBefore=carteraBalance(rows),periodsBefore=carteraPeriods(rows);
 if(modality==='liquidacion'||modality==='liquidacion_total'){
  if(typeof dispersionCanSimulateEarlySettlement==='function'&&!dispersionCanSimulateEarlySettlement(p,date))return {ok:false,error:'La liquidación aún no está habilitada para este crédito.'+(typeof dispersionEarlySettlementAvailableText==='function'?' '+dispersionEarlySettlementAvailableText(p):'')};
  if(!carteraCanSettle(p,date))return {ok:false,code:'SETTLEMENT_WAIT',error:carteraSettlementLockedText(p,date)};
  const sim=dispersionCalculateEarlySettlement(JSON.parse(JSON.stringify(p)),date);
  return carteraAddDuplicate(p,{ok:true,modality:'liquidacion_total',balanceBefore,balanceAfter:0,periodsBefore,periodsAfter:0,amount:roundToCents(sim.total||sim.totalToSettle||0),total:roundToCents(sim.total||sim.totalToSettle||0)},input,date);
 }
 if(!(amount>0))return {ok:false,error:'Captura el monto del prepago.'};
 if(typeof dispersionCanPrepayOrLiquidate==='function'&&!dispersionCanPrepayOrLiquidate(p,date)){const allowed=typeof dispersionPrepayAllowedDate==='function'?dispersionPrepayAllowedDate(p):'';return {ok:false,code:'PREPAY_WAIT',error:'El abono a capital '+(allowed?'estará disponible a partir del '+carteraDmy(allowed):'aún no está habilitado')+'.'};}
 const settleLocked=!carteraCanSettle(p,date);
 if(modality==='reduce_cuota'){
  if(settleLocked&&amount>=balanceBefore-0.004)return {ok:false,code:'ABONO_COVERS_ALL',error:carteraSettlementLockedText(p,date)+' Monto máximo de abono hoy: '+fmtMoney(roundToCents(Math.max(balanceBefore-0.01,0)))+'.'};
  const targets=carteraOpenRows(rows).filter(row=>carteraCapitalPending(row)>0);
  const total=carteraBalance(targets.length?rows:rows);
  const applied=roundToCents(Math.min(amount,total));
  let left=applied;
  targets.forEach((row,index)=>{
   const cap=carteraCapitalPending(row);
   const share=index===targets.length-1?left:roundToCents(Math.min(left,applied*cap/total));
   row.capital=roundToCents(dispersionNumber(row.capitalPaid,0)+Math.max(cap-share,0));
   left=roundToCents(left-Math.min(share,cap));
  });
  targets.forEach(row=>dispersionRecalculateRowTotals(row));
  return carteraAddDuplicate(p,{ok:true,modality:'reduce_cuota',balanceBefore,balanceAfter:carteraBalance(rows),periodsBefore,periodsAfter:carteraPeriods(rows),amount:applied,effect:'reduce_payment'},input,date);
 }
 const clone=JSON.parse(JSON.stringify(p));
 let reason='';
 const preview=dispersionApplyCapitalPrepayment(clone,amount,date,String(input.reference||'VISTA-PREVIA-PREPAGO'),String(input.method||'SPEI'),{preview:true,quiet:true,confirmDuplicate:true,onError:message=>{reason=message;}});
 if(!preview)return {ok:false,error:reason||'No se pudo simular el prepago a capital.'};
 const afterRows=clone.paymentSchedule||[];
 if(settleLocked&&carteraBalance(afterRows)<=0.009)return {ok:false,code:'ABONO_COVERS_ALL',error:carteraSettlementLockedText(p,date)};
 return carteraAddDuplicate(p,{ok:true,modality:'reduce_plazo',effect:'reduce_term',balanceBefore,balanceAfter:carteraBalance(afterRows),periodsBefore,periodsAfter:carteraPeriods(afterRows),amount,appliedToCapital:roundToCents(preview.appliedToCapital||0)},input,date);
}
function carteraApplyReduceCuota(p,input){
 const preview=carteraPreviewPrepay(p,input);
 if(!preview.ok)return preview;
 return carteraMutate(p,'registerPayments',()=>{
  const rows=carteraScheduleRows(p);
  const targets=carteraOpenRows(rows).filter(row=>carteraCapitalPending(row)>0);
  const total=carteraBalance(rows);
  const applied=roundToCents(Math.min(roundToCents(input.amount),total));
  let left=applied;
  targets.forEach((row,index)=>{
   const cap=carteraCapitalPending(row);
   const share=index===targets.length-1?left:roundToCents(Math.min(left,applied*cap/(total||1)));
   const cut=roundToCents(Math.min(left,cap,Math.max(share,0)));
   row.capital=roundToCents(dispersionNumber(row.capitalPaid,0)+cap-cut);
   row.payment=roundToCents(dispersionNumber(row.capital,0)+dispersionNumber(row.interest,0)+dispersionNumber(row.interestIva,0));
   left=roundToCents(left-cut);
  });
  rows.forEach(row=>{dispersionRecalculateRowTotals(row);row.totalPayment=roundToCents(dispersionConceptDefs().reduce((sum,d)=>sum+dispersionNumber(row[d.total],0),0));});
  p.paymentSchedule=rows;
  p.application=p.application||{};
  p.application.carteraScheduleLock='prepay_cuota';
  const evidence={carteraFase1:true,prepayModality:'reduce_cuota',effect:'reduce_payment',balanceBefore:preview.balanceBefore,balanceAfter:carteraBalance(rows),periodsBefore:preview.periodsBefore,periodsAfter:carteraPeriods(rows),amount:applied};
  if(!Array.isArray(p.payments))p.payments=[];
  p.payments.push({...evidence,paymentType:'capital_prepay',cuenta:String(input.cuenta||'').trim(),date:input.date,reference:input.reference,method:input.method,amountReceived:applied,totalApplied:applied,unappliedAmount:roundToCents(Math.max(input.amount-applied,0)),receiptId:dispersionReceiptId(),createdAt:new Date().toISOString()});
  p.application.prepayEvents=[...(p.application.prepayEvents||[]),evidence];
  dispersionReceiptEvent(p,'Prepago aplicado','Reducción de cuota · Saldo '+fmtMoney(evidence.balanceBefore)+' → '+fmtMoney(evidence.balanceAfter));
  return {ok:true,...evidence,payment:p.payments.at(-1)};
 });
}
function carteraStampPrepay(p,evidence){
 const m=p.payments&&p.payments[p.payments.length-1];
 if(m)Object.assign(m,evidence,{carteraFase1:true});
 p.application=p.application||{};
 p.application.prepayEvents=[...(p.application.prepayEvents||[]),evidence];
 carteraResave();
}
function carteraApplyPrepay(p,input={}){
 if(!p)return {ok:false,error:'No se encontró el crédito.'};
 if(input.preview)return carteraPreviewPrepay(p,input);
 if(!can('registerPayments'))return {ok:false,error:'El prepago no requiere administrador, pero sí permiso para registrar pagos.'};
 const modality=input.modality||'reduce_plazo';
 const date=input.date||dispersionBusinessDateMX();
 const reference=String(input.reference||'').trim()||'PREPAGO-'+Date.now();
 const method=String(input.method||'SPEI').trim();
 const amount=roundToCents(dispersionNumber(input.amount,0));
 const duplicatePreview=carteraPreviewPrepay(p,input);
 if(!duplicatePreview.ok)return duplicatePreview;
 if(!carteraAcceptDuplicate(p,input,duplicatePreview.amount??duplicatePreview.total,date))return {ok:false,error:'Registro cancelado; no se modificó el crédito.'};
 const beforeRows=carteraScheduleRows(p);
 const periodsBefore=carteraPeriods(beforeRows),balanceBefore=carteraBalance(beforeRows);
 if(modality==='reduce_cuota')return carteraApplyReduceCuota(p,{...input,date,reference,method,amount});
 if(modality==='liquidacion'||modality==='liquidacion_total'){
  const sim=dispersionCalculateEarlySettlement(JSON.parse(JSON.stringify(p)),date);
  p.application=p.application||{};
  p.application.earlySettlementSimulation=sim;
  const total=roundToCents(sim.total||sim.totalToSettle||0);
  const ok=dispersionApplyEarlySettlement(p,total,date,reference,method,{quiet:true,confirmDuplicate:true,cuenta:input.cuenta||''});
  if(!ok)return {ok:false,error:'No se aplicó la liquidación.'};
  const evidence={prepayModality:'liquidacion_total',modality:'liquidacion_total',effect:'liquidacion_total',balanceBefore,balanceAfter:0,periodsBefore,periodsAfter:0,amount:total};
  carteraStampPrepay(p,evidence);
  return {ok:true,...evidence,payment:p.payments.at(-1)};
 }
 const ok=dispersionApplyCapitalPrepayment(p,amount,date,reference,method,{quiet:true,confirmDuplicate:true,cuenta:input.cuenta||''});
 if(!ok)return {ok:false,error:'No se aplicó el prepago a capital.'};
 const afterRows=p.paymentSchedule||[];
 const move=p.payments.at(-1)||{};
 const evidence={prepayModality:'reduce_plazo',modality:'reduce_plazo',effect:move.effect||'reduce_term',balanceBefore,balanceAfter:carteraBalance(afterRows),periodsBefore,periodsAfter:carteraPeriods(afterRows),amount,appliedToCapital:roundToCents(move.appliedToCapital||0)};
 carteraStampPrepay(p,evidence);
 return {ok:true,...evidence,payment:p.payments.at(-1)};
}

function carteraComponents(rows,factor){
 const open=carteraOpenRows(rows);
 const sum=fn=>roundToCents(open.reduce((total,row)=>total+fn(row),0));
 const capital=sum(row=>carteraCapitalPending(row));
 const interest=sum(row=>carteraPending(row,'interest','interestPaid','interestPending'));
 const interestIva=sum(row=>carteraPending(row,'interestIva','ivaInteresPaid','ivaInteresPending'));
 const moratory=sum(row=>carteraPending(row,'moratory','moratoryPaid','moratoryPending'));
 const moratoryIva=sum(row=>carteraPending(row,'moratoryIva','ivaMoratorioPaid','ivaMoratorioPending'));
 const commission=sum(row=>carteraPending(row,'commission','commissionPaid','commissionPending'));
 const commissionIva=roundToCents(commission*factor);
 return {capital,interest,interestIva,moratory,moratoryIva,commission,commissionIva};
}
function carteraRate(value){const n=Number(value);if(!Number.isFinite(n)||n<0)return null;return n>1?n/100:n;}
function carteraBuildAmortization(balance,periods,annualRate,frequency,startDate,cuota,factor,includeMonthlyIva=false){
 const perYear=frequency==='weekly'?52:frequency==='biweekly'?24:12,rate=annualRate/perYear;
 const paymentRate=includeMonthlyIva?rate*(1+factor):rate;
 const payment=cuota>0?roundToCents(cuota):(paymentRate===0?roundToCents(balance/periods):roundToCents(balance*paymentRate/(1-Math.pow(1+paymentRate,-periods))));
 if(!(payment>0))return {ok:false,error:'La cuota no cubre el saldo.'};
 const rows=[];let remaining=roundToCents(balance),previous=startDate;
 for(let i=1;i<=periods;i++){
  const due=frequency==='weekly'?dispersionAddDaysToDateString(previous,7):frequency==='biweekly'?dispersionAddDaysToDateString(previous,15):dispersionAddMonthsToDateString(previous,1);
  const interest=roundToCents(remaining*rate),iva=roundToCents(interest*factor);
  if(i!==periods&&interest+iva>=payment)return {ok:false,error:'La cuota no cubre el interés del periodo. Aumenta la cuota o el plazo.'};
  const capital=i===periods?remaining:roundToCents(Math.min(remaining,payment-interest-iva));
  const row={id:'restructure-'+i,number:i,type:frequency==='weekly'?'Pago semanal ordinario':frequency==='biweekly'?'Pago quincenal ordinario':'Mensualidad ordinaria',dueDate:due,currentDueDate:due,originalDueDate:due,scheduledDate:due,capital,interest,interestIva:iva,capitalPaid:0,interestPaid:0,ivaInteresPaid:0,moratory:0,moratoryIva:0,commission:0,moratoryPaid:0,ivaMoratorioPaid:0,commissionPaid:0,payment:roundToCents(capital+interest+iva),status:'Programado',dpd:0,balanceStart:remaining,balanceEnd:roundToCents(remaining-capital)};
  dispersionHydrateConcepts(row);row.totalPayment=roundToCents(dispersionConceptDefs().reduce((sum,d)=>sum+dispersionNumber(row[d.total],0),0));
  rows.push(row);remaining=roundToCents(remaining-capital);previous=due;
 }
 return {ok:true,rows,payment,remaining};
}
function carteraRestructurePending(){
 return {ok:false,code:'RESTRUCTURE_CONFIGURATION_PENDING',error:'Reestructura temporalmente bloqueada: está pendiente la configuración autorizada del capital y del devengo al corte. No se aplicará el cálculo anterior que incluye intereses futuros.'};
}
// Conservado para auditoría histórica; no autoriza una operación nueva.
function carteraHistoricalRestructureCalculation(p,input={}){
 if(!staffIsAdmin())return {ok:false,error:'La reestructura requiere un administrador.'};
 const option=String(input.option||'A').toUpperCase()==='B'?'B':'A';
 const periods=Math.round(Number(input.termMonths));
 const annual=carteraRate(input.annualRate);
 if(!Number.isInteger(periods)||periods<1||periods>120)return {ok:false,error:'Indica el plazo en periodos.'};
 if(annual==null)return {ok:false,error:'Indica la tasa anual.'};
 const rows=carteraScheduleRows(p),rules=carteraRules(p),factor=carteraIvaFactor(rules);
 const parts=carteraComponents(rows,factor);
 const debt=option==='A'?roundToCents(parts.capital+parts.interest+parts.interestIva+parts.moratory+parts.moratoryIva+parts.commission+parts.commissionIva):roundToCents(parts.capital+parts.interest+parts.interestIva);
 const rate=option==='A'?Number(rules.restructureCommissionARate)||0:Number(rules.restructureCommissionBRate)||0;
 const commissionFee=roundToCents(debt*rate),commissionFeeIva=roundToCents(commissionFee*factor);
 const newBalance=roundToCents(debt+commissionFee+commissionFeeIva);
 const separated=option==='B'?{moratory:parts.moratory,moratoryIva:parts.moratoryIva,commission:parts.commission,commissionIva:parts.commissionIva}:null;
 return {ok:true,option,components:parts,debt,commissionFee,commissionFeeIva,newBalance,separated,termMonths:periods,annualRate:annual,factor};
}
function carteraPreviewRestructure(p,input={}){
 if(!staffIsAdmin())return {ok:false,error:'La reestructura requiere un administrador.'};
 const periods=Number(input.termMonths),annual=carteraRate(input.annualRate),date=dispersionBusinessDateMX();
 const activePlan=p.application?.operationalPlan;
 if(activePlan?.rule==='accrued-only-equal-iva-v1'&&activePlan.effectiveDate===date)return {ok:false,code:'RESTRUCTURE_ALREADY_APPLIED',error:'Este crédito ya fue reestructurado en este corte. No se registró otra operación.'};
 if(!Number.isInteger(periods)||periods<1||periods>120||annual==null)return {ok:false,error:'Indica un plazo entero de 1 a 120 periodos y una tasa válida.'};
 if(input.cuota&&Number(input.cuota)>0)return {ok:false,error:'La cuota se calcula con IVA incluido; no se permite sustituirla manualmente.'};
 if(!dispersionCanSimulateEarlySettlement(p,date))return {ok:false,error:'El crédito o sus movimientos no permiten calcular la reestructura a este corte.'};
 const sim=dispersionCalculateEarlySettlement(p,date),rules=carteraRules(p,date),factor=carteraIvaInterestFactor(rules),feeFactor=carteraIvaCommissionFactor(rules),option=String(input.option||'B').toUpperCase();
 if(!['A','B'].includes(option))return {ok:false,error:'Selecciona una opción de comisión configurada.'};
 if(!(sim.capitalPending>0)||![sim.capitalPending,sim.interestAccrued,sim.interestIvaAccrued].every(Number.isFinite))return {ok:false,error:'No hay principal pendiente válido para reestructurar.'};
 // Other charges require an explicit disposition; never forgive or capitalize them implicitly.
 if(['moratoryPending','moratoryIvaPending','commissionsPending','moratoryNonInterestPending','ordinaryNonInterestPending'].some(k=>Number(sim[k])>0))return {ok:false,code:'RESTRUCTURE_OTHER_CHARGES_PENDING',error:'Hay mora u otros cargos pendientes. Define su tratamiento antes de reestructurar; no se condonan ni capitalizan automáticamente.'};
 // v71: la opción A (capitalizar todo, 3%) permanece desactivada; el cálculo histórico se conserva solo para consulta.
 if(option==='A')return {ok:false,code:'RESTRUCTURE_OPTION_A_DISABLED',error:'Opción A (capitalizar todo) desactivada. Usa la opción B.'};
 // Preserve tax already recorded on due rows; tax the newly accrued concept using
 // the configuration effective on this operation, without rewriting prior rows.
 const accrualRows=dispersionBuildSchedule(p),accrualTerms=dispersionTerms(p);
 const currentRow=dispersionSettlementCurrentAccrualRow(accrualRows,date,sim.accrualStartDate)||dispersionSettlementCurrentFutureRow(accrualRows,date);
 const segments=Array.isArray(currentRow?.interestAccrualSegments)?currentRow.interestAccrualSegments:null;
 const gross=roundToCents(segments?segments.reduce((sum,segment)=>{const end=String(segment.endDate)<date?segment.endDate:date;return sum+(segment.startDate<end?segment.principal*segment.annualRate*dispersionDateDiffDays(segment.startDate,end)/360:0);},0):sim.interestBase*(accrualTerms.ordinaryAnnualRate||0)/360*sim.accruedDays);
 const priorPartialPaid=dispersionSettlementAlreadyPaidForCurrentPeriod(currentRow);
 const currentTax=roundToCents(Math.max(roundToCents(gross*factor)-priorPartialPaid.ivaPaid,0));
 const oldTax=sim.interestIvaAccrued;
 sim.ivaNewPending=currentTax;sim.interestIvaAccrued=roundToCents(sim.ivaInterestPendingAlreadyAccrued+currentTax);sim.ivaInterestPending=sim.interestIvaAccrued;
 sim.total=sim.totalToSettle=roundToCents(sim.total-oldTax+sim.interestIvaAccrued);sim.taxVersion=rules.versionId;sim.currentAccrualTaxFactor=factor;
 const components={capital:sim.capitalPending,interest:sim.interestAccrued,interestIva:sim.interestIvaAccrued,moratory:0,moratoryIva:0,commission:0,commissionIva:0};
 const debt=roundToCents(components.capital+components.interest+components.interestIva),rate=Number(option==='A'?rules.restructureCommissionARate:rules.restructureCommissionBRate);
 if(!Number.isFinite(rate)||rate<0||!Number.isFinite(factor)||factor<0)return {ok:false,error:'La comisión o el IVA no tienen una configuración válida.'};
 const commissionFee=roundToCents(debt*rate),commissionFeeIva=roundToCents(commissionFee*feeFactor),newBalance=roundToCents(debt+commissionFee+commissionFeeIva);
 if(!Number.isSafeInteger(Math.round(newBalance*100)))return {ok:false,error:'El importe excede el límite seguro en centavos.'};
 return {ok:true,option,components,debt,commissionFee,commissionFeeIva,newBalance,separated:null,termMonths:periods,annualRate:annual,factor,calculationDate:date,balanceFingerprint:sim.balanceFingerprint,accrual:sim,rule:'accrued-only-equal-iva-v1'};
}
function carteraApplyRestructure(p,input={}){
 if(!staffIsAdmin())return {ok:false,error:'La reestructura requiere un administrador.'};
 if(input.preview)return carteraPreviewRestructure(p,input);
 const preview=carteraPreviewRestructure(p,input);
 if(!preview.ok)return preview;
 return carteraMutate(p,'registerPayments',()=>{
  const live=carteraPreviewRestructure(p,input);
  if(!live.ok)return live;
  const terms=dispersionTerms(p);
  const cuota=input.cuota?roundToCents(Number(input.cuota)):0;
  const built=carteraBuildAmortization(live.newBalance,live.termMonths,live.annualRate,terms.paymentFrequency,dispersionBusinessDateMX(),cuota,live.factor,true);
  if(!built.ok)return built;
  const schedule=built.rows;
  if(live.option==='B'&&live.separated&&(live.separated.moratory||live.separated.moratoryIva||live.separated.commission||live.separated.commissionIva)){
   const charge={id:'restructure-cargos',number:0,type:'Cargos separados de reestructura',dueDate:dispersionBusinessDateMX(),currentDueDate:dispersionBusinessDateMX(),originalDueDate:dispersionBusinessDateMX(),scheduledDate:dispersionBusinessDateMX(),capital:0,interest:0,interestIva:0,moratory:live.separated.moratory,moratoryIva:live.separated.moratoryIva,commission:roundToCents(live.separated.commission+live.separated.commissionIva),capitalPaid:0,interestPaid:0,ivaInteresPaid:0,moratoryPaid:0,ivaMoratorioPaid:0,commissionPaid:0,status:'Pendiente',dpd:0};
   dispersionHydrateConcepts(charge);
   charge.totalPayment=roundToCents(dispersionConceptDefs().reduce((sum,d)=>sum+dispersionNumber(charge[d.total],0),0));
   charge.payment=charge.totalPayment;
   schedule.unshift(charge);
  }
  const previous=JSON.parse(JSON.stringify(p.paymentSchedule||[]));
  p.paymentSchedule=schedule;
  p.application=p.application||{};
  p.application.carteraScheduleLock='restructure';
  p.application.restructured=true;
  p.application.restructureStatus='reestructurado';
  const audit={rule:live.rule,calculationDate:live.calculationDate,accrual:live.accrual,previousTerms:JSON.parse(JSON.stringify(terms)),option:live.option,newBalance:live.newBalance,debt:live.debt,commissionFee:live.commissionFee,commissionFeeIva:live.commissionFeeIva,termMonths:live.termMonths,annualRate:live.annualRate,cuota:built.payment,separated:live.separated,components:live.components,at:new Date().toISOString(),actor:session&&(session.email||session.name),previousInstallments:previous.length};
  p.application.restructure=audit;
  p.application.restructureAudit=[...(p.application.restructureAudit||[]),audit];
  p.application.previousSchedule=previous;
  const plan={version:(Number(p.application.operationalPlan?.version)||0)+1,rule:live.rule,effectiveDate:live.calculationDate,principal:live.newBalance,annualRate:live.annualRate,periods:live.termMonths,paymentFrequency:terms.paymentFrequency,regularPayment:built.payment,ivaFactor:live.factor,finalAdjustment:roundToCents(schedule.at(-1).payment-built.payment)};
  p.application.operationalPlan=plan;p.application.operationalPlanHistory=[...(p.application.operationalPlanHistory||[]),JSON.parse(JSON.stringify(plan))];
  if(!Array.isArray(p.payments))p.payments=[];
  p.payments.push({paymentType:'restructure',carteraFase1:true,option:live.option,date:dispersionBusinessDateMX(),amount:0,amountReceived:0,totalApplied:0,unappliedAmount:0,reference:String(input.reference||'REESTRUCTURA').trim(),method:'Reestructura',receiptId:dispersionReceiptId(),audit,createdAt:new Date().toISOString()});
  dispersionReceiptEvent(p,'Crédito reestructurado','Opción '+live.option+' · Nuevo saldo '+fmtMoney(live.newBalance)+' · Plazo '+live.termMonths+' · Tasa '+(live.annualRate*100).toFixed(2)+'%');
  return {ok:true,audit,schedule};
 });
}

const carteraOriginalTerms=dispersionTerms;
dispersionTerms=function(p){
 const original=carteraOriginalTerms(p),plan=p?.application?.operationalPlan;
 if(plan?.rule!=='accrued-only-equal-iva-v1')return original;
 const perMonth=plan.paymentFrequency==='weekly'?52/12:plan.paymentFrequency==='biweekly'?2:1;
 return {...original,approvedAmount:plan.principal,totalFinancedAmount:plan.principal,ordinaryAnnualRate:plan.annualRate,annualRate:plan.annualRate*100,interestCalculationBase:'outstanding_balance',termMonths:plan.periods/perMonth,numberOfPeriods:plan.periods,paymentFrequency:plan.paymentFrequency,periodsPerMonth:perMonth,monthlyPayment:roundToCents(plan.regularPayment*perMonth),paymentAmountPerPeriod:plan.regularPayment,initialCount:0,initialEach:0,initialTotal:0,dispersionDate:plan.effectiveDate,operationalPlanVersion:plan.version};
};
const carteraOriginalEligibility=dispersionExtensionEligibility;
dispersionExtensionEligibility=function(row,p){
 const result=carteraOriginalEligibility(row,p);
 if(result.ok||!/comisiones o conceptos sin interés/.test(result.message||''))return result;
 const commission=dispersionPendingConceptValue(row,['commission'],['commissionPaid'],['commissionPending']);
 const mora=dispersionPendingConceptValue(row,['moratoryNonInterest'],['moratoryNonInterestPaid'],['moratoryNonInterestPending']);
 const ordinary=dispersionPendingConceptValue(row,['ordinaryNonInterest'],['ordinaryNonInterestPaid'],['ordinaryNonInterestPending']);
 if(!(commission>0)||mora>0||ordinary>0)return result;
 const iva=roundToCents(commission*carteraIvaCommissionFactor(carteraRules(p)));
 const detail={commissionPending:roundToCents(commission),commissionIva:iva};
 if(staffIsAdmin())return {ok:true,message:'Comisión pendiente '+fmtMoney(detail.commissionPending)+' + IVA '+fmtMoney(detail.commissionIva)+'. Un administrador puede autorizar la prórroga.',...detail};
 return {ok:false,message:'Hay comisiones pendientes de '+fmtMoney(detail.commissionPending)+' + IVA '+fmtMoney(detail.commissionIva)+'. Se requiere permiso de administrador para prorrogar.',...detail};
};
const carteraOriginalExtensionSection=dispersionExtensionSectionHtml;
dispersionExtensionSectionHtml=function(p,row){
 let html=carteraOriginalExtensionSection(p,row).replace('>Nota interna<','>Motivo<').replace('id="extensionNote"','id="extensionNote" required');
 const eligibility=dispersionExtensionEligibility(row,p);
 if(eligibility.commissionPending>0)html=html.replace('</h4>','</h4><p class="extension-manage-note">Comisión pendiente '+fmtMoney(eligibility.commissionPending)+' + IVA '+fmtMoney(eligibility.commissionIva)+'.</p>');
 return html;
};

function carteraChoice(action,label){return `<button type="button" class="cartera-choice" aria-pressed="${carteraUiState.action===action?'true':'false'}" onclick="carteraChoose('${action}')">${label}</button>`;}
function carteraModalityButton(value,label,current){return `<button type="button" class="cartera-choice" aria-pressed="${current===value?'true':'false'}" onclick="carteraChooseModality('${value}')">${label}</button>`;}
function carteraNormalizeAction(action){return action==='anticipo'?'anticipo':action==='extension'?'extension':action==='reestructura'?'reestructura':action==='prepago'?'prepago':'pago';}
function carteraActiveRoot(){
 if(typeof currentView!=='undefined'&&currentView==='portfolio')return document.getElementById('portfolio')||document.getElementById('portfolioContent');
 if(typeof currentView!=='undefined'&&currentView==='patientProfiles')return document.getElementById('patientProfiles');
 if(typeof currentView!=='undefined'&&currentView==='patients')return document.getElementById('patientDetail')||document.getElementById('patients');
 return document.body||document;
}
function carteraQuery(id){
 const root=carteraActiveRoot();
 const found=root&&root.querySelector&&root.querySelector('#'+id);
 return found||(document.getElementById?document.getElementById(id):null);
}
function carteraDraft(){
 const read=id=>{const el=carteraQuery(id);return el?el.value:'';};
 return {amount:carteraParseAmountInput(read('carteraAmount')),date:read('carteraDate'),reference:read('carteraReference'),method:read('carteraMethod'),newDue:read('carteraNewDue'),term:read('carteraTerm'),rate:read('carteraRate'),cuota:carteraUiState.action==='reestructura'?'':read('carteraCuota'),cuenta:read('carteraCuenta'),origen:read('carteraOrigen')};
}
function carteraMoneyInput(id,label,value,help){
 if(id==='carteraAmount')return `<label class="field">${label}<input id="${id}" value="${escapeAttr(carteraFormatAmountInput(value))}" type="text" inputmode="decimal" autocomplete="off" placeholder="$0.00" onblur="carteraFormatAmountField(this)">${help?`<small>${help}</small>`:''}</label>`;
 return `<label class="field">${label}<input id="${id}" value="${escapeAttr(value||'')}" ${id==='carteraDate'||id==='carteraNewDue'?'type="date"':'type="number" min="0" step="0.01"'}>${help?`<small>${help}</small>`:''}</label>`;
}
// v61.1 · Monto capturado: acepta "3533.33", "3,533.33" o "$3,533.33" y lo normaliza a "3533.33" para el motor.
function carteraParseAmountInput(value){
 const raw=String(value==null?'':value).trim();
 if(!raw)return '';
 const compact=raw.replace(/\s+/g,'').replace(/^MXN|MXN$/i,'').replace(/^\$/,'');
 // Comas solo como separador de miles (3,533.33); "3.533,33" u otros formatos ambiguos no se reinterpretan.
 // Texto inválido: se conserva si no es numérico (el motor lo rechaza); notación como "1e3" o "0x10" se descarta.
 if(!/^(\d{1,3}(,\d{3})+|\d+)(\.\d*)?$|^\.\d+$/.test(compact))return Number.isNaN(Number(raw))?raw:'';
 const n=Number(compact.replace(/,/g,''));
 return Number.isFinite(n)?String(n):raw;
}
function carteraFormatAmountInput(value){
 const parsed=carteraParseAmountInput(value);
 if(parsed==='')return '';
 const n=Number(parsed);
 return Number.isFinite(n)?fmtMoney(n):String(value);
}
function carteraFormatAmountField(input){
 if(!input)return '';
 input.value=carteraFormatAmountInput(input.value);
 return input.value;
}
function carteraTextInput(id,label,value,help){return `<label class="field">${label}<input id="${id}" value="${escapeAttr(value||'')}">${help?`<small>${help}</small>`:''}</label>`;}
function carteraMethodSelect(draft){return `<label class="field">Método<select id="carteraMethod"><option ${draft.method==='Transferencia'?'selected':''}>Transferencia</option><option ${draft.method==='Depósito'?'selected':''}>Depósito</option><option ${draft.method==='Efectivo'?'selected':''}>Efectivo</option><option ${!draft.method||draft.method==='SPEI'?'selected':''}>SPEI</option></select></label>`;}
// v61.1 · Comisión de extensión visible en la tabla de amortización y en movimientos.
// v65: vista previa (solo staff) de la extensión de la última cuota. La nota legal es interna; no es texto para el paciente.
function carteraLastCuotaPreviewHtml(result){
 const a=result.audit||{},n=result.newCuota||a.newCuota||{},dmy=v=>escapeHtml(carteraDmy(v));
 const legal='<p class="cartera-legal-review" data-legal-review="v65"><strong>Pendiente de revisión legal: alarga el plazo contratado</strong> · Nota interna para el equipo; no se muestra al paciente.</p>';
 const tail=` <strong>Plazo extendido</strong>: se agrega la cuota ${n.number||''} el ${dmy(n.dueDate)} por ${fmtMoney(n.payment||0)}; fin del plazo ${dmy(n.contractEndBefore||result.originalDue)} → ${dmy(n.dueDate)}. Saldo de capital ${fmtMoney(a.outstanding||0)} → ${fmtMoney(a.outstanding||0)} (sin cambio). Extensión ${a.count} de ${a.max||3}.`;
 if(result.insoluto)return `<p>Última cuota · Saldo insoluto: cobro hoy comisión ${fmtMoney(result.fee)} (${Math.round((a.feeRate||0)*10000)/100}% del saldo ${fmtMoney(a.feeBase||0)}) + IVA ${fmtMoney(result.feeVat)} = ${fmtMoney(result.total)}. El interés original ${fmtMoney(a.originalInterest||0)} + IVA ${fmtMoney(a.originalInterestIva||0)} = ${fmtMoney(roundToCents((a.originalInterest||0)+(a.originalInterestIva||0)))} se paga el ${dmy(result.originalDue)} sin abono a capital. El capital diferido ${fmtMoney(n.capital||0)} pasa a la cuota nueva con interés por ${n.days||0} días reales/360 ${fmtMoney(n.interest||0)} + IVA ${fmtMoney(n.interestIva||0)}.${tail}</p>${legal}`;
 const iva=roundToCents((result.interestIvaPaid||0)+(result.feeVat||0));
 return `<p>Última cuota · Saldos globales · ${dmy(result.originalDue)} → cuota nueva ${dmy(result.extendedDue)} (${a.extraDays||0} días). Cobro hoy: interés original de la cuota ${fmtMoney(a.originalInterest||0)} + interés adicional ${fmtMoney(result.extraInterest||0)} (solo sobre el capital diferido ${fmtMoney(result.capitalDeferred||0)} por ${a.extraDays||0} días) + comisión ${fmtMoney(result.fee)} (${Math.round((a.feeRate||0)*10000)/100}% de la cuota ${fmtMoney(a.feeBase||0)}) + IVA ${fmtMoney(iva)} = ${fmtMoney(result.total)}. La cuota nueva es solo capital ${fmtMoney(n.capital||0)}: el interés de los días extra ya se cobra hoy.${tail}</p>${legal}`;
}
// v65: marca de plazo extendido a nivel crédito (cartera, portal, exportación).
function carteraPlazoExtendido(p){
 const m=p&&p.application&&p.application.plazoExtendido;
 if(!m||!m.newEnd)return null;
 return {originalEnd:m.originalEnd||'',newEnd:m.newEnd,count:Number(m.count)||1,label:'Plazo extendido · nuevo fin '+carteraDmy(m.newEnd),legalReview:'Pendiente de revisión legal: alarga el plazo contratado'};
}
// Se lee del movimiento de extensión registrado; no modifica la cuota ni los montos del motor.
function carteraExtensionCharges(p,rowId){
 return carteraActivePayments(p).filter(m=>m&&m.paymentType==='preventive_extension'&&(!rowId||m.rowId===rowId)).map(m=>{
  const fee=roundToCents(dispersionNumber(m.fee,0)),feeVat=roundToCents(dispersionNumber(m.feeVat,0));
  return {rowId:m.rowId||'',date:m.date||'',receiptId:m.receiptId||'',count:m.count||'',fee,feeVat,total:roundToCents(fee+feeVat),charged:roundToCents(dispersionNumber(m.amountReceived??m.amount,0)),originalDue:m.originalDue||'',extendedDue:m.extendedDue||'',insoluto:/^insoluto/.test(String(m.rule||'')),lastCuota:!!m.lastCuota,newDue:m.newCuota&&m.newCuota.dueDate||'',feeRate:Number(m.feeRate)||0,feeBase:roundToCents(dispersionNumber(m.feeBase,0))};
 }).filter(c=>c.total>0);
}
function carteraExtensionChargeText(c){
 const dmy=v=>String(v||'').replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$3/$2/$1');
 const pct=Math.round(c.feeRate*10000)/100;
 const base=c.insoluto?`${pct}% del saldo insoluto ${fmtMoney(c.feeBase)}`:`${pct}% de la cuota ${fmtMoney(c.feeBase)}`;
 return {date:dmy(c.date),base,detail:`Extensión ${c.count} · ${base} · cobrada el ${dmy(c.date)}${c.lastCuota?' · Plazo extendido: cuota nueva '+dmy(c.newDue):c.insoluto?'':' · '+dmy(c.originalDue)+' → '+dmy(c.extendedDue)} · cobro total de la extensión ${fmtMoney(c.charged)}`};
}
function carteraExtensionChargeRowsHtml(p,row,layout){
 if(!row||!row.id)return '';
 let charges=[];try{charges=carteraExtensionCharges(p,row.id);}catch(error){charges=[];}
 const pill=status=>typeof dispersionPill==='function'?dispersionPill(status):escapeHtml(status);
 // v65: la cuota nueva por plazo extendido se identifica en la tabla de amortización.
 let plazo='';
 if(row.plazoExtendido){const from=(p.paymentSchedule||[]).find(item=>item.id===row.extendedFromRowId),txt=`Cuota nueva por extensión de la última cuota${from&&from.number?' '+from.number:''}${from?` (vencía ${carteraDmy(carteraDue(from))})`:""} · nuevo fin del plazo ${carteraDmy(carteraDue(row))} · el saldo de capital no cambia`;
  plazo=layout==='dispersion'?`<tr class="amortization-plazo-extendido" data-plazo-extendido="1"><td></td><td><span class="dispersion-type">Plazo extendido</span></td><td>${escapeHtml(carteraDmy(carteraDue(row)))}</td><td colspan="11" style="white-space:normal;text-align:left;overflow-wrap:anywhere;line-height:1.4"><small class="muted" style="display:block">${escapeHtml(txt)}</small></td></tr>`:`<tr class="cartera-plazo-extendido" data-plazo-extendido="1"><td></td><td>Plazo extendido</td><td colspan="10" style="white-space:normal;text-align:left"><small>${escapeHtml(txt)}</small></td></tr>`;}
 return plazo+charges.map(c=>{
  const t=carteraExtensionChargeText(c);
  if(layout==='dispersion')return `<tr class="amortization-extension-charge"><td></td><td><span class="dispersion-type">Comisión por extensión</span></td><td>${escapeHtml(t.date)}</td><td colspan="6" style="white-space:normal;text-align:left;overflow-wrap:anywhere;line-height:1.4"><small class="muted" style="display:block">Comisión ${fmtMoney(c.fee)} + IVA de comisión ${fmtMoney(c.feeVat)} · ${escapeHtml(t.detail)}</small></td><td class="money">${fmtMoney(c.total)}</td><td class="money muted-money">—</td><td>${pill('Pagado')}</td><td></td><td></td></tr>`;
  return `<tr class="cartera-extension-charge"><td></td><td>Comisión por extensión<br><small>${escapeHtml(t.base)}</small></td><td>${escapeHtml(t.date)}<br><small>Cobro total ${escapeHtml(fmtMoney(c.charged))}</small></td><td>${fmtMoney(0)}</td><td>${fmtMoney(c.feeVat)}</td><td>${fmtMoney(0)}</td><td>${fmtMoney(c.fee)}</td><td>${fmtMoney(0)}</td><td>${fmtMoney(c.total)}</td><td>${fmtMoney(0)}</td><td>${pill('Pagado')}</td><td></td></tr>`;
 }).join('');
}
function carteraExtensionMovementHtml(m){
 if(!m||m.paymentType!=='preventive_extension')return '';
 const fee=roundToCents(dispersionNumber(m.fee,0)),feeVat=roundToCents(dispersionNumber(m.feeVat,0));
 const interest=roundToCents(dispersionNumber(m.interestPaid,0)),iva=roundToCents(dispersionNumber(m.interestIvaPaid,0));
 return `Interés ${fmtMoney(interest)} · IVA de interés ${fmtMoney(iva)} · Comisión por extensión ${fmtMoney(fee)} · IVA de comisión ${fmtMoney(feeVat)} · Total ${fmtMoney(roundToCents(interest+iva+fee+feeVat))}`;
}
function carteraPayableRows(p){
 const rows=typeof dispersionBuildSchedule==='function'?dispersionBuildSchedule(p):(p&&p.paymentSchedule||[]);
 return carteraOpenRows(rows).sort((a,b)=>carteraDue(a).localeCompare(carteraDue(b)));
}
function carteraSelectedRow(p){
 const rows=carteraPayableRows(p);
 return rows.find(row=>row.id===carteraUiState.rowId)||rows[0]||null;
}
function carteraSelectedRowLabel(p){
 const row=carteraSelectedRow(p);
 if(!row)return 'Sin cuota pendiente';
 return `Cuota ${row.number||'—'} · ${String(row.currentDueDate||row.dueDate||'sin fecha').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1')}`;
}
function carteraRestructureCommissionLabel(p,option){
 const rules=carteraRules(p),rate=Number(option==='A'?rules.restructureCommissionARate:rules.restructureCommissionBRate);
 return 'Comisión de reestructura sobre saldo al corte · '+(Number.isFinite(rate)?(rate*100).toFixed(2)+'%':'Sin configurar');
}
// v66: indica si la extensión aplicaría a la última cuota (cotización pura, sin cambios al crédito).
function carteraExtensionLastCuotaInfo(p){
 try{const before=JSON.stringify(p.paymentSchedule||null),q=carteraQuoteExtension(p,{preview:true});if(JSON.stringify(p.paymentSchedule||null)!==before)return null;return q&&q.ok&&q.lastCuota&&q.newCuota?{newDue:q.newCuota.dueDate,number:q.newCuota.number}:null;}catch(error){return null;}
}
// v71: la UI de extensión ofrece «Corta, 30 días» (recomendada, primero) y «Al final». Última cuota: solo «Al final».
// v71.1: insolutos también ofrecen «Corta, 30 días»; después de una Corta la siguiente extensión solo puede ser «Al final».
function carteraExtensionUiModality(p){
 const last=carteraExtensionLastCuotaInfo(p);
 if(last)return undefined;
 if(carteraLastExtensionWasCorta(p))return 'COLA_FINAL';
 return carteraUiState.modality==='COLA_FINAL'?'COLA_FINAL':'CORTA';
}
function carteraPanelHtml(p){
 const action=carteraNormalizeAction(carteraUiState.action);
 const draft=carteraUiState.draft||{};
 const date=draft.date||dispersionBusinessDateMX();
 let body='';
 if(action==='pago'){
  body=`<p>El monto sigue la prelación desde la cuota más antigua: IVA, comisiones, moratorios, ordinarios y capital.</p><div class="cartera-form">${carteraMoneyInput('carteraAmount','Monto',draft.amount)}${carteraMoneyInput('carteraDate','Fecha',date)}${carteraTextInput('carteraReference','Referencia',draft.reference)}${carteraMethodSelect(draft)}${carteraTextInput('carteraCuenta','Cuenta (opcional)',draft.cuenta)}${carteraTextInput('carteraOrigen','Origen (opcional)',draft.origen)}<label class="field">Comprobante (opcional)<input id="carteraComprobante" type="file" accept="image/*,.pdf" onchange="carteraRememberFile(this)"></label><div class="field"><span>Cuota seleccionada</span><strong>${escapeHtml(carteraSelectedRowLabel(p))}</strong></div></div><p class="cartera-excess-note">Si el monto supera lo exigible, el excedente se aplica como prepago a capital (no requiere administrador). Elige el efecto:</p><div class="cartera-choices cartera-choices-sub" role="group" aria-label="Efecto del excedente">${carteraModalityButton('reduce_plazo','Reducir plazo',carteraUiState.modality==='reduce_cuota'?'reduce_cuota':'reduce_plazo')}${carteraModalityButton('reduce_cuota','Reducir cuota',carteraUiState.modality==='reduce_cuota'?'reduce_cuota':'reduce_plazo')}</div>`;
 }else if(action==='anticipo'){
  const target=carteraAdvanceTarget(p,date);
  body=`<p>Pagar cuota por adelantado: cubre la siguiente cuota con la prelación normal. Admite pago parcial. No es prepago y no recalcula intereses.</p><div class="cartera-form">${carteraMoneyInput('carteraAmount','Monto',draft.amount,target?'Cuota '+(target.number||'')+' · pendiente '+fmtMoney(dispersionNumber(target.pendingAmount,target.totalPayment)):'Sin cuota futura disponible.')}${carteraMoneyInput('carteraDate','Fecha',date)}${carteraTextInput('carteraReference','Referencia',draft.reference)}${carteraMethodSelect(draft)}${carteraTextInput('carteraCuenta','Cuenta (opcional)',draft.cuenta)}<div class="field"><span>Cuota que se adelanta</span><strong>${escapeHtml(target?'Cuota '+(target.number||'—')+' · '+carteraDmy(carteraDue(target)):'Sin cuota futura')}</strong></div></div>`;
 }else if(action==='prepago'){
  const mode=carteraUiState.modality||'reduce_plazo';
  body=`<div class="cartera-choices cartera-choices-sub" role="group" aria-label="Modalidad de prepago">${carteraModalityButton('reduce_plazo','Reducir plazo',mode)}${carteraModalityButton('reduce_cuota','Reducir cuota',mode)}${carteraModalityButton('liquidacion_total','Liquidación total',mode)}</div><div class="cartera-form">${carteraMoneyInput('carteraAmount','Monto',draft.amount,'En liquidación total se usa el saldo calculado.')}${carteraMoneyInput('carteraDate','Fecha',date)}${carteraTextInput('carteraReference','Referencia',draft.reference)}${carteraMethodSelect(draft)}${carteraTextInput('carteraCuenta','Cuenta (opcional)',draft.cuenta)}</div>`;
 }else if(action==='extension'){
  const rules=carteraRules(p),mode=carteraExtensionUiModality(p)||'COLA_FINAL';
  const insolutoPanel=dispersionTerms(p).interestCalculationBase==='outstanding_balance',last=carteraExtensionLastCuotaInfo(p);
  // v66: en la última cuota no se muestran «Cola final»/«Prorrateado» (siempre se crea una cuota nueva al final).
  const modeHtml=last?`<p class="cartera-last-cuota-note" data-last-cuota="1">Última cuota: se agrega una cuota nueva al final con vencimiento ${escapeHtml(carteraDmy(last.newDue))}${insolutoPanel?' (capital diferido más interés por días reales e IVA). El interés original conserva su vencimiento.':'. El capital diferido pasa a esa cuota; no aplica cola final ni prorrateado.'}</p>`:'<div class="cartera-choices cartera-choices-sub" role="group" aria-label="Modalidad de extensión">'+(carteraLastExtensionWasCorta(p)?'<button type="button" class="cartera-choice" aria-pressed="false" disabled data-corta-bloqueada="1">Corta, 30 días · No disponible</button>':carteraModalityButton('CORTA','Corta, 30 días · Recomendada',mode))+carteraModalityButton('COLA_FINAL','Al final',mode)+'</div>'+(carteraLastExtensionWasCorta(p)?'<p class="cartera-excess-note" data-corta-bloqueada-nota="1">'+escapeHtml(CARTERA_CORTA_REPETIDA_MSG)+'</p>':'')+(insolutoPanel?(mode==='CORTA'?'<p>Saldo insoluto · Corta: hoy se paga el interés de la cuota con IVA y la comisión con IVA. El capital de la cuota y el interés extra de esos días pasan a la cuota siguiente.</p>':'<p>Saldo insoluto · Al final: hoy solo comisión con IVA. Se recalculan las cuotas restantes dentro del plazo original; el interés original conserva su vencimiento.</p>'):'');
  body=`<p>Sin mora y antes del vencimiento. Máximo ${rules.preventiveExtensionMax} por crédito (${carteraExtensionCount(p)} de ${rules.preventiveExtensionMax} usadas). No requiere administrador.</p>${modeHtml}<div class="cartera-form">${mode==='CORTA'&&!last?'':carteraMoneyInput('carteraNewDue','Nueva fecha',draft.newDue,last?'Vacío: se usa '+carteraDmy(last.newDue)+' (un periodo después de la última cuota).':'Vacío: un día antes de la siguiente cuota. En la última cuota se crea una cuota nueva un periodo después (plazo extendido).')}${carteraTextInput('carteraReference','Referencia',draft.reference)}${carteraTextInput('carteraCuenta','Cuenta (opcional)',draft.cuenta)}</div>`;
 }else{
  const mode='B';
  body=`<p>${staffIsAdmin()?'Reestructura: todo el principal pendiente más interés e IVA devengados al corte y comisión configurada. Cuotas con IVA incluido; ajuste final solo de centavos.':'La reestructura requiere un administrador. Puedes revisar la pantalla, pero la confirmación queda bloqueada.'}</p><div class="cartera-choices cartera-choices-sub" role="group" aria-label="Opción de reestructura">${carteraModalityButton('B',carteraRestructureCommissionLabel(p,'B'),mode)}</div><p class="cartera-excess-note">Opción A (capitalizar todo) desactivada.</p><div class="cartera-form">${carteraMoneyInput('carteraTerm','Plazo (periodos)',draft.term||'6').replace('<input ','<input oninput="carteraInvalidateRestructurePreview()" ')}${carteraMoneyInput('carteraRate','Tasa anual (%)',draft.rate||'36').replace('<input ','<input oninput="carteraInvalidateRestructurePreview()" ')}${carteraMoneyInput('carteraCuota','Cuota calculada con IVA','','Se calcula con el plazo y la tasa al abrir la vista previa; no se captura manualmente.').replace('<input ','<input disabled ').replace('type="number"','type="text"')}</div>`;
 }
 return `<section id="carteraFase1" class="cartera-fase1"><h4>Aplicar pago</h4><div class="cartera-choices cartera-choices-ops" role="group" aria-label="Tipo de operación">${carteraChoice('pago','Pago normal')}${carteraChoice('anticipo','Cuota por adelantado')}${carteraChoice('prepago','Prepago')}${carteraChoice('extension','Extensión')}${carteraChoice('reestructura','Reestructura')}</div>${body}<div class="cartera-actions"><button type="button" class="btn btn-secondary" onclick="carteraRunPreview()">Vista previa</button><button type="button" class="btn btn-primary" id="carteraConfirm" onclick="carteraConfirmCurrent()" ${carteraUiState.token?'':'disabled'}>Confirmar</button></div><div id="carteraFase1Preview" class="cartera-preview" role="status">${carteraUiState.previewHtml||''}</div></section>`;
}
function carteraRememberFile(input){
 const file=input&&input.files&&input.files[0];
 if(!file){carteraUiState.comprobante=null;return;}
 if(file.size>120000){carteraUiState.comprobante=null;input.value='';if(typeof toast==='function')toast('El comprobante es demasiado grande para esta demo (máximo 120 KB).');return;}
 if(typeof FileReader!=='function'){carteraUiState.comprobante={name:file.name,type:file.type||'',dataUrl:''};return;}
 const reader=new FileReader();
 reader.onload=()=>{carteraUiState.comprobante={name:file.name,type:file.type||'',dataUrl:String(reader.result||'').slice(0,180000)};};
 reader.readAsDataURL(file);
}
function carteraPreviewOrdinary(p,input){
 const date=input.date||dispersionBusinessDateMX();
 const amount=roundToCents(Number(input.amount)||0);
 if(!(amount>0)||!Number.isSafeInteger(Math.round(amount*100)))return {ok:false,error:'Captura un monto válido que pueda representarse con precisión de centavos.'};
 // v67 (D-16): la vista previa explica la fecha futura (antes confirmaba y fallaba con «No se aplicó el pago.»). Misma regla que el registro.
 if(String(date)>dispersionBusinessDateMX())return {ok:false,code:'FUTURE_DATE',error:'No es posible registrar pagos con fecha futura. Usa la fecha real de recepción en Ciudad de México.'};
 const duplicate=carteraFindDuplicate(p,amount,input.cuenta||'',date);
 const source=carteraPayableRows(p).filter(row=>typeof dispersionIsOrdinaryPayableRow!=='function'||dispersionIsOrdinaryPayableRow(row,date));
 if(!source.length)return {ok:false,error:'No hay cuotas exigibles para este pago.'};
 const beforePaid=new Map(source.map(row=>[row.id,dispersionConceptDefs().map(def=>({key:def.key,paid:dispersionNumber(row[def.paid],0)}))]));
 const rows=JSON.parse(JSON.stringify(source));
 const allocation=carteraAllocateOldestFirst(rows,amount,date,input.reference||'VISTA',input.method||'SPEI');
 const bucket={ivaInteres:'iva',ivaMoratorio:'iva',commission:'comisiones',moratorio:'moratorios',moratorioSinInteres:'moratorios',interes:'ordinarios',ordinarioSinInteres:'ordinarios',capital:'capital'};
 const breakdown={iva:0,comisiones:0,moratorios:0,ordinarios:0,capital:0};
 rows.forEach(row=>{
  const prior=new Map((beforePaid.get(row.id)||[]).map(item=>[item.key,item.paid]));
  dispersionConceptDefs().forEach(def=>{
   const applied=roundToCents(Math.max(dispersionNumber(row[def.paid],0)-(prior.get(def.key)||0),0));
   if(!(applied>0))return;
   const name=bucket[def.key]||'ordinarios';
   breakdown[name]=roundToCents((breakdown[name]||0)+applied);
  });
 });
 const selected=carteraSelectedRow(p);
 const balanceBefore=carteraBalance(typeof dispersionBuildSchedule==='function'?dispersionBuildSchedule(p):(p.paymentSchedule||[]));
 const applied=roundToCents(amount-allocation.remaining);
 const base={ok:applied>0,error:applied>0?'':'El monto no cubrió conceptos pendientes.',amount,applied,remaining:allocation.remaining,breakdown,balanceBefore,balanceAfter:roundToCents(Math.max(balanceBefore-breakdown.capital,0)),duplicate,date,selectedLabel:selected?`Cuota ${selected.number||'—'} · ${String(selected.currentDueDate||selected.dueDate||'').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1')}`:''};
 // v64: el excedente sobre lo exigible ya no queda «sin aplicar»: se cotiza como prepago a capital.
 return base.ok&&base.remaining>0?carteraOverpayPreview(p,base,input||{}):base;
}
// v64 · Pago normal con excedente (decisión aprobada). El pago normal cubre solo lo exigible con la prelación
// vigente (IVA > comisiones > moratorios > ordinarios > capital, cuota más antigua primero). El excedente se aplica
// como prepago a capital con la lógica de prepago existente: reducir plazo por defecto o reducir cuota si se elige.
// El excedente nunca supera el capital restante: no hay saldo a favor.
function carteraPrepayModalityLabel(m){return m==='reduce_cuota'?'Reducir cuota':'Reducir plazo';}
function carteraDmy(v){return String(v||'').replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$3/$2/$1');}
function carteraScheduleSnapshot(p){
 const all=dispersionBuildSchedule(p);
 const rows=carteraOpenRows(all).filter(r=>carteraCapitalPending(r)>0.009||dispersionNumber(r.pendingAmount,0)>0.009).sort((a,b)=>carteraDue(a).localeCompare(carteraDue(b)));
 const withCap=rows.filter(r=>carteraCapitalPending(r)>0.009);
 const pick=r=>r?{id:r.id,number:r.number,date:carteraDue(r),amount:roundToCents(dispersionNumber(r.pendingAmount,0)),capital:roundToCents(carteraCapitalPending(r))}:null;
 return {balance:carteraBalance(all),periods:withCap.length,next:pick(rows[0]),last:pick(withCap.at(-1)),rows:rows.map(pick)};
}
// Runs fn against a deep copy of the demo state and puts the exact previous state back (simulation only).
function carteraSandbox(p,fn){
 const realDb=db,version=dispersionLedgerStorageVersion;let stored=null;
 try{stored=localStorage.getItem(DEMO_STORAGE_KEY);}catch(error){}
 let out;
 try{db=JSON.parse(JSON.stringify(realDb));const q=(db.patients||[]).find(item=>item&&item.id===p.id);out=q?fn(q):{ok:false,error:'No se encontró el crédito.'};}
 catch(error){out={ok:false,error:error&&error.message||'No se pudo simular la operación.'};}
 finally{db=realDb;try{if(stored!==null)localStorage.setItem(DEMO_STORAGE_KEY,stored);}catch(error){}dispersionLedgerStorageVersion=version;}
 return out;
}
function carteraRunSplit(p,input,parts,modality){
 const id=p.id,find=()=>(db.patients||[]).find(item=>item&&item.id===id)||p;
 const date=parts.date,reference=String(input.reference||'').trim()||('PAGO-'+Date.now()),method=String(input.method||'SPEI').trim()||'SPEI',cuenta=input.cuenta||'';
 const group='SPLIT-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
 const ok=dispersionApplyPayment({creditId:id,amount:parts.normal,type:'ordinary',date,reference,method,target:'auto',cuenta,origen:input.origen||'',comprobante:input.comprobante||(typeof carteraUiState!=='undefined'&&carteraUiState.comprobante)||null},{quiet:true,confirmDuplicate:true,cuenta});
 if(!ok)return {ok:false,error:'No se aplicó la parte de pago normal.'};
 let q=find();const normalMove=q.payments.at(-1);const normalId=normalMove&&normalMove.receiptId;
 const mid=carteraScheduleSnapshot(q);
 const prepay=carteraApplyPrepay(q,{modality,amount:parts.prepay,date,reference:reference+'-PREPAGO',method,cuenta,confirmDuplicate:true});
 if(!prepay||prepay.ok===false)return {ok:false,error:'No se aplicó el excedente como prepago: '+(prepay&&prepay.error||'error desconocido')};
 q=find();
 const prepayMove=q.payments.at(-1);
 const normal=q.payments.find(m=>m.receiptId===normalId)||normalMove;
 if(!normal||!prepayMove||normal===prepayMove)return {ok:false,error:'No se registraron los dos movimientos del pago.'};
 const tag={splitGroup:group,splitReceived:roundToCents(parts.normal+parts.prepay),splitNormal:parts.normal,splitPrepay:parts.prepay,splitModality:modality};
 Object.assign(normal,tag,{splitRole:'pago_normal'});
 Object.assign(prepayMove,tag,{splitRole:'prepago'});
 carteraResave();
 const after=carteraScheduleSnapshot(q);
 return {ok:true,group,normal,prepayMove,prepay,mid,after};
}
function carteraSplitSummary(base,run,modality){
 const nextBefore=run.mid.next,nextAfter=run.after.rows.find(r=>nextBefore&&r.id===nextBefore.id)||run.after.next;
 const lastBefore=run.mid.last,lastAfter=run.after.last;
 return {received:roundToCents(base.amount),normal:roundToCents(base.applied),breakdown:{...base.breakdown},prepay:roundToCents(base.remaining),modality,effect:modality==='reduce_cuota'?'reduce_payment':'reduce_term',
  balanceBefore:roundToCents(base.balanceBefore),balanceAfterNormal:roundToCents(run.mid.balance),balanceAfter:roundToCents(run.after.balance),
  periodsBefore:run.mid.periods,periodsAfter:run.after.periods,nextBefore,nextAfter,lastBefore,lastAfter};
}
function carteraSplitEffectText(s){
 if(s.effect==='reduce_payment')return `Reducir cuota: las cuotas restantes bajan; próxima cuota${s.nextBefore?' ('+carteraDmy(s.nextBefore.date)+')':''} ${fmtMoney(s.nextBefore&&s.nextBefore.amount||0)} → ${fmtMoney(s.nextAfter&&s.nextAfter.amount||0)}; el plazo se mantiene en ${s.periodsAfter} cuotas.`;
 const removed=s.periodsBefore-s.periodsAfter;
 return `Reducir plazo: se aplica desde la última cuota; ${removed>0?'se eliminan '+removed+' cuota'+(removed===1?'':'s')+' ('+s.periodsBefore+' → '+s.periodsAfter+')':'el número de cuotas se mantiene en '+s.periodsAfter}; última cuota ${s.lastAfter?carteraDmy(s.lastAfter.date)+' '+fmtMoney(s.lastAfter.amount):'—'}${s.lastBefore&&s.lastAfter&&s.lastBefore.id===s.lastAfter.id?' (antes '+fmtMoney(s.lastBefore.amount)+')':s.lastBefore?' (antes '+carteraDmy(s.lastBefore.date)+' '+fmtMoney(s.lastBefore.amount)+')':''}. Las demás cuotas no cambian.`;
}
function carteraSplitText(s){
 const b=s.breakdown||{};
 return `Monto recibido ${fmtMoney(s.received)}. Aplicado a pago normal ${fmtMoney(s.normal)} (IVA ${fmtMoney(b.iva||0)} · Comisiones ${fmtMoney(b.comisiones||0)} · Moratorios ${fmtMoney(b.moratorios||0)} · Ordinarios ${fmtMoney(b.ordinarios||0)} · Capital ${fmtMoney(b.capital||0)}). Aplicado a prepago a capital ${fmtMoney(s.prepay)}. Efecto: ${carteraSplitEffectText(s)} Nuevo saldo ${fmtMoney(s.balanceAfter)} (antes ${fmtMoney(s.balanceBefore)}).`;
}
function carteraOverpayPreview(p,base,input){
 const modality=input.prepayModality==='reduce_cuota'?'reduce_cuota':'reduce_plazo';
 const due=roundToCents(base.applied),excess=roundToCents(base.remaining),date=base.date;
 const capitalAfter=roundToCents(base.balanceAfter);
 const fail=(code,max,error)=>({...base,ok:false,code,max,error});
 if(!(typeof dispersionCanPrepayOrLiquidate==='function'&&dispersionCanPrepayOrLiquidate(p,date))){
  const allowed=typeof dispersionPrepayAllowedDate==='function'?dispersionPrepayAllowedDate(p):'';
  return fail('OVERPAY_PREPAY_LOCKED',due,`El monto supera lo exigible por ${fmtMoney(excess)} y el prepago a capital ${allowed?'estará disponible a partir del '+carteraDmy(allowed):'aún no está habilitado'}. Monto máximo hoy: ${fmtMoney(due)}.`);
 }
 let settlement=0;
 try{const sim=dispersionCalculateEarlySettlement(JSON.parse(JSON.stringify(p)),date);settlement=roundToCents(sim.total||sim.totalToSettle||0);}catch(error){settlement=0;}
 const debt=roundToCents(Math.max(settlement,due+capitalAfter));
 const charges=roundToCents(debt-due-capitalAfter);
 if(base.amount>debt+0.004)return fail('OVERPAY_MAX',debt,`El monto excede la deuda total del crédito. Monto máximo: ${fmtMoney(debt)} = exigible ${fmtMoney(due)} + capital restante ${fmtMoney(capitalAfter)}${charges>0?' + intereses devengados '+fmtMoney(charges)+' (según la liquidación)':''}. No se registran saldos a favor.`);
 if(excess>=capitalAfter-0.004){
  const maxSplit=roundToCents(due+capitalAfter-0.01);
  if(!carteraCanSettle(p,date))return fail('OVERPAY_SETTLEMENT',roundToCents(due+capitalAfter-0.01),`Con este monto se pagaría todo el capital restante (${fmtMoney(capitalAfter)}). ${carteraSettlementLockedText(p,date)} Como pago normal con abono, el máximo es ${fmtMoney(roundToCents(due+capitalAfter-0.01))}.`);
  return fail('OVERPAY_SETTLEMENT',debt,`Con este monto se pagaría todo el capital restante (${fmtMoney(capitalAfter)}). Para cerrar el crédito usa Prepago › Liquidación total por ${fmtMoney(debt)}${charges>0?' (incluye intereses devengados '+fmtMoney(charges)+')':''}. Como pago normal con prepago, el máximo es ${fmtMoney(maxSplit)}.`);
 }
 const run=carteraSandbox(p,q=>carteraRunSplit(q,input,{date,normal:due,prepay:excess},modality));
 if(!run||!run.ok)return fail('OVERPAY_PREPAY_FAILED',due,(run&&run.error)||'No se pudo calcular el prepago del excedente.');
 const split=carteraSplitSummary(base,run,modality);
 return {...base,remaining:0,split,balanceAfter:split.balanceAfter};
}
function carteraRestoreState(snapshot){
 const p=snapshot.patient;
 Object.keys(p).forEach(key=>delete p[key]);Object.assign(p,JSON.parse(snapshot.before));
 const restored=JSON.parse(snapshot.dbBefore);restored.patients=(restored.patients||[]).map(item=>item&&item.id===p.id?p:item);db=restored;
 try{if(snapshot.storage!==null)localStorage.setItem(DEMO_STORAGE_KEY,snapshot.storage);}catch(error){}
 dispersionLedgerStorageVersion=snapshot.version;
}
function carteraApplyOverpay(p,input,preview){
 const split=preview.split;
 let storage=null;try{storage=localStorage.getItem(DEMO_STORAGE_KEY);}catch(error){}
 const snapshot={patient:p,before:JSON.stringify(p),dbBefore:JSON.stringify(db),storage,version:dispersionLedgerStorageVersion};
 let run;
 try{run=carteraRunSplit(p,input,{date:preview.date,normal:split.normal,prepay:split.prepay},split.modality);}
 catch(error){run={ok:false,error:error&&error.message||'No se aplicó el pago.'};}
 if(!run||!run.ok){carteraRestoreState(snapshot);return {ok:false,error:(run&&run.error||'No se aplicó el pago.')+' No se modificó el crédito.'};}
 const actual=carteraSplitSummary({amount:split.received,applied:split.normal,remaining:split.prepay,breakdown:split.breakdown,balanceBefore:split.balanceBefore},run,split.modality);
 const q=(db.patients||[]).find(item=>item&&item.id===p.id)||p;
 if(typeof dispersionReceiptEvent==='function')dispersionReceiptEvent(q,'Pago normal con prepago del excedente',carteraSplitText(actual));
 carteraResave();
 return {ok:true,preview:{...preview,split:actual,balanceAfter:actual.balanceAfter},split:actual,payment:run.normal,prepayPayment:run.prepayMove,audit:{type:'pago',breakdown:split.breakdown,balanceBefore:actual.balanceBefore,balanceAfter:actual.balanceAfter,amount:split.normal,prepay:split.prepay,received:split.received,modality:split.modality}};
}
function carteraApplyOrdinary(p,input){
 // v63: say why the payment was refused instead of a generic «No se aplicó el pago».
 if(typeof can==='function'&&!can('registerPayments'))return {ok:false,code:'PERMISSION',error:'Registrar un pago requiere permiso de cartera.'};
 const preview=carteraPreviewOrdinary(p,input||{});
 if(!preview.ok)return preview;
 if(!carteraAcceptDuplicate(p,input,preview.amount,preview.date))return {ok:false,error:'Registro cancelado; no se modificó el crédito.'};
 if(preview.split)return carteraApplyOverpay(p,input||{},preview);
 const ok=dispersionApplyPayment({creditId:p.id,amount:roundToCents(Number(input.amount)||0),type:'ordinary',date:input.date||dispersionBusinessDateMX(),reference:input.reference||('PAGO-'+Date.now()),method:input.method||'SPEI',target:'auto',cuenta:input.cuenta||'',origen:input.origen||'',comprobante:carteraUiState.comprobante||null},{quiet:true,confirmDuplicate:true,cuenta:input.cuenta||''});
 if(!ok)return {ok:false,error:'No se aplicó el pago.'};
 return {ok:true,preview,payment:p.payments&&p.payments.at?p.payments.at(-1):null,audit:{type:'pago',breakdown:preview.breakdown,balanceBefore:preview.balanceBefore,balanceAfter:preview.balanceAfter,amount:preview.applied}};
}
// v71 (aprobado 27/10/2026): «Pagar cuota por adelantado». Tipo de pago propio (no es prepago):
// cubre la siguiente cuota futura con la prelación normal (IVA, comisiones, moratorios, ordinarios y capital),
// admite pagos parciales y no recalcula intereses (en insolutos el interés corre hasta la fecha original).
function carteraAdvanceTarget(p,date){
 const rows=typeof dispersionBuildSchedule==='function'?dispersionBuildSchedule(p):(p&&p.paymentSchedule||[]);
 return rows.filter(row=>row&&row.type!=='Pago inicial requerido'&&typeof dispersionIsAdvancePayableRow==='function'&&dispersionIsAdvancePayableRow(row,date)).sort((a,b)=>carteraDue(a).localeCompare(carteraDue(b))||Number(a.number||0)-Number(b.number||0))[0]||null;
}
function carteraPreviewAdvance(p,input={}){
 if(!p||dispersionIsCreditLiquidated(p))return {ok:false,error:'Este crédito ya está liquidado; no admite pagos.'};
 const date=String(input.date||dispersionBusinessDateMX());
 const amount=roundToCents(Number(input.amount)||0);
 if(!(amount>0)||!Number.isSafeInteger(Math.round(amount*100)))return {ok:false,error:'Captura un monto válido que pueda representarse con precisión de centavos.'};
 if(date>dispersionBusinessDateMX())return {ok:false,code:'FUTURE_DATE',error:'No es posible registrar pagos con fecha futura. Usa la fecha real de recepción en Ciudad de México.'};
 const a=p.application||{};
 if(!(a.dispersionDate||a.disbursedAt||a.dispersedAt||a.amortizationStatus==='active'))return {ok:false,error:'El pago por adelantado solo está disponible cuando la tabla esté activa.'};
 const exigible=carteraPayableRows(p).filter(row=>typeof dispersionIsOrdinaryPayableRow!=='function'||dispersionIsOrdinaryPayableRow(row,date));
 if(exigible.length)return {ok:false,code:'ADVANCE_DUES_FIRST',error:'Hay cuotas exigibles. Primero usa Pago normal; el pago por adelantado solo cubre la siguiente cuota futura.'};
 const target=carteraAdvanceTarget(p,date);
 if(!target)return {ok:false,error:'No hay una cuota futura programada para pagar por adelantado.'};
 const cuotaBefore=roundToCents(Math.max(dispersionNumber(target.pendingAmount,target.totalPayment),0));
 if(amount>cuotaBefore+0.004)return {ok:false,code:'ADVANCE_MAX',max:cuotaBefore,error:'El monto supera la cuota '+(target.number||'')+' ('+fmtMoney(cuotaBefore)+'). Pagar la cuota por adelantado no es prepago; para abonar a capital usa Prepago.'};
 const copy=JSON.parse(JSON.stringify(target)),prior=new Map(dispersionConceptDefs().map(def=>[def.key,dispersionNumber(copy[def.paid],0)]));
 dispersionApplyAmountToConcepts(copy,amount,date,input.reference||'VISTA',input.method||'SPEI');
 const bucket={ivaInteres:'iva',ivaMoratorio:'iva',commission:'comisiones',moratorio:'moratorios',moratorioSinInteres:'moratorios',interes:'ordinarios',ordinarioSinInteres:'ordinarios',capital:'capital'};
 const breakdown={iva:0,comisiones:0,moratorios:0,ordinarios:0,capital:0};
 dispersionConceptDefs().forEach(def=>{const applied=roundToCents(Math.max(dispersionNumber(copy[def.paid],0)-(prior.get(def.key)||0),0));if(applied>0){const name=bucket[def.key]||'ordinarios';breakdown[name]=roundToCents(breakdown[name]+applied);}});
 const balanceBefore=carteraBalance(dispersionBuildSchedule(p));
 const duplicate=carteraFindDuplicate(p,amount,input.cuenta||'',date);
 return {ok:true,type:'advance_installment',amount,applied:amount,remaining:0,breakdown,rowId:target.id,number:target.number||'',dueDate:carteraDue(target),cuotaBefore,cuotaAfter:roundToCents(Math.max(cuotaBefore-amount,0)),balanceBefore,balanceAfter:roundToCents(Math.max(balanceBefore-breakdown.capital,0)),date,duplicate};
}
function carteraApplyAdvance(p,input={}){
 if(typeof can==='function'&&!can('registerPayments'))return {ok:false,code:'PERMISSION',error:'Registrar un pago requiere permiso de cartera.'};
 const preview=carteraPreviewAdvance(p,input);
 if(!preview.ok)return preview;
 if(!carteraAcceptDuplicate(p,input,preview.amount,preview.date))return {ok:false,error:'Registro cancelado; no se modificó el crédito.'};
 let reason='';
 const ok=dispersionApplyPayment({creditId:p.id,amount:preview.amount,type:'advance_installment',date:preview.date,reference:input.reference||('ANTICIPO-'+Date.now()),method:input.method||'SPEI',target:preview.rowId,cuenta:input.cuenta||'',origen:input.origen||input.source||''},{quiet:true,confirmDuplicate:true,cuenta:input.cuenta||'',onError:message=>{reason=message;}});
 if(!ok)return {ok:false,error:reason||'No se aplicó el pago por adelantado.'};
 const q=(db.patients||[]).find(item=>item&&item.id===p.id)||p,payment=q.payments&&q.payments.at?q.payments.at(-1):null;
 if(payment&&input.source)payment.source=input.source;
 if(payment)payment.advanceInstallment={rowId:preview.rowId,number:preview.number,dueDate:preview.dueDate,cuotaBefore:preview.cuotaBefore,cuotaAfter:preview.cuotaAfter};
 carteraResave();
 return {ok:true,preview,payment,audit:{type:'anticipo',breakdown:preview.breakdown,balanceBefore:preview.balanceBefore,balanceAfter:preview.balanceAfter,amount:preview.amount,rowId:preview.rowId,number:preview.number,dueDate:preview.dueDate,cuotaAfter:preview.cuotaAfter,remaining:preview.cuotaAfter}};
}
function carteraPreviewText(result,action){
 if(!result||result.ok===false)return `<p>${escapeHtml(result&&result.error||'No hay vista previa.')}</p>`;
 if(action==='pago'&&result.split)return `<p>${escapeHtml(carteraSplitText(result.split))}${result.duplicate?' '+carteraDuplicateMessage():''}</p>`;
 if(action==='pago'){const b=result.breakdown||{};return `<p>Aplicado ${fmtMoney(result.applied||0)}. IVA ${fmtMoney(b.iva||0)} · Comisiones ${fmtMoney(b.comisiones||0)} · Moratorios ${fmtMoney(b.moratorios||0)} · Ordinarios ${fmtMoney(b.ordinarios||0)} · Capital ${fmtMoney(b.capital||0)}. Saldo ${fmtMoney(result.balanceBefore)} → ${fmtMoney(result.balanceAfter)}.${result.remaining>0?` Sobrante ${fmtMoney(result.remaining)}.`:' '}${result.duplicate?' '+carteraDuplicateMessage():''} ${escapeHtml(result.selectedLabel||'')}</p>`;}
 if(action==='anticipo'){const b=result.breakdown||{};return `<p>Cuota ${escapeHtml(String(result.number||''))} con vencimiento ${escapeHtml(carteraDmy(result.dueDate))}: se aplican ${fmtMoney(result.amount)} por adelantado (no es prepago). IVA ${fmtMoney(b.iva||0)} · Comisiones ${fmtMoney(b.comisiones||0)} · Moratorios ${fmtMoney(b.moratorios||0)} · Ordinarios ${fmtMoney(b.ordinarios||0)} · Capital ${fmtMoney(b.capital||0)}. Resta de la cuota ${fmtMoney(result.cuotaAfter)} con vencimiento ${escapeHtml(carteraDmy(result.dueDate))}.${result.duplicate?' '+carteraDuplicateMessage():''}</p>`;}
 if(action==='prepago')return `<p>Modalidad ${escapeHtml(({reduce_plazo:'Reducir plazo',reduce_cuota:'Reducir cuota',liquidacion_total:'Liquidación total'})[result.modality]||result.modality)}. Saldo ${fmtMoney(result.balanceBefore)} → ${fmtMoney(result.balanceAfter)}. Plazo ${result.periodsBefore} → ${result.periodsAfter} cuotas con capital. Monto ${fmtMoney(result.amount||result.total||0)}.</p>`;
 if(action==='extension'&&result.lastCuota)return carteraLastCuotaPreviewHtml(result);
 if(action==='extension'&&result.insoluto&&result.modality==='CORTA'){const a=result.audit||{},extra=roundToCents((a.nextExtraInterest||0)+(a.nextExtraIva||0));return `<p data-insoluto-corta="1">Saldo insoluto · Corta, 30 días · Extensión ${a.count} de ${a.max||3}. Cobro hoy: interés de la cuota ${fmtMoney(result.interestPaid||0)} + IVA ${fmtMoney(result.interestIvaPaid||0)} + comisión ${fmtMoney(result.fee)} (${Math.round((a.feeRate||0)*10000)/100}% del saldo ${fmtMoney(a.feeBase||0)}) + IVA ${fmtMoney(result.feeVat)} = <b>${fmtMoney(result.total)}</b>. La cuota del ${escapeHtml(carteraDmy(result.originalDue))} queda pagada sin capital; el capital ${fmtMoney(result.capitalDeferred||0)} pasa a la cuota del ${escapeHtml(carteraDmy(a.nextDue))}, que también lleva el interés extra de esos días ${fmtMoney(a.nextExtraInterest||0)} + IVA ${fmtMoney(a.nextExtraIva||0)} = ${fmtMoney(extra)} (se cobra en esa cuota, no hoy). La cuota del ${escapeHtml(carteraDmy(a.nextDue))} queda en ${fmtMoney(a.nextAmountAfter||0)}.</p>`;}
 if(action==='extension'&&result.insoluto)return `<p>Saldo insoluto: comisión ${fmtMoney(result.fee)} + IVA ${fmtMoney(result.feeVat)} · Cobro hoy ${fmtMoney(result.total)}. Sin interés adicional separado. El interés original ${fmtMoney(result.audit?.originalInterest||0)} + IVA ${fmtMoney(result.audit?.originalInterestIva||0)} = ${fmtMoney(roundToCents((result.audit?.originalInterest||0)+(result.audit?.originalInterestIva||0)))} se paga el ${escapeHtml(String(result.originalDue||'').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1'))} sin abono a capital. Cuotas restantes ${fmtMoney(result.insolutoPlan?.regularPayment||0)}; última ${fmtMoney(result.insolutoPlan?.finalPayment||0)} por ajuste de centavos.</p>`;
 if(action==='extension'){const a=result.audit||{},dmy=v=>escapeHtml(String(v||'').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1')),iva=roundToCents((result.interestIvaPaid||0)+(result.feeVat||0));if(result.modality==='CORTA')return `<p>Corta, 30 días · Extensión ${a.count} de ${a.max||3}. Cobro hoy: interés de la cuota ${fmtMoney(a.originalInterest||0)} + interés adicional ${fmtMoney(result.extraInterest||0)} (capital diferido ${fmtMoney(result.capitalDeferred||0)} × 30 días) + comisión ${fmtMoney(result.fee)} (${Math.round((a.feeRate||0)*10000)/100}% de la cuota ${fmtMoney(a.feeBase||0)}) + IVA ${fmtMoney(iva)} = ${fmtMoney(result.total)}. La cuota del ${dmy(result.originalDue)} queda pagada sin capital; el capital ${fmtMoney(result.capitalDeferred||0)} pasa a la cuota del ${dmy(a.nextDue)}.</p>`;return `<p>${escapeHtml(({COLA_FINAL:'Al final',PRORRATEADO:'Prorrateado'})[result.modality]||result.modality)} · ${dmy(result.originalDue)} → ${dmy(result.extendedDue)} (${a.extraDays||0} días) · Extensión ${a.count}. Cobro hoy: interés original de la cuota ${fmtMoney(a.originalInterest||0)} + interés adicional ${fmtMoney(result.extraInterest||0)} (solo sobre el capital diferido ${fmtMoney(result.capitalDeferred||0)} por ${a.extraDays||0} días) + comisión ${fmtMoney(result.fee)} (${Math.round((a.feeRate||0)*10000)/100}% de la cuota ${fmtMoney(a.feeBase||0)}) + IVA ${fmtMoney(iva)} = ${fmtMoney(result.total)}. El capital diferido se suma a ${result.modality==='PRORRATEADO'?'las cuotas restantes':'la última cuota'}; no se abona a capital.</p>`;}
 return `<p>Opción ${escapeHtml(result.option)}. Nuevo saldo ${fmtMoney(result.newBalance)}. Comisión ${fmtMoney(result.commissionFee)} + IVA ${fmtMoney(result.commissionFeeIva)}.${result.separated?` Mora aparte ${fmtMoney(result.separated.moratory)} + IVA ${fmtMoney(result.separated.moratoryIva)}.`:' Se incorpora el principal pendiente más intereses e IVA devengados al corte y la comisión indicada con su IVA; la apertura cobrada por separado no se incorpora.'}${result.regularPayment?` Cuota con IVA ${fmtMoney(result.regularPayment)}; última cuota ${fmtMoney(result.finalPayment)} (ajuste de centavos).`:''}</p>`;
}
function carteraLauncherHtml(p){
 const id=typeof escapeAttr==='function'?escapeAttr(p.id):p.id;
 return `<section id="carteraFase1Launch" class="cartera-fase1"><h4>Aplicar pago</h4><p>Pago normal, prepago, extensión o reestructura usan la misma prelación.</p>${carteraPayButtonHtml(id,'btn btn-primary')}</section>`;
}
function carteraInjectPanel(){
 const body=document.getElementById&&document.getElementById('patientTabBody');
 const existing=body&&body.querySelector?body.querySelector('#carteraFase1Launch'):null;
 if(typeof patientTab!=='undefined'&&patientTab!=='dispersion'){
  if(existing&&existing.remove)existing.remove();
  return;
 }
 if(!body||!document.createElement)return;
 const p=(db.patients||[]).find(item=>item.id===selectedPatientId);
 if(!p){if(existing&&existing.remove)existing.remove();return;}
 const html=carteraLauncherHtml(p);
 if(existing){existing.outerHTML=html;return;}
 const holder=document.createElement('div');
 holder.innerHTML=html;
 const section=holder.firstElementChild||holder.firstChild;
 if(!section)return;
 if(body.insertBefore)body.insertBefore(section,body.firstChild);
 else if(body.prepend)body.prepend(section);
}
function carteraPaint(){
 const p=carteraSelected();
 const existing=carteraQuery('carteraFase1');
 if(existing&&p){try{existing.outerHTML=carteraPanelHtml(p);}catch(error){}return;}
 try{carteraInjectPanel();}catch(error){}
}
function carteraChoose(action){
 carteraUiState.draft=carteraDraft();
 carteraUiState.action=carteraNormalizeAction(action);
 carteraUiState.modality='';carteraUiState.token='';carteraUiState.preview=null;carteraUiState.previewHtml='';
 carteraPaint();
}
function carteraChooseModality(value){
 carteraUiState.draft=carteraDraft();carteraUiState.modality=value;carteraUiState.token='';carteraUiState.preview=null;carteraUiState.previewHtml='';
 carteraPaint();
}
function carteraMountPortfolio(){
 const p=carteraSelected();if(!p)return false;
 const content=document.getElementById&&document.getElementById('portfolioContent');
 if(!content){
  const portfolio=document.getElementById&&document.getElementById('portfolio');
  if(!portfolio||typeof portfolio.innerHTML!=='string'||portfolio.innerHTML.indexOf('id="carteraFase1Host"')>=0)return !!(portfolio&&portfolio.innerHTML&&portfolio.innerHTML.indexOf('id="carteraFase1Host"')>=0);
  portfolio.innerHTML='<section id="carteraFase1Host" class="patient-section-card cartera-fase1-host">'+carteraPanelHtml(p)+'</section>'+portfolio.innerHTML;
  return true;
 }
 let host=content.querySelector&&content.querySelector('#carteraFase1Host');
 const id=typeof escapeAttr==='function'?escapeAttr(p.id):p.id;
 if(!host&&document.createElement){host=document.createElement('section');host.id='carteraFase1Host';host.className='patient-section-card cartera-fase1-host';if(content.insertBefore)content.insertBefore(host,content.firstChild);else if(content.prepend)content.prepend(host);}
 if(!content.insertBefore&&!content.prepend){content.innerHTML=`<section id="carteraFase1Host" class="patient-section-card cartera-fase1-host"><div class="patient-section-head"><div><h3>Aplicar pago</h3><p>${escapeHtml(p.patient&&p.patient.fullName||p.id)} · ${escapeHtml(dispersionApplicationCode(p))}</p></div><div class="portfolio-actions"><button type="button" class="btn btn-sm btn-primary" onclick="carteraRegisterPayment('${id}')">Registrar pago</button><button type="button" class="btn btn-sm btn-secondary" onclick="carteraCloseHost()">Cerrar</button></div></div>${carteraPanelHtml(p)}</section>`;return true;}
 if(!host)return false;
 host.innerHTML=`<div class="patient-section-head"><div><h3>Aplicar pago</h3><p>${escapeHtml(p.patient&&p.patient.fullName||p.id)} · ${escapeHtml(dispersionApplicationCode(p))}${p.application&&p.application.carteraDemoState?' · '+escapeHtml(p.application.carteraDemoState):''}</p></div><div class="portfolio-actions"><button type="button" class="btn btn-sm btn-primary" onclick="carteraRegisterPayment('${id}')">Registrar pago</button><button type="button" class="btn btn-sm btn-secondary" onclick="carteraCloseHost()">Cerrar</button></div></div><div id="carteraFase1Mount"></div>`;
 const mount=host.querySelector?host.querySelector('#carteraFase1Mount'):null;
 if(mount)mount.innerHTML=carteraPanelHtml(p);
 if(host.scrollIntoView)host.scrollIntoView({block:'nearest'});
 return true;
}
function carteraCanUseModal(){
 const backdrop=document.getElementById&&document.getElementById('modalBackdrop');
 const box=document.getElementById&&document.getElementById('modal');
 return typeof modal==='function'&&!!box&&!!backdrop&&!!(backdrop.classList&&typeof backdrop.classList.contains==='function');
}
// v66.1: sin «Registrar pagos» el botón se muestra deshabilitado con el motivo (la validación de carteraOpenPayment/aplicar sigue igual).
function carteraCanRegisterPayments(){return typeof can!=='function'||!!can('registerPayments');}
function carteraPayButtonHtml(id,cls){
 if(carteraCanRegisterPayments())return `<button type="button" class="${cls}" onclick="carteraOpenPayment('${id}')">Aplicar pago</button>`;
 return `<span class="cartera-pay-locked"><button type="button" class="${cls}" disabled aria-disabled="true" title="Sin permiso para registrar pagos" aria-describedby="carteraPayLock-${id}" data-no-permission="registerPayments">Aplicar pago</button><small class="cartera-perm-note" id="carteraPayLock-${id}">Sin permiso para registrar pagos</small></span>`;
}
function carteraOpenPayment(id,opts){
 opts=opts||{};
 if(typeof requireCapability==='function'&&!requireCapability('registerPayments'))return false;
 const p=(db.patients||[]).find(item=>item&&item.id===id);
 if(!p||(typeof dispersionIsCreditLiquidated==='function'&&dispersionIsCreditLiquidated(p))){if(typeof toast==='function')toast('Este crédito no está habilitado para aplicar un pago.');return false;}
 if(typeof dispersionContractSigned==='function'&&!dispersionContractSigned(p)){if(typeof toast==='function')toast('Este crédito no está habilitado para aplicar un pago.');return false;}
 selectedPatientId=id;
 carteraUiState.action=carteraNormalizeAction(opts.action);
 carteraUiState.rowId=opts.rowId||'';
 carteraUiState.modality=opts.modality||'';
 carteraUiState.token='';carteraUiState.preview=null;carteraUiState.previewHtml='';carteraUiState.draft={};carteraUiState.hostId=id;carteraUiState.comprobante=null;
 if(typeof currentView!=='undefined'&&currentView==='patientProfiles'){carteraUiState.surface='inline';carteraInjectProfile();return true;}
 if(carteraCanUseModal()){
  const name=p.patient&&p.patient.fullName||p.name||'Cliente';
  const code=typeof dispersionApplicationCode==='function'?dispersionApplicationCode(p):p.id;
  modal(`<div class="modal-head"><div><h3>Aplicar pago</h3><p>${escapeHtml(name)} · ${escapeHtml(code)}</p></div><button class="x" type="button" onclick="closeModal()">×</button></div><div class="modal-body" id="carteraPaymentBody">${carteraPanelHtml(p)}</div>`);
  const box=document.getElementById('modal');if(box)box.className='modal cartera-payment-modal';
  carteraUiState.surface='modal';
  return true;
 }
 carteraUiState.surface='inline';
 if(typeof currentView!=='undefined'&&currentView==='patientProfiles'){carteraInjectProfile();return true;}
 if(typeof currentView==='undefined'||currentView==='portfolio')return carteraMountPortfolio();
 patientTab='dispersion';
 if(typeof renderPatientDetail==='function')renderPatientDetail();
 try{carteraInjectPanel();}catch(error){}
 return true;
}
function carteraOpenFromPortfolio(id,action){
 return carteraOpenPayment(id,{action:action||'pago'});
}
function carteraCloseHost(){carteraUiState.hostId='';const host=document.getElementById&&document.getElementById('carteraFase1Host');if(host&&host.remove)host.remove();return true;}
function carteraRegisterPayment(id){return carteraOpenPayment(id,{action:'pago'});}
function carteraProfileCreditHtml(req){
 if(typeof carteraCreditWorkspaceHtml==='function'){try{const workspace=carteraCreditWorkspaceHtml(req);if(workspace)return workspace;}catch(error){}}
 const id=typeof escapeAttr==='function'?escapeAttr(req.id):req.id;
 const app=req.application||{};
 const base=app.interestCalculationBase==='outstanding_balance'?'Saldos insolutos':'Saldos globales';
 const frequency=String(app.paymentFrequency||'').toLowerCase().indexOf('biweek')>=0||String(app.paymentFrequency||'').toLowerCase().indexOf('quinc')>=0?'Quincenal':'Mensual';
 return `<article class="cartera-profile-credit"><div class="cartera-profile-credit-head"><div><h4>${escapeHtml(dispersionApplicationCode(req))}</h4><p>${escapeHtml(app.procedure||'Crédito')} · ${frequency} · ${base}${app.carteraDemoState?' · '+escapeHtml(app.carteraDemoState):''}</p></div><div class="portfolio-actions">${carteraPayButtonHtml(id,'btn btn-sm btn-primary')}</div></div></article>`;
}
function carteraProfileOpsHtml(credits){
 const focus=credits.find(req=>req.id===carteraUiState.hostId)||credits[0];
 if(focus){carteraUiState.hostId=focus.id;selectedPatientId=focus.id;}
 const workspace=typeof carteraCreditWorkspaceHtml==='function';
 const panel=!workspace&&focus&&carteraSelected()?carteraPanelHtml(carteraSelected()):'';
 return `<section id="carteraProfileOps" class="patient-section-card cartera-profile-ops"><h3>Crédito en cartera</h3><p>Pago normal, prepago, extensión y reestructura usan el mismo panel. La tabla, los recibos, la cobranza, los acuerdos y los contactos quedan en este perfil.</p>${credits.map(carteraProfileCreditHtml).join('')}<!--cartera-slot-start--><div id="carteraProfileSlot">${panel}</div><!--cartera-slot-end--></section>`;
}
function carteraUpsertProfile(root,html){
 const existing=root.querySelector&&root.querySelector('#carteraProfileOps');
 if(existing){existing.outerHTML=html;return true;}
 if(typeof root.innerHTML!=='string')return false;
 const startToken='<section id="carteraProfileOps"';
 const endToken='<!--cartera-slot-end--></section>';
 const start=root.innerHTML.indexOf(startToken);
 const end=root.innerHTML.indexOf(endToken);
 if(start>=0&&end>start){root.innerHTML=root.innerHTML.slice(0,start)+html+root.innerHTML.slice(end+endToken.length);return true;}
 const tab=root.querySelector&&root.querySelector('.tab-body');
 if(tab&&tab.insertAdjacentHTML&&!(tab.innerHTML&&String(tab.innerHTML).indexOf('id="carteraProfileOps"')>=0)){tab.insertAdjacentHTML('afterbegin',html);return true;}
 if(root.innerHTML.indexOf('<div class="tab-body">')>=0){root.innerHTML=root.innerHTML.replace('<div class="tab-body">','<div class="tab-body">'+html);return true;}
 return false;
}
function carteraInjectProfile(){
 if(typeof currentView==='undefined'||currentView!=='patientProfiles'||typeof patientProfileMode==='undefined'||patientProfileMode!=='detail')return;
 if(typeof patientProfileTab!=='undefined'&&patientProfileTab!=='perfil'&&patientProfileTab!=='solicitudes')return;
 const root=document.getElementById&&document.getElementById('patientProfiles');if(!root)return;
 const profiles=typeof buildPatientProfiles==='function'?buildPatientProfiles():[];
 const profile=profiles.find(item=>String(item.key)===String(selectedPatientProfileKey));
 const credits=profile&&(profile.requests||[]).filter(req=>req&&typeof portfolioDisbursed==='function'&&portfolioDisbursed(req))||[];
 if(!credits.length){const existing=root.querySelector&&root.querySelector('#carteraProfileOps');if(existing&&existing.remove)existing.remove();return;}
 carteraUpsertProfile(root,carteraProfileOpsHtml(credits));
}
function carteraOpenProfile(id,action,rowId){
 return carteraOpenPayment(id,{action:action||'pago',rowId:rowId||''});
}
function carteraOpenProfileRow(id,rowId){
 return carteraOpenPayment(id,{action:'pago',rowId:rowId||''});
}
function carteraPreviewKey(){return JSON.stringify({action:carteraUiState.action,modality:carteraUiState.modality,rowId:carteraUiState.rowId||'',draft:carteraDraft()});}
function carteraInvalidateRestructurePreview(){
 if(carteraUiState.action!=='reestructura')return;
 carteraUiState.token='';carteraUiState.preview=null;carteraUiState.previewHtml='';
 const cuota=carteraQuery('carteraCuota');if(cuota)cuota.value='';
 const button=carteraQuery('carteraConfirm');if(button)button.disabled=true;
 const slot=carteraQuery('carteraFase1Preview');if(slot)slot.innerHTML='';
}
function carteraRunPreview(){
 const p=carteraSelected();if(!p)return false;
 carteraUiState.draft=carteraDraft();
 const draft=carteraUiState.draft,action=carteraNormalizeAction(carteraUiState.action);
 carteraUiState.action=action;
 let result;
 if(action==='pago')result=carteraPreviewOrdinary(p,{...draft,prepayModality:carteraUiState.modality==='reduce_cuota'?'reduce_cuota':'reduce_plazo'});
 else if(action==='anticipo')result=carteraPreviewAdvance(p,{...draft,preview:true});
 else if(action==='extension')result=carteraPreviewExtension(p,{modality:carteraExtensionUiModality(p),newDueDate:carteraExtensionUiModality(p)==='CORTA'?undefined:draft.newDue||undefined,cuenta:draft.cuenta,preview:true});
 else if(action==='reestructura')result=carteraPreviewRestructure(p,{option:'B',termMonths:draft.term,annualRate:draft.rate,cuota:draft.cuota,preview:true});
 else result=carteraPreviewPrepay(p,{modality:carteraUiState.modality||'reduce_plazo',amount:draft.amount,date:draft.date||dispersionBusinessDateMX(),reference:draft.reference,method:draft.method,cuenta:draft.cuenta,preview:true});
 if(action==='reestructura'){
  const field=carteraQuery('carteraCuota');if(field)field.value='';
  if(result?.ok){
   const plan=carteraBuildAmortization(result.newBalance,result.termMonths,result.annualRate,dispersionTerms(p).paymentFrequency,result.calculationDate,0,result.factor,true);
   if(!plan.ok)result=plan;
   else {result={...result,regularPayment:plan.payment,finalPayment:plan.rows.at(-1).payment};if(field)field.value=fmtMoney(plan.payment);}
  }
 }
 carteraUiState.preview=result;
 carteraUiState.token=result&&result.ok?carteraPreviewKey():'';
 carteraUiState.previewHtml=carteraPreviewText(result,action)+(action!=='pago'&&result?.ok&&result.duplicate?'<p role="alert">'+escapeHtml(carteraDuplicateMessage())+' Puedes continuar si corresponde a otro pago.</p>':'');
 const slot=carteraQuery('carteraFase1Preview');
 if(slot)slot.innerHTML=carteraUiState.previewHtml;
 const button=carteraQuery('carteraConfirm');
 if(button)button.disabled=!carteraUiState.token||(action==='reestructura'&&!staffIsAdmin());
 return !!result&&result.ok!==false;
}
function carteraSelected(){return (db.patients||[]).find(item=>item.id===selectedPatientId)||null;}
function carteraConfirmCurrent(){
 const p=carteraSelected();if(!p)return false;
 const draft=carteraDraft();
 if(carteraUiState.token!==carteraPreviewKey()){toast('La vista previa cambió. Vuelve a calcular antes de confirmar.');return false;}
 if(carteraUiState.action==='reestructura'&&!staffIsAdmin()){toast('La reestructura requiere un administrador.');return false;}
 const duplicate=carteraUiState.action!=='reestructura'&&carteraFindDuplicate(p,Number(carteraUiState.preview?.amount??carteraUiState.preview?.total)||0,draft.cuenta||'',carteraUiState.action==='extension'?dispersionBusinessDateMX():draft.date||dispersionBusinessDateMX());
 // v64: con excedente, la confirmación repite el reparto (pago normal + prepago a capital) antes de registrar.
 const split=carteraUiState.action==='pago'?carteraUiState.preview?.split:null;
 const splitText=split?carteraSplitText(split)+' ':'';
 if(typeof confirm==='function'&&!confirm((duplicate?carteraDuplicateMessage()+' ':'')+splitText+'¿Confirmas esta operación de cartera?'))return false;
 let result;
 if(carteraUiState.action==='pago')result=carteraApplyOrdinary(p,{...draft,prepayModality:carteraUiState.modality==='reduce_cuota'?'reduce_cuota':'reduce_plazo',confirmDuplicate:true});
 else if(carteraUiState.action==='anticipo')result=carteraApplyAdvance(p,{...draft,reference:draft.reference||('ANTICIPO-'+Date.now()),method:draft.method||'SPEI',confirmDuplicate:true});
 else if(carteraUiState.action==='extension')result=carteraApplyExtension(p,{modality:carteraExtensionUiModality(p),newDueDate:carteraExtensionUiModality(p)==='CORTA'?undefined:draft.newDue||undefined,reference:draft.reference||'EXT-PREVENTIVA',method:'SPEI',cuenta:draft.cuenta,confirmDuplicate:true});
 else if(carteraUiState.action==='reestructura')result=carteraApplyRestructure(p,{option:'B',termMonths:draft.term,annualRate:draft.rate,cuota:draft.cuota,reference:draft.reference||'REESTRUCTURA'});
 else result=carteraApplyPrepay(p,{modality:carteraUiState.modality||'reduce_plazo',amount:draft.amount,date:draft.date||dispersionBusinessDateMX(),reference:draft.reference||('PREPAGO-'+Date.now()),method:draft.method||'SPEI',cuenta:draft.cuenta,confirmDuplicate:true});
 if(!result||result.ok===false){toast(result&&result.error||'No se aplicó la operación.');return false;}
 carteraUiState.token='';carteraUiState.preview=result;carteraUiState.previewHtml='<p>Operación registrada en este navegador.</p>';
 toast('Operación de cartera registrada en este navegador.');
 const savedAction=carteraUiState.action;
 if(typeof carteraPresentReceipt==='function'){try{carteraPresentReceipt(p,result,savedAction);}catch(error){}}
 if(typeof currentView!=='undefined'&&currentView==='portfolio'&&typeof renderPortfolio==='function')renderPortfolio();
 else if(typeof currentView!=='undefined'&&currentView==='patientProfiles'&&typeof renderPatientProfiles==='function')renderPatientProfiles();
 else if(typeof renderPatientDetail==='function')renderPatientDetail();
 return true;
}
function carteraInjectCss(){
 if(!document.getElementById||document.getElementById('carteraFase1Css')||!document.createElement)return;
 const style=document.createElement('style');style.id='carteraFase1Css';
 style.textContent=`.cartera-fase1,.cartera-receipt{margin:0 0 16px;padding:16px;border:1px solid rgba(7,20,47,.08);border-radius:16px;background:#fff;color:#07142F;font-family:Inter,sans-serif}.cartera-fase1 h4,.cartera-fase1-host h3,.cartera-profile-ops h3,.cartera-receipt h4{font-family:"Plus Jakarta Sans",Inter,sans-serif;margin:0 0 12px;color:#07142F}.cartera-choices{display:grid;gap:8px;margin:0 0 12px;align-items:stretch}.cartera-choices-ops{grid-template-columns:repeat(5,minmax(0,1fr))}.cartera-choices-sub{grid-template-columns:repeat(3,minmax(0,1fr))}.cartera-choice{appearance:none;width:100%;min-height:48px;text-align:left;border:1px solid rgba(7,20,47,.16);background:#fff;color:#07142F;border-radius:12px;padding:12px 14px;font-family:"Plus Jakarta Sans",Inter,sans-serif;font-weight:600;cursor:pointer}.cartera-choice[aria-pressed="true"]{border-color:#20C7D4;box-shadow:inset 0 0 0 1px #20C7D4;background:#f3fcfd}.cartera-form,.cartera-receipt-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start}.cartera-fase1 pre,pre.cartera-fase1{white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%}.cartera-receipt-grid>div{min-width:0;overflow-wrap:anywhere}.cartera-form-stack{grid-template-columns:1fr}.cartera-form .field,.modal-body>.field{display:flex;flex-direction:column;gap:6px;margin:0;min-width:0}.cartera-form .field input,.cartera-form .field select,.cartera-form .field textarea,.modal-body>.field input,.modal-body>.field select,.modal-body>.field textarea{box-sizing:border-box;width:100%;max-width:100%;min-width:0;min-height:48px}.modal.cartera-agreement-modal{width:min(720px,calc(100vw - 32px));max-height:calc(100vh - 32px);display:flex;flex-direction:column}.modal.cartera-agreement-modal .modal-body{overflow:auto}.cartera-actions,.cartera-fase1-host .portfolio-actions,.cartera-profile-credit .portfolio-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.cartera-preview{margin-top:12px;color:#07142F}.cartera-fase1-host{margin:0 0 16px}.cartera-profile-credit{display:block;margin:0 0 12px;padding:16px;border:1px solid rgba(7,20,47,.08);border-radius:16px;background:#fff}.cartera-profile-credit.is-active{box-shadow:inset 0 0 0 1px #20C7D4}.cartera-profile-credit-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;align-items:flex-start}.cartera-profile-credit h4{margin:0;font-family:"Plus Jakarta Sans",Inter,sans-serif;color:#07142F}.cartera-profile-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:12px 0}.cartera-profile-meta span{display:block;color:#64748B;font-size:13px}.cartera-profile-meta strong{color:#07142F;font-family:"Plus Jakarta Sans",Inter,sans-serif}.cartera-profile-block{margin-top:16px}.cartera-profile-block h4{margin:0 0 8px}.cartera-profile-list{margin:0;padding:0;list-style:none}.cartera-profile-list li{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid rgba(7,20,47,.08)}.cartera-amortization-wrap{overflow:auto}.cartera-amortization-wrap tr.is-selected td{background:#f3fcfd}.cartera-contact-block{display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin-top:8px;min-width:0}.cartera-contact{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-width:0;max-width:100%;color:#07142F;font-family:Inter,sans-serif;font-size:13px;line-height:1.3}.cartera-contact-label{color:#64748B;font-size:12px}.cartera-contact-value{font-variant-numeric:tabular-nums}.cartera-contact-actions{display:inline-flex;align-items:center;gap:4px}.cartera-contact-link{color:#07142F;font-weight:600;text-decoration:none;border-bottom:1px solid #20C7D4}.cartera-contact-link:hover{color:#0E7490}.cartera-contact-mail{font-weight:500;overflow-wrap:anywhere}.cartera-contact-icon{appearance:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:1px solid rgba(7,20,47,.16);border-radius:8px;background:#fff;color:#07142F;cursor:pointer;text-decoration:none;line-height:0}.cartera-contact-icon:hover{border-color:#20C7D4;color:#0E7490;background:#f3fcfd}.cartera-contact-empty{color:#64748B}.portfolio-table .cartera-contact-block{margin-top:6px}.cartera-profile-meta .cartera-contact{margin-top:4px}.cartera-receipt-table{width:100%;border-collapse:collapse}.cartera-receipt-table th,.cartera-receipt-table td{padding:8px 0;border-bottom:1px solid rgba(7,20,47,.08);text-align:left}.cartera-receipt-table td:last-child,.cartera-receipt-table th:last-child{text-align:right}.cartera-aging-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0}.cartera-aging-grid div{padding:12px;border:1px solid rgba(7,20,47,.08);border-radius:12px;background:#fff}.cartera-aging-grid dt{color:#64748B;font-size:13px}.cartera-aging-grid dd{margin:4px 0 0;font-family:"Plus Jakarta Sans",Inter,sans-serif;font-weight:700;color:#07142F}.cartera-mail-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;align-items:flex-start;margin:0 0 12px}.cartera-mail-head h3,.cartera-mail-head h4,.cartera-mail-head p{margin:0}.cartera-mail-head p{margin-top:6px;color:#64748B}.cartera-mail-grid,.cartera-mail-switches{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:stretch}.cartera-mail-switches{grid-template-columns:repeat(2,minmax(0,1fr));margin:0 0 12px}.cartera-mail-grid>section{min-width:0;padding:12px;border:1px solid rgba(7,20,47,.08);border-radius:12px;background:#fff}.cartera-mail-grid h4{margin:0 0 8px;font-family:"Plus Jakarta Sans",Inter,sans-serif;color:#07142F}.cartera-mail-grid ul{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:8px}.cartera-mail-grid li{display:grid;gap:4px;padding-top:8px;border-top:1px solid rgba(7,20,47,.08);min-width:0}.cartera-mail-grid li span,.cartera-form .field.is-wide{grid-column:1/-1}.cartera-mail-summary .cartera-actions{margin-top:0}@media(max-width:800px){.cartera-choices-ops,.cartera-choices-sub,.cartera-form,.cartera-receipt-grid,.cartera-aging-grid,.cartera-profile-meta,.cartera-mail-grid,.cartera-mail-switches{grid-template-columns:1fr}}`;
 (document.head||document.body).appendChild(style);
}
if(typeof portfolioActionCell==='function'){
 const carteraOriginalPortfolioActionCell=portfolioActionCell;
 portfolioActionCell=function(c,rowId){
  const base=carteraOriginalPortfolioActionCell(c,rowId);
  return String(base).split('Registrar pago').join('Aplicar pago');
 };
}
if(typeof renderPatientDetail==='function'){
 const carteraOriginalRenderPatientDetail=renderPatientDetail;
 renderPatientDetail=function(){
  const result=carteraOriginalRenderPatientDetail.apply(this,arguments);
  try{carteraInjectPanel();carteraHideLegacyPayment();}catch(error){}
  return result;
 };
}
function carteraHideLegacyPayment(){
 if(!document.querySelectorAll)return;
 document.querySelectorAll('.payment-apply-card').forEach(node=>{if(node)node.hidden=true;});
}
if(typeof portfolioOpenPayment==='function'){
 const carteraOriginalOpenPayment=portfolioOpenPayment;
 portfolioOpenPayment=function(id,rowId){return carteraOpenPayment(id,{action:'pago',rowId:rowId||''});};
 portfolioOpenPayment.carteraOriginal=carteraOriginalOpenPayment;
}
if(typeof dispersionOpenManagePaymentModal==='function'){
 dispersionOpenManagePaymentModal=function(rowId){
  const p=typeof contractSelectedPatient==='function'?contractSelectedPatient():carteraSelected();
  if(!p)return false;
  return carteraOpenPayment(p.id,{action:'pago',rowId:rowId||''});
 };
}
if(typeof setPatientDetailTab==='function'){
 const carteraOriginalSetPatientDetailTab=setPatientDetailTab;
 setPatientDetailTab=function(tab){
  const result=carteraOriginalSetPatientDetailTab.apply(this,arguments);
  try{carteraInjectPanel();carteraHideLegacyPayment();}catch(error){}
  return result;
 };
}
if(typeof renderPatientProfileDetail==='function'){
 const carteraOriginalRenderPatientProfileDetail=renderPatientProfileDetail;
 renderPatientProfileDetail=function(){
  const result=carteraOriginalRenderPatientProfileDetail.apply(this,arguments);
  try{carteraInjectProfile();}catch(error){}
  return result;
 };
}
// v70 · D-19: «Otros documentos» se ve deshabilitado, con su motivo, si la sesión no puede agregar documentos.
// El formulario original vive en el script en línea (fijado por hash); aquí solo se sustituye su render.
if(typeof renderOtherDocumentUploader==='function'&&!renderOtherDocumentUploader.carteraLocked){
 const carteraOriginalOtherDocumentUploader=renderOtherDocumentUploader;
 renderOtherDocumentUploader=function(patientId){
  if(typeof can!=='function'||(can('patientActions')&&can('docs')))return carteraOriginalOtherDocumentUploader.apply(this,arguments);
  return `<div class="document-upload-card clean-uploader is-locked" data-no-permission="docs">
    <div class="document-upload-grid clean-uploader-grid">
      <div class="field document-upload-name"><label for="otherDocName">Nombre del documento</label><input id="otherDocName" placeholder="Ej. Carta aclaratoria, comprobante adicional" disabled aria-disabled="true"></div>
      <div class="field document-upload-files"><label>Adjuntos</label><div class="document-file-picker"><button type="button" class="btn btn-primary" disabled aria-disabled="true">Seleccionar archivo</button><span id="otherDocFileLabel">Sin archivos seleccionados</span></div></div>
      <button type="button" class="btn btn-primary document-add-btn" disabled aria-disabled="true" title="Sin permiso para agregar documentos">Agregar documento</button>
    </div>
    <div class="document-upload-help cartera-perm-note">Sin permiso para agregar documentos. Tu perfil solo puede consultar el expediente.</div>
  </div>`;
 };
 renderOtherDocumentUploader.carteraLocked=true;
}
function carteraDemoSettleRow(row){
 dispersionConceptDefs().forEach(def=>{row[def.paid]=roundToCents(dispersionNumber(row[def.total],0));row[def.pending]=0;});
 row.paidAmount=roundToCents(dispersionConceptDefs().reduce((sum,def)=>sum+dispersionNumber(row[def.paid],0),0));
 row.pendingAmount=0;row.status='Pagado';row.dpd=0;
}
function carteraDemoRecognizeMora(row){
 row.moratory=roundToCents(Math.max(dispersionNumber(row.capital,0),0)*0.03);
 row.moratoryIva=roundToCents(row.moratory*0.16);
 dispersionHydrateConcepts(row,{});
 row.status='Vencido';
 row.dpd=dispersionDaysPastDue(row.currentDueDate||row.dueDate);
}
function carteraBuildDemoCredit(spec){
 const todayMx=dispersionBusinessDateMX();
 const dispersion=dispersionAddDaysToDateString(todayMx,spec.offset);
 const frequency=spec.frequency==='biweekly'?'biweekly':'monthly';
 const amount=spec.amount;
 const p={id:spec.id,applicationDate:dispersion,documents:[],references:[],payments:[],notes:[],timeline:[{action:'Crédito dispersado',at:dispersion+'T12:00:00.000Z',comment:'Demo de cartera agregada sin modificar expedientes existentes.'}],patient:{patientId:'PAC-'+spec.id,fullName:spec.name,email:spec.email,phone:spec.phone,curp:spec.curp,rfc:spec.rfc,address:'Av. Demo 100, CDMX',housingStatus:'Propia',incomeMonthly:80000,incomeType:'Nómina'},application:{applicationId:spec.id,applicationStatus:'contrato_firmado',stage:'Contrato firmado',procedure:spec.procedure,doctorName:spec.doctor,requestedAmount:amount,procedureAmount:amount,patientProcedureAmount:amount,procedureCost:amount,providerBaseAmount:amount,openingFeeRate:0.05,openingFeeMode:'upfront',interestCalculationBase:spec.base,ordinaryAnnualRate:0.36,annualInterestRate:36,termMonths:8,paymentFrequency:frequency,paymentDayOption:frequency==='biweekly'?'15_last_day':'15',paymentDays:frequency==='biweekly'?[15,'last_day']:[15],preferredPaymentDay:15,initialPaymentsRequired:0,initialPaymentRequired:false,carteraDemoState:spec.state,providerDispersions:[{id:'prov-1',provider:spec.doctor,concept:spec.procedure,amount:amount,status:'Lista para liberar'}]},offer:{status:'borrador',procedureName:spec.procedure,providerName:spec.doctor}};
 applyFinancialBreakdownToPatient(p);
 p.application.contractSigned=true;p.application.contractReady=true;p.application.signatureStatus='signed';p.application.signedAt=dispersion+'T12:00:00.000Z';p.application.contractSignedAt=dispersion+'T12:00:00.000Z';p.application.offerAccepted=true;p.application.offerReady=true;p.application.dispersionDate=dispersion;p.application.disbursedAt=dispersion;p.application.amortizationStatus='active';
 p.offer.status='aceptada';
 p.contract={signedAt:dispersion+'T12:00:00.000Z',signatureStatus:'signed'};
 p.application.providerDispersions[0].status='Dispersada';p.application.providerDispersions[0].dispersionDate=dispersion;
 applyFinancialBreakdownToPatient(p);
 const rows=dispersionBuildSchedule(p);
 let settled=0;
 rows.forEach(row=>{
  const due=String(row.currentDueDate||row.dueDate||'');
  if(!(due&&due<todayMx))return;
  if(spec.payPast){const before=roundToCents(dispersionNumber(row.pendingAmount,0));carteraDemoSettleRow(row);settled=roundToCents(settled+(before||row.paidAmount));}
  else if(spec.mora)carteraDemoRecognizeMora(row);
 });
 if(spec.payPast&&settled>0)p.payments.push({receiptId:'CARTERA-SEED-'+spec.id,date:todayMx,amount:settled,amountReceived:settled,totalApplied:settled,unappliedAmount:0,paymentType:'ordinary',method:'SPEI',reference:'DEMO-'+spec.id,actor:'demo.cartera@pulzzo.mx',carteraFase1:true,createdAt:todayMx+'T12:00:00.000Z'});
 p.paymentSchedule=rows;
 return p;
}
function carteraSeedDisbursedDemos(){
 if(typeof db==='undefined'||!Array.isArray(db.patients)||typeof dispersionBuildSchedule!=='function'||typeof applyFinancialBreakdownToPatient!=='function')return [];
 const specs=[
  {id:'APP-CARTERA-1001',name:'Elena Vargas Solís',state:'Al corriente · global · mensual',base:'global',frequency:'monthly',offset:-150,payPast:true,amount:84000,procedure:'Rinoplastia',doctor:'Dra. Laura Méndez',phone:'55 4100 1001',curp:'VASL900101MDFRLN01',rfc:'VASL900101AB1',email:'elena.vargas.demo@pulzzo.mx'},
  {id:'APP-CARTERA-1002',name:'Hugo Ramírez Beltrán',state:'Con atraso · global · mensual',base:'global',frequency:'monthly',offset:-150,payPast:false,mora:true,amount:96000,procedure:'Blefaroplastia',doctor:'Dr. Roberto Salinas',phone:'55 4100 1002',curp:'RABH880202HDFMLG02',rfc:'RABH880202CD3',email:'hugo.ramirez.demo@pulzzo.mx'},
  {id:'APP-CARTERA-1003',name:'Patricia Núñez Ceballos',state:'Próximo a vencer · global · quincenal',base:'global',frequency:'biweekly',offset:-5,payPast:false,amount:72000,procedure:'Lipoescultura',doctor:'Dra. Laura Méndez',phone:'55 4100 1003',curp:'NUCP920303MDFXBR03',rfc:'NUCP920303EF4',email:'patricia.nunez.demo@pulzzo.mx'},
  {id:'APP-CARTERA-1004',name:'Sofía Calderón Ibarra',state:'Al corriente · insoluto · mensual',base:'outstanding_balance',frequency:'monthly',offset:-120,payPast:true,amount:110000,procedure:'Abdominoplastia',doctor:'Dr. Mateo Ríos Demo',phone:'55 4100 1004',curp:'CAIS850404MDFBLF04',rfc:'CAIS850404GH5',email:'sofia.calderon.demo@pulzzo.mx'},
  {id:'APP-CARTERA-1005',name:'Diego Fuentes Alemán',state:'Próximo a vencer · insoluto · quincenal',base:'outstanding_balance',frequency:'biweekly',offset:-5,payPast:false,amount:64000,procedure:'Rinoplastia',doctor:'Dra. Laura Méndez',phone:'55 4100 1005',curp:'FUAD910505HDFMLG05',rfc:'FUAD910505IJ6',email:'diego.fuentes.demo@pulzzo.mx'}
 ];
 const present=new Set((db.patients||[]).map(item=>item&&item.id));
 const added=[];
 specs.forEach(spec=>{
  if(present.has(spec.id))return;
  try{const credit=carteraBuildDemoCredit(spec);db.patients.push(credit);present.add(spec.id);added.push(spec.id);}catch(error){}
 });
 if(added.length){try{carteraResave();}catch(error){}}
 return added;
}
function carteraSeedApprovedAwaitingAcceptance(){
 const id='APP-PUL-DEMO-APROBADO';
 if(!Array.isArray(db?.patients)||db.patients.some(p=>p.id===id))return false;
 const date=dispersionBusinessDateMX();
 db.patients.push({id,applicationDate:date,patient:{fullName:'Paciente Aprobado Demo',email:'aprobado@example.test',phone:'5500000099'},application:{applicationId:id,applicationStatus:'oferta_enviada',stage:'Oferta enviada',requestedAmount:25000,approvedAmount:25000,offerReady:true,offerAccepted:false,offerRejected:false,contractReady:false,contractSigned:false,procedure:'Procedimiento ficticio',demoApprovedAwaitingAcceptance:true},offer:{status:'enviada',sent:true,accepted:false,approvedAmount:25000},documents:[],references:[],payments:[],notes:[],timeline:[{at:date+'T12:00:00Z',action:'Ejemplo ficticio aprobado pendiente de aceptación',comment:'Sin firma, desembolso ni pago; no modifica otros créditos.'}]});
 carteraResave();return true;
}
try{carteraInjectCss();}catch(error){}
try{carteraSeedDisbursedDemos();carteraSeedApprovedAwaitingAcceptance();}catch(error){}
Object.assign(globalThis,{carteraParseAmountInput,carteraFormatAmountInput,carteraFormatAmountField,carteraExtensionCharges,carteraExtensionChargeRowsHtml,carteraExtensionMovementHtml});
Object.assign(globalThis,{carteraSplitText,carteraSplitEffectText,carteraScheduleSnapshot,carteraPrepayModalityLabel});
Object.assign(globalThis,{carteraPlazoExtendido,carteraLastCuotaPreviewHtml,carteraPreviewText});
Object.assign(globalThis,{carteraExtensionLastCuotaInfo,carteraPanelHtml});
Object.assign(globalThis,{carteraExtensionUiModality,carteraLastExtensionWasCorta});
Object.assign(globalThis,{carteraCanRegisterPayments,carteraPayButtonHtml});
// v65: la cuota cuyo capital pasó a la cuota nueva queda 'Extendida' (cerrada, sin saldo) y nunca 'Pagado'.
if(typeof dispersionIsClosedPaymentStatus==='function'&&!dispersionIsClosedPaymentStatus.carteraV65){const base=dispersionIsClosedPaymentStatus;dispersionIsClosedPaymentStatus=function(status){return String(status||'')==='Extendida'||base.apply(this,arguments);};dispersionIsClosedPaymentStatus.carteraV65=true;}
if(typeof dispersionExtensionIsClosedRow==='function'&&!dispersionExtensionIsClosedRow.carteraV65){const base=dispersionExtensionIsClosedRow;dispersionExtensionIsClosedRow=function(row){return String(row&&row.status||'')==='Extendida'||base.apply(this,arguments);};dispersionExtensionIsClosedRow.carteraV65=true;}
Object.assign(globalThis,{carteraResave,carteraInvalidateRestructurePreview,carteraAllocateOldestFirst,carteraFindDuplicate,carteraCapitalPending,carteraOpenRows,carteraPreviewExtension,carteraApplyExtension,carteraPreviewPrepay,carteraApplyPrepay,carteraPreviewRestructure,carteraApplyRestructure,carteraPreviewOrdinary,carteraApplyOrdinary,carteraPanelHtml,carteraChoose,carteraChooseModality,carteraOpenFromPortfolio,carteraOpenProfile,carteraOpenProfileRow,carteraOpenPayment,carteraCanUseModal,carteraRegisterPayment,carteraCloseHost,carteraSeedDisbursedDemos,carteraSeedApprovedAwaitingAcceptance,carteraRunPreview,carteraConfirmCurrent,carteraBuildDemoCredit,carteraPreviewAdvance,carteraApplyAdvance,carteraAdvanceTarget,carteraCanSettle,carteraSettlementAllowedDate,carteraSettlementLockedText,carteraRules,carteraIvaInterestFactor,carteraIvaMoratoryFactor,carteraIvaCommissionFactor,carteraExtensionCount,carteraDmy});

function v1Session(){
 if(typeof session!=='undefined'&&session)return session;
 if(typeof staffCurrentSession==='function')return staffCurrentSession();
 return null;
}
if(typeof dispersionAuthorizeExtension==='function'&&!globalThis.__pulzzoV1Extension){
 const v1OriginalExtension=dispersionAuthorizeExtension;
 dispersionAuthorizeExtension=function(rowId,days,reason){
  const field=document.getElementById&&document.getElementById('extensionNote');
  const decision=globalThis.PulzzoV1&&PulzzoV1.extensionMotivo?PulzzoV1.extensionMotivo(reason,field&&field.value):{ok:String(reason==null?(field&&field.value||''):reason).trim().length>0,motivo:String(reason==null?(field&&field.value||''):reason).trim()};
  if(!decision.ok){if(typeof toast==='function')toast('El motivo de la prórroga es obligatorio.');return false;}
  return v1OriginalExtension(rowId,days,decision.motivo);
 };
 globalThis.__pulzzoV1Extension=true;
}
if(typeof sendOffer==='function'&&!globalThis.__pulzzoV1SendOffer){
 const v1OriginalSendOffer=sendOffer;
 sendOffer=function(id){
  try{
   const current=v1Session();
   if(globalThis.PulzzoV1&&PulzzoV1.offerCapDecision&&globalThis.PulzzoStaffAccess&&current){
    const p=(db.patients||[]).find(item=>item&&item.id===id);
    const amount=p&&((p.offer&&p.offer.approvedAmount)||(p.application&&(p.application.approvedAmount||p.application.requestedAmount)));
    const decision=PulzzoV1.offerCapDecision(current,amount,PulzzoStaffAccess.checkAmountApproval.bind(PulzzoStaffAccess));
    if(decision&&decision.allowed===false){if(typeof toast==='function')toast(decision.reason||'El monto supera el tope de tu nivel. Escala a un administrador.');return false;}
   }
  }catch(ignore){}
  return v1OriginalSendOffer(id);
 };
 globalThis.__pulzzoV1SendOffer=true;
}
if(typeof renderDispersionTab==='function'&&!globalThis.__pulzzoV1Phases){
 const v1OriginalDispersion=renderDispersionTab;
 renderDispersionTab=function(p){
  let html=v1OriginalDispersion(p);
  try{
   if(globalThis.PulzzoV1&&typeof PulzzoV1.phasePanelHtml==='function'){
    const panel=PulzzoV1.phasePanelHtml(p);
    const marker='<section class="dispersion-block provider-dispersion-block">';
    if(panel&&html.indexOf(marker)!==-1&&html.indexOf('v1-phases')===-1)html=html.replace(marker,panel+marker);
   }
  }catch(ignore){}
  return html;
 };
 globalThis.__pulzzoV1Phases=true;
}
if(typeof providerTabContent==='function'&&!globalThis.__pulzzoV1ProviderLink){
 const v1OriginalProviderTab=providerTabContent;
 providerTabContent=function(p,linked){
  let html=v1OriginalProviderTab(p,linked);
  try{
   const tab=typeof providerTab==='string'?providerTab:(/Nombre visible/.test(html)&&/Tipo cuenta/.test(html)?'resumen':'');
   if(tab==='resumen'&&globalThis.PulzzoV1&&p&&html.indexOf('data-v1-referral')===-1){
    const doctor={id:p.id,name:((p.profile&&p.profile.prefix)?p.profile.prefix+' ':'')+(p.profile&&p.profile.name||''),kamId:p.assignedKam||p.kamId||null};
    const row=PulzzoV1.ensureDoctorReferral(typeof localStorage!=='undefined'?localStorage:null,doctor);
    if(row){
     const svg=PulzzoV1.qrSvg(row.url)||'';
     html+='<section class="v1-referral" data-v1-referral="1"><h3>Enlace de referido</h3><p class="v1-note">Demostración en este navegador. Quien se registre con este enlace queda ligado a este doctor.</p><p><a href="'+PulzzoV1.esc(row.path)+'">'+PulzzoV1.esc(row.url)+'</a></p>'+(svg?'<div class="v1-qr">'+svg+'</div><button type="button" class="btn btn-secondary btn-sm" onclick="PulzzoV1.downloadDoctorQr(\''+PulzzoV1.esc(row.token)+'\')">Descargar QR</button>':'<p>Copia el enlace. El QR demo no cubre esta longitud.</p>')+'</section>';
    }
   }
  }catch(ignore){}
  return html;
 };
 globalThis.__pulzzoV1ProviderLink=true;
}
if(typeof renderNav==='function'&&!globalThis.__pulzzoV1Nav){
 const v1OriginalNav=renderNav;
 renderNav=function(){
  v1OriginalNav();
  try{
   const nav=document.getElementById&&document.getElementById('nav');
   if(!nav||!nav.appendChild||nav.querySelector&&nav.querySelector('[data-v1-alerts]'))return;
   const count=globalThis.PulzzoV1&&PulzzoV1.alertCount?PulzzoV1.alertCount(typeof localStorage!=='undefined'?localStorage:null,v1Session()):0;
   const button=document.createElement('button');
   button.type='button';button.className='nav-alert';button.textContent='Avisos '+count;
   if(button.dataset)button.dataset.v1Alerts='1';else button.setAttribute&&button.setAttribute('data-v1-alerts','1');
   if(button.addEventListener)button.addEventListener('click',function(event){if(event&&event.stopPropagation)event.stopPropagation();if(typeof toast==='function')toast('Avisos demo: '+count+'. Abre el CRM para el detalle. No se envió ningún mensaje.');});
   nav.appendChild(button);
  }catch(ignore){}
 };
 globalThis.__pulzzoV1Nav=true;
}
if(typeof renderPatientDetail==='function'&&!globalThis.__pulzzoV1Badge){
 const v1OriginalPatientDetail=renderPatientDetail;
 renderPatientDetail=function(){
  const result=v1OriginalPatientDetail.apply(this,arguments);
  try{
   if(globalThis.PulzzoV1&&PulzzoV1.paintPunctualBadge){
    const patient=(typeof db!=='undefined'&&db.patients||[]).find(item=>item&&item.id===(typeof selectedPatientId!=='undefined'?selectedPatientId:''));
    PulzzoV1.paintPunctualBadge(patient);
   }
  }catch(ignore){}
  return result;
 };
 globalThis.__pulzzoV1Badge=true;
}
if(typeof renderOfferTab==='function'&&!globalThis.__pulzzoV1OfferRate){
 const v1OriginalOfferTab=renderOfferTab;
 renderOfferTab=function(p){
  let html=v1OriginalOfferTab(p);
  try{
   if(globalThis.PulzzoV1&&PulzzoV1.LEGAL_NOTE&&p&&p.offer&&html.indexOf(PulzzoV1.LEGAL_NOTE)===-1)html+='<p class="v1-note">'+PulzzoV1.esc(PulzzoV1.LEGAL_NOTE)+'</p>';
   if(globalThis.PulzzoV1&&typeof PulzzoV1.suggestedOfferRate==='function'){
    const rate=PulzzoV1.suggestedOfferRate(p);
    if(typeof rate==='number'&&Number.isFinite(rate)){
     const shown=String(Math.round(rate*100)/100);
     html=html.replace(/(id="offerAnnualInterestRate"[^>]*value=")[^"]*(")/,'$1'+shown+'$2');
     html=html.replace('id="offerAnnualInterestRate"','id="offerAnnualInterestRate" data-v1-preferential="1"');
     if(html.indexOf(PulzzoV1.NOTICE)===-1)html=html.replace('id="offerAnnualInterestRate" data-v1-preferential="1"','id="offerAnnualInterestRate" data-v1-preferential="1"');
     html=html.replace(/(<input id="offerAnnualInterestRate"[^>]*>)/,'$1<p class="offer-help-text">Demo · '+PulzzoV1.esc(PulzzoV1.NOTICE)+'</p>');
    }
   }
  }catch(ignore){}
  return html;
 };
 globalThis.__pulzzoV1OfferRate=true;
}
}
