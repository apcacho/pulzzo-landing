/* Pulzzo public medical directory DEMO. All data stays in this browser.
 * Role checks, checksums and optimistic revisions prevent accidental cross-account
 * edits; they are not authentication or authorization for a production service.
 * Each mutation is one localStorage write. Web Storage has no cross-tab CAS.
 * No network request, operational/financial mutation, or real publication occurs.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PulzzoDoctorPublication = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null, function (root) {
  'use strict';
  const STORAGE_KEY = 'pulzzo_doctor_publication_demo_v1';
  const VERSION = 1;
  const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
  const PUBLIC_FIELDS = Object.freeze(['displayName', 'specialty', 'city', 'state', 'clinicName', 'bio', 'phone', 'whatsapp', 'website', 'services', 'links', 'photo']);
  const LINK_FIELDS = Object.freeze(['website', 'instagram', 'facebook', 'doctoralia', 'linkedin', 'other']);
  const STATUSES = ['draft', 'confirmed', 'approved', 'correction', 'rejected', 'published'];
  const plain = x => !!x && typeof x === 'object' && !Array.isArray(x) && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const clone = x => JSON.parse(JSON.stringify(x));
  const isId = x => typeof x === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,179}$/.test(x) && !['__proto__', 'constructor', 'prototype'].includes(x);
  const validDate = x => typeof x === 'string' && Number.isFinite(Date.parse(x));
  function fail(code, message) { const e = new Error(message); e.code = code; throw e; }
  function text(x, max, required) {
    if (typeof x !== 'string') fail('invalid_field', 'Los campos públicos deben ser texto.');
    const out = x.trim();
    if ((required && !out) || out.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(out)) fail('invalid_field', 'Revisa los campos públicos y su longitud.');
    return out;
  }
  function canonical(x) {
    if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
    if (plain(x)) return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
    return JSON.stringify(x);
  }
  // Integrity checksum, not a signature or a production security boundary.
  function checksum(x) {
    const s = canonical(x); let a = 2166136261, b = 2246822507, c = 3266489909, d = 668265263;
    for (let i = 0; i < s.length; i++) { const n = s.charCodeAt(i); a = Math.imul(a ^ n, 16777619); b = Math.imul(b ^ n, 2246822519); c = Math.imul(c ^ n, 3266489917); d = Math.imul(d ^ n, 668265263); }
    return [a, b, c, d].map(n => (n >>> 0).toString(16).padStart(8, '0')).join('');
  }
  const equal = (a, b) => canonical(a) === canonical(b);
  function url(x) {
    const value = text(x, 2000, false);
    if (!value) return '';
    let u; try { u = new URL(value); } catch (_) { fail('invalid_url', 'Usa un enlace completo http:// o https://.'); }
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || /\s/.test(value)) fail('invalid_url', 'Los enlaces públicos sólo admiten HTTP o HTTPS sin credenciales.');
    return u.href;
  }
  function binary(data) {
    try {
      if (root && typeof root.atob === 'function') return Uint8Array.from(root.atob(data), c => c.charCodeAt(0));
      if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(data, 'base64'));
    } catch (_) {}
    fail('invalid_photo', 'No se pudo leer el archivo de la fotografía.');
  }
  const ascii = (b, start, length) => Array.from(b.slice(start, start + length), n => String.fromCharCode(n)).join('');
  const be32 = (b, p) => (b[p] * 16777216 + b[p + 1] * 65536 + b[p + 2] * 256 + b[p + 3]) >>> 0;
  const le32 = (b, p) => (b[p] + b[p + 1] * 256 + b[p + 2] * 65536 + b[p + 3] * 16777216) >>> 0;
  const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1; return c >>> 0; });
  function crc32(bytes, start, end) { let c = 0xffffffff; for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ c >>> 8; return (c ^ 0xffffffff) >>> 0; }
  function imageType(b) {
    // Structural/container validation, including PNG CRCs. This is not a full
    // pixel decoder; browser UIs must additionally await Image decoding.
    if (b.length >= 45 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v)) {
      let p = 8, first = true, pixels = false, ended = false;
      while (p + 12 <= b.length) {
        const size = be32(b, p), type = ascii(b, p + 4, 4);
        if (size > b.length - p - 12 || !/^[A-Za-z]{4}$/.test(type) || crc32(b, p + 4, p + 8 + size) !== be32(b, p + 8 + size)) return null;
        if (first && (type !== 'IHDR' || size !== 13 || !be32(b, p + 8) || !be32(b, p + 12))) return null;
        if (first) { const allowedDepths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }; if (!allowedDepths[b[p + 17]]?.includes(b[p + 16]) || b[p + 18] !== 0 || b[p + 19] !== 0 || b[p + 20] > 1 || be32(b, p + 8) > 0x7fffffff || be32(b, p + 12) > 0x7fffffff) return null; }
        else if (type === 'IHDR') return null;
        first = false;
        if (type === 'IDAT' && size > 0) pixels = true;
        p += 12 + size;
        if (type === 'IEND') { ended = size === 0 && p === b.length; break; }
      }
      return ended && pixels ? 'image/png' : null;
    }
    if (b.length >= 14 && ['GIF87a', 'GIF89a'].includes(ascii(b, 0, 6))) {
      if (!(b[6] + b[7] * 256) || !(b[8] + b[9] * 256) || b[b.length - 1] !== 0x3b) return null;
      // A GIF must include an image descriptor, not just its six-byte signature.
      let p = 13 + (b[10] & 128 ? 3 * (1 << ((b[10] & 7) + 1)) : 0), image = false;
      while (p < b.length - 1) {
        const marker = b[p++];
        if (marker === 0x21) { if (p >= b.length) return null; p++; }
        else if (marker === 0x2c) {
          if (p + 10 > b.length || !(b[p + 4] + b[p + 5] * 256) || !(b[p + 6] + b[p + 7] * 256)) return null;
          const packed = b[p + 8]; p += 9 + (packed & 128 ? 3 * (1 << ((packed & 7) + 1)) : 0);
          if (p >= b.length || b[p] < 2 || b[p] > 8) return null;
          p++; image = true;
        } else return null;
        let terminated = false;
        while (p < b.length) { const n = b[p++]; if (!n) { terminated = true; break; } if (p + n > b.length) return null; p += n; }
        if (!terminated) return null;
      }
      return image && p === b.length - 1 ? 'image/gif' : null;
    }
    if (b.length >= 26 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP' && le32(b, 4) + 8 === b.length) {
      let p = 12, image = false;
      while (p + 8 <= b.length) {
        const type = ascii(b, p, 4), length = le32(b, p + 4), body = p + 8;
        if (length > b.length - body) return null;
        if (type === 'VP8 ' && length >= 10 && b[body + 3] === 157 && b[body + 4] === 1 && b[body + 5] === 42 && (b[body + 6] + b[body + 7] * 256 & 16383) && (b[body + 8] + b[body + 9] * 256 & 16383)) image = true;
        if (type === 'VP8L' && length >= 5 && b[body] === 47) image = true;
        if (type === 'ANMF' && length >= 24) image = true;
        p = body + length + (length % 2);
      }
      return image && p === b.length ? 'image/webp' : null;
    }
    if (b.length >= 20 && b[0] === 255 && b[1] === 216 && b[b.length - 2] === 255 && b[b.length - 1] === 217) {
      let p = 2, dimensions = false;
      while (p + 4 <= b.length) {
        if (b[p++] !== 255) return null;
        while (b[p] === 255) p++;
        const marker = b[p++];
        if (marker === 0xda) return dimensions ? 'image/jpeg' : null;
        if (marker === 0xd9 || marker === 0 || marker === 0xd8) return null;
        if (marker >= 0xd0 && marker <= 0xd7 || marker === 1) continue;
        const length = b[p] * 256 + b[p + 1];
        if (length < 2 || p + length > b.length - 2) return null;
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
          if (length < 8 || !(b[p + 3] * 256 + b[p + 4]) || !(b[p + 5] * 256 + b[p + 6])) return null;
          dimensions = true;
        }
        p += length;
      }
    }
    return null;
  }
  function validatePhoto(photo) {
    if (photo === null || photo === undefined || photo === '') return null;
    if (!plain(photo) || Object.keys(photo).some(k => !['dataUrl', 'type', 'size', 'name'].includes(k)) || typeof photo.dataUrl !== 'string') fail('invalid_photo', 'Selecciona un archivo PNG, JPEG, WebP o GIF.');
    const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(photo.dataUrl);
    if (!match || match[2].length % 4 !== 0) fail('invalid_photo', 'El formato de la fotografía no es válido.');
    const size = match[2].length / 4 * 3 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
    if (size > MAX_PHOTO_BYTES) fail('photo_too_large', 'La fotografía debe pesar como máximo 5 MiB.');
    if (size <= 0 || photo.size !== undefined && photo.size !== size || photo.type !== undefined && photo.type !== match[1]) fail('invalid_photo', 'El tamaño o tipo no coincide con el archivo de la fotografía.');
    const bytes = binary(match[2]), detected = imageType(bytes);
    if (bytes.length !== size || detected !== match[1]) fail('invalid_photo', 'El contenido del archivo no corresponde a una imagen válida del tipo indicado.');
    return { dataUrl: 'data:' + detected + ';base64,' + match[2], type: detected, size, name: photo.name === undefined ? '' : text(photo.name, 160, false) };
  }
  function normalizeFields(input) {
    if (!plain(input) || Object.keys(input).some(k => !PUBLIC_FIELDS.includes(k))) fail('private_field', 'El perfil público sólo admite los campos públicos autorizados.');
    const out = {};
    const limits = { displayName: 160, specialty: 160, city: 100, state: 100, clinicName: 180, bio: 4000, phone: 40, whatsapp: 40 };
    for (const [key, max] of Object.entries(limits)) out[key] = text(input[key] === undefined ? '' : input[key], max, false);
    for (const key of ['phone', 'whatsapp']) if (out[key] && !/^[+\d\s().-]+$/.test(out[key])) fail('invalid_phone', 'Revisa el teléfono público.');
    out.website = url(input.website === undefined ? '' : input.website);
    const services = input.services === undefined ? [] : input.services;
    if (!Array.isArray(services) || services.length > 40) fail('invalid_field', 'Agrega hasta 40 servicios públicos.');
    out.services = [...new Set(services.map(s => text(s, 160, true)))];
    const links = input.links === undefined ? {} : input.links;
    if (!plain(links) || Object.keys(links).some(k => !LINK_FIELDS.includes(k))) fail('invalid_url', 'El perfil contiene un tipo de enlace no autorizado.');
    out.links = {};
    for (const key of LINK_FIELDS) if (own(links, key)) out.links[key] = url(links[key]);
    out.photo = validatePhoto(input.photo);
    return out;
  }
  function requireComplete(fields) {
    if (['displayName', 'specialty', 'city', 'state'].some(k => !fields[k])) fail('incomplete_profile', 'Completa nombre público, especialidad, ciudad y estado antes de confirmar.');
  }
  const contentFingerprint = (profile, version) => checksum({ providerId: profile.providerId, accountId: profile.accountId, versionId: version.id, number: version.number, fields: version.fields });
  function initial() { return { version: VERSION, demo: true, revision: 0, updatedAt: null, profiles: {} }; }
  function proofValid(proof, profile, version, role) {
    return plain(proof) && isId(proof.actorId) && proof.actorRole === role && validDate(proof.at) && proof.versionId === version.id && proof.contentFingerprint === version.contentFingerprint && (role !== 'holder' || proof.actorId === profile.accountId);
  }
  function assertState(state) {
    if (!plain(state) || state.version !== VERSION || state.demo !== true || !Number.isSafeInteger(state.revision) || state.revision < 0 || !plain(state.profiles)) fail('invalid_storage', 'Los perfiles públicos locales no son válidos. No se sobrescribieron.');
    for (const [id, p] of Object.entries(state.profiles)) {
      if (!isId(id) || !plain(p) || p.providerId !== id || !isId(p.accountId) || p.contactId !== null && !isId(p.contactId) || !Array.isArray(p.versions) || !p.versions.length || p.currentVersionId !== p.versions[p.versions.length - 1].id) fail('invalid_storage', 'La identidad del perfil público no es válida.');
      const seen = new Set();
      for (const [index, v] of p.versions.entries()) {
        if (!plain(v) || !isId(v.id) || seen.has(v.id) || v.number !== index + 1 || !STATUSES.includes(v.status) || !validDate(v.createdAt) || !isId(v.createdBy) || !['kam', 'holder', 'admin'].includes(v.createdRole) || !equal(normalizeFields(v.fields), v.fields) || v.contentFingerprint !== contentFingerprint(p, v)) fail('invalid_storage', 'Una versión pública fue modificada o no se puede validar.');
        seen.add(v.id);
        const expectedHistory = [{ type: 'draft', actorId: v.createdBy, actorRole: v.createdRole, at: v.createdAt, versionId: v.id, contentFingerprint: v.contentFingerprint }];
        if (v.consent) expectedHistory.push(Object.assign({ type: 'confirm' }, ...['actorId', 'actorRole', 'at', 'versionId', 'contentFingerprint'].map(k => ({ [k]: v.consent[k] }))));
        if (v.review) expectedHistory.push(Object.assign({ type: 'review' }, ...['actorId', 'actorRole', 'at', 'versionId', 'contentFingerprint', 'decision', 'reason'].map(k => ({ [k]: v.review[k] }))));
        if (v.publication) expectedHistory.push(Object.assign({ type: 'publish' }, v.publication));
        if (!equal(v.history, expectedHistory)) fail('invalid_storage', 'El historial de la versión pública no coincide con sus acciones.');
        if (v.status === 'draft') { if (v.consent || v.review || v.publishedAt || v.publication) fail('invalid_storage', 'Un borrador no puede contener autorizaciones.'); }
        else {
          requireComplete(v.fields);
          if (!proofValid(v.consent, p, v, 'holder') || v.consent.confirmed !== true || v.consent.scope !== 'public_directory') fail('invalid_storage', 'Falta el consentimiento del titular para esta versión exacta.');
          if (v.status === 'confirmed') { if (v.review) fail('invalid_storage', 'La confirmación contiene una revisión inválida.'); }
          else if (!proofValid(v.review, p, v, 'admin') || v.review.decision !== ({ approved: 'approve', published: 'approve', correction: 'correction', rejected: 'reject' })[v.status] || typeof v.review.reason !== 'string' || ['correction', 'rejected'].includes(v.status) && !v.review.reason.trim()) fail('invalid_storage', 'La revisión no corresponde a esta versión.');
          if (v.status === 'published') {
            if (!proofValid(v.publication, p, v, 'admin') || v.publishedAt !== v.publication.at) fail('invalid_storage', 'La publicación explícita no es válida.');
          } else if (v.publishedAt || v.publication) fail('invalid_storage', 'Una versión no publicada contiene datos de publicación.');
        }
      }
      if (p.publishedVersionId !== null && !p.versions.some(v => v.id === p.publishedVersionId && v.status === 'published')) fail('invalid_storage', 'La versión publicada no existe o no está aprobada.');
      const published = p.versions.filter(v => v.status === 'published');
      if ((published.length ? published[published.length - 1].id : null) !== p.publishedVersionId) fail('invalid_storage', 'La referencia pública no corresponde a la última publicación explícita.');
    }
    const accounts = Object.values(state.profiles).map(p => p.accountId);
    if (new Set(accounts).size !== accounts.length) fail('invalid_storage', 'Una cuenta no puede estar vinculada con perfiles públicos duplicados.');
    return state;
  }
  function createStore(options) {
    options = options || {};
    let storage = options.storage;
    if (!storage && root) { try { storage = root.localStorage; } catch (_) {} }
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') fail('storage_unavailable', 'El almacenamiento local no está disponible.');
    const actor = clone(options.actor || { id: 'public', role: 'public' });
    if (actor.role === 'backoffice') actor.role = 'admin';
    if (!isId(actor.id) || !['public', 'readonly', 'kam', 'holder', 'admin'].includes(actor.role)) fail('invalid_actor', 'Selecciona una identidad DEMO válida.');
    Object.freeze(actor);
    let running = false;
    function now() { const d = new Date(typeof options.now === 'function' ? options.now() : options.now || Date.now()); if (!Number.isFinite(d.getTime())) fail('invalid_date', 'La fecha del registro no es válida.'); return d.toISOString(); }
    function read() {
      let raw; try { raw = storage.getItem(STORAGE_KEY); } catch (_) { fail('storage_unavailable', 'No se pudo leer el perfil público.'); }
      if (raw === null || raw === undefined || raw === '') return { raw: raw == null ? null : raw, state: initial() };
      let state; try { state = JSON.parse(raw); } catch (_) { fail('invalid_storage', 'Los perfiles públicos locales están dañados. No se sobrescribieron.'); }
      return { raw, state: assertState(state) };
    }
    function resolve(providerId) {
      if (!isId(providerId)) fail('invalid_provider', 'El proveedor requiere un identificador estable.');
      const resolver = options.resolveProvider || (root && root.PulzzoDoctorPublicationContext && (id => root.PulzzoDoctorPublicationContext.resolveProvider(storage, id)));
      if (typeof resolver !== 'function') fail('resolver_required', 'No se pudo comprobar la identidad vigente del proveedor.');
      const p = resolver(providerId);
      if (!plain(p) || ![p.id, p.providerId].filter(Boolean).length || [p.id, p.providerId].filter(Boolean).some(id => id !== providerId)) fail('invalid_provider', 'No se encontró un proveedor vigente con ese identificador.');
      const accounts = [p.accountId, p.doctorAccountId].filter(v => v !== undefined && v !== null && v !== '');
      if (!accounts.length || accounts.some(v => !isId(v) || v !== accounts[0])) fail('identity_changed', 'La cuenta vinculada al proveedor no es válida o es ambigua.');
      const contactId = p.contactId || null, assignedKam = p.assignedKam || null;
      if (contactId !== null && !isId(contactId) || assignedKam !== null && !isId(assignedKam)) fail('identity_changed', 'El vínculo CRM del proveedor no es válido.');
      return { providerId, accountId: accounts[0], contactId, assignedKam, eligible: p.eligible === true };
    }
    function matches(p, live) { return p.accountId === live.accountId && p.contactId === live.contactId; }
    function allowed(live) { return ['admin', 'readonly'].includes(actor.role) || actor.role === 'kam' && live.assignedKam === actor.id || actor.role === 'holder' && live.accountId === actor.id; }
    function liveFor(p, strict) {
      try { const live = resolve(p.providerId); if (!matches(p, live)) fail('identity_changed', 'La identidad del proveedor cambió; vuelve a cargar antes de continuar.'); return live; }
      catch (e) { if (strict) throw e; return null; }
    }
    function project(state) {
      const out = { version: VERSION, demo: true, revision: state.revision, updatedAt: state.updatedAt, profiles: {} };
      if (actor.role === 'public') return out;
      for (const [id, p] of Object.entries(state.profiles)) { const live = liveFor(p, false); if (live && allowed(live)) out.profiles[id] = clone(p); }
      return out;
    }
    function transact(providerId, expectedRevision, fn) {
      if (['public', 'readonly'].includes(actor.role)) fail('forbidden', 'Esta vista es de sólo lectura.');
      if (running) fail('reentrant_write', 'Ya hay un cambio de perfil en curso.');
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) fail('revision_required', 'Vuelve a cargar el perfil antes de guardar.');
      running = true;
      try {
        const before = read();
        if (before.state.revision !== expectedRevision) fail('stale_revision', 'El perfil cambió en otra vista. Vuelve a cargar antes de guardar.');
        const live = resolve(providerId), previous = before.state.profiles[providerId];
        if (previous && !matches(previous, live)) fail('identity_changed', 'La identidad del proveedor cambió. No se guardaron los cambios.');
        if (!allowed(live)) fail('forbidden', 'La cuenta o asignación vigente no permite modificar este perfil.');
        if (Object.values(before.state.profiles).some(p => p.providerId !== providerId && p.accountId === live.accountId)) fail('duplicate_account', 'Esta cuenta ya tiene otro perfil público vinculado.');
        const state = clone(before.state), at = now();
        fn(state, live, at);
        state.revision++; state.updatedAt = at;
        assertState(state);
        if (!equal(resolve(providerId), live)) fail('identity_changed', 'La identidad o asignación del proveedor cambió durante la operación.');
        let current; try { current = storage.getItem(STORAGE_KEY); } catch (_) { fail('storage_unavailable', 'No se pudo comprobar el perfil antes de guardar.'); }
        if ((current == null ? null : current) !== before.raw) fail('stale_revision', 'El perfil cambió durante la operación. No se sobrescribieron los datos.');
        try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { fail('storage_write_failed', 'No se pudo guardar el perfil (almacenamiento lleno o no disponible). La versión anterior sigue intacta.'); }
        // Re-render failure must never turn a successful durable write into a retry.
        try { if (root && typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function') root.dispatchEvent(new root.CustomEvent('pulzzo:doctor-publication', { detail: { providerId, revision: state.revision } })); } catch (_) {}
        return project(state);
      } finally { running = false; }
    }
    function current(state, id, versionId) {
      const p = state.profiles[id];
      if (!p || !isId(versionId) || p.currentVersionId !== versionId) fail('stale_version', 'Selecciona la versión actual del perfil público.');
      return { p, v: p.versions.find(v => v.id === versionId) };
    }
    function audit(v, type, at, details) { v.history.push(Object.assign({ type, actorId: actor.id, actorRole: actor.role, at, versionId: v.id, contentFingerprint: v.contentFingerprint }, details || {})); }
    function proof(v, at) { return { actorId: actor.id, actorRole: actor.role, at, versionId: v.id, contentFingerprint: v.contentFingerprint }; }
    function saveDraft(providerId, fields, expectedRevision) {
      return transact(providerId, expectedRevision, (state, live, at) => {
        if (!plain(fields) || Object.keys(fields).some(k => !PUBLIC_FIELDS.includes(k))) fail('private_field', 'Sólo puedes preparar campos públicos autorizados.');
        const p = state.profiles[providerId] || { providerId, accountId: live.accountId, contactId: live.contactId, currentVersionId: null, publishedVersionId: null, versions: [] };
        const base = p.versions[p.versions.length - 1], number = p.versions.length + 1;
        const normalized = normalizeFields(Object.assign({}, base ? base.fields : {}, fields));
        const v = { id: 'pubv:' + checksum([providerId, live.accountId, number]), number, status: 'draft', fields: normalized, createdAt: at, createdBy: actor.id, createdRole: actor.role, consent: null, review: null, publication: null, publishedAt: null, history: [] };
        v.contentFingerprint = contentFingerprint(p, v);
        audit(v, 'draft', at);
        p.versions.push(v); p.currentVersionId = v.id; state.profiles[providerId] = p;
      });
    }
    function confirm(providerId, versionId, expectedRevision) {
      if (actor.role !== 'holder') fail('holder_required', 'Sólo el titular puede autorizar personalmente el contenido público de esta versión.');
      return transact(providerId, expectedRevision, (state, live, at) => {
        const { v } = current(state, providerId, versionId);
        if (v.status !== 'draft') fail('invalid_transition', 'Sólo se puede confirmar el borrador vigente.');
        requireComplete(v.fields);
        v.consent = Object.assign(proof(v, at), { confirmed: true, scope: 'public_directory' }); v.status = 'confirmed'; audit(v, 'confirm', at);
      });
    }
    function review(providerId, versionId, decision, reason, expectedRevision) {
      if (actor.role !== 'admin') fail('reviewer_required', 'Sólo backoffice puede revisar el perfil público.');
      if (!['approve', 'correction', 'reject'].includes(decision)) fail('invalid_decision', 'Selecciona aprobar, solicitar corrección o rechazar.');
      reason = text(reason === undefined || reason === null ? '' : reason, 2000, decision !== 'approve');
      return transact(providerId, expectedRevision, (state, live, at) => {
        const { v } = current(state, providerId, versionId);
        if (v.status !== 'confirmed') fail('invalid_transition', 'La revisión requiere la confirmación del titular sobre la versión vigente.');
        v.review = Object.assign(proof(v, at), { decision, reason }); v.status = { approve: 'approved', correction: 'correction', reject: 'rejected' }[decision]; audit(v, 'review', at, { decision, reason });
      });
    }
    function publish(providerId, versionId, expectedRevision) {
      if (actor.role !== 'admin') fail('reviewer_required', 'Sólo backoffice puede publicar explícitamente la versión aprobada.');
      return transact(providerId, expectedRevision, (state, live, at) => {
        const { p, v } = current(state, providerId, versionId);
        if (v.status !== 'approved') fail('invalid_transition', 'Aprueba esta versión confirmada antes de publicarla.');
        if (!live.eligible) fail('provider_not_approved', 'Primero debe aprobarse el alta del proveedor en backoffice.');
        v.publication = proof(v, at); v.publishedAt = at; v.status = 'published'; p.publishedVersionId = v.id; audit(v, 'publish', at);
      });
    }
    function publicProfiles() {
      const state = read().state, out = [];
      for (const p of Object.values(state.profiles)) {
        if (!p.publishedVersionId || !liveFor(p, false)) continue;
        const v = p.versions.find(v => v.id === p.publishedVersionId);
        // Reconstruct the allowlist; never spread provider records or version metadata.
        const fields = normalizeFields(v.fields);
        // The public image never exposes the original local filename.
        if (fields.photo) delete fields.photo.name;
        out.push(Object.assign({ providerId: p.providerId, versionId: v.id, publishedAt: v.publishedAt }, fields));
      }
      return out.sort((a, b) => a.displayName.localeCompare(b.displayName));
    }
    function photoTasks() {
      if (!['kam', 'admin', 'readonly'].includes(actor.role)) return [];
      const state = read().state, out = [];
      for (const p of Object.values(state.profiles)) {
        const live = liveFor(p, false);
        if (!live || !allowed(live) || !p.publishedVersionId) continue;
        const firstMissing = p.versions.find(v => v.status === 'published' && !v.fields.photo);
        if (!firstMissing) continue;
        const currentPublished = p.versions.find(v => v.id === p.publishedVersionId), publishedPhoto = !!currentPublished.fields.photo;
        out.push({ id: 'doctor-photo:' + p.providerId, kind: 'doctor_public_photo', providerId: p.providerId, accountId: p.accountId, contactId: live.contactId, assignedKam: live.assignedKam, title: 'Completar fotografía pública', status: publishedPhoto ? 'closed' : 'open', publishedPhoto, publishedVersionId: currentPublished.id, createdAt: firstMissing.publishedAt, updatedAt: currentPublished.publishedAt, demo: true });
      }
      return out;
    }
    return Object.freeze({ actor, snapshot: () => project(read().state), saveDraft, confirm, review, publish, publicProfiles, photoTasks });
  }
  function readPublicProfiles(storage, resolveProvider) { return createStore({ storage, resolveProvider }).publicProfiles(); }
  return Object.freeze({ STORAGE_KEY, STORE: STORAGE_KEY, VERSION, PUBLIC_FIELDS, LINK_FIELDS, MAX_PHOTO_BYTES, validatePhoto, normalizeFields, createStore, readPublicProfiles });
});
