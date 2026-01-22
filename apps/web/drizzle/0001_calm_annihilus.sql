CREATE TABLE "daily_brief" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"brief_date" date NOT NULL,
	"calendar_events" jsonb,
	"emails" jsonb,
	"brief_content" text,
	"status" text NOT NULL,
	"error_message" text,
	"total_events" text,
	"total_emails" text,
	"emails_needing_response" text,
	"generated_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_integration" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"access_token_expires_at" timestamp NOT NULL,
	"scope" text NOT NULL,
	"google_email" text NOT NULL,
	"google_account_id" text NOT NULL,
	"is_connected" boolean NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "google_integration_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "daily_brief" ADD CONSTRAINT "daily_brief_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_integration" ADD CONSTRAINT "google_integration_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_daily_brief_user_id" ON "daily_brief" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_daily_brief_date" ON "daily_brief" USING btree ("brief_date");--> statement-breakpoint
CREATE INDEX "idx_daily_brief_user_date" ON "daily_brief" USING btree ("user_id","brief_date");--> statement-breakpoint
CREATE INDEX "idx_google_integration_user_id" ON "google_integration" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_google_integration_google_account_id" ON "google_integration" USING btree ("google_account_id");