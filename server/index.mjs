import {MailError,fail,configuration,owner,csrf,csrfToken,cookie,cookieHeader,random,digest,seal,unseal,epoch,email,line,opaque,jsonBody,equal} from './security.mjs';
import {SCOPES,tokenRequest,gmail,accessToken,mime,header,involves,plainBody,addresses} from './google.mjs';
import {first,all,statement,audit,mailbox,contact,outbox,publicDraft} from './store.mjs';
const PREFIX='/api/crm';
const response=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...headers}});
const redirect=(url,headers={})=>new Response(null,{status:303,headers:{Location:url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer',...headers}});
const callback=env=>env.MAIL_ORIGIN+PREFIX+'/oauth/callback';
export function createWorker(fetcher=globalThis.fetch){return {async fetch(request,env){
 const url=new URL(request.url);
 if(!url.pathname.startsWith(PREFIX+'/'))return env.ASSETS?env.ASSETS.fetch(request):new Response('Static preview: use preview.cjs. CRM requires the configured Worker.',{status:404});
 try{
  // Explicit setup-only introspection. It never enrolls an owner or authorizes Gmail.
  // Enable only on the already owner-private Site, then disable after recording its ID.
  if(url.pathname===PREFIX+'/setup-identity'){
   if(env.MAIL_SETUP_IDENTITY_ENABLED!=='true')fail('not_found',404);
   if(request.method!=='GET')fail('method_not_allowed',405);
   if(!env.MAIL_ORIGIN||!env.MAIL_ORIGIN.startsWith('https://')||url.origin!==env.MAIL_ORIGIN)fail('origin_rejected',403);
   const authenticatedId=request.headers.get('oai-authenticated-user-id');
   if(!authenticatedId)fail('sign_in_required',401);
   return response({siteUserId:authenticatedId,note:'Solo identifica esta sesión de Sites; no habilita acceso a Gmail.'});
  }
  configuration(env);const actor=owner(request,env);
  if(url.origin!==env.MAIL_ORIGIN)fail('origin_rejected',403);
  if(!['GET','POST'].includes(request.method))fail('method_not_allowed',405);
  if(request.method==='POST')await csrf(request,actor,env);
  const path=url.pathname.slice(PREFIX.length);
  if(path==='/status'&&request.method==='GET'){
   const token=await csrfToken(actor,env);
   const box=await first(env,'SELECT id,email FROM crm_mailboxes WHERE owner=? AND email=? AND active=1',actor,email(env.MAIL_EXPECTED_ACCOUNT));
   return response({mode:'real',connected:!!box,mailbox:box||null,expectedAccount:env.MAIL_EXPECTED_ACCOUNT,csrf:token},200,{'Set-Cookie':cookieHeader('__Host-pulzzo-csrf',token)});
  }
  if(path==='/oauth/start'&&request.method==='POST'){
   const state=random(),nonce=random(),verifier=random(),hash=await digest(state);
   await env.DB.batch([statement(env,'DELETE FROM crm_oauth_states WHERE expires<? OR owner=?',epoch(),actor),statement(env,'INSERT INTO crm_oauth_states (hash,owner,nonce_hash,verifier_cipher,expires) VALUES (?,?,?,?,?)',hash,actor,await digest(nonce),await seal(verifier,env,'oauth:'+actor+':'+hash),epoch()+600)]);
   const authorize=new URL('https://accounts.google.com/o/oauth2/v2/auth');
   authorize.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:callback(env),response_type:'code',scope:SCOPES.join(' '),access_type:'offline',prompt:'consent',login_hint:env.MAIL_EXPECTED_ACCOUNT,state,code_challenge:await digest(verifier),code_challenge_method:'S256'}).toString();
   return response({url:authorize.href},200,{'Set-Cookie':cookieHeader('__Host-pulzzo-oauth',nonce,600,'Lax')});
  }
  if(path==='/oauth/callback'&&request.method==='GET'){
   const state=url.searchParams.get('state');if(!state||state.length>200)fail('oauth_state_rejected',403);
   const hash=await digest(state);
   const pending=await first(env,'SELECT * FROM crm_oauth_states WHERE hash=? AND owner=?',hash,actor);
   if(!pending||pending.expires<epoch()||!equal(pending.nonce_hash,await digest(cookie(request,'__Host-pulzzo-oauth'))))fail('oauth_state_rejected',403);
   const claimed=await first(env,'DELETE FROM crm_oauth_states WHERE hash=? AND owner=? RETURNING hash',hash,actor);if(!claimed)fail('oauth_state_rejected',403);
   if(url.searchParams.has('error'))return redirect(env.MAIL_ORIGIN+'/crm.html?mail=cancelled',{'Set-Cookie':cookieHeader('__Host-pulzzo-oauth','',0,'Lax')});
   const code=url.searchParams.get('code');if(!code||code.length>4000)fail('oauth_code_missing');
   const data=await tokenRequest(fetcher,env,{grant_type:'authorization_code',code,redirect_uri:callback(env),code_verifier:await unseal(pending.verifier_cipher,env,'oauth:'+actor+':'+hash)});
   if(!SCOPES.every(scope=>(data.scope||'').split(' ').includes(scope))||typeof data.access_token!=='string')fail('oauth_scopes_missing',403);
   const profile=await gmail(fetcher,data.access_token,'/profile');const account=email(profile.emailAddress);
   if(account!==email(env.MAIL_EXPECTED_ACCOUNT))fail('mailbox_mismatch',409);
   const existing=await first(env,'SELECT * FROM crm_mailboxes WHERE owner=? AND email=?',actor,account);
   const refreshCipher=data.refresh_token?await seal(data.refresh_token,env,`mailbox:${actor}:${account}`):existing?.refresh_cipher;
   if(!refreshCipher)fail('oauth_refresh_missing',409);
   const id=existing?.id||crypto.randomUUID();
   await env.DB.batch([statement(env,'UPDATE crm_mailboxes SET active=0 WHERE owner=?',actor),statement(env,'INSERT INTO crm_mailboxes (id,owner,email,refresh_cipher,created,active) VALUES (?,?,?,?,?,1) ON CONFLICT(owner,email) DO UPDATE SET refresh_cipher=excluded.refresh_cipher,active=1',id,actor,account,refreshCipher,epoch()),audit(env,actor,'mailbox_connected',id)]);
   return redirect(env.MAIL_ORIGIN+'/crm.html?mail=connected',{'Set-Cookie':cookieHeader('__Host-pulzzo-oauth','',0,'Lax')});
  }
  if(path==='/contacts'&&request.method==='GET')return response({contacts:await all(env,'SELECT id,name,email,kind FROM crm_contacts WHERE owner=? ORDER BY created DESC LIMIT 200',actor)});
  if(path==='/contacts'&&request.method==='POST'){
   const body=await jsonBody(request);const name=line(body.name,120),address=email(body.email);if(!['patient','doctor','other'].includes(body.kind))fail('invalid_contact_kind');
   const id=crypto.randomUUID();await env.DB.batch([statement(env,'INSERT INTO crm_contacts (id,owner,name,email,kind,created) VALUES (?,?,?,?,?,?)',id,actor,name,address,body.kind,epoch()),audit(env,actor,'contact_created',id)]);return response({contact:{id,name,email:address,kind:body.kind}},201);
  }
  if(path==='/outbox'&&request.method==='GET')return response({outbox:(await all(env,'SELECT * FROM crm_outbox WHERE owner=? ORDER BY created DESC LIMIT 100',actor)).map(publicDraft)});
  if(path==='/outbox'&&request.method==='POST'){
   const body=await jsonBody(request);const box=await mailbox(env,actor);const target=await contact(env,actor,opaque(body.contactId));
   const subject=line(body.subject,180);if(typeof body.body!=='string'||!body.body.trim()||body.body.length>20000||body.body.includes('\0'))fail('invalid_body');
   const id=crypto.randomUUID(),messageId=`pulzzo.${id}@${box.email.split('@')[1]}`;
   await env.DB.batch([statement(env,'INSERT INTO crm_outbox (id,owner,mailbox_id,contact_id,sender,recipient,subject,body,message_id,status,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',id,actor,box.id,target.id,box.email,target.email,subject,body.body,messageId,'draft',epoch(),epoch()),audit(env,actor,'draft_created',id)]);
   return response({draft:publicDraft(await outbox(env,actor,id))},201);
  }
  const send=path.match(/^\/outbox\/([a-zA-Z0-9_-]+)\/send$/);
  if(send&&request.method==='POST'){
   const body=await jsonBody(request);if(body.confirm!==true)fail('explicit_send_required');
   const draft=await outbox(env,actor,send[1]);const box=await mailbox(env,actor);
   if(draft.mailbox_id!==box.id||draft.sender!==box.email)fail('draft_mailbox_changed',409);
   if(draft.status!=='draft')return response({draft:publicDraft(draft),note:'No se volvió a enviar.'},draft.status==='sent'?200:409);
   const access=await accessToken(fetcher,env,box); // A failure here is safely before any send.
   // Compare-and-set is the send lock. Never reclaim sending/uncertain, even after a crash.
   const claimed=await first(env,"UPDATE crm_outbox SET status='sending',updated=? WHERE id=? AND owner=? AND status='draft' RETURNING id",epoch(),draft.id,actor);
   if(!claimed)return response({draft:publicDraft(await outbox(env,actor,draft.id))},409);
   try{
    await audit(env,actor,'send_started',draft.id).run();
    const result=await gmail(fetcher,access,'/messages/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raw:mime(draft)})});
    if(!result.id||!result.threadId)fail('google_invalid_response',502);
    await env.DB.batch([statement(env,"UPDATE crm_outbox SET status='sent',gmail_id=?,gmail_thread_id=?,updated=? WHERE id=? AND owner=?",result.id,result.threadId,epoch(),draft.id,actor),statement(env,'INSERT INTO crm_threads (id,owner,mailbox_id,contact_id,gmail_thread_id,created) VALUES (?,?,?,?,?,?) ON CONFLICT(mailbox_id,contact_id,gmail_thread_id) DO NOTHING',crypto.randomUUID(),actor,box.id,draft.contact_id,result.threadId,epoch()),audit(env,actor,'send_confirmed',draft.id)]);
    return response({draft:publicDraft(await outbox(env,actor,draft.id))});
   }catch{
    // A provider or local commit failure may follow acceptance by Gmail. Never auto-resend.
    try{await env.DB.batch([statement(env,"UPDATE crm_outbox SET status='uncertain',updated=? WHERE id=? AND owner=? AND status='sending'",epoch(),draft.id,actor),audit(env,actor,'send_uncertain',draft.id)]);}catch{/* durable sending remains a no-resend state */}
    return response({error:'send_uncertain',draftId:draft.id},202);
   }
  }
  const reconcile=path.match(/^\/outbox\/([a-zA-Z0-9_-]+)\/reconcile$/);
  if(reconcile&&request.method==='POST'){
   const draft=await outbox(env,actor,reconcile[1]);if(!['sending','uncertain'].includes(draft.status))return response({draft:publicDraft(draft)});
   const box=await mailbox(env,actor);if(box.id!==draft.mailbox_id||box.email!==draft.sender)fail('draft_mailbox_changed',409);
   const access=await accessToken(fetcher,env,box);
   const candidates=await gmail(fetcher,access,'/messages?'+new URLSearchParams({q:`in:sent rfc822msgid:${draft.message_id}`,maxResults:'10'}));
   for(const candidate of candidates.messages||[]){
    const message=await gmail(fetcher,access,`/messages/${encodeURIComponent(candidate.id)}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=From&metadataHeaders=To`);
    if(message.labelIds?.includes('SENT')&&header(message,'message-id')===`<${draft.message_id}>`&&addresses(header(message,'from')).includes(draft.sender)&&addresses(header(message,'to')).includes(draft.recipient)){
     await env.DB.batch([statement(env,"UPDATE crm_outbox SET status='sent',gmail_id=?,gmail_thread_id=?,updated=? WHERE id=? AND owner=? AND status IN ('sending','uncertain')",message.id,message.threadId,epoch(),draft.id,actor),statement(env,'INSERT INTO crm_threads (id,owner,mailbox_id,contact_id,gmail_thread_id,created) VALUES (?,?,?,?,?,?) ON CONFLICT(mailbox_id,contact_id,gmail_thread_id) DO NOTHING',crypto.randomUUID(),actor,box.id,draft.contact_id,message.threadId,epoch()),audit(env,actor,'send_reconciled',draft.id)]);
     return response({draft:publicDraft(await outbox(env,actor,draft.id))});
    }
   }
   return response({draft:publicDraft(draft),note:'Gmail aún no confirma el envío. No se reenviará automáticamente; revisa Enviados en Gmail.'},202);
  }
  if(path==='/threads'&&request.method==='GET')return response({threads:await all(env,'SELECT t.id,t.contact_id,t.gmail_thread_id,b.email AS mailbox FROM crm_threads t JOIN crm_mailboxes b ON b.id=t.mailbox_id WHERE t.owner=? ORDER BY t.created DESC LIMIT 100',actor)});
  if(path==='/threads'&&request.method==='POST'){
   const body=await jsonBody(request),target=await contact(env,actor,opaque(body.contactId)),box=await mailbox(env,actor),threadId=opaque(body.threadId);
   const access=await accessToken(fetcher,env,box),thread=await gmail(fetcher,access,`/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc`);
   if(thread.id!==threadId||!thread.messages?.some(m=>involves(m,target.email)))fail('thread_contact_mismatch',409);
   await env.DB.batch([statement(env,'INSERT INTO crm_threads (id,owner,mailbox_id,contact_id,gmail_thread_id,created) VALUES (?,?,?,?,?,?) ON CONFLICT(mailbox_id,contact_id,gmail_thread_id) DO NOTHING',crypto.randomUUID(),actor,box.id,target.id,threadId,epoch()),audit(env,actor,'thread_linked',threadId)]);return response({linked:true},201);
  }
  const refresh=path.match(/^\/threads\/([a-zA-Z0-9_-]+)\/refresh$/);
  if(refresh&&request.method==='POST'){
   const linked=await first(env,'SELECT * FROM crm_threads WHERE owner=? AND id=?',actor,refresh[1]);if(!linked)fail('thread_not_linked',404);
   const box=await mailbox(env,actor);if(linked.mailbox_id!==box.id)fail('historical_mailbox_disconnected',409);
   const access=await accessToken(fetcher,env,box),thread=await gmail(fetcher,access,`/threads/${encodeURIComponent(linked.gmail_thread_id)}?format=full`);
   const messages=[];for(const m of (thread.messages||[]).slice(-30))messages.push({id:m.id,from:header(m,'from'),to:header(m,'to'),subject:header(m,'subject'),date:header(m,'date'),...await plainBody(m,fetcher,access)});
   await audit(env,actor,'thread_refreshed',linked.id).run();return response({messages,truncated:(thread.messages?.length||0)>30});
  }
  fail('not_found',404);
 }catch(error){return response({error:error instanceof MailError?error.code:'service_unavailable'},error instanceof MailError?error.status:503);}
}};}
export default createWorker();
