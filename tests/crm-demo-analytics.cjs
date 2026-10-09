'use strict';
// Pure analytics, real-store compatibility, semantic chart output and adversarial
// fixtures. No browser, network, storage outside this process or seeded UI state.
const assert = require('node:assert/strict');
const Analytics = require('../assets/js/crm-demo-analytics.js');
const Store = require('../assets/js/crm-demo-store.js');
const Assisted = require('../assets/js/crm-assisted.js');
let passed = 0;
function test(name,fn) {try {fn();passed++;console.log('PASS',name);} catch (e) {console.error('FAIL',name);throw e;}}
const NOW = '2026-10-09T12:00:00.000Z';
const ANA = {id:'kam_ana',role:'kam'};
const ADMIN = {id:'admin_demo',role:'admin'};
function fixture() {
  const s = {contacts:{},expedients:{},events:{},activities:{},tasks:{}};
  let n = 0;
  function event(type,contactId,createdAt,extra={}) {const id='event_'+(++n);s.events[id]={id,type,contactId,createdAt,actorId:'kam_ana',actorRole:'kam',...extra};return s.events[id];}
  function contact(id,type,assignedKam,createdAt,originalSource='manual',stage='new') {
    const c = {id,type,assignedKam,createdAt,originalSource,stage,deletedAt:null};s.contacts[id]=c;event('contact_created',id,createdAt);return c;
  }
  function expedient(id,contactId,createdAt) {const e={id,contactId,kind:s.contacts[contactId].type,createdAt,status:'draft'};s.expedients[id]=e;event('assisted_draft_created',contactId,createdAt,{expedientId:id});return e;}
  function submit(exp,at) {
    const holder='holder_'+exp.contactId;
    exp.submittedAt=at;exp.status='submitted';exp.holderIdentity={id:holder};
    exp.submissionSnapshot={schema:'pulzzo.crm.submission.v1',contactId:exp.contactId,expedientId:exp.id,accountId:holder,kind:exp.kind,submittedAt:at};
    s.contacts[exp.contactId].stage='submitted';
    return event('holder_submitted',exp.contactId,at,{expedientId:exp.id,actorRole:'holder',actorId:holder});
  }
  function activity(id,contactId,contactAt,type='call',actorId='kam_ana') {s.activities[id]={id,contactId,type,contactAt,createdAt:NOW,actorId,actorRole:actorId==='admin_demo'?'admin':'kam'};event('activity_recorded',contactId,NOW,{activityId:id,contactAt});return s.activities[id];}
  function task(id,contactId,dueAt,status='open') {s.tasks[id]={id,contactId,dueAt,status};return s.tasks[id];}
  contact('p1','patient','kam_ana','2026-10-01T00:00:00.000Z','manual');
  contact('p2','patient','kam_ana','2026-10-02T10:00:00.000Z','organic','application_started');
  contact('p3','patient','kam_ana','2026-09-20T10:00:00.000Z','direct');
  contact('p4','patient','kam_luis','2026-10-05T10:00:00.000Z','kam_referral');
  contact('u1','patient',null,'2026-10-08T10:00:00.000Z','campaign');
  contact('d1','doctor','kam_ana','2026-10-06T10:00:00.000Z','manual','registration_started');
  contact('archived','patient','kam_ana','2026-10-01T00:00:00.000Z');s.contacts.archived.deletedAt='2026-10-02T00:00:00.000Z';
  const e1=expedient('e1','p1','2026-10-01T12:00:00.000Z');
  const e3=expedient('e3','p3','2026-10-02T12:00:00.000Z');
  submit(e1,'2026-10-03T12:00:00.000Z');submit(e3,'2026-10-04T12:00:00.000Z');
  activity('a1','p1','2026-10-04T09:00:00.000Z');
  activity('a2','p2','2026-09-30T09:00:00.000Z');
  activity('a3','p3','2026-10-05T09:00:00.000Z','email','admin_demo');
  activity('a4','p4','2026-10-06T09:00:00.000Z','meeting','kam_luis');
  activity('a5','d1','2026-10-07T09:00:00.000Z');
  activity('a6','p2','2026-10-07T09:00:00.000Z','stage_change');
  activity('a7','archived','2026-10-07T09:00:00.000Z');
  activity('orphan','missing','2026-10-07T09:00:00.000Z');
  task('t1','p1','2026-10-08T12:00:00.000Z');task('t2','p2','2026-10-09T15:00:00.000Z');task('t3','p3','2026-10-10T15:00:00.000Z');
  task('t4','p2','2026-10-01T15:00:00.000Z','closed');task('t5','p4','2026-10-01T15:00:00.000Z');task('t6','d1','2026-10-01T15:00:00.000Z');task('t7','archived','2026-10-01T15:00:00.000Z');
  return {s,event,contact,expedient,submit,activity,task};
}
function report(f,filter={},options={}) {return Analytics.buildReport(f.s,{type:'patient',...filter},{now:NOW,actor:ANA,...options});}
function freezeDeep(o) {Object.values(o).forEach(v=>{if(v&&typeof v==='object')freezeDeep(v);});return Object.freeze(o);}
test('defaults select the current UTC calendar month and disclose a partial month',()=>{
  const p=Analytics.periodFor({},'2026-09-30T19:30:00-05:00');
  assert.equal(p.month,10);assert.equal(p.year,2026);assert.equal(p.timezone,'UTC');assert.equal(p.isPartial,true);assert.equal(p.startAt,'2026-10-01T00:00:00.000Z');assert.equal(p.endAt,'2026-11-01T00:00:00.000Z');
});
test('invalid periods, contact types and actor scope fail closed',()=>{
  for(const f of [{month:0},{month:13},{month:2.5},{year:1999},{year:'no'}])assert.throws(()=>Analytics.periodFor(f,NOW),e=>e.code==='invalid_period');
  assert.throws(()=>Analytics.periodFor({},'bad'),e=>e.code==='invalid_date');
  const f=fixture();assert.throws(()=>report(f,{type:'__proto__'}),e=>e.code==='invalid_type');
  assert.throws(()=>report(f,{kamId:'kam_luis'}),e=>e.code==='forbidden');
  assert.throws(()=>report(f,{}, {actor:{role:'root'}}),e=>e.code==='invalid_actor');
});
test('all headline metrics reconcile to independently specified patient and owner fixtures',()=>{
  const r=report(fixture());
  assert.deepEqual(r.counts,{newContacts:2,patients:2,doctors:0,activities:2,onboardingStarted:2,submitted:2,openTasks:3,overdueTasks:1,referralContacts:0});
  assert.deepEqual(r.currentSnapshot,{contacts:3,openTasks:3});
  assert.equal(r.stageRows.reduce((sum,x)=>sum+x.value,0),3);
  assert.deepEqual(r.originRows.map(r=>[r.key,r.value]).sort(),[['manual',1],['organic',1]]);
});
test('conversion uses only same-month submissions among same-month new contacts',()=>{
  const r=report(fixture());assert.equal(r.conversion.numerator,1);assert.equal(r.conversion.denominator,2);assert.equal(r.conversion.rate,50);assert.equal(r.conversion.started,1);
  assert.equal(r.counts.submitted,2,'Old-contact submissions belong in throughput but not new-cohort conversion');
});
test('stage changes never become real submissions, starts or commercial activities',()=>{
  const f=fixture(),before=report(f);f.s.contacts.p2.stage='submitted';
  f.event('contact_stage_changed','p2','2026-10-06T12:00:00.000Z',{to:'submitted'});
  f.event('contact_stage_changed','p2','2026-10-06T12:00:00.000Z',{to:'application_started'});
  f.activity('manual_stage','p2','2026-10-06T12:00:00.000Z','stage_change');
  const after=report(f);assert.deepEqual(after.counts,before.counts);assert.equal(after.byStage.patient.submitted,3);assert.equal(after.conversion.numerator,1);
});
test('duplicate creation, activity and submission event aliases do not inflate counts',()=>{
  const f=fixture(),before=report(f);
  f.event('contact_created','p1',f.s.contacts.p1.createdAt);
  f.event('onboarding_submitted','p1',f.s.expedients.e1.submittedAt,{expedientId:'e1',actorRole:'holder',actorId:'holder_p1'});
  f.event('expedient_submitted','p1',f.s.expedients.e1.submittedAt,{expedientId:'e1',actorRole:'holder',actorId:'holder_p1'});
  f.event('activity_recorded','p1',NOW,{activityId:'a1',contactAt:f.s.activities.a1.contactAt});
  f.s.activities.duplicate={...f.s.activities.a1};assert.deepEqual(report(f).counts,before.counts);
});
test('orphan, wrong-contact and staff-fabricated submission events cannot convert',()=>{
  const f=fixture();
  f.event('holder_submitted','p2','2026-10-03T12:00:00.000Z',{expedientId:'e1',actorRole:'holder',actorId:'holder_p1'});
  f.event('holder_submitted','p2',NOW,{expedientId:'missing',actorRole:'holder',actorId:'holder_p2'});
  const exp=f.expedient('e2','p2','2026-10-04T12:00:00.000Z');exp.submittedAt=NOW;f.event('holder_submitted','p2',NOW,{expedientId:'e2'});
  assert.equal(report(f).conversion.numerator,1);assert.equal(report(f).counts.submitted,2);
});
test('submission receipt, holder and event timestamps must agree exactly',()=>{
  for(const corrupt of [e=>e.submissionSnapshot.accountId='someone_else',e=>e.holderIdentity.id='someone_else',e=>e.submissionSnapshot.contactId='p2',e=>e.submissionSnapshot.expedientId='e3',e=>e.submissionSnapshot.submittedAt=NOW,e=>delete e.submissionSnapshot,e=>e.submittedAt=NOW]){
    const f=fixture();corrupt(f.s.expedients.e1);assert.equal(report(f).counts.submitted,1);assert.equal(report(f).conversion.numerator,0);
  }
});
test('an activity belongs to its actual contact month, not entry or event time',()=>{
  const f=fixture();assert.equal(report(f,{month:9}).counts.activities,1);assert.equal(report(f).counts.activities,2);
  const octoberEvent=Object.values(f.s.events).find(e=>e.activityId==='a2');octoberEvent.contactAt=NOW;
  assert.equal(report(f).counts.activities,2,'Canonical immutable activity contactAt wins');
});
test('UTC range is inclusive at month start, exclusive at next start, and excludes future events',()=>{
  const f=fixture();f.activity('boundary','p1','2026-09-30T19:00:00-05:00');f.activity('next','p1','2026-10-31T19:00:00-05:00');f.activity('future','p1','2026-10-10T12:00:00Z');f.activity('bad','p1','no');
  assert.equal(report(f).counts.activities,3);
  assert.equal(report(f,{month:11}).counts.activities,0,'Future data cannot be shown as observed');
});
test('historical months keep explicitly current portfolio stages and task snapshots',()=>{
  const r=report(fixture(),{month:9});assert.equal(r.counts.newContacts,1);assert.equal(r.counts.onboardingStarted,0);assert.equal(r.counts.submitted,0);assert.equal(r.currentSnapshot.contacts,3);assert.equal(r.counts.openTasks,3);assert.equal(r.byStage.patient.submitted,2);
});
test('doctor report never incorporates patient contacts, activities, tasks or conversions',()=>{
  const r=report(fixture(),{type:'doctor'});assert.equal(r.counts.newContacts,1);assert.equal(r.counts.patients,0);assert.equal(r.counts.doctors,1);assert.equal(r.counts.activities,1);assert.equal(r.counts.openTasks,1);assert.equal(r.conversion.numerator,0);assert.equal(r.stageRows.length,8);assert.equal(r.stageRows.reduce((n,x)=>n+x.value,0),1);
});
test('admin owner and unassigned filters remain exact and exclude archived contacts',()=>{
  const f=fixture(),all=report(f,{}, {actor:ADMIN});assert.equal(all.currentSnapshot.contacts,5);assert.equal(all.counts.newContacts,4);
  assert.equal(report(f,{kamId:'kam_luis'},{actor:ADMIN}).currentSnapshot.contacts,1);
  assert.equal(report(f,{kamId:'unassigned'},{actor:ADMIN}).counts.newContacts,1);
  assert.equal(all.originRows.reduce((n,x)=>n+x.value,0),all.counts.newContacts);
});
test('provided actor scopes raw snapshots even without trusting parent projection',()=>{
  const f=fixture();assert.equal(report(f).currentSnapshot.contacts,3);
  f.s.contacts.p1.holderId='holder_p1';f.s.contacts.p1.accountId='holder_p1';
  const r=report(f,{}, {actor:{id:'holder_p1',role:'holder'}});assert.equal(r.currentSnapshot.contacts,1);
  f.s.contacts.p1.accountId='another_account';assert.equal(report(f,{}, {actor:{id:'holder_p1',role:'holder'}}).currentSnapshot.contacts,0);
});
test('reassignment uses current portfolio while activity-by-user retains its original actor',()=>{
  const f=fixture();f.s.contacts.p1.assignedKam='kam_luis';
  assert.equal(report(f).counts.newContacts,1);
  const r=report(f,{kamId:'kam_luis'},{actor:ADMIN});assert.equal(r.counts.activities,2);assert.equal(r.byKam.length,1);assert.equal(r.byKam[0].activities,2);assert.deepEqual(r.activityByActor.map(a=>[a.actorId,a.value]).sort(),[['kam_ana',1],['kam_luis',1]]);
});
test('pending task buckets are mutually exclusive and use exact UTC due timestamps',()=>{
  const f=fixture();f.task('now','p1',NOW);f.task('end','p1','2026-10-10T00:00:00Z');f.task('invalid','p1','bad');
  const r=report(f);assert.deepEqual(r.pendingRows.map(x=>[x.key,x.value]),[['overdue',1],['today',2],['upcoming',2],['undated',1]]);assert.equal(r.pendingRows.reduce((n,x)=>n+x.value,0),r.counts.openTasks);
});
test('every store-supported stage has an explicit chart label, including provider meetings',()=>{
  const f=fixture();f.s.contacts.d1.stage='meeting_scheduled';
  for(const kind of ['patient','doctor']){
    const r=report(f,{type:kind});assert.deepEqual(r.stageRows.map(x=>x.key),Store.STAGES[kind].map(stage=>kind+':'+stage));
    if(kind==='doctor')assert.deepEqual(r.stageRows.find(x=>x.key==='doctor:meeting_scheduled'),{key:'doctor:meeting_scheduled',label:'Reunión agendada',value:1});
  }
});
test('current month defaults cross year boundaries and reject missing actor identifiers',()=>{
  const p=Analytics.periodFor({},'2026-12-31T20:00:00-05:00');assert.equal(p.month,1);assert.equal(p.year,2027);
  assert.throws(()=>report(fixture(),{}, {actor:{role:'kam'}}),e=>e.code==='invalid_actor');
});
test('zero-denominator conversion is missing, never fabricated as zero or a percentage',()=>{
  const r=Analytics.buildReport({}, {}, {now:NOW,actor:ANA});assert.equal(r.empty,true);assert.equal(r.conversion.rate,null);assert.equal(r.counts.newContacts,0);
  const html=Analytics.renderDashboard(r);assert.match(html,/no tiene denominador/);assert.match(html,/Sin base/);assert.doesNotMatch(html,/NaN|Infinity|stroke-dasharray|50 %|100 %/);
});
test('zero conversion with an actual denominator displays a truthful 0 percent',()=>{
  const r=report(fixture(),{type:'doctor'});assert.equal(r.conversion.rate,0);const html=Analytics.renderDashboard(r);assert.match(html,/0 %/);assert.match(html,/stroke-dasharray="0 100"/);
});
test('reports are deterministic with supplied clock and do not mutate the source',()=>{
  const f=fixture(),before=JSON.stringify(f.s);freezeDeep(f.s);const one=report(f),two=report(f);assert.deepEqual(one,two);assert.equal(JSON.stringify(f.s),before);Analytics.renderDashboard(one);assert.equal(JSON.stringify(f.s),before);
});
test('origin is conserved after current stage and owner changes; unknown sources do not disappear',()=>{
  const f=fixture();f.s.contacts.p2.originalSource='unrecognized-import';const r=report(f);assert.equal(r.originRows.find(x=>x.key==='unknown').value,1);assert.equal(r.originRows.reduce((n,x)=>n+x.value,0),2);
});
test('bad creation aliases or stage-only starts cannot manufacture new cohorts',()=>{
  const f=fixture();f.event('contact_created','p3',NOW);f.event('onboarding_started','p2',NOW);assert.equal(report(f).counts.newContacts,2);assert.equal(report(f).counts.onboardingStarted,2);
});
test('semantic figures provide keyboard-accessible data, row/column headings, legends and exact denominator',()=>{
  const html=Analytics.renderDashboard(report(fixture()),{idPrefix:'fixture',kamLabels:{kam_ana:'Ana',admin_demo:'Administración'}});
  assert.equal((html.match(/<figure /g)||[]).length,6);assert.equal((html.match(/<figcaption>/g)||[]).length,6);assert.match(html,/<details class="analytics-data"><summary>/);assert.match(html,/tabindex="0" role="region"/);assert.match(html,/<th scope="row">/);assert.match(html,/<th scope="col">/);assert.match(html,/aria-labelledby="fixture-conversion-svg-title fixture-conversion-svg-desc"/);assert.match(html,/analytics-legend/);assert.match(html,/1 de 2/);assert.match(html,/Prospectos creados en el mes/);assert.match(html,/mismo mes/);assert.match(html,/no un corte histórico/);assert.match(html,/sin aprobación comercial o clínica/);
  assert.equal((html.match(/id="fixture-/g)||[]).length,8,'Six figure headings and one SVG title/description have unique IDs');
});
test('all incoming labels are escaped and no executable attributes or dynamic URLs are generated',()=>{
  const r=report(fixture());r.stageRows[0].label='<img src=x onerror="bad()">';
  const html=Analytics.renderDashboard(r,{idPrefix:'x" onload="bad',kamLabels:{kam_ana:'<script>bad()</script>',admin_demo:'\" onclick=bad()'}});
  assert.match(html,/&lt;img src=x onerror=&quot;bad\(\)&quot;&gt;/);assert.match(html,/&lt;script&gt;bad\(\)&lt;\/script&gt;/);assert.doesNotMatch(html,/<script|<img|<[^>]*\s(?:onload|onclick|href|src)=/);
  const bars=Analytics.renderBarChart([{label:'<svg onload=x>',value:'1" onclick="x'},{label:'Safe',value:2}],{label:'" onfocus="x',tone:'" onload="x'});assert.match(bars,/&lt;svg onload=x&gt;/);assert.doesNotMatch(bars,/<svg onload| onclick="| onfocus="/);
});
test('bar geometry starts from zero with real maximum, with no artificial minimum mark',()=>{
  const html=Analytics.renderBarChart([{label:'None',value:0},{label:'One',value:1},{label:'Ten',value:10}],{});assert.match(html,/width="0" height="9"/);assert.match(html,/width="10" height="9"/);assert.match(html,/width="100" height="9"/);assert.match(html,/desde 0 hasta 10/);
});
for(const kind of ['patient','doctor'])test('real '+kind+' store and holder submission produce one verified conversion without synthetic aliases',()=>{
  const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,String(v))};let seq=0;
  const now=()=>NOW,randomId=()=>String(++seq),staff=Store.createStore({storage,actor:ANA,now,randomId});
  const ok=r=>{assert.equal(r.ok,true,r.error);return r.value;},rev=()=>staff.snapshot().revision;
  const c=ok(staff.createContact({type:kind,name:'Verified Demo',email:'verified@example.test',phone:'5512345678'},rev()));
  const api=Assisted.createAssisted({store:staff,actor:ANA,now,randomId}),exp=ok(api.beginDraft({contactId:c.id,kind:kind},rev()));
  const inv=ok(api.invite(exp.id,{email:c.email},rev())),actor={id:'holder_verified',role:'holder'},holder=Store.createStore({storage,actor,now,randomId}),person=Assisted.createAssisted({store:holder,actor,now,randomId});
  const challenge=ok(person.requestDemoVerification({token:inv.token,email:c.email,mode:'new_account'})),proof=ok(person.verifyDemoCode(challenge.challengeId,challenge.demoCode));
  ok(person.claim(inv.token,{email:c.email,proofToken:proof.proofToken},rev()));
  ok(person.editDraft(exp.id,{fields:kind==='patient'?{procedure:'Demo procedure',requestedAmount:20000,termMonths:12,monthlyIncome:15000,address:'Demo address',identityReference:'DEMO'}:{specialty:'Odontología',professionalLicense:'DEMO-1234',clinicName:'Clínica Demo',clinicAddress:'Domicilio DEMO'},documents:[{label:kind==='patient'?'identity':'license',fileName:'demo.pdf',evidenceId:'demo_evidence',mimeType:'application/pdf',size:150,demo:true,actorId:actor.id}]},rev()));
  for(const action of (kind==='patient'?['otp','buroConsent','finalConfirmation']:['otp','finalConfirmation']))ok(person.holderAction(exp.id,action,{confirmed:true,demo:true,capacity:'holder',authorityConfirmed:true},rev()));
  ok(person.submit(exp.id,rev()));
  const r=Analytics.buildReport(staff.snapshot(),{type:kind},{now:NOW,actor:ANA});assert.equal(r.counts.newContacts,1);assert.equal(r.counts.onboardingStarted,1);assert.equal(r.counts.submitted,1);assert.equal(r.counts.activities,0);assert.equal(r.conversion.rate,100);
});
console.log('PASS: '+passed+' CRM analytics behavioral and semantic tests.');
