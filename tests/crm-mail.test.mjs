import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import { createWorker } from '../server/index.mjs';
import { b64,seal,unseal,epoch,csrfToken,unb64 } from '../server/security.mjs';
import { SCOPES,mime,plainBody,encodedSubject,addresses } from '../server/google.mjs';
import { collectPublicAssets,isPublicPath,PUBLIC_PAGES,PUBLIC_ASSETS } from '../scripts/mail-public-assets.mjs';
// SQLite-backed D1 contract test double. Only HTTP is mocked; SQL really executes.
function database(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const name of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())db.exec(fs.readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values);},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){const result=db.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};}});
 return {raw:db,prepare:sql=>wrap(sql),async batch(statements){db.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}};
}
async function fixture(options={}){
 const DB=database();const env={DB,MAIL_ENABLED:'true',MAIL_OWNER_ID:'test-owner',MAIL_ORIGIN:'https://crm.test',MAIL_EXPECTED_ACCOUNT:'pulzzomx@gmail.com',GOOGLE_CLIENT_ID:'fixture-client',GOOGLE_CLIENT_SECRET:'fixture-only-not-a-real-secret',MAIL_ENCRYPTION_KEY:b64(new Uint8Array(32).fill(7))};
 const calls=[];let sendCount=0;
 const fetcher=async(url,init={})=>{calls.push({url:String(url),init});if(options.fetch)return options.fetch(url,init);let result;
  if(String(url).includes('oauth2.googleapis.com/token'))result={access_token:'fixture-access',refresh_token:'fixture-refresh',scope:SCOPES.join(' ')};
  else if(String(url).endsWith('/profile'))result={emailAddress:options.email||env.MAIL_EXPECTED_ACCOUNT};
  else if(String(url).endsWith('/messages/send')){sendCount++;if(options.sendError)throw Error('simulated timeout');result={id:'sent-message',threadId:'thread1'};}
  else if(String(url).includes('/messages?'))result={messages:options.candidates||[]};
  else if(String(url).includes('/messages/'))result=options.message||{};
  else if(String(url).includes('/threads/'))result=options.thread||{id:'thread1',messages:[]};
  else throw Error('Unexpected request '+url);
  return Response.json(result);
 };
 const worker=createWorker(fetcher);let token=await csrfToken('test-owner',env);
 async function req(path,{method='GET',body,headers={},actor='test-owner',origin=env.MAIL_ORIGIN,cookie,raw}={}){
  const h={'oai-authenticated-user-id':actor,...headers};if(method==='POST'){h.origin=origin;h['x-pulzzo-csrf']=token;h.cookie=cookie||'__Host-pulzzo-csrf='+token;h['content-type']='application/json';}Object.assign(h,headers);
  return worker.fetch(new Request(env.MAIL_ORIGIN+'/api/crm'+path,{method,headers:h,body:raw??(body!==undefined?JSON.stringify(body):method==='POST'?'{}':undefined)}),env);
 }
 const json=async(path,options)=>{const r=await req(path,options);return {status:r.status,data:await r.json(),headers:r.headers};};
 async function seed(){const cipher=await seal('fixture-refresh',env,'mailbox:test-owner:pulzzomx@gmail.com');DB.raw.prepare('INSERT INTO crm_mailboxes VALUES (?,?,?,?,?,?)').run('box1','test-owner','pulzzomx@gmail.com',cipher,epoch(),1);DB.raw.prepare('INSERT INTO crm_contacts VALUES (?,?,?,?,?,?)').run('contact1','test-owner','Contacto de prueba','recipient@example.com','other',epoch());}
 async function draft(){return (await json('/outbox',{method:'POST',body:{contactId:'contact1',subject:'Asunto español',body:'Mensaje de prueba'}})).data.draft;}
 return {env,DB,req,json,seed,draft,calls,worker,get sendCount(){return sendCount;}};
}
test('real mode fails closed with empty environment and makes no HTTP call',async()=>{const f=await fixture();const r=await f.worker.fetch(new Request('https://crm.test/api/crm/status'),{});assert.equal(r.status,503);assert.equal((await r.json()).error,'mail_not_configured');assert.equal(f.calls.length,0);});
test('every API path requires owner, including forged client role and from',async()=>{const f=await fixture();await f.seed();for(const path of ['/status','/contacts','/outbox','/threads']){assert.equal((await f.json(path,{actor:''})).status,401);assert.equal((await f.json(path,{actor:'attacker',headers:{'x-role':'admin'}})).status,403);}assert.equal(f.calls.length,0);});
test('configuration rejects insecure origin and malformed encryption key',async()=>{const f=await fixture();f.env.MAIL_ORIGIN='http://crm.test';assert.equal((await f.json('/status')).status,503);f.env.MAIL_ORIGIN='https://crm.test';f.env.MAIL_ENCRYPTION_KEY='short';assert.equal((await f.json('/status')).status,503);});
test('CSRF rejects wrong origin, missing header, wrong cookie, expired token and other owner',async()=>{const f=await fixture();const body={name:'A',email:'a@example.com',kind:'other'};for(const extra of [{origin:'https://evil.test'},{headers:{'x-pulzzo-csrf':''}},{cookie:'__Host-pulzzo-csrf=wrong'},{headers:{'x-pulzzo-csrf':'1.fake.fake'},cookie:'__Host-pulzzo-csrf=1.fake.fake'}])assert.equal((await f.json('/contacts',{method:'POST',body,...extra})).status,403);const other=await csrfToken('someone-else',f.env);assert.equal((await f.json('/contacts',{method:'POST',body,headers:{'x-pulzzo-csrf':other},cookie:'__Host-pulzzo-csrf='+other})).status,403);});
test('status returns no secrets and creates secure owner-bound csrf cookie',async()=>{const f=await fixture();await f.seed();const r=await f.json('/status');assert.equal(r.status,200);assert.equal(r.data.mailbox.email,'pulzzomx@gmail.com');assert.match(r.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Strict/);assert.doesNotMatch(JSON.stringify(r.data),/fixture-refresh|fixture-access|fixture-client/);});
test('encryption authentication binds mailbox identity and hides plaintext at rest',async()=>{const f=await fixture();const cipher=await seal('sensitive-refresh',f.env,'mailbox:A');assert.ok(!cipher.includes('sensitive-refresh'));assert.equal(await unseal(cipher,f.env,'mailbox:A'),'sensitive-refresh');await assert.rejects(()=>unseal(cipher,f.env,'mailbox:B'));});
test('OAuth state uses PKCE, cookie, expiry, one-use claim and encrypted verifier',async()=>{const f=await fixture();const start=await f.json('/oauth/start',{method:'POST'});const url=new URL(start.data.url),state=url.searchParams.get('state'),cookie=start.headers.get('set-cookie').split(';')[0];assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('redirect_uri'),'https://crm.test/api/crm/oauth/callback');assert.deepEqual(url.searchParams.get('scope').split(' '),SCOPES);const pending=f.DB.raw.prepare('SELECT * FROM crm_oauth_states').get();assert.ok(pending.verifier_cipher.startsWith('v1.'));assert.notEqual(pending.hash,state);assert.equal((await f.req('/oauth/callback?state='+state+'&code=x')).status,403);const done=await f.req('/oauth/callback?state='+state+'&code=x',{headers:{cookie}});assert.equal(done.status,303);assert.equal(f.DB.raw.prepare('SELECT count(*) AS n FROM crm_mailboxes').get().n,1);assert.equal((await f.req('/oauth/callback?state='+state+'&code=x',{headers:{cookie}})).status,403);assert.equal(f.calls.length,2);});
test('OAuth cancellation and expired state never exchange a token',async()=>{const f=await fixture();let start=await f.json('/oauth/start',{method:'POST'}),state=new URL(start.data.url).searchParams.get('state'),cookie=start.headers.get('set-cookie').split(';')[0];assert.equal((await f.req('/oauth/callback?state='+state+'&error=access_denied',{headers:{cookie}})).status,303);start=await f.json('/oauth/start',{method:'POST'});state=new URL(start.data.url).searchParams.get('state');cookie=start.headers.get('set-cookie').split(';')[0];f.DB.raw.exec('UPDATE crm_oauth_states SET expires=1');assert.equal((await f.req('/oauth/callback?state='+state+'&code=x',{headers:{cookie}})).status,403);assert.equal(f.calls.length,0);});
test('OAuth rejects wrong mailbox and missing scopes without storing connection',async()=>{for(const bad of ['mailbox','scopes']){const f=await fixture({fetch:async url=>Response.json(String(url).includes('/token')?{access_token:'a',refresh_token:'r',scope:bad==='scopes'?SCOPES[0]:SCOPES.join(' ')}:{emailAddress:'wrong@gmail.com'})});const start=await f.json('/oauth/start',{method:'POST'}),state=new URL(start.data.url).searchParams.get('state'),cookie=start.headers.get('set-cookie').split(';')[0];const result=await f.json('/oauth/callback?state='+state+'&code=x',{headers:{cookie}});assert.ok([403,409].includes(result.status));assert.equal(f.DB.raw.prepare('SELECT count(*) AS n FROM crm_mailboxes').get().n,0);}});
test('input rejects header injection, oversized body and non-JSON content',async()=>{const f=await fixture();await f.seed();for(const email of ['a@example.com\r\nBcc:b@example.com','a@example.com, b@example.com'])assert.equal((await f.json('/contacts',{method:'POST',body:{name:'A',email,kind:'other'}})).status,400);assert.equal((await f.json('/outbox',{method:'POST',body:{contactId:'contact1',subject:'Subject\nBcc:evil',body:'x'}})).status,400);assert.equal((await f.json('/outbox',{method:'POST',raw:'x'.repeat(50001)})).status,413);assert.equal((await f.json('/contacts',{method:'POST',headers:{'content-type':'text/plain'}})).status,415);});
test('draft recipients and sender are server-authoritative; no HTTP before explicit send',async()=>{const f=await fixture();await f.seed();const r=await f.json('/outbox',{method:'POST',body:{contactId:'contact1',subject:'Hola',body:'Texto',sender:'forged@example.com',recipient:'other@example.com',owner:'other'}});assert.equal(r.data.draft.sender,'pulzzomx@gmail.com');assert.equal(r.data.draft.recipient,'recipient@example.com');assert.equal(f.calls.length,0);assert.equal((await f.json(`/outbox/${r.data.draft.id}/send`,{method:'POST',body:{}})).status,400);assert.equal(f.calls.length,0);});
test('draft cannot access contacts or drafts owned by another user',async()=>{const f=await fixture();await f.seed();f.DB.raw.exec("UPDATE crm_contacts SET owner='other'");assert.equal((await f.json('/outbox',{method:'POST',body:{contactId:'contact1',subject:'Hola',body:'x'}})).status,404);});
test('send success is audited and links thread; duplicate/concurrent send occurs once',async()=>{const f=await fixture();await f.seed();const d=await f.draft();const results=await Promise.all([1,2,3].map(()=>f.json(`/outbox/${d.id}/send`,{method:'POST',body:{confirm:true}})));assert.equal(f.sendCount,1);assert.ok(results.some(r=>r.status===200));const after=await f.json(`/outbox/${d.id}/send`,{method:'POST',body:{confirm:true}});assert.equal(after.data.draft.status,'sent');assert.equal(f.sendCount,1);assert.equal(f.DB.raw.prepare('SELECT count(*) AS n FROM crm_threads').get().n,1);assert.equal(f.DB.raw.prepare("SELECT count(*) AS n FROM crm_mail_audit WHERE action='send_confirmed'").get().n,1);});
test('ambiguous timeout enters uncertain state and never automatically retries',async()=>{const f=await fixture({sendError:true});await f.seed();const d=await f.draft();assert.equal((await f.json(`/outbox/${d.id}/send`,{method:'POST',body:{confirm:true}})).status,202);assert.equal(f.DB.raw.prepare('SELECT status FROM crm_outbox').get().status,'uncertain');assert.equal((await f.json(`/outbox/${d.id}/send`,{method:'POST',body:{confirm:true}})).status,409);const r=await f.json(`/outbox/${d.id}/reconcile`,{method:'POST'});assert.equal(r.status,202);assert.equal(r.data.draft.status,'uncertain');assert.equal(f.sendCount,1);});
test('crash-left sending is never reclaimed or resent',async()=>{const f=await fixture();await f.seed();const d=await f.draft();f.DB.raw.exec("UPDATE crm_outbox SET status='sending'");assert.equal((await f.json(`/outbox/${d.id}/send`,{method:'POST',body:{confirm:true}})).status,409);assert.equal(f.sendCount,0);});
test('reconciliation requires sent label and matching RFC Message-ID/from/to',async()=>{for(const valid of [false,true]){const opts={candidates:[{id:'gmail1'}]};const f=await fixture(opts);await f.seed();const d=await f.draft();f.DB.raw.exec("UPDATE crm_outbox SET status='uncertain'");opts.message={id:'gmail1',threadId:'thread1',labelIds:valid?['SENT']:['INBOX'],payload:{headers:[{name:'Message-ID',value:`<${d.message_id}>`},{name:'From',value:d.sender},{name:'To',value:d.recipient}]}};const r=await f.json(`/outbox/${d.id}/reconcile`,{method:'POST'});assert.equal(r.data.draft.status,valid?'sent':'uncertain');assert.equal(f.sendCount,0);}});
test('mailbox configuration switch cannot silently rebind a saved draft',async()=>{const f=await fixture();await f.seed();const d=await f.draft();f.env.MAIL_EXPECTED_ACCOUNT='new@gmail.com';const cipher=await seal('new-fixture',f.env,'mailbox:test-owner:new@gmail.com');f.DB.raw.prepare('INSERT INTO crm_mailboxes VALUES (?,?,?,?,?,?)').run('box2','test-owner','new@gmail.com',cipher,epoch(),1);const r=await f.json(`/outbox/${d.id}/send`,{method:'POST',body:{confirm:true}});assert.equal(r.data.error,'draft_mailbox_changed');assert.equal(f.sendCount,0);assert.equal(f.DB.raw.prepare('SELECT sender FROM crm_outbox').get().sender,'pulzzomx@gmail.com');});
test('wrong mailbox during token refresh blocks sending',async()=>{const f=await fixture({email:'wrong@gmail.com'});await f.seed();const d=await f.draft();assert.equal((await f.json(`/outbox/${d.id}/send`,{method:'POST',body:{confirm:true}})).data.error,'mailbox_mismatch');assert.equal(f.sendCount,0);assert.equal(f.DB.raw.prepare('SELECT status FROM crm_outbox').get().status,'draft');});
test('threads must be explicitly linked and contain contact before reading bodies',async()=>{const options={thread:{id:'thread1',messages:[{payload:{headers:[{name:'From',value:'someone@example.com'}]}}]}};const f=await fixture(options);await f.seed();assert.equal((await f.json('/threads/unknown/refresh',{method:'POST'})).status,404);assert.equal(f.calls.length,0);assert.equal((await f.json('/threads',{method:'POST',body:{contactId:'contact1',threadId:'thread1'}})).status,409);options.thread.messages[0].payload.headers[0].value='recipient@example.com';assert.equal((await f.json('/threads',{method:'POST',body:{contactId:'contact1',threadId:'thread1'}})).status,201);});
test('MIME handles UTF-8 with a server-owned RFC Message-ID and no HTML',()=>{const encoded=mime({sender:'a@example.com',recipient:'b@example.com',subject:'Español',body:'Hola 🧡',message_id:'id@example.com'});const raw=new TextDecoder().decode(unb64(encoded));assert.match(raw,/Message-ID: <id@example.com>/);assert.match(raw,/Content-Type: text\/plain; charset=UTF-8/);assert.ok(!raw.includes('Hola'));});
test('plain body uses MIME text not snippet, does not render HTML, and retrieves inline text attachments',async()=>{let fetches=0;const f=async()=>{fetches++;return Response.json({data:b64(new TextEncoder().encode('Texto completo'))});};const message={id:'id',snippet:'short',payload:{mimeType:'multipart/alternative',parts:[{mimeType:'text/html',body:{data:b64(new TextEncoder().encode('<img src=https://evil.test>'))}},{mimeType:'text/plain',body:{attachmentId:'part',size:20}}]}};const result=await plainBody(message,f,'fixture-access');assert.equal(result.body,'Texto completo');assert.equal(fetches,1);const html=await plainBody({payload:message.payload.parts[0]},f,'x');assert.equal(html.body,'');assert.match(html.bodyNotice,/HTML/);});
test('source does not persist browser data or use client HTML injection for mail content',()=>{const js=fs.readFileSync(new URL('../assets/js/crm-mail.js',import.meta.url),'utf8');assert.doesNotMatch(js,/localStorage|sessionStorage|innerHTML|insertAdjacentHTML/);assert.match(js,/textContent/);});
test('Gmail acceptance followed by database commit failure stays uncertain without resend',async()=>{const f=await fixture();await f.seed();const d=await f.draft();const batch=f.DB.batch.bind(f.DB);let injected=false;f.DB.batch=async statements=>{if(f.sendCount===1&&!injected){injected=true;throw Error('database unavailable after Gmail acceptance');}return batch(statements);};const r=await f.json(`/outbox/${d.id}/send`,{method:'POST',body:{confirm:true}});assert.equal(r.status,202);assert.equal(f.DB.raw.prepare('SELECT status FROM crm_outbox').get().status,'uncertain');await f.json(`/outbox/${d.id}/send`,{method:'POST',body:{confirm:true}});assert.equal(f.sendCount,1);});
test('Gmail acceptance plus both database failure paths leaves durable sending no-resend lock',async()=>{const f=await fixture();await f.seed();const d=await f.draft();const batch=f.DB.batch.bind(f.DB);f.DB.batch=async statements=>{if(f.sendCount)throw Error('database down');return batch(statements);};const r=await f.json(`/outbox/${d.id}/send`,{method:'POST',body:{confirm:true}});assert.equal(r.status,202);assert.equal(f.DB.raw.prepare('SELECT status FROM crm_outbox').get().status,'sending');await f.json(`/outbox/${d.id}/send`,{method:'POST',body:{confirm:true}});assert.equal(f.sendCount,1);});
test('revoked refresh token requests reconnection and does not claim draft',async()=>{const f=await fixture({fetch:async()=>Response.json({error:'invalid_grant'},{status:400})});await f.seed();const d=await f.draft();const r=await f.json(`/outbox/${d.id}/send`,{method:'POST',body:{confirm:true}});assert.equal(r.data.error,'reconnect_required');assert.equal(f.DB.raw.prepare('SELECT status FROM crm_outbox').get().status,'draft');assert.equal(f.calls.length,1);});
test('OAuth reconnect preserves existing refresh token if Google omits a new token',async()=>{for(const exists of [false,true]){const f=await fixture({fetch:async url=>Response.json(String(url).includes('/token')?{access_token:'fixture-access',scope:SCOPES.join(' ')}:{emailAddress:'pulzzomx@gmail.com'})});if(exists)await f.seed();const start=await f.json('/oauth/start',{method:'POST'}),state=new URL(start.data.url).searchParams.get('state'),cookie=start.headers.get('set-cookie').split(';')[0];const r=await f.req('/oauth/callback?state='+state+'&code=x',{headers:{cookie}});assert.equal(r.status,exists?303:409);if(exists){const box=f.DB.raw.prepare('SELECT * FROM crm_mailboxes').get();assert.equal(await unseal(box.refresh_cipher,f.env,'mailbox:test-owner:pulzzomx@gmail.com'),'fixture-refresh');}}});
test('Google response limit protects Worker memory and blocks sending on oversized profile',async()=>{const f=await fixture({fetch:async url=>String(url).includes('/token')?Response.json({access_token:'x'}):new Response('x'.repeat(2*1024*1024+1),{headers:{'Content-Type':'application/json'}})});await f.seed();const d=await f.draft();const r=await f.json(`/outbox/${d.id}/send`,{method:'POST',body:{confirm:true}});assert.equal(r.data.error,'google_response_too_large');assert.equal(f.DB.raw.prepare('SELECT status FROM crm_outbox').get().status,'draft');});

