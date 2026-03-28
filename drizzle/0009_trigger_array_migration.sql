-- Add new triggers (array) column with default empty array
ALTER TABLE "workflows" ADD COLUMN "triggers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint

-- Copy existing trigger data wrapped in array
UPDATE "workflows" SET "triggers" = CASE
  WHEN "trigger" = '{}'::jsonb THEN '[]'::jsonb
  WHEN "trigger" IS NULL THEN '[]'::jsonb
  ELSE jsonb_build_array("trigger")
END;--> statement-breakpoint

-- Drop old trigger column
ALTER TABLE "workflows" DROP COLUMN "trigger";--> statement-breakpoint

-- Add next_run_at timestamp column
ALTER TABLE "workflows" ADD COLUMN "next_run_at" timestamp;--> statement-breakpoint

-- Add webhook_secret text column
ALTER TABLE "workflows" ADD COLUMN "webhook_secret" text;--> statement-breakpoint

-- Add partial index for scheduled workflow polling
CREATE INDEX "workflows_next_run_at_idx" ON "workflows" ("next_run_at") WHERE "active" = true AND "next_run_at" IS NOT NULL;
