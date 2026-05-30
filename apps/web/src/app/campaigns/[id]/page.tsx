"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  api,
  API_URL,
  type Campaign,
  type ValidationResult,
} from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import {
  EmptyRow,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui/table";
import {
  campaignStatusLabel,
  campaignStatusTone,
  messageStatusLabel,
  messageStatusTone,
} from "@/lib/labels";

type Run = {
  id: string;
  campaignId: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  totalTargets: number;
  sentCount: number;
  failedCount: number;
};

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [report, setReport] = useState<{
    runs: Run[];
    breakdown: { accountId: string; status: string; count: number }[];
  } | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [summarizing, setSummarizing] = useState(false);
  const [summaryUnavailable, setSummaryUnavailable] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [revokeSent, setRevokeSent] = useState(false);
  const [canceling, setCanceling] = useState(false);

  async function refresh() {
    const [c, r, rep] = await Promise.all([
      api.get<Campaign>(`/campaigns/${id}`),
      api.get<Run[]>(`/campaigns/${id}/runs`),
      api.get<typeof report>(`/reports/campaign/${id}`),
    ]);
    setCampaign(c);
    setRuns(r);
    setReport(rep);
    if (c.status === "draft") {
      try {
        const v = await api.get<ValidationResult>(
          `/campaigns/${id}/validate`
        );
        setValidation(v);
      } catch {
        /* ignore */
      }
    } else {
      setValidation(null);
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [id]);

  async function pause() {
    await api.post(`/campaigns/${id}/pause`);
    refresh();
  }

  function openCancel() {
    setRevokeSent(false);
    setCancelOpen(true);
  }

  async function confirmCancel() {
    setCanceling(true);
    try {
      const result = await api.post<{
        jobsCanceled: number;
        messagesCanceled: number;
        revoked: number;
        revokeFailed: number;
      }>(`/campaigns/${id}/cancel`, { deleteSent: revokeSent });
      const parts: string[] = [];
      if (result.messagesCanceled > 0)
        parts.push(`${result.messagesCanceled} agendadas canceladas`);
      if (result.revoked > 0)
        parts.push(`${result.revoked} revogadas no WhatsApp`);
      if (result.revokeFailed > 0)
        parts.push(`${result.revokeFailed} não puderam ser revogadas`);
      toast.success(
        parts.length > 0 ? `Campanha cancelada — ${parts.join(", ")}.` : "Campanha cancelada."
      );
      setCancelOpen(false);
      refresh();
    } catch (err) {
      toast.error((err as Error).message ?? "Falha ao cancelar campanha");
    } finally {
      setCanceling(false);
    }
  }

  async function launch(respectSchedule: boolean) {
    setLaunching(true);
    const promise = api.post<{
      runId: string;
      enqueued: number;
      scheduled: boolean;
      startsAt: string;
    }>(`/campaigns/${id}/launch?respectSchedule=${respectSchedule}`);
    toast.promise(promise, {
      loading: respectSchedule ? "Agendando…" : "Iniciando disparo…",
      success: (result) =>
        result.scheduled
          ? `Agendado para ${new Date(result.startsAt).toLocaleString()}`
          : `Disparo iniciado (${result.enqueued} mensagens)`,
      error: (err) => `Erro: ${(err as Error).message}`,
    });
    try {
      await promise;
      refresh();
    } finally {
      setLaunching(false);
    }
  }

  async function runSummary() {
    setSummary("");
    setSummaryUnavailable(false);
    setSummarizing(true);
    try {
      const res = await fetch(`${API_URL}/ai/campaign/${id}/summary`);
      if (res.status === 503) {
        setSummaryUnavailable(true);
        setSummarizing(false);
        return;
      }
      if (!res.ok || !res.body) {
        setSummary(`Erro ${res.status}`);
        setSummarizing(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const ev of events) {
          const dataLine = ev
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          try {
            const payload = JSON.parse(dataLine.slice(6)) as { text?: string };
            if (payload.text) setSummary((s) => s + payload.text);
          } catch {
            /* ignore */
          }
        }
      }
    } finally {
      setSummarizing(false);
    }
  }

  if (!campaign)
    return <p className="text-sm text-zinc-500">Carregando…</p>;

  return (
    <div>
      <PageHeader
        title={campaign.name}
        description={`Categoria: ${campaign.category} · Pool: ${campaign.accountPoolIds.length} número(s) · Jitter ${campaign.jitterMinMs / 1000}–${campaign.jitterMaxMs / 1000}s`}
        action={
          <div className="flex items-center gap-3">
            <Badge tone={campaignStatusTone(campaign.status)}>
              {campaignStatusLabel(campaign.status)}
            </Badge>
            {campaign.status === "running" && (
              <Button variant="secondary" onClick={pause}>
                Pausar
              </Button>
            )}
            {(campaign.status === "running" || campaign.status === "paused") && (
              <Button variant="danger" onClick={openCancel}>
                Cancelar campanha
              </Button>
            )}
          </div>
        }
      />

      {campaign.status === "draft" && (
        <Card className="mb-6 border-blue-200 bg-blue-50/50">
          <CardHeader
            title="Rascunho — pronto para disparar"
            description={
              campaign.scheduleAt
                ? `Agendado para ${new Date(campaign.scheduleAt).toLocaleString()}.`
                : "Sem agendamento configurado."
            }
          />
          <CardBody className="flex flex-col gap-4">
            {validation && !validation.ok && (
              <Alert tone="danger" title="Validação pool × grupo falhou">
                {validation.missing.length} combinações inválidas. Edite a
                campanha para ajustar o pool ou a lista.
              </Alert>
            )}
            <div className="flex flex-wrap gap-3">
              {campaign.scheduleAt &&
                new Date(campaign.scheduleAt).getTime() > Date.now() && (
                  <Button
                    onClick={() => launch(true)}
                    disabled={launching || (validation != null && !validation.ok)}
                  >
                    {launching ? "Agendando…" : "📅 Agendar para a data"}
                  </Button>
                )}
              <Button
                variant={campaign.scheduleAt ? "secondary" : "primary"}
                onClick={() => launch(false)}
                disabled={launching || (validation != null && !validation.ok)}
              >
                {launching ? "Iniciando…" : "🚀 Disparar agora"}
              </Button>
              <Link href={`/campaigns/${id}/edit`}>
                <Button variant="secondary">Editar rascunho</Button>
              </Link>
              <Button
                variant="ghost"
                onClick={async () => {
                  if (!confirm("Excluir este rascunho?")) return;
                  await api.delete(`/campaigns/${id}`);
                  toast.success("Rascunho excluído");
                  router.push("/campaigns");
                }}
              >
                Excluir rascunho
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {campaign.status === "scheduled" && campaign.scheduleAt && (
        <Card className="mb-6 border-blue-200 bg-blue-50/50">
          <CardBody className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-zinc-900">
                ⏱️ Campanha agendada
              </h3>
              <p className="text-sm text-zinc-600 mt-0.5">
                Disparo começa em{" "}
                <strong>
                  {new Date(campaign.scheduleAt).toLocaleString()}
                </strong>
                .
              </p>
            </div>
            <Button variant="danger" onClick={openCancel}>
              Cancelar agendamento
            </Button>
          </CardBody>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader
          title="Resumo da campanha"
          description="Gerado por IA com base na última execução."
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={runSummary}
              disabled={summarizing}
            >
              {summarizing ? "Gerando…" : summary ? "Gerar novamente" : "Resumir"}
            </Button>
          }
        />
        <CardBody>
          {summaryUnavailable && (
            <Alert tone="warning">
              IA indisponível. Configure <code>ANTHROPIC_API_KEY</code>.
            </Alert>
          )}
          {!summary && !summarizing && !summaryUnavailable && (
            <p className="text-sm text-zinc-500">
              Clique em &quot;Resumir&quot; para gerar um sumário em linguagem natural.
            </p>
          )}
          {summary && (
            <p className="text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed">
              {summary}
              {summarizing && (
                <span className="inline-block w-2 h-4 bg-zinc-400 align-text-bottom ml-1 animate-pulse" />
              )}
            </p>
          )}
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHeader title="Execuções" />
        <div className="overflow-hidden">
          <Table>
            <THead>
              <tr>
                <Th>Iniciada em</Th>
                <Th>Status</Th>
                <Th>Total</Th>
                <Th>Enviadas</Th>
                <Th>Falhas</Th>
              </tr>
            </THead>
            <TBody>
              {runs.map((r) => (
                <Tr key={r.id}>
                  <Td>{new Date(r.startedAt).toLocaleString()}</Td>
                  <Td>
                    <Badge tone={campaignStatusTone(r.status)}>
                      {campaignStatusLabel(r.status)}
                    </Badge>
                  </Td>
                  <Td>{r.totalTargets}</Td>
                  <Td className="text-green-700 font-medium">{r.sentCount}</Td>
                  <Td className="text-red-700 font-medium">{r.failedCount}</Td>
                </Tr>
              ))}
              {runs.length === 0 && (
                <EmptyRow colSpan={5}>
                  Nenhuma execução ainda. Inicie esta campanha para começar.
                </EmptyRow>
              )}
            </TBody>
          </Table>
        </div>
      </Card>

      {report && report.breakdown.length > 0 && (
        <Card>
          <CardHeader title="Distribuição por número" />
          <div className="overflow-hidden">
            <Table>
              <THead>
                <tr>
                  <Th>Account ID</Th>
                  <Th>Status</Th>
                  <Th>Quantidade</Th>
                </tr>
              </THead>
              <TBody>
                {report.breakdown.map((b, i) => (
                  <Tr key={i}>
                    <Td className="font-mono text-xs text-zinc-500">
                      {b.accountId}
                    </Td>
                    <Td>
                      <Badge tone={messageStatusTone(b.status)}>
                        {messageStatusLabel(b.status)}
                      </Badge>
                    </Td>
                    <Td>{b.count}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>
      )}

      {cancelOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
          onClick={() => !canceling && setCancelOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-zinc-200">
              <h3 className="font-semibold text-zinc-900">Cancelar campanha</h3>
              <p className="text-sm text-zinc-600 mt-1">
                {campaign.status === "scheduled"
                  ? "Mensagens agendadas serão removidas da fila e a campanha será marcada como cancelada."
                  : "Mensagens ainda não enviadas serão removidas da fila. As já enviadas continuam no WhatsApp dos destinatários, salvo se você marcar a opção abaixo."}
              </p>
            </div>
            {campaign.status !== "scheduled" && (
              <div className="px-5 py-4 border-b border-zinc-200">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded"
                    checked={revokeSent}
                    onChange={(e) => setRevokeSent(e.target.checked)}
                  />
                  <span className="text-sm text-zinc-800">
                    <span className="font-medium">
                      Apagar mensagens já enviadas no WhatsApp
                    </span>
                    <span className="block text-xs text-zinc-500 mt-0.5">
                      Tenta revogar (deletar para todos). Só funciona em
                      mensagens enviadas há menos de ~48h e que o destinatário
                      ainda não removeu.
                    </span>
                  </span>
                </label>
              </div>
            )}
            <div className="px-5 py-3 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setCancelOpen(false)}
                disabled={canceling}
              >
                Voltar
              </Button>
              <Button
                variant="danger"
                onClick={confirmCancel}
                disabled={canceling}
              >
                {canceling ? "Cancelando…" : "Cancelar campanha"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
