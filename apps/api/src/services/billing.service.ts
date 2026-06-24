import { and, desc, eq, lt, sql } from "drizzle-orm";
import {
  dispatchUsage,
  organizations,
  overageInvoices,
  plans,
  subscriptions,
} from "@bulk-zap/db";
import type {
  DispatchUsage,
  OverageInvoice,
  Plan,
  Subscription,
} from "@bulk-zap/db";
import { db } from "../db.js";
import { logger } from "../logger.js";

// ---- Period helpers ---------------------------------------------------------

function startOfCalendarMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}
function endOfCalendarMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

type Period = { periodStart: Date; periodEnd: Date };

/**
 * Resolve the active subscription (most recent) for an org.
 */
async function getActiveSubscription(
  orgId: string
): Promise<{ subscription: Subscription; plan: Plan } | null> {
  const [row] = await db
    .select({ subscription: subscriptions, plan: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.organizationId, orgId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * The org's latest subscription row (any status), or null. Used by routes to
 * avoid acting on a stale/cancelled row when an org re-subscribes over time.
 */
export async function getLatestSubscription(
  orgId: string
): Promise<Subscription | null> {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, orgId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * The quota window is the current calendar month. Usage (`dispatch_usage`) is
 * keyed by `(org, periodStart)`, so the window MUST advance predictably for the
 * quota to roll over — it resets on the 1st of each month.
 *
 * We intentionally do NOT key the quota window off the subscription's MP period:
 * the preapproval resource's `date_created` is static, so deriving periodStart
 * from it never advances across renewals and the usage row would be reused
 * forever (quota permanently exhausted after the first month). The subscription's
 * `currentPeriodStart/End` are kept only as MP billing-cycle metadata for display
 * in the billing UI, decoupled from the quota window.
 */
function resolvePeriod(): Period {
  const now = new Date();
  return {
    periodStart: startOfCalendarMonth(now),
    periodEnd: endOfCalendarMonth(now),
  };
}

// ---- Per-message overage pricing -------------------------------------------

/**
 * Price of a single overage message, in (fractional) centavos. Derived from the
 * plan's overage package economics — there's a single source of truth and no
 * extra column: e.g. R$25 / 1.000 disparos => 2.5 centavos por mensagem.
 */
export function perMessageCents(plan: Plan): number {
  if (plan.overagePackageSize <= 0) return 0;
  return plan.overagePackagePriceCents / plan.overagePackageSize;
}

/**
 * Total charge (centavos, rounded) for `count` overage messages on a plan.
 * Computed in one shot to avoid per-message rounding drift.
 */
export function overageChargeCents(plan: Plan, count: number): number {
  if (count <= 0 || plan.overagePackageSize <= 0) return 0;
  return Math.round(
    (count * plan.overagePackagePriceCents) / plan.overagePackageSize
  );
}

/**
 * The org's latest unpaid (pending) overage invoice from a CLOSED period, or
 * null. Used both for the billing gate (credit control) and the UI.
 */
export async function getOpenInvoice(
  orgId: string
): Promise<OverageInvoice | null> {
  const [row] = await db
    .select()
    .from(overageInvoices)
    .where(
      and(
        eq(overageInvoices.organizationId, orgId),
        eq(overageInvoices.status, "pending")
      )
    )
    .orderBy(desc(overageInvoices.periodStart))
    .limit(1);
  return row ?? null;
}

/**
 * Return/create the dispatch_usage row for the current period (calendar month).
 */
export async function getOrCreateCurrentUsage(
  orgId: string
): Promise<DispatchUsage> {
  const period = resolvePeriod();

  const [existing] = await db
    .select()
    .from(dispatchUsage)
    .where(
      and(
        eq(dispatchUsage.organizationId, orgId),
        eq(dispatchUsage.periodStart, period.periodStart)
      )
    )
    .limit(1);
  if (existing) return existing;

  // Upsert to survive concurrent first-dispatch races (unique org+periodStart).
  const [created] = await db
    .insert(dispatchUsage)
    .values({
      organizationId: orgId,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      dispatchCount: 0,
      overageDispatches: 0,
    })
    .onConflictDoNothing({
      target: [dispatchUsage.organizationId, dispatchUsage.periodStart],
    })
    .returning();
  if (created) return created;

  // Lost the race: re-read.
  const [row] = await db
    .select()
    .from(dispatchUsage)
    .where(
      and(
        eq(dispatchUsage.organizationId, orgId),
        eq(dispatchUsage.periodStart, period.periodStart)
      )
    )
    .limit(1);
  return row!;
}

export type CanDispatchResult = { allowed: boolean; reason?: string };

/**
 * Billing gate (SEPARATE from anti-ban warnings). Post-paid model: an org may
 * dispatch when it has an `authorized` subscription. Going over the included
 * quota does NOT block — the excess accrues as per-message overage and is
 * invoiced at period close. The ONLY billing block (besides a missing/inactive
 * subscription) is an UNPAID overage invoice from a previous, closed period:
 * the org must settle last cycle's usage before continuing. This is the credit
 * control for the post-paid model.
 */
export async function canDispatch(orgId: string): Promise<CanDispatchResult> {
  const active = await getActiveSubscription(orgId);
  if (!active) {
    return { allowed: false, reason: "no_subscription" };
  }
  if (active.subscription.status !== "authorized") {
    return {
      allowed: false,
      reason: `subscription_${active.subscription.status}`,
    };
  }

  const openInvoice = await getOpenInvoice(orgId);
  if (openInvoice) {
    return { allowed: false, reason: "overage_invoice_unpaid" };
  }
  return { allowed: true };
}

/**
 * Atomically increment the current-period dispatch counter. The portion that
 * lands beyond the plan's included quota is also tracked in `overageDispatches`
 * so the UI / reports can distinguish included vs paid-extra usage.
 */
export async function recordDispatch(orgId: string, n = 1): Promise<void> {
  const active = await getActiveSubscription(orgId);
  const included = active?.plan.includedDispatches ?? 0;
  const usage = await getOrCreateCurrentUsage(orgId);

  // How many of these n dispatches fall into overage (count beyond `included`).
  const before = usage.dispatchCount;
  const after = before + n;
  const overageDelta = Math.max(0, after - Math.max(included, before));

  await db
    .update(dispatchUsage)
    .set({
      dispatchCount: sql`${dispatchUsage.dispatchCount} + ${n}`,
      overageDispatches: sql`${dispatchUsage.overageDispatches} + ${overageDelta}`,
      updatedAt: new Date(),
    })
    .where(eq(dispatchUsage.id, usage.id));
}

export type BillingStatus = {
  subscription:
    | (Pick<
        Subscription,
        | "id"
        | "status"
        | "mpPreapprovalId"
        | "currentPeriodStart"
        | "currentPeriodEnd"
      > & { plan: Plan })
    | null;
  usage: {
    periodStart: Date;
    periodEnd: Date;
    dispatchCount: number;
    includedDispatches: number;
    /** Mensagens já enviadas além da franquia neste período. */
    overageDispatches: number;
    /** Custo acumulado do excedente deste período, em centavos (será faturado). */
    overageAmountCents: number;
    /** Preço por mensagem excedente, em centavos (pode ser fracionário). */
    perMessageCents: number;
  };
  /** Fatura de excedente em aberto (não paga) de um período fechado, se houver. */
  openInvoice:
    | (Pick<
        OverageInvoice,
        | "id"
        | "periodStart"
        | "periodEnd"
        | "dispatches"
        | "amountCents"
        | "status"
        | "mpInitPoint"
      >)
    | null;
  canDispatch: CanDispatchResult;
};

/**
 * Subscription + plan + usage summary for the billing UI.
 */
export async function getBillingStatus(orgId: string): Promise<BillingStatus> {
  const active = await getActiveSubscription(orgId);
  const usage = await getOrCreateCurrentUsage(orgId);
  const plan = active?.plan ?? null;
  const included = plan?.includedDispatches ?? 0;
  const overageAmountCents = plan
    ? overageChargeCents(plan, usage.overageDispatches)
    : 0;
  const openInvoice = await getOpenInvoice(orgId);
  const gate = await canDispatch(orgId);

  return {
    subscription: active
      ? {
          id: active.subscription.id,
          status: active.subscription.status,
          mpPreapprovalId: active.subscription.mpPreapprovalId,
          currentPeriodStart: active.subscription.currentPeriodStart,
          currentPeriodEnd: active.subscription.currentPeriodEnd,
          plan: active.plan,
        }
      : null,
    usage: {
      periodStart: usage.periodStart,
      periodEnd: usage.periodEnd,
      dispatchCount: usage.dispatchCount,
      includedDispatches: included,
      overageDispatches: usage.overageDispatches,
      overageAmountCents,
      perMessageCents: plan ? perMessageCents(plan) : 0,
    },
    openInvoice: openInvoice
      ? {
          id: openInvoice.id,
          periodStart: openInvoice.periodStart,
          periodEnd: openInvoice.periodEnd,
          dispatches: openInvoice.dispatches,
          amountCents: openInvoice.amountCents,
          status: openInvoice.status,
          mpInitPoint: openInvoice.mpInitPoint,
        }
      : null,
    canDispatch: gate,
  };
}

// ---- Webhook sync -----------------------------------------------------------

// Loose shape of a Mercado Pago webhook notification body.
export type MpWebhookPayload = {
  type?: string;
  action?: string;
  data?: { id?: string };
  [k: string]: unknown;
};

const MP_STATUS_MAP: Record<string, string> = {
  pending: "pending",
  authorized: "authorized",
  paused: "paused",
  cancelled: "cancelled",
};

/**
 * Update subscription status/period or credit an overage purchase from an MP
 * webhook. The route already validated the signature and fetched the resource.
 *
 * @param payload  raw webhook body (carries `type`/`data.id`)
 * @param resource the resolved MP resource (preapproval or payment) fetched by
 *                 the route via the SDK, used to read authoritative status.
 */
export async function syncFromWebhook(
  payload: MpWebhookPayload,
  resource?: Record<string, unknown> | null
): Promise<void> {
  const type = payload.type ?? "";

  if (type === "subscription_preapproval" || type === "preapproval") {
    await syncPreapproval(payload, resource);
    return;
  }
  if (type === "payment") {
    await syncPayment(payload, resource);
    return;
  }
  logger.debug({ type }, "MP webhook: unhandled type, ignored");
}

async function syncPreapproval(
  payload: MpWebhookPayload,
  resource?: Record<string, unknown> | null
): Promise<void> {
  const mpId = (resource?.id as string | undefined) ?? payload.data?.id;
  if (!mpId) {
    logger.warn({ payload }, "MP preapproval webhook missing id");
    return;
  }

  const rawStatus = (resource?.status as string | undefined) ?? "";
  const status = MP_STATUS_MAP[rawStatus];

  const set: Partial<Subscription> = { updatedAt: new Date() };
  if (status) set.status = status;

  const nextPaymentDate = resource?.next_payment_date as string | undefined;
  const dateCreated = resource?.date_created as string | undefined;
  if (status === "authorized") {
    if (dateCreated) set.currentPeriodStart = new Date(dateCreated);
    if (nextPaymentDate) set.currentPeriodEnd = new Date(nextPaymentDate);
  }

  // Match by mpPreapprovalId; fall back to external_reference (org id) for the
  // initial sync before we stored the preapproval id.
  const updated = await db
    .update(subscriptions)
    .set(set)
    .where(eq(subscriptions.mpPreapprovalId, mpId))
    .returning();

  if (updated.length === 0) {
    const orgId = resource?.external_reference as string | undefined;
    if (orgId) {
      await db
        .update(subscriptions)
        .set({ ...set, mpPreapprovalId: mpId })
        .where(
          and(
            eq(subscriptions.organizationId, orgId),
            eq(subscriptions.status, "pending")
          )
        );
    } else {
      logger.warn({ mpId }, "MP preapproval webhook: no matching subscription");
    }
  }
}

async function syncPayment(
  payload: MpWebhookPayload,
  resource?: Record<string, unknown> | null
): Promise<void> {
  const paymentId = (resource?.id as string | number | undefined) ?? payload.data?.id;
  if (!paymentId) {
    logger.warn({ payload }, "MP payment webhook missing id");
    return;
  }
  const status = (resource?.status as string | undefined) ?? "";
  const externalReference = resource?.external_reference as string | undefined;

  // Post-paid overage invoices are encoded as "overage_invoice:<invoiceId>".
  if (!externalReference?.startsWith("overage_invoice:")) {
    logger.debug(
      { paymentId, externalReference },
      "MP payment webhook: not an overage invoice"
    );
    return;
  }
  const invoiceId = externalReference.split(":")[1];
  if (!invoiceId) {
    logger.warn({ externalReference }, "MP payment webhook: malformed invoice reference");
    return;
  }

  const mpPaymentId = String(paymentId);
  const [invoice] = await db
    .select()
    .from(overageInvoices)
    .where(eq(overageInvoices.id, invoiceId))
    .limit(1);
  if (!invoice) {
    logger.warn({ invoiceId, mpPaymentId }, "MP payment webhook: invoice not found");
    return;
  }

  // Idempotent: an approved invoice stays paid; record the payment id once.
  if (invoice.status === "paid") return;

  const nextStatus = status === "approved" ? "paid" : "pending";
  await db
    .update(overageInvoices)
    .set({ status: nextStatus, mpPaymentId, updatedAt: new Date() })
    .where(eq(overageInvoices.id, invoice.id));
}

// ---- Period close / invoicing ----------------------------------------------

/**
 * Find closed-period usage rows that have overage but no invoice yet. Used by
 * the cron to invoice the just-closed cycle. Returns the org + period + count.
 */
export async function listClosedPeriodsNeedingInvoice(now: Date): Promise<
  { organizationId: string; periodStart: Date; periodEnd: Date; overageDispatches: number }[]
> {
  const rows = await db
    .select({
      organizationId: dispatchUsage.organizationId,
      periodStart: dispatchUsage.periodStart,
      periodEnd: dispatchUsage.periodEnd,
      overageDispatches: dispatchUsage.overageDispatches,
      invoiceId: overageInvoices.id,
    })
    .from(dispatchUsage)
    .leftJoin(
      overageInvoices,
      and(
        eq(overageInvoices.organizationId, dispatchUsage.organizationId),
        eq(overageInvoices.periodStart, dispatchUsage.periodStart)
      )
    )
    .where(
      and(
        lt(dispatchUsage.periodEnd, now),
        sql`${dispatchUsage.overageDispatches} > 0`,
        sql`${overageInvoices.id} IS NULL`
      )
    );
  return rows.map((r) => ({
    organizationId: r.organizationId,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    overageDispatches: r.overageDispatches,
  }));
}

/**
 * Create (idempotently) the overage invoice row for a closed period. The MP
 * Checkout preference is created by the caller (cron / pay route) and attached
 * via {@link attachInvoiceCheckout}. Returns the invoice, or null if there is
 * no plan to price the overage. Safe against the unique (org, periodStart).
 */
export async function createOverageInvoiceForPeriod(input: {
  organizationId: string;
  periodStart: Date;
  periodEnd: Date;
  overageDispatches: number;
}): Promise<OverageInvoice | null> {
  const active = await getActiveSubscription(input.organizationId);
  const plan = active?.plan ?? null;
  if (!plan) return null;
  const amountCents = overageChargeCents(plan, input.overageDispatches);
  if (amountCents <= 0) return null;

  const [created] = await db
    .insert(overageInvoices)
    .values({
      organizationId: input.organizationId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      dispatches: input.overageDispatches,
      amountCents,
      status: "pending",
    })
    .onConflictDoNothing({
      target: [overageInvoices.organizationId, overageInvoices.periodStart],
    })
    .returning();
  if (created) return created;

  // Lost the race / already existed: re-read.
  const [existing] = await db
    .select()
    .from(overageInvoices)
    .where(
      and(
        eq(overageInvoices.organizationId, input.organizationId),
        eq(overageInvoices.periodStart, input.periodStart)
      )
    )
    .limit(1);
  return existing ?? null;
}

/**
 * Persist the MP Checkout preference id + init_point on an invoice.
 */
export async function attachInvoiceCheckout(
  invoiceId: string,
  mpPreferenceId: string,
  mpInitPoint: string
): Promise<void> {
  await db
    .update(overageInvoices)
    .set({ mpPreferenceId, mpInitPoint, updatedAt: new Date() })
    .where(eq(overageInvoices.id, invoiceId));
}

/**
 * Load an org-owned invoice by id (or null). Used by the pay route.
 */
export async function getOwnedInvoice(
  invoiceId: string,
  organizationId: string
): Promise<OverageInvoice | null> {
  const [row] = await db
    .select()
    .from(overageInvoices)
    .where(
      and(
        eq(overageInvoices.id, invoiceId),
        eq(overageInvoices.organizationId, organizationId)
      )
    )
    .limit(1);
  return row ?? null;
}

/**
 * List the org's overage invoices, most recent first.
 */
export async function listInvoices(orgId: string): Promise<OverageInvoice[]> {
  return await db
    .select()
    .from(overageInvoices)
    .where(eq(overageInvoices.organizationId, orgId))
    .orderBy(desc(overageInvoices.periodStart));
}

/**
 * Guard: confirm an org exists (used by routes to fail fast on bad context).
 */
export async function organizationExists(orgId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return Boolean(row);
}
