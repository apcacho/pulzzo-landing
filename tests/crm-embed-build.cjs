'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pulzzo-crm-build-'));
try {
 for(const file of ['scripts/build-crm-embed.mjs','scripts/crm-demo-embed.source.js','assets/js/crm-demo-embed.js','assets/css/crm-demo.css','assets/css/crm-demo-embed.css']){
  fs.mkdirSync(path.dirname(path.join(temp,file)),{recursive:true});fs.copyFileSync(path.join(root,file),path.join(temp,file));
 }
 fs.symlinkSync(fs.realpathSync(path.join(root,'node_modules')),path.join(temp,'node_modules'),'dir');
 const run=(...args)=>spawnSync(process.execPath,[path.join(temp,'scripts/build-crm-embed.mjs'),...args],{encoding:'utf8'});
 assert.equal(run('--check').status,0);
 const css=path.join(temp,'assets/css/crm-demo-embed.css'),original=fs.readFileSync(css,'utf8');
 fs.appendFileSync(css,'\n/* drift fixture */\n');assert.notEqual(run('--check').status,0,'CSS drift must fail the check');
 assert.equal(run().status,0);assert.equal(run('--check').status,0,'Regeneration restores consistency');
 fs.writeFileSync(css,original+'\n@import "late.css";');assert.notEqual(run().status,0,'Imports cannot restore async paint dependencies');
 fs.writeFileSync(css,original+'\n.future{background:url(../future.png)}');assert.notEqual(run().status,0,'Relative URL rebasing cannot silently break');
 fs.writeFileSync(css,original);fs.appendFileSync(path.join(temp,'scripts/crm-demo-embed.source.js'),'\n// adapter drift fixture\n');assert.notEqual(run('--check').status,0,'Adapter source drift must fail the check');
 console.log('PASS: CRM source drift, deterministic regeneration, import and relative-URL guards.');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
