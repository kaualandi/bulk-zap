import { Elysia, t } from "elysia";
import { and, eq, inArray } from "drizzle-orm";
import { contacts, groups, lists, listMembers } from "@bulk-zap/db";
import { db } from "../db.js";
import { authPlugin } from "../lib/auth-middleware.js";

/** Returns the list row only if it belongs to the org; null otherwise. */
async function getOwnedList(id: string, organizationId: string) {
  const [row] = await db
    .select()
    .from(lists)
    .where(and(eq(lists.id, id), eq(lists.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

/**
 * True only if every supplied member targets a contact/group owned by the org.
 * Prevents a tenant from seeding their list with another org's contact/group
 * ids and then dispatching to (or reading) them via campaign launch.
 */
async function membersOwnedByOrg(
  members: { targetType: "contact" | "group"; targetId: string }[],
  organizationId: string
): Promise<boolean> {
  const contactIds = members
    .filter((m) => m.targetType === "contact")
    .map((m) => m.targetId);
  const groupIds = members
    .filter((m) => m.targetType === "group")
    .map((m) => m.targetId);

  if (contactIds.length > 0) {
    const owned = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          inArray(contacts.id, contactIds),
          eq(contacts.organizationId, organizationId)
        )
      );
    if (new Set(owned.map((r) => r.id)).size !== new Set(contactIds).size)
      return false;
  }
  if (groupIds.length > 0) {
    const owned = await db
      .select({ id: groups.id })
      .from(groups)
      .where(
        and(
          inArray(groups.id, groupIds),
          eq(groups.organizationId, organizationId)
        )
      );
    if (new Set(owned.map((r) => r.id)).size !== new Set(groupIds).size)
      return false;
  }
  return true;
}

export const listsRoutes = new Elysia({ prefix: "/lists" })
  .use(authPlugin)
  .get(
    "/",
    async ({ organizationId }) =>
      await db
        .select()
        .from(lists)
        .where(eq(lists.organizationId, organizationId)),
    { auth: true }
  )

  .post(
    "/",
    async ({ body, organizationId }) => {
      const [row] = await db
        .insert(lists)
        .values({ organizationId, name: body.name, type: body.type })
        .returning();
      return row;
    },
    {
      auth: true,
      body: t.Object({
        name: t.String({ minLength: 1 }),
        type: t.Union([t.Literal("contacts"), t.Literal("groups")]),
      }),
    }
  )

  .get(
    "/:id/members",
    async ({ params, organizationId }) => {
      if (!(await getOwnedList(params.id, organizationId)))
        return new Response("not found", { status: 404 });
      return await db
        .select()
        .from(listMembers)
        .where(eq(listMembers.listId, params.id));
    },
    { auth: true }
  )

  .post(
    "/:id/members",
    async ({ params, body, organizationId }) => {
      if (!(await getOwnedList(params.id, organizationId)))
        return new Response("not found", { status: 404 });
      if (!(await membersOwnedByOrg(body.members, organizationId)))
        return new Response("target not found", { status: 404 });
      for (const m of body.members) {
        await db
          .insert(listMembers)
          .values({
            listId: params.id,
            targetType: m.targetType,
            targetId: m.targetId,
          })
          .onConflictDoNothing();
      }
      return { ok: true, count: body.members.length };
    },
    {
      auth: true,
      body: t.Object({
        members: t.Array(
          t.Object({
            targetType: t.Union([t.Literal("contact"), t.Literal("group")]),
            targetId: t.String(),
          })
        ),
      }),
    }
  )

  .delete(
    "/:id",
    async ({ params, organizationId }) => {
      await db
        .delete(lists)
        .where(
          and(eq(lists.id, params.id), eq(lists.organizationId, organizationId))
        );
      return { ok: true };
    },
    { auth: true }
  );
