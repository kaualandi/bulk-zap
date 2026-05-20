import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  primaryKey,
} from "drizzle-orm/pg-core";

export const listTypeEnum = pgEnum("list_type", ["contacts", "groups"]);
export const listMemberTypeEnum = pgEnum("list_member_type", [
  "contact",
  "group",
]);

export const lists = pgTable("lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: listTypeEnum("type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const listMembers = pgTable(
  "list_members",
  {
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    targetType: listMemberTypeEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.listId, table.targetType, table.targetId],
    }),
  })
);

export type List = typeof lists.$inferSelect;
export type NewList = typeof lists.$inferInsert;
export type ListMember = typeof listMembers.$inferSelect;
