CREATE TABLE "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"content" text NOT NULL,
	"author_id" text,
	"source" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "deal_stage_history" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"from_stage_id" text,
	"to_stage_id" text NOT NULL,
	"changed_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_from_stage_id_stages_id_fk" FOREIGN KEY ("from_stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_to_stage_id_stages_id_fk" FOREIGN KEY ("to_stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notes_live_idx" ON "notes" USING btree ("entity_type","entity_id","created_at" DESC NULLS LAST) WHERE "notes"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "notes_migration_uniq" ON "notes" USING btree ("entity_type","entity_id") WHERE "notes"."source" = 'migration';--> statement-breakpoint
CREATE INDEX "notes_author_id_idx" ON "notes" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "deal_stage_history_deal_idx" ON "deal_stage_history" USING btree ("deal_id","created_at" DESC NULLS LAST);--> statement-breakpoint
-- NOTE-03. Idempotent via notes_migration_uniq (partial UNIQUE on
-- (entity_type, entity_id) WHERE source = 'migration'). Verified: a second run
-- inserts 0 rows.
--
-- Measured on the live database 2026-08-15 (PostgreSQL 16.13), indexes already present:
--   organizations : 29,037 rows, 3,279 ms
--   activities    : 46,198 rows, 6,849 ms
--   re-run (no-op):      0 rows, 1,451 ms
--   resulting notes table: 46 MB
-- deals and people have ZERO non-empty notes in this dataset; their statements are
-- included anyway so the migration is correct on any other deployment.
--
-- Lock profile: ACCESS SHARE on the source tables (a read — does not block writers);
-- all writes go to the brand-new `notes` table. No user-visible write blocking.
--
-- ON CONFLICT DO NOTHING carries NO conflict target on purpose: it resolves against
-- notes_migration_uniq without naming it, so a future index rename cannot silently
-- turn these statements into duplicate-inserters (D-11 / T-35-11).
-- The WHERE clauses deliberately carry NO deleted_at filter: notes on soft-deleted
-- parent records ARE migrated (D-18), so SC-4 is an exact equality with no carve-out
-- on either side.
-- created_at = the record's created_at, so the migrated note sorts first (SC-3).
-- updated_at = the record's created_at too, for the same reason.
-- author_id  = the record's owner_id (D-09; NOT NULL on all four tables in this
--              schema, so "Unknown" never occurs here — it exists for other deployments).
-- btrim(...) <> '' skips whitespace-only notes: zero such rows exist today, but a
--              blank first timeline entry would be worse than none.
-- gen_random_uuid() is built into PostgreSQL 13+; no pgcrypto extension is required on 16.13.
INSERT INTO "notes" ("id","entity_type","entity_id","content","author_id","source","created_at","updated_at")
SELECT gen_random_uuid()::text, 'deal', d."id", d."notes", d."owner_id", 'migration', d."created_at", d."created_at"
  FROM "deals" d
 WHERE d."notes" IS NOT NULL AND btrim(d."notes") <> ''
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "notes" ("id","entity_type","entity_id","content","author_id","source","created_at","updated_at")
SELECT gen_random_uuid()::text, 'organization', o."id", o."notes", o."owner_id", 'migration', o."created_at", o."created_at"
  FROM "organizations" o
 WHERE o."notes" IS NOT NULL AND btrim(o."notes") <> ''
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "notes" ("id","entity_type","entity_id","content","author_id","source","created_at","updated_at")
SELECT gen_random_uuid()::text, 'person', p."id", p."notes", p."owner_id", 'migration', p."created_at", p."created_at"
  FROM "people" p
 WHERE p."notes" IS NOT NULL AND btrim(p."notes") <> ''
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "notes" ("id","entity_type","entity_id","content","author_id","source","created_at","updated_at")
SELECT gen_random_uuid()::text, 'activity', a."id", a."notes", a."owner_id", 'migration', a."created_at", a."created_at"
  FROM "activities" a
 WHERE a."notes" IS NOT NULL AND btrim(a."notes") <> ''
ON CONFLICT DO NOTHING;