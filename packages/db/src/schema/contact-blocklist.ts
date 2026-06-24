import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";

export const blocklistSourceEnum = pgEnum("blocklist_source", [
  "auto_opt_out",
  "manual",
  "imported",
]);

export const contactBlocklist = pgTable(
  "contact_blocklist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jid: text("jid").notNull(),
    reason: text("reason"),
    source: blocklistSourceEnum("source").notNull().default("auto_opt_out"),
    blockedAt: timestamp("blocked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // jid is unique per organization now (was globally unique before).
    orgJidUnique: uniqueIndex("contact_blocklist_org_jid_unique").on(
      table.organizationId,
      table.jid
    ),
  })
);

export type BlocklistEntry = typeof contactBlocklist.$inferSelect;
export type NewBlocklistEntry = typeof contactBlocklist.$inferInsert;
