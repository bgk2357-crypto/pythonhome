CREATE TABLE `news_feed_cache` (
	`source_id` text PRIMARY KEY NOT NULL,
	`items_json` text NOT NULL,
	`fetched_at` text,
	`checked_at` text NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL
);
