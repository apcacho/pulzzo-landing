'use strict';
// Normalize only three audited output-escaping fixes and the local video preview
// addition. All financial/business program bytes remain pinned to their baseline.
module.exports=source=>require('./restore-native-registration.cjs')('backoffice.html',source)
 .replace('  if(/^data:video\\/(webm|mp4);base64,[A-Za-z0-9+/=]+$/.test(url))return `<video controls preload="metadata" class="review-preview-image" src="${escapeAttr(url)}"></video>`;\n','')
 .replace('<small>${escapeHtml(String(k))}</small><span>${escapeHtml(String(v','<small>${k}</small><span>${escapeHtml(String(v')
 .replace('<h4>${escapeHtml(String(x))}</h4><p>Procedimiento activo demo','<h4>${x}</h4><p>Procedimiento activo demo')
 .replace('onclick="removeProc(\'${p.id}\',${escapeAttr(JSON.stringify(String(x)))})"','onclick="removeProc(\'${p.id}\',\'${x}\')"');
