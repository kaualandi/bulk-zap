import { Elysia, t } from "elysia";
import { and, desc, eq } from "drizzle-orm";
import { campaigns, campaignRuns } from "@bulk-zap/db";
import { db } from "../db.js";
import { authPlugin } from "../lib/auth-middleware.js";
import {
  cancelCampaign,
  createCampaign,
  estimateCampaign,
  launchCampaign,
  pauseCampaign,
  updateCampaign,
} from "../services/campaign.service.js";
import {
  PoolGroupValidationError,
  validatePoolGroupMembership,
} from "../services/group-validation.service.js";
import { canDispatch } from "../services/billing.service.js";

/** Returns the campaign row only if it belongs to the org; null otherwise. */
async function getOwnedCampaign(id: string, organizationId: string) {
  const [row] = await db
    .select()
    .from(campaigns)
    .where(
      and(eq(campaigns.id, id), eq(campaigns.organizationId, organizationId))
    )
    .limit(1);
  return row ?? null;
}

export const campaignsRoutes = new Elysia({ prefix: "/campaigns" })
  .use(authPlugin)
  .get(
    "/",
    async ({ organizationId }) => {
      return await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.organizationId, organizationId))
        .orderBy(desc(campaigns.createdAt));
    },
    { auth: true }
  )

  .get(
    "/:id",
    async ({ params, organizationId }) => {
      const row = await getOwnedCampaign(params.id, organizationId);
      if (!row) return new Response("not found", { status: 404 });
      return row;
    },
    { auth: true }
  )

  .post(
    "/",
    async ({ body, organizationId }) => {
      return await createCampaign({
        organizationId,
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
      auth: true,
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

  .get(
    "/:id/estimate",
    async ({ params, organizationId }) => {
      return await estimateCampaign(params.id, organizationId);
    },
    { auth: true }
  )

  .get(
    "/:id/validate",
    async ({ params, organizationId }) => {
      const campaign = await getOwnedCampaign(params.id, organizationId);
      if (!campaign) return new Response("not found", { status: 404 });
      return await validatePoolGroupMembership(
        campaign.listId,
        campaign.accountPoolIds,
        organizationId
      );
    },
    { auth: true }
  )

  .put(
    "/:id",
    async ({ params, body, organizationId }) => {
      return await updateCampaign(params.id, organizationId, {
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
      auth: true,
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
    async ({ params, query, organizationId, set }) => {
      // Pre-flight billing gate: fail fast with a clear error instead of
      // enqueueing a run whose every message would be blocked in the worker.
      // (The worker still re-checks per message — quota can run out mid-run.)
      const gate = await canDispatch(organizationId);
      if (!gate.allowed) {
        set.status = 402; // Payment Required
        return { error: "billing_blocked", reason: gate.reason };
      }

      const respectSchedule = query.respectSchedule === "true";
      try {
        return await launchCampaign(params.id, organizationId, {
          respectSchedule,
        });
      } catch (err) {
        // Hard gate pool×grupo: número do pool não é membro de algum grupo alvo.
        if (err instanceof PoolGroupValidationError) {
          set.status = 422; // Unprocessable Entity
          return { error: "pool_group_validation_failed", missing: err.missing };
        }
        throw err;
      }
    },
    {
      auth: true,
      query: t.Object({
        respectSchedule: t.Optional(t.String()),
      }),
    }
  )

  .post(
    "/:id/pause",
    async ({ params, organizationId }) => {
      await pauseCampaign(params.id, organizationId);
      return { ok: true };
    },
    { auth: true }
  )

  .post(
    "/:id/cancel",
    async ({ params, body, organizationId }) => {
      const result = await cancelCampaign(params.id, organizationId, {
        deleteSent: body?.deleteSent === true,
      });
      return { ok: true, ...result };
    },
    {
      auth: true,
      body: t.Optional(
        t.Object({
          deleteSent: t.Optional(t.Boolean()),
        })
      ),
    }
  )

  .delete(
    "/:id",
    async ({ params, organizationId }) => {
      const existing = await getOwnedCampaign(params.id, organizationId);
      if (!existing) return new Response("not found", { status: 404 });
      if (existing.status !== "draft") {
        return new Response("only draft campaigns can be deleted", {
          status: 400,
        });
      }
      await db
        .delete(campaigns)
        .where(
          and(
            eq(campaigns.id, params.id),
            eq(campaigns.organizationId, organizationId)
          )
        );
      return { ok: true };
    },
    { auth: true }
  )

  .get(
    "/:id/runs",
    async ({ params, organizationId }) => {
      // campaign_runs is a child table; verify the parent campaign is the org's.
      if (!(await getOwnedCampaign(params.id, organizationId)))
        return new Response("not found", { status: 404 });
      return await db
        .select()
        .from(campaignRuns)
        .where(eq(campaignRuns.campaignId, params.id))
        .orderBy(desc(campaignRuns.startedAt));
    },
    { auth: true }
  );
