import {
  pgTable,
  uuid,
  text,
  timestamp,
  primaryKey,
  integer,
} from "drizzle-orm/pg-core";
import { whatsappAccounts } from "./whatsapp-accounts.js";

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  jid: text("jid").notNull().unique(),
  subject: text("subject").notNull(),
  participantsCount: integer("participants_count"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
