import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";

export const blocklistSourceEnum = pgEnum("blocklist_source", [
  "auto_opt_out",
  "manual",
  "imported",
]);

export const contactBlocklist = pgTable("contact_blocklist", {
  id: uuid("id").primaryKey().defaultRandom(),
  jid: text("jid").notNull().unique(),
  reason: text("reason"),
  source: blocklistSourceEnum("source").notNull().default("auto_opt_out"),
  blockedAt: timestamp("blocked_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type BlocklistEntry = typeof contactBlocklist.$inferSelect;
export type NewBlocklistEntry = typeof contactBlocklist.$inferInsert;
