import { Elysia, t } from "elysia";
import { and, eq } from "drizzle-orm";
import { emailSubscriptions } from "@bulk-zap/db";
import { db } from "../db.js";
import { authPlugin } from "../lib/auth-middleware.js";

export const emailSubscriptionsRoutes = new Elysia({
  prefix: "/email-subscriptions",
})
  .use(authPlugin)
  .get(
    "/",
    async ({ organizationId }) =>
      await db
        .select()
        .from(emailSubscriptions)
        .where(eq(emailSubscriptions.organizationId, organizationId)),
    { auth: true }
  )

  .post(
    "/",
    async ({ body, organizationId }) => {
      const [row] = await db
        .insert(emailSubscriptions)
        .values({
          organizationId,
          email: body.email,
          eventTypes: body.eventTypes ?? [],
          active: true,
        })
        .returning();
      return row;
    },
    {
      auth: true,
      body: t.Object({
        email: t.String({ format: "email" }),
        eventTypes: t.Optional(t.Array(t.String())),
      }),
    }
  )

  .delete(
    "/:id",
    async ({ params, organizationId }) => {
      const deleted = await db
        .delete(emailSubscriptions)
        .where(
          and(
            eq(emailSubscriptions.id, params.id),
            eq(emailSubscriptions.organizationId, organizationId)
          )
        )
        .returning({ id: emailSubscriptions.id });
      if (deleted.length === 0)
        return new Response("not found", { status: 404 });
      return { ok: true };
    },
    { auth: true }
  );
