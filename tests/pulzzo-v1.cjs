'use strict';
const assert = require('node:assert/strict');
const V1 = require('../assets/js/pulzzo-v1.js');
const Store = require('../assets/js/crm-demo-store.js');

class Memory {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  keys() { return [...this.map.keys()]; }
}

function store(storage, actor) {
  return Store.createStore({storage, actor: actor || {id:'admin_demo', role:'admin'}, now:() => new Date('2026-10-20T15:00:00.000Z')});
}

const matrix = V1.qrMatrix('HI');
assert.equal(matrix && matrix.version, 1);
assert.equal(matrix.size, 21, 'QR version 1 is 21 modules');
assert.deepEqual(matrix.modules, V1.qrMatrix('HI').modules, 'QR is deterministic');
assert.equal(matrix.modules[0].slice(0, 7).join(''), '1111111');
assert.equal(matrix.modules[1].slice(0, 7).join(''), '1000001');
assert.equal(matrix.modules[2].slice(0, 7).join(''), '1011101');
assert.equal(matrix.modules[6].slice(0, 7).join(''), '1111111');
assert.equal(V1.qrSvg('HI').indexOf('<svg'), 0);
assert.equal(V1.qrMatrix('x'.repeat(200)), null);

const phases = V1.phaseAmounts(100.01, [{id:'a', percent:20}, {id:'b', percent:70}, {id:'c', percent:10}]);
assert.deepEqual(phases.map(row => row.amount), [20, 70.01, 10]);
assert.equal(phases.reduce((sum, row) => sum + row.amount, 0), 100.01);
assert.equal(V1.validatePhases([{label:'A', percent:50}, {label:'B', percent:40}]).ok, false);
assert.equal(V1.validatePhases([{label:'A', percent:20}, {label:'B', percent:80}]).ok, true);
const phaseStorage = new Memory();
const saved = V1.savePhases(phaseStorage, 'APP-1', [{id:'fase-1', label:'Anticipo', percent:20}, {id:'fase-2', label:'Procedimiento', percent:70}, {id:'fase-3', label:'Cierre', percent:10}], 1000);
assert.equal(saved.ok, true);
assert.equal(V1.releasePhase(phaseStorage, 'APP-1', 'fase-1', {total:1000, evidence:'', kamValidated:true}).ok, false);
assert.equal(V1.releasePhase(phaseStorage, 'APP-1', 'fase-2', {total:1000, evidence:'Nota demo', kamValidated:true}).ok, false);
const released = V1.releasePhase(phaseStorage, 'APP-1', 'fase-1', {total:1000, evidence:'Evidencia demo del doctor', kamValidated:true});
assert.equal(released.ok, true);
assert.equal(released.book.phases[0].status, 'liberada');
assert.equal(V1.savePhases(phaseStorage, 'APP-1', [{id:'fase-1', label:'Anticipo', percent:50}, {id:'fase-2', label:'Resto', percent:50}], 1000).ok, false);
const offTotal = V1.savePhases(new Memory(), 'APP-SUM', [{id:'a', label:'Anticipo', percent:50}, {id:'b', label:'Cierre', percent:40}], 96000);
assert.equal(offTotal.ok, false);
assert.equal(offTotal.error, 'Los porcentajes deben sumar 100%.');
const phasePanel = V1.phasePanelHtml({id:'APP-1', application:{requestedAmount:1000}});
assert.ok(phasePanel.includes(V1.LEGAL_NOTE));
assert.match(phasePanel, /<table class="v1-phase-table"/);
assert.match(phasePanel, /<td>Total<\/td>/);
assert.match(phasePanel, /data-v1-phase-total>100%</);
assert.match(phasePanel, /data-v1-phase-amount-total>\$1,000\.00/);
assert.match(phasePanel, /data-v1-phase-warn hidden>Los porcentajes deben sumar 100%/);
assert.match(phasePanel, /v1-phase-title/);
assert.match(phasePanel, /title="Falta la evidencia del doctor y la validación del KAM\."/);
assert.equal((phasePanel.match(/title="Falta la fase anterior, la evidencia del doctor y la validación del KAM\."/g) || []).length, 2);
assert.match(phasePanel, /data-v1-save-phases/);
assert.doesNotMatch(phasePanel, /data-v1-save-phases[^>]*disabled/);
assert.equal((phasePanel.match(/v1-release"[^>]*disabled/g) || []).length, 3);
assert.match(phasePanel, />Liberar</);
assert.match(phasePanel, /v1-phase-footer/);
assert.equal(phaseStorage.keys().includes('pulzzo_backoffice_demo'), false);

assert.equal(V1.isPunctual({paymentSchedule:[]}).eligible, false);
assert.equal(V1.isPunctual({paymentSchedule:[{status:'pagado', dpd:0}, {status:'pagado', dpd:0}, {status:'pagado', dpd:0}]}, {paymentsRequired:3}).eligible, true);
assert.equal(V1.isPunctual({paymentSchedule:[{status:'pagado', dpd:0}, {status:'Vencido', dpd:2}]}, {paymentsRequired:1}).eligible, false);
assert.equal(V1.isPunctual({paymentSchedule:[{status:'liquidado', dpd:0}]}, {paymentsRequired:5}).eligible, true);
const storedRate = 0.36;
const nextRate = V1.preferentialAnnualRate(storedRate, {discountPoints:2}, true);
assert.equal(storedRate, 0.36);
assert.equal(nextRate, 0.34);
assert.equal(V1.preferentialAnnualRate(storedRate, {discountPoints:2}, false), storedRate);
assert.equal(V1.suggestedOfferRate({offer:{status:'borrador'}, application:{ordinaryAnnualRate:0.36}, paymentSchedule:[{status:'pagado', dpd:0}]}), null);
const punctualStorage = new Memory();
assert.equal(V1.savePunctualSettings(punctualStorage, {paymentsRequired:4, discountPoints:1.5}).ok, true);
assert.deepEqual(V1.punctualSettings(punctualStorage), {paymentsRequired:4, discountPoints:1.5});
assert.equal(V1.punctualSettings(new Memory()).paymentsRequired, 3);

assert.equal(V1.offerCapDecision({id:'kam_ana'}, 50000, () => ({allowed:false, reason:'El monto supera tu tope; se escala a Administración.'})).allowed, false);
assert.equal(V1.offerCapDecision(null, 1000, () => ({allowed:false})).skipped, true);
assert.equal(V1.offerCapDecision({id:'admin_demo'}, 0, () => { throw new Error('INVALID_AMOUNT'); }).skipped, true);
assert.equal(V1.offerCapDecision({id:'admin_demo'}, 80000, () => ({allowed:true, cap:null})).allowed, true);

assert.equal(V1.officeProgress('en_evaluacion'), '');
assert.equal(V1.officeProgress('aprobada_para_oferta'), 'Aprobado');
assert.equal(V1.officeProgress('oferta_enviada'), 'Aprobado');
assert.equal(V1.officeProgress('contrato_firmado'), 'Firmado');
assert.equal(V1.officeProgress('activo'), 'Dispersado');
assert.equal(V1.officeProgress('dispersada'), 'Dispersado');

assert.equal(V1.affiliationTitle('Dra. Jimena Solís Prado', 2), 'Afiliar al Dr. Jimena Solís Prado (2 pacientes esperando)');
assert.equal(V1.affiliationTitle('Dr. Héctor Valdés Ríos', 1), 'Afiliar al Dr. Héctor Valdés Ríos (1 paciente esperando)');
const directory = new Memory();
assert.deepEqual(V1.affiliatedOptions(directory), []);
const found = V1.searchDoctors(directory, 'valdes');
assert.equal(found.length, 1);
assert.equal(found[0].affiliated, false);
assert.equal(found[0].mark, V1.UNAFFILIATED_MARK);
assert.equal(V1.unaffiliatedDoctors(directory).some(row => row.id === 'unaff-solis'), true);
const fresh = new Memory();
assert.deepEqual(V1.flushAffiliationTasks(fresh), {ok:true, created:0});
assert.equal(fresh.getItem(V1.OPS_KEY), null);
const queued = V1.queueAffiliation(directory, V1.unaffiliatedDoctors(directory)[0], 'paciente-demo-1');
assert.equal(queued.title, 'Afiliar al Dr. Héctor Valdés Ríos (1 paciente esperando)');
const flushed = V1.flushAffiliationTasks(directory);
assert.equal(flushed.created, 1);
const admin = store(directory);
const task = admin.listTasks({}).find(row => row.title.indexOf('Afiliar al Dr. Héctor Valdés Ríos') === 0);
assert.ok(task);
assert.equal(task.title, 'Afiliar al Dr. Héctor Valdés Ríos (1 paciente esperando)');
V1.queueAffiliation(directory, V1.unaffiliatedDoctors(directory)[0], 'paciente-demo-2');
assert.equal(V1.flushAffiliationTasks(directory).created, 0);
assert.equal(admin.listTasks({}).filter(row => row.status !== 'closed' && row.title.indexOf('Afiliar al Dr. Héctor') === 0).length, 1);
assert.equal(admin.listTasks({}).find(row => row.title.indexOf('Afiliar al Dr. Héctor') === 0).title, 'Afiliar al Dr. Héctor Valdés Ríos (2 pacientes esperando)');

const referralStorage = new Memory();
const link = V1.ensureDoctorReferral(referralStorage, {id:'MED-DEMO-1', name:'Dra. Laura Méndez', kamId:'kam_ana'});
assert.ok(link.token);
assert.ok(link.path.includes('docref='));
const crm = store(referralStorage);
const created = crm.createContact({type:'patient', name:'Paciente Referido Demo', email:'paciente.referido.demo@pulzzo.invalid', phone:'5510002001', doctorReferralToken:link.token}, crm.snapshot().revision);
assert.equal(created.ok, true, created.error);
assert.equal(created.value.originalSource, 'doctor_referral');
assert.equal(created.value.referringKam, null);
assert.equal(created.value.assignedKam, 'kam_ana');
assert.match(created.value.notes, /MED-DEMO-1/);
assert.equal(V1.doctorFunnel(referralStorage, {id:'MED-DEMO-1', name:'Dra. Laura Méndez'}).interesados.some(row => row.name === 'Paciente Referido Demo'), true);
const invalid = crm.createContact({type:'patient', name:'Paciente Sin Enlace', email:'paciente.sin.enlace.demo@pulzzo.invalid', phone:'5510002002', doctorReferralToken:'no-existe', originalSource:'organic'}, crm.snapshot().revision);
assert.equal(invalid.ok, true, invalid.error);
assert.equal(invalid.value.originalSource, 'organic');
assert.equal(invalid.value.referringKam, null);

const landingStorage = new Memory();
const lead = V1.saveLandingContact({origin:'contact', name:'Ana López Demo', email:'ana.lopez.demo@pulzzo.invalid', phone:'55 1000 3001'}, landingStorage);
assert.equal(lead.ok, true, lead.error);
assert.equal(lead.contact.originalSource, 'direct');
assert.match(lead.contact.notes, /Quiero que me contacten/);
const refer = V1.saveLandingContact({origin:'refer', name:'Ana López', prefix:'Dra.', contact:'doctor.referido.demo@pulzzo.invalid', referrer:'quien.refiere.demo@pulzzo.invalid'}, landingStorage);
assert.equal(refer.ok, true, refer.error);
assert.equal(refer.contact.type, 'doctor');
assert.equal(refer.contact.originalSource, 'doctor_referral');
assert.equal(refer.contact.referringKam, null);
assert.match(refer.contact.notes, /Referir doctor/);
const landing = store(landingStorage);
assert.equal(landing.listTasks({contactId:lead.contact.id}).length, 1);
assert.equal(landing.listTasks({contactId:refer.contact.id}).length, 1);

const summary = V1.notificationSummary(
  [{id:'c1', stage:'new', assignedKam:'kam_ana', deletedAt:null}, {id:'c2', stage:'contacted', assignedKam:'kam_luis', deletedAt:null}],
  [{contactId:'c1', status:'open', dueAt:'2020-01-01T00:00:00.000Z'}, {contactId:'c2', status:'closed', dueAt:'2020-01-01T00:00:00.000Z'}],
  {id:'kam_ana', role:'kam'},
  '2026-10-20T15:00:00.000Z'
);
assert.equal(summary.pending, 1);
assert.equal(summary.leads, 1);
assert.equal(summary.overdue, 1);
assert.equal(summary.total, 3);

const csv = V1.toCsv([{name:'=cmd', source:'direct'}], [{label:'Nombre', key:'name'}, {label:'Origen', value:row => row.source}]);
assert.match(csv, /^# Demo local PULZZO\. No es un reporte oficial\./);
assert.match(csv, /"'=cmd"/);
assert.equal(V1.extensionMotivo('  causa ').ok, true);
assert.equal(V1.extensionMotivo('  causa ').motivo, 'causa');
assert.equal(V1.extensionMotivo('').ok, false);
assert.equal(V1.extensionMotivo(null, '   ').ok, false);
assert.equal(V1.NOTICE, 'Por tu buen historial, tu próximo crédito tendrá una tasa preferente');

const office = new Memory();
office.setItem('pulzzo_backoffice_demo', JSON.stringify({patients:[{id:'APP-9', patient:{fullName:'Elena Demo'}, application:{doctorName:'Dra. Laura Méndez', applicationStatus:'aprobada_para_oferta', providerDispersions:[{id:'PAG-1', amount:1000, status:'Pendiente', reference:'REF-DEMO-1', dispersionDate:'2026-11-01'}]}}]}));
const funnel = V1.doctorFunnel(office, {id:'otro', name:'Dra. Laura Méndez'});
assert.equal(funnel.aprobados.length, 1);
assert.equal(funnel.interesados.length, 0);
const payouts = V1.doctorPayouts(office, {name:'Dra. Laura Méndez'});
assert.equal(payouts.pending, 1000);
assert.equal(payouts.paid, 0);
assert.equal(payouts.upcoming[0].reference, 'REF-DEMO-1');
assert.equal(payouts.upcoming[0].date, '2026-11-01');

console.log('PASS: pulzzo v1 referral, phases, punctual rule, offer cap, CRM intake and doctor funnel.');
