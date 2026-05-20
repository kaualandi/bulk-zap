"use client";

import { useEffect, useState } from "react";
import { api, type Account } from "@/lib/api";

export type CampaignSuggestion = {
  jitterMinMs: number;
  jitterMaxMs: number;
  recommendedPoolSize: number;
  reasoning: string;
};

type Props = {
  category: string;
  listType?: "contacts" | "groups";
  listSize: number;
  poolAccounts: Account[];
  onApply: (suggestion: CampaignSuggestion) => void;
};

export function AiSuggestionChip({
  category,
  listType,
  listSize,
  poolAccounts,
  onApply,
}: Props) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ok"; suggestion: CampaignSuggestion }
    | { status: "unavailable" }
    | { status: "error" }
  >({ status: "idle" });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!listType || listSize === 0 || poolAccounts.length === 0) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });

    const timer = setTimeout(async () => {
      try {
        const now = new Date();
        const poolPayload = poolAccounts.map((a) => {
          const created = new Date(a.createdAt);
          const daysOld = Math.max(
            0,
            Math.floor(
              (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
            )
          );
          return {
            warmupMode: a.warmupMode,
            dailyUsed: a.dailyUsed,
            dailyLimit: a.dailyLimit,
            status: a.status,
            daysOld,
          };
        });
        const result = await api.post<CampaignSuggestion>(
          "/ai/campaign/suggest",
          {
            category,
            listType,
            listSize,
            hourOfDay: now.getHours(),
            poolAccounts: poolPayload,
          }
        );
        if (!cancelled) setState({ status: "ok", suggestion: result });
      } catch (err) {
        if (cancelled) return;
        const msg = (err as Error).message ?? "";
        if (msg.includes("503") || msg.includes("ai_unavailable")) {
          setState({ status: "unavailable" });
        } else {
          setState({ status: "error" });
        }
      }
    }, 800);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [category, listType, listSize, poolAccounts]);

  if (state.status === "idle" || state.status === "unavailable") return null;

  if (state.status === "loading") {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-full border border-blue-200 bg-blue-50 text-blue-700">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
        Calculando sugestão de IA…
      </div>
    );
  }

  if (state.status === "error") return null;

  const { suggestion } = state;
  const minS = Math.round(suggestion.jitterMinMs / 1000);
  const maxS = Math.round(suggestion.jitterMaxMs / 1000);

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-blue-900">
          💡 <strong>Sugestão de IA</strong>: jitter <strong>{minS}–{maxS}s</strong>
          {" · "}pool ideal <strong>{suggestion.recommendedPoolSize}</strong>{" "}
          número(s)
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-xs text-blue-700 hover:underline"
          >
            {open ? "Ocultar" : "Por quê?"}
          </button>
          <button
            onClick={() => onApply(suggestion)}
            className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded"
          >
            Aplicar
          </button>
        </div>
      </div>
      {open && (
        <p className="text-xs text-blue-800 mt-2 pt-2 border-t border-blue-200">
          {suggestion.reasoning}
        </p>
      )}
    </div>
  );
}
