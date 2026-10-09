'use strict';
// Static semantic contracts plus class-only script equivalence; no pixel QA.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'backoffice.html'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/css/backoffice-refinement.css'),'utf8').split('/* BACKOFFICE CONTROL ROLES')[1];
const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
const rule=fragment=>rules.find(([,s])=>s.includes(fragment))?.[2]||'';
const selected=rule('.review-attachment).active');
assert.match(selected,/background:var\(--bo-control-light\)!important/);
assert.match(selected,/border-color:var\(--bo-control-line\)!important/);
assert.doesNotMatch(selected,/--bo-control-solid/);
for(const control of ['.tab','.period-btn','.patient-tab','.bureau-dashboard-tab','.dispersion-inner-tab','.amortization-view-tabs button','.dispersion-demo-actions button','.review-attachment'])assert.ok(rules.find(([,s])=>s.includes(control)&&s.includes(').active')));
assert.match(rule('.nav-btn.active{')||rule('.nav-btn.active'),/background:var\(--bo-control-light\)!important/);
assert.match(css,/\.nav-btn\[data-id="providers"\],\.nav-btn\[data-id="providerRequests"\]/);
assert.match(rule(' .btn-approve,'),/background:var\(--green-bg\)!important/);
assert.match(rule(' .btn-warning'),/background:#FFFBEB!important/);
const buttons=[...html.matchAll(/<button\b[^>]*>/g)].map(m=>m[0]);
const matching=handler=>buttons.filter(tag=>tag.includes('onclick="'+handler));
for(const handler of ['approvePatient(', 'backofficePatientDocAction(', "reviewDocumentAction(\\'approved\\')"]){const tags=matching(handler);assert.ok(tags.length,handler);for(const tag of tags)assert.match(tag,/class="[^"]*btn-approve/);}
for(const tag of [...matching('openDocumentReview('),...buttons.filter(tag=>tag.includes('data-queue-index='))]){assert.match(tag,/btn-secondary/);assert.doesNotMatch(tag,/btn-primary|provider-approve|btn-approve/);}
assert.doesNotMatch(html,/replace\('btn-primary','provider-approve'\)/,'Never infer approval from the first primary class in generated markup');
assert.match(html,/review-attachment \$\{index===c.attachmentIndex\?'active':''\}/);
for(const handler of ['dispersionApplyPayment(', 'dispersionMarkProviderDispersed(', 'dispersionManageActionApply('])for(const tag of matching(handler)){assert.match(tag,/btn-primary/);assert.doesNotMatch(tag,/btn-approve|provider-approve/);}
// Ignore only HTML class attributes and the removed presentation-only adapter.
// The reviewed 2026-10-09 approved-fix snapshot pins handlers, storage, permissions and routing.
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const normalize=s=>s.replace(/class="[^"]*"/g,'class=""').replace(".replace('btn-primary','provider-approve').replace('btn-coral','btn-danger')",'');
const behaviorHtml=require('./fixtures/restore-pre-sidebar.cjs')(html);
const scripts=[...behaviorHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>sha(normalize(m[1])));
assert.deepEqual(scripts,require('./fixtures/backoffice-color-behavior-baseline.json'));
// Contrast arithmetic for authored tokens, not computed/browser colors.
const luminance=hex=>{const c=hex.match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
assert.equal((css.match(/--bo-control-focus:#030A18;/g)||[]).length,2);
for(const fill of ['20C7D4','FF8A5B','EFFFFF','FFF1EA','DCFCE7','BBF7D0','FFFBEB','FEF3C7','DC2626','B91C1C','FFFFFF'])assert.ok(contrast('030A18',fill)>=3,`Inset focus contrast on ${fill}`);
console.log('PASS: explicit approve/review/warning/financial roles, pale selected navigation and attachments, provider context and reviewed repair script snapshot. Browser QA remains unrun.');
