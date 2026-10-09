const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../backoffice.html'),'utf8');
const script=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m=>m[1].includes('const baseState='))[1];
function runtime(saved){
 const elements=new Map();
 function el(id){if(!elements.has(id))elements.set(id,{id,value:'',dataset:{},style:{},innerHTML:'',textContent:'',checked:false,disabled:false,files:[],classList:{add(){},remove(){},toggle(){},contains(){return false}},querySelector(){return null},querySelectorAll(){return []},addEventListener(){},setAttribute(){},focus(){this.focused=true},scrollIntoView(){}});return elements.get(id)}
 const storage=new Map(saved||[]);
 const document={querySelector:s=>el(s.replace(/^#/,'')),querySelectorAll:s=>s==='.offer-procedure-card'?[...elements.values()].filter(x=>/^offerProcCard\d+$/.test(x.id)):[],getElementById:id=>elements.get(id)||null,addEventListener(){},createElement:tag=>el(tag),body:{appendChild(){}}};
 const FixedDate=class extends Date {constructor(...a){super(...(a.length?a:['2026-10-07T12:00:00Z']))} static now(){return new Date('2026-10-07T12:00:00Z').getTime()}};
 const context=vm.createContext({document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},window:{},Date:FixedDate,console,Intl,Blob,URL,setTimeout(){},clearTimeout(){},innerWidth:1200});
 vm.runInContext(script,context);
 const run=code=>vm.runInContext(code,context);
 // No browser rendering is simulated: preserve real calculations/handlers, suppress repaint only.
 run("render=()=>{};renderPatientDetail=()=>{};closeModal=()=>{};session=users.find(x=>x.role==='admin');");
 return {run,el,storage};
}

let count=0;function test(name,fn){fn();count++;console.log('PASS '+name)}
test('Both dashboard links reach the exact patient detail and missing IDs never redirect',()=>{
 const r=runtime();for(const action of ['dashboardOpenPriority','openDashboardRecord']){r.run(`currentView='dashboard';${action}('patient',db.patients[2].id)`);assert.equal(r.run('patientRequestMode'),'detail');assert.equal(r.run('selectedPatientId'),r.run('db.patients[2].id'));}
 const before=r.run('selectedPatientId');assert.equal(r.run("openDashboardRecord('patient','MISSING')"),false);assert.equal(r.run('selectedPatientId'),before);
});
test('Personal and reference mutation boundaries deny readonly/provider roles, including retained editors',()=>{
 for(const role of ['readonly','provider']){
  const r=runtime();r.run(`session=users.find(u=>u.role==='${role}');var p=db.patients[0];selectedPatientId=p.id;var before=JSON.stringify(db);patientPersonalEditMode=true;patientReferencesEditMode=true`);
  r.el('editPersonalName').value='Unauthorized';for(let i=0;i<2;i++){r.el('refName'+i).value='Reference';r.el('refPhone'+i).value='5512345678';r.el('refRelationship'+i).value='Padre';}
  for(const action of ['savePersonalDataEdit(p.id)','savePatientReferences()','startPatientPersonalEdit()','openEditPersonalDataModal(p.id)','startReferencesEdit()'])assert.equal(r.run(action),false);
  assert.equal(r.run('JSON.stringify(db)'),r.run('before'));
  assert.equal(r.run("renderPersonalDataTab(p).includes('Guardar cambios')"),false);
  assert.equal(r.run("renderReferencesTab(p).includes('Guardar referencias')"),false);
  assert.equal(r.run("renderReferencesEditTab(p).includes('Guardar referencias')"),false);
 }
});
test('Payload capability is identical for request/profile and escapes HTML',()=>{
 const r=runtime();r.run("var p=db.patients[0];p.patient.privateMarker='<script>private-payload</script>';var profile=buildPatientProfiles().find(x=>x.requests.includes(p))");
 for(const role of ['readonly','provider','operations','risk','admin']){
  r.run(`session=users.find(u=>u.role==='${role}')`);const allowed=['risk','admin'].includes(role);
  for(const html of [r.run('renderPayloadTab(p)'),r.run("patientProfileTabContent(profile,'payload')")]){assert.equal(html.includes('private-payload'),allowed);assert.ok(!html.includes('<script>'));}
 }
});
test('Current page and every filter survive detail, Back and rerender',()=>{
 const r=runtime();r.run("currentView='patients';patientRequestMode='list';renderPatients()");
 const fields={pfName:'Mariana',pfStatus:'correction_pending',pfStage:'revision',pfReapply:'none',pfDateFrom:'2026-06-01',pfDateTo:'2026-06-30'};
 for(const [id,value] of Object.entries(fields)){r.el(id).value=value;r.el(id).oninput();}
 r.run("openPatientRequestDetail(db.patients[1].id);backToPatientRequests();renderPatients()");
 for(const [id,value] of Object.entries(fields)){assert.equal(r.el(id).value,value);assert.equal(r.run(`patientRequestFilters.${id}`),value);}
 r.run('clearPatientRequestFilters()');assert.equal(r.run("Object.values(patientRequestFilters).join('')"),'');
 r.run("var p=db.patients[0];db.patients=Array.from({length:45},(_,i)=>({...p,id:'PAGE-'+i}));patientRequestPage=1;renderPatientList()");assert.match(r.el('patientPagination').innerHTML,/Página 1 de 3/);
 r.run('setPatientRequestPage(2)');assert.match(r.el('patientPagination').innerHTML,/Página 2 de 3/);
 r.run('setPatientRequestPage(99)');assert.match(r.el('patientPagination').innerHTML,/Página 3 de 3/);
});
test('Approval and rejection are idempotent; rejected and contracted cases cannot silently regress',()=>{
 const r=runtime();r.run("var p=db.patients[1];p.application={applicationStatus:'en_evaluacion'};p.offer=null;p.timeline=[]");
 assert.equal(r.run('approvePatient(p.id)'),true);const after=r.run('JSON.stringify(p)');assert.equal(r.run('approvePatient(p.id)'),false);assert.equal(r.run('JSON.stringify(p)'),after);
 r.el('rejectType').value='blocked';r.el('modalText').value='Risk';assert.equal(r.run('confirmReject(p.id)'),true);const rejected=r.run('JSON.stringify(p)');
 for(const action of ['approvePatient(p.id)','confirmReject(p.id)',"confirmCorrection('patient',p.id)", 'setReapply(p.id,true)'])assert.equal(r.run(action),false);
 assert.equal(r.run('JSON.stringify(p)'),rejected);
 r.run("p.application={applicationStatus:'contrato_firmado',contractSigned:true};p.offer={status:'aceptada'};var signed=JSON.stringify(p)");
 for(const action of ['approvePatient(p.id)','confirmReject(p.id)','confirmPatientReopen(p.id)',"confirmCorrection('patient',p.id)",'setReapply(p.id,false)'])assert.equal(r.run(action),false);
 assert.equal(r.run('JSON.stringify(p)'),r.run('signed'));
});
test('Admin reopening requires a reason, archives the prior offer and decision, and persists once',()=>{
 const r=runtime();r.run("var p=db.patients[1];p.application={applicationStatus:'rejected_blocked',denied:true,reapplyBlocked:true};p.offer={status:'rechazada',approvedAmount:10000,financedProcedures:[{procedureName:'Test'}]};var oldOffer=JSON.stringify(p.offer);session=users.find(u=>u.role==='risk');var before=JSON.stringify(p)");
 r.el('reopenReason').value='Reviewed evidence';assert.equal(r.run('confirmPatientReopen(p.id)'),false);assert.equal(r.run('JSON.stringify(p)'),r.run('before'));
 r.run("session=users.find(u=>u.role==='admin')");r.el('reopenReason').value='';assert.equal(r.run('confirmPatientReopen(p.id)'),false);
 r.el('reopenReason').value='Reviewed evidence';assert.equal(r.run('confirmPatientReopen(p.id)'),true);assert.equal(r.run('p.offer'),null);assert.equal(r.run('p.application.applicationStatus'),'en_evaluacion');assert.equal(r.run('p.application.denied'),false);
 assert.equal(r.run('JSON.stringify(p.offerHistory[0].offer)'),r.run('oldOffer'));assert.equal(r.run('p.offerHistory[0].previousDecision'),'rejected');assert.equal(r.run('p.reopeningHistory[0].reason'),'Reviewed evidence');
 const after=r.run('JSON.stringify(p)');assert.equal(r.run('confirmPatientReopen(p.id)'),false);assert.equal(r.run('JSON.stringify(p)'),after);
 const reload=runtime([...r.storage]);assert.equal(reload.run('db.patients[1].reopeningHistory.length'),1);assert.equal(reload.run('db.patients[1].offer'),null);
});
test('Reapplication flags do not misclassify client rejection and all Pulzzo rejection states count',()=>{
 const r=runtime();r.run("var cases=['rejected','rejected_can_reapply','rejected_blocked'].map((status,i)=>({id:'R'+i,application:{applicationStatus:status}}));var client={application:{applicationStatus:'offer_rejected_by_client',reapplyAllowed:true},offer:{status:'rechazada'}}");
 assert.equal(r.run('currentPatientStage(client)'),'offer_rejected_by_client');assert.equal(r.run("dashboardPatientMetrics([...cases,client]).find(x=>x[2]==='stage_rejected')[1]"),3);
 assert.equal(r.run("dashboardTrendData([...cases,client]).find(x=>x.label==='Rechazadas').value"),4);
});
test('Identity uses stable patient IDs, never names/contact attributes, and remains stable after edits',()=>{
 const r=runtime();r.run("db.patients=[{id:'ONE',patient:{id:'patient-1',fullName:'Alex',email:'first@test'}},{id:'TWO',patient:{id:'patient-1',fullName:'Alex',curp:'NEW'}},{id:'THREE',patient:{fullName:'Alex',email:'first@test'}},{id:'FOUR',patient:{fullName:'Alex',email:'first@test'}}]");
 assert.equal(r.run('buildPatientProfiles().length'),3);assert.equal(r.run("buildPatientProfiles().find(x=>x.key==='patient:patient-1').requests.length"),2);
 const key=r.run('patientProfileKeyFromRequest(db.patients[2])');r.run("db.patients[2].patient.curp='NEW';db.patients[2].patient.email='other@test'");assert.equal(r.run('patientProfileKeyFromRequest(db.patients[2])'),key);
 assert.match(r.run('renderPatientProfileRow(buildPatientProfiles().find(x=>!x.identityResolved))'),/pendiente de conciliar/);
});
test('Timeline/events/history merge without shadowing, escape text, deduplicate and sort globally',()=>{
 const r=runtime();r.run("var p={id:'History',events:[],timeline:[{action:'New action',comment:'<script>comment</script>',createdAt:'2026-10-06T12:00:00Z'}],history:[{title:'Old action',description:'Old comment',createdAt:'2026-10-05T12:00:00Z'}]};p.events=[{...p.timeline[0]}]");
 const html=r.run('renderHistoryTab(p)');assert.match(html,/New action/);assert.match(html,/&lt;script&gt;comment/);assert.ok(!html.includes('<script>'));assert.equal(r.run('entityHistoryEvents(p).length'),2);
 r.run("var profile={requests:[{id:'A',timeline:[{action:'Oldest',createdAt:'2025-01-01T00:00:00Z'}]},{id:'B',timeline:[{action:'Newest',createdAt:'2026-10-07T00:00:00Z'}]}]}");
 const consolidated=r.run('renderPatientProfileHistorial(profile)');assert.ok(consolidated.indexOf('Newest')<consolidated.indexOf('Oldest'));
});
test('Recent activity uses only actual recorded events and most recent ordering',()=>{
 const r=runtime();r.run("var p=db.providers[0];p.status='rechazado';p.onboarding={approved:false};p.timeline=[];p.events=[];p.history=[]");assert.equal(r.run('dashboardRecentActivity([], [p]).length'),0);
 r.run("p.timeline=[{action:'Manual review',createdAt:'2026-10-07T12:00:00Z'}];var patient={patient:{fullName:'Patient'},timeline:[{action:'Older event',createdAt:'2026-10-06T12:00:00Z'}]}");assert.equal(r.run('dashboardRecentActivity([patient],[p])[0].title'),'Manual review');
});
test('Provider linking requires unique exact IDs per procedure and never fuzzy matches names',()=>{
 const r=runtime();r.run("var a=db.providers[0],b=db.providers[1];a.profile.name='Ana';b.profile.name='Ana';var patient={application:{doctorName:'Dra. Mariana',procedures:['A','B'],procedureProviders:[{procedure:'A',providerId:a.id},{procedure:'B',providerId:b.id}]}}");
 assert.equal(r.run('providerMatchesPatient(a,patient)'),true);assert.equal(r.run('providerLinkedProcedures(a,patient).length'),1);assert.equal(r.run('providerLinkedProcedures(b,patient).length'),1);
 r.run("delete patient.application.procedureProviders[0].providerId;patient.application.procedureProviders[0].provider='Ana'");assert.equal(r.run('providerMatchesPatient(a,patient)'),false);assert.match(r.run('providerLinkNotice(patient)'),/pendiente/);
 r.run('db.providers.push({...b})');assert.equal(r.run('providerMatchesPatient(b,patient)'),false);assert.equal(r.run('providerProcedureLinks(patient)[1].status'),'ambiguous_id');
});
test('Provider distribution never invents activity and counts only that providers procedures',()=>{
 const r=runtime();r.run("var a=db.providers[0],b=db.providers[1],c=db.providers[2];var patient={application:{applicationStatus:'en_evaluacion',procedures:['A','B'],procedureProviders:[{procedure:'A',providerId:a.id},{procedure:'B',providerId:b.id}]}};providerChartFilters.metric='assigned_procedures'");
 assert.equal(r.run('providerDistributionData([a,b,c],[patient]).map(x=>x.value).join()'),'1,1,0');assert.equal(r.run('providerDistributionData([a,b,c],[]).map(x=>x.value).join()'),'0,0,0');
 assert.equal(r.run("dashboardProviderMetrics([a,b,c],[patient]).find(x=>x[2]==='provider_assigned_procedures')[1]"),2);
});
test('Every provider metric drilldown matches its count, including per-document and per-procedure counts',()=>{
 const r=runtime();r.run("dashboardFilters.from='2000-01-01';dashboardFilters.to='2100-01-01';var p=db.patients[1];p.application.procedureProviders=[{procedure:'A',providerId:db.providers[0].id},{procedure:'B',providerId:db.providers[1].id}];p.application.procedures=['A','B'];p.application.applicationStatus='en_evaluacion';db.providers.forEach(x=>x.submittedAt='2026-06-01T00:00:00Z')");
 const metrics=JSON.parse(r.run('JSON.stringify(dashboardProviderMetrics(dashboardFilteredProviders(),dashboardFilteredPatients()))'));
 for(const [name,value,key] of metrics)assert.equal(r.run(`dashboardMetricRecords('${key}').length`),value,name);
});
test('Fiscal aliases update actual documents, clear rejection text and preserve onboarding membership',()=>{
 for(const types of [['bank_cover','csf'],['BANK_COVER','CSF'],['Carátula bancaria','Constancia de situación fiscal']]){
  const r=runtime();r.run(`var p=db.providers[0];p.onboarding={approved:true};p.files=${JSON.stringify(types.map((type,i)=>({id:'doc'+i,type,status:'rejected',rejectionReason:'Old'})))};p.timeline=[]`);
  assert.equal(r.run('providerFiscal(p.id,true)'),true);assert.equal(r.run("p.files.every(d=>d.status==='approved'&&!d.rejectionReason)"),true);assert.equal(r.run('providerIsApproved(p)'),true);
  const after=r.run('JSON.stringify(p)');assert.equal(r.run('providerFiscal(p.id,true)'),false);assert.equal(r.run('JSON.stringify(p)'),after);assert.equal(r.run('providerFiscalStatus(p)'),'approved');
 }
 const r=runtime();r.run('var p=db.providers[0];p.files=[];var before=JSON.stringify(p)');assert.equal(r.run('providerFiscal(p.id,true)'),false);assert.equal(r.run('JSON.stringify(p)'),r.run('before'));
});
test('Provider manual reviews record actor/time and do not fabricate validation claims',()=>{
 const r=runtime();r.run('var p=db.providers[0];p.timeline=[]');assert.equal(r.run("providerSimple(p.id,'contact')"),true);assert.equal(r.run('p.operationalReviews.contact.status'),'reviewed_manually');assert.equal(r.run('p.operationalReviews.contact.reviewedBy'),r.run('session.email'));
 assert.equal(r.run("p.timeline.some(e=>e.action.includes('validado'))"),false);const after=r.run('JSON.stringify(p)');assert.equal(r.run("providerSimple(p.id,'Contacto validado')"),false);assert.equal(r.run('JSON.stringify(p)'),after);
 r.run("providerTab='contacto'");assert.match(r.run('providerTabContent(p,[])'),/Registrar revisión manual de contacto/);
});
test('Provider decisions are idempotent while directory membership remains durable',()=>{
 const r=runtime();r.run('var p=db.providers[0];p.timeline=[]');assert.equal(r.run('providerApprove(p.id)'),true);let after=r.run('JSON.stringify(p)');assert.equal(r.run('providerApprove(p.id)'),false);assert.equal(r.run('JSON.stringify(p)'),after);
 assert.equal(r.run('providerReject(p.id)'),true);after=r.run('JSON.stringify(p)');assert.equal(r.run('providerReject(p.id)'),false);assert.equal(r.run('JSON.stringify(p)'),after);assert.equal(r.run('providerIsApproved(p)'),true);
});
test('Offer procedure identities survive requested data, editor collection and canonical source synchronization',()=>{
 const r=runtime();r.run("var p=db.patients[1];p.application.procedures=['A','B'];p.application.procedureProviders=[{procedure:'A',providerId:db.providers[0].id,cost:10},{procedure:'B',providerId:db.providers[1].id,cost:20}];p.offer=null;var rows=getRequestedProceduresForOffer(p)");assert.equal(r.run('rows.map(x=>x.providerId).join()'),'MED-001,MED-002');
 assert.match(r.run('renderOfferProviderEditor(rows)'),/offerProviderId0/);
 for(let i=0;i<2;i++){r.el('offerProcCard'+i).dataset={manual:'false',procedureId:'immutable-'+i};r.el('offerProcSelected'+i).checked=true;r.el('offerProcName'+i).value=i?'B':'A';r.el('offerProcAmount'+i).value='10';r.el('offerProviderId'+i).value=i?'MED-002':'MED-001';}
 r.run('var collected=collectOfferProceduresFromDom();p.offer={financedProcedures:collected,providerDispersions:[],patientProcedureAmount:20};syncOfferProcedureSources(p)');assert.equal(r.run('p.application.procedureProviders.map(x=>x.providerId).join()'),'MED-001,MED-002');assert.equal(r.run('p.application.procedureProviders[0].id'),'immutable-0');
 r.run('clearOfferProviderLink(0)');assert.equal(r.el('offerProviderId0').value,'');
});
test('Every non-system user role has accurate nonempty labels in event records',()=>{
 const r=runtime();assert.equal(r.run('users.every(u=>u.name.trim()&&u.label.trim())'),true);
 for(const role of ['operations','risk','provider']){r.run(`session=users.find(u=>u.role==='${role}');addEntityEvent(db.patients[0],'Role test')`);assert.equal(r.run('db.patients[0].timeline[0].role'),r.run('session.label'));}
});
test('Operational decisions roll back on quota failure and reject stale-tab writes',()=>{
 const cases=[
  ["var p=db.patients[1];p.application={applicationStatus:'en_evaluacion'};p.offer=null",'approvePatient(p.id)'],
  ["var p=db.patients[1];p.application={applicationStatus:'en_evaluacion'};p.offer=null;$('#rejectType').value='blocked'",'confirmReject(p.id)'],
  ["var p=db.patients[1];p.application={applicationStatus:'rejected_blocked',denied:true,reapplyBlocked:true};p.offer={status:'rechazada',approvedAmount:10000};$('#reopenReason').value='Authorized review'",'confirmPatientReopen(p.id)'],
  ["var p=db.providers[0]",'providerApprove(p.id)'],
  ["var p=db.providers[0]",'providerReject(p.id)'],
  ["var p=db.providers[0]",'providerFiscal(p.id,true)'],
  ["var p=db.providers[0]","providerSimple(p.id,'contact')"]
 ];
 for(const [setup,action] of cases){
  const r=runtime();r.run(setup);r.run("var before=JSON.stringify(db),recordBefore=JSON.stringify(p),baselineBefore=JSON.stringify(operationalAuditBaseline),write=localStorage.setItem;localStorage.setItem=(key,value)=>{if(key===DEMO_STORAGE_KEY)throw Error('QuotaExceededError');write(key,value)}");
  assert.equal(r.run(action),false,action);assert.equal(r.run('JSON.stringify(db)'),r.run('before'));assert.equal(r.run('JSON.stringify(p)'),r.run('recordBefore'));assert.equal(r.run('JSON.stringify(operationalAuditBaseline)'),r.run('baselineBefore'));
  r.run('localStorage.setItem=write');assert.equal(r.run(action),true,action+' retry');
 }
 const r=runtime();r.run("var p=db.patients[1];p.application={applicationStatus:'en_evaluacion'};p.offer=null;var before=JSON.stringify(db);localStorage.setItem(DEMO_STORAGE_KEY,'another-tab-version')");assert.equal(r.run('approvePatient(p.id)'),false);assert.equal(r.run('JSON.stringify(db)'),r.run('before'));
});
console.log(`PASS: ${count} operational integrity regression cases. Production functions execute in a VM/DOM harness; visual browser checks are separate.`);
