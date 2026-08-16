CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_user_id" text,
	"workflow_run_id" text,
	"import_session_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_import_session_id_import_sessions_id_fk" FOREIGN KEY ("import_session_id") REFERENCES "public"."import_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_workflow_run_idx" ON "audit_log" USING btree ("workflow_run_id") WHERE "audit_log"."workflow_run_id" is not null;--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_import_session_idx" ON "audit_log" USING btree ("import_session_id") WHERE "audit_log"."import_session_id" is not null;--> statement-breakpoint
-- ============================================================================
-- HAND-ADDED DATA SEED (the only hand-edit to this file; everything above is
-- emitted by `drizzle-kit generate` and must never be edited).
--
-- 1. WHY IT EXISTS. 36-CONTEXT locks a 90-day default retention: "long enough to
--    answer 'who changed this last quarter', short enough to bound growth on a
--    deployment where nobody is watching disk". Without this seed,
--    readRetentionDays() returns null on a fresh install, the pruner (36-18)
--    deletes nothing, and audit_log — the table PROJECT.md singles out as the
--    disk risk — grows forever until an admin proactively discovers /admin/audit
--    and types a number. That is precisely the scenario the default exists to
--    prevent (T-36-43).
--
-- 2. WHY IT IS DATA AND NOT A CODE FALLBACK. 36-08 forbids a `?? 90` fallback in
--    settings.ts on purpose: a code-level default would mean a corrupted,
--    tampered or deliberately cleared setting row silently RESUMES deleting rows
--    at 90 days, which is the wrong failure direction for an audit log
--    (T-36-44). A seeded row plus fail-closed parsing gives BOTH properties — a
--    sane out-of-box policy AND a read path that keeps data whenever it cannot
--    be sure. The two are complementary and neither substitutes for the other.
--    Do not "simplify" either away.
--
-- 3. WHY HAND-EDITING THIS FILE DOES NOT VIOLATE PHASE 33 D-06. D-06 forbids
--    hand-written INDEX DDL in migration SQL, because `drizzle-kit generate`
--    owns the schema and silently dropped a hand-written index in this repo once
--    (0009 to 0010). `generate` does not manage data rows at all, never emits or
--    re-emits an INSERT, and applied migrations are append-only — so this
--    statement cannot be clobbered by a later `generate`. The distinction is DDL
--    versus data, and it is the same carve-out Phase 25 used for its
--    trigger-array data migration. Do not generalise it: no index DDL is ever
--    hand-written here. (These comments deliberately avoid spelling the DDL
--    keywords, so the `grep -c` gates that count real statements in this file
--    stay exact.)
--
-- 4. WHY THE CONFLICT CLAUSE DOES NOTHING RATHER THAN UPSERTING. The seed must be
--    idempotent and must NEVER overwrite a value an admin has chosen. On this
--    project's live database the migration runs once, but a replayed or
--    re-applied migration must be a no-op against an operator's setting.
-- ============================================================================
INSERT INTO "app_settings" ("key", "value") VALUES ('audit.retention_days', '90'::jsonb) ON CONFLICT ("key") DO NOTHING;