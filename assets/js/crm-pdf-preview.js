// Local raster-only PDF preview. The PDF never becomes an executable document.
const escapeText=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function previewDocument(body){
 return '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><style>body{margin:0;background:#edf0f4;color:#17233a;font:14px system-ui}p{padding:16px}img{display:block;max-width:100%;height:auto;margin:0 auto 12px;background:white}figcaption{padding:8px;text-align:center}figure{margin:0}</style>'+body;
}
export async function renderPDFFrame(frame,blob,isCurrent=()=>true,options={}){
 const doc=frame.ownerDocument,win=doc.defaultView;let task,timer,observer,closed=false;
 const current=()=>{try{return !closed&&frame.isConnected&&isCurrent();}catch(_){return false;}};
 const stop=()=>{closed=true;void task?.destroy().catch(()=>{});};
 const show=body=>{if(current())frame.srcdoc=previewDocument(body);};
 frame.setAttribute('sandbox','');frame.removeAttribute('src');
 show('<p role="status">Abriendo el PDF guardado…</p>');
 try{
  if(blob?.type!=='application/pdf'||blob.size>5*1024*1024)throw Error('El archivo no permite una vista PDF.');
  observer=new win.MutationObserver(()=>{if(!current())stop();});observer.observe(doc,{subtree:true,childList:true});
  win.addEventListener('pagehide',stop,{once:true});
  timer=win.setTimeout(()=>{show('<p>La vista previa tardó demasiado. Cierra y abre nuevamente el documento.</p>');stop();},30000);
  const pdfjs=options.pdfjs||await import('./pdfjs-local.js');
  if(!current())return;
  pdfjs.GlobalWorkerOptions.workerSrc=new URL('./pdfjs-worker-local.js',import.meta.url).href;
  const bytes=new Uint8Array(await blob.arrayBuffer());if(!current())return;
  task=pdfjs.getDocument({data:bytes,cMapUrl:new URL('../pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('../pdfjs/standard_fonts/',import.meta.url).href,wasmUrl:new URL('../pdfjs/wasm/',import.meta.url).href,isEvalSupported:false,enableXfa:false,disableFontFace:true,useSystemFonts:true,stopAtErrors:true,maxImageSize:16000000});
  const pdf=await task.promise;if(!current())return;
  if(pdf.numPages>100)throw Error('El PDF supera el límite de 100 páginas de la vista previa. Conserva el archivo y consulta una copia descargada.');
  let pixels=0,body='';
  for(let n=1;n<=pdf.numPages;n++){
   const page=await pdf.getPage(n);if(!current())return;
   const base=page.getViewport({scale:1}),scale=Math.min(1.5,1600/base.width,2000/base.height),viewport=page.getViewport({scale});
   pixels+=Math.ceil(viewport.width)*Math.ceil(viewport.height);
   if(pixels>40000000)throw Error('El PDF supera el tamaño de la vista previa. Conserva el archivo y consulta una copia descargada.');
   const canvas=doc.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
   try{
    await page.render({canvasContext:canvas.getContext('2d'),viewport,annotationMode:1}).promise;if(!current())return;
    const src=canvas.toDataURL('image/png');if(!src.startsWith('data:image/png;base64,'))throw Error('No se pudo dibujar esta página.');
    body+='<figure><figcaption>Página '+n+' de '+pdf.numPages+'</figcaption><img alt="Página '+n+' del documento" src="'+src+'"></figure>';
   }finally{canvas.width=canvas.height=0;page.cleanup();}
  }
  show(body);
 }catch(error){show('<p role="alert">No se pudo mostrar este PDF. '+escapeText(error?.message||'Intenta abrirlo otra vez.')+'</p>');}
 finally{win.clearTimeout(timer);observer?.disconnect();win.removeEventListener('pagehide',stop);try{await task?.destroy();}catch(_){/* A dismissed worker may already have stopped. */}}
}
