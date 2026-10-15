// v36g: Mexican phone display «55 3492 3595»; storage/comparison stay as bare digits.
const assert=require('assert');const fs=require('fs');const path=require('path');const vm=require('vm');
const root=path.join(__dirname,'..');const P=require('../assets/js/pulzzo-phone.js');
const cases=[['5534923595','55 3492 3595'],['55 3492 3595','55 3492 3595'],['55-3492-3595','55 3492 3595'],['(55) 3492 3595','55 3492 3595'],['+52 55 3492 3595','+52 55 3492 3595'],['+5215534923595','+52 55 3492 3595'],['525534923595','55 3492 3595'],
 ['','',],[null,''],['Sin teléfono','Sin teléfono'],['12345','12345'],['55 1234 5678 / 55 8765 4321','55 1234 5678 / 55 8765 4321'],['+1 415 555 0100','+1 415 555 0100']];
for(const [input,out] of cases)assert.equal(P.format(input),out,'format '+JSON.stringify(input));
for(const [input,out] of [['5','5'],['553','55 3'],['553492','55 3492'],['5534923','55 3492 3'],['5534923595','55 3492 3595'],['55 3492 35','55 3492 35'],['+52 55','+52 55'],['55349235951','55349235951']])assert.equal(P.formatTyping(input),out,'typing '+input);
assert.equal(P.digits('55 3492 3595'),'5534923595');assert.equal(P.national('5215534923595'),'5534923595');
// Formatted display must still normalize to the same stored digits used for duplicates, WhatsApp and tel: links.
const ctx={window:{},console};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'assets/js/crm-demo-store.js'),'utf8'),ctx);
const store=ctx.window.PulzzoCRMStore||ctx.PulzzoCRMStore;
if(store&&store.normalizePhone)assert.equal(store.normalizePhone(P.format('5534923595')),'5534923595');
// Input caret helper keeps digits and grouping.
const el={tagName:'INPUT',value:'5534923595',selectionStart:10,hasAttribute:n=>n==='data-pz-phone',setSelectionRange(a){this.caret=a;}};
P.onInput({target:el,composedPath:()=>[el]});assert.equal(el.value,'55 3492 3595');assert.equal(el.caret,12);
// Wiring: backoffice and CRM load the shared formatter; onboarding pages untouched.
const bo=fs.readFileSync(path.join(root,'backoffice.html'),'utf8');assert.ok(bo.includes('assets/js/pulzzo-phone.js'));assert.ok(!bo.includes('Correo CRM (configuración separada)'));
for(const page of ['registro-paciente.html','registro-doctor.html','solicitud-paciente.html'])assert.ok(!fs.readFileSync(path.join(root,page),'utf8').includes('pulzzo-phone.js'),page+' unchanged');
console.log('PASS: phone formatter 2-4-4, typing, caret, digit storage and wiring'+(store&&store.normalizePhone?'':' (store normalizePhone not exposed, skipped)'));