test('long UTF-8 subjects fold within RFC2047 encoded-word limits without splitting codepoints',()=>{const original='Cirugía 🧡 '.repeat(18);const words=encodedSubject(original).split('\r\n ');assert.ok(words.every(w=>w.length<=75));const restored=words.map(w=>new TextDecoder().decode(Uint8Array.from(atob(w.slice(10,-2)),c=>c.charCodeAt(0)))).join('');assert.equal(restored,original);});

test('setup identity is explicitly gated and never enrolls an owner or grants mail access',async()=>{const f=await fixture();assert.equal((await f.json('/setup-identity')).status,404);f.env.MAIL_ENABLED='false';f.env.MAIL_OWNER_ID='';f.env.MAIL_SETUP_IDENTITY_ENABLED='true';assert.equal((await f.json('/setup-identity',{actor:''})).status,401);const result=await f.json('/setup-identity');assert.equal(result.data.siteUserId,'test-owner');assert.equal(f.env.MAIL_OWNER_ID,'');assert.equal((await f.json('/status')).status,503);assert.equal(f.calls.length,0);});

test('mailbox matching ignores address strings in display names and comments',()=>{
 assert.deepEqual(addresses('"recipient@example.com" <unrelated@example.net>'),['unrelated@example.net']);
 assert.deepEqual(addresses('unrelated@example.net (recipient@example.com)'),['unrelated@example.net']);
 assert.deepEqual(addresses('"Recipient, Test" <Recipient@Example.com>, other@example.net'),['recipient@example.com','other@example.net']);
 assert.deepEqual(addresses('Team: recipient@example.com, "Other" <other@example.net>;'),['recipient@example.com','other@example.net']);
 assert.deepEqual(addresses('Recipient <recipient@example.com>\r\n , other@example.net'),['recipient@example.com','other@example.net']);
 for(const value of ['recipient@example.com\r\nBcc:other@example.net','"unterminated recipient@example.com','(unterminated recipient@example.com','<recipient@example.com> garbage','prefixrecipient@example.com.invalid'])assert.ok(!addresses(value).includes('recipient@example.com'),value);
});

