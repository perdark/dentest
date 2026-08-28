CREATE TABLE `xray_films` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`film_date` text NOT NULL,
	`treatment_type_id` integer NOT NULL,
	`placement` text DEFAULT 'internal' NOT NULL,
	`price` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`treatment_type_id`) REFERENCES `treatment_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `xray_films_date_idx` ON `xray_films` (`film_date`);--> statement-breakpoint
CREATE INDEX `xray_films_type_idx` ON `xray_films` (`treatment_type_id`);