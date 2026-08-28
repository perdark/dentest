ALTER TABLE `cases` ADD `down_payment_agreed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `cases` SET `down_payment_agreed` = (
	SELECT coalesce(sum(p.amount), 0) FROM `payments` p
	WHERE p.case_id = `cases`.id AND p.kind = 'down_payment'
) WHERE `treatment_type_id` IN (SELECT id FROM `treatment_types` WHERE `is_ortho` = 1);