test('display-name and comment spoofing cannot link an unrelated Gmail thread',async()=>{
 for(const value of ['"recipient@example.com" <unrelated@example.net>','unrelated@example.net (recipient@example.com)']){
  const f=await fixture({thread:{id:'thread1',messages:[{payload:{headers:[{name:'From',value}]}}]}});await f.seed();
  const r=await f.json('/threads',{method:'POST',body:{contactId:'contact1',threadId:'thread1'}});
  assert.equal(r.status,409);assert.equal(r.data.error,'thread_contact_mismatch');
  assert.equal(f.DB.raw.prepare('SELECT count(*) AS n FROM crm_threads').get().n,0);
 }
});

test('display-name spoofing cannot falsely reconcile an uncertain outgoing message',async()=>{
 const options={candidates:[{id:'gmail1'}]},f=await fixture(options);await f.seed();const d=await f.draft();
 f.DB.raw.exec("UPDATE crm_outbox SET status='uncertain'");
 options.message={id:'gmail1',threadId:'thread1',labelIds:['SENT'],payload:{headers:[{name:'Message-ID',value:`<${d.message_id}>`},{name:'From',value:`"${d.sender}" <unrelated@example.net>`},{name:'To',value:d.recipient}]}};
 const r=await f.json(`/outbox/${d.id}/reconcile`,{method:'POST'});
 assert.equal(r.status,202);assert.equal(r.data.draft.status,'uncertain');assert.equal(f.sendCount,0);
});

