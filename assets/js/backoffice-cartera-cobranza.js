/* Cobranza, acuerdos y recibos de cartera. Los envíos son una simulación local. */
(function(){
'use strict';
const CARTERA_COBRANZA_KEY='pulzzo_cartera_cobranza_v1';
const CARTERA_TEMPLATE_IDS=[['precobranza','Precobranza'],['vence_hoy','Vence hoy'],['cobranza_1','Cobranza día 1'],['cobranza_3','Cobranza día 3'],['seguimiento','Seguimiento diario 5 a 30'],['mora_temprana','Mora temprana'],['propuesta','Propuesta de acuerdo'],['confirmacion','Confirmación de acuerdo'],['recordatorio','Recordatorio día de acuerdo'],['incumplido','Acuerdo incumplido'],['recibo','Recibo de pago']];
const CARTERA_DAY_DEFAULTS={precobranza:3,day1:1,day3:3,dailyFrom:5,dailyTo:30,earlyFrom:31,earlyTo:60,restructureFrom:61,restructureTo:90,externalFrom:91};
function carteraToday(){return typeof portfolioToday==='function'?portfolioToday():typeof dispersionBusinessDateMX==='function'?dispersionBusinessDateMX():new Date().toISOString().slice(0,10);}
function carteraAddDays(date,days){if(typeof portfolioDatePlus==='function')return portfolioDatePlus(date,days);const stamp=new Date(String(date).slice(0,10)+'T12:00:00Z');stamp.setUTCDate(stamp.getUTCDate()+Number(days)||0);return stamp.toISOString().slice(0,10);}
function carteraDaySpan(from,to){return Math.round((Date.parse(String(to).slice(0,10)+'T12:00:00Z')-Date.parse(String(from).slice(0,10)+'T12:00:00Z'))/86400000);}
function carteraDefaultTemplates(){
 const sign='Equipo PULZZO';
 const mail=(intro,extra)=>`${intro}\n\nCrédito {credito}\nMonto: {monto}\nFecha: {fecha}\nDías: {dias}\nSaldo: {saldo}\n\n${extra||''}{datos_pago}\n\nSi ya realizaste tu pago, conserva tu comprobante y avísanos para registrarlo. Gracias por tu confianza.\n\n{firma}`.replace('{firma}',sign);
 const wa=(text)=>`${text} Crédito {credito}. Monto {monto}. Fecha {fecha}. Saldo {saldo}. {datos_pago} — ${sign}`;
 return {
  precobranza_subject:'Tu pago Pulzzo vence pronto',
  precobranza_email:mail('Hola {cliente}, te escribimos con anticipación para que tu pago no se pase de la fecha.','Tu mensualidad está por vencer. '),
  precobranza_whatsapp:wa('Hola {cliente}, soy del Equipo PULZZO. Tu pago vence en {dias} días.'),
  vence_hoy_subject:'Hoy vence tu pago Pulzzo',
  vence_hoy_email:mail('Hola {cliente}, hoy es la fecha de tu pago. Queremos ayudarte a dejarlo listo.','Puedes cubrirlo hoy para mantener tu crédito al corriente. '),
  vence_hoy_whatsapp:wa('Hola {cliente}, hoy vence tu pago de Pulzzo.'),
  cobranza_1_subject:'Tu pago Pulzzo venció ayer',
  cobranza_1_email:mail('Hola {cliente}, tu pago tiene 1 día de atraso. Lo podemos regularizar hoy.','El saldo ya incluye los conceptos pendientes. '),
  cobranza_1_whatsapp:wa('Hola {cliente}, tu pago Pulzzo tiene {dias} día de atraso. Te ayudamos a regularizarlo.'),
  cobranza_3_subject:'Tu crédito Pulzzo sigue pendiente',
  cobranza_3_email:mail('Hola {cliente}, tu pago lleva {dias} días de atraso. Conviene cubrirlo para evitar que el saldo siga creciendo.','Estamos disponibles para orientarte. '),
  cobranza_3_whatsapp:wa('Hola {cliente}, tu crédito Pulzzo lleva {dias} días de atraso.'),
  seguimiento_subject:'Seguimiento de tu saldo Pulzzo',
  seguimiento_email:mail('Hola {cliente}, te compartimos el saldo actualizado de tu crédito. Lleva {dias} días de atraso.','Este seguimiento es diario mientras el atraso esté entre 5 y 30 días. '),
  seguimiento_whatsapp:wa('Hola {cliente}, tu saldo Pulzzo actualizado es {saldo}. Llevas {dias} días de atraso.'),
  mora_temprana_subject:'Podemos buscar un acuerdo para tu crédito Pulzzo',
  mora_temprana_email:mail('Hola {cliente}, tu crédito está en mora temprana. Un ejecutivo puede revisar contigo un acuerdo de pago.','Este mensaje no se envía solo: lo prepara el equipo de cobranza. '),
  mora_temprana_whatsapp:wa('Hola {cliente}, tu crédito Pulzzo está en mora temprana. Podemos revisar un acuerdo. Llevas {dias} días.'),
  propuesta_subject:'Propuesta de acuerdo Pulzzo',
  propuesta_email:mail('Hola {cliente}, te proponemos un acuerdo de pago para el crédito {credito}.','La propuesta no condona capital ni interés ordinario. '),
  propuesta_whatsapp:wa('Hola {cliente}, te proponemos un acuerdo de pago Pulzzo por {monto} para el {fecha}.'),
  confirmacion_subject:'Confirmamos tu acuerdo Pulzzo',
  confirmacion_email:mail('Hola {cliente}, confirmamos tu acuerdo de pago.','Fecha de compromiso: {fecha}. Monto comprometido: {monto}. '),
  confirmacion_whatsapp:wa('Hola {cliente}, confirmamos tu acuerdo Pulzzo: {monto} el {fecha}.'),
  recordatorio_subject:'Hoy es el día de tu acuerdo Pulzzo',
  recordatorio_email:mail('Hola {cliente}, hoy es la fecha que acordamos para tu pago.','El monto comprometido es {monto}. '),
  recordatorio_whatsapp:wa('Hola {cliente}, hoy es el día de tu acuerdo Pulzzo por {monto}.'),
  incumplido_subject:'Tu acuerdo Pulzzo no se cumplió',
  incumplido_email:mail('Hola {cliente}, la fecha de tu acuerdo ya pasó y el monto comprometido no se registró.','La cobranza se reactiva con los días de atraso reales. '),
  incumplido_whatsapp:wa('Hola {cliente}, el acuerdo Pulzzo del {fecha} no se cumplió. Tu atraso real es de {dias} días.'),
  recibo_subject:'Recibo de tu operación Pulzzo',
  recibo_email:mail('Hola {cliente}, registramos tu operación y adjuntamos el recibo de esta demo.','No se envió un correo real. El registro queda como Enviado (demo). '),
  recibo_whatsapp:wa('Hola {cliente}, registramos tu operación Pulzzo por {monto}. Tu recibo queda en el expediente.')
 };
}
function carteraCobranzaRead(){
 const defaults={schema:1,days:{...CARTERA_DAY_DEFAULTS},paymentData:'Datos de pago · pendiente',templates:carteraDefaultTemplates()};
 try{
  const raw=localStorage.getItem(CARTERA_COBRANZA_KEY);
  if(!raw)return defaults;
  const parsed=JSON.parse(raw);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return defaults;
  return {schema:1,days:{...CARTERA_DAY_DEFAULTS,...(parsed.days||{})},paymentData:String(parsed.paymentData||defaults.paymentData),templates:{...defaults.templates,...(parsed.templates||{})}};
 }catch(error){return defaults;}
}
function carteraCobranzaWrite(next){
 const current=carteraCobranzaRead();
 const stored={schema:1,days:{...current.days,...(next.days||{})},paymentData:String(next.paymentData||current.paymentData),templates:{...current.templates,...(next.templates||{})}};
 localStorage.setItem(CARTERA_COBRANZA_KEY,JSON.stringify(stored));
 return stored;
}
function carteraTemplate(id,part){const key=part==='subject'?id+'_subject':part==='whatsapp'?id+'_whatsapp':id+'_email';return carteraCobranzaRead().templates[key]||'';}
function carteraFill(text,vars){return String(text||'').replace(/\{(cliente|monto|fecha|credito|dias|saldo|datos_pago|firma)\}/g,(full,key)=>Object.prototype.hasOwnProperty.call(vars,key)?String(vars[key]):full);}
function carteraVars(p,extra){
 const patient=p&&p.patient||{};
 const rules=carteraCobranzaRead();
 const facts=p&&p.installments?carteraCreditFacts(p):p?carteraFactsForPatient(p):{dpd:0,amount:0,due:'',balance:0};
 return Object.assign({cliente:patient.fullName||p&&p.name||'Cliente',monto:typeof fmtMoney==='function'?fmtMoney(extra&&extra.amount||facts.amount||0):String(extra&&extra.amount||facts.amount||0),fecha:extra&&extra.fecha||facts.due||carteraToday(),credito:p&&(p.code||(typeof dispersionApplicationCode==='function'?dispersionApplicationCode(p):p.id))||'',dias:String(extra&&extra.dias!=null?extra.dias:facts.dpd||0),saldo:typeof fmtMoney==='function'?fmtMoney(extra&&extra.saldo!=null?extra.saldo:facts.balance||0):String(facts.balance||0),datos_pago:rules.paymentData||'Datos de pago · pendiente',firma:'Equipo PULZZO'},extra||{});
}
function carteraCreditFacts(credit,today){
 today=today||carteraToday();
 const open=(credit.installments||[]).filter(row=>row&&row.pending>0&&row.date).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
 const overdue=open.filter(row=>row.date<today);
 const upcoming=open.filter(row=>row.date>=today);
 const oldest=overdue[0]||null;
 const next=upcoming[0]||null;
 const dpd=oldest?Math.max(carteraDaySpan(oldest.date,today),0):0;
 const amount=roundToCents((overdue.length?overdue:next?[next]:[]).reduce((sum,row)=>sum+dispersionNumber(row.pending,0),0));
 const balance=roundToCents(dispersionNumber(credit.outstanding,open.reduce((sum,row)=>sum+dispersionNumber(row.pending,0),0)));
 return {today,open,overdue,oldest,next,dpd,amount,balance,due:oldest?oldest.date:next?next.date:''};
}
function carteraFactsForPatient(p,today){
 const rows=typeof dispersionBuildSchedule==='function'?dispersionBuildSchedule(p):[];
 const installments=rows.map(row=>({id:row.id,date:String(row.currentDueDate||row.dueDate||'').slice(0,10),pending:typeof portfolioPending==='function'?portfolioPending(row):dispersionNumber(row.pendingAmount,0),original:String(row.originalDueDate||row.dueDate||'').slice(0,10),row}));
 const outstanding=installments.reduce((sum,row)=>sum+dispersionNumber(row.pending,0),0);
 return carteraCreditFacts({installments,outstanding,record:p,id:p.id,code:typeof dispersionApplicationCode==='function'?dispersionApplicationCode(p):p.id,name:p.patient&&p.patient.fullName||''},today||carteraToday());
}
function carteraAgreementEvents(p){return ((p.application||{}).carteraAgreements)||[];}
function carteraAgreementCovered(p,agreement){
 const paid=(p.payments||[]).filter(item=>item&&item.paymentType!=='reversal'&&String(item.date||item.createdAt||'').slice(0,10)>=agreement.agreementDate&&String(item.date||item.createdAt||'').slice(0,10)<=agreement.compromiseDate).reduce((sum,item)=>sum+dispersionNumber(item.amountReceived!=null?item.amountReceived:item.amount,0),0);
 return roundToCents(paid)+0.009>=roundToCents(Number(agreement.amount)||0)&&roundToCents(Number(agreement.amount)||0)>0;
}
function carteraDeriveAgreement(p,today){
 today=today||carteraToday();
 const created=carteraAgreementEvents(p).filter(item=>item&&item.type==='created');
 if(!created.length)return null;
 const base=created[created.length-1];
 const updates=carteraAgreementEvents(p).filter(item=>item&&item.type==='status'&&item.agreementId===base.id);
 const explicit=updates.length?updates[updates.length-1].status:'';
 const forgivenessPending=!!(base.forgiveness&&base.forgiveness!=='none'&&!updates.some(item=>item.forgivenessApplied));
 if(explicit==='cumplido'||explicit==='incumplido')return Object.assign({},base,{status:explicit,forgivenessPending:false,originalDue:base.originalDue});
 let status='vigente';
 if(carteraAgreementCovered(p,base))status='cumplido';
 else if(base.compromiseDate<today)status='incumplido';
 else if(base.compromiseDate===today)status='vence_hoy';
 return Object.assign({},base,{status,forgivenessPending,originalDue:base.originalDue});
}
function carteraAgreementLabel(agreement){
 if(!agreement)return 'Sin acuerdo';
 if(agreement.status==='cumplido')return 'Cumplido';
 if(agreement.status==='incumplido')return 'Incumplido';
 if(agreement.status==='vence_hoy')return agreement.forgivenessPending?'Vence hoy · Aplicar condonación':'Vence hoy';
 if(agreement.forgivenessPending)return 'Aplicar condonación';
 return 'Vigente';
}
function carteraCollectionStage(input,today){
 today=today||carteraToday();
 const patient=input&&input.record?input.record:input&&input.application?input:null;
 const facts=input&&input.installments?carteraCreditFacts(input,today):input&&input.dpd!=null&&!input.application?input:carteraFactsForPatient(patient||input,today);
 const rules=carteraCobranzaRead().days;
 const agreement=patient&&patient.application?carteraDeriveAgreement(patient,today):credit&&credit.agreement||null;
 if(agreement&&agreement.status!=='incumplido'&&agreement.status!=='cumplido'){
  if(agreement.status==='vence_hoy')return {id:'acuerdo_hoy',label:'Recordatorio día de acuerdo',template:'recordatorio',automatic:true,pause:false,due:agreement.compromiseDate,dpd:facts.dpd,amount:agreement.amount,channel:true};
  return {id:'acuerdo_vigente',label:carteraAgreementLabel(agreement),template:'',automatic:false,pause:true,due:agreement.compromiseDate,dpd:facts.dpd,amount:agreement.amount,channel:false};
 }
 const dpd=facts.dpd||0;
 const until=facts.next&&facts.next.date>=today?carteraDaySpan(today,facts.next.date):null;
 let stage;
 if(dpd>=rules.externalFrom)stage={id:'candidato_externa',label:'Candidato a cobranza externa / venta de cartera',automatic:false,flag:true,channel:false};
 else if(dpd>=rules.restructureFrom&&dpd<=rules.restructureTo)stage={id:'candidato_reestructura',label:'Candidato a reestructura',automatic:false,flag:true,channel:false};
 else if(dpd>=rules.earlyFrom&&dpd<=rules.earlyTo)stage={id:'mora_temprana',label:'Mora temprana',template:'mora_temprana',automatic:false,manual:true,channel:true};
 else if(dpd>=rules.dailyFrom&&dpd<=rules.dailyTo)stage={id:'seguimiento',label:'Seguimiento diario',template:'seguimiento',automatic:true,daily:true,channel:true};
 else if(dpd===Number(rules.day3))stage={id:'cobranza_3',label:'Cobranza día '+rules.day3,template:'cobranza_3',automatic:true,channel:true};
 else if(dpd===Number(rules.day1))stage={id:'cobranza_1',label:'Cobranza día '+rules.day1,template:'cobranza_1',automatic:true,channel:true};
 else if(dpd===0&&facts.next&&facts.next.date===today)stage={id:'vence_hoy',label:'Vence hoy',template:'vence_hoy',automatic:true,channel:true};
 else if(dpd===0&&until===Number(rules.precobranza))stage={id:'precobranza',label:'Precobranza',template:'precobranza',automatic:true,channel:true};
 else if(dpd>0)stage={id:'seguimiento',label:'Seguimiento',template:'seguimiento',automatic:false,daily:true,channel:true};
 else stage={id:'al_corriente',label:'Al corriente',automatic:false,channel:false};
 return Object.assign({due:facts.due,dpd,amount:facts.amount,pause:false},stage);
}
function carteraMessageKey(creditId,stage,due){const day=stage&&stage.daily?carteraToday():'';return [creditId,stage&&stage.id||'',due||'',day].join('|');}
function carteraMessageLog(p){return ((p.application||{}).carteraMessages)||[];}
function carteraMessageSent(p,key){return carteraMessageLog(p).some(item=>item&&item.key===key);}
function carteraRememberMessage(p,entry){
 const app=p.application||(p.application={});
 const list=app.carteraMessages||(app.carteraMessages=[]);
 if(list.some(item=>item&&item.key===entry.key))return {ok:false,duplicate:true,error:'Ya hay un mensaje para este crédito, etapa y vencimiento.'};
 list.push(entry);
 (p.timeline||(p.timeline=[])).unshift({action:entry.action,at:entry.at,createdAt:entry.at,comment:entry.comment,entity:p.id,entityKind:'patient'});
 if(typeof carteraResave==='function')carteraResave();
 return {ok:true,entry};
}
function carteraPhoneDigits(phone){const digits=String(phone||'').replace(/\D/g,'');return digits.length===10?'52'+digits:digits;}
function carteraWhatsappLink(phone,message){return 'https://wa.me/'+carteraPhoneDigits(phone)+'?text='+encodeURIComponent(message||'');}
function carteraStageMessage(p,stage,channel){
 const facts=carteraFactsForPatient(p);
 const dias=stage.id==='precobranza'?carteraCobranzaRead().days.precobranza:stage.dpd;
 const vars=carteraVars(p,{amount:stage.amount||facts.amount||0,fecha:stage.due||facts.due,dias});
 const template=stage.template||'';
 const body=carteraFill(carteraTemplate(template,channel==='whatsapp'?'whatsapp':'email'),vars);
 const subject=carteraFill(carteraTemplate(template,'subject'),vars);
 return {subject,body,vars};
}
function carteraOpenWhatsapp(id){
 const p=(db.patients||[]).find(item=>item.id===id);if(!p)return false;
 const stage=carteraCollectionStage(p);
 if(!stage.channel){if(typeof toast==='function')toast('Esta etapa no envía mensajes. Un administrador decide el siguiente paso.');return false;}
 const text=carteraStageMessage(p,stage,'whatsapp');
 const phone=p.patient&&p.patient.phone||'';
 const link=carteraWhatsappLink(phone,text.body);
 if(typeof window!=='undefined'&&window.open)window.open(link,'_blank','noopener');
 const key=carteraMessageKey(p.id,stage,stage.due);
 if(carteraMessageSent(p,key)){if(typeof toast==='function')toast('El enlace se abrió. Este mensaje ya estaba registrado.');return link;}
 if(typeof confirm==='function'&&!confirm('¿Registrar WhatsApp enviado?'))return link;
 return carteraRememberMessage(p,{key,at:new Date().toISOString(),channel:'whatsapp',action:'WhatsApp enviado',comment:stage.label+' · '+stage.due,stage:stage.id,due:stage.due})&&link;
}
function carteraOpenMailPreview(id){
 const p=(db.patients||[]).find(item=>item.id===id);if(!p)return false;
 const stage=carteraCollectionStage(p);
 if(!stage.channel||!stage.template){if(typeof toast==='function')toast('Esta etapa no tiene correo automático.');return false;}
 const text=carteraStageMessage(p,stage,'email');
 const email=p.patient&&p.patient.email||'Sin correo';
 const key=carteraMessageKey(p.id,stage,stage.due);
 const sent=carteraMessageSent(p,key);
 const html=`<div class="modal-head"><div><h3>Correo de cobranza</h3><p>${escapeHtml(stage.label)}</p></div><button class="x" type="button" onclick="closeModal()">×</button></div><div class="modal-body"><div class="cartera-receipt-grid"><div class="field"><span>Para</span><strong>${escapeHtml(email)}</strong></div><div class="field"><span>Asunto</span><strong>${escapeHtml(text.subject)}</strong></div></div><pre class="cartera-fase1">${escapeHtml(text.body)}</pre><p>${sent?'Este mensaje ya quedó registrado.':'El envío es simulado. No sale de este navegador.'}</p></div><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Cerrar</button>${sent?'':'<button type="button" class="btn btn-primary" onclick="carteraLogMail(\''+escapeAttr(p.id)+'\')">Registrar envío demo</button>'}</div>`;
 if(typeof modal==='function'&&carteraCanUseModal())modal(html);
 carteraUiState.mailDraft={id:p.id,key,subject:text.subject,body:text.body,stage:stage.id,due:stage.due,label:stage.label};
 return {to:email,subject:text.subject,body:text.body,sent};
}
function carteraLogMail(id){
 const draft=carteraUiState.mailDraft;if(!draft||draft.id!==id)return false;
 const p=(db.patients||[]).find(item=>item.id===id);if(!p)return false;
 const saved=carteraRememberMessage(p,{key:draft.key,at:new Date().toISOString(),channel:'correo',action:'Enviado (demo)',comment:draft.label+' · '+draft.subject,stage:draft.stage,due:draft.due,subject:draft.subject,body:draft.body});
 if(!saved.ok){if(typeof toast==='function')toast(saved.error||'No se registró el correo.');return false;}
 if(typeof toast==='function')toast('Enviado (demo). No salió ningún correo real.');
 if(typeof closeModal==='function')closeModal();
 if(typeof renderPortfolio==='function'&&typeof currentView!=='undefined'&&currentView==='portfolio')renderPortfolio();
 return true;
}
function carteraAmountApproval(amount){
 const api=typeof PulzzoStaffAccess!=='undefined'?PulzzoStaffAccess:(typeof window!=='undefined'?window.PulzzoStaffAccess:null);
 if(api&&typeof api.checkAmountApproval==='function'&&typeof session!=='undefined'){try{return api.checkAmountApproval(session,{amount});}catch(error){return {allowed:false,reason:error.message||'No se pudo validar la condonación.'};}}
 const roles=session&&session.roles||[];
 if(roles.includes('admin')||roles.includes('leader'))return {allowed:true};
 return {allowed:false,reason:'La condonación requiere un líder o un administrador.'};
}
function carteraMoratoryPending(row){
 if(!row)return 0;
 const mora=Math.max(dispersionNumber(row.moratoryPending,dispersionNumber(row.moratory,0)-dispersionNumber(row.moratoryPaid,0)),0);
 const iva=Math.max(dispersionNumber(row.ivaMoratorioPending,dispersionNumber(row.moratoryIva,0)-dispersionNumber(row.ivaMoratorioPaid,0)),0);
 return roundToCents(mora+iva);
}
function carteraReduceConcept(row,totalKey,paidKey,pendingKey,amount){
 const total=dispersionNumber(row[totalKey],0);
 const pending=Math.max(total-dispersionNumber(row[paidKey],0),0);
 const cut=Math.min(pending,amount);
 row[totalKey]=roundToCents(Math.max(total-cut,0));
 if(pendingKey)row[pendingKey]=roundToCents(Math.max(row[totalKey]-dispersionNumber(row[paidKey],0),0));
 return roundToCents(amount-cut);
}
function carteraApplyForgiveness(id){
 const p=(db.patients||[]).find(item=>item.id===id);if(!p)return {ok:false,error:'No se encontró el crédito.'};
 const agreement=carteraDeriveAgreement(p);
 if(!agreement||!agreement.forgivenessPending)return {ok:false,error:'Este acuerdo no tiene una condonación pendiente.'};
 const rows=dispersionBuildSchedule(p);
 const row=rows.find(item=>item.id===agreement.installmentId)||rows.find(item=>carteraMoratoryPending(item)>0);
 if(!row)return {ok:false,error:'No hay moratorios pendientes en la cuota congelada.'};
 const cap=carteraMoratoryPending(row);
 const interestBefore=dispersionNumber(row.interest,0),capitalBefore=dispersionNumber(row.capital,0);
 let amount=agreement.forgiveness==='moratory_total'?cap:roundToCents(Number(agreement.forgivenessAmount)||0);
 if(!(amount>0))return {ok:false,error:'Indica un monto de condonación.'};
 if(amount>cap+0.001)return {ok:false,error:'La condonación no puede superar los moratorios ni tocar capital o interés ordinario.'};
 const gate=carteraAmountApproval(amount);
 if(!gate.allowed)return {ok:false,error:gate.reason||'La condonación requiere un líder o un administrador.'};
 let left=amount;
 left=carteraReduceConcept(row,'moratory','moratoryPaid','moratoryPending',left);
 left=carteraReduceConcept(row,'moratoryIva','ivaMoratorioPaid','ivaMoratorioPending',left);
 if(left>0.009)return {ok:false,error:'La condonación no puede aplicarse a capital ni a interés ordinario.'};
 row.interesMora=row.moratory;row.ivaMora=row.moratoryIva;
 if(typeof dispersionHydrateConcepts==='function')dispersionHydrateConcepts(row,{});
 if(dispersionNumber(row.interest,0)!==interestBefore||dispersionNumber(row.capital,0)!==capitalBefore)return {ok:false,error:'La condonación intentó modificar capital o interés ordinario.'};
 row.condonacionApplied=roundToCents(amount);
 p.paymentSchedule=rows;
 const app=p.application||(p.application={});
 (app.carteraAgreements||(app.carteraAgreements=[])).push({type:'status',agreementId:agreement.id,status:agreement.status==='incumplido'?'incumplido':'vigente',forgivenessApplied:true,amount,at:new Date().toISOString(),actor:session&&session.email||'demo'});
 (p.timeline||(p.timeline=[])).unshift({action:'Condonación aplicada',at:new Date().toISOString(),comment:'Moratorios condonados '+fmtMoney(amount)+'. Capital e interés ordinario intactos.',entity:p.id});
 if(typeof carteraResave==='function')carteraResave();
 return {ok:true,amount,originalDue:agreement.originalDue};
}
function carteraRegisterAgreement(id,input){
 const p=(db.patients||[]).find(item=>item.id===id);if(!p)return {ok:false,error:'No se encontró el crédito.'};
 input=input||{};
 const agreementDate=String(input.agreementDate||carteraToday()).slice(0,10);
 const compromiseDate=String(input.compromiseDate||'').slice(0,10);
 const amount=roundToCents(Number(input.amount)||0);
 const forgiveness=input.forgiveness==='moratory_total'||input.forgiveness==='fixed'||input.forgiveness==='none'?input.forgiveness:'none';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(agreementDate)||!/^\d{4}-\d{2}-\d{2}$/.test(compromiseDate)||compromiseDate<agreementDate)return {ok:false,error:'Revisa la fecha del acuerdo y la fecha de compromiso.'};
 if(!(amount>0))return {ok:false,error:'Indica el monto comprometido.'};
 const forgivenessAmount=forgiveness==='fixed'?roundToCents(Number(input.forgivenessAmount)||0):0;
 if(forgiveness==='fixed'&&!(forgivenessAmount>0))return {ok:false,error:'Indica el monto fijo de condonación.'};
 if(forgiveness!=='none'){const gate=carteraAmountApproval(forgiveness==='fixed'?forgivenessAmount:Math.max(forgivenessAmount,1));if(!gate.allowed)return {ok:false,error:gate.reason||'La condonación requiere un líder o un administrador.'};}
 const rows=typeof dispersionBuildSchedule==='function'?dispersionBuildSchedule(p):[];
 const row=rows.find(item=>dispersionNumber(item.pendingAmount,0)>0)||rows[0]||{};
 if(forgiveness!=='none'&&forgivenessAmount>carteraMoratoryPending(row)+0.001&&forgiveness==='fixed')return {ok:false,error:'El monto fijo no puede superar los moratorios de la cuota.'};
 const entry={id:'ACU-'+Date.now().toString(36),type:'created',agreementDate,compromiseDate,amount,forgiveness,forgivenessAmount,installmentId:row.id||'',installmentNumber:row.number||'',originalDue:row.originalDueDate||row.currentDueDate||row.dueDate||'',frozenAt:new Date().toISOString(),createdAt:new Date().toISOString(),actor:session&&session.email||'demo'};
 const app=p.application||(p.application={});
 (app.carteraAgreements||(app.carteraAgreements=[])).push(entry);
 (p.timeline||(p.timeline=[])).unshift({action:'Acuerdo registrado',at:entry.createdAt,comment:'Compromiso '+compromiseDate+' · '+fmtMoney(amount)+' · cuota '+entry.installmentNumber+' · vencimiento original '+entry.originalDue,entity:p.id});
 const vars=carteraVars(p,{monto:fmtMoney(amount),fecha:compromiseDate,dias:0});
 const confirmation=carteraFill(carteraTemplate('confirmacion','email'),vars);
 (app.carteraMessages||(app.carteraMessages=[])).push({key:p.id+'|confirmacion|'+entry.id,at:entry.createdAt,channel:'correo',action:'Enviado (demo)',comment:'Confirmación de acuerdo',subject:carteraFill(carteraTemplate('confirmacion','subject'),vars),body:confirmation});
 if(typeof carteraResave==='function')carteraResave();
 return {ok:true,agreement:entry,email:confirmation};
}
function carteraLogContact(id,channel,note){
 const p=(db.patients||[]).find(item=>item.id===id);if(!p)return false;
 note=String(note||'').trim();
 if(!note){if(typeof toast==='function')toast('Escribe una nota de contacto.');return false;}
 const entry={at:new Date().toISOString(),channel:channel||'llamada',note,actor:session&&session.email||'demo'};
 const app=p.application||(p.application={});
 (app.carteraContacts||(app.carteraContacts=[])).push(entry);
 (p.timeline||(p.timeline=[])).unshift({action:entry.channel==='llamada'?'Llamada registrada':entry.channel,at:entry.at,comment:note,entity:p.id});
 if(typeof carteraResave==='function')carteraResave();
 return true;
}
function carteraBreakdownFromPayment(payment,fallback){
 const breakdown={iva:0,comisiones:0,moratorios:0,ordinarios:0,capital:0};
 const map={ivaInteres:'iva',ivaMoratorio:'iva',iva:'iva',commission:'comisiones',moratorio:'moratorios',moratorioSinInteres:'moratorios',interes:'ordinarios',ordinarioSinInteres:'ordinarios',capital:'capital',capital_prepay:'capital'};
 const rows=payment&&payment.allocations||[];
 if(!rows.length)return Object.assign({},breakdown,fallback||{});
 rows.forEach(row=>{const key=map[row.concept]||'ordinarios';breakdown[key]=roundToCents(breakdown[key]+dispersionNumber(row.amount,0));});
 return breakdown;
}
function carteraReceiptFromResult(p,result,action){
 const code=typeof dispersionApplicationCode==='function'?dispersionApplicationCode(p):p.id;
 const name=p.patient&&p.patient.fullName||p.name||'Cliente';
 const email=p.patient&&p.patient.email||'';
 let amount=0,breakdown={iva:0,comisiones:0,moratorios:0,ordinarios:0,capital:0},before=0,after=0;
 if(action==='pago'){
  const preview=result.preview||{};
  amount=preview.applied||result.audit&&result.audit.amount||0;
  breakdown=carteraBreakdownFromPayment(result.payment,preview.breakdown);
  before=preview.balanceBefore||0;after=preview.balanceAfter||0;
 }else if(action==='extension'){
  const audit=result.audit||{};
  amount=audit.total||0;
  breakdown={iva:audit.feeVat||0,comisiones:audit.fee||0,moratorios:0,ordinarios:audit.interestPaid||0,capital:0};
  before=typeof carteraCapitalPending==='function'?carteraCapitalPending(p):0;after=before;
 }else if(action==='prepago'){
  const audit=result.audit||result;
  amount=audit.amount||audit.total||0;
  breakdown={iva:0,comisiones:0,moratorios:0,ordinarios:0,capital:amount};
  before=audit.balanceBefore||0;after=audit.balanceAfter||0;
 }else{
  const audit=result.audit||{};
  amount=roundToCents(dispersionNumber(audit.commissionFee,0)+dispersionNumber(audit.commissionFeeIva,0));
  breakdown={iva:audit.commissionFeeIva||0,comisiones:audit.commissionFee||0,moratorios:audit.separated&&audit.separated.moratory||0,ordinarios:0,capital:0};
  before=audit.components?roundToCents(dispersionNumber(audit.components.capital,0)+dispersionNumber(audit.components.interest,0)):0;
  after=audit.newBalance||0;
 }
 const rows=typeof dispersionBuildSchedule==='function'?dispersionBuildSchedule(p):[];
 const upcoming=rows.find(row=>dispersionNumber(row.pendingAmount,0)>0);
 const next=upcoming?fmtMoney(upcoming.pendingAmount||upcoming.totalPayment||0)+' · '+(upcoming.currentDueDate||upcoming.dueDate||''):'Sin cuotas pendientes';
 return {id:'REC-'+Date.now().toString(36),at:new Date().toISOString(),date:carteraToday(),action:action||'pago',name,email,code,creditId:p.id,amount,breakdown,before,after,next};
}
function carteraReceiptRows(receipt){return [['IVA',receipt.breakdown.iva],['Comisiones',receipt.breakdown.comisiones],['Moratorios',receipt.breakdown.moratorios],['Ordinarios',receipt.breakdown.ordinarios],['Capital',receipt.breakdown.capital]];}
function carteraReceiptDocument(receipt){
 const rows=carteraReceiptRows(receipt).map(([label,amount])=>`<tr><td>${label}</td><td>${fmtMoney(amount||0)}</td></tr>`).join('');
 return `<!doctype html><html lang="es"><head><meta charset="UTF-8"><title>Recibo Pulzzo</title><style>body{font-family:Inter,Arial,sans-serif;color:#07142F;margin:24px}h1{font-family:"Plus Jakarta Sans",Inter,sans-serif;font-size:22px}table{width:100%;border-collapse:collapse}td{padding:8px 0;border-bottom:1px solid #E8EEF6}td:last-child{text-align:right}</style></head><body><h1>PULZZO</h1><p>Recibo de operación · ${receipt.id}</p><p>${receipt.name}<br>Crédito ${receipt.code}<br>${receipt.date}</p><p>Monto ${fmtMoney(receipt.amount||0)}</p><table>${rows}</table><p>Saldo anterior ${fmtMoney(receipt.before||0)} · Saldo posterior ${fmtMoney(receipt.after||0)}</p><p>Próximo pago: ${receipt.next}</p><script>window.onload=function(){setTimeout(function(){window.print();},250);}<\/script></body></html>`;
}
function carteraPresentReceipt(p,result,action){
 const receipt=carteraReceiptFromResult(p,result,action);
 const vars=carteraVars(p,{monto:fmtMoney(receipt.amount||0),fecha:receipt.date,saldo:fmtMoney(receipt.after||0),dias:0,credito:receipt.code,cliente:receipt.name});
 const subject=carteraFill(carteraTemplate('recibo','subject'),vars);
 const body=carteraFill(carteraTemplate('recibo','email'),vars);
 const stored=Object.assign({},receipt,{to:receipt.email,subject,body,attachment:'recibo-'+receipt.code+'.html',status:'Enviado (demo)'});
 const app=p.application||(p.application={});
 (app.carteraReceipts||(app.carteraReceipts=[])).push(stored);
 (p.timeline||(p.timeline=[])).unshift({action:'Enviado (demo)',at:stored.at,createdAt:stored.at,comment:'Recibo '+stored.id+' · '+subject+' · adjunto '+stored.attachment,entity:p.id,entityKind:'patient'});
 if(typeof carteraResave==='function')carteraResave();
 carteraUiState.lastReceipt=stored;
 const lines=carteraReceiptRows(stored).map(([label,amount])=>`<tr><td>${escapeHtml(label)}</td><td>${fmtMoney(amount||0)}</td></tr>`).join('');
 const html=`<div class="modal-head"><div><h3>Recibo de pago</h3><p>${escapeHtml(stored.name)} · ${escapeHtml(stored.code)}</p></div><button class="x" type="button" onclick="closeModal()">×</button></div><div class="modal-body"><section class="cartera-receipt" id="carteraReceiptSheet"><h4>PULZZO</h4><div class="cartera-receipt-grid"><div><span>Cliente</span><strong>${escapeHtml(stored.name)}</strong></div><div><span>Crédito</span><strong>${escapeHtml(stored.code)}</strong></div><div><span>Fecha</span><strong>${escapeHtml(stored.date)}</strong></div><div><span>Monto</span><strong>${fmtMoney(stored.amount||0)}</strong></div></div><table class="cartera-receipt-table"><tbody>${lines}</tbody></table><p>Saldo anterior ${fmtMoney(stored.before||0)} · Saldo posterior ${fmtMoney(stored.after||0)}</p><p>Próximo pago: ${escapeHtml(stored.next)}</p></section><section class="cartera-fase1"><h4>Correo simulado · Enviado (demo)</h4><div class="cartera-receipt-grid"><div><span>Para</span><strong>${escapeHtml(stored.to||'Sin correo')}</strong></div><div><span>Asunto</span><strong>${escapeHtml(subject)}</strong></div><div><span>Adjunto</span><strong>${escapeHtml(stored.attachment)}</strong></div></div><pre>${escapeHtml(body)}</pre></section></div><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="carteraPrintReceipt()">Imprimir</button><button type="button" class="btn btn-secondary" onclick="carteraDownloadReceipt()">Descargar</button><button type="button" class="btn btn-primary" onclick="closeModal()">Cerrar</button></div>`;
 if(typeof modal==='function'&&typeof carteraCanUseModal==='function'&&carteraCanUseModal())modal(html);
 return stored;
}
function carteraPrintReceipt(){const receipt=carteraUiState.lastReceipt;if(!receipt||typeof window==='undefined'||!window.open)return false;const win=window.open('','_blank','noopener');if(!win)return false;win.document.open();win.document.write(carteraReceiptDocument(receipt));win.document.close();return true;}
function carteraDownloadReceipt(){const receipt=carteraUiState.lastReceipt;if(!receipt)return false;const blob=new Blob([carteraReceiptDocument(receipt).replace('<script>window.onload=function(){setTimeout(function(){window.print();},250);}</script>','')],{type:'text/html'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=receipt.attachment||'recibo.html';document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);return true;}
function carteraAging(credits){
 const buckets=[{id:'1-30',label:'1 a 30 días',min:1,max:30,count:0,amount:0},{id:'31-60',label:'31 a 60 días',min:31,max:60,count:0,amount:0},{id:'61-90',label:'61 a 90 días',min:61,max:90,count:0,amount:0},{id:'>90',label:'Más de 90 días',min:91,max:Infinity,count:0,amount:0}];
 (credits||[]).filter(credit=>!credit.settled).forEach(credit=>{
  const facts=carteraCreditFacts(credit);
  if(!(facts.dpd>0))return;
  const bucket=buckets.find(item=>facts.dpd>=item.min&&facts.dpd<=item.max);
  if(!bucket)return;
  bucket.count+=1;bucket.amount=roundToCents(bucket.amount+facts.amount);
 });
 return buckets;
}
function carteraAgingHtml(credits){
 const buckets=carteraAging(credits);
 return `<section class="portfolio-chart cartera-aging"><h3>Antigüedad de la cartera</h3><dl class="cartera-aging-grid">${buckets.map(bucket=>`<div><dt>${bucket.label}</dt><dd>${bucket.count} créditos</dd><dd>${fmtMoney(bucket.amount)}</dd></div>`).join('')}</dl><p>Importes vencidos por días de atraso. No se suman al capital pendiente.</p></section>`;
}
function carteraCollectionsHtml(){
 const credits=(typeof portfolioCredits==='function'?portfolioCredits():[]).filter(credit=>typeof portfolioMatches!=='function'||portfolioMatches(credit)).filter(credit=>!credit.settled);
 const rows=credits.map(credit=>{
  const stage=carteraCollectionStage(credit);
  const facts=carteraCreditFacts(credit);
  const agreement=carteraDeriveAgreement(credit.record);
  const patient=credit.record.patient||{};
  const sent=(carteraMessageLog(credit.record).slice(-1)[0]);
  const actions=stage.channel?`<button type="button" class="btn btn-sm btn-secondary" onclick="carteraOpenWhatsapp('${escapeAttr(credit.id)}')">WhatsApp</button><button type="button" class="btn btn-sm btn-secondary" onclick="carteraOpenMailPreview('${escapeAttr(credit.id)}')">Correo</button>`:'<span class="pill pill-gray">Sin mensaje automático</span>';
  return `<tr><td>${escapeHtml(credit.name)}<small>${escapeHtml(credit.code)}</small></td><td>${escapeHtml(stage.label)}</td><td>${facts.dpd}</td><td>${fmtMoney(stage.amount||facts.amount||0)}</td><td>${escapeHtml(facts.next&&facts.next.date||'—')}</td><td>${escapeHtml(facts.oldest&&facts.oldest.date||'—')}</td><td>${escapeHtml(patient.phone||'—')}</td><td>${escapeHtml(patient.email||'—')}</td><td>${sent?escapeHtml(sent.action+' · '+String(sent.at).slice(0,10)):'—'}</td><td>${escapeHtml(carteraAgreementLabel(agreement))}</td><td>${actions}<button type="button" class="btn btn-sm btn-primary" onclick="carteraOpenPayment('${escapeAttr(credit.id)}')">Aplicar pago</button><button type="button" class="btn btn-sm btn-secondary" onclick="carteraOpenAgreement('${escapeAttr(credit.id)}')">Acuerdo</button><button type="button" class="btn btn-sm btn-secondary" onclick="carteraOpenContact('${escapeAttr(credit.id)}')">Llamada</button></td></tr>`;
 }).join('');
 return `<p>Una fila por crédito. WhatsApp abre wa.me y el correo se registra como Enviado (demo). No hay envío real.</p><div class="table-wrap portfolio-desktop-table"><table class="portfolio-table"><thead><tr><th>Cliente</th><th>Etapa de hoy</th><th>Días de atraso</th><th>Monto a cobrar</th><th>Próximo vencimiento</th><th>Vencido más antiguo</th><th>Celular</th><th>Correo</th><th>Último recordatorio</th><th>Acuerdo</th><th>Acciones</th></tr></thead><tbody>${rows||'<tr><td colspan="11">Sin créditos en cartera.</td></tr>'}</tbody></table></div>`;
}
function carteraPaintCollections(){const target=document.getElementById('portfolioContent');if(target)target.innerHTML=carteraCollectionsHtml();}
function carteraOpenAgreement(id){
 const p=(db.patients||[]).find(item=>item.id===id);if(!p)return false;
 const current=carteraDeriveAgreement(p);
 const history=carteraAgreementEvents(p).map(item=>`<li>${escapeHtml(item.type==='created'?'Registrado':'Actualización')} · ${escapeHtml(item.compromiseDate||item.status||'')} · ${escapeHtml(item.originalDue?'Vencimiento original '+item.originalDue:'')}</li>`).join('');
 const html=`<div class="modal-head"><div><h3>Acuerdo de pago</h3><p>${escapeHtml(p.patient&&p.patient.fullName||p.id)}</p></div><button class="x" type="button" onclick="closeModal()">×</button></div><div class="modal-body"><p>Estado: ${escapeHtml(carteraAgreementLabel(current))}. La cuota y el vencimiento original quedan congelados.</p><div class="cartera-form"><label class="field">Fecha del acuerdo<input id="acuerdoFecha" type="date" value="${carteraToday()}"></label><label class="field">Fecha de compromiso<input id="acuerdoCompromiso" type="date" value="${carteraAddDays(carteraToday(),5)}"></label><label class="field">Monto comprometido<input id="acuerdoMonto" type="number" min="0" step="0.01"></label></div><div class="cartera-choices cartera-choices-sub" role="group" aria-label="Condonación"><button type="button" class="cartera-choice" data-forgiveness="none" aria-pressed="true" onclick="carteraChooseForgiveness('none')">No</button><button type="button" class="cartera-choice" data-forgiveness="moratory_total" aria-pressed="false" onclick="carteraChooseForgiveness('moratory_total')">Total moratorios</button><button type="button" class="cartera-choice" data-forgiveness="fixed" aria-pressed="false" onclick="carteraChooseForgiveness('fixed')">Monto fijo</button></div><label class="field">Monto fijo de moratorios<input id="acuerdoCondonacion" type="number" min="0" step="0.01"></label><input id="acuerdoCondonacionTipo" type="hidden" value="none"><p>No se condona capital ni interés ordinario. El monto lo autoriza un líder o un administrador.</p><ul>${history||'<li>Sin acuerdos previos.</li>'}</ul></div><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Cerrar</button><button type="button" class="btn btn-secondary" onclick="carteraApplyForgivenessUi('${escapeAttr(id)}')">Aplicar condonación</button><button type="button" class="btn btn-primary" onclick="carteraSaveAgreement('${escapeAttr(id)}')">Registrar acuerdo</button></div>`;
 if(typeof modal==='function')modal(html);
 return true;
}
function carteraChooseForgiveness(value){const input=document.getElementById('acuerdoCondonacionTipo');if(input)input.value=value;document.querySelectorAll('[data-forgiveness]').forEach(button=>button.setAttribute('aria-pressed',String(button.getAttribute('data-forgiveness')===value)));}
function carteraSaveAgreement(id){
 const result=carteraRegisterAgreement(id,{agreementDate:document.getElementById('acuerdoFecha').value,compromiseDate:document.getElementById('acuerdoCompromiso').value,amount:document.getElementById('acuerdoMonto').value,forgiveness:document.getElementById('acuerdoCondonacionTipo').value,forgivenessAmount:document.getElementById('acuerdoCondonacion').value});
 if(!result.ok){if(typeof toast==='function')toast(result.error);return false;}
 if(typeof toast==='function')toast('Acuerdo registrado. La confirmación quedó como Enviado (demo).');
 if(typeof closeModal==='function')closeModal();
 if(typeof renderPortfolio==='function')renderPortfolio();
 return true;
}
function carteraApplyForgivenessUi(id){const result=carteraApplyForgiveness(id);if(!result.ok){if(typeof toast==='function')toast(result.error);return false;}if(typeof toast==='function')toast('Condonación aplicada solo a moratorios.');if(typeof closeModal==='function')closeModal();if(typeof renderPortfolio==='function')renderPortfolio();return true;}
function carteraOpenContact(id){const html=`<div class="modal-head"><div><h3>Registrar llamada</h3></div><button class="x" type="button" onclick="closeModal()">×</button></div><div class="modal-body"><label class="field">Nota<textarea id="carteraContactNote" rows="4"></textarea></label></div><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Cerrar</button><button type="button" class="btn btn-primary" onclick="carteraSaveContact('${id}')">Guardar</button></div>`;if(typeof modal==='function')modal(html);return true;}
function carteraSaveContact(id){const ok=carteraLogContact(id,'llamada',document.getElementById('carteraContactNote').value);if(ok&&typeof closeModal==='function')closeModal();if(ok&&typeof renderPortfolio==='function')renderPortfolio();return ok;}
function carteraCobranzaSettingsHtml(){
 const config=carteraCobranzaRead();
 const days=[['precobranza','Precobranza, días antes'],['day1','Cobranza día'],['day3','Cobranza día'],['dailyFrom','Seguimiento desde'],['dailyTo','Seguimiento hasta'],['earlyFrom','Mora temprana desde'],['earlyTo','Mora temprana hasta'],['restructureFrom','Candidato a reestructura desde'],['restructureTo','Candidato a reestructura hasta'],['externalFrom','Cobranza externa desde']];
 const dayFields=days.map(([key,label])=>`<label class="field">${label}<input id="cobranza-${key}" type="number" min="0" step="1" value="${escapeAttr(config.days[key])}"></label>`).join('');
 const templates=CARTERA_TEMPLATE_IDS.map(([id,label])=>`<details><summary>${label}</summary><label class="field">Asunto<input id="plantilla-${id}-subject" value="${escapeAttr(config.templates[id+'_subject']||'')}"></label><label class="field">Correo<textarea id="plantilla-${id}-email" rows="5">${escapeHtml(config.templates[id+'_email']||'')}</textarea></label><label class="field">WhatsApp<textarea id="plantilla-${id}-whatsapp" rows="3">${escapeHtml(config.templates[id+'_whatsapp']||'')}</textarea></label></details>`).join('');
 return `<section class="cfg-policy"><h3>Cobranza y plantillas</h3><p>Los días y los textos se guardan en este navegador. {datos_pago} usa el texto de abajo. No hay envío real.</p><div class="cartera-form">${dayFields}<label class="field">Datos de pago<input id="cobranza-payment-data" value="${escapeAttr(config.paymentData)}"></label></div>${templates}<div class="cartera-actions"><button type="button" class="btn btn-primary" onclick="carteraSaveCobranzaSettings()">Guardar cobranza</button></div></section>`;
}
function carteraSaveCobranzaSettings(){
 const read=id=>{const node=document.getElementById(id);return node?node.value:'';};
 const days={};
 for(const key of Object.keys(CARTERA_DAY_DEFAULTS)){const value=Number(read('cobranza-'+key));if(!Number.isInteger(value)||value<0||value>365){if(typeof toast==='function')toast('Revisa los días de '+key+'.');return false;}days[key]=value;}
 if(!(days.precobranza>=1)||!(days.day3>days.day1)||!(days.dailyFrom>days.day3)||!(days.dailyTo>=days.dailyFrom)||!(days.earlyFrom>days.dailyTo)||!(days.earlyTo>=days.earlyFrom)||!(days.restructureFrom>days.earlyTo)||!(days.restructureTo>=days.restructureFrom)||!(days.externalFrom>days.restructureTo)){if(typeof toast==='function')toast('Las etapas deben ir en orden y sin empalmarse.');return false;}
 const templates={};
 CARTERA_TEMPLATE_IDS.forEach(([id])=>{templates[id+'_subject']=read('plantilla-'+id+'-subject')||carteraTemplate(id,'subject');templates[id+'_email']=read('plantilla-'+id+'-email')||carteraTemplate(id,'email');templates[id+'_whatsapp']=read('plantilla-'+id+'-whatsapp')||carteraTemplate(id,'whatsapp');});
 carteraCobranzaWrite({days,paymentData:read('cobranza-payment-data')||'Datos de pago · pendiente',templates});
 if(typeof toast==='function')toast('Cobranza guardada en este navegador.');
 return true;
}
function carteraBuildStageCredit(spec){
 const credit=carteraBuildDemoCredit({id:spec.id,name:spec.name,state:spec.state,base:'global',frequency:'monthly',offset:-400,payPast:false,amount:48000,procedure:'Rinoplastia',doctor:'Dra. Laura Méndez',phone:spec.phone,curp:spec.curp,rfc:spec.rfc,email:spec.email});
 const target=carteraAddDays(carteraToday(),spec.dueOffset);
 const first=(credit.paymentSchedule||[]).find(row=>row&&row.type!=='Pago inicial requerido');
 if(first){first.dueDate=target;first.currentDueDate=target;first.scheduledDate=target;first.originalDueDate=first.originalDueDate||target;}
 credit.paymentSchedule=dispersionBuildSchedule(credit);
 if(spec.dueOffset<0){
  const open=credit.paymentSchedule.find(row=>dispersionNumber(row.pendingAmount,0)>0);
  if(open){open.moratory=roundToCents(Math.max(dispersionNumber(open.capital,0),100)*0.02);open.moratoryIva=roundToCents(open.moratory*0.16);if(typeof dispersionHydrateConcepts==='function')dispersionHydrateConcepts(open,{});open.status='Vencido';}
 }
 if(spec.agreement){
  const open=credit.paymentSchedule.find(row=>dispersionNumber(row.pendingAmount,0)>0)||{};
  credit.application.carteraAgreements=[{id:'ACU-'+spec.id,type:'created',agreementDate:carteraToday(),compromiseDate:carteraAddDays(carteraToday(),5),amount:roundToCents(dispersionNumber(open.pendingAmount,1000))||1000,forgiveness:'none',forgivenessAmount:0,installmentId:open.id||'',installmentNumber:open.number||'',originalDue:open.originalDueDate||open.currentDueDate||open.dueDate||target,createdAt:new Date().toISOString(),actor:'demo.cartera@pulzzo.mx'}];
 }
 return credit;
}
function carteraSeedStageCredits(){
 if(typeof db==='undefined'||!Array.isArray(db.patients)||typeof carteraBuildDemoCredit!=='function')return [];
 const specs=[
  {id:'APP-CARTERA-1101',name:'Inés Palacios Mora',state:'Precobranza',dueOffset:3,phone:'55 5100 1101',email:'ines.palacios.demo@pulzzo.mx',curp:'PAMI930101MDFLLN01',rfc:'PAMI930101AA1'},
  {id:'APP-CARTERA-1102',name:'Jorge Beltrán Osorio',state:'Vence hoy',dueOffset:0,phone:'55 5100 1102',email:'jorge.beltran.demo@pulzzo.mx',curp:'BEOJ880202HDFSLR02',rfc:'BEOJ880202BB2'},
  {id:'APP-CARTERA-1103',name:'Karla Méndez Prieto',state:'Cobranza día 1',dueOffset:-1,phone:'55 5100 1103',email:'karla.mendez.demo@pulzzo.mx',curp:'MEPK910303MDFNRL03',rfc:'MEPK910303CC3'},
  {id:'APP-CARTERA-1104',name:'Luis Ortega Salas',state:'Cobranza día 3',dueOffset:-3,phone:'55 5100 1104',email:'luis.ortega.demo@pulzzo.mx',curp:'ORSL870404HDFRGS04',rfc:'ORSL870404DD4'},
  {id:'APP-CARTERA-1105',name:'Marina Solís Paredes',state:'Seguimiento 5 a 30',dueOffset:-12,phone:'55 5100 1105',email:'marina.solis.demo@pulzzo.mx',curp:'SOPM920505MDFLLR05',rfc:'SOPM920505EE5'},
  {id:'APP-CARTERA-1106',name:'Nicolás Aguilar Rivas',state:'Mora temprana 31 a 60',dueOffset:-45,phone:'55 5100 1106',email:'nicolas.aguilar.demo@pulzzo.mx',curp:'AURN860606HDFGLC06',rfc:'AURN860606FF6'},
  {id:'APP-CARTERA-1107',name:'Olivia Castro Núñez',state:'Candidato a reestructura',dueOffset:-75,phone:'55 5100 1107',email:'olivia.castro.demo@pulzzo.mx',curp:'CANO940707MDFSTL07',rfc:'CANO940707GG7'},
  {id:'APP-CARTERA-1108',name:'Pablo Herrera Campos',state:'Candidato a cobranza externa',dueOffset:-120,phone:'55 5100 1108',email:'pablo.herrera.demo@pulzzo.mx',curp:'HECP850808HDFRMB08',rfc:'HECP850808HH8'},
  {id:'APP-CARTERA-1109',name:'Renata Ibáñez Flores',state:'Acuerdo vigente',dueOffset:10,agreement:true,phone:'55 5100 1109',email:'renata.ibanez.demo@pulzzo.mx',curp:'IAFR960909MDFBLN09',rfc:'IAFR960909II9'}
 ];
 const present=new Set(db.patients.map(item=>item&&item.id));
 const added=[];
 specs.forEach(spec=>{if(present.has(spec.id))return;try{db.patients.push(carteraBuildStageCredit(spec));present.add(spec.id);added.push(spec.id);}catch(error){}});
 if(added.length&&typeof carteraResave==='function'){try{carteraResave();}catch(error){}}
 return added;
}
if(typeof portfolioSummaryHtml==='function'){
 const carteraOriginalSummary=portfolioSummaryHtml;
 portfolioSummaryHtml=function(credits){return carteraOriginalSummary(credits)+carteraAgingHtml(credits);};
}
if(typeof renderPortfolioBody==='function'){
 const carteraOriginalPortfolioBody=renderPortfolioBody;
 renderPortfolioBody=function(){const result=carteraOriginalPortfolioBody.apply(this,arguments);try{if(typeof portfolioState!=='undefined'&&portfolioState.tab==='collections')carteraPaintCollections();}catch(error){}return result;};
}
if(typeof renderSettings==='function'){
 const carteraOriginalRenderSettings=renderSettings;
 renderSettings=function(){const result=carteraOriginalRenderSettings.apply(this,arguments);try{if(typeof configTab!=='undefined'&&configTab==='collections'){const body=document.querySelector&&document.querySelector('#settings .card-body');if(body&&!body.querySelector('#carteraCobranzaSettings')){const section=document.createElement('section');section.id='carteraCobranzaSettings';section.innerHTML=carteraCobranzaSettingsHtml();body.appendChild(section);}}}catch(error){}return result;};
}
try{carteraSeedStageCredits();}catch(error){}
Object.assign(globalThis,{carteraToday,carteraAddDays,carteraCobranzaRead,carteraCobranzaWrite,carteraTemplate,carteraFill,carteraCollectionStage,carteraCreditFacts,carteraFactsForPatient,carteraDeriveAgreement,carteraAgreementLabel,carteraMessageKey,carteraMessageSent,carteraRememberMessage,carteraWhatsappLink,carteraOpenWhatsapp,carteraOpenMailPreview,carteraLogMail,carteraRegisterAgreement,carteraApplyForgiveness,carteraPresentReceipt,carteraReceiptFromResult,carteraReceiptDocument,carteraAging,carteraSeedStageCredits,carteraBuildStageCredit,carteraSaveCobranzaSettings,carteraCobranzaSettingsHtml,CARTERA_COBRANZA_KEY});
})();
