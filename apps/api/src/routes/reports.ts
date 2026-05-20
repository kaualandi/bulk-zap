import { Elysia, t } from "elysia";
import { and, eq, sql } from "drizzle-orm";
import { campaignRuns, messages, whatsappAccounts } from "@bulk-zap/db";
import { db } from "../db.js";

export const reportsRoutes = new Elysia({ prefix: "/reports" })
  .get(
    "/campaign/:id",
    async ({ params }) => {
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
    { params: t.Object({ id: t.String() }) }
  )

  .get("/account/:id", async ({ params }) => {
    const [acc] = await db
      .select()
      .from(whatsappAccounts)
      .where(eq(whatsappAccounts.id, params.id))
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
  })

  .get(
    "/messages",
    async ({ query }) => {
      const limit = Math.min(Number(query.limit ?? "100"), 500);
      if (query.runId) {
        return await db
          .select()
          .from(messages)
          .where(eq(messages.campaignRunId, query.runId))
          .limit(limit);
      }
      if (query.accountId) {
        return await db
          .select()
          .from(messages)
          .where(eq(messages.accountId, query.accountId))
          .limit(limit);
      }
      return await db.select().from(messages).limit(limit);
    },
    {
      query: t.Object({
        runId: t.Optional(t.String()),
        accountId: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
    }
  );
