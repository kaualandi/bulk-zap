import { and, eq, ne, sql } from "drizzle-orm";
import { campaignRuns, campaigns, messages, whatsappAccounts } from "@bulk-zap/db";
import { db } from "../db.js";
import { logger } from "../logger.js";
import { getDriver } from "../services/account-manager.service.js";
import { incrementDailyUsed } from "../services/anti-ban.service.js";
import { canDispatch, recordDispatch } from "../services/billing.service.js";
import { createSendMessageWorker } from "./queue.js";

/**
 * Resolve the owning organization for a message via its sending account.
 * whatsapp_accounts carries organization_id (NOT NULL). Returns null if the
 * account row is gone (treated as a hard failure upstream).
 */
async function resolveOrgIdForAccount(accountId: string): Promise<string | null> {
  const [row] = await db
    .select({ organizationId: whatsappAccounts.organizationId })
    .from(whatsappAccounts)
    .where(eq(whatsappAccounts.id, accountId))
    .limit(1);
  return row?.organizationId ?? null;
}

async function maybeCompleteCampaign(campaignRunId: string): Promise<void> {
  const [pending] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(
      and(eq(messages.campaignRunId, campaignRunId), eq(messages.status, "queued"))
    );
  if ((pending?.count ?? 0) > 0) return;

  const [run] = await db
    .update(campaignRuns)
    .set({ status: "completed", finishedAt: new Date() })
    .where(
      and(eq(campaignRuns.id, campaignRunId), ne(campaignRuns.status, "completed"))
    )
    .returning();
  if (!run) return;

  const [otherActive] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(campaignRuns)
    .where(
      and(
        eq(campaignRuns.campaignId, run.campaignId),
        ne(campaignRuns.status, "completed"),
        ne(campaignRuns.status, "canceled"),
        ne(campaignRuns.status, "failed")
      )
    );
  if ((otherActive?.count ?? 0) > 0) return;

  await db
    .update(campaigns)
    .set({ status: "completed", updatedAt: new Date() })
    .where(and(eq(campaigns.id, run.campaignId), ne(campaigns.status, "canceled")));
}

export function startSendMessageWorker() {
  const worker = createSendMessageWorker(async (job) => {
    const { messageId, campaignRunId } = job.data;

    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    if (!message) {
      logger.warn({ messageId }, "message not found");
      return;
    }
    if (message.status !== "queued") {
      logger.info({ messageId, status: message.status }, "skipping non-queued message");
      return;
    }

    // --- Billing gate (SEPARATE from anti-ban; this blocks, anti-ban warns) ---
    const orgId = await resolveOrgIdForAccount(message.accountId);
    if (!orgId) {
      await db
        .update(messages)
        .set({ status: "failed", error: "org_not_found" })
        .where(eq(messages.id, messageId));
      await db
        .update(campaignRuns)
        .set({ failedCount: sql`${campaignRuns.failedCount} + 1` })
        .where(eq(campaignRuns.id, campaignRunId));
      await maybeCompleteCampaign(campaignRunId);
      logger.warn({ messageId, accountId: message.accountId }, "no org for account; blocked");
      return;
    }

    const gate = await canDispatch(orgId);
    if (!gate.allowed) {
      // Mark blocked and skip the send. Do NOT throw — billing block is a
      // terminal, non-retryable condition for this message.
      await db
        .update(messages)
        .set({ status: "failed", error: `billing_blocked:${gate.reason ?? "unknown"}` })
        .where(eq(messages.id, messageId));
      await db
        .update(campaignRuns)
        .set({ failedCount: sql`${campaignRuns.failedCount} + 1` })
        .where(eq(campaignRuns.id, campaignRunId));
      await maybeCompleteCampaign(campaignRunId);
      logger.warn(
        { messageId, orgId, reason: gate.reason },
        "message blocked by billing gate"
      );
      return;
    }

    const driver = getDriver(message.accountId);
    if (!driver) {
      await db
        .update(messages)
        .set({ status: "failed", error: "driver_not_running" })
        .where(eq(messages.id, messageId));
      await db
        .update(campaignRuns)
        .set({ failedCount: sql`${campaignRuns.failedCount} + 1` })
        .where(eq(campaignRuns.id, campaignRunId));
      throw new Error("driver_not_running");
    }

    try {
      const result = await driver.sendText(message.targetJid, message.body);
      await db
        .update(messages)
        .set({
          status: "sent",
          sentAt: new Date(),
          providerMsgId: result.messageId || null,
          error: null,
        })
        .where(eq(messages.id, messageId));
      await db
        .update(campaignRuns)
        .set({ sentCount: sql`${campaignRuns.sentCount} + 1` })
        .where(eq(campaignRuns.id, campaignRunId));
      await incrementDailyUsed(message.accountId);
      // Count the successful dispatch against the org's billing quota.
      await recordDispatch(orgId, 1);
      logger.debug({ messageId, externalId: result.messageId }, "message sent");
      await maybeCompleteCampaign(campaignRunId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await db
        .update(messages)
        .set({ status: "failed", error: errorMessage })
        .where(eq(messages.id, messageId));
      await db
        .update(campaignRuns)
        .set({ failedCount: sql`${campaignRuns.failedCount} + 1` })
        .where(eq(campaignRuns.id, campaignRunId));
      await maybeCompleteCampaign(campaignRunId);
      throw err;
    }
  });

  worker.on("failed", (job, err) => {
    logger.warn({ jobId: job?.id, err: err?.message }, "send-message failed");
  });

  return worker;
}
