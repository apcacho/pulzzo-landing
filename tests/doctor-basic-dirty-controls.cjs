'use strict';
// Execute native selector callbacks in a small DOM fixture. No browser or layout engine.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../registro-doctor.html'),'utf8');
function harness(shared=true){
 let dirties=0;
 function node(){
  const n={children:[],events:{},value:'',textContent:'',disabled:false,dataset:{},style:{},classList:{add(){},remove(){},toggle(){return false;}},setAttribute(){},focus(){},contains(){return false;},appendChild(child){this.children.push(child);return child;},addEventListener(type,fn){this.events[type]=fn;},querySelectorAll(){return this.children.filter(child=>child.className?.includes('multi-option'));}};
  Object.defineProperty(n,'innerHTML',{get(){return '';},set(){this.children=[];}});
  Object.defineProperty(n,'options',{get(){return this.children;}});
  return n;
 }
 const ctx={window:shared?{PulzzoSharedDoctorOnboarding:{markBasicDirty(){dirties++;}}}:{},document:{createElement:node,addEventListener(){}},Option:function(text,value,_defaultSelected,selected){return {text,value,selected:!!selected};},setTimeout(){},norm:v=>String(v).toLowerCase(),espMultiValues:[],especialidadesLabels:{a:'Alpha',b:'Beta'},espToProcGroup:{a:'Alpha',b:'Beta'},procedimientosData:[{group:'Alpha',items:['A1','A2','Otro Alpha']},{group:'Beta',items:['B1']}],tipoActual:'doctor',otherProcBySpecialty:{}};
 for(const key of ['espOptions','espNative','espSummary','espCount','espSelectEl','espMenu','espToggle','espSearch','espSelectAll','espClearAll','procSelect','procOptions','procToggle','procSummary','procCount','procToolbarLabel','procMulti','procMenu','procSearch','procSelectAll','procClear','otroProcFields','otroProcField'])ctx[key]=node();
 vm.createContext(ctx);
 const start=source.indexOf('function buildEspOptions(query){'),end=source.indexOf('/* ══ TIPO DE CUENTA',start);
 assert.ok(start>0&&end>start);vm.runInContext(source.slice(start,end),ctx);
 const click=n=>n.events.click({preventDefault(){},stopPropagation(){}});
 return {ctx,click,get dirties(){return dirties;},reset(){dirties=0;}};
}
const h=harness(),c=h.ctx;
// Render, menu-open and searches must remain inert.
c.updateEspSummary();c.rebuildProcForEsp();c.setProcedureSummary();h.click(c.espToggle);c.espSearch.value='a';c.espSearch.events.input();c.procSearch.value='A';c.procSearch.events.input();assert.equal(h.dirties,0);
c.espSearch.value='';c.procSearch.value='';
c.onEspClick('a');assert.equal(h.dirties,1,'individual specialty');
h.click(c.espSelectAll);assert.equal(h.dirties,2,'select-all adds Beta');
h.click(c.espSelectAll);assert.equal(h.dirties,2,'already selected specialties is a no-op');
h.click(c.espClearAll);assert.equal(h.dirties,3);h.click(c.espClearAll);assert.equal(h.dirties,3,'clearing empty specialties is a no-op');
c.onEspClick('a');h.reset();
let item=c.procOptions.children.find(n=>n.className?.includes('multi-option'));h.click(item);assert.equal(h.dirties,1,'individual procedure');
let group=c.procOptions.children.find(n=>n.className==='proc-group-label');h.click(group.children[1]);assert.equal(h.dirties,2,'procedure group');
c.procSearch.value='no match';h.click(c.procSelectAll);assert.equal(h.dirties,2,'empty filtered selection is a no-op');c.procSearch.value='';
h.click(c.procClear);assert.equal(h.dirties,3);h.click(c.procClear);assert.equal(h.dirties,3,'clearing empty procedures is a no-op');
h.click(c.procSelectAll);assert.equal(h.dirties,4,'select all procedures');
const remove=c.otroProcFields.children[0].children[0].children[1];h.click(remove);assert.equal(h.dirties,5,'remove other procedures');h.click(remove);assert.equal(h.dirties,5,'already removed category is a no-op');
// Native standalone controls still work with no shared adapter.
const native=harness(false);native.ctx.onEspClick('a');native.click(native.ctx.procSelectAll);assert.equal(native.dirties,0);
assert.match(source,/Object\.keys\(otherProcBySpecialty\)\.forEach\(key=>\{delete otherProcBySpecialty\[key\];\}\)/,'restoration clears abandoned custom text');
console.log('PASS doctor basic dirty controls: actual specialty/procedure changes, all/clear/group/other callbacks; no-op, render/search and standalone paths remain inert.');
