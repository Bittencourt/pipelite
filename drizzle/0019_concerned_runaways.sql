ALTER TABLE "notification_preferences" ADD COLUMN "email_workflow_failed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "dry_run" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "replayed_from_run_id" text;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "failure_alert_sent_at" timestamp;