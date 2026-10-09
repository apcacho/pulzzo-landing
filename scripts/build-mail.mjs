import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
const root=path.resolve(import.meta.dirname,'..'),dist=path.join(root,'dist');
await fs.rm(dist,{recursive:true,force:true});
await fs.mkdir(path.join(dist,'client'),{recursive:true});
await fs.mkdir(path.join(dist,'server'),{recursive:true});
await fs.mkdir(path.join(dist,'.openai'),{recursive:true});
// Only static application assets reach the public directory. Never copy the repository.
for(const name of await fs.readdir(root))if(name.endsWith('.html'))await fs.copyFile(path.join(root,name),path.join(dist,'client',name));
await fs.cp(path.join(root,'assets'),path.join(dist,'client','assets'),{recursive:true});
await fs.copyFile(path.join(root,'.openai','hosting.json'),path.join(dist,'.openai','hosting.json'));
await fs.cp(path.join(root,'drizzle'),path.join(dist,'.openai','drizzle'),{recursive:true});
await build({entryPoints:[path.join(root,'server/index.mjs')],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:path.join(dist,'server/index.js'),sourcemap:false,legalComments:'none'});
// Does not register, push, create credentials, configure runtime secrets, or deploy.
console.log('Local Worker + allowlisted static assets built. Activation and live callback remain unverified.');
