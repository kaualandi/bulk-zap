import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { templates } from "@bulk-zap/db";
import { db } from "../db.js";

function extractVariables(body: string): string[] {
  const set = new Set<string>();
  for (const match of body.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) {
    if (match[1]) set.add(match[1]);
  }
  return [...set];
}

export const templatesRoutes = new Elysia({ prefix: "/templates" })
  .get("/", async () => await db.select().from(templates))

  .post(
    "/",
    async ({ body }) => {
      const variables = extractVariables(body.body);
      const [row] = await db
        .insert(templates)
        .values({ name: body.name, body: body.body, variables })
        .returning();
      return row;
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        body: t.String({ minLength: 1 }),
      }),
    }
  )

  .put(
    "/:id",
    async ({ params, body }) => {
      const variables = extractVariables(body.body);
      const [row] = await db
        .update(templates)
        .set({
          name: body.name,
          body: body.body,
          variables,
          updatedAt: new Date(),
        })
        .where(eq(templates.id, params.id))
        .returning();
      return row;
    },
    {
      body: t.Object({
        name: t.String(),
        body: t.String(),
      }),
    }
  )

  .delete("/:id", async ({ params }) => {
    await db.delete(templates).where(eq(templates.id, params.id));
    return { ok: true };
  });
