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
  var MAX_FILE_BYTES = 5 * 1024 * 1024;
  var MAX_TOTAL_BYTES = 25 * 1024 * 1024;
  var MAX_FILES = 200;
  var DB_NAME = 'pulzzo-crm-evidence-demo-v1';
  var TYPES = Object.freeze({
    'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp',
    'application/pdf': 'pdf', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3',
    'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
    'audio/ogg': 'ogg', 'application/ogg': 'ogg',
    'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a'
  });
  var CANONICAL = {png:'image/png',jpeg:'image/jpeg',webp:'image/webp',pdf:'application/pdf',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',m4a:'audio/mp4'};
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
    if (ascii(bytes,0,5) === '%PDF-') return 'pdf';
    if (ascii(bytes,0,4) === 'RIFF' && ascii(bytes,8,4) === 'WAVE') return 'wav';
    if (ascii(bytes,0,4) === 'OggS') return 'ogg';
    if (ascii(bytes,4,4) === 'ftyp') return 'm4a';
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
  function mp4AudioTracks(bytes, from, to, depth, tracks) {
    if(depth>5)return false;
    var p=from;
    while(p+8<=to){
      var size=u32be(bytes,p),box=ascii(bytes,p+4,4);
      if(size<8 || size>to-p)return false;
      if(box==='hdlr'){
        if(size<32)return false;
        var handler=ascii(bytes,p+16,4);
        if(handler==='soun')tracks.audio=true;
        if(handler==='vide')tracks.video=true;
      }
      if(['moov','trak','mdia'].indexOf(box)>=0 && !mp4AudioTracks(bytes,p+8,p+size,depth+1,tracks))return false;
      p+=size;
    }
    return p===to;
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
    if (format === 'm4a') {
      var cursor=0, fileType=false, moov=false, mdat=false, tracks={audio:false,video:false};
      while (cursor + 8 <= bytes.length) {
        var boxSize=u32be(bytes,cursor), box=ascii(bytes,cursor+4,4);
        // Extended-size/streaming containers are intentionally outside this small-file demo.
        if (boxSize < 8 || boxSize > bytes.length-cursor) return false;
        if (cursor === 0) {
          if (box !== 'ftyp' || boxSize < 16) return false;
          var brands=ascii(bytes,cursor+8,boxSize-8);
          fileType=/M4A |M4B |isom|mp42/.test(brands);
        }
        if (box === 'moov' && boxSize > 8) moov=mp4AudioTracks(bytes,cursor+8,cursor+boxSize,0,tracks);
        if (box === 'mdat' && boxSize > 8) mdat=true;
        cursor += boxSize;
      }
      return cursor===bytes.length && fileType && moov && mdat && tracks.audio && !tracks.video;
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
  async function validateFile(file) {
    if (!file || typeof file.slice !== 'function' || typeof file.arrayBuffer !== 'function' || !Number.isSafeInteger(file.size) || file.size <= 0) throw problem('INVALID_FILE','Selecciona un archivo con contenido.');
    if (file.size > MAX_FILE_BYTES) throw problem('FILE_TOO_LARGE','Cada evidencia DEMO puede pesar hasta 5 MiB.');
    var mime = String(file.type || '').toLowerCase().split(';')[0].trim(), format=TYPES[mime];
    if (!format) throw problem('UNSUPPORTED_TYPE','Formato no admitido. Usa PNG, JPG, WebP, PDF, MP3, WAV, OGG o M4A.');
    var bytes;
    try { bytes = new Uint8Array(await file.arrayBuffer()); } catch (error) { throw problem('FILE_READ_FAILED','No se pudo leer el archivo seleccionado.',error); }
    if (bytes.length !== file.size) throw problem('TRUNCATED_FILE','El archivo está incompleto o cambió durante la lectura.');
    var detected=detectedType(bytes);
    if (detected && detected !== format) throw problem('TYPE_MISMATCH','El contenido del archivo no coincide con su formato declarado.');
    if (!detected || !validContainer(bytes,format)) throw problem('INVALID_CONTENT','El archivo está vacío, incompleto o no tiene un formato admitido reconocible.');
    return CANONICAL[format];
  }
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
    var now=options.now || function(){return new Date();}, randomId=options.randomId || randomIdentifier, opening=null;
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
    async function transact(mode, work) {
      var db=await openDatabase();
      return new Promise(function(resolve,reject){
        var tx, value, failure=null;
        try { tx=db.transaction(['metadata','files'],mode); } catch(error){reject(storageProblem(error));return;}
        function abort(error){
          if(!failure)failure=storageProblem(error);
          try{tx.abort();}catch(ignore){reject(failure);}
        }
        function request(req, success){
          req.onerror=function(){abort(req.error);};
          req.onsuccess=function(){try{success(req.result);}catch(error){abort(error);}};
        }
        tx.oncomplete=function(){if(failure)reject(failure);else resolve(value);};
        tx.onabort=function(){reject(failure || storageProblem(tx.error));};
        tx.onerror=function(){if(!failure)failure=storageProblem(tx.error);};
        try{work(tx.objectStore('metadata'),tx.objectStore('files'),request,function(next){value=next;},abort);}catch(error){abort(error);}
      });
    }
    return Object.freeze({
      put:async function(file, details){
        details=details || {};
        var actorId=cleanId(details.actorId,'actor'),contactId=cleanId(details.contactId,'contacto'),activityId=cleanId(details.activityId,'actividad',true),documentType=cleanId(details.documentType,'tipo de documento',true);
        var mimeType=await validateFile(file), instant=new Date(now());
        if(!Number.isFinite(instant.getTime()))throw problem('INVALID_METADATA','No se pudo determinar la hora de carga.');
        var id=cleanId(randomId(),'evidencia');
        var name=String(file.name || 'evidencia').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,180) || 'evidencia';
        var meta=metadataOnly({id:id,name:name,mimeType:mimeType,size:file.size,uploadedAt:instant.toISOString(),actorId:actorId,contactId:contactId,activityId:activityId,documentType:documentType});
        // Store a Blob with the verified MIME type, never a data URL or base64 string.
        var blob=file.slice(0,file.size,mimeType);
        return transact('readwrite',function(metadata,files,request,set){
          request(metadata.getAll(),function(rows){
            var total=rows.reduce(function(sum,row){if(!Number.isSafeInteger(row.size)||row.size<0)throw problem('STORAGE_CORRUPT','Los metadatos locales de evidencia están dañados.');return sum+row.size;},0);
            if(rows.length>=MAX_FILES)throw problem('FILE_COUNT_LIMIT','El DEMO permite hasta 200 evidencias en este navegador.');
            if(total+file.size>MAX_TOTAL_BYTES)throw problem('TOTAL_QUOTA','Las evidencias DEMO pueden ocupar hasta 25 MiB en total.');
            request(files.add({id:id,blob:blob}),function(){});
            request(metadata.add(meta),function(){set(meta);});
          });
        });
      },
      get:async function(id){
        id=cleanId(id,'evidencia');
        return transact('readonly',function(metadata,files,request,set){
          request(metadata.get(id),function(meta){
            if(!meta){set(null);return;}
            request(files.get(id),function(record){
              if(!record || !record.blob || typeof record.blob.arrayBuffer!=='function' || record.blob.size!==meta.size || meta.size<=0 || meta.size>MAX_FILE_BYTES || !TYPES[meta.mimeType] || record.blob.type!==meta.mimeType)throw problem('STORAGE_CORRUPT','No se encontró el archivo completo de esta evidencia DEMO.');
              set(Object.freeze(Object.assign({},metadataOnly(meta),{blob:record.blob})));
            });
          });
        });
      },
      remove:async function(id){
        id=cleanId(id,'evidencia');
        return transact('readwrite',function(metadata,files,request,set){
          request(metadata.get(id),function(meta){
            request(files.delete(id),function(){});
            request(metadata.delete(id),function(){set(Boolean(meta));});
          });
        });
      },
      list:async function(filters){
        filters=filters || {};
        var fields=['contactId','activityId','actorId'];
        fields.forEach(function(key){if(filters[key]!==undefined)cleanId(filters[key],key);});
        return transact('readonly',function(metadata,files,request,set){
          request(metadata.getAll(),function(rows){
            set(rows.filter(function(row){return fields.every(function(key){return filters[key]===undefined || row[key]===filters[key];});}).sort(function(a,b){return a.uploadedAt.localeCompare(b.uploadedAt)||a.id.localeCompare(b.id);}).map(metadataOnly));
          });
        });
      },
      close:async function(){if(opening){var db=await opening;db.close();opening=null;}}
    });
  }
  return Object.freeze({createEvidenceStore:createEvidenceStore,validateBlob:validateFile,MAX_FILE_BYTES:MAX_FILE_BYTES,MAX_TOTAL_BYTES:MAX_TOTAL_BYTES,MAX_FILES:MAX_FILES,DB_NAME:DB_NAME,SUPPORTED_MIME_TYPES:Object.freeze(Object.keys(TYPES))});
}));
