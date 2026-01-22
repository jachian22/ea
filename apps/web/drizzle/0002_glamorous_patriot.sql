CREATE TABLE "bank_account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"bank" text NOT NULL,
	"account_type" text NOT NULL,
	"last_4" text NOT NULL,
	"nickname" text,
	"is_enabled" boolean,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_statement" (
	"id" text PRIMARY KEY NOT NULL,
	"bank_account_id" text NOT NULL,
	"statement_date" text NOT NULL,
	"file_path" text NOT NULL,
	"file_size" integer,
	"downloaded_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statement_run" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"statements_downloaded" integer,
	"banks_processed" jsonb,
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement" ADD CONSTRAINT "bank_statement_bank_account_id_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_run" ADD CONSTRAINT "statement_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_bank_account_user_id" ON "bank_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_bank_account_bank" ON "bank_account" USING btree ("bank");--> statement-breakpoint
CREATE INDEX "idx_bank_statement_account_id" ON "bank_statement" USING btree ("bank_account_id");--> statement-breakpoint
CREATE INDEX "idx_bank_statement_date" ON "bank_statement" USING btree ("statement_date");--> statement-breakpoint
CREATE INDEX "idx_statement_run_user_id" ON "statement_run" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_statement_run_status" ON "statement_run" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_statement_run_started_at" ON "statement_run" USING btree ("started_at");