test('recipient validation rejects malformed dot atoms and domain labels before draft/send',async()=>{
 const f=await fixture();
 for(const address of ['.name@example.com','name.@example.com','na..me@example.com','name@ex..ample.com','name@-example.com','name@example-.com','a'.repeat(65)+'@example.com','name@'+'a'.repeat(64)+'.com']){
  const r=await f.json('/contacts',{method:'POST',body:{name:'Fixture',email:address,kind:'other'}});
  assert.equal(r.status,400,address);assert.equal(r.data.error,'invalid_email');
 }
 assert.equal((await f.json('/contacts',{method:'POST',body:{name:'Fixture',email:'first.last+tag@sub.example.com',kind:'other'}})).status,201);
 assert.equal(f.calls.length,0);
});

test('JSON media type is exact and malformed UTF-8 is rejected without saving data',async()=>{
 const f=await fixture(),body={name:'Fixture',email:'fixture@example.com',kind:'other'};
 assert.equal((await f.json('/contacts',{method:'POST',body,headers:{'content-type':'application/jsonp'}})).status,415);
 assert.equal((await f.json('/contacts',{method:'POST',body,headers:{'content-type':'Application/JSON; charset=utf-8'}})).status,201);
 const raw=Buffer.concat([Buffer.from('{"name":"'),Buffer.from([0xff]),Buffer.from('","email":"fixture@example.com","kind":"other"}')]);
 assert.equal((await f.json('/contacts',{method:'POST',raw})).data.error,'invalid_json');
 assert.equal(f.DB.raw.prepare('SELECT count(*) AS n FROM crm_contacts').get().n,1);
});

