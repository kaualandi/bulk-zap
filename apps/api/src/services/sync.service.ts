import { and, eq, inArray } from "drizzle-orm";
import {
  contacts as contactsTable,
  groups as groupsTable,
  groupMemberships,
} from "@bulk-zap/db";
import { db } from "../db.js";
import type {
  ContactSummary,
  GroupSummary,
} from "../drivers/whatsapp-driver.js";

export async function upsertSyncedContacts(
  accountId: string,
  list: ContactSummary[]
): Promise<void> {
  if (list.length === 0) return;

  for (const c of list) {
    await db
      .insert(contactsTable)
      .values({
        accountId,
        jid: c.jid,
        name: c.name ?? null,
        pushName: c.pushName ?? null,
        source: "whatsapp_sync",
      })
      .onConflictDoUpdate({
        target: [contactsTable.jid, contactsTable.accountId],
        set: {
          name: c.name ?? null,
          pushName: c.pushName ?? null,
          updatedAt: new Date(),
        },
      });
  }
}

export async function upsertSyncedGroups(
  accountId: string,
  list: GroupSummary[]
): Promise<void> {
  if (list.length === 0) return;

  const jids = list.map((g) => g.jid);
  const existing = await db
    .select()
    .from(groupsTable)
    .where(inArray(groupsTable.jid, jids));
  const byJid = new Map(existing.map((g) => [g.jid, g]));

  const now = new Date();
  for (const g of list) {
    const found = byJid.get(g.jid);
    if (found) {
      await db
        .update(groupsTable)
        .set({
          subject: g.subject,
          participantsCount: g.participantsCount,
          lastSyncedAt: now,
        })
        .where(eq(groupsTable.id, found.id));
    } else {
      const inserted = await db
        .insert(groupsTable)
        .values({
          jid: g.jid,
          subject: g.subject,
          participantsCount: g.participantsCount,
          lastSyncedAt: now,
        })
        .returning();
      const row = inserted[0];
      if (row) byJid.set(row.jid, row);
    }
  }

  await db
    .delete(groupMemberships)
    .where(eq(groupMemberships.accountId, accountId));

  for (const g of list) {
    const stored = byJid.get(g.jid);
    if (!stored) continue;
    await db
      .insert(groupMemberships)
      .values({ groupId: stored.id, accountId, syncedAt: now })
      .onConflictDoNothing();
  }
}

export async function listGroupsForAccount(accountId: string) {
  const rows = await db
    .select({
      group: groupsTable,
    })
    .from(groupMemberships)
    .innerJoin(groupsTable, eq(groupsTable.id, groupMemberships.groupId))
    .where(eq(groupMemberships.accountId, accountId));
  return rows.map((r) => r.group);
}

export async function isPoolMemberOfGroup(
  groupId: string,
  accountIds: string[]
): Promise<{ accountId: string; isMember: boolean }[]> {
  if (accountIds.length === 0) return [];
  const rows = await db
    .select()
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.groupId, groupId),
        inArray(groupMemberships.accountId, accountIds)
      )
    );
  const members = new Set(rows.map((r) => r.accountId));
  return accountIds.map((id) => ({
    accountId: id,
    isMember: members.has(id),
  }));
}
