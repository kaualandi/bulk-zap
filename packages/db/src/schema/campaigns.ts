import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { templates } from "./templates.js";
import { lists } from "./lists.js";

export const campaignCategoryEnum = pgEnum("campaign_category", [
  "marketing",
  "transacional",
  "atendimento",
  "outros",
]);

export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "scheduled",
  "running",
  "paused",
  "completed",
  "failed",
  "canceled",
]);

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  category: campaignCategoryEnum("category").notNull().default("outros"),
  templateId: uuid("template_id")
    .notNull()
    .references(() => templates.id, { onDelete: "restrict" }),
  listId: uuid("list_id")
    .notNull()
    .references(() => lists.id, { onDelete: "restrict" }),
  accountPoolIds: jsonb("account_pool_ids").$type<string[]>().notNull(),
  scheduleAt: timestamp("schedule_at", { withTimezone: true }),
  jitterMinMs: integer("jitter_min_ms").notNull().default(15000),
  jitterMaxMs: integer("jitter_max_ms").notNull().default(90000),
  dailyCapPerAccount: integer("daily_cap_per_account"),
  status: campaignStatusEnum("status").notNull().default("draft"),
  marketingConsentConfirmed: text("marketing_consent_confirmed"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const campaignRuns = pgTable("campaign_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: campaignStatusEnum("status").notNull().default("running"),
  totalTargets: integer("total_targets").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
});

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
export type CampaignRun = typeof campaignRuns.$inferSelect;
export type NewCampaignRun = typeof campaignRuns.$inferInsert;