test('body extraction stops attachment reads when the displayed text is full',async()=>{
 let reads=0;const fetcher=async()=>{reads++;return Response.json({data:Buffer.from('x'.repeat(100000)).toString('base64url')});};
 const result=await plainBody({id:'fixture',payload:{parts:Array.from({length:10},(_,i)=>({mimeType:'text/plain',body:{attachmentId:String(i),size:1}}))}},fetcher,'fixture-access');
 assert.equal(reads,1);assert.equal(result.body.length,50000);assert.match(result.bodyNotice,/omitió/);
});

test('body extraction bounds actual attachment size and total reads even when declared size is false',async()=>{
 let reads=0;const fetcher=async()=>{reads++;return Response.json({data:Buffer.from('x'.repeat(100001)).toString('base64url')});};
 const budget={remainingAttachmentReads:2},message={id:'fixture',payload:{parts:Array.from({length:4},(_,i)=>({mimeType:'text/plain',body:{attachmentId:String(i),size:1}}))}};
 const first=await plainBody(message,fetcher,'fixture-access',budget),second=await plainBody(message,fetcher,'fixture-access',budget);
 assert.equal(reads,2);assert.equal(first.body,'');assert.equal(second.body,'');assert.match(first.bodyNotice,/omitió/);assert.match(second.bodyNotice,/límite de lectura/);
});

