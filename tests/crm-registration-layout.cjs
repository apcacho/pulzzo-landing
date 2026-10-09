'use strict';
// Executable holder DOM-handler and source contracts. No browser rendering or pixel claim.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
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
function attrs(tag){const out={dataset:{},tag:tag.match(/^<(\w+)/)[1]};for(const m of tag.matchAll(/([\w-]+)="([^"]*)"/g)){const key=m[1],value=decode(m[2]);if(key.startsWith('data-'))out.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;else out[key==='class'?'className':key]=value;}out.checked=/\schecked(?:\s|>)/.test(tag);out.required=/\srequired(?:\s|>)/.test(tag);return out;}
function storage(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};}
function setup(kind='patient',query=''){
 const nodes=new Map(),all=[],app=new Element({id:'holderApp'}),toast=new Element({id:'toast'}),preview=new Element({id:'evidencePreview'}),close=new Element({id:'closeEvidence'}),body=new Element();
 preview.children=[new Element({tag:'h2'}),new Element({className:'preview-body'})];
 const staticNodes=[app,toast,preview,close];
 app.install=html=>{nodes.clear();all.length=0;staticNodes.forEach(e=>nodes.set(e.id,e));const cache=new Map();for(const m of html.matchAll(/<(?:form|input|select|button|section|h[123]|div)[^>]*>/g)){const a=attrs(m[0]),e=new Element(a);cache.set(m.index,e);all.push(e);if(e.id)nodes.set(e.id,e);}for(const m of html.matchAll(/<form[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/form>/g)){const form=nodes.get(m[1]),end=m.index+m[0].length;form.children=[...cache.entries()].filter(([index,e])=>index>m.index&&index<end&&['input','button','select'].includes(e.tag)).map(([,e])=>e);if(/<fieldset\s+disabled/.test(m[2]))form.children.forEach(e=>e.disabled=true);}};
 staticNodes.forEach(e=>nodes.set(e.id,e));
 const document={body,title:'',getElementById:id=>nodes.get(id)||null,querySelectorAll:q=>all.filter(e=>q==='[data-holder-action]'?!!e.dataset.holderAction:q==='[data-evidence]'?!!e.dataset.evidence:false),createElement:tag=>new Element({tag})};
 const disk=storage(),session=storage(),listeners={},evidenceRows=new Map();let seq=0;
 const evidence={async put(file,meta){const row={id:'EVIDENCE-'+(++seq),name:file.name,mimeType:file.type,size:file.size,uploadedAt:'2026-10-09T12:00:00.000Z',...meta};evidenceRows.set(row.id,{...row,blob:file});return row;},async get(id){return evidenceRows.get(id)||null;},async remove(id){evidenceRows.delete(id);}};
 class FormData{constructor(form){this.entries=form.children.filter(e=>e.name&&!e.disabled&&(e.type!=='checkbox'||e.checked)).map(e=>[e.name,e.type==='checkbox'?'on':e.value]);}get(k){return this.entries.find(([name])=>name===k)?.[1]??null;}forEach(fn){this.entries.forEach(([k,v])=>fn(v,k));}}
 const context={document,localStorage:disk,sessionStorage:session,location:{search:'?mode=self&kind='+kind+query,hash:''},URLSearchParams,FormData,crypto:require('node:crypto').webcrypto,setTimeout:()=>1,clearTimeout(){},console,addEventListener:(t,f)=>(listeners[t]??=[]).push(f),PulzzoCRMEvidence:{createEvidenceStore:()=>evidence},URL:{createObjectURL:()=> 'blob:demo',revokeObjectURL(){}}};
 context.window=context;vm.createContext(context);for(const file of ['crm-demo-store.js','crm-assisted.js','crm-holder-ui.js'])vm.runInContext(read('assets/js/'+file),context,{filename:file});
 return {context,app,body,toast,nodes,disk,session,get:id=>nodes.get(id),html:()=>app.innerHTML,field:(form,name)=>nodes.get(form).querySelector('[name='+name+']'),state:()=>JSON.parse(disk.getItem('pulzzo_crm_assisted_demo_v1')),action:name=>document.querySelectorAll('[data-holder-action]').find(e=>e.dataset.holderAction===name),listeners};
}
async function register(h,kind){
 assert.ok(h.body.classList.contains('auth-mode'));assert.match(h.html(),/id="registration-title">Comienza tu registro/);assert.match(h.html(),/class="registration-intro"/);assert.match(h.html(),/aria-labelledby="registration-title"/);
 const existing=h.field('identityForm','existing');existing.checked=true;await existing.dispatch('change');assert.equal(h.field('identityForm','name').required,false);assert.equal(h.field('identityForm','name').label.hidden,true);existing.checked=false;await existing.dispatch('change');assert.equal(h.field('identityForm','name').required,true);
 h.field('identityForm','email').value=kind+'@example.test';h.field('identityForm','name').value='Persona <demo>';h.field('identityForm','phone').value='5512340000';await h.get('identityForm').dispatch('submit');
 assert.match(h.html(),/id="verification-title">Revisa tu buzón demo/);assert.match(h.html(),/id="backAuth"/);const code=h.html().match(/aria-label="Código de demostración">(\d{6})/)[1];h.field('codeForm','code').value=code;await h.get('codeForm').dispatch('submit');
 assert.ok(!h.body.classList.contains('auth-mode'));assert.match(h.html(),/class="holder-sections"/);assert.match(h.html(),/Persona &lt;demo&gt;/);assert.equal((h.html().match(/class="form-section"/g)||[]).length,3);
 const expected=kind==='patient'?h.context.PulzzoCRMAssisted.PATIENT_FIELDS:h.context.PulzzoCRMAssisted.DOCTOR_FIELDS;
 assert.deepEqual(h.get('dataForm').children.filter(e=>e.tag==='input').map(e=>e.name).sort(),Array.from(expected).sort(),'All permitted fields rendered exactly once');
 assert.match(h.html(),/name="email" readonly/);assert.ok(h.get('documentForm'));assert.ok(h.action('otp'));assert.ok(h.action('finalConfirmation'));assert.equal(!!h.action('buroConsent'),kind==='patient');
 assert.match(h.html(),/Ningún asesor puede realizarlas por ti/);assert.equal(Object.keys(h.state().expedients).length,1);
}
(async()=>{
 for(const kind of ['patient','doctor']){
  const h=setup(kind);await register(h,kind);
  assert.equal(h.body.classList.contains('doctor'),kind==='doctor');
  const before=h.disk.getItem('pulzzo_crm_assisted_demo_v1');await h.get('submitExp').dispatch('click');assert.equal(h.disk.getItem('pulzzo_crm_assisted_demo_v1'),before,'Incomplete submission remains blocked');
  const form=h.get('dataForm');await form.dispatch('input');h.get('check_finalConfirmation').checked=true;await h.action('finalConfirmation').dispatch('click');assert.match(h.toast.textContent,/Guarda los cambios/,'Dirty guard retained');
  const values=kind==='patient'?{procedure:'Procedimiento DEMO',requestedAmount:'25000',termMonths:'12',monthlyIncome:'18000',address:'Dirección DEMO',identityReference:'ID-DEMO',employment:'Actividad DEMO'}:{specialty:'Especialidad DEMO',professionalLicense:'CEDULA-DEMO',clinicName:'Clínica DEMO',clinicAddress:'Dirección DEMO',representativeName:'Persona DEMO',representativeRole:'Titular',payoutReference:'REFERENCIA-DEMO'};
  for(const [k,v]of Object.entries(values))h.field('dataForm',k).value=v;await form.dispatch('submit');assert.match(h.toast.textContent,/Datos guardados/);
  // Upload handler uses the same local-only descriptor and ownership verification.
  const docs=h.get('documentForm');h.field('documentForm','label').value=kind==='patient'?'identity':'license';h.field('documentForm','file').value={name:'documento-DEMO.pdf',type:'application/pdf',size:128};await docs.dispatch('submit');assert.match(h.toast.textContent,/Archivo ficticio guardado/);assert.match(h.html(),/data-evidence="EVIDENCE-1"/);
  for(const action of kind==='patient'?['otp','buroConsent']:['otp']){h.get('check_'+action).checked=true;await h.action(action).dispatch('click');}
  h.get('check_finalConfirmation').checked=true;
  if(kind==='doctor'){h.get('capacity').value='holder';h.get('authority').checked=true;}
  await h.action('finalConfirmation').dispatch('click');assert.match(h.html(),/<fieldset disabled class="form-fields">/);assert.equal(h.get('documentForm'),undefined);assert.match(h.html(),/Los datos están bloqueados/);
  await h.get('submitExp').dispatch('click');assert.match(h.html(),/<h1>Registro enviado<\/h1>/);assert.match(h.html(),/Observaciones y correcciones/);assert.match(h.html(),/Revisión de documentos/);assert.equal(h.get('submitExp'),undefined);assert.equal(!!h.get('receiveOffer'),kind==='patient');
  const exp=Object.values(h.state().expedients)[0],snapshot=JSON.stringify(exp.submissionSnapshot);await h.get('refreshView').dispatch('click');assert.equal(JSON.stringify(Object.values(h.state().expedients)[0].submissionSnapshot),snapshot);
  assert.ok(h.session.getItem('pulzzo_crm_holder_demo_session'));await h.get('logout').dispatch('click');assert.ok(h.body.classList.contains('auth-mode'));assert.equal(h.session.getItem('pulzzo_crm_holder_demo_session'),null);assert.ok(h.get('identityForm'));
 }
 const login=setup('patient','&login=1');assert.match(login.html(),/Accede a tu expediente/);assert.equal(login.field('identityForm','name').label.hidden,true);assert.equal(login.field('identityForm','name').required,false);
 for(const token of ['--navy:#07142F','--aqua:#20C7D4','--coral:#FF8A5B',"--font-display:'Plus Jakarta Sans'","--font-body:'Inter'",'--control-height:36px;--field-height:38px','--control-height:44px;--field-height:44px'])assert.ok(css.includes(token),token);
 assert.doesNotMatch(css,/#2462db|#e96e31|#18273d|#edf3ff/i,'Unrelated legacy palette removed');assert.match(css,/\.registration-heading h1\{[^}]*text-align:center/);assert.match(css,/\[hidden\]\{display:none!important\}/,'Account-mode hiding survives author label styling');
 assert.match(css,/height:auto;[^}]*white-space:normal;overflow-wrap:anywhere/,'Long action labels can wrap');assert.match(css,/@media\(max-width:520px\)/);assert.match(css,/@media\(forced-colors:active\)/);assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 const heading=read('assets/css/auth-headings.css');assert.match(heading,/#loginView \.login-card > h2/);assert.doesNotMatch(heading,/\.topbar|\.page-heading|\.auth-card\s*\{/,'Public heading centering does not affect BO or parent containers');
 await require('esbuild').transform(css,{loader:'css',logLevel:'silent'}).then(result=>assert.deepEqual(result.warnings,[]));
 console.log('PASS: registration patient/doctor render and actual holder handlers, existing-account mode, grouped field whitelists, dirty/incomplete/final submission locks, evidence ownership, session exit, shared palette, scoped centered auth headings and compact responsive source contracts. Browser pixels unverified.');
})().catch(e=>{console.error(e);process.exitCode=1;});
