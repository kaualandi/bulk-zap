import { eq } from "drizzle-orm";
import { contactBlocklist } from "@bulk-zap/db";
import { db } from "../db.js";

export async function addToBlocklist(
  jid: string,
  reason: string,
  source: "auto_opt_out" | "manual" | "imported" = "auto_opt_out"
): Promise<void> {
  await db
    .insert(contactBlocklist)
    .values({ jid, reason, source })
    .onConflictDoNothing();
}

export async function removeFromBlocklist(jid: string): Promise<void> {
  await db.delete(contactBlocklist).where(eq(contactBlocklist.jid, jid));
}

export async function isBlocked(jid: string): Promise<boolean> {
  const [row] = await db
    .select()
    .from(contactBlocklist)
    .where(eq(contactBlocklist.jid, jid))
    .limit(1);
  return Boolean(row);
}

export async function listBlocklist() {
  return await db.select().from(contactBlocklist);
}
