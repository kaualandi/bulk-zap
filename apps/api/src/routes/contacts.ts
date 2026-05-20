import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { contacts } from "@bulk-zap/db";
import { db } from "../db.js";

export const contactsRoutes = new Elysia({ prefix: "/contacts" })
  .get(
    "/",
    async ({ query }) => {
      const base = db.select().from(contacts);
      const rows = query.accountId
        ? await base.where(eq(contacts.accountId, query.accountId))
        : await base;
      return rows;
    },
    {
      query: t.Object({
        accountId: t.Optional(t.String()),
      }),
    }
  )

  .post(
    "/import-csv",
    async ({ body }) => {
      const inserted: { jid: string }[] = [];
      for (const row of body.rows) {
        const jid = row.phoneE164.replace(/\D/g, "") + "@s.whatsapp.net";
        await db
          .insert(contacts)
          .values({
            jid,
            name: row.name ?? null,
            source: "csv_import",
            accountId: body.accountId ?? null,
          })
          .onConflictDoNothing();
        inserted.push({ jid });
      }
      return { ok: true, count: inserted.length };
    },
    {
      body: t.Object({
        accountId: t.Optional(t.String()),
        rows: t.Array(
          t.Object({
            phoneE164: t.String(),
            name: t.Optional(t.String()),
          })
        ),
      }),
    }
  );
