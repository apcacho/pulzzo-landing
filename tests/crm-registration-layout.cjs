'use strict';
// Executable holder DOM-handler and source contracts. No browser rendering or pixel claim.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Evidence=require('../assets/js/crm-demo-evidence.js'),{holderIdentityDocument}=require('./fixtures/holder-identity-evidence.cjs');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const css=read('assets/css/crm-holder.css'),source=read('assets/js/crm-holder-ui.js');
const decode=s=>String(s||'').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
class Classes{constructor(){this.values=new Set();}add(s){this.values.add(s);}remove(s){this.values.delete(s);}contains(s){return this.values.has(s);}toggle(s,b){b?this.add(s):this.remove(s);}}
class Element{
 constructor(attrs={}){Object.assign(this,attrs);this.listeners={};this.classList=new Classes();this.dataset=attrs.dataset||{};this.checked=!!attrs.checked;this.disabled=!!attrs.disabled;this.value=attrs.value||'';this.textContent='';this._html='';this.children=[];this.label={hidden:false};}
 get innerHTML(){return this._html;}
 set innerHTML(value){this._html=value;if(this.install)this.install(value);}
 addEventListener(t,f){(this.listeners[t]??=[]).push(f);}
 async dispatch(t){const e={target:this,preventDefault(){}};for(const fn of this.listeners[t]||[])await fn(e);if(this['on'+t])await this['on'+t](e);}
 querySelector(q){if(q.startsWith('[name='))return this.children.find(e=>e.name===q.slice(6,-1).replaceAll('"',''))||null;return this.children.find(e=>q[0]==='.'?e.className===q.slice(1):e.tag===q)||null;}
 closest(q){return q==='label'?this.label:null;}
 replaceChildren(...nodes){this.children=nodes;}
 appendChild(node){this.children.push(node);}
 setAttribute(k,v){this[k]=v;}
 showModal(){this.open=true;}
 close(){this.open=false;}
}
function attrs(tag){const out={dataset:{},tag:tag.match(/^<(\w+)/)[1]};for(const m of tag.matchAll(/([\w-]+)="([^"]*)"/g)){const key=m[1],value=decode(m[2]);if(key.startsWith('data-'))out.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;else out[key==='class'?'className':key]=value;}out.disabled=/\sdisabled(?:\s|>)/.test(tag);out.checked=/\schecked(?:\s|>)/.test(tag);out.required=/\srequired(?:\s|>)/.test(tag);return out;}
function storage(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};}
function setup(kind='patient',query='',options={}){
 const nodes=new Map(),all=[],app=new Element({id:'holderApp'}),toast=new Element({id:'toast'}),preview=new Element({id:'evidencePreview'}),close=new Element({id:'closeEvidence'}),body=new Element();
 preview.children=[new Element({tag:'h2'}),new Element({className:'preview-body'})];
 const staticNodes=[app,toast,preview,close];
 app.install=html=>{nodes.clear();all.length=0;staticNodes.forEach(e=>nodes.set(e.id,e));const cache=new Map();for(const m of html.matchAll(/<(?:form|input|select|button|section|h[123]|div|p|a|span)[^>]*>/g)){const a=attrs(m[0]),e=new Element(a);cache.set(m.index,e);all.push(e);if(e.id)nodes.set(e.id,e);}for(const m of html.matchAll(/<form[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/form>/g)){const form=nodes.get(m[1]),end=m.index+m[0].length;form.children=[...cache.entries()].filter(([index,e])=>index>m.index&&index<end&&['input','button','select'].includes(e.tag)).map(([,e])=>e);if(/<fieldset\s+disabled/.test(m[2]))form.children.forEach(e=>e.disabled=true);}};
 staticNodes.forEach(e=>nodes.set(e.id,e));
 const document={body,title:'',getElementById:id=>nodes.get(id)||null,querySelectorAll:q=>all.filter(e=>q==='[data-holder-action]'?!!e.dataset.holderAction:q==='[data-evidence]'?!!e.dataset.evidence:false),createElement:tag=>new Element({tag})};
 const disk=options.disk||storage(),session=options.session||storage(),listeners={},evidenceRows=new Map();let seq=0;
 const evidence={async put(file,meta){const row={id:'EVIDENCE-'+(++seq),name:file.name,mimeType:file.type,size:file.size,uploadedAt:'2026-10-09T12:00:00.000Z',...meta};evidenceRows.set(row.id,{...row,blob:file});return row;},async get(id){return evidenceRows.get(id)||null;},async remove(id){evidenceRows.delete(id);}};
 class FormData{constructor(form){this.entries=form.children.filter(e=>e.name&&!e.disabled&&(e.type!=='checkbox'||e.checked)).map(e=>[e.name,e.type==='checkbox'?'on':e.value]);}get(k){return this.entries.find(([name])=>name===k)?.[1]??null;}forEach(fn){this.entries.forEach(([k,v])=>fn(v,k));}}
 const route=options.location||{search:'?mode=self&kind='+kind+query,hash:''};route.replace=function(url){this.href=url;};
 const context={document,localStorage:disk,sessionStorage:session,location:route,URLSearchParams,FormData,crypto:require('node:crypto').webcrypto,setTimeout:()=>1,clearTimeout(){},console,addEventListener:(t,f)=>(listeners[t]??=[]).push(f),PulzzoCRMOnboarding:{start(options){assert.equal(options.actor.role,'holder');assert.equal(options.returnUrl,'asistido-demo.html?review=1');return {url:options.kind==='doctor'?'registro-doctor.html?crmMode=holder':'solicitud-paciente.html?crmMode=holder'};},clear(){}},PulzzoCRMEvidence:{createEvidenceStore:()=>evidence,validateBlob:Evidence.validateBlob},URL:{createObjectURL:()=> 'blob:demo',revokeObjectURL(){}}};
 context.window=context;vm.createContext(context);for(const file of ['crm-demo-store.js','crm-assisted.js',...(options.realOnboarding?['crm-onboarding-session.js']:[]),'crm-holder-ui.js'])vm.runInContext(read('assets/js/'+file),context,{filename:file});
 return {context,app,body,toast,nodes,disk,session,get:id=>nodes.get(id),html:()=>app.innerHTML,field:(form,name)=>nodes.get(form).querySelector('[name='+name+']'),state:()=>JSON.parse(disk.getItem('pulzzo_crm_assisted_demo_v1')),action:name=>document.querySelectorAll('[data-holder-action]').find(e=>e.dataset.holderAction===name),listeners};
}
async function register(h,kind){
 assert.ok(h.body.classList.contains('auth-mode'));assert.match(h.html(),/id="registration-title">Abre tu formulario completo/);assert.match(h.html(),/aria-label="Pasos del registro"/);assert.match(h.html(),/aria-labelledby="registration-title"/);
 const existing=h.field('identityForm','existing');existing.checked=true;await existing.dispatch('change');assert.equal(h.field('identityForm','name').required,false);assert.equal(h.field('identityForm','name').label.hidden,true);existing.checked=false;await existing.dispatch('change');assert.equal(h.field('identityForm','name').required,true);
 h.field('identityForm','email').value=kind+'@example.test';h.field('identityForm','name').value='Persona <demo>';h.field('identityForm','phone').value='5512340000';await h.get('identityForm').dispatch('submit');
 assert.match(h.html(),/id="verification-title">Confirma tu acceso demo/);assert.match(h.html(),/id="backAuth"/);const code=h.html().match(/aria-label="Código de demostración">(\d{6})/)[1];h.field('codeForm','code').value=code;await h.get('codeForm').dispatch('submit');
 assert.ok(!h.body.classList.contains('auth-mode'));assert.match(h.html(),/class="holder-sections"/);assert.match(h.html(),/Persona &lt;demo&gt;/);assert.equal((h.html().match(/class="form-section"/g)||[]).length,0,'No duplicate lightweight form');
 assert.equal(h.get('dataForm'),undefined);assert.equal(h.get('documentForm'),undefined);assert.ok(h.get('continueOnboarding'));assert.match(h.context.location.href,kind==='doctor'?/registro-doctor/:/registro-paciente/);
 assert.ok(h.action('otp'));assert.ok(h.action('finalConfirmation'));assert.equal(!!h.action('buroConsent'),kind==='patient');
 assert.match(h.html(),/Ningún asesor puede realizarlas por ti/);assert.equal(Object.keys(h.state().expedients).length,1);
}
if(require.main===module)(async()=>{
 for(const kind of ['patient','doctor']){
  // Retain historic compact-draft recovery coverage through its explicit review route.
  const h=setup(kind,'',{location:{search:'?review=1&kind='+kind,hash:''}});await register(h,kind);
  assert.equal(h.body.classList.contains('doctor'),kind==='doctor');
  const before=h.disk.getItem('pulzzo_crm_assisted_demo_v1');await h.get('submitExp').dispatch('click');assert.equal(h.disk.getItem('pulzzo_crm_assisted_demo_v1'),before,'Incomplete submission remains blocked');
  const values=kind==='patient'?{procedure:'Procedimiento DEMO',requestedAmount:'25000',termMonths:'12',monthlyIncome:'18000',address:'Dirección DEMO',identityReference:'ID-DEMO',employment:'Actividad DEMO'}:{specialty:'Especialidad DEMO',professionalLicense:'CEDULA-DEMO',clinicName:'Clínica DEMO',clinicAddress:'Dirección DEMO',representativeName:'Persona DEMO',representativeRole:'Titular',payoutReference:'REFERENCIA-DEMO'};
  // Keep the compact historic draft flow, but patient identity must be a real
  // scoped holder upload, verified in this VM's private Assisted proof registry.
  const saved=JSON.parse(h.session.getItem('pulzzo_crm_holder_demo_session'));
  const store=h.context.PulzzoCRMStore.createStore({storage:h.disk,actor:saved.actor});
  const api=h.context.PulzzoCRMAssisted.createAssisted({store,actor:saved.actor});
  let document={label:kind==='patient'?'identity':'license',fileName:'documento-DEMO.pdf',evidenceId:'EVIDENCE-1',mimeType:'application/pdf',size:128,demo:true};
  if(kind==='patient'){
   const unchanged=h.disk.getItem('pulzzo_crm_assisted_demo_v1'),unverified=api.editDraft(saved.expId,{fields:values,documents:[document]},store.snapshot().revision);
   assert.equal(unverified.ok,false);assert.equal(unverified.code,'HOLDER_UPLOAD_REQUIRED');assert.equal(h.disk.getItem('pulzzo_crm_assisted_demo_v1'),unchanged,'Metadata-only patient identity must not mutate the draft');
   document=await holderIdentityDocument(store,saved.expId,{id:'EVIDENCE-1',name:'documento-DEMO.pdf',size:128,assisted:h.context.PulzzoCRMAssisted});
  }
  const result=api.editDraft(saved.expId,{fields:values,documents:[document]},store.snapshot().revision);assert.ok(result.ok,result.error);
  await h.get('refreshView').dispatch('click');
  for(const action of kind==='patient'?['otp','buroConsent']:['otp']){h.get('check_'+action).checked=true;await h.action(action).dispatch('click');}
  h.get('check_finalConfirmation').checked=true;
  if(kind==='doctor'){h.get('capacity').value='holder';h.get('authority').checked=true;}
  await h.action('finalConfirmation').dispatch('click');assert.equal(h.get('continueOnboarding'),undefined,'Final review locks full capture entry');assert.equal(h.get('documentForm'),undefined);assert.match(h.html(),/Los datos están bloqueados/);
  const confirmedLogin=setup(kind,'&login=1',{disk:h.disk,session:storage(),realOnboarding:true});await enterIdentity(confirmedLogin,kind+'@example.test',true);await finishVerification(confirmedLogin);assert.equal(confirmedLogin.context.location.href,undefined);assert.equal(confirmedLogin.toast.textContent,'');assert.match(confirmedLogin.html(),/Los datos están bloqueados/);assert.ok(confirmedLogin.get('submitExp'));
  await h.get('submitExp').dispatch('click');assert.match(h.html(),/<h1>Registro enviado<\/h1>/);assert.match(h.html(),/Observaciones y correcciones/);assert.match(h.html(),/Revisión de documentos/);assert.equal(h.get('submitExp'),undefined);assert.equal(!!h.get('receiveOffer'),kind==='patient');
  const submittedLogin=setup(kind,'&login=1',{disk:h.disk,session:storage(),realOnboarding:true});await enterIdentity(submittedLogin,kind+'@example.test',true);await finishVerification(submittedLogin);assert.equal(submittedLogin.context.location.href,undefined);assert.equal(submittedLogin.toast.textContent,'');assert.match(submittedLogin.html(),/<h1>Registro enviado<\/h1>/);assert.ok(submittedLogin.get('receiveCorrection'));assert.ok(submittedLogin.get('receiveDocumentCorrection'));
  const exp=Object.values(h.state().expedients)[0],snapshot=JSON.stringify(exp.submissionSnapshot);await h.get('refreshView').dispatch('click');assert.equal(JSON.stringify(Object.values(h.state().expedients)[0].submissionSnapshot),snapshot);
  assert.ok(h.session.getItem('pulzzo_crm_holder_demo_session'));await h.get('logout').dispatch('click');assert.ok(h.body.classList.contains('auth-mode'));assert.equal(h.session.getItem('pulzzo_crm_holder_demo_session'),null);assert.ok(h.get('identityForm'));
 }
 const login=setup('patient','&login=1');assert.match(login.html(),/Accede a tu registro/);assert.equal(login.field('identityForm','name').label.hidden,true);assert.equal(login.field('identityForm','name').required,false);
 for(const token of ['--navy:#07142F','--aqua:#20C7D4','--coral:#FF8A5B',"--font-display:'Plus Jakarta Sans'","--font-body:'Inter'",'--control-height:36px;--field-height:38px','--control-height:44px;--field-height:44px'])assert.ok(css.includes(token),token);
 assert.doesNotMatch(css,/#2462db|#e96e31|#18273d|#edf3ff/i,'Unrelated legacy palette removed');assert.match(css,/\.registration-heading h1\{[^}]*text-align:center/);assert.match(css,/\[hidden\]\{display:none!important\}/,'Account-mode hiding survives author label styling');
 assert.match(css,/height:auto;[^}]*white-space:normal;overflow-wrap:anywhere/,'Long action labels can wrap');assert.match(css,/@media\(max-width:520px\)/);assert.match(css,/@media\(forced-colors:active\)/);assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 const heading=read('assets/css/auth-headings.css');assert.match(heading,/#loginView \.login-card > h2/);assert.doesNotMatch(heading,/\.topbar|\.page-heading|\.auth-card\s*\{/,'Public heading centering does not affect BO or parent containers');
 await require('esbuild').transform(css,{loader:'css',logLevel:'silent'}).then(result=>assert.deepEqual(result.warnings,[]));
 await verifyEntryRoutes();
 console.log('PASS: registration patient/doctor render and actual holder handlers, existing-account mode, single full-form continuation, submitted/final-confirmed existing login without false errors, incomplete/final submission locks, historic-record compatibility, session exit, shared palette, scoped centered auth headings and compact responsive source contracts. Browser pixels unverified.');
})().catch(e=>{console.error(e);process.exitCode=1;});

function take(out){assert.equal(out.ok,true,out.error);return out.value;}
function staffFixture(kind){
 const Store=require('../assets/js/crm-demo-store.js'),Assisted=require('../assets/js/crm-assisted.js'),Context=require('../assets/js/crm-onboarding-session.js');
 const disk=storage(),session=storage(),actor={id:'gateway_kam',role:'kam'},store=Store.createStore({storage:disk,actor}),api=Assisted.createAssisted({store,actor});
 const referral=take(store.createReferral(kind,store.snapshot().revision));
 function invite(email=kind+'-invited@example.test'){
  const contact=take(store.createContact({type:kind,name:'Preparado por asesor',email,phone:'55'+String([...email].reduce((sum,c,i)=>sum+c.charCodeAt(0)*(i+1),0)).padStart(8,'0'),assignedKam:actor.id,originalSource:'unknown',captureMechanism:'crm_manual'},store.snapshot().revision));
  const exp=take(api.beginDraft({contactId:contact.id,kind},store.snapshot().revision));
  const key=kind==='doctor'?'clinicName':'monthlyIncome',value=kind==='doctor'?'Clínica ya capturada':24680;
  take(api.editDraft(exp.id,{fields:{[key]:value}},store.snapshot().revision));
  const invitation=take(api.invite(exp.id,{email},store.snapshot().revision));
  return {contact,exp,invitation,key,value};
 }
 return {disk,session,actor,store,api,referral,invite};
}
function initialReferralDestination(kind,ref){
 const h=setup(kind,'&ref='+encodeURIComponent(ref),{realOnboarding:true});
 assert.equal(h.get('identityForm'),undefined,'No replacement gateway for new registration');
 const target=new URL(h.context.location.href,'https://demo.example.test/');assert.equal(target.pathname,kind==='doctor'?'/registro-doctor.html':'/registro-paciente.html');assert.equal(target.searchParams.get('ref'),ref);
 return new URL('https://demo.example.test/asistido-demo.html?mode=self&kind='+kind+'&ref='+encodeURIComponent(ref));
}
async function enterIdentity(h,email,existing=false){
 if(h.context.location.href&&/registro-(?:doctor|paciente)\.html/.test(h.context.location.href)){require('./fixtures/native-entry.cjs').start(h,email);return;}
 assert.ok(h.get('identityForm'),'Existing-account access must be visible');h.field('identityForm','email').value=email;
 const checkbox=h.field('identityForm','existing');checkbox.checked=existing;await checkbox.dispatch('change');
 for(const [name,value] of [['name','Titular DEMO'],['phone','55'+String([...email].reduce((sum,c,i)=>sum+c.charCodeAt(0)*(i+1),0)).padStart(8,'0')]]){const field=h.field('identityForm',name);if(field)field.value=value;}
 await h.get('identityForm').dispatch('submit');
}
async function finishVerification(h){
 if(h.native){h.native.submit();return;}
 assert.ok(h.get('codeForm'),h.toast.textContent);assert.equal(h.context.location.href,undefined,'No full-form entry before verification');
 const code=h.html().match(/aria-label="Código de demostración">(\d{6})/)[1];h.field('codeForm','code').value=code;await h.get('codeForm').dispatch('submit');
}
function assertFullDestination(h,kind,expId){
 const url=new URL(h.context.location.href,'https://demo.example.test/');assert.equal(url.pathname,kind==='doctor'?'/registro-doctor.html':'/solicitud-paciente.html');assert.equal(url.searchParams.get('crmMode'),'holder');assert.equal(url.searchParams.get('crmExp'),expId);
 const ctx=h.context.PulzzoCRMOnboarding.open({storage:h.disk,sessionStorage:h.session,kind,location:url});assert.equal(ctx.expId,expId);assert.equal(ctx.kind,kind);assert.equal(ctx.isHolder,true);assert.equal(ctx.isVerified,true);assert.equal(ctx.reviewUrl,'asistido-demo.html?review=1');return ctx;
}
async function verifyEntryRoutes(){
 for(const kind of ['patient','doctor']){
  const f=staffFixture(kind),target=initialReferralDestination(kind,f.referral.token),h=setup(kind,'',{disk:f.disk,session:f.session,location:{search:target.search,hash:''},realOnboarding:true});
  assert.equal(h.get('identityForm'),undefined);assert.match(h.context.location.href,/registro-/);assert.doesNotMatch(h.html(),/Tu expediente,<br>|registration-intro|Revisa tu buzón/);assert.equal(Object.keys(f.store.snapshot().expedients).length,0);
  await enterIdentity(h,kind+'-first@example.test');assert.equal(Object.keys(f.store.snapshot().expedients).length,0,'Identity entry alone must not create an expediente');
  h.native.submit('invalid');assert.match(h.toast.textContent,/no coincide/);assert.equal(Object.keys(f.store.snapshot().expedients).length,0);
  await finishVerification(h);const first=Object.values(h.state().expedients)[0],firstSnapshot=JSON.stringify(first);assertFullDestination(h,kind,first.id);
  const firstContact=h.state().contacts[first.contactId];assert.equal(firstContact.referringKam,f.actor.id);assert.equal(firstContact.assignedKam,f.actor.id);assert.deepEqual(first.holderActions,{});assert.equal(h.disk.getItem(kind==='doctor'?'pulzzo_doctor':'pulzzo_patient'),null,'No global portal account created');
  // Follow the same general referral again with an unrelated holder still saved.
  const second=setup(kind,'',{disk:f.disk,session:f.session,location:{search:target.search,hash:''},realOnboarding:true});assert.equal(second.get('identityForm'),undefined);assert.match(second.context.location.href,/registro-/,'New referral cannot silently resume prior holder');
  await enterIdentity(second,kind+'-second@example.test');await finishVerification(second);const newer=Object.values(second.state().expedients).find(x=>x.id!==first.id);assert.ok(newer,second.html()+second.toast.textContent);assertFullDestination(second,kind,newer.id);assert.equal(JSON.stringify(second.state().expedients[first.id]),firstSnapshot,'Other holder expediente stays unchanged');
  const login=setup(kind,'',{disk:f.disk,session:f.session,location:{search:'?login=1&kind='+kind,hash:''},realOnboarding:true});assert.ok(login.get('identityForm'),'Explicit login must ask whose email to use');await enterIdentity(login,kind+'-first@example.test',true);await finishVerification(login);assertFullDestination(login,kind,first.id);assert.equal(Object.keys(login.state().expedients).length,2,'Existing login creates no duplicate');
  const review=setup(kind,'',{disk:f.disk,session:f.session,location:{search:'?review=1',hash:''},realOnboarding:true});assert.ok(review.get('continueOnboarding'),'Explicit review still resumes the current record');assert.equal(review.get('identityForm'),undefined);
  const invited=f.invite(),inviteURL={search:'',hash:'#invite='+invited.invitation.token},claim=setup(kind,'',{disk:f.disk,session:f.session,location:inviteURL,realOnboarding:true});assert.equal(claim.get('identityForm'),undefined);assert.match(claim.context.location.href,/registro-/);
  await enterIdentity(claim,'wrong@example.test');assert.equal(claim.native.nodes['verify-btn'].disabled,true);assert.match(claim.toast.textContent,/no corresponde/);claim.context.location.href=(kind==='doctor'?'registro-doctor.html':'registro-paciente.html')+'?invite='+invited.invitation.token;await enterIdentity(claim,invited.contact.email);await finishVerification(claim);assertFullDestination(claim,kind,invited.exp.id);assert.equal(claim.state().expedients[invited.exp.id].fields[invited.key],invited.value,'Native registration retains prior captured non-identity fields');assert.equal(Object.keys(claim.state().expedients).length,3);
  const resumed=setup(kind,'',{disk:f.disk,session:f.session,location:{...inviteURL},realOnboarding:true});assert.ok(resumed.get('continueOnboarding'),'Claimed exact invitation resumes only its matching holder session');
  // Used links outside their exact saved session offer token-free existing access.
  const used=setup(kind,'',{disk:f.disk,session:storage(),location:{...inviteURL},realOnboarding:true});assert.equal(used.get('identityForm'),undefined);assert.match(used.html(),/Revisa tu enlace de acceso/);assert.match(used.html(),/asistido-demo\.html\?login=1&amp;kind=patient/);assert.match(used.html(),/asistido-demo\.html\?login=1&amp;kind=doctor/);assert.doesNotMatch(used.html(),/#invite=|name="existing"|mode=self/);
  const recovered=setup(kind,'',{disk:f.disk,session:storage(),location:{search:'?login=1&kind='+kind,hash:''},realOnboarding:true});await enterIdentity(recovered,invited.contact.email,true);await finishVerification(recovered);assertFullDestination(recovered,kind,invited.exp.id);
  // Expired/revoked invitations cannot accidentally become a new self-registration.
  const expired=f.invite(kind+'-expired@example.test'),raw=JSON.parse(f.disk.getItem('pulzzo_crm_assisted_demo_v1'));raw.invitations[expired.invitation.id].expiresAt='2000-01-01T00:00:00.000Z';f.disk.setItem('pulzzo_crm_assisted_demo_v1',JSON.stringify(raw));
  const stale=setup(kind,'',{disk:f.disk,session:storage(),location:{search:'',hash:'#invite='+expired.invitation.token},realOnboarding:true});assert.equal(stale.get('identityForm'),undefined);assert.match(stale.html(),/venció|nueva invitación/);assert.doesNotMatch(stale.html(),/mode=self|name="existing"/);
 }
 // Exercise the shipped lookup against legacy snapshots with the same identity
 // in both types; normal identity reconciliation independently rejects new overlaps.
 const lookupSource=source.match(/function findExistingExpedient\(s,email,requestedKind,holderId,requestedRecord\)\{[\s\S]*?\n\}/)[0],lookup=vm.runInNewContext('('+lookupSource+')');
 const snapshot={contacts:{p:{id:'p',type:'patient',email:'same@example.test',holderId:'same_holder'},d:{id:'d',type:'doctor',email:'same@example.test',holderId:'same_holder'}},expedients:{p:{id:'ep',contactId:'p',kind:'patient',holderIdentity:{id:'same_holder',email:'same@example.test'}},d:{id:'ed',contactId:'d',kind:'doctor',holderIdentity:{id:'same_holder',email:'same@example.test'}}}};
 assert.equal(lookup(snapshot,'same@example.test','patient','same_holder').id,'ep');assert.equal(lookup(snapshot,'same@example.test','doctor','same_holder').id,'ed');assert.equal(lookup(snapshot,'same@example.test','doctor','other_holder'),undefined);
 const f=staffFixture('patient'),h=setup('patient','',{disk:f.disk,session:f.session,realOnboarding:true});await enterIdentity(h,'ambiguous@example.test');await finishVerification(h);const existing=Object.values(h.state().expedients)[0];
 // A corrupt/legacy duplicate expediente must fail closed instead of using .find().
 const raw=JSON.parse(f.disk.getItem('pulzzo_crm_assisted_demo_v1')),original=raw.expedients[existing.id],duplicate={...original,id:'duplicate_gateway_expedient'};raw.expedients[duplicate.id]=duplicate;f.disk.setItem('pulzzo_crm_assisted_demo_v1',JSON.stringify(raw));
 const ambiguous=setup('patient','',{disk:f.disk,session:storage(),location:{search:'?login=1&kind=patient',hash:''},realOnboarding:true});await enterIdentity(ambiguous,'ambiguous@example.test',true);await finishVerification(ambiguous);assert.equal(ambiguous.context.location.href,undefined);assert.match(ambiguous.html(),/más de un expediente/);assert.equal(ambiguous.session.getItem('pulzzo_crm_holder_demo_session'),null);
 console.log('PASS: actual public referral redirects, patient/doctor full-form routes and scoped records, prior-session isolation, explicit existing login, exact invitation/data preservation, used/expired-link recovery, wrong-email/code guards, cross-kind account selection and ambiguous-record refusal.');
}

module.exports={setup,storage,enterIdentity,finishVerification,assertFullDestination};
