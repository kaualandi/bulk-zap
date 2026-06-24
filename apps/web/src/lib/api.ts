export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

type FetchOptions = RequestInit & { json?: unknown };

async function request<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { json, headers, ...rest } = opts;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    cache: "no-store",
    credentials: "include",
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

// ── Billing ──────────────────────────────────────────────────────────────
// Types duplicated here per project convention (no eden treaty).

export type Plan = {
  id: string;
  name: string;
  slug: string;
  monthlyPriceCents: number;
  includedDispatches: number;
  overagePackageSize: number;
  overagePackagePriceCents: number;
  mpPreapprovalPlanId: string | null;
  active: boolean;
  createdAt: string;
};

export type SubscriptionStatus =
  | "pending"
  | "authorized"
  | "paused"
  | "cancelled";

export type BillingStatus = {
  subscription: {
    id: string;
    status: SubscriptionStatus;
    mpPreapprovalId: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    plan: Plan;
  } | null;
  usage: {
    periodStart: string;
    periodEnd: string;
    dispatchCount: number;
    includedDispatches: number;
  };
  // Saldo de créditos de excedente disponíveis (não expira).
  creditBalance: number;
  // Cartão salvo (card-on-file), se houver.
  card: { last4: string; brand: string } | null;
  autoRecharge: {
    enabled: boolean;
    threshold: number | null;
    packageQty: number;
  };
  canDispatch: {
    allowed: boolean;
    reason?: string;
  };
  mercadoPagoConfigured: boolean;
};

export type SubscribeResult = { initPoint: string; preapprovalId: string };

export type OverageResult = {
  initPoint: string;
  preferenceId: string;
  dispatches: number;
  amountCents: number;
};

export type SavedCard = { last4: string; brand: string };

/**
 * Thrown when the billing backend reports Mercado Pago is not configured (503).
 * The UI should hide subscribe/overage buttons when this is caught, mirroring
 * the AI 503 failsafe pattern.
 */
export class MercadoPagoUnavailableError extends Error {
  constructor() {
    super("mercadopago_unavailable");
    this.name = "MercadoPagoUnavailableError";
  }
}

function isUnavailable(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.message.startsWith("API 503") ||
      err.message.includes("mercadopago_unavailable"))
  );
}

export const billing = {
  getPlans: () => api.get<Plan[]>("/billing/plans"),
  getStatus: () => api.get<BillingStatus>("/billing/status"),
  subscribe: async (planId: string): Promise<SubscribeResult> => {
    try {
      return await api.post<SubscribeResult>("/billing/subscribe", { planId });
    } catch (err) {
      if (isUnavailable(err)) throw new MercadoPagoUnavailableError();
      throw err;
    }
  },
  cancel: () => api.post<{ ok: true }>("/billing/cancel"),
  buyOverage: async (packageQty: number): Promise<OverageResult> => {
    try {
      return await api.post<OverageResult>("/billing/overage", { packageQty });
    } catch (err) {
      if (isUnavailable(err)) throw new MercadoPagoUnavailableError();
      throw err;
    }
  },
  saveCard: async (token: string): Promise<SavedCard> => {
    try {
      return await api.post<SavedCard>("/billing/card", { token });
    } catch (err) {
      if (isUnavailable(err)) throw new MercadoPagoUnavailableError();
      throw err;
    }
  },
  removeCard: () => api.delete<{ ok: true }>("/billing/card"),
  setAutoRecharge: (cfg: {
    enabled: boolean;
    threshold: number | null;
    packageQty: number;
  }) => api.put<{ ok: true } | { error: string }>("/billing/auto-recharge", cfg),
};
