import { and, eq, inArray } from "drizzle-orm";
import {
  campaignRuns,
  campaigns,
  contactBlocklist,
  contacts as contactsTable,
  groups as groupsTable,
  listMembers,
  lists,
  messages,
  templates,
  type Campaign,
} from "@bulk-zap/db";
import { db } from "../db.js";
import {
  estimateCampaignDurationMs,
  nextAccountFromPool,
  pickJitter,
} from "./anti-ban.service.js";
import { renderTemplate } from "./template-render.service.js";
import { sendMessageQueue } from "../jobs/queue.js";
import { getDriver } from "./account-manager.service.js";
import { logger } from "../logger.js";

export type CreateCampaignInput = {
  name: string;
  category: "marketing" | "transacional" | "atendimento" | "outros";
  templateId: string;
  listId: string;
  accountPoolIds: string[];
  scheduleAt?: Date | null;
  jitterMinMs?: number;
  jitterMaxMs?: number;
  dailyCapPerAccount?: number | null;
  marketingConsentConfirmed?: string | null;
};

export async function createCampaign(
  input: CreateCampaignInput
): Promise<Campaign> {
  const [row] = await db
    .insert(campaigns)
    .values({
      name: input.name,
      category: input.category,
      templateId: input.templateId,
      listId: input.listId,
      accountPoolIds: input.accountPoolIds,
      scheduleAt: input.scheduleAt ?? null,
      jitterMinMs: input.jitterMinMs ?? 15_000,
      jitterMaxMs: input.jitterMaxMs ?? 90_000,
      dailyCapPerAccount: input.dailyCapPerAccount ?? null,
      marketingConsentConfirmed: input.marketingConsentConfirmed ?? null,
      status: "draft",
    })
    .returning();
  return row!;
}

export async function estimateCampaign(campaignId: string) {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);
  if (!campaign) throw new Error("campaign not found");

  const targets = await loadTargets(campaign.listId);
  const totalMessages = targets.length;
  const estimatedMs = estimateCampaignDurationMs(
    totalMessages,
    campaign.jitterMinMs,
    campaign.jitterMaxMs
  );
  return { totalMessages, estimatedMs };
}

async function loadTargets(listId: string) {
  const [list] = await db
    .select()
    .from(lists)
    .where(eq(lists.id, listId))
    .limit(1);
  if (!list) throw new Error("list not found");

  const memberRows = await db
    .select()
    .from(listMembers)
    .where(eq(listMembers.listId, listId));

  if (list.type === "groups") {
    const ids = memberRows
      .filter((m) => m.targetType === "group")
      .map((m) => m.targetId);
    if (ids.length === 0) return [];
    const rows = await db
      .select()
      .from(groupsTable)
      .where(inArray(groupsTable.id, ids));
    return rows.map((g) => ({
      type: "group" as const,
      id: g.id,
      jid: g.jid,
      name: g.subject,
    }));
  } else {
    const ids = memberRows
      .filter((m) => m.targetType === "contact")
      .map((m) => m.targetId);
    if (ids.length === 0) return [];
    const rows = await db
      .select()
      .from(contactsTable)
      .where(inArray(contactsTable.id, ids));
    const blocked = await db.select().from(contactBlocklist);
    const blockedJids = new Set(blocked.map((b) => b.jid));
    return rows
      .filter((c) => !blockedJids.has(c.jid))
      .map((c) => ({
        type: "contact" as const,
        id: c.id,
        jid: c.jid,
        name: c.name ?? c.pushName ?? "",
      }));
  }
}

export type LaunchOptions = {
  /** If true and the campaign has a future scheduleAt, the run starts only at that time. */
  respectSchedule?: boolean;
};

export async function launchCampaign(
  campaignId: string,
  opts: LaunchOptions = {}
): Promise<{
  runId: string;
  enqueued: number;
  scheduled: boolean;
  startsAt: Date;
}> {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);
  if (!campaign) throw new Error("campaign not found");

  const [template] = await db
    .select()
    .from(templates)
    .where(eq(templates.id, campaign.templateId))
    .limit(1);
  if (!template) throw new Error("template not found");

  const targets = await loadTargets(campaign.listId);
  if (targets.length === 0) {
    throw new Error("list has no targets");
  }

  const now = new Date();
  const useSchedule =
    opts.respectSchedule === true &&
    campaign.scheduleAt != null &&
    campaign.scheduleAt.getTime() > now.getTime();
  const startsAt = useSchedule ? campaign.scheduleAt! : now;
  const baseDelayMs = useSchedule ? startsAt.getTime() - now.getTime() : 0;
  const finalStatus = useSchedule ? "scheduled" : "running";

  const [run] = await db
    .insert(campaignRuns)
    .values({
      campaignId: campaign.id,
      totalTargets: targets.length,
      status: finalStatus,
    })
    .returning();
  const runId = run!.id;

  await db
    .update(campaigns)
    .set({ status: finalStatus, updatedAt: new Date() })
    .where(eq(campaigns.id, campaign.id));

  let cumulativeDelayMs = baseDelayMs;
  let enqueued = 0;

  for (const target of targets) {
    const accountId = await nextAccountFromPool(campaign.accountPoolIds);
    if (!accountId) {
      // No account available; mark this target as failed at queue time.
      await db.insert(messages).values({
        campaignRunId: runId,
        accountId: campaign.accountPoolIds[0]!,
        targetJid: target.jid,
        targetType: target.type,
        body: template.body,
        status: "failed",
        error: "no_account_available",
      });
      continue;
    }

    const renderedBody = renderTemplate(template.body, {
      nome: target.name,
      name: target.name,
    });

    const [message] = await db
      .insert(messages)
      .values({
        campaignRunId: runId,
        accountId,
        targetJid: target.jid,
        targetType: target.type,
        body: renderedBody,
        status: "queued",
      })
      .returning();
    if (!message) continue;

    const jitter = pickJitter(campaign.jitterMinMs, campaign.jitterMaxMs);
    cumulativeDelayMs += jitter;

    const job = await sendMessageQueue.add(
      "send",
      { campaignRunId: runId, messageId: message.id },
      {
        delay: cumulativeDelayMs,
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: false,
        removeOnFail: false,
      }
    );

    await db
      .update(messages)
      .set({ bullJobId: job.id ?? null })
      .where(eq(messages.id, message.id));

    enqueued += 1;
  }

  return { runId, enqueued, scheduled: useSchedule, startsAt };
}

