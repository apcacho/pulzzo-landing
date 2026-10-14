'use strict';
// Execute the shipped native registration/verification module. All identities
// are fictitious; no browser, geolocation or outbound service is involved.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
exports.start=function(h,email){
 const url=new URL(h.context.location.href,'https://example.test'),kind=url.pathname.includes('doctor')?'doctor':'patient';
 const nodes={};for(const id of ['verify-form','code','verify-btn','message','verify-copy','resend'])nodes[id]={value:'',textContent:'',disabled:false,addEventListener(type,fn){this[type]=fn;}};
 const Session=h.context.PulzzoCRMOnboarding;
 const events={};
 const root={addEventListener(type,fn){(events[type]??=[]).push(fn);},location:{search:url.search,href:''},document:{getElementById:id=>nodes[id]},localStorage:h.disk,sessionStorage:h.session,crypto:require('node:crypto').webcrypto,PulzzoCRMStore:h.context.PulzzoCRMStore,PulzzoCRMAssisted:h.context.PulzzoCRMAssisted,PulzzoCRMOnboarding:{...Session,start:options=>Session.start({...options,storage:h.disk,sessionStorage:h.session})}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/js/native-registration.js'),'utf8'),{window:root,URLSearchParams,Date,JSON,Error,Number,String});
 root.PulzzoNativeRegistration.stage(kind,{name:'Titular DEMO',email,phone:'55'+String([...email].reduce((sum,c,i)=>sum+c.charCodeAt(0)*(i+1),0)).padStart(8,'0'),nameParts:{first:'Titular',second:'',paternal:'DEMO',maternal:''},initial:{profile:{name:'Titular DEMO',email,accountType:'doctor',state:'Ciudad de México',city:'Benito Juárez'},procedures:['Consulta']},specialties:['Cardiología']});
 root.location.search='?native=1';root.location.href='';root.PulzzoNativeRegistration.verify();delete h.context.location.href;
 h.native={root,nodes,events,submit(value){nodes.code.value=value??nodes['verify-copy'].textContent.match(/Código de ejemplo: (\d+)/)?.[1]??'';nodes['verify-form'].submit?.({preventDefault(){}});h.toast.textContent=nodes.message.textContent;if(root.location.href)h.context.location.href=root.location.href;}};
 h.toast.textContent=nodes.message.textContent;return h.native;
};
