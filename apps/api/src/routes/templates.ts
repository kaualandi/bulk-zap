import { Elysia, t } from "elysia";
import { and, eq } from "drizzle-orm";
import { templates } from "@bulk-zap/db";
import { db } from "../db.js";
import { authPlugin } from "../lib/auth-middleware.js";

function extractVariables(body: string): string[] {
  const set = new Set<string>();
  for (const match of body.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) {
    if (match[1]) set.add(match[1]);
  }
  return [...set];
}

export const templatesRoutes = new Elysia({ prefix: "/templates" })
  .use(authPlugin)
  .get(
    "/",
    async ({ organizationId }) =>
      await db
        .select()
        .from(templates)
        .where(eq(templates.organizationId, organizationId)),
    { auth: true }
  )

  .post(
    "/",
    async ({ body, organizationId }) => {
      const variables = extractVariables(body.body);
      const [row] = await db
        .insert(templates)
        .values({ organizationId, name: body.name, body: body.body, variables })
        .returning();
      return row;
    },
    {
      auth: true,
      body: t.Object({
        name: t.String({ minLength: 1 }),
        body: t.String({ minLength: 1 }),
      }),
    }
  )

  .put(
    "/:id",
    async ({ params, body, organizationId }) => {
      const variables = extractVariables(body.body);
      const [row] = await db
        .update(templates)
        .set({
          name: body.name,
          body: body.body,
          variables,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(templates.id, params.id),
            eq(templates.organizationId, organizationId)
          )
        )
        .returning();
      if (!row) return new Response("not found", { status: 404 });
      return row;
    },
    {
      auth: true,
      body: t.Object({
        name: t.String(),
        body: t.String(),
      }),
    }
  )

  .delete(
    "/:id",
    async ({ params, organizationId }) => {
      await db
        .delete(templates)
        .where(
          and(
            eq(templates.id, params.id),
            eq(templates.organizationId, organizationId)
          )
        );
      return { ok: true };
    },
    { auth: true }
  );
