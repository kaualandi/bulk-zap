import IORedis from "ioredis";
import { env } from "./env.js";

export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

export function createBullConnection() {
  return new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
}
