import { MailError,fail,b64,unb64,utf8,unseal,seal,email } from './security.mjs';
export const SCOPES=['https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.readonly'];
const API='https://gmail.googleapis.com/gmail/v1/users/me';
// Only this adapter performs external HTTP. No automatic retry of messages.send.
export async function googleJSON(fetcher,url,options={}){
 let response;try{response=await fetcher(url,{...options,signal:AbortSignal.timeout(20000),redirect:'error'});}catch{throw new MailError('google_unavailable',502);}
 let data;try{
  const reader=response.body?.getReader();if(!reader)throw Error('empty');
  const chunks=[];let total=0;
  for(;;){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>2*1024*1024){await reader.cancel();throw new MailError('google_response_too_large',502);}chunks.push(value);}
  const buffer=new Uint8Array(total);let offset=0;for(const value of chunks){buffer.set(value,offset);offset+=value.length;}data=JSON.parse(new TextDecoder().decode(buffer));
 }catch(error){if(error instanceof MailError)throw error;throw new MailError('google_invalid_response',502);}
 if(!response.ok){if(data.error==='invalid_grant')fail('reconnect_required',409);throw new MailError('google_request_failed',502);}
 return data;
}
export const tokenRequest=(fetcher,env,params)=>googleJSON(fetcher,'https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,...params})});
export const gmail=(fetcher,access,path,options={})=>googleJSON(fetcher,API+path,{...options,headers:{Authorization:'Bearer '+access,...options.headers}});
export async function accessToken(fetcher,env,box){
 const refresh=await unseal(box.refresh_cipher,env,`mailbox:${box.owner}:${box.email}`);
 const data=await tokenRequest(fetcher,env,{grant_type:'refresh_token',refresh_token:refresh});
 if(typeof data.access_token!=='string')fail('reconnect_required',409);
 // Validate identity on every operation; configuration changes cannot rebind old drafts.
 const profile=await gmail(fetcher,data.access_token,'/profile');
 if(email(profile.emailAddress)!==box.email||box.email!==email(env.MAIL_EXPECTED_ACCOUNT))fail('mailbox_mismatch',409);
 if(data.refresh_token){await env.DB.prepare('UPDATE crm_mailboxes SET refresh_cipher=? WHERE id=? AND owner=?').bind(await seal(data.refresh_token,env,`mailbox:${box.owner}:${box.email}`),box.id,box.owner).run();}
 return data.access_token;
}
export function encodedSubject(subject){
 const chunks=[];let chunk='';
 for(const character of subject){if(utf8(chunk+character).length>42){chunks.push(chunk);chunk='';}chunk+=character;}
 if(chunk)chunks.push(chunk);
 return chunks.map(value=>'=?UTF-8?B?'+btoa(String.fromCharCode(...utf8(value)))+'?=').join('\r\n ');
}
export function mime(draft){
 const enc=s=>btoa(String.fromCharCode(...utf8(s)));
 const body=enc(draft.body).match(/.{1,76}/g)?.join('\r\n')||'';
 return b64(utf8([`From: ${draft.sender}`,`To: ${draft.recipient}`,`Subject: ${encodedSubject(draft.subject)}`,`Message-ID: <${draft.message_id}>`,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',body].join('\r\n')));
}
export const header=(message,name)=>(message.payload?.headers||[]).find(h=>h.name.toLowerCase()===name.toLowerCase())?.value||'';
export function addresses(value){return (value.match(/[A-Za-z0-9.!#$%&'*+\/=\?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}/g)||[]).map(x=>x.toLowerCase());}
export function involves(message,contact){return ['from','to','cc'].some(h=>addresses(header(message,h)).includes(contact));}
export async function plainBody(message,fetcher,access){
 const pieces=[];let omitted=false;
 async function walk(part,depth=0){
  if(!part||depth>12){omitted=true;return;}
  if(part.mimeType==='text/plain'&&!part.filename){
   if((part.body?.size||0)>100000){omitted=true;return;}
   let data=part.body?.data;
   if(!data&&part.body?.attachmentId){const result=await gmail(fetcher,access,`/messages/${encodeURIComponent(message.id)}/attachments/${encodeURIComponent(part.body.attachmentId)}`);data=result.data;}
   if(data){const charset=(part.headers||[]).find(h=>h.name.toLowerCase()==='content-type')?.value.match(/charset=["']?([^;"'\s]+)/i)?.[1]||'utf-8';try{pieces.push(new TextDecoder(charset).decode(unb64(data)));}catch{omitted=true;}}
  }
  for(const child of part.parts||[])await walk(child,depth+1);
 }
 await walk(message.payload);const text=pieces.join('\n\n');return {body:text.slice(0,50000),bodyNotice:omitted||text.length>50000?'Parte del contenido se omitió por tamaño o codificación.':!text?'Este correo no contiene una versión de texto disponible. Ábrelo en Gmail para ver HTML o adjuntos.':''};
}
