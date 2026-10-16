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
 if(!Number.isFinite(Number(amount))||Number(amount)<=0||Math.abs(Number(amount)-roundToCents(amount))>0.0000001||!/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))||dispersionDateOnly(date)!==date||!String(reference||'').trim()||!String(method||'').trim()){notify('Captura monto recibido con máximo dos decimales, fecha válida, método y referencia real del pago.');return null;}
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
  const factor=carteraIvaFactor(carteraRules(p,when));
  if(Math.abs(factor-.16)<1e-9)return;
  row.interestIva=roundToCents(dispersionNumber(row.interest,0)*factor);
  row.moratoryIva=roundToCents(dispersionNumber(row.moratory,0)*factor);
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
 return rows.map(row=>({...row}));
}
function carteraExtensionCount(p){return Array.isArray(p&&p.application&&p.application.preventiveExtensions)?p.application.preventiveExtensions.length:0;}
function carteraQuoteExtension(p,input={}){
 const rules=carteraRules(p),rows=carteraScheduleRows(p),todayMx=dispersionBusinessDateMX();
 const max=Number.isInteger(rules.preventiveExtensionMax)?rules.preventiveExtensionMax:3;
 if(dispersionIsCreditLiquidated(p))return {ok:false,error:'Este crédito ya está liquidado.'};
 if(carteraHasMora(rows))return {ok:false,error:'La extensión preventiva solo está disponible si el crédito no tiene mora.'};
 if(carteraExtensionCount(p)>=max)return {ok:false,error:'Este crédito ya tiene el máximo de extensiones ('+max+'). La siguiente operación debe ser una reestructura.'};
 const candidates=carteraOpenRows(rows).filter(row=>carteraDue(row)>todayMx).sort((a,b)=>carteraDue(a).localeCompare(carteraDue(b)));
 const row=input.rowId?rows.find(item=>item.id===input.rowId):candidates[0];
 if(!row)return {ok:false,error:'No hay una cuota vigente para extender.'};
 const originalDue=carteraDue(row);
 if(!(originalDue>todayMx))return {ok:false,error:'La extensión debe pedirse antes del vencimiento de la cuota.'};
 const later=carteraOpenRows(rows).filter(item=>item.id!==row.id&&carteraDue(item)>originalDue).sort((a,b)=>carteraDue(a).localeCompare(carteraDue(b)))[0];
 const terms=dispersionTerms(p);
 const nextDue=later?carteraDue(later):(typeof dispersionNextPeriodDateFrom==='function'?dispersionNextPeriodDateFrom(originalDue,terms):'');
 const maxDue=nextDue?dispersionAddDaysToDateString(nextDue,-1):'';
 if(!maxDue||maxDue<=originalDue)return {ok:false,error:'No hay un día hábil entre esta cuota y la siguiente.'};
 const requested=String(input.newDueDate||maxDue);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(requested)||requested<=originalDue||requested>maxDue)return {ok:false,error:'La nueva fecha debe ser posterior a la cuota y como máximo un día antes de la siguiente.'};
 const modality=['COLA_FINAL','PRORRATEADO'].includes(input.modality)?input.modality:(rules.preventiveExtensionModality==='PRORRATEADO'?'PRORRATEADO':'COLA_FINAL');
 const outstanding=roundToCents(carteraOpenRows(rows).reduce((sum,item)=>sum+carteraCapitalPending(item),0));
 const cuota=roundToCents(dispersionNumber(row.payment,dispersionNumber(row.capital,0)+dispersionNumber(row.interest,0)+dispersionNumber(row.interestIva,0)));
 const insoluto=terms.interestCalculationBase==='outstanding_balance';
 const feeRate=insoluto?Number(rules.preventiveFeeInsolutoRate)||0:Number(rules.preventiveFeeGlobalRate)||0;
 const fee=roundToCents((insoluto?outstanding:cuota)*feeRate);
 const factor=carteraIvaFactor(rules);
 const feeVat=roundToCents(fee*factor);
 const interestPending=roundToCents(carteraPending(row,'interest','interestPaid','interestPending'));
 const ivaPending=roundToCents(carteraPending(row,'interestIva','ivaInteresPaid','ivaInteresPending'));
 const extraDays=Math.max(0,Math.round((Date.parse(requested+'T12:00:00Z')-Date.parse(originalDue+'T12:00:00Z'))/86400000));
 const annual=Number(terms.ordinaryAnnualRate)||0;
 const extraInterest=roundToCents(outstanding*annual/360*extraDays);
 const extraIva=roundToCents(extraInterest*factor);
 const interestPaid=roundToCents(interestPending+extraInterest);
 const interestIvaPaid=roundToCents(ivaPending+extraIva);
 const capitalDeferred=roundToCents(carteraCapitalPending(row));
 const total=roundToCents(interestPaid+interestIvaPaid+fee+feeVat);
 const audit={count:carteraExtensionCount(p)+1,modality,originalDue,extendedDue:requested,fee,feeVat,interestPaid,interestIvaPaid,extraInterest,extraIva,capitalDeferred,rowId:row.id,outstanding,cuota};
 return {ok:true,rows,row,later,rules,modality,originalDue,extendedDue:requested,fee,feeVat,interestPaid,interestIvaPaid,extraInterest,extraIva,capitalDeferred,total,audit,maxDue};
}
function carteraMoveCapital(rows,source,amount,modality){
 let left=roundToCents(amount);
 if(left<=0)return;
 const targets=carteraOpenRows(rows).filter(row=>row.id!==source.id).sort((a,b)=>carteraDue(a).localeCompare(carteraDue(b)));
 if(!targets.length)return;
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
 return carteraMutate(p,'registerPayments',()=>{
  const live=carteraQuoteExtension(p,input);
  if(!live.ok)return live;
  const row=live.rows.find(item=>item.id===live.row.id);
  row.interest=roundToCents(dispersionNumber(row.interest,0)+live.extraInterest);
  row.interestIva=roundToCents(dispersionNumber(row.interestIva,0)+live.extraIva);
  row.interestPaid=roundToCents(dispersionNumber(row.interestPaid,0)+live.interestPaid);
  row.ivaInteresPaid=roundToCents(dispersionNumber(row.ivaInteresPaid,0)+live.interestIvaPaid);
  const deferred=roundToCents(carteraCapitalPending(row));
  carteraMoveCapital(live.rows,row,deferred,live.modality);
  row.capital=roundToCents(dispersionNumber(row.capitalPaid,0));
  row.currentDueDate=live.extendedDue;row.dueDate=live.extendedDue;
  row.preventiveExtensionActive=true;row.preventiveMoraFreeze=true;row.preventiveFreezeUntil=live.extendedDue;row.preventiveOriginalDue=live.originalDue;row.dpd=0;
  live.rows.forEach(item=>{
   dispersionRecalculateRowTotals(item);
   item.payment=roundToCents(dispersionNumber(item.capital,0)+dispersionNumber(item.interest,0)+dispersionNumber(item.interestIva,0));
   item.totalPayment=roundToCents(dispersionConceptDefs().reduce((sum,d)=>sum+dispersionNumber(item[d.total],0),0));
   if(item.pendingAmount<=0.009)item.status='Pagado';
  });
  row.dpd=0;if(row.status==='Vencido')row.status='Pendiente';
  p.paymentSchedule=live.rows;
  p.application=p.application||{};
  p.application.carteraScheduleLock='extension';
  p.application.preventiveMoraFreezeUntil=live.extendedDue;
  p.application.preventiveExtensions=[...(p.application.preventiveExtensions||[]),live.audit];
  if(!Array.isArray(p.payments))p.payments=[];
  p.payments.push({...live.audit,paymentType:'preventive_extension',carteraFase1:true,date:dispersionBusinessDateMX(),amount:live.total,amountReceived:live.total,totalApplied:live.total,unappliedAmount:0,reference:String(input.reference||'EXT-PREVENTIVA').trim(),method:String(input.method||'SPEI').trim(),receiptId:dispersionReceiptId(),createdAt:new Date().toISOString(),actor:session&&(session.email||session.name)});
  dispersionReceiptEvent(p,'Extensión preventiva aplicada','Extensión '+live.audit.count+' · '+live.modality+' · '+live.originalDue+' → '+live.extendedDue+' · Comisión '+fmtMoney(live.fee)+' · Intereses '+fmtMoney(live.interestPaid));
  return {ok:true,audit:live.audit,total:live.total};
 });
}
function carteraPreviewExtension(p,input={}){
 const before=JSON.stringify(p.paymentSchedule||null);
 const quote=carteraQuoteExtension(p,input||{preview:true});
 if(JSON.stringify(p.paymentSchedule||null)!==before)return {ok:false,error:'La vista previa intentó modificar el crédito.'};
 return quote.ok?{...quote,rows:undefined,row:undefined,later:undefined,rules:undefined}:quote;
}

