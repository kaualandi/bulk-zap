import {
  initAuthCreds,
  BufferJSON,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
  type SignalKeyStore,
} from "@whiskeysockets/baileys";
import { and, eq, inArray } from "drizzle-orm";
import { baileysCreds, baileysKeys } from "@bulk-zap/db";
import { db } from "../db.js";

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
      const inserts: Promise<unknown>[] = [];
      for (const rawCategory of Object.keys(data)) {
        const category = rawCategory as SignalCategory;
        const bucket = data[category];
        if (!bucket) continue;

        for (const id of Object.keys(bucket)) {
          const value = bucket[id];
          if (value) {
            const payload = serialize(value);
            inserts.push(
              db
                .insert(baileysKeys)
                .values({
                  accountId,
                  type: category as string,
                  keyId: id,
                  value: payload as object,
                })
                .onConflictDoUpdate({
                  target: [
                    baileysKeys.accountId,
                    baileysKeys.type,
                    baileysKeys.keyId,
                  ],
                  set: { value: payload as object, updatedAt: new Date() },
                })
            );
          } else {
            inserts.push(
              db
                .delete(baileysKeys)
                .where(
                  and(
                    eq(baileysKeys.accountId, accountId),
                    eq(baileysKeys.type, category as string),
                    eq(baileysKeys.keyId, id)
                  )
                )
            );
          }
        }
      }
      await Promise.all(inserts);
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
