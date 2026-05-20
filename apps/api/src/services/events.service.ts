import { events, eventTypeEnum } from "@bulk-zap/db";
import { db } from "../db.js";
import { logger } from "../logger.js";

type EventType = (typeof eventTypeEnum.enumValues)[number];

type EventInput = {
  accountId?: string | null;
  type: EventType;
  payload?: Record<string, unknown>;
};

export async function recordEvent(input: EventInput): Promise<void> {
  try {
    await db.insert(events).values({
      accountId: input.accountId ?? null,
      type: input.type,
      payload: input.payload ?? {},
    });
  } catch (err) {
    logger.error({ err, input }, "failed to record event");
  }
}
