'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
function fixture(options={}){
 let destroy=0,clean=0,passed,observer;const pages=options.pages||1;
 const win={MutationObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){}},addEventListener(){},removeEventListener(){},setTimeout(){return 1;},clearTimeout(){}};
 const doc={defaultView:win,createElement(tag){assert.equal(tag,'canvas');return {width:0,height:0,getContext(){return {};},toDataURL(){return 'data:image/png;base64,cGl4ZWxz';}};}};
 const frame={isConnected:true,ownerDocument:doc,src:'blob:old',srcdoc:'',setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];}};
 const page={getViewport({scale}){return {width:(options.large?1000:400)*scale,height:(options.large?1000:300)*scale};},render(opts){assert.equal(opts.annotationMode,1);return {promise:options.renderPromise||Promise.resolve()};},cleanup(){clean++;}};
 const pdfjs={GlobalWorkerOptions:{},getDocument(opts){passed=opts;return {promise:options.error?Promise.reject(Error(options.error)):Promise.resolve({numPages:pages,getPage:async()=>page}),destroy:async()=>{destroy++;}};}};
 return {frame,pdfjs,observe:()=>observer(),get passed(){return passed;},get destroy(){return destroy;},get clean(){return clean;}};
}
(async()=>{
 const {renderPDFFrame,previewDocument}=await import('../assets/js/crm-pdf-preview.js');
 const blob=new Blob(['%PDF-1.4\nfixture'],{type:'application/pdf'}),f=fixture({pages:2});
 await renderPDFFrame(f.frame,blob,()=>true,{pdfjs:f.pdfjs});
 assert.equal(f.frame.sandbox,'');assert.equal(f.frame.src,undefined);assert.equal(f.passed.isEvalSupported,false);assert.equal(f.passed.enableXfa,false);assert.equal(f.passed.stopAtErrors,true);assert.ok(f.passed.data instanceof Uint8Array);
 assert.match(f.frame.srcdoc,/Página 2 de 2/);assert.equal((f.frame.srcdoc.match(/<img /g)||[]).length,2);assert.equal(f.clean,2);assert.equal(f.destroy,1);
 assert.match(f.frame.srcdoc,/default-src 'none'/);assert.match(f.frame.srcdoc,/img-src data:/);assert.doesNotMatch(f.frame.srcdoc,/<script|<iframe|<object|<embed|href=/i);
 const bad=fixture({error:'<script>alert(1)</script>'});await renderPDFFrame(bad.frame,blob,()=>true,{pdfjs:bad.pdfjs});assert.match(bad.frame.srcdoc,/&lt;script&gt;/);assert.doesNotMatch(bad.frame.srcdoc,/<script>/);assert.equal(bad.destroy,1);
 let resolve;const stale=fixture({renderPromise:new Promise(r=>resolve=r)});let current=true;
 const pending=renderPDFFrame(stale.frame,blob,()=>current,{pdfjs:stale.pdfjs});await new Promise(r=>setImmediate(r));current=false;const before=stale.frame.srcdoc;resolve();await pending;assert.equal(stale.frame.srcdoc,before);assert.equal(stale.destroy,1);
 let release;const closed=fixture({renderPromise:new Promise(r=>release=r)});const closing=renderPDFFrame(closed.frame,blob,()=>true,{pdfjs:closed.pdfjs});await new Promise(r=>setImmediate(r));closed.frame.isConnected=false;closed.observe();release();await closing;assert.doesNotMatch(closed.frame.srcdoc,/<img /);assert.ok(closed.destroy>=1);
 const capped=fixture({pages:101});await renderPDFFrame(capped.frame,blob,()=>true,{pdfjs:capped.pdfjs});assert.match(capped.frame.srcdoc,/límite de 100 páginas/);assert.equal(capped.destroy,1);
 const memory=fixture({pages:20,large:true});await renderPDFFrame(memory.frame,blob,()=>true,{pdfjs:memory.pdfjs});assert.match(memory.frame.srcdoc,/supera el tamaño/);assert.equal(memory.clean,17);assert.equal(memory.destroy,1);
 const source=fs.readFileSync(path.join(__dirname,'../assets/js/crm-pdf-preview.js'),'utf8');assert.doesNotMatch(source,/getJSActions|eval\(|allow-scripts|allow-same-origin/);assert.match(previewDocument('test'),/form-action 'none'/);
 console.log('PASS PDF raster preview: sandbox unchanged, inert images, no PDF script/actions, escaped failures, stale/closed cancellation, worker cleanup and explicit size limits. Safari render tested separately.');
})().catch(e=>{console.error(e);process.exitCode=1;});
