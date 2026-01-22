CREATE TABLE "backfill_job" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text NOT NULL,
	"source_type" text NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"progress" jsonb,
	"error" text,
	"persons_created" integer,
	"interactions_created" integer,
	"commitments_detected" integer,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"rule_type" text NOT NULL,
	"pattern" text NOT NULL,
	"domain" text NOT NULL,
	"priority" integer,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privacy_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"allow_cloud_ai" boolean NOT NULL,
	"excluded_domains" jsonb,
	"excluded_person_ids" jsonb,
	"excluded_email_domains" jsonb,
	"redact_patterns" jsonb,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "privacy_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "relationship" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"person_id" text NOT NULL,
	"relation_type" text NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "emails" jsonb;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "backfill_job" ADD CONSTRAINT "backfill_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_rule" ADD CONSTRAINT "domain_rule_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_settings" ADD CONSTRAINT "privacy_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship" ADD CONSTRAINT "relationship_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship" ADD CONSTRAINT "relationship_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_backfill_job_user_id" ON "backfill_job" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_backfill_job_status" ON "backfill_job" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_backfill_job_user_status" ON "backfill_job" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_domain_rule_user_id" ON "domain_rule" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_domain_rule_type" ON "domain_rule" USING btree ("rule_type");--> statement-breakpoint
CREATE INDEX "idx_domain_rule_priority" ON "domain_rule" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "idx_privacy_settings_user_id" ON "privacy_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_relationship_user_id" ON "relationship" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_relationship_person_id" ON "relationship" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_relationship_user_person" ON "relationship" USING btree ("user_id","person_id");--> statement-breakpoint
CREATE INDEX "idx_relationship_type" ON "relationship" USING btree ("relation_type");