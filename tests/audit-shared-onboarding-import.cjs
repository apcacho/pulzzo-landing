'use strict';
// Independent integration audit of the shipped full-form -> holder -> BO path.
// Runs entirely in Node with fictitious in-memory records. No browser or network.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {createRequire}=require('node:module');
const Store=require('../assets/js/crm-demo-store.js');
const Assisted=require('../assets/js/crm-assisted.js');
const Context=require('../assets/js/crm-onboarding-session.js');
const Office=require('../assets/js/crm-demo-office.js');
const Corrections=require('../assets/js/crm-demo-corrections.js');
const Evidence=require('../assets/js/crm-demo-evidence.js');
const Files=require('./fixtures/onboarding-evidence.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
const ok=result=>{assert.equal(result.ok,true,result.error);return result.value;};
const cases=[];
const test=(name,run)=>cases.push({name,run});
function memory(){const data=new Map();return {getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key),dump:()=>JSON.stringify([...data])};}
function file(name='fiction.pdf',type='application/pdf',bytes=Buffer.from('%PDF-1.4\n% Fictitious audit document\n')){return {name,type,size:bytes.length,dataUrl:'data:'+type+';base64,'+bytes.toString('base64'),demo:true};}
const evidenceFixturePath=path.join(__dirname,'crm-role-evidence.cjs');
const evidenceHarness={require:createRequire(evidenceFixturePath),console,Buffer,Blob,structuredClone,setImmediate};
vm.createContext(evidenceHarness);
vm.runInContext(fs.readFileSync(evidenceFixturePath,'utf8').split('(async()=>{')[0]+'\nglobalThis.testTools={memoryIndexedDB,pdf};',evidenceHarness);
function referenceFixture(){
 const storage=memory(),sessionStorage=memory(),factory=evidenceHarness.testTools.memoryIndexedDB(),actor={id:'kam_ana',role:'kam'},now=()=> '2026-10-12T06:00:00.000Z';let seq=0;
 const store=Store.createStore({storage,actor,now,randomId:prefix=>prefix+'_'+ ++seq}),api=Assisted.createAssisted({store,actor,now}),rev=()=>store.snapshot().revision;
 const contact=ok(store.createContact({type:'doctor',name:'Referencia Ficticia',phone:'5512345678',email:'refs@example.test',assignedKam:actor.id,originalSource:'unknown'},rev())),exp=ok(api.beginDraft({contactId:contact.id},rev()));
 require('./fixtures/registered-expedient.cjs')({storage,staff:actor,expId:exp.id,holder:{id:'holder_reference',role:'holder'},now});
 const route=Context.start({storage,sessionStorage,actor,expId:exp.id,now,returnUrl:'backoffice.html#crm/doctor/contacts/'+contact.id}),location={pathname:'/registro-doctor.html',search:new URL(route.url,'https://example.test').search,hash:new URL(route.url,'https://example.test').hash},evidenceOptions={indexedDB:factory,now:()=>new Date(now()),randomId:()=> 'audit_evidence_'+ ++seq};
 const options={storage,sessionStorage,kind:'doctor',now,location,evidenceOptions};let context=Context.open(options);
 const raw=Evidence.createEvidenceStore({indexedDB:factory});
 const save=descriptor=>{const state=JSON.parse(context.storage.getItem('pulzzoDoctorOnboardingCleanV3'));state.files.bank_cover=[descriptor];context.storage.setItem('pulzzoDoctorOnboardingCleanV3',JSON.stringify(state));};
 return {storage,sessionStorage,factory,actor,now,store,api,contact,exp,location,options,evidenceOptions,raw,rev,save,get context(){return context;},reopen(){context=Context.open(options);return context;},pdf:evidenceHarness.testTools.pdf};
}
async function fixture(kind='patient',clinic=false,changeState){
 const storage=memory(),sessionStorage=memory(),actor={id:'kam_ana',role:'kam'},holderActor={id:'holder_'+kind,role:'holder'},now=()=> '2026-10-12T06:00:00.000Z';let sequence=0;
 const make=actor=>{const store=Store.createStore({storage,actor,now,randomId:prefix=>prefix+'_'+ ++sequence});return {store,api:Assisted.createAssisted({store,actor,now})};};
 const staff=make(actor),rev=()=>staff.store.snapshot().revision,factory=Files.memoryIndexedDB(),evidenceOptions={indexedDB:factory,now:()=>new Date(now()),randomId:()=> 'audit_identity_'+ ++sequence},raw=Evidence.createEvidenceStore({indexedDB:factory});
 const contact=ok(staff.store.createContact({type:kind,name:'Persona Ficticia',phone:'5512345678',email:kind+'@example.test',assignedKam:actor.id,originalSource:'unknown'},rev()));
 const draft=ok(staff.api.beginDraft({contactId:contact.id},rev()));
 require('./fixtures/registered-expedient.cjs')({storage,staff:actor,expId:draft.id,holder:holderActor,now});
 const route=Context.start({storage,sessionStorage,actor,expId:draft.id,now,returnUrl:'backoffice.html#crm/'+kind+'/contacts/'+contact.id});
 const capture=Context.open({storage,sessionStorage,kind,now,location:{pathname:'/demo/'+(kind==='patient'?'solicitud-paciente.html':'registro-doctor.html'),search:new URL(route.url,'https://example.test').search,hash:new URL(route.url,'https://example.test').hash}});
 const stateKey=kind==='patient'?'pulzzo_application':'pulzzoDoctorOnboardingCleanV3';
 const state=JSON.parse(capture.storage.getItem(stateKey)),pdf=file();
 if(kind==='patient')Object.assign(state,{
  procedure:{forWhom:'alguien',patientRecipient:{isForApplicant:false,borrowerName:'Persona Ficticia',patientName:'Beneficiaria Ficticia',relationship:'Familiar',relationshipDetail:'Hermana'},isForApplicant:false,borrowerName:'Persona Ficticia',patientName:'Beneficiaria Ficticia',patientRelationship:'Familiar',patientRelationshipDetail:'Hermana',specialties:['Odontología'],procedures:['Tratamiento ficticio'],when:'En un mes',doctorSource:'propio',doctorName:'Doctora Ficticia',doctorState:'CDMX',doctorWhatsApp:'5599999999',amount:25000,procedureCosts:{'Tratamiento ficticio':25000},procedureProviders:{procedures:[{procedure:'Tratamiento ficticio',provider:'Doctora Ficticia',whatsapp:'5599999999'}]}},
  requestedAmount:25000,selectedTerm:12,identity:{name:'Persona Ficticia',nameParts:{first:'Persona',paternal:'Ficticia'},curp:'FICP900101MDFXXX09',rfcBase:'FICP900101',homoclave:'AAA',housingStatus:'Propia',address:{street:'Calle ficticia',exterior:'10',interior:'2',zip:'01000',colony:'Colonia ficticia',city:'Ciudad ficticia',state:'CDMX'}},
  identityFiles:{proofAddress:file('address.pdf')},
  incomeType:'independiente',incomeMonthly:'$30,000',comfortablePayment:'$2,500',ciecChoice:'no',documentFiles:{bank:[pdf,pdf,pdf],csf:[pdf],annualReturns:[pdf,pdf],monthlyReturn:[pdf],complianceOpinion:[pdf]},
  references:[{fullName:'Referencia Uno',phone:'5511111111',relationship:'Amistad'},{fullName:'Referencia Dos',phone:'5522222222',relationship:'Familiar'}],procedureDone:true,estimateDone:true,identityDone:false,incomeDone:true,documentsDone:true,referencesSaved:true
 });
 else Object.assign(state,{
  profile:{name:'Profesional Ficticio',email:contact.email,prefix:'Dr.',accountType:clinic?'clinica':'doctor',state:'CDMX',city:'Ciudad ficticia'},contact:{registered:contact.phone,officePhone:'5533333333',officeWhats:'5544444444',visible:'office'},specialties:['Odontología'],procedures:['Tratamiento ficticio'],fiscal:{rfc:'FICP900101AAA',banco:'Banco ficticio',clabe:'000000000000000000',titular:'Profesional Ficticio'},profileData:{address:'Domicilio ficticio',consultationCost:'$800',assistantEmail:'assistant@example.test'},links:{website:'https://example.test/clinic?a=1&b=two%20words'},medval:{method:'validate',procedureType:'non_surgical',curp:'FICP900101MDFXXX09',pendingQuestion:'no'},clinicDocs:{legalType:'moral',sanitaryDocType:'license',certRequired:'yes',certProcedure:'Tratamiento ficticio'},files:clinic?{bank_cover:[pdf],csf:[pdf],clinic_rep_ine:[pdf],cofepris_permit:[pdf],clinic_address_proof:[pdf],legal_power:[pdf],treatment_cert:[pdf]}:{bank_cover:[pdf],official_id:[pdf],csf:[pdf],office_address:[pdf]}
 });
 if(changeState)changeState(state);
 capture.storage.setItem(stateKey,JSON.stringify(state));
 const holder=make(holderActor);
 sessionStorage.setItem(Context.HOLDER_KEY,JSON.stringify({actor:holderActor,expId:draft.id,demo:true,expiresAt:Date.parse(now())+10*60*1000}));
 const holderRoute=Context.start({storage,sessionStorage,actor:holderActor,expId:draft.id,kind,now}),holderOptions={storage,sessionStorage,kind,now,evidenceOptions,location:{pathname:kind==='patient'?'/solicitud-paciente.html':'/registro-doctor.html',search:new URL(holderRoute.url,'https://example.test').search,hash:new URL(holderRoute.url,'https://example.test').hash}},holderCapture=Context.open(holderOptions),personalSources={};
 if(kind==='patient'){
  assert.deepEqual(Assisted.onboardingMissing(staff.store.snapshot().expedients[draft.id]),['Documento: ineFront','Documento: ineBack','Documento: selfieVideo']);
  for(const key of ['ineFront','ineBack','selfieVideo']){
   personalSources[key]=key==='selfieVideo'?Files.mp4():Files.pdf();
   state.identityFiles[key]=await holderCapture.putFile(personalSources[key],{documentType:key});
   holderCapture.storage.setItem(stateKey,JSON.stringify(state));
   assert.equal(holderCapture.holderIdentityFileComplete(key),true);
  }
  state.identityDone=true;holderCapture.storage.setItem(stateKey,JSON.stringify(state));
 }
 for(const action of ['otp',...(kind==='patient'?['buroConsent']:[]),'legalConsent'])ok(holder.api.holderAction(draft.id,action,{confirmed:true,demo:true,termsVersion:'demo-v1',privacyVersion:'demo-v1'},rev()));
 const validate=()=>Context.validateDocuments({storage,sessionStorage,actor:holderActor,expId:draft.id,revision:rev(),now,evidenceOptions});
 await validate();
 ok(holder.api.holderAction(draft.id,'finalConfirmation',{confirmed:true,demo:true,capacity:clinic?'authorized_representative':'holder',authorityConfirmed:true},rev()));
 await validate();ok(holder.api.submit(draft.id,rev()));
 const exp=staff.store.snapshot().expedients[draft.id],database={patients:[],providers:[],audit:[]},before=JSON.stringify(database),result=Office.prepareImport(database,exp,'reviewer_demo');
 assert.equal(JSON.stringify(database),before,'Preparation never mutates the caller database');
 return {storage,sessionStorage,actor,holderActor,staff,holder,contact,exp,state,result,row:result.record,rev,raw,personalSources,holderCapture:Context.open(holderOptions)};
}

