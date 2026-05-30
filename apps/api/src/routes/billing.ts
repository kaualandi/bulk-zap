import { Elysia, t } from "elysia";
import { and, asc, eq } from "drizzle-orm";
import { plans, subscriptions } from "@bulk-zap/db";
import { db } from "../db.js";
import { logger } from "../logger.js";
import { authPlugin } from "../lib/auth-middleware.js";
import {
  canDispatch,
  getBillingStatus,
  getLatestSubscription,
  syncFromWebhook,
  type MpWebhookPayload,
} from "../services/billing.service.js";
import {
  cancelSubscription,
  createOveragePayment,
  createSubscription,
  getPayment,
  getPreapproval,
  isMercadoPagoConfigured,
  verifyWebhookSignature,
} from "../services/mercadopago.service.js";

/**
 * Error thrown when Mercado Pago is not configured (MP_ACCESS_TOKEN empty).
 * Maps to 503 so the frontend can hide billing actions gracefully.
 */
export class MercadoPagoUnavailableError extends Error {
  constructor() {
    super("Mercado Pago não configurado");
    this.name = "MercadoPagoUnavailableError";
  }
}

/**
 * Billing routes.
 *
 * AUTH ASSUMPTION (wired by integration via authPlugin):
 *   Protected routes use the `auth: true` macro from `../lib/auth-middleware.js`,
 *   which derives `{ user, session, organizationId }` onto the handler context.
 *   We read `organizationId` directly. The macro returns 401 when unauthenticated.
 *
 * The /billing/webhook route is intentionally PUBLIC (no `auth: true`): Mercado
 * Pago calls it server-to-server. It validates the x-signature HMAC instead.
 */
export const billingRoutes = new Elysia({ prefix: "/billing" })
  .use(authPlugin)

  // List active plans (still session-scoped so only logged-in users see pricing).
  .get(
    "/plans",
    async () => {
      const rows = await db
        .select()
        .from(plans)
        .where(eq(plans.active, true))
        .orderBy(asc(plans.monthlyPriceCents));
      return rows;
    },
    { auth: true }
  )

  // Current org subscription + usage summary.
  .get(
    "/status",
    async ({ organizationId }) => {
      const status = await getBillingStatus(organizationId);
      return { ...status, mercadoPagoConfigured: isMercadoPagoConfigured() };
    },
    { auth: true }
  )

  // Create a recurring subscription (MP preapproval). Returns init_point to redirect.
  .post(
    "/subscribe",
    async ({ organizationId, user, body, set }) => {
      if (!isMercadoPagoConfigured()) throw new MercadoPagoUnavailableError();

      // Guard against re-subscribing to the SAME authorized plan (e.g. a
      // double-click or a direct API call). Switching to a DIFFERENT plan is
      // allowed and creates a new preapproval. A lingering `pending` is fine to
      // supersede (the buyer may be retrying an unfinished checkout).
      const existing = await getLatestSubscription(organizationId);
      if (
        existing &&
        existing.status === "authorized" &&
        existing.planId === body.planId
      ) {
        set.status = 409;
        return { error: "already_subscribed" };
      }

      const [plan] = await db
        .select()
        .from(plans)
        .where(and(eq(plans.id, body.planId), eq(plans.active, true)))
        .limit(1);
      if (!plan) return new Response("plan not found", { status: 404 });

      const { preapprovalId, initPoint } = await createSubscription(
        organizationId,
        plan,
        user.email
      );

      // Record a pending subscription so the webhook can flip it to authorized.
      await db.insert(subscriptions).values({
        organizationId,
        planId: plan.id,
        status: "pending",
        mpPreapprovalId: preapprovalId,
      });

      return { initPoint, preapprovalId };
    },
    { auth: true, body: t.Object({ planId: t.String() }) }
  )

  // Cancel the org's active subscription at Mercado Pago and locally.
  .post(
    "/cancel",
    async ({ organizationId, set }) => {
      // Cancel the latest subscription, not an arbitrary row.
      const sub = await getLatestSubscription(organizationId);
      if (!sub) return new Response("no subscription", { status: 404 });
      if (sub.status === "cancelled") {
        set.status = 409;
        return { error: "already_cancelled" };
      }

      if (sub.mpPreapprovalId && isMercadoPagoConfigured()) {
        await cancelSubscription(sub.mpPreapprovalId);
      }
      await db
        .update(subscriptions)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(subscriptions.id, sub.id));

      return { ok: true };
    },
    { auth: true }
  )

  // Buy an overage package (one-off Checkout Pro). Returns checkout url.
  .post(
    "/overage",
    async ({ organizationId, body }) => {
      if (!isMercadoPagoConfigured()) throw new MercadoPagoUnavailableError();

      // Resolve unit pricing from the org's plan; fall back to the cheapest plan.
      const [sub] = await db
        .select({ plan: plans })
        .from(subscriptions)
        .innerJoin(plans, eq(subscriptions.planId, plans.id))
        .where(eq(subscriptions.organizationId, organizationId))
        .limit(1);

      let pricingPlan = sub?.plan;
      if (!pricingPlan) {
        const [cheapest] = await db
          .select()
          .from(plans)
          .where(eq(plans.active, true))
          .orderBy(asc(plans.monthlyPriceCents))
          .limit(1);
        pricingPlan = cheapest;
      }
      if (!pricingPlan) return new Response("no plan to price overage", { status: 400 });

      const dispatches = body.packageQty * pricingPlan.overagePackageSize;
      const amountCents = body.packageQty * pricingPlan.overagePackagePriceCents;

      const { initPoint, preferenceId } = await createOveragePayment(
        organizationId,
        { dispatches, amountCents }
      );

      return { initPoint, preferenceId, dispatches, amountCents };
    },
    { auth: true, body: t.Object({ packageQty: t.Integer({ minimum: 1, maximum: 100 }) }) }
  )

  // Mercado Pago webhook. PUBLIC: validates HMAC signature, then syncs.
  // Responds 200 fast; resource fetch + DB sync happen before responding but
  // are kept lightweight (single MP get + a couple of writes).
  .post("/webhook", async ({ request, body, set }) => {
    if (!verifyWebhookSignature(request)) {
      set.status = 401;
      return { error: "invalid_signature" };
    }

    const payload = (body ?? {}) as MpWebhookPayload;
    try {
      let resource: Record<string, unknown> | null = null;
      const id = payload.data?.id;
      const type = payload.type ?? "";

      if (id && isMercadoPagoConfigured()) {
        if (type === "subscription_preapproval" || type === "preapproval") {
          resource = (await getPreapproval(id)) as unknown as Record<string, unknown>;
        } else if (type === "payment") {
          resource = (await getPayment(id)) as unknown as Record<string, unknown>;
        }
      }
      await syncFromWebhook(payload, resource);
    } catch (err) {
      // Never 500 to MP — that triggers aggressive retries. Log and 200.
      logger.error({ err, payload }, "MP webhook sync failed");
    }
    return { received: true };
  })

  .onError(({ error, set }) => {
    if (error instanceof MercadoPagoUnavailableError) {
      set.status = 503;
      return { error: "mercadopago_unavailable", message: error.message };
    }
  });

// Re-export so the worker / other services can reuse the gate check.
export { canDispatch };
