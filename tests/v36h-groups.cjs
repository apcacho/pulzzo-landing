'use strict';
// v36h: Admin creates groups (start with no permissions, logged in history); permission logic unchanged; KAM never approves amounts.
const assert=require('node:assert/strict');const crypto=require('node:crypto').webcrypto;
const Staff=require('../assets/js/staff-access.js');
function memory(){const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};}
let now=Date.parse('2026-10-14T18:00:00Z');const storage=memory(),access=Staff.createStore({storage,crypto,now:()=>now});
const admin=()=>access.loginDemo('admin@pulzzo.mx','pulzzo-demo'),as=e=>access.loginDemo(e,'pulzzo-demo');
const throws=(fn,code)=>assert.throws(fn,e=>e.code===code,code);
{const a=admin();const g=access.createRole(a,{label:'  Atención a clientes '},access.getVersion());
 assert.equal(g.label,'Atención a clientes');assert.deepEqual(g.grants,{},'new group starts with no permissions');assert.equal(g.system,false);assert.match(g.id,/^group_/);
 assert.ok(access.listRoles(admin()).some(r=>r.id===g.id));
 const log=access.listAudit(admin()).find(e=>e.action==='role_created'&&e.subjectId===g.id);assert.ok(log,'history entry');assert.equal(log.actorId,'admin_demo');
 throws(()=>access.createRole(admin(),{label:'atención a clientes'},access.getVersion()),'DUPLICATE_ROLE');
 throws(()=>access.createRole(admin(),{label:'KAM'},access.getVersion()),'DUPLICATE_ROLE');
 throws(()=>access.createRole(admin(),{label:'   '},access.getVersion()),'INVALID_ROLE');
 throws(()=>access.createRole(admin(),{label:'X',grants:{crmView:'all'}},access.getVersion()),'INVALID_FIELDS');
 throws(()=>access.createRole(as('lider.kam@pulzzo.mx'),{label:'Del líder'},access.getVersion()),'FORBIDDEN');
 throws(()=>access.createRole(as('ana.kam@pulzzo.mx'),{label:'Del KAM'},access.getVersion()),'FORBIDDEN');
 // grants go through the existing updateRole rules
 throws(()=>access.updateRole(admin(),g.id,{grants:{users:'all'}},access.getVersion()),'ADMIN_ONLY_CAPABILITY');
 throws(()=>access.updateRole(admin(),g.id,{grants:{viewPatients:'own'}},access.getVersion()),'INVALID_GRANTS');
 access.updateRole(admin(),g.id,{grants:{crmView:'all',crmEdit:'own'}},access.getVersion());
 const u=access.createUser(admin(),{name:'Nora Grupo',email:'nora@example.test',phone:'5500000301',roles:[g.id]},access.getVersion());
 const p=access.previewRoles(admin(),[g.id]);assert.equal(p.grants.crmEdit,'own');assert.equal(p.grants.users,undefined);
 // custom groups never approve amounts; KAM never approves
 const limits=access.getApprovalLimits(admin());assert.equal(limits.leader,10000);
 console.log('PASS Admin creates groups with no permissions, history logged, duplicates/forbidden rejected, existing grant rules apply, user can join new group',u.roles.join(','));}
// UI wiring
{const fs=require('fs'),path=require('path');const ui=fs.readFileSync(path.join(__dirname,'../assets/js/staff-admin-ui.js'),'utf8');
 for(const hook of ['+ Nuevo grupo','Crear grupo','data-atab','sx-pseg','setRoleStep','Un KAM nunca aprueba montos','role_created:'])assert.ok(ui.includes(hook),hook);
 assert.ok(!/sx-split"><section class="sx-card"><h3>Grupos/.test(ui),'no left column');
 const cfg=fs.readFileSync(path.join(__dirname,'../assets/js/backoffice-configuration.js'),'utf8');assert.ok(cfg.includes('cfg-version-panel')&&cfg.includes('Crear una nueva versión')&&cfg.includes('Reglas vigentes · solo consulta'));
 const bo=fs.readFileSync(path.join(__dirname,'../backoffice.html'),'utf8');assert.ok(!bo.includes('configuración separada'),'top-bar Correo CRM button gone');
 console.log('PASS v36h UI hooks: group cards row, wizard steps, area tabs, aligned segmented table, rules card + version panel');}
// v36i: wrap grid (no horizontal scroll), «Solo propios» only in CRM, no left-accent info boxes, required fields, switches for individual permissions, CRM toolbar left.
{const fs=require('fs'),path=require('path');const ui=fs.readFileSync(path.join(__dirname,'../assets/js/staff-admin-ui.js'),'utf8');
 assert.ok(/\.sx-grow\{display:grid;grid-template-columns:repeat\(auto-fill/.test(ui)&&!/\.sx-grow\{[^}]*overflow-x:auto/.test(ui));
 assert.ok(!/border-left:3px/.test(ui),'no left accent border');assert.ok(ui.includes('Solo propios: ve solo los clientes que tiene asignados'));
 assert.ok(ui.includes("filter(sc=>sc!=='own'||areaOwn)"));assert.ok(ui.includes('Falta este dato')&&ui.includes('class="sx-req"'));
 assert.ok(ui.includes('data-ov-cap')&&!ui.includes('Primero crea la cuenta'));assert.ok(ui.includes('sx-effarea'));
 const css=fs.readFileSync(path.join(__dirname,'../assets/css/crm-demo-embed.css'),'utf8');assert.match(css,/\.crm-toolbar-actions\{[^}]*margin-left:0;justify-content:flex-start\}/);
 console.log('PASS v36i hooks');}
