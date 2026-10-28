/* PULZZO v71 · reglas aprobadas 27/10/2026. Demo local: sin servicios reales (correo, WhatsApp, Buró, firmas ni dispersión).
   Moratorios (2 × tasa ordinaria anual, diario /360, solo sobre capital vencido, sin interés sobre interés),
   condonaciones con tope de gerente, extensión como herramienta única (la prórroga queda solo como historial),
   datos del portal del paciente y migración del doctor demo. PULZZO no es una SOFOM. */
'use strict';
if(!globalThis.__pulzzoReglasV71&&typeof dispersionBuildSchedule==='function'){
globalThis.__pulzzoReglasV71=true;

var V71_VERSION='v71';
var V71_FIXED_CASE=/^APP-PRUEBA-/; // casos de prueba con cifras fijas: no devengan (ver REPORTE-v71).
var V71_DOCTOR={prefix:'Dr.',name:'Mateo Ríos Demo',full:'Dr. Mateo Ríos Demo',phone:'55 0000 0003',phoneDigits:'5500000003'};
// Valores anteriores del doctor demo (nombre ficticio). Se comparan sin acentos y sin mayúsculas.
var V71_DOCTOR_OLD=['miguel bonillas','miguel bonilla','dr. miguel bonillas','dr. miguel bonilla','dr miguel bonillas','dr miguel bonilla'];
var V71_DOCTOR_OLD_PHONES=['5512345678','55 2222 3333','5522223333','58 3475 9385','5834759385'];

function v71Num(v,f){return typeof dispersionNumber==='function'?dispersionNumber(v,f||0):(Number.isFinite(Number(v))?Number(v):(f||0));}
function v71Round(v){return typeof roundToCents==='function'?roundToCents(v):Math.round((Number(v)+Number.EPSILON)*100)/100;}
function v71Money(v){return typeof fmtMoney==='function'?fmtMoney(v):Number(v||0).toLocaleString('es-MX',{style:'currency',currency:'MXN',minimumFractionDigits:2,maximumFractionDigits:2});}
function v71Dmy(v){return String(v||'').slice(0,10).replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$3/$2/$1');}
function v71Esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function v71Date(v){return String(v||'').slice(0,10);}
function v71Days(from,to){const a=Date.parse(v71Date(from)+'T00:00:00Z'),b=Date.parse(v71Date(to)+'T00:00:00Z');return Number.isFinite(a)&&Number.isFinite(b)?Math.round((b-a)/86400000):0;}
function v71RealToday(){try{return typeof today==='function'?today():new Date().toISOString().slice(0,10);}catch(error){return new Date().toISOString().slice(0,10);}}
// Fecha de devengo: nunca adelanta un corte demo futuro (no se guarda mora que aún no ocurre).
function v71AccrualDate(){const real=v71RealToday();let cut=real;try{if(typeof dispersionBusinessDateMX==='function')cut=dispersionBusinessDateMX();}catch(error){}return cut&&cut<real?cut:real;}
function v71Rules(p,date){try{if(typeof carteraRules==='function')return carteraRules(p,date);}catch(error){}try{if(typeof configResolveRules==='function')return configResolveRules(p,date);}catch(error){}return {ivaEnabled:true,ivaRate:.16,ivaInterestEnabled:true,ivaMoratoryEnabled:true,moratoryRateMultiplier:2};}
function v71MoraIvaFactor(rules){if(typeof carteraIvaMoratoryFactor==='function')return carteraIvaMoratoryFactor(rules);if(rules&&(rules.ivaEnabled===false||rules.ivaMoratoryEnabled===false))return 0;const r=Number(rules&&rules.ivaRate);return Number.isFinite(r)?r:.16;}
function v71OrdinaryRate(p){try{if(typeof normalizeOrdinaryAnnualRate==='function'){const r=Number(normalizeOrdinaryAnnualRate(p));if(Number.isFinite(r)&&r>0)return r;}}catch(error){}return .6;}
// Tasa moratoria anual = multiplicador vigente (Admin, versionado con vigencia) × tasa ordinaria anual del crédito.
function v71MoraRate(p,date){const rules=v71Rules(p,date||v71AccrualDate()),m=Number(rules&&rules.moratoryRateMultiplier),multiplier=Number.isFinite(m)&&m>0?m:2,ordinary=v71OrdinaryRate(p);return {multiplier,ordinary,annual:multiplier*ordinary,versionId:rules&&rules.versionId||''};}
function v71Pct(rate){const v=Math.round(Number(rate||0)*10000)/100;return (Number.isInteger(v)?String(v):v.toFixed(2).replace(/0+$/,'').replace(/\.$/,'')).replace('.',',')+'%';}
function v71MoraLabel(p,date){return 'Moratorio '+v71Pct(v71MoraRate(p,date).annual)+' anual';}
// Cálculo puro: capital vencido × tasa anual / 360 × días; IVA según el interruptor de moratorios.
function v71MoraQuote(capital,annualRate,days,ivaFactor){const interest=v71Round(Math.max(v71Num(capital),0)*Math.max(v71Num(annualRate),0)/360*Math.max(Math.floor(v71Num(days)),0));const iva=v71Round(interest*Math.max(v71Num(ivaFactor),0));return {interest,iva,total:v71Round(interest+iva)};}

function v71RowDue(row){return v71Date(row&&(row.currentDueDate||row.dueDate||row.scheduledDate));}
function v71RowClosed(row){try{if(typeof dispersionExtensionIsClosedRow==='function'&&dispersionExtensionIsClosedRow(row))return true;}catch(error){}try{if(typeof dispersionIsClosedPaymentStatus==='function'&&dispersionIsClosedPaymentStatus(row.status))return true;}catch(error){}return false;}
function v71RowCapitalPending(row){const pending=row&&row.capitalPending!==undefined?v71Num(row.capitalPending):v71Num(row&&row.capital)-v71Num(row&&row.capitalPaid);return Math.max(v71Round(pending),0);}
function v71Eligible(p){return !!(p&&p.id&&!V71_FIXED_CASE.test(String(p.id))&&Array.isArray(p.paymentSchedule)&&p.paymentSchedule.length&&!(typeof dispersionIsCreditLiquidated==='function'&&(()=>{try{return dispersionIsCreditLiquidated(p);}catch(error){return false;}})()));}

// Devengo incremental por fila. Estado en application.v71MoraAccrual[rowId] = {raw, booked, bookedIva, through}.
// raw acumula capital vencido × tasa diaria por cada tramo; solo se agrega la diferencia contra lo ya registrado,
// de modo que los moratorios condonados o pagados no se vuelven a cobrar ni generan interés sobre interés.
function v71AccrueCredit(p,date){
 if(!v71Eligible(p))return {changed:false,delta:0};
 const app=p.application||(p.application={}),asOf=v71Date(date||v71AccrualDate());
 if(!app.v71MoraSince)app.v71MoraSince=asOf; // migración: nunca retroactivo para créditos vistos por primera vez.
 const state=app.v71MoraAccrual||(app.v71MoraAccrual={}),freeze=v71Date(app.preventiveMoraFreezeUntil);
 let changed=false,delta=0;
 for(const row of p.paymentSchedule){
  if(!row||!row.id)continue;
  const due=v71RowDue(row);if(!due||due>=asOf)continue;
  const st=state[row.id]||{raw:0,booked:0,bookedIva:0,through:''};
  let from=[due,v71Date(app.v71MoraSince),freeze,st.through].filter(Boolean).sort().pop();
  if(v71RowClosed(row)||v71RowCapitalPending(row)<=0){if(st.through!==asOf&&from<asOf){st.through=asOf;state[row.id]=st;changed=true;}continue;}
  const days=v71Days(from,asOf);if(days<=0)continue;
  const rate=v71MoraRate(p,from);
  st.raw=Math.round((v71Num(st.raw)+v71RowCapitalPending(row)*rate.annual/360*days)*1e6)/1e6;st.through=asOf;
  const factor=v71MoraIvaFactor(v71Rules(p,due));
  const booked=v71Round(st.raw),bookedIva=v71Round(booked*factor);
  const dMora=v71Round(booked-v71Num(st.booked)),dIva=v71Round(bookedIva-v71Num(st.bookedIva));
  st.booked=booked;st.bookedIva=bookedIva;st.label=v71MoraLabel(p,from);state[row.id]=st;changed=true;
  if(dMora||dIva){
   row.moratory=v71Round(v71Num(row.moratory)+dMora);row.interesMora=row.moratory;
   row.moratoryIva=v71Round(v71Num(row.moratoryIva)+dIva);row.ivaMora=row.moratoryIva;
   row.totalPayment=v71Round(v71Num(row.totalPayment)+dMora+dIva);
   row.v71MoraLabel=st.label;
   if(typeof dispersionRecalculateRowTotals==='function')dispersionRecalculateRowTotals(row);
   delta=v71Round(delta+dMora+dIva);
  }
 }
 return {changed,delta};
}
function v71AccrueAll(date){
 if(typeof db==='undefined'||!db||!Array.isArray(db.patients))return {changed:false,credits:0};
 const asOf=v71Date(date||v71AccrualDate());
 if(!db.v71||typeof db.v71!=='object')db.v71={migratedOn:asOf,version:1};
 let changed=false,credits=0;
 for(const p of db.patients){try{const r=v71AccrueCredit(p,asOf);if(r.changed)changed=true;if(r.delta)credits++;}catch(error){}}
 if(changed&&typeof carteraResave==='function')carteraResave();
 return {changed,credits};
}

/* ---------- Doctor demo: migración de datos guardados ---------- */
function v71Norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();}
function v71IsOldDoctor(v){return V71_DOCTOR_OLD.includes(v71Norm(v));}
function v71IsOldDoctorPhone(v){return V71_DOCTOR_OLD_PHONES.includes(String(v||'').trim());}
function v71RenameDoctorIn(node,depth){
 if(!node||typeof node!=='object'||depth>8)return 0;let count=0;
 if(Array.isArray(node)){for(const item of node)count+=v71RenameDoctorIn(item,depth+1);return count;}
 const renamedHere=Object.keys(node).some(k=>typeof node[k]==='string'&&v71IsOldDoctor(node[k]));
 for(const key of Object.keys(node)){
  const v=node[key];
  if(typeof v==='string'&&v71IsOldDoctor(v)){node[key]=/^dr\.?\s/i.test(v)?V71_DOCTOR.full:V71_DOCTOR.name;count++;}
  else if(v&&typeof v==='object')count+=v71RenameDoctorIn(v,depth+1);
 }
 // Teléfono del doctor demo (y de la persona de referencia con el mismo nombre) en el mismo objeto.
 if(renamedHere)for(const key of ['phone','doctorWhatsApp','providerPhone','whatsapp','telefono']){if(typeof node[key]==='string'&&v71IsOldDoctorPhone(node[key])){node[key]=/^\d+$/.test(node[key])?V71_DOCTOR.phoneDigits:V71_DOCTOR.phone;count++;}}
 if(typeof node.doctorWhatsApp==='string'&&v71IsOldDoctorPhone(node.doctorWhatsApp)&&(v71Norm(node.doctorName).includes('mateo rios demo'))){node.doctorWhatsApp=/^\d+$/.test(node.doctorWhatsApp)?V71_DOCTOR.phoneDigits:V71_DOCTOR.phone;count++;}
 return count;
}
function v71MigrateDoctor(){
 if(typeof db==='undefined'||!db||!Array.isArray(db.patients))return 0;
 if(db.v71&&db.v71.doctorMigrated)return 0;
 let count=0;
 for(const p of db.patients){if(p&&(p.application||p.offer||p.references))count+=v71RenameDoctorIn({application:p.application,offer:p.offer,references:p.references,patient:p.patient},0);}
 if(Array.isArray(db.providers))count+=v71RenameDoctorIn(db.providers,0);
 db.v71=Object.assign(db.v71||{migratedOn:v71AccrualDate(),version:1},{doctorMigrated:true});
 if(typeof carteraResave==='function')carteraResave();
 return count;
}
// v71.1: APP-PUL-1001 traía un campo duplicado en la semilla («Dra. Laura Méndez», 55 1000 2000) que ganaba al nombre
// del doctor ficticio. Migración acotada a ese id: datos guardados con el valor viejo pasan a «Dr. Mateo Ríos Demo» / 55 0000 0003.
// No borra almacenamiento ni toca otros créditos (la doctora demo de otros casos sigue igual).
var V711_1001_OLD={name:'Dra. Laura Méndez',phone:'55 1000 2000'};
function v711Fix1001(p){
 if(!p||p.id!=='APP-PUL-1001')return 0;
 let count=0;const a=p.application||{},full=V71_DOCTOR.full,phone=V71_DOCTOR.phone;
 const swapName=v=>v===V711_1001_OLD.name?(count++,full):v,swapPhone=v=>String(v||'').replace(/\D/g,'')==='5510002000'?(count++,phone):v;
 for(const target of [a,p.offer||{}]){
  for(const key of ['doctorName','providerName','clinicName'])if(key in target)target[key]=swapName(target[key]);
  // El nombre corto de v71 («Mateo Ríos Demo» sin tratamiento) también se muestra completo en el expediente.
  if(target.doctorName===V71_DOCTOR.name){target.doctorName=full;count++;}
  if('doctorWhatsApp' in target){target.doctorWhatsApp=swapPhone(target.doctorWhatsApp);if(target.doctorWhatsApp===V71_DOCTOR.phoneDigits){target.doctorWhatsApp=phone;count++;}}
  for(const map of ['procedureProviderAssignments'])if(target[map]&&typeof target[map]==='object')for(const k of Object.keys(target[map]))target[map][k]=swapName(target[map][k]);
  if(target.procedureProviderContacts&&typeof target.procedureProviderContacts==='object')for(const k of Object.keys(target.procedureProviderContacts))target.procedureProviderContacts[k]=swapPhone(target.procedureProviderContacts[k]);
  for(const list of ['providerDispersions','procedureProviders'])if(Array.isArray(target[list]))target[list].forEach(row=>{if(row&&typeof row==='object'){if('provider' in row)row.provider=swapName(row.provider);if('providerName' in row)row.providerName=swapName(row.providerName);}});
 }
 return count;
}
function v711Migrate1001(){
 if(typeof db==='undefined'||!db||!Array.isArray(db.patients))return 0;
 if(db.v71&&db.v71.doctor1001Migrated)return 0;
 let count=0;for(const p of db.patients)count+=v711Fix1001(p);
 db.v71=Object.assign(db.v71||{migratedOn:v71AccrualDate(),version:1},{doctor1001Migrated:true});
 if(typeof carteraResave==='function')carteraResave();
 return count;
}

/* ---------- Nota de IVA de apertura: se retira el bloque informativo ---------- */
// Los créditos históricos conservan su comisión registrada; solo se quita el aviso «requiere revisión fiscal».
// Una inconsistencia real (financialTermsReviewPending) sigue mostrándose y bloqueando cobros.
if(typeof openingFeeTaxNotice==='function'&&!openingFeeTaxNotice.__v71){
 const v71OriginalOpeningFeeTaxNotice=openingFeeTaxNotice;
 openingFeeTaxNotice=function(p){
  try{const b=normalizeFinancialBreakdown(p);if(!b.financialTermsReviewPending&&b.openingFeeTaxReviewPending)return '';}catch(error){}
  return v71OriginalOpeningFeeTaxNotice.apply(this,arguments);
 };
 openingFeeTaxNotice.__v71=true;
}

/* ---------- Extensión: herramienta única; la prórroga por cuota queda como historial ---------- */
if(typeof dispersionExtensionSectionHtml==='function'&&!dispersionExtensionSectionHtml.__v71){
 const v71OriginalExtensionSection=dispersionExtensionSectionHtml;
 dispersionExtensionSectionHtml=function(p,row){
  try{if(typeof dispersionIsExtensionActiveRow==='function'&&dispersionIsExtensionActiveRow(row))return v71OriginalExtensionSection.apply(this,arguments);}catch(error){}
  const id=v71Esc(p&&p.id||'');
  return `<section class="amortization-manage-section v71-extension-note" data-v71-extension><h4>Extensión</h4><div class="extension-manage-card"><div class="extension-manage-note">La prórroga por cuota se retiró. Usa la extensión: «Corta, 30 días» (recomendada) o «Al final». Máximo 3 por crédito y nunca en mora. Las prórrogas anteriores siguen visibles en su cuota.</div><div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" onclick="v71OpenExtension('${id}')">Abrir extensión</button></div></div></section>`;
 };
 dispersionExtensionSectionHtml.__v71=true;
}
function v71OpenExtension(id){if(typeof closeModal==='function')closeModal();if(typeof carteraOpenPayment==='function')return carteraOpenPayment(id,{action:'extension',modality:'CORTA'});return false;}

/* ---------- Condonaciones ---------- */
var V71_FORGIVE_CONCEPTS={
 moratory:{label:'Moratorios (con su IVA)',parts:[['moratory','moratoryPaid','moratoryPending','interesMora'],['moratoryIva','ivaMoratorioPaid','ivaMoratorioPending','ivaMora']]},
 commission:{label:'Comisiones',parts:[['commission','commissionPaid','commissionPending']]},
 interest:{label:'Interés ordinario (con su IVA) · solo Administración',parts:[['interest','interestPaid','interestPending'],['interestIva','ivaInteresPaid','ivaInteresPending']]}
};
function v71StaffApi(){return typeof PulzzoStaffAccess!=='undefined'?PulzzoStaffAccess:(typeof window!=='undefined'?window.PulzzoStaffAccess:null);}
function v71PartPending(row,part){return Math.max(v71Round(v71Num(row[part[0]])-v71Num(row[part[1]])),0);}
function v71ForgivableRows(p){return (p&&Array.isArray(p.paymentSchedule)?p.paymentSchedule:[]).filter(row=>row&&!v71RowClosed(row));}
function v71ForgivenessPending(p,concept){const def=V71_FORGIVE_CONCEPTS[concept];if(!def)return 0;return v71Round(v71ForgivableRows(p).reduce((sum,row)=>sum+def.parts.reduce((s,part)=>s+v71PartPending(row,part),0),0));}
function v71ForgivenessGate(amount,concept){
 if(concept==='capital')return {allowed:false,escalateTo:null,reason:'El capital nunca se condona.'};
 const api=v71StaffApi();
 if(api&&typeof api.checkForgivenessApproval==='function'&&typeof session!=='undefined'){try{return api.checkForgivenessApproval(session,{amount,concept});}catch(error){return {allowed:false,escalateTo:null,reason:error.message||'No se pudo validar la condonación.'};}}
 const roles=typeof session!=='undefined'&&session&&session.roles||[];
 return roles.includes('admin')?{allowed:true,level:'admin'}:{allowed:false,escalateTo:'admin',reason:'La condonación requiere autorización de Administración.'};
}
function v71Actor(){return typeof session!=='undefined'&&session&&(session.email||session.name)||'demo';}
function v71Log(p,action,comment){
 (p.timeline||(p.timeline=[])).unshift({action,at:new Date().toISOString(),comment,entity:p.id,user:v71Actor()});
 try{if(typeof addAudit==='function')addAudit(action,p.id,comment,'patient');}catch(error){}
}
function v71EscalateForgiveness(p,input){
 if(!p)return null;const app=p.application||(p.application={});
 const request={id:'V71-CON-'+Date.now().toString(36)+'-'+((app.v71ForgivenessRequests||[]).length+1),concept:input.concept,amount:v71Round(input.amount),reason:String(input.reason||'').slice(0,300),rowId:input.rowId||'',source:input.source||'condonacion',status:'pendiente_admin',requestedBy:v71Actor(),requestedAt:new Date().toISOString()};
 (app.v71ForgivenessRequests||(app.v71ForgivenessRequests=[])).push(request);
 v71Log(p,'Condonación escalada a Administración',(V71_FORGIVE_CONCEPTS[request.concept]?.label||request.concept)+' por '+v71Money(request.amount)+'. Supera el tope del gerente o requiere Administración.');
 if(typeof carteraResave==='function')carteraResave();
 return request;
}
function v71ApplyForgiveness(id,input={}){
 const p=(typeof db!=='undefined'&&db&&db.patients||[]).find(item=>item&&item.id===id);if(!p)return {ok:false,error:'No se encontró el crédito.'};
 try{if(typeof can==='function'&&!can('manageCollections'))return {ok:false,error:'Sin permiso para gestionar cobranza.'};}catch(error){return {ok:false,error:'Sin permiso para gestionar cobranza.'};}
 const concept=String(input.concept||'');
 if(concept==='capital')return {ok:false,error:'El capital nunca se condona.'};
 const def=V71_FORGIVE_CONCEPTS[concept];if(!def)return {ok:false,error:'Elige moratorios, comisiones o interés ordinario.'};
 const amount=v71Round(Number(input.amount));if(!(amount>0))return {ok:false,error:'Captura un monto válido.'};
 const reason=String(input.reason||'').trim();if(!reason)return {ok:false,error:'Indica el motivo de la condonación.'};
 const app=p.application||(p.application={});
 let request=null;
 if(input.requestId){request=(app.v71ForgivenessRequests||[]).find(r=>r.id===input.requestId&&r.status==='pendiente_admin');if(!request)return {ok:false,error:'La solicitud ya no está pendiente.'};}
 if(typeof v71AccrueCredit==='function'){try{v71AccrueCredit(p);}catch(error){}}
 const available=v71ForgivenessPending(p,concept);
 if(amount>available+0.001)return {ok:false,error:'El monto supera lo pendiente de '+def.label.toLowerCase()+' ('+v71Money(available)+').'};
 const gate=v71ForgivenessGate(amount,concept);
 if(!gate.allowed){
  if(gate.escalateTo==='admin'&&!request){const escalated=v71EscalateForgiveness(p,{concept,amount,reason});return {ok:false,escalated:true,requestId:escalated&&escalated.id,error:(gate.reason||'Requiere Administración.')+' Solicitud enviada a Administración.'};}
  return {ok:false,error:gate.reason||'Sin autorización para condonar.'};
 }
 const capitalBefore=(p.paymentSchedule||[]).map(row=>v71Num(row.capital));
 let left=amount;const applied=[];
 for(const row of v71ForgivableRows(p)){
  if(left<=0.004)break;
  const pend=def.parts.map(part=>v71PartPending(row,part)),rowTotal=v71Round(pend.reduce((a,b)=>a+b,0));if(rowTotal<=0)continue;
  const take=Math.min(left,rowTotal);let assigned=0;const cuts=[];
  def.parts.forEach((part,i)=>{const cut=i===def.parts.length-1?v71Round(Math.min(take-assigned,pend[i])):v71Round(take*pend[i]/rowTotal);assigned=v71Round(assigned+cut);cuts.push(cut);row[part[0]]=v71Round(v71Num(row[part[0]])-cut);if(part[3])row[part[3]]=row[part[0]];});
  row.totalPayment=v71Round(v71Num(row.totalPayment)-take);
  (row.v71Condonations||(row.v71Condonations=[])).push({concept,amount:v71Round(take),at:new Date().toISOString(),by:v71Actor()});
  if(typeof dispersionRecalculateRowTotals==='function')dispersionRecalculateRowTotals(row);
  applied.push({rowId:row.id,number:row.number,amount:v71Round(take)});left=v71Round(left-take);
 }
 if((p.paymentSchedule||[]).some((row,i)=>v71Num(row.capital)!==capitalBefore[i]))return {ok:false,error:'La condonación intentó modificar capital.'};
 const entry={id:'V71-CONDONACION-'+((app.v71Forgiveness||[]).length+1),concept,amount,reason,rows:applied,at:new Date().toISOString(),by:v71Actor(),level:gate.level||'',requestId:request&&request.id||''};
 (app.v71Forgiveness||(app.v71Forgiveness=[])).push(entry);
 if(request){request.status='aprobada';request.approvedBy=v71Actor();request.approvedAt=entry.at;}
 v71Log(p,'Condonación aplicada',def.label+' por '+v71Money(amount)+(request?' (solicitud '+request.id+' aprobada por Administración)':'')+'. Motivo: '+reason+'. Capital intacto.');
 if(typeof carteraResave==='function')carteraResave();
 return {ok:true,amount,concept,rows:applied,entry};
}
function v71RejectForgiveness(id,requestId){
 const p=(db.patients||[]).find(item=>item.id===id);if(!p)return {ok:false,error:'No se encontró el crédito.'};
 const roles=typeof session!=='undefined'&&session&&session.roles||[];if(!roles.includes('admin'))return {ok:false,error:'Solo Administración resuelve solicitudes escaladas.'};
 const r=(p.application&&p.application.v71ForgivenessRequests||[]).find(x=>x.id===requestId&&x.status==='pendiente_admin');if(!r)return {ok:false,error:'La solicitud ya no está pendiente.'};
 r.status='rechazada';r.resolvedBy=v71Actor();r.resolvedAt=new Date().toISOString();
 v71Log(p,'Condonación rechazada por Administración',(V71_FORGIVE_CONCEPTS[r.concept]?.label||r.concept)+' por '+v71Money(r.amount)+'.');
 if(typeof carteraResave==='function')carteraResave();return {ok:true};
}
var v71ForgivenessDraft={concept:'moratory'};
function v71ChooseForgiveness(concept){v71ForgivenessDraft.concept=concept;document.querySelectorAll('[data-v71-forgive]').forEach(b=>b.setAttribute('aria-pressed',String(b.getAttribute('data-v71-forgive')===concept)));const input=document.getElementById('v71CondonacionMonto');if(input&&!input.value)input.placeholder='Hasta '+v71Money(v71ForgivenessPending((db.patients||[]).find(p=>p.id===v71ForgivenessDraft.id),concept));}
function v71CapText(){const api=v71StaffApi();const roles=typeof session!=='undefined'&&session&&session.roles||[];if(roles.includes('admin'))return 'Administración: sin tope.';let cap=2000;try{cap=api.getForgivenessLimits(session).leader;}catch(error){}return roles.includes('leader')?'Tu tope como gerente: '+v71Money(cap)+'. Arriba del tope se envía a Administración.':'Tu rol no condona; la solicitud se envía a Administración.';}
function v71OpenForgiveness(id){
 if(typeof carteraCollectionsWriteDenied==='function'&&carteraCollectionsWriteDenied())return false;
 const p=(db.patients||[]).find(item=>item.id===id);if(!p)return false;
 try{v71AccrueCredit(p);}catch(error){}
 v71ForgivenessDraft={concept:'moratory',id};
 const isAdmin=(typeof session!=='undefined'&&session&&session.roles||[]).includes('admin');
 const pend=k=>v71Money(v71ForgivenessPending(p,k));
 const requests=(p.application&&p.application.v71ForgivenessRequests||[]).filter(r=>r.status==='pendiente_admin');
 const reqHtml=requests.length?`<div class="v71-requests"><h4>Solicitudes escaladas a Administración</h4><ul>${requests.map(r=>`<li><span>${v71Esc(V71_FORGIVE_CONCEPTS[r.concept]?.label||r.concept)} · ${v71Esc(v71Money(r.amount))} · ${v71Esc(r.requestedBy)} · ${v71Esc(v71Dmy(r.requestedAt))}${r.reason?' · '+v71Esc(r.reason):''}</span>${isAdmin?`<span class="v71-request-actions"><button type="button" class="btn btn-primary btn-sm" onclick="v71ApproveForgivenessUi('${v71Esc(id)}','${v71Esc(r.id)}')">Aprobar y aplicar</button><button type="button" class="btn btn-secondary btn-sm" onclick="v71RejectForgivenessUi('${v71Esc(id)}','${v71Esc(r.id)}')">Rechazar</button></span>`:'<span class="pill pill-gray">Pendiente de Administración</span>'}</li>`).join('')}</ul></div>`:'';
 const html=`<div class="modal-head"><div><h3>Condonar cargos</h3><p>${v71Esc(p.patient&&p.patient.fullName||p.id)} · ${v71Esc(p.code||p.id)}</p></div><button class="x" type="button" onclick="closeModal()">×</button></div><div class="modal-body v71-forgive"><dl class="v71-forgive-pending"><div><dt>Moratorios + IVA</dt><dd>${v71Esc(pend('moratory'))}</dd></div><div><dt>Comisiones</dt><dd>${v71Esc(pend('commission'))}</dd></div><div><dt>Interés ordinario + IVA</dt><dd>${v71Esc(pend('interest'))}</dd></div><div><dt>Capital</dt><dd>No se condona</dd></div></dl><div class="cartera-choices cartera-choices-sub" role="group" aria-label="Concepto a condonar"><button type="button" class="cartera-choice" data-v71-forgive="moratory" aria-pressed="true" onclick="v71ChooseForgiveness('moratory')">Moratorios</button><button type="button" class="cartera-choice" data-v71-forgive="commission" aria-pressed="false" onclick="v71ChooseForgiveness('commission')">Comisiones</button><button type="button" class="cartera-choice" data-v71-forgive="interest" aria-pressed="false" onclick="v71ChooseForgiveness('interest')"${isAdmin?'':' disabled aria-disabled="true" title="Solo Administración"'}>Interés ordinario</button></div><div class="cartera-form cartera-form-stack"><label class="field">Monto a condonar (MXN)<input id="v71CondonacionMonto" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Hasta ${v71Esc(pend('moratory'))}"></label><label class="field">Motivo<input id="v71CondonacionMotivo" type="text" maxlength="300" placeholder="Ej. acuerdo de pago cumplido"></label></div><p class="v71-cap" data-v71-cap>${v71Esc(v71CapText())}</p><p class="cfg-helper">Interés ordinario: solo Administración. KAM: nunca. Capital: nunca. Todo queda en el historial.</p><p id="v71CondonacionEstado" role="status" aria-live="polite"></p>${reqHtml}</div><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Cerrar</button><button type="button" class="btn btn-primary" onclick="v71SubmitForgiveness('${v71Esc(id)}')">Condonar</button></div>`;
 if(typeof modal==='function')modal(html);
 const box=document.getElementById&&document.getElementById('modal');
 // v71: un gerente con manageCollections pero sin otras capacidades de escritura es readonly() para la UI general;
 // la condonación valida sus propios permisos en v71ApplyForgiveness, así que el formulario se muestra sin la máscara de solo lectura.
 try{if(box&&typeof readonly==='function'&&readonly()&&typeof can==='function'&&can('manageCollections')){box.innerHTML=html;if(typeof modalSetupAccessibility==='function')modalSetupAccessibility();}}catch(error){}
 if(box)box.className='modal cartera-agreement-modal v71-forgive-modal';
 return true;
}
function v71ForgivenessFeedback(result){
 const status=document.getElementById('v71CondonacionEstado');
 const text=result.ok?'Condonación aplicada: '+v71Money(result.amount)+'.':result.error;
 if(status){status.textContent=text;status.className=result.ok?'v71-ok':result.escalated?'v71-escalated':'v71-error';}
 if(typeof toast==='function')toast(text);
}
function v71SubmitForgiveness(id){
 const amount=typeof carteraParseAmountInput==='function'?carteraParseAmountInput(document.getElementById('v71CondonacionMonto').value):Number(document.getElementById('v71CondonacionMonto').value);
 const result=v71ApplyForgiveness(id,{concept:v71ForgivenessDraft.concept,amount,reason:document.getElementById('v71CondonacionMotivo').value});
 if(result.ok||result.escalated){v71OpenForgiveness(id);}
 v71ForgivenessFeedback(result);
 if(result.ok||result.escalated){try{if(typeof carteraRefreshSurface==='function')carteraRefreshSurface();}catch(error){}}
 return result;
}
function v71ApproveForgivenessUi(id,requestId){
 const p=(db.patients||[]).find(item=>item.id===id),r=(p&&p.application&&p.application.v71ForgivenessRequests||[]).find(x=>x.id===requestId);
 if(!r)return false;const result=v71ApplyForgiveness(id,{concept:r.concept,amount:r.amount,reason:r.reason||'Solicitud escalada',requestId});
 v71OpenForgiveness(id);v71ForgivenessFeedback(result);return result;
}
function v71RejectForgivenessUi(id,requestId){const result=v71RejectForgiveness(id,requestId);v71OpenForgiveness(id);v71ForgivenessFeedback(result.ok?{ok:false,error:'Solicitud rechazada.'}:result);return result;}
// Configuración › Mora y cobranza: tope del gerente (solo Admin).
function v71ForgivenessCapCard(){
 const api=v71StaffApi();let cap=2000;try{cap=api.getForgivenessLimits(session).leader;}catch(error){}
 const isAdmin=(typeof session!=='undefined'&&session&&session.roles||[]).includes('admin');
 return `<section class="cfg-policy cfg-rules-card v71-cap-card" data-v71-cap-card><div class="cfg-rules-head"><div><h3>Condonaciones</h3><p class="cfg-helper">El gerente condona moratorios y comisiones hasta este tope. Arriba del tope se envía a Administración. Interés ordinario: solo Administración. KAM: nunca. Capital: nunca.</p></div></div><dl class="cfg-current"><div><dt>Tope del gerente por condonación</dt><dd id="v71CapActual">${v71Esc(v71Money(cap))}</dd></div></dl>${isAdmin?`<div class="cartera-form"><label class="field" for="v71CapInput"><span>Nuevo tope (MXN)</span><input id="v71CapInput" type="number" min="0" step="0.01" inputmode="decimal" value="${v71Esc(cap)}"></label><button type="button" class="btn btn-primary btn-sm" onclick="v71SaveForgivenessCap()">Guardar tope</button></div><p id="v71CapEstado" role="status" aria-live="polite"></p>`:'<p class="pill pill-gray">Solo consulta</p>'}</section>`;
}
function v71SaveForgivenessCap(){
 const api=v71StaffApi(),input=document.getElementById('v71CapInput'),status=document.getElementById('v71CapEstado');
 const value=typeof carteraParseAmountInput==='function'?carteraParseAmountInput(input&&input.value):Number(input&&input.value);
 try{const next=api.setForgivenessLimits(session,{leader:Number(value)});const text='Tope guardado: '+v71Money(next.leader)+'. Queda en el historial.';if(status)status.textContent=text;const cur=document.getElementById('v71CapActual');if(cur)cur.textContent=v71Money(next.leader);if(typeof toast==='function')toast(text);return {ok:true,leader:next.leader};}
 catch(error){if(status)status.textContent=error.message;if(typeof toast==='function')toast(error.message);return {ok:false,error:error.message};}
}

/* ---------- Portal del paciente: datos de la extensión y del adelanto (solo lectura) ---------- */
function v71ExtensionOptions(p){
 const rules=v71Rules(p,v71AccrualDate()),max=Number(rules.preventiveExtensionMax)||3,used=typeof carteraExtensionCount==='function'?carteraExtensionCount(p):(p.application&&p.application.preventiveExtensions||[]).length;
 const options=[];
 for(const modality of ['CORTA','COLA_FINAL']){
  let preview=null;try{preview=carteraPreviewExtension(p,{modality});}catch(error){preview={ok:false,error:error.message};}
  // v71.1: «Recomendada» solo si la opción está disponible (después de una Corta solo queda «Al final»).
  if(!preview||!preview.ok){options.push({modality,label:modality==='CORTA'?'Corta, 30 días':'Al final',recommended:false,available:false,code:String(preview&&preview.code||''),reason:String(preview&&preview.error||'No disponible')});continue;}
  const a=preview.audit||{};let nextAmount=null;
  if(modality==='CORTA'){if(typeof a.nextAmountAfter==='number')nextAmount=v71Round(a.nextAmountAfter);else{const next=(p.paymentSchedule||[]).find(row=>row.id===a.nextRowId);if(next)nextAmount=v71Round(Math.max(v71Num(next.pendingAmount,v71Num(next.totalPayment)),0)+v71Num(preview.capitalDeferred));}}
  // v71.1: datos para explicar la opción en español sencillo (última cuota, cuotas recalculadas, interés que sigue en su fecha).
  const insoluto=!!preview.insoluto,plan=preview.insolutoPlan||null;
  options.push({modality,label:modality==='CORTA'?'Corta, 30 días':'Al final',recommended:modality==='CORTA',available:true,base:insoluto?'insoluto':'global',lastCuota:!!preview.lastCuota,amountToday:v71Round(preview.total),originalDue:preview.originalDue||'',extendedDue:preview.extendedDue||'',nextDue:a.nextDue||'',nextAmount,nextExtra:v71Round(v71Num(a.nextExtraInterest)+v71Num(a.nextExtraIva)),lastDue:a.lastDue||(preview.newCuota&&preview.newCuota.dueDate)||'',lastAmount:typeof a.lastAmountAfter==='number'?v71Round(a.lastAmountAfter):(preview.newCuota?v71Round(preview.newCuota.payment):null),regularPayment:plan&&typeof plan.regularPayment==='number'?v71Round(plan.regularPayment):null,interestStillDue:insoluto&&modality!=='CORTA'?v71Round(v71Num(a.originalInterest)+v71Num(a.originalInterestIva)):0,capitalDeferred:v71Round(preview.capitalDeferred||0),fee:v71Round(preview.fee||0),feeVat:v71Round(preview.feeVat||0)});
 }
 return {used,max,options};
}
function v71PortalData(p){
 const out={version:V71_VERSION,moratorioLabel:v71MoraLabel(p),extension:null,advance:null,receipts:[]};
 try{out.extension=v71ExtensionOptions(p);}catch(error){}
 try{if(typeof carteraAdvanceTarget==='function'){const row=carteraAdvanceTarget(p,typeof dispersionBusinessDateMX==='function'?dispersionBusinessDateMX():v71AccrualDate());if(row)out.advance={number:Number(row.number)||0,dueDate:v71RowDue(row),pending:v71Round(Math.max(v71Num(row.pendingAmount),0))};}}catch(error){}
 const receipts=(p.application&&Array.isArray(p.application.carteraReceipts)?p.application.carteraReceipts:Array.isArray(p.carteraReceipts)?p.carteraReceipts:[]);
 const titles={extension:'Recibo de extensión',anticipo:'Recibo de cuota por adelantado',reestructura:'Comprobante de reestructura',prepago:'Recibo de prepago',liquidacion:'Recibo de liquidación',pago:'Recibo de pago'};
 out.receipts=receipts.slice(-8).reverse().map(r=>({folio:String(r.folio||r.id||''),date:v71Date(r.date||r.appliedAt||r.at),title:String(titles[r.action]||r.title||'Recibo'),detail:r.action==='extension'&&r.extensionDetail&&/corta-30-v1$/.test(String(r.extensionDetail.rule||''))?'Corta, 30 días':'',amount:v71Round(v71Num(r.amount||r.total))})).filter(r=>r.folio||r.amount);
 return out;
}
function v71WrapProjection(){
 const office=typeof window!=='undefined'&&window.PulzzoServicingOffice;
 if(!office||typeof office.patientProjection!=='function'||office.patientProjection.__v71)return false;
 const original=office.patientProjection;
 const wrapped=function(record){const projection=original.apply(this,arguments);try{const p=(db.patients||[]).find(item=>item.id===(record&&record.id||record));if(p&&projection)projection.v71=v71PortalData(JSON.parse(JSON.stringify(p)));}catch(error){}return projection;};
 wrapped.__v71=true;office.patientProjection=wrapped;return true;
}

/* ---------- Etiqueta del moratorio en Aplicar pago ---------- */
function v71WrapOpenPayment(){
 if(typeof carteraOpenPayment!=='function'||carteraOpenPayment.__v71)return;
 const original=carteraOpenPayment;
 carteraOpenPayment=function(id){
  try{const p=(db.patients||[]).find(item=>item&&item.id===id);if(p){const r=v71AccrueCredit(p);if(r.changed&&typeof carteraResave==='function')carteraResave();}}catch(error){}
  const result=original.apply(this,arguments);
  try{const p=(db.patients||[]).find(item=>item&&item.id===id);const body=document.querySelector&&document.querySelector('#modal .modal-body');if(p&&body&&body.insertAdjacentHTML&&!(body.querySelector&&body.querySelector('[data-v71-mora]')))body.insertAdjacentHTML('afterbegin',`<p class="cfg-helper v71-mora-label" data-v71-mora>${v71Esc(v71MoraLabel(p))} · se calcula por día sobre el capital vencido (días/360), sin interés sobre interés.</p>`);}catch(error){}
  return result;
 };
 carteraOpenPayment.__v71=true;
}

/* ---------- Estilos v71 (reutilizan tokens y componentes existentes) ---------- */
function v71InjectStyles(){
 if(typeof document==='undefined'||!document.head||!document.createElement||document.getElementById&&document.getElementById('v71-styles'))return;
 const style=document.createElement('style');style.id='v71-styles';
 style.textContent='.financial-breakdown-note:empty{display:none}.cfg-legacy{margin:0 0 14px;border:1px dashed var(--line,#d9dde3);border-radius:12px;padding:8px 12px;background:var(--surface-2,#fafbfc)}.cfg-legacy>summary{cursor:pointer;font-weight:600;color:var(--muted,#5b6472)}.v71-forgive-pending{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:0 0 12px}.v71-forgive-pending div{border:1px solid var(--line,#d9dde3);border-radius:10px;padding:8px 10px}.v71-forgive-pending dt{font-size:12px;color:var(--muted,#5b6472)}.v71-forgive-pending dd{margin:2px 0 0;font-weight:700}.v71-cap{font-weight:600}.v71-requests ul{list-style:none;padding:0;margin:6px 0;display:grid;gap:6px}.v71-requests li{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;border:1px solid var(--line,#d9dde3);border-radius:10px;padding:8px 10px}.v71-request-actions{display:flex;gap:6px}.v71-escalated{color:var(--warning,#9a6700);font-weight:600}.v71-error{color:var(--danger,#b42318);font-weight:600}.v71-ok{color:var(--success,#1a7f37);font-weight:600}.v71-cap-card{margin-top:16px}.v71-cap-card .cartera-form{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}';
 document.head.appendChild(style);
}

function v71Boot(){
 try{v71InjectStyles();}catch(error){}
 try{v71MigrateDoctor();}catch(error){}
 try{v711Migrate1001();}catch(error){}
 try{v71AccrueAll();}catch(error){}
 v71WrapProjection();
 v71WrapOpenPayment();
}
v71Boot();
Object.assign(globalThis,{V71_DOCTOR,v71MoraRate,v71MoraLabel,v71MoraQuote,v71AccrueCredit,v71AccrueAll,v71AccrualDate,v71MigrateDoctor,v711Migrate1001,v711Fix1001,v71RenameDoctorIn,v71ForgivenessPending,v71ApplyForgiveness,v71EscalateForgiveness,v71RejectForgiveness,v71OpenForgiveness,v71SubmitForgiveness,v71ChooseForgiveness,v71ApproveForgivenessUi,v71RejectForgivenessUi,v71ForgivenessCapCard,v71SaveForgivenessCap,v71ExtensionOptions,v71PortalData,v71WrapProjection,v71OpenExtension});
}
