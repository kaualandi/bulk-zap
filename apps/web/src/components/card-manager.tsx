"use client";

import { useState } from "react";
import { toast } from "sonner";
import { billing, type BillingStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";

const MP_PUBLIC_KEY = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? "";

// Minimal surface of the Mercado Pago web SDK we use (loaded via <script>).
type MpCardTokenInput = {
  cardNumber: string;
  cardholderName: string;
  cardExpirationMonth: string;
  cardExpirationYear: string;
  securityCode: string;
  identificationType: string;
  identificationNumber: string;
};
type MpInstance = {
  createCardToken: (data: MpCardTokenInput) => Promise<{ id: string }>;
};
declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, opts?: { locale?: string }) => MpInstance;
  }
}

/** Load the MP web SDK once and return a configured instance. */
let mpScriptPromise: Promise<void> | null = null;
async function getMercadoPago(): Promise<MpInstance> {
  if (!MP_PUBLIC_KEY) throw new Error("NEXT_PUBLIC_MP_PUBLIC_KEY não configurada");
  if (!window.MercadoPago) {
    mpScriptPromise ??= new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://sdk.mercadopago.com/js/v2";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Falha ao carregar o SDK do Mercado Pago"));
      document.head.appendChild(s);
    });
    await mpScriptPromise;
  }
  if (!window.MercadoPago) throw new Error("SDK do Mercado Pago indisponível");
  return new window.MercadoPago(MP_PUBLIC_KEY, { locale: "pt-BR" });
}

const EMPTY_CARD = {
  cardNumber: "",
  cardholderName: "",
  expMonth: "",
  expYear: "",
  securityCode: "",
  cpf: "",
};

type Props = {
  status: BillingStatus;
  onChanged: () => void | Promise<void>;
};

