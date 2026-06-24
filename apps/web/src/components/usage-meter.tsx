import { cn } from "@/lib/cn";

/**
 * Visual dispatch-usage meter. Shows how much of the period quota
 * (included dispatches + purchased overage) has been consumed.
 */
export function UsageMeter({
  used,
  included,
  overage,
}: {
  used: number;
  included: number;
  overage: number;
}) {
  const quota = included + overage;
  const remaining = Math.max(quota - used, 0);
  const pct = quota > 0 ? Math.min((used / quota) * 100, 100) : 0;
  const includedPct =
    quota > 0 ? Math.min((included / quota) * 100, 100) : 100;

  const tone =
    pct >= 100 ? "danger" : pct >= 85 ? "warning" : "ok";

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
            {used.toLocaleString("pt-BR")}
          </span>{" "}
          de {quota.toLocaleString("pt-BR")} disparos usados
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
          {remaining.toLocaleString("pt-BR")} restantes
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
        {/* Marker where the included allowance ends (overage begins). */}
        {overage > 0 && includedPct < 100 && (
          <div
            className="absolute inset-y-0 w-px bg-zinc-400"
            style={{ left: `${includedPct}%` }}
            title="Fim do plano incluído"
          />
        )}
      </div>

      <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
        <span>
          Incluído no plano: {included.toLocaleString("pt-BR")}
        </span>
        {overage > 0 && (
          <span>Excedente comprado: {overage.toLocaleString("pt-BR")}</span>
        )}
      </div>
    </div>
  );
}
