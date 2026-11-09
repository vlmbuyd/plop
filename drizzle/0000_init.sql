CREATE TABLE `change_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`before` text NOT NULL,
	`undone_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`text` text NOT NULL,
	`batch_id` text,
	`is_error` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dismissed_insights` (
	`key` text PRIMARY KEY NOT NULL,
	`dismissed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `facts` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kv` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `occurrence_completions` (
	`task_id` text NOT NULL,
	`occurrence_starts_at` integer NOT NULL,
	`completed_at` integer NOT NULL,
	PRIMARY KEY(`task_id`, `occurrence_starts_at`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`kind` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`starts_at` integer,
	`ends_at` integer,
	`all_day` integer DEFAULT false NOT NULL,
	`completed_at` integer,
	`duration_minutes` integer,
	`group_id` text,
	`group_set_by` text,
	`recurrence` text,
	`excluded_starts` text DEFAULT '[]' NOT NULL,
	`series_id` text,
	`original_starts_at` integer,
	`postpone_count` integer DEFAULT 0 NOT NULL,
	`reschedule_offered_at` integer,
	`external_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tasks_starts_at_idx` ON `tasks` (`starts_at`);--> statement-breakpoint
CREATE INDEX `tasks_series_id_idx` ON `tasks` (`series_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_external_id_idx` ON `tasks` (`external_id`);