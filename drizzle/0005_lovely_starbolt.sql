CREATE TABLE `case_teeth` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`case_id` integer NOT NULL,
	`scope` text DEFAULT 'tooth' NOT NULL,
	`tooth_code` integer,
	`arch` text,
	`surfaces` text,
	`span_id` integer,
	`span_role` text,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `case_teeth_case_idx` ON `case_teeth` (`case_id`);--> statement-breakpoint
CREATE INDEX `case_teeth_tooth_idx` ON `case_teeth` (`tooth_code`);