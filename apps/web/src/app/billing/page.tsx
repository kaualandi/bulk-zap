"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  billing,
  MercadoPagoUnavailableError,
  type BillingStatus,
  type Plan,
  type SubscriptionStatus,
} from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { UsageMeter } from "@/components/usage-meter";
import { CardManager } from "@/components/card-manager";
import { cn } from "@/lib/cn";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatCents(cents: number): string {
  return brl.format(cents / 100);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const STATUS_TONE: Record<
  SubscriptionStatus,
  "success" | "warning" | "neutral" | "danger"
> = {
  authorized: "success",
  pending: "warning",
  paused: "warning",
  cancelled: "danger",
};

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  authorized: "Ativa",
  pending: "Aguardando confirmação",
  paused: "Pausada",
  cancelled: "Cancelada",
};

const REASON_COPY: Record<string, string> = {
  no_subscription:
    "Você ainda não tem uma assinatura ativa. Escolha um plano abaixo para começar a disparar.",
  subscription_pending:
    "Sua assinatura está aguardando a confirmação do pagamento no Mercado Pago. Os disparos serão liberados assim que confirmada.",
  subscription_paused:
    "Sua assinatura está pausada. Regularize o pagamento no Mercado Pago para voltar a disparar.",
  subscription_cancelled:
    "Sua assinatura foi cancelada. Assine um plano para voltar a disparar.",
  quota_exceeded:
    "Sua franquia acabou e o saldo de créditos está zerado. Adicione créditos (ou ative a auto-recarga) para continuar disparando.",
};