test('patient full-state import keeps exact identity, review-only financial state and source attribution',async()=>{
 const x=await fixture(),r=x.row;
 assert.equal(r.patientAccountId,x.holderActor.id);assert.equal(r.crmIntake.expedientId,x.exp.id);assert.equal(r.crmIntake.contactId,x.contact.id);
 assert.equal(r.crmIntake.provenance.originalSource,'unknown');assert.equal(r.crmIntake.provenance.referringKam,null);assert.equal(r.crmIntake.provenance.assignedKam,x.actor.id);
 assert.equal(r.application.sourceApplicationId,x.exp.id);assert.equal(r.application.requestedAmount,25000);assert.equal(r.application.selectedTerm,12);
 assert.equal(r.application.creditAuthConfirmed,false);assert.equal(r.application.offerAccepted,false);assert.equal(r.application.contractSigned,false);assert.equal(r.offer,null);
 assert.equal(r.application.identity.curp,x.state.identity.curp);assert.equal(r.patient.incomeMonthly,30000);assert.equal(r.references.length,2);
 assert.equal(r.application.procedureProviderAssignments['Tratamiento ficticio'],'Doctora Ficticia');
 assert.equal(r.application.patientRecipient.patientName,'Beneficiaria Ficticia');assert.equal(r.application.patientRecipient.isForApplicant,false);assert.equal(r.application.patientRecipient.relationshipDetail,'Hermana');assert.equal(r.application.doctorState,'CDMX');
 assert.equal(r.application.ciecChoice,'no');assert.equal(r.application.comfortablePayment,2500,'Native currency-formatted payment must survive BO projection');
 assert.equal(Office.prepareImport(x.result.database,x.exp,'reviewer_demo').alreadyImported,true);
});

