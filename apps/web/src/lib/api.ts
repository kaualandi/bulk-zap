export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

type FetchOptions = RequestInit & { json?: unknown };

async function request<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { json, headers, ...rest } = opts;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    cache: "no-store",
    headers: {
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, json?: unknown) =>
    request<T>(path, { method: "POST", json }),
  put: <T>(path: string, json?: unknown) =>
    request<T>(path, { method: "PUT", json }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export type Account = {
  id: string;
  driver: "baileys" | "cloud_api";
  phoneE164: string | null;
  displayName: string;
  status: "disconnected" | "connecting" | "connected" | "banned";
  warmupMode: "off" | "auto" | "manual";
  dailyLimit: number | null;
  dailyUsed: number;
  lastConnectionError: string | null;
  createdAt: string;
};

export type Contact = {
  id: string;
  accountId: string | null;
  jid: string;
  name: string | null;
  pushName: string | null;
  source: "whatsapp_sync" | "csv_import" | "manual";
};

export type Group = {
  id: string;
  jid: string;
  subject: string;
  participantsCount: number | null;
  lastSyncedAt: string | null;
};

export type List = {
  id: string;
  name: string;
  type: "contacts" | "groups";
};

export type Template = {
  id: string;
  name: string;
  body: string;
  variables: string[];
};

export type Campaign = {
  id: string;
  name: string;
  category: "marketing" | "transacional" | "atendimento" | "outros";
  templateId: string;
  listId: string;
  accountPoolIds: string[];
  scheduleAt: string | null;
  jitterMinMs: number;
  jitterMaxMs: number;
  dailyCapPerAccount: number | null;
  status:
    | "draft"
    | "scheduled"
    | "running"
    | "paused"
    | "completed"
    | "failed";
  createdAt: string;
};

export type ValidationResult = {
  ok: boolean;
  cells: {
    groupId: string;
    groupSubject: string;
    accountId: string;
    isMember: boolean;
  }[];
  missing: {
    groupId: string;
    groupSubject: string;
    accountId: string;
  }[];
};
