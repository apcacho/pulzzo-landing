'use strict';
// Exact inverse patches for the native-entry and BO capture changes reviewed
// in REVISION-LOCAL-MAC-20261013.md. They keep all earlier financial, CSS and
// unrelated program-byte baselines intact; unrecognized edits still fail.
const assert=require('node:assert/strict'),changes=require('./native-registration-reviewed-changes.json');
module.exports=(file,source)=>{
 if(file==='registro-doctor.html')for(const {approved,previous} of require('./visual-fiscal-v33-reviewed-changes.json')){assert.equal(source.split(approved).length,2,'exact Safari-observed fiscal grid restoration');source=source.replace(approved,previous);}
 if(file==='registro-doctor.html')for(const {approved,previous} of require('./visual-mac-v31-reviewed-changes.json')){assert.equal(source.split(approved).length,2,'exact Safari-observed copy/layout restoration');source=source.replace(approved,previous);}
 if(file==='solicitud-paciente.html'){
  const refresh=" renderPortal(); const preSubmitReferences=document.getElementById('preSubmitReferences'); if(preSubmitReferences)preSubmitReferences.innerHTML=renderReferencesCard(); return true;";
  assert.equal(source.split(refresh).length,2,'exact successful reference save refresh');source=source.replace(refresh,' renderPortal(); return true;');
  const pdf="    if(item.mimeType==='application/pdf')void window.PulzzoCRMEvidence?.renderPDFFrame?.(document.querySelector('#documentModalBody iframe'),item.blob,()=>{assertApplicationFresh();return epoch===sharedPatientPreviewEpoch&&route===window.location.href&&snapshot===applicationMemorySnapshot;});\n";
  assert.equal(source.split(pdf).length,2,'one reviewed raster-only PDF adapter; all unrelated code remains pinned');
  source=source.replace(pdf,'');
  const footer="document.querySelector('.app-wrap')?.appendChild(panel);";
  assert.equal(source.split(footer).length,2,'one reviewed move of role actions after native panels');
  source=source.replace(footer,"document.querySelector('.app-wrap')?.prepend(panel);");
 }
 for(const {approved,previous} of changes[file]||[]){assert.equal(source.split(approved).length,2,'exact reviewed native capture patch: '+file);source=source.replace(approved,previous);}return source;
};
