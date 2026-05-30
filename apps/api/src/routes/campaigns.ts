import { Elysia, t } from "elysia";
import { desc, eq } from "drizzle-orm";
import { campaigns, campaignRuns } from "@bulk-zap/db";
import { db } from "../db.js";
import {
  cancelCampaign,
  createCampaign,
  estimateCampaign,
  launchCampaign,
  pauseCampaign,
  updateCampaign,
} from "../services/campaign.service.js";
import { validatePoolGroupMembership } from "../services/group-validation.service.js";

export const campaignsRoutes = new Elysia({ prefix: "/campaigns" })
  .get("/", async () => {
    return await db
      .select()
      .from(campaigns)
      .orderBy(desc(campaigns.createdAt));
  })

  .get("/:id", async ({ params }) => {
    const [row] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, params.id))
      .limit(1);
    if (!row) return new Response("not found", { status: 404 });
    return row;
  })

  .post(
    "/",
    async ({ body }) => {
      return await createCampaign({
        name: body.name,
        category: body.category,
        templateId: body.templateId,
        listId: body.listId,
        accountPoolIds: body.accountPoolIds,
        scheduleAt: body.scheduleAt ? new Date(body.scheduleAt) : null,
        jitterMinMs: body.jitterMinMs,
        jitterMaxMs: body.jitterMaxMs,
        dailyCapPerAccount: body.dailyCapPerAccount ?? null,
        marketingConsentConfirmed: body.marketingConsentConfirmed ?? null,
      });
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        category: t.Union([
          t.Literal("marketing"),
          t.Literal("transacional"),
          t.Literal("atendimento"),
          t.Literal("outros"),
        ]),
        templateId: t.String(),
        listId: t.String(),
        accountPoolIds: t.Array(t.String(), { minItems: 1 }),
        scheduleAt: t.Optional(t.String()),
        jitterMinMs: t.Optional(t.Integer({ minimum: 0 })),
        jitterMaxMs: t.Optional(t.Integer({ minimum: 0 })),
        dailyCapPerAccount: t.Optional(t.Nullable(t.Integer({ minimum: 0 }))),
        marketingConsentConfirmed: t.Optional(t.Nullable(t.String())),
      }),
    }
  )

  .get("/:id/estimate", async ({ params }) => {
    return await estimateCampaign(params.id);
  })

  .get("/:id/validate", async ({ params }) => {
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, params.id))
      .limit(1);
    if (!campaign) return new Response("not found", { status: 404 });
    return await validatePoolGroupMembership(
      campaign.listId,
      campaign.accountPoolIds
    );
  })

  .put(
    "/:id",
    async ({ params, body }) => {
      return await updateCampaign(params.id, {
        name: body.name,
        category: body.category,
        templateId: body.templateId,
        listId: body.listId,
        accountPoolIds: body.accountPoolIds,
        scheduleAt:
          body.scheduleAt === undefined
            ? undefined
            : body.scheduleAt === null
              ? null
              : new Date(body.scheduleAt),
        jitterMinMs: body.jitterMinMs,
        jitterMaxMs: body.jitterMaxMs,
        dailyCapPerAccount: body.dailyCapPerAccount,
        marketingConsentConfirmed: body.marketingConsentConfirmed,
      });
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        category: t.Optional(
          t.Union([
            t.Literal("marketing"),
            t.Literal("transacional"),
            t.Literal("atendimento"),
            t.Literal("outros"),
          ])
        ),
        templateId: t.Optional(t.String()),
        listId: t.Optional(t.String()),
        accountPoolIds: t.Optional(t.Array(t.String(), { minItems: 1 })),
        scheduleAt: t.Optional(t.Nullable(t.String())),
        jitterMinMs: t.Optional(t.Integer({ minimum: 0 })),
        jitterMaxMs: t.Optional(t.Integer({ minimum: 0 })),
        dailyCapPerAccount: t.Optional(t.Nullable(t.Integer({ minimum: 0 }))),
        marketingConsentConfirmed: t.Optional(t.Nullable(t.String())),
      }),
    }
  )

  .post(
    "/:id/launch",
    async ({ params, query }) => {
      const respectSchedule = query.respectSchedule === "true";
      return await launchCampaign(params.id, { respectSchedule });
    },
    {
      query: t.Object({
        respectSchedule: t.Optional(t.String()),
      }),
    }
  )

  .post("/:id/pause", async ({ params }) => {
    await pauseCampaign(params.id);
    return { ok: true };
  })

  .post(
    "/:id/cancel",
    async ({ params, body }) => {
      const result = await cancelCampaign(params.id, {
        deleteSent: body?.deleteSent === true,
      });
      return { ok: true, ...result };
    },
    {
      body: t.Optional(
        t.Object({
          deleteSent: t.Optional(t.Boolean()),
        })
      ),
    }
  )

  .delete("/:id", async ({ params }) => {
    const [existing] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, params.id))
      .limit(1);
    if (!existing) return new Response("not found", { status: 404 });
    if (existing.status !== "draft") {
      return new Response("only draft campaigns can be deleted", {
        status: 400,
      });
    }
    await db.delete(campaigns).where(eq(campaigns.id, params.id));
    return { ok: true };
  })

  .get("/:id/runs", async ({ params }) => {
    return await db
      .select()
      .from(campaignRuns)
      .where(eq(campaignRuns.campaignId, params.id))
      .orderBy(desc(campaignRuns.startedAt));
  });
