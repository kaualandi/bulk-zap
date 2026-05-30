import { Elysia, t } from "elysia";
import { and, desc, eq } from "drizzle-orm";
import { inboundMessages, whatsappAccounts } from "@bulk-zap/db";
import { db } from "../db.js";
import { authPlugin } from "../lib/auth-middleware.js";
import {
  addToBlocklist,
  listBlocklist,
  removeFromBlocklist,
} from "../services/blocklist.service.js";

export const inboundRoutes = new Elysia({ prefix: "/inbound" })
  .use(authPlugin)
  .get(
    "/",
    async ({ organizationId }) => {
      // inbound_messages is a child table; scope through whatsapp_accounts.organizationId.
      const rows = await db
        .select({ inbound: inboundMessages })
        .from(inboundMessages)
        .innerJoin(
          whatsappAccounts,
          eq(whatsappAccounts.id, inboundMessages.accountId)
        )
        .where(eq(whatsappAccounts.organizationId, organizationId))
        .orderBy(desc(inboundMessages.createdAt))
        .limit(200);
      return rows.map((r) => r.inbound);
    },
    { auth: true }
  )

  .post(
    "/:id/override",
    async ({ params, body, organizationId }) => {
      // Join to the receiving account to verify org ownership.
      const [found] = await db
        .select({ inbound: inboundMessages })
        .from(inboundMessages)
        .innerJoin(
          whatsappAccounts,
          eq(whatsappAccounts.id, inboundMessages.accountId)
        )
        .where(
          and(
            eq(inboundMessages.id, params.id),
            eq(whatsappAccounts.organizationId, organizationId)
          )
        )
        .limit(1);
      if (!found) return new Response("not found", { status: 404 });
      const row = found.inbound;

      await db
        .update(inboundMessages)
        .set({
          classification: body.classification,
          confidence: 1,
          classifiedAt: new Date(),
        })
        .where(eq(inboundMessages.id, params.id));

      if (body.classification === "opt_out") {
        await addToBlocklist(
          organizationId,
          row.fromJid,
          "Marcado manualmente",
          "manual"
        );
      } else if (row.classification === "opt_out") {
        await removeFromBlocklist(organizationId, row.fromJid);
      }
      return { ok: true };
    },
    {
      auth: true,
      body: t.Object({
        classification: t.Union([
          t.Literal("opt_out"),
          t.Literal("interesse"),
          t.Literal("duvida"),
          t.Literal("reclamacao"),
          t.Literal("outro"),
        ]),
      }),
    }
  )

  .get("/blocklist", async ({ organizationId }) => await listBlocklist(organizationId), {
    auth: true,
  })

  .delete(
    "/blocklist/:jid",
    async ({ params, organizationId }) => {
      await removeFromBlocklist(organizationId, decodeURIComponent(params.jid));
      return { ok: true };
    },
    { auth: true }
  );
