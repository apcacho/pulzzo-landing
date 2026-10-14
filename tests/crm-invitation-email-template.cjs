'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {render} = require('../assets/js/crm-invitation-email.js');
const base = {kind:'patient', name:'María', recipient:'maria@example.test', ownerDisplayName:'Ana',
  trustedBaseUrl:'https://pulzzo.example.test/app/backoffice.html#crm',
  entryUrl:'https://pulzzo.example.test/app/asistido-demo.html#entry=entry_abc-123'};
for (const kind of ['patient','doctor']) {
  for (const phase of ['new','started','started-documents']) {
    const progress = {hasStarted:phase!=='new',hasSavedInformation:phase!=='new',hasSavedDocuments:phase==='started-documents'};
    const mail = render({...base,kind,progress});
    assert.equal(mail.variant,kind+'-'+phase);
    assert.equal(mail.entryUrl,base.entryUrl);
    assert.match(mail.html,/role="presentation"/);
    assert.match(mail.html,/max-width:600px/);
    assert.match(mail.html,/<img src="https:\/\/pulzzo\.example\.test\/app\/assets\/images\/logo-pulzzo\.png"/);
    assert.match(mail.html,/background-color:#081830/);
    assert.match(mail.html,/>pulzzo<\/td>/);
    assert.match(mail.html,/Content-Security-Policy/);
    assert.ok(mail.html.includes(kind==='patient'?'#20C7D4':'#FF8A5B'));
    assert.ok(mail.text.includes(base.entryUrl));
    assert.ok(mail.html.includes('>'+base.entryUrl+'</a>'));
    assert.ok(mail.text.includes('Ana, tu responsable de seguimiento'));
    assert.ok(mail.text.includes(phase==='new'?'Comienza tu registro':'Retoma tu registro'));
    assert.equal(mail.text.includes('información y documentos están guardados'),phase==='started-documents');
    assert.equal(mail.text.includes('Tu información está guardada'),phase==='started');
    assert.equal(mail.text.includes('INE, selfie y autorizaciones'),kind==='patient');
    if (kind==='doctor') assert.doesNotMatch(mail.text,/INE|selfie|autorizaciones|cédula|licencia/);
  }
}
assert.equal(render({...base,progress:{hasSavedInformation:true}}).variant,'patient-started');
assert.match(render({...base,progress:{hasSavedInformation:true}}).html,/#EAF9FA/);
assert.match(render({...base,kind:'doctor',progress:{hasSavedInformation:true}}).html,/#FFF1E9/);
const brand=fs.readFileSync(require('node:path').join(__dirname,'../assets/css/flat-design-tokens.css'),'utf8');
for(const color of ['#20C7D4','#EAF9FA','#FF8A5B','#FFF1E9'])assert.ok(brand.toLowerCase().includes(color.toLowerCase()));
assert.equal(render(base).subject,'Continúa tu solicitud en PULZZO');
assert.equal(render({...base,kind:'doctor'}).subject,'Continúa tu registro profesional en PULZZO');
const unnamed=render({...base,name:'',ownerDisplayName:'',recipient:undefined});
assert.match(unnamed.text,/Hola:/);
assert.doesNotMatch(unnamed.text,/responsable|undefined|null/);
assert.match(unnamed.text,/equipo PULZZO por tu canal habitual/);
assert.doesNotMatch(unnamed.text,/guardad/);
assert.doesNotMatch(render({...base,progress:{hasStarted:true}}).text,/guardad/);
assert.doesNotMatch(render({...base,progress:{hasSavedInformation:'true',hasSavedDocuments:1}}).text,/guardad/);
assert.match(render({...base,progress:{hasSavedDocuments:true}}).text,/Tus documentos están guardados/);
assert.doesNotMatch(render({...base,progress:{hasSavedDocuments:true}}).text,/Tu información/);
const attack = '<img src=x onerror="alert(1)"> & \'test\'';
const hostile=render({...base,name:attack,ownerDisplayName:attack});
assert.ok(hostile.html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;test&#39;'));
assert.doesNotMatch(hostile.html,/<img src=x/);
assert.ok(hostile.text.includes(attack));
assert.equal(render({...base,entryUrl:'asistido-demo.html#entry=entry_abc-123'}).entryUrl,base.entryUrl);
for (const entryUrl of [
  '', 'javascript:alert(1)', 'data:text/html,hi', 'https://evil.test/app/asistido-demo.html#entry=x',
  'https://pulzzo.example.test.evil.test/app/asistido-demo.html#entry=x',
  'https://u:p@pulzzo.example.test/app/asistido-demo.html#entry=x',
  'https://pulzzo.example.test/app/other.html#entry=x', 'https://pulzzo.example.test/asistido-demo.html#entry=x',
  'asistido-demo.html?x=1#entry=x','asistido-demo.html?#entry=x',
  'asistido-demo.html#entry=x&redirect=evil','asistido-demo.html#entry=x#other',
  'asistido-demo.html#entry=%3Csvg%3E','asistido-demo.html#entry=',
  'asistido-demo.html#token=x','asistido-demo.html#entry=x\n',
  'foo/../asistido-demo.html#entry=x','./asistido-demo.html#entry=x',
  'https:\\pulzzo.example.test\\app\\asistido-demo.html#entry=x',
  'http://pulzzo.example.test/app/asistido-demo.html#entry=x'
]) assert.throws(()=>render({...base,entryUrl}),Error,entryUrl);
for (const trustedBaseUrl of ['file:///tmp/backoffice.html','javascript:foo','https://u:p@pulzzo.example.test/app/']) {
  assert.throws(()=>render({...base,trustedBaseUrl}));
}
assert.throws(()=>render({...base,kind:'provider'}));
assert.throws(()=>render({...base,trustedBaseUrl:undefined}));
const source=fs.readFileSync(require.resolve('../assets/js/crm-invitation-email.js'),'utf8');
assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage|sendBeacon|setTimeout|setInterval)\s*(?:\(|\.)/);
const sandbox={URL};vm.createContext(sandbox);vm.runInContext(source,sandbox);
assert.equal(typeof sandbox.PulzzoCRMInvitationEmail.render,'function');
const input={...base,progress:{hasStarted:true,hasSavedInformation:true}};
const snapshot=JSON.stringify(input);const first=render(input);assert.deepEqual(render(input),first);assert.equal(JSON.stringify(input),snapshot);
assert.equal(sandbox.PulzzoCRMInvitationEmail.render(input).html,first.html);
console.log('PASS: six invitation template variants, safe links, escaped content, truthful progress, original logo, and pure UMD rendering.');
