CREATE TABLE `lab_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`doctor_id` integer NOT NULL,
	`branch` text NOT NULL,
	`entry_date` text NOT NULL,
	`amount` integer NOT NULL,
	`note` text,
	`patient_id` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lab_entries_doctor_idx` ON `lab_entries` (`doctor_id`);--> statement-breakpoint
CREATE INDEX `lab_entries_date_idx` ON `lab_entries` (`entry_date`);--> statement-breakpoint
ALTER TABLE `doctors` ADD `lab_name` text;