/* Read-only connection from authenticated CRM holder to the existing servicing cut. */
(function(root,factory){const api=factory(root?.PulzzoCRMOffice||(typeof module==='object'?require('./crm-demo-office.js'):null),root?.PulzzoDemoServicing||(typeof module==='object'?require('./demo-servicing.js'):null),root?.PulzzoDemoBridge||(typeof module==='object'?require('../pulzzo-demo-bridge.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PulzzoHolderServicing=api;})(typeof window!=='undefined'?window:null,function(Office,Servicing,Bridge){
'use strict';
function read(options){
 const {storage,sessionStorage,api,actor,expId}=options,now=Date.now();
 const session=JSON.parse(sessionStorage.getItem('pulzzo_crm_holder_demo_session')||'null');
 if(!session||session.demo!==true||!Number.isFinite(session.expiresAt)||session.expiresAt<=now||session.expiresAt>now+31*60000||session.expId!==expId||actor?.role!=='holder'||session.actor?.role!=='holder'||session.actor?.id!==actor.id)throw Error('La sesión del titular cambió o venció. Verifica tu acceso.');
 const result=api.getExpedient(expId);if(!result.ok)throw Error(result.error||'No puedes consultar este expediente.');
 const exp=result.value.expedient;
 if(exp.kind!=='patient'||exp.id!==expId||exp.holderIdentity?.id!==actor.id||!exp.submissionSnapshot)throw Error('El expediente no corresponde al titular.');
 const current=Office.readSubmittedRecord(storage,exp),accepted=exp.holderActions?.offerAcceptance,signed=exp.holderActions?.contractSignature;
 if(!current?.offer||!accepted||!signed||accepted.actorId!==actor.id||signed.actorId!==actor.id||!accepted.confirmed||!accepted.demo||!signed.confirmed||!signed.demo||accepted.offerFingerprint!==current.offerFingerprint||signed.offerFingerprint!==current.offerFingerprint||exp.receivedOffer?.offerFingerprint!==current.offerFingerprint||Bridge.fingerprint(exp.receivedOffer.offer)!==Bridge.fingerprint(current.offer))throw Error('La oferta y la firma deben corresponder al mismo crédito.');
 const matches=Office.readDatabase(storage).patients.filter(p=>p.id===current.id);if(matches.length!==1)throw Error('Hay vínculos ambiguos en administración.');const record=matches[0];const identity=Servicing.patientRecordIdentity(record);if(identity.patientAccountId!==actor.id||identity.applicationId!==expId)throw Error('El crédito no pertenece a esta cuenta y expediente.');
 if(record?.application?.contractSigned!==true||record.application.offerAccepted!==true)throw Error('La firma todavía no fue recibida en administración.');
 const envelope=Servicing.receive(storage,'patient_servicing',actor.id,expId,options.previous);
 const p=envelope.payload;
 if(p.patientAccountId!==actor.id||p.sourceApplicationId!==expId||p.creditId!==current.id||p.offerFingerprintDigest!==Servicing.digestText(Bridge.fingerprint(current.offer))||!Array.isArray(p.rows)||p.rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw Error('El calendario no corresponde a este crédito y oferta.');
 // Revalidate the actor-scoped reader after all local reads; never persist a projection in the submitted capture.
 if(!api.getExpedient(expId).ok||sessionStorage.getItem('pulzzo_crm_holder_demo_session')!==JSON.stringify(session))throw Error('La sesión cambió durante la consulta.');
 return envelope;
}
return {read};
});
