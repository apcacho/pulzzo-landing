'use strict';
// Exercise the shipped photo templates; inspect their element tree, not pixels.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../registro-doctor.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../assets/css/registration-responsive.css'),'utf8');
const start=html.indexOf('      const sharedPhoto=');
const end=html.indexOf('\n',html.indexOf('      const photoHtml=',start));
assert.ok(start>=0&&end>start);
const template=html.slice(start,end)+'\nglobalThis.renderedPhoto=photoHtml;';
// Small tree reader for these trusted templates only, including native void tags.
function tree(markup){
 const root={tag:'root',attrs:'',children:[]},stack=[root];
 for(const match of markup.matchAll(/<\/?([a-z][a-z0-9-]*)\b([^>]*)>/gi)){
  const [raw,tag,attrs]=match;
  if(raw.startsWith('</')){assert.equal(stack.pop().tag,tag);continue;}
  const node={tag,attrs,children:[]};stack.at(-1).children.push(node);
  if(!/^(?:img|input|br|hr|meta|link)$/.test(tag)&&!raw.endsWith('/>'))stack.push(node);
 }
 assert.equal(stack.length,1);return root;
}
const klass=(node,name)=>new RegExp('class="[^"\\n]*\\b'+name+'\\b').test(node.attrs);
const descendants=node=>node.children.flatMap(child=>[child,...descendants(child)]);
for(const role of ['legacy','assistant','holder'])for(const kind of ['doctor','clinica'])for(const mode of ['empty','upload','social']){
 const sharedContext=role==='legacy'?null:{isAssistant:role==='assistant',isHolder:role==='holder'};
 const s={profile:{accountType:kind},files:{},photoMode:mode==='social'?'social':'',profilePhotoData:''};
 if(mode==='upload'){if(sharedContext)s.files.profile_photo=[{name:'photo.png'}];else s.profilePhotoData='data:image/png;base64,AAAA';}
 const context={s,sharedContext,htmlSafeProfile:value=>String(value)};
 vm.runInNewContext(template,context);
 const root=tree(context.renderedPhoto),[row,help,options]=root.children;
 assert.ok(klass(row,'profile-photo-card'));
 assert.deepEqual(row.children.map(node=>node.attrs.match(/class="([^"]+)"/)[1]),['profile-photo-main','profile-photo-toolbar'],`${role}/${kind}/${mode}: retain exactly the two native flex children`);
 assert.ok(klass(help,'profile-photo-help'),'help follows the row as its full-width sibling');
 assert.equal(help.children.length,2);
 assert.match(help.children[1].attrs,/id="profilePhotoMessage"/);
 assert.match(help.children[1].attrs,/role="status".*aria-live="polite"/);
 assert.ok(klass(options,'profile-photo-edit-options'));
 assert.equal(descendants(root).filter(n=>/id="profileModifyPhoto"/.test(n.attrs)).length,1);
 assert.equal(descendants(root).filter(n=>/id="profilePhotoUploadInput"/.test(n.attrs)).length,1);
 assert.match(context.renderedPhoto,/PNG, JPEG, WebP o GIF/);
 assert.match(context.renderedPhoto,sharedContext?/25 MiB en total/:/Máximo 5 MiB por foto/);
}
assert.match(html,/\.profile-photo-card\{[^}]*display:flex;align-items:center;justify-content:space-between;gap:18px;/);
assert.match(css,/\.profile-photo-help\{margin-top:12px;color:#64748B;font-size:14px;line-height:1\.5;\}/);
assert.match(css,/\.profile-photo-help \[role="status"\]:empty\{display:none;\}/);
console.log('PASS photo row: 18 role/type/state template combinations retain the two native flex children, with help and live feedback outside the horizontal row. Browser pixels unverified.');
