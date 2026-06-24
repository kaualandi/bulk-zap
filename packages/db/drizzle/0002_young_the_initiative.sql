ALTER TYPE "public"."campaign_status" ADD VALUE 'canceled';--> statement-breakpoint
ALTER TYPE "public"."message_status" ADD VALUE 'canceled';--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "provider_msg_id" text;