import { and, eq } from "drizzle-orm";
import {
  campaignRuns,
  campaigns,
  lists,
  subscriptions,
  templates,
  whatsappAccounts,
} from "@bulk-zap/db";
import { db } from "../db.js";

export type OnboardingStatus = {
  /** Assinatura ativa — gate do disparo. */
  hasSubscription: boolean;
  /** Pelo menos um número WhatsApp conectado. */
  hasConnectedAccount: boolean;
  hasList: boolean;
  hasTemplate: boolean;
  /** Já lançou ao menos uma campanha (existe um run). */
  hasDispatched: boolean;
  allDone: boolean;
};

/**
 * Compute the org's onboarding progress from real data (org-scoped). Each flag
 * reflects whether the corresponding setup step is done. `allDone` is true once
 * the org has subscribed, connected a number, created a list + template, and
 * launched at least one campaign.
 */
export async function getOnboardingStatus(
  orgId: string
): Promise<OnboardingStatus> {
  const [sub] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organizationId, orgId),
        eq(subscriptions.status, "authorized")
      )
    )
    .limit(1);

  const [account] = await db
    .select({ id: whatsappAccounts.id })
    .from(whatsappAccounts)
    .where(
      and(
        eq(whatsappAccounts.organizationId, orgId),
        eq(whatsappAccounts.status, "connected")
      )
    )
    .limit(1);

  const [list] = await db
    .select({ id: lists.id })
    .from(lists)
    .where(eq(lists.organizationId, orgId))
    .limit(1);

  const [template] = await db
    .select({ id: templates.id })
    .from(templates)
    .where(eq(templates.organizationId, orgId))
    .limit(1);

  const [run] = await db
    .select({ id: campaignRuns.id })
    .from(campaignRuns)
    .innerJoin(campaigns, eq(campaignRuns.campaignId, campaigns.id))
    .where(eq(campaigns.organizationId, orgId))
    .limit(1);

  const hasSubscription = Boolean(sub);
  const hasConnectedAccount = Boolean(account);
  const hasList = Boolean(list);
  const hasTemplate = Boolean(template);
  const hasDispatched = Boolean(run);

  return {
    hasSubscription,
    hasConnectedAccount,
    hasList,
    hasTemplate,
    hasDispatched,
    allDone:
      hasSubscription &&
      hasConnectedAccount &&
      hasList &&
      hasTemplate &&
      hasDispatched,
  };
}
