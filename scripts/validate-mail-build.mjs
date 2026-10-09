import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');const dist=path.join(root,'dist');
async function files(dir){const output=[];for(const name of await fs.readdir(dir)){const p=path.join(dir,name),s=await fs.lstat(p);assert.ok(!s.isSymbolicLink(),'No symlinks');if(s.isDirectory())output.push(...await files(p));else output.push(p);}return output;}
const publicFiles=await files(path.join(dist,'client'));
for(const file of publicFiles){const relative=path.relative(path.join(dist,'client'),file);assert.ok(relative.startsWith('assets'+path.sep)||(!relative.includes(path.sep)&&relative.endsWith('.html')),relative);assert.ok(!/\.(?:env|sql|mjs|cjs|ts|map)$/.test(file),file);}
const hosting=JSON.parse(await fs.readFile(path.join(dist,'.openai/hosting.json'),'utf8'));assert.equal(hosting.d1,'DB');assert.ok(!hosting.static);
const code=await fs.readFile(path.join(dist,'server/index.js'),'utf8');const module=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));assert.equal(typeof module.default.fetch,'function');
const r=await module.default.fetch(new Request('https://example.test/api/crm/status'),{});assert.equal(r.status,503);
assert.ok((await files(path.join(dist,'.openai/drizzle'))).some(x=>x.endsWith('.sql')));
console.log(`PASS: ESM Worker contract, fail-closed runtime, migrations and ${publicFiles.length} allowlisted public files; no source/secrets in public output.`);
