const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../backoffice.html'),'utf8');
const script=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m=>m[1].includes('const baseState='))[1];
function runtime(saved){
 let failWrites=false;
 const elements=new Map();
 function el(id){if(!elements.has(id))elements.set(id,{id,value:'',dataset:{},style:{},innerHTML:'',textContent:'',checked:false,disabled:false,files:[],classList:{add(){},remove(){},toggle(){},contains(){return false}},querySelector(){return null},querySelectorAll(){return []},addEventListener(){},setAttribute(){},focus(){this.focused=true},scrollIntoView(){}});return elements.get(id)}
 const storage=new Map(saved||[]);
 const document={querySelector:s=>el(s.replace(/^#/,'')),querySelectorAll:s=>s==='.offer-procedure-card'?[...elements.values()].filter(x=>/^offerProcCard\d+$/.test(x.id)):[],getElementById:id=>elements.get(id)||null,addEventListener(){},createElement:tag=>el(tag),body:{appendChild(){}}};
 const FixedDate=class extends Date {constructor(...a){super(...(a.length?a:['2026-10-07T12:00:00Z']))} static now(){return new Date('2026-10-07T12:00:00Z').getTime()}};
 const context=vm.createContext({document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(failWrites)throw Error('Quota');storage.set(k,String(v))},removeItem:k=>storage.delete(k)},window:{},Date:FixedDate,console,Intl,Blob,URL,setTimeout(){},clearTimeout(){},innerWidth:1200});
 vm.runInContext(script,context);
 const run=code=>vm.runInContext(code,context);
 // No browser rendering is simulated: preserve real calculations/handlers, suppress repaint only.
 run("render=()=>{};renderPatientDetail=()=>{};closeModal=()=>{};session=users.find(x=>x.role==='admin');");
 return {run,el,storage,failWrites:v=>failWrites=v};
}
let count=0;function test(name,fn){fn();count++;console.log('PASS: '+name)}
test('Dashboard starts in current Mexico City month and never fabricates records for an empty period',()=>{
 const r=runtime();assert.equal(r.run('dashboardFilters.from'),'2026-10-01');assert.equal(r.run('dashboardFilters.to'),'2026-11-01');assert.equal(r.run('dashboardFilters.visibleTo'),'2026-10-31');
 r.run("db.patients=[{id:'old',application:{createdAt:'2026-06-01'}},{id:'unknown',application:{}}];db.providers=[{id:'unknown'}];db.audit=[{at:'unparseable'}]");
 assert.equal(r.run('dashboardFilteredPatients().length'),0);assert.equal(r.run('dashboardFilteredProviders().length'),0);assert.equal(r.run('dashboardFilteredAudit().length'),0);
 assert.equal(r.run("dashboardEntityDate({})"),null);
});
test('Mexico City month boundary uses the business day, and inclusive date picker includes final day',()=>{
 const r=runtime();assert.equal(r.run("pulzzoBusinessDateMX(new Date('2026-11-01T05:59:59Z'))"),'2026-10-31');assert.equal(r.run("pulzzoBusinessDateMX(new Date('2026-11-01T06:00:00Z'))"),'2026-11-01');
 r.run('renderDashboard=()=>{}');assert.equal(r.run("updateDashboardDate('to','2026-10-07')"),true);assert.equal(r.run('dashboardFilters.to'),'2026-10-08');assert.equal(r.run("isWithinDashboardRange('2026-10-07')"),true);assert.equal(r.run("isWithinDashboardRange('2026-10-08')"),false);
 const before=r.run('JSON.stringify(dashboardFilters)');assert.equal(r.run("updateDashboardDate('from','2026-10-20')"),false);assert.equal(r.run('JSON.stringify(dashboardFilters)'),before);
});
test('Date filters preserve chosen periods, exclude impossible dates, and do not mutate stored data',()=>{
 const r=runtime();r.run('renderDashboard=()=>{}');r.run("setDashboardPeriod('year')");assert.equal(r.run('dashboardFilters.from'),'2026-01-01');assert.equal(r.run('dashboardFilters.visibleTo'),'2026-12-31');
 assert.equal(r.run("dashboardDate('2026-02-30')"),null);r.run("var before=JSON.stringify(db);dashboardFilteredPatients();dashboardFilteredProviders();dashboardFilteredAudit()");assert.equal(r.run('JSON.stringify(db)'),r.run('before'));
});
test('Dashboard financial stage families include administrative rejections and approved-for-offer work',()=>{
 const r=runtime();r.run("var values=dashboardFinancials([{application:{applicationStatus:'rejected_blocked',requestedAmount:10}},{application:{applicationStatus:'rejected_can_reapply',requestedAmount:20}},{application:{applicationStatus:'aprobada_para_oferta',requestedAmount:30}}])");assert.equal(r.run('values.rejected'),30);assert.equal(r.run('values.inProcess'),30);
});
test('Dashboard provider payable is allocated payout, never full financed principal or invented missing amount',()=>{
 const r=runtime();r.run("var p={application:{offerAccepted:true,providerDispersions:[{amount:100,status:'Pendiente de dispersión'},{amount:20,status:'Dispersada'},{amount:0},{provider:'Sin importe'}]},offer:{accepted:true,approvedAmount:9999}};var before=JSON.stringify(p);var total=dashboardProviderPendingSummary(p)");assert.equal(r.run('total.amount'),100);assert.equal(r.run('total.unresolved'),1);assert.equal(r.run('JSON.stringify(p)'),r.run('before'));
});
function pending(r){r.run("var p={id:'POLICY-OFFER',patient:{fullName:'Policy'},application:{applicationStatus:'oferta_enviada'},offer:{status:'enviada',sent:true,validUntil:'2026-10-07',approvedAmount:100},timeline:[]};db.patients.push(p);persist();");}
test('Offer expires only after end of Mexico City date and accepted historical terms remain intact',()=>{
 const r=runtime();pending(r);assert.equal(r.run("offerIsExpired(p,new Date('2026-10-08T05:59:59Z'))"),false);assert.equal(r.run("offerIsExpired(p,new Date('2026-10-08T06:00:00Z'))"),true);
 r.run("p.application.offerAccepted=true;p.offer.status='aceptada'");assert.equal(r.run("offerIsExpired(p,new Date('2027-01-01'))"),false);
});
test('Expired offers cannot be sent or accepted, and rejected versions cannot be silently resent',()=>{
 const r=runtime();pending(r);r.run("p.offer.validUntil='2026-10-06';persist();var before=JSON.stringify(db)");assert.equal(r.run("sendOffer(p.id)"),false);assert.equal(r.run("markOffer(p.id,'aceptada')"),false);assert.equal(r.run('JSON.stringify(db)'),r.run('before'));
 r.run("p.offer.validUntil='2026-10-30';p.offer.status='rechazada';p.application.offerRejected=true;persist();before=JSON.stringify(db)");assert.equal(r.run("sendOffer(p.id)"),false);assert.equal(r.run("markOffer(p.id,'aceptada')"),false);assert.equal(r.run('JSON.stringify(db)'),r.run('before'));
});
test('New offer revision archives exact prior rejection and resets only the current decision',()=>{
 const r=runtime();pending(r);r.run("p.application.offerRejected=true;p.application.offerRejectedAt='2026-10-01';p.offer.status='rechazada';var old=JSON.stringify(p.offer);var revised=JSON.parse(JSON.stringify(p));revised.offer.approvedAmount=200;archiveOfferRevision(revised,p)");assert.equal(r.run('JSON.stringify(revised.offerHistory[0].offer)'),r.run('old'));assert.equal(r.run('revised.offerHistory[0].previousDecision'),'rejected');assert.equal(r.run('revised.application.offerRejected'),false);assert.equal(r.run('revised.offer.revision'),1);assert.equal(r.run('p.application.offerRejected'),true);
});
test('Offer persistence failure is atomic and a stale tab cannot overwrite a new version',()=>{
 const r=runtime();pending(r);r.run("var before=JSON.stringify(db)");r.failWrites(true);assert.equal(r.run("markOffer(p.id,'aceptada')"),false);assert.equal(r.run('JSON.stringify(db)'),r.run('before'));r.failWrites(false);assert.equal(r.run("markOffer(p.id,'aceptada')"),true);
 const other=runtime();pending(other);other.storage.set('pulzzo_backoffice_demo','different-state');assert.equal(other.run('requireOfferEdit(p)'),false);
});
test('Negative signature strings never authorize payments or unlock contracts; signed records cannot reoriginate',()=>{
 const r=runtime();for(const status of ['unsigned','no firmado','pendiente de firma','not_signed']){r.run(`var p={id:'SIGN',application:{signatureStatus:${JSON.stringify(status)}},offer:{status:'not_accepted'}}`);assert.equal(r.run('dispersionContractSigned(p)'),false);assert.equal(r.run('financialOfferLocked(p)'),false);assert.equal(r.run('contractOfferIsAccepted(p)'),false);}
 r.run("db.patients=[{id:'SIGN',application:{contractSigned:true,referencesSaved:true},offer:{accepted:true,approvedAmount:100,termMonths:12}}];selectedPatientId='SIGN';persist();var before=JSON.stringify(db)");assert.equal(r.run('contractGenerateDocument()'),false);assert.equal(r.run('JSON.stringify(db)'),r.run('before'));
 r.run("db.patients[0].application.contractSigned=false;persist();before=JSON.stringify(db)");assert.equal(r.run('contractSaveSignedDocument()'),false);assert.equal(r.run('JSON.stringify(db)'),r.run('before'));
});
console.log('PASS: '+count+' date and offer policy regression groups. No browser or production-backend claim.');
