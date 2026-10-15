'use strict';
// v37: Agenda Lista / Calendario (Semana, Mes) uses the same visible tasks; a KAM only sees their own.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const fixture=path.join(__dirname,'crm-demo-ui.cjs'),source=fs.readFileSync(fixture,'utf8');
const ctx=vm.createContext({require:createRequire(fixture),__dirname,console,Blob,URL,URLSearchParams});
vm.runInContext(source.slice(0,source.indexOf('(async()=>{')).replace('window,document,storage,storeModule:Store','window,document,storage,staffAccess:options.staffAccess,storeModule:Store')+'\nglobalThis.fixture={setup};',ctx,{filename:fixture});
const ok=r=>{assert.equal(r.ok,true,r.error);return r.value;};
async function actor(h,id){h.get('actorSelect').value=id;await h.get('actorSelect').dispatch('change');}
let n=200000;function add(h,owner,name){n++;return ok(h.app.state.store.createContact({phone:'5500'+n,type:'patient',name,email:name.replace(/ /g,'')+'@example.test',assignedKam:owner},h.app.state.store.snapshot().revision));}
function task(h,c,title,dueAt){return ok(h.app.state.store.createTask({contactId:c.id,title,dueAt},h.app.state.store.snapshot().revision));}
const click=(h,action,value)=>h.app.handlers.click({target:{closest:()=>({dataset:{action,value}})}});
(async()=>{
 const h=ctx.fixture.setup();await actor(h,'admin_demo');
 const a=add(h,'kam_ana','Cliente Ana'),l=add(h,'kam_luis','Cliente Luis');
 const now=new Date(h.app.state.store.snapshot().generatedAt||Date.now());
 task(h,a,'Tarea Ana vencida','2026-10-06T17:00:00Z');task(h,a,'Tarea Ana futura','2026-10-10T17:00:00Z');task(h,l,'Tarea Luis','2026-10-10T17:00:00Z');
 h.app.navigate('patient','tasks',null);
 click(h,'task-layout','calendar');let html=h.get('taskBoard').innerHTML;
 assert.match(html,/data-action="task-layout" data-value="calendar" aria-pressed="true"/);assert.match(html,/task-calendar mode-week/);assert.equal((html.match(/class="task-cal-day/g)||[]).length,7);
 assert.match(html,/Tarea Ana futura/);assert.match(html,/Tarea Luis/);
 click(h,'task-cal-mode','month');html=h.get('taskBoard').innerHTML;assert.match(html,/mode-month/);const days=(html.match(/class="task-cal-day/g)||[]).length;assert.ok(days>=28&&days%7===0,String(days));
 click(h,'task-cal-step','-1');click(h,'task-cal-step','0');assert.equal(h.app.state.taskCalAnchor,null);
 // overdue item renders with overdue class when its month is shown
 h.app.state.taskCalAnchor=null;h.app.handlers.click({target:{closest:()=>({dataset:{action:'task-cal-mode',value:'month'}})}});html=h.get('taskBoard').innerHTML;assert.match(html,/task-cal-item is-overdue[^>]*>[\s\S]*Tarea Ana vencida/);assert.match(html,/data-action="view-task"/);
 h.app.state.taskCalAnchor=null;
 await actor(h,'kam_ana');h.app.navigate('patient','tasks',null);h.app.state.taskLayout='calendar';h.app.state.taskCalMode='week';click(h,'task-cal-mode','week');html=h.get('taskBoard').innerHTML;
 assert.match(html,/Tarea Ana futura/);assert.doesNotMatch(html,/Tarea Luis/,'KAM does not see other KAM tasks');
 click(h,'task-layout','list');assert.match(h.get('taskBoard').innerHTML,/task-column overdue/);
 console.log('PASS: v37 task calendar (week/month, overdue, navigation, KAM visibility). DOM/VM only.');
})().catch(e=>{console.error(e);process.exit(1);});
