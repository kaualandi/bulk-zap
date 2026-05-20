import { eq } from "drizzle-orm";
import { whatsappAccounts } from "@bulk-zap/db";
import { db } from "../db.js";
import { logger } from "../logger.js";
import { recordEvent } from "../services/events.service.js";
import { createWarmupCheckWorker, warmupCheckQueue } from "./queue.js";

const MAX_DAILY_LIMIT = 500;

export function startWarmupCheckWorker() {
  const worker = createWarmupCheckWorker(async () => {
    const accounts = await db
      .select()
      .from(whatsappAccounts)
      .where(eq(whatsappAccounts.warmupMode, "auto"));

    for (const acc of accounts) {
      const startedAt = acc.warmupStartedAt ?? new Date();
      const days =
        (Date.now() - startedAt.getTime()) / (1000 * 60 * 60 * 24);
      const target = Math.min(
        MAX_DAILY_LIMIT,
        Math.round(20 * Math.pow(1.3, Math.floor(days)))
      );
      if (acc.dailyLimit !== target) {
        await db
          .update(whatsappAccounts)
          .set({
            dailyLimit: target,
            warmupStartedAt: acc.warmupStartedAt ?? new Date(),
          })
          .where(eq(whatsappAccounts.id, acc.id));
        await recordEvent({
          accountId: acc.id,
          type: "warmup_advanced",
          payload: { dailyLimit: target },
        });
      }
    }
    logger.debug({ count: accounts.length }, "warmup check done");
  });

  warmupCheckQueue
    .add(
      "daily",
      {},
      {
        repeat: { pattern: "0 3 * * *" },
        removeOnComplete: 50,
      }
    )
    .catch((err) => logger.error({ err }, "failed to schedule warmup-check"));

  return worker;
}
