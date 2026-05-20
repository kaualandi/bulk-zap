import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { whatsappAccounts } from "@bulk-zap/db";
import QRCode from "qrcode";
import { db } from "../db.js";
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

export const accountsRoutes = new Elysia({ prefix: "/accounts" })
  .get("/", async () => {
    return await db.select().from(whatsappAccounts);
  })

  .post(
    "/",
    async ({ body }) => {
      const [row] = await db
        .insert(whatsappAccounts)
        .values({
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

  .get("/:id", async ({ params }) => {
    const [row] = await db
      .select()
      .from(whatsappAccounts)
      .where(eq(whatsappAccounts.id, params.id))
      .limit(1);
    if (!row) return new Response("not found", { status: 404 });
    return row;
  })

  .post("/:id/connect", async ({ params }) => {
    await startAccount(params.id);
    return { ok: true };
  })

  .post("/:id/disconnect", async ({ params }) => {
    await stopAccount(params.id);
    return { ok: true };
  })

  .post("/:id/logout", async ({ params }) => {
    await logoutAccount(params.id);
    return { ok: true };
  })

  .get("/:id/qr", async ({ params }) => {
    const qr = getLastQr(params.id);
    if (!qr) return new Response("no qr available", { status: 404 });
    const dataUrl = await QRCode.toDataURL(qr);
    return { qr, dataUrl };
  })

  .ws("/:id/events", {
    open(ws) {
      const accountId = ws.data.params.id;
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

  .post("/:id/sync-groups", async ({ params }) => {
    const driver = getDriver(params.id);
    if (!driver) return new Response("driver not running", { status: 400 });
    const groups = await driver.listGroups();
    await upsertSyncedGroups(params.id, groups);
    return { ok: true, count: groups.length };
  });
