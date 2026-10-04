CREATE TABLE `customization_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`shop_name` text DEFAULT '' NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`needs_json` text DEFAULT '[]' NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `requests_email_idx` ON `customization_requests` (`email`,`created_at`);--> statement-breakpoint
CREATE INDEX `requests_status_idx` ON `customization_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`last_seen_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_token_unique` ON `devices` (`token_hash`);--> statement-breakpoint
CREATE INDEX `devices_shop_idx` ON `devices` (`shop_id`);--> statement-breakpoint
CREATE TABLE `login_links` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `login_links_token_unique` ON `login_links` (`token_hash`);--> statement-breakpoint
CREATE INDEX `login_links_email_idx` ON `login_links` (`email`,`created_at`);--> statement-breakpoint
CREATE TABLE `manager_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `manager_sessions_device_idx` ON `manager_sessions` (`device_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`stripe_session_id` text NOT NULL,
	`stripe_payment_intent` text,
	`amount_total` integer NOT NULL,
	`currency` text NOT NULL,
	`paid_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_session_unique` ON `payments` (`stripe_session_id`);--> statement-breakpoint
CREATE INDEX `payments_shop_idx` ON `payments` (`shop_id`);--> statement-breakpoint
CREATE TABLE `records` (
	`shop_id` text NOT NULL,
	`kind` text NOT NULL,
	`id` text NOT NULL,
	`record_updated_at` text NOT NULL,
	`synced_at` text NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`event_at` text,
	`total` real,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`shop_id`, `kind`, `id`),
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `records_changes_idx` ON `records` (`shop_id`,`synced_at`);--> statement-breakpoint
CREATE INDEX `records_report_idx` ON `records` (`shop_id`,`kind`,`event_at`);--> statement-breakpoint
CREATE TABLE `shops` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`owner_email` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`customisation` integer DEFAULT false NOT NULL,
	`last_sync_at` text,
	`pin_hash` text,
	`pin_failures` integer DEFAULT 0 NOT NULL,
	`pin_locked_until` text,
	`profile_json` text DEFAULT '{}' NOT NULL,
	`menu_json` text DEFAULT '[]' NOT NULL,
	`config_updated_at` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shops_slug_unique` ON `shops` (`slug`);--> statement-breakpoint
CREATE INDEX `shops_email_idx` ON `shops` (`owner_email`);--> statement-breakpoint
CREATE TABLE `signups` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`shop_name` text NOT NULL,
	`email` text NOT NULL,
	`customisation` integer DEFAULT false NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`amount_expected` integer NOT NULL,
	`terms_accepted_at` text,
	`terms_version` text,
	`stripe_session_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signups_session_unique` ON `signups` (`stripe_session_id`);--> statement-breakpoint
CREATE INDEX `signups_slug_idx` ON `signups` (`slug`);--> statement-breakpoint
CREATE TABLE `stripe_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`processed_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
