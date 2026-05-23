CREATE TABLE "telegram_accounts" (
	"telegram_user_id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"wallet" text NOT NULL,
	"username" text,
	"first_name" text,
	"linked_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_link_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"telegram_user_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"username" text,
	"first_name" text,
	"wallet" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "telegram_accounts" ADD CONSTRAINT "telegram_accounts_wallet_users_wallet_fk" FOREIGN KEY ("wallet") REFERENCES "public"."users"("wallet") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_requests" ADD CONSTRAINT "telegram_link_requests_wallet_users_wallet_fk" FOREIGN KEY ("wallet") REFERENCES "public"."users"("wallet") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telegram_accounts_wallet_idx" ON "telegram_accounts" USING btree ("wallet");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_link_requests_token_idx" ON "telegram_link_requests" USING btree ("token");--> statement-breakpoint
CREATE INDEX "telegram_link_requests_user_idx" ON "telegram_link_requests" USING btree ("telegram_user_id");