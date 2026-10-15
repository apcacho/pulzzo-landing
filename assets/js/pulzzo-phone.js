/* v36g: Mexican phone display «55 3492 3595» (2-4-4). Storage and comparison stay as bare digits. */
(function(root){
  'use strict';
  function digits(value){return String(value==null?'':value).replace(/\D/g,'');}
  function national(d){if(d.length===13&&d.indexOf('521')===0)return d.slice(3);if(d.length===12&&d.indexOf('52')===0)return d.slice(2);return d;}
  function group(d){return d.length<=2?d:d.length<=6?d.slice(0,2)+' '+d.slice(2):d.slice(0,2)+' '+d.slice(2,6)+' '+d.slice(6,10);}
  // Display: only values that are clearly one Mexican number change; anything else is returned untouched.
  function format(value){
    if(value==null)return '';
    const text=String(value),trimmed=text.trim();
    if(!trimmed||!/^[+\d\s().-]+$/.test(trimmed))return text;
    const all=digits(trimmed),d=national(all);
    if(d.length!==10)return text;
    return (all.length>10&&/^\s*\+/.test(trimmed)?'+52 ':'')+group(d);
  }
  // While typing: group up to 10 national digits; leave international or longer entries as typed.
  function formatTyping(value){
    const text=String(value==null?'':value);
    if(/^\s*\+/.test(text)||!/^[\d\s().-]*$/.test(text))return text;
    const d=digits(text);
    return d.length>10?text:group(d);
  }
  function onInput(event){
    const path=event.composedPath?event.composedPath():[],el=path[0]||event.target;
    if(!el||el.tagName!=='INPUT'||!el.hasAttribute||!el.hasAttribute('data-pz-phone'))return;
    const before=el.value,next=formatTyping(before);if(next===before)return;
    let caret=typeof el.selectionStart==='number'?el.selectionStart:before.length;
    const digitsBefore=digits(before.slice(0,caret)).length;el.value=next;
    let pos=0,seen=0;while(pos<next.length&&seen<digitsBefore){if(/\d/.test(next[pos]))seen++;pos++;}
    try{el.setSelectionRange(pos,pos);}catch(_){}
  }
  const api={digits,national,format,formatTyping,onInput};
  root.PulzzoPhone=api;
  if(root.document&&root.document.addEventListener)root.document.addEventListener('input',onInput,true);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