test('full patient document bytes and native document categories remain reviewable, with no fabricated evidence IDs',async()=>{
 const x=await fixture(),docs=x.row.documents;
 assert.equal(docs.length,12);assert.equal(docs.filter(d=>d.type==='bank').length,3);assert.ok(docs.some(d=>d.type==='ineFront'));assert.ok(docs.some(d=>d.type==='selfieVideo'&&d.mimeType==='video/mp4'));
 for(const doc of docs){
  assert.equal(doc.status,'pending');assert.equal(doc.metadataOnly,!!doc.evidenceId,'Referenced Blob bytes stay out of the BO JSON row');assert.equal(doc.contactId,x.contact.id);
  const source=x.exp.documents.find(d=>d.onboardingPath===doc.onboardingPath);assert.ok(source);assert.equal(doc.size,source.size);
  if(x.personalSources[doc.type]){
   const descriptor=x.state.identityFiles[doc.type],stored=await x.raw.get(doc.evidenceId),bytes=await x.holderCapture.getFile(descriptor);
   assert.equal(doc.evidenceId,descriptor.evidenceId);assert.equal(source.evidenceId,descriptor.evidenceId);assert.equal(doc.dataUrl,undefined);assert.equal(doc.uploadedBy,x.holderActor.id);assert.equal(stored.actorId,x.holderActor.id);assert.equal(stored.contactId,x.contact.id);assert.equal(bytes.blob.size,doc.size);
   assert.deepEqual(Buffer.from(await bytes.blob.arrayBuffer()),Buffer.from(await x.personalSources[doc.type].arrayBuffer()));
  }else{
   const bytes=Assisted.getOnboardingDocument(x.exp,source.id);assert.equal(doc.evidenceId,'');assert.ok(doc.dataUrl);assert.equal(doc.uploadedBy,x.actor.id);assert.equal(doc.dataUrl,bytes.dataUrl);assert.equal(doc.size,bytes.size);
  }
 }
 assert.equal(JSON.stringify(x.row.crmIntake.onboarding).includes('data:application/pdf'),false,'BO metadata copy must not duplicate file bytes');
 assert.ok(JSON.stringify(x.exp.onboarding).includes('data:application/pdf'),'Canonical CRM capture retains bytes');
 const altered=clone(x.exp);altered.onboarding.records.pulzzo_application=altered.onboarding.records.pulzzo_application.replace('Calle ficticia','Mutated street');
 assert.throws(()=>Office.prepareImport({patients:[],providers:[]},altered,'reviewer_demo'),/captura completa/i);
});

