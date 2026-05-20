import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { lists, listMembers } from "@bulk-zap/db";
import { db } from "../db.js";

export const listsRoutes = new Elysia({ prefix: "/lists" })
  .get("/", async () => await db.select().from(lists))

  .post(
    "/",
    async ({ body }) => {
      const [row] = await db
        .insert(lists)
        .values({ name: body.name, type: body.type })
        .returning();
      return row;
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        type: t.Union([t.Literal("contacts"), t.Literal("groups")]),
      }),
    }
  )

  .get("/:id/members", async ({ params }) => {
    return await db
      .select()
      .from(listMembers)
      .where(eq(listMembers.listId, params.id));
  })

  .post(
    "/:id/members",
    async ({ params, body }) => {
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

  .delete("/:id", async ({ params }) => {
    await db.delete(lists).where(eq(lists.id, params.id));
    return { ok: true };
  });