test('body extraction bounds MIME part traversal and retains a truncation notice',async()=>{
 const result=await plainBody({payload:{parts:Array.from({length:1000},()=>({mimeType:'text/plain',body:{data:Buffer.from('x').toString('base64url')}}))}},async()=>{throw Error('Unexpected network');},'fixture-access');
 assert.equal(result.body.split('\n\n').length,255);assert.match(result.bodyNotice,/omitió/);
});

test('linked-thread refresh shares one attachment request budget across all messages',async()=>{
 let attachmentReads=0;
 const f=await fixture({fetch:async url=>{
  if(String(url).includes('/token'))return Response.json({access_token:'fixture-access'});
  if(String(url).endsWith('/profile'))return Response.json({emailAddress:'pulzzomx@gmail.com'});
  if(String(url).includes('/attachments/')){attachmentReads++;return Response.json({data:Buffer.from('Fixture text').toString('base64url')});}
  return Response.json({id:'thread1',messages:Array.from({length:30},(_,i)=>({id:'message'+i,payload:{mimeType:'text/plain',body:{attachmentId:'body',size:12}}}))});
 }});
 await f.seed();f.DB.raw.prepare('INSERT INTO crm_threads VALUES (?,?,?,?,?,?)').run('linked1','test-owner','box1','contact1','thread1',epoch());
 const r=await f.json('/threads/linked1/refresh',{method:'POST'});
 assert.equal(r.status,200);assert.equal(r.data.messages.length,30);assert.equal(attachmentReads,20);
 assert.equal(r.data.messages[19].body,'Fixture text');assert.equal(r.data.messages[20].body,'');assert.match(r.data.messages[20].bodyNotice,/límite de lectura/);
});