test('doctor and clinic imports preserve full private capture and fiscal document types without automatic public or operational approval',async()=>{
 for(const clinic of [false,true]){const x=await fixture('doctor',clinic),r=x.row;
  assert.equal(r.doctorAccountId,x.holderActor.id);assert.equal(r.profile.accountType,clinic?'Clínica u hospital':'Doctor');assert.equal(r.contact.visible,false);assert.equal(r.status,'perfil_en_revision');assert.equal(r.onboarding?.approved,undefined);assert.equal(r.publicProfile,undefined);
  assert.equal(r.fiscal.clabe,x.state.fiscal.clabe);assert.equal(r.profileData.assistantEmail,x.state.profileData.assistantEmail);assert.equal(r.contact.officePhone,x.state.contact.officePhone);assert.equal(r.links.website,x.state.links.website);
  assert.ok(r.files.some(d=>d.type==='bank_cover'&&d.status==='pending'&&!d.metadataOnly&&d.dataUrl));assert.ok(r.files.some(d=>d.type==='csf'));
  if(clinic){assert.ok(r.files.some(d=>d.type==='legal_power'));assert.ok(r.files.some(d=>d.type==='treatment_cert'));assert.equal(r.clinicDocs.certProcedure,x.state.clinicDocs.certProcedure);}
  assert.equal(r.crmIntake.provenance.originalSource,'unknown');assert.equal(Office.prepareImport(x.result.database,x.exp,'reviewer_demo').alreadyImported,true);
 }
});

