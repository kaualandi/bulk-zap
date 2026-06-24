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

// Ledger imutável de compras de excedente (manual ou auto-recarga). Cada compra
// aprovada CREDITA o saldo em `credit_accounts.balance`. status: pending|approved.
export const overagePurchases = pgTable(
  "overage_purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dispatches: integer("dispatches").notNull(),
    amountCents: integer("amount_cents").notNull(),
    // Mercado Pago payment id for the one-off package purchase. Unique: âncora de
    // idempotência pra creditar o saldo exatamente uma vez por pagamento.
    mpPaymentId: text("mp_payment_id").unique(),
    // "manual" (Checkout Pro) | "auto_recharge" (cartão salvo).
    source: text("source").notNull().default("manual"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdx: index("overage_purchases_org_idx").on(table.organizationId),
  })
);

// Conta de créditos por org. `balance` é o saldo de disparos excedentes
// disponíveis e NÃO expira (substitui o pacote por período). Carrega também a
// config de auto-recarga e a referência do cartão salvo no Mercado Pago.
export const creditAccounts = pgTable("credit_accounts", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0),

  // Auto-recarga (opt-in): quando balance < threshold, cobra o cartão salvo e
  // credita `packageQty` pacotes.
  autoRechargeEnabled: boolean("auto_recharge_enabled").notNull().default(false),
  autoRechargeThreshold: integer("auto_recharge_threshold"),
  autoRechargePackageQty: integer("auto_recharge_package_qty")
    .notNull()
    .default(1),
  // Evita enfileirar duas recargas concorrentes (setado ao agendar, limpo no job).
  rechargePending: boolean("recharge_pending").notNull().default(false),

  // Cartão salvo (Mercado Pago Customers/Cards) para card-on-file.
  mpCustomerId: text("mp_customer_id"),
  mpCardId: text("mp_card_id"),
  cardLast4: text("card_last4"),
  cardBrand: text("card_brand"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type DispatchUsage = typeof dispatchUsage.$inferSelect;
export type NewDispatchUsage = typeof dispatchUsage.$inferInsert;
export type OveragePurchase = typeof overagePurchases.$inferSelect;
export type NewOveragePurchase = typeof overagePurchases.$inferInsert;
export type CreditAccount = typeof creditAccounts.$inferSelect;
export type NewCreditAccount = typeof creditAccounts.$inferInsert;
