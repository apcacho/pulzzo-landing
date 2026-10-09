CREATE TABLE `crm_mail_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `crm_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`kind` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `crm_mailboxes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`email` text NOT NULL,
	`refresh_cipher` text NOT NULL,
	`created` integer NOT NULL,
	`active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_mailbox_owner_email` ON `crm_mailboxes` (`owner`,`email`);--> statement-breakpoint
CREATE TABLE `crm_oauth_states` (
	`hash` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`nonce_hash` text NOT NULL,
	`verifier_cipher` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `crm_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`mailbox_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`sender` text NOT NULL,
	`recipient` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`message_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`gmail_id` text,
	`gmail_thread_id` text,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `crm_mailboxes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crm_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`mailbox_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`gmail_thread_id` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `crm_mailboxes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_thread_contact_mailbox` ON `crm_threads` (`mailbox_id`,`contact_id`,`gmail_thread_id`);