test('canonical specialties, contact preference and URL parameters survive import',async()=>{const x=await fixture('doctor');assert.deepEqual(x.row.specialties,['Odontología']);assert.equal(x.row.contact.capturedVisibilityPreference,'office');assert.equal(x.row.contact.visible,false);assert.equal(x.row.links.website,'https://example.test/clinic?a=1&b=two%20words');});

test('frozen import refuses altered legal confirmation, identity, document bytes, or receipt',async()=>{
 const x=await fixture('doctor');
 for(const mutate of [e=>delete e.submissionSnapshot.holderActions.legalConsent,e=>e.submissionSnapshot.holderActions.legalConsent.privacyVersion='',e=>e.submissionSnapshot.accountId='other_holder',e=>e.submissionSnapshot.documents[0].size++,e=>e.submissionSnapshot.onboarding.records.pulzzoDoctorOnboardingCleanV3+=' ']){const altered=clone(x.exp);mutate(altered);assert.throws(()=>Office.prepareImport({patients:[],providers:[]},altered,'reviewer_demo'));}
});

test('document corrections retain the exact original shared-file preview link without treating BO row IDs as evidence',async()=>{
 for(const kind of ['patient','doctor']){
  const x=await fixture(kind),docs=kind==='patient'?[x.row.documents.find(d=>d.type==='ineFront'),x.row.documents.find(d=>d.type==='proofAddress')]:[x.row.files[0]];
  for(const doc of docs){
   const request=Corrections.prepareDocumentRequest(x.result.database,x.exp,doc.id,'Reemplazar este archivo ficticio','reviewer_demo');
   x.storage.setItem(Office.BO_KEY,JSON.stringify(request.database));
   const review=Corrections.readDocumentReview(x.storage,x.exp),active=review.activeDocument,canonical=x.exp.documents.find(d=>d.onboardingPath===doc.onboardingPath);
   assert.equal(review.docId,doc.id);
   if(doc.evidenceId){
    assert.equal(active.evidenceId,canonical.evidenceId);assert.equal(active.evidenceId,doc.evidenceId);assert.notEqual(active.evidenceId,doc.id);
    const original=await x.raw.get(active.evidenceId),preview=await x.holderCapture.getFile(x.state.identityFiles[doc.type]);assert.equal(original.actorId,x.holderActor.id);assert.equal(preview.id,active.evidenceId);assert.deepEqual(Buffer.from(await preview.blob.arrayBuffer()),Buffer.from(await original.blob.arrayBuffer()));
   }else{
    const key=active.evidenceId||active.sourceDocumentId||active.onboardingDocumentId||active.id,inline=Assisted.getOnboardingDocument(x.exp,key);
    assert.ok(inline,'Observed original shared bytes must resolve from the holder correction projection');assert.equal(inline.dataUrl,doc.dataUrl);assert.equal(inline.id,canonical.id);
   }
  }
 }
});

