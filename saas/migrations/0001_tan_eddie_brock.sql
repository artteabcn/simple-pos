CREATE TABLE `staff` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`name` text NOT NULL,
	`pin_hash` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `staff_shop_idx` ON `staff` (`shop_id`,`active`);--> statement-breakpoint
CREATE TABLE `staff_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`staff_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `staff_sessions_device_idx` ON `staff_sessions` (`device_id`);--> statement-breakpoint
ALTER TABLE `shops` ADD `staff_pin_failures` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `shops` ADD `staff_pin_locked_until` text;