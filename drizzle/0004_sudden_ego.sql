CREATE TABLE `dive_sources` (
	`source` text NOT NULL,
	`source_record_id` text NOT NULL,
	`dive_id` text NOT NULL,
	`imported_at` text NOT NULL,
	PRIMARY KEY(`source`, `source_record_id`),
	FOREIGN KEY (`dive_id`) REFERENCES `dives`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dive_sources_dive_idx` ON `dive_sources` (`dive_id`);