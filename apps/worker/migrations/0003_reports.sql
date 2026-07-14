PRAGMA foreign_keys = ON;

CREATE TABLE `reports` (
  `id` text PRIMARY KEY NOT NULL,
  `task_id` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`task_id`) REFERENCES `processing_tasks`(`id`) ON DELETE RESTRICT
);

CREATE INDEX `reports_task_created_at_idx` ON `reports` (`task_id`, `created_at`);

CREATE TABLE `report_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `report_id` text NOT NULL,
  `version` integer NOT NULL CHECK (`version` > 0),
  `user_requirement` text NOT NULL,
  `prompt_version_id` text NOT NULL,
  `config_object_key` text NOT NULL,
  `data_object_key` text NOT NULL,
  `validation_status` text NOT NULL CHECK (`validation_status` IN ('valid', 'invalid')),
  `confirmed_at` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`prompt_version_id`) REFERENCES `prompt_versions`(`id`) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX `report_versions_report_version_unique`
  ON `report_versions` (`report_id`, `version`);

CREATE INDEX `report_versions_status_created_at_idx`
  ON `report_versions` (`validation_status`, `created_at`);
