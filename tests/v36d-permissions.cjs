'use strict';
// v36d: users (name/email/cellphone), groups add up, individual permissions with expiry, deactivation, amount approvals.
const assert=require('node:assert/strict');const crypto=require('node:crypto').webcrypto;
const Staff=require('../assets/js/staff-access.js'),CRM=require('../assets/js/crm-demo-store.js');
function memory(){const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};}
let now=Date.parse('2026-10-14T18:00:00Z');const storage=memory(),access=Staff.createStore({storage,crypto,now:()=>now});
const admin=()=>access.loginDemo('admin@pulzzo.mx','pulzzo-demo'),as=e=>access.loginDemo(e,'pulzzo-demo');
const throws=(fn,code)=>assert.throws(fn,e=>e.code===code,code);
// 1 create user: name, email, cellphone required, several groups; additive permissions
{const a=admin();throws(()=>access.createUser(a,{name:'Sin Cel',email:'sincel@example.test',roles:['kam']}),'INVALID_PHONE');
 throws(()=>access.createUser(a,{name:'',email:'x@example.test',phone:'5500000201',roles:['kam']}),'INVALID_IDENTITY');
 const u=access.createUser(a,{name:'Rosa Doble',email:'rosa@example.test',phone:'55 0000 0202',roles:['kam','portfolio']});assert.equal(u.phone,'5500000202');assert.deepEqual(u.roles,['kam','portfolio']);
 const p=access.previewRoles(admin(),['kam','portfolio']);assert.equal(p.grants.crmEdit,'own');assert.equal(p.grants.registerPayments,'all');
 assert.ok(access.listUsers(admin()).every(x=>/^\d{10}$/.test(x.phone)||x.id===u.id),'seed users have fictitious phones');
 // non-admin cannot manage users
 throws(()=>access.createUser(as('lider.kam@pulzzo.mx'),{name:'N',email:'n@example.test',phone:'5500000203',roles:['kam']}),'FORBIDDEN');
 console.log('PASS users require name/email/cellphone, belong to several groups, permissions add up; only Admin manages');}
// 2 individual permission with expiry, history
{const a=admin();assert.equal(access.can(as('ana.kam@pulzzo.mx'),'viewPortfolio'),false);
 access.setUserPermission(a,'kam_ana',{capability:'viewPortfolio',scope:'all',expiresAt:new Date(now+3600000).toISOString()});
 const ana=as('ana.kam@pulzzo.mx');assert.equal(access.can(ana,'viewPortfolio'),true);
 throws(()=>access.setUserPermission(admin(),'kam_ana',{capability:'users',scope:'all',expiresAt:null}),'ADMIN_ONLY_CAPABILITY');
 throws(()=>access.setUserPermission(as('lider.kam@pulzzo.mx'),'kam_ana',{capability:'viewPortfolio',scope:'all',expiresAt:null}),'FORBIDDEN');
 throws(()=>access.setUserPermission(admin(),'kam_ana',{capability:'viewPortfolio',scope:'all',expiresAt:new Date(now-1000).toISOString()}),'INVALID_EXPIRY');
 now+=3600001;const ana2=as('ana.kam@pulzzo.mx');assert.equal(access.can(ana2,'viewPortfolio'),false,'lapses automatically');
 access.setUserPermission(admin(),'kam_ana',{capability:'crmEdit',scope:'none',expiresAt:null});assert.equal(access.can(as('ana.kam@pulzzo.mx'),'crmEdit'),false,'removed individually');
 access.setUserPermission(admin(),'kam_ana',{capability:'crmEdit',scope:'clear',expiresAt:null});assert.equal(access.can(as('ana.kam@pulzzo.mx'),'crmEdit'),true,'back to groups');
 const log=access.listAudit(admin()).filter(x=>x.action==='user_permission_changed'&&x.subjectId==='kam_ana');assert.equal(log.length,3);assert.equal(log[0].actorId,'admin_demo');assert.ok(log.every(x=>x.at&&x.after&&x.after.capability));
 console.log('PASS individual permission granted/removed per user with expiry (auto-lapse) and history');}
// 3 deactivation keeps history, revokes sessions; referral links deactivated
{const crm=CRM.createStore({storage,actor:{id:'kam_ana',role:'kam'},staffAccess:access,staffSession:as('ana.kam@pulzzo.mx'),now:()=>new Date(now).toISOString()});
 const ref=crm.createReferral('patient',crm.snapshot().revision);assert.equal(ref.ok,true,ref.error);
 const s=as('luis.kam@pulzzo.mx');const u=access.updateUser(admin(),'kam_luis',{active:false});assert.equal(u.active,false);assert.equal(u.deactivatedBy,'admin_demo');assert.equal(access.resolveSession(s),null);
 assert.ok(access.listUsers(admin()).some(x=>x.id==='kam_luis'),'not deleted');assert.equal(typeof access.deleteUser,'undefined');
 access.updateUser(admin(),'kam_ana',{active:false});
 const view=CRM.createStore({storage,actor:{id:'admin_demo',role:'admin'},staffAccess:access,staffSession:admin(),now:()=>new Date(now).toISOString()});
 assert.equal(view.referralStatus(ref.value.token,'patient').status,'kam_inactive','inactive KAM link no longer works');
 const r=view.listReferrals().find(x=>x.id===ref.value.id);{const rv=view.revokeReferral(r.id,'Usuario desactivado',view.snapshot().revision);assert.equal(rv.ok,true,rv.error);}
 assert.equal(view.listReferrals().find(x=>x.id===r.id).active,false,'stays off if the user is reactivated');
 access.updateUser(admin(),'kam_ana',{active:true});access.updateUser(admin(),'kam_luis',{active:true});
 console.log('PASS deactivation (no delete): history, sessions revoked, referral links off');}
// 4 amount approvals: KAM never; leader up to cap; above → Administración; caps configurable by Admin only
{const ana=as('ana.kam@pulzzo.mx'),lead=as('lider.kam@pulzzo.mx'),a=admin();
 let r=access.checkAmountApproval(ana,{amount:1});assert.equal(r.allowed,false);assert.equal(r.escalateTo,'admin');assert.match(r.reason,/KAM nunca/);
 access.setUserPermission(a,'kam_ana',{capability:'approveCredit',scope:'all',expiresAt:null});assert.equal(access.checkAmountApproval(as('ana.kam@pulzzo.mx'),{amount:1}).allowed,false,'no permission makes a KAM approve amounts');
 assert.deepEqual(access.getApprovalLimits(a),{leader:10000,admin:null});
 assert.equal(access.checkAmountApproval(lead,{amount:10000}).allowed,true);r=access.checkAmountApproval(lead,{amount:10000.01});assert.equal(r.allowed,false);assert.equal(r.escalateTo,'admin');
 assert.equal(access.checkAmountApproval(a,{amount:5e6}).allowed,true);
 throws(()=>access.setApprovalLimits(lead,{leader:99999}),'FORBIDDEN');throws(()=>access.setApprovalLimits(a,{leader:5000,admin:1000}),'INVALID_LIMIT');
 access.setApprovalLimits(admin(),{leader:2500,admin:200000});assert.equal(access.checkAmountApproval(as('lider.kam@pulzzo.mx'),{amount:3000}).allowed,false);
 r=access.checkAmountApproval(admin(),{amount:250000});assert.equal(r.allowed,false);assert.equal(r.escalateTo,null);
 assert.ok(access.listAudit(admin()).some(x=>x.action==='approval_limits_updated'));
 console.log('PASS amount approvals: KAM never, leader up to cap, escalates to Administración; caps by Admin with history');}
