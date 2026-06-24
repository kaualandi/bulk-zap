"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  api,
  type Account,
  type Campaign,
  type List,
  type Template,
  type ValidationResult,
} from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AiRiskBadge } from "@/components/ai-risk-badge";
import { useAiRisk } from "@/lib/use-ai-risk";
import { AiSuggestionChip } from "@/components/ai-suggestion-chip";
import { Term } from "@/components/ui/term";
import {
  accountStatusLabel,
  accountStatusTone,
  driverLabel,
  warmupModeLabel,
} from "@/lib/labels";

const CATEGORIES = [
  { value: "marketing", label: "Marketing" },
  { value: "transacional", label: "Transacional" },
  { value: "atendimento", label: "Atendimento" },
  { value: "outros", label: "Outros" },
] as const;

export default function NewCampaignPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  const [name, setName] = useState("");
  const [category, setCategory] =
    useState<(typeof CATEGORIES)[number]["value"]>("outros");
  const [listId, setListId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [poolIds, setPoolIds] = useState<Set<string>>(new Set());
  const [jitterMin, setJitterMin] = useState(15);
  const [jitterMax, setJitterMax] = useState(90);
  const [scheduleAt, setScheduleAt] = useState("");
  const [consent, setConsent] = useState(false);

  const [listSize, setListSize] = useState(0);
  const [createdCampaign, setCreatedCampaign] = useState<Campaign | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [estimate, setEstimate] = useState<{
    totalMessages: number;
    estimatedMs: number;
  } | null>(null);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    api.get<Account[]>("/accounts").then(setAccounts);
    api.get<List[]>("/lists").then(setLists);
    api.get<Template[]>("/templates").then(setTemplates);
  }, []);

  useEffect(() => {
    if (!listId) {
      setListSize(0);
      return;
    }
    api
      .get<{ targetId: string }[]>(`/lists/${listId}/members`)
      .then((rows) => setListSize(rows.length))
      .catch(() => setListSize(0));
  }, [listId]);

  const selectedList = useMemo(
    () => lists.find((l) => l.id === listId),
    [lists, listId]
  );

  const poolAccounts = useMemo(
    () => accounts.filter((a) => poolIds.has(a.id)),
    [accounts, poolIds]
  );

  const hasUnwarmedMarketingRisk =
    category === "marketing" &&
    poolAccounts.some((a) => a.warmupMode === "off");

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId),
    [templates, templateId]
  );
  const riskState = useAiRisk(selectedTemplate?.body ?? "", category);

  function togglePool(id: string) {
    setPoolIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createDraft() {
    if (!name.trim() || !templateId || !listId || poolIds.size === 0) {
      alert("Preencha nome, template, lista e pelo menos 1 número do pool.");
      return;
    }
    if (category === "marketing" && !consent) {
      alert(
        "Para campanhas de marketing, confirme que você tem base legal (LGPD)."
      );
      return;
    }
    const campaign = await api.post<Campaign>("/campaigns", {
      name: name.trim(),
      category,
      templateId,
      listId,
      accountPoolIds: [...poolIds],
      scheduleAt: scheduleAt || undefined,
      jitterMinMs: jitterMin * 1000,
      jitterMaxMs: jitterMax * 1000,
      marketingConsentConfirmed:
        category === "marketing" && consent ? new Date().toISOString() : null,
    });
    setCreatedCampaign(campaign);

    const [v, e] = await Promise.all([
      api.get<ValidationResult>(`/campaigns/${campaign.id}/validate`),
      api.get<{ totalMessages: number; estimatedMs: number }>(
        `/campaigns/${campaign.id}/estimate`
      ),
    ]);
    setValidation(v);
    setEstimate(e);
  }

  const futureSchedule = useMemo(() => {
    if (!scheduleAt) return null;
    const date = new Date(scheduleAt);
    if (Number.isNaN(date.getTime())) return null;
    if (date.getTime() <= Date.now()) return null;
    return date;
  }, [scheduleAt]);

  async function launchNow(respectSchedule: boolean) {
    if (!createdCampaign) return;
    setLaunching(true);
    const promise = api.post<{
      runId: string;
      enqueued: number;
      scheduled: boolean;
      startsAt: string;
    }>(
      `/campaigns/${createdCampaign.id}/launch?respectSchedule=${respectSchedule}`
    );
    toast.promise(promise, {
      loading: respectSchedule ? "Agendando disparo…" : "Iniciando disparo…",
      success: (result) =>
        result.scheduled
          ? `Agendado: ${result.enqueued} mensagens começam em ${new Date(result.startsAt).toLocaleString()}`
          : `Disparo iniciado: ${result.enqueued} mensagens enfileiradas`,
      error: (err) =>
        (err as Error).message.includes("billing_blocked")
          ? "Disparos bloqueados pela cobrança. Verifique seu plano em Plano & Cobrança."
          : `Erro: ${(err as Error).message}`,
    });
    try {
      await promise;
      router.push(`/campaigns/${createdCampaign.id}`);
    } finally {
      setLaunching(false);
    }
  }

  function formatDuration(ms: number) {
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins} min`;
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    return `${hours}h ${rem}min`;
  }

  if (createdCampaign) {
    return (
      <div>
        <PageHeader
          title={`Revisar: ${createdCampaign.name}`}
          description="Última conferência antes de iniciar o disparo."
        />

        <div className="flex flex-col gap-4">
          {estimate && (
            <Alert tone="info" title="Estimativa de duração">
              <strong>{estimate.totalMessages}</strong> mensagens × jitter{" "}
              {jitterMin}–{jitterMax}s ≈{" "}
              <strong>{formatDuration(estimate.estimatedMs)}</strong> de disparo
              total.
            </Alert>
          )}

          {validation && (
            <Alert
              tone={validation.ok ? "success" : "danger"}
              title={
                validation.ok
                  ? "Validação pool × grupo: tudo certo"
                  : `Validação pool × grupo: ${validation.missing.length} combinações inválidas`
              }
            >
              {validation.ok ? (
                <p>
                  Todos os números do pool são membros de todos os grupos
                  alvo.
                </p>
              ) : (
                <ul className="list-disc pl-5 space-y-1">
                  {validation.missing.slice(0, 8).map((m) => {
                    const acc = accounts.find((a) => a.id === m.accountId);
                    return (
                      <li key={`${m.groupId}-${m.accountId}`}>
                        <strong>{acc?.displayName ?? m.accountId}</strong> não
                        está em <strong>{m.groupSubject}</strong>
                      </li>
                    );
                  })}
                  {validation.missing.length > 8 && (
                    <li className="text-zinc-600">
                      …e mais {validation.missing.length - 8}
                    </li>
                  )}
                </ul>
              )}
            </Alert>
          )}

          {category === "marketing" && (
            <Alert tone="warning" title="Marketing em grupos: risco de ban">
              WhatsApp pune disparos massivos em grupos. Sugestões:
              <ul className="list-disc pl-5 mt-2 space-y-0.5">
                <li>Distribuir o volume entre mais números no pool</li>
                <li>Aquecer números reserva em paralelo (warmup auto)</li>
                <li>Aumentar jitter para 60–180s</li>
                <li>
                  Personalizar mensagem com {`{{nome}}`} para reduzir spam
                  detection
                </li>
              </ul>
            </Alert>
          )}

          {futureSchedule && (
            <Alert tone="info" title="Agendamento configurado">
              Esta campanha foi agendada para{" "}
              <strong>{futureSchedule.toLocaleString()}</strong>. Você pode
              agendar para essa data ou iniciar agora ignorando o agendamento.
            </Alert>
          )}

          <div className="flex flex-wrap gap-3 mt-2">
            {futureSchedule && (
              <Button
                size="lg"
                onClick={() => launchNow(true)}
                disabled={launching || !validation?.ok}
              >
                {launching ? "Agendando…" : "📅 Agendar para a data"}
              </Button>
            )}
            <Button
              size="lg"
              variant={futureSchedule ? "secondary" : "primary"}
              onClick={() => launchNow(false)}
              disabled={launching || !validation?.ok}
            >
              {launching ? "Iniciando…" : "🚀 Iniciar disparo agora"}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              onClick={() =>
                router.push(`/campaigns/${createdCampaign.id}`)
              }
            >
              Salvar como rascunho
            </Button>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Rascunhos ficam visíveis em <strong>Campanhas</strong> e podem ser
            editados ou disparados depois.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Nova campanha"
        description="Configure template, lista, pool de números e parâmetros de envio."
      />

      <Card>
        <CardHeader title="Detalhes" />
        <CardBody className="flex flex-col gap-5">
          <Field label="Nome">
            <Input
              placeholder="Ex: Campanha Black Friday"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <div className="grid md:grid-cols-2 gap-5">
            <Field label="Categoria">
              <Select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as typeof category)
                }
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={<Term k="template">Template</Term>}>
              <Select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                <option value="">Selecione…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {selectedTemplate && <AiRiskBadge state={riskState} />}

          <Field
            label="Lista de destinatários"
            hint={
              selectedList?.type === "groups" ? (
                <>
                  Lista de grupos: a{" "}
                  <Term k="poolGroupValidation">validação pool × grupo</Term>{" "}
                  exige que todos os números do pool sejam membros de todos os
                  grupos antes do envio.
                </>
              ) : undefined
            }
          >
            <Select value={listId} onChange={(e) => setListId(e.target.value)}>
              <option value="">Selecione…</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.type})
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={
              <>
                <Term k="pool">Pool de números</Term> (rotação automática)
              </>
            }
            hint="Os números marcados são revezados durante o disparo."
          >
            <div className="border border-zinc-300 rounded-md max-h-56 overflow-auto bg-white divide-y divide-zinc-100">
              {accounts.length === 0 ? (
                <p className="p-4 text-sm text-zinc-500">
                  Nenhum número cadastrado. Cadastre em Números primeiro.
                </p>
              ) : (
                accounts.map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-zinc-50"
                  >
                    <input
                      type="checkbox"
                      checked={poolIds.has(a.id)}
                      onChange={() => togglePool(a.id)}
                      className="rounded"
                    />
                    <span className="text-sm flex-1">{a.displayName}</span>
                    <div className="flex items-center gap-2">
                      <Badge tone="neutral">{driverLabel(a.driver)}</Badge>
                      <Badge tone={accountStatusTone(a.status)}>
                        {accountStatusLabel(a.status)}
                      </Badge>
                      {a.warmupMode !== "off" && (
                        <Badge tone="info">
                          Aquecimento: {warmupModeLabel(a.warmupMode)}
                        </Badge>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>
          </Field>

          {listId && poolAccounts.length > 0 && (
            <AiSuggestionChip
              category={category}
              listType={selectedList?.type}
              listSize={listSize}
              poolAccounts={poolAccounts}
              onApply={(s) => {
                setJitterMin(Math.round(s.jitterMinMs / 1000));
                setJitterMax(Math.round(s.jitterMaxMs / 1000));
              }}
            />
          )}

          <div className="grid md:grid-cols-3 gap-5">
            <Field label={<><Term k="jitter">Jitter</Term> mínimo (s)</>}>
              <Input
                type="number"
                min={1}
                value={jitterMin}
                onChange={(e) => setJitterMin(Number(e.target.value))}
              />
            </Field>
            <Field label="Jitter máximo (s)">
              <Input
                type="number"
                min={1}
                value={jitterMax}
                onChange={(e) => setJitterMax(Number(e.target.value))}
              />
            </Field>
            <Field label="Agendar para (opcional)">
              <Input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
              />
            </Field>
          </div>

          {category === "marketing" && (
            <Alert
              tone="warning"
              title={
                <>
                  Consent <Term k="lgpd">LGPD</Term> obrigatório
                </>
              }
            >
              <label className="flex items-start gap-2 mt-1">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Confirmo que tenho base legal (<Term k="lgpd">LGPD</Term>) para
                  enviar <Term k="marketing">marketing</Term> aos destinatários
                  desta campanha.
                </span>
              </label>
            </Alert>
          )}

          {hasUnwarmedMarketingRisk && (
            <Alert tone="warning">
              Pelo menos um número do pool está sem warmup e a campanha é
              marketing — risco alto de ban. Considere distribuir entre mais
              números ou ativar warmup automático.
            </Alert>
          )}

          <div className="pt-2">
            <Button size="lg" onClick={createDraft}>
              Revisar disparo
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
