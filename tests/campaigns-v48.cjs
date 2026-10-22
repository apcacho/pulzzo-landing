'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const UI=require('../assets/js/crm-demo-ui.js');
const Store=require('../assets/js/crm-demo-store.js');

function carteraRuntime(){
 const source=fs.readFileSync(path.join(root,'backoffice.html'),'utf8');
 const script=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m=>m[1].includes('const baseState='))[1];
 const elements=new Map();
 function el(id){if(!elements.has(id))elements.set(id,{id,value:'',dataset:{},style:{},innerHTML:'',textContent:'',checked:false,disabled:false,files:[],classList:{add(){},remove(){},toggle(){},contains(){return false;}},addEventListener(){},setAttribute(){},focus(){},closest(){return null;},querySelector(){return null;},querySelectorAll(){return [];},appendChild(){},scrollIntoView(){}});return elements.get(id);}
 const storage=new Map();
 const document={querySelector:s=>el(String(s).replace(/^#/,'')),querySelectorAll(){return [];},getElementById:id=>el(id),addEventListener(){},createElement:()=>el('node'),head:el('head'),body:{style:{},classList:{add(){},remove(){},contains(){return false;}},appendChild(){},removeChild(){}}};
 const FixedDate=class extends Date{constructor(...a){super(...(a.length?a:['2026-10-15T18:00:00Z']));}static now(){return new Date('2026-10-15T18:00:00Z').getTime();}};
 const context=vm.createContext({document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},window:{addEventListener(){},scrollTo(){},open(){return {document:{open(){},write(){},close(){}}}}},confirm:()=>true,Date:FixedDate,console,Intl,Blob,URL:Object.assign(URL,{createObjectURL:()=>'blob:demo',revokeObjectURL(){}}),setTimeout(){},clearTimeout(){},innerWidth:1200,fetch(){throw Error('no hay envío real');}});
 require('./fixtures/staff-session.cjs')(context);
 vm.runInContext(script,context);
 vm.runInContext("render=()=>{};renderPatientDetail=()=>{};closeModal=()=>{};session=testStaffSession('admin');",context);
 vm.runInContext(fs.readFileSync(path.join(root,'assets/js/backoffice-configuration.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(root,'assets/js/backoffice-portfolio.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(root,'assets/js/backoffice-portfolio-payment.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(root,'assets/js/backoffice-cartera-fase1.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(root,'assets/js/backoffice-cartera-cobranza.js'),'utf8'),context);
 return {run:code=>vm.runInContext(code,context),el,storage};
}

class Classes {constructor(){this.values=new Set();}add(v){this.values.add(v);}remove(v){this.values.delete(v);}toggle(v,on){if(on)this.add(v);else this.remove(v);}}
class Element {
 constructor(id){this.id=id;this.value='';this.textContent='';this.innerHTML='';this.className='';this.hidden=false;this.disabled=false;this.open=false;this.dataset={};this.listeners={};this.classList=new Classes();this.attributes={};}
 addEventListener(t,f){(this.listeners[t]??=[]).push(f);}
 async dispatch(t,event={}){for(const f of this.listeners[t]||[])await f(Object.assign({target:this,preventDefault(){}},event));}
 setAttribute(k,v){this.attributes[k]=v;if(k==='open')this.open=true;}
 removeAttribute(k){delete this.attributes[k];if(k==='open')this.open=false;}
 showModal(){this.open=true;}
 close(){this.open=false;}
 querySelector(){return null;}
 focus(){} select(){}
}
class MemoryStorage {constructor(){this.map=new Map();}getItem(k){return this.map.has(k)?this.map.get(k):null;}setItem(k,v){this.map.set(k,String(v));}removeItem(k){this.map.delete(k);}}
function crmSetup(){
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id);};
 const html=fs.readFileSync(path.join(root,'crm-demo.html'),'utf8');
 for(const m of html.matchAll(/\bid="([^"]+)"/g))get(m[1]);
 const contexts=['patient','doctor'].map(v=>{const e=new Element();e.dataset.contextSwitch=v;return e;}),views=['contacts','tasks','dashboard'].map(v=>{const e=new Element();e.dataset.view=v;return e;});
 const document={body:{dataset:{}},listeners:{},getElementById:get,querySelectorAll:q=>q==='[data-context-switch]'?contexts:q==='[data-view]'?views:[],addEventListener(t,f){(this.listeners[t]??=[]).push(f);}};
 const storage=new MemoryStorage();
 const window={document,localStorage:storage,indexedDB:{},location:{href:'https://demo.test/crm-demo.html',hash:''},listeners:{},navigator:{clipboard:{writeText:async()=>{}}},URL:{createObjectURL:()=>'blob:fixture',revokeObjectURL(){}},history:{pushState(_s,_t,url){window.location.hash=url;},replaceState(_s,_t,url){window.location.hash=url;}},addEventListener(t,f){(window.listeners[t]??=[]).push(f);}};
 const app=UI.createApp({window,document,storage,storeModule:Store,assistedModule:require('../assets/js/crm-assisted.js'),analyticsModule:require('../assets/js/crm-demo-analytics.js'),now:()=>new Date('2026-10-09T12:00:00.000Z')});
 async function submit(values={}){const error=new Element(),elements={namedItem:name=>({value:values[name]??''})};const form={elements,classList:new Classes(),querySelector:()=>error,checkValidity:()=>true,reportValidity(){}};await get('dialogContent').dispatch('submit',{target:form,preventDefault(){}});return {error:error.textContent,form};}
 async function click(action,id,data={}){const target={dataset:{action,id,...data},disabled:false,checked:data.checked};target.closest=()=>target;for(const fn of document.listeners.click||[])await fn({target,preventDefault(){}});}
 return {app,get,storage,submit,click};
}
function addContact(h,name,email,phone){
 const created=h.app.state.store.createContact({type:'patient',name,email,phone,originalSource:'manual',assignedKam:'kam_ana'},h.app.state.store.snapshot().revision);
 assert.equal(created.ok,true,created.error);
 assert.equal(created.value.marketingConsent,undefined);
 return created.value;
}
let passed=0;function test(name,fn){return Promise.resolve(fn()).then(()=>{passed++;console.log('PASS: '+name);});}

(async()=>{
await test('Cobranza selection follows the filtered rows',()=>{
 const r=carteraRuntime();
 r.run("portfolioState.tab='collections';portfolioState.stage='all';portfolioState.aging='all';portfolioState.from='';portfolioState.to='';portfolioState.query='';portfolioState.creditState='active';renderPortfolio();");
 const sheet=r.el('portfolioContent').innerHTML;
 assert.match(sheet,/Seleccionar todos \(filtrados\)/);
 assert.match(sheet,/aria-label="Seleccionar todos \(filtrados\)"/);
 r.run('carteraCampaignSelectFiltered(true);');
 const all=r.run('carteraCampaignSelected()');
 assert.ok(all.includes('APP-CARTERA-1106'));
 assert.ok(all.includes('APP-CARTERA-1101'));
 assert.ok(all.length>2);
 r.run("portfolioState.from='2026-10-15';portfolioState.to='2026-10-15';renderPortfolio();");
 const day=r.run('carteraCampaignSelected()');
 assert.ok(day.includes('APP-CARTERA-1102'));
 assert.ok(!day.includes('APP-CARTERA-1101'));
 assert.ok(day.length<all.length);
 r.run("portfolioState.from='';portfolioState.to='';portfolioState.stage='mora_temprana';renderPortfolio();carteraCampaignSelectFiltered(true);");
 assert.equal(r.run('JSON.stringify(carteraCampaignSelected())'),'["APP-CARTERA-1106"]');
 r.run("portfolioState.stage='all';portfolioState.query='Renata';renderPortfolio();carteraCampaignSelectFiltered(true);");
 assert.equal(r.run('JSON.stringify(carteraCampaignSelected())'),'["APP-CARTERA-1109"]');
 r.run("portfolioState.query='';renderPortfolio();carteraCampaignSelectFiltered(false);carteraCampaignToggle('APP-CARTERA-1106',true);");
 assert.match(r.el('portfolioContent').innerHTML,/1 seleccionados · Enviar campaña de correo/);
});

await test('Cobranza exclusions, demo history and campaign log reuse the mail templates',()=>{
 const r=carteraRuntime();
 r.run("portfolioState.tab='collections';portfolioState.stage='all';portfolioState.aging='all';portfolioState.from='';portfolioState.to='';portfolioState.query='';renderPortfolio();carteraCampaignSelectFiltered(true);");
 r.run("var pablo=db.patients.find(item=>item.id==='APP-CARTERA-1108');pablo.application.carteraAgreements=[{id:'ACU-PAUSA',type:'created',agreementDate:carteraToday(),compromiseDate:carteraAddDays(carteraToday(),5),amount:100,forgiveness:'moratory_total',forgivenessAmount:10,installmentId:'x',originalDue:'2026-01-01'}];db.patients.find(item=>item.id==='APP-CARTERA-1107').patient.email='';");
 const plan=r.run("carteraCampaignPlan(carteraCampaignSelected(),'mora_temprana')");
 const reason=id=>plan.excluded.find(row=>row.id===id);
 assert.equal(reason('APP-CARTERA-1109').reason,'Acuerdo vigente');
 assert.equal(reason('APP-CARTERA-1101').reason,'Ya recibió un mensaje hoy');
 assert.equal(reason('APP-CARTERA-1107').reason,'Sin correo');
 assert.equal(reason('APP-CARTERA-1108').reason,'Pausado');
 assert.ok(plan.included.some(row=>row.id==='APP-CARTERA-1106'));
 const dialog=r.run("carteraCampaignDialogHtml(['APP-CARTERA-1106'],'mora_temprana','Mora de octubre')");
 assert.match(dialog,/Enviar \(demo\)/);
 assert.match(dialog,/Nicolás/);
 assert.match(dialog,/Mora temprana/);
 assert.doesNotMatch(dialog,/https?:\/\/(?!wa\.me)/);
 const before=r.run("((db.patients.find(item=>item.id==='APP-CARTERA-1109').application.carteraMessages)||[]).length");
 const sent=r.run("carteraSendCampaign({name:'Mora de octubre',templateId:'mora_temprana',ids:['APP-CARTERA-1106','APP-CARTERA-1109','APP-CARTERA-1101','APP-CARTERA-1107']})");
 assert.equal(sent.ok,true);
 assert.equal(sent.sent,1);
 assert.equal(sent.excluded,3);
 const message=r.run("db.patients.find(item=>item.id==='APP-CARTERA-1106').application.carteraMessages.slice(-1)[0]");
 assert.equal(message.action,'Enviado (demo)');
 assert.equal(message.campaignName,'Mora de octubre');
 assert.equal(message.templateId,'mora_temprana');
 assert.equal(message.actor,r.run('session.email'));
 assert.match(message.comment,/Mora de octubre/);
 assert.match(message.comment,/Mora temprana/);
 assert.match(message.comment,/15\/10\/2026/);
 assert.match(message.comment,/Enviado \(demo\)/);
 assert.match(r.run("carteraCreditWorkspaceHtml(db.patients.find(item=>item.id==='APP-CARTERA-1106'))"),/Historial de contacto[\s\S]*Mora de octubre/);
 assert.equal(r.run("((db.patients.find(item=>item.id==='APP-CARTERA-1109').application.carteraMessages)||[]).length"),before);
 const campaign=r.run('carteraCobranzaRead().campaigns[0]');
 assert.equal(campaign.name,'Mora de octubre');
 assert.equal(campaign.date,'2026-10-15');
 assert.equal(campaign.template,'mora_temprana');
 assert.equal(campaign.sent,1);
 assert.equal(campaign.excluded,3);
 assert.equal(campaign.user,r.run('session.email'));
 r.run("portfolioState.tab='collections';renderPortfolio();");
 const html=r.el('portfolioContent').innerHTML;
 assert.match(html,/Campañas/);
 assert.match(html,/Mora de octubre/);
 assert.match(html,/15\/10\/2026/);
 r.run("session=testStaffSession('readonly');renderPortfolio();");
 assert.equal(r.run('carteraCampaignAllowed()'),false);
 assert.doesNotMatch(r.el('portfolioContent').innerHTML,/Seleccionar todos \(filtrados\)|Enviar campaña de correo|Campañas/);
 assert.equal(r.run("carteraSendCampaign({name:'No',templateId:'mora_temprana',ids:['APP-CARTERA-1106']}).ok"),false);
});

await test('CRM campaigns require consent, keep drafts editable and send one WhatsApp at a time',async()=>{
 const h=crmSetup();
 assert.match(h.get('contactList').innerHTML,/No hay contactos/);
 assert.equal(h.storage.getItem('pulzzo_crm_campaigns_demo_v1'),null);
 assert.equal(h.storage.getItem('pulzzo_crm_campaign_drafts_v1'),null);
 const ana=addContact(h,'Ana Unica','ana.unica@example.test','5500000101');
 const bruno=addContact(h,'Bruno Otro','bruno.otro@example.test','5500000102');
 const clara=addContact(h,'Clara Lejos','clara.lejos@example.test','5500000103');
 assert.equal(h.app.state.store.updateContact(ana.id,{marketingConsent:true},h.app.state.store.snapshot().revision).ok,true);
 assert.equal(h.app.state.store.getContact(ana.id).marketingConsent,true);
 assert.equal(h.app.state.store.getContact(bruno.id).marketingConsent,undefined);
 h.app.state.contactPageSize=1;
 h.app.render();
 assert.equal((h.get('contactList').innerHTML.match(/<button class="contact-row/g)||[]).length,1);
 await h.click('campaign-select-filtered');
 assert.deepEqual(Object.keys(h.app.state.campaignSelection).sort(),[ana.id,bruno.id,clara.id].sort());
 h.get('contactSearch').value='Unica';
 h.app.render();
 assert.deepEqual(Object.keys(h.app.state.campaignSelection),[ana.id]);
 h.get('contactSearch').value='';
 h.app.render();
 await h.click('campaign-select-filtered');
 assert.match(h.get('contactList').innerHTML,/Campaña/);
 assert.match(h.get('contactList').innerHTML,/Seleccionar todos \(filtrados\)/);
 await h.click('select-contact',ana.id);
 assert.match(h.get('contactDetail').innerHTML,/Acepta recibir mensajes/);
 assert.match(h.get('contactDetail').innerHTML,/href="https:\/\/wa\.me\/\d+"/);
 assert.doesNotMatch(h.get('contactDetail').innerHTML,/wa\.me\/\d+\?text=/);
 await h.click('open-campaign');
 const dialog=h.get('dialogContent').innerHTML;
 assert.match(dialog,/Enviar \(demo\)/);
 assert.match(dialog,/Seguimiento de solicitud/);
 assert.match(dialog,/Recordatorio de documentos/);
 assert.match(dialog,/Invitación a simular/);
 assert.match(dialog,/Borrador editable/);
 assert.match(dialog,/Sin consentimiento/);
 assert.match(dialog,/Ana Unica/);
 assert.match(dialog,/darse de baja/);
 assert.match(dialog,/WhatsApp masivo requiere API de Meta con costo por conversación; pendiente\./);
 assert.equal(h.storage.getItem('pulzzo_crm_campaign_drafts_v1'),null);
 const sent=await h.submit({name:'Seguimiento octubre',template:'seguimiento_solicitud',subject:'Seguimiento de tu solicitud',body:'Hola {nombre},\n\nQueremos saber cómo va tu solicitud.'});
 assert.equal(sent.error,'');
 const anaMail=h.app.state.store.listActivities({contactId:ana.id}).filter(item=>item.type==='email');
 assert.equal(anaMail.length,1);
 assert.match(anaMail[0].summary,/Enviado \(demo\)/);
 assert.match(anaMail[0].summary,/Seguimiento octubre/);
 assert.match(anaMail[0].summary,/Seguimiento de solicitud/);
 assert.match(anaMail[0].summary,/09\/10\/2026/);
 assert.match(anaMail[0].summary,/darse de baja/);
 assert.equal(h.app.state.store.listActivities({contactId:bruno.id}).filter(item=>item.type==='email').length,0);
 assert.equal(h.app.state.store.listActivities({contactId:clara.id}).filter(item=>item.type==='email').length,0);
 const logged=JSON.parse(h.storage.getItem('pulzzo_crm_campaigns_demo_v1'));
 assert.equal(logged[0].name,'Seguimiento octubre');
 assert.equal(logged[0].template,'seguimiento_solicitud');
 assert.equal(logged[0].sent,1);
 assert.equal(logged[0].excluded,2);
 assert.equal(logged[0].date,'2026-10-09');
 assert.match(h.get('contactList').innerHTML,/Campañas/);
 assert.match(h.get('contactList').innerHTML,/Seguimiento octubre/);
 assert.equal(h.storage.getItem('pulzzo_crm_campaign_drafts_v1'),null);
 h.app.state.campaignSelection={[ana.id]:true,[bruno.id]:true};
 await h.click('open-campaign');
 const blocked=await h.submit({name:'Otra',template:'recordatorio_documentos',subject:'Documentos',body:'Hola {nombre}'});
 assert.match(blocked.error,/Ya recibió un mensaje hoy|Nadie queda/);
 await h.click('select-contact',ana.id);
 await h.click('unsubscribe',ana.id);
 assert.equal(h.app.state.store.getContact(ana.id).marketingConsent,false);
 h.app.state.campaignSelection={[ana.id]:true};
 await h.click('open-campaign');
 assert.match(h.get('dialogContent').innerHTML,/Sin consentimiento/);
 const denied=await h.submit({name:'Baja',template:'invitacion_simular',subject:'Simula',body:'Hola {nombre}'});
 assert.match(denied.error,/Nadie queda/);
 assert.equal(h.app.state.store.listActivities({contactId:ana.id}).filter(item=>item.type==='email').length,1);
 await h.click('save-campaign-draft');
 const drafts=JSON.parse(h.storage.getItem('pulzzo_crm_campaign_drafts_v1'));
 assert.ok(drafts.seguimiento_solicitud.subject);
 assert.doesNotMatch(fs.readFileSync(path.join(root,'aviso-privacidad.html'),'utf8'),/Invitación a simular/);
 assert.equal(h.app.state.store.updateContact(ana.id,{marketingConsent:true},h.app.state.store.snapshot().revision).ok,true);
 assert.equal(h.app.state.store.updateContact(bruno.id,{marketingConsent:true},h.app.state.store.snapshot().revision).ok,true);
 h.app.render();
 h.app.state.campaignSelection={[ana.id]:true,[bruno.id]:true,[clara.id]:true};
 await h.click('open-campaign');
 await h.click('campaign-whatsapp-start');
 const walker=h.get('dialogContent').innerHTML;
 assert.match(walker,/Marcar enviado y siguiente/);
 assert.match(walker,/WhatsApp masivo requiere API de Meta con costo por conversación; pendiente\./);
 assert.match(walker,/wa\.me\/\d+\?text=/);
 assert.match(walker,/Sin consentimiento/);
 assert.match(walker,/Clara Lejos/);
 const counts=()=>({ana:h.app.state.store.listActivities({contactId:ana.id}).filter(item=>item.type==='whatsapp').length,bruno:h.app.state.store.listActivities({contactId:bruno.id}).filter(item=>item.type==='whatsapp').length,clara:h.app.state.store.listActivities({contactId:clara.id}).filter(item=>item.type==='whatsapp').length});
 const start=counts();
 await h.click('campaign-mark-whatsapp');
 const mid=counts();
 const stepped=[mid.ana-start.ana,mid.bruno-start.bruno,mid.clara-start.clara];
 assert.deepEqual(stepped.filter(n=>n===1).length,1);
 assert.equal(mid.clara,0);
 assert.match(h.get('dialogContent').innerHTML,/Marcar enviado y siguiente/);
 await h.click('campaign-mark-whatsapp');
 const done=counts();
 assert.equal(done.ana,1);
 assert.equal(done.bruno,1);
 assert.equal(done.clara,0);
 assert.match(done.ana&&h.app.state.store.listActivities({contactId:ana.id}).find(item=>item.type==='whatsapp').summary,/Enviado \(demo\)/);
});

console.log('PASS: '+passed+' campaign groups');
})().catch(error=>{console.error(error);process.exit(1);});
