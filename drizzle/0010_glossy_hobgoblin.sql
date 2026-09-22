ALTER TABLE `patients` ADD `doctor_id` integer REFERENCES doctors(id);--> statement-breakpoint
CREATE INDEX `patients_doctor_idx` ON `patients` (`doctor_id`);