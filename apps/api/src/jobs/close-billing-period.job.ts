import { logger } from "../logger.js";
import {
  attachInvoiceCheckout,
  createOverageInvoiceForPeriod,
  listClosedPeriodsNeedingInvoice,
} from "../services/billing.service.js";
import {
  createOverageInvoicePayment,
  isMercadoPagoConfigured,
} from "../services/mercadopago.service.js";
import {
  closeBillingPeriodQueue,
  createCloseBillingPeriodWorker,
} from "./queue.js";

/**
 * Daily cron: invoice the post-paid overage of any CLOSED billing period that
 * hasn't been invoiced yet. For each such (org, period) with overage > 0:
 *   1. create the `overage_invoices` row (idempotent on org+period), then
 *   2. create a Mercado Pago Checkout Pro preference and attach its init_point
 *      so the customer can pay it (skipped gracefully when MP isn't configured —
 *      the pay route can create the checkout lazily later).
 *
 * The unique (org, periodStart) index makes re-runs safe, so a missed day just
 * gets picked up on the next run.
 */
export function startCloseBillingPeriodWorker() {
  const worker = createCloseBillingPeriodWorker(async () => {
    const pending = await listClosedPeriodsNeedingInvoice(new Date());
    let invoiced = 0;

    for (const period of pending) {
      try {
        const invoice = await createOverageInvoiceForPeriod(period);
        if (!invoice) continue; // no plan / nothing to charge

        if (!invoice.mpInitPoint && isMercadoPagoConfigured()) {
          const { preferenceId, initPoint } = await createOverageInvoicePayment(
            invoice.id,
            { dispatches: invoice.dispatches, amountCents: invoice.amountCents }
          );
          await attachInvoiceCheckout(invoice.id, preferenceId, initPoint);
        }
        invoiced += 1;
      } catch (err) {
        logger.error(
          { err, organizationId: period.organizationId, periodStart: period.periodStart },
          "failed to invoice closed billing period"
        );
      }
    }

    logger.info(
      { candidates: pending.length, invoiced },
      "close-billing-period run done"
    );
  });

  closeBillingPeriodQueue
    .add(
      "daily",
      {},
      {
        // 04:00 every day — catches the just-closed month on the 1st and retries
        // any org missed on a previous day.
        repeat: { pattern: "0 4 * * *" },
        removeOnComplete: 50,
      }
    )
    .catch((err) =>
      logger.error({ err }, "failed to schedule close-billing-period")
    );

  return worker;
}
