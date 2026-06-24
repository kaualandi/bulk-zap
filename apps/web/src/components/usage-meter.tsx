import { cn } from "@/lib/cn";

/**
 * Dispatch-usage meter. The bar shows how much of the monthly included allowance
 * has been used. Beyond the allowance, dispatches draw from a persistent credit
 * balance (créditos que não expiram), shown alongside.
 */
export function UsageMeter({
  used,
  included,
  creditBalance,
}: {
  used: number;
  included: number;
  creditBalance: number;
}) {
  const includedUsed = Math.min(used, included);
  const remaining = Math.max(included - used, 0);
  const pct = included > 0 ? Math.min((includedUsed / included) * 100, 100) : 100;
  const onCredits = used >= included && included > 0;

  const tone = onCredits
    ? creditBalance > 0
      ? "warning"
      : "danger"
    : pct >= 85
      ? "warning"
      : "ok";
  const barColor =
    tone === "danger"
      ? "bg-red-500"
      : tone === "warning"
        ? "bg-yellow-500"
        : "bg-zinc-900";

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm text-zinc-600">
          <span className="font-semibold text-zinc-900">
            {includedUsed.toLocaleString("pt-BR")}
          </span>{" "}
          de {included.toLocaleString("pt-BR")} inclusos usados
        </span>
        <span
          className={cn(
            "text-xs font-medium",
            tone === "danger"
              ? "text-red-600"
              : tone === "warning"
                ? "text-yellow-700"
                : "text-zinc-500"
          )}
        >
          {onCredits
            ? "franquia esgotada"
            : `${remaining.toLocaleString("pt-BR")} restantes`}
        </span>
      </div>

      <div className="relative h-2.5 w-full rounded-full bg-zinc-100 overflow-hidden">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-all",
            barColor
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-4 mt-2 text-xs text-zinc-500">
        <span>Incluído no plano: {included.toLocaleString("pt-BR")}/mês</span>
        <span
          className={cn(
            "font-medium",
            onCredits && creditBalance === 0 ? "text-red-600" : "text-zinc-700"
          )}
        >
          Créditos disponíveis: {creditBalance.toLocaleString("pt-BR")}
        </span>
      </div>
    </div>
  );
}
