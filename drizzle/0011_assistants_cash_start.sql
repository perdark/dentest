CREATE TABLE `assistant_settlements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`period` text NOT NULL,
	`assistant_id` integer NOT NULL,
	`doctor_id` integer NOT NULL,
	`pay_mode` text NOT NULL,
	`pct` integer DEFAULT 0 NOT NULL,
	`salary` integer DEFAULT 0 NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`closed_at` integer,
	`paid_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	`updated_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`assistant_id`) REFERENCES `assistants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_settlement_period_idx` ON `assistant_settlements` (`period`,`assistant_id`);--> statement-breakpoint
CREATE TABLE `assistants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`doctor_id` integer NOT NULL,
	`pay_mode` text NOT NULL,
	`salary` integer DEFAULT 0 NOT NULL,
	`pct` integer DEFAULT 0 NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `assistants_doctor_idx` ON `assistants` (`doctor_id`);--> statement-breakpoint
ALTER TABLE `monthly_settlements` ADD `gross_payout` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `monthly_settlements` ADD `assistants_total` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `cash_start_date` text;--> statement-breakpoint
UPDATE `monthly_settlements` SET `gross_payout` = `payout`;