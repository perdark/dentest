CREATE TABLE `appointments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`patient_id` integer NOT NULL,
	`doctor_id` integer,
	`appt_date` text NOT NULL,
	`status` text DEFAULT 'booked' NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `appointments_date_idx` ON `appointments` (`appt_date`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity` text NOT NULL,
	`entity_id` integer,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`hit_closed_period` integer DEFAULT false NOT NULL,
	`period` text,
	`note` text,
	`at` integer DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE TABLE `cases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`patient_id` integer NOT NULL,
	`doctor_id` integer NOT NULL,
	`treatment_type_id` integer NOT NULL,
	`opened_date` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`list_price` integer DEFAULT 0 NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`total_price` integer DEFAULT 0 NOT NULL,
	`implant_card_no` integer,
	`account_seq_no` integer,
	`device` text,
	`address_snapshot` text,
	`lab_cost` integer DEFAULT 0 NOT NULL,
	`lab_external` integer DEFAULT true NOT NULL,
	`has_complaint` integer DEFAULT false NOT NULL,
	`complaint_note` text,
	`next_appointment` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	`updated_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`treatment_type_id`) REFERENCES `treatment_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cases_patient_idx` ON `cases` (`patient_id`);--> statement-breakpoint
CREATE INDEX `cases_doctor_idx` ON `cases` (`doctor_id`);--> statement-breakpoint
CREATE INDEX `cases_type_idx` ON `cases` (`treatment_type_id`);--> statement-breakpoint
CREATE INDEX `cases_status_idx` ON `cases` (`status`);--> statement-breakpoint
CREATE INDEX `cases_implant_card_idx` ON `cases` (`implant_card_no`);--> statement-breakpoint
CREATE TABLE `cash_movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`move_date` text NOT NULL,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`ref_table` text,
	`ref_id` integer,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE INDEX `cash_movements_date_idx` ON `cash_movements` (`move_date`);--> statement-breakpoint
CREATE TABLE `counters` (
	`name` text PRIMARY KEY NOT NULL,
	`value` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `doctors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`is_owner` integer DEFAULT false NOT NULL,
	`does_ortho` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`commission_pct` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`expense_date` text NOT NULL,
	`category` text NOT NULL,
	`amount` integer NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE INDEX `expenses_date_idx` ON `expenses` (`expense_date`);--> statement-breakpoint
CREATE INDEX `expenses_cat_idx` ON `expenses` (`category`);--> statement-breakpoint
CREATE TABLE `monthly_settlements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`period` text NOT NULL,
	`doctor_id` integer NOT NULL,
	`collected_implant` integer DEFAULT 0 NOT NULL,
	`collected_ortho` integer DEFAULT 0 NOT NULL,
	`collected_normal` integer DEFAULT 0 NOT NULL,
	`collected_total` integer DEFAULT 0 NOT NULL,
	`accrued_total` integer DEFAULT 0 NOT NULL,
	`lab_cost` integer DEFAULT 0 NOT NULL,
	`commission_pct` integer,
	`payout` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`closed_at` integer,
	`paid_at` integer,
	`snapshot_json` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	`updated_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settlement_period_doctor_idx` ON `monthly_settlements` (`period`,`doctor_id`);--> statement-breakpoint
CREATE TABLE `patients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`full_name` text NOT NULL,
	`phone` text,
	`address` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE INDEX `patients_name_idx` ON `patients` (`full_name`);--> statement-breakpoint
CREATE INDEX `patients_phone_idx` ON `patients` (`phone`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`case_id` integer NOT NULL,
	`doctor_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`kind` text DEFAULT 'session' NOT NULL,
	`paid_date` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payments_case_idx` ON `payments` (`case_id`);--> statement-breakpoint
CREATE INDEX `payments_doctor_idx` ON `payments` (`doctor_id`);--> statement-breakpoint
CREATE INDEX `payments_date_idx` ON `payments` (`paid_date`);--> statement-breakpoint
CREATE TABLE `price_list` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`treatment_type_id` integer NOT NULL,
	`default_price` integer DEFAULT 0 NOT NULL,
	`is_placeholder` integer DEFAULT true NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`treatment_type_id`) REFERENCES `treatment_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `price_list_treatment_type_id_unique` ON `price_list` (`treatment_type_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`clinic_name` text DEFAULT 'عيادة الأسنان' NOT NULL,
	`pin_hash` text,
	`session_secret` text,
	`currency` text DEFAULT 'IQD' NOT NULL,
	`opening_cash_balance` integer DEFAULT 0 NOT NULL,
	`cash_reserve_threshold` integer DEFAULT 5000000 NOT NULL,
	`lab_deducted_per_doctor` integer DEFAULT false NOT NULL,
	`pct_applied_after_lab` integer DEFAULT true NOT NULL,
	`default_commission_pct` integer DEFAULT 50 NOT NULL,
	`staff_salary_mode` text DEFAULT 'manual' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE TABLE `treatment_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name_ar` text NOT NULL,
	`name_en` text NOT NULL,
	`settlement_bucket` text NOT NULL,
	`is_implant` integer DEFAULT false NOT NULL,
	`is_ortho` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `treatment_types_key_unique` ON `treatment_types` (`key`);