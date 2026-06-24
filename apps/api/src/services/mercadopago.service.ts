import {
  MercadoPagoConfig,
  CardToken,
  Customer,
  CustomerCard,
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

// ---- Card-on-file (saved card for auto-recharge) ---------------------------

export type SavedCard = {
  customerId: string;
  cardId: string;
  last4: string;
  brand: string;
};

/**
 * Save a card (token from the frontend MP tokenization) to a Mercado Pago
 * Customer for this org, so it can be charged later without the buyer present.
 * Reuses an existing customer for the email when one exists.
 */
export async function saveCardForOrg(input: {
  email: string;
  cardToken: string;
  existingCustomerId?: string | null;
}): Promise<SavedCard> {
  const cfg = getConfig();
  let customerId = input.existingCustomerId ?? null;

  if (!customerId) {
    try {
      const found = await new Customer(cfg).search({
        options: { email: input.email },
      });
      customerId = found.results?.[0]?.id ?? null;
    } catch (err) {
      logger.warn({ err }, "MP customer search failed; will create a new one");
    }
  }
  if (!customerId) {
    const created = await new Customer(cfg).create({
      body: { email: input.email },
    });
    customerId = created.id ?? null;
  }
  if (!customerId) throw new Error("Mercado Pago customer could not be resolved");

  const card = await new CustomerCard(cfg).create({
    customerId,
    body: { token: input.cardToken },
  });
  if (!card.id) throw new Error("Mercado Pago card could not be saved");

  return {
    customerId,
    cardId: card.id,
    last4: card.last_four_digits ?? "",
    brand: card.payment_method?.name ?? card.payment_method?.id ?? "cartão",
  };
}

export async function removeSavedCard(
  customerId: string,
  cardId: string
): Promise<void> {
  await new CustomerCard(getConfig()).remove({ customerId, cardId });
}

export type ChargeResult = { id: string; status: string };

/**
 * Charge a previously saved card (card-on-file) for an amount. Generates a
 * single-use token from the saved card and creates a payment.
 *
 * CAVEAT: this is a cardholder-not-present charge. Mercado Pago / some issuers
 * may reject a saved-card token created without the security code (CVV). If that
 * happens in production, the auto-recharge falls back to no-credit (the org
 * keeps a low balance and is nudged to buy a package manually).
 */
export async function chargeSavedCard(input: {
  customerId: string;
  cardId: string;
  amountCents: number;
  description: string;
  externalReference: string;
}): Promise<ChargeResult> {
  const cfg = getConfig();

  const token = await new CardToken(cfg).create({
    body: { card_id: input.cardId, customer_id: input.customerId },
  });
  if (!token.id) throw new Error("Mercado Pago card token could not be created");

  const payment = await new Payment(cfg).create({
    body: {
      transaction_amount: input.amountCents / 100,
      token: token.id,
      description: input.description,
      installments: 1,
      payer: { type: "customer", id: input.customerId },
      external_reference: input.externalReference,
    },
  });
  if (!payment.id) throw new Error("Mercado Pago payment failed to create");
  return { id: String(payment.id), status: payment.status ?? "unknown" };
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
