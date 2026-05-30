import { Elysia, t } from "elysia";
import { and, eq, sql } from "drizzle-orm";
import { campaignRuns, campaigns, messages, whatsappAccounts } from "@bulk-zap/db";
import { db } from "../db.js";
import { authPlugin } from "../lib/auth-middleware.js";

export const reportsRoutes = new Elysia({ prefix: "/reports" })
  .use(authPlugin)
  .get(
    "/campaign/:id",
    async ({ params, organizationId }) => {
      // Verify the campaign belongs to the org before reporting on its runs.
      const [owned] = await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(
          and(
            eq(campaigns.id, params.id),
            eq(campaigns.organizationId, organizationId)
          )
        )
        .limit(1);
      if (!owned) return new Response("not found", { status: 404 });

      const runs = await db
        .select()
        .from(campaignRuns)
        .where(eq(campaignRuns.campaignId, params.id));

      const breakdown = await db
        .select({
          accountId: messages.accountId,
          status: messages.status,
          count: sql<number>`count(*)::int`,
        })
        .from(messages)
        .innerJoin(campaignRuns, eq(campaignRuns.id, messages.campaignRunId))
        .where(eq(campaignRuns.campaignId, params.id))
        .groupBy(messages.accountId, messages.status);

      return { runs, breakdown };
    },
    { auth: true, params: t.Object({ id: t.String() }) }
  )

  .get(
    "/account/:id",
    async ({ params, organizationId }) => {
      const [acc] = await db
        .select()
        .from(whatsappAccounts)
        .where(
          and(
            eq(whatsappAccounts.id, params.id),
            eq(whatsappAccounts.organizationId, organizationId)
          )
        )
        .limit(1);
      if (!acc) return new Response("not found", { status: 404 });

      const stats = await db
        .select({
          status: messages.status,
          count: sql<number>`count(*)::int`,
        })
        .from(messages)
        .where(eq(messages.accountId, params.id))
        .groupBy(messages.status);

      return { account: acc, stats };
    },
    { auth: true }
  )

  .get(
    "/messages",
    async ({ query, organizationId }) => {
      const limit = Math.min(Number(query.limit ?? "100"), 500);
      if (query.runId) {
        // Scope the run to the org via campaign_runs -> campaigns.organizationId.
        return await db
          .select({ message: messages })
          .from(messages)
          .innerJoin(campaignRuns, eq(campaignRuns.id, messages.campaignRunId))
          .innerJoin(campaigns, eq(campaigns.id, campaignRuns.campaignId))
          .where(
            and(
              eq(messages.campaignRunId, query.runId),
              eq(campaigns.organizationId, organizationId)
            )
          )
          .limit(limit)
          .then((rows) => rows.map((r) => r.message));
      }
      if (query.accountId) {
        // Scope to the org via whatsapp_accounts.organizationId.
        return await db
          .select({ message: messages })
          .from(messages)
          .innerJoin(
            whatsappAccounts,
            eq(whatsappAccounts.id, messages.accountId)
          )
          .where(
            and(
              eq(messages.accountId, query.accountId),
              eq(whatsappAccounts.organizationId, organizationId)
            )
          )
          .limit(limit)
          .then((rows) => rows.map((r) => r.message));
      }
      // No filter: return all messages owned by the org (via sending account).
      return await db
        .select({ message: messages })
        .from(messages)
        .innerJoin(
          whatsappAccounts,
          eq(whatsappAccounts.id, messages.accountId)
        )
        .where(eq(whatsappAccounts.organizationId, organizationId))
        .limit(limit)
        .then((rows) => rows.map((r) => r.message));
    },
    {
      auth: true,
      query: t.Object({
        runId: t.Optional(t.String()),
        accountId: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
    }
  );
