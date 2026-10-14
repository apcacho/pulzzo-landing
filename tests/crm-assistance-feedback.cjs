'use strict';
// Focused handler regression, in-memory fictitious records; no browser/storage reset.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const fixture=path.join(__dirname,'crm-demo-ui.cjs'),src=fs.readFileSync(fixture,'utf8'),scope=vm.createContext({require:createRequire(fixture),__dirname,console,Blob,URL});
vm.runInContext(src.slice(0,src.indexOf('(async()=>{'))+'\nglobalThis.fixture={setup,MemoryStorage};',scope);
const {setup,MemoryStorage}=scope.fixture,Session=require('../assets/js/crm-onboarding-session.js');
const ok=r=>{assert.equal(r.ok,true,r.error);return r.value;};
(async()=>{for(const kind of ['patient','doctor']){
 const h=setup(),app=h.app,store=app.state.store;
 h.window.sessionStorage=new MemoryStorage();h.window.PulzzoCRMOnboarding=Session;
 const c=ok(store.createContact({type:kind,name:'Assistance fixture',email:kind+'@example.test',phone:'5512345678'},store.snapshot().revision));
 app.navigate(kind,'contacts',c.id);await h.click('open-profile',c.id);await h.click('begin-onboarding');
 assert.equal(h.get('editorDialog').open,true,'reason appears above profile dialog');
 assert.match(h.get('dialogContent').innerHTML,/titular aún no completa su registro inicial/);
 assert.match(h.get('dialogContent').innerHTML,/asistido-demo.html#entry=/);
 let exp=Object.values(store.snapshot().expedients)[0];const expId=exp.id,token=exp.entryLink.token;
 assert.equal(exp.holderIdentity,null);assert.ok(!exp.initialRegistration);
 await h.click('cancel-dialog');await h.click('edit-onboarding');
 exp=Object.values(store.snapshot().expedients)[0];assert.equal(exp.entryLink.token,token);assert.equal(exp.id,expId);
 app.closeDialog(true);
 require('./fixtures/registered-expedient.cjs')({storage:h.storage,staff:app.state.actor,expId,now:()=>new Date('2026-10-09T12:00:00Z')});
 const before=store.getContact(c.id);let url='';h.window.location.assign=value=>{url=value;};
 await h.click('edit-onboarding');
 const destination=new URL(url);assert.equal(destination.pathname,kind==='patient'?'/solicitud-paciente.html':'/registro-doctor.html');
 assert.equal(destination.searchParams.get('crmExp'),expId);assert.equal(destination.searchParams.get('crmMode'),'assisted');
 assert.deepEqual(store.getContact(c.id),before);assert.equal(Object.keys(store.snapshot().expedients).length,1);
 console.log('PASS',kind,'visible prerequisite/link, stable expediente, registered holder continues to native route');
}})().catch(e=>{console.error(e);process.exitCode=1;});