test('operational import preserves canonical provider values; output boundaries escape active HTML',async()=>{
 const malicious='<img src=x onerror=alert(1)>',x=await fixture('doctor',false,state=>{state.profile.name=malicious;state.profileData[malicious]=malicious;state.fiscal.banco=malicious;state.procedures=[malicious+"');alert(2);//"];state.files.bank_cover[0].name=malicious+'.pdf';});
 // crmIntake is the private provenance envelope, rendered only as text. The
 // independent operational record must be safe for legacy HTML consumers.
 const operational=clone(x.row);delete operational.crmIntake;
 assert.equal(operational.profile.name,malicious);assert.equal(operational.fiscal.banco,malicious);assert.equal(operational.profileData[malicious],malicious);
 const html=fs.readFileSync(path.join(__dirname,'../backoffice.html'),'utf8'),code=html.match(/function alerts\(\)\{[^\n]+\}/)[0],ctx={db:{patients:[],providers:[x.row]},labelStatus:s=>s,escapeHtml:s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))};vm.createContext(ctx);vm.runInContext(code,ctx);assert.equal(ctx.alerts().join('').includes('<img'),false);
 assert.ok(x.exp.onboarding.records.pulzzoDoctorOnboardingCleanV3.includes(malicious),'Original capture stays unchanged for audit');
 assert.equal(x.exp.submissionSnapshot.onboarding.records.pulzzoDoctorOnboardingCleanV3,x.exp.onboarding.records.pulzzoDoctorOnboardingCleanV3);
});

test('BO field labels and procedures escape HTML and inline handler string boundaries',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../backoffice.html'),'utf8'),code=source.match(/function info\(k,v,full=false\)\{[^\n]+\}/)[0],context={escapeHtml:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))};vm.createContext(context);vm.runInContext(code,context);
 const payload='<img src=x onerror=alert(1)>',html=context.info(payload,payload);assert.equal(html.includes('<img'),false);assert.ok(html.includes('&lt;img'));
 assert.ok(source.includes('<h4>${escapeHtml(String(x))}</h4><p>Procedimiento activo demo'));
 assert.ok(source.includes('onclick="removeProc(\'${p.id}\',${escapeAttr(JSON.stringify(String(x)))})"'));
});

test('IndexedDB reference supports more than 1 MiB, survives scoped reload and keeps JSON free of bytes',async()=>{
 const x=referenceFixture(),source=x.pdf(2*1024*1024),descriptor=await x.context.putFile(source,{documentType:'bank_cover'});x.save(descriptor);
 assert.equal(descriptor.size,source.size);assert.equal(descriptor.actorId,x.actor.id);assert.equal(descriptor.contactId,x.contact.id);assert.equal(descriptor.dataUrl,undefined);
 assert.equal(x.storage.dump().includes('base64'),false);assert.ok(x.storage.dump().length<source.size/4,'Binary data never expands full-form JSON');
 assert.equal(await x.context.removeUncommittedFile(descriptor),false,'Linked file is not temporary cleanup');
 const ctx=x.reopen(),got=await ctx.getFile(descriptor);assert.equal(got.blob.size,source.size);assert.deepEqual(Buffer.from(await got.blob.arrayBuffer()),Buffer.from(await source.arrayBuffer()));assert.equal((await ctx.validateDocuments()).count,1);
});

test('failed canonical JSON write cleans only the newly uploaded uncommitted reference',async()=>{
 const x=referenceFixture(),existing=await x.context.putFile(x.pdf(),{documentType:'bank_cover'});x.save(existing);
 const fresh=await x.context.putFile(x.pdf(128),{documentType:'bank_cover'}),original=x.storage.setItem;x.storage.setItem=()=>{throw Error('QuotaExceededError');};
 assert.throws(()=>x.save(fresh));x.storage.setItem=original;assert.equal(await x.context.removeUncommittedFile(fresh),true);assert.ok(await x.raw.get(existing.evidenceId));assert.equal(await x.raw.get(fresh.evidenceId),null);
 assert.equal(await x.context.removeUncommittedFile(existing),false);assert.equal((await x.raw.list()).length,1);
});

