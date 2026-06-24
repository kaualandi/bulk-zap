import { logger } from "../logger.js";
import {
  creditApprovedPurchase,
  getOrCreateCreditAccount,
  getOrgPlan,
  recordRechargeFailure,
  releaseRechargeLock,
} from "../services/billing.service.js";
import {
  chargeSavedCard,
  isMercadoPagoConfigured,
} from "../services/mercadopago.service.js";
import { sendAlert } from "../services/email-alert.service.js";
import { createAutoRechargeWorker } from "./queue.js";

/**
 * Auto-recharge NÃO pode falhar em silêncio: persiste o erro (surface na UI via
 * billing status) e dispara um e-mail best-effort pros inscritos da org.
 */
async function notifyRechargeFailure(orgId: string, message: string) {
  await recordRechargeFailure(orgId, message);
  await sendAlert({
    accountId: null,
    organizationId: orgId,
    eventType: "auto_recharge_failed",
    subject: "BulkZap — falha na auto-recarga de créditos",
    text: `A auto-recarga automática falhou: ${message}. Seus disparos podem ser bloqueados quando o saldo acabar. Atualize o cartão ou compre créditos manualmente em Plano & Cobrança.`,
  });
}

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
        await notifyRechargeFailure(
          orgId,
          `pagamento ${payment.status} (cartão recusado)`
        );
      }
    } catch (err) {
      logger.error({ err, orgId }, "auto-recharge failed");
      await notifyRechargeFailure(
        orgId,
        err instanceof Error ? err.message : "erro ao cobrar o cartão"
      ).catch((e) => logger.error({ e, orgId }, "failed to notify recharge failure"));
    } finally {
      await releaseRechargeLock(orgId);
    }
  });

  worker.on("failed", (job, err) =>
    logger.warn({ jobId: job?.id, err: err?.message }, "auto-recharge job failed")
  );

  return worker;
}