export async function updateCampaign(
  campaignId: string,
  input: Partial<CreateCampaignInput>
): Promise<Campaign> {
  const [existing] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);
  if (!existing) throw new Error("campaign not found");
  if (existing.status !== "draft") {
    throw new Error("only draft campaigns can be edited");
  }

  const [row] = await db
    .update(campaigns)
    .set({
      name: input.name ?? existing.name,
      category: input.category ?? existing.category,
      templateId: input.templateId ?? existing.templateId,
      listId: input.listId ?? existing.listId,
      accountPoolIds: input.accountPoolIds ?? existing.accountPoolIds,
      scheduleAt:
        input.scheduleAt !== undefined ? input.scheduleAt : existing.scheduleAt,
      jitterMinMs: input.jitterMinMs ?? existing.jitterMinMs,
      jitterMaxMs: input.jitterMaxMs ?? existing.jitterMaxMs,
      dailyCapPerAccount:
        input.dailyCapPerAccount !== undefined
          ? input.dailyCapPerAccount
          : existing.dailyCapPerAccount,
      marketingConsentConfirmed:
        input.marketingConsentConfirmed !== undefined
          ? input.marketingConsentConfirmed
          : existing.marketingConsentConfirmed,
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, campaignId))
    .returning();
  return row!;
}

export async function pauseCampaign(campaignId: string): Promise<void> {
  await db
    .update(campaigns)
    .set({ status: "paused", updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));
  // pause active runs
  await db
    .update(campaignRuns)
    .set({ status: "paused" })
    .where(
      and(
        eq(campaignRuns.campaignId, campaignId),
        eq(campaignRuns.status, "running")
      )
    );
}

export type CancelResult = {
  jobsCanceled: number;
  messagesCanceled: number;
  revoked: number;
  revokeFailed: number;
};

export async function cancelCampaign(
  campaignId: string,
  opts: { deleteSent?: boolean } = {}
): Promise<CancelResult> {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);
  if (!campaign) throw new Error("campaign not found");

  const cancelable = new Set<Campaign["status"]>([
    "scheduled",
    "running",
    "paused",
  ]);
  if (!cancelable.has(campaign.status)) {
    throw new Error(`campaign in status "${campaign.status}" cannot be canceled`);
  }

  const result: CancelResult = {
    jobsCanceled: 0,
    messagesCanceled: 0,
    revoked: 0,
    revokeFailed: 0,
  };

  const queuedMessages = await db
    .select()
    .from(messages)
    .innerJoin(campaignRuns, eq(messages.campaignRunId, campaignRuns.id))
    .where(
      and(eq(campaignRuns.campaignId, campaignId), eq(messages.status, "queued"))
    );

  for (const row of queuedMessages) {
    const msg = row.messages;
    if (msg.bullJobId) {
      try {
        const job = await sendMessageQueue.getJob(msg.bullJobId);
        if (job) {
          await job.remove();
          result.jobsCanceled += 1;
        }
      } catch (err) {
        logger.warn(
          { err, jobId: msg.bullJobId, messageId: msg.id },
          "failed to remove bull job during cancel"
        );
      }
    }
    await db
      .update(messages)
      .set({ status: "canceled", error: "campaign_canceled" })
      .where(eq(messages.id, msg.id));
    result.messagesCanceled += 1;
  }

  if (opts.deleteSent) {
    const sentMessages = await db
      .select()
      .from(messages)
      .innerJoin(campaignRuns, eq(messages.campaignRunId, campaignRuns.id))
      .where(
        and(
          eq(campaignRuns.campaignId, campaignId),
          inArray(messages.status, ["sent", "delivered", "read"])
        )
      );

    for (const row of sentMessages) {
      const msg = row.messages;
      if (!msg.providerMsgId) {
        result.revokeFailed += 1;
        continue;
      }
      const driver = getDriver(msg.accountId);
      if (!driver) {
        result.revokeFailed += 1;
        continue;
      }
      try {
        await driver.deleteMessage(msg.targetJid, msg.providerMsgId);
        result.revoked += 1;
      } catch (err) {
        logger.warn(
          { err, messageId: msg.id, providerMsgId: msg.providerMsgId },
          "failed to revoke message during cancel"
        );
        result.revokeFailed += 1;
      }
    }
  }

  await db
    .update(campaignRuns)
    .set({ status: "canceled", finishedAt: new Date() })
    .where(
      and(
        eq(campaignRuns.campaignId, campaignId),
        inArray(campaignRuns.status, ["scheduled", "running", "paused"])
      )
    );

  await db
    .update(campaigns)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));

  return result;
}
