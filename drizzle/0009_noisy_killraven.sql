ALTER TABLE `doctors` ADD `does_implants` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `doctors` ADD `does_normal` integer DEFAULT true NOT NULL;--> statement-breakpoint
-- Both columns default to true so no existing doctor disappears from a picker
-- after this upgrade. The one exception is the orthodontist: د. زهرة does ortho
-- only, one day a week (BRIEF.md), and until now she was selectable for implant
-- cards and for normal work in الدفتر اليومي — which would have filed her
-- production under the wrong settlement bucket. Narrow any doctor already
-- marked as an orthodontist to ortho alone; the clinic can widen it again from
-- «الأطباء» if one of them also takes other work.
UPDATE `doctors` SET `does_implants` = false, `does_normal` = false WHERE `does_ortho` = true;
