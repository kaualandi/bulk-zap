import { Resend } from "resend";
import { and, eq } from "drizzle-orm";
import { emailSubscriptions, whatsappAccounts } from "@bulk-zap/db";
import { db } from "../db.js";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { redis } from "../redis.js";

const THROTTLE_WINDOW_S = 15 * 60;

let client: Resend | null = null;
function getClient(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(env.RESEND_API_KEY);
  return client;
}

type AlertInput = {
  accountId: string | null;
  eventType: string;
  subject: string;
  text: string;
};

export async function sendAlert(input: AlertInput): Promise<void> {
  const c = getClient();
  if (!c) {
    logger.warn({ input }, "alert skipped: Resend not configured");
    return;
  }

  const throttleKey = `alert:throttle:${input.accountId ?? "global"}:${input.eventType}`;
  const exists = await redis.set(throttleKey, "1", "EX", THROTTLE_WINDOW_S, "NX");
  if (exists === null) {
    logger.debug({ input }, "alert throttled");
    return;
  }

  // Alerts are account-scoped: only notify subscriptions in the account's org.
  // Without an accountId we cannot attribute an org, so skip (no global fan-out
  // across tenants).
  let organizationId: string | null = null;
  if (input.accountId) {
    const [acc] = await db
      .select({ organizationId: whatsappAccounts.organizationId })
      .from(whatsappAccounts)
      .where(eq(whatsappAccounts.id, input.accountId))
      .limit(1);
    organizationId = acc?.organizationId ?? null;
  }
  if (!organizationId) {
    logger.warn(
      { input },
      "alert skipped: no org resolvable from accountId (would cross tenants)"
    );
    return;
  }

  const subs = await db
    .select()
    .from(emailSubscriptions)
    .where(
      and(
        eq(emailSubscriptions.organizationId, organizationId),
        eq(emailSubscriptions.active, true)
      )
    );
  const recipients = subs
    .filter((s) => s.eventTypes.length === 0 || s.eventTypes.includes(input.eventType))
    .map((s) => s.email);

  if (recipients.length === 0) {
    logger.debug({ input }, "no recipients subscribed for this event");
    return;
  }

  try {
    await c.emails.send({
      from: env.ALERT_EMAIL_FROM,
      to: recipients,
      subject: input.subject,
      text: input.text,
    });
  } catch (err) {
    logger.error({ err, input }, "failed to send alert");
  }
}
