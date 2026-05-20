CREATE TYPE "public"."account_status" AS ENUM('disconnected', 'connecting', 'connected', 'banned');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_driver" AS ENUM('baileys', 'cloud_api');--> statement-breakpoint
CREATE TYPE "public"."warmup_mode" AS ENUM('off', 'auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."contact_source" AS ENUM('whatsapp_sync', 'csv_import', 'manual');--> statement-breakpoint
CREATE TYPE "public"."list_member_type" AS ENUM('contact', 'group');--> statement-breakpoint
CREATE TYPE "public"."list_type" AS ENUM('contacts', 'groups');--> statement-breakpoint
CREATE TYPE "public"."campaign_category" AS ENUM('marketing', 'transacional', 'atendimento', 'outros');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'scheduled', 'running', 'paused', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'sent', 'delivered', 'read', 'failed');--> statement-breakpoint
CREATE TYPE "public"."message_target_type" AS ENUM('contact', 'group');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('connected', 'disconnected', 'banned', 'qr_required', 'qr_scanned', 'warmup_advanced', 'message_failed', 'campaign_high_failure_rate', 'schedule_missed');--> statement-breakpoint
CREATE TABLE "whatsapp_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver" "whatsapp_driver" DEFAULT 'baileys' NOT NULL,
	"phone_e164" text,
	"display_name" text NOT NULL,
	"status" "account_status" DEFAULT 'disconnected' NOT NULL,
	"warmup_mode" "warmup_mode" DEFAULT 'off' NOT NULL,
	"daily_limit" integer,
	"daily_used" integer DEFAULT 0 NOT NULL,
	"daily_reset_at" timestamp with time zone,
	"warmup_started_at" timestamp with time zone,
	"last_connection_error" text,
	"last_seen_at" timestamp with time zone,
	"cloud_api_phone_id" text,
	"cloud_api_token_cipher" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "baileys_creds" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"creds" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "baileys_keys" (
	"account_id" uuid NOT NULL,
	"type" text NOT NULL,
	"key_id" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "baileys_keys_account_id_type_key_id_pk" PRIMARY KEY("account_id","type","key_id")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"jid" text NOT NULL,
	"name" text,
	"push_name" text,
	"source" "contact_source" DEFAULT 'whatsapp_sync' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_memberships" (
	"group_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_memberships_group_id_account_id_pk" PRIMARY KEY("group_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jid" text NOT NULL,
	"subject" text NOT NULL,
	"participants_count" integer,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_jid_unique" UNIQUE("jid")
);
--> statement-breakpoint
CREATE TABLE "list_members" (
	"list_id" uuid NOT NULL,
	"target_type" "list_member_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_members_list_id_target_type_target_id_pk" PRIMARY KEY("list_id","target_type","target_id")
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "list_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "campaign_status" DEFAULT 'running' NOT NULL,
	"total_targets" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" "campaign_category" DEFAULT 'outros' NOT NULL,
	"template_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"account_pool_ids" jsonb NOT NULL,
	"schedule_at" timestamp with time zone,
	"jitter_min_ms" integer DEFAULT 15000 NOT NULL,
	"jitter_max_ms" integer DEFAULT 90000 NOT NULL,
	"daily_cap_per_account" integer,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"marketing_consent_confirmed" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_run_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"target_jid" text NOT NULL,
	"target_type" "message_target_type" NOT NULL,
	"body" text NOT NULL,
	"status" "message_status" DEFAULT 'queued' NOT NULL,
	"error" text,
	"bull_job_id" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"type" "event_type" NOT NULL,
	"payload" jsonb,
	"notified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"event_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_subscriptions_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "baileys_creds" ADD CONSTRAINT "baileys_creds_account_id_whatsapp_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."whatsapp_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baileys_keys" ADD CONSTRAINT "baileys_keys_account_id_whatsapp_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."whatsapp_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_account_id_whatsapp_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."whatsapp_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_account_id_whatsapp_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."whatsapp_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_runs" ADD CONSTRAINT "campaign_runs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_campaign_run_id_campaign_runs_id_fk" FOREIGN KEY ("campaign_run_id") REFERENCES "public"."campaign_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_account_id_whatsapp_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."whatsapp_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_account_id_whatsapp_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."whatsapp_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_jid_account_unique" ON "contacts" USING btree ("jid","account_id");--> statement-breakpoint
CREATE INDEX "messages_run_idx" ON "messages" USING btree ("campaign_run_id");--> statement-breakpoint
CREATE INDEX "messages_account_idx" ON "messages" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "messages_status_idx" ON "messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "events_account_type_idx" ON "events" USING btree ("account_id","type");--> statement-breakpoint
CREATE INDEX "events_created_at_idx" ON "events" USING btree ("created_at");