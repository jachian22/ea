CREATE TABLE "action_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action_type_id" text NOT NULL,
	"authority_level" text NOT NULL,
	"status" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"description" text NOT NULL,
	"payload" jsonb,
	"confidence_score" integer,
	"user_feedback" text,
	"executed_at" timestamp,
	"approved_at" timestamp,
	"rejected_at" timestamp,
	"created_at" timestamp NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "action_type" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"risk_level" text NOT NULL,
	"default_authority_level" text NOT NULL,
	"reversible" boolean NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "action_type_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "authority_setting" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action_type_id" text NOT NULL,
	"authority_level" text NOT NULL,
	"conditions" jsonb,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "action_log" ADD CONSTRAINT "action_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_log" ADD CONSTRAINT "action_log_action_type_id_action_type_id_fk" FOREIGN KEY ("action_type_id") REFERENCES "public"."action_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authority_setting" ADD CONSTRAINT "authority_setting_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authority_setting" ADD CONSTRAINT "authority_setting_action_type_id_action_type_id_fk" FOREIGN KEY ("action_type_id") REFERENCES "public"."action_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_action_log_user_id" ON "action_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_action_log_action_type_id" ON "action_log" USING btree ("action_type_id");--> statement-breakpoint
CREATE INDEX "idx_action_log_status" ON "action_log" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_action_log_user_status" ON "action_log" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_action_log_target" ON "action_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_action_log_created_at" ON "action_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_action_type_name" ON "action_type" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_action_type_category" ON "action_type" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_authority_setting_user_id" ON "authority_setting" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_authority_setting_action_type_id" ON "authority_setting" USING btree ("action_type_id");--> statement-breakpoint
CREATE INDEX "idx_authority_setting_user_action" ON "authority_setting" USING btree ("user_id","action_type_id");