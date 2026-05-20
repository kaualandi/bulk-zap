CREATE TYPE "public"."blocklist_source" AS ENUM('auto_opt_out', 'manual', 'imported');--> statement-breakpoint
CREATE TYPE "public"."inbound_classification" AS ENUM('opt_out', 'interesse', 'duvida', 'reclamacao', 'outro');--> statement-breakpoint
CREATE TABLE "contact_blocklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jid" text NOT NULL,
	"reason" text,
	"source" "blocklist_source" DEFAULT 'auto_opt_out' NOT NULL,
	"blocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_blocklist_jid_unique" UNIQUE("jid")
);
--> statement-breakpoint
CREATE TABLE "inbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"from_jid" text NOT NULL,
	"text" text NOT NULL,
	"classification" "inbound_classification",
	"confidence" double precision,
	"classified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_account_id_whatsapp_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."whatsapp_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inbound_account_idx" ON "inbound_messages" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "inbound_classif_idx" ON "inbound_messages" USING btree ("classification");