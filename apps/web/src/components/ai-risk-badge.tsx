"use client";

import { cn } from "@/lib/cn";
import type { RiskState } from "@/lib/use-ai-risk";

function toneFor(score: number): {
  bg: string;
  text: string;
  border: string;
  label: string;
} {
  if (score <= 3)
    return {
      bg: "bg-green-50",
      text: "text-green-800",
      border: "border-green-200",
      label: "baixo",
    };
  if (score <= 6)
    return {
      bg: "bg-yellow-50",
      text: "text-yellow-800",
      border: "border-yellow-200",
      label: "médio",
    };
  return {
    bg: "bg-red-50",
    text: "text-red-800",
    border: "border-red-200",
    label: "alto",
  };
}

export function AiRiskBadge({ state }: { state: RiskState }) {
  if (state.status === "idle") return null;
  if (state.status === "unavailable") return null;

  if (state.status === "loading") {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-full border border-zinc-200 bg-zinc-50 text-zinc-500">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse" />
        Analisando risco…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="inline-flex items-center px-3 py-1.5 text-xs rounded-full border border-zinc-200 bg-zinc-50 text-zinc-500">
        Risco indisponível
      </div>
    );
  }

  const { riskScore, reasons, suggestions, cached } = state.result;
  const tone = toneFor(riskScore);

  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-sm",
        tone.bg,
        tone.text,
        tone.border
      )}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <strong className="font-semibold">
          Risco de ban: {riskScore}/10 ({tone.label})
        </strong>
        {cached && (
          <span className="text-[10px] opacity-60 font-mono">cache</span>
        )}
      </div>
      {reasons.length > 0 && (
        <div className="mb-2">
          <div className="font-medium text-[11px] uppercase tracking-wide opacity-80 mb-0.5">
            Motivos
          </div>
          <ul className="list-disc pl-5 space-y-0.5">
            {reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {suggestions.length > 0 && (
        <div>
          <div className="font-medium text-[11px] uppercase tracking-wide opacity-80 mb-0.5">
            Sugestões
          </div>
          <ul className="list-disc pl-5 space-y-0.5">
            {suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
