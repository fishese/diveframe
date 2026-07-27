CREATE TABLE `geocodes` (
	`query` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`fetched_at` text NOT NULL
);
