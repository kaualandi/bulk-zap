import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { campaignRuns } from "./campaigns.js";
import { whatsappAccounts } from "./whatsapp-accounts.js";

export const messageStatusEnum = pgEnum("message_status", [
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
  "canceled",
]);

export const messageTargetTypeEnum = pgEnum("message_target_type", [
  "contact",
  "group",
]);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignRunId: uuid("campaign_run_id")
      .notNull()
      .references(() => campaignRuns.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => whatsappAccounts.id, { onDelete: "restrict" }),
    targetJid: text("target_jid").notNull(),
    targetType: messageTargetTypeEnum("target_type").notNull(),
    body: text("body").notNull(),
    status: messageStatusEnum("status").notNull().default("queued"),
    error: text("error"),
    bullJobId: text("bull_job_id"),
    providerMsgId: text("provider_msg_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    runIdx: index("messages_run_idx").on(table.campaignRunId),
    accountIdx: index("messages_account_idx").on(table.accountId),
    statusIdx: index("messages_status_idx").on(table.status),
  })
);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