function carteraPeriods(rows){return carteraOpenRows(rows).filter(row=>carteraCapitalPending(row)>0.009).length;}
function carteraBalance(rows){return roundToCents(carteraOpenRows(rows).reduce((sum,row)=>sum+carteraCapitalPending(row),0));}
function carteraPreviewPrepay(p,input={}){
 const modality=input.modality||'reduce_plazo';
 const date=input.date||dispersionBusinessDateMX();
 const amount=roundToCents(dispersionNumber(input.amount,0));
 const rows=carteraScheduleRows(p);
 const balanceBefore=carteraBalance(rows),periodsBefore=carteraPeriods(rows);
 if(modality==='liquidacion'){
  if(typeof dispersionCanSimulateEarlySettlement==='function'&&!dispersionCanSimulateEarlySettlement(p,date))return {ok:false,error:'La liquidación aún no está habilitada para este crédito.'};
  const sim=dispersionCalculateEarlySettlement(JSON.parse(JSON.stringify(p)),date);
  return {ok:true,modality:'liquidacion_total',balanceBefore,balanceAfter:0,periodsBefore,periodsAfter:0,amount:roundToCents(sim.total||sim.totalToSettle||0),total:roundToCents(sim.total||sim.totalToSettle||0)};
 }
 if(!(amount>0))return {ok:false,error:'Captura el monto del prepago.'};
 if(modality==='reduce_cuota'){
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
  return {ok:true,modality:'reduce_cuota',balanceBefore,balanceAfter:carteraBalance(rows),periodsBefore,periodsAfter:carteraPeriods(rows),amount:applied,effect:'reduce_payment'};
 }
 const clone=JSON.parse(JSON.stringify(p));
 let reason='';
 const preview=dispersionApplyCapitalPrepayment(clone,amount,date,String(input.reference||'VISTA-PREVIA-PREPAGO'),String(input.method||'SPEI'),{preview:true,quiet:true,confirmDuplicate:true,onError:message=>{reason=message;}});
 if(!preview)return {ok:false,error:reason||'No se pudo simular el prepago a capital.'};
 const afterRows=clone.paymentSchedule||[];
 return {ok:true,modality:'reduce_plazo',effect:'reduce_term',balanceBefore,balanceAfter:carteraBalance(afterRows),periodsBefore,periodsAfter:carteraPeriods(afterRows),amount,appliedToCapital:roundToCents(preview.appliedToCapital||0)};
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
  p.payments.push({...evidence,paymentType:'capital_prepay',date:input.date,reference:input.reference,method:input.method,amountReceived:applied,totalApplied:applied,unappliedAmount:roundToCents(Math.max(input.amount-applied,0)),receiptId:dispersionReceiptId(),createdAt:new Date().toISOString()});
  p.application.prepayEvents=[...(p.application.prepayEvents||[]),evidence];
  dispersionReceiptEvent(p,'Prepago aplicado','Reducción de cuota · Saldo '+fmtMoney(evidence.balanceBefore)+' → '+fmtMoney(evidence.balanceAfter));
  return {ok:true,...evidence};
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
 const beforeRows=carteraScheduleRows(p);
 const periodsBefore=carteraPeriods(beforeRows),balanceBefore=carteraBalance(beforeRows);
 if(modality==='reduce_cuota')return carteraApplyReduceCuota(p,{...input,date,reference,method,amount});
 if(modality==='liquidacion'||modality==='liquidacion_total'){
  const sim=dispersionCalculateEarlySettlement(JSON.parse(JSON.stringify(p)),date);
  p.application=p.application||{};
  p.application.earlySettlementSimulation=sim;
  const total=roundToCents(sim.total||sim.totalToSettle||0);
  const ok=dispersionApplyEarlySettlement(p,total,date,reference,method,{quiet:true,confirmDuplicate:true});
  if(!ok)return {ok:false,error:'No se aplicó la liquidación.'};
  const evidence={prepayModality:'liquidacion_total',modality:'liquidacion_total',effect:'liquidacion_total',balanceBefore,balanceAfter:0,periodsBefore,periodsAfter:0,amount:total};
  carteraStampPrepay(p,evidence);
  return {ok:true,...evidence};
 }
 const ok=dispersionApplyCapitalPrepayment(p,amount,date,reference,method,{quiet:true,confirmDuplicate:true});
 if(!ok)return {ok:false,error:'No se aplicó el prepago a capital.'};
 const afterRows=p.paymentSchedule||[];
 const move=p.payments.at(-1)||{};
 const evidence={prepayModality:'reduce_plazo',modality:'reduce_plazo',effect:move.effect||'reduce_term',balanceBefore,balanceAfter:carteraBalance(afterRows),periodsBefore,periodsAfter:carteraPeriods(afterRows),amount,appliedToCapital:roundToCents(move.appliedToCapital||0)};
 carteraStampPrepay(p,evidence);
 return {ok:true,...evidence};
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
function carteraBuildAmortization(balance,periods,annualRate,frequency,startDate,cuota,factor){
 const perYear=frequency==='biweekly'?24:12,rate=annualRate/perYear;
 const payment=cuota>0?roundToCents(cuota):(rate===0?roundToCents(balance/periods):roundToCents(balance*rate/(1-Math.pow(1+rate,-periods))));
 if(!(payment>0))return {ok:false,error:'La cuota no cubre el saldo.'};
 const rows=[];let remaining=roundToCents(balance),previous=startDate;
 for(let i=1;i<=periods;i++){
  const due=frequency==='biweekly'?dispersionAddDaysToDateString(previous,15):dispersionAddMonthsToDateString(previous,1);
  const interest=roundToCents(remaining*rate),iva=roundToCents(interest*factor);
  if(i!==periods&&interest+iva>=payment)return {ok:false,error:'La cuota no cubre el interés del periodo. Aumenta la cuota o el plazo.'};
  const capital=i===periods?remaining:roundToCents(Math.min(remaining,payment-interest-iva));
  const row={id:'restructure-'+i,number:i,type:frequency==='biweekly'?'Pago quincenal ordinario':'Mensualidad ordinaria',dueDate:due,currentDueDate:due,originalDueDate:due,scheduledDate:due,capital,interest,interestIva:iva,capitalPaid:0,interestPaid:0,ivaInteresPaid:0,moratory:0,moratoryIva:0,commission:0,moratoryPaid:0,ivaMoratorioPaid:0,commissionPaid:0,payment:roundToCents(capital+interest+iva),status:'Programado',dpd:0,balanceStart:remaining,balanceEnd:roundToCents(remaining-capital)};
  dispersionHydrateConcepts(row);row.totalPayment=roundToCents(dispersionConceptDefs().reduce((sum,d)=>sum+dispersionNumber(row[d.total],0),0));
  rows.push(row);remaining=roundToCents(remaining-capital);previous=due;
 }
 return {ok:true,rows,payment,remaining};
}
function carteraPreviewRestructure(p,input={}){
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
  const built=carteraBuildAmortization(live.newBalance,live.termMonths,live.annualRate,terms.paymentFrequency,dispersionBusinessDateMX(),cuota,live.factor);
  if(!built.ok)return built;
  const schedule=built.rows;
  if(live.option==='B'&&(live.separated.moratory||live.separated.moratoryIva||live.separated.commission||live.separated.commissionIva)){
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
  const audit={option:live.option,newBalance:live.newBalance,debt:live.debt,commissionFee:live.commissionFee,commissionFeeIva:live.commissionFeeIva,termMonths:live.termMonths,annualRate:live.annualRate,cuota:built.payment,separated:live.separated,components:live.components,at:new Date().toISOString(),actor:session&&(session.email||session.name),previousInstallments:previous.length};
  p.application.restructure=audit;
  p.application.restructureAudit=[...(p.application.restructureAudit||[]),audit];
  p.application.previousSchedule=previous;
  if(!Array.isArray(p.payments))p.payments=[];
  p.payments.push({paymentType:'restructure',carteraFase1:true,option:live.option,date:dispersionBusinessDateMX(),amount:live.commissionFee,amountReceived:0,totalApplied:0,unappliedAmount:0,reference:String(input.reference||'REESTRUCTURA').trim(),method:'Reestructura',receiptId:dispersionReceiptId(),audit,createdAt:new Date().toISOString()});
  dispersionReceiptEvent(p,'Crédito reestructurado','Opción '+live.option+' · Nuevo saldo '+fmtMoney(live.newBalance)+' · Plazo '+live.termMonths+' · Tasa '+(live.annualRate*100).toFixed(2)+'%');
  return {ok:true,audit,schedule};
 });
}

