import { Elysia, t } from "elysia";
import { desc, eq } from "drizzle-orm";
import { inboundMessages } from "@bulk-zap/db";
import { db } from "../db.js";
import {
  addToBlocklist,
  listBlocklist,
  removeFromBlocklist,
} from "../services/blocklist.service.js";

export const inboundRoutes = new Elysia({ prefix: "/inbound" })
  .get("/", async () => {
    return await db
      .select()
      .from(inboundMessages)
      .orderBy(desc(inboundMessages.createdAt))
      .limit(200);
  })

  .post(
    "/:id/override",
    async ({ params, body }) => {
      const [row] = await db
        .select()
        .from(inboundMessages)
        .where(eq(inboundMessages.id, params.id))
        .limit(1);
      if (!row) return new Response("not found", { status: 404 });

      await db
        .update(inboundMessages)
        .set({
          classification: body.classification,
          confidence: 1,
          classifiedAt: new Date(),
        })
        .where(eq(inboundMessages.id, params.id));

      if (body.classification === "opt_out") {
        await addToBlocklist(row.fromJid, "Marcado manualmente", "manual");
      } else if (row.classification === "opt_out") {
        await removeFromBlocklist(row.fromJid);
      }
      return { ok: true };
    },
    {
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

  .get("/blocklist", async () => await listBlocklist())

  .delete("/blocklist/:jid", async ({ params }) => {
    await removeFromBlocklist(decodeURIComponent(params.jid));
    return { ok: true };
  });
