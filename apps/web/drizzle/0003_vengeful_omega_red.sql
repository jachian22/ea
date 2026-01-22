CREATE TABLE "commitment" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"person_id" text,
	"description" text NOT NULL,
	"direction" text NOT NULL,
	"status" text NOT NULL,
	"promised_at" timestamp,
	"due_date" timestamp,
	"completed_at" timestamp,
	"completion_evidence" text,
	"source_type" text,
	"source_id" text,
	"priority" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commitment_reminder" (
	"id" text PRIMARY KEY NOT NULL,
	"commitment_id" text NOT NULL,
	"remind_at" timestamp NOT NULL,
	"reminder_type" text NOT NULL,
	"days_offset" integer,
	"is_sent" boolean,
	"sent_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"event_type" text NOT NULL,
	"external_id" text NOT NULL,
	"status" text NOT NULL,
	"error_message" text,
	"payload" jsonb,
	"persons_created" integer,
	"interactions_created" integer,
	"commitments_detected" integer,
	"processed_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interaction" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"person_id" text NOT NULL,
	"type" text NOT NULL,
	"channel" text NOT NULL,
	"direction" text NOT NULL,
	"subject" text,
	"summary" text,
	"source_type" text,
	"source_id" text,
	"occurred_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_briefing" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"calendar_event_id" text NOT NULL,
	"meeting_title" text NOT NULL,
	"meeting_start_time" timestamp NOT NULL,
	"meeting_end_time" timestamp NOT NULL,
	"meeting_location" text,
	"meeting_link" text,
	"attendees" jsonb,
	"previous_meetings" jsonb,
	"related_email_threads" jsonb,
	"upcoming_commitments" jsonb,
	"suggested_prep" jsonb,
	"briefing_content" text,
	"status" text NOT NULL,
	"error_message" text,
	"notification_sent_at" timestamp,
	"generated_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"urgency" text,
	"channels" jsonb,
	"is_read" boolean,
	"read_at" timestamp,
	"delivery_status" jsonb,
	"related_type" text,
	"related_id" text,
	"metadata" jsonb,
	"scheduled_for" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"preferences" jsonb,
	"quiet_hours_enabled" boolean,
	"quiet_hours_start" text,
	"quiet_hours_end" text,
	"timezone" text,
	"batch_digest" boolean,
	"digest_time" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "notification_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" text,
	"company" text,
	"domain" text,
	"importance_score" integer,
	"preferred_channel" text,
	"average_response_time" integer,
	"total_interactions" integer,
	"last_contact_at" timestamp,
	"last_contact_channel" text,
	"first_contact_at" timestamp,
	"personal_notes" text,
	"google_contact_id" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_reminder" ADD CONSTRAINT "commitment_reminder_commitment_id_commitment_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."commitment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_event" ADD CONSTRAINT "ingestion_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interaction" ADD CONSTRAINT "interaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interaction" ADD CONSTRAINT "interaction_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_briefing" ADD CONSTRAINT "meeting_briefing_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_commitment_user_id" ON "commitment" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_commitment_person_id" ON "commitment" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_commitment_status" ON "commitment" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_commitment_due_date" ON "commitment" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "idx_commitment_direction" ON "commitment" USING btree ("direction");--> statement-breakpoint
CREATE INDEX "idx_commitment_reminder_commitment_id" ON "commitment_reminder" USING btree ("commitment_id");--> statement-breakpoint
CREATE INDEX "idx_commitment_reminder_remind_at" ON "commitment_reminder" USING btree ("remind_at");--> statement-breakpoint
CREATE INDEX "idx_commitment_reminder_unsent" ON "commitment_reminder" USING btree ("is_sent","remind_at");--> statement-breakpoint
CREATE INDEX "idx_ingestion_event_user_id" ON "ingestion_event" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_ingestion_event_status" ON "ingestion_event" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ingestion_event_external_id" ON "ingestion_event" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "idx_ingestion_event_source" ON "ingestion_event" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_interaction_user_id" ON "interaction" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_interaction_person_id" ON "interaction" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_interaction_occurred_at" ON "interaction" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "idx_interaction_source" ON "interaction" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "idx_meeting_briefing_user_id" ON "meeting_briefing" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_meeting_briefing_event_id" ON "meeting_briefing" USING btree ("calendar_event_id");--> statement-breakpoint
CREATE INDEX "idx_meeting_briefing_start_time" ON "meeting_briefing" USING btree ("meeting_start_time");--> statement-breakpoint
CREATE INDEX "idx_meeting_briefing_user_event" ON "meeting_briefing" USING btree ("user_id","calendar_event_id");--> statement-breakpoint
CREATE INDEX "idx_notification_user_id" ON "notification" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_notification_type" ON "notification" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_notification_unread" ON "notification" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "idx_notification_scheduled" ON "notification" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "idx_notification_preferences_user_id" ON "notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_person_user_id" ON "person" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_person_email" ON "person" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_person_user_email" ON "person" USING btree ("user_id","email");--> statement-breakpoint
CREATE INDEX "idx_person_domain" ON "person" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "idx_person_importance" ON "person" USING btree ("importance_score");