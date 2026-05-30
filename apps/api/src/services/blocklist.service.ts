import { and, eq } from "drizzle-orm";
import { contactBlocklist } from "@bulk-zap/db";
import { db } from "../db.js";

export async function addToBlocklist(
  organizationId: string,
  jid: string,
  reason: string,
  source: "auto_opt_out" | "manual" | "imported" = "auto_opt_out"
): Promise<void> {
  await db
    .insert(contactBlocklist)
    .values({ organizationId, jid, reason, source })
    // jid is unique per organization now (composite (organizationId, jid)).
    .onConflictDoNothing({
      target: [contactBlocklist.organizationId, contactBlocklist.jid],
    });
}

export async function removeFromBlocklist(
  organizationId: string,
  jid: string
): Promise<void> {
  await db
    .delete(contactBlocklist)
    .where(
      and(
        eq(contactBlocklist.organizationId, organizationId),
        eq(contactBlocklist.jid, jid)
      )
    );
}

export async function isBlocked(
  organizationId: string,
  jid: string
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(contactBlocklist)
    .where(
      and(
        eq(contactBlocklist.organizationId, organizationId),
        eq(contactBlocklist.jid, jid)
      )
    )
    .limit(1);
  return Boolean(row);
}

export async function listBlocklist(organizationId: string) {
  return await db
    .select()
    .from(contactBlocklist)
    .where(eq(contactBlocklist.organizationId, organizationId));
}
