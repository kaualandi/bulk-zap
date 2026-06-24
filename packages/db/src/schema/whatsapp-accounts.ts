import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";

export const driverEnum = pgEnum("whatsapp_driver", ["baileys", "cloud_api"]);
export const accountStatusEnum = pgEnum("account_status", [
  "disconnected",
  "connecting",
  "connected",
  "banned",
]);
export const warmupModeEnum = pgEnum("warmup_mode", ["off", "auto", "manual"]);

export const whatsappAccounts = pgTable(
  "whatsapp_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    driver: driverEnum("driver").notNull().default("baileys"),
    phoneE164: text("phone_e164"),
    displayName: text("display_name").notNull(),
    status: accountStatusEnum("status").notNull().default("disconnected"),

    warmupMode: warmupModeEnum("warmup_mode").notNull().default("off"),
    dailyLimit: integer("daily_limit"),
    dailyUsed: integer("daily_used").notNull().default(0),
    dailyResetAt: timestamp("daily_reset_at", { withTimezone: true }),
    warmupStartedAt: timestamp("warmup_started_at", { withTimezone: true }),

    lastConnectionError: text("last_connection_error"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),

    cloudApiPhoneId: text("cloud_api_phone_id"),
    cloudApiTokenCipher: text("cloud_api_token_cipher"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdx: index("whatsapp_accounts_org_idx").on(table.organizationId),
  })
);

export type WhatsappAccount = typeof whatsappAccounts.$inferSelect;
export type NewWhatsappAccount = typeof whatsappAccounts.$inferInsert;
