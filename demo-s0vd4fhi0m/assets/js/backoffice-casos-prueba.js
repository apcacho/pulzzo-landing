// v68 · Casos de prueba de cartera (créditos ficticios APP-PRUEBA-*).
// Agrega una sola vez los créditos FIJOS de assets/js/backoffice-casos-prueba-data.js a la demo
// guardada, sin reiniciar ni tocar otros expedientes. Deja UN evento en el historial.
// v69 · Modo pruebas (Configuración › Cartera › Modo pruebas, solo Admin): ocultar, borrar y regenerar
//       los casos. Los mismos constructores generan el archivo fijo (scripts/build-casos-prueba.cjs).
// v69 · Datos ficticios: la demo ya no muestra nombres ni teléfonos de personas reales.
(function(){
 const SEED_ID='seed_casos_prueba_v68';
 const PREFIX=/^APP-PRUEBA-/;
 // ── Textos de cada caso (cifras aprobadas con el reloj base 25/10/2026) ─────────────────────────
 const SPECS=[
 {id:'APP-PRUEBA-GLO-1',name:'Prueba Globales Demo',group:'Extensión 29 días',
  summary:'Globales · $25,000.00 · 60% anual · 12 meses · dispersión 25/10/2026 · primera cuota 15/11/2026. Sin extensión.',
  tryText:'Aplicar pago › Extensión: «Corta, 30 días» (recomendada) cobra hoy $1,693.80; la cuota del 15/11/2026 se paga sin capital y la del 15/12/2026 sube a $5,616.66. «Al final» cobra $1,689.76 (29 días: 15/11/2026 → 14/12/2026) y deja diez cuotas de $3,533.33 y última de $5,616.70.',
  validity:'La extensión preventiva se puede probar hasta el 14/11/2026; desde el 15/11/2026 la cuota 1 vence y ya no es preventiva.'},
 {id:'APP-PRUEBA-GLO-2',name:'Prueba Globales Extendido Demo',group:'Extensión 29 días (aplicada)',
  summary:'Mismo crédito que APP-PRUEBA-GLO-1 con la extensión de 29 días ya aplicada el 25/10/2026 ($1,689.76 recibido).',
  tryText:'Ver la tabla: cuota 1 pagada (14/12/2026, capital $0.00), diez cuotas de $3,533.33 y la última de $5,616.70 (15/10/2027). Recibo de la extensión: $1,689.76.',
  validity:'Fijo; la siguiente cuota ($3,533.33) vence el 15/12/2026.'},
 {id:'APP-PRUEBA-INS-1',name:'Prueba Insolutos Demo',group:'Extensión insolutos',
  summary:'Insolutos · $25,000.00 · 60% anual · 12 meses · dispersión 25/10/2026 · primera cuota 15/11/2026. Sin extensión.',
  tryText:'Aplicar pago › Extensión: «Corta, 30 días» (recomendada) cobra hoy $1,595.00 (interés $875.00 + IVA $140.00 + comisión $500.00 + IVA $80.00); la cuota del 15/12/2026 sube a $4,911.66 (incluye $109.82 de interés extra con IVA). «Al final» cobra $580.00 hoy (comisión $500.00 + IVA $80.00): $1,015.00 el 15/11/2026 (sin capital), luego 10 × $3,146.74 y última $3,146.76.',
  validity:'La extensión preventiva se puede probar hasta el 14/11/2026.'},
 {id:'APP-PRUEBA-INS-2',name:'Prueba Insolutos Extendido Demo',group:'Extensión insolutos (aplicada)',
  summary:'Mismo crédito que APP-PRUEBA-INS-1 con la extensión ya aplicada el 25/10/2026 ($580.00 recibido).',
  tryText:'Ver la tabla: $1,015.00 el 15/11/2026 sin capital, luego 10 × $3,146.74 y última $3,146.76; saldo final $0.00.',
  validity:'Fijo; la cuota de $1,015.00 vence el 15/11/2026.'},
 {id:'APP-PRUEBA-RES-1',name:'Prueba Reestructura Demo',group:'Reestructura (antes del pago)',
  summary:'Reestructura opción B · saldo $121,564.34 · 6 meses · 36%: 5 × $22,798.78 + $22,798.75. Reestructurado el 25/09/2026; primera cuota 25/10/2026. Apertura $4,200.00 pendiente.',
  tryText:'Aplicar pago › Pago normal de $22,798.78: el capital queda en $102,996.00, la siguiente cuota es $22,798.78 el 25/11/2026 y la apertura de $4,200.00 sigue pendiente.',
  validity:'Es el caso aprobado desplazado un mes (mismas cifras). El pago de $22,798.78 deja $102,996.00 en cualquier fecha (no hay moratorios automáticos); desde el 26/10/2026 la primera cuota aparece vencida.'},
 {id:'APP-PRUEBA-RES-2',name:'Prueba Reestructura Pagada Demo',group:'Reestructura (después del pago)',
  summary:'Mismo crédito que APP-PRUEBA-RES-1 con la primera cuota pagada el 25/10/2026 ($22,798.78).',
  tryText:'Ver saldo: capital $102,996.00 igual en cartera y tabla; siguiente cuota $22,798.78 el 25/11/2026; apertura $4,200.00 pendiente.',
  validity:'Fijo; la siguiente cuota vence el 25/11/2026.'},
 {id:'APP-PRUEBA-SOB-1',name:'Prueba Sobrepago Demo',group:'Sobrepago',
  summary:'Globales · $48,000.00 · 36% · 8 meses. Cuota vencida el 24/10/2026: exigible $7,809.60 (IVA $230.40 + ordinarios $1,440.00 + capital $6,000.00 + moratorio $120.00 + IVA $19.20).',
  tryText:'Aplicar pago › Pago normal de $10,000.00: se aplica $7,809.60 a la cuota y $2,190.40 como prepago (elige reducir plazo o cuota); saldo $39,809.60 en ambos. Un pago de $60,000.00 se bloquea y muestra el monto máximo.',
  validity:'El exigible de $7,809.60 es fijo (el moratorio no crece solo). El monto máximo incluye intereses devengados del día, así que cambia con la fecha. Los días de atraso y la etapa de cobranza avanzan con el calendario.'},
 {id:'APP-PRUEBA-ULT-G1',name:'Prueba Última Cuota Globales Demo',group:'Extensión de la última cuota',
  summary:'Globales · $25,000.00 · 60% · 12 meses · dispersión 25/11/2025. Once cuotas pagadas; solo queda la última (15/11/2026, $3,533.37).',
  tryText:'Aplicar pago › Extensión: es la última cuota, así que se crea una cuota nueva el 15/12/2026 con el capital diferido ($2,083.37) y el plazo se extiende; hoy se cobra $1,693.80 (30 días).',
  validity:'Se puede probar hasta el 14/11/2026; desde el 15/11/2026 la última cuota vence.'},
 {id:'APP-PRUEBA-ULT-G2',name:'Prueba Plazo Extendido Globales Demo',group:'Extensión de la última cuota (aplicada)',
  summary:'Mismo crédito que APP-PRUEBA-ULT-G1 con la extensión de la última cuota ya aplicada: plazo extendido al 15/12/2026.',
  tryText:'Ver la etiqueta «Plazo extendido», la cuota 12 como «Extendida» y la cuota nueva del 15/12/2026.',
  validity:'Fijo; la cuota nueva vence el 15/12/2026.'},
 {id:'APP-PRUEBA-ULT-I1',name:'Prueba Última Cuota Insolutos Demo',group:'Extensión de la última cuota',
  summary:'Insolutos · $25,000.00 · 60% · 12 meses · dispersión 25/11/2025. Once cuotas pagadas; solo queda la última (15/11/2026, $2,905.04).',
  tryText:'Aplicar pago › Extensión: hoy se cobra $63.59 (comisión + IVA); el 15/11/2026 queda solo el interés del periodo ($164.27) y se crea una cuota nueva el 15/12/2026 por $2,899.74 (capital diferido + interés del nuevo periodo).',
  validity:'Se puede probar hasta el 14/11/2026.'},
 {id:'APP-PRUEBA-ULT-I2',name:'Prueba Plazo Extendido Insolutos Demo',group:'Extensión de la última cuota (aplicada)',
  summary:'Mismo crédito que APP-PRUEBA-ULT-I1 con la extensión de la última cuota ya aplicada: plazo extendido al 15/12/2026.',
  tryText:'Ver la etiqueta «Plazo extendido», el interés del periodo de $164.27 el 15/11/2026 y la cuota nueva del 15/12/2026 por $2,899.74.',
  validity:'Fijo; $164.27 vence el 15/11/2026 y la cuota nueva el 15/12/2026.'}
 ];
 // ── Constructores (mismo motor de cartera que usa el backoffice) ────────────────────────────────
 // Reloj base: 25/10/2026 12:00 (hora de la Ciudad de México). «shift» mueve todo meses completos.
 function casosClock(shift,month=0){return new Date(Date.UTC(2026,9+shift+month,25,18,0,0)).toISOString();}
 function casosShiftIsoDate(iso,shift){
  if(!shift)return iso;const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso||''));if(!m)return iso;
  const y=Number(m[1]),mo=Number(m[2])-1+shift,d=Number(m[3]);const last=new Date(Date.UTC(y,mo+1,0)).getUTCDate();
  return new Date(Date.UTC(y,mo,Math.min(d,last))).toISOString().slice(0,10);
 }
 function casosShiftText(text,shift){
  if(!shift)return text;
  return String(text).replace(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g,(all,d,m,y)=>{const iso=casosShiftIsoDate(`${y}-${m}-${d}`,shift);return iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4);});
 }
 function casosWithClock(iso,fn){
  const Real=globalThis.Date;
  class FixedDate extends Real{constructor(...a){super(...(a.length?a:[iso]));}static now(){return Real.parse(iso);}}
  globalThis.Date=FixedDate;
  try{return fn();}finally{globalThis.Date=Real;}
 }
 let casoBuildFn=null;
 // El constructor copiado se evalúa en el ámbito global; en el navegador carteraDemoSettleRow no es global
 // (función de bloque en fase1), así que se expone una copia idéntica solo si falta.
 if(typeof globalThis.carteraDemoSettleRow!=='function')globalThis.carteraDemoSettleRow=function(row){
  dispersionConceptDefs().forEach(def=>{row[def.paid]=roundToCents(dispersionNumber(row[def.total],0));row[def.pending]=0;});
  row.paidAmount=roundToCents(dispersionConceptDefs().reduce((sum,def)=>sum+dispersionNumber(row[def.paid],0),0));
  row.pendingAmount=0;row.status='Pagado';row.dpd=0;
 };
 function casoBuild(spec){
  // Mismo constructor de demos de cartera; solo se parametrizan tasa y plazo (igual que tests/extension-approved-v61.cjs).
  if(!casoBuildFn)casoBuildFn=(0,eval)('('+carteraBuildDemoCredit.toString().replace('ordinaryAnnualRate:0.36,annualInterestRate:36,termMonths:8','ordinaryAnnualRate:spec.rate??0.36,annualInterestRate:spec.ratePct??36,termMonths:spec.term??8')+')');
  return casoBuildFn(spec);
 }
 function casoBase(id,base,extra){const p=casoBuild(Object.assign({id,name:id,state:'Caso de prueba',base,frequency:'monthly',offset:0,payPast:false,amount:25000,rate:0.6,ratePct:60,term:12,procedure:'Procedimiento ficticio de prueba',doctor:'Dra. Ficticia Prueba',phone:'55 0000 0000',curp:'XEXX010101HNEXXXA4',rfc:'XEXX010101000',email:'prueba@example.test'},extra||{}));db.patients.push(p);selectedPatientId=p.id;carteraResave();return p;}
 function casoMust(res,what){if(!res||res.ok===false)throw Error(what+': '+(res&&res.error||'sin resultado'));return res;}
 function casoExtension(id,base,extra,reference,what){const p=casoBase(id,base,extra);casoMust(carteraApplyExtension(p,{reference,confirmDuplicate:true}),what);return p;}
 // Reestructura aprobada (tests/approved-figures-v63.cjs): mismo expediente base, mismo calendario de 12 cuotas
 // y mismas condiciones (opción B, 6 meses, 36%). Se desplaza un mes completo (dispersión 01/12/2025,
 // reestructura 25/09/2026, primera cuota 25/10/2026) para que el pago de la primera cuota se pueda
 // registrar hoy y no quede con fecha futura. Las cifras son idénticas.
 function casoRestructure(ID,shift){
  const source=db.patients.find(p=>p.id==='APP-PUL-1015');
  if(!source)throw Error('reestructura: no se encontró el expediente base de la demo');
  const p=JSON.parse(JSON.stringify(source));
  p.id=ID;p.application.applicationId=ID;delete p.demoBridge;delete p.patientAccountId;
  p.documents=[];p.references=[];p.notes=[];p.timeline=[];p.payments=[];
  const dispersion=casosShiftIsoDate('2025-12-01',shift);
  p.application.dispersionDate=dispersion;p.application.disbursedAt=dispersion;p.application.amortizationStatus='active';
  p.application.interestCalculationBase='global';p.offer.interestCalculationBase='global';p.offer.paymentFrequency='monthly';p.application.paymentFrequency='monthly';
  p.paymentSchedule=[];db.patients.push(p);selectedPatientId=p.id;dispersionEnsureSchedule(p);
  p.paymentSchedule=Array.from({length:12},(_,i)=>{const due=new Date(Date.UTC(2026,i+shift,0)).toISOString().slice(0,10);const row={id:'ordinary-'+(i+1),number:i+1,type:'Mensualidad ordinaria',dueDate:due,currentDueDate:due,originalDueDate:due,capital:7000,interest:4200,interestIva:672,capitalPaid:i===0?7000:0,interestPaid:i===0?4200:i===1?556.01:0,ivaInteresPaid:i<2?672:0,moratory:0,moratoryIva:0,commission:0,moratoryPaid:0,ivaMoratorioPaid:0,commissionPaid:0,status:i===0?'Pagado':'Pendiente'};dispersionHydrateConcepts(row,{...row});dispersionRecalculateRowTotals(row);return row;});
  p.application.carteraScheduleLock='prepay_cuota';carteraResave();
  carteraUiState.action='reestructura';carteraUiState.modality='B';casoMust(carteraApplyRestructure(p,{option:'B',termMonths:6,annualRate:36,reference:'PRUEBA-REESTRUCTURA'}),'reestructura');
  return p;
 }
 // Cada paso corre con su propio reloj (meses relativos al reloj base).
 const STEPS={
  'APP-PRUEBA-GLO-1':[{month:0,run:id=>casoBase(id,'global')}],
  'APP-PRUEBA-GLO-2':[{month:0,run:id=>casoExtension(id,'global',null,'PRUEBA-EXT-GLO','extensión')}],
  'APP-PRUEBA-INS-1':[{month:0,run:id=>casoBase(id,'outstanding_balance')}],
  'APP-PRUEBA-INS-2':[{month:0,run:id=>casoExtension(id,'outstanding_balance',null,'PRUEBA-EXT-INS','extensión')}],
  'APP-PRUEBA-RES-1':[{month:-1,run:(id,shift)=>casoRestructure(id,shift)}],
  'APP-PRUEBA-RES-2':[{month:-1,run:(id,shift)=>casoRestructure(id,shift)},{month:0,run:(id,shift)=>{const p=db.patients.find(x=>x.id===id);let err='';const ok=dispersionApplyPayment({creditId:p.id,type:'ordinary',amount:22798.78,date:casosShiftIsoDate('2026-10-25',shift),reference:'PRUEBA-PAGO-RES',method:'SPEI',target:'auto',cuenta:'001'},{quiet:true,onError:m=>{err=m;}});if(!ok)throw Error('pago: '+err);return p;}}],
  'APP-PRUEBA-SOB-1':[{month:0,run:id=>{const p=carteraBuildStageCredit({id,name:id,state:'Caso de prueba',dueOffset:-1,phone:'55 0000 0000',email:'prueba@example.test',curp:'XEXX010101HNEXXXA4',rfc:'XEXX010101000'});db.patients.push(p);carteraResave();return p;}}],
  'APP-PRUEBA-ULT-G1':[{month:0,run:id=>casoBase(id,'global',{offset:-334,payPast:true})}],
  'APP-PRUEBA-ULT-G2':[{month:0,run:id=>casoExtension(id,'global',{offset:-334,payPast:true},'PRUEBA-EXT-ULT-G','extensión última cuota')}],
  'APP-PRUEBA-ULT-I1':[{month:0,run:id=>casoBase(id,'outstanding_balance',{offset:-334,payPast:true})}],
  'APP-PRUEBA-ULT-I2':[{month:0,run:id=>casoExtension(id,'outstanding_balance',{offset:-334,payPast:true},'PRUEBA-EXT-ULT-I','extensión última cuota')}]
 };
 function slug(s){return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'.').replace(/^\.|\.$/g,'');}
 // Construye UN caso con el motor real. Deja el registro en db.patients (quien llama decide si lo conserva).
 function carteraCasoPruebaBuild(id,shift=0,regeneratedOn=''){
  const index=SPECS.findIndex(s=>s.id===id);if(index<0)throw Error('Caso de prueba desconocido: '+id);
  const spec=SPECS[index];
  for(const step of STEPS[id])casosWithClock(casosClock(shift,step.month),()=>step.run(id,shift));
  let record=JSON.parse(JSON.stringify(db.patients.find(x=>x.id===id)));
  // Datos claramente ficticios y marcados como prueba. No se copia nada de otros expedientes salvo condiciones financieras.
  const n=String(index+1).padStart(2,'0'),mail='prueba.'+slug(id.replace('APP-PRUEBA-',''))+'@example.test';
  record.patient={patientId:'PAC-'+id,fullName:spec.name,email:mail,phone:'55 0000 06'+n,curp:'XEXX010101HNEXXX'+n,rfc:'XEXX0101010'+n,address:'Calle Ficticia 68, Ciudad de Prueba',housingStatus:'Propia',incomeMonthly:80000,incomeType:'Nómina'};
  record.name=spec.name;
  record.application.procedure='Procedimiento ficticio de prueba';record.application.doctorName='Dra. Ficticia Prueba';
  const info={version:'v68',group:spec.group,summary:casosShiftText(spec.summary,shift),tryText:casosShiftText(spec.tryText,shift),validity:casosShiftText(spec.validity,shift)};
  if(regeneratedOn){info.regeneratedOn=regeneratedOn;info.monthShift=shift;if(shift)info.validity+=` Regenerado el ${casosDmy(regeneratedOn)} con las fechas movidas ${shift} ${Math.abs(shift)===1?'mes':'meses'}; los importes que dependen de los días de cada periodo pueden variar unos pesos respecto a las cifras aprobadas.`;}
  record.application.casoPrueba=info;
  const added=casosShiftIsoDate('2026-10-25',shift)+'T12:00:00.000Z';
  record.timeline=[{action:'Caso de prueba agregado',at:added,comment:'Crédito ficticio de prueba (v68) para revisar las cifras aprobadas. No corresponde a ningún paciente.'},...(record.timeline||[]).filter(t=>t&&t.action!=='Crédito dispersado').map(t=>({...t}))];
  let text=JSON.stringify(record).split('admin@pulzzo.mx').join('casos.prueba@pulzzo.mx');
  return JSON.parse(text);
 }
 function casosDmy(iso){const v=String(iso||'');return /^\d{4}-\d{2}-\d{2}/.test(v)?v.slice(8,10)+'/'+v.slice(5,7)+'/'+v.slice(0,4):v;}
 function carteraCasosPruebaSpecs(){return SPECS.map(s=>({...s}));}

 // ── Estado del modo pruebas (se guarda en la demo) ───────────────────────────────────────────────
 function carteraCasosPruebaData(){const data=globalThis.PULZZO_CASOS_PRUEBA;return data&&Array.isArray(data.cases)?data:{version:'v68',seedId:SEED_ID,cases:[]};}
 function isCasoPrueba(record){const id=String(record?.id||record?.creditId||record?.application?.applicationId||'');return Boolean(record?.application?.casoPrueba||record?.casoPrueba)||PREFIX.test(id);}
 function carteraCasoPruebaInfo(record){const id=String(record?.id||record?.creditId||'');const stored=record?.application?.casoPrueba;if(stored)return stored;const seed=carteraCasosPruebaData().cases.find(item=>item.id===id);return seed?.application?.casoPrueba||null;}
 function casosState(){const s=(typeof db!=='undefined'&&db&&db.casosPrueba&&typeof db.casosPrueba==='object')?db.casosPrueba:{};return {enabled:s.enabled!==false,deleted:s.deleted===true,changedAt:s.changedAt||'',changedBy:s.changedBy||'',regeneratedOn:s.regeneratedOn||'',expiresOn:s.expiresOn||'',monthShift:Number(s.monthShift)||0};}
 function carteraModoPruebasActivo(){return casosState().enabled;}
 function casosArchive(){return Array.isArray(db.casosPruebaArchivo)?db.casosPruebaArchivo:[];}
 function casosIsAdmin(){return typeof can==='function'&&can('settings');}

 function carteraSeedCasosPrueba(){
  if(typeof db==='undefined'||!db||!Array.isArray(db.patients))return {added:[],audit:false};
  const state=casosState();
  // Modo pruebas apagado o casos borrados por Admin: no se vuelven a agregar solos.
  if(!state.enabled||state.deleted)return {added:[],audit:false};
  const data=carteraCasosPruebaData(),present=new Set([...db.patients,...casosArchive()].map(p=>p&&p.id));
  const added=[];
  data.cases.forEach(item=>{if(item&&item.id&&!present.has(item.id)){db.patients.push(JSON.parse(JSON.stringify(item)));present.add(item.id);added.push(item.id);}});
  if(!Array.isArray(db.audit))db.audit=[];
  let audit=false;
  if(added.length&&!db.audit.some(event=>event&&event.id===SEED_ID)){
   const stamp=new Date();
   db.audit.unshift({id:SEED_ID,actorId:'system_demo',actorRoles:[],actorName:'Migración demo',at:stamp.toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'}),createdAt:stamp.toISOString(),user:'sistema-demo',role:'Sistema',action:'Casos de prueba agregados',entity:'Cartera',entityKind:'cartera',comment:`Se agregaron ${added.length} créditos ficticios de prueba (v68): ${added.join(', ')}. No se modificaron otros expedientes.`});
   audit=true;
  }
  if(added.length&&typeof carteraResave==='function')carteraResave();
  return {added,audit};
 }
 function casosClearSelection(){
  if(typeof selectedPatientId!=='undefined'&&PREFIX.test(String(selectedPatientId||'')))selectedPatientId=null;
 }
 function casosRerender(){
  try{if(typeof renderSettings==='function')renderSettings();}catch(error){}
  try{if(typeof render==='function')render();}catch(error){}
 }
 function casosDeny(){if(typeof toast==='function')toast('Solo el administrador puede cambiar el modo pruebas.');return {ok:false,error:'Solo el administrador puede cambiar el modo pruebas.'};}

 // Encender / apagar. Apagado: los créditos APP-PRUEBA salen de db.patients y se guardan aparte
 // (db.casosPruebaArchivo), así no aparecen en Cartera, Cobranza, tableros, totales ni exportaciones.
 function carteraSetModoPruebas(enabled){
  if(!casosIsAdmin())return casosDeny();
  enabled=!!enabled;const state=casosState();
  if(state.enabled===enabled)return {ok:true,changed:false,enabled};
  let moved=0;
  if(!enabled){
   const tests=db.patients.filter(isCasoPrueba);moved=tests.length;
   db.casosPruebaArchivo=[...casosArchive().filter(p=>!tests.some(t=>t.id===p.id)),...tests];
   db.patients=db.patients.filter(p=>!isCasoPrueba(p));casosClearSelection();
   if(typeof portfolioState!=='undefined'&&portfolioState&&portfolioState.casos==='only')portfolioState.casos='all';
  }else{
   const present=new Set(db.patients.map(p=>p&&p.id)),back=casosArchive().filter(p=>p&&!present.has(p.id));moved=back.length;
   db.patients.push(...back);db.casosPruebaArchivo=[];
  }
  const stamp=new Date();
  db.casosPrueba={...(db.casosPrueba||{}),enabled,changedAt:stamp.toISOString(),changedBy:(typeof session!=='undefined'&&session?.email)||''};
  addAudit(enabled?'Modo pruebas activado':'Modo pruebas desactivado','Configuración',enabled?`Créditos de prueba visibles otra vez en Cartera (${moved}).`:`Créditos de prueba ocultos en Cartera, Cobranza, tableros, totales y exportaciones (${moved}). No se borró nada.`,'configuracion');
  casosRerender();
  if(typeof toast==='function')toast(enabled?'Modo pruebas activado.':'Modo pruebas desactivado. Los créditos de prueba quedan ocultos.');
  return {ok:true,changed:true,enabled,moved};
 }
 // Lo que se borra: los créditos APP-PRUEBA-* (con sus pagos y recibos, que viven dentro del crédito),
 // sus eventos del historial y sus notas de gestión. Nada más.
 function casosRemoveAll(){
  const ids=new Set([...db.patients,...casosArchive()].filter(isCasoPrueba).map(p=>p.id));
  db.patients=db.patients.filter(p=>!isCasoPrueba(p));db.casosPruebaArchivo=[];
  const before=(db.audit||[]).length;
  db.audit=(db.audit||[]).filter(e=>!(e&&(ids.has(String(e.entity||''))||PREFIX.test(String(e.entity||''))||e.id===SEED_ID)));
  let notes=0;
  try{
   const key=typeof portfolioNoteKey!=='undefined'?portfolioNoteKey:'pulzzo.backoffice.collectionNotes.v1';
   const raw=localStorage.getItem(key);
   if(raw){const list=JSON.parse(raw);if(Array.isArray(list)){const keep=list.filter(n=>!(n&&PREFIX.test(String(n.creditId||''))));notes=list.length-keep.length;if(notes)localStorage.setItem(key,JSON.stringify(keep));}}
  }catch(error){}
  casosClearSelection();
  return {ids:[...ids],audit:before-db.audit.length,notes};
 }
 function carteraBorrarPruebas(options={}){
  if(!casosIsAdmin())return casosDeny();
  if(!options.confirmed){carteraConfirmBorrarPruebas();return {ok:false,pending:true};}
  const removed=casosRemoveAll();
  db.casosPrueba={...(db.casosPrueba||{}),deleted:true,deletedAt:new Date().toISOString()};
  addAudit('Pruebas borradas','Configuración',`Se borraron ${removed.ids.length} créditos de prueba (${removed.ids.join(', ')||'ninguno'}), sus pagos y recibos, ${removed.audit} eventos de su historial y ${removed.notes} notas de gestión. No se tocó ningún otro expediente.`,'configuracion');
  if(typeof closeModal==='function')try{closeModal();}catch(error){}
  casosRerender();
  if(typeof toast==='function')toast('Pruebas borradas. Puedes regenerarlas cuando quieras.');
  return {ok:true,removed};
 }
 function carteraConfirmBorrarPruebas(){
  if(!casosIsAdmin())return casosDeny();
  const count=[...db.patients,...casosArchive()].filter(isCasoPrueba).length;
  if(typeof modal!=='function')return {ok:false};
  modal(`<div class="modal-head"><div><h3>¿Borrar los créditos de prueba?</h3><p>Modo pruebas · solo Admin</p></div><button class="x" onclick="closeModal()" aria-label="Cerrar">×</button></div><div class="modal-body"><p>Se borrarán <strong>${count} créditos APP-PRUEBA-*</strong> con sus pagos, recibos, eventos de historial y notas de gestión.</p><p class="cfg-helper">No se toca ningún otro expediente, crédito, pago ni usuario. El borrado queda en el historial. Puedes volver a crearlos con «Regenerar pruebas».</p></div><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button type="button" class="btn btn-danger" id="casosBorrarConfirm" onclick="carteraBorrarPruebas({confirmed:true})">Borrar pruebas</button></div>`);
  return {ok:true,count};
 }
 // Mes de los casos regenerados: el reloj base es el día 25; se usa el último día 25 que ya pasó.
 function carteraCasosPruebaShift(isoToday){
  const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoToday||''));if(!m)return 0;
  return (Number(m[1])*12+Number(m[2]))-(2026*12+10)-(Number(m[3])<25?1:0);
 }
 function carteraRegenerarPruebas(){
  if(!casosIsAdmin())return casosDeny();
  if(!casosState().enabled){if(typeof toast==='function')toast('Activa el modo pruebas para regenerar los créditos de prueba.');return {ok:false,error:'Modo pruebas apagado.'};}
  const todayIso=typeof dispersionBusinessDateMX==='function'?dispersionBusinessDateMX():new Date().toISOString().slice(0,10);
  const shift=carteraCasosPruebaShift(todayIso);
  const snapshot=JSON.stringify(db),selected=typeof selectedPatientId!=='undefined'?selectedPatientId:null,ui=typeof carteraUiState!=='undefined'?JSON.stringify(carteraUiState):null;
  let removed,records=[];
  try{
   removed=casosRemoveAll();
   const audit=new Set(db.audit);
   for(const spec of SPECS){const record=carteraCasoPruebaBuild(spec.id,shift,todayIso);db.patients=db.patients.filter(p=>p.id!==spec.id);records.push(record);}
   db.audit=db.audit.filter(e=>audit.has(e));
   db.patients.push(...records);
  }catch(error){
   db=JSON.parse(snapshot);if(typeof carteraResave==='function')carteraResave();
   if(typeof toast==='function')toast('No se pudieron regenerar las pruebas. No se cambió nada.');
   return {ok:false,error:String(error&&error.message||error)};
  }finally{
   if(typeof selectedPatientId!=='undefined')selectedPatientId=selected&&!PREFIX.test(String(selected))?selected:null;
   if(ui&&typeof carteraUiState!=='undefined')Object.assign(carteraUiState,JSON.parse(ui));
  }
  const first=(records.find(r=>r.id==='APP-PRUEBA-GLO-1')?.paymentSchedule||[]).find(r=>r&&r.type!=='Pago inicial requerido');
  const until=first?casosShiftIsoDate(first.dueDate,0):'';const untilDate=until?new Date(until+'T12:00:00Z'):null;if(untilDate)untilDate.setUTCDate(untilDate.getUTCDate()-1);
  const expires=untilDate?untilDate.toISOString().slice(0,10):'';
  db.casosPrueba={...(db.casosPrueba||{}),enabled:true,deleted:false,regeneratedOn:todayIso,expiresOn:expires,monthShift:shift};
  addAudit('Pruebas regeneradas','Configuración',`Se regeneraron ${records.length} créditos de prueba con fecha ${casosDmy(todayIso)}${shift?` (fechas movidas ${shift} ${Math.abs(shift)===1?'mes':'meses'})`:''}. La extensión preventiva se puede probar hasta el ${casosDmy(expires)}, unas 3 semanas. No se tocó ningún otro expediente.`,'configuracion');
  casosRerender();
  if(typeof toast==='function')toast(`Pruebas regeneradas. La extensión se puede probar hasta el ${casosDmy(expires)}.`);
  return {ok:true,ids:records.map(r=>r.id),shift,expiresOn:expires,removed};
 }
 // Tarjeta de Configuración › Cartera › Modo pruebas (solo Admin).
 function carteraModoPruebasCard(){
  if(!casosIsAdmin())return ''; // Solo Admin: los demás perfiles no ven el control.
  const state=casosState(),visible=db.patients.filter(isCasoPrueba).length,hidden=casosArchive().length;
  const last=(db.audit||[]).find(e=>e&&/^Modo pruebas|^Pruebas (borradas|regeneradas)/.test(String(e.action||'')));
  const lastText=last?`Último cambio: ${configEscape(last.action)} · ${configEscape(last.actorName||last.user||'')} · ${configEscape(casosDmy(String(last.createdAt||'').slice(0,10)))}`:'Sin cambios registrados.';
  const count=state.enabled?`${visible} créditos de prueba visibles en Cartera.`:`${hidden} créditos de prueba ocultos. No cuentan en totales, Cobranza, tableros ni exportaciones.`;
  const expiry=db.casosPrueba?.expiresOn?` La extensión preventiva se puede probar hasta el ${casosDmy(db.casosPrueba.expiresOn)}.`:' Los casos fijos permiten probar la extensión preventiva hasta el 14/11/2026.';
  return `<section class="cfg-area-card casos-modo-card" aria-label="Modo pruebas"><h3>Modo pruebas</h3><p class="cfg-helper">Créditos ficticios APP-PRUEBA-* para revisar extensiones, reestructura y sobrepago. Solo Admin.</p>
<label class="pz-switch" for="casosModoPruebas"><input id="casosModoPruebas" type="checkbox" role="switch"${state.enabled?' checked':''} onchange="carteraSetModoPruebas(this.checked)"><span class="pz-switch-track" aria-hidden="true"></span><span class="pz-switch-text">${state.enabled?'Modo pruebas activado':'Modo pruebas desactivado'}</span></label>
<p class="cfg-helper" id="casosModoEstado">${count}${state.deleted?' Las pruebas están borradas.':''}</p>
<div class="casos-modo-actions"><button type="button" class="btn btn-secondary btn-sm" id="casosRegenerar" onclick="carteraRegenerarPruebas()"${state.enabled?'':' disabled aria-disabled="true"'}>Regenerar pruebas</button><button type="button" class="btn btn-danger btn-sm" id="casosBorrar" onclick="carteraConfirmBorrarPruebas()"${visible+hidden?'':' disabled aria-disabled="true"'}>Borrar pruebas</button></div>
<p class="cfg-helper">«Regenerar pruebas» crea otra vez los 11 casos con fechas de hoy.${expiry} Después vencen para probar la extensión (unas 3 semanas) y conviene regenerarlas. «Borrar pruebas» pide confirmación y borra solo los créditos APP-PRUEBA-*.</p>
<p class="cfg-helper casos-modo-log">${lastText}</p></section>`;
 }

 // ── v69 · v70.1 · Datos ficticios en la demo ─────────────────────────────────────────────────────
 // APP-PUL-1001 usa valores ficticios: PACIENTE DEMO UNO, Referencia Demo Dos y teléfonos 55 0000 000X.
 // Una demo guardada con los valores anteriores se corrige en el mismo lugar (ids, montos, fechas y pagos
 // no cambian). El código no guarda esos valores anteriores: solo la huella SHA-256 del texto normalizado
 // (sin acentos, en minúsculas, solo letras y números separados por un espacio; teléfonos: solo los 10
 // dígitos). Se vuelve a aplicar antes de guardar, por ejemplo después de «Reiniciar demo».
 const FICTICIO_DESTINO={1:['PACIENTE DEMO UNO','Paciente Demo Uno'],2:['REFERENCIA DEMO DOS','Referencia Demo Dos']};
 const ficticioTabla={
  // [huella, destino, palabras], de la más larga a la más corta.
  nombres:[
  ['8871e6d4343d1c2eea27b363f2efd94718907c8e78b1c2e54bfd63e4b9e8c53e',1,6],
  ['7d3558c7a9dda7733825a5b884f12139ba46ac9953cc98a2688046b147caa290',1,4],
  ['eb7dce89fb098dcee8f59ee0713e66e135005fb950625f4be3e7e95c0c2992a1',2,3]],
  // [huella de los 10 dígitos, n] → 55 0000 000n
  telefonos:[
  ['9843be97ae5a6e9d9a38ef4dec451a2a12cbc1d7ba3dc8a83a39f2d07e425b32',1],
  ['8f034c62d02f507acc89b2f1c4531ef1697a8403385fdd5286d4cb96a2d185ea',2],
  ['582f95b81f57f1e7fceb628b55d92de770426c2b44efa11d9d1765e6896b8aab',3],
  ['aea0a3dd3988370a491e3ccb324294ce68729c7b314e01a95bc11268c9b5a6d6',4]],
  // Huellas de la primera palabra de cada nombre: solo entonces se calculan las demás.
  inicios:['24d4b96f58da6d4a8512313bbd02a28ebf0ca95dec6e4c86ef78ce7f01e788ac','5ef68465886fa04d3e0bbe86b59d964dd98e5775e95717df978d8bedee6ff16c']
 };
 function ficticioSha256(text){const bytes=unescape(encodeURIComponent(String(text))),words=[],bitLength=bytes.length*8;for(let i=0;i<bytes.length;i++)words[i>>2]=(words[i>>2]||0)|bytes.charCodeAt(i)<<(24-(i%4)*8);words[bytes.length>>2]=(words[bytes.length>>2]||0)|0x80<<(24-(bytes.length%4)*8);const length=((bytes.length+8>>6)+1)*16;while(words.length<length)words.push(0);words[length-2]=Math.floor(bitLength/4294967296);words[length-1]=bitLength|0;const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2],r=(x,n)=>(x>>>n)|(x<<(32-n));for(let offset=0;offset<words.length;offset+=16){const w=words.slice(offset,offset+16);for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2];w[i]=((r(a,7)^r(a,18)^(a>>>3))+w[i-16]+(r(b,17)^r(b,19)^(b>>>10))+w[i-7])|0;}let [a,b,c,d,e,f,g,h]=H;for(let i=0;i<64;i++){const t1=(h+(r(e,6)^r(e,11)^r(e,25))+((e&f)^(~e&g))+K[i]+w[i])|0,t2=((r(a,2)^r(a,13)^r(a,22))+((a&b)^(a&c)^(b&c)))|0;h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}[a,b,c,d,e,f,g,h].forEach((v,i)=>H[i]=(H[i]+v)|0);}return H.map(v=>(v>>>0).toString(16).padStart(8,'0')).join('');}
 const ficticioCache=new Map();
 function ficticioHash(text){let v=ficticioCache.get(text);if(v===undefined){v=ficticioSha256(text);if(ficticioCache.size<20000)ficticioCache.set(text,v);}return v;}
 function ficticioNorm(value){return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
 function ficticioText(value){
  let out=String(value).replace(/(^|[^\d])(\d{2}[ .-]?\d{4}[ .-]?\d{4})(?!\d)/g,(match,pre,num)=>{
   const digits=num.replace(/\D/g,''),hit=ficticioTabla.telefonos.find(x=>x[0]===ficticioHash(digits));
   return hit?pre+(/\D/.test(num)?'55 0000 000':'550000000')+hit[1]:match;
  });
  const words=[...out.matchAll(/[\p{L}\p{N}]+/gu)];let res='',cursor=0,changed=false;
  for(let i=0;i<words.length;){
   let hit=null;
   if(ficticioTabla.inicios.includes(ficticioHash(ficticioNorm(words[i][0]))))for(const [hash,dest,size] of ficticioTabla.nombres){
    if(i+size>words.length)continue;
    const last=words[i+size-1],span=out.slice(words[i].index,last.index+last[0].length);
    if(ficticioHash(ficticioNorm(span))===hash){hit={dest,size,span};break;}
   }
   if(!hit){i++;continue;}
   const start=words[i].index,upper=hit.span===hit.span.toUpperCase();
   res+=out.slice(cursor,start)+FICTICIO_DESTINO[hit.dest][upper?0:1];cursor=start+hit.span.length;i+=hit.size;changed=true;
  }
  return changed?res+out.slice(cursor):out;
 }
 function ficticioWalk(node,count,dry){
  const visit=(holder,key)=>{const v=holder[key];if(typeof v==='string'){const next=ficticioText(v);if(next!==v){count.n++;if(!dry)holder[key]=next;}}else if(v&&typeof v==='object')ficticioWalk(v,count,dry);};
  if(Array.isArray(node)){for(let i=0;i<node.length;i++)visit(node,i);return;}
  for(const key of Object.keys(node))visit(node,key);
 }
 function ficticioNeeded(value){if(!value||typeof value!=='object')return false;const count={n:0};ficticioWalk(value,count,true);return count.n>0;}
 function carteraDatosFicticios(options={}){
  if(typeof db==='undefined'||!db||typeof db!=='object')return {changed:0};
  if(!ficticioNeeded(db))return {changed:0};
  const count={n:0};ficticioWalk(db,count);
  if(count.n&&options.save!==false&&typeof carteraResave==='function')carteraResave();
  return {changed:count.n};
 }
 if(typeof persist==='function'&&!persist.carteraDatosFicticios){
  const originalPersist=persist;
  persist=function(...args){
   try{const p=Array.isArray(db?.patients)&&db.patients.find(x=>x&&x.id==='APP-PUL-1001');if(p&&ficticioNeeded(p))ficticioWalk(db,{n:0});}catch(error){}
   return originalPersist.apply(this,args);
  };
  persist.carteraDatosFicticios=true;
 }

 Object.assign(globalThis,{carteraCasosPruebaData,carteraSeedCasosPrueba,isCasoPrueba,carteraCasoPruebaInfo,carteraCasoPruebaBuild,carteraCasosPruebaSpecs,carteraCasosPruebaShift,carteraModoPruebasActivo,carteraModoPruebasState:casosState,carteraSetModoPruebas,carteraBorrarPruebas,carteraConfirmBorrarPruebas,carteraRegenerarPruebas,carteraModoPruebasCard,carteraDatosFicticios,carteraFicticioHuella:text=>ficticioSha256(ficticioNorm(text))});
 try{carteraDatosFicticios();}catch(error){console.warn('Datos ficticios v69',error);}
 try{carteraSeedCasosPrueba();}catch(error){console.warn('Casos de prueba v68',error);}
})();
