ALTER TABLE "cases" ADD COLUMN "parent_case_id" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "filing_kind" text DEFAULT 'original' NOT NULL;--> statement-breakpoint
CREATE INDEX "cases_parent_case_idx" ON "cases" USING btree ("parent_case_id");