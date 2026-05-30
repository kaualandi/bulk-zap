import { Elysia, t } from "elysia";
import { and, eq } from "drizzle-orm";
import { contacts } from "@bulk-zap/db";
import { db } from "../db.js";
import { authPlugin } from "../lib/auth-middleware.js";

export const contactsRoutes = new Elysia({ prefix: "/contacts" })
  .use(authPlugin)
  .get(
    "/",
    async ({ query, organizationId }) => {
      const where = query.accountId
        ? and(
            eq(contacts.organizationId, organizationId),
            eq(contacts.accountId, query.accountId)
          )
        : eq(contacts.organizationId, organizationId);
      return await db.select().from(contacts).where(where);
    },
    {
      auth: true,
      query: t.Object({
        accountId: t.Optional(t.String()),
      }),
    }
  )

  .post(
    "/import-csv",
    async ({ body, organizationId }) => {
      const inserted: { jid: string }[] = [];
      for (const row of body.rows) {
        const jid = row.phoneE164.replace(/\D/g, "") + "@s.whatsapp.net";
        await db
          .insert(contacts)
          .values({
            organizationId,
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
      auth: true,
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
