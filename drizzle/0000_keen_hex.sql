CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`dive_id` text NOT NULL,
	`object_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`caption` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`dive_id`) REFERENCES `dives`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attachments_dive_idx` ON `attachments` (`dive_id`);--> statement-breakpoint
CREATE TABLE `dives` (
	`id` text PRIMARY KEY NOT NULL,
	`dive_number` integer,
	`dive_date` text,
	`last_modified` text,
	`depth` text,
	`average_depth` real,
	`min_temp` real,
	`max_temp` real,
	`length_text` text,
	`location` text,
	`site` text,
	`buddy` text,
	`notes` text,
	`serial_number` text,
	`gps_entry_lat` real,
	`gps_entry_lng` real,
	`gps_exit_lat` real,
	`gps_exit_lng` real,
	`calculated_json` text,
	`imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `dives_date_idx` ON `dives` (`dive_date`);--> statement-breakpoint
CREATE INDEX `dives_number_idx` ON `dives` (`dive_number`);