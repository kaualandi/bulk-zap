import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { whatsappAccounts } from "./whatsapp-accounts.js";

export const contactSourceEnum = pgEnum("contact_source", [
  "whatsapp_sync",
  "csv_import",
  "manual",
]);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").references(() => whatsappAccounts.id, {
      onDelete: "set null",
    }),
    jid: text("jid").notNull(),
    name: text("name"),
    pushName: text("push_name"),
    source: contactSourceEnum("source").notNull().default("whatsapp_sync"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    jidAccountIdx: uniqueIndex("contacts_jid_account_unique").on(
      table.jid,
      table.accountId
    ),
  })
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
