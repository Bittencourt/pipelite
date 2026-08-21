CREATE TABLE "saved_view_defaults" (
	"user_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"view_id" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saved_view_defaults_user_id_entity_type_pk" PRIMARY KEY("user_id","entity_type")
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_view_defaults" ADD CONSTRAINT "saved_view_defaults_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_view_defaults" ADD CONSTRAINT "saved_view_defaults_view_id_saved_views_id_fk" FOREIGN KEY ("view_id") REFERENCES "public"."saved_views"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_view_defaults_view_idx" ON "saved_view_defaults" USING btree ("view_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_views_owner_type_name_uniq" ON "saved_views" USING btree ("owner_id","entity_type","name");--> statement-breakpoint
CREATE INDEX "saved_views_owner_idx" ON "saved_views" USING btree ("entity_type","owner_id");--> statement-breakpoint
CREATE INDEX "saved_views_shared_idx" ON "saved_views" USING btree ("entity_type","is_shared");