import { logger } from "../logger.js";
import {
  creditApprovedPurchase,
  getOrCreateCreditAccount,
  getOrgPlan,
  releaseRechargeLock,
} from "../services/billing.service.js";
import {
  chargeSavedCard,
  isMercadoPagoConfigured,
} from "../services/mercadopago.service.js";
import { createAutoRechargeWorker } from "./queue.js";

/**
 * On-demand worker: tops up an org's credit balance by charging its saved card.
 * Enqueued by `maybeTriggerAutoRecharge` (billing.service) when the balance dips
 * below the configured threshold. Concurrency 1 + jobId dedup + the
 * `rechargePending` lock keep it from double-charging. The lock is ALWAYS
 * released in `finally`.
 */
export function startAutoRechargeWorker() {
  const worker = createAutoRechargeWorker(async (job) => {
    const orgId = job.data.organizationId;
    try {
      const account = await getOrCreateCreditAccount(orgId);

      // Re-check conditions at run time (state may have changed since enqueue).
      if (
        !account.autoRechargeEnabled ||
        !account.mpCardId ||
        !account.mpCustomerId ||
        account.autoRechargeThreshold == null
      ) {
        return;
      }
      if (account.balance >= account.autoRechargeThreshold) return; // already ok
      if (!isMercadoPagoConfigured()) {
        logger.warn({ orgId }, "auto-recharge skipped: Mercado Pago not configured");
        return;
      }

      const plan = await getOrgPlan(orgId);
      if (!plan) {
        logger.warn({ orgId }, "auto-recharge skipped: org has no active plan");
        return;
      }

      const dispatches = account.autoRechargePackageQty * plan.overagePackageSize;
      const amountCents =
        account.autoRechargePackageQty * plan.overagePackagePriceCents;

      const payment = await chargeSavedCard({
        customerId: account.mpCustomerId,
        cardId: account.mpCardId,
        amountCents,
        description: `Recarga automática de ${dispatches} disparos`,
        // Same prefix as manual purchases → the webhook is a safety net; the
        // shared `mpPaymentId` makes crediting idempotent across both paths.
        externalReference: `overage:${orgId}:${dispatches}`,
      });

      if (payment.status === "approved") {
        await creditApprovedPurchase({
          orgId,
          dispatches,
          amountCents,
          mpPaymentId: payment.id,
          source: "auto_recharge",
        });
        logger.info(
          { orgId, dispatches, paymentId: payment.id },
          "auto-recharge approved"
        );
      } else {
        logger.warn(
          { orgId, status: payment.status, paymentId: payment.id },
          "auto-recharge payment not approved"
        );
      }
    } catch (err) {
      logger.error({ err, orgId }, "auto-recharge failed");
    } finally {
      await releaseRechargeLock(orgId);
    }
  });

  worker.on("failed", (job, err) =>
    logger.warn({ jobId: job?.id, err: err?.message }, "auto-recharge job failed")
  );

  return worker;
}
