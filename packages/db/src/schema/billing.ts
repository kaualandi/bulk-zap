import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";

// Billing model: monthly plan (mensalidade) with an included dispatch quota,
// plus overage sold in packages. Mercado Pago recurring subscription (preapproval).

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  monthlyPriceCents: integer("monthly_price_cents").notNull(),
  includedDispatches: integer("included_dispatches").notNull(),
  overagePackageSize: integer("overage_package_size").notNull(),
  overagePackagePriceCents: integer("overage_package_price_cents").notNull(),
  // Mercado Pago preapproval_plan id (assinatura template). Nullable until synced.
  mpPreapprovalPlanId: text("mp_preapproval_plan_id"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// status: pending | authorized | paused | cancelled (Mercado Pago preapproval states)
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  planId: uuid("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("pending"),
  // Mercado Pago preapproval (assinatura) id. Nullable until created at MP.
  mpPreapprovalId: text("mp_preapproval_id").unique(),
  currentPeriodStart: timestamp("current_period_start", {
    withTimezone: true,
  }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const dispatchUsage = pgTable(
  "dispatch_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    dispatchCount: integer("dispatch_count").notNull().default(0),
    overageDispatches: integer("overage_dispatches").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgPeriodUnique: uniqueIndex("dispatch_usage_org_period_unique").on(
      table.organizationId,
      table.periodStart
    ),
  })
);

// LEGACY (pré-pago): pacotes de excedente comprados adiantado. Mantido por
// compatibilidade, mas o modelo atual é pós-pago via `overage_invoices`.
export const overagePurchases = pgTable(
  "overage_purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dispatches: integer("dispatches").notNull(),
    amountCents: integer("amount_cents").notNull(),
    // Mercado Pago payment id for the one-off package purchase.
    mpPaymentId: text("mp_payment_id"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdx: index("overage_purchases_org_idx").on(table.organizationId),
  })
);

// Pós-pago: ao fechar o ciclo, o excedente daquele período (mensagens acima da
// franquia × preço por mensagem) vira uma fatura que o cliente paga via Checkout
// Pro. Uma fatura por (org, período). status: pending | paid | void.
export const overageInvoices = pgTable(
  "overage_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    // Quantidade de mensagens excedentes (acima da franquia) no período.
    dispatches: integer("dispatches").notNull(),
    amountCents: integer("amount_cents").notNull(),
    // Checkout Pro preference + payment ids do Mercado Pago, e a URL do checkout.
    mpPreferenceId: text("mp_preference_id"),
    mpInitPoint: text("mp_init_point"),
    mpPaymentId: text("mp_payment_id"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgPeriodUnique: uniqueIndex("overage_invoices_org_period_unique").on(
      table.organizationId,
      table.periodStart
    ),
    orgIdx: index("overage_invoices_org_idx").on(table.organizationId),
  })
);

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type DispatchUsage = typeof dispatchUsage.$inferSelect;
export type NewDispatchUsage = typeof dispatchUsage.$inferInsert;
export type OveragePurchase = typeof overagePurchases.$inferSelect;
export type NewOveragePurchase = typeof overagePurchases.$inferInsert;
export type OverageInvoice = typeof overageInvoices.$inferSelect;
export type NewOverageInvoice = typeof overageInvoices.$inferInsert;
