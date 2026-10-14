'use strict';
// Real verified-holder upload for compact legacy fixtures. No forged provenance.
const assert=require('node:assert/strict');
const Evidence=require('../../assets/js/crm-demo-evidence.js');
const Assisted=require('../../assets/js/crm-assisted.js');
const Files=require('./onboarding-evidence.cjs');
async function holderIdentityDocument(store,expId,options={}){
 const exp=store.snapshot().expedients[expId],id=options.id||'evidence_identity';
 const evidence=Evidence.createEvidenceStore({store,indexedDB:Files.memoryIndexedDB(),randomId:()=>id,now:options.now||(()=>new Date())});
 const bytes=await Files.pdf(options.size||150).arrayBuffer(),file=Files.namedBlob(bytes,'application/pdf',options.name||'identity-demo.pdf');
 try{
  const meta=await evidence.put(file,{contactId:exp.contactId,expedientId:expId,documentType:'identity'});
  const descriptor={evidenceId:meta.id,name:meta.name,type:meta.mimeType,size:meta.size,uploadedAt:meta.uploadedAt,actorId:meta.actorId,contactId:meta.contactId,documentType:meta.documentType};
  const verifier=(options.assisted||Assisted).createAssisted({store,actor:store.actor,evidenceStore:evidence}),verified=await verifier.verifyOnboardingEvidence(expId,descriptor,store.snapshot().revision);
  assert.equal(verified.ok,true,verified.error);
  return {label:'identity',fileName:meta.name,evidenceId:meta.id,mimeType:meta.mimeType,size:meta.size,uploadedAt:meta.uploadedAt,actorId:meta.actorId,contactId:meta.contactId,documentType:meta.documentType,demo:true};
 }finally{await evidence.close();}
}
module.exports={holderIdentityDocument};
