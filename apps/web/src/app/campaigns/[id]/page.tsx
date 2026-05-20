"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, API_URL, type Campaign } from "@/lib/api";
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

const statusTone: Record<
  Campaign["status"],
  "neutral" | "warning" | "info" | "success" | "danger"
> = {
  draft: "neutral",
  scheduled: "info",
  running: "warning",
  paused: "neutral",
  completed: "success",
  failed: "danger",
};

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [report, setReport] = useState<{
    runs: Run[];
    breakdown: { accountId: string; status: string; count: number }[];
  } | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [summarizing, setSummarizing] = useState(false);
  const [summaryUnavailable, setSummaryUnavailable] = useState(false);

  async function refresh() {
    const [c, r, rep] = await Promise.all([
      api.get<Campaign>(`/campaigns/${id}`),
      api.get<Run[]>(`/campaigns/${id}/runs`),
      api.get<typeof report>(`/reports/campaign/${id}`),
    ]);
    setCampaign(c);
    setRuns(r);
    setReport(rep);
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
            <Badge tone={statusTone[campaign.status]}>{campaign.status}</Badge>
            {campaign.status === "running" && (
              <Button variant="secondary" onClick={pause}>
                Pausar
              </Button>
            )}
          </div>
        }
      />

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
                    <Badge tone="neutral">{r.status}</Badge>
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
                      <Badge
                        tone={
                          b.status === "sent"
                            ? "success"
                            : b.status === "failed"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {b.status}
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
    </div>
  );
}
