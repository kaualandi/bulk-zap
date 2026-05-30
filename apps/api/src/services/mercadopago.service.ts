import {
  MercadoPagoConfig,
  Payment,
  PreApproval,
  Preference,
  WebhookSignatureValidator,
  InvalidWebhookSignatureError,
} from "mercadopago";
import type { Plan } from "@bulk-zap/db";
import { env } from "../env.js";
import { logger } from "../logger.js";

// Thin wrapper around the Mercado Pago Node SDK. All money in `plans` is stored
// in centavos (BRL); MP expects reais as a decimal `transaction_amount` / `unit_price`,
// so we divide by 100 at the boundary.

let config: MercadoPagoConfig | null = null;
function getConfig(): MercadoPagoConfig {
  if (!env.MP_ACCESS_TOKEN) {
    throw new Error("MP_ACCESS_TOKEN not configured");
  }
  if (!config) {
    config = new MercadoPagoConfig({ accessToken: env.MP_ACCESS_TOKEN });
  }
  return config;
}

export function isMercadoPagoConfigured(): boolean {
  return Boolean(env.MP_ACCESS_TOKEN);
}

export type CreateSubscriptionResult = {
  preapprovalId: string;
  initPoint: string;
};

/**
 * Create a recurring subscription (PreApproval / assinatura) for an org.
 * Returns the MP preapproval id + the init_point the buyer must visit to authorize.
 */
export async function createSubscription(
  orgId: string,
  plan: Plan,
  payerEmail: string
): Promise<CreateSubscriptionResult> {
  const client = new PreApproval(getConfig());
  const backUrl = `${env.APP_URL}/billing`;

  const res = await client.create({
    body: {
      reason: plan.name,
      external_reference: orgId,
      payer_email: payerEmail,
      back_url: backUrl,
      // Charge the buyer immediately upon authorization.
      status: "pending",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: plan.monthlyPriceCents / 100,
        currency_id: "BRL",
      },
      // Link to a preapproval plan template when one exists at MP.
      ...(plan.mpPreapprovalPlanId
        ? { preapproval_plan_id: plan.mpPreapprovalPlanId }
        : {}),
    },
  });

  if (!res.id || !res.init_point) {
    throw new Error("Mercado Pago did not return an id/init_point");
  }
  return { preapprovalId: res.id, initPoint: res.init_point };
}

export async function getPreapproval(mpPreapprovalId: string) {
  const client = new PreApproval(getConfig());
  return await client.get({ id: mpPreapprovalId });
}

export async function getPayment(paymentId: string) {
  const client = new Payment(getConfig());
  return await client.get({ id: paymentId });
}

export async function cancelSubscription(mpPreapprovalId: string) {
  const client = new PreApproval(getConfig());
  return await client.update({
    id: mpPreapprovalId,
    body: { status: "cancelled" },
  });
}

export async function pauseSubscription(mpPreapprovalId: string) {
  const client = new PreApproval(getConfig());
  return await client.update({
    id: mpPreapprovalId,
    body: { status: "paused" },
  });
}

export type CreateOveragePaymentResult = {
  preferenceId: string;
  initPoint: string;
};

/**
 * Create a one-off Checkout Pro Preference for an overage package purchase.
 * `external_reference` encodes org + package qty so the webhook can credit it:
 *   "overage:<orgId>:<dispatches>"
 */
export async function createOveragePayment(
  orgId: string,
  pkg: { dispatches: number; amountCents: number }
): Promise<CreateOveragePaymentResult> {
  const client = new Preference(getConfig());
  const externalReference = `overage:${orgId}:${pkg.dispatches}`;

  const res = await client.create({
    body: {
      external_reference: externalReference,
      back_urls: {
        success: `${env.APP_URL}/billing`,
        pending: `${env.APP_URL}/billing`,
        failure: `${env.APP_URL}/billing`,
      },
      auto_return: "approved",
      metadata: { kind: "overage", organizationId: orgId, dispatches: pkg.dispatches },
      items: [
        {
          id: `overage-${pkg.dispatches}`,
          title: `Pacote de ${pkg.dispatches} disparos`,
          quantity: 1,
          currency_id: "BRL",
          unit_price: pkg.amountCents / 100,
        },
      ],
    },
  });

  if (!res.id || !res.init_point) {
    throw new Error("Mercado Pago did not return a preference id/init_point");
  }
  return { preferenceId: res.id, initPoint: res.init_point };
}

/**
 * Validate the x-signature / x-request-id HMAC on an incoming webhook request.
 * If MP_WEBHOOK_SECRET is empty we skip verification and warn — but ONLY in dev.
 * In production an unsigned webhook would let anyone credit overage / flip a
 * subscription, so we reject it instead.
 * Returns true when the request is trusted, false when it must be rejected.
 */
export function verifyWebhookSignature(req: Request): boolean {
  if (!env.MP_WEBHOOK_SECRET) {
    if (env.NODE_ENV === "production") {
      logger.error(
        "MP webhook rejected: MP_WEBHOOK_SECRET não configurado em produção"
      );
      return false;
    }
    logger.warn(
      "MP webhook signature verification skipped: MP_WEBHOOK_SECRET empty (somente dev)"
    );
    return true;
  }

  const url = new URL(req.url);
  const dataId = url.searchParams.get("data.id") ?? url.searchParams.get("id");

  try {
    WebhookSignatureValidator.validate({
      xSignature: req.headers.get("x-signature"),
      xRequestId: req.headers.get("x-request-id"),
      dataId,
      secret: env.MP_WEBHOOK_SECRET,
      toleranceSeconds: 300,
    });
    return true;
  } catch (err) {
    if (err instanceof InvalidWebhookSignatureError) {
      logger.warn(
        { reason: err.reason, requestId: err.requestId },
        "MP webhook signature invalid"
      );
    } else {
      logger.warn({ err }, "MP webhook signature validation error");
    }
    return false;
  }
}
