"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

export type RiskCheck = {
  riskScore: number;
  reasons: string[];
  suggestions: string[];
  cached?: boolean;
};

export type RiskState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; result: RiskCheck }
  | { status: "unavailable" }
  | { status: "error"; message: string };

export function useAiRisk(
  text: string,
  category: string | undefined,
  debounceMs = 600
): RiskState {
  const [state, setState] = useState<RiskState>({ status: "idle" });

  useEffect(() => {
    if (!text || text.trim().length < 10) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });

    const timer = setTimeout(async () => {
      try {
        const result = await api.post<RiskCheck>("/ai/risk-check", {
          text,
          category,
        });
        if (!cancelled) setState({ status: "ok", result });
      } catch (err) {
        if (cancelled) return;
        const msg = (err as Error).message ?? "";
        if (msg.includes("503") || msg.includes("ai_unavailable")) {
          setState({ status: "unavailable" });
        } else {
          setState({ status: "error", message: msg });
        }
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text, category, debounceMs]);

  return state;
}