test('session revocation during post-upload verification leaves no orphan bytes',async()=>{
 const x=referenceFixture();let revoked=false;
 x.factory.beforeRequest=event=>{if(event.mode==='readonly'&&event.store==='files'&&event.operation==='get'&&!revoked){revoked=true;Context.setStaffSession({sessionStorage:x.sessionStorage,actor:{id:'leader_demo',role:'leader'}});}};
 await assert.rejects(x.context.putFile(x.pdf(),{documentType:'bank_cover'}));x.factory.beforeRequest=null;
 assert.equal(revoked,true);assert.equal((await x.raw.list()).length,0,'A failed upload/verification must not leave its newly committed Blob behind');
});

test('descriptor tampering and missing stored bytes fail scoped file validation without changing canonical capture',async()=>{
 const x=referenceFixture(),descriptor=await x.context.putFile(x.pdf(),{documentType:'bank_cover'});x.save(descriptor);const before=x.storage.dump();
 for(const patch of [{actorId:'kam_other'},{contactId:'other_contact'},{name:'renamed.pdf'},{size:descriptor.size+1},{type:'image/png',mimeType:'image/png'}])await assert.rejects(x.context.getFile({...descriptor,...patch}));
 x.factory.data.get('files').delete(descriptor.evidenceId);await assert.rejects(x.context.validateDocuments());assert.equal(x.storage.dump(),before);
});

async function completeReferenceFixture(){
 const x=referenceFixture(),state=JSON.parse(x.context.storage.getItem('pulzzoDoctorOnboardingCleanV3'));
 Object.assign(state,{profile:{name:'Profesional Ficticio',email:x.contact.email,accountType:'doctor',state:'CDMX',city:'Ciudad ficticia'},contact:{registered:x.contact.phone},specialties:['Odontología'],procedures:['Tratamiento ficticio'],fiscal:{rfc:'FICP900101AAA',banco:'Banco ficticio',clabe:'000000000000000000',titular:'Profesional Ficticio'},medval:{method:'validate',procedureType:'non_surgical',curp:'FICP900101MDFXXX09',pendingQuestion:'no'},files:{}});
 for(const slot of ['bank_cover','official_id','csf','office_address'])state.files[slot]=[await x.context.putFile(x.pdf(256),{documentType:slot})];
 x.context.storage.setItem('pulzzoDoctorOnboardingCleanV3',JSON.stringify(state));
 const holderActor={id:'holder_reference',role:'holder'},holderStore=Store.createStore({storage:x.storage,actor:holderActor,now:x.now}),holder=Assisted.createAssisted({store:holderStore,actor:holderActor,now:x.now});
 x.sessionStorage.setItem(Context.HOLDER_KEY,JSON.stringify({actor:holderActor,expId:x.exp.id,demo:true,expiresAt:Date.parse(x.now())+10*60*1000}));
 const route=Context.start({storage:x.storage,sessionStorage:x.sessionStorage,actor:holderActor,expId:x.exp.id,now:x.now}),holderLocation={pathname:'/registro-doctor.html',search:new URL(route.url,'https://example.test').search,hash:new URL(route.url,'https://example.test').hash},holderContext=Context.open({...x.options,location:holderLocation});
 const original=state.files.bank_cover[0],got=await holderContext.getFile(original);assert.equal(got.actorId,x.actor.id);assert.equal(got.blob.size,256);assert.equal((await holderContext.validateDocuments()).count,4);
 for(const action of ['otp','legalConsent'])ok(holder.holderAction(x.exp.id,action,{confirmed:true,demo:true,termsVersion:'demo-v1',privacyVersion:'demo-v1'},x.rev()));
 const validate=()=>Context.validateDocuments({storage:x.storage,sessionStorage:x.sessionStorage,actor:holderActor,expId:x.exp.id,revision:x.rev(),evidenceOptions:x.evidenceOptions});
 assert.equal((await validate()).count,4);ok(holder.holderAction(x.exp.id,'finalConfirmation',{confirmed:true,demo:true,capacity:'holder',authorityConfirmed:true},x.rev()));
 await validate();ok(holder.submit(x.exp.id,x.rev()));
 const exp=x.store.snapshot().expedients[x.exp.id];return {...x,exp,original,holderActor,holder,validate};
}
test('referenced documents survive KAM-to-holder handoff and exact BO/correction mapping with personal revalidation',async()=>{
 const x=await completeReferenceFixture(),{exp,original,holderActor,validate}=x,imported=Office.prepareImport({patients:[],providers:[],audit:[]},exp,'reviewer_demo'),bank=imported.record.files.find(d=>d.type==='bank_cover');
 assert.equal(bank.evidenceId,original.evidenceId);assert.equal(bank.size,original.size);assert.equal(bank.uploadedBy,x.actor.id);assert.equal(bank.dataUrl,undefined);assert.equal(exp.holderIdentity.id,holderActor.id);assert.equal(exp.submissionSnapshot.expedientId,x.exp.id);
 const request=Corrections.prepareDocumentRequest(imported.database,exp,bank.id,'Solicitar copia legible','reviewer_demo');x.storage.setItem(Office.BO_KEY,JSON.stringify(request.database));const observed=Corrections.readDocumentReview(x.storage,exp).activeDocument;assert.equal(observed.evidenceId,original.evidenceId);assert.equal((await x.raw.get(observed.evidenceId)).actorId,x.actor.id);
 x.factory.data.get('files').delete(original.evidenceId);const before=x.storage.dump();await assert.rejects(validate());assert.equal(x.storage.dump(),before,'Missing evidence does not mutate the submitted snapshot');
});

