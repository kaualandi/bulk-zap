import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { emailSubscriptions } from "@bulk-zap/db";
import { db } from "../db.js";

export const emailSubscriptionsRoutes = new Elysia({
  prefix: "/email-subscriptions",
})
  .get("/", async () => await db.select().from(emailSubscriptions))

  .post(
    "/",
    async ({ body }) => {
      const [row] = await db
        .insert(emailSubscriptions)
        .values({
          email: body.email,
          eventTypes: body.eventTypes ?? [],
          active: true,
        })
        .returning();
      return row;
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        eventTypes: t.Optional(t.Array(t.String())),
      }),
    }
  )

  .delete("/:id", async ({ params }) => {
    await db
      .delete(emailSubscriptions)
      .where(eq(emailSubscriptions.id, params.id));
    return { ok: true };
  });
