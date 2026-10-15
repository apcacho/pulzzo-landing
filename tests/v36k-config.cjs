// v36k: CRM settings live only in Configuración > CRM (inline); products page cards; non-blocking offer limits.
const assert=require('assert'),fs=require('fs'),path=require('path'),root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const tpl=read('assets/js/crm-demo-template.js'),ui=read('assets/js/crm-demo-ui.js'),cfg=read('assets/js/backoffice-configuration.js'),side=read('assets/css/backoffice-sidebar.css');
assert.doesNotMatch(tpl,/id="crmSettings"/,'CRM toolbar no longer has the Configuración del CRM button');
assert.doesNotMatch(read('crm-demo.html'),/id="crmSettings"/);
assert.match(ui,/action==='crm-settings'\)\{if\(typeof win\.configOpenCrmPage==='function'\)win\.configOpenCrmPage\(\)/,'crm-settings action routes to the Configuración page');
for(const t of ['¿Quién recibe un registro nuevo sin KAM?','KAMs en el reparto por turnos','El líder puede asignar o cambiar responsables','Motivo del cambio','Historial de reglas','Cuando un KAM deja de estar disponible'])assert.ok(cfg.includes(t),t);
assert.match(cfg,/leaderCanAssign:form\.elements\.namedItem\('leaderCanAssign'\)\.checked/,'switch stores the same boolean');
for(const t of ['Valores por defecto y límites del crédito','Cómo arranca cada oferta','Comisiones e IVA','Fuera de límites: requiere Administración','Próximamente'])assert.ok(cfg.includes(t),t);
assert.doesNotMatch(cfg.slice(cfg.indexOf('function configOfferLimitCheck')),/preventDefault|disabled=true/,'limits warning never blocks');
assert.match(side,/#appView>#sidebar>#nav\{flex:1 1 auto;min-height:0;overflow-y:auto/);
console.log('PASS: v36k configuration static checks');
