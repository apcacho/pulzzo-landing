'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../assets/js/backoffice-configuration.js'),'utf8');
function runtime(){
 const elements=new Map(),storage=new Map();
 // Tiny generated-markup fixture, not a browser. Hydrate only controls used by these handlers.
 function hydrate(html){
  for(const match of html.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
   const [,tag,attrs,id]=match,node=element(id);node.tagName=tag;node.value=(attrs.match(/\bvalue="([^"]*)"/)||[])[1]||'';
   for(const key of ['disabled','checked','hidden','required'])node[key]=new RegExp('(?:^|\\s)'+key+'(?:\\s|$|=)').test(attrs);
   node.attrs=attrs;
  }
  for(const match of html.matchAll(/<select\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)){
   const options=[...match[2].matchAll(/<option\b([^>]*)value="([^"]*)"([^>]*)>/g)];const option=options.find(x=>/\bselected\b/.test(x[1]+x[3]))||options[0];
   element(match[1]).value=option?option[2]:'';
  }
 }
 function element(id){
  if(!elements.has(id)){
   const node={id,value:'',checked:false,disabled:false,hidden:false,required:false,textContent:'',focused:false,focus(){this.focused=true;}};
   Object.defineProperty(node,'innerHTML',{get(){return this.html||'';},set(html){this.html=String(html);this.textContent='';if(id==='settings'){elements.clear();elements.set(id,this);}hydrate(this.html);}});
   elements.set(id,node);
  }
  return elements.get(id);
 }
 element('settings');
 const c=vm.createContext({console,Date,JSON,Object,Set,Number,String,Error,Math,session:{role:'admin',email:'admin@demo.test'},users:[{email:'admin@demo.test',role:'admin'},{email:'viewer@demo.test',role:'readonly'}],permissions:{admin:['settings'],readonly:[]},db:{patients:[{id:'A',payments:[{amount:100}]},{id:'B',amortization:[{extensionFee:300,extensionStatus:'active'}]}]},today:()=> '2026-10-08',document:{getElementById:id=>elements.get(id)||null},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)}});
 vm.runInContext(source,c);const run=code=>vm.runInContext(code,c);
 const mount=tab=>run(`configTab=${JSON.stringify(tab)};renderSettings()`);
 const scope=value=>{element('cfg-scope').value=value;run('configSyncScope();configInvalidatePreview()');};
 const change=(key,value)=>{element('cfg-'+key).value=String(value);run('configInvalidatePreview()');};
 return {run,mount,scope,change,el:element,elements,storage,c};
}
let count=0;function test(name,fn){fn();count++;console.log('PASS: '+name);}
test('Grouped extension editor presents percentage units and helpful labels',()=>{
 const r=runtime();r.mount('extensions');const html=r.el('settings').innerHTML;
 assert.equal(r.el('cfg-extension15Rate').value,'3');assert.equal(r.el('cfg-extension30Rate').value,'5');assert.equal(r.el('cfg-extension15Minimum').value,'300');
 assert.match(html,/Prórroga de 15 días/);assert.match(html,/Prórroga de 30 días/);assert.match(html,/Plazos disponibles/);assert.match(html,/Cuándo y a quién aplica/);
 assert.match(html,/class="cfg-unit" aria-hidden="true">%/);assert.match(html,/aria-describedby="cfg-extension15Rate-help"/);assert.doesNotMatch(html,/decimal;|0\.03 =/);
 assert.equal(r.el('cfg-save').disabled,true);assert.match(html,/oninput="configInvalidatePreview\(\)"/);assert.match(html,/onchange="configSyncScope\(\);configInvalidatePreview\(\)"/);
});
test('Percentage inputs round-trip fractional rates without changing precision',()=>{
 const r=runtime();r.mount('extensions');
 for(const value of [0,.03,.05,.29,.8758333002425926,.49519170565598003,.23735267090860068,.3333333333333333,1e-7,1e-22,1]){
  const html=r.run(`configField('extension15Rate','Porcentaje',${value},false)`),display=html.match(/value="([^"]+)"/)[1];
  r.el('cfg-extension15Rate').value=display;assert.equal(r.run('configReadForm().patch.extension15Rate'),value,'Unchanged rate '+value);
 }
 r.change('extension15Rate','3.25');assert.equal(r.run('configReadForm().patch.extension15Rate'),.0325);assert.equal(r.run('configReadForm().patch.extension15Minimum'),300);
});
test('Opening percentages are converted once and saved as fractional rules',()=>{
 const r=runtime();r.mount('tax');assert.equal(r.el('cfg-openingFeeRate').value,'5');r.change('openingFeeRate','7.25');r.run('configShowPreview()');
 assert.match(r.el('cfg-preview').innerHTML,/Antes: 5%/);assert.match(r.el('cfg-preview').innerHTML,/Después: 7\.25%/);r.run('configSubmit()');
 assert.equal(r.run('configRead().versions[0].patch.openingFeeRate'),.0725);assert.equal(r.run('configResolveRules(db.patients[0]).openingFeeRate'),.05);assert.equal(r.run("configResolveRules({id:'NEW'}).openingFeeRate"),.0725);
});
test('Blank, invalid, out-of-range percentages and fractional months cannot be saved',()=>{
 for(const value of ['',101,-1,'NaN','Infinity']){const r=runtime();r.mount('extensions');r.change('extension15Rate',value);r.run('configShowPreview();configSubmit()');assert.equal(r.storage.size,0);assert.equal(r.el('cfg-save').disabled,true);}
 const r=runtime();r.mount('payments');r.change('prepayWaitMonths',1.5);r.run('configShowPreview();configSubmit()');assert.equal(r.storage.size,0);
});
test('Confirmation exposes before/after, date and exact existing credit count',()=>{
 const r=runtime();r.mount('extensions');r.change('extension15Rate',4);r.run('configShowPreview()');const preview=r.el('cfg-preview').innerHTML;
 assert.match(preview,/Antes: 3%/);assert.match(preview,/Después: 4%/);assert.match(preview,/<dt>Vigencia<\/dt><dd>2026-10-08/);assert.match(preview,/<dt>Créditos existentes afectados<\/dt><dd>0/);
 assert.match(preview,/No cambia saldos, pagos, tasas del crédito, contratos ni prórrogas ya activas/);assert.match(preview,/Se guarda en este navegador/);assert.equal(r.el('cfg-save').disabled,false);assert.equal(r.el('cfg-preview').focused,true);assert.equal(r.storage.size,0);
});
test('Save requires a fresh review and edits invalidate both token and action',()=>{
 const r=runtime();r.mount('extensions');r.run('configSubmit()');assert.equal(r.storage.size,0);r.run('configShowPreview()');assert.equal(r.el('cfg-save').disabled,false);
 r.change('extension15Rate',4);assert.equal(r.el('cfg-save').disabled,true);assert.equal(r.run('configPreviewToken'),'');r.run('configSubmit()');assert.equal(r.storage.size,0);
 r.run('configShowPreview();configSubmit()');assert.equal(r.run('configRead().revision'),1);assert.equal(r.el('cfg-save').disabled,true);r.run('configSubmit()');assert.equal(r.run('configRead().revision'),1);
});
test('Scope reveals only relevant credit IDs and required authorization',()=>{
 const r=runtime();r.mount('extensions');assert.equal(r.el('cfg-selected-block').hidden,true);assert.equal(r.el('cfg-authorization-block').hidden,true);
 r.scope('selected');assert.equal(r.el('cfg-selected-block').hidden,false);assert.equal(r.el('cfg-selected').disabled,false);assert.equal(r.el('cfg-selected').required,true);assert.equal(r.el('cfg-authorization-block').hidden,false);assert.equal(r.el('cfg-reference').required,true);
 r.scope('existing_new');assert.equal(r.el('cfg-selected-block').hidden,true);assert.equal(r.el('cfg-selected').disabled,true);assert.equal(r.el('cfg-authorization-block').hidden,false);
 r.scope('newonly');assert.equal(r.el('cfg-authorization-block').hidden,true);assert.equal(r.el('cfg-reference').disabled,true);assert.equal(r.el('cfg-authorized').required,false);
});
test('Existing-credit review keeps heterogeneous previous rules separate',()=>{
 const r=runtime();r.run("var change={patch:{extension15Rate:.04},scope:'selected',selectedIds:['A'],effectiveDate:today(),authorized:true,authorizationReference:'Demo A'};var p=configPreviewChange(change);configSaveChange(change,p.revision,p.token)");
 r.mount('extensions');r.scope('existing_new');r.change('extension15Rate',5);r.el('cfg-authorized').checked=true;r.el('cfg-reference').value='Demo AB';r.run('configShowPreview()');
 const preview=r.el('cfg-preview').innerHTML;assert.match(preview,/<dt>Créditos existentes afectados<\/dt><dd>2/);assert.match(preview,/Antes: 4%/);assert.match(preview,/Antes: 3%/);assert.match(preview,/Después: 5%/);assert.match(preview,/Créditos nuevos/);
 assert.equal(r.run('configRead().revision'),1);r.run('configSubmit()');assert.equal(r.run('configRead().versions[1].beforeRules[0].rules.extension15Rate'),.04);
});
test('Future comparison uses effective-date rules rather than today’s editor values',()=>{
 const r=runtime();r.run("var change={patch:{openingFeeRate:.08},scope:'newonly',effectiveDate:'2026-11-01'};var p=configPreviewChange(change);configSaveChange(change,p.revision,p.token)");
 r.mount('tax');assert.equal(r.el('cfg-openingFeeRate').value,'5');r.el('cfg-effective').value='2026-12-01';r.change('openingFeeRate',6);r.run('configShowPreview()');
 assert.match(r.el('cfg-preview').innerHTML,/Antes: 8%/);assert.match(r.el('cfg-preview').innerHTML,/Después: 6%/);assert.match(r.el('cfg-preview').innerHTML,/2026-12-01/);
});
test('Selected scope requires evidence and never suggests changing new credits',()=>{
 const r=runtime();r.mount('payments');r.scope('selected');r.el('cfg-selected').value='B';r.run('configShowPreview()');assert.equal(r.el('cfg-save').disabled,true);
 r.el('cfg-authorized').checked=true;r.el('cfg-reference').value='Contrato demo B';r.change('prepayWaitMonths',4);r.run('configShowPreview()');
 assert.match(r.el('cfg-preview').innerHTML,/<dt>Créditos existentes afectados<\/dt><dd>1/);assert.match(r.el('cfg-preview').innerHTML,/Antes: 3 meses/);assert.match(r.el('cfg-preview').innerHTML,/Después: 4 meses/);assert.doesNotMatch(r.el('cfg-preview').innerHTML,/<h4>Créditos nuevos<\/h4>/);
 r.run('configSubmit()');assert.equal(r.run('configResolveRules(db.patients[0]).prepayWaitMonths'),3);assert.equal(r.run('configResolveRules(db.patients[1]).prepayWaitMonths'),4);
});
test('Changed credit population and stale revisions remain blocked through UI handlers',()=>{
 const r=runtime();r.mount('extensions');r.run('configShowPreview();db.patients.push({id:"C"});configSubmit()');assert.equal(r.storage.size,0);assert.equal(r.el('cfg-save').disabled,true);
 r.run('configShowPreview();var other=configReadForm();var p=configPreviewChange(other);configSaveChange(other,p.revision,p.token);configSubmit()');assert.equal(r.run('configRead().revision'),1);assert.equal(r.el('cfg-save').disabled,true);
});
test('Storage failure leaves financial data untouched and requires another review',()=>{
 const r=runtime();r.mount('extensions');r.run('var before=JSON.stringify(db);configShowPreview();localStorage.setItem=()=>{throw Error("Quota exceeded")};configSubmit()');
 assert.equal(r.storage.size,0);assert.equal(r.run('JSON.stringify(db)'),r.run('before'));assert.equal(r.el('cfg-save').disabled,true);assert.match(r.el('cfg-message').textContent,/Quota exceeded/);
});
test('Readonly users have no enabled editor or save path',()=>{
 const r=runtime();r.run("session.role='readonly'");for(const tab of ['product','tax','payments','extensions']){r.mount(tab);assert.match(r.el('settings').innerHTML,/Solo consulta/);for(const node of r.elements.values())if(['input','select'].includes(node.tagName))assert.equal(node.disabled,true,node.id);r.run('configShowPreview();configSubmit()');assert.equal(r.storage.size,0);assert.equal(r.el('cfg-save').disabled,true);}
});
test('All seven sections distinguish editable, fixed and pending capabilities',()=>{
 const r=runtime();r.mount('product');assert.equal((r.el('settings').innerHTML.match(/onclick="configSelectTab/g)||[]).length,7);assert.match(r.el('settings').innerHTML,/Editable por administrador/);assert.match(r.el('settings').innerHTML,/Reglas vigentes · solo consulta/);
 for(const tab of ['collections','disbursement','history']){r.mount(tab);assert.doesNotMatch(r.el('settings').innerHTML,/onclick="configSubmit\(\)"/);}
 r.mount('collections');assert.match(r.el('settings').innerHTML,/Pendiente · no disponible en esta demo/);assert.match(r.el('settings').innerHTML,/No se envían comunicaciones/);
 r.mount('tax');assert.match(r.el('settings').innerHTML,/IVA fijo 16%/);assert.match(r.el('settings').innerHTML,/18-A pendiente/);
});
test('Tab navigation discards the review and saving does not mutate credit snapshots',()=>{
 const r=runtime();r.mount('extensions');r.run('var before=JSON.stringify(db);configShowPreview();configSelectTab("payments")');assert.equal(r.run('configPreviewToken'),'');assert.equal(r.el('cfg-save').disabled,true);
 r.change('prepayWaitMonths',4);r.run('configShowPreview();configSubmit()');assert.equal(r.run('JSON.stringify(db)'),r.run('before'));assert.equal(r.run('configRead().revision'),1);
});
test('Review and history escape user data and present readable percentages',()=>{
 const r=runtime();r.mount('extensions');r.scope('selected');r.el('cfg-selected').value='A';r.el('cfg-authorized').checked=true;r.el('cfg-reference').value='<img src=x onerror="alert(1)">';r.change('extension15Rate',4);r.run('configShowPreview()');
 assert.match(r.el('cfg-preview').innerHTML,/&lt;img/);assert.doesNotMatch(r.el('cfg-preview').innerHTML,/<img/);r.run('configSubmit();configSelectTab("history")');const html=r.el('settings').innerHTML;
 assert.match(html,/Comisión a 15 días/);assert.match(html,/>4%<\/strong>/);assert.match(html,/>3%<\/strong>/);assert.doesNotMatch(html,/extension15Rate|<img/);assert.match(html,/&lt;img/);assert.match(html,/Reglas previas preservadas: 1 créditos/);
});
console.log(`PASS: ${count} configuration polish DOM/VM regressions. Browser rendering remains unrun.`);
