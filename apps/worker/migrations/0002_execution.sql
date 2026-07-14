PRAGMA foreign_keys = ON;

CREATE TABLE `scripts` (
  `id` text NOT NULL,
  `version` text NOT NULL,
  `metadata_json` text NOT NULL,
  `enabled` integer NOT NULL CHECK (`enabled` IN (0, 1)),
  `created_at` text NOT NULL
);

CREATE UNIQUE INDEX `scripts_id_version_unique` ON `scripts` (`id`, `version`);

CREATE TABLE `execution_plans` (
  `id` text PRIMARY KEY NOT NULL,
  `dataset_version_id` text NOT NULL,
  `model_name` text NOT NULL,
  `prompt_version_id` text NOT NULL,
  `user_requirement` text NOT NULL,
  `decision_json` text NOT NULL,
  `script_id` text,
  `script_version` text,
  `parameters_json` text,
  `confirmation_status` text NOT NULL CHECK (`confirmation_status` IN ('pending', 'confirmed')),
  `confirmed_at` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`dataset_version_id`) REFERENCES `dataset_versions`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`prompt_version_id`) REFERENCES `prompt_versions`(`id`) ON DELETE RESTRICT
);

CREATE INDEX `execution_plans_dataset_version_created_at_idx`
  ON `execution_plans` (`dataset_version_id`, `created_at`);

CREATE TABLE `processing_tasks` (
  `id` text PRIMARY KEY NOT NULL,
  `plan_id` text NOT NULL UNIQUE,
  `status` text NOT NULL CHECK (`status` IN ('queued', 'running', 'succeeded', 'failed')),
  `result_object_key` text,
  `result_schema_object_key` text,
  `result_summary_object_key` text,
  `error_object_key` text,
  `retry_count` integer NOT NULL DEFAULT 0 CHECK (`retry_count` >= 0),
  `created_at` text NOT NULL,
  `started_at` text,
  `completed_at` text,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`plan_id`) REFERENCES `execution_plans`(`id`) ON DELETE RESTRICT
);

CREATE INDEX `processing_tasks_status_created_at_idx`
  ON `processing_tasks` (`status`, `created_at`);
