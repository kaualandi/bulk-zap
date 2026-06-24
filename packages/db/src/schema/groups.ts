import {
  pgTable,
  uuid,
  text,
  timestamp,
  primaryKey,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { whatsappAccounts } from "./whatsapp-accounts.js";
import { organizations } from "./organizations.js";

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jid: text("jid").notNull(),
    subject: text("subject").notNull(),
    participantsCount: integer("participants_count"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // jid is unique per organization now (was globally unique before).
    orgJidUnique: uniqueIndex("groups_org_jid_unique").on(
      table.organizationId,
      table.jid
    ),
    orgIdx: index("groups_org_idx").on(table.organizationId),
  })
);

export const groupMemberships = pgTable(
  "group_memberships",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => whatsappAccounts.id, { onDelete: "cascade" }),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.groupId, table.accountId] }),
  })
);

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupMembership = typeof groupMemberships.$inferSelect;
