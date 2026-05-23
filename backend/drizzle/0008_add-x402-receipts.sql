CREATE TABLE IF NOT EXISTS "x402_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"payer" text,
	"transaction_id" text NOT NULL,
	"amount_micro_usdc" text NOT NULL,
	"network" text NOT NULL,
	"resource" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "x402_receipts" ADD CONSTRAINT "x402_receipts_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "x402_receipts_case_idx" ON "x402_receipts" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "x402_receipts_payer_idx" ON "x402_receipts" USING btree ("payer");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "x402_receipts_tx_resource_idx" ON "x402_receipts" USING btree ("transaction_id","resource");
