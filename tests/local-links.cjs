'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
let count=0;
for(const filename of fs.readdirSync(root).filter(x=>x.endsWith('.html'))){
  const html=fs.readFileSync(path.join(root,filename),'utf8');
  for(const match of html.matchAll(/(?:href|src)=["']([^"']+)["']/g)){
    const url=match[1];
    if(/^(?:[a-z][a-z\d+.-]*:|\/\/|#|\$\{)/i.test(url))continue;
    const localPath=decodeURIComponent(url.split(/[?#]/)[0]);
    if(!localPath)continue;
    assert.ok(fs.existsSync(path.resolve(root,localPath)),`${filename}: missing local target ${localPath}`);count++;
  }
}
console.log(`PASS: ${count} local resource/link targets exist.`);
