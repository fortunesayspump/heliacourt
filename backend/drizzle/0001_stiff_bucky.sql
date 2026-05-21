CREATE TABLE "case_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"wallet" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"wallet" text PRIMARY KEY NOT NULL,
	"username" text,
	"display_name" text,
	"avatar_url" text,
	"bio" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "visibility" text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "payer_visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "case_participants" ADD CONSTRAINT "case_participants_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_participants" ADD CONSTRAINT "case_participants_wallet_users_wallet_fk" FOREIGN KEY ("wallet") REFERENCES "public"."users"("wallet") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_participants_case_idx" ON "case_participants" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "case_participants_wallet_idx" ON "case_participants" USING btree ("wallet");--> statement-breakpoint
CREATE UNIQUE INDEX "case_participants_case_wallet_role_idx" ON "case_participants" USING btree ("case_id","wallet","role");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_idx" ON "users" USING btree ("username");--> statement-breakpoint
INSERT INTO "users" ("wallet", "created_at", "updated_at", "last_seen_at")
SELECT DISTINCT lower("filer"), now(), now(), now()
FROM "cases"
WHERE "filer" IS NOT NULL
ON CONFLICT ("wallet") DO NOTHING;--> statement-breakpoint
INSERT INTO "case_participants" ("id", "case_id", "wallet", "role", "created_at")
SELECT "id" || ':' || lower("filer") || ':filer', "id", lower("filer"), 'filer', "created_at"
FROM "cases"
WHERE "filer" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;