const carteraOriginalEligibility=dispersionExtensionEligibility;
dispersionExtensionEligibility=function(row,p){
 const result=carteraOriginalEligibility(row,p);
 if(result.ok||!/comisiones o conceptos sin interés/.test(result.message||''))return result;
 const commission=dispersionPendingConceptValue(row,['commission'],['commissionPaid'],['commissionPending']);
 const mora=dispersionPendingConceptValue(row,['moratoryNonInterest'],['moratoryNonInterestPaid'],['moratoryNonInterestPending']);
 const ordinary=dispersionPendingConceptValue(row,['ordinaryNonInterest'],['ordinaryNonInterestPaid'],['ordinaryNonInterestPending']);
 if(!(commission>0)||mora>0||ordinary>0)return result;
 const iva=roundToCents(commission*carteraIvaFactor(carteraRules(p)));
 const detail={commissionPending:roundToCents(commission),commissionIva:iva};
 if(staffIsAdmin())return {ok:true,message:'Comisión pendiente '+fmtMoney(detail.commissionPending)+' + IVA '+fmtMoney(detail.commissionIva)+'. Un administrador puede autorizar la prórroga.',...detail};
 return {ok:false,message:'Hay comisiones pendientes de '+fmtMoney(detail.commissionPending)+' + IVA '+fmtMoney(detail.commissionIva)+'. Se requiere permiso de administrador para prorrogar.',...detail};
};
const carteraOriginalExtensionSection=dispersionExtensionSectionHtml;
dispersionExtensionSectionHtml=function(p,row){
 let html=carteraOriginalExtensionSection(p,row).replace('>Nota interna<','>Motivo (opcional)<');
 const eligibility=dispersionExtensionEligibility(row,p);
 if(eligibility.commissionPending>0)html=html.replace('</h4>','</h4><p class="extension-manage-note">Comisión pendiente '+fmtMoney(eligibility.commissionPending)+' + IVA '+fmtMoney(eligibility.commissionIva)+'.</p>');
 return html;
};

