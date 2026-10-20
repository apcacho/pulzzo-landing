/* Cobranza, acuerdos y recibos de cartera. Los envíos son una simulación local. */
(function(){
'use strict';
const CARTERA_COBRANZA_KEY='pulzzo_cartera_cobranza_v1';
const CARTERA_TEMPLATE_IDS=[['precobranza','Precobranza'],['vence_hoy','Vence hoy'],['cobranza_1','Cobranza día 1'],['cobranza_3','Cobranza día 3'],['seguimiento','Seguimiento diario 5 a 30'],['mora_temprana','Mora temprana'],['propuesta','Propuesta de acuerdo'],['confirmacion','Confirmación de acuerdo'],['recordatorio','Recordatorio día de acuerdo'],['incumplido','Acuerdo incumplido'],['recibo','Recibo de pago']];
const CARTERA_DAY_DEFAULTS={precobranza:3,day1:1,day3:3,dailyFrom:5,dailyTo:30,earlyFrom:31,earlyTo:60,restructureFrom:61,restructureTo:90,externalFrom:91};
const CARTERA_MAIL_STAGES=[['precobranza','Precobranza'],['vence_hoy','Vence hoy'],['cobranza_1','Cobranza +1'],['cobranza_3','Cobranza +3'],['seguimiento','Seguimiento diario 5–30'],['recordatorio','Recordatorio día de acuerdo'],['confirmacion','Confirmación de acuerdo'],['recibo','Recibo de pago']];
const CARTERA_MAIL_TIMEZONE='America/Mexico_City';
const CARTERA_MORA_STAGES={mora_temprana:true,candidato_reestructura:true,candidato_externa:true};
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
function carteraMailDefaults(){
 const stages={};
 CARTERA_MAIL_STAGES.forEach(([id])=>{stages[id]=true;});
 return {enabled:true,sendTime:'09:00',timezone:CARTERA_MAIL_TIMEZONE,cc:'',stages};
}
function carteraNormalizeMail(raw){
 const defaults=carteraMailDefaults();
 const source=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 const stages={...defaults.stages};
 const incoming=source.stages&&typeof source.stages==='object'?source.stages:{};
 CARTERA_MAIL_STAGES.forEach(([id])=>{if(typeof incoming[id]==='boolean')stages[id]=incoming[id];});
 const sendMatch=/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(String(source.sendTime||''));
 const sendTime=sendMatch?sendMatch[1]+':'+sendMatch[2]:defaults.sendTime;
 return {enabled:typeof source.enabled==='boolean'?source.enabled:defaults.enabled,sendTime,timezone:CARTERA_MAIL_TIMEZONE,cc:String(source.cc||'').trim(),stages};
}
function carteraValidCc(value){
 const text=String(value||'').trim();
 if(!text)return '';
 if(text.length>240)return null;
 const parts=text.split(/[;,]+/).map(item=>item.trim()).filter(Boolean);
 if(!parts.length||parts.length>8)return null;
 if(!parts.every(part=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part)))return null;
 return parts.join(', ');
}
function carteraMexicoNow(date){
 const fmt=new Intl.DateTimeFormat('en-US',{timeZone:CARTERA_MAIL_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const parts={};
 fmt.formatToParts(date||new Date()).forEach(part=>{if(part.type!=='literal')parts[part.type]=part.value;});
 let hour=String(parts.hour||'00');
 if(hour==='24')hour='00';
 return {date:String(parts.year||'0000')+'-'+String(parts.month||'01').padStart(2,'0')+'-'+String(parts.day||'01').padStart(2,'0'),time:hour.padStart(2,'0')+':'+String(parts.minute||'00').padStart(2,'0')};
}
function carteraCobranzaRead(){
 const defaults={schema:1,days:{...CARTERA_DAY_DEFAULTS},paymentData:'Datos de pago · pendiente',templates:carteraDefaultTemplates(),mail:carteraMailDefaults(),lastDemoRun:''};
 try{
  const raw=localStorage.getItem(CARTERA_COBRANZA_KEY);
  if(!raw)return defaults;
  const parsed=JSON.parse(raw);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return defaults;
  return {schema:1,days:{...CARTERA_DAY_DEFAULTS,...(parsed.days||{})},paymentData:String(parsed.paymentData||defaults.paymentData),templates:{...defaults.templates,...(parsed.templates||{})},mail:carteraNormalizeMail(parsed.mail),lastDemoRun:/^\d{4}-\d{2}-\d{2}$/.test(String(parsed.lastDemoRun||''))?String(parsed.lastDemoRun):''};
 }catch(error){return defaults;}
}
function carteraCobranzaWrite(next){
 const current=carteraCobranzaRead();
 next=next||{};
 const mail=next.mail?carteraNormalizeMail({...current.mail,...next.mail,stages:{...current.mail.stages,...((next.mail&&next.mail.stages)||{})}}):current.mail;
 let lastDemoRun=current.lastDemoRun;
 if(Object.prototype.hasOwnProperty.call(next,'lastDemoRun')){const value=String(next.lastDemoRun||'');lastDemoRun=/^\d{4}-\d{2}-\d{2}$/.test(value)?value:'';}
 const stored={schema:1,days:{...current.days,...(next.days||{})},paymentData:next.paymentData!=null?String(next.paymentData):current.paymentData,templates:{...current.templates,...(next.templates||{})},mail,lastDemoRun};
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
 const agreement=patient&&patient.application?carteraDeriveAgreement(patient,today):null;
 if(agreement&&agreement.status!=='incumplido'&&agreement.status!=='cumplido'){
  if(agreement.forgivenessPending)return {id:'condonacion_pendiente',label:'Condonación pendiente de aplicar',template:'',automatic:false,pause:true,pauseReason:'condonacion',due:agreement.compromiseDate,dpd:facts.dpd,amount:agreement.amount,channel:false};
  if(agreement.status==='vence_hoy')return {id:'acuerdo_hoy',label:'Recordatorio día de acuerdo',template:'recordatorio',automatic:true,pause:false,due:agreement.compromiseDate,dpd:facts.dpd,amount:agreement.amount,channel:true};
  return {id:'acuerdo_vigente',label:carteraAgreementLabel(agreement),template:'',automatic:false,pause:true,pauseReason:'acuerdo',due:agreement.compromiseDate,dpd:facts.dpd,amount:agreement.amount,channel:false};
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
function carteraMessageKey(creditId,stage,due,channel){const day=stage&&stage.daily?carteraToday():'';const base=[creditId,stage&&stage.id||'',due||'',day].join('|');return channel?String(channel)+'|'+base:base;}
function carteraMessageLog(p){return ((p.application||{}).carteraMessages)||[];}
function carteraMessageSent(p,key){
 const wanted=String(key||'');
 const legacy=wanted.replace(/^(?:correo|whatsapp)\|/,'');
 return carteraMessageLog(p).some(item=>item&&item.key&&(item.key===wanted||(legacy!==wanted&&item.key===legacy)));
}
function carteraRememberMessage(p,entry){
 const app=p.application||(p.application={});
 const list=app.carteraMessages||(app.carteraMessages=[]);
 if(carteraMessageSent(p,entry.key))return {ok:false,duplicate:true,error:'Ya hay un mensaje para este crédito, etapa y vencimiento.'};
 const stored=Object.assign({},entry);
 delete stored.deferSave;
 list.push(stored);
 (p.timeline||(p.timeline=[])).unshift({action:stored.action,at:stored.at,createdAt:stored.at,comment:stored.comment,entity:p.id,entityKind:'patient'});
 if(typeof carteraResave==='function'&&!entry.deferSave)carteraResave();
 return {ok:true,entry:stored};
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
function carteraRefreshSurface(){
 try{
  if(typeof currentView==='undefined')return;
  if(currentView==='patientProfiles'&&typeof renderPatientProfiles==='function')renderPatientProfiles();
  else if(currentView==='portfolio'&&typeof renderPortfolio==='function')renderPortfolio();
 }catch(error){}
}
function carteraEmailPreviewText(parts){
 parts=parts||{};
 return ['Para: '+(parts.to||'Sin correo'),'Copia: '+(parts.cc||'—'),'Asunto: '+(parts.subject||''),'',parts.body||''].join('\n');
}
function carteraMailToggleForStage(stage){
 if(!stage||stage.pause||CARTERA_MORA_STAGES[stage.id])return '';
 if((stage.dpd||0)>=31&&stage.id!=='acuerdo_hoy')return '';
 if(stage.id==='acuerdo_hoy')return 'recordatorio';
 if(stage.id==='seguimiento')return stage.automatic?'seguimiento':'';
 if(stage.automatic&&stage.template&&carteraMailDefaults().stages[stage.template])return stage.template;
 return '';
}
function carteraOpenWhatsapp(id){
 const p=(db.patients||[]).find(item=>item.id===id);if(!p)return false;
 const stage=carteraCollectionStage(p);
 if(!stage.channel){if(typeof toast==='function')toast('Esta etapa no envía mensajes. Un administrador decide el siguiente paso.');return false;}
 const text=carteraStageMessage(p,stage,'whatsapp');
 const phone=p.patient&&p.patient.phone||'';
 const link=carteraWhatsappLink(phone,text.body);
 if(typeof window!=='undefined'&&window.open)window.open(link,'_blank','noopener');
 return link;
}
function carteraMarkWhatsapp(id){
 const p=(db.patients||[]).find(item=>item.id===id);if(!p)return false;
 const stage=carteraCollectionStage(p);
 if(!stage.channel){if(typeof toast==='function')toast('Esta etapa no envía mensajes. Un administrador decide el siguiente paso.');return false;}
 const key=carteraMessageKey(p.id,stage,stage.due,'whatsapp');
 if(carteraMessageSent(p,key)){if(typeof toast==='function')toast('Este WhatsApp ya estaba marcado.');return false;}
 const text=carteraStageMessage(p,stage,'whatsapp');
 const saved=carteraRememberMessage(p,{key,at:new Date().toISOString(),channel:'whatsapp',action:'WhatsApp enviado',comment:'Marcar WhatsApp enviado · '+stage.label+' · '+stage.due,stage:stage.id,due:stage.due,body:text.body});
 if(!saved.ok){if(typeof toast==='function')toast(saved.error||'No se marcó el WhatsApp.');return false;}
 if(typeof toast==='function')toast('WhatsApp marcado como enviado.');
 carteraRefreshSurface();
 return true;
}
function carteraOpenMailPreview(id){
 const p=(db.patients||[]).find(item=>item.id===id);if(!p)return false;
 const stage=carteraCollectionStage(p);
 if(!stage.channel||!stage.template){if(typeof toast==='function')toast('Esta etapa no tiene correo automático.');return false;}
 const text=carteraStageMessage(p,stage,'email');
 const email=p.patient&&p.patient.email||'Sin correo';
 const cc=carteraCobranzaRead().mail.cc||'';
 const key=carteraMessageKey(p.id,stage,stage.due,'correo');
 const sent=carteraMessageSent(p,key);
 const preview=carteraEmailPreviewText({to:email,cc,subject:text.subject,body:text.body});
 const html=`<div class="modal-head"><div><h3>Correo de cobranza</h3><p>${escapeHtml(stage.label)}</p></div><button class="x" type="button" onclick="closeModal()">×</button></div><div class="modal-body"><div class="cartera-receipt-grid"><div class="field"><span>Para</span><strong>${escapeHtml(email)}</strong></div><div class="field"><span>Copia</span><strong>${escapeHtml(cc||'—')}</strong></div><div class="field"><span>Asunto</span><strong>${escapeHtml(text.subject)}</strong></div></div><pre class="cartera-fase1">${escapeHtml(preview)}</pre><p>${sent?'Este mensaje ya quedó registrado.':'El envío es simulado. No sale de este navegador.'}</p></div><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Cerrar</button>${sent?'':'<button type="button" class="btn btn-primary" onclick="carteraLogMail(\''+escapeAttr(p.id)+'\')">Registrar envío demo</button>'}</div>`;
 if(typeof modal==='function'&&carteraCanUseModal())modal(html);
 carteraUiState.mailDraft={id:p.id,key,to:email,cc,subject:text.subject,body:text.body,stage:stage.id,due:stage.due,label:stage.label};
 return {to:email,cc,subject:text.subject,body:text.body,preview,sent};
}
function carteraLogMail(id){
 const draft=carteraUiState.mailDraft;if(!draft||draft.id!==id)return false;
 const p=(db.patients||[]).find(item=>item.id===id);if(!p)return false;
 const cc=carteraCobranzaRead().mail.cc||draft.cc||'';
 const preview=carteraEmailPreviewText({to:draft.to,cc,subject:draft.subject,body:draft.body});
 const saved=carteraRememberMessage(p,{key:draft.key,at:new Date().toISOString(),channel:'correo',action:'Enviado (demo)',comment:preview,stage:draft.stage,due:draft.due,subject:draft.subject,body:draft.body,to:draft.to||'',cc});
 if(!saved.ok){if(typeof toast==='function')toast(saved.error||'No se registró el correo.');return false;}
 if(typeof toast==='function')toast('Enviado (demo). No salió ningún correo real.');
 if(typeof closeModal==='function')closeModal();
 carteraRefreshSurface();
 return true;
}
function carteraLivePatient(id){return ((typeof db!=='undefined'&&db.patients)||[]).find(item=>item&&item.id===id)||null;}
function carteraOpenCredits(){
 try{if(typeof portfolioCredits==='function')return portfolioCredits().filter(credit=>credit&&credit.record&&!credit.settled);}catch(error){}
 return [];
}
function carteraLogDemoEmail(p,entry){
 const preview=entry.comment||carteraEmailPreviewText(entry);
 return carteraRememberMessage(p,Object.assign({at:new Date().toISOString(),channel:'correo',action:'Enviado (demo)',comment:preview,demo:true},entry,{comment:preview,channel:'correo',action:'Enviado (demo)'}));
}
function carteraAutoMailDecision(p,stage,mail){
 mail=mail||carteraCobranzaRead().mail;
 if(!mail.enabled)return {send:false,reason:'apagado'};
 if(!stage)stage=carteraCollectionStage(p);
 if(stage.pause)return {send:false,reason:stage.pauseReason||'pausa',stage};
 if(CARTERA_MORA_STAGES[stage.id]||stage.template==='mora_temprana')return {send:false,reason:'mora',stage};
 const toggle=carteraMailToggleForStage(stage);
 if(!toggle)return {send:false,reason:'manual',stage};
 if(!mail.stages[toggle])return {send:false,reason:'etapa_apagada',stage};
 if(!stage.channel||!stage.template)return {send:false,reason:'sin_plantilla',stage};
 return {send:true,toggle,stage};
}
function carteraStampDay(value){
 try{const date=value?new Date(value):new Date();if(Number.isNaN(date.getTime()))return '';return carteraMexicoNow(date).date;}catch(error){return '';}
}
function carteraMailDigest(credits){
 const day=carteraStampDay();
 const actions=[],paused=[],mora=[];
 (credits||[]).forEach(credit=>{
  const live=carteraLivePatient(credit.id)||credit.record;
  if(!live)return;
  const stage=carteraCollectionStage(live);
  const facts=credit.installments?carteraCreditFacts(credit):carteraFactsForPatient(live);
  const name=credit.name||(live.patient&&live.patient.fullName)||live.id;
  const code=credit.code||live.id;
  if(stage.pause)paused.push({id:live.id,title:name,meta:code+' · '+stage.label,reason:stage.pauseReason||'pausa'});
  if(CARTERA_MORA_STAGES[stage.id])mora.push({id:live.id,title:name,meta:code+' · '+stage.label+' · '+(facts.dpd||0)+' días'});
  const messages=carteraMessageLog(live).filter(item=>item&&item.channel==='correo'&&item.action==='Enviado (demo)'&&carteraStampDay(item.at)===day);
  const receipts=(((live.application||{}).carteraReceipts)||[]).filter(item=>item&&item.status==='Enviado (demo)'&&carteraStampDay(item.at)===day&&!messages.some(message=>message.subject===item.subject&&message.body===item.body));
  messages.forEach(item=>actions.push({id:live.id,title:name,meta:code+' · '+(item.subject||item.stage||'Correo'),preview:item.comment||carteraEmailPreviewText(item)}));
  receipts.forEach(item=>actions.push({id:live.id,title:name,meta:code+' · '+(item.subject||'Recibo'),preview:item.body?carteraEmailPreviewText(item):''}));
 });
 return {day,actions,paused,mora};
}
function carteraRunAutomaticMail(options){
 options=options||{};
 const source=options.source||'load';
 const config=carteraCobranzaRead();
 const mail=config.mail;
 const now=carteraMexicoNow(new Date());
 const empty={ok:false,source,sent:[],paused:[],mora:[],now};
 if(!mail.enabled){
  if(source!=='load'&&typeof toast==='function')toast('El envío automático de correos está apagado.');
  return Object.assign(empty,{reason:'apagado'});
 }
 if(source==='load'&&config.lastDemoRun===now.date)return Object.assign(empty,{ok:true,skipped:true,reason:'ya_corrido'});
 if(source==='load'&&now.time<mail.sendTime)return Object.assign(empty,{ok:true,skipped:true,reason:'antes_de_hora'});
 const sent=[],paused=[],mora=[];
 let dirty=false;
 carteraOpenCredits().forEach(credit=>{
  try{
   const live=carteraLivePatient(credit.id);if(!live)return;
   const stage=carteraCollectionStage(live);
   const decision=carteraAutoMailDecision(live,stage,mail);
   if(stage.pause)paused.push({id:live.id,name:credit.name,label:stage.label,reason:stage.pauseReason||'pausa'});
   if(CARTERA_MORA_STAGES[stage.id])mora.push({id:live.id,name:credit.name,label:stage.label,dpd:stage.dpd||0});
   if(!decision.send)return;
   const text=carteraStageMessage(live,stage,'email');
   const to=live.patient&&live.patient.email||'Sin correo';
   const key=carteraMessageKey(live.id,stage,stage.due,'correo');
   if(carteraMessageSent(live,key))return;
   const preview=carteraEmailPreviewText({to,cc:mail.cc,subject:text.subject,body:text.body});
   const saved=carteraLogDemoEmail(live,{key,stage:stage.id,due:stage.due,subject:text.subject,body:text.body,to,cc:mail.cc||'',comment:preview,deferSave:true});
   if(saved&&saved.ok){dirty=true;sent.push({id:live.id,name:credit.name,stage:stage.id,subject:text.subject,preview});}
  }catch(error){}
 });
 if(dirty&&typeof carteraResave==='function')carteraResave();
 if(source==='load')carteraCobranzaWrite({lastDemoRun:now.date});
 if(source!=='load'&&typeof toast==='function')toast(sent.length?('Enviado (demo): '+sent.length+(sent.length===1?' correo.':' correos.')+' No salió ningún correo real.'):'Sin correos nuevos. Los ya registrados no se repiten.');
 if(source!=='load'){try{carteraRefreshSurface();}catch(error){}}
 return {ok:true,source,reason:sent.length?'enviado':'sin_novedades',sent,paused,mora,now};
}
function carteraRunMailNow(){
 const result=carteraRunAutomaticMail({source:'now'});
 try{if(typeof currentView!=='undefined'&&currentView==='portfolio'&&typeof portfolioState!=='undefined'&&portfolioState.tab==='collections'&&typeof carteraPaintCollections==='function')carteraPaintCollections();}catch(error){}
 return result;
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
 const subject=carteraFill(carteraTemplate('confirmacion','subject'),vars);
 const confirmation=carteraFill(carteraTemplate('confirmacion','email'),vars);
 const rules=carteraCobranzaRead().mail;
 if(rules.enabled&&rules.stages.confirmacion){
  const to=p.patient&&p.patient.email||'Sin correo';
  carteraLogDemoEmail(p,{key:'correo|'+p.id+'|confirmacion|'+entry.id,at:entry.createdAt,stage:'confirmacion',due:compromiseDate,subject,body:confirmation,to,cc:rules.cc||''});
 }
 if(typeof carteraResave==='function')carteraResave();
 return {ok:true,agreement:entry,email:rules.enabled&&rules.stages.confirmacion?confirmation:''};
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
 const rules=carteraCobranzaRead().mail;
 const send=!!(rules.enabled&&rules.stages.recibo);
 const preview=carteraEmailPreviewText({to:receipt.email,cc:send?rules.cc:'',subject,body});
 const stored=Object.assign({},receipt,{to:receipt.email,cc:send?rules.cc||'':'',subject,body,preview,attachment:'recibo-'+receipt.code+'.html',status:send?'Enviado (demo)':'Registrado'});
 const app=p.application||(p.application={});
 (app.carteraReceipts||(app.carteraReceipts=[])).push(stored);
 if(send)carteraLogDemoEmail(p,{key:'correo|'+p.id+'|recibo|'+stored.id,at:stored.at,stage:'recibo',due:stored.date,subject,body,to:receipt.email||'Sin correo',cc:rules.cc||'',comment:preview+' \nAdjunto: '+stored.attachment});
 if(typeof carteraResave==='function')carteraResave();
 carteraUiState.lastReceipt=stored;
 const lines=carteraReceiptRows(stored).map(([label,amount])=>`<tr><td>${escapeHtml(label)}</td><td>${fmtMoney(amount||0)}</td></tr>`).join('');
 const html=`<div class="modal-head"><div><h3>Recibo de pago</h3><p>${escapeHtml(stored.name)} · ${escapeHtml(stored.code)}</p></div><button class="x" type="button" onclick="closeModal()">×</button></div><div class="modal-body"><section class="cartera-receipt" id="carteraReceiptSheet"><h4>PULZZO</h4><div class="cartera-receipt-grid"><div><span>Cliente</span><strong>${escapeHtml(stored.name)}</strong></div><div><span>Crédito</span><strong>${escapeHtml(stored.code)}</strong></div><div><span>Fecha</span><strong>${escapeHtml(stored.date)}</strong></div><div><span>Monto</span><strong>${fmtMoney(stored.amount||0)}</strong></div></div><table class="cartera-receipt-table"><tbody>${lines}</tbody></table><p>Saldo anterior ${fmtMoney(stored.before||0)} · Saldo posterior ${fmtMoney(stored.after||0)}</p><p>Próximo pago: ${escapeHtml(stored.next)}</p></section><section class="cartera-fase1"><h4>Correo simulado · ${escapeHtml(stored.status||'Registrado')}</h4><div class="cartera-receipt-grid"><div><span>Para</span><strong>${escapeHtml(stored.to||'Sin correo')}</strong></div><div><span>Copia</span><strong>${escapeHtml(stored.cc||'—')}</strong></div><div><span>Asunto</span><strong>${escapeHtml(subject)}</strong></div><div><span>Adjunto</span><strong>${escapeHtml(stored.attachment)}</strong></div></div><pre>${escapeHtml(stored.preview||body)}</pre></section></div><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="carteraPrintReceipt()">Imprimir</button><button type="button" class="btn btn-secondary" onclick="carteraDownloadReceipt()">Descargar</button><button type="button" class="btn btn-primary" onclick="closeModal()">Cerrar</button></div>`;
 if(typeof modal==='function'&&typeof carteraCanUseModal==='function'&&carteraCanUseModal())modal(html);
 return stored;
}
function carteraPrintReceipt(){const receipt=carteraUiState.lastReceipt;if(!receipt||typeof window==='undefined'||!window.open)return false;const win=window.open('','_blank','noopener');if(!win)return false;win.document.open();win.document.write(carteraReceiptDocument(receipt));win.document.close();return true;}
function carteraDownloadReceipt(){const receipt=carteraUiState.lastReceipt;if(!receipt)return false;const blob=new Blob([carteraReceiptDocument(receipt).replace('<script>window.onload=function(){setTimeout(function(){window.print();},250);}</script>','')],{type:'text/html'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=receipt.attachment||'recibo.html';document.body.appendChild(link);if(typeof link.click==='function')link.click();if(typeof link.remove==='function')link.remove();URL.revokeObjectURL(url);return true;}
function carteraStoredReceipt(id,receiptId){
 const p=(db.patients||[]).find(item=>item&&item.id===id);if(!p)return null;
 const receipt=(((p.application||{}).carteraReceipts)||[]).find(item=>item&&item.id===receiptId);
 if(!receipt)return null;
 carteraUiState.lastReceipt=receipt;
 return receipt;
}
function carteraDownloadStoredReceipt(id,receiptId){if(!carteraStoredReceipt(id,receiptId))return false;return carteraDownloadReceipt();}
function carteraOpenReceiptPreview(id,receiptId){
 const receipt=carteraStoredReceipt(id,receiptId);if(!receipt)return false;
 const lines=carteraReceiptRows(receipt).map(([label,amount])=>`<tr><td>${escapeHtml(label)}</td><td>${fmtMoney(amount||0)}</td></tr>`).join('');
 const html=`<div class="modal-head"><div><h3>Recibo de pago</h3><p>${escapeHtml(receipt.name||'')} · ${escapeHtml(receipt.code||'')}</p></div><button class="x" type="button" onclick="closeModal()">×</button></div><div class="modal-body"><section class="cartera-receipt"><h4>PULZZO</h4><p>${escapeHtml(receipt.status||'Enviado (demo)')}</p><table class="cartera-receipt-table"><tbody>${lines}</tbody></table><p>Saldo anterior ${fmtMoney(receipt.before||0)} · Saldo posterior ${fmtMoney(receipt.after||0)}</p><p>Próximo pago: ${escapeHtml(receipt.next||'')}</p></section><section class="cartera-fase1"><h4>Correo simulado · ${escapeHtml(receipt.status||'Enviado (demo)')}</h4><div class="cartera-receipt-grid"><div><span>Para</span><strong>${escapeHtml(receipt.to||receipt.email||'Sin correo')}</strong></div><div><span>Copia</span><strong>${escapeHtml(receipt.cc||'—')}</strong></div><div><span>Asunto</span><strong>${escapeHtml(receipt.subject||'')}</strong></div><div><span>Adjunto</span><strong>${escapeHtml(receipt.attachment||'')}</strong></div></div><pre>${escapeHtml(receipt.preview||receipt.body||'')}</pre></section></div><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="carteraDownloadReceipt()">Descargar</button><button type="button" class="btn btn-primary" onclick="closeModal()">Cerrar</button></div>`;
 if(typeof modal==='function'&&typeof carteraCanUseModal==='function'&&carteraCanUseModal())modal(html);
 return receipt;
}
function carteraFmtProfileDate(value){const raw=String(value||'').slice(0,10);if(!raw)return '—';return typeof formatMaybeDate==='function'?formatMaybeDate(raw):raw;}
function carteraCopyIcon(){return '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"></rect><path d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" stroke-width="1.8"></path></svg>';}
function carteraWhatsappIcon(){return '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 3.2A8.7 8.7 0 0 0 4.4 16.3L3.2 20.8l4.6-1.2A8.8 8.8 0 1 0 12 3.2zm4.9 12.4c-.2.6-1.2 1.1-1.7 1.1-.4.1-.9.2-2.9-.6-2.4-1-4-3.5-4.1-3.6-.1-.2-1.2-1.6-1.2-3s.8-2.1 1-2.4c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5.2.6.8 2 .8 2.1.1.1.1.3 0 .5-.1.2-.2.3-.3.5l-.2.3c-.1.1-.2.2-.1.4.1.2.6 1 1.3 1.6.9.8 1.6 1 1.8 1.1.2.1.3.1.4-.1.1-.1.5-.6.6-.8.2-.2.3-.2.5-.1.2.1 1.4.7 1.6.8.2.1.4.2.4.3.1.2.1.7-.1 1.3z"></path></svg>';}
function carteraCopyButton(value,label){const text=String(value||'').trim();if(!text)return '';return `<button type="button" class="cartera-contact-icon" data-copy="${escapeAttr(text)}" onclick="carteraCopyContact(this)" aria-label="${escapeAttr(label)}">${carteraCopyIcon()}</button>`;}
function carteraPlainWhatsapp(phone){const digits=carteraPhoneDigits(phone);return digits?'https://wa.me/'+digits:'';}
function carteraTelHref(phone){const digits=carteraPhoneDigits(phone);return digits?'tel:+'+digits:'';}
function carteraPhoneActions(phone,label){
 const value=String(phone||'').trim();
 if(!value)return '<span class="cartera-contact-empty">Sin celular</span>';
 const tel=carteraTelHref(value),wa=carteraPlainWhatsapp(value);
 return `<div class="cartera-contact">${label?`<span class="cartera-contact-label">${escapeHtml(label)}</span>`:''}<span class="cartera-contact-value">${escapeHtml(value)}</span><span class="cartera-contact-actions"><a class="cartera-contact-link" href="${escapeAttr(tel)}">Llamar</a>${wa?`<a class="cartera-contact-icon" href="${escapeAttr(wa)}" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp sin plantilla">${carteraWhatsappIcon()}</a>`:''}${carteraCopyButton(value,'Copiar celular')}</span></div>`;
}
function carteraMailActions(email,label){
 const value=String(email||'').trim();
 if(!value)return '<span class="cartera-contact-empty">Sin correo</span>';
 return `<div class="cartera-contact">${label?`<span class="cartera-contact-label">${escapeHtml(label)}</span>`:''}<a class="cartera-contact-link cartera-contact-mail" href="mailto:${escapeAttr(value)}">${escapeHtml(value)}</a>${carteraCopyButton(value,'Copiar correo')}</div>`;
}
function carteraContactBlock(patient){patient=patient||{};return `<div class="cartera-contact-block">${carteraPhoneActions(patient.phone,'Celular')}${carteraMailActions(patient.email,'Correo')}</div>`;}
function carteraCopyFallback(text){
 try{
  const area=document.createElement('textarea');
  area.value=text;
  if(document.body&&document.body.appendChild)document.body.appendChild(area);
  if(typeof area.select==='function')area.select();
  const ok=typeof document.execCommand==='function'&&document.execCommand('copy');
  if(typeof area.remove==='function')area.remove();
  if(typeof toast==='function')toast(ok?'Copiado.':'No se pudo copiar.');
  return !!ok;
 }catch(error){if(typeof toast==='function')toast('No se pudo copiar.');return false;}
}
function carteraCopyContact(node){
 const value=node&&node.getAttribute?node.getAttribute('data-copy'):String(node||'');
 const text=String(value||'').trim();
 if(!text){if(typeof toast==='function')toast('No hay dato para copiar.');return false;}
 if(typeof navigator!=='undefined'&&navigator.clipboard&&typeof navigator.clipboard.writeText==='function'){
  Promise.resolve(navigator.clipboard.writeText(text)).then(()=>{if(typeof toast==='function')toast('Copiado.');}).catch(()=>carteraCopyFallback(text));
  return true;
 }
 return carteraCopyFallback(text);
}
function carteraProfileStageHtml(p){
 const stage=carteraCollectionStage(p);
 const facts=carteraFactsForPatient(p);
 const patient=p.patient||{};
 const sent=carteraMessageLog(p).slice(-1)[0];
 const lead=[['Etapa de cobranza',stage.label],['Días de atraso',String(facts.dpd||0)],['Monto a cobrar',fmtMoney(stage.amount||facts.amount||0)],['Próximo vencimiento',facts.next&&facts.next.date||facts.due||'—']];
 const tail=[['Último recordatorio',sent?sent.action+' · '+String(sent.at||'').slice(0,10):'—'],['Acuerdo',carteraAgreementLabel(carteraDeriveAgreement(p))]];
 const text=rows=>rows.map(([label,value])=>`<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`).join('');
 return `<div class="cartera-profile-meta">${text(lead)}<div><span>Celular</span>${carteraPhoneActions(patient.phone)}</div><div><span>Correo</span>${carteraMailActions(patient.email)}</div>${text(tail)}</div>`;
}
function carteraAmortizationTable(p){
 let rows=[];
 try{rows=typeof dispersionBuildSchedule==='function'?dispersionBuildSchedule(p):(p.paymentSchedule||[]);}catch(error){rows=[];}
 const body=rows.map(row=>{
  const pending=typeof portfolioPending==='function'?portfolioPending(row):dispersionNumber(row.pendingAmount,0);
  const due=row.currentDueDate||row.dueDate||'';
  const original=row.originalDueDate&&String(row.originalDueDate).slice(0,10)!==String(due).slice(0,10)?`<br><small>Original: ${escapeHtml(carteraFmtProfileDate(row.originalDueDate))}</small>`:'';
  const status=typeof dispersionPill==='function'?dispersionPill(row.status):escapeHtml(row.status||'Pendiente');
  const frequency=String(row.paymentFrequency||(p.application&&p.application.paymentFrequency)||'');
  const kind=row.type==='Pago inicial requerido'?'Pago inicial':frequency.toLowerCase().indexOf('biweek')>=0||frequency.toLowerCase().indexOf('quinc')>=0?'Pago quincenal':'Mensualidad';
  const selected=row.id&&row.id===carteraUiState.rowId?' class="is-selected"':'';
  return `<tr${selected}><td>${escapeHtml(row.number||'')}</td><td>${escapeHtml(kind)}</td><td>${escapeHtml(carteraFmtProfileDate(due))}${original}</td><td>${fmtMoney(row.interest||0)}</td><td>${fmtMoney(row.interestIva||0)}</td><td>${fmtMoney(row.moratory||row.interesMora||0)}</td><td>${fmtMoney(row.capital||0)}</td><td>${fmtMoney(row.totalPayment||0)}</td><td>${fmtMoney(pending)}</td><td>${status}</td><td><button class="amortization-manage-button" type="button" onclick="carteraOpenProfileRow('${escapeAttr(p.id)}','${escapeAttr(row.id||'')}')">Gestionar</button></td></tr>`;
 }).join('');
 return `<div class="cartera-profile-block"><h4>Tabla de amortización</h4><div class="table-wrap cartera-amortization-wrap"><table class="portfolio-table"><thead><tr><th>#</th><th>Tipo</th><th>Fecha vigente</th><th>Interés</th><th>IVA</th><th>Moratorios</th><th>Capital</th><th>Pago</th><th>Pendiente</th><th>Estatus</th><th></th></tr></thead><tbody>${body||'<tr><td colspan="11">Sin cuotas.</td></tr>'}</tbody></table></div></div>`;
}
function carteraReceiptListHtml(p){
 const list=(((p.application||{}).carteraReceipts)||[]).slice().reverse();
 const rows=list.map(receipt=>`<li><span><strong>${escapeHtml(receipt.date||'')} · ${fmtMoney(receipt.amount||0)}</strong><br>${escapeHtml(receipt.status||'Enviado (demo)')}</span><span class="portfolio-actions"><button type="button" class="btn btn-sm btn-secondary" onclick="carteraDownloadStoredReceipt('${escapeAttr(p.id)}','${escapeAttr(receipt.id||'')}')">Descargar</button><button type="button" class="btn btn-sm btn-secondary" onclick="carteraOpenReceiptPreview('${escapeAttr(p.id)}','${escapeAttr(receipt.id||'')}')">Ver correo</button></span></li>`).join('');
 return `<div class="cartera-profile-block"><h4>Recibos</h4>${rows?`<ul class="cartera-profile-list">${rows}</ul>`:'<p>Sin recibos registrados.</p>'}</div>`;
}
function carteraAgreementListHtml(p){
 const events=carteraAgreementEvents(p).filter(item=>item&&item.type==='created');
 const items=events.map(item=>`<li>Compromiso ${escapeHtml(item.compromiseDate||'')} · ${fmtMoney(item.amount||0)} · vencimiento original ${escapeHtml(item.originalDue||'—')} · cuota ${escapeHtml(String(item.installmentNumber||'—'))}</li>`).join('');
 return `<div class="cartera-profile-block"><h4>Acuerdos de pago</h4><p>Estado: ${escapeHtml(carteraAgreementLabel(carteraDeriveAgreement(p)))}. La cuota y el vencimiento original quedan congelados.</p>${items?`<ul class="cartera-profile-list">${items}</ul>`:'<p>Sin acuerdos de pago.</p>'}</div>`;
}
function carteraContactListHtml(p){
 const calls=((p.application||{}).carteraContacts)||[];
 const rows=calls.map(item=>({at:item.at,label:item.channel==='llamada'?'Llamada':item.channel||'Contacto',text:item.note||''})).concat(carteraMessageLog(p).map(item=>({at:item.at,label:item.action||item.channel||'Contacto',text:item.channel==='correo'?'':(item.comment||item.subject||''),preview:item.channel==='correo'?(item.comment||carteraEmailPreviewText(item)):''})));
 rows.sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
 const items=rows.map(item=>`<li><span><strong>${escapeHtml(item.label)}</strong> · ${escapeHtml(String(item.at||'').slice(0,10))}</span>${item.preview?`<pre class="cartera-fase1">${escapeHtml(item.preview)}</pre>`:`<span>${escapeHtml(item.text||'')}</span>`}</li>`).join('');
 return `<div class="cartera-profile-block"><h4>Historial de contacto</h4>${items?`<ul class="cartera-profile-list">${items}</ul>`:'<p>Sin contactos registrados.</p>'}</div>`;
}
function carteraCreditWorkspaceHtml(req){
 const app=req.application||{};
 const base=app.interestCalculationBase==='outstanding_balance'?'Saldos insolutos':'Saldos globales';
 const frequency=String(app.paymentFrequency||'').toLowerCase().indexOf('biweek')>=0||String(app.paymentFrequency||'').toLowerCase().indexOf('quinc')>=0?'Quincenal':'Mensual';
 const focused=!!(carteraUiState&&carteraUiState.hostId===req.id);
 const panel=focused&&typeof carteraPanelHtml==='function'?carteraPanelHtml(req):'';
 const id=typeof escapeAttr==='function'?escapeAttr(req.id):req.id;
 return `<article class="cartera-profile-credit${focused?' is-active':''}"><div class="cartera-profile-credit-head"><div><h4>${escapeHtml(req.id)}</h4><p>${escapeHtml(app.procedure||'Crédito')} · ${frequency} · ${base}${app.carteraDemoState?' · '+escapeHtml(app.carteraDemoState):''}</p></div><div class="portfolio-actions"><button type="button" class="btn btn-sm btn-secondary" onclick="carteraOpenWhatsapp('${id}')">WhatsApp</button><button type="button" class="btn btn-sm btn-secondary" onclick="carteraMarkWhatsapp('${id}')">Marcar WhatsApp enviado</button><button type="button" class="btn btn-sm btn-secondary" onclick="carteraOpenMailPreview('${id}')">Correo</button><button type="button" class="btn btn-sm btn-secondary" onclick="carteraOpenAgreement('${id}')">Acuerdo</button><button type="button" class="btn btn-sm btn-secondary" onclick="carteraOpenContact('${id}')">Llamada</button><button type="button" class="btn btn-sm btn-primary" onclick="carteraOpenPayment('${id}')">Aplicar pago</button></div></div>${carteraProfileStageHtml(req)}${panel}${carteraAmortizationTable(req)}${carteraReceiptListHtml(req)}${carteraAgreementListHtml(req)}${carteraContactListHtml(req)}</article>`;
}
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
 const focus=typeof portfolioState!=='undefined'&&portfolioState.collectionFocus||'';
 const focusLabels={cobranza:'En cobranza',vence_hoy:'Vence hoy',precobranza:'Precobranza',sin_accion:'Sin acción'};
 const listed=focus&&typeof portfolioCollectionBucket==='function'?credits.filter(credit=>portfolioCollectionBucket(credit)===focus):credits;
 const banner=focus?`<p class="portfolio-summary-note">Bandeja de hoy: ${focusLabels[focus]||''}. <button type="button" class="portfolio-link" data-collection="clear">Ver toda la cobranza</button></p>`:'';
 const rows=listed.map(credit=>{
  const stage=carteraCollectionStage(credit);
  const facts=carteraCreditFacts(credit);
  const agreement=carteraDeriveAgreement(credit.record);
  const patient=credit.record.patient||{};
  const sent=(carteraMessageLog(credit.record).slice(-1)[0]);
  const actions=stage.channel?`<button type="button" class="btn btn-sm btn-secondary" onclick="carteraOpenWhatsapp('${escapeAttr(credit.id)}')">WhatsApp</button><button type="button" class="btn btn-sm btn-secondary" onclick="carteraMarkWhatsapp('${escapeAttr(credit.id)}')">Marcar WhatsApp enviado</button><button type="button" class="btn btn-sm btn-secondary" onclick="carteraOpenMailPreview('${escapeAttr(credit.id)}')">Correo</button>`:'<span class="pill pill-gray">Sin mensaje automático</span>';
  return `<tr><td>${escapeHtml(credit.name)}<small>${escapeHtml(credit.code)}</small></td><td>${escapeHtml(stage.label)}</td><td>${facts.dpd}</td><td>${fmtMoney(stage.amount||facts.amount||0)}</td><td>${escapeHtml(facts.next&&facts.next.date||'—')}</td><td>${escapeHtml(facts.oldest&&facts.oldest.date||'—')}</td><td>${carteraPhoneActions(patient.phone)}</td><td>${carteraMailActions(patient.email)}</td><td>${sent?escapeHtml(sent.action+' · '+String(sent.at).slice(0,10)):'—'}</td><td>${escapeHtml(carteraAgreementLabel(agreement))}</td><td>${actions}<button type="button" class="btn btn-sm btn-primary" onclick="carteraOpenPayment('${escapeAttr(credit.id)}')">Aplicar pago</button><button type="button" class="btn btn-sm btn-secondary" onclick="carteraOpenAgreement('${escapeAttr(credit.id)}')">Acuerdo</button><button type="button" class="btn btn-sm btn-secondary" onclick="carteraOpenContact('${escapeAttr(credit.id)}')">Llamada</button></td></tr>`;
 }).join('');
 return carteraMailSummaryHtml(credits)+banner+`<p>Una fila por crédito. Llamar usa el teléfono, el ícono abre WhatsApp sin plantilla y el correo abre el programa de correo. WhatsApp se marca con Marcar WhatsApp enviado. El correo automático queda como Enviado (demo). No hay envío real.</p><div class="table-wrap portfolio-desktop-table"><table class="portfolio-table"><thead><tr><th>Cliente</th><th>Etapa de hoy</th><th>Días de atraso</th><th>Monto a cobrar</th><th>Próximo vencimiento</th><th>Vencido más antiguo</th><th>Celular</th><th>Correo</th><th>Último recordatorio</th><th>Acuerdo</th><th>Acciones</th></tr></thead><tbody>${rows||`<tr><td colspan="11">${focus?'Sin créditos en esta bandeja.':'Sin créditos en cartera.'}</td></tr>`}</tbody></table></div>`;
}
function carteraMailSummaryHtml(credits){
 const digest=carteraMailDigest(credits);
 const block=(title,rows,empty)=>`<section><h4>${title}</h4><p>${rows.length}</p>${rows.length?`<ul>${rows.map(row=>`<li><strong>${escapeHtml(row.title)}</strong><span>${escapeHtml(row.meta||'')}</span>${row.preview?`<pre class="cartera-fase1">${escapeHtml(row.preview)}</pre>`:''}</li>`).join('')}</ul>`:`<p>${empty}</p>`}</section>`;
 return `<section class="cartera-fase1 cartera-mail-summary" aria-label="Resumen diario de cobranza"><div class="cartera-mail-head"><div><h4>Resumen de hoy</h4><p>La corrida demo usa la hora guardada en America/Mexico_City. No sale ningún correo real.</p></div><span class="pill pill-gray">Correo no conectado · modo demo</span></div><div class="cartera-actions"><button type="button" class="btn btn-primary" onclick="carteraRunMailNow()">Ejecutar ahora</button></div><div class="cartera-mail-grid">${block('Acciones de hoy',digest.actions,'Sin correos demo hoy.')}${block('Pausados',digest.paused,'Sin pausas.')}${block('Mora 31+',digest.mora,'Sin créditos en mora 31+.')}</div></section>`;
}
function carteraPaintCollections(){const target=document.getElementById('portfolioContent');if(target)target.innerHTML=carteraCollectionsHtml();}
function carteraOpenAgreement(id){
 const p=(db.patients||[]).find(item=>item.id===id);if(!p)return false;
 const current=carteraDeriveAgreement(p);
 const history=carteraAgreementEvents(p).map(item=>`<li>${escapeHtml(item.type==='created'?'Registrado':'Actualización')} · ${escapeHtml(item.compromiseDate||item.status||'')} · ${escapeHtml(item.originalDue?'Vencimiento original '+item.originalDue:'')}</li>`).join('');
 const html=`<div class="modal-head"><div><h3>Acuerdo de pago</h3><p>${escapeHtml(p.patient&&p.patient.fullName||p.id)}</p></div><button class="x" type="button" onclick="closeModal()">×</button></div><div class="modal-body"><p>Estado: ${escapeHtml(carteraAgreementLabel(current))}. La cuota y el vencimiento original quedan congelados.</p><div class="cartera-form cartera-form-stack"><label class="field">Fecha del acuerdo<input id="acuerdoFecha" type="date" value="${carteraToday()}"></label><label class="field">Fecha de compromiso<input id="acuerdoCompromiso" type="date" value="${carteraAddDays(carteraToday(),5)}"></label><label class="field">Monto comprometido<input id="acuerdoMonto" type="number" min="0" step="0.01" inputmode="decimal"></label><label class="field">Monto fijo de moratorios<input id="acuerdoCondonacion" type="number" min="0" step="0.01" inputmode="decimal"></label></div><div class="cartera-choices cartera-choices-sub" role="group" aria-label="Condonación"><button type="button" class="cartera-choice" data-forgiveness="none" aria-pressed="true" onclick="carteraChooseForgiveness('none')">No</button><button type="button" class="cartera-choice" data-forgiveness="moratory_total" aria-pressed="false" onclick="carteraChooseForgiveness('moratory_total')">Total moratorios</button><button type="button" class="cartera-choice" data-forgiveness="fixed" aria-pressed="false" onclick="carteraChooseForgiveness('fixed')">Monto fijo</button></div><input id="acuerdoCondonacionTipo" type="hidden" value="none"><p>No se condona capital ni interés ordinario. El monto lo autoriza un líder o un administrador.</p><ul>${history||'<li>Sin acuerdos previos.</li>'}</ul></div><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Cerrar</button><button type="button" class="btn btn-secondary" onclick="carteraApplyForgivenessUi('${escapeAttr(id)}')">Aplicar condonación</button><button type="button" class="btn btn-primary" onclick="carteraSaveAgreement('${escapeAttr(id)}')">Registrar acuerdo</button></div>`;
 if(typeof modal==='function')modal(html);
 const box=document.getElementById&&document.getElementById('modal');if(box)box.className='modal cartera-agreement-modal';
 return true;
}
function carteraChooseForgiveness(value){const input=document.getElementById('acuerdoCondonacionTipo');if(input)input.value=value;document.querySelectorAll('[data-forgiveness]').forEach(button=>button.setAttribute('aria-pressed',String(button.getAttribute('data-forgiveness')===value)));}
function carteraSaveAgreement(id){
 const result=carteraRegisterAgreement(id,{agreementDate:document.getElementById('acuerdoFecha').value,compromiseDate:document.getElementById('acuerdoCompromiso').value,amount:document.getElementById('acuerdoMonto').value,forgiveness:document.getElementById('acuerdoCondonacionTipo').value,forgivenessAmount:document.getElementById('acuerdoCondonacion').value});
 if(!result.ok){if(typeof toast==='function')toast(result.error);return false;}
 if(typeof toast==='function')toast(carteraCobranzaRead().mail.enabled&&carteraCobranzaRead().mail.stages.confirmacion?'Acuerdo registrado. La confirmación quedó como Enviado (demo).':'Acuerdo registrado.');
 if(typeof closeModal==='function')closeModal();
 carteraRefreshSurface();
 return true;
}
function carteraApplyForgivenessUi(id){const result=carteraApplyForgiveness(id);if(!result.ok){if(typeof toast==='function')toast(result.error);return false;}if(typeof toast==='function')toast('Condonación aplicada solo a moratorios.');if(typeof closeModal==='function')closeModal();carteraRefreshSurface();return true;}
function carteraOpenContact(id){const html=`<div class="modal-head"><div><h3>Registrar llamada</h3></div><button class="x" type="button" onclick="closeModal()">×</button></div><div class="modal-body"><label class="field">Nota<textarea id="carteraContactNote" rows="4"></textarea></label></div><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Cerrar</button><button type="button" class="btn btn-primary" onclick="carteraSaveContact('${id}')">Guardar</button></div>`;if(typeof modal==='function')modal(html);return true;}
function carteraSaveContact(id){const ok=carteraLogContact(id,'llamada',document.getElementById('carteraContactNote').value);if(ok&&typeof closeModal==='function')closeModal();if(ok)carteraRefreshSurface();return ok;}
function carteraCobranzaSettingsHtml(){
 const config=carteraCobranzaRead();
 const days=[['precobranza','Precobranza, días antes'],['day1','Cobranza día'],['day3','Cobranza día'],['dailyFrom','Seguimiento desde'],['dailyTo','Seguimiento hasta'],['earlyFrom','Mora temprana desde'],['earlyTo','Mora temprana hasta'],['restructureFrom','Candidato a reestructura desde'],['restructureTo','Candidato a reestructura hasta'],['externalFrom','Cobranza externa desde']];
 const dayFields=days.map(([key,label])=>`<label class="field">${label}<input id="cobranza-${key}" type="number" min="0" step="1" value="${escapeAttr(config.days[key])}"></label>`).join('');
 const templates=CARTERA_TEMPLATE_IDS.map(([id,label])=>`<details><summary>${label}</summary><label class="field">Asunto<input id="plantilla-${id}-subject" value="${escapeAttr(config.templates[id+'_subject']||'')}"></label><label class="field">Correo<textarea id="plantilla-${id}-email" rows="5">${escapeHtml(config.templates[id+'_email']||'')}</textarea></label><label class="field">WhatsApp<textarea id="plantilla-${id}-whatsapp" rows="3">${escapeHtml(config.templates[id+'_whatsapp']||'')}</textarea></label></details>`).join('');
 const switches=CARTERA_MAIL_STAGES.map(([id,label])=>`<label class="pz-switch" for="cobranza-mail-${id}"><input id="cobranza-mail-${id}" type="checkbox" role="switch" ${config.mail.stages[id]?'checked':''}><span class="pz-switch-track" aria-hidden="true"></span><span class="pz-switch-text">${escapeHtml(label)}</span></label>`).join('');
 const mail=`<section class="cfg-policy" aria-label="Envío automático de correos"><div class="cartera-mail-head"><div><h3>Envío automático de correos</h3><p>Las reglas quedan listas para cuando el correo esté conectado. En esta demo no sale ningún correo real. Guarda antes de ejecutar.</p></div><span class="pill pill-gray">Correo no conectado · modo demo</span></div><label class="pz-switch" for="cobranza-mail-enabled"><input id="cobranza-mail-enabled" type="checkbox" role="switch" ${config.mail.enabled?'checked':''}><span class="pz-switch-track" aria-hidden="true"></span><span class="pz-switch-text">Envío automático de correos</span></label><div class="cartera-form"><label class="field">Hora de envío<input id="cobranza-mail-time" type="time" value="${escapeAttr(config.mail.sendTime)}"></label><div class="field"><span>Zona horaria</span><strong>${escapeHtml(CARTERA_MAIL_TIMEZONE)}</strong></div><label class="field is-wide">Copia (CC)<input id="cobranza-mail-cc" type="text" inputmode="email" autocomplete="off" placeholder="copia@pulzzo.mx" value="${escapeAttr(config.mail.cc)}"></label></div><h4>Etapas con envío automático</h4><div class="pz-switch-list cartera-mail-switches">${switches}</div><p>Mora 31+ no se envía automáticamente. El envío se pausa con acuerdo vigente y con condonación pendiente de aplicar. WhatsApp sigue manual con Marcar WhatsApp enviado.</p><div class="cartera-actions"><button type="button" class="btn btn-secondary" onclick="carteraRunMailNow()">Ejecutar ahora</button></div></section>`;
 return mail+`<section class="cfg-policy"><h3>Cobranza y plantillas</h3><p>Los días y los textos se guardan en este navegador. {datos_pago} usa el texto de abajo. No hay envío real.</p><div class="cartera-form">${dayFields}<label class="field is-wide">Datos de pago<input id="cobranza-payment-data" value="${escapeAttr(config.paymentData)}"></label></div>${templates}<div class="cartera-actions"><button type="button" class="btn btn-primary" onclick="carteraSaveCobranzaSettings()">Guardar cobranza</button></div></section>`;
}
function carteraSaveCobranzaSettings(){
 const read=id=>{const node=document.getElementById(id);return node?node.value:'';};
 const days={};
 for(const key of Object.keys(CARTERA_DAY_DEFAULTS)){const value=Number(read('cobranza-'+key));if(!Number.isInteger(value)||value<0||value>365){if(typeof toast==='function')toast('Revisa los días de '+key+'.');return false;}days[key]=value;}
 if(!(days.precobranza>=1)||!(days.day3>days.day1)||!(days.dailyFrom>days.day3)||!(days.dailyTo>=days.dailyFrom)||!(days.earlyFrom>days.dailyTo)||!(days.earlyTo>=days.earlyFrom)||!(days.restructureFrom>days.earlyTo)||!(days.restructureTo>=days.restructureFrom)||!(days.externalFrom>days.restructureTo)){if(typeof toast==='function')toast('Las etapas deben ir en orden y sin empalmarse.');return false;}
 const templates={};
 CARTERA_TEMPLATE_IDS.forEach(([id])=>{templates[id+'_subject']=read('plantilla-'+id+'-subject')||carteraTemplate(id,'subject');templates[id+'_email']=read('plantilla-'+id+'-email')||carteraTemplate(id,'email');templates[id+'_whatsapp']=read('plantilla-'+id+'-whatsapp')||carteraTemplate(id,'whatsapp');});
 const enabledNode=document.getElementById('cobranza-mail-enabled');
 const time=read('cobranza-mail-time');
 if(enabledNode&&!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)){if(typeof toast==='function')toast('La hora de envío usa el formato 24 horas, por ejemplo 09:00.');return false;}
 const cc=enabledNode?carteraValidCc(read('cobranza-mail-cc')):'';
 if(enabledNode&&cc===null){if(typeof toast==='function')toast('Revisa el correo de la copia. Separa varios con coma.');return false;}
 const stages={};
 if(enabledNode)CARTERA_MAIL_STAGES.forEach(([id])=>{const node=document.getElementById('cobranza-mail-'+id);stages[id]=!!(node&&node.checked);});
 const mail=enabledNode?{enabled:!!enabledNode.checked,sendTime:time,timezone:CARTERA_MAIL_TIMEZONE,cc,stages}:undefined;
 carteraCobranzaWrite({days,paymentData:read('cobranza-payment-data')||'Datos de pago · pendiente',templates,mail});
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
if(typeof portfolioCreditCell==='function'&&!portfolioCreditCell.carteraContact){
 const carteraOriginalCreditCell=portfolioCreditCell;
 portfolioCreditCell=function(c){
  const patient=c&&c.record&&c.record.patient||{};
  return carteraOriginalCreditCell(c)+carteraContactBlock(patient);
 };
 portfolioCreditCell.carteraContact=true;
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
try{carteraRunAutomaticMail({source:'load'});}catch(error){}
Object.assign(globalThis,{carteraToday,carteraAddDays,carteraCobranzaRead,carteraCobranzaWrite,carteraTemplate,carteraFill,carteraCollectionStage,carteraCreditFacts,carteraFactsForPatient,carteraDeriveAgreement,carteraAgreementLabel,carteraMessageKey,carteraMessageSent,carteraRememberMessage,carteraWhatsappLink,carteraOpenWhatsapp,carteraMarkWhatsapp,carteraOpenMailPreview,carteraLogMail,carteraLogContact,carteraRegisterAgreement,carteraApplyForgiveness,carteraPresentReceipt,carteraReceiptFromResult,carteraReceiptDocument,carteraDownloadReceipt,carteraPrintReceipt,carteraOpenAgreement,carteraSaveAgreement,carteraChooseForgiveness,carteraApplyForgivenessUi,carteraOpenContact,carteraSaveContact,carteraAging,carteraSeedStageCredits,carteraBuildStageCredit,carteraSaveCobranzaSettings,carteraCobranzaSettingsHtml,carteraCreditWorkspaceHtml,carteraDownloadStoredReceipt,carteraOpenReceiptPreview,carteraCopyContact,carteraPhoneActions,carteraMailActions,carteraRunAutomaticMail,carteraRunMailNow,carteraEmailPreviewText,carteraMailDigest,carteraMailToggleForStage,CARTERA_COBRANZA_KEY,CARTERA_MAIL_STAGES,CARTERA_MAIL_TIMEZONE});
})();
