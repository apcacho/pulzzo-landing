import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
export const mailboxes = sqliteTable('crm_mailboxes', {
 id:text('id').primaryKey(), owner:text('owner').notNull(), email:text('email').notNull(),
 refreshCipher:text('refresh_cipher').notNull(), created:integer('created').notNull(), active:integer('active').notNull().default(1)
}, t => [uniqueIndex('crm_mailbox_owner_email').on(t.owner,t.email)]);
export const oauthStates = sqliteTable('crm_oauth_states', {
 hash:text('hash').primaryKey(), owner:text('owner').notNull(), nonceHash:text('nonce_hash').notNull(),
 verifierCipher:text('verifier_cipher').notNull(), expires:integer('expires').notNull()
});
export const contacts = sqliteTable('crm_contacts', {
 id:text('id').primaryKey(), owner:text('owner').notNull(), name:text('name').notNull(), email:text('email').notNull(),
 kind:text('kind').notNull(), created:integer('created').notNull()
}, t => [index('crm_contacts_owner_created').on(t.owner,t.created)]);
export const threads = sqliteTable('crm_threads', {
 id:text('id').primaryKey(), owner:text('owner').notNull(), mailboxId:text('mailbox_id').notNull().references(()=>mailboxes.id),
 contactId:text('contact_id').notNull().references(()=>contacts.id), gmailThreadId:text('gmail_thread_id').notNull(), created:integer('created').notNull()
}, t => [uniqueIndex('crm_thread_contact_mailbox').on(t.mailboxId,t.contactId,t.gmailThreadId),index('crm_threads_owner_created').on(t.owner,t.created)]);
export const outbox = sqliteTable('crm_outbox', {
 id:text('id').primaryKey(), owner:text('owner').notNull(), mailboxId:text('mailbox_id').notNull().references(()=>mailboxes.id),
 contactId:text('contact_id').notNull().references(()=>contacts.id), sender:text('sender').notNull(), recipient:text('recipient').notNull(),
 subject:text('subject').notNull(), body:text('body').notNull(), messageId:text('message_id').notNull(),
 status:text('status').notNull().default('draft'), gmailId:text('gmail_id'), gmailThreadId:text('gmail_thread_id'),
 created:integer('created').notNull(), updated:integer('updated').notNull()
}, t => [index('crm_outbox_owner_created').on(t.owner,t.created)]);
export const audit = sqliteTable('crm_mail_audit', {
 id:text('id').primaryKey(), owner:text('owner').notNull(), action:text('action').notNull(), target:text('target').notNull(), created:integer('created').notNull()
});
