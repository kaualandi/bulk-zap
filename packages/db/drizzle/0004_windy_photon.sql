CREATE TABLE "credit_accounts" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"auto_recharge_enabled" boolean DEFAULT false NOT NULL,
	"auto_recharge_threshold" integer,
	"auto_recharge_package_qty" integer DEFAULT 1 NOT NULL,
	"recharge_pending" boolean DEFAULT false NOT NULL,
	"mp_customer_id" text,
	"mp_card_id" text,
	"card_last4" text,
	"card_brand" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "overage_purchases" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overage_purchases" ADD CONSTRAINT "overage_purchases_mp_payment_id_unique" UNIQUE("mp_payment_id");