'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../registro-doctor.html'),'utf8');
const harnessSource=fs.readFileSync(path.join(__dirname,'patient-doctor-integrity.cjs'),'utf8');
const doctorHarness=new Function('doctorSource','vm',harnessSource.slice(harnessSource.indexOf('function doctorHarness('),harnessSource.indexOf('const account={profile:'))+';return doctorHarness;')(source,vm);
const Service=require('../assets/js/demo-servicing.js');
const STATE='pulzzoDoctorOnboardingCleanV3';
function harness(overrides={}){
 const state={doctorAccountId:'DOC-A',profile:{name:'Doctor demo',email:'doctor@example.test',accountType:'doctor'},fiscal:{rfc:'RFC ORIGINAL',clabe:'CLABE ORIGINAL',banco:'Banco demo',titular:'Titular demo'},medval:{method:'validate'},files:{official_id:[{name:'original.pdf',status:'Aprobado'}]},...overrides};
 const h=doctorHarness({pulzzo_doctor:{doctorAccountId:'DOC-A',correo:'doctor@example.test'},pulzzo_doctor_verified:'true',[STATE]:state});
 h.ctx.window.PulzzoDemoServicing=Service;h.api=h.ctx.window.PulzzoDoctorDemoBridge;return h;
}
function projection(h,{accountId='DOC-A',providerId='PROVIDER-A',rows}={}){
 const state=h.api.getState();state.demoProviderId='PROVIDER-A';
 state.servicingProjection=Service.publish(h.ctx.localStorage,'doctor_servicing',accountId,providerId,{doctorAccountId:accountId,providerId,rows:rows||[{applicationId:'APP-A',patientName:'<img src=x onerror=1> Paciente',procedureId:'PROC-A',procedureName:'Consulta propia',status:'ready',procedureDate:'2026-10-09',phone:'PRIVATE_PHONE',email:'PRIVATE_EMAIL',risk:'SECRET_RISK',otherDoctor:'OTHER_DOCTOR',payouts:[{payoutId:'PAY-A',amount:1050.55,status:'Dispersada',paidAt:'2026-10-08',reference:'REF-OWN',secret:'PRIVATE_PAYOUT'}]}]},{providerId});
 h.api.save(state);return state.servicingProjection;
}
const empty=harness();
for(const tab of ['Pacientes interesados','Pacientes por operar','Historial']){empty.ctx.testProfile.tab(tab);assert.match(empty.node('doctorProfilePanel').innerHTML,/No hay solicitudes recibidas/);assert.doesNotMatch(empty.node('doctorProfilePanel').innerHTML,/Mariana López|Andrea Torres|Daniela Cruz/);}
const h=harness();projection(h);h.ctx.testProfile.tab('Pacientes por operar');let html=h.node('doctorProfilePanel').innerHTML;
assert.match(html,/APP-A|Consulta propia/);assert.match(html,/&lt;img src=x/);assert.match(html,/1,050.55/);assert.doesNotMatch(html,/<img src=x|PRIVATE_|SECRET_RISK|OTHER_DOCTOR/);
for(const mismatch of [{accountId:'DOC-B'},{providerId:'PROVIDER-B'}]){const x=harness();projection(x,mismatch);x.ctx.testProfile.tab('Pacientes por operar');assert.match(x.node('doctorProfilePanel').innerHTML,/No hay solicitudes recibidas/);assert.doesNotMatch(x.node('doctorProfilePanel').innerHTML,/APP-A/);}
const tampered=harness();projection(tampered);const altered=tampered.api.getState();altered.servicingProjection.payload.rows[0].patientName='TAMPERED';tampered.api.save(altered);tampered.ctx.testProfile.tab('Pacientes por operar');assert.doesNotMatch(tampered.node('doctorProfilePanel').innerHTML,/TAMPERED|APP-A/);
const groups=harness();projection(groups,{rows:['interested','ready','paid','cancelled'].map((status,i)=>({applicationId:'GROUP-'+i,patientName:'Paciente '+i,procedureId:'PROC-'+i,procedureName:'Consulta',status,payouts:[]}))});
for(const [tab,present,absent] of [['Pacientes interesados','GROUP-0','GROUP-1'],['Pacientes por operar','GROUP-1','GROUP-0'],['Historial','GROUP-2','GROUP-1']]){groups.ctx.testProfile.tab(tab);html=groups.node('doctorProfilePanel').innerHTML;assert.ok(html.includes(present));assert.ok(!html.includes(absent));}
console.log('PASS: no doctor fixture fallback; account/provider-scoped, fingerprint-validated received projection; safe names and own payout cents; status-based views.');
// Stale account snapshots must not render another account, write global state, or open old rows.
const stale=harness();projection(stale);const staleState=stale.api.getState();stale.data.set('pulzzo_doctor',JSON.stringify({doctorAccountId:'DOC-B',correo:'other@example.test'}));const before=stale.data.get(STATE);
assert.throws(()=>stale.api.save(staleState),/account_changed/);assert.throws(()=>stale.api.getState(),/account_changed/);assert.equal(stale.api.account(),null);stale.ctx.testProfile.tab('Pacientes por operar');assert.match(stale.node('doctorProfilePanel').innerHTML,/cuenta médica cambió/);assert.doesNotMatch(stale.node('doctorProfilePanel').innerHTML,/APP-A/);stale.ctx.testProfile.openProfileRequestModal('APP-A|PROC-A');assert.equal(stale.data.get(STATE),before);
stale.ctx.location.hash='#perfil-medico';let prevented=false,stopped=false;stale.listeners.document.find(([type])=>type==='click')[1]({preventDefault(){prevented=true},stopImmediatePropagation(){stopped=true}});assert.equal(prevented,true);assert.equal(stopped,true);
const cleared=harness();projection(cleared);cleared.ctx.testProfile.tab('Pacientes por operar');cleared.data.clear();cleared.listeners.window.find(([type])=>type==='storage')[1]({key:null});assert.doesNotMatch(cleared.node('doctorProfilePanel').innerHTML,/APP-A/);
const staleVersion=harness();const staleNext=staleVersion.api.getState();staleVersion.data.set(STATE,JSON.stringify({...staleNext,fiscal:{...staleNext.fiscal,banco:'Changed elsewhere'}}));assert.throws(()=>staleVersion.api.save(staleNext),/otra pestaña/);
const staleRead=harness();const oldRead=staleRead.api.getState();const newerRead=staleRead.api.getState();newerRead.fiscal.rfc='RECENT';staleRead.api.save(newerRead);staleRead.api.getState();assert.throws(()=>staleRead.api.save(oldRead),/otra pestaña/);
const legacy=doctorHarness({pulzzo_doctor:{correo:'legacy@example.test'},[STATE]:{profile:{email:'legacy@example.test'},files:{license:[{name:'saved.pdf'}]}}});const legacySaved=JSON.parse(legacy.data.get(STATE));assert.ok(legacySaved.doctorAccountId);assert.equal(legacySaved.doctorAccountId,JSON.parse(legacy.data.get('pulzzo_doctor')).doctorAccountId);assert.equal(legacySaved.files.license[0].name,'saved.pdf');assert.equal(legacySaved.demoProviderId,undefined);
const legacyAgain=doctorHarness(Object.fromEntries(legacy.data));assert.equal(JSON.parse(legacyAgain.data.get(STATE)).doctorAccountId,legacySaved.doctorAccountId);
const mismatched=doctorHarness({pulzzo_doctor:{correo:'one@example.test'},[STATE]:{profile:{email:'two@example.test'}}});assert.equal(mismatched.ctx.window.PulzzoDoctorDemoBridge.account(),null);assert.equal(JSON.parse(mismatched.data.get(STATE)).doctorAccountId,undefined);
const migrationFail=doctorHarness();const oldAccount=JSON.stringify({correo:'legacy@example.test'}),oldState=JSON.stringify({profile:{email:'legacy@example.test'},files:{license:[{name:'keep.pdf'}]}});migrationFail.data.set('pulzzo_doctor',oldAccount);migrationFail.data.set(STATE,oldState);const migrationSet=migrationFail.ctx.localStorage.setItem;migrationFail.ctx.localStorage.setItem=(key,value)=>{if(key===STATE&&value!==oldState)throw Error('QuotaExceededError');migrationSet(key,value);};vm.runInContext(source.match(/<script id="doctor-profile-integrated-script">([\s\S]*?)<\/script>/)[1],migrationFail.ctx);assert.equal(migrationFail.data.get('pulzzo_doctor'),oldAccount);assert.equal(migrationFail.data.get(STATE),oldState);assert.equal(migrationFail.ctx.window.PulzzoDoctorDemoBridge.account(),null);
console.log('PASS: stable additive legacy identity with no provider inference; mismatch rejection; stale account render, click and save protection; same-account concurrent save guard.');
// Execute the actual correction UI callbacks; drafts never mutate submitted source data.
const c=harness({submitted:true,demoProviderId:'PROVIDER-A'}),baseline=Service.profileSnapshot(c.api.getState());
const review={doctorAccountId:'DOC-A',providerId:'PROVIDER-A',snapshot:baseline,version:1,status:'review'};
Service.requestCorrection(review,['fiscal.rfc'],'Confirma solo el RFC');
let next=c.api.getState();next.demoCorrection=structuredClone(review.request);c.api.save(next);
const input=c.node('correction-input');input.dataset.doctorCorrectionField='fiscal.rfc';input.type='text';input.value='RFC CORREGIDO';c.selectors.set('[data-doctor-correction-field]',[input]);c.ctx.testProfile.tab('Fiscal y banco');html=c.node('doctorProfilePanel').innerHTML;
assert.match(html,/data-doctor-correction-field="fiscal.rfc"/);assert.doesNotMatch(html,/data-doctor-correction-field="fiscal.clabe"/);
const originalCorrectionState=c.data.get(STATE),originalCorrectionSet=c.ctx.localStorage.setItem;c.ctx.localStorage.setItem=()=>{throw Error('QuotaExceededError');};input.events.input();assert.equal(c.data.get(STATE),originalCorrectionState);assert.match(c.node('doctorCorrectionMessage').textContent,/QuotaExceededError/);c.ctx.localStorage.setItem=originalCorrectionSet;input.events.input();next=c.api.getState();assert.equal(next.fiscal.rfc,'RFC ORIGINAL');assert.equal(next.fiscal.clabe,'CLABE ORIGINAL');assert.equal(next.demoCorrectionDraft['fiscal.rfc'],'RFC CORREGIDO');
const submission=Service.makeCorrectionSubmission(next,'DOC-A');assert.deepEqual(submission.changes,{'fiscal.rfc':'RFC CORREGIDO'});assert.equal(submission.nonce,review.request.nonce);assert.equal(submission.version,review.request.version);
let invalid=c.api.getState();invalid.fiscal.clabe='UNAUTHORIZED';assert.throws(()=>c.ctx.testProfile.setProfileState(invalid),/bloqueado/);assert.throws(()=>c.api.save(invalid),/bloqueado/);
invalid=c.api.getState();invalid.demoCorrectionDraft['fiscal.clabe']='UNAUTHORIZED';assert.throws(()=>c.ctx.testProfile.setProfileState(invalid),/no autorizado/);
invalid=c.api.getState();invalid.procedures=['NEW'];assert.throws(()=>c.ctx.testProfile.setProfileState(invalid),/bloqueado/);
const envelope=Service.publish(c.ctx.localStorage,'doctor_correction','DOC-A','PROVIDER-A',submission,{providerId:'PROVIDER-A'});Service.acceptCorrectionSubmission(review,envelope);
next=c.api.getState();next.demoCorrection.status='submitted';c.api.save(next);const snapshot=c.data.get(STATE);input.value='STALE INPUT';input.events.input();assert.equal(c.data.get(STATE),snapshot);assert.match(c.node('doctorCorrectionMessage').textContent,/autorización/);
Service.approveCorrection(review);const approved=Service.publish(c.ctx.localStorage,'doctor_review','DOC-A','PROVIDER-A',review,{providerId:'PROVIDER-A'});next=c.api.getState();Service.applyReview(next,approved,'DOC-A');c.api.save(next,{reviewApproved:true});
assert.equal(c.api.getState().fiscal.rfc,'RFC CORREGIDO');assert.equal(c.api.getState().fiscal.clabe,'CLABE ORIGINAL');assert.equal(c.api.getState().files.official_id[0].name,'original.pdf');assert.equal(c.api.getState().demoCorrection.status,'approved');
next=c.api.getState();Service.applyReview(next,approved,'DOC-A');c.api.save(next,{reviewApproved:true});assert.equal(c.api.getState().fiscal.rfc,'RFC CORREGIDO');
console.log('PASS: executable correction form changes only approved draft fields; nonce/version submission, submitted lock and stale event rejection; explicit reviewed apply preserves untouched fields and is idempotent.');
// Mount the real shared controls around the real doctor's production adapter.
// This exercises UI -> mailbox -> guarded storage -> refresh, not replacement handlers.
function mountDoctorControls(h,{browserFactory=false}={}){
 const elements=[],roots=[],doc=h.ctx.document,oldGet=doc.getElementById;
 const make=tag=>{const attrs={};const element={tagName:tag.toUpperCase(),style:{},children:[],textContent:'',value:'',setAttribute(key,value){attrs[key]=String(value);},getAttribute:key=>attrs[key]??null,appendChild(child){this.children.push(child);return child;},replaceChildren(...children){this.children=children;}};elements.push(element);return element;};
 doc.createElement=make;doc.createTextNode=text=>({textContent:text});
 doc.getElementById=id=>id==='demo-servicing-panel'?roots.find(node=>node.id===id)||null:oldGet(id);
 doc.body.appendChild=node=>roots.push(node);
 Object.assign(h.ctx.window,{document:doc,localStorage:h.ctx.localStorage,confirm:()=>true});
 if(browserFactory)vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js/demo-servicing.js'),'utf8'),h.ctx);else Service.mount(h.ctx.window);
 const button=text=>{const button=elements.find(node=>node.tagName==='BUTTON'&&node.textContent===text);assert.ok(button,'mounted control: '+text);return button;};
 return {button,status:elements.find(node=>node.getAttribute('role')==='status'),roots};
}
const mounted=harness({submitted:false}),controls=mountDoctorControls(mounted);
const exportButton=controls.button('Enviar perfil a revisión demo'),receiveButton=controls.button('Recibir revisión de campos'),submitButton=controls.button('Enviar correcciones a nueva revisión');
assert.equal(controls.roots.length,1);Service.mount(mounted.ctx.window);assert.equal(controls.roots.length,1,'mount is idempotent');
const initialRaw=mounted.data.get(STATE),initialMailbox=mounted.ctx.localStorage.getItem(Service.STORE),mountedSet=mounted.ctx.localStorage.setItem;
mounted.ctx.localStorage.setItem=(key,value)=>{if(key===STATE)throw Error('QuotaExceededError');mountedSet(key,value);};
exportButton.onclick();assert.equal(mounted.data.get(STATE),initialRaw);assert.equal(mounted.ctx.localStorage.getItem(Service.STORE),initialMailbox,'failed initial profile write restores absent mailbox');assert.match(controls.status.textContent,/QuotaExceededError/);
mounted.ctx.localStorage.setItem=mountedSet;
mounted.ctx.window.confirm=()=>false;exportButton.onclick();assert.equal(mounted.data.get(STATE),initialRaw);assert.equal(mounted.ctx.localStorage.getItem(Service.STORE),initialMailbox,'cancel does not publish');
mounted.ctx.window.confirm=()=>true;exportButton.onclick();assert.equal(mounted.api.getState().submitted,true);assert.match(controls.status.textContent,/Perfil exportado/);
const exported=Service.receive(mounted.ctx.localStorage,'doctor_profile','DOC-A','DOC-A');assert.equal(exported.payload.snapshot['fiscal.rfc'],'RFC ORIGINAL');assert.equal(exported.payload.doctorAccountId,'DOC-A');
const provider={id:'PROVIDER-A',doctorAccountId:'DOC-A'};
Service.importProfile(provider,exported);Service.requestCorrection(provider.demoProfileReview,['fiscal.rfc'],'Corrige únicamente el RFC');
const requestedReview=Service.clone(provider.demoProfileReview);
Service.publish(mounted.ctx.localStorage,'doctor_review','DOC-A','PROVIDER-A',requestedReview,{providerId:'PROVIDER-A'});
const mountedInput=mounted.node('mounted-correction-input');mountedInput.dataset.doctorCorrectionField='fiscal.rfc';mountedInput.type='text';mountedInput.value='RFC MOUNTED';mounted.selectors.set('[data-doctor-correction-field]',[mountedInput]);
receiveButton.onclick();assert.match(controls.status.textContent,/Revisión recibida: requested/);assert.equal(mounted.api.getState().demoProviderId,'PROVIDER-A');assert.equal(mounted.api.getState().demoCorrection.status,'requested');
assert.match(mounted.node('doctorProfilePanel').innerHTML,/data-doctor-correction-field="fiscal.rfc"/);mountedInput.events.input();assert.equal(mounted.api.getState().demoCorrectionDraft['fiscal.rfc'],'RFC MOUNTED');assert.equal(mounted.api.getState().fiscal.rfc,'RFC ORIGINAL');
const draftRaw=mounted.data.get(STATE),mailboxBeforeSubmit=mounted.ctx.localStorage.getItem(Service.STORE);
mounted.ctx.localStorage.setItem=(key,value)=>{if(key===STATE)throw Error('QuotaExceededError');mountedSet(key,value);};
submitButton.onclick();assert.equal(mounted.data.get(STATE),draftRaw);assert.equal(mounted.ctx.localStorage.getItem(Service.STORE),mailboxBeforeSubmit,'failed correction profile write restores exact existing mailbox');assert.equal(Service.messages(mounted.ctx.localStorage,'doctor_correction','DOC-A').length,0);assert.match(controls.status.textContent,/QuotaExceededError/);
mounted.ctx.localStorage.setItem=mountedSet;submitButton.onclick();assert.match(controls.status.textContent,/Correcciones enviadas/);assert.equal(mounted.api.getState().demoCorrection.status,'submitted');assert.equal(Service.canEditCorrection(mounted.api.getState(),'DOC-A','fiscal.rfc'),false);
const sentCorrection=Service.receive(mounted.ctx.localStorage,'doctor_correction','DOC-A','PROVIDER-A');assert.deepEqual(sentCorrection.payload.changes,{'fiscal.rfc':'RFC MOUNTED'});assert.equal(sentCorrection.payload.nonce,requestedReview.request.nonce);assert.equal(sentCorrection.payload.version,requestedReview.request.version);
const submittedMailbox=mounted.ctx.localStorage.getItem(Service.STORE);submitButton.onclick();assert.match(controls.status.textContent,/revisión no corresponde/);assert.equal(mounted.ctx.localStorage.getItem(Service.STORE),submittedMailbox,'repeat submit does not republish');
receiveButton.onclick();assert.equal(mounted.api.getState().demoCorrection.status,'submitted','exact requested envelope replay stays locked');
Service.publish(mounted.ctx.localStorage,'doctor_review','DOC-A','PROVIDER-A',requestedReview,{providerId:'PROVIDER-A'});receiveButton.onclick();assert.equal(mounted.api.getState().demoCorrection.status,'submitted','same requested nonce at higher envelope revision stays locked');assert.equal(Service.canEditCorrection(mounted.api.getState(),'DOC-A','fiscal.rfc'),false);assert.doesNotMatch(mounted.node('doctorProfilePanel').innerHTML,/data-doctor-correction-field=/);
const lockedRaw=mounted.data.get(STATE);mountedInput.value='STALE MOUNTED INPUT';mountedInput.events.input();assert.equal(mounted.data.get(STATE),lockedRaw);
Service.acceptCorrectionSubmission(provider.demoProfileReview,sentCorrection);Service.approveCorrection(provider.demoProfileReview);Service.publish(mounted.ctx.localStorage,'doctor_review','DOC-A','PROVIDER-A',provider.demoProfileReview,{providerId:'PROVIDER-A'});
const beforeApprovalRaw=mounted.data.get(STATE),beforeApprovalMailbox=mounted.ctx.localStorage.getItem(Service.STORE);
mounted.ctx.localStorage.setItem=(key,value)=>{if(key===STATE)throw Error('QuotaExceededError');mountedSet(key,value);};receiveButton.onclick();assert.equal(mounted.data.get(STATE),beforeApprovalRaw);assert.equal(mounted.ctx.localStorage.getItem(Service.STORE),beforeApprovalMailbox);assert.match(controls.status.textContent,/QuotaExceededError/);
mounted.ctx.localStorage.setItem=mountedSet;receiveButton.onclick();assert.match(controls.status.textContent,/Revisión recibida: approved/);assert.equal(mounted.api.getState().demoCorrection.status,'approved');assert.equal(mounted.api.getState().fiscal.rfc,'RFC MOUNTED');assert.equal(mounted.api.getState().fiscal.clabe,'CLABE ORIGINAL');assert.equal(mounted.api.getState().files.official_id[0].name,'original.pdf');assert.equal(mounted.api.getState().demoCorrectionDraft,undefined);assert.equal(mounted.api.getState().submitted,true);
const approvedRaw=mounted.data.get(STATE);receiveButton.onclick();assert.equal(mounted.data.get(STATE),approvedRaw,'approved reception is idempotent through actual adapter');
console.log('PASS: actual mounted doctor controls submit initial profile with cancel/quota rollback, receive requested fields, submit draft with exact mailbox rollback and retry, reject duplicate submit/request replay, and apply approved changes with quota retry and untouched-field preservation.');

