import { and, eq, inArray } from "drizzle-orm";
import {
  groupMemberships,
  groups as groupsTable,
  listMembers,
  lists,
} from "@bulk-zap/db";
import { db } from "../db.js";

export type ValidationCell = {
  groupId: string;
  groupSubject: string;
  accountId: string;
  isMember: boolean;
};

export type ValidationResult = {
  ok: boolean;
  cells: ValidationCell[];
  missing: ValidationCell[];
};

export async function validatePoolGroupMembership(
  listId: string,
  accountPoolIds: string[],
  organizationId: string
): Promise<ValidationResult> {
  const [list] = await db
    .select()
    .from(lists)
    .where(and(eq(lists.id, listId), eq(lists.organizationId, organizationId)))
    .limit(1);
  if (!list) throw new Error("list not found");
  if (list.type !== "groups") {
    return { ok: true, cells: [], missing: [] };
  }

  const memberRows = await db
    .select()
    .from(listMembers)
    .where(eq(listMembers.listId, listId));
  const groupIds = memberRows
    .filter((m) => m.targetType === "group")
    .map((m) => m.targetId);

  if (groupIds.length === 0 || accountPoolIds.length === 0) {
    return { ok: true, cells: [], missing: [] };
  }

  const groupRows = await db
    .select()
    .from(groupsTable)
    .where(
      and(
        eq(groupsTable.organizationId, organizationId),
        inArray(groupsTable.id, groupIds)
      )
    );
  const groupById = new Map(groupRows.map((g) => [g.id, g]));

  const memberships = await db
    .select()
    .from(groupMemberships)
    .where(
      and(
        inArray(groupMemberships.groupId, groupIds),
        inArray(groupMemberships.accountId, accountPoolIds)
      )
    );
  const membershipSet = new Set(
    memberships.map((m) => `${m.groupId}:${m.accountId}`)
  );

  const cells: ValidationCell[] = [];
  for (const groupId of groupIds) {
    const group = groupById.get(groupId);
    if (!group) continue;
    for (const accountId of accountPoolIds) {
      cells.push({
        groupId,
        groupSubject: group.subject,
        accountId,
        isMember: membershipSet.has(`${groupId}:${accountId}`),
      });
    }
  }

  const missing = cells.filter((c) => !c.isMember);
  return { ok: missing.length === 0, cells, missing };
}
