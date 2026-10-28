/* Local DEMO evidence only. Binary files stay in IndexedDB; no recording or network.
 * Signature checks identify supported containers, not document safety or authenticity.
 * The UI owns preview URLs and must revoke them on dismissal/replacement.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PulzzoCRMEvidence = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  async function renderPDFFrame(frame,blob,isCurrent){
    if(!frame)return;
    const current=()=>{try{return frame.isConnected!==false&&(!isCurrent||isCurrent());}catch(_){return false;}};
    try{
      const viewer=await import('./crm-pdf-preview.js');
      if(!current())return;
      return await viewer.renderPDFFrame(frame,blob,isCurrent);
    }catch(_){
      if(current())frame.srcdoc='<p>No se pudo cargar la vista previa local. Cierra y vuelve a abrir el documento.</p>';
    }
  }
  var MAX_FILE_BYTES = 5 * 1024 * 1024;
  var MAX_TOTAL_BYTES = 25 * 1024 * 1024;
  var MAX_FILES = 200;
  var DB_NAME = 'pulzzo-crm-evidence-demo-v1';
  var TYPES = Object.freeze({
    'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp', 'image/gif': 'gif',
    'application/pdf': 'pdf', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3',
    'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
    'audio/ogg': 'ogg', 'application/ogg': 'ogg',
    'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
    'video/mp4': 'mp4', 'video/webm': 'webm'
  });
  var CANONICAL = {png:'image/png',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',pdf:'application/pdf',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',m4a:'audio/mp4',mp4:'video/mp4',webm:'video/webm'};
  function problem(code, message, cause) {
    var error = new Error(message); error.name = 'EvidenceError'; error.code = code;
    if (cause) error.cause = cause;
    return error;
  }
  function storageProblem(cause) {
    if (cause && cause.name === 'EvidenceError') return cause;
    if (cause && cause.name === 'QuotaExceededError') return problem('STORAGE_QUOTA', 'El navegador no tiene espacio para guardar la evidencia DEMO.', cause);
    return problem('STORAGE_FAILED', 'No se pudo guardar o leer la evidencia DEMO en este navegador. Intenta de nuevo.', cause);
  }
  function ascii(bytes, start, length) {
    var text = ''; for (var i = start; i < Math.min(bytes.length, start + length); i++) text += String.fromCharCode(bytes[i]);
    return text;
  }
  function starts(bytes, signature) { return signature.every(function (value, i) { return bytes[i] === value; }); }
  function u32be(bytes, p) { return (bytes[p] * 16777216 + (bytes[p + 1] << 16) + (bytes[p + 2] << 8) + bytes[p + 3]); }
  function u32le(bytes, p) { return bytes[p] + bytes[p + 1] * 256 + bytes[p + 2] * 65536 + bytes[p + 3] * 16777216; }
  function detectedType(bytes) {
    if (starts(bytes, [137,80,78,71,13,10,26,10])) return 'png';
    if (starts(bytes, [255,216,255])) return 'jpeg';
    if (ascii(bytes,0,4) === 'RIFF' && ascii(bytes,8,4) === 'WEBP') return 'webp';
    if (/^GIF8[79]a$/.test(ascii(bytes,0,6))) return 'gif';
    if (ascii(bytes,0,5) === '%PDF-') return 'pdf';
    if (ascii(bytes,0,4) === 'RIFF' && ascii(bytes,8,4) === 'WAVE') return 'wav';
    if (ascii(bytes,0,4) === 'OggS') return 'ogg';
    if (ascii(bytes,4,4) === 'ftyp') return 'mp4';
    if (starts(bytes,[26,69,223,163])) return 'webm';
    if (ascii(bytes,0,3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224)) return 'mp3';
    return null;
  }
  function mp3FrameLength(bytes, offset) {
    if (offset + 4 > bytes.length || bytes[offset] !== 255 || (bytes[offset + 1] & 224) !== 224) return false;
    var version = (bytes[offset + 1] >> 3) & 3, layer = (bytes[offset + 1] >> 1) & 3;
    var bitrate = bytes[offset + 2] >> 4, rate = (bytes[offset + 2] >> 2) & 3;
    if (version === 1 || layer !== 1 || bitrate === 0 || bitrate === 15 || rate === 3) return false;
    var rates = [44100,48000,32000], bitrates = version === 3 ? [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320] : [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160];
    var sampleRate = rates[rate] / (version === 3 ? 1 : (version === 2 ? 2 : 4));
    var length = Math.floor((version === 3 ? 144 : 72) * bitrates[bitrate] * 1000 / sampleRate) + ((bytes[offset + 2] >> 1) & 1);
    return bytes.length - offset >= length ? length : 0;
  }
  function validJPEG(bytes) {
    var p=2, frame=false, scan=false;
    while(p<bytes.length){
      if(bytes[p++]!==255)return false;
      while(bytes[p]===255)p++;
      if(p>=bytes.length)return false;
      var marker=bytes[p++];
      if(marker===217)return frame && scan && p===bytes.length;
      if(marker===0 || marker===216)return false;
      if(marker===1 || (marker>=208 && marker<=215))continue;
      if(p+2>bytes.length)return false;
      var length=(bytes[p]<<8)+bytes[p+1];
      if(length<2 || length>bytes.length-p)return false;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].indexOf(marker)>=0){
        if(length<8 || !(bytes[p+3]||bytes[p+4]) || !(bytes[p+5]||bytes[p+6]))return false;
        frame=true;
      }
      p+=length;
      if(marker===218){
        if(!frame || length<6)return false;
        scan=true;
        while(p<bytes.length){
          if(bytes[p]!==255){p++;continue;}
          if(bytes[p+1]===0 || (bytes[p+1]>=208 && bytes[p+1]<=215)){p+=2;continue;}
          break;
        }
      }
    }
    return false;
  }
  function validGIF(bytes) {
    if(bytes.length<14)return false;
    var width=bytes[6]+bytes[7]*256,height=bytes[8]+bytes[9]*256;if(!width||!height)return false;
    var globalPalette=!!(bytes[10]&128),p=13+(globalPalette?3*Math.pow(2,(bytes[10]&7)+1):0),images=0;
    if(p>=bytes.length)return false;
    function subBlocks(requireContent){var content=0;while(p<bytes.length){var size=bytes[p++];if(!size)return !requireContent||content>0;if(size>bytes.length-p)return false;content+=size;p+=size;}return false;}
    while(p<bytes.length){
      var marker=bytes[p++];
      if(marker===59)return images>0&&p===bytes.length;
      if(marker===33){
        if(p>=bytes.length)return false;var label=bytes[p++];
        if(label===249){if(p+6>bytes.length||bytes[p]!==4||bytes[p+5]!==0)return false;p+=6;}
        else if(label===255||label===1){var headerSize=label===255?11:12;if(p>=bytes.length||bytes[p++]!==headerSize||headerSize>bytes.length-p)return false;p+=headerSize;if(!subBlocks(false))return false;}
        else if(label===254){if(!subBlocks(false))return false;}
        else return false;
      }else if(marker===44){
        if(p+9>bytes.length)return false;
        var left=bytes[p]+bytes[p+1]*256,top=bytes[p+2]+bytes[p+3]*256,w=bytes[p+4]+bytes[p+5]*256,h=bytes[p+6]+bytes[p+7]*256,packed=bytes[p+8],localPalette=!!(packed&128);
        if(!w||!h||left+w>width||top+h>height||!globalPalette&&!localPalette)return false;
        p+=9+(localPalette?3*Math.pow(2,(packed&7)+1):0);
        if(p>=bytes.length||bytes[p]<2||bytes[p]>8)return false;p++;
        if(!subBlocks(true))return false;images++;
      }else return false;
    }
    return false;
  }
  function mp4AudioTracks(bytes, from, to, depth, tracks, parent) {
    if(depth>5)return false;
    var p=from,handlerSeen=false,mediaSeen=false;parent=parent||'moov';
    while(p+8<=to){
      var size=u32be(bytes,p),box=ascii(bytes,p+4,4);
      if(size<8 || size>to-p)return false;
      if(box==='hdlr'){
        if(size<32||parent!=='mdia'||handlerSeen)return false;handlerSeen=true;
        var handler=ascii(bytes,p+16,4);
        if(handler==='soun')tracks.audio=true;
        if(handler==='vide')tracks.video=true;
      }
      if(box==='moov'||box==='trak'&&parent!=='moov'||box==='mdia'&&(parent!=='trak'||mediaSeen))return false;
      if(box==='mdia')mediaSeen=true;
      if(['trak','mdia'].indexOf(box)>=0 && !mp4AudioTracks(bytes,p+8,p+size,depth+1,tracks,box))return false;
      p+=size;
    }
    return p===to&&(parent!=='mdia'||handlerSeen)&&(parent!=='trak'||mediaSeen);
  }
  // Bounded EBML parsing follows the WebM container element hierarchy. A header
  // alone, audio-only WebM, or a video track without video packets is not video.
  function ebmlVint(bytes,p,to,identifier) {
    if(p>=to||!bytes[p])return null;
    var mask=128,length=1;while(!(bytes[p]&mask)){mask/=2;length++;}
    if(length>(identifier?4:8)||p+length>to)return null;
    var value=identifier?bytes[p]:bytes[p]&(mask-1),unknown=!identifier&&value===mask-1;
    for(var i=1;i<length;i++){unknown=unknown&&bytes[p+i]===255;value=value*256+bytes[p+i];}
    if(!unknown&&!Number.isSafeInteger(value))return null;
    return {value:value,length:length,unknown:unknown};
  }
  function ebmlElement(bytes,p,to) {
    var id=ebmlVint(bytes,p,to,true);if(!id)return null;
    var size=ebmlVint(bytes,p+id.length,to,false);if(!size)return null;
    var from=p+id.length+size.length;if(!size.unknown&&size.value>to-from)return null;
    return {id:id.value,from:from,end:size.unknown?to:from+size.value,unknown:size.unknown};
  }
  function ebmlUInt(bytes,element) {
    var size=element.end-element.from;if(!size||size>8||element.unknown)return null;
    var value=0;for(var p=element.from;p<element.end;p++)value=value*256+bytes[p];
    return Number.isSafeInteger(value)?value:null;
  }
  function ebmlChildren(bytes,from,to,visit) {
    var p=from;while(p<to){var element=ebmlElement(bytes,p,to);if(!element||element.unknown||visit(element)===false)return false;p=element.end;}return p===to;
  }
  function webmBlock(bytes,from,to) {
    var track=ebmlVint(bytes,from,to,false);if(!track||!Number.isSafeInteger(track.value)||track.value<1)return null;
    var p=from+track.length;if(p+3>=to)return null;
    var lacing=(bytes[p+2]&6)>>1;p+=3;
    if(lacing){
      var frames=bytes[p++]+1;if(frames<2||p>=to)return null;
      if(lacing===2){if((to-p)%frames!==0||(to-p)/frames<1)return null;}
      else{
        var total=0,previous=0;
        for(var frame=0;frame<frames-1;frame++){
          var length=0;
          if(lacing===1){var part;do{if(p>=to)return null;part=bytes[p++];length+=part;}while(part===255);}
          else{var encoded=ebmlVint(bytes,p,to,false);if(!encoded||!Number.isSafeInteger(encoded.value))return null;p+=encoded.length;length=frame?previous+encoded.value-(Math.pow(2,7*encoded.length-1)-1):encoded.value;}
          if(!Number.isSafeInteger(length)||length<1)return null;total+=length;previous=length;
        }
        if(total>=to-p)return null;
      }
    }
    return track.value;
  }
  function validWebM(bytes) {
    var header=ebmlElement(bytes,0,bytes.length),docType=false;
    if(!header||header.id!==0x1A45DFA3||header.unknown)return false;
    if(!ebmlChildren(bytes,header.from,header.end,function(e){if(e.id===0x4282){if(docType||ascii(bytes,e.from,e.end-e.from)!=='webm')return false;docType=true;}})||!docType)return false;
    var segment=ebmlElement(bytes,header.end,bytes.length);if(!segment||segment.id!==0x18538067||segment.end!==bytes.length)return false;
    var tracks=Object.create(null),packets=[],sawTracks=false,sawInfo=false,clusterCount=0;
    function readTrack(element){
      var track={number:null,type:null,codec:null,width:null,height:null};
      if(!ebmlChildren(bytes,element.from,element.end,function(e){
        if(e.id===0xD7){if(track.number!==null)return false;track.number=ebmlUInt(bytes,e);}
        if(e.id===0x83){if(track.type!==null)return false;track.type=ebmlUInt(bytes,e);}
        if(e.id===0x86){if(track.codec!==null)return false;track.codec=ascii(bytes,e.from,e.end-e.from);}
        if(e.id===0xE0)return ebmlChildren(bytes,e.from,e.end,function(v){if(v.id===0xB0)track.width=ebmlUInt(bytes,v);if(v.id===0xBA)track.height=ebmlUInt(bytes,v);});
      }))return false;
      if(!track.number||tracks[track.number]||!track.type||!track.codec)return false;
      if(track.type===1&&(!/^V_(VP8|VP9|AV1)$/.test(track.codec)||!track.width||!track.height))return false;
      tracks[track.number]=track;return true;
    }
    function readCluster(element){
      var p=element.from,timecode=false;
      while(p<element.end){
        var e=ebmlElement(bytes,p,element.end);if(!e)return null;
        if([0x1F43B675,0x1654AE6B,0x1549A966,0x1C53BB6B,0x114D9B74,0x1254C367].indexOf(e.id)>=0){if(element.unknown&&timecode)return p;return null;}
        if(e.unknown)return null;
        if(e.id===0xE7){if(timecode||ebmlUInt(bytes,e)===null)return null;timecode=true;}
        if(e.id===0xA3){var track=webmBlock(bytes,e.from,e.end);if(!track)return null;packets.push(track);}
        if(e.id===0xA0){var block=false;if(!ebmlChildren(bytes,e.from,e.end,function(child){if(child.id===0xA1){if(block)return false;var track=webmBlock(bytes,child.from,child.end);if(!track)return false;block=true;packets.push(track);}})||!block)return null;}
        p=e.end;
      }
      return timecode?p:null;
    }
    var p=segment.from;
    while(p<segment.end){
      var e=ebmlElement(bytes,p,segment.end);if(!e)return false;
      if(e.unknown&&e.id!==0x1F43B675)return false;
      if(e.id===0x1549A966){if(sawInfo||!ebmlChildren(bytes,e.from,e.end,function(){}))return false;sawInfo=true;}
      if(e.id===0x1654AE6B){if(sawTracks||!ebmlChildren(bytes,e.from,e.end,function(t){return t.id!==0xAE||readTrack(t);}))return false;sawTracks=true;}
      if(e.id===0x1F43B675){var next=readCluster(e);if(next===null||next<=p)return false;clusterCount++;p=next;}else p=e.end;
    }
    return p===segment.end&&sawInfo&&sawTracks&&clusterCount>0&&packets.length>0&&packets.every(function(n){return !!tracks[n];})&&packets.some(function(n){return tracks[n].type===1;});
  }
  function validContainer(bytes, format) {
    if (format === 'png') {
      // Walk chunks so a PNG header or a cut-off body is not enough.
      var pos = 8, seenImage = false, seenData = false;
      while (pos + 12 <= bytes.length) {
        var length = u32be(bytes,pos), kind = ascii(bytes,pos+4,4);
        if (length > bytes.length - pos - 12) return false;
        if (!seenImage) {
          if (kind !== 'IHDR' || length !== 13 || !u32be(bytes,pos+8) || !u32be(bytes,pos+12)) return false;
          seenImage = true;
        }
        if (kind === 'IDAT' && length > 0) seenData = true;
        pos += 12 + length;
        if (kind === 'IEND') return seenData && length === 0 && pos === bytes.length;
      }
      return false;
    }
    if (format === 'gif') return validGIF(bytes);
    if (format === 'jpeg') return bytes.length >= 32 && validJPEG(bytes);
    if (format === 'pdf') return bytes.length >= 20 && /^%PDF-(1\.[0-7]|2\.0)/.test(ascii(bytes,0,8)) && /%%EOF\s*$/.test(ascii(bytes,Math.max(0,bytes.length-1024),1024));
    if (format === 'webp' || format === 'wav') {
      if (bytes.length < 24 || u32le(bytes,4) + 8 !== bytes.length) return false;
      var p = 12, audioFormat = false, media = false;
      while (p + 8 <= bytes.length) {
        var size = u32le(bytes,p+4), chunk = ascii(bytes,p,4);
        if (size > bytes.length - p - 8) return false;
        if (format === 'webp' && ((chunk === 'VP8L' && size >= 5 && bytes[p+8] === 47) || (chunk === 'VP8 ' && size >= 10 && ascii(bytes,p+11,3) === '\x9d\x01\x2a'))) media = true;
        if (format === 'wav' && chunk === 'fmt ' && size >= 16) audioFormat = true;
        if (format === 'wav' && chunk === 'data' && size > 0) media = true;
        p += 8 + size + (size % 2);
      }
      return p === bytes.length && media && (format === 'webp' || audioFormat);
    }
    if (format === 'ogg') {
      var offset = 0, audio = false, ended = false, audioData = false;
      while (offset < bytes.length) {
        if (offset + 27 > bytes.length || ascii(bytes,offset,4) !== 'OggS' || bytes[offset+4] !== 0) return false;
        var segments = bytes[offset+26], body = 0;
        if (offset + 27 + segments > bytes.length) return false;
        for (var n=0;n<segments;n++) body += bytes[offset+27+n];
        var bodyAt = offset+27+segments;
        if (bodyAt + body > bytes.length) return false;
        if (offset === 0) audio = Boolean(bytes[offset+5] & 2) && ((body >= 19 && ascii(bytes,bodyAt,8) === 'OpusHead') || (body >= 30 && bytes[bodyAt] === 1 && ascii(bytes,bodyAt+1,6) === 'vorbis'));
        else if(body>0)audioData=true;
        ended=Boolean(bytes[offset+5] & 4);
        offset = bodyAt + body;
        if(ended && offset!==bytes.length)return false;
      }
      return audio && ended && audioData;
    }
    if (format === 'webm') return validWebM(bytes);
    if (format === 'm4a' || format === 'mp4') {
      var cursor=0, fileType=false, moov=false, mdat=false, tracks={audio:false,video:false};
      while (cursor + 8 <= bytes.length) {
        var boxSize=u32be(bytes,cursor), box=ascii(bytes,cursor+4,4);
        // Extended-size/streaming containers are intentionally outside this small-file demo.
        if (boxSize < 8 || boxSize > bytes.length-cursor) return false;
        if (cursor === 0) {
          if (box !== 'ftyp' || boxSize < 16) return false;
          var brands=ascii(bytes,cursor+8,boxSize-8);
          fileType=/M4A |M4B |isom|mp42/.test(brands);
          if(format==='mp4'){if(boxSize%4!==0)return false;var videoBrands=['isom','iso2','iso3','iso4','iso5','iso6','iso7','iso8','iso9','mp41','mp42','avc1','av01','M4V ','dash'];fileType=videoBrands.indexOf(ascii(bytes,cursor+8,4))>=0;for(var brandAt=cursor+16;brandAt<cursor+boxSize;brandAt+=4)if(videoBrands.indexOf(ascii(bytes,brandAt,4))>=0)fileType=true;}
        }
        if (box === 'moov') {if(moov||boxSize<=8||!mp4AudioTracks(bytes,cursor+8,cursor+boxSize,0,tracks))return false;moov=true;}
        if (box === 'mdat' && boxSize > 8) mdat=true;
        cursor += boxSize;
      }
      return cursor===bytes.length && fileType && moov && mdat && (format==='m4a'?tracks.audio && !tracks.video:tracks.video);
    }
    if (format === 'mp3') {
      var at = 0;
      if (ascii(bytes,0,3) === 'ID3') {
        if (bytes.length < 10 || bytes[3] < 2 || bytes[3] > 4) return false;
        for (var x=6;x<10;x++) if (bytes[x] & 128) return false;
        at=10+bytes[6]*2097152+bytes[7]*16384+bytes[8]*128+bytes[9];
        if (bytes[3] === 4 && (bytes[5] & 16)) at += 10;
      }
      var frames=0;
      while(at<bytes.length){
        if(frames && bytes.length-at===128 && ascii(bytes,at,3)==='TAG')return true;
        var frameSize=mp3FrameLength(bytes,at);
        if(!frameSize)return false;
        frames++;at+=frameSize;
      }
      return frames>0;
    }
    return false;
  }
  async function readBytes(file) {
    var primaryError;
    if(typeof file.arrayBuffer==='function'){
      try{return new Uint8Array(await file.arrayBuffer());}catch(error){primaryError=error;}
    }
    // Some browser-backed Blobs reject arrayBuffer while FileReader can still
    // read them. This is a bounded alternative read, never fabricated content.
    if(typeof FileReader==='function'){
      try{return new Uint8Array(await new Promise(function(resolve,reject){
        var reader=new FileReader();
        reader.onload=function(){resolve(reader.result);};
        reader.onerror=function(){reject(reader.error||new Error('FileReader failed'));};
        reader.onabort=function(){reject(new Error('FileReader aborted'));};
        reader.readAsArrayBuffer(file);
      }));}catch(error){primaryError=error;}
    }
    throw problem('FILE_READ_FAILED','No se pudo leer el archivo seleccionado.',primaryError);
  }
  async function validatedFile(file) {
    if (!file || typeof file.slice !== 'function' || !Number.isSafeInteger(file.size) || file.size <= 0) throw problem('INVALID_FILE','Selecciona un archivo con contenido.');
    if (file.size > MAX_FILE_BYTES) throw problem('FILE_TOO_LARGE','Cada evidencia DEMO puede pesar hasta 5 MiB.');
    var mime = String(file.type || '').toLowerCase().split(';')[0].trim(), format=TYPES[mime];
    if (!format) throw problem('UNSUPPORTED_TYPE','Formato no admitido. Usa PNG, JPG, WebP, GIF, PDF, MP3, WAV, OGG, M4A, WebM o MP4.');
    var bytes=await readBytes(file);
    if (bytes.length !== file.size) throw problem('TRUNCATED_FILE','El archivo está incompleto o cambió durante la lectura.');
    var detected=detectedType(bytes);
    if (detected && detected !== format && !(detected==='mp4'&&format==='m4a')) throw problem('TYPE_MISMATCH','El contenido del archivo no coincide con su formato declarado.');
    if (!detected || !validContainer(bytes,format)) throw problem('INVALID_CONTENT','El archivo está vacío, incompleto o no tiene un formato admitido reconocible.');
    return {mimeType:CANONICAL[format],bytes:bytes};
  }
  async function validateFile(file){return (await validatedFile(file)).mimeType;}
  function cleanId(value, label, optional) {
    if ((value === undefined || value === null || value === '') && optional) return null;
    if (typeof value !== 'string' || !value.trim() || value.length > 160 || /[\u0000-\u001f\u007f]/.test(value)) throw problem('INVALID_METADATA','Falta un identificador válido de '+label+'.');
    return value.trim();
  }
  function randomIdentifier() {
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
    return 'evidence-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);
  }
  function metadataOnly(record) {
    if (!record) return null;
    return Object.freeze({id:record.id,name:record.name,mimeType:record.mimeType,size:record.size,uploadedAt:record.uploadedAt,actorId:record.actorId,contactId:record.contactId,activityId:record.activityId,documentType:record.documentType});
  }
  function createEvidenceStore(options) {
    options=options || {};
    var factory=Object.prototype.hasOwnProperty.call(options,'indexedDB') ? options.indexedDB : (typeof globalThis !== 'undefined' ? globalThis.indexedDB : null);
    var now=options.now || function(){return new Date();}, randomId=options.randomId || randomIdentifier, opening=null, epoch=0, closed=false, ownUploads=new Map();
    // The unscoped adapter is retained for the holder/backoffice integration. CRM
    // mounts supply their actual store, never an actor supplied by upload metadata.
    var scoped=Object.prototype.hasOwnProperty.call(options,'store'), store=options.store, actor=null, isCurrent=options.isCurrent;
    if(scoped){
      if(!store || !store.actor || typeof store.getContact!=='function' || typeof store.canAccessContact!=='function' || !['admin','kam','leader','holder'].includes(store.actor.role))throw problem('INVALID_SCOPE','No se pudo verificar la identidad de esta vista CRM.');
      actor={id:cleanId(store.actor.id,'actor'),role:store.actor.role};
    }
    function sessionGuard(write, contact) {
      var started=epoch;
      return function(){
        var current=true;
        try{if(typeof isCurrent==='function')current=isCurrent()===true;}catch(ignore){current=false;}
        if(started!==epoch || scoped && closed || !current)throw problem('ACCESS_REVOKED','La sesión o la vista cambió. Abre de nuevo la evidencia desde el contacto.');
        if(!scoped)return;
        if(!store.actor || store.actor.id!==actor.id || store.actor.role!==actor.role)throw problem('ACCESS_REVOKED','La identidad de esta vista CRM cambió.');
        if(write&&actor.role!=='holder'&&(typeof store.canWriteCRM==='function'?!store.canWriteCRM():!['admin','kam'].includes(actor.role)))throw problem('FORBIDDEN','Esta identidad sólo puede consultar evidencias DEMO.');
        var id=typeof contact==='function' ? contact() : contact;
        if(write&&id&&actor.role!=='holder'&&typeof store.canEditContact==='function'&&!store.canEditContact(id))throw problem('FORBIDDEN','El permiso vigente no permite adjuntar evidencia a esta ficha.');
        if(id && !canReadContact(id))throw problem('FORBIDDEN','Esta identidad DEMO no tiene acceso al contacto activo de la evidencia.');
      };
    }
    function canReadContact(id) {
      if(!scoped)return true;
      try{
        var contact=store.getContact(id);
        return !!contact && contact.id===id && !contact.deletedAt && store.canAccessContact(id)===true;
      }catch(ignore){return false;}
    }
    function identityWriteGuard(contactId,documentType,details){
      if(['identity','ineFront','ineBack','selfieVideo','idFront','idBack','selfie'].indexOf(documentType)<0)return;
      if(!scoped)throw problem('HOLDER_UPLOAD_REQUIRED','La identidad requiere la sesión del cliente y su expediente exacto.');
      var contact=store.getContact(contactId);if(contact&&contact.type==='doctor')return;
      if(!contact||contact.type!=='patient'||actor.role!=='holder'||contact.holderId!==actor.id||contact.accountId!==actor.id)throw problem('HOLDER_UPLOAD_REQUIRED','La INE y selfie deben ser cargadas personalmente por el cliente.');
      var snapshot=store.snapshot(),matches=Object.values(snapshot.expedients||{}).filter(function(exp){return exp.contactId===contactId&&exp.kind==='patient'&&(!details.expedientId||exp.id===details.expedientId);});
      if(matches.length!==1||!matches[0].holderIdentity||matches[0].holderIdentity.id!==actor.id)throw problem('HOLDER_UPLOAD_REQUIRED','Abre el expediente exacto del titular para cargar su identidad.');
      var exp=matches[0],actions=exp.holderActions||{},locked=exp.submittedAt||exp.submissionSnapshot||exp.demoBridgeCaseId||exp.status==='submitted'||exp.status==='approved'||exp.status==='needs_correction'||actions.finalConfirmation||actions.offerAcceptance||actions.contractSignature||exp.offerAccepted||exp.contractSigned;
      if(locked){
        var review=exp.documentCorrectionReview,draft=exp.documentCorrectionDraft,source=review&&(exp.documents||[]).find(function(d){return d.id===review.docId||d.evidenceId===review.docId||review.activeDocument&&d.id===review.activeDocument.sourceDocumentId;}),type=source&&(source.onboardingPath||'').split('.')[1]||review&&review.documentType||source&&source.label||review&&review.docId;
        if(!review||review.status!=='requested'||review.financialLocked||!draft||draft.requestId!==review.requestId||exp.documentCorrectionSubmissions&&exp.documentCorrectionSubmissions[review.requestId]||actions.offerAcceptance||actions.contractSignature||exp.offerAccepted||exp.contractSigned||type!==documentType)throw problem('SUBMITTED_LOCK','La identidad revisada sólo admite el reemplazo exacto observado.');
      }
    }
    function openDatabase() {
      if (opening) return opening;
      if (!factory || typeof factory.open !== 'function') return Promise.reject(problem('STORAGE_UNAVAILABLE','Este navegador no permite guardar evidencias DEMO con IndexedDB.'));
      var pending=new Promise(function(resolve,reject){
        var request, settled=false;
        function fail(error){if(!settled){settled=true;reject(error);}}
        try { request=factory.open(DB_NAME,1); } catch(error){fail(storageProblem(error));return;}
        request.onupgradeneeded=function(){
          try {
            var db=request.result;
            if(!db.objectStoreNames.contains('metadata'))db.createObjectStore('metadata',{keyPath:'id'});
            if(!db.objectStoreNames.contains('files'))db.createObjectStore('files',{keyPath:'id'});
          } catch(error){fail(storageProblem(error));try{request.transaction.abort();}catch(ignore){}}
        };
        request.onerror=function(){fail(storageProblem(request.error));};
        request.onblocked=function(){fail(problem('STORAGE_BLOCKED','Otra pestaña impide abrir las evidencias DEMO. Cierra esa pestaña e intenta de nuevo.'));};
        request.onsuccess=function(){
          var db=request.result;
          if(settled){db.close();return;}
          settled=true;db.onversionchange=function(){db.close();opening=null;};resolve(db);
        };
      });
      opening=pending;
      pending.catch(function(){if(opening===pending)opening=null;});
      return pending;
    }
    async function transact(mode, work, guard) {
      var db=await openDatabase();
      if(guard)guard();
      return new Promise(function(resolve,reject){
        var tx, value, failure=null;
        try { tx=db.transaction(['metadata','files'],mode); } catch(error){reject(storageProblem(error));return;}
        function abort(error){
          if(!failure)failure=storageProblem(error);
          try{tx.abort();}catch(ignore){reject(failure);}
        }
        function request(req, success){
          req.onerror=function(){abort(req.error);};
          req.onsuccess=function(){try{if(guard)guard();success(req.result);if(guard)guard();}catch(error){abort(error);}};
        }
        tx.oncomplete=function(){if(failure)reject(failure);else resolve(value);};
        tx.onabort=function(){reject(failure || storageProblem(tx.error));};
        tx.onerror=function(){if(!failure)failure=storageProblem(tx.error);};
        try{work(tx.objectStore('metadata'),tx.objectStore('files'),request,function(next){value=next;},abort);}catch(error){abort(error);}
      });
    }
    async function discardOwnUpload(meta,canDiscard) {
      // Cleanup can outlive the original actor. It is bounded to this instance's
      // exact new row, and the caller rechecks canonical references on every
      // asynchronous boundary. Never route revoked cleanup through public remove.
      var removedMeta=null,removedFile=null;
      var guard=canDiscard?function(){if(canDiscard()!==true)throw problem('EVIDENCE_LINKED','El archivo ya está vinculado a un expediente; no se puede descartar.');}:null;
      var removed=await transact('readwrite',function(metadata,files,request,set){
        request(metadata.get(meta.id),function(row){
          if(!row || JSON.stringify(metadataOnly(row))!==JSON.stringify(meta)){set(false);return;}
          request(files.get(meta.id),function(record){
            removedMeta=row;removedFile=record;
            request(files.delete(meta.id),function(){});
            request(metadata.delete(meta.id),function(){set(true);});
          });
        });
      },guard);
      try{if(guard)guard();}catch(error){
        if(removed&&removedMeta)try{await restoreOwnRemoval(removedMeta,removedFile);}catch(rollback){error.cleanupError=storageProblem(rollback);error.message+=' No se pudo restaurar el archivo local.';}
        throw error;
      }
      return removed;
    }
    async function restoreOwnRemoval(meta, record) {
      // If revocation wins the completion race, restore only the rows this
      // operation removed. Never overwrite a newer row with a reused identifier.
      await transact('readwrite',function(metadata,files,request){
        request(metadata.get(meta.id),function(currentMeta){
          request(files.get(meta.id),function(currentFile){
            if(currentMeta || currentFile)return;
            if(record)request(files.add(record),function(){});
            request(metadata.add(meta),function(){});
          });
        });
      });
    }
    return Object.freeze({
      put:async function(file, details){
        details=Object.assign({},details || {});
        var contactId=cleanId(details.contactId,'contacto'),sessionCheck=sessionGuard(true,contactId),guard=function(){sessionCheck();identityWriteGuard(contactId,details.documentType,details);};
        guard();
        var actorId=scoped ? actor.id : cleanId(details.actorId,'actor'),activityId=cleanId(details.activityId,'actividad',true),documentType=cleanId(details.documentType,'tipo de documento',true);
        if(scoped && details.actorId!==undefined && cleanId(details.actorId,'actor')!==actor.id)throw problem('FORBIDDEN','La autoría de la evidencia debe coincidir con la identidad actual.');
        var verified=await validatedFile(file),mimeType=verified.mimeType, instant=new Date(now());
        guard();
        if(!Number.isFinite(instant.getTime()))throw problem('INVALID_METADATA','No se pudo determinar la hora de carga.');
        var id=cleanId(randomId(),'evidencia');
        var name=String(file.name || 'evidencia').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,180) || 'evidencia';
        var meta=metadataOnly({id:id,name:name,mimeType:mimeType,size:file.size,uploadedAt:instant.toISOString(),actorId:actorId,contactId:contactId,activityId:activityId,documentType:documentType});
        // Persist the exact validated bytes, not a File-backed slice whose
        // backing resource can become unreadable after IndexedDB round-trip.
        var bytes=verified.bytes.slice().buffer;
        var saved=await transact('readwrite',function(metadata,files,request,set){
          request(metadata.getAll(),function(rows){
            var total=rows.reduce(function(sum,row){if(!Number.isSafeInteger(row.size)||row.size<0)throw problem('STORAGE_CORRUPT','Los metadatos locales de evidencia están dañados.');return sum+row.size;},0);
            if(rows.length>=MAX_FILES)throw problem('FILE_COUNT_LIMIT','El DEMO permite hasta 200 evidencias en este navegador.');
            if(total+file.size>MAX_TOTAL_BYTES)throw problem('TOTAL_QUOTA','Las evidencias DEMO pueden ocupar hasta 25 MiB en total.');
            request(files.add({id:id,bytes:bytes}),function(){});
            request(metadata.add(meta),function(){set(meta);});
          });
        },guard);
        try{guard();}catch(error){
          try{await discardOwnUpload(meta);}catch(cleanup){error.cleanupError=storageProblem(cleanup);error.message+=' No se pudo limpiar el archivo local huérfano.';}
          throw error;
        }
        ownUploads.set(meta.id,meta);return saved;
      },
      discardUncommitted:async function(meta,canDiscard){
        var own=meta&&ownUploads.get(meta.id);
        if(!own||JSON.stringify(metadataOnly(meta))!==JSON.stringify(own))throw problem('UNOWNED_UPLOAD','Sólo se puede descartar una carga nueva de esta misma operación.');
        if(typeof canDiscard!=='function')throw problem('EVIDENCE_LINKED','No se pudo comprobar que el archivo sigue sin vincularse.');
        var removed=await discardOwnUpload(own,canDiscard);ownUploads.delete(own.id);return removed;
      },
      get:async function(id){
        id=cleanId(id,'evidencia');
        var contactId=null,guard=sessionGuard(false,function(){return contactId;});
        guard();
        var saved=await transact('readonly',function(metadata,files,request,set){
          request(metadata.get(id),function(meta){
            if(!meta){set(null);return;}
            contactId=cleanId(meta.contactId,'contacto');guard();
            request(files.get(id),function(record){
              if(!record || meta.size<=0 || meta.size>MAX_FILE_BYTES || !TYPES[meta.mimeType])throw problem('STORAGE_CORRUPT','No se encontró el archivo completo de esta evidencia DEMO.');
              var blob;
              if(Object.prototype.hasOwnProperty.call(record,'bytes')){
                if(Object.prototype.toString.call(record.bytes)!=='[object ArrayBuffer]' || record.bytes.byteLength!==meta.size)throw problem('STORAGE_CORRUPT','Los bytes guardados de esta evidencia DEMO están incompletos.');
                blob=new Blob([record.bytes],{type:meta.mimeType});
              }else{
                // Read old records in place. A failed legacy read never deletes
                // or rewrites the original evidence.
                blob=record.blob;
              }
              if(!blob || typeof blob.slice!=='function' || blob.size!==meta.size || blob.type!==meta.mimeType)throw problem('STORAGE_CORRUPT','No se encontró el archivo completo de esta evidencia DEMO.');
              set(Object.freeze(Object.assign({},metadataOnly(meta),{blob:blob})));
            });
          });
        },guard);
        guard();return saved;
      },
      remove:async function(id){
        id=cleanId(id,'evidencia');
        var contactId=null,removedMeta=null,removedFile=null,guard=sessionGuard(true,function(){return contactId;});
        guard();
        var removed=await transact('readwrite',function(metadata,files,request,set){
          request(metadata.get(id),function(meta){
            // Unknown rows grant no authority to delete a possibly orphaned blob.
            if(!meta && scoped){set(false);return;}
            if(meta){contactId=cleanId(meta.contactId,'contacto');guard();if(['identity','ineFront','ineBack','selfieVideo','idFront','idBack','selfie'].indexOf(meta.documentType)>=0){
              identityWriteGuard(contactId,meta.documentType,{});
              if(scoped&&store.getContact(contactId).type==='patient'){
                var linked=false;function scan(value){if(!value||linked)return;if(typeof value==='string'){if(value.charAt(0)==='{')try{scan(JSON.parse(value));}catch(ignore){}return;}if(typeof value!=='object')return;if(value.evidenceId===id||value.id===id&&value.actorId){linked=true;return;}Object.keys(value).forEach(function(k){scan(value[k]);});}scan(store.snapshot().expedients);if(linked)throw problem('EVIDENCE_LINKED','Las cargas de identidad vinculadas y su historial se conservan.');
              }
            }}
            function erase(){
              request(files.delete(id),function(){});
              request(metadata.delete(id),function(){set(Boolean(meta));});
            }
            if(scoped){removedMeta=meta;request(files.get(id),function(record){removedFile=record;erase();});}
            else erase();
          });
        },guard);
        try{guard();}catch(error){
          if(removed && removedMeta)try{await restoreOwnRemoval(removedMeta,removedFile);}catch(rollback){error.cleanupError=storageProblem(rollback);error.message+=' No se pudo restaurar el archivo local.';}
          throw error;
        }
        if(removed)ownUploads.delete(id);return removed;
      },
      list:async function(filters){
        filters=filters || {};
        var fields=['contactId','activityId','actorId'],query={};
        fields.forEach(function(key){if(filters[key]!==undefined)query[key]=cleanId(filters[key],key);});
        var guard=sessionGuard(false,query.contactId);guard();
        function visible(row){return canReadContact(row.contactId) && fields.every(function(key){return query[key]===undefined || row[key]===query[key];});}
        var rows=await transact('readonly',function(metadata,files,request,set){
          request(metadata.getAll(),function(rows){
            set(rows.filter(visible).sort(function(a,b){return a.uploadedAt.localeCompare(b.uploadedAt)||a.id.localeCompare(b.id);}).map(metadataOnly));
          });
        },guard);
        guard();return rows.filter(visible);
      },
      close:async function(){epoch++;if(scoped)closed=true;if(opening){var db=await opening;db.close();opening=null;}}
    });
  }
  return Object.freeze({renderPDFFrame:renderPDFFrame,createEvidenceStore:createEvidenceStore,validateBlob:validateFile,MAX_FILE_BYTES:MAX_FILE_BYTES,MAX_TOTAL_BYTES:MAX_TOTAL_BYTES,MAX_FILES:MAX_FILES,DB_NAME:DB_NAME,SUPPORTED_MIME_TYPES:Object.freeze(Object.keys(TYPES))});
}));