// Browser UMD instantiation supplies the real storage-backed queued-submission guard.
const doubleFailure=harness({submitted:true,demoProviderId:'PROVIDER-A'});
const queuedReview={doctorAccountId:'DOC-A',providerId:'PROVIDER-A',snapshot:Service.profileSnapshot(doubleFailure.api.getState()),version:1,status:'review'};
Service.requestCorrection(queuedReview,['fiscal.rfc'],'Revisa el RFC');
let queuedState=doubleFailure.api.getState();queuedState.demoCorrection=Service.clone(queuedReview.request);doubleFailure.api.save(queuedState);
Service.publish(doubleFailure.ctx.localStorage,'doctor_review','DOC-A','PROVIDER-A',queuedReview,{providerId:'PROVIDER-A'});
const queuedControls=mountDoctorControls(doubleFailure,{browserFactory:true}),browserService=doubleFailure.ctx.window.PulzzoDemoServicing;
assert.notEqual(browserService,Service,'test loads the actual browser UMD factory');
const queuedInput=doubleFailure.node('double-failure-input');queuedInput.dataset.doctorCorrectionField='fiscal.rfc';queuedInput.type='text';queuedInput.value='RFC QUEUED';doubleFailure.selectors.set('[data-doctor-correction-field]',[queuedInput]);doubleFailure.api.refresh();queuedInput.events.input();
assert.equal(doubleFailure.api.getState().demoCorrectionDraft['fiscal.rfc'],'RFC QUEUED');
const queuedRawBefore=doubleFailure.data.get(STATE),queuedMailboxBefore=doubleFailure.ctx.localStorage.getItem(Service.STORE),doubleSet=doubleFailure.ctx.localStorage.setItem;
doubleFailure.ctx.localStorage.setItem=(key,value)=>{if(key===STATE)throw Error('Profile quota failure');if(key===Service.STORE&&value===queuedMailboxBefore)throw Error('Mailbox rollback failure');doubleSet(key,value);};
queuedControls.button('Enviar correcciones a nueva revisión').onclick();
assert.match(queuedControls.status.textContent,/envío quedó en el buzón/);assert.equal(doubleFailure.data.get(STATE),queuedRawBefore);assert.equal(doubleFailure.api.getState().demoCorrection.status,'requested');
const queuedMailboxAfter=doubleFailure.ctx.localStorage.getItem(Service.STORE);assert.notEqual(queuedMailboxAfter,queuedMailboxBefore);assert.equal(Service.messages(doubleFailure.ctx.localStorage,'doctor_correction','DOC-A').length,1);
assert.equal(browserService.canEditCorrection(doubleFailure.api.getState(),'DOC-A','fiscal.rfc'),false,'browser default storage blocks queued same nonce');assert.equal(Service.canEditCorrection(doubleFailure.api.getState(),'DOC-A','fiscal.rfc',doubleFailure.ctx.localStorage),false,'explicit storage guard matches browser behavior');
assert.doesNotMatch(doubleFailure.node('doctorProfilePanel').innerHTML,/data-doctor-correction-field=/,'error callback refresh removes editable fields');
queuedInput.value='MUST NOT REPLACE QUEUED VALUE';queuedInput.events.input();assert.equal(doubleFailure.data.get(STATE),queuedRawBefore,'old input callback cannot edit queued submission');assert.equal(doubleFailure.ctx.localStorage.getItem(Service.STORE),queuedMailboxAfter);
assert.throws(()=>browserService.makeCorrectionSubmission(doubleFailure.api.getState(),'DOC-A'),/no habilitados/);
doubleFailure.ctx.localStorage.setItem=doubleSet;queuedControls.button('Enviar correcciones a nueva revisión').onclick();assert.match(queuedControls.status.textContent,/ya estaba en el buzón/);assert.equal(doubleFailure.api.getState().demoCorrection.status,'submitted');assert.equal(doubleFailure.ctx.localStorage.getItem(Service.STORE),queuedMailboxAfter,'retry reconciles local lock without republishing');assert.equal(doubleFailure.api.getState().fiscal.rfc,'RFC ORIGINAL');assert.equal(Service.messages(doubleFailure.ctx.localStorage,'doctor_correction','DOC-A')[0].payload.changes['fiscal.rfc'],'RFC QUEUED');
console.log('PASS: browser UMD mounted double-failure path keeps queued correction immutable, hides inputs, blocks stale callbacks, and reconciles submitted status on retry without republishing.');
