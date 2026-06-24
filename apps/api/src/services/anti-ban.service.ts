import { and, eq, inArray } from "drizzle-orm";
import { whatsappAccounts } from "@bulk-zap/db";
import { db } from "../db.js";

export function pickJitter(minMs: number, maxMs: number): number {
  if (maxMs <= minMs) return minMs;
  return minMs + Math.floor(Math.random() * (maxMs - minMs));
}

export async function nextAccountFromPool(
  poolIds: string[],
  organizationId: string
): Promise<string | null> {
  if (poolIds.length === 0) return null;

  const accounts = await db
    .select()
    .from(whatsappAccounts)
    .where(
      and(
        inArray(whatsappAccounts.id, poolIds),
        eq(whatsappAccounts.organizationId, organizationId),
        eq(whatsappAccounts.status, "connected")
      )
    );

  const candidates = accounts.filter((a) => {
    if (a.dailyLimit == null) return true;
    return a.dailyUsed < a.dailyLimit;
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.dailyUsed - b.dailyUsed);
  return candidates[0]!.id;
}

export async function incrementDailyUsed(accountId: string): Promise<void> {
  const [acc] = await db
    .select()
    .from(whatsappAccounts)
    .where(eq(whatsappAccounts.id, accountId))
    .limit(1);
  if (!acc) return;

  const now = new Date();
  const reset =
    !acc.dailyResetAt ||
    now.getTime() - acc.dailyResetAt.getTime() > 24 * 60 * 60 * 1000;

  await db
    .update(whatsappAccounts)
    .set({
      dailyUsed: reset ? 1 : acc.dailyUsed + 1,
      dailyResetAt: reset ? now : acc.dailyResetAt,
      updatedAt: now,
    })
    .where(eq(whatsappAccounts.id, accountId));
}

export function estimateCampaignDurationMs(
  totalMessages: number,
  jitterMinMs: number,
  jitterMaxMs: number
): number {
  if (totalMessages <= 0) return 0;
  const avg = (jitterMinMs + jitterMaxMs) / 2;
  return Math.max(0, (totalMessages - 1) * avg);
}
