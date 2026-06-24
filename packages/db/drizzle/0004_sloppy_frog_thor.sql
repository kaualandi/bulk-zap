CREATE TABLE "overage_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"dispatches" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"mp_preference_id" text,
	"mp_init_point" text,
	"mp_payment_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "overage_invoices" ADD CONSTRAINT "overage_invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "overage_invoices_org_period_unique" ON "overage_invoices" USING btree ("organization_id","period_start");--> statement-breakpoint
CREATE INDEX "overage_invoices_org_idx" ON "overage_invoices" USING btree ("organization_id");