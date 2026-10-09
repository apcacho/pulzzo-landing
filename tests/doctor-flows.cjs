'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const source = file => fs.readFileSync(path.join(root,file),'utf8');
function harness(seed={}) {
  const data=new Map(Object.entries(seed)); const nodes=new Map();
  function node(id){if(!nodes.has(id))nodes.set(id,{value:'',disabled:false,dataset:{},textContent:'',className:'',events:{},classList:{toggle(){},add(){},remove(){}},addEventListener(e,f){this.events[e]=f;},setAttribute(){}});return nodes.get(id);}
  const context={console,Date,JSON,navigator:{userAgent:'test'},location:{hash:''},
    localStorage:{getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)},
    document:{getElementById:node,addEventListener(){},querySelector:()=>node('form'),querySelectorAll:()=>[]},
    window:{addEventListener(){},location:{href:''},matchMedia:()=>({matches:false,addEventListener(){}})},
    setTimeout:f=>f(),setInterval:()=>1,clearInterval(){}};
  vm.createContext(context);return {context,data,node,run:text=>vm.runInContext(text,context)};
}
const doctor={nombre:'Doctora Ejemplo',correo:'medico@example.test',celular:'55 0000 0000',demo:true};
const patient={correo:'paciente@example.test'};
const login=source('login-doctor.html').match(/<script>([\s\S]*?)<\/script>/)[1];
const verification=source('verificacion-doctor.html').match(/<script>([\s\S]*?)<\/script>/)[1];
const seed={pulzzo_doctor:JSON.stringify(doctor),pulzzo_patient:JSON.stringify(patient),pulzzo_verified:'false'};
const a=harness(seed);a.run(login);a.node('email').value=doctor.correo;a.node('doctor-login-form').events.submit({preventDefault(){}});
assert.equal(a.context.window.location.href,'verificacion-doctor.html');
a.data.set('pulzzo_doctor_verified','true');a.node('doctor-login-form').events.submit({preventDefault(){}});
assert.equal(a.context.window.location.href,'registro-doctor.html#perfil-medico');
a.context.window.location.href='';a.node('email').value='other@example.test';a.node('doctor-login-form').events.submit({preventDefault(){}});
assert.equal(a.context.window.location.href,'');assert.match(a.node('doctor-login-message').textContent,/No hay un perfil/);
a.node('email').value='55 0000 0000';a.node('doctor-login-form').events.submit({preventDefault(){}});assert.match(a.context.window.location.href,/#perfil-medico$/);
const numericEmail=harness({...seed,pulzzo_doctor:JSON.stringify({...doctor,correo:'123456medico@example.test'}),pulzzo_doctor_verified:'true'});numericEmail.run(login);
for(const letter of '123456medico@example.test'){numericEmail.node('email').value+=letter;numericEmail.node('email').events.input?.call(numericEmail.node('email'));}
assert.equal(numericEmail.node('email').value,'123456medico@example.test');numericEmail.node('doctor-login-form').events.submit({preventDefault(){}});assert.equal(numericEmail.context.window.location.href,'registro-doctor.html#perfil-medico');
const b=harness(seed);b.run(verification);assert.match(b.node('verify-copy').textContent,/medico@example.test/);assert.doesNotMatch(b.node('verify-copy').textContent,/paciente@example/);
b.node('code').value='999999';b.node('verify-form').events.submit({preventDefault(){}});assert.equal(b.data.get('pulzzo_doctor_verified'),undefined);assert.equal(b.node('message').className,'toast err');assert.match(b.node('message').textContent,/Usa el código/);
b.node('code').value='123456';b.node('verify-form').events.submit({preventDefault(){}});assert.equal(b.data.get('pulzzo_doctor_verified'),'true');assert.equal(b.data.get('pulzzo_verified'),'false');assert.equal(b.context.window.location.href,'registro-doctor.html#perfil-medico');assert.equal(JSON.parse(b.data.get('pulzzo_doctor_verification')).demo,true);
const malformed=harness({pulzzo_doctor:'not-json'});malformed.run(verification);assert.match(malformed.node('verify-copy').textContent,/Simulación/);
for(const invalid of ['null','[]','3']) {
 const empty=harness({pulzzo_doctor:invalid,pulzzoDoctorOnboardingCleanV3:invalid});empty.run(login);empty.node('email').value=doctor.correo;empty.node('doctor-login-form').events.submit({preventDefault(){}});assert.equal(empty.context.window.location.href,'');
 const verifyEmpty=harness({pulzzo_doctor:invalid});verifyEmpty.run(verification);verifyEmpty.node('code').value='123456';verifyEmpty.node('verify-form').events.submit({preventDefault(){}});assert.equal(verifyEmpty.data.get('pulzzo_doctor_verified'),undefined);assert.equal(verifyEmpty.node('message').className,'toast err');assert.match(verifyEmpty.node('message').textContent,/Registra primero/);
}
const changed=harness(seed);changed.run(verification);changed.data.set('pulzzo_doctor',JSON.stringify({...doctor,correo:'another@example.test'}));changed.node('code').value='123456';changed.node('verify-form').events.submit({preventDefault(){}});assert.equal(changed.data.get('pulzzo_doctor_verified'),undefined);assert.equal(changed.node('message').className,'toast err');assert.match(source('verificacion-doctor.html'),/\.toast\.err\{display:block/);
const registration=source('registro-doctor.html');
const c=harness({pulzzo_doctor_verified:'true',pulzzo_doctor_verification:'old-demo'});
Object.assign(c.context,{validatePasswordFields:()=>true,getSelectedProcs:()=>[],norm:s=>String(s).toLowerCase(),espMultiValues:[],especialidadesLabels:{}});
c.node('tipo').value='doctor';c.node('nombre_med').value='Doctora Ejemplo';c.node('correo_med').value='medico@example.test';c.node('celular_med').value='55 0000 0000';
const submitSource=registration.slice(registration.indexOf("document.querySelector('.form-grid').addEventListener('submit'"), registration.indexOf('\nsetProcedureSummary();',registration.indexOf("document.querySelector('.form-grid').addEventListener('submit'")));
c.run(submitSource);c.node('form').events.submit({preventDefault(){}});
assert.equal(JSON.parse(c.data.get('pulzzo_doctor')).correo,'medico@example.test');
assert.equal(JSON.parse(c.data.get('pulzzoDoctorOnboardingCleanV3')).profile.email,'medico@example.test');
assert.equal(c.data.get('pulzzo_doctor_verified'),undefined);assert.equal(c.data.get('pulzzo_doctor_verification'),undefined);
assert.equal(c.context.window.location.href,'verificacion-doctor.html');
assert.match(registration,/email:\(document.getElementById\('correo_med'\)/);assert.match(registration,/localStorage.setItem\('pulzzo_doctor'/);assert.match(registration,/localStorage.removeItem\('pulzzo_doctor_verified'/);assert.doesNotMatch(source('verificacion-doctor.html'),/pulzzo_patient|onboarding-doctor\.html|registro-paciente\.html/);
assert.match(source('login-doctor.html'),/value="demo-only" readonly/);
console.log('PASS: doctor registration wiring, contact matching, isolated verification, invalid code, demo navigation, corrupt storage and credential placeholder.');
