import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";

export const emailSubscriptions = pgTable("email_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  eventTypes: jsonb("event_types").$type<string[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type EmailSubscription = typeof emailSubscriptions.$inferSelect;
export type NewEmailSubscription = typeof emailSubscriptions.$inferInsert;
