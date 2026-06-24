import {
  initAuthCreds,
  BufferJSON,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
  type SignalKeyStore,
} from "@whiskeysockets/baileys";
import { and, eq, inArray, sql } from "drizzle-orm";
import { baileysCreds, baileysKeys } from "@bulk-zap/db";
import { db } from "../db.js";
import { logger } from "../logger.js";

type SignalCategory = keyof SignalDataTypeMap;

function reviveJson<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value), BufferJSON.reviver) as T;
}

function serialize(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, BufferJSON.replacer));
}

export async function usePostgresAuthState(accountId: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const existing = await db
    .select()
    .from(baileysCreds)
    .where(eq(baileysCreds.accountId, accountId))
    .limit(1);

  const creds: AuthenticationCreds = existing[0]
    ? reviveJson<AuthenticationCreds>(existing[0].creds)
    : initAuthCreds();

  const keys: SignalKeyStore = {
    async get(type, ids) {
      if (ids.length === 0) return {};
      const rows = await db
        .select()
        .from(baileysKeys)
        .where(
          and(
            eq(baileysKeys.accountId, accountId),
            eq(baileysKeys.type, type as string),
            inArray(baileysKeys.keyId, ids)
          )
        );

      const out: { [id: string]: SignalDataTypeMap[typeof type] } = {};
      for (const row of rows) {
        let value = reviveJson<SignalDataTypeMap[typeof type]>(row.value);
        if (type === "app-state-sync-key") {
          value = proto.Message.AppStateSyncKeyData.fromObject(
            value as object
          ) as unknown as SignalDataTypeMap[typeof type];
        }
        out[row.keyId] = value;
      }
      return out;
    },

    async set(data) {
      type Row = {
        accountId: string;
        type: string;
        keyId: string;
        value: object;
      };
      const rowsToUpsert: Row[] = [];
      const deletesByType = new Map<string, string[]>();

      for (const rawCategory of Object.keys(data)) {
        const category = rawCategory as SignalCategory;
        const bucket = data[category];
        if (!bucket) continue;

        for (const id of Object.keys(bucket)) {
          const value = bucket[id];
          if (value) {
            rowsToUpsert.push({
              accountId,
              type: category as string,
              keyId: id,
              value: serialize(value) as object,
            });
          } else {
            const list = deletesByType.get(category as string) ?? [];
            list.push(id);
            deletesByType.set(category as string, list);
          }
        }
      }

      try {
        if (rowsToUpsert.length > 0) {
          await db
            .insert(baileysKeys)
            .values(rowsToUpsert)
            .onConflictDoUpdate({
              target: [
                baileysKeys.accountId,
                baileysKeys.type,
                baileysKeys.keyId,
              ],
              set: {
                value: sql`excluded.value`,
                updatedAt: sql`now()`,
              },
            });
        }

        for (const [type, ids] of deletesByType) {
          await db
            .delete(baileysKeys)
            .where(
              and(
                eq(baileysKeys.accountId, accountId),
                eq(baileysKeys.type, type),
                inArray(baileysKeys.keyId, ids)
              )
            );
        }
      } catch (err) {
        logger.error(
          {
            err,
            accountId,
            upsertCount: rowsToUpsert.length,
            deleteTypes: [...deletesByType.keys()],
          },
          "session-store set failed"
        );
        throw err;
      }
    },
  };

  const saveCreds = async () => {
    const payload = serialize(creds);
    await db
      .insert(baileysCreds)
      .values({ accountId, creds: payload as object })
      .onConflictDoUpdate({
        target: baileysCreds.accountId,
        set: { creds: payload as object, updatedAt: new Date() },
      });
  };

  return { state: { creds, keys }, saveCreds };
}

export async function clearAuthState(accountId: string): Promise<void> {
  await db
    .delete(baileysKeys)
    .where(eq(baileysKeys.accountId, accountId));
  await db.delete(baileysCreds).where(eq(baileysCreds.accountId, accountId));
}