test('async BO importer verifies every real Blob before one exact-ID commit and cancels on missing bytes or changed authority/state',async()=>{
 for(const change of ['valid','missing','corrupt','role','actor','revision','database','view']){
  const x=await completeReferenceFixture();let database={patients:[],providers:[],audit:[]},allowed=true,actor='reviewer_demo',viewCurrent=true,commits=0,reads=0;
  const office={assertCurrent(){if(!allowed)throw Error('Role changed');},canImportPatient:()=>false,canImportProvider:()=>allowed,actor:()=>actor,getDatabase:()=>database,refresh(){},commitNew(id,revision){assert.equal(id,x.exp.id);assert.equal(revision,x.rev());const prepared=Office.prepareImport(database,x.store.snapshot().expedients[id],actor);if(prepared.database)database=prepared.database;commits++;return {id:prepared.id,alreadyImported:prepared.alreadyImported};}};
  const evidenceModule={validateBlob:Evidence.validateBlob,createEvidenceStore(options){const service=Evidence.createEvidenceStore({...options,indexedDB:x.factory});return {async get(id){const value=await service.get(id);reads++;if(reads===1){if(change==='role')allowed=false;if(change==='actor')actor='other_reviewer';if(change==='view')viewCurrent=false;if(change==='database')database.audit.push({action:'Concurrent backoffice change'});if(change==='revision')ok(x.store.updateContact(x.contact.id,{notes:'Concurrent CRM change'},x.rev()));}return value;},close:()=>service.close()};}};
  if(change==='missing')x.factory.data.get('files').delete(x.original.evidenceId);
  if(change==='corrupt')x.factory.data.get('files').set(x.original.evidenceId,{id:x.original.evidenceId,blob:new Blob([Buffer.alloc(x.original.size)],{type:x.original.type})});
  const invoke=()=>Office.importExpedient({store:x.store,office,evidenceModule,isCurrent:()=>viewCurrent},x.exp.id);
  if(change==='valid'){const result=await invoke();assert.equal(result.id,'MED-CRM-'+x.exp.id);assert.equal(commits,1);assert.equal(reads,4);assert.equal(database.providers.length,1);assert.equal(database.providers[0].crmIntake.expedientId,x.exp.id);assert.equal((await invoke()).alreadyImported,true);assert.equal(commits,1,'Repeating a completed import never appends or commits twice');}
  else{await assert.rejects(invoke(),change);assert.equal(commits,0,change+' must not reach commitNew');assert.equal(database.providers.length,0);}
 }
});

(async()=>{let failed=0;
for(const {name,run} of cases){try{await run();console.log('PASS',name);}catch(error){failed++;console.error('FAIL',name);console.error(error.stack);}}
console.log(`Independent full onboarding import audit: ${cases.length-failed} passed, ${failed} failed. Browser rendering not run.`);
if(failed)process.exitCode=1;})();
