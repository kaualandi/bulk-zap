import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  jsonb,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { whatsappAccounts } from "./whatsapp-accounts.js";

export const eventTypeEnum = pgEnum("event_type", [
  "connected",
  "disconnected",
  "banned",
  "qr_required",
  "qr_scanned",
  "warmup_advanced",
  "message_failed",
  "campaign_high_failure_rate",
  "schedule_missed",
]);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").references(() => whatsappAccounts.id, {
      onDelete: "set null",
    }),
    type: eventTypeEnum("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    notified: boolean("notified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    accountTypeIdx: index("events_account_type_idx").on(
      table.accountId,
      table.type
    ),
    createdAtIdx: index("events_created_at_idx").on(table.createdAt),
  })
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
