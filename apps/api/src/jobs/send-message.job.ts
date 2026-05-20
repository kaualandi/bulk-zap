import { eq, sql } from "drizzle-orm";
import { campaignRuns, messages } from "@bulk-zap/db";
import { db } from "../db.js";
import { logger } from "../logger.js";
import { getDriver } from "../services/account-manager.service.js";
import { incrementDailyUsed } from "../services/anti-ban.service.js";
import { createSendMessageWorker } from "./queue.js";

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
          error: null,
        })
        .where(eq(messages.id, messageId));
      await db
        .update(campaignRuns)
        .set({ sentCount: sql`${campaignRuns.sentCount} + 1` })
        .where(eq(campaignRuns.id, campaignRunId));
      await incrementDailyUsed(message.accountId);
      logger.debug({ messageId, externalId: result.messageId }, "message sent");
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
      throw err;
    }
  });

  worker.on("failed", (job, err) => {
    logger.warn({ jobId: job?.id, err: err?.message }, "send-message failed");
  });

  return worker;
}
