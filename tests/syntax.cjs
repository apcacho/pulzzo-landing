const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let count=0;
for(const file of fs.readdirSync(root).filter(x=>x.endsWith('.html'))){
  const text=fs.readFileSync(path.join(root,file),'utf8');
  for(const [i,match] of [...text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].entries()){
    if(/type=["']application\/(?:ld\+)?json/.test(match[1]))continue;
    new vm.Script(match[2],{filename:`${file}:script${i+1}`}); count++;
  }
}
let external=0;
for(const file of ['assets/js/patient-demo.js','assets/js/backoffice-sidebar.js','assets/js/backoffice-portfolio.js','assets/js/backoffice-configuration.js','assets/pulzzo-demo-bridge.js','preview.cjs']){new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file});external++;}
console.log(`PASS: ${count} inline JavaScript blocks and ${external} external/local scripts compile.`);
