import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import {
  creditAccounts,
  dispatchUsage,
  organizations,
  overagePurchases,
  plans,
  subscriptions,
} from "@bulk-zap/db";
import type {
  CreditAccount,
  DispatchUsage,
  Plan,
  Subscription,
} from "@bulk-zap/db";
import { db } from "../db.js";
import { logger } from "../logger.js";
import { autoRechargeQueue } from "../jobs/queue.js";

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

/** The plan of the org's active subscription, or null. */
export async function getOrgPlan(orgId: string): Promise<Plan | null> {
  const active = await getActiveSubscription(orgId);
  return active?.plan ?? null;
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

// ---- Credit balance (non-expiring) -----------------------------------------

/**
 * Return/create the org's credit account. `balance` is the pool of overage
 * dispatches available beyond the monthly franchise — it does NOT expire.
 */
export async function getOrCreateCreditAccount(
  orgId: string
): Promise<CreditAccount> {
  const [existing] = await db
    .select()
    .from(creditAccounts)
    .where(eq(creditAccounts.organizationId, orgId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(creditAccounts)
    .values({ organizationId: orgId, balance: 0 })
    .onConflictDoNothing({ target: creditAccounts.organizationId })
    .returning();
  if (created) return created;

  const [row] = await db
    .select()
    .from(creditAccounts)
    .where(eq(creditAccounts.organizationId, orgId))
    .limit(1);
  return row!;
}

/**
 * Atomically add `dispatches` credits to the org's balance (e.g. when a purchase
 * is approved). Lazily creates the account.
 */
export async function addCredits(
  orgId: string,
  dispatches: number
): Promise<void> {
  if (dispatches <= 0) return;
  await getOrCreateCreditAccount(orgId);
  await db
    .update(creditAccounts)
    .set({
      balance: sql`${creditAccounts.balance} + ${dispatches}`,
      updatedAt: new Date(),
    })
    .where(eq(creditAccounts.organizationId, orgId));
}

/** Persist the org's auto-recharge configuration. */
export async function setAutoRecharge(
  orgId: string,
  cfg: { enabled: boolean; threshold: number | null; packageQty: number }
): Promise<void> {
  await getOrCreateCreditAccount(orgId);
  await db
    .update(creditAccounts)
    .set({
      autoRechargeEnabled: cfg.enabled,
      autoRechargeThreshold: cfg.threshold,
      autoRechargePackageQty: cfg.packageQty,
      updatedAt: new Date(),
    })
    .where(eq(creditAccounts.organizationId, orgId));
}

/** Persist the saved card (Mercado Pago Customers/Cards) on the credit account. */
export async function setSavedCard(
  orgId: string,
  card: {
    mpCustomerId: string;
    mpCardId: string;
    cardLast4: string;
    cardBrand: string;
  }
): Promise<void> {
  await getOrCreateCreditAccount(orgId);
  await db
    .update(creditAccounts)
    .set({ ...card, updatedAt: new Date() })
    .where(eq(creditAccounts.organizationId, orgId));
}

/** Forget the saved card (keeps the MP customer id for reuse). */
export async function clearSavedCard(orgId: string): Promise<void> {
  await db
    .update(creditAccounts)
    .set({
      mpCardId: null,
      cardLast4: null,
      cardBrand: null,
      autoRechargeEnabled: false,
      updatedAt: new Date(),
    })
    .where(eq(creditAccounts.organizationId, orgId));
}

/**
 * Enqueue an auto-recharge if the org is below its threshold, has a saved card,
 * and isn't already recharging. The atomic UPDATE...WHERE...RETURNING is the lock:
 * it flips `rechargePending` to true ONLY when every condition holds, so at most
 * one job is enqueued per low-balance episode (BullMQ jobId dedups further).
 */
async function maybeTriggerAutoRecharge(orgId: string): Promise<void> {
  const claimed = await db
    .update(creditAccounts)
    .set({ rechargePending: true, updatedAt: new Date() })
    .where(
      and(
        eq(creditAccounts.organizationId, orgId),
        eq(creditAccounts.autoRechargeEnabled, true),
        eq(creditAccounts.rechargePending, false),
        isNotNull(creditAccounts.mpCardId),
        isNotNull(creditAccounts.autoRechargeThreshold),
        sql`${creditAccounts.balance} < ${creditAccounts.autoRechargeThreshold}`
      )
    )
    .returning({ organizationId: creditAccounts.organizationId });
  if (claimed.length === 0) return;

  await autoRechargeQueue
    .add(
      "recharge",
      { organizationId: orgId },
      { jobId: `recharge:${orgId}`, removeOnComplete: true, removeOnFail: 50 }
    )
    .catch(async (err) => {
      logger.error({ err, orgId }, "failed to enqueue auto-recharge; releasing lock");
      await db
        .update(creditAccounts)
        .set({ rechargePending: false, updatedAt: new Date() })
        .where(eq(creditAccounts.organizationId, orgId));
    });
}

/** Release the auto-recharge lock (called by the job when it finishes). */
export async function releaseRechargeLock(orgId: string): Promise<void> {
  await db
    .update(creditAccounts)
    .set({ rechargePending: false, updatedAt: new Date() })
    .where(eq(creditAccounts.organizationId, orgId));
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
 * Billing gate (SEPARATE from anti-ban warnings). Pre-paid credit model: an org
 * may dispatch only if it has an `authorized` subscription AND either it's still
 * within the monthly franchise (`dispatchCount < includedDispatches`) OR it has a
 * positive non-expiring credit balance to cover the excess.
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

  const usage = await getOrCreateCurrentUsage(orgId);
  if (usage.dispatchCount < active.plan.includedDispatches) {
    return { allowed: true };
  }

  const account = await getOrCreateCreditAccount(orgId);
  if (account.balance > 0) {
    return { allowed: true };
  }
  return { allowed: false, reason: "quota_exceeded" };
}

/**
 * Atomically increment the current-period dispatch counter and debit credits for
 * the portion that lands beyond the plan's franchise. The overage count is also
 * tracked in `overageDispatches` for the UI/reports. Triggers auto-recharge when
 * the resulting balance dips below the configured threshold.
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

  // Debit non-expiring credits for the overage portion (floored at 0).
  if (overageDelta > 0) {
    await db
      .update(creditAccounts)
      .set({
        balance: sql`GREATEST(${creditAccounts.balance} - ${overageDelta}, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(creditAccounts.organizationId, orgId));
    await maybeTriggerAutoRecharge(orgId);
  }
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
  };
  /** Saldo de créditos de excedente disponíveis (não expira). */
  creditBalance: number;
  /** Cartão salvo (card-on-file), se houver. */
  card: { last4: string; brand: string } | null;
  autoRecharge: {
    enabled: boolean;
    threshold: number | null;
    packageQty: number;
  };
  canDispatch: CanDispatchResult;
};

/**
 * Subscription + plan + usage summary for the billing UI.
 */
export async function getBillingStatus(orgId: string): Promise<BillingStatus> {
  const active = await getActiveSubscription(orgId);
  const usage = await getOrCreateCurrentUsage(orgId);
  const account = await getOrCreateCreditAccount(orgId);
  const included = active?.plan.includedDispatches ?? 0;
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
    },
    creditBalance: account.balance,
    card:
      account.mpCardId && account.cardLast4 && account.cardBrand
        ? { last4: account.cardLast4, brand: account.cardBrand }
        : null,
    autoRecharge: {
      enabled: account.autoRechargeEnabled,
      threshold: account.autoRechargeThreshold,
      packageQty: account.autoRechargePackageQty,
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

  const transactionAmount = resource?.transaction_amount as number | undefined;
  const amountCents = transactionAmount ? Math.round(transactionAmount * 100) : 0;
  const mpPaymentId = String(paymentId);

  if (status === "approved") {
    await creditApprovedPurchase({
      orgId,
      dispatches,
      amountCents,
      mpPaymentId,
      source: "manual",
    });
    return;
  }

  // Non-approved: record a pending ledger row (no credit) if none exists yet.
  await db
    .insert(overagePurchases)
    .values({
      organizationId: orgId,
      dispatches,
      amountCents,
      mpPaymentId,
      status: status || "pending",
    })
    .onConflictDoNothing({ target: overagePurchases.mpPaymentId });
}

/**
 * Idempotently mark an overage purchase approved and credit the balance EXACTLY
 * once — whether the row already existed (pending → approved) or is brand new,
 * and regardless of which path (webhook vs auto-recharge job) gets here first.
 * Keyed on the unique `mpPaymentId`.
 */
export async function creditApprovedPurchase(input: {
  orgId: string;
  dispatches: number;
  amountCents: number;
  mpPaymentId: string;
  source: "manual" | "auto_recharge";
}): Promise<void> {
  // Flip an existing not-yet-approved row to approved (credits the row's amount).
  const flipped = await db
    .update(overagePurchases)
    .set({ status: "approved" })
    .where(
      and(
        eq(overagePurchases.mpPaymentId, input.mpPaymentId),
        sql`${overagePurchases.status} <> 'approved'`
      )
    )
    .returning({ dispatches: overagePurchases.dispatches });
  if (flipped.length > 0) {
    await addCredits(input.orgId, flipped[0]!.dispatches);
    return;
  }

  // No row to flip: either none yet (insert + credit) or already approved (no-op).
  const inserted = await db
    .insert(overagePurchases)
    .values({
      organizationId: input.orgId,
      dispatches: input.dispatches,
      amountCents: input.amountCents,
      mpPaymentId: input.mpPaymentId,
      source: input.source,
      status: "approved",
    })
    .onConflictDoNothing({ target: overagePurchases.mpPaymentId })
    .returning({ id: overagePurchases.id });
  if (inserted.length > 0) {
    await addCredits(input.orgId, input.dispatches);
  }
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
