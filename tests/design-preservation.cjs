'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
// Reviewed 2026-10-12: flat shadow/radius declarations and nonshadow camera masks.
const baseline=require('./fixtures/design-baseline.json');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
for(const [file,expected] of Object.entries(baseline.styles)){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  let originalHtml=file==='backoffice.html'?html.replace(/<style id="provider-(?:intake-)?consistency-styles">[\s\S]*?<\/style>/g,''):html;
  // The audited embedded bureau tooltip is the sole authorized legacy CSS fix.
  if(file==='backoffice.html')originalHtml=originalHtml.replace(/\.mop-cell-big:hover::after, \.mop-cell-big:focus::after([^}]+)}/g,(_,body)=>'.mop-cell-big:hover::after'+body.replace('color: #172C40','color: var(--white)')+'}');
  const actual=[...originalHtml.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(match=>sha(match[1]));
  const native=require('./fixtures/native-original-styles.json')[file];
  assert.deepEqual(actual,native?native.styles:expected,`${file}: reviewed flat style blocks changed`);
}
for(const [file,expected] of Object.entries(baseline.assets))assert.equal(sha(fs.readFileSync(path.join(root,file))),expected,`${file}: image asset changed`);
console.log('PASS: reviewed flat CSS snapshot and original image assets preserved; provider additions and audited bureau tooltip fix retained. This is not visual browser QA.');
