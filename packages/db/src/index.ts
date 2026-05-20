import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index.js";

export type Database = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString, max: 10 });
  return drizzle(pool, { schema, logger: false });
}

export * from "./schema/index.js";
export { schema };
