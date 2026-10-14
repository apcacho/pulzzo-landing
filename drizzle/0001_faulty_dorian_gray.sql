CREATE INDEX `crm_contacts_owner_created` ON `crm_contacts` (`owner`,`created`);--> statement-breakpoint
CREATE INDEX `crm_outbox_owner_created` ON `crm_outbox` (`owner`,`created`);--> statement-breakpoint
CREATE INDEX `crm_threads_owner_created` ON `crm_threads` (`owner`,`created`);