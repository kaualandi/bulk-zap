import { and, eq, ne, sql } from "drizzle-orm";
import { campaignRuns, campaigns, messages } from "@bulk-zap/db";
import { db } from "../db.js";
import { logger } from "../logger.js";
import { getDriver } from "../services/account-manager.service.js";
import { incrementDailyUsed } from "../services/anti-ban.service.js";
import { createSendMessageWorker } from "./queue.js";

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
