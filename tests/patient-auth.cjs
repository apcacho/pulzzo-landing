'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Run the actual shipped inline scripts and shared helper without browser access.
// This checks state/handlers, not browser rendering, native form validation, or history.
const root = path.resolve(__dirname, '..');
const helper = fs.readFileSync(path.join(root, 'assets/js/patient-demo.js'), 'utf8');
const patient = { demo: true, demoId: 'synthetic-fixture', nombre: 'Persona', fullName: 'Persona Demo', correo: 'fixture@example.test', celular: '55 0000 0000' };
const completed = { geoDone: true, procedureDone: true, estimateDone: true, identityDone: true, incomeDone: true, documentsDone: true, creditAuthConfirmed: true };

function fixture(file, values = {}, options = {}) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const records = new Map(Object.entries(values).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
  const listeners = new Map();
  const elements = new Map();
  const dialogs = [];
  let confirmResult = false;
  let failWrite = options.failWrite;
  const storage = {
    getItem(key) { if (options.blocked) throw new Error('Storage blocked'); return records.has(key) ? records.get(key) : null; },
    setItem(key, value) { if (options.blocked || (failWrite && failWrite(key))) throw new Error('Storage unavailable'); records.set(key, String(value)); },
    removeItem(key) { if (options.blocked) throw new Error('Storage blocked'); records.delete(key); }
  };
  for (const match of html.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const attributes = match[2];
    const attributesMap = Object.fromEntries([...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    const elementListeners = new Map();
    elements.set(match[3], {
      tagName: match[1].toUpperCase(), attributes: attributesMap, value: attributesMap.value || '',
      disabled: /\bdisabled(?:\s|=|$)/.test(attributes), hidden: /\bhidden(?:\s|=|$)/.test(attributes),
      readOnly: /\breadonly(?:\s|=|$)/.test(attributes), checked: false, textContent: '', className: attributesMap.class || '', href: attributesMap.href || '',
      addEventListener(type, handler) { if (!elementListeners.has(type)) elementListeners.set(type, []); elementListeners.get(type).push(handler); },
      dispatch(type) { const event = { preventDefault() {}, target: this }; for (const fn of elementListeners.get(type) || []) fn(event); },
      focus() { this.focused = true; }, reportValidity() { this.validityReported = true; return this.checked; }
    });
  }
  const window = {
    localStorage: storage, location: { href: file },
    addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(handler); },
    confirm(message) { dialogs.push(message); return confirmResult; }
  };
  const document = { getElementById(id) { assert.ok(elements.has(id), 'actual HTML contains #' + id); return elements.get(id); } };
  const context = vm.createContext({ window, document });
  vm.runInContext(helper, context, { filename: 'assets/js/patient-demo.js' });
  for (const [index, match] of [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].entries()) {
    if (match[1].trim()) vm.runInContext(match[1], context, { filename: file + ':inline-' + index });
  }
  return {
    html, window, storage, dialogs, elements,
    get(id) { return elements.get(id); },
    dispatch(id, type) { elements.get(id).dispatch(type); },
    input(id, value) { elements.get(id).value = value; elements.get(id).dispatch('input'); },
    event(type) { for (const fn of listeners.get(type) || []) fn(); },
    saved() { return Object.fromEntries(records); },
    approveReset(value) { confirmResult = value; },
    failWrites(predicate) { failWrite = predicate; }
  };
}

test('fresh login uses no password and guides to registration without creating identity', () => {
  const page = fixture('login-paciente.html');
  assert.doesNotMatch(page.html, /<input\b[^>]*type="password"/i);
  assert.equal(page.get('email').readOnly, true);
  assert.equal(page.get('login-demo-btn').disabled, true);
  assert.match(page.get('login-message').textContent, /Crear registro demo/);
  assert.equal(page.saved().pulzzo_patient, undefined);
});

test('direct verification without registration cannot create a verified account', () => {
  const page = fixture('verificacion-cuenta.html');
  assert.equal(page.get('code').disabled, true);
  page.dispatch('verify-form', 'submit');
  assert.equal(page.saved().pulzzo_verified, undefined);
  assert.equal(page.get('demo-next-link').href, 'registro-paciente.html');
});

test('registration requires explicit demo acknowledgment and uses fixed synthetic data', () => {
  const page = fixture('registro-paciente.html');
  assert.doesNotMatch(page.html, /<input\b[^>]*type="password"/i);
  assert.equal(page.get('correo').value, 'paciente@example.test');
  page.dispatch('patientRegisterForm', 'submit');
  assert.equal(page.saved().pulzzo_patient, undefined);
  assert.equal(page.get('consent').validityReported, true);
  page.get('correo').value = 'unsaved@example.test';
  page.get('primer_nombre').value = 'Unsaved';
  page.get('consent').checked = true;
  page.dispatch('patientRegisterForm', 'submit');
  const saved = page.saved();
  assert.equal(page.window.location.href, 'verificacion-cuenta.html');
  assert.equal(JSON.parse(saved.pulzzo_patient).correo, 'paciente@example.test');
  assert.equal(JSON.parse(saved.pulzzo_patient).nombre, 'Paciente');
  assert.equal(JSON.parse(saved.pulzzo_patient).demo, true);
  assert.equal(saved.pulzzo_verified, 'false');
  assert.equal(saved.pulzzo_register_backend_payload, undefined);
  const registered = saved.pulzzo_patient;
  page.dispatch('patientRegisterForm', 'submit');
  assert.equal(page.saved().pulzzo_patient, registered, 'repeated submit does not replace identity');
});

test('wrong demo codes are rejected; disclosed code advances once without sending messages', () => {
  const page = fixture('verificacion-cuenta.html', { pulzzo_patient: patient, pulzzo_verified: 'false' });
  page.input('code', '654321');
  page.dispatch('verify-form', 'submit');
  assert.match(page.get('message').textContent, /Usa 123456/);
  assert.equal(page.saved().pulzzo_verified, 'false');
  page.dispatch('resend', 'click');
  assert.match(page.get('message').textContent, /No se envían/);
  page.input('code', '123456');
  page.dispatch('verify-form', 'submit');
  assert.equal(page.saved().pulzzo_verified, 'true');
  assert.equal(page.window.location.href, 'solicitud-paciente.html#geolocalizacion');
  page.dispatch('verify-form', 'submit');
  assert.equal(page.saved().pulzzo_verified, 'true');
  assert.equal(page.saved().pulzzo_verification_backend_payload, undefined);
});

test('verification accepts only six numeric characters of the disclosed fixture', () => {
  const page = fixture('verificacion-cuenta.html', { pulzzo_patient: patient, pulzzo_verified: 'false' });
  page.input('code', 'xx1 2-3!');
  assert.equal(page.get('code').value, '123');
  assert.equal(page.get('verify-btn').disabled, true);
  page.dispatch('verify-form', 'submit');
  assert.equal(page.saved().pulzzo_verified, 'false');
});

test('unverified known local patient resumes verification without changing identity', () => {
  const page = fixture('login-paciente.html', { pulzzo_patient: patient, pulzzo_verified: 'false' });
  assert.equal(page.get('email').value, patient.correo);
  page.dispatch('patientLoginForm', 'submit');
  assert.equal(page.window.location.href, 'verificacion-cuenta.html');
  assert.deepEqual(JSON.parse(page.saved().pulzzo_patient), patient);
});

test('verified login resumes canonical milestone and ignores unused legacy status and unsafe hash', () => {
  const state = { geoDone: true, procedureDone: true, estimateDone: true };
  const page = fixture('login-paciente.html', {
    pulzzo_patient: patient, pulzzo_verified: 'true', pulzzo_application: state,
    pulzzoPatientStatus: 'offer_available', pulzzoPatientLastView: '//external.example.invalid', lastPatientView: 'javascript:alert(1)'
  });
  page.window.location.hash = '#oferta-contrato';
  page.dispatch('patientLoginForm', 'submit');
  assert.equal(page.window.location.href, 'solicitud-paciente.html#identidad');
  assert.deepEqual(JSON.parse(page.saved().pulzzo_patient), patient);
  assert.equal(page.saved().pulzzoPatientLoggedIn, undefined);
  assert.equal(page.saved().pulzzoPatientIdentifier, undefined);
});

test('registration protects existing patient and application from forced submission', () => {
  const state = { procedureDone: true, requestedAmount: 10000 };
  const page = fixture('registro-paciente.html', { pulzzo_patient: patient, pulzzo_verified: 'true', pulzzo_application: state });
  assert.equal(page.get('register-demo-btn').disabled, true);
  assert.equal(page.get('recovery-box').hidden, true);
  page.dispatch('patientRegisterForm', 'submit');
  assert.deepEqual(JSON.parse(page.saved().pulzzo_patient), patient);
  assert.deepEqual(JSON.parse(page.saved().pulzzo_application), state);
  assert.equal(page.saved().pulzzo_verified, 'true');
});

test('legacy credential fields are scrubbed recursively without displaying values', () => {
  const page = fixture('login-paciente.html', {
    pulzzo_patient: { ...patient, password: 'synthetic-secret-marker', backendReady: { passwordConfirmation: 'synthetic-secret-marker' } },
    pulzzo_application: { nested: { ciecPassword: 'synthetic-secret-marker', satPassword: 'synthetic-secret-marker' } },
    pulzzoPatientPassword: 'synthetic-secret-marker'
  });
  assert.equal(JSON.stringify(page.saved()).includes('synthetic-secret-marker'), false);
  assert.equal([...page.elements.values()].some(element => element.textContent.includes('synthetic-secret-marker')), false);
});

test('malformed/orphan recovery requires confirmation and backs up only scrubbed parseable records', () => {
  const application = { procedureDone: true, password: 'synthetic-secret-marker', nested: { ciecPassword: 'synthetic-secret-marker', keep: 'yes' } };
  const page = fixture('registro-paciente.html', {
    pulzzo_patient: '{"password":"synthetic-secret-marker",', pulzzo_application: application,
    pulzzo_verified: 'true', pulzzo_doctor: '{"unchanged":true}', unrelated_app: 'unchanged'
  });
  assert.equal(page.get('register-demo-btn').disabled, true);
  assert.equal(page.get('recovery-box').hidden, false);
  page.dispatch('reset-demo-btn', 'click');
  assert.ok(page.saved().pulzzo_patient, 'cancel preserves local record');
  page.approveReset(true);
  page.dispatch('reset-demo-btn', 'click');
  assert.match(page.dialogs.at(-1), /sin respaldo/);
  const saved = page.saved();
  assert.equal(saved.pulzzo_patient, undefined);
  assert.equal(saved.pulzzo_application, undefined);
  assert.equal(saved.pulzzo_verified, undefined);
  assert.equal(saved.pulzzo_doctor, '{"unchanged":true}');
  assert.equal(saved.unrelated_app, 'unchanged');
  const backup = JSON.parse(saved.pulzzo_patient_demo_recovery_backup);
  assert.deepEqual(backup.history[0].records.pulzzo_application, { procedureDone: true, nested: { keep: 'yes' } });
  assert.equal(backup.history[0].records.pulzzo_patient, undefined);
  assert.equal(saved.pulzzo_patient_demo_recovery_backup.includes('synthetic-secret-marker'), false);
  assert.equal(page.get('register-demo-btn').disabled, false);
});

test('failed recovery backup never clears the canonical records', () => {
  const page = fixture('registro-paciente.html', { pulzzo_application: { procedureDone: true }, pulzzo_verified: 'true' });
  page.failWrites(key => key === 'pulzzo_patient_demo_recovery_backup');
  page.approveReset(true);
  page.dispatch('reset-demo-btn', 'click');
  assert.deepEqual(JSON.parse(page.saved().pulzzo_application), { procedureDone: true });
  assert.equal(page.saved().pulzzo_verified, 'true');
  assert.match(page.get('register-message').textContent, /No pudimos completar/);
});

test('verified verification page offers canonical continuation and cannot re-verify', () => {
  const page = fixture('verificacion-cuenta.html', { pulzzo_patient: patient, pulzzo_verified: 'true', pulzzo_application: completed });
  assert.equal(page.get('verify-btn').disabled, true);
  assert.equal(page.get('demo-next-link').href, 'solicitud-paciente.html#portal');
  assert.match(page.get('message').textContent, /ya está completo/);
});

test('stale login and verification never silently approve a replacement identity', () => {
  const replacement = { ...patient, correo: 'replacement@example.test', demoId: 'replacement' };
  const login = fixture('login-paciente.html', { pulzzo_patient: patient, pulzzo_verified: 'false' });
  login.storage.setItem('pulzzo_patient', JSON.stringify(replacement));
  login.dispatch('patientLoginForm', 'submit');
  assert.equal(login.window.location.href, 'login-paciente.html');
  assert.match(login.get('login-message').textContent, /cambió/);
  const verify = fixture('verificacion-cuenta.html', { pulzzo_patient: patient, pulzzo_verified: 'false' });
  verify.input('code', '123456');
  verify.storage.setItem('pulzzo_patient', JSON.stringify(replacement));
  verify.dispatch('verify-form', 'submit');
  assert.equal(verify.saved().pulzzo_verified, 'false');
  assert.match(verify.get('message').textContent, /cambió/);
});

test('unavailable localStorage fails closed on all auth pages', () => {
  for (const [file, button, message] of [
    ['login-paciente.html', 'login-demo-btn', 'login-message'],
    ['registro-paciente.html', 'register-demo-btn', 'register-message'],
    ['verificacion-cuenta.html', 'verify-btn', 'message']
  ]) {
    const page = fixture(file, {}, { blocked: true });
    assert.equal(page.get(button).disabled, true);
    assert.match(page.get(message).textContent, /almacenamiento/);
  }
});

test('registration storage failure leaves no patient and reports no success', () => {
  const page = fixture('registro-paciente.html', {}, { failWrite: key => key === 'pulzzo_patient' });
  page.get('consent').checked = true;
  page.dispatch('patientRegisterForm', 'submit');
  assert.equal(page.window.location.href, 'registro-paciente.html');
  assert.match(page.get('register-message').textContent, /No pudimos guardar/);
  assert.equal(page.saved().pulzzo_patient, undefined);
});

test('verification storage failure leaves the demo unverified', () => {
  const page = fixture('verificacion-cuenta.html', { pulzzo_patient: patient, pulzzo_verified: 'false' });
  page.failWrites(key => key === 'pulzzo_verified');
  page.input('code', '123456');
  page.dispatch('verify-form', 'submit');
  assert.equal(page.window.location.href, 'verificacion-cuenta.html');
  assert.equal(page.saved().pulzzo_verified, 'false');
  assert.match(page.get('message').textContent, /No pudimos guardar/);
});

test('pageshow and cross-tab handlers refresh controls using current canonical state', () => {
  const page = fixture('login-paciente.html', { pulzzo_patient: patient, pulzzo_verified: 'false' });
  page.dispatch('patientLoginForm', 'submit');
  assert.equal(page.get('login-demo-btn').disabled, true);
  page.event('pageshow');
  assert.equal(page.get('login-demo-btn').disabled, false);
  page.storage.removeItem('pulzzo_patient');
  page.event('storage');
  assert.equal(page.get('login-demo-btn').disabled, true);
  const registration = fixture('registro-paciente.html');
  registration.storage.setItem('pulzzo_patient', JSON.stringify(patient));
  registration.event('pageshow');
  assert.equal(registration.get('register-demo-btn').disabled, true);
});

test('stored markup stays text and cannot become a login-page element', () => {
  const injected = { ...patient, correo: '<img src=x onerror=alert(1)>' };
  const page = fixture('login-paciente.html', { pulzzo_patient: injected, pulzzo_verified: 'false' });
  assert.equal(page.get('email').value, injected.correo);
  assert.doesNotMatch(page.html.match(/<script>[\s\S]*?<\/script>/)[0], /innerHTML/);
});
