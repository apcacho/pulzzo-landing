import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
// Give esbuild a closed, in-memory dependency graph. Node reads the workspace
// bytes; the native resolver never traverses parent directories or user files.
export const WORKER_MODULES=Object.freeze(['index.mjs','security.mjs','google.mjs','store.mjs']);
export async function bundleWorker(root){
 const directory=path.join(root,'server'),dirInfo=await fs.lstat(directory);
 if(!dirInfo.isDirectory()||dirInfo.isSymbolicLink())throw Error('Worker source directory must be a real directory');
 const sources=new Map();
 for(const name of WORKER_MODULES){
  const file=path.join(directory,name),info=await fs.lstat(file);
  if(!info.isFile()||info.isSymbolicLink())throw Error('Worker source must be a regular file: '+name);
  sources.set(name,await fs.readFile(file,'utf8'));
 }
 const result=await build({entryPoints:['index.mjs'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',sourcemap:false,legalComments:'none',plugins:[{
  name:'closed-worker-graph',setup(builder){
   builder.onResolve({filter:/.*/},args=>{
    const name=args.kind==='entry-point'?args.path:args.path.startsWith('./')?args.path.slice(2):null;
    if(!name||!sources.has(name))throw Error('Unexpected Worker dependency: '+args.path);
    return {path:name,namespace:'pulzzo-worker'};
   });
   builder.onLoad({filter:/.*/,namespace:'pulzzo-worker'},args=>({contents:sources.get(args.path),loader:'js'}));
  }
 }]});
 if(result.outputFiles.length!==1)throw Error('Expected one Worker bundle');
 return result.outputFiles[0].contents;
}