export function CardManager({ status, onChanged }: Props) {
  const [card, setCard] = useState(EMPTY_CARD);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  // Auto-recharge config (local, seeded from status).
  const [arEnabled, setArEnabled] = useState(status.autoRecharge.enabled);
  const [arThreshold, setArThreshold] = useState(
    status.autoRecharge.threshold?.toString() ?? ""
  );
  const [arPackageQty, setArPackageQty] = useState(
    status.autoRecharge.packageQty.toString()
  );
  const [savingAr, setSavingAr] = useState(false);

  const packageSize = status.subscription?.plan.overagePackageSize ?? 0;

  async function handleAddCard(e: React.FormEvent) {
    e.preventDefault();
    if (!MP_PUBLIC_KEY) {
      toast.error("Pagamento por cartão indisponível: chave pública do MP ausente.");
      return;
    }
    setSaving(true);
    try {
      const mp = await getMercadoPago();
      const token = await mp.createCardToken({
        cardNumber: card.cardNumber.replace(/\s/g, ""),
        cardholderName: card.cardholderName,
        cardExpirationMonth: card.expMonth,
        cardExpirationYear: card.expYear,
        securityCode: card.securityCode,
        identificationType: "CPF",
        identificationNumber: card.cpf.replace(/\D/g, ""),
      });
      await billing.saveCard(token.id);
      setCard(EMPTY_CARD);
      setAdding(false);
      toast.success("Cartão salvo");
      await onChanged();
    } catch (err) {
      toast.error(`Erro ao salvar cartão: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveCard() {
    if (!confirm("Remover o cartão salvo? A auto-recarga será desativada.")) return;
    try {
      await billing.removeCard();
      toast.success("Cartão removido");
      setArEnabled(false);
      await onChanged();
    } catch (err) {
      toast.error(`Erro ao remover cartão: ${(err as Error).message}`);
    }
  }

  async function handleSaveAutoRecharge() {
    const threshold = arThreshold ? Number(arThreshold) : null;
    const packageQty = Number(arPackageQty) || 1;
    if (arEnabled && (threshold == null || threshold < 0)) {
      toast.error("Defina um limite mínimo de créditos para a auto-recarga.");
      return;
    }
    setSavingAr(true);
    try {
      const res = await billing.setAutoRecharge({
        enabled: arEnabled,
        threshold,
        packageQty,
      });
      if ("error" in res) {
        toast.error(
          res.error === "no_card"
            ? "Salve um cartão antes de ativar a auto-recarga."
            : "Não foi possível salvar a auto-recarga."
        );
      } else {
        toast.success("Auto-recarga atualizada");
        await onChanged();
      }
    } catch (err) {
      toast.error(`Erro ao salvar auto-recarga: ${(err as Error).message}`);
    } finally {
      setSavingAr(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Saved card */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 mb-2">
          Cartão para auto-recarga
        </h3>
        {status.card ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-4 py-3">
            <span className="text-sm text-zinc-700">
              {status.card.brand?.toUpperCase()} •••• {status.card.last4}
            </span>
            <Button variant="secondary" onClick={handleRemoveCard}>
              Remover
            </Button>
          </div>
        ) : adding ? (
          <form
            onSubmit={handleAddCard}
            className="space-y-3 rounded-lg border border-zinc-200 p-4"
          >
            <Field label="Número do cartão">
              <Input
                inputMode="numeric"
                placeholder="0000 0000 0000 0000"
                value={card.cardNumber}
                onChange={(e) =>
                  setCard((c) => ({ ...c, cardNumber: e.target.value }))
                }
              />
            </Field>
            <Field label="Nome impresso no cartão">
              <Input
                value={card.cardholderName}
                onChange={(e) =>
                  setCard((c) => ({ ...c, cardholderName: e.target.value }))
                }
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Mês">
                <Input
                  placeholder="MM"
                  value={card.expMonth}
                  onChange={(e) =>
                    setCard((c) => ({ ...c, expMonth: e.target.value }))
                  }
                />
              </Field>
              <Field label="Ano">
                <Input
                  placeholder="AAAA"
                  value={card.expYear}
                  onChange={(e) =>
                    setCard((c) => ({ ...c, expYear: e.target.value }))
                  }
                />
              </Field>
              <Field label="CVV">
                <Input
                  value={card.securityCode}
                  onChange={(e) =>
                    setCard((c) => ({ ...c, securityCode: e.target.value }))
                  }
                />
              </Field>
            </div>
            <Field label="CPF do titular">
              <Input
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={card.cpf}
                onChange={(e) => setCard((c) => ({ ...c, cpf: e.target.value }))}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAdding(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Salvar cartão"}
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="secondary" disabled={adding} onClick={() => setAdding(true)}>
            Adicionar cartão
          </Button>
        )}
      </div>

      {/* Auto-recharge config */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 mb-2">Auto-recarga</h3>
        <p className="text-xs text-zinc-500 mb-3">
          Quando o saldo de créditos cair abaixo do limite, cobramos o cartão
          salvo automaticamente e recarregamos — sem interromper os disparos.
        </p>
        <div className="space-y-3 rounded-lg border border-zinc-200 p-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={arEnabled}
              disabled={!status.card}
              onChange={(e) => setArEnabled(e.target.checked)}
            />
            Ativar auto-recarga
            {!status.card && (
              <span className="text-xs text-zinc-400">(salve um cartão antes)</span>
            )}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label="Recarregar quando o saldo for menor que"
              hint="em créditos (disparos)"
            >
              <Input
                type="number"
                min={0}
                placeholder="Ex: 500"
                value={arThreshold}
                onChange={(e) => setArThreshold(e.target.value)}
              />
            </Field>
            <Field
              label="Pacotes por recarga"
              hint={
                packageSize > 0
                  ? `${packageSize.toLocaleString("pt-BR")} créditos por pacote`
                  : undefined
              }
            >
              <Input
                type="number"
                min={1}
                value={arPackageQty}
                onChange={(e) => setArPackageQty(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button disabled={savingAr} onClick={handleSaveAutoRecharge}>
              {savingAr ? "Salvando…" : "Salvar auto-recarga"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
