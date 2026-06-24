ALTER TABLE "credit_accounts" ADD COLUMN "last_recharge_error" text;--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD COLUMN "last_recharge_error_at" timestamp with time zone;