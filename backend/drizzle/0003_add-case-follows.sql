CREATE TABLE "case_follows" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"wallet" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "case_follows" ADD CONSTRAINT "case_follows_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_follows" ADD CONSTRAINT "case_follows_wallet_users_wallet_fk" FOREIGN KEY ("wallet") REFERENCES "public"."users"("wallet") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_follows_case_idx" ON "case_follows" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "case_follows_wallet_idx" ON "case_follows" USING btree ("wallet");--> statement-breakpoint
CREATE UNIQUE INDEX "case_follows_case_wallet_idx" ON "case_follows" USING btree ("case_id","wallet");