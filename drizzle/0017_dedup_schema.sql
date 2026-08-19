CREATE TABLE "dedup_scans" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"entity_type" text NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "duplicate_pairs" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"record_a_id" text NOT NULL,
	"record_b_id" text NOT NULL,
	"tier" text NOT NULL,
	"reason" text NOT NULL,
	"score" real,
	"status" text DEFAULT 'open' NOT NULL,
	"scan_id" text,
	"dismissed_by_user_id" text,
	"dismissed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "norm_name" text GENERATED ALWAYS AS (public.dedup_norm_org(name)) STORED;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "norm_name" text GENERATED ALWAYS AS (public.dedup_norm_person(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) STORED;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "norm_email" text GENERATED ALWAYS AS (lower(btrim(coalesce(email, '')))) STORED;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "norm_phone" text GENERATED ALWAYS AS (regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) STORED;--> statement-breakpoint
ALTER TABLE "dedup_scans" ADD CONSTRAINT "dedup_scans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_pairs" ADD CONSTRAINT "duplicate_pairs_scan_id_dedup_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."dedup_scans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_pairs" ADD CONSTRAINT "duplicate_pairs_dismissed_by_user_id_users_id_fk" FOREIGN KEY ("dismissed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dedup_scans_active_idx" ON "dedup_scans" USING btree ("entity_type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "duplicate_pairs_uniq" ON "duplicate_pairs" USING btree ("entity_type","record_a_id","record_b_id");--> statement-breakpoint
CREATE INDEX "duplicate_pairs_list_idx" ON "duplicate_pairs" USING btree ("entity_type","status","created_at");--> statement-breakpoint
CREATE INDEX "duplicate_pairs_record_a_idx" ON "duplicate_pairs" USING btree ("record_a_id");--> statement-breakpoint
CREATE INDEX "duplicate_pairs_record_b_idx" ON "duplicate_pairs" USING btree ("record_b_id");--> statement-breakpoint
CREATE INDEX "org_norm_trgm_idx" ON "organizations" USING gin ("norm_name" gin_trgm_ops) WHERE "organizations"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "org_norm_btree_idx" ON "organizations" USING btree ("norm_name") WHERE "organizations"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "people_norm_trgm_idx" ON "people" USING gin ("norm_name" gin_trgm_ops) WHERE "people"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "people_norm_btree_idx" ON "people" USING btree ("norm_name") WHERE "people"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "people_norm_email_idx" ON "people" USING btree ("norm_email") WHERE "people"."deleted_at" is null;