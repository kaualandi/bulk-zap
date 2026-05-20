import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  doublePrecision,
  index,
} from "drizzle-orm/pg-core";
import { whatsappAccounts } from "./whatsapp-accounts.js";

export const inboundClassificationEnum = pgEnum("inbound_classification", [
  "opt_out",
  "interesse",
  "duvida",
  "reclamacao",
  "outro",
]);

export const inboundMessages = pgTable(
  "inbound_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => whatsappAccounts.id, { onDelete: "cascade" }),
    fromJid: text("from_jid").notNull(),
    text: text("text").notNull(),
    classification: inboundClassificationEnum("classification"),
    confidence: doublePrecision("confidence"),
    classifiedAt: timestamp("classified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    accountIdx: index("inbound_account_idx").on(table.accountId),
    classifIdx: index("inbound_classif_idx").on(table.classification),
  })
);

export type InboundMessage = typeof inboundMessages.$inferSelect;
export type NewInboundMessage = typeof inboundMessages.$inferInsert;