test('public build inventory rejects secret/config files, unexpected HTML and symlink inputs',async t=>{
 const root=await fsp.mkdtemp(path.join(os.tmpdir(),'pulzzo-mail-public-'));t.after(()=>fsp.rm(root,{recursive:true,force:true}));
 for(const name of PUBLIC_PAGES)await fsp.writeFile(path.join(root,name),'<!doctype html><title>Fixture</title>');
 for(const name of PUBLIC_ASSETS){await fsp.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fsp.writeFile(path.join(root,name),'Fixture public data');}
 await fsp.writeFile(path.join(root,'.env'),'FIXTURE_SECRET=not-real');
 const good=await collectPublicAssets(root);assert.equal(good.length,PUBLIC_PAGES.size+PUBLIC_ASSETS.size);assert.ok(!good.includes('.env'));
 for(const name of ['assets/js/.env.production','assets/js/private.json','assets/js/private.pem','assets/js/source.js.map','assets/js/credentials.js','assets/css/private.css','assets/images/private.svg','private-preview.html']){
  await fsp.writeFile(path.join(root,name),'Fixture private data');
  await assert.rejects(collectPublicAssets(root),/Unapproved public file/);
  await fsp.unlink(path.join(root,name));
 }
 await fsp.unlink(path.join(root,'index.html'));await fsp.symlink(path.join(root,'.env'),path.join(root,'index.html'));
 await assert.rejects(collectPublicAssets(root),/regular files/);
 await fsp.unlink(path.join(root,'index.html'));await fsp.writeFile(path.join(root,'index.html'),'<!doctype html>');
 await fsp.unlink(path.join(root,'assets/js/crm-mail.js'));await fsp.symlink(path.join(root,'.env'),path.join(root,'assets/js/crm-mail.js'));
 await assert.rejects(collectPublicAssets(root),/regular files/);
 await fsp.unlink(path.join(root,'assets/js/crm-mail.js'));await fsp.writeFile(path.join(root,'assets/js/crm-mail.js'),'Fixture public data');
 await fsp.rename(path.join(root,'assets/css'),path.join(root,'css-backup'));
 await fsp.symlink(path.join(root,'assets/js'),path.join(root,'assets/css'));
 await assert.rejects(collectPublicAssets(root),/regular files/);
 for(const relative of ['assets/js/../private.js','assets/js/.secret.js','assets/.private/config.js','assets/js\\private.js','/index.html','server/index.js'])assert.equal(isPublicPath(relative),false,relative);
});

