'use strict';
const assert=require('node:assert/strict'),Office=require('../assets/js/crm-demo-office.js'),Store=require('../assets/js/crm-demo-store.js');
class Element{
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this.attributes={};this.hidden=false;this.disabled=false;this.value='';this.textContent='';}
 append(...nodes){for(const n of nodes)this.appendChild(n);}
 appendChild(node){this.children.push(node);node.parent=this;if(this.tagName==='SELECT'&&this.children.length===1)this.value=node.value;return node;}
 replaceChildren(...nodes){this.children=[];if(this.tagName==='SELECT')this.value='';this.append(...nodes);}
 setAttribute(k,v){this.attributes[k]=v;}
 removeAttribute(k){delete this.attributes[k];}
 showModal(){this.open=true;}
 close(){this.open=false;}
 addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
 async dispatch(k,e={}){for(const fn of this.listeners[k]||[])await fn({...e,target:this});}
 get options(){return this.children.filter(n=>n.tagName==='OPTION');}
 querySelectorAll(selector){const all=[];for(const c of this.children){if(selector==='input:checked'&&c.tagName==='INPUT'&&c.checked)all.push(c);all.push(...c.querySelectorAll(selector));}return all;}
}
function descendants(root){return [root,...root.children.flatMap(descendants)];}
(async()=>{
const nodes={main:new Element('main'),loginBtn:new Element('button'),loginPass:new Element('input'),logoutBtn:new Element('button')};
const doc={body:nodes.main,createElement:tag=>new Element(tag),createTextNode:text=>{const n=new Element('#text');n.textContent=text;return n;},querySelector:s=>s==='main'?nodes.main:null,getElementById:id=>nodes[id]||descendants(nodes.main).find(n=>n.id===id)};
const state={version:1,revision:9,demo:true,createdAt:null,updatedAt:null,contacts:{},expedients:{},invitations:{},referrals:{},tasks:{},activities:{},audit:{},events:{}};
for(const kind of ['patient','doctor']){state.contacts[kind]={id:kind,name:kind==='patient'?'Paciente privado':'Doctora propia',type:kind,assignedKam:'kam_ana'};state.expedients[kind]={id:kind,contactId:kind,kind,submittedAt:'2026-10-09T00:00:00Z'};}
const storage={getItem:k=>k===Store.STORAGE_KEY?JSON.stringify(state):null,setItem(){throw Error('Unexpected read-only write');}};let role=null,calls=[];
const has=cap=>({admin:['patient','provider','risk','docs'],provider:['provider','docs'],operations:['patient','docs'],risk:['patient','risk'],readonly:[]}[role]||[]).includes(cap);
const office={actor:()=>role+'@example.test',actorId:()=> 'bo_'+role,canImportPatient:()=>has('risk'),canImportProvider:()=>has('provider'),canReadPatient:()=>has('patient'),canReadProvider:()=>has('provider'),canReviewDocument:kind=>has('docs')&&has(kind==='patient'?'patient':'provider'),assertCurrent(){},refresh(){},getDatabase:()=>({patients:[],providers:[]}),commitCorrection:(...args)=>{calls.push(['field',...args]);return {};},commitDocumentCorrection:(...args)=>{calls.push(['document',...args]);return {};},commitDecision:(...args)=>{calls.push(['decision',...args]);return {};}};
const corrections={FIELD_LABELS:{patient:{address:'Domicilio'},doctor:{specialty:'Especialidad'}},readReview:(_s,e)=>({status:'requested',allowedFields:[e.kind==='patient'?'address':'specialty']}),listDocumentOptions:(_s,e)=>[{id:'doc_'+e.id,label:'Documento exacto',fileName:'ficticio.pdf'}],readDocumentReview:(_s,e)=>({docId:'doc_'+e.id,status:'requested',activeDocument:{evidenceId:'ev_'+e.id,mimeType:'application/pdf',size:32,fileName:'demo.pdf'}})};
const Evidence=require('../assets/js/crm-demo-evidence.js'),urls=[],revoked=[];let evidenceGate=null;
const w={document:doc,localStorage:storage,PulzzoCRMStore:Store,PulzzoCRMOfficeAdapter:office,PulzzoCRMCorrections:corrections,URL:{createObjectURL:blob=>{urls.push(blob);return 'blob:office-'+urls.length;},revokeObjectURL:url=>revoked.push(url)},PulzzoCRMEvidence:{validateBlob:Evidence.validateBlob,createEvidenceStore:()=>({get:async id=>{if(evidenceGate)await evidenceGate;return {id,contactId:id.slice(3),name:'ficticio.pdf',mimeType:'application/pdf',size:32,blob:new Blob(['%PDF-1.4\n'+' '.repeat(17)+'\n%%EOF'],{type:'application/pdf'})};},close:async()=>{}})}};
Office.mount(w);
const box=doc.getElementById('crm-intake-panel'),button=text=>descendants(box).find(n=>n.tagName==='BUTTON'&&n.textContent===text),select=()=>descendants(box).find(n=>n.attributes['aria-label']==='Expediente CRM enviado'),docSelect=()=>descendants(box).find(n=>n.attributes['aria-label']==='Documento CRM observado');
assert.equal(box.hidden,true);assert.equal(select().options.length,0);
role='provider';await nodes.loginBtn.dispatch('click');assert.equal(box.hidden,false);assert.deepEqual(select().options.map(n=>n.value),['doctor']);assert.ok(!select().options.some(n=>n.textContent.includes('Paciente privado')));assert.equal(button('Recibir decisión del titular').disabled,true);assert.equal(docSelect().value,'doc_doctor');
await button('Ver versión actual').dispatch('click');assert.equal(urls.length,1);assert.equal(descendants(box).find(n=>n.tagName==='DIALOG').open,true);await button('Cerrar vista previa').dispatch('click');assert.equal(revoked.length,1);
await button('Solicitar nueva versión').dispatch('click');assert.deepEqual(calls.at(-1).slice(0,4),['document','request','doctor',9]);assert.equal(calls.at(-1)[4].docId,'doc_doctor');
role='operations';await nodes.loginBtn.dispatch('click');assert.deepEqual(select().options.map(n=>n.value),['patient']);assert.equal(button('Importar expediente seleccionado').disabled,true);assert.equal(button('Solicitar corrección seleccionada').disabled,true);assert.equal(button('Recibir decisión del titular').disabled,true);await button('Recibir versión reenviada').dispatch('click');assert.equal(calls.at(-1)[0],'document');assert.equal(calls.at(-1)[2],'patient');
role='admin';await nodes.loginPass.dispatch('keydown',{key:'Enter'});assert.equal(select().options.length,2);const field=descendants(box).find(n=>n.tagName==='INPUT'&&n.value==='address');field.checked=true;await button('Solicitar corrección seleccionada').dispatch('click');assert.deepEqual(calls.at(-1).slice(0,4),['field','request','patient',9]);assert.deepEqual(calls.at(-1)[4].fields,['address']);
role='provider';await nodes.loginBtn.dispatch('click');let resolveEvidence;evidenceGate=new Promise(r=>resolveEvidence=r);const pendingPreview=button('Ver versión actual').dispatch('click');await Promise.resolve();role='operations';await nodes.loginBtn.dispatch('click');resolveEvidence();await pendingPreview;evidenceGate=null;assert.equal(urls.length,1,'A delayed prior-role evidence read cannot open');
role='readonly';await nodes.loginBtn.dispatch('click');assert.equal(box.hidden,true);assert.equal(select().options.length,0);const before=calls.length;await button('Recibir decisión del titular').dispatch('click');assert.equal(calls.length,before);await nodes.logoutBtn.dispatch('click');assert.equal(box.hidden,true);assert.equal(docSelect().options.length,0);
console.log('PASS: mounted BO controls route exact record/document IDs, role-filter patient/provider data, prevent stale hidden selection, invoke field/document callbacks with current revision, and verify Blob preview role/intent cancellation and URL cleanup.');

})().catch(e=>{console.error(e);process.exitCode=1;});
