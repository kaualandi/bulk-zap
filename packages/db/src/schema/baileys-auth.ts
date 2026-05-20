import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";
import { whatsappAccounts } from "./whatsapp-accounts.js";

export const baileysCreds = pgTable("baileys_creds", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => whatsappAccounts.id, { onDelete: "cascade" }),
  creds: jsonb("creds").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const baileysKeys = pgTable(
  "baileys_keys",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => whatsappAccounts.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    keyId: text("key_id").notNull(),
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.accountId, table.type, table.keyId] }),
  })
);

export type BaileysCreds = typeof baileysCreds.$inferSelect;
export type BaileysKey = typeof baileysKeys.$inferSelect;
