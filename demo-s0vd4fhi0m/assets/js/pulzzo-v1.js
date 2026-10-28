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
      const db = readOffice(storage), providers = db && Array.isArray(db.providers) ? db.providers.filter(p => p && p.id === id) : [];
      if (providers.length !== 1) return null;
      const provider = providers[0];
      const matches = rows.filter(row => provider.crmIntake && provider.crmIntake.contactId === row.id || provider.doctorAccountId && row.accountId === provider.doctorAccountId);
      return matches.length === 1 && isId(matches[0].assignedKam) ? matches[0].assignedKam : null;
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
    if (!storage || !doctor || !doctor.id || !isId(patientKey)) return null;
    const ops = ensureOps(storage);
    let item = ops.affiliation.find(row => row.doctorId === doctor.id);
    if (!item) {
      // Intake must not change the shared CRM revision while the patient form is open.
      item = {doctorId:doctor.id, name:doctor.name, contactId:null, count:0, patients:[], taskId:null, demo:true};
      ops.affiliation.push(item);
    }
    const key = String(patientKey);
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
      if (!item) return;
      if (!item.contactId) {
        const doctor = unaffiliatedDoctors(storage).find(row => row.id === item.doctorId);
        const contact = doctor && ensureAffiliationContact(storage, doctor);
        if (!contact) return;
        item.contactId = contact.id; changed = true;
      }
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
  // Only an explicit, unique account/provider binding permits portal reads.
  function boundDoctor(storage, doctor) {
    const db = readOffice(storage);
    const providers = db && Array.isArray(db.providers) ? db.providers : [];
    if (!doctor || !isId(doctor.id) || !isId(doctor.accountId)) return null;
    const matches = providers.filter(p => p && p.id === doctor.id);
    if (matches.length !== 1 || matches[0].doctorAccountId !== doctor.accountId || providers.filter(p => p && p.doctorAccountId === doctor.accountId).length !== 1) return null;
    return matches[0];
  }
  function patientsForDoctor(storage, doctor) {
    if (!boundDoctor(storage, doctor)) return [];
    const db = readOffice(storage), rows = Array.isArray(db.patients) ? db.patients : [];
    return rows.filter(patient => {
      if (!patient || !isId(patient.id) || rows.filter(p => p && p.id === patient.id).length !== 1) return false;
      const app = patient.application || {}, offer = patient.offer || {};
      const accounts = [patient.patientAccountId, patient.patient && patient.patient.accountId, app.patientAccountId, patient.demoBridge && patient.demoBridge.patientAccountId].filter(Boolean);
      if (new Set(accounts).size > 1) return false;
      const fromOffer = Array.isArray(offer.financedProcedures) && offer.financedProcedures.length;
      const source = fromOffer ? 'offer' : 'application';
      const procedures = fromOffer ? offer.financedProcedures : Array.isArray(app.procedureProviders) ? app.procedureProviders : [];
      const links = patient.demoServicingIdentity && patient.demoServicingIdentity.procedures || [];
      const resolved = procedures.map((p, index) => {
        if (!p || typeof p !== 'object') return {};
        // Existing reconciliation sidecars are valid only for the exact source snapshot.
        const signature = JSON.stringify(['id','procedureId','providerId','doctorId','procedure','procedureName','name','provider','providerName','cost','approvedCost','selected'].map(key => [key,p[key] == null ? null : p[key]]));
        const matches = Array.isArray(links) ? links.filter(link => link.sourceKind === source && link.sourceIndex === index && link.sourceSignature === signature) : [];
        const mapped = matches.length === 1 ? matches[0] : {};
        return {id:p.procedureId || p.id || mapped.procedureId, providerId:p.providerId || p.doctorId || mapped.providerId, selected:p.selected !== false};
      });
      return resolved.some(p => isId(p.id) && p.selected && p.providerId === doctor.id && resolved.filter(other => other.id === p.id).length === 1);
    });
  }
  function doctorFunnel(storage, doctor) {
    const buckets = {interesados:[], en_solicitud:[], aprobados:[], firmados:[], dispersados:[]};
    patientsForDoctor(storage, doctor).forEach(patient => {
      const stage = funnelStage(patient);
      buckets[stage].push({id:patient.id, name:patient.patient && patient.patient.fullName || patient.id, status:patient.application && patient.application.applicationStatus || ''});
    });
    const seen = new Set(patientsForDoctor(storage, doctor).flatMap(p => [p.crmIntake && p.crmIntake.contactId, p.crmContactId]).filter(Boolean));
    try {
      const store = crmAdmin(storage);
      const id = doctor && doctor.id;
      if (store && id && boundDoctor(storage, doctor)) (store.listContacts({type:'patient'}) || []).forEach(contact => {
        if (contact.referringDoctorId !== id || seen.has(contact.id)) return;
        const stage = contact.stage === 'submitted' || contact.stage === 'application_started' ? 'en_solicitud' : (contact.stage === 'not_interested' || contact.stage === 'no_response' ? '' : 'interesados');
        if (!stage) return;
        seen.add(contact.id);
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
  // Received cuts for the verified shared holder stay in memory, outside the locked capture.
  const sharedDoctorCuts = new Map();
  function sharedDoctorEligible(storage, doctor) {
    const context = root && root.PulzzoSharedDoctorOnboarding?.context;
    if (!root?.PulzzoSharedDoctorBridge || !context?.isHolder || !context.isVerified || context.actor?.id !== doctor.accountId || !context.isCurrent() || !boundDoctor(storage, doctor)) return false;
    const provider = (readOffice(storage)?.providers || []).find(p => p.id === doctor.id);
    return provider?.onboarding?.approved === true && provider.crmIntake?.expedientId === context.expId;
  }
  function receiveSharedDoctorPayments(storage) {
    const doctor = currentDoctor(storage), service = root && root.PulzzoDemoServicing;
    if (!sharedDoctorEligible(storage, doctor) || !service) throw Error('Abre la cuenta del titular aprobado para recibir sus pagos.');
    const key = doctor.accountId + ':' + doctor.id;
    const envelope = service.receive(storageOf(storage), 'doctor_servicing', doctor.accountId, doctor.id, sharedDoctorCuts.get(key));
    if (!service.validCached(envelope, {kind:'doctor_servicing', accountId:doctor.accountId, applicationId:doctor.id, providerId:doctor.id}) || envelope.payload.doctorAccountId !== doctor.accountId || envelope.payload.providerId !== doctor.id || !Array.isArray(envelope.payload.rows)) throw Error('La proyección no corresponde a esta cuenta y proveedor.');
    sharedDoctorCuts.set(key, envelope);
    return doctorPayouts(storage, doctor);
  }
  function doctorProjection(storage, doctor) {
    if (!boundDoctor(storage, doctor)) return null;
    try {
      const bridge = root && (root.PulzzoSharedDoctorBridge || root.PulzzoDoctorDemoBridge);
      const state = bridge ? bridge.getState() : JSON.parse(storageOf(storage).getItem('pulzzoDoctorOnboardingCleanV3') || 'null');
      const shared = !!root?.PulzzoSharedDoctorBridge;
      const formId = shared ? root.PulzzoSharedDoctorOnboarding?.context?.formIdentityId : doctor.accountId;
      if (bridge && bridge.account()?.doctorAccountId !== formId) return null;
      if (!state || state.doctorAccountId !== formId || (shared ? !sharedDoctorEligible(storage, doctor) : state.demoProviderId !== doctor.id)) return null;
      const service = root && root.PulzzoDemoServicing || (typeof module === 'object' && module.exports ? require('./demo-servicing.js') : null);
      const e = shared ? sharedDoctorCuts.get(doctor.accountId + ':' + doctor.id) : state.servicingProjection;
      if (!service || !service.validCached(e, {kind:'doctor_servicing', accountId:doctor.accountId, applicationId:doctor.id, providerId:doctor.id})) return null;
      if (e.payload.doctorAccountId !== doctor.accountId || e.payload.providerId !== doctor.id || !Array.isArray(e.payload.rows)) return null;
      return e;
    } catch (ignore) { return null; }
  }
  function doctorPayouts(storage, doctor) {
    const rows = [], envelope = doctorProjection(storage, doctor);
    const projection = envelope ? envelope.payload.rows : [];
    const keys = projection.map(p => p.applicationId + ':' + p.procedureId);
    const payouts = projection.flatMap(p => (p.payouts || []).map(pay => ({p, pay})));
    projection.forEach(p => {
      if (!isId(p.applicationId) || !isId(p.procedureId) || keys.filter(key => key === p.applicationId + ':' + p.procedureId).length !== 1) return;
      (p.payouts || []).forEach(item => {
        if (!isId(item.payoutId) || !Number.isFinite(item.amount) || item.amount < 0 || payouts.filter(x => x.p.applicationId === p.applicationId && x.pay.payoutId === item.payoutId).length !== 1) return;
        // The existing office engine already normalizes each payout status.
        const paid = item.status === 'Dispersada';
        rows.push({id:p.applicationId + ':' + item.payoutId, patient:p.patientName, procedureId:p.procedureId,
          amount:item.amount, status:paid ? 'pagado' : 'pendiente', date:item.paidAt || '', reference:item.reference || item.payoutId, demo:true});
      });
    });
    const pending = rows.filter(row => row.status !== 'pagado').reduce((sum, row) => sum + row.amount, 0);
    const paid = rows.filter(row => row.status === 'pagado').reduce((sum, row) => sum + row.amount, 0);
    const upcoming = rows.filter(row => row.status !== 'pagado').slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return {rows, pending:Math.round(pending * 100) / 100, paid:Math.round(paid * 100) / 100, upcoming,
      available:!!envelope, calculatedAt:envelope && envelope.generatedAt || '', demo:true};
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
      releasedBy:phase.releasedBy || '',
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
  function phaseActor() {
    try {
      const access = root && root.PulzzoStaffAccess;
      const current = root && typeof root.staffCurrentSession === 'function' ? root.staffCurrentSession() : access && access.getSession();
      return current && access && access.can(current, 'authorizeDisbursement') ? current : null;
    } catch (ignore) { return null; }
  }
  function phasePermissionFailure() { return {ok:false, error:'Tu sesión no permite autorizar dispersiones. No se guardó ningún cambio.'}; }
  function savePhases(storage, patientId, phases, total, allocationId) {
    if (!phaseActor()) return phasePermissionFailure();
    if (root && root.PulzzoPhaseLedger) return root.PulzzoPhaseLedger.save(patientId, allocationId, phases, total);
    if (root && root.document) return {ok:false,error:'No hay conexión con la cartera de esta demo.'};
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
    const actor = phaseActor();
    if (!actor) return phasePermissionFailure();
    if (root && root.PulzzoPhaseLedger) return root.PulzzoPhaseLedger.release(patientId, input && input.allocationId, phaseId, input || {});
    if (root && root.document) return {ok:false,error:'No hay conexión con la cartera de esta demo.'};
    storage = storageOf(storage);
    input = input || {};
    const ops = readOps(storage) || freshOps();
    const savedBook = ops.phases[patientId];
    if (savedBook && input.total !== undefined && Number(input.total) !== Number(savedBook.total)) return {ok:false, error:'El total de la plantilla cambió. Recarga antes de liberar; no se recalcularon fases existentes.'};
    const total = savedBook ? Number(savedBook.total) : Number(input.total) || 0;
    const book = ops.phases[patientId] && Array.isArray(ops.phases[patientId].phases) ? ops.phases[patientId] : defaultPhaseBook(total);
    book.phases = phaseAmounts(total, book.phases);
    const index = book.phases.findIndex(phase => phase.id === phaseId);
    if (index < 0) return {ok:false, error:'No se encontró la fase.'};
    if (book.phases.some((phase, i) => i < index && phase.status !== 'liberada')) return {ok:false, error:'Libera primero la fase anterior.'};
    const evidence = String(input.evidence || '').trim();
    if (!evidence) return {ok:false, error:'Agrega la evidencia del doctor para esta fase.'};
    if (input.kamValidated !== true) return {ok:false, error:'Falta la validación del KAM.'};
    if (book.phases[index].status === 'liberada') return {ok:false, error:'Esta fase ya fue liberada.'};
    book.phases[index] = Object.assign({}, book.phases[index], {status:'liberada', evidence:evidence, kamValidated:true, releasedAt:new Date().toISOString(), releasedBy:actor.id, demo:true});
    book.legalNote = LEGAL_NOTE;
    book.demo = true;
    book.total = total;
    ops.phases[patientId] = book;
    writeOps(storage, ops);
    return {ok:true, book:book, demo:true};
  }
  function formatPhasePercent(sum) {
    const rounded = Math.round(Number(sum) * 100) / 100;
    const pct = Number.isFinite(rounded) ? (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)) : '0';
    return pct + '%';
  }
  function releaseHint(priorReleased, evidence, kamOn) {
    const missing = [];
    if (!priorReleased) missing.push('la fase anterior');
    if (!String(evidence || '').trim()) missing.push('la evidencia del doctor');
    if (!kamOn) missing.push('la validación del KAM');
    if (!missing.length) return '';
    if (missing.length === 1) return 'Falta ' + missing[0] + '.';
    return 'Falta ' + missing.slice(0, -1).join(', ') + ' y ' + missing[missing.length - 1] + '.';
  }
  function phaseRowHtml(phase, locked, priorReleased) {
    const released = phase.status === 'liberada';
    const tone = released ? 'liberada' : (phase.kamValidated ? 'validada' : 'pendiente');
    const label = released ? 'Liberada' : (phase.kamValidated ? 'Validada' : 'Pendiente');
    const ro = (locked || released || !phaseActor()) ? ' readonly' : '';
    const evidence = released
      ? '<span class="v1-evidence-done">' + esc(phase.evidence || '—') + '</span>'
      : '<input class="v1-evidence" data-v1-phase-evidence placeholder="Nota ficticia de evidencia" value="' + esc(phase.evidence || '') + '"' + (!phaseActor() ? ' disabled' : '') + ' oninput="PulzzoV1.syncPhasePanel(this)">';
    const kam = '<input data-v1-phase-kam type="checkbox" aria-label="Validación KAM"' + (released || phase.kamValidated ? ' checked' : '') + (released || !phaseActor() ? ' disabled' : ' onchange="PulzzoV1.syncPhasePanel(this)"') + '>';
    const ready = Number(phase.amount)>0 && !!phaseActor() && !released && priorReleased && String(phase.evidence || '').trim() && phase.kamValidated === true;
    const hint = !phaseActor() ? 'Tu sesión no permite autorizar dispersiones.' : ready ? '' : releaseHint(priorReleased, phase.evidence, phase.kamValidated === true);
    const action = released
      ? '<span class="v1-released-ref">Liberada</span>'
      : '<button type="button" class="btn btn-primary btn-sm v1-release" onclick="PulzzoV1.releasePhaseFromDom(this)"' + (hint ? ' title="' + esc(hint) + '"' : '') + (ready ? '' : ' disabled') + '>Liberar</button>';
    return '<tr class="v1-phase" data-phase-id="' + esc(phase.id) + '" data-phase-status="' + esc(released ? 'liberada' : 'pendiente') + '"><td><input class="v1-phase-name" data-v1-phase-label value="' + esc(phase.label) + '"' + ro + ' oninput="PulzzoV1.syncPhasePanel(this)"></td><td><input class="v1-phase-pct" data-v1-phase-percent type="number" min="0" max="100" step="0.01" value="' + esc(phase.percent) + '"' + ro + ' oninput="PulzzoV1.syncPhasePanel(this)"></td><td class="v1-phase-money" data-v1-phase-amount>' + esc(money(phase.amount)) + '</td><td><span class="v1-pill" data-tone="' + tone + '">' + esc(label) + '</span></td><td>' + evidence + '</td><td class="v1-kam">' + kam + '</td><td class="v1-action">' + action + '</td></tr>';
  }
  function phasePanelHtml(patient, allocation) {
    const storage = storageOf();
    if (!allocation && root && root.PulzzoPhaseLedger) {
      const legacy = readOps(storage);
      if (legacy && legacy.phases && legacy.phases[patient.id] && legacy.phases[patient.id].phases.some(p => p.status === 'liberada')) return '<section class="v1-phases"><p>Las fases históricas requieren conciliación: no se duplicaron ni migraron sus liberaciones a cartera.</p></section>';
      const targets = root.PulzzoPhaseLedger.targets(patient.id).filter(t => t.valid);
      return targets.length ? targets.map(t => phasePanelHtml(patient, t)).join('') : '<section class="v1-phases"><p>Vincula proveedor, procedimiento y dispersión mediante IDs únicos en la integración demo antes de configurar fases.</p></section>';
    }
    const total = allocation ? allocation.total : offerTotal(patient);
    const book = allocation ? (allocation.phases.length ? allocation : defaultPhaseBook(total)) : phasesFor(storage, patient && patient.id, total);
    if (allocation && allocation.locked && !allocation.phases.length) return '<section class="v1-phases"><p>' + esc(allocation.provider + ' · ' + allocation.concept) + ': dispersión ya registrada; no se crea otra por fases.</p></section>';
    const locked = book.phases.some(phase => phase.status === 'liberada');
    let prior = true;
    const rows = book.phases.map(phase => {
      const html = phaseRowHtml(phase, locked, prior);
      if (phase.status !== 'liberada' && Number(phase.amount)>0) prior = false;
      return html;
    }).join('');
    const sum = Math.round(book.phases.reduce((acc, phase) => acc + Number(phase.percent), 0) * 100) / 100;
    const amount = Math.round(book.phases.reduce((acc, phase) => acc + Number(phase.amount || 0), 0) * 100) / 100;
    const off = Math.abs(sum - 100) > 0.001;
    const footer = locked ? '' : '<div class="action-bar v1-phase-footer"><button type="button" class="btn btn-secondary btn-sm" onclick="PulzzoV1.addPhaseRow(this)"' + (!phaseActor() ? ' disabled' : '') + '>Agregar fase</button><button type="button" class="btn btn-primary btn-sm" data-v1-save-phases onclick="PulzzoV1.savePhasesFromDom(this)"' + (off || !phaseActor() ? ' disabled' : '') + '>Guardar porcentajes</button></div>';
    return '<section class="dispersion-block v1-phases" data-v1-allocation="' + esc(allocation && allocation.allocationId || '') + '" data-v1-patient="' + esc(patient && patient.id) + '" data-v1-total="' + esc(total) + '"><div class="dispersion-block-head"><div class="v1-phase-heading"><div class="v1-phase-title"><h4>Dispersión por fases</h4><span class="v1-legal-chip">' + esc(LEGAL_NOTE) + '</span></div><p>Simulación. Cada fase se libera aparte. La tabla del cliente sigue siendo una sola, sobre el total.</p>' + (allocation ? '<p>' + esc(allocation.provider + ' · ' + allocation.concept + ' · ' + allocation.providerId + ' / ' + allocation.procedureId) + '</p><label>Fecha de dispersión <input type="date" data-v1-phase-date' + (!phaseActor() ? ' disabled' : '') + '></label>' : '') + '</div></div><div class="v1-phase-table-wrap"><table class="v1-phase-table"><colgroup><col class="c-name"><col class="c-pct"><col class="c-money"><col class="c-state"><col class="c-evidence"><col class="c-kam"><col class="c-action"></colgroup><thead><tr><th>Fase</th><th>%</th><th>Monto</th><th>Estado</th><th>Evidencia del doctor (demo)</th><th>Validación KAM</th><th>Acción</th></tr></thead><tbody class="v1-phase-list">' + rows + '</tbody><tfoot><tr class="v1-phase-total"><td>Total</td><td data-v1-phase-total>' + esc(formatPhasePercent(sum)) + '</td><td class="v1-phase-money" data-v1-phase-amount-total>' + esc(money(amount)) + '</td><td colspan="4"><span class="v1-phase-warn" data-v1-phase-warn' + (off ? '' : ' hidden') + '>Los porcentajes deben sumar 100%.</span></td></tr></tfoot></table></div>' + footer + '<p class="v1-phase-msg" role="status"></p></section>';
  }
  function syncPhasePanel(node) {
    const box = phaseRoot(node);
    if (!box || !box.querySelectorAll) return;
    const total = Number(box.getAttribute('data-v1-total')) || 0;
    const rows = Array.from(box.querySelectorAll('[data-phase-id]'));
    const draft = rows.map(row => ({
      id:row.getAttribute('data-phase-id'),
      label:(row.querySelector('[data-v1-phase-label]') || {}).value || '',
      percent:(row.querySelector('[data-v1-phase-percent]') || {}).value
    }));
    const safe = draft.map(row => ({percent:Number.isFinite(Number(row.percent)) ? Number(row.percent) : 0}));
    const amounts = phaseAmounts(total, safe);
    const checked = validatePhases(draft);
    let priorOk = true;
    rows.forEach((row, index) => {
      const moneyCell = row.querySelector('[data-v1-phase-amount]');
      if (moneyCell) moneyCell.textContent = money(amounts[index].amount);
      const released = row.getAttribute('data-phase-status') === 'liberada';
      const kam = row.querySelector('[data-v1-phase-kam]');
      const evidence = row.querySelector('[data-v1-phase-evidence]');
      const pill = row.querySelector('.v1-pill');
      if (pill && !released) {
        const validada = !!(kam && kam.checked);
        pill.setAttribute('data-tone', validada ? 'validada' : 'pendiente');
        pill.textContent = validada ? 'Validada' : 'Pendiente';
      }
      const button = row.querySelector('.v1-release');
      if (button) {
        const evidenceText = evidence ? evidence.value : '';
        const kamOn = !!(kam && kam.checked);
        const canRelease = Number(amounts[index].amount)>0 && !!phaseActor() && priorOk && String(evidenceText || '').trim() && kamOn;
        button.disabled = !canRelease;
        const hint = !phaseActor() ? 'Tu sesión no permite autorizar dispersiones.' : releaseHint(priorOk, evidenceText, kamOn);
        if (hint) button.title = hint;
        else button.removeAttribute('title');
      }
      if (!released && Number(amounts[index].amount)>0) priorOk = false;
    });
    const sum = Math.round(safe.reduce((acc, row) => acc + row.percent, 0) * 100) / 100;
    const sumAmount = Math.round(amounts.reduce((acc, row) => acc + Number(row.amount || 0), 0) * 100) / 100;
    const totalNode = box.querySelector('[data-v1-phase-total]');
    if (totalNode) totalNode.textContent = formatPhasePercent(sum);
    const amountNode = box.querySelector('[data-v1-phase-amount-total]');
    if (amountNode) amountNode.textContent = money(sumAmount);
    const warn = box.querySelector('[data-v1-phase-warn]');
    if (warn) {
      warn.hidden = checked.ok;
      warn.textContent = checked.ok ? 'Los porcentajes deben sumar 100%.' : checked.error;
    }
    const save = box.querySelector('[data-v1-save-phases]');
    if (save) save.disabled = !checked.ok || !phaseActor();
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
    const empty = {id:'', name:'Doctor demo', email:'', accountId:''};
    try {
      const bridge = root && (root.PulzzoSharedDoctorBridge || root.PulzzoDoctorDemoBridge);
      if (root?.PulzzoSharedDoctorBridge && (!root.PulzzoSharedDoctorOnboarding?.context?.isHolder || !root.PulzzoSharedDoctorOnboarding.context.isCurrent())) return empty;
      // In the browser the bridge checks the current holder and stale sessions.
      if (root && root.document && !bridge) return empty;
      const account = bridge ? bridge.account() : JSON.parse(storage.getItem('pulzzo_doctor') || 'null');
      const profile = bridge ? bridge.getState() : JSON.parse(storage.getItem('pulzzoDoctorOnboardingCleanV3') || 'null');
      const context = root?.PulzzoSharedDoctorBridge ? root.PulzzoSharedDoctorOnboarding?.context : null;
      const id = context ? (context.isVerified ? context.actor?.id : '') : account && account.doctorAccountId;
      const formId = context ? context.formIdentityId : id;
      if (!isId(id) || !profile || profile.doctorAccountId !== formId || account?.doctorAccountId !== formId) return empty;
      const db = readOffice(storage), providers = db && Array.isArray(db.providers) ? db.providers : [];
      const matches = providers.filter(p => p && p.doctorAccountId === id);
      if (matches.length !== 1) return empty;
      const provider = matches[0];
      if (context && (provider.crmIntake?.expedientId !== context.expId || provider.onboarding?.approved !== true)) return empty;
      const doctor = {id:provider.id, accountId:id, name:profile.profile && (profile.profile.publicName || profile.profile.name) || 'Doctor demo', email:''};
      return boundDoctor(storage, doctor) ? doctor : empty;
    } catch (ignore) { return empty; }
  }
  function referralCard(storage, doctor) {
    const row = ensureDoctorReferral(storage, doctor);
    if (!row) return '<p class="v1-note">El enlace de referido aparece cuando el doctor tiene un identificador demo.</p>';
    const svg = qrSvg(row.url);
    return '<section class="v1-referral"><h3>Enlace de referido</h3><p class="v1-note">Demostración en este navegador. Quien se registre con este enlace queda ligado a este doctor y, si ya tiene KAM, a ese KAM.</p><p><a href="' + esc(row.path) + '">' + esc(row.url) + '</a></p>' + (svg ? '<div class="v1-qr">' + svg + '</div><button type="button" class="btn btn-secondary btn-sm" onclick="PulzzoV1.downloadDoctorQr(\'' + esc(row.token) + '\')">Descargar QR</button>' : '<p>El enlace es demasiado largo para el QR demo. Cópialo.</p>') + '</section>';
  }
  function doctorPanelHtml(storage, which) {
    const doctor = currentDoctor(storage);
    if (!doctor.id) return '<p class="v1-note" role="status">Pendiente de vincular esta cuenta con un proveedor mediante su ID. Los nombres no otorgan acceso a pacientes ni pagos.</p>';
    if (which === 'enlace') return referralCard(storage, doctor);
    if (which === 'pagos') {
      const report = doctorPayouts(storage, doctor);
      if (!report.available) return '<section class="v1-payouts"><h3>Mis pagos</h3><p class="v1-note" role="status">Actualiza tus pagos para consultar la información disponible en esta demo.</p></section>';
      const list = report.upcoming.map(row => '<div class="v1-payment-item"><div><strong>' + esc(row.patient) + '</strong><span>' + esc(row.date || 'Fecha por definir') + (row.label ? ' · ' + esc(row.label) : '') + '</span></div><strong>' + esc(money(row.amount)) + '</strong></div>').join('');
      return '<section class="v1-payouts"><h3>Mis pagos</h3><p class="v1-note">Demo · Actualizado el ' + esc(new Date(report.calculatedAt).toLocaleString('es-MX', {timeZone:'America/Mexico_City',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})) + '</p><div class="v1-payment-summary"><article><span>Pendiente</span><strong>' + esc(money(report.pending)) + '</strong></article><article><span>Pagado</span><strong>' + esc(money(report.paid)) + '</strong></article></div><h4>Próximos pagos</h4>' + (list ? '<div class="v1-payment-list">' + list + '</div>' : '<div class="v1-payment-empty"><strong>Sin pagos próximos</strong><p>Los pagos programados aparecerán aquí.</p></div>') + '</section>';

    }
    const funnel = doctorFunnel(storage, doctor);
    const labels = [['interesados','Interesados'],['en_solicitud','En solicitud'],['aprobados','Aprobados'],['firmados','Firmados'],['dispersados','Dispersados']];
    return '<section class="v1-funnel"><h3>Embudo de pacientes</h3><p class="v1-note">Conteo demo de expedientes vinculados por ID y referidos con atribución verificada. Los nombres iguales no crean vínculos.</p>' + labels.map(([key, label]) => '<article><h4>' + label + ' · ' + funnel[key].length + '</h4><ul>' + (funnel[key].length ? funnel[key].map(row => '<li>' + esc(row.name) + '</li>').join('') : '<li>Sin pacientes</li>') + '</ul></article>').join('') + '</section>';
  }
  function ensureStyle(doc) {
    if (!doc || doc.getElementById('pulzzo-v1-style')) return;
    const style = doc.createElement('style');
    style.id = 'pulzzo-v1-style';
    style.textContent = '.v1-payment-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:24px 0}.v1-payment-summary article{border:1px solid var(--line,#d7e3ea);border-radius:18px;padding:20px;background:#fff}.v1-payment-summary span{display:block;color:var(--muted,#62718a);font-size:14px;margin-bottom:8px}.v1-payment-summary strong{display:block;color:var(--navy,#07142f);font-size:28px;font-weight:650}.v1-payment-empty{border:1px solid var(--line,#d7e3ea);background:var(--soft,#f6fafb);border-radius:16px;padding:24px;margin:12px 0 24px;text-align:center}.v1-payment-empty p{margin:8px 0 0;color:var(--muted,#62718a)}.v1-payment-item{display:flex;justify-content:space-between;gap:16px;padding:16px;border-bottom:1px solid var(--line,#d7e3ea)}.v1-payment-item span{display:block;margin-top:6px;color:var(--muted,#62718a)}@media(max-width:480px){.v1-payment-summary{gap:10px}.v1-payment-summary article{padding:14px}.v1-payment-summary strong{font-size:23px}}.v1-funnel ul{list-style:none;padding:0;margin:8px 0}.v1-funnel li{padding:10px 12px;border-bottom:1px solid var(--line,#d7e3ea)}.v1-funnel li:before{content:"•";color:var(--aqua,#19bdca);margin-right:8px}.v1-note{margin:8px 0;padding:10px 12px;border:1px solid #d7e3ea;border-radius:12px;background:#f4fafb;color:#07142f;font:500 14px/1.45 sans-serif}.v1-qr{display:inline-block;background:#fff;padding:8px;border-radius:12px;margin:8px 0}.v1-badge{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:#07142f;color:#fff;font-size:12px}.v1-suggest{display:grid;gap:6px;margin-top:8px}.v1-suggest button{text-align:left}.nav-alert{margin:8px;border:0;border-radius:999px;background:#07142f;color:#fff;padding:6px 10px;cursor:pointer}';
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
  function affiliationPatientKey(win) {
    const context = typeof win.getPatientPortalContext === 'function' && win.getPatientPortalContext();
    if (context) {
      context.assertFresh();
      const id = context.accountId;
      if (isId(id)) return 'account:' + id;
      return isId(context.expId) ? 'expedient:' + context.expId : null;
    }
    const bridge = win.PulzzoPatientDemoBridge;
    if (!bridge || typeof bridge.assertFresh !== 'function') return null;
    bridge.assertFresh();
    const account = bridge.getAccount(), state = bridge.getState();
    const id = account && account.patientAccountId;
    return isId(id) && state && state.patientAccountId === id ? 'account:' + id : null;
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
      const prefix=doc.getElementById('doctorPrefix');if(prefix&&/^Dra?\.\s/i.test(row.name))prefix.value=/^Dra\./i.test(row.name)?'Dra.':'Dr.';
      if(prefix)input.value=row.name.replace(/^Dra?\.\s*/i,'');
      input.dataset.unaffiliatedId = row.affiliated ? '' : row.id;
      if (!row.affiliated) {
        const key = affiliationPatientKey(win);
        if (key) queueAffiliation(win.localStorage, row, key);
      }
      paint();
    });
    const form = doc.getElementById('procedure-form');
    if (form) form.addEventListener('submit', () => {
      const id = input.dataset.unaffiliatedId;
      if (!id) return;
      const row = unaffiliatedDoctors(win.localStorage).find(item => item.id === id);
      if (!row) return;
      const key = affiliationPatientKey(win);
      if (key) queueAffiliation(win.localStorage, row, key);
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
    const mobile = doc.getElementById('doctorProfileMobileMenu');
    const paint = (which, label) => {
      panel.innerHTML = doctorPanelHtml(win.localStorage, which); panel.dataset.v1Panel = which;
      if (which === 'pagos' && sharedDoctorEligible(win.localStorage, currentDoctor(win.localStorage))) {
        const receive = doc.createElement('button'); receive.type = 'button'; receive.className = 'profile-btn profile-btn-coral'; receive.textContent = 'Actualizar mis pagos';
        const status = doc.createElement('p'); status.setAttribute('role', 'status');
        receive.onclick = () => {try {receiveSharedDoctorPayments(win.localStorage); paint(which, label);} catch(error) {status.textContent = error.message;}};
        panel.appendChild(receive); panel.appendChild(status);
      }
      Array.from(nav.querySelectorAll('.profile-tab')).forEach(item => item.classList.toggle('active', item.dataset.v1DoctorTab === which));
      const toggle = doc.getElementById('doctorProfileMobileToggle'), mobileNav = doc.getElementById('doctorProfileMobileNav');
      const current = toggle && toggle.querySelector('.profile-mobile-section-label');
      if (current) current.textContent = label;
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
      if (mobileNav) mobileNav.classList.remove('open');
      if (mobile) Array.from(mobile.querySelectorAll('button')).forEach(item => item.classList.toggle('active', item.dataset.v1DoctorTab === which));
    };
    const augment = () => {
      if ((nav.textContent || '').indexOf('Pacientes interesados') === -1 && !sharedDoctorEligible(win.localStorage, currentDoctor(win.localStorage))) return;
      for (const target of [nav, mobile].filter(Boolean)) {
        if (target.querySelector('[data-v1-doctor-tab]')) continue;
        extras.forEach(([id, label]) => {
          const button = doc.createElement('button');
          button.type = 'button';
          button.className = target === nav ? 'profile-tab ui-selection' : 'profile-mobile-section-option ui-selection';
          button.dataset.v1DoctorTab = id;
          button.textContent = label;
          button.addEventListener('click', event => { event.stopPropagation(); paint(id, label); });
          target.appendChild(button);
        });
      }
    };
    augment();
    if (typeof MutationObserver === 'function') {
      const observer = new MutationObserver(augment);
      observer.observe(nav, {childList:true});
      if (mobile) observer.observe(mobile, {childList:true});
    }
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
    affiliationPatientKey:affiliationPatientKey, queueAffiliation:queueAffiliation, flushAffiliationTasks:flushAffiliationTasks, affiliationTitle:affiliationTitle, ensureAffiliationContact:ensureAffiliationContact,
    saveLandingContact:saveLandingContact,
    officeProgress:officeProgress, funnelStage:funnelStage, doctorFunnel:doctorFunnel, doctorPayouts:doctorPayouts, receiveSharedDoctorPayments:receiveSharedDoctorPayments, patientsForDoctor:patientsForDoctor,
    validatePhases:validatePhases, phaseAmounts:phaseAmounts, phasesFor:phasesFor, savePhases:savePhases, releasePhase:releasePhase, phasePanelHtml:phasePanelHtml, syncPhasePanel:syncPhasePanel, defaultPhaseBook:defaultPhaseBook,
    punctualSettings:punctualSettings, savePunctualSettings:savePunctualSettings, isPunctual:isPunctual, preferentialAnnualRate:preferentialAnnualRate, recordPunctualNotice:recordPunctualNotice,
    offerCapDecision:offerCapDecision, extensionMotivo:extensionMotivo, notificationSummary:notificationSummary, toCsv:toCsv, downloadCsv:downloadCsv,
    currentDoctor:currentDoctor, doctorProjection:doctorProjection, doctorPanelHtml:doctorPanelHtml, punctualSettingsCard:punctualSettingsCard, paintPunctualBadge:paintPunctualBadge, suggestedOfferRate:suggestedOfferRate, alertCount:alertCount,
    downloadDoctorQr:function (token) { const row = resolveDoctorReferral(token); return downloadSvg('pulzzo-referido-' + token + '.svg', qrSvg(referralUrl(token || (row && row.token)))); },
    releasePhaseFromDom:function (node) {
      const box = phaseRoot(node);
      const card = node && node.closest ? node.closest('[data-phase-id]') : null;
      const msg = box && box.querySelector ? box.querySelector('.v1-phase-msg') : null;
      if (!box || !card) return {ok:false};
      const result = releasePhase(storageOf(), box.getAttribute('data-v1-patient'), card.getAttribute('data-phase-id'), {
        allocationId:box.getAttribute('data-v1-allocation'),
        date:(box.querySelector('[data-v1-phase-date]') || {}).value,
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
      const result = savePhases(storageOf(), box.getAttribute('data-v1-patient'), readPhaseDom(box), Number(box.getAttribute('data-v1-total')), box.getAttribute('data-v1-allocation'));
      if (msg) msg.textContent = result.ok ? 'Plantilla guardada para esta oferta.' : result.error;
      if (result.ok && typeof renderPatientDetail === 'function') renderPatientDetail();
      return result;
    },
    addPhaseRow:function (node) {
      const box = phaseRoot(node);
      if (!box || !box.querySelector || !root.document) return;
      const list = box.querySelector('.v1-phase-list');
      if (!list) return;
      const id = 'fase-' + (list.querySelectorAll('[data-phase-id]').length + 1);
      const holder = root.document.createElement('tbody');
      holder.innerHTML = phaseRowHtml({id:id, label:'Nueva fase', percent:0, amount:0, status:'pendiente', evidence:'', kamValidated:false}, false, false);
      const item = holder.querySelector('tr');
      if (!item) return;
      list.appendChild(item);
      syncPhasePanel(item);
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
