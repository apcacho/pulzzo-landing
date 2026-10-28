/* v72 · Fechas en formato DD/MM/AAAA (es-MX).
   Mejora progresiva: cada <input type="date"> o <input type="datetime-local"> se muestra y se captura
   como DD/MM/AAAA (o DD/MM/AAAA HH:mm), pero su propiedad .value sigue leyendo y escribiendo ISO
   (AAAA-MM-DD / AAAA-MM-DDTHH:mm), así el resto de la aplicación guarda exactamente los mismos valores. */
(function(root,factory){
  var api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PulzzoDateInput=api;
  if(root&&root.document&&typeof root.document.addEventListener==='function'&&typeof root.HTMLInputElement==='function')api.install(root.document);
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  var pad=function(n){return String(n).padStart(2,'0');};
  var ISO_DATE=/^(\d{4})-(\d{2})-(\d{2})$/,ISO_DT=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;
  function realDate(y,m,d){y=+y;m=+m;d=+d;if(!(y>=1900&&y<=2200&&m>=1&&m<=12&&d>=1))return false;var last=new Date(Date.UTC(y,m,0)).getUTCDate();return d<=last;}
  function isoToDisplay(value,withTime){
    var s=String(value==null?'':value).trim(),m;
    if((m=ISO_DT.exec(s)))return m[3]+'/'+m[2]+'/'+m[1]+(withTime?' '+m[4]+':'+m[5]:'');
    if((m=ISO_DATE.exec(s)))return m[3]+'/'+m[2]+'/'+m[1]+(withTime?' 00:00':'');
    return '';
  }
  function displayToIso(text,withTime){
    var s=String(text==null?'':text).trim(),m;
    if(withTime){
      m=/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/.exec(s);
      if(!m||!realDate(m[3],m[2],m[1])||+m[4]>23||+m[5]>59)return '';
      return m[3]+'-'+m[2]+'-'+m[1]+'T'+m[4]+':'+m[5];
    }
    m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if(!m||!realDate(m[3],m[2],m[1]))return '';
    return m[3]+'-'+m[2]+'-'+m[1];
  }
  function maskText(text,withTime){
    var s=String(text==null?'':text);
    if(ISO_DT.test(s.trim())||ISO_DATE.test(s.trim()))return isoToDisplay(s.trim(),withTime);
    var d=s.replace(/\D/g,'').slice(0,withTime?12:8),out='';
    for(var i=0;i<d.length;i++){if(i===2||i===4)out+='/';if(i===8)out+=' ';if(i===10)out+=':';out+=d[i];}
    return out;
  }
  function validateText(text,opts){
    opts=opts||{};var s=String(text==null?'':text).trim(),withTime=!!opts.withTime,fmt=withTime?'DD/MM/AAAA HH:mm':'DD/MM/AAAA';
    if(!s)return opts.required?'Escribe la fecha ('+fmt+').':'';
    var iso=displayToIso(s,withTime);
    if(!iso){var shape=withTime?/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}$/:/^\d{2}\/\d{2}\/\d{4}$/;return shape.test(s)?'Esa fecha no existe. Revisa día, mes y año ('+fmt+').':'Escribe la fecha completa como '+fmt+'.';}
    var day=iso.slice(0,10),min=String(opts.min||'').slice(0,withTime?16:10),max=String(opts.max||'').slice(0,withTime?16:10);
    var cmp=withTime?iso:day;
    if(min&&(ISO_DATE.test(min)||ISO_DT.test(min))&&cmp<min)return 'La fecha debe ser a partir del '+isoToDisplay(min,withTime&&min.length>10)+'.';
    if(max&&(ISO_DATE.test(max)||ISO_DT.test(max))&&cmp>max)return 'La fecha debe ser hasta el '+isoToDisplay(max,withTime&&max.length>10)+'.';
    return '';
  }
  var native=null;
  function nativeValue(){if(!native&&root&&root.HTMLInputElement)native=Object.getOwnPropertyDescriptor(root.HTMLInputElement.prototype,'value');return native;}
  function isEnhanced(el){return !!(el&&el.dataset&&el.dataset.pzDate);}
  function withTimeOf(el){return el.dataset.pzDate==='datetime-local';}
  function enhance(input){
    if(!input||isEnhanced(input))return false;
    var kind=String(input.getAttribute('type')||'').toLowerCase();
    if(kind!=='date'&&kind!=='datetime-local')return false;
    if(input.hasAttribute('data-native-date'))return false;
    var desc=nativeValue();if(!desc)return false;
    var withTime=kind==='datetime-local',iso=desc.get.call(input)||input.getAttribute('value')||'';
    input.dataset.pzDate=kind;
    input.setAttribute('type','text');
    input.setAttribute('inputmode','numeric');
    input.setAttribute('autocomplete','off');
    input.setAttribute('maxlength',withTime?'16':'10');
    if(!input.getAttribute('placeholder'))input.setAttribute('placeholder',withTime?'DD/MM/AAAA HH:mm':'DD/MM/AAAA');
    if(!input.getAttribute('title'))input.setAttribute('title',withTime?'Formato DD/MM/AAAA HH:mm':'Formato DD/MM/AAAA');
    input.classList.add('pz-date-input');
    Object.defineProperty(input,'value',{configurable:true,enumerable:true,
      get:function(){return displayToIso(desc.get.call(this),withTime);},
      set:function(v){var s=String(v==null?'':v);desc.set.call(this,(ISO_DATE.test(s.trim())||ISO_DT.test(s.trim()))?isoToDisplay(s.trim(),withTime):maskText(s,withTime));clearError(this);}
    });
    desc.set.call(input,isoToDisplay(iso,withTime));
    return true;
  }
  function textOf(el){var d=nativeValue();return d?d.get.call(el):'';}
  function setText(el,t){var d=nativeValue();if(d)d.set.call(el,t);}
  function optsOf(el){return {withTime:withTimeOf(el),min:el.getAttribute('min')||'',max:el.getAttribute('max')||'',required:el.hasAttribute('required')};}
  function clearError(el){if(el.setCustomValidity)el.setCustomValidity('');el.classList.remove('pz-date-invalid');el.removeAttribute('aria-invalid');}
  function showError(el,msg){if(!msg){clearError(el);return true;}if(el.setCustomValidity)el.setCustomValidity(msg);el.classList.add('pz-date-invalid');el.setAttribute('aria-invalid','true');if(el.reportValidity)try{el.reportValidity();}catch(e){}return false;}
  // Los eventos que nacen dentro de un shadow root (CRM embebido) los atiende el listener de ese shadow root.
  function targetOf(e,inShadow){var path=e.composedPath?e.composedPath():[],first=path[0]||e.target;if(!inShadow&&first!==e.target)return null;return first;}
  function onInput(e){
    var el=targetOf(e,this&&this.nodeType===11);if(!isEnhanced(el))return;
    var wt=withTimeOf(el),before=textOf(el),masked=maskText(before,wt);
    if(masked!==before)setText(el,masked);
    clearError(el);
    // Mientras la fecha está incompleta, la aplicación no recibe valores parciales.
    if(masked&&!displayToIso(masked,wt))e.stopImmediatePropagation();
  }
  function onChange(e){
    var el=targetOf(e,this&&this.nodeType===11);if(!isEnhanced(el))return;
    var msg=validateText(textOf(el),optsOf(el));
    if(textOf(el)&&msg){showError(el,msg);e.stopImmediatePropagation();return;}
    clearError(el);
  }
  var watchShadow=null;
  function enhanceAll(scope){var n=0;if(!scope||!scope.querySelectorAll)return 0;var list=scope.querySelectorAll('input[type="date"],input[type="datetime-local"]');for(var i=0;i<list.length;i++)if(enhance(list[i]))n++;
    if(watchShadow){if(scope.shadowRoot)watchShadow(scope.shadowRoot);var all=scope.querySelectorAll('*');for(var j=0;j<all.length;j++)if(all[j].shadowRoot)watchShadow(all[j].shadowRoot);}
    return n;}
  var installed=false;
  function install(doc){
    if(installed||!doc)return;installed=true;
    var win=doc.defaultView||root;
    win.addEventListener('input',onInput,true);
    win.addEventListener('change',onChange,true);
    var style=doc.createElement('style');style.id='pzDateInputStyle';
    style.textContent='.pz-date-input{font-variant-numeric:tabular-nums}.pz-date-input.pz-date-invalid{border-color:#B42318!important;box-shadow:0 0 0 3px rgba(180,35,24,.14)!important}';
    var onRecords=function(records){for(var i=0;i<records.length;i++){var r=records[i];if(r.type==='attributes'){if(r.target.tagName==='INPUT')enhance(r.target);continue;}for(var j=0;j<r.addedNodes.length;j++){var node=r.addedNodes[j];if(node.nodeType!==1)continue;if(node.tagName==='INPUT')enhance(node);else enhanceAll(node);}}};
    var observe=function(target){if(win.MutationObserver)new win.MutationObserver(onRecords).observe(target,{childList:true,subtree:true,attributes:true,attributeFilter:['type']});};
    var seen=[];
    // Shadow roots abiertos (el CRM del backoffice se monta en uno): mismo formato, mismos estilos y mismos avisos.
    watchShadow=function(sr){if(!sr||seen.indexOf(sr)>=0)return;seen.push(sr);sr.addEventListener('input',onInput,true);sr.addEventListener('change',onChange,true);try{sr.appendChild(style.cloneNode(true));}catch(_){}observe(sr);enhanceAll(sr);};
    var EP=win.Element&&win.Element.prototype;
    if(EP&&typeof EP.attachShadow==='function'&&!EP.attachShadow.__pzDate){var orig=EP.attachShadow;var patched=function(init){var sr=orig.call(this,init);if(sr&&init&&init.mode==='open')win.setTimeout(function(){watchShadow(sr);},0);return sr;};patched.__pzDate=true;EP.attachShadow=patched;}
    var start=function(){if(!doc.getElementById('pzDateInputStyle'))(doc.head||doc.documentElement).appendChild(style);enhanceAll(doc);observe(doc.documentElement);};
    if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',start);else start();
  }
  return {isoToDisplay:isoToDisplay,displayToIso:displayToIso,maskText:maskText,validateText:validateText,enhance:enhance,enhanceAll:enhanceAll,install:install};
});
