import { Elysia, t } from "elysia";
import { and, eq } from "drizzle-orm";
import { groups, groupMemberships } from "@bulk-zap/db";
import { db } from "../db.js";
import { authPlugin } from "../lib/auth-middleware.js";

export const groupsRoutes = new Elysia({ prefix: "/groups" })
  .use(authPlugin)
  .get(
    "/",
    async ({ query, organizationId }) => {
      if (query.accountId) {
        // group_memberships is a child table; scope through groups.organizationId.
        const rows = await db
          .select({ group: groups })
          .from(groupMemberships)
          .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
          .where(
            and(
              eq(groupMemberships.accountId, query.accountId),
              eq(groups.organizationId, organizationId)
            )
          );
        return rows.map((r) => r.group);
      }
      return await db
        .select()
        .from(groups)
        .where(eq(groups.organizationId, organizationId));
    },
    {
      auth: true,
      query: t.Object({ accountId: t.Optional(t.String()) }),
    }
  )

  .get(
    "/:id/members",
    async ({ params, organizationId }) => {
      // Verify the parent group belongs to the org before exposing members.
      const [grp] = await db
        .select()
        .from(groups)
        .where(
          and(
            eq(groups.id, params.id),
            eq(groups.organizationId, organizationId)
          )
        )
        .limit(1);
      if (!grp) return new Response("not found", { status: 404 });
      return await db
        .select()
        .from(groupMemberships)
        .where(eq(groupMemberships.groupId, params.id));
    },
    { auth: true }
  );