function carteraChoice(action,label){return `<button type="button" class="cartera-choice" aria-pressed="${carteraUiState.action===action?'true':'false'}" onclick="carteraChoose('${action}')">${label}</button>`;}
function carteraModalityButton(value,label,current){return `<button type="button" class="cartera-choice" aria-pressed="${current===value?'true':'false'}" onclick="carteraChooseModality('${value}')">${label}</button>`;}
function carteraNormalizeAction(action){return action==='extension'?'extension':action==='reestructura'?'reestructura':action==='prepago'?'prepago':'pago';}
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
 return {amount:read('carteraAmount'),date:read('carteraDate'),reference:read('carteraReference'),method:read('carteraMethod'),newDue:read('carteraNewDue'),term:read('carteraTerm'),rate:read('carteraRate'),cuota:read('carteraCuota'),cuenta:read('carteraCuenta'),origen:read('carteraOrigen')};
}
function carteraMoneyInput(id,label,value,help){return `<label class="field">${label}<input id="${id}" value="${escapeAttr(value||'')}" ${id==='carteraDate'||id==='carteraNewDue'?'type="date"':'type="number" min="0" step="0.01"'}>${help?`<small>${help}</small>`:''}</label>`;}
function carteraTextInput(id,label,value,help){return `<label class="field">${label}<input id="${id}" value="${escapeAttr(value||'')}">${help?`<small>${help}</small>`:''}</label>`;}
function carteraMethodSelect(draft){return `<label class="field">Método<select id="carteraMethod"><option ${draft.method==='Transferencia'?'selected':''}>Transferencia</option><option ${draft.method==='Depósito'?'selected':''}>Depósito</option><option ${draft.method==='Efectivo'?'selected':''}>Efectivo</option><option ${!draft.method||draft.method==='SPEI'?'selected':''}>SPEI</option></select></label>`;}
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
 return `Cuota ${row.number||'—'} · ${row.currentDueDate||row.dueDate||'sin fecha'}`;
}
function carteraPanelHtml(p){
 const action=carteraNormalizeAction(carteraUiState.action);
 const draft=carteraUiState.draft||{};
 const date=draft.date||dispersionBusinessDateMX();
 let body='';
 if(action==='pago'){
  body=`<p>El monto sigue la prelación desde la cuota más antigua: IVA, comisiones, moratorios, ordinarios y capital.</p><div class="cartera-form">${carteraMoneyInput('carteraAmount','Monto',draft.amount)}${carteraMoneyInput('carteraDate','Fecha',date)}${carteraTextInput('carteraReference','Referencia',draft.reference)}${carteraMethodSelect(draft)}${carteraTextInput('carteraCuenta','Cuenta (opcional)',draft.cuenta)}${carteraTextInput('carteraOrigen','Origen (opcional)',draft.origen)}<label class="field">Comprobante (opcional)<input id="carteraComprobante" type="file" accept="image/*,.pdf" onchange="carteraRememberFile(this)"></label><div class="field"><span>Cuota seleccionada</span><strong>${escapeHtml(carteraSelectedRowLabel(p))}</strong></div></div>`;
 }else if(action==='prepago'){
  const mode=carteraUiState.modality||'reduce_plazo';
  body=`<div class="cartera-choices cartera-choices-sub" role="group" aria-label="Modalidad de prepago">${carteraModalityButton('reduce_plazo','Reducir plazo',mode)}${carteraModalityButton('reduce_cuota','Reducir cuota',mode)}${carteraModalityButton('liquidacion_total','Liquidación total',mode)}</div><div class="cartera-form">${carteraMoneyInput('carteraAmount','Monto',draft.amount,'En liquidación total se usa el saldo calculado.')}${carteraMoneyInput('carteraDate','Fecha',date)}${carteraTextInput('carteraReference','Referencia',draft.reference)}${carteraMethodSelect(draft)}</div>`;
 }else if(action==='extension'){
  const rules=carteraRules(p),mode=carteraUiState.modality||(rules.preventiveExtensionModality==='PRORRATEADO'?'PRORRATEADO':'COLA_FINAL');
  body=`<p>Sin mora y antes del vencimiento. Máximo ${rules.preventiveExtensionMax} por crédito. No requiere administrador.</p><div class="cartera-choices cartera-choices-sub" role="group" aria-label="Modalidad de extensión">${carteraModalityButton('COLA_FINAL','Cola final',mode)}${carteraModalityButton('PRORRATEADO','Prorrateado',mode)}</div><div class="cartera-form">${carteraMoneyInput('carteraNewDue','Nueva fecha',draft.newDue,'Vacío: un día antes de la siguiente cuota.')}${carteraTextInput('carteraReference','Referencia',draft.reference)}</div>`;
 }else{
  const mode=carteraUiState.modality||'A';
  body=`<p>${staffIsAdmin()?'La reestructura queda marcada en el crédito y no se dispara sola por atraso.':'La reestructura requiere un administrador. Puedes revisar la pantalla, pero la confirmación queda bloqueada.'}</p><div class="cartera-choices cartera-choices-sub" role="group" aria-label="Opción de reestructura">${carteraModalityButton('A','Opción A · Capitalizar todo',mode)}${carteraModalityButton('B','Opción B · Mora y comisiones aparte',mode)}</div><div class="cartera-form">${carteraMoneyInput('carteraTerm','Plazo (periodos)',draft.term||'6')}${carteraMoneyInput('carteraRate','Tasa anual (%)',draft.rate||'36')}${carteraMoneyInput('carteraCuota','Cuota (opcional)',draft.cuota,'Si la dejas vacía, se calcula con el plazo y la tasa.')}</div>`;
 }
 return `<section id="carteraFase1" class="cartera-fase1"><h4>Aplicar pago</h4><div class="cartera-choices cartera-choices-ops" role="group" aria-label="Tipo de operación">${carteraChoice('pago','Pago normal')}${carteraChoice('prepago','Prepago')}${carteraChoice('extension','Extensión')}${carteraChoice('reestructura','Reestructura')}</div>${body}<div class="cartera-actions"><button type="button" class="btn btn-secondary" onclick="carteraRunPreview()">Vista previa</button><button type="button" class="btn btn-primary" id="carteraConfirm" onclick="carteraConfirmCurrent()" ${carteraUiState.token?'':'disabled'}>Confirmar</button></div><div id="carteraFase1Preview" class="cartera-preview" role="status">${carteraUiState.previewHtml||''}</div></section>`;
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
 if(!(amount>0))return {ok:false,error:'Captura un monto válido.'};
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
 return {ok:applied>0,error:applied>0?'':'El monto no cubrió conceptos pendientes.',amount,applied,remaining:allocation.remaining,breakdown,balanceBefore,balanceAfter:roundToCents(Math.max(balanceBefore-breakdown.capital,0)),duplicate,date,selectedLabel:selected?`Cuota ${selected.number||'—'} · ${selected.currentDueDate||selected.dueDate||''}`:''};
}
function carteraApplyOrdinary(p,input){
 const preview=carteraPreviewOrdinary(p,input||{});
 if(!preview.ok)return preview;
 const ok=dispersionApplyPayment({creditId:p.id,amount:roundToCents(Number(input.amount)||0),type:'ordinary',date:input.date||dispersionBusinessDateMX(),reference:input.reference||('PAGO-'+Date.now()),method:input.method||'SPEI',target:'auto',cuenta:input.cuenta||'',origen:input.origen||'',comprobante:carteraUiState.comprobante||null},{quiet:true,confirmDuplicate:true});
 if(!ok)return {ok:false,error:'No se aplicó el pago.'};
 return {ok:true,preview,payment:p.payments&&p.payments.at?p.payments.at(-1):null,audit:{type:'pago',breakdown:preview.breakdown,balanceBefore:preview.balanceBefore,balanceAfter:preview.balanceAfter,amount:preview.applied}};
}
function carteraPreviewText(result,action){
 if(!result||result.ok===false)return `<p>${escapeHtml(result&&result.error||'No hay vista previa.')}</p>`;
 if(action==='pago'){const b=result.breakdown||{};return `<p>Aplicado ${fmtMoney(result.applied||0)}. IVA ${fmtMoney(b.iva||0)} · Comisiones ${fmtMoney(b.comisiones||0)} · Moratorios ${fmtMoney(b.moratorios||0)} · Ordinarios ${fmtMoney(b.ordinarios||0)} · Capital ${fmtMoney(b.capital||0)}. Saldo ${fmtMoney(result.balanceBefore)} → ${fmtMoney(result.balanceAfter)}.${result.remaining>0?` Sobrante ${fmtMoney(result.remaining)}.`:' '}${result.duplicate?' Hay un pago con el mismo monto, fecha y referencia.':''} ${escapeHtml(result.selectedLabel||'')}</p>`;}
 if(action==='prepago')return `<p>Modalidad ${escapeHtml(result.modality)}. Saldo ${fmtMoney(result.balanceBefore)} → ${fmtMoney(result.balanceAfter)}. Plazo ${result.periodsBefore} → ${result.periodsAfter} cuotas con capital. Monto ${fmtMoney(result.amount||result.total||0)}.</p>`;
 if(action==='extension')return `<p>${escapeHtml(result.modality)} · ${escapeHtml(result.originalDue)} → ${escapeHtml(result.extendedDue)}. Intereses ${fmtMoney(result.interestPaid)} · Comisión ${fmtMoney(result.fee)} + IVA ${fmtMoney(result.feeVat)} · Total ${fmtMoney(result.total)} · Extensión ${result.audit.count}.</p>`;
 return `<p>Opción ${escapeHtml(result.option)}. Nuevo saldo ${fmtMoney(result.newBalance)}. Comisión ${fmtMoney(result.commissionFee)} + IVA ${fmtMoney(result.commissionFeeIva)}.${result.separated?` Mora aparte ${fmtMoney(result.separated.moratory)} + IVA ${fmtMoney(result.separated.moratoryIva)}.`:' Toda la deuda reconocida entra al nuevo saldo.'}</p>`;
}
function carteraLauncherHtml(p){
 const id=typeof escapeAttr==='function'?escapeAttr(p.id):p.id;
 return `<section id="carteraFase1Launch" class="cartera-fase1"><h4>Aplicar pago</h4><p>Pago normal, prepago, extensión o reestructura usan la misma prelación.</p><button type="button" class="btn btn-primary" onclick="carteraOpenPayment('${id}')">Aplicar pago</button></section>`;
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
 if(!content.insertBefore&&!content.prepend){content.innerHTML=`<section id="carteraFase1Host" class="patient-section-card cartera-fase1-host"><div class="patient-section-head"><div><h3>Aplicar pago</h3><p>${escapeHtml(p.patient&&p.patient.fullName||p.id)} · ${escapeHtml(p.id)}</p></div><div class="portfolio-actions"><button type="button" class="btn btn-sm btn-primary" onclick="carteraRegisterPayment('${id}')">Registrar pago</button><button type="button" class="btn btn-sm btn-secondary" onclick="carteraCloseHost()">Cerrar</button></div></div>${carteraPanelHtml(p)}</section>`;return true;}
 if(!host)return false;
 host.innerHTML=`<div class="patient-section-head"><div><h3>Aplicar pago</h3><p>${escapeHtml(p.patient&&p.patient.fullName||p.id)} · ${escapeHtml(p.id)}${p.application&&p.application.carteraDemoState?' · '+escapeHtml(p.application.carteraDemoState):''}</p></div><div class="portfolio-actions"><button type="button" class="btn btn-sm btn-primary" onclick="carteraRegisterPayment('${id}')">Registrar pago</button><button type="button" class="btn btn-sm btn-secondary" onclick="carteraCloseHost()">Cerrar</button></div></div><div id="carteraFase1Mount"></div>`;
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
 return `<article class="cartera-profile-credit"><div class="cartera-profile-credit-head"><div><h4>${escapeHtml(req.id)}</h4><p>${escapeHtml(app.procedure||'Crédito')} · ${frequency} · ${base}${app.carteraDemoState?' · '+escapeHtml(app.carteraDemoState):''}</p></div><div class="portfolio-actions"><button type="button" class="btn btn-sm btn-primary" onclick="carteraOpenPayment('${id}')">Aplicar pago</button></div></div></article>`;
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
function carteraRunPreview(){
 const p=carteraSelected();if(!p)return false;
 carteraUiState.draft=carteraDraft();
 const draft=carteraUiState.draft,action=carteraNormalizeAction(carteraUiState.action);
 carteraUiState.action=action;
 let result;
 if(action==='pago')result=carteraPreviewOrdinary(p,draft);
 else if(action==='extension')result=carteraPreviewExtension(p,{modality:carteraUiState.modality||undefined,newDueDate:draft.newDue||undefined,preview:true});
 else if(action==='reestructura')result=carteraPreviewRestructure(p,{option:carteraUiState.modality||'A',termMonths:draft.term,annualRate:draft.rate,cuota:draft.cuota,preview:true});
 else result=carteraPreviewPrepay(p,{modality:carteraUiState.modality||'reduce_plazo',amount:draft.amount,date:draft.date||dispersionBusinessDateMX(),reference:draft.reference,method:draft.method,preview:true});
 carteraUiState.preview=result;
 carteraUiState.token=result&&result.ok?carteraPreviewKey():'';
 carteraUiState.previewHtml=carteraPreviewText(result,action);
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
 if(typeof confirm==='function'&&!confirm('¿Confirmas esta operación de cartera?'))return false;
 let result;
 if(carteraUiState.action==='pago')result=carteraApplyOrdinary(p,draft);
 else if(carteraUiState.action==='extension')result=carteraApplyExtension(p,{modality:carteraUiState.modality||undefined,newDueDate:draft.newDue||undefined,reference:draft.reference||'EXT-PREVENTIVA',method:'SPEI'});
 else if(carteraUiState.action==='reestructura')result=carteraApplyRestructure(p,{option:carteraUiState.modality||'A',termMonths:draft.term,annualRate:draft.rate,cuota:draft.cuota,reference:draft.reference||'REESTRUCTURA'});
 else result=carteraApplyPrepay(p,{modality:carteraUiState.modality||'reduce_plazo',amount:draft.amount,date:draft.date||dispersionBusinessDateMX(),reference:draft.reference||('PREPAGO-'+Date.now()),method:draft.method||'SPEI'});
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
 style.textContent=`.cartera-fase1,.cartera-receipt{margin:0 0 16px;padding:16px;border:1px solid rgba(7,20,47,.08);border-radius:16px;background:#fff;color:#07142F;font-family:Inter,sans-serif}.cartera-fase1 h4,.cartera-fase1-host h3,.cartera-profile-ops h3,.cartera-receipt h4{font-family:"Plus Jakarta Sans",Inter,sans-serif;margin:0 0 12px;color:#07142F}.cartera-choices{display:grid;gap:8px;margin:0 0 12px;align-items:stretch}.cartera-choices-ops{grid-template-columns:repeat(4,minmax(0,1fr))}.cartera-choices-sub{grid-template-columns:repeat(3,minmax(0,1fr))}.cartera-choice{appearance:none;width:100%;min-height:48px;text-align:left;border:1px solid rgba(7,20,47,.16);background:#fff;color:#07142F;border-radius:12px;padding:12px 14px;font-family:"Plus Jakarta Sans",Inter,sans-serif;font-weight:600;cursor:pointer}.cartera-choice[aria-pressed="true"]{border-color:#20C7D4;box-shadow:inset 0 0 0 1px #20C7D4;background:#f3fcfd}.cartera-form,.cartera-receipt-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start}.cartera-form-stack{grid-template-columns:1fr}.cartera-form .field,.modal-body>.field{display:flex;flex-direction:column;gap:6px;margin:0;min-width:0}.cartera-form .field input,.cartera-form .field select,.cartera-form .field textarea,.modal-body>.field input,.modal-body>.field select,.modal-body>.field textarea{box-sizing:border-box;width:100%;max-width:100%;min-width:0;min-height:48px}.modal.cartera-agreement-modal{width:min(720px,calc(100vw - 32px));max-height:calc(100vh - 32px);display:flex;flex-direction:column}.modal.cartera-agreement-modal .modal-body{overflow:auto}.cartera-actions,.cartera-fase1-host .portfolio-actions,.cartera-profile-credit .portfolio-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.cartera-preview{margin-top:12px;color:#07142F}.cartera-fase1-host{margin:0 0 16px}.cartera-profile-credit{display:block;margin:0 0 12px;padding:16px;border:1px solid rgba(7,20,47,.08);border-radius:16px;background:#fff}.cartera-profile-credit.is-active{box-shadow:inset 0 0 0 1px #20C7D4}.cartera-profile-credit-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;align-items:flex-start}.cartera-profile-credit h4{margin:0;font-family:"Plus Jakarta Sans",Inter,sans-serif;color:#07142F}.cartera-profile-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:12px 0}.cartera-profile-meta span{display:block;color:#64748B;font-size:13px}.cartera-profile-meta strong{color:#07142F;font-family:"Plus Jakarta Sans",Inter,sans-serif}.cartera-profile-block{margin-top:16px}.cartera-profile-block h4{margin:0 0 8px}.cartera-profile-list{margin:0;padding:0;list-style:none}.cartera-profile-list li{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid rgba(7,20,47,.08)}.cartera-amortization-wrap{overflow:auto}.cartera-amortization-wrap tr.is-selected td{background:#f3fcfd}.cartera-contact-block{display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin-top:8px;min-width:0}.cartera-contact{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-width:0;max-width:100%;color:#07142F;font-family:Inter,sans-serif;font-size:13px;line-height:1.3}.cartera-contact-label{color:#64748B;font-size:12px}.cartera-contact-value{font-variant-numeric:tabular-nums}.cartera-contact-actions{display:inline-flex;align-items:center;gap:4px}.cartera-contact-link{color:#07142F;font-weight:600;text-decoration:none;border-bottom:1px solid #20C7D4}.cartera-contact-link:hover{color:#0E7490}.cartera-contact-mail{font-weight:500;overflow-wrap:anywhere}.cartera-contact-icon{appearance:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:1px solid rgba(7,20,47,.16);border-radius:8px;background:#fff;color:#07142F;cursor:pointer;text-decoration:none;line-height:0}.cartera-contact-icon:hover{border-color:#20C7D4;color:#0E7490;background:#f3fcfd}.cartera-contact-empty{color:#64748B}.portfolio-table .cartera-contact-block{margin-top:6px}.cartera-profile-meta .cartera-contact{margin-top:4px}.cartera-receipt-table{width:100%;border-collapse:collapse}.cartera-receipt-table th,.cartera-receipt-table td{padding:8px 0;border-bottom:1px solid rgba(7,20,47,.08);text-align:left}.cartera-receipt-table td:last-child,.cartera-receipt-table th:last-child{text-align:right}.cartera-aging-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0}.cartera-aging-grid div{padding:12px;border:1px solid rgba(7,20,47,.08);border-radius:12px;background:#fff}.cartera-aging-grid dt{color:#64748B;font-size:13px}.cartera-aging-grid dd{margin:4px 0 0;font-family:"Plus Jakarta Sans",Inter,sans-serif;font-weight:700;color:#07142F}.cartera-mail-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;align-items:flex-start;margin:0 0 12px}.cartera-mail-head h3,.cartera-mail-head h4,.cartera-mail-head p{margin:0}.cartera-mail-head p{margin-top:6px;color:#64748B}.cartera-mail-grid,.cartera-mail-switches{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:stretch}.cartera-mail-switches{grid-template-columns:repeat(2,minmax(0,1fr));margin:0 0 12px}.cartera-mail-grid>section{min-width:0;padding:12px;border:1px solid rgba(7,20,47,.08);border-radius:12px;background:#fff}.cartera-mail-grid h4{margin:0 0 8px;font-family:"Plus Jakarta Sans",Inter,sans-serif;color:#07142F}.cartera-mail-grid ul{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:8px}.cartera-mail-grid li{display:grid;gap:4px;padding-top:8px;border-top:1px solid rgba(7,20,47,.08);min-width:0}.cartera-mail-grid li span,.cartera-form .field.is-wide{grid-column:1/-1}.cartera-mail-summary .cartera-actions{margin-top:0}@media(max-width:800px){.cartera-choices-ops,.cartera-choices-sub,.cartera-form,.cartera-receipt-grid,.cartera-aging-grid,.cartera-profile-meta,.cartera-mail-grid,.cartera-mail-switches{grid-template-columns:1fr}}`;
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
  {id:'APP-CARTERA-1004',name:'Sofía Calderón Ibarra',state:'Al corriente · insoluto · mensual',base:'outstanding_balance',frequency:'monthly',offset:-120,payPast:true,amount:110000,procedure:'Abdominoplastia',doctor:'Dr. Miguel Bonilla',phone:'55 4100 1004',curp:'CAIS850404MDFBLF04',rfc:'CAIS850404GH5',email:'sofia.calderon.demo@pulzzo.mx'},
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
try{carteraInjectCss();}catch(error){}
try{carteraSeedDisbursedDemos();}catch(error){}
Object.assign(globalThis,{carteraAllocateOldestFirst,carteraFindDuplicate,carteraCapitalPending,carteraOpenRows,carteraPreviewExtension,carteraApplyExtension,carteraPreviewPrepay,carteraApplyPrepay,carteraPreviewRestructure,carteraApplyRestructure,carteraPreviewOrdinary,carteraApplyOrdinary,carteraPanelHtml,carteraChoose,carteraChooseModality,carteraOpenFromPortfolio,carteraOpenProfile,carteraOpenProfileRow,carteraOpenPayment,carteraCanUseModal,carteraRegisterPayment,carteraCloseHost,carteraSeedDisbursedDemos,carteraRunPreview,carteraConfirmCurrent,carteraBuildDemoCredit});
}
