'use strict';
// Standalone contract regressions: real application actions in a minimal DOM/VM.
// This suite does not launch a browser or claim geometry/visual validation.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../backoffice.html'), 'utf8');
const script = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .find(match => match[1].includes('const baseState='))[1];
const css = fs.readFileSync(path.join(__dirname, '../assets/css/backoffice-refinement.css'), 'utf8');

function runtime(saved) {
  const elements = new Map();
  const storage = new Map(saved || []);
  let writes = 0;
  const document = { activeElement: null };
  function el(id) {
    if (elements.has(id)) return elements.get(id);
    const classes = new Set();
    const attributes = new Map();
    const element = {
      id, value: '', dataset: {}, style: {}, innerHTML: '', textContent: '',
      checked: false, disabled: false, files: [], className: '', isConnected: true,
      classList: {
        add(...items) { items.forEach(item => classes.add(item)); },
        remove(...items) { items.forEach(item => classes.delete(item)); },
        contains(item) { return classes.has(item); },
        toggle(item, force) {
          const present = force === undefined ? !classes.has(item) : !!force;
          if (present) classes.add(item); else classes.delete(item);
          return present;
        }
      },
      querySelector() { return null; }, querySelectorAll() { return []; },
      addEventListener() {}, removeEventListener() {},
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.get(name) || null; },
      removeAttribute(name) { attributes.delete(name); },
      focus() { document.activeElement = this; this.focused = true; },
      scrollIntoView() {}, click() {}, remove() {}
    };
    elements.set(id, element);
    return element;
  }
  Object.assign(document, {
    querySelector: selector => el(selector.replace(/^#/, '')),
    querySelectorAll: () => [], getElementById: id => elements.get(id) || null,
    addEventListener() {}, createElement: tag => el(tag),
    body: { appendChild() {}, classList: { add() {}, remove() {}, toggle() {} } }
  });
  const FixedDate = class extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-10-08T12:00:00Z'])); }
    static now() { return new Date('2026-10-08T12:00:00Z').getTime(); }
  };
  const context = vm.createContext({
    document, localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => { writes++; storage.set(key, String(value)); },
      removeItem: key => { writes++; storage.delete(key); }
    },
    window: { scrollTo() {}, PulzzoDemoBridge: require('../assets/pulzzo-demo-bridge.js') }, Date: FixedDate, console, Intl, Blob, URL,
    setTimeout() {}, clearTimeout() {}, requestAnimationFrame: fn => fn(), innerWidth: 1200
  });
  vm.runInContext(script, context);
  const run = code => vm.runInContext(code, context);
  // Preserve the review renderer, modal lifecycle, permissions, persistence and
  // canonical document/correction handlers. Only unrelated page repaint is stubbed.
  run("render=()=>{};renderPatientDetail=()=>{};renderPatients=()=>{};renderProviders=()=>{};session=users.find(user=>user.role==='admin');");
  return { run, el, document, storage, writes: () => writes };
}