function BillingInner() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [mpUnavailable, setMpUnavailable] = useState(false);
  const [acting, setActing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        billing.getStatus(),
        billing.getPlans(),
      ]);
      setStatus(s);
      setPlans(p);
      setMpUnavailable(!s.mercadoPagoConfigured);
    } catch (err) {
      toast.error(`Erro ao carregar cobrança: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Mercado Pago redirects back here (back_url=/billing) after checkout.
  useEffect(() => {
    if (searchParams.get("status") || searchParams.get("preapproval_id")) {
      toast.info(
        "Pagamento recebido. Estamos confirmando sua assinatura — o status atualiza automaticamente em instantes."
      );
    }
  }, [searchParams]);

  async function handleSubscribe(planId: string) {
    setActing(true);
    try {
      const { initPoint } = await billing.subscribe(planId);
      window.location.href = initPoint;
    } catch (err) {
      if (err instanceof MercadoPagoUnavailableError) {
        setMpUnavailable(true);
        toast.error("Mercado Pago não está configurado no momento.");
      } else if ((err as Error).message.includes("already_subscribed")) {
        toast.error("Você já tem uma assinatura ativa neste plano.");
        await refresh();
      } else {
        toast.error(`Erro ao assinar: ${(err as Error).message}`);
      }
      setActing(false);
    }
  }

  async function handleCancel() {
    if (
      !confirm(
        "Tem certeza que deseja cancelar a assinatura? Os disparos serão bloqueados ao fim do período."
      )
    ) {
      return;
    }
    setActing(true);
    try {
      await billing.cancel();
      toast.success("Assinatura cancelada.");
      await refresh();
    } catch (err) {
      if ((err as Error).message.includes("already_cancelled")) {
        toast.info("Esta assinatura já estava cancelada.");
        await refresh();
      } else {
        toast.error(`Erro ao cancelar: ${(err as Error).message}`);
      }
    } finally {
      setActing(false);
    }
  }

  async function handleBuyOverage(packageQty: number) {
    setActing(true);
    try {
      const { initPoint } = await billing.buyOverage(packageQty);
      window.location.href = initPoint;
    } catch (err) {
      if (err instanceof MercadoPagoUnavailableError) {
        setMpUnavailable(true);
        toast.error("Mercado Pago não está configurado no momento.");
      } else {
        toast.error(`Erro ao comprar excedente: ${(err as Error).message}`);
      }
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader
          title="Plano & Cobrança"
          description="Gerencie sua assinatura, créditos de excedente e auto-recarga."
        />
        <p className="text-sm text-zinc-400">Carregando…</p>
      </div>
    );
  }

  const sub = status?.subscription ?? null;
  const usage = status?.usage;
  const canDispatch = status?.canDispatch;
  const activePlanId = sub?.plan.id ?? null;
  const isActive = sub?.status === "authorized";

  // Overage package pricing derived from the org plan, else cheapest plan.
  const overagePlan =
    sub?.plan ??
    [...plans].sort((a, b) => a.monthlyPriceCents - b.monthlyPriceCents)[0] ??
    null;

  return (
    <div>
      <PageHeader
        title="Plano & Cobrança"
        description="Gerencie sua assinatura, créditos de excedente e auto-recarga."
      />

      {mpUnavailable && (
        <div className="mb-6">
          <Alert tone="warning" title="Pagamentos indisponíveis">
            A integração com o Mercado Pago não está configurada no momento.
            Assinaturas, créditos e auto-recarga estão temporariamente
            desativados.
          </Alert>
        </div>
      )}

      {canDispatch && !canDispatch.allowed && canDispatch.reason && (
        <div className="mb-6">
          <Alert tone="danger" title="Disparos bloqueados">
            {REASON_COPY[canDispatch.reason] ??
              "Os disparos estão bloqueados pelas regras de cobrança."}
          </Alert>
        </div>
      )}

      {status?.rechargeError && (
        <div className="mb-6">
          <Alert tone="danger" title="Auto-recarga falhou">
            Não conseguimos cobrar seu cartão ({status.rechargeError.message}).
            Atualize o cartão abaixo ou adicione créditos manualmente para não
            ficar sem saldo.
          </Alert>
        </div>
      )}

      {/* Current subscription + usage */}
      <Card className="mb-8">
        <CardHeader
          title="Assinatura atual"
          action={
            sub && (
              <Badge tone={STATUS_TONE[sub.status]}>
                {STATUS_LABEL[sub.status]}
              </Badge>
            )
          }
        />
        <CardBody>
          {sub ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <div className="text-lg font-semibold text-zinc-900">
                    {sub.plan.name}
                  </div>
                  <div className="text-sm text-zinc-500">
                    {formatCents(sub.plan.monthlyPriceCents)}/mês ·{" "}
                    {sub.plan.includedDispatches.toLocaleString("pt-BR")}{" "}
                    disparos inclusos
                  </div>
                </div>
                <div className="text-right text-xs text-zinc-500">
                  <div>
                    Período: {formatDate(sub.currentPeriodStart)} →{" "}
                    {formatDate(sub.currentPeriodEnd)}
                  </div>
                </div>
              </div>

              {usage && (
                <UsageMeter
                  used={usage.dispatchCount}
                  included={usage.includedDispatches}
                  creditBalance={status?.creditBalance ?? 0}
                />
              )}

              <div className="flex flex-wrap gap-3 pt-2 border-t border-zinc-100">
                {overagePlan && !mpUnavailable && (
                  <Button
                    variant="secondary"
                    disabled={acting}
                    onClick={() => handleBuyOverage(1)}
                  >
                    Adicionar créditos (
                    {overagePlan.overagePackageSize.toLocaleString("pt-BR")} por{" "}
                    {formatCents(overagePlan.overagePackagePriceCents)})
                  </Button>
                )}
                {sub.status !== "cancelled" && (
                  <Button
                    variant="danger"
                    disabled={acting}
                    onClick={handleCancel}
                  >
                    Cancelar assinatura
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-zinc-600">
                Você ainda não tem uma assinatura. Escolha um plano abaixo para
                liberar os disparos.
              </p>
              {usage && (
                <UsageMeter
                  used={usage.dispatchCount}
                  included={usage.includedDispatches}
                  creditBalance={status?.creditBalance ?? 0}
                />
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Saved card + auto-recharge */}
      {status && sub && (
        <Card className="mb-8">
          <CardHeader title="Créditos & auto-recarga" />
          <CardBody>
            <CardManager status={status} onChanged={refresh} />
          </CardBody>
        </Card>
      )}

      {/* Plans */}
      <h2 className="text-base font-semibold text-zinc-900 mb-4">
        {sub ? "Trocar de plano" : "Planos disponíveis"}
      </h2>

      {plans.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-zinc-500">
              Nenhum plano disponível no momento.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = plan.id === activePlanId;
            const perThousand =
              plan.overagePackageSize > 0
                ? plan.overagePackagePriceCents / (plan.overagePackageSize / 1000)
                : 0;
            return (
              <Card
                key={plan.id}
                className={cn(
                  "flex flex-col",
                  isCurrent && "ring-2 ring-zinc-900"
                )}
              >
                <CardBody className="flex flex-1 flex-col">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-zinc-900">
                      {plan.name}
                    </h3>
                    {isCurrent && <Badge tone="success">Plano atual</Badge>}
                  </div>

                  <div className="mb-4">
                    <span className="text-2xl font-semibold text-zinc-900">
                      {formatCents(plan.monthlyPriceCents)}
                    </span>
                    <span className="text-sm text-zinc-500">/mês</span>
                  </div>

                  <ul className="space-y-2 text-sm text-zinc-600 flex-1">
                    <li className="flex items-baseline gap-2">
                      <span className="text-zinc-900 font-medium">
                        {plan.includedDispatches.toLocaleString("pt-BR")}
                      </span>
                      <span>disparos inclusos por mês</span>
                    </li>
                    <li className="flex items-baseline gap-2">
                      <span>Excedente:</span>
                      <span className="text-zinc-900 font-medium">
                        {formatCents(plan.overagePackagePriceCents)}
                      </span>
                      <span>
                        por {plan.overagePackageSize.toLocaleString("pt-BR")}
                      </span>
                    </li>
                    {perThousand > 0 && (
                      <li className="text-xs text-zinc-400">
                        ≈ {formatCents(perThousand)} a cada 1.000 disparos extras
                      </li>
                    )}
                  </ul>

                  <div className="mt-6">
                    {isCurrent && isActive ? (
                      <Button variant="secondary" disabled className="w-full">
                        Plano atual
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        disabled={acting || mpUnavailable}
                        onClick={() => handleSubscribe(plan.id)}
                      >
                        {sub ? "Trocar para este plano" : "Assinar"}
                      </Button>
                    )}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense
      fallback={<p className="text-sm text-zinc-400">Carregando…</p>}
    >
      <BillingInner />
    </Suspense>
  );
}
