import { Elysia, t } from "elysia";
import { and, eq } from "drizzle-orm";
import { whatsappAccounts } from "@bulk-zap/db";
import QRCode from "qrcode";
import { db } from "../db.js";
import { authPlugin, getAuthContext } from "../lib/auth-middleware.js";
import {
  getDriver,
  getLastQr,
  logoutAccount,
  startAccount,
  stopAccount,
  subscribe,
} from "../services/account-manager.service.js";
import { upsertSyncedGroups } from "../services/sync.service.js";

const wsSubscriptions = new Map<string, () => void>();

/** Returns the account row only if it belongs to the org; null otherwise. */
async function getOwnedAccount(id: string, organizationId: string) {
  const [row] = await db
    .select()
    .from(whatsappAccounts)
    .where(
      and(
        eq(whatsappAccounts.id, id),
        eq(whatsappAccounts.organizationId, organizationId)
      )
    )
    .limit(1);
  return row ?? null;
}

export const accountsRoutes = new Elysia({ prefix: "/accounts" })
  .use(authPlugin)
  .get(
    "/",
    async ({ organizationId }) => {
      return await db
        .select()
        .from(whatsappAccounts)
        .where(eq(whatsappAccounts.organizationId, organizationId));
    },
    { auth: true }
  )

  .post(
    "/",
    async ({ body, organizationId }) => {
      const [row] = await db
        .insert(whatsappAccounts)
        .values({
          organizationId,
          displayName: body.displayName,
          driver: body.driver ?? "baileys",
          warmupMode: body.warmupMode ?? "off",
          dailyLimit: body.dailyLimit ?? null,
          phoneE164: body.phoneE164 ?? null,
        })
        .returning();
      return row;
    },
    {
      auth: true,
      body: t.Object({
        displayName: t.String({ minLength: 1 }),
        driver: t.Optional(
          t.Union([t.Literal("baileys"), t.Literal("cloud_api")])
        ),
        warmupMode: t.Optional(
          t.Union([t.Literal("off"), t.Literal("auto"), t.Literal("manual")])
        ),
        dailyLimit: t.Optional(t.Nullable(t.Integer({ minimum: 0 }))),
        phoneE164: t.Optional(t.Nullable(t.String())),
      }),
    }
  )

  .get(
    "/:id",
    async ({ params, organizationId }) => {
      const row = await getOwnedAccount(params.id, organizationId);
      if (!row) return new Response("not found", { status: 404 });
      return row;
    },
    { auth: true }
  )

  .post(
    "/:id/connect",
    async ({ params, organizationId }) => {
      if (!(await getOwnedAccount(params.id, organizationId)))
        return new Response("not found", { status: 404 });
      await startAccount(params.id);
      return { ok: true };
    },
    { auth: true }
  )

  .post(
    "/:id/disconnect",
    async ({ params, organizationId }) => {
      if (!(await getOwnedAccount(params.id, organizationId)))
        return new Response("not found", { status: 404 });
      await stopAccount(params.id);
      return { ok: true };
    },
    { auth: true }
  )

  .post(
    "/:id/logout",
    async ({ params, organizationId }) => {
      if (!(await getOwnedAccount(params.id, organizationId)))
        return new Response("not found", { status: 404 });
      await logoutAccount(params.id);
      return { ok: true };
    },
    { auth: true }
  )

  .get(
    "/:id/qr",
    async ({ params, organizationId }) => {
      if (!(await getOwnedAccount(params.id, organizationId)))
        return new Response("not found", { status: 404 });
      const qr = getLastQr(params.id);
      if (!qr) return new Response("no qr available", { status: 404 });
      const dataUrl = await QRCode.toDataURL(qr);
      return { qr, dataUrl };
    },
    { auth: true }
  )

  .ws("/:id/events", {
    // The Elysia `auth` macro does not apply to .ws; authenticate manually in
    // open() using the upgrade request cookies, and verify the account belongs
    // to the caller's org before streaming any events.
    async open(ws) {
      const accountId = ws.data.params.id;
      const ctx = await getAuthContext(ws.data.request.headers);
      if (!ctx) {
        ws.close();
        return;
      }
      const owned = await getOwnedAccount(accountId, ctx.organizationId);
      if (!owned) {
        ws.close();
        return;
      }
      const lastQr = getLastQr(accountId);
      if (lastQr) {
        QRCode.toDataURL(lastQr).then((dataUrl) => {
          ws.send({ type: "qr", qr: lastQr, dataUrl });
        });
      }
      const unsubscribe = subscribe(accountId, async (event) => {
        if (event.type === "qr") {
          const dataUrl = await QRCode.toDataURL(event.qr);
          ws.send({ type: "qr", qr: event.qr, dataUrl });
        } else {
          ws.send(event);
        }
      });
      wsSubscriptions.set(ws.id, unsubscribe);
    },
    close(ws) {
      wsSubscriptions.get(ws.id)?.();
      wsSubscriptions.delete(ws.id);
    },
  })

  .post(
    "/:id/sync-groups",
    async ({ params, organizationId }) => {
      if (!(await getOwnedAccount(params.id, organizationId)))
        return new Response("not found", { status: 404 });
      const driver = getDriver(params.id);
      if (!driver) return new Response("driver not running", { status: 400 });
      const groups = await driver.listGroups();
      await upsertSyncedGroups(params.id, organizationId, groups);
      return { ok: true, count: groups.length };
    },
    { auth: true }
  );
