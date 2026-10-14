'use strict';
// Source/cascade contracts only. These checks do not render browser geometry.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const css=read('assets/css/backoffice-portfolio-polish.css');
const head=read('backoffice.html').split('</head>')[0];
assert.ok(head.lastIndexOf('assets/css/backoffice-portfolio-polish.css')>head.lastIndexOf('assets/css/backoffice-refinement.css'),'Portfolio layout override follows shared controls');
const portfolio=read('assets/js/backoffice-portfolio.js'),configuration=read('assets/js/backoffice-configuration.js');
// Parse the stylesheet's nested media blocks and declarations without browser startup.
const rules=[];
function parse(text,media=[]){
 text=text.replace(/\/\*[\s\S]*?\*\//g,'');let pos=0;
 while(pos<text.length){
  while(/\s/.test(text[pos]||'')&&pos<text.length)pos++;
  if(pos===text.length)break;
  const open=text.indexOf('{',pos);assert.ok(open>=0,'Every CSS rule has a block');
  const selector=text.slice(pos,open).trim();let depth=1,end=open+1;
  while(end<text.length&&depth){if(text[end]==='{')depth++;else if(text[end]==='}')depth--;end++;}
  assert.equal(depth,0,'Stylesheet braces balance');
  const content=text.slice(open+1,end-1);
  if(selector.startsWith('@media'))parse(content,[...media,selector]);
  else {
   assert.ok(!selector.startsWith('@'),'Only supported media at-rules used');
   const declarations={};
   for(const d of content.split(';').map(s=>s.trim()).filter(Boolean)){
    const colon=d.indexOf(':');assert.ok(colon>0,'Every declaration has a property/value');
    const key=d.slice(0,colon).trim(),value=d.slice(colon+1).trim();
    assert.match(key,/^(?:--?)?[a-z][a-z-]*$/i);assert.ok(value,`${key} is nonempty`);declarations[key]=value;
   }
   rules.push({selector,media,declarations});
  }
  pos=end;
 }
}
parse(css);
const has=(selector,property,value,media)=>rules.some(r=>r.selector.split(',').map(s=>s.trim()).includes(selector)&&r.declarations[property]===value&&(media? r.media.some(m=>m.includes(media)):r.media.length===0));
assert.ok(rules.length>100,'Portfolio/settings stylesheet is parsed');
assert.ok(has('#portfolio .portfolio-kpis','grid-template-columns','repeat(4,minmax(0,1fr))'),'Desktop has four compact primary KPI columns');
assert.ok(has('#portfolio .portfolio-kpis','grid-template-columns','repeat(2,minmax(0,1fr))','max-width:820px'),'Mobile primary KPIs stay two columns');
assert.ok(!rules.some(r=>r.selector==='#portfolio .portfolio-kpis'&&r.declarations['grid-template-columns']==='1fr'),'Mobile must not stack KPIs into four rows');
assert.ok(has('#portfolio .portfolio-charts','grid-template-columns','minmax(0,1fr)','max-width:1180px'));
assert.ok(has('#portfolio .portfolio-bar','grid-template-columns','minmax(0,1fr) minmax(0,1fr)','max-width:420px'),'Narrow charts put tracks below labels and amounts');
assert.ok(has('#portfolio .portfolio-bar-track','grid-column','1/-1','max-width:420px'));
assert.ok(has('#portfolio .portfolio-desktop-table','max-width','100%'));
assert.ok(has('#portfolio .portfolio-desktop-table','overflow','auto'));
assert.ok(has('#portfolio .portfolio-desktop-table','display','none','max-width:820px'));
assert.ok(has('#portfolio .portfolio-mobile-cards','display','none'));
assert.ok(has('#portfolio .portfolio-mobile-cards','display','grid','max-width:820px'));
for(const hook of ['portfolio-mobile-cards','portfolio-mobile-card','portfolio-card-values','portfolio-card-actions','portfolio-payment-quick','portfolio-movement-totals','portfolio-priority-list','portfolio-priority-item','portfolio-filter-buttons']){
 assert.ok(portfolio.includes(hook),`${hook} exists in rendered templates`);assert.ok(css.includes('.'+hook),`${hook} has layout`);
}
assert.match(portfolio,/class="table-wrap portfolio-desktop-table"/,'Table wrapper, not only table, is removed from mobile flow');
assert.ok(has('#portfolio .portfolio-filter-shell','display','none','max-width:820px'));
assert.ok(has('#portfolio .portfolio-filter-shell.is-open','position','fixed','max-width:820px'));
assert.ok(has('#portfolio .portfolio-filter-shell.is-open','height','100dvh','max-width:820px'));
assert.ok(has('#portfolio .portfolio-filter-shell.is-open','overflow-y','auto','max-width:820px'));
assert.ok(has('#portfolio .portfolio-filter-footer','display','none'),'Desktop applies changes directly with no redundant footer');
assert.ok(has('#portfolio .portfolio-filter-footer','position','sticky','max-width:820px'));
assert.ok(has('body.portfolio-filters-open','overflow','hidden','max-width:820px'));
assert.ok(has('body.portfolio-payment-open','overflow','hidden'));
assert.ok(has('.portfolio-payment-drawer','height','100dvh'));
assert.ok(has('.portfolio-payment-drawer','width','min(680px,100%)'));
assert.ok(has('.portfolio-payment-drawer','width','100%','max-width:820px'));
assert.ok(has('.portfolio-payment-context','flex','0 0 auto'));
assert.ok(has('.portfolio-payment-drawer .payment-apply-grid','grid-template-columns','repeat(2,minmax(0,1fr))'));
assert.ok(has('.portfolio-payment-drawer .payment-apply-grid','grid-template-columns','minmax(0,1fr)','max-width:820px'));
assert.ok(has('.portfolio-payment-body','min-height','0'));
assert.ok(has('.portfolio-payment-body','overflow-y','auto'));
assert.ok(has('.portfolio-payment-footer','flex','0 0 auto'));
assert.ok(has('.portfolio-payment-footer','padding-bottom','max(16px,env(safe-area-inset-bottom))'));
assert.ok(has('.portfolio-payment-overlay[hidden]','display','none!important'));
assert.ok(has('#settings [hidden]','display','none!important'),'Conditional authorization/credit IDs remain hidden');
assert.ok(has('#settings .cfg-block .info-grid','grid-template-columns','repeat(2,minmax(0,1fr))'));
assert.ok(has('#settings .cfg-block .info-grid','grid-template-columns','minmax(0,1fr)','max-width:820px'));
assert.ok(has('#settings .tabs','overflow-x','auto','max-width:820px'));
for(const hook of ['cfg-block','cfg-unit-input','cfg-check','cfg-review-summary','cfg-diff-row','cfg-review-actions']){
 assert.ok(configuration.includes(hook),`${hook} exists in settings`);assert.ok(css.includes('.'+hook),`${hook} has layout`);
}
for(const selector of ['#portfolio :is(input,select,textarea)','#settings :is(input,select,textarea)','.portfolio-payment-drawer :is(input,select,textarea)']){
 assert.ok(rules.some(r=>r.selector.includes(selector)&&r.declarations['font-size']==='16px!important'&&r.media.some(m=>m.includes('pointer:coarse'))),'Mobile/coarse-pointer text entry avoids input zoom');
}
for(const selector of ['#portfolio .portfolio-tabs button','#portfolio .portfolio-filter-chip','#portfolio .portfolio-link','#settings .cfg-check','#settings summary']){
 assert.ok(has(selector,'min-height','44px','pointer:coarse'),`${selector} keeps a coarse-pointer target`);
}
assert.match(css,/prefers-reduced-motion:reduce/);
assert.match(css,/forced-colors:active/);
assert.doesNotMatch(css,/(?:^|[}\s,])(?:\.sidebar|\.nav-btn|\.login|#login|\.auth)[^{]*\{/,'No unrelated navigation or auth styling');
assert.doesNotMatch(css,/(?:html|body)\s*\{[^}]*overflow-x\s*:\s*hidden/,'Overflow is contained by component layout, not page clipping');
// Sanity-check zero-minimum mobile grid budgets, without claiming text geometry.
for(const viewport of [320,360,390,412,768,820]){
 const content=viewport-32,card=(content-10)/2;
 assert.ok(card>=139,`${viewport}: both primary KPI tracks fit in content width`);
 assert.ok(content-32>0,`${viewport}: card content has a positive width`);
}
console.log('PASS: parsed CSS, 2×2 mobile KPIs, charts, cards, compact filters, seven-section forms, full-height drawers, hidden-state isolation and touch contracts. Browser layout and screenshots remain unrun.');
