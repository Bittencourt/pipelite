-- These two CREATE TABLEs are deliberately NOT written with IF NOT EXISTS.
-- Both tables originally entered this project through `drizzle-kit push`, so a deployment
-- whose ledger high-water mark is at or before 0006 may already hold them. On such a
-- database this migration aborts with 42P07 `relation "import_sessions" already exists`,
-- the whole chain rolls back in its single transaction, and nothing is applied.
-- That is the intended behaviour: a push-created table is not guaranteed to match what this
-- file declares, so IF NOT EXISTS would carry the chain on against a schema that silently
-- differs from the one this repository ships - green while wrong, which is the exact class
-- of defect `npm run db:check-migrations` exists to catch. A build from zero is
-- byte-identical either way.
-- The operator-facing recovery procedure is docs/admin/backup-restore.md section 10.
CREATE TABLE "import_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"webhook_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"http_status" integer,
	"response_body" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "webhook_deliveries_status_next_attempt_idx" ON "webhook_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
ALTER TABLE "import_sessions" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "import_sessions" ADD CONSTRAINT "import_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
