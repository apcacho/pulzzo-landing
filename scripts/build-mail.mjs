import fs from 'node:fs/promises';
import path from 'node:path';
import { bundleWorker } from './bundle-worker.mjs';
import { collectPublicAssets } from './mail-public-assets.mjs';
const root=path.resolve(import.meta.dirname,'..'),dist=path.join(root,'dist');
// Check before embedding too: its input reads/output write must never follow a
// public-tree symlink into a private file. Check again after generating the asset.
await collectPublicAssets(root,{allowMissing:['assets/js/crm-demo-embed.js']});
// Direct build invocations must also regenerate the static CRM embedding.
await import('./build-crm-embed.mjs');
// Validate before replacing the previous build. Never dereference an input symlink.
const publicFiles=await collectPublicAssets(root);
await fs.rm(dist,{recursive:true,force:true});
await fs.mkdir(path.join(dist,'client'),{recursive:true});
await fs.mkdir(path.join(dist,'server'),{recursive:true});
await fs.mkdir(path.join(dist,'.openai'),{recursive:true});
// Only static application assets reach the public directory. Never copy the repository.
for(const name of publicFiles){
 const target=path.join(dist,'client',name);
 await fs.mkdir(path.dirname(target),{recursive:true});
 await fs.copyFile(path.join(root,name),target);
}
await fs.copyFile(path.join(root,'.openai','hosting.json'),path.join(dist,'.openai','hosting.json'));
await fs.cp(path.join(root,'drizzle'),path.join(dist,'.openai','drizzle'),{recursive:true});
await fs.writeFile(path.join(dist,'server/index.js'),await bundleWorker(root));
// Does not register, push, create credentials, configure runtime secrets, or deploy.
console.log('Local Worker + allowlisted static assets built. Activation and live callback remain unverified.');
