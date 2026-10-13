CREATE TABLE `access_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`role` text NOT NULL,
	`department_id` text,
	`lookup_hash` text NOT NULL,
	`salt` text NOT NULL,
	`code_hash` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_access_codes_lookup_hash` ON `access_codes` (`lookup_hash`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`action` text NOT NULL,
	`role` text NOT NULL,
	`department_id` text,
	`target_id` text,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `daily_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`report_id` text NOT NULL,
	`metric_key` text NOT NULL,
	`numeric_value` real,
	`text_value` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_daily_metrics_report_key` ON `daily_metrics` (`report_id`,`metric_key`);--> statement-breakpoint
CREATE INDEX `idx_daily_metrics_report` ON `daily_metrics` (`report_id`);--> statement-breakpoint
CREATE TABLE `daily_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`report_date` text NOT NULL,
	`department_id` text NOT NULL,
	`reporter_name` text NOT NULL,
	`routine_status` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`review_comment` text DEFAULT '' NOT NULL,
	`confirmed_zero` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`submitted_at` text,
	`approved_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_daily_reports_date_department` ON `daily_reports` (`report_date`,`department_id`);--> statement-breakpoint
CREATE INDEX `idx_daily_reports_date_status` ON `daily_reports` (`report_date`,`status`);--> statement-breakpoint
CREATE TABLE `followups` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text,
	`source_id` text,
	`report_date` text NOT NULL,
	`department_id` text NOT NULL,
	`category` text NOT NULL,
	`content` text NOT NULL,
	`quantity` real,
	`unit` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`responsible_person` text DEFAULT '' NOT NULL,
	`due_date` text,
	`completed_date` text,
	`is_abnormal` integer DEFAULT false NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`source_status` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_followups_date_department` ON `followups` (`report_date`,`department_id`);--> statement-breakpoint
CREATE INDEX `idx_followups_status_due` ON `followups` (`status`,`due_date`);--> statement-breakpoint
CREATE TABLE `history_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`report_date` text NOT NULL,
	`department_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`content` text NOT NULL,
	`category` text NOT NULL,
	`source_status` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_history_items_date_department` ON `history_items` (`report_date`,`department_id`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`ip_hash` text PRIMARY KEY NOT NULL,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`window_started_at` text NOT NULL,
	`locked_until` text
);
--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`object_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_photos_report` ON `photos` (`report_id`);--> statement-breakpoint
CREATE TABLE `publications` (
	`id` text PRIMARY KEY NOT NULL,
	`report_date` text NOT NULL,
	`version` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`published_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_publications_date_version` ON `publications` (`report_date`,`version`);--> statement-breakpoint
CREATE INDEX `idx_publications_date` ON `publications` (`report_date`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`access_id` text NOT NULL,
	`role` text NOT NULL,
	`department_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_expires_at` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `system_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
