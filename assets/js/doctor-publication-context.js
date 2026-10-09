/* Identity adapter for the local directory demo. Never joins by name, email or phone. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PulzzoDoctorPublicationContext=api;})(typeof window!=='undefined'?window:null,function(){
'use strict';
const BO_KEY='pulzzo_backoffice_demo',CRM_KEY='pulzzo_crm_assisted_demo_v1';
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const isId=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,179}$/.test(x)&&!['__proto__','constructor','prototype'].includes(x);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function read(storage){
 const boRaw=storage.getItem(BO_KEY),crmRaw=storage.getItem(CRM_KEY);
 const db=boRaw?JSON.parse(boRaw):null,crm=crmRaw?JSON.parse(crmRaw):null;
 if(!db||!Array.isArray(db.providers)||!Array.isArray(db.patients))return null;
 if(crm&&(!object(crm.contacts)||!object(crm.expedients)||crm.version!==1))return null;
 return {db,crm,boRaw,crmRaw};
}
function submissionMatches(exp,intake,accountId){
 const p=exp?.submissionSnapshot,i=exp?.holderIdentity;
 if(!p||p.schema!=='pulzzo.crm.submission.v1'||p.demo!==true||!['submitted','accepted','signed'].includes(exp.status)||exp.kind!=='doctor'||!isId(exp.id)||p.expedientId!==exp.id||p.contactId!==exp.contactId||p.accountId!==accountId||p.kind!=='doctor'||i?.id!==accountId||i.demo!==true)return false;
 if(!Number.isFinite(Date.parse(exp.submittedAt))||exp.submittedAt!==p.submittedAt||!Number.isFinite(Date.parse(i.verifiedAt))||!same(p.holderIdentity,i)||p.submissionId!==intake.submissionId||p.submittedAt!==intake.submittedAt)return false;
 if(!Number.isSafeInteger(p.revision)||p.revision<1||p.revision!==exp.submissionRevision||!same(p.fields,exp.fields)||!same(p.documents,exp.documents))return false;
 for(const key of ['otp','finalConfirmation']){const a=p.holderActions?.[key];if(a?.actorId!==accountId||a.actorRole!=='holder'||a.confirmed!==true||a.demo!==true||!Number.isFinite(Date.parse(a.at)))return false;}
 return same(p.holderConfirmation,p.holderActions.finalConfirmation)&&['holder','authorized_representative'].includes(p.holderConfirmation.capacity)&&p.holderConfirmation.authorityConfirmed===true;
}
function resolveFrom(ctx,id){
 if(!ctx||!isId(id))return null;
 const {db,crm}=ctx,all=[...db.providers,...db.patients];
 const matches=all.filter(p=>p?.id===id);
 if(matches.length!==1||!db.providers.includes(matches[0]))return null;
 const p=matches[0],intake=p.crmIntake;
 if(p.patientAccountId||intake!=null&&!object(intake))return null;
 const accounts=[p.doctorAccountId,intake?.accountId].filter(x=>x!=null&&x!=='');
 if(!accounts.length||accounts.some(x=>!isId(x)||x!==accounts[0]))return null;
 const accountId=accounts[0];
 if(all.filter(r=>[r?.doctorAccountId,r?.patientAccountId,r?.crmIntake?.accountId].includes(accountId)).length!==1)return null;
 const contacts=crm?Object.values(crm.contacts):[];
 const linked=contacts.filter(c=>c?.id===intake?.contactId||[c?.accountId,c?.holderId].includes(accountId));
 if(linked.length>1)return null;
 let c=linked[0]||null;
 if(intake&&!c)return null;
 if(c){
  if(!isId(c.id)||crm.contacts[c.id]!==c||c.type!=='doctor'||c.deletedAt)return null;
  const ids=[c.accountId,c.holderId].filter(x=>x!=null&&x!=='');
  if(!ids.length||ids.some(x=>x!==accountId||!isId(x)))return null;
  if(intake&&(intake.contactId!==c.id||!isId(intake.expedientId)||!isId(intake.submissionId)))return null;
  const exps=Object.values(crm.expedients).filter(e=>e.contactId===c.id||e.holderIdentity?.id===accountId);
  if(exps.length>1||exps.some(e=>e.kind!=='doctor'||e.contactId!==c.id))return null;
  if(intake&&(exps.length!==1||exps[0].id!==intake.expedientId||!submissionMatches(exps[0],intake,accountId)))return null;
  if(all.filter(r=>r.crmIntake?.contactId===c.id||intake&&r.crmIntake?.expedientId===intake.expedientId).length>(intake?1:0))return null;
 }
 return {id:p.id,doctorAccountId:accountId,accountId,contactId:c?.id||null,assignedKam:c&&isId(c.assignedKam)?c.assignedKam:null,eligible:p.onboarding?.approved===true};
}
function resolveProvider(storage,id){try{const ctx=read(storage),result=resolveFrom(ctx,id);return ctx&&storage.getItem(BO_KEY)===ctx.boRaw&&storage.getItem(CRM_KEY)===ctx.crmRaw?result:null;}catch(_){return null;}}
function holderProvider(storage,accountId){
 if(!isId(accountId))return null;
 try{const ctx=read(storage);if(!ctx)return null;const candidates=ctx.db.providers.filter(p=>[p?.doctorAccountId,p?.crmIntake?.accountId].includes(accountId));if(candidates.length!==1)return null;const r=resolveFrom(ctx,candidates[0].id);return r&&r.accountId===accountId&&storage.getItem(BO_KEY)===ctx.boRaw&&storage.getItem(CRM_KEY)===ctx.crmRaw?r:null;}catch(_){return null;}
}
function providerForContact(storage,contact){
 if(!contact||contact.type!=='doctor'||contact.deletedAt||contact.accountId&&contact.holderId&&contact.accountId!==contact.holderId)return null;
 const result=holderProvider(storage,contact.accountId||contact.holderId);
 return result&&result.contactId===contact.id?result:null;
}
function safeUrl(value){
 if(typeof value!=='string'||!/^https?:\/\//i.test(value.trim())||/[\u0000-\u0020\u007f]/.test(value.trim()))return '';
 try{const u=new URL(value.trim());return /^https?:$/.test(u.protocol)&&!u.username&&!u.password&&u.hostname&&u.hostname.includes('.')?u.href:'';}catch(_){return '';}
}
function photoFromDataUrl(dataUrl){
 const m=typeof dataUrl==='string'&&dataUrl.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/);
 if(!m||m[2].length%4)return null;
 const size=m[2].length/4*3-(m[2].endsWith('==')?2:m[2].endsWith('=')?1:0);
 return size>0&&size<=5*1024*1024?{dataUrl,type:m[1],size,name:'Foto de perfil local'}:null;
}
function fields(provider){
 const p=provider||{},profile=p.profile||{},links={};
 for(const key of ['website','instagram','facebook','doctoralia','linkedin','other']){const url=safeUrl(p.links?.[key]);if(url)links[key]=url;}
 const specialties=Array.isArray(p.specialties)?p.specialties:[];
 const visible=p.contact?.visible,phone=visible==='office'?p.contact?.officePhone:visible==='whatsapp'?p.contact?.officeWhats:visible==='custom'?(p.contact?.customPhone||p.contact?.custom):visible===false?'':p.contact?.registered;
 return {displayName:[profile.prefix,profile.name].filter(Boolean).join(' ').trim(),specialty:String(specialties[0]||p.medval?.specialty||profile.specialty||''),state:String(profile.state||''),city:String(profile.city||''),clinicName:String(profile.accountType||'').toLowerCase().includes('clínica')?String(profile.name||''):String(p.profileData?.procedureHospital||''),bio:'',phone:String(phone||''),whatsapp:'',website:links.website||'',links,services:(Array.isArray(p.procedures)?p.procedures:[]).filter(x=>typeof x==='string'),photo:photoFromDataUrl(p.profilePhotoData)};
}
return Object.freeze({BO_KEY,CRM_KEY,resolveProvider,holderProvider,providerForContact,fields,safeUrl,photoFromDataUrl});
});
