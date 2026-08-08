DROP INDEX "workflows_next_run_at_idx";--> statement-breakpoint
ALTER TABLE "workflow_run_steps" ADD COLUMN "resume_at" timestamp;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "depth" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "context" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "current_node_id" text;