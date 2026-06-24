import { and, desc, eq, sql } from "drizzle-orm";
import {
  dispatchUsage,
  organizations,
  overagePurchases,
  plans,
  subscriptions,
} from "@bulk-zap/db";
import type { DispatchUsage, Plan, Subscription } from "@bulk-zap/db";
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

/**
 * Sum overage dispatches purchased (status approved/paid) for an org within the period.
 */
async function purchasedOverageForPeriod(
  orgId: string,
  period: Period
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${overagePurchases.dispatches}), 0)::int`,
    })
    .from(overagePurchases)
    .where(
      and(
        eq(overagePurchases.organizationId, orgId),
        eq(overagePurchases.status, "approved"),
        sql`${overagePurchases.createdAt} >= ${period.periodStart}`,
        sql`${overagePurchases.createdAt} < ${period.periodEnd}`
      )
    );
  return row?.total ?? 0;
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
 * Billing gate (SEPARATE from anti-ban warnings). An org may dispatch only if:
 *  - it has a subscription with status = 'authorized', AND
 *  - current-period dispatchCount < plan.includedDispatches + purchased overage.
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

  const period = resolvePeriod();
  const usage = await getOrCreateCurrentUsage(orgId);
  const purchasedOverage = await purchasedOverageForPeriod(orgId, period);
  const quota = active.plan.includedDispatches + purchasedOverage;

  if (usage.dispatchCount >= quota) {
    return { allowed: false, reason: "quota_exceeded" };
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
    purchasedOverage: number;
    quota: number;
    remaining: number;
  };
  canDispatch: CanDispatchResult;
};

/**
 * Subscription + plan + usage summary for the billing UI.
 */
export async function getBillingStatus(orgId: string): Promise<BillingStatus> {
  const active = await getActiveSubscription(orgId);
  const period = resolvePeriod();
  const usage = await getOrCreateCurrentUsage(orgId);
  const purchasedOverage = await purchasedOverageForPeriod(orgId, period);
  const included = active?.plan.includedDispatches ?? 0;
  const quota = included + purchasedOverage;
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
      purchasedOverage,
      quota,
      remaining: Math.max(0, quota - usage.dispatchCount),
    },
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

  // Only overage one-off payments are encoded as "overage:<orgId>:<dispatches>".
  if (!externalReference?.startsWith("overage:")) {
    logger.debug({ paymentId, externalReference }, "MP payment webhook: not an overage purchase");
    return;
  }
  const parts = externalReference.split(":");
  const orgId = parts[1];
  const dispatches = Number(parts[2] ?? "0");
  if (!orgId || !dispatches) {
    logger.warn({ externalReference }, "MP payment webhook: malformed overage reference");
    return;
  }

  const mappedStatus = status === "approved" ? "approved" : status || "pending";
  const transactionAmount = resource?.transaction_amount as number | undefined;
  const amountCents = transactionAmount ? Math.round(transactionAmount * 100) : 0;
  const mpPaymentId = String(paymentId);

  // Idempotent on mpPaymentId.
  const [existing] = await db
    .select()
    .from(overagePurchases)
    .where(eq(overagePurchases.mpPaymentId, mpPaymentId))
    .limit(1);

  if (existing) {
    if (existing.status !== mappedStatus) {
      await db
        .update(overagePurchases)
        .set({ status: mappedStatus })
        .where(eq(overagePurchases.id, existing.id));
    }
    return;
  }

  await db.insert(overagePurchases).values({
    organizationId: orgId,
    dispatches,
    amountCents,
    mpPaymentId,
    status: mappedStatus,
  });
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
