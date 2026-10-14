import { fail,epoch } from './security.mjs';
export const first=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).first();
export const all=async(env,sql,...args)=>(await env.DB.prepare(sql).bind(...args).all()).results;
export const statement=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
export const audit=(env,owner,action,target)=>statement(env,'INSERT INTO crm_mail_audit (id,owner,action,target,created) VALUES (?,?,?,?,?)',crypto.randomUUID(),owner,action,target,epoch());
export async function mailbox(env,owner){const box=await first(env,'SELECT * FROM crm_mailboxes WHERE owner=? AND email=? AND active=1',owner,env.MAIL_EXPECTED_ACCOUNT.toLowerCase());if(!box)fail('mailbox_not_connected',409);return box;}
export async function contact(env,owner,id){const row=await first(env,'SELECT * FROM crm_contacts WHERE owner=? AND id=?',owner,id);if(!row)fail('contact_not_found',404);return row;}
export async function outbox(env,owner,id){const row=await first(env,'SELECT * FROM crm_outbox WHERE owner=? AND id=?',owner,id);if(!row)fail('draft_not_found',404);return row;}
export function publicDraft(row){const {owner,...safe}=row;return safe;}
