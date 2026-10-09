export class MailError extends Error { constructor(code, status=400){ super(code); this.code=code; this.status=status; } }
export const fail = (code, status=400) => { throw new MailError(code,status); };
export const b64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export const unb64 = s => Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')), c=>c.charCodeAt(0));
export const utf8 = s => new TextEncoder().encode(s);
export const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
export const digest = async s => b64(new Uint8Array(await crypto.subtle.digest('SHA-256',utf8(s))));
export const epoch = () => Math.floor(Date.now()/1000);
export function equal(a,b){ if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0; }
export function configuration(env){
 const names=['MAIL_OWNER_ID','MAIL_ORIGIN','MAIL_EXPECTED_ACCOUNT','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','MAIL_ENCRYPTION_KEY'];
 if(env.MAIL_ENABLED!=='true'||!env.DB||names.some(k=>!env[k]))fail('mail_not_configured',503);
 let u;try{u=new URL(env.MAIL_ORIGIN);}catch{fail('mail_not_configured',503);}
 if(u.protocol!=='https:'||u.origin!==env.MAIL_ORIGIN||u.username||u.password)fail('mail_not_configured',503);
 try{if(unb64(env.MAIL_ENCRYPTION_KEY).length!==32)fail('mail_not_configured',503);}catch{fail('mail_not_configured',503);}
 email(env.MAIL_EXPECTED_ACCOUNT);return env;
}
export function owner(request,env){ const id=request.headers.get('oai-authenticated-user-id');if(!id)fail('sign_in_required',401);if(!env.MAIL_OWNER_ID||!equal(id,env.MAIL_OWNER_ID))fail('owner_required',403);return id; }
async function encryptionKey(env,uses){return crypto.subtle.importKey('raw',unb64(env.MAIL_ENCRYPTION_KEY),'AES-GCM',false,uses);}
export async function seal(value,env,aad){const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:utf8(aad)},await encryptionKey(env,['encrypt']),utf8(value));return `v1.${b64(iv)}.${b64(new Uint8Array(data))}`;}
export async function unseal(value,env,aad){const [v,iv,data]=value.split('.');if(v!=='v1')fail('reconnect_required',409);return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:utf8(aad)},await encryptionKey(env,['decrypt']),unb64(data)));}
async function mac(s,env){ const key=await crypto.subtle.importKey('raw',unb64(env.MAIL_ENCRYPTION_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(new Uint8Array(await crypto.subtle.sign('HMAC',key,utf8('pulzzo-csrf-v1:'+s)))); }
export async function csrfToken(id,env){const value=`${epoch()+3600}.${random()}`;return `${value}.${await mac(id+':'+value,env)}`;}
export function cookie(request,name){return (request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';}
export async function csrf(request,id,env){
 if(request.headers.get('origin')!==env.MAIL_ORIGIN)fail('origin_rejected',403);
 const value=request.headers.get('x-pulzzo-csrf')||'';
 if(!equal(value,cookie(request,'__Host-pulzzo-csrf')))fail('csrf_rejected',403);
 const [expires,nonce,signature,...rest]=value.split('.');
 if(rest.length||!nonce||!/^\d+$/.test(expires)||Number(expires)<epoch()||Number(expires)>epoch()+3600||!equal(signature,await mac(id+':'+expires+'.'+nonce,env)))fail('csrf_rejected',403);
}
export function email(v){if(typeof v!=='string'||v.length>254||! /^[A-Za-z0-9.!#$%&'*+\/=\?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(v))fail('invalid_email');return v.toLowerCase();}
export function line(v,max=200){if(typeof v!=='string'||!v.trim()||v.length>max||/[\x00-\x1f\x7f]/.test(v))fail('invalid_text');return v.trim();}
export function opaque(v){if(typeof v!=='string'||! /^[a-zA-Z0-9_-]{1,128}$/.test(v))fail('invalid_id');return v;}
export async function jsonBody(request){
 if(!request.headers.get('content-type')?.startsWith('application/json'))fail('json_required',415);
 if(Number(request.headers.get('content-length')||0)>50000)fail('payload_too_large',413);
 const reader=request.body?.getReader();if(!reader)fail('invalid_json');let bytes=0,chunks=[];
 for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>50000){await reader.cancel();fail('payload_too_large',413);}chunks.push(value);}
 try{const buffer=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}const result=JSON.parse(new TextDecoder().decode(buffer));if(!result||Array.isArray(result)||typeof result!=='object')fail('invalid_json');return result;}catch{fail('invalid_json');}
}
export const cookieHeader=(name,value,maxAge=3600,sameSite='Strict')=>`${name}=${value}; Path=/; Secure; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAge}`;
