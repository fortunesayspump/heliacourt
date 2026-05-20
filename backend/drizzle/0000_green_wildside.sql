CREATE TABLE "cases" (
	"id" text PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"context" text,
	"links" jsonb,
	"type" text NOT NULL,
	"filer" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "court_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"case_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"type" text NOT NULL,
	"summary" text NOT NULL,
	"confidence" real,
	"cost_usd" real NOT NULL,
	"run_mode" text,
	"model_provider" text,
	"model" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hearing_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"status" text NOT NULL,
	"market_case" jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "onchain_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"job_id" text,
	"chain_id" text NOT NULL,
	"tx_hash" text NOT NULL,
	"receipt_type" text NOT NULL,
	"record_hash" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_rows" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"case_id" text NOT NULL,
	"artifact_id" text,
	"item" text NOT NULL,
	"amount" text NOT NULL,
	"status" text NOT NULL,
	"record_hash" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"case_id" text NOT NULL,
	"artifact_id" text,
	"capability" text NOT NULL,
	"provider" text NOT NULL,
	"query" text NOT NULL,
	"status" text NOT NULL,
	"relevance" text,
	"observations" jsonb NOT NULL,
	"sources" jsonb NOT NULL,
	"error" text,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_turns" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"case_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"seat" text NOT NULL,
	"kind" text NOT NULL,
	"stage" text NOT NULL,
	"message" text NOT NULL,
	"reply_to_id" text,
	"requested_agent_id" text,
	"request" text,
	"artifact_id" text,
	"confidence" real,
	"tags" jsonb,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verdicts" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"case_id" text NOT NULL,
	"artifact_id" text NOT NULL,
	"summary" text NOT NULL,
	"confidence" real,
	"record_hash" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "court_artifacts" ADD CONSTRAINT "court_artifacts_job_id_hearing_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."hearing_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_artifacts" ADD CONSTRAINT "court_artifacts_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hearing_jobs" ADD CONSTRAINT "hearing_jobs_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onchain_receipts" ADD CONSTRAINT "onchain_receipts_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onchain_receipts" ADD CONSTRAINT "onchain_receipts_job_id_hearing_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."hearing_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_rows" ADD CONSTRAINT "settlement_rows_job_id_hearing_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."hearing_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_rows" ADD CONSTRAINT "settlement_rows_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_rows" ADD CONSTRAINT "settlement_rows_artifact_id_court_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."court_artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_evidence" ADD CONSTRAINT "tool_evidence_job_id_hearing_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."hearing_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_evidence" ADD CONSTRAINT "tool_evidence_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_evidence" ADD CONSTRAINT "tool_evidence_artifact_id_court_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."court_artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_turns" ADD CONSTRAINT "transcript_turns_job_id_hearing_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."hearing_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_turns" ADD CONSTRAINT "transcript_turns_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verdicts" ADD CONSTRAINT "verdicts_job_id_hearing_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."hearing_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verdicts" ADD CONSTRAINT "verdicts_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verdicts" ADD CONSTRAINT "verdicts_artifact_id_court_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."court_artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "court_artifacts_job_idx" ON "court_artifacts" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "court_artifacts_case_idx" ON "court_artifacts" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "court_artifacts_type_idx" ON "court_artifacts" USING btree ("type");--> statement-breakpoint
CREATE INDEX "hearing_jobs_case_idx" ON "hearing_jobs" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "hearing_jobs_status_idx" ON "hearing_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hearing_jobs_updated_idx" ON "hearing_jobs" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "onchain_receipts_case_idx" ON "onchain_receipts" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "onchain_receipts_tx_idx" ON "onchain_receipts" USING btree ("tx_hash");--> statement-breakpoint
CREATE INDEX "settlement_rows_case_idx" ON "settlement_rows" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "settlement_rows_job_idx" ON "settlement_rows" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "tool_evidence_job_idx" ON "tool_evidence" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "tool_evidence_case_idx" ON "tool_evidence" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "tool_evidence_artifact_idx" ON "tool_evidence" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "transcript_turns_job_idx" ON "transcript_turns" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "transcript_turns_case_idx" ON "transcript_turns" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "transcript_turns_created_idx" ON "transcript_turns" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "verdicts_case_idx" ON "verdicts" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "verdicts_job_idx" ON "verdicts" USING btree ("job_id");