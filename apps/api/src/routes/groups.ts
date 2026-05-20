import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { groups, groupMemberships } from "@bulk-zap/db";
import { db } from "../db.js";

export const groupsRoutes = new Elysia({ prefix: "/groups" })
  .get(
    "/",
    async ({ query }) => {
      if (query.accountId) {
        const rows = await db
          .select({ group: groups })
          .from(groupMemberships)
          .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
          .where(eq(groupMemberships.accountId, query.accountId));
        return rows.map((r) => r.group);
      }
      return await db.select().from(groups);
    },
    {
      query: t.Object({ accountId: t.Optional(t.String()) }),
    }
  )

  .get("/:id/members", async ({ params }) => {
    const rows = await db
      .select()
      .from(groupMemberships)
      .where(eq(groupMemberships.groupId, params.id));
    return rows;
  });