function fixture() {
  const r = runtime();
  r.run(`
    var patient = db.patients[1], otherPatient = db.patients[0];
    var provider = db.providers[1], otherProvider = db.providers[0];
    var doc = {id:'shared-document-id',type:'Documento de revisión',fileName:'paciente_exacto.pdf',source:'patient',status:'pending'};
    var siblingDoc = {id:'sibling-document',type:'Otro documento',fileName:'otro.pdf',status:'pending'};
    var providerDoc = {id:'shared-document-id',type:'Documento profesional',fileName:'proveedor_exacto.pdf',source:'provider',status:'pending'};
    patient.documents=[doc,siblingDoc];
    otherPatient.documents=[{...doc,fileName:'otro_paciente.pdf'}];
    provider.files=[providerDoc];
    otherProvider.files=[{...providerDoc,fileName:'otro_proveedor.pdf'}];
    db.corrections=[];
    currentView='documents';
    var untouched=()=>JSON.stringify([otherPatient.documents,otherProvider.files,siblingDoc]);
  `);
  return r;
}
function state(r) { return r.run('JSON.stringify(db)'); }
function noWrites(r, fn, message) {
  const before = state(r), writes = r.writes();
  fn();
  assert.ok(state(r) === before, message || 'Read-only work must not mutate records');
  assert.equal(r.writes(), writes, message || 'Read-only work must not persist');
}
function decodeHtml(value) {
  return value.replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function fillDecision(r, message = 'Mensaje exacto de revisión') {
  const html = r.el('modal').innerHTML;
  for (const match of html.matchAll(/<(select|textarea|input)\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)(?:<\/\1>|$)/g)) {
    const [, tag, id, contents] = match;
    if (tag === 'select') {
      const options = [...contents.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)]
        .map(option => ({ value: (option[1].match(/value="([^"]*)"/) || [])[1] ?? option[2], label: option[2] }));
      const selected = options.find(option => /Documento ilegible/i.test(option.label))
        || options.find(option => option.value && !/Selecciona/i.test(option.label));
      if (selected) r.el(id).value = decodeHtml(selected.value);
    } else r.el(id).value = message;
  }
  // Existing canonical patient forms expose the following ids. Explicitly fill
  // them as the lightweight DOM does not parse child input nodes automatically.
  for (const id of ['modalText', 'modalCorrectionReason', 'modalRejectMessage']) {
    if (html.includes('id="' + id + '"')) r.el(id).value = message;
  }
  if (html.includes('id="modalRejectReasonType"')) r.el('modalRejectReasonType').value = 'Documento ilegible';
  if (html.includes('id="modalReason"')) r.el('modalReason').value = 'Documento ilegible';
}
function confirmDecision(r) {
  const buttons = [...r.el('modal').innerHTML.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
  const button = buttons.reverse().find(match => /onclick="/.test(match[1])
    && /Guardar|Confirmar|Rechazar|Solicitar|Pedir/i.test(match[2]) && !/disabled/.test(match[1]));
  assert.ok(button, 'Decision dialog must expose an enabled confirmation action');
  r.run(decodeHtml(button[1].match(/onclick="([^"]+)"/)[1]));
}
function open(r, kind = 'patient', attachmentIndex = null, correctionId = null) {
  const owner = kind === 'patient' ? 'patient' : 'provider';
  r.run(`openDocumentReview('${kind}',${owner}.id,'shared-document-id',${JSON.stringify(attachmentIndex)},${JSON.stringify(correctionId)})`);
}
function decision(r, action) {
  if (action === 'approved') return r.run("reviewDocumentAction('approved')");
  noWrites(r, () => r.run(`reviewDocumentAction('${action}')`), 'Opening a decision dialog must not write');
  fillDecision(r);
  confirmDecision(r);
}
let count = 0;
const failures = [];
function test(name, fn) {
  try { fn(); count++; console.log('PASS: ' + name); }
  catch (error) { failures.push({name, error}); console.error('FAIL: ' + name + '\n  ' + error.message); }
}

test('Contextual review public interface is available', () => {
  const r = runtime();
  for (const name of ['openDocumentReview', 'resolveReviewContext', 'reviewDocumentAction', 'closeDocumentReview', 'reviewCorrectionAction', 'renderDocumentReview', 'reviewTabsHtml', 'requestTabsHtml', 'openReviewCase']) {
    assert.equal(r.run(`typeof ${name}`), 'function', name);
  }
  assert.equal(r.run('typeof reviewContext'), 'object');
});

test('Context lookup and repeated review rendering are pure for exact and stale identities', () => {
  const r = fixture();
  noWrites(r, () => {
    r.run(`var contexts=[
      {kind:'patient',entityId:patient.id,docId:doc.id,attachmentIndex:null},
      {kind:'provider',entityId:provider.id,docId:providerDoc.id,attachmentIndex:null},
      {kind:'patient',entityId:'ORPHAN',docId:doc.id},
      {kind:'provider',entityId:provider.id,docId:'MISSING'},
      {kind:'patient',entityId:patient.id,docId:'bankStatements',attachmentIndex:2},
      {kind:'unknown',entityId:patient.id,docId:doc.id}
    ];var beforeContexts=JSON.stringify(contexts);contexts.forEach(c=>resolveReviewContext(c));`);
    assert.equal(r.run('JSON.stringify(contexts)'), r.run('beforeContexts'));
    open(r);
    r.run('renderDocumentReview();renderDocumentReview();closeDocumentReview()');
  });
  assert.equal(r.run('patient.documents.length'), 2, 'Lookup must never materialize expected documents');
});

test('Owner kind and full context identify the exact patient/provider despite colliding document ids', () => {
  const r = fixture();
  for (const kind of ['patient', 'provider']) {
    noWrites(r, () => open(r, kind));
    assert.equal(r.run('reviewContext.kind'), kind);
    assert.equal(r.run('reviewContext.entityId'), r.run(`${kind}.id`));
    assert.equal(r.run('reviewContext.docId'), 'shared-document-id');
    assert.match(r.el('modal').innerHTML, kind === 'patient' ? /paciente_exacto\.pdf/ : /proveedor_exacto\.pdf/);
    assert.doesNotMatch(r.el('modal').innerHTML, kind === 'patient' ? /proveedor_exacto\.pdf|otro_paciente\.pdf/ : /paciente_exacto\.pdf|otro_proveedor\.pdf/);
    r.run('closeDocumentReview()');
  }
});

for (const kind of ['patient', 'provider']) {
  for (const action of ['approved', 'rejected', 'correction_required']) {
    test(`${kind} ${action} uses canonical status/reason and changes only the chosen document`, () => {
      const r = fixture();
      const target = kind === 'patient' ? 'doc' : 'providerDoc';
      r.run(`var untouchedBefore=untouched();var oppositeBefore=JSON.stringify(${kind === 'patient' ? 'provider.files' : 'patient.documents'});`);
      open(r, kind);
      decision(r, action);
      const expected = action === 'rejected' && kind === 'patient' ? 'correction_required' : action;
      assert.equal(r.run(`${target}.status`), expected);
      assert.equal(r.run(`${target}.reviewedBy`), r.run('session.email'));
      if (action !== 'approved') assert.match(r.run(`${target}.rejectionReason||${target}.correctionReason||''`), /Mensaje exacto de revisión/);
      assert.equal(r.run('untouched()'), r.run('untouchedBefore'));
      assert.equal(r.run(`JSON.stringify(${kind === 'patient' ? 'provider.files' : 'patient.documents'})`), r.run('oppositeBefore'));
      assert.equal(r.run('reviewContext.entityId'), r.run(`${kind}.id`), 'Confirmed decision returns to its reviewer');
      assert.match(r.el('modal').innerHTML, new RegExp(r.run(`${target}.fileName`).replace('.', '\\.')));
      assert.ok(r.writes() > 0, 'Confirmed decision must use real persistence');
    });
  }
}

for (const action of ['approved', 'rejected', 'correction_required']) {
  test(`Grouped attachment ${action} affects only the selected stored file`, () => {
    const r = fixture();
    r.run(`doc.type='Estados de cuenta';doc.files=[
      {name:'primer_estado.pdf',fileName:'primer_estado.pdf',status:'approved'},
      {name:'segundo_estado.pdf',fileName:'segundo_estado.pdf',status:'pending'},
      {name:'tercer_estado.pdf',fileName:'tercer_estado.pdf',status:'pending'}
    ];var groupBefore=JSON.stringify([doc.files[0],doc.files[2]]);var unrelatedBefore=untouched();`);
    open(r, 'patient', 1);
    assert.equal(r.run('reviewContext.attachmentIndex'), 1);
    assert.match(r.el('modal').innerHTML, /segundo_estado\.pdf/);
    decision(r, action);
    assert.equal(r.run('doc.files[1].status'), action === 'rejected' ? 'correction_required' : action);
    assert.equal(r.run('JSON.stringify([doc.files[0],doc.files[2]])'), r.run('groupBefore'));
    assert.equal(r.run('untouched()'), r.run('unrelatedBefore'));
    assert.equal(r.run('doc.files.length'), 3);
    assert.equal(r.run('doc.status'), action === 'approved' ? 'pending' : 'correction_required');
  });
}

test('Invalid owner, missing document, missing stored file and stale attachment never write', () => {
  const r = fixture();
  const cases = [
    "openDocumentReview('patient','ORPHAN','shared-document-id')",
    "openDocumentReview('provider',provider.id,'MISSING')",
    "openDocumentReview('patient',patient.id,'bankStatements',2)",
    "openDocumentReview('patient',patient.id,doc.id,9)"
  ];
  for (const code of cases) noWrites(r, () => {
    r.run(code);
    for (const action of ['approved', 'rejected', 'correction_required']) r.run(`reviewDocumentAction('${action}')`);
    r.run('closeDocumentReview()');
  });
  r.run("delete doc.fileName;delete doc.files");
  noWrites(r, () => { open(r); r.run("reviewDocumentAction('approved');closeDocumentReview()"); });
  assert.equal(r.run('patient.documents.length'), 2);
  assert.equal(r.run('doc.files'), undefined, 'Unavailable files must not be generated by a read or failed action');
});

test('Deleting a document or owner while a reviewer is open is guarded again at action time', () => {
  for (const remove of ['patient.documents=[]', 'db.patients=db.patients.filter(p=>p!==patient)']) {
    const r = fixture();
    open(r);
    r.run(remove);
    noWrites(r, () => {
      for (const action of ['approved', 'rejected', 'correction_required']) r.run(`reviewDocumentAction('${action}')`);
      r.run('closeDocumentReview()');
    });
  }
});

test('Role guards protect direct reviewer actions for each owner type and attachments', () => {
  for (const [role, kind] of [['readonly','patient'],['readonly','provider'],['provider','patient'],['operations','provider'],['risk','patient'],['risk','provider']]) {
    const r = fixture();
    r.run(`session=users.find(user=>user.role==='${role}')`);
    noWrites(r, () => {
      open(r, kind);
      for (const action of ['approved', 'rejected', 'correction_required']) r.run(`reviewDocumentAction('${action}')`);
      r.run('closeDocumentReview()');
    }, `${role} must not write ${kind} documents`);
  }
  const r = fixture();
  r.run("doc.files=[{fileName:'archivo.pdf',status:'pending'}];session=users.find(user=>user.role==='provider')");
  noWrites(r, () => { open(r, 'patient', 0); r.run("reviewDocumentAction('approved')"); });
});

test('Authorized operational and provider roles can decide only their own document classes', () => {
  for (const [role, kind] of [['operations','patient'], ['provider','provider']]) {
    const r = fixture();
    r.run(`session=users.find(user=>user.role==='${role}')`);
    open(r, kind);
    decision(r, 'approved');
    assert.equal(r.run(kind === 'patient' ? 'doc.status' : 'providerDoc.status'), 'approved');
  }
});

test('Nested reject/correction cancellation restores reviewer and closing restores origin focus', () => {
  for (const action of ['rejected', 'correction_required']) {
    const r = fixture();
    r.el('documentsSearch').focus();
    noWrites(r, () => {
      open(r);
      const original = r.run('JSON.stringify(reviewContext)');
      r.run(`reviewDocumentAction('${action}')`);
      assert.match(r.el('modal').innerHTML, /Cancelar/);
      r.run('closeModal()');
      assert.equal(r.run('JSON.stringify(reviewContext)'), original);
      assert.match(r.el('modal').innerHTML, /paciente_exacto\.pdf/);
      assert.equal(r.el('modalBackdrop').classList.contains('show'), true);
      r.run('closeDocumentReview()');
      assert.equal(r.run('reviewContext'), null);
      assert.equal(r.run('currentView'), 'documents');
      assert.equal(r.el('modalBackdrop').classList.contains('show'), false);
      assert.equal(r.document.activeElement, r.el('documentsSearch'));
    });
  }
});

test('Review decisions do not discard document/correction queue filters or selected source tab', () => {
  const r = fixture();
  r.run("queueFilters.documents.query='PACIENTE';queueFilters.corrections.query='revisión';queueFilters.corrections.status='pending';queueFilters.corrections.entity='patient';currentView='corrections';var filtersBefore=JSON.stringify(queueFilters)");
  open(r);
  decision(r, 'approved');
  r.run('closeDocumentReview()');
  assert.equal(r.run('JSON.stringify(queueFilters)'), r.run('filtersBefore'));
  assert.equal(r.run('currentView'), 'corrections');
});

test('Document correction lifecycle uses exact correction identity and retains separate sibling issue', () => {
  const r = fixture();
  r.run(`doc.status='correction_required';doc.rejectionReason='Original';
    db.corrections=[{id:'chosen-correction',kind:'patient',entityId:patient.id,docId:doc.id,field:doc.type,status:'pending',requestedBy:'solicitante@demo.test'},
      {id:'sibling-correction',kind:'patient',entityId:patient.id,docId:siblingDoc.id,field:siblingDoc.type,status:'pending'}];
    syncCorrectionRecords();var otherCorrection=JSON.stringify(db.corrections.find(c=>c.id==='sibling-correction'));currentView='corrections';`);
  open(r, 'patient', null, 'chosen-correction');
  assert.equal(r.run('reviewContext.correctionId'), 'chosen-correction');
  assert.equal(r.run("reviewCorrectionAction('received')"), true);
  assert.equal(r.run("reviewCorrectionAction('in_review')"), true);
  assert.equal(r.run("db.corrections.find(c=>c.id==='chosen-correction').status"), 'in_review');
  assert.equal(r.run("reviewCorrectionAction('resolved')"), false, 'Document correction resolves through the canonical document decision');
  decision(r, 'approved');
  assert.equal(r.run("db.corrections.find(c=>c.id==='chosen-correction').status"), 'resolved');
  assert.equal(r.run("JSON.stringify(db.corrections.find(c=>c.id==='sibling-correction'))"), r.run('otherCorrection'));
});

test('Wrong-owner or wrong-document correction context cannot act on an unrelated issue', () => {
  const r = fixture();
  r.run("db.corrections=[{id:'wrong-correction',kind:'provider',entityId:provider.id,docId:providerDoc.id,status:'pending'}]");
  noWrites(r, () => {
    open(r, 'patient', null, 'wrong-correction');
    r.run("reviewCorrectionAction('received')");
  });
});

test('Documents/corrections retain legacy routes under one shared review title and tabs', () => {
  const r = runtime();
  noWrites(r, () => {
    r.run("setView('documents');renderDocuments()");
    const title = r.el('pageTitle').textContent;
    assert.ok(title);
    const docs = r.el('documents').innerHTML;
    r.run("setView('corrections');renderCorrections()");
    assert.equal(r.el('pageTitle').textContent, title);
    for (const html of [docs, r.el('corrections').innerHTML, r.run("reviewTabsHtml('documents')"), r.run("reviewTabsHtml('corrections')")]) {
      assert.match(html, /Por revisar|Documentos/);
      assert.match(html, /Correcciones/);
    }
    assert.equal(r.run('currentView'), 'corrections');
  });
});

test('Review queues share the patient request filter controls rather than unstyled search inputs', () => {
  const r = runtime();
  for (const view of ['documents', 'corrections']) {
    r.run(view === 'documents' ? 'renderDocuments()' : 'renderCorrections()');
    const html = r.el(view).innerHTML;
    assert.match(html, /class="[^"]*patient-request-filters/);
    assert.match(html, new RegExp('<input(?=[^>]*id="' + view + 'Search")(?=[^>]*class="[^"]*patient-filter-search)[^>]*>'));
    assert.match(html, /type="search"/);
  }
  assert.match(source + css, /\.patient-request-filters\s+input|\.patient-request-filters\s*:where\(input|\.patient-request-filters\s+\.patient-filter-search/);
});

test('Primary navigation has one review destination, with offers and history still reachable secondarily', () => {
  const r = runtime();
  r.run('renderNav()');
  const main = r.el('nav').innerHTML;
  assert.doesNotMatch(main, /data-id="(?:corrections|offers|history)"/);
  assert.equal((main.match(/data-id="documents"/g) || []).length, 1);
  assert.match(source, /(?:onclick="setView\('history'\)|id="historyBtn"|id="operationalHistoryBtn")/);
  noWrites(r, () => {
    r.run("setView('offers');renderOffers()");
    assert.equal(r.run('currentView'), 'offers');
    assert.match(r.el('pageTitle').textContent + ' ' + r.el('pageSub').textContent, /pacientes/i);
    const requestTabs = r.run("requestTabsHtml('offers')");
    assert.match(requestTabs, /Solicitudes/);
    assert.match(requestTabs, /Ofertas/);
    assert.match(r.el('offers').innerHTML, /Ofertas/);
    r.run("setView('history');renderHistory()");
    assert.equal(r.run('currentView'), 'history');
    assert.match(r.el('pageTitle').textContent, /Historial/);
  });
});

test('Grouped review requires explicit attachment selection and never invents placeholder files', () => {
  const r = fixture();
  r.run("doc.type='Estados de cuenta';doc.files=[{fileName:'uno.pdf',status:'pending'},{fileName:'dos.pdf',status:'pending'}]");
  noWrites(r, () => {
    open(r);
    assert.equal(r.run('reviewContext.attachmentIndex'), null);
    assert.equal(r.run("reviewDocumentAction('approved')"), false);
    assert.match(r.el('modal').innerHTML, /Selecciona un archivo/);
    r.run('selectReviewAttachment(1)');
    assert.equal(r.run('reviewContext.attachmentIndex'), 1);
    assert.match(r.el('modal').innerHTML, /dos\.pdf/);
    r.run('selectReviewAttachment(99)');
    assert.equal(r.run('reviewContext.attachmentIndex'), 1);
  });
  decision(r, 'approved');
  assert.equal(r.run('doc.files[0].status'), 'pending');
  assert.equal(r.run('doc.files[1].status'), 'approved');
  assert.equal(r.run('doc.files.length'), 2);
});

test('Pending decisions recheck owner permissions before saving rejection or correction', () => {
  for (const [kind, attachmentIndex] of [['patient',null], ['patient',0], ['provider',null]]) {
    for (const action of ['rejected', 'correction_required']) {
      const r = fixture();
      if (attachmentIndex !== null) r.run("doc.files=[{fileName:'archivo.pdf',status:'pending'}]");
      open(r, kind, attachmentIndex);
      r.run(`reviewDocumentAction('${action}')`);
      fillDecision(r);
      r.run("session=users.find(user=>user.role==='readonly')");
      noWrites(r, () => confirmDecision(r), `${kind} ${action} must recheck permissions on confirmation`);
    }
  }
});

test('Removing the selected grouped attachment blocks the already-open decision', () => {
  const r = fixture();
  r.run("doc.files=[{fileName:'uno.pdf',status:'pending'},{fileName:'dos.pdf',status:'pending'},{fileName:'tres.pdf',status:'pending'}]");
  open(r, 'patient', 1);
  r.run("reviewDocumentAction('rejected')");
  fillDecision(r);
  r.run('doc.files.splice(1,1)');
  noWrites(r, () => confirmDecision(r), 'A shifted array index must never reject a different attachment');
  assert.equal(r.run('doc.files[1].fileName'), 'tres.pdf');
  assert.equal(r.run('doc.files[1].status'), 'pending');
});

test('Delegated filtered queue clicks open the exact document/correction in place', () => {
  const r = fixture();
  noWrites(r, () => {
    r.run("queueFilters.documents.query=provider.id;renderDocuments()");
    const rowButton = { disabled:false, dataset:{queueIndex:'0'} };
    r.el('documentsRows').onclick({ target:{closest: selector => selector.includes('data-queue-index') ? rowButton : null} });
    assert.equal(r.run('reviewContext.kind'), 'provider');
    assert.equal(r.run('reviewContext.entityId'), r.run('provider.id'));
    assert.equal(r.run('reviewContext.docId'), r.run('providerDoc.id'));
    assert.equal(r.run('currentView'), 'documents');
    r.run('closeDocumentReview()');
  });
  r.run("doc.status='correction_required';db.corrections=[{id:'queue-correction',kind:'patient',entityId:patient.id,docId:doc.id,status:'pending'}];queueFilters.corrections.query=patient.id;currentView='corrections'");
  noWrites(r, () => {
    r.run('renderCorrections()');
    r.el('correctionsRows').onclick({target:{closest:selector=>selector.includes('data-queue-index')?{disabled:false,dataset:{queueIndex:'0'}}:null}});
    assert.equal(r.run('reviewContext.entityId'), r.run('patient.id'));
    assert.equal(r.run('reviewContext.docId'), r.run('doc.id'));
    assert.equal(r.run('reviewContext.correctionId'), 'queue-correction');
    assert.equal(r.run('currentView'), 'corrections');
    r.run('closeDocumentReview()');
  });
});

test('General profile corrections remain actionable without fabricating a document', () => {
  for (const kind of ['patient', 'provider']) {
    const r = fixture();
    r.run(`db.corrections=[{id:'profile-correction',kind:'${kind}',entityId:${kind}.id,field:'Datos del perfil',status:'pending'}];var documentsBefore=JSON.stringify([patient.documents,provider.files])`);
    noWrites(r, () => {
      r.run(`openDocumentReview('${kind}',${kind}.id,null,null,'profile-correction')`);
      assert.match(r.el('modal').innerHTML, /Corrección de datos del perfil/);
      assert.equal(r.run("reviewDocumentAction('approved')"), false);
    });
    for (const action of ['received', 'in_review', 'resolved']) assert.equal(r.run(`reviewCorrectionAction('${action}')`), true);
    assert.equal(r.run("db.corrections.find(c=>c.id==='profile-correction').status"), 'resolved');
    assert.equal(r.run('JSON.stringify([patient.documents,provider.files])'), r.run('documentsBefore'));
  }
});

test('Assignment uses the canonical handler and nested cancel/save return to the same reviewer', () => {
  const r = fixture();
  r.run("doc.status='correction_required';db.corrections=[{id:'assignment-correction',kind:'patient',entityId:patient.id,docId:doc.id,status:'pending'}]");
  open(r, 'patient', null, 'assignment-correction');
  noWrites(r, () => {
    assert.equal(r.run("reviewCorrectionAction('assign')"), true);
    assert.match(r.el('modal').innerHTML, /Responsable/);
    r.run('closeModal()');
    assert.equal(r.run('reviewContext.correctionId'), 'assignment-correction');
    assert.match(r.el('modal').innerHTML, /paciente_exacto\.pdf/);
  });
  r.run("reviewCorrectionAction('assign')");
  r.el('correctionAssignee').value = r.run("users.find(user=>user.role==='operations').email");
  r.el('saveCorrectionAssignee').onclick();
  assert.equal(r.run("db.corrections.find(c=>c.id==='assignment-correction').assignee"), r.el('correctionAssignee').value);
  assert.equal(r.run('reviewContext.correctionId'), 'assignment-correction');
  assert.match(r.el('modal').innerHTML, /paciente_exacto\.pdf/);
});

// Independent adversarial cases: canonical ids, retained object identity, and
// legacy attachment shapes must hold even when superficially similar data exists.
test('Exact document resolution ignores an earlier fuzzy type/name alias', () => {
  for (const action of ['approved', 'rejected', 'correction_required']) {
    const r = fixture();
    r.run("patient.documents.unshift({id:'not-target',type:'shared-document-id',name:'shared-document-id',fileName:'wrong.pdf',status:'pending'});var aliasBefore=JSON.stringify(patient.documents[0])");
    open(r);
    decision(r, action);
    assert.equal(r.run('doc.status'), action === 'rejected' ? 'correction_required' : action);
    assert.equal(r.run('JSON.stringify(patient.documents[0])'), r.run('aliasBefore'));
  }
});

test('Duplicate correction ids across owners resolve to the complete contextual identity', () => {
  const r = fixture();
  r.run(`db.corrections=[
    {id:'collision',kind:'provider',entityId:provider.id,field:'Perfil',status:'pending'},
    {id:'collision',kind:'patient',entityId:otherPatient.id,field:'Perfil',status:'pending'},
    {id:'collision',kind:'patient',entityId:patient.id,field:'Perfil',status:'pending'}
  ];syncCorrectionRecords();var untouchedCorrections=JSON.stringify(db.corrections.slice(0,2));`);
  r.run("openDocumentReview('patient',patient.id,null,null,'collision')");
  assert.equal(r.run("reviewCorrectionAction('received')"), true);
  assert.equal(r.run('db.corrections[2].status'), 'received');
  assert.equal(r.run('JSON.stringify(db.corrections.slice(0,2))'), r.run('untouchedCorrections'));
  assert.equal(r.run('db.corrections.length'), 3);
});

test('Legacy string attachments are readable without writes and can be canonically decided', () => {
  for (const kind of ['patient', 'provider']) {
    for (const action of ['approved', 'rejected', 'correction_required']) {
      const r = fixture();
      const target = kind === 'patient' ? 'doc' : 'providerDoc';
      r.run(`${target}.files=['one.pdf','two.pdf']`);
      noWrites(r, () => {
        open(r, kind, 0);
        r.run('renderDocumentReview()');
        assert.match(r.el('modal').innerHTML, /one\.pdf/);
      });
      decision(r, action);
      assert.equal(r.run(`${target}.files[0].status`), kind === 'patient' && action === 'rejected' ? 'correction_required' : action);
      assert.equal(r.run(`${target}.files[0].fileName`), 'one.pdf');
      assert.equal(r.run(`${target}.files[1].fileName||${target}.files[1]`), 'two.pdf');
      assert.equal(r.run(`${target}.files[1].status||'pending'`), 'pending');
      assert.equal(r.run(`${target}.files.length`), 2);
    }
  }
});

test('Provider grouped attachment decisions update only the selected stored file', () => {
  for (const action of ['approved', 'rejected', 'correction_required']) {
    const r = fixture();
    r.run("providerDoc.files=[{fileName:'one.pdf',status:'pending'},{fileName:'two.pdf',status:'pending'}];var providerSiblingBefore=JSON.stringify(providerDoc.files[1]);var patientBefore=JSON.stringify(patient.documents)");
    open(r, 'provider', 0);
    decision(r, action);
    assert.equal(r.run('providerDoc.files[0].status'), action);
    assert.equal(r.run('JSON.stringify(providerDoc.files[1])'), r.run('providerSiblingBefore'));
    assert.equal(r.run('JSON.stringify(patient.documents)'), r.run('patientBefore'));
    assert.equal(r.run('providerDoc.status'), action === 'approved' ? 'pending' : 'correction_required');
  }
});

test('Replacing a document with the same id invalidates its existing reviewer', () => {
  for (const kind of ['patient', 'provider']) {
    const r = fixture();
    open(r, kind);
    r.run(kind === 'patient' ? "patient.documents[0]={...doc,fileName:'replacement.pdf'}" : "provider.files[0]={...providerDoc,fileName:'replacement.pdf'}");
    noWrites(r, () => {
      for (const action of ['approved', 'rejected', 'correction_required']) assert.equal(r.run(`reviewDocumentAction('${action}')`), false);
      r.run('renderDocumentReview()');
      assert.match(r.el('modal').innerHTML, /ya no está disponible/);
    });
  }
});

test('Reordering attachments invalidates the selected file until explicitly selected again', () => {
  const r = fixture();
  r.run("doc.files=[{fileName:'one.pdf',status:'pending'},{fileName:'two.pdf',status:'pending'}]");
  open(r, 'patient', 0);
  r.run('doc.files.reverse()');
  noWrites(r, () => {
    assert.equal(r.run("reviewDocumentAction('approved')"), false);
    r.run('renderDocumentReview()');
  });
  noWrites(r, () => r.run('selectReviewAttachment(1)'));
  decision(r, 'approved');
  assert.equal(r.run('doc.files[1].fileName'), 'one.pdf');
  assert.equal(r.run('doc.files[1].status'), 'approved');
  assert.equal(r.run('doc.files[0].status'), 'pending');
});

test('A correction id for another document of the same owner cannot edit either issue', () => {
  const r = fixture();
  r.run("db.corrections=[{id:'wrong-document-correction',kind:'patient',entityId:patient.id,docId:siblingDoc.id,field:'Sibling',status:'pending'}]");
  noWrites(r, () => {
    open(r, 'patient', null, 'wrong-document-correction');
    assert.equal(r.run("reviewCorrectionAction('received')"), false);
    assert.equal(r.run("reviewCorrectionAction('assign')"), false);
    assert.equal(r.run("reviewDocumentAction('approved')"), false);
  });
});

test('Replacing the open document blocks pending correction workflow transitions', () => {
  const r = fixture();
  r.run("doc.status='correction_required';syncCorrectionRecords()");
  open(r);
  r.run("patient.documents[0]={...doc,fileName:'replacement.pdf'}");
  noWrites(r, () => {
    assert.equal(r.run("reviewCorrectionAction('received')"), false);
    assert.equal(r.run("reviewCorrectionAction('assign')"), false);
  });
});

test('Stale assignment save and direct canonical assignment are blocked after document replacement', () => {
  for (const kind of ['patient', 'provider']) {
    const r = fixture();
    r.run(`${kind === 'patient' ? 'doc' : 'providerDoc'}.status='correction_required';syncCorrectionRecords()`);
    open(r, kind);
    r.run("var staleAssignmentRow=reviewCorrectionRow();reviewCorrectionAction('assign')");
    r.el('correctionAssignee').value = r.run('session.email');
    r.run(kind === 'patient' ? "patient.documents[0]={...doc,fileName:'replacement.pdf'}" : "provider.files[0]={...providerDoc,fileName:'replacement.pdf'}");
    noWrites(r, () => {
      r.el('saveCorrectionAssignee').onclick();
      assert.equal(r.run("changeCorrection(staleAssignmentRow,'assign',session.email)"), false);
    });
    assert.equal(r.run("staleAssignmentRow.correction.assignee||''"), '');
  }
});

test('Exact patient/provider case links and Back retain review origin, filters and focus', () => {
  for (const origin of ['documents', 'corrections']) {
    for (const kind of ['patient', 'provider']) {
      for (const tab of ['perfil', 'historial']) {
        for (const approvedProvider of kind === 'provider' ? [false, true] : [false]) {
          const r = fixture();
          r.run(`currentView='${origin}';queueFilters.documents={query:'document-filter',status:'pending',entity:'provider'};queueFilters.corrections={query:'correction-filter',status:'received',entity:'patient'};
            selectedPatientId=otherPatient.id;selectedProviderId=otherProvider.id;
            provider.onboarding={approved:${approvedProvider}};session=users.find(user=>user.role==='readonly');
            var originFilters=JSON.stringify(queueFilters);`);
          if (tab === 'perfil') r.run(`db.corrections=[{id:'case-profile',kind:'${kind}',entityId:${kind}.id,field:'Datos del perfil',status:'pending'}]`);
          noWrites(r, () => {
            if (tab === 'perfil') r.run(`openDocumentReview('${kind}',${kind}.id,null,null,'case-profile')`);
            else open(r, kind);
            assert.match(r.el('modal').innerHTML, tab === 'perfil' ? /Ver datos del expediente/ : /Historial del expediente/);
            assert.equal(r.run(`openReviewCase('${tab}')`), true);
            assert.equal(r.run('reviewContext'), null);
            assert.equal(r.el('modalBackdrop').classList.contains('show'), false);
            assert.equal(r.run('currentView'), kind === 'patient' ? 'patients' : approvedProvider ? 'providers' : 'providerRequests');
            assert.equal(r.run(kind === 'patient' ? 'selectedPatientId' : 'selectedProviderId'), r.run(`${kind}.id`));
            assert.equal(r.run(kind === 'patient' ? 'patientTab' : 'providerTab'), tab === 'historial' ? 'historial' : kind === 'patient' ? 'datos' : 'resumen');
            assert.equal(r.run(kind === 'patient' ? 'patientRequestMode' : 'providerMode'), 'detail');
            assert.equal(r.run('operationalReturnContext.view'), origin);
            assert.equal(r.run('operationalReturnContext.kind'), kind);
            assert.equal(r.run('operationalReturnContext.ref'), r.run(`${kind}.id`));
            assert.equal(r.run('JSON.stringify(queueFilters)'), r.run('originFilters'));
            r.run(kind === 'patient' ? 'backToPatientRequests()' : 'backToProviders()');
            assert.equal(r.run('currentView'), origin);
            assert.equal(r.run('operationalReturnContext'), null);
            assert.equal(r.run('JSON.stringify(queueFilters)'), r.run('originFilters'));
            assert.equal(r.document.activeElement, r.el(origin + 'Search'));
          });
        }
      }
    }
  }
});

test('Missing and replaced review contexts cannot navigate to a different case', () => {
  for (const kind of ['patient', 'provider']) {
    const r = fixture();
    open(r, kind);
    r.run(kind === 'patient' ? "patient.documents[0]={...doc,fileName:'replacement.pdf'}" : "provider.files[0]={...providerDoc,fileName:'replacement.pdf'}");
    const selected = r.run('JSON.stringify([selectedPatientId,selectedProviderId])');
    noWrites(r, () => {
      assert.equal(r.run("openReviewCase('perfil')"), false);
      assert.equal(r.run("openReviewCase('historial')"), false);
      assert.equal(r.run('currentView'), 'documents');
      assert.equal(r.run('JSON.stringify([selectedPatientId,selectedProviderId])'), selected);
      assert.equal(r.run('operationalReturnContext'), null);
    });
  }
});

test('Colliding correction ids retain distinct audit snapshots and exact owner/document attribution', () => {
  const r = fixture();
  r.run(`db.corrections=[
    {id:'audit-collision',kind:'provider',entityId:provider.id,field:'Provider profile',status:'pending'},
    {id:'audit-collision',kind:'patient',entityId:otherPatient.id,field:'Other patient profile',status:'pending'},
    {id:'audit-collision',kind:'patient',entityId:patient.id,field:'Patient profile',status:'pending'},
    {id:'audit-collision',kind:'patient',entityId:patient.id,docId:doc.id,field:'Selected document',status:'pending'},
    {id:'audit-collision',kind:'patient',entityId:patient.id,docId:siblingDoc.id,field:'Sibling document',status:'pending'}
  ];syncCorrectionRecords();operationalAuditBaseline=operationalSnapshot();db.audit=[];
    var snapshotKeys=Object.keys(operationalAuditBaseline).filter(key=>key.startsWith('correction:')&&key.includes('audit-collision'));
    var auditChanges=()=>db.audit.filter(event=>event.changes?.some(change=>change.field==='correctionStatus'));`);
  assert.equal(r.run('snapshotKeys.length'), 5, 'Scope collisions must not overwrite snapshot entries');
  assert.equal(r.run('new Set(snapshotKeys).size'), 5);
  for (const index of [0, 1, 2, 3, 4]) assert.equal(r.run(`!!operationalAuditBaseline['correction:'+JSON.stringify([db.corrections[${index}].kind,db.corrections[${index}].entityId,db.corrections[${index}].docId||null,db.corrections[${index}].id])]`), true);
  open(r, 'patient', null, 'audit-collision');
  assert.equal(r.run("reviewCorrectionAction('received')"), true);
  assert.equal(r.run('auditChanges().length'), 1);
  assert.equal(r.run('auditChanges()[0].entity'), r.run('patient.id'));
  assert.equal(r.run('auditChanges()[0].entityKind'), 'patient');
  assert.equal(r.run('auditChanges()[0].comment'), 'Selected document');
  assert.equal(r.run('auditChanges()[0].changes[0].previous'), 'pending');
  assert.equal(r.run('auditChanges()[0].changes[0].next'), 'received');
  assert.equal(r.run("db.corrections.filter(c=>c.status==='received').length"), 1);
  r.run("closeDocumentReview();openDocumentReview('provider',provider.id,null,null,'audit-collision')");
  assert.equal(r.run("reviewCorrectionAction('received')"), true);
  assert.equal(r.run('auditChanges().length'), 2);
  assert.equal(r.run('auditChanges()[0].entity'), r.run('provider.id'));
  assert.equal(r.run('auditChanges()[0].entityKind'), 'provider');
  assert.equal(r.run('auditChanges()[0].comment'), 'Provider profile');
  assert.equal(r.run('auditChanges()[0].changes[0].previous'), 'pending');
  assert.equal(r.run('auditChanges()[0].changes[0].next'), 'received');
  r.run('persist();persist()');
  assert.equal(r.run('auditChanges().length'), 2, 'Repeated persistence must not duplicate audit changes');
});


function prepareVersion(r,kind='patient',index=null){
  open(r,kind,index);
  r.run(`var importContext=reviewContext;var importTarget=reviewContext.attachmentIndex===null?resolveReviewContext(reviewContext).doc:resolveReviewContext(reviewContext).file;var importStamp=reviewVersionStamp(reviewContext,importTarget);var version=window.PulzzoDemoBridge.localDocumentVersion({name:'nuevo.pdf',type:'application/pdf',size:9},'data:application/pdf;base64,JVBERi0xLjQK');`);
}
for(const kind of ['patient','provider'])test(kind+' actual local version resets only selected approval and preserves correction history',()=>{
  const r=fixture(),owner=kind==='patient'?'patient':'provider',docs=kind==='patient'?'documents':'files';
  r.run(`var target=${owner}.${docs}[0];target.status='approved';target.reviewedBy='prior-reviewer';target.reviewedAt='2026-01-01';db.corrections=[{id:'version-correction',kind:'${kind}',entityId:${owner}.id,docId:target.id,status:'resolved',assignee:'keep@example.test',reason:'Original reason',history:[{action:'original'}]}];var other=untouched();`);
  prepareVersion(r,kind);
  assert.doesNotMatch(r.el('modal').innerHTML,/Registrar recibida/);
  assert.equal(r.run('importReviewVersion(importContext,importStamp,version)'),true);
  assert.equal(r.run(`${owner}.${docs}[0].status`),'pending');
  assert.equal(r.run(`${owner}.${docs}[0].reviewedBy`),undefined);
  assert.equal(r.run(`${owner}.${docs}[0].versions[0].reviewedBy`),'prior-reviewer');
  assert.equal(r.run('db.corrections[0].status'),'in_review');
  assert.equal(r.run('db.corrections[0].assignee'),'keep@example.test');
  assert.equal(r.run('db.corrections[0].history.length'),2);
  assert.equal(r.run('untouched()'),r.run('other'));
  prepareVersion(r,kind);
  noWrites(r,()=>assert.equal(r.run('importReviewVersion(importContext,importStamp,version)'),false));
  const saved=new Map(r.storage),restored=runtime(saved);
  assert.equal(restored.run("db.corrections.find(c=>c.id==='version-correction').status"),'in_review');
  assert.equal(restored.run("db.corrections.find(c=>c.id==='version-correction').history.length"),2);
});
test('Local group import preserves approved sibling and its review metadata',()=>{
 const r=fixture();r.run("doc.status='approved';doc.files=[{fileName:'one.pdf',status:'approved',reviewedBy:'keep'},{fileName:'two.pdf',status:'approved',reviewedBy:'old'}];var first=JSON.stringify(doc.files[0]);");
 prepareVersion(r,'patient',1);assert.equal(r.run('importReviewVersion(importContext,importStamp,version)'),true);
 assert.equal(r.run('doc.status'),'pending');assert.equal(r.run('doc.files[1].status'),'pending');assert.equal(r.run('JSON.stringify(doc.files[0])'),r.run('first'));
 assert.equal(r.run('doc.files[1].versions[0].status'),'approved');
});
test('Local import refuses readonly, stale selection, newer decisions and metadata-only payloads',()=>{
 for(const change of ["session=users.find(u=>u.role==='readonly')","closeDocumentReview()","doc.status='approved'","patient.documents[0]={...doc}"]){const r=fixture();prepareVersion(r);r.run(change);noWrites(r,()=>assert.equal(r.run('importReviewVersion(importContext,importStamp,version)'),false));}
 const r=fixture();prepareVersion(r);noWrites(r,()=>assert.throws(()=>r.run("importReviewVersion(importContext,importStamp,{fileName:'legacy.pdf',mimeType:'application/pdf',size:9})")));
});
test('Storage failure rolls back document, correction, history and audit data',()=>{
 const r=fixture();prepareVersion(r);const before=state(r);r.run("localStorage.setItem=()=>{throw Error('quota')}");assert.equal(r.run('importReviewVersion(importContext,importStamp,version)'),false);assert.equal(state(r),before);
});
test('Bridge rejects oversized, unsupported, truncated or disguised local files',()=>{
 const bridge=require('../assets/pulzzo-demo-bridge.js'),file={name:'x.pdf',type:'application/pdf',size:9},data='data:application/pdf;base64,JVBERi0xLjQK';
 for(const [f,d] of [[{...file,size:524289},data],[{...file,type:'image/svg+xml'},data],[{...file,size:8},data],[file,'data:application/pdf;base64,aGVsbG8gd29y']])assert.throws(()=>bridge.localDocumentVersion(f,d));
});

test('New grouped version is in pending queue even while a different attachment needs correction',()=>{
 const r=fixture();r.run("doc.status='correction_required';doc.files=[{fileName:'one.pdf',status:'correction_required',rejectionReason:'Keep original issue'},{fileName:'two.pdf',status:'approved'}];var first=JSON.stringify(doc.files[0]);persist();");
 prepareVersion(r,'patient',1);assert.equal(r.run('importReviewVersion(importContext,importStamp,version)'),true);
 assert.equal(r.run('doc.status'),'correction_required');assert.equal(r.run('reviewPending(doc)'),true);assert.equal(r.run('JSON.stringify(doc.files[0])'),r.run('first'));
});
test('Async file read cannot write after close or replacement navigation',()=>{
 for(const interrupt of ["closeDocumentReview()","openDocumentReview('provider',provider.id,providerDoc.id)"]){
  const r=fixture();open(r);
  r.run("var readers=[];FileReader=class{constructor(){readers.push(this)}readAsDataURL(){}};window.confirm=()=>true;chooseReviewVersion();");
  r.el('reviewVersionFile').files=[{name:'file.pdf',type:'application/pdf',size:9}];r.el('reviewVersionFile').onchange();r.run(interrupt);
  noWrites(r,()=>r.run("readers[0].result='data:application/pdf;base64,JVBERi0xLjQK';readers[0].onload()"));
 }
});
test('Profile-only correction still supports explicit review and resolution without invented file receipt',()=>{
 const r=fixture();r.run("db.corrections=[{id:'profile-only',kind:'patient',entityId:patient.id,field:'Datos',status:'pending'}];openDocumentReview('patient',patient.id,null,null,'profile-only');");
 assert.match(r.el('modal').innerHTML,/Revisar datos/);assert.doesNotMatch(r.el('modal').innerHTML,/Registrar recibida|Importar nueva versión/);
 assert.equal(r.run("reviewCorrectionAction('in_review')"),true);assert.equal(r.run("reviewCorrectionAction('resolved')"),true);
});
test('Async import rejects identical sibling selection and even switch-away-and-back',()=>{
 for(const navigate of ['selectReviewAttachment(1)','selectReviewAttachment(1);selectReviewAttachment(0)']){
  const r=fixture();r.run("doc.files=[{fileName:'same.pdf',status:'approved'},{fileName:'same.pdf',status:'approved'}]");open(r,'patient',0);
  r.run("var readers=[];FileReader=class{constructor(){readers.push(this)}readAsDataURL(){}};window.confirm=()=>true;chooseReviewVersion();");
  r.el('reviewVersionFile').files=[{name:'file.pdf',type:'application/pdf',size:9}];r.el('reviewVersionFile').onchange();r.run(navigate);
  noWrites(r,()=>r.run("readers[0].result='data:application/pdf;base64,JVBERi0xLjQK';readers[0].onload()"));
 }
});
test('Async import retains exact session identity and immutable actor role attribution',()=>{
 for(const change of ["session=users.find(u=>u.role==='operations')","session={...session}","session.email='another-authorized@example.test'","session.role='operations'","session=null"]){
  const r=fixture();open(r);
  r.run("var readers=[];FileReader=class{constructor(){readers.push(this)}readAsDataURL(){}};window.confirm=()=>true;chooseReviewVersion();");
  r.el('reviewVersionFile').files=[{name:'file.pdf',type:'application/pdf',size:9}];r.el('reviewVersionFile').onchange();r.run(change);
  noWrites(r,()=>r.run("readers[0].result='data:application/pdf;base64,JVBERi0xLjQK';readers[0].onload()"));
 }
});
if (failures.length) {
  console.error(`FAIL: ${failures.length} contextual review regressions; ${count} passed.`);
  process.exitCode = 1;
} else console.log(`PASS: ${count} contextual review workflow regressions; DOM/VM and source contracts, not browser geometry.`);
