CREATE TABLE `dive_site_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`aliases_json` text DEFAULT '[]' NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`country_code` text,
	`country` text,
	`region` text,
	`locality` text,
	`source` text NOT NULL,
	`source_ref` text,
	`notes` text,
	`status` text DEFAULT 'active' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `dive_site_catalog_coordinates_idx` ON `dive_site_catalog` (`latitude`,`longitude`);--> statement-breakpoint
CREATE INDEX `dive_site_catalog_status_idx` ON `dive_site_catalog` (`status`);
--> statement-breakpoint
INSERT OR IGNORE INTO `dive_site_catalog` (
  `id`, `name`, `aliases_json`, `latitude`, `longitude`, `country_code`,
  `country`, `region`, `locality`, `source`, `source_ref`, `notes`, `status`, `updated_at`
) VALUES (
  'hk-sharp-island', 'Sharp Island', '["Kiu Tsui Chau"]', 22.3636, 114.2928,
  'HK', 'Hong Kong', 'New Territories', 'Sai Kung', 'manual_seed', NULL,
  'Initial catalog example supplied by the owner.', 'active', '2026-07-28T00:00:00.000Z'
);
--> statement-breakpoint
INSERT OR IGNORE INTO `dive_site_catalog` (
  `id`, `name`, `aliases_json`, `latitude`, `longitude`, `country_code`,
  `country`, `region`, `locality`, `source`, `source_ref`, `notes`, `status`, `updated_at`
) VALUES (
  'hk-basalt-island', 'Basalt Island', '["Fo Siu Pai","Shek Chau"]', 22.3158, 114.3656,
  'HK', 'Hong Kong', 'New Territories', 'Sai Kung', 'manual_seed', NULL,
  'Initial catalog example supplied by the owner.', 'active', '2026-07-28T00:00:00.000Z'
);
