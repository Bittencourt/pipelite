CREATE TABLE "notification_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email_deal_assigned" boolean DEFAULT true NOT NULL,
	"email_activity_reminder" boolean DEFAULT true NOT NULL,
	"email_weekly_digest" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"invited_by" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "digest_log" (
	"id" text PRIMARY KEY NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"user_count" integer NOT NULL,
	"week_start" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "reminder_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;