test('build validates generated asset symlinks before embedding can overwrite their target',async t=>{
 const root=await fsp.mkdtemp(path.join(os.tmpdir(),'pulzzo-mail-build-link-'));t.after(()=>fsp.rm(root,{recursive:true,force:true}));
 const repo=path.resolve(import.meta.dirname,'..');
 for(const name of PUBLIC_PAGES)await fsp.writeFile(path.join(root,name),'<!doctype html><title>Fixture</title>');
 for(const dir of ['scripts','assets/css','assets/js'])await fsp.mkdir(path.join(root,dir),{recursive:true});
 for(const name of PUBLIC_ASSETS){await fsp.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fsp.writeFile(path.join(root,name),'Fixture public data');}
 for(const name of ['build-mail.mjs','bundle-worker.mjs','mail-public-assets.mjs','build-crm-embed.mjs','crm-demo-embed.source.js'])await fsp.copyFile(path.join(repo,'scripts',name),path.join(root,'scripts',name));
 for(const name of ['crm-demo.css','crm-demo-embed.css'])await fsp.copyFile(path.join(repo,'assets/css',name),path.join(root,'assets/css',name));
 await fsp.symlink(await fsp.realpath(path.join(repo,'node_modules')),path.join(root,'node_modules'),'dir');
 const privateFile=path.join(root,'.env'),marker='FIXTURE_ONLY=must-remain-unchanged';
 await fsp.writeFile(privateFile,marker);
 await fsp.unlink(path.join(root,'assets/js/crm-demo-embed.js'));await fsp.symlink(privateFile,path.join(root,'assets/js/crm-demo-embed.js'));
 const result=spawnSync(process.execPath,[path.join(root,'scripts/build-mail.mjs')],{encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/Public assets must be regular files/);
 assert.equal(await fsp.readFile(privateFile,'utf8'),marker);
 assert.equal(fs.existsSync(path.join(root,'dist')),false);
});
