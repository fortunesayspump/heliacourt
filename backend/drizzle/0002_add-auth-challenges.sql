CREATE TABLE "auth_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"nonce" text NOT NULL,
	"message" text NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_wallet_users_wallet_fk" FOREIGN KEY ("wallet") REFERENCES "public"."users"("wallet") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_challenges_wallet_idx" ON "auth_challenges" USING btree ("wallet");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_challenges_nonce_idx" ON "auth_challenges" USING btree ("nonce");