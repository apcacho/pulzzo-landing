/* PULZZO v1 demo extensions. Browser localStorage only.
 * No email, WhatsApp, Buró, signature or real disbursement.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PulzzoV1 = api;
  if (root && root.document && typeof root.document.getElementById === 'function') {
    try { api.boot(root); } catch (ignore) {}
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null, function (root) {
  'use strict';
  const OPS_KEY = 'pulzzo_v1_ops_v1';
  const REF_KEY = 'pulzzo_v1_doctor_referrals_v1';
  const OFFICE_KEY = 'pulzzo_backoffice_demo';
  const PUBLICATION_KEY = 'pulzzo_doctor_publication_demo_v1';
  const REDISTRIBUTE_KEY = 'pulzzo_v1_pending_redistribute';
  const NOTICE = 'Por tu buen historial, tu próximo crédito tendrá una tasa preferente';
  const UNAFFILIATED_MARK = 'Este doctor aún no trabaja con PULZZO; lo contactaremos por ti';
  const LEGAL_NOTE = 'Contrato pendiente de validación legal';
  const SEED = [
    {id:'unaff-valdes', name:'Dr. Héctor Valdés Ríos', specialty:'Cirugía plástica', state:'Jalisco', city:'Guadalajara', phone:'3310001001', email:'afiliacion.demo+unaff-valdes@pulzzo.invalid', affiliated:false, fictitious:true},
    {id:'unaff-solis', name:'Dra. Jimena Solís Prado', specialty:'Dermatología', state:'Nuevo León', city:'Monterrey', phone:'8110001002', email:'afiliacion.demo+unaff-solis@pulzzo.invalid', affiliated:false, fictitious:true},
    {id:'unaff-castaneda', name:'Dr. Omar Castañeda Luz', specialty:'Ortopedia', state:'Ciudad de México', city:'Coyoacán', phone:'5510001003', email:'afiliacion.demo+unaff-castaneda@pulzzo.invalid', affiliated:false, fictitious:true}
  ];
  const DEFAULT_PHASES = [
    {id:'fase-1', label:'Anticipo', percent:20},
    {id:'fase-2', label:'Procedimiento', percent:70},
    {id:'fase-3', label:'Cierre', percent:10}
  ];
  const isId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,179}$/.test(value) && !['__proto__','constructor','prototype'].includes(value);
  function storageOf(storage) {
    if (storage && typeof storage.getItem === 'function') return storage;
    try { if (root && root.localStorage) return root.localStorage; } catch (ignore) {}
    return null;
  }
  function freshOps() {
    return {version:1, demo:true, unaffiliated:SEED.map(row => Object.assign({}, row)), punctual:{paymentsRequired:3, discountPoints:2}, affiliation:[], notices:[], phases:{}};
  }
  function readOps(storage) {
    storage = storageOf(storage);
    if (!storage) return null;
    let raw; try { raw = storage.getItem(OPS_KEY); } catch (ignore) { return null; }
    if (raw == null || raw === '') return null;
    let parsed; try { parsed = JSON.parse(raw); } catch (ignore) { return null; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (!Array.isArray(parsed.unaffiliated)) parsed.unaffiliated = SEED.map(row => Object.assign({}, row));
    const punctual = parsed.punctual && typeof parsed.punctual === 'object' ? parsed.punctual : {};
    const paymentsRequired = Number(punctual.paymentsRequired);
    const discountPoints = Number(punctual.discountPoints);
    parsed.punctual = {
      paymentsRequired: Number.isFinite(paymentsRequired) && paymentsRequired >= 1 ? Math.round(paymentsRequired) : 3,
      discountPoints: Number.isFinite(discountPoints) && discountPoints >= 0 ? discountPoints : 2
    };
    if (!Array.isArray(parsed.affiliation)) parsed.affiliation = [];
    if (!Array.isArray(parsed.notices)) parsed.notices = [];
    if (!parsed.phases || typeof parsed.phases !== 'object' || Array.isArray(parsed.phases)) parsed.phases = {};
    parsed.version = 1;
    parsed.demo = true;
    return parsed;
  }
  function writeOps(storage, ops) {
    storage = storageOf(storage);
    if (!storage) return false;
    const copy = JSON.parse(JSON.stringify(ops));
    copy.version = 1;
    copy.demo = true;
    storage.setItem(OPS_KEY, JSON.stringify(copy));
    return true;
  }
  function ensureOps(storage) {
    storage = storageOf(storage);
    if (!storage) return freshOps();
    let raw = null; try { raw = storage.getItem(OPS_KEY); } catch (ignore) { return freshOps(); }
    if (raw == null || raw === '') {
      const ops = freshOps();
      try { writeOps(storage, ops); } catch (ignore) {}
      return ops;
    }
    return readOps(storage) || freshOps();
  }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function norm(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function doctorShortName(name) {
    return String(name || 'médico').replace(/^\s*(dra?|doctor|doctora)\.?\s+/i, '').trim() || 'médico';
  }
  function affiliationTitle(name, count) {
    const n = Math.max(1, Math.round(Number(count) || 1));
    return 'Afiliar al Dr. ' + doctorShortName(name) + ' (' + n + ' paciente' + (n === 1 ? '' : 's') + ' esperando)';
  }

  function utf8(text) {
    if (typeof TextEncoder === 'function') return Array.from(new TextEncoder().encode(String(text)));
    const out = [];
    for (const ch of String(text)) {
      const c = ch.codePointAt(0);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  const GF_EXP = new Uint8Array(512), GF_LOG = new Uint8Array(256);
  (function initGf() {
    let x = 1;
    for (let i = 0; i < 255; i++) { GF_EXP[i] = x; GF_LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
  })();
  function gfMul(a, b) { if (!a || !b) return 0; return GF_EXP[GF_LOG[a] + GF_LOG[b]]; }
  const QR_VERSIONS = {
    1:{size:21, data:19, ecc:7, align:[], remainder:0, bytes:17},
    2:{size:25, data:34, ecc:10, align:[6,18], remainder:7, bytes:32},
    3:{size:29, data:55, ecc:15, align:[6,22], remainder:7, bytes:53},
    4:{size:33, data:80, ecc:20, align:[6,26], remainder:7, bytes:78},
    5:{size:37, data:108, ecc:26, align:[6,30], remainder:7, bytes:106}
  };
  function rsEncode(data, nsym) {
    let gen = [1];
    for (let i = 0; i < nsym; i++) {
      const next = new Array(gen.length + 1).fill(0);
      for (let j = 0; j < gen.length; j++) { next[j] ^= gen[j]; next[j + 1] ^= gfMul(gen[j], GF_EXP[i]); }
      gen = next;
    }
    const res = new Array(nsym).fill(0);
    for (let i = 0; i < data.length; i++) {
      const coef = data[i] ^ res[0];
      res.shift(); res.push(0);
      if (coef) for (let j = 0; j < nsym; j++) res[j] ^= gfMul(gen[j + 1], coef);
    }
    return res;
  }
  function formatBits(mask) {
    let data = (1 << 3) | (mask & 7), rem = data << 10;
    for (let i = 14; i >= 10; i--) if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
    return ((data << 10) | (rem & 0x3ff)) ^ 0x5412;
  }
  function qrMatrix(text) {
    const bytes = utf8(text);
    let version = 0, spec = null;
    for (let v = 1; v <= 5; v++) if (bytes.length <= QR_VERSIONS[v].bytes) { version = v; spec = QR_VERSIONS[v]; break; }
    if (!spec) return null;
    const bits = [];
    const push = (value, length) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
    push(0b0100, 4); push(bytes.length, 8);
    bytes.forEach(b => push(b, 8));
    const capacity = spec.data * 8;
    for (let i = 0; i < 4 && bits.length < capacity; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((n, bit) => (n << 1) | bit, 0));
    const pads = [0xec, 0x11];
    for (let i = 0; data.length < spec.data; i++) data.push(pads[i % 2]);
    const codewords = data.concat(rsEncode(data, spec.ecc));
    const stream = [];
    codewords.forEach(word => pushBits(stream, word, 8));
    for (let i = 0; i < spec.remainder; i++) stream.push(0);
    function pushBits(list, value, length) { for (let i = length - 1; i >= 0; i--) list.push((value >>> i) & 1); }
    const n = spec.size;
    const modules = Array.from({length:n}, () => new Array(n).fill(0));
    const reserved = Array.from({length:n}, () => new Array(n).fill(false));
    function set(x, y, dark, reserve) {
      if (x < 0 || y < 0 || x >= n || y >= n) return;
      modules[y][x] = dark ? 1 : 0;
      if (reserve) reserved[y][x] = true;
    }
    function finder(x, y) {
      for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
        const on = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
        set(xx, yy, on, true);
      }
    }
    finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
    for (let i = 0; i < n; i++) {
      if (!reserved[6][i]) set(i, 6, i % 2 === 0, true);
      if (!reserved[i][6]) set(6, i, i % 2 === 0, true);
    }
    const positions = spec.align;
    for (let i = 0; i < positions.length; i++) for (let j = 0; j < positions.length; j++) {
      if (i === 0 && j === 0) continue;
      if (i === 0 && j === positions.length - 1) continue;
      if (i === positions.length - 1 && j === 0) continue;
      const cx = positions[j], cy = positions[i];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1, true);
    }
    set(8, n - 8, 1, true);
    for (let i = 0; i < 15; i++) {
      const bit = (formatBits(0) >>> i) & 1;
      if (i < 6) set(8, i, bit, true);
      else if (i === 6) set(8, 7, bit, true);
      else if (i === 7) set(8, 8, bit, true);
      else if (i === 8) set(7, 8, bit, true);
      else set(14 - i, 8, bit, true);
      if (i < 8) set(n - 1 - i, 8, bit, true);
      else set(8, n - 15 + i, bit, true);
    }
    let cursor = 0;
    for (let right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? n - 1 - vert : vert;
        if (reserved[y][x]) continue;
        const dark = cursor < stream.length && stream[cursor] === 1;
        cursor++;
        modules[y][x] = (x + y) % 2 === 0 ? (dark ? 0 : 1) : (dark ? 1 : 0);
      }
    }
    const fmt = formatBits(0);
    function paintFormat(x, y, i) { set(x, y, ((fmt >>> i) & 1) === 1, true); }
    for (let i = 0; i < 15; i++) {
      if (i < 6) paintFormat(8, i, i);
      else if (i === 6) paintFormat(8, 7, i);
      else if (i === 7) paintFormat(8, 8, i);
      else if (i === 8) paintFormat(7, 8, i);
      else paintFormat(14 - i, 8, i);
      if (i < 8) paintFormat(n - 1 - i, 8, i);
      else paintFormat(8, n - 15 + i, i);
    }
    return {version:version, size:n, modules:modules};
  }
  function qrSvg(text) {
    const matrix = qrMatrix(text);
    if (!matrix) return '';
    const quiet = 4, cell = 4, n = matrix.size + quiet * 2, px = n * cell;
    let body = '';
    for (let y = 0; y < matrix.size; y++) for (let x = 0; x < matrix.size; x++) if (matrix.modules[y][x]) body += '<rect x="' + ((x + quiet) * cell) + '" y="' + ((y + quiet) * cell) + '" width="' + cell + '" height="' + cell + '"/>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + px + ' ' + px + '" width="' + px + '" height="' + px + '" role="img" aria-label="Código QR de demostración"><rect width="100%" height="100%" fill="#fff"/>' + body.replace(/<rect /g, '<rect fill="#07142f" ') + '</svg>';
  }

  function readRefs(storage) {
    storage = storageOf(storage);
    const empty = {version:1, demo:true, byToken:{}};
    if (!storage) return empty;
    try {
      const parsed = JSON.parse(storage.getItem(REF_KEY) || 'null');
      if (!parsed || typeof parsed !== 'object' || !parsed.byToken || typeof parsed.byToken !== 'object') return empty;
      return parsed;
    } catch (ignore) { return empty; }
  }
  function writeRefs(storage, book) {
    storage = storageOf(storage);
    if (!storage) return false;
    book.version = 1; book.demo = true;
    storage.setItem(REF_KEY, JSON.stringify(book));
    return true;
  }
  function tokenFor(id) {
    let h = 2166136261;
    const s = 'pulzzo-doctor:' + String(id || '');
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = 'D', n = h >>> 0;
    for (let i = 0; i < 10; i++) { out += alphabet[n % alphabet.length]; n = (Math.imul(n, 1664525) + 1013904223) >>> 0; }
    return out;
  }
  function referralPath(token) { return 'registro-paciente.html?docref=' + encodeURIComponent(token); }
  function referralUrl(token) {
    const path = referralPath(token);
    try {
      if (root && root.location && root.location.origin && String(root.location.origin) !== 'null' && root.location.pathname) {
        const base = String(root.location.pathname).replace(/[^/]*$/, '');
        return root.location.origin + base + path;
      }
    } catch (ignore) {}
    return path;
  }
  function readOffice(storage) {
    storage = storageOf(storage);
    if (!storage) return null;
    try { const parsed = JSON.parse(storage.getItem(OFFICE_KEY) || 'null'); return parsed && typeof parsed === 'object' ? parsed : null; } catch (ignore) { return null; }
  }
  function lookupKam(storage, doctorId, name) {
    storage = storageOf(storage);
    if (!storage || !root || !root.PulzzoCRMStore) return null;
    try {
      const store = root.PulzzoCRMStore.createStore({storage:storage, actor:{id:'landing_intake', role:'admin'}, staffAccess:null});
      const rows = store.listContacts({type:'doctor'}) || [];
      const id = String(doctorId || '');
      const wanted = norm(name);
      const hit = rows.find(row => id && String(row.notes || '').indexOf(id) !== -1) || rows.find(row => wanted && norm(row.name) === wanted);
      return hit && isId(hit.assignedKam) ? hit.assignedKam : null;
    } catch (ignore) { return null; }
  }
  function ensureDoctorReferral(storage, doctor) {
    storage = storageOf(storage);
    doctor = doctor || {};
    const id = String(doctor.id || '').trim();
    if (!id) return null;
    const book = readRefs(storage);
    let row = Object.keys(book.byToken).map(key => book.byToken[key]).find(item => item && item.doctorId === id);
    const kamId = isId(doctor.kamId) ? doctor.kamId : lookupKam(storage, id, doctor.name);
    if (!row) {
      const token = tokenFor(id);
      row = {token:token, doctorId:id, doctorName:String(doctor.name || '').slice(0, 160), kamId:kamId, createdAt:new Date().toISOString(), demo:true};
      book.byToken[token] = row;
      writeRefs(storage, book);
    } else if (kamId && row.kamId !== kamId) {
      row.kamId = kamId;
      writeRefs(storage, book);
    }
    return Object.assign({}, row, {url:referralUrl(row.token), path:referralPath(row.token)});
  }
  function resolveDoctorReferral(token, storage) {
    const book = readRefs(storage);
    const row = book.byToken && book.byToken[String(token || '')];
    if (!row || !row.doctorId) return null;
    const kamId = isId(row.kamId) ? row.kamId : lookupKam(storage, row.doctorId, row.doctorName);
    return {token:row.token, doctorId:row.doctorId, doctorName:row.doctorName || '', kamId:isId(kamId) ? kamId : null, demo:true};
  }
  function downloadSvg(filename, svg) {
    const doc = root && root.document;
    if (!doc || typeof doc.createElement !== 'function' || typeof Blob === 'undefined') return svg;
    const blob = new Blob([svg], {type:'image/svg+xml;charset=utf-8'});
    const url = (root.URL || URL).createObjectURL(blob);
    const a = doc.createElement('a');
    a.href = url; a.download = filename;
    if (doc.body && doc.body.appendChild) doc.body.appendChild(a);
    if (typeof a.click === 'function') a.click();
    if (typeof a.remove === 'function') a.remove();
    (root.URL || URL).revokeObjectURL(url);
    return svg;
  }

  function unaffiliatedDoctors(storage) {
    const ops = ensureOps(storage);
    return (ops.unaffiliated || []).filter(row => row && row.affiliated === false).map(row => Object.assign({}, row));
  }
  function searchDoctors(storage, query) {
    const q = norm(query);
    if (q.length < 2) return [];
    const unaff = unaffiliatedDoctors(storage).filter(row => [row.name, row.specialty, row.city, row.state].some(part => norm(part).indexOf(q) !== -1));
    const aff = affiliatedOptions(storage).filter(row => [row.displayName, row.specialty, row.city, row.state].some(part => norm(part).indexOf(q) !== -1)).map(row => ({id:row.id, name:row.displayName, specialty:row.specialty, city:row.city, state:row.state, affiliated:true}));
    return unaff.map(row => Object.assign({affiliated:false, mark:UNAFFILIATED_MARK}, row)).concat(aff);
  }
  function readPublished(storage) {
    storage = storageOf(storage);
    if (!storage) return [];
    if (root && root.PulzzoDoctorPublication && typeof root.PulzzoDoctorPublication.readPublicProfiles === 'function') {
      try { return root.PulzzoDoctorPublication.readPublicProfiles(storage) || []; } catch (ignore) {}
    }
    try {
      const parsed = JSON.parse(storage.getItem(PUBLICATION_KEY) || 'null');
      const profiles = parsed && parsed.profiles;
      if (!profiles || typeof profiles !== 'object') return [];
      const out = [];
      Object.keys(profiles).forEach(key => {
        const profile = profiles[key];
        if (!profile || !profile.publishedVersionId) return;
        const version = (profile.versions || []).find(item => item && item.id === profile.publishedVersionId && item.status === 'published');
        if (!version || !version.fields) return;
        out.push(Object.assign({providerId:profile.providerId || key}, version.fields));
      });
      return out;
    } catch (ignore) { return []; }
  }
  function affiliatedOptions(storage) {
    const blockedIds = new Set(unaffiliatedDoctors(storage).map(row => row.id));
    const blockedNames = new Set(unaffiliatedDoctors(storage).map(row => norm(row.name)));
    return readPublished(storage).filter(row => row && !blockedIds.has(row.providerId) && !blockedNames.has(norm(row.displayName))).map(row => ({
      id:row.providerId || row.id,
      displayName:row.displayName || row.clinicName || 'Proveedor Pulzzo',
      specialty:row.specialty || row.services || '',
      services:row.services || row.specialty || '',
      state:row.state || '',
      city:row.city || '',
      municipality:row.city || '',
      phone:row.phone || row.whatsapp || '',
      affiliated:true
    }));
  }
  function crmAdmin(storage) {
    if (!root || !root.PulzzoCRMStore || !storageOf(storage)) return null;
    try { return root.PulzzoCRMStore.createStore({storage:storageOf(storage), actor:{id:'landing_intake', role:'admin'}, staffAccess:null}); } catch (ignore) { return null; }
  }
  function ensureAffiliationContact(storage, doctor) {
    const store = crmAdmin(storage);
    if (!store || !doctor) return null;
    const email = doctor.email || ('afiliacion.demo+' + String(doctor.id || 'doctor').replace(/[^a-z0-9]+/gi, '') + '@pulzzo.invalid');
    const phone = String(doctor.phone || '5500000000').replace(/\D/g, '');
    const existing = (store.listContacts({type:'doctor'}) || []).find(row => row.email === email);
    if (existing) return existing;
    const out = store.createContact({
      type:'doctor', name:doctor.name, email:email, phone:phone, originalSource:'doctor_referral', captureMechanism:'crm_manual',
      notes:'Origen: solicitud de paciente · doctor no afiliado · demo ficticio · ' + doctor.id
    }, store.snapshot().revision);
    return out && out.ok ? out.value : null;
  }
  function queueAffiliation(storage, doctor, patientKey) {
    storage = storageOf(storage);
    if (!storage || !doctor || !doctor.id) return null;
    const ops = ensureOps(storage);
    let item = ops.affiliation.find(row => row.doctorId === doctor.id);
    if (!item) {
      const contact = ensureAffiliationContact(storage, doctor);
      item = {doctorId:doctor.id, name:doctor.name, contactId:contact && contact.id, count:0, patients:[], taskId:null, demo:true};
      ops.affiliation.push(item);
    } else if (!item.contactId) {
      const contact = ensureAffiliationContact(storage, doctor);
      if (contact) item.contactId = contact.id;
    }
    const key = String(patientKey || doctor.id);
    if (item.patients.indexOf(key) === -1) item.patients.push(key);
    item.count = item.patients.length;
    item.name = doctor.name || item.name;
    writeOps(storage, ops);
    return Object.assign({}, item, {title:affiliationTitle(item.name, item.count)});
  }
  function flushAffiliationTasks(storage) {
    storage = storageOf(storage);
    if (!storage) return {ok:false, created:0};
    let raw = null; try { raw = storage.getItem(OPS_KEY); } catch (ignore) { return {ok:false, created:0}; }
    if (!raw) return {ok:true, created:0};
    const ops = readOps(storage);
    if (!ops || !ops.affiliation.length) return {ok:true, created:0};
    const store = crmAdmin(storage);
    if (!store) return {ok:false, created:0};
    let created = 0, changed = false;
    ops.affiliation.forEach(item => {
      if (!item || !item.contactId) return;
      const title = affiliationTitle(item.name, item.count || 1);
      let tasks = [];
      try { tasks = store.listTasks({contactId:item.contactId}) || []; } catch (ignore) { tasks = []; }
      const existing = tasks.find(task => task.status !== 'closed' && String(task.title || '').indexOf('Afiliar al Dr. ') === 0 && String(task.title).indexOf(doctorShortName(item.name)) !== -1);
      if (existing) {
        item.taskId = existing.id;
        if (existing.title !== title) {
          const updated = store.updateTask(existing.id, {title:title}, store.snapshot().revision);
          if (updated && updated.ok) changed = true;
        }
        return;
      }
      const due = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const out = store.createTask({contactId:item.contactId, title:title, dueAt:due}, store.snapshot().revision);
      if (out && out.ok) { item.taskId = out.value.id; created++; changed = true; }
    });
    if (changed) writeOps(storage, ops);
    return {ok:true, created:created};
  }

  function digits(value) { return String(value || '').replace(/\D/g, ''); }
  function demoEmail(seed) { return 'contacto.demo+' + String(seed || 'landing').replace(/[^a-z0-9]+/gi, '').slice(0, 24) + '@pulzzo.invalid'; }
  function demoPhone(seed) {
    let h = 0; const s = String(seed || 'demo');
    for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
    return '55' + String(10000000 + (h % 90000000));
  }
  function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254; }
  function saveLandingContact(input, storage) {
    storage = storageOf(storage);
    input = input || {};
    const store = crmAdmin(storage);
    if (!store) return {ok:false, demo:true, reason:'crm-no-disponible'};
    const origin = input.origin === 'refer' ? 'refer' : 'contact';
    const name = String(input.name || input.doctorName || '').trim();
    if (!name) return {ok:false, demo:true, reason:'sin-nombre'};
    let email = String(input.email || '').trim().toLowerCase();
    let phone = digits(input.phone || input.contact || '');
    const contactRaw = String(input.contact || '').trim();
    if (origin === 'refer') {
      if (contactRaw.indexOf('@') !== -1) email = contactRaw.toLowerCase();
      else if (digits(contactRaw).length >= 7) phone = digits(contactRaw);
    }
    const notes = [];
    if (!validEmail(email)) { notes.push('Correo demo porque el formulario no traía uno válido.'); email = demoEmail(name + phone); }
    if (!/^\d{7,15}$/.test(phone)) { notes.push('Teléfono demo porque el formulario no traía uno válido.'); phone = demoPhone(name + email); }
    notes.unshift(origin === 'refer' ? 'Origen: landing · Referir doctor' : 'Origen: landing · Quiero que me contacten');
    if (input.referrer) notes.push('Quien refiere: ' + String(input.referrer).slice(0, 160));
    const payload = {
      type: origin === 'refer' ? 'doctor' : 'patient',
      name: (input.prefix ? String(input.prefix) + ' ' : '') + name,
      email:email, phone:phone,
      originalSource: origin === 'refer' ? 'doctor_referral' : 'direct',
      captureMechanism:'crm_manual',
      notes:notes.join(' ')
    };
    const created = store.createContact(payload, store.snapshot().revision);
    if (!created || !created.ok) return {ok:true, demo:true, duplicate:true, error:created && created.error};
    const contact = created.value;
    const due = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const title = (origin === 'refer' ? 'Contactar referido de doctor · ' : 'Contactar lead de landing · ') + contact.name;
    try { store.createTask({contactId:contact.id, title:title.slice(0, 300), dueAt:due}, store.snapshot().revision); } catch (ignore) {}
    return {ok:true, demo:true, contact:contact};
  }

  function officeProgress(status) {
    const raw = String(status || '').trim().toLowerCase();
    const key = raw.replace(/\s+/g, '_');
    if (!key || key === 'sin_vínculo_de_backoffice' || key === 'sin_vinculo_de_backoffice' || key === 'sin_expediente') return '';
    if (['activo','activa','dispersada','dispersado','disbursed','liquidado','liquidada'].indexOf(key) !== -1 || /dispers|disburs/.test(key)) return 'Dispersado';
    if (['contrato_firmado','contract_signed','firmado','firmada'].indexOf(key) !== -1 || /firmad|contrato_firmado|contract_signed/.test(key)) return 'Firmado';
    if (['aprobado','aprobada','aprobada_para_oferta','aprobado_para_oferta','oferta_enviada','oferta_aceptada','approved'].indexOf(key) !== -1 || /^aprobad/.test(key) || /oferta_enviada|oferta_aceptada/.test(key)) return 'Aprobado';
    return '';
  }
  function funnelStage(patient) {
    const app = patient && patient.application || {};
    const status = String(app.applicationStatus || patient.status || '').toLowerCase();
    if (app.dispersionDate || app.disbursedAt || /dispers|disburs|activo|activa/.test(status)) return 'dispersados';
    if (app.contractSigned || /firmad|contrato_firmado|contract_signed/.test(status)) return 'firmados';
    if (/aprobad|oferta_enviada|oferta_aceptada/.test(status)) return 'aprobados';
    if (app.submittedAt || app.applicationSubmittedAt || /evalu|solicitud|correccion|revision|enviad/.test(status)) return 'en_solicitud';
    return 'interesados';
  }
  function patientsForDoctor(storage, doctor) {
    const db = readOffice(storage);
    const rows = db && Array.isArray(db.patients) ? db.patients : [];
    const name = norm(doctor && doctor.name);
    const id = doctor && doctor.id;
    return rows.filter(patient => {
      const app = patient && patient.application || {};
      if (id && (app.providerId === id || app.doctorId === id || app.doctorAccountId === id)) return true;
      const fields = [app.doctorName].concat(Object.keys(app.procedureProviderAssignments || {}).map(key => app.procedureProviderAssignments[key]));
      return !!name && fields.some(value => { const text = norm(value); return text && (text === name || text.indexOf(name) !== -1 || name.indexOf(text) !== -1 && text.length > 4); });
    });
  }
  function doctorFunnel(storage, doctor) {
    const buckets = {interesados:[], en_solicitud:[], aprobados:[], firmados:[], dispersados:[]};
    patientsForDoctor(storage, doctor).forEach(patient => {
      const stage = funnelStage(patient);
      buckets[stage].push({id:patient.id, name:patient.patient && patient.patient.fullName || patient.id, status:patient.application && patient.application.applicationStatus || ''});
    });
    const seen = new Set();
    Object.keys(buckets).forEach(key => buckets[key].forEach(row => seen.add(norm(row.name))));
    try {
      const store = crmAdmin(storage);
      const id = doctor && doctor.id;
      if (store && id) (store.listContacts({type:'patient'}) || []).forEach(contact => {
        if (String(contact.notes || '').indexOf(id) === -1 || seen.has(norm(contact.name))) return;
        const stage = contact.stage === 'submitted' || contact.stage === 'application_started' ? 'en_solicitud' : (contact.stage === 'not_interested' || contact.stage === 'no_response' ? '' : 'interesados');
        if (!stage) return;
        seen.add(norm(contact.name));
        buckets[stage].push({id:contact.id, name:contact.name, status:contact.stage});
      });
    } catch (ignore) {}
    return buckets;
  }
  function money(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '$0.00';
    return n.toLocaleString('es-MX', {style:'currency', currency:'MXN'});
  }
  function doctorPayouts(storage, doctor) {
    const rows = [];
    patientsForDoctor(storage, doctor).forEach(patient => {
      const app = patient.application || {};
      const list = Array.isArray(app.providerDispersions) ? app.providerDispersions : [];
      list.forEach(item => {
        const status = String(item.status || '');
        const paid = /pagad|dispersad|paid|liberad/i.test(status) || !!item.paidAt;
        rows.push({
          id:item.id || item.payoutId || patient.id,
          patient:patient.patient && patient.patient.fullName || patient.id,
          amount:Number(item.amount || 0),
          status:paid ? 'pagado' : 'pendiente',
          date:item.paidAt || item.dispersionDate || app.dispersionDate || '',
          reference:item.reference || item.payoutId || item.id || patient.id,
          demo:true
        });
      });
    });
    const phases = readOps(storage);
    if (phases && phases.phases) Object.keys(phases.phases).forEach(patientId => {
      const book = phases.phases[patientId];
      if (!book || !Array.isArray(book.phases)) return;
      const patient = patientsForDoctor(storage, doctor).find(item => item.id === patientId);
      if (!patient) return;
      book.phases.forEach(phase => {
        if (phase.status !== 'liberada') rows.push({id:patientId + ':' + phase.id, patient:patient.patient && patient.patient.fullName || patientId, amount:Number(phase.amount || 0), status:'pendiente', date:phase.expectedDate || '', reference:phase.id, label:phase.label, demo:true});
        else rows.push({id:patientId + ':' + phase.id, patient:patient.patient && patient.patient.fullName || patientId, amount:Number(phase.amount || 0), status:'pagado', date:phase.releasedAt || '', reference:phase.id, label:phase.label, demo:true});
      });
    });
    const pending = rows.filter(row => row.status !== 'pagado').reduce((sum, row) => sum + row.amount, 0);
    const paid = rows.filter(row => row.status === 'pagado').reduce((sum, row) => sum + row.amount, 0);
    const upcoming = rows.filter(row => row.status !== 'pagado').slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return {rows:rows, pending:Math.round(pending * 100) / 100, paid:Math.round(paid * 100) / 100, upcoming:upcoming, demo:true};
  }

  function validatePhases(phases) {
    if (!Array.isArray(phases) || !phases.length) return {ok:false, error:'Agrega al menos una fase.'};
    const rows = phases.map((phase, index) => ({
      id:String(phase.id || ('fase-' + (index + 1))),
      label:String(phase.label || '').trim(),
      percent:Number(phase.percent),
      status:phase.status === 'liberada' ? 'liberada' : 'pendiente',
      evidence:phase.evidence || '',
      kamValidated:phase.kamValidated === true,
      releasedAt:phase.releasedAt || '',
      expectedDate:phase.expectedDate || ''
    }));
    if (rows.some(phase => !phase.label || !Number.isFinite(phase.percent) || phase.percent < 0 || phase.percent > 100)) return {ok:false, error:'Revisa el nombre y el porcentaje de cada fase.'};
    const sum = Math.round(rows.reduce((total, phase) => total + phase.percent, 0) * 100) / 100;
    if (Math.abs(sum - 100) > 0.001) return {ok:false, error:'Los porcentajes deben sumar 100%.'};
    return {ok:true, phases:rows, sum:sum};
  }
  function phaseAmounts(total, phases) {
    const cents = Math.round(Number(total) * 100);
    const base = Number.isFinite(cents) && cents > 0 ? cents : 0;
    let used = 0;
    return phases.map((phase, index) => {
      const share = index === phases.length - 1 ? base - used : Math.round(base * Number(phase.percent) / 100);
      if (index !== phases.length - 1) used += share;
      return Object.assign({}, phase, {amount:share / 100});
    });
  }
  function defaultPhaseBook(total) {
    const phases = phaseAmounts(total, DEFAULT_PHASES.map(phase => Object.assign({status:'pendiente', evidence:'', kamValidated:false, releasedAt:'', expectedDate:''}, phase)));
    return {total:Number(total) || 0, phases:phases, demo:true, legalNote:LEGAL_NOTE};
  }
  function offerTotal(patient) {
    const app = patient && patient.application || {};
    const offer = patient && patient.offer || {};
    const value = offer.approvedAmount || app.approvedAmount || app.requestedAmount || app.procedureCost || offer.procedureAmount || 0;
    return Number(value) || 0;
  }
  function phasesFor(storage, patientId, total) {
    const ops = readOps(storage);
    const book = ops && ops.phases && ops.phases[patientId];
    if (!book || !Array.isArray(book.phases) || !book.phases.length) return defaultPhaseBook(total);
    const checked = validatePhases(book.phases);
    const phases = phaseAmounts(total, checked.ok ? checked.phases : defaultPhaseBook(total).phases);
    return {total:total, phases:phases, demo:true, legalNote:LEGAL_NOTE};
  }
  function savePhases(storage, patientId, phases, total) {
    const checked = validatePhases(phases);
    if (!checked.ok) return checked;
    storage = storageOf(storage);
    if (!storage || !patientId) return {ok:false, error:'No se pudo guardar la plantilla.'};
    const ops = readOps(storage) || freshOps();
    const previous = ops.phases[patientId] && ops.phases[patientId].phases || [];
    if (previous.some(phase => phase.status === 'liberada')) return {ok:false, error:'Ya hay una fase liberada. La plantilla de esta oferta queda fija.'};
    ops.phases[patientId] = {total:Number(total) || 0, phases:phaseAmounts(total, checked.phases.map(phase => Object.assign({}, phase, {status:'pendiente', evidence:'', kamValidated:false}))), demo:true, legalNote:LEGAL_NOTE};
    writeOps(storage, ops);
    return {ok:true, book:ops.phases[patientId]};
  }
  function releasePhase(storage, patientId, phaseId, input) {
    storage = storageOf(storage);
    input = input || {};
    const ops = readOps(storage) || freshOps();
    const total = Number(input.total) || (ops.phases[patientId] && ops.phases[patientId].total) || 0;
    const book = ops.phases[patientId] && Array.isArray(ops.phases[patientId].phases) ? ops.phases[patientId] : defaultPhaseBook(total);
    book.phases = phaseAmounts(total, book.phases);
    const index = book.phases.findIndex(phase => phase.id === phaseId);
    if (index < 0) return {ok:false, error:'No se encontró la fase.'};
    if (book.phases.some((phase, i) => i < index && phase.status !== 'liberada')) return {ok:false, error:'Libera primero la fase anterior.'};
    const evidence = String(input.evidence || '').trim();
    if (!evidence) return {ok:false, error:'Agrega la evidencia del doctor para esta fase.'};
    if (input.kamValidated !== true) return {ok:false, error:'Falta la validación del KAM.'};
    if (book.phases[index].status === 'liberada') return {ok:false, error:'Esta fase ya fue liberada.'};
    book.phases[index] = Object.assign({}, book.phases[index], {status:'liberada', evidence:evidence, kamValidated:true, releasedAt:new Date().toISOString(), demo:true});
    book.legalNote = LEGAL_NOTE;
    book.demo = true;
    book.total = total;
    ops.phases[patientId] = book;
    writeOps(storage, ops);
    return {ok:true, book:book, demo:true};
  }
  function phasePanelHtml(patient) {
    const storage = storageOf();
    const total = offerTotal(patient);
    const book = phasesFor(storage, patient && patient.id, total);
    const locked = book.phases.some(phase => phase.status === 'liberada');
    const rows = book.phases.map(phase => '<div class="v1-phase" data-phase-id="' + esc(phase.id) + '"><label>Fase <input data-v1-phase-label value="' + esc(phase.label) + '"' + (locked ? ' readonly' : '') + '></label><label>% <input data-v1-phase-percent type="number" min="0" max="100" step="0.01" value="' + esc(phase.percent) + '"' + (locked ? ' readonly' : '') + '></label><strong>' + esc(money(phase.amount)) + '</strong><span>' + esc(phase.status === 'liberada' ? 'Liberada' : 'Pendiente') + '</span>' + (phase.status === 'liberada' ? '<small>Ref. ' + esc(phase.id) + '</small>' : '<label>Evidencia del doctor (demo)<input data-v1-phase-evidence placeholder="Nota ficticia de evidencia"></label><label class="check"><input data-v1-phase-kam type="checkbox"> Validación del KAM</label><button type="button" class="btn btn-primary btn-sm" onclick="PulzzoV1.releasePhaseFromDom(this)">Liberar fase</button>') + '</div>').join('');
    return '<section class="dispersion-block v1-phases" data-v1-patient="' + esc(patient && patient.id) + '" data-v1-total="' + esc(total) + '"><div class="dispersion-block-head"><div><h4>Dispersión por fases</h4><p>Simulación. Cada fase se libera aparte. La tabla del cliente sigue siendo una sola, sobre el total.</p></div></div><p class="v1-note">' + esc(LEGAL_NOTE) + '</p><div class="v1-phase-list">' + rows + '</div>' + (locked ? '' : '<div class="action-bar"><button type="button" class="btn btn-secondary btn-sm" onclick="PulzzoV1.addPhaseRow(this)">Agregar fase</button><button type="button" class="btn btn-primary btn-sm" onclick="PulzzoV1.savePhasesFromDom(this)">Guardar porcentajes</button></div>') + '<p class="v1-phase-msg" role="status"></p></section>';
  }
  function phaseRoot(node) {
    let current = node;
    while (current && current.getAttribute && current.getAttribute('data-v1-patient') == null) current = current.parentNode;
    return current;
  }
  function readPhaseDom(rootNode) {
    const items = rootNode.querySelectorAll ? Array.from(rootNode.querySelectorAll('[data-phase-id]')) : [];
    return items.map(item => ({
      id:item.getAttribute('data-phase-id'),
      label:(item.querySelector('[data-v1-phase-label]') || {}).value || '',
      percent:(item.querySelector('[data-v1-phase-percent]') || {}).value
    }));
  }

  function punctualSettings(storage) {
    const ops = readOps(storage);
    if (!ops) return {paymentsRequired:3, discountPoints:2};
    return ops.punctual;
  }
  function savePunctualSettings(storage, patch) {
    storage = storageOf(storage);
    patch = patch || {};
    const paymentsRequired = Number(patch.paymentsRequired);
    const discountPoints = Number(patch.discountPoints);
    if (!Number.isFinite(paymentsRequired) || paymentsRequired < 1 || paymentsRequired > 120) return {ok:false, error:'Indica cuántos pagos puntuales se requieren.'};
    if (!Number.isFinite(discountPoints) || discountPoints < 0 || discountPoints > 80) return {ok:false, error:'Indica un descuento en puntos porcentuales.'};
    const ops = readOps(storage) || freshOps();
    ops.punctual = {paymentsRequired:Math.round(paymentsRequired), discountPoints:Math.round(discountPoints * 100) / 100};
    writeOps(storage, ops);
    return {ok:true, settings:ops.punctual};
  }
  function isPunctual(patient, settings) {
    settings = settings || {paymentsRequired:3, discountPoints:2};
    const rows = patient && Array.isArray(patient.paymentSchedule) ? patient.paymentSchedule : [];
    if (!rows.length) return {eligible:false, notice:'', reason:'sin calendario'};
    const late = rows.some(row => Number(row && row.dpd || 0) > 0 || /vencid|atras/.test(String(row && row.status || '').toLowerCase()));
    const onTime = rows.filter(row => Number(row && row.dpd || 0) === 0 && /pagad|liquid/.test(String(row && row.status || '').toLowerCase())).length;
    const liquidated = rows.every(row => /pagad|liquid/.test(String(row && row.status || '').toLowerCase()));
    const eligible = !late && (onTime >= Number(settings.paymentsRequired) || liquidated);
    return {eligible:eligible, onTime:onTime, late:late, liquidated:liquidated, notice:eligible ? NOTICE : ''};
  }
  function preferentialAnnualRate(decimalRate, settings, eligible) {
    const rate = Number(decimalRate);
    if (!Number.isFinite(rate)) return decimalRate;
    if (!eligible) return rate;
    const points = Number(settings && settings.discountPoints);
    if (!Number.isFinite(points) || points <= 0) return rate;
    return Math.max(0, Math.round((rate - points / 100) * 1000000) / 1000000);
  }
  function recordPunctualNotice(storage, patientId) {
    storage = storageOf(storage);
    if (!storage || !patientId) return null;
    const ops = readOps(storage) || freshOps();
    if (ops.notices.some(item => item.patientId === patientId && item.kind === 'punctual')) return ops.notices.find(item => item.patientId === patientId);
    const entry = {patientId:patientId, kind:'punctual', text:NOTICE, at:new Date().toISOString(), demo:true};
    ops.notices.push(entry);
    writeOps(storage, ops);
    return entry;
  }
  function offerCapDecision(session, amount, check) {
    if (typeof check !== 'function' || !session) return {allowed:true, skipped:true};
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return {allowed:true, skipped:true};
    try { return check(session, {amount:value}); }
    catch (error) { return {allowed:true, skipped:true, error:error && error.message}; }
  }
  function extensionMotivo(reason, fieldValue) {
    const motivo = String(reason == null ? (fieldValue || '') : reason).trim();
    return {ok:motivo.length > 0, motivo:motivo};
  }
  function notificationSummary(contacts, tasks, actor, now) {
    actor = actor || {};
    const rows = (contacts || []).filter(contact => !contact.deletedAt && (actor.role !== 'kam' || contact.assignedKam === actor.id));
    const ids = new Set(rows.map(contact => contact.id));
    const open = (tasks || []).filter(task => task.status !== 'closed' && ids.has(task.contactId));
    const nowMs = Date.parse(now || new Date().toISOString());
    const overdue = open.filter(task => task.dueAt && Date.parse(task.dueAt) < nowMs);
    const leads = rows.filter(contact => contact.stage === 'new');
    return {pending:open.length, leads:leads.length, overdue:overdue.length, total:open.length + leads.length + overdue.length, demo:true};
  }
  function csvCell(value) {
    let text = String(value == null ? '' : value);
    if (/^[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  function toCsv(rows, columns) {
    const header = columns.map(column => csvCell(column.label)).join(',');
    const body = (rows || []).map(row => columns.map(column => csvCell(typeof column.value === 'function' ? column.value(row) : row[column.key])).join(',')).join('\n');
    return '# Demo local PULZZO. No es un reporte oficial.\n' + header + (body ? '\n' + body : '');
  }
  function downloadCsv(filename, csv) {
    const doc = root && root.document;
    if (!doc || typeof Blob === 'undefined' || typeof doc.createElement !== 'function') return csv;
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
    const url = (root.URL || URL).createObjectURL(blob);
    const a = doc.createElement('a');
    a.href = url; a.download = filename;
    if (doc.body) doc.body.appendChild(a);
    if (typeof a.click === 'function') a.click();
    if (typeof a.remove === 'function') a.remove();
    (root.URL || URL).revokeObjectURL(url);
    return csv;
  }

  function currentDoctor(storage) {
    storage = storageOf(storage);
    let account = null, profile = null;
    try { account = JSON.parse(storage.getItem('pulzzo_doctor') || 'null'); } catch (ignore) {}
    try { profile = JSON.parse(storage.getItem('pulzzoDoctorOnboardingCleanV3') || 'null'); } catch (ignore) {}
    const id = (account && account.doctorAccountId) || (profile && profile.doctorAccountId) || '';
    const profileName = profile && profile.profile && (profile.profile.publicName || profile.profile.name || profile.profile.displayName);
    const name = profileName || (account && (account.nombre || account.name)) || 'Doctor demo';
    const email = (profile && profile.profile && profile.profile.email) || (account && account.correo) || '';
    const db = readOffice(storage);
    const providers = db && Array.isArray(db.providers) ? db.providers : [];
    const found = providers.find(provider => provider && ((id && (provider.id === id || provider.doctorAccountId === id)) || (email && provider.profile && norm(provider.profile.email) === norm(email)) || (name && provider.profile && norm((provider.profile.prefix ? provider.profile.prefix + ' ' : '') + provider.profile.name) === norm(name))));
    const canonicalId = found && found.id || id || 'doctor-demo';
    const canonicalName = found && found.profile ? ((found.profile.prefix ? found.profile.prefix + ' ' : '') + found.profile.name) : name;
    return {id:canonicalId, name:canonicalName, email:email, accountId:id};
  }
  function referralCard(storage, doctor) {
    const row = ensureDoctorReferral(storage, doctor);
    if (!row) return '<p class="v1-note">El enlace de referido aparece cuando el doctor tiene un identificador demo.</p>';
    const svg = qrSvg(row.url);
    return '<section class="v1-referral"><h3>Enlace de referido</h3><p class="v1-note">Demostración en este navegador. Quien se registre con este enlace queda ligado a este doctor y, si ya tiene KAM, a ese KAM.</p><p><a href="' + esc(row.path) + '">' + esc(row.url) + '</a></p>' + (svg ? '<div class="v1-qr">' + svg + '</div><button type="button" class="btn btn-secondary btn-sm" onclick="PulzzoV1.downloadDoctorQr(\'' + esc(row.token) + '\')">Descargar QR</button>' : '<p>El enlace es demasiado largo para el QR demo. Cópialo.</p>') + '</section>';
  }
  function doctorPanelHtml(storage, which) {
    const doctor = currentDoctor(storage);
    if (which === 'enlace') return referralCard(storage, doctor);
    if (which === 'pagos') {
      const report = doctorPayouts(storage, doctor);
      const list = report.upcoming.length ? report.upcoming.map(row => '<li><strong>' + esc(row.date || 'Fecha por definir') + '</strong> · ' + esc(row.patient) + ' · ' + esc(money(row.amount)) + ' · Ref. ' + esc(row.reference) + (row.label ? ' · ' + esc(row.label) : '') + '</li>').join('') : '<li>No hay pagos próximos en este navegador.</li>';
      return '<section class="v1-payouts"><h3>Pagos al doctor</h3><p class="v1-note">Vista local de demostración. Lee la cartera de este navegador; no sustituye una dispersión real.</p><p>Pendiente <strong>' + esc(money(report.pending)) + '</strong> · Pagado <strong>' + esc(money(report.paid)) + '</strong></p><h4>Próximos pagos</h4><ul>' + list + '</ul></section>';
    }
    const funnel = doctorFunnel(storage, doctor);
    const labels = [['interesados','Interesados'],['en_solicitud','En solicitud'],['aprobados','Aprobados'],['firmados','Firmados'],['dispersados','Dispersados']];
    return '<section class="v1-funnel"><h3>Embudo de pacientes</h3><p class="v1-note">Conteo demo con los expedientes de este navegador ligados a este doctor.</p>' + labels.map(([key, label]) => '<article><h4>' + label + ' · ' + funnel[key].length + '</h4><ul>' + (funnel[key].length ? funnel[key].map(row => '<li>' + esc(row.name) + '</li>').join('') : '<li>Sin pacientes</li>') + '</ul></article>').join('') + '</section>';
  }
  function ensureStyle(doc) {
    if (!doc || doc.getElementById('pulzzo-v1-style')) return;
    const style = doc.createElement('style');
    style.id = 'pulzzo-v1-style';
    style.textContent = '.v1-note{margin:8px 0;padding:10px 12px;border:1px solid #d7e3ea;border-radius:12px;background:#f4fafb;color:#07142f;font:500 14px/1.45 sans-serif}.v1-qr{display:inline-block;background:#fff;padding:8px;border-radius:12px;margin:8px 0}.v1-badge{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:#07142f;color:#fff;font-size:12px}.v1-suggest{display:grid;gap:6px;margin-top:8px}.v1-suggest button{text-align:left}.v1-phase{display:grid;gap:8px;padding:12px 0;border-top:1px solid #e2e8f0}.nav-alert{margin:8px;border:0;border-radius:999px;background:#07142f;color:#fff;padding:6px 10px;cursor:pointer}';
    (doc.head || doc.documentElement).appendChild(style);
  }
  function installPatientDirectory(win) {
    const doc = win.document;
    if (!doc.getElementById('doctor-directory-list') || typeof win.renderDoctorDirectory !== 'function') return;
    win.renderDoctorDirectory = function () {
      const list = doc.getElementById('doctor-directory-list');
      const stateSelect = doc.getElementById('doctorDirectoryState');
      if (!list) return;
      const activeState = stateSelect && stateSelect.value || 'Ciudad de México';
      const rows = affiliatedOptions(win.localStorage).filter(row => !activeState || row.state === activeState);
      if (!rows.length) {
        list.innerHTML = '<div class="directory-empty">Aún no tenemos opciones visibles en este estado.<br>Puedes elegir otro estado o continuar y Pulzzo te ayudará a encontrar una opción.</div>';
        return;
      }
      list.innerHTML = rows.map(row => '<button type="button" class="option doctor-option ui-choice" data-value="' + esc(row.id) + '"><div class="doctor-card-body"><b>' + esc(row.displayName) + '</b><span class="provider-type">' + esc(row.specialty || 'Proveedor afiliado') + '</span><span class="provider-location">' + esc([row.city, row.state].filter(Boolean).join(', ')) + '</span></div></button>').join('');
    };
  }
  function installUnaffiliatedSearch(win) {
    const doc = win.document;
    const input = doc.getElementById('doctorName');
    if (!input || input.dataset.v1Search === '1') return;
    input.dataset.v1Search = '1';
    ensureOps(win.localStorage);
    const host = doc.createElement('div');
    host.id = 'v1-doctor-suggest';
    host.className = 'v1-suggest';
    if (input.parentNode) input.parentNode.appendChild(host);
    const paint = () => {
      const matches = searchDoctors(win.localStorage, input.value).slice(0, 6);
      host.innerHTML = matches.map(row => '<button type="button" data-v1-doctor="' + esc(row.id) + '" data-affiliated="' + (row.affiliated ? '1' : '0') + '"><strong>' + esc(row.name) + '</strong><br><small>' + esc(row.affiliated ? (row.specialty || 'Afiliado a PULZZO') : UNAFFILIATED_MARK) + '</small></button>').join('');
    };
    input.addEventListener('input', paint);
    host.addEventListener('click', event => {
      const button = event.target && event.target.closest ? event.target.closest('[data-v1-doctor]') : null;
      if (!button) return;
      const id = button.getAttribute('data-v1-doctor');
      const row = searchDoctors(win.localStorage, input.value).find(item => item.id === id) || unaffiliatedDoctors(win.localStorage).find(item => item.id === id);
      if (!row) return;
      input.value = row.name;
      input.dataset.unaffiliatedId = row.affiliated ? '' : row.id;
      if (!row.affiliated) {
        const phone = doc.getElementById('doctorWhatsApp');
        const key = row.id + '|' + digits(phone && phone.value) + '|' + norm(row.name);
        queueAffiliation(win.localStorage, row, key);
      }
      paint();
    });
    const form = doc.getElementById('procedure-form');
    if (form) form.addEventListener('submit', () => {
      const id = input.dataset.unaffiliatedId;
      if (!id) return;
      const row = unaffiliatedDoctors(win.localStorage).find(item => item.id === id);
      if (!row) return;
      const phone = doc.getElementById('doctorWhatsApp');
      queueAffiliation(win.localStorage, row, id + '|' + digits(phone && phone.value) + '|' + norm(input.value));
    });
  }
  function installDoctorPanel(win) {
    const doc = win.document;
    const nav = doc.getElementById('doctorProfileTabs');
    const panel = doc.getElementById('doctorProfilePanel');
    if (!nav || !panel || nav.dataset.v1Watch === '1') return;
    nav.dataset.v1Watch = '1';
    ensureStyle(doc);
    const extras = [['enlace','Mi enlace'],['pagos','Pagos'],['embudo','Embudo']];
    const paint = which => { panel.innerHTML = doctorPanelHtml(win.localStorage, which); panel.dataset.v1Panel = which; };
    const augment = () => {
      if ((nav.textContent || '').indexOf('Pacientes interesados') === -1) return;
      if (nav.querySelector('[data-v1-doctor-tab]')) return;
      extras.forEach(([id, label]) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'profile-tab ui-selection';
        button.dataset.v1DoctorTab = id;
        button.textContent = label;
        button.addEventListener('click', () => {
          Array.from(nav.querySelectorAll('.profile-tab')).forEach(item => item.classList.remove('active'));
          button.classList.add('active');
          paint(id);
        });
        nav.appendChild(button);
      });
    };
    augment();
    if (typeof MutationObserver === 'function') new MutationObserver(augment).observe(nav, {childList:true});
  }
  function punctualSettingsCard() {
    const settings = punctualSettings(storageOf());
    return '<section class="cfg-area-card"><h3>Cliente puntual</h3><p class="cfg-helper">Regla demo. El aviso y el descuento aplican solo a una oferta nueva. El crédito vigente no cambia de tasa.</p><div class="crmcfg-grid"><label class="field">Pagos puntuales requeridos<input id="v1PunctualPayments" type="number" min="1" max="120" value="' + esc(settings.paymentsRequired) + '"></label><label class="field">Descuento en puntos de tasa<input id="v1PunctualPoints" type="number" min="0" max="80" step="0.01" value="' + esc(settings.discountPoints) + '"></label></div><p class="cfg-helper">También cuenta liquidar el crédito sin ningún pago atrasado. Aviso simulado: ' + esc(NOTICE) + '</p><button type="button" class="btn btn-primary btn-sm" onclick="PulzzoV1.savePunctualFromDom()">Guardar regla de cliente puntual</button><p id="v1PunctualMsg" role="status"></p></section>';
  }
  function paintPunctualBadge(patient) {
    const doc = root && root.document;
    if (!patient && typeof db !== 'undefined' && typeof selectedPatientId !== 'undefined') patient = (db.patients || []).find(item => item && item.id === selectedPatientId);
    if (!doc || !patient) return;
    const host = doc.getElementById && doc.getElementById('patientDetail');
    if (!patient || !host || !host.querySelector) return;
    const settings = punctualSettings(storageOf());
    const result = isPunctual(patient, settings);
    if (!result.eligible) return;
    recordPunctualNotice(storageOf(), patient.id);
    const slot = host.querySelector('.detail-hero-top div') || host;
    if (host.querySelector('[data-punctual-badge]')) return;
    const badge = doc.createElement('p');
    badge.dataset.punctualBadge = '1';
    badge.className = 'v1-badge';
    badge.textContent = 'Cliente puntual';
    const note = doc.createElement('p');
    note.className = 'v1-note';
    note.textContent = NOTICE;
    slot.appendChild(badge);
    slot.appendChild(note);
  }
  function suggestedOfferRate(patient) {
    if (!patient || patient.offer) return null;
    const app = patient.application || {};
    if (app.offerReady || app.offerAccepted || app.contractSigned || app.dispersionDate || app.disbursedAt || app.ordinaryAnnualRate != null) return null;
    const settings = punctualSettings(storageOf());
    const result = isPunctual(patient, settings);
    if (!result.eligible || typeof normalizeOrdinaryAnnualRate !== 'function') return null;
    return preferentialAnnualRate(normalizeOrdinaryAnnualRate(patient), settings, true) * 100;
  }
  function alertCount(storage, actor) {
    const store = crmAdmin(storage);
    if (!store) return 0;
    try {
      const summary = notificationSummary(store.listContacts({}), store.listTasks({}), actor || {role:'admin'}, new Date().toISOString());
      return summary.total;
    } catch (ignore) { return 0; }
  }

  const api = {
    OPS_KEY:OPS_KEY, REF_KEY:REF_KEY, NOTICE:NOTICE, UNAFFILIATED_MARK:UNAFFILIATED_MARK, LEGAL_NOTE:LEGAL_NOTE,
    esc:esc, qrMatrix:qrMatrix, qrSvg:qrSvg, formatBits:formatBits,
    ensureDoctorReferral:ensureDoctorReferral, resolveDoctorReferral:resolveDoctorReferral, referralUrl:referralUrl, tokenFor:tokenFor,
    unaffiliatedDoctors:unaffiliatedDoctors, searchDoctors:searchDoctors, affiliatedOptions:affiliatedOptions,
    queueAffiliation:queueAffiliation, flushAffiliationTasks:flushAffiliationTasks, affiliationTitle:affiliationTitle, ensureAffiliationContact:ensureAffiliationContact,
    saveLandingContact:saveLandingContact,
    officeProgress:officeProgress, funnelStage:funnelStage, doctorFunnel:doctorFunnel, doctorPayouts:doctorPayouts, patientsForDoctor:patientsForDoctor,
    validatePhases:validatePhases, phaseAmounts:phaseAmounts, phasesFor:phasesFor, savePhases:savePhases, releasePhase:releasePhase, phasePanelHtml:phasePanelHtml, defaultPhaseBook:defaultPhaseBook,
    punctualSettings:punctualSettings, savePunctualSettings:savePunctualSettings, isPunctual:isPunctual, preferentialAnnualRate:preferentialAnnualRate, recordPunctualNotice:recordPunctualNotice,
    offerCapDecision:offerCapDecision, extensionMotivo:extensionMotivo, notificationSummary:notificationSummary, toCsv:toCsv, downloadCsv:downloadCsv,
    currentDoctor:currentDoctor, doctorPanelHtml:doctorPanelHtml, punctualSettingsCard:punctualSettingsCard, paintPunctualBadge:paintPunctualBadge, suggestedOfferRate:suggestedOfferRate, alertCount:alertCount,
    downloadDoctorQr:function (token) { const row = resolveDoctorReferral(token); return downloadSvg('pulzzo-referido-' + token + '.svg', qrSvg(referralUrl(token || (row && row.token)))); },
    releasePhaseFromDom:function (node) {
      const box = phaseRoot(node);
      const card = node && node.closest ? node.closest('[data-phase-id]') : null;
      const msg = box && box.querySelector ? box.querySelector('.v1-phase-msg') : null;
      if (!box || !card) return {ok:false};
      const result = releasePhase(storageOf(), box.getAttribute('data-v1-patient'), card.getAttribute('data-phase-id'), {
        total:Number(box.getAttribute('data-v1-total')),
        evidence:(card.querySelector('[data-v1-phase-evidence]') || {}).value,
        kamValidated:!!(card.querySelector('[data-v1-phase-kam]') || {}).checked
      });
      if (msg) msg.textContent = result.ok ? 'Fase liberada en la simulación. La tabla del cliente no cambió.' : result.error;
      if (result.ok && typeof renderPatientDetail === 'function') renderPatientDetail();
      return result;
    },
    savePhasesFromDom:function (node) {
      const box = phaseRoot(node);
      const msg = box && box.querySelector ? box.querySelector('.v1-phase-msg') : null;
      if (!box) return {ok:false};
      const result = savePhases(storageOf(), box.getAttribute('data-v1-patient'), readPhaseDom(box), Number(box.getAttribute('data-v1-total')));
      if (msg) msg.textContent = result.ok ? 'Plantilla guardada para esta oferta.' : result.error;
      if (result.ok && typeof renderPatientDetail === 'function') renderPatientDetail();
      return result;
    },
    addPhaseRow:function (node) {
      const box = phaseRoot(node);
      if (!box || !box.querySelector) return;
      const list = box.querySelector('.v1-phase-list');
      if (!list) return;
      const id = 'fase-' + (list.querySelectorAll('[data-phase-id]').length + 1);
      const item = root.document.createElement('div');
      item.className = 'v1-phase';
      item.setAttribute('data-phase-id', id);
      item.innerHTML = '<label>Fase <input data-v1-phase-label value="Nueva fase"></label><label>% <input data-v1-phase-percent type="number" min="0" max="100" step="0.01" value="0"></label>';
      list.appendChild(item);
    },
    savePunctualFromDom:function () {
      const doc = root.document;
      const result = savePunctualSettings(storageOf(), {paymentsRequired:doc.getElementById('v1PunctualPayments').value, discountPoints:doc.getElementById('v1PunctualPoints').value});
      const msg = doc.getElementById('v1PunctualMsg');
      if (msg) msg.textContent = result.ok ? 'Regla guardada. Solo afecta ofertas nuevas.' : result.error;
      return result;
    },
    boot:function (win) {
      const doc = win && win.document;
      if (!doc) return;
      ensureStyle(doc);
      if (doc.getElementById('doctor-directory-list')) installPatientDirectory(win);
      if (doc.getElementById('doctorName')) installUnaffiliatedSearch(win);
      if (doc.getElementById('doctorProfileTabs')) installDoctorPanel(win);
    }
  };
  return Object.freeze(api);
});
