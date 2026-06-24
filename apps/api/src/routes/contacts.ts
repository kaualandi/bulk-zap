import { Elysia, t } from "elysia";
import { and, eq, inArray } from "drizzle-orm";
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
      // Normalize + dedup within the batch.
      const seen = new Set<string>();
      const candidates: { jid: string; name: string | null }[] = [];
      for (const row of body.rows) {
        const jid = row.phoneE164.replace(/\D/g, "") + "@s.whatsapp.net";
        if (seen.has(jid)) continue;
        seen.add(jid);
        candidates.push({ jid, name: row.name ?? null });
      }

      // Skip jids the org already has. The unique index is (jid, accountId), so
      // for csv imports with a null accountId NULLs never collide and dupes
      // would accumulate — dedup by (org, jid) in app code instead.
      const jids = candidates.map((c) => c.jid);
      const existing = jids.length
        ? await db
            .select({ jid: contacts.jid })
            .from(contacts)
            .where(
              and(
                eq(contacts.organizationId, organizationId),
                inArray(contacts.jid, jids)
              )
            )
        : [];
      const existingSet = new Set(existing.map((e) => e.jid));
      const toInsert = candidates.filter((c) => !existingSet.has(c.jid));

      if (toInsert.length > 0) {
        await db
          .insert(contacts)
          .values(
            toInsert.map((c) => ({
              organizationId,
              jid: c.jid,
              name: c.name,
              source: "csv_import" as const,
              accountId: body.accountId ?? null,
            }))
          )
          .onConflictDoNothing();
      }
      return { ok: true, count: toInsert.length };
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
