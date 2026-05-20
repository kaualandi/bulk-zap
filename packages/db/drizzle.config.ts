import type { Config } from "drizzle-kit";

const url =
  process.env.DATABASE_URL ??
  "postgres://bulkzap:bulkzap@localhost:5432/bulkzap";

export default {
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
} satisfies Config;
