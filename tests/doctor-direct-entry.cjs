'use strict';
// Real session adapter and production controller/DOM contract tests, not browser QA.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
function loadFixture(file,cut,expose){const ctx={require:require('node:module').createRequire(path.join(__dirname,file)),__dirname,console,Blob,URL,URLSearchParams,Buffer,atob};vm.createContext(ctx);vm.runInContext(read('tests/'+file).split(cut)[0]+'\n'+expose,ctx);return ctx;}
const forms=loadFixture('doctor-shared-onboarding.cjs','(async()=>{','globalThis.make=harness;');
const sessions=loadFixture('crm-onboarding-routing.cjs',"for(const kind of ['patient','doctor'])",'globalThis.make=fixture;globalThis.locationFor=browserLocation;');
const Session=require('../assets/js/crm-onboarding-session.js');
function page(f,hash='',clean=false){
 const location=sessions.locationFor(new URL(f.launch.url,'https://example.test/demo/').href);location.hash=hash;if(clean)location.pathname=location.pathname.replace(/\.html$/,'');
 const context=f.open({location});
 const placements=[],replacements=[];
 const h=forms.make({context,globalStorage:f.storage,location,setupDOM({win,doc,node,selectors}){
   win.history={state:{existing:true},replaceState(state,_title,url){replacements.push(url);location.href=url;this.state=state;}};
   const card=node('native-card'),form=node('form'),view=node('doctorProfileView'),hero=node('hero');card.children=[form];form.parentElement=card;card.parentElement=node('native-wrap');form.before=banner=>{banner.parentElement=card;};
   view.insertBefore=(child,before)=>{child.parentElement=view;view.children=view.children.filter(item=>item!==child);view.children.push(child);placements.push([child,before]);};
   hero.after=banner=>{banner.parentElement=view;};
   const query=doc.querySelector;doc.querySelector=selector=>selector==='main.auth-shell .auth-card'?(card.parentElement===view?null:card):selector==='#doctorProfileView > .profile-hero'?hero:selector==='.form-grid button[type="submit"]'?node('submit'):query(selector);
   card.querySelector=selector=>selector==='.auth-card-kicker'?node('kicker'):selector==='label[for="tipo"]'?node('type-label'):null;
   card.querySelectorAll=selector=>selector==='.auth-card-head > p:not(.crm-demo-entry)'?[node('basic-copy')]:selector==='.section-label'?[node('type-heading')]:[];
   node('type-heading').textContent='Tipo de cuenta';node('tipo').options=[{textContent:'Selecciona tipo de cuenta'}];
   selectors.set('.form-grid input,.form-grid select,.form-grid button',[node('tipo'),node('nombre_med'),node('submit')]);
 }});
 let restores=0;
 h.helper.prepareBasic(state=>{restores++;h.node('tipo').value=state.profile.accountType;h.node('nombre_med').value=state.profile.name;h.node('tipo').disabled=false;});
 const navigate=hash=>{location.hash=hash;for(const fn of h.events.hashchange)fn({});};
 return {...h,location,placements,replacements,navigate,get restores(){return restores;}};
}
let checks=0;
for(const role of ['kam','admin','holder'])for(const clean of [false,true])for(const hash of ['','#perfil-medico','#datos-medicos','#old-signup']){
 const f=sessions.make('doctor',role),before=f.storage.snapshot(),h=page(f,hash,clean);
 assert.equal(new URL(f.launch.url,'https://example.test').hash,'#perfil-medico');
 assert.equal(h.location.hash,hash==='#datos-medicos'?hash:'#perfil-medico');assert.equal(h.location.pathname,clean?'/demo/registro-doctor':'/demo/registro-doctor.html');
 assert.equal(h.node('body').classList.contains('profile-mode'),hash!=='#datos-medicos');assert.equal(h.node('body').classList.contains('shared-doctor-basic'),hash==='#datos-medicos');
 assert.equal(h.node('native-card').parentElement,h.node('native-wrap'));assert.equal(h.placements.length,0);assert.equal(h.node('form').parentElement,h.node('native-card'));
 assert.equal(h.node('registro-doctor-title').textContent,'Completar registro');assert.equal(h.node('kicker').textContent,role==='holder'?'Registro médico':'Captura asistida');assert.doesNotMatch(h.node('basic-copy').textContent,/crear|contraseña|cuenta/i);
 assert.equal(f.storage.snapshot(),before,'entry never rewrites state or creates account');
 const reloaded=page(f,h.location.hash,clean);assert.equal(reloaded.node('body').classList.contains('profile-mode'),hash!=='#datos-medicos');assert.equal(f.storage.snapshot(),before);
 checks++;
}
// Reopen real saved sessions: seed-only fields are not progress, but every
// profile-only editing family must resume the profile rather than restart basics.
for(const [name,edit,expected] of [
 ['seed-only',s=>{s.profileData={clinicName:'Seed clinic',address:'Seed address',representativeName:'Seed rep',representativeRole:'Seed role'};s.specialties=['Seed specialty'];},'#perfil-medico'],
 ['saved basics',s=>{s.currentStep=2;},'#perfil-medico'],
 ['attention',s=>{s.profileData.consultationCost='500';},'#perfil-medico'],
 ['professional link',s=>{s.links.website='https://example.test';},'#perfil-medico'],
 ['contact',s=>{s.contact.officePhone='5500000000';},'#perfil-medico'],
 ['procedures',s=>{s.procedures=['Saved procedure'];},'#perfil-medico'],
 ['social photo',s=>{s.photoMode='social';},'#perfil-medico'],
 ['fiscal',s=>{s.fiscal.banco='Demo bank';},'#perfil-medico'],
 ['medical choices',s=>{s.medval.method='upload';},'#perfil-medico'],
 ['clinic choices',s=>{s.clinicDocs.legalType='moral';},'#perfil-medico']
]){
 const f=sessions.make('doctor'),context=f.open(),state=JSON.parse(context.storage.getItem(f.key));edit(state);context.storage.setItem(f.key,JSON.stringify(state));
 const before=f.storage.snapshot(),reopen=Session.start(f.options);
 assert.equal(new URL(reopen.url,'https://example.test').hash,expected,name);
 assert.equal(f.storage.snapshot(),before,'reopening must not rewrite saved data: '+name);
}
const f=sessions.make('doctor'),ctx=f.open(),original=JSON.parse(ctx.storage.getItem(f.key));
original.profile.accountType='clinica';original.currentStep=4;original.profile.establishmentType='hospital';original.clinicDocs={legalType:'moral'};original.profileData={extra:'retain'};original.files.legal_power=[{name:'retained.pdf',type:'application/pdf',size:64,metadataOnly:true,demo:true}];
ctx.storage.setItem(f.key,JSON.stringify(original));
const h=page(f,'#datos-medicos',true),baseline=f.storage.snapshot();assert.equal(h.node('tipo').value,'clinica');
h.node('nombre_med').value='Unsaved clinic';h.node('form').events.input({target:{id:'nombre_med'}});h.win.confirm=()=>false;h.navigate('#perfil-medico');
assert.equal(h.location.hash,'#datos-medicos');assert.equal(h.node('nombre_med').value,'Unsaved clinic');assert.equal(f.storage.snapshot(),baseline);assert.ok(h.node('body').classList.contains('shared-doctor-basic'));
h.win.confirm=()=>true;h.navigate('#perfil-medico');assert.equal(h.node('nombre_med').value,original.profile.name);h.navigate('#datos-medicos');assert.equal(h.node('tipo').value,'clinica');
// Cancel button follows the same dirty/back guard, with no navigation to signup.
h.node('nombre_med').value='Cancel me';h.node('form').events.change({target:{id:'nombre_med'}});const cancel=h.node('form').children.find(node=>node.id==='shared-doctor-basic-cancel');cancel.events.click();h.events.hashchange.forEach(fn=>fn({}));assert.equal(h.location.hash,'#perfil-medico');assert.equal(f.storage.snapshot(),baseline);
h.api.tab('Fiscal y banco');h.navigate('#datos-medicos');
const saved=h.helper.readState();assert.equal(h.helper.saveBasic({profile:{...saved.profile,name:'Updated clinic'},contact:{registered:saved.contact.registered},procedures:saved.procedures},saved.specialties),true);h.events.hashchange.forEach(fn=>fn({}));
assert.match(h.node('doctorProfilePanel').innerHTML,/fiscal\.banco/,'native active tab survives save without reload');
const after=h.helper.readState();assert.equal(after.profile.accountType,'clinica');for(const key of ['doctorAccountId','currentStep','files','clinicDocs','profileData'])assert.equal(JSON.stringify(after[key]),JSON.stringify(original[key]));assert.equal(Object.keys(f.store.snapshot().expedients).length,1);assert.equal(f.storage.getItem('pulzzo_doctor'),null);
// The scoped adapter, not route shape, continues to enforce current session.
Session.clearStaffSession({sessionStorage:f.sessionStorage});h.navigate('#datos-medicos');assert.throws(()=>h.api.getState(),/account_changed/);assert.equal(h.helper.saveBasic({profile:{name:'No'},contact:{registered:''},procedures:[]},[]),false);
for(const hash of ['', '#old-signup']){
 const stale=forms.make();stale.setCurrent(false);stale.win.location.hash=hash;
 assert.doesNotThrow(()=>stale.api.syncProfileMode(),'stale unknown route reaches recovery UI');
 assert.match(stale.node('shared-doctor-message').textContent,/sesión|expediente/i);
 assert.equal(stale.node('body').classList.contains('profile-mode'),false,'stale basic shell keeps the visible error and CRM return context');
 assert.equal(JSON.stringify([...stale.globalData]),stale.baseline,'stale recovery writes nothing');
}
for(const clean of [false,true]){const patient=sessions.make('patient');assert.equal(new URL(patient.launch.url,'https://example.test').hash,'');if(clean)patient.location.pathname=patient.location.pathname.replace(/\.html$/,'');assert.equal(patient.open().kind,'patient');}
const locked=forms.make();locked.setEditable(false);locked.helper.prepareBasic(()=>{});const before=locked.state;assert.equal(locked.helper.saveBasic({profile:{name:'No'},contact:{registered:''},procedures:[]},[]),false);assert.deepEqual(locked.state,before);
// Execute the actual native subtype controller: shared switches retain selected
// specialties/procedures; the organic controller keeps its original reset path.
const native=read('registro-doctor.html'),begin=native.indexOf('function updateAccountType('),end=native.indexOf("document.getElementById('tipo').addEventListener",begin);
const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',value:'hospital',classList:{add(){},remove(){}}});return elements.get(id);};
const subtype={document:{getElementById:element,querySelector:()=>null},espMultiValues:['general'],espNative:{innerHTML:'selected'},procSelect:{innerHTML:'selected'},procOptions:{innerHTML:'selected'},procToggle:{disabled:false},procToolbarLabel:null,procCount:null,espHelper:null,updateEspSummary(){},setProcedureSummary(){},buildEspOptions(){}};
vm.createContext(subtype);vm.runInContext(native.slice(begin,end)+"\nupdateAccountType('clinica',true);",subtype);assert.equal(subtype.espMultiValues[0],'general');assert.equal(subtype.procSelect.innerHTML,'selected');assert.equal(element('tipo_establecimiento').disabled,false);
vm.runInContext("updateAccountType('doctor');",subtype);assert.equal(subtype.espMultiValues.length,0);assert.equal(subtype.procSelect.innerHTML,'');
let prevented=0;for(const fn of h.docEvents.click||[])fn({target:{closest:selector=>selector==='a[data-shared-return]'?{closest:selector=>selector==='#shared-doctor-banner'?{}:null}:null},preventDefault(){prevented++;},stopImmediatePropagation(){prevented++;}});assert.equal(prevented,0,'stale-session return remains reachable through actual capture guard');
console.log(`PASS doctor direct entry: ${checks} role/path/legacy/hash/reload cases; native registration shell retained without relocation; clinic subtype/identity/files/progress retention; dirty Back/cancel/save; active native tab; scope/lock rejection; no duplicate record; patient route unchanged. DOM/VM only.`);
