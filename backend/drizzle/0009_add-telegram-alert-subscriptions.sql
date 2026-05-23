CREATE TABLE IF NOT EXISTS "telegram_alert_subscriptions" (
	"chat_id" text PRIMARY KEY NOT NULL,
	"chat_type" text,
	"title" text,
	"subscribed_by_telegram_user_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
