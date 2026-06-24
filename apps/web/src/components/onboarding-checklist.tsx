"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { onboarding, type OnboardingStatus } from "@/lib/api";
import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/cn";

type Step = {
  key: keyof Omit<OnboardingStatus, "allDone">;
  label: string;
  href: string;
  cta: string;
  /** Passo crítico: é o gate do disparo (assinatura). */
  gate?: boolean;
};

const STEPS: Step[] = [
  { key: "hasSubscription", label: "Assine um plano", href: "/billing", cta: "Escolher plano", gate: true },
  { key: "hasConnectedAccount", label: "Conecte um número de WhatsApp", href: "/accounts", cta: "Conectar número" },
  { key: "hasList", label: "Crie uma lista de grupos", href: "/lists", cta: "Criar lista" },
  { key: "hasTemplate", label: "Crie um template de mensagem", href: "/templates", cta: "Criar template" },
  { key: "hasDispatched", label: "Dispare sua primeira campanha", href: "/campaigns/new", cta: "Nova campanha" },
];

export function OnboardingChecklist() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await onboarding.getStatus());
    } catch {
      // Silencioso: o onboarding nunca deve quebrar o dashboard.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // fetch-on-mount: o setState só ocorre após o await, não sincronamente.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // Não renderiza nada enquanto carrega ou quando o setup está completo.
  if (!loaded || !status || status.allDone) return null;

  const doneCount = STEPS.filter((s) => status[s.key]).length;

  return (
    <Card className="mb-8 border-zinc-300">
      <CardBody>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-base font-semibold text-zinc-900">
            Primeiros passos
          </h2>
          <span className="text-xs text-zinc-500">
            {doneCount} de {STEPS.length} concluídos
          </span>
        </div>

        <ol className="space-y-2">
          {STEPS.map((step, i) => {
            const done = status[step.key];
            const isGate = step.gate && !status.hasSubscription;
            return (
              <li
                key={step.key}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5",
                  isGate
                    ? "bg-amber-50 ring-1 ring-amber-200"
                    : "bg-zinc-50"
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    done
                      ? "bg-emerald-500 text-white"
                      : isGate
                        ? "bg-amber-500 text-white"
                        : "bg-zinc-200 text-zinc-600"
                  )}
                  aria-hidden
                >
                  {done ? "✓" : i + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "text-sm",
                      done
                        ? "text-zinc-400 line-through"
                        : "text-zinc-800 font-medium"
                    )}
                  >
                    {step.label}
                  </span>
                  {step.gate && !done && (
                    <span className="ml-2 text-xs font-medium text-amber-700">
                      necessário para disparar
                    </span>
                  )}
                </div>

                {!done && (
                  <Link
                    href={step.href}
                    className={cn(
                      "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      isGate
                        ? "bg-amber-600 text-white hover:bg-amber-700"
                        : "bg-zinc-900 text-white hover:bg-zinc-700"
                    )}
                  >
                    {step.cta}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </CardBody>
    </Card>
  );
}
