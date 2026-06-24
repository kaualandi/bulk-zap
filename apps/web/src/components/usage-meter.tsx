import { cn } from "@/lib/cn";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/**
 * Dispatch-usage meter (post-paid model). The bar shows how much of the monthly
 * included allowance has been used. Going over the allowance does NOT cap usage:
 * the excess accrues as per-message overage (shown below) and is invoiced at the
 * end of the period.
 */
export function UsageMeter({
  used,
  included,
  overageDispatches,
  overageAmountCents,
}: {
  used: number;
  included: number;
  overageDispatches: number;
  overageAmountCents: number;
}) {
  const includedUsed = Math.min(used, included);
  const remaining = Math.max(included - used, 0);
  const pct = included > 0 ? Math.min((includedUsed / included) * 100, 100) : 100;
  const overActive = overageDispatches > 0;

  const tone = overActive ? "danger" : pct >= 85 ? "warning" : "ok";
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
            overActive
              ? "text-red-600"
              : tone === "warning"
                ? "text-yellow-700"
                : "text-zinc-500"
          )}
        >
          {overActive
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
        {overActive && (
          <span className="font-medium text-red-600">
            +{overageDispatches.toLocaleString("pt-BR")} excedente ·{" "}
            {brl.format(overageAmountCents / 100)} (cobrado no fechamento)
          </span>
        )}
      </div>
    </div>
  );
}
