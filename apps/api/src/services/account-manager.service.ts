import { eq } from "drizzle-orm";
import { inboundMessages, whatsappAccounts } from "@bulk-zap/db";
import { db } from "../db.js";
import { logger } from "../logger.js";
import { BaileysDriver } from "../drivers/baileys-driver.js";
import type {
  DriverEvent,
  DriverListener,
  WhatsAppDriver,
} from "../drivers/whatsapp-driver.js";
import { recordEvent } from "./events.service.js";
import { upsertSyncedContacts, upsertSyncedGroups } from "./sync.service.js";
import { classifyInboundQueue } from "../jobs/queue.js";

const drivers = new Map<string, WhatsAppDriver>();
const lastQr = new Map<string, string>();
const broadcasters = new Map<string, Set<DriverListener>>();

function broadcast(accountId: string, event: DriverEvent) {
  const set = broadcasters.get(accountId);
  if (!set) return;
  set.forEach((l) => {
    try {
      l(event);
    } catch (err) {
      logger.error({ err }, "broadcast listener error");
    }
  });
}

async function setStatus(
  accountId: string,
  status: "disconnected" | "connecting" | "connected" | "banned",
  lastConnectionError?: string
) {
  await db
    .update(whatsappAccounts)
    .set({
      status,
      lastConnectionError: lastConnectionError ?? null,
      lastSeenAt: status === "connected" ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(whatsappAccounts.id, accountId));
}

export async function startAccount(accountId: string): Promise<void> {
  if (drivers.has(accountId)) {
    logger.warn({ accountId }, "driver already started");
    return;
  }

  const driver = new BaileysDriver(accountId);
  drivers.set(accountId, driver);

  driver.on(async (event) => {
    broadcast(accountId, event);

    switch (event.type) {
      case "qr":
        lastQr.set(accountId, event.qr);
        await recordEvent({ accountId, type: "qr_required" });
        break;
      case "connecting":
        await setStatus(accountId, "connecting");
        break;
      case "connected":
        lastQr.delete(accountId);
        await setStatus(accountId, "connected");
        await recordEvent({ accountId, type: "connected" });
        break;
      case "disconnected":
        await setStatus(accountId, "disconnected", event.reason);
        await recordEvent({
          accountId,
          type: "disconnected",
          payload: { reason: event.reason, statusCode: event.statusCode },
        });
        break;
      case "banned":
        await setStatus(accountId, "banned", event.reason);
        await recordEvent({
          accountId,
          type: "banned",
          payload: { reason: event.reason, statusCode: event.statusCode },
        });
        drivers.delete(accountId);
        break;
      case "contacts-updated":
        await upsertSyncedContacts(accountId, event.contacts);
        break;
      case "groups-updated":
        await upsertSyncedGroups(accountId, event.groups);
        break;
      case "inbound-message": {
        const [row] = await db
          .insert(inboundMessages)
          .values({
            accountId,
            fromJid: event.fromJid,
            text: event.text,
          })
          .returning();
        if (row) {
          await classifyInboundQueue.add(
            "classify",
            { inboundMessageId: row.id },
            { attempts: 2, backoff: { type: "exponential", delay: 10_000 } }
          );
        }
        break;
      }
    }
  });

  await driver.connect();
}

export async function stopAccount(accountId: string): Promise<void> {
  const driver = drivers.get(accountId);
  if (!driver) return;
  await driver.disconnect();
  drivers.delete(accountId);
  await setStatus(accountId, "disconnected");
}

export async function logoutAccount(accountId: string): Promise<void> {
  const driver = drivers.get(accountId);
  if (driver) {
    await driver.logout();
    drivers.delete(accountId);
  }
  await setStatus(accountId, "disconnected");
}

export function getDriver(accountId: string): WhatsAppDriver | undefined {
  return drivers.get(accountId);
}

export function getLastQr(accountId: string): string | undefined {
  return lastQr.get(accountId);
}

export function subscribe(
  accountId: string,
  listener: DriverListener
): () => void {
  let set = broadcasters.get(accountId);
  if (!set) {
    set = new Set();
    broadcasters.set(accountId, set);
  }
  set.add(listener);
  return () => set!.delete(listener);
}

export async function bootAllConnected(): Promise<void> {
  const accounts = await db
    .select()
    .from(whatsappAccounts)
    .where(eq(whatsappAccounts.driver, "baileys"));

  for (const acc of accounts) {
    if (acc.status === "banned") continue;
    try {
      await startAccount(acc.id);
    } catch (err) {
      logger.error({ err, accountId: acc.id }, "failed to boot account");
    }
  }
}
