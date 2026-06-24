"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, API_URL, type Account } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Term } from "@/components/ui/term";
import {
  accountStatusLabel,
  accountStatusTone,
  accountEventLabel,
  warmupModeLabel,
} from "@/lib/labels";

type WsEvent =
  | { type: "qr"; qr: string; dataUrl: string }
  | { type: "connecting" }
  | { type: "connected" }
  | { type: "disconnected"; reason?: string }
  | { type: "banned"; reason?: string }
  | { type: "contacts-updated" }
  | { type: "groups-updated" };

export default function AccountDetailPage() {
  const params = useParams<{ id: string }>();
  const accountId = params.id;

  const [account, setAccount] = useState<Account | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [eventLog, setEventLog] = useState<string[]>([]);

  async function refresh() {
    const a = await api.get<Account>(`/accounts/${accountId}`);
    setAccount(a);
  }

  useEffect(() => {
    refresh();
    const wsUrl = API_URL.replace(/^http/, "ws");
    const ws = new WebSocket(`${wsUrl}/accounts/${accountId}/events`);
    ws.onmessage = (e) => {
      const event = JSON.parse(e.data) as WsEvent;
      setEventLog((prev) =>
        [
          `${new Date().toLocaleTimeString()} — ${accountEventLabel(event.type)}`,
          ...prev,
        ].slice(0, 10)
      );
      if (event.type === "qr") setQrDataUrl(event.dataUrl);
      if (event.type === "connected") setQrDataUrl(null);
      refresh();
    };
    return () => ws.close();
  }, [accountId]);

  async function connect() {
    await api.post(`/accounts/${accountId}/connect`);
    refresh();
  }
  async function disconnect() {
    await api.post(`/accounts/${accountId}/disconnect`);
    setQrDataUrl(null);
    refresh();
  }
  async function logout() {
    if (!confirm("Limpar sessão e desconectar este número?")) return;
    await api.post(`/accounts/${accountId}/logout`);
    setQrDataUrl(null);
    refresh();
  }
  async function syncGroups() {
    await api.post(`/accounts/${accountId}/sync-groups`);
  }

  if (!account)
    return <p className="text-sm text-zinc-500">Carregando…</p>;

  return (
    <div>
      <PageHeader
        title={account.displayName}
        description={
          account.driver === "baileys" ? (
            <>
              <Term k="driver">Driver</Term> Baileys (não-oficial, via QR Code).
              Suporta envio em grupos.
            </>
          ) : (
            <>
              <Term k="driver">Driver</Term> Cloud API (oficial da Meta). Apenas
              mensagens 1-a-1.
            </>
          )
        }
        action={
          <span className="flex items-center gap-2">
            <Term k="status">Status</Term>
            <Badge tone={accountStatusTone(account.status)}>
              {accountStatusLabel(account.status)}
            </Badge>
          </span>
        }
      />

      {account.lastConnectionError && (
        <div className="mb-6">
          <Alert tone="danger" title="Último erro de conexão">
            {account.lastConnectionError}
          </Alert>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_auto] gap-6 items-start">
        <Card>
          <CardHeader title="Ações" />
          <CardBody className="flex flex-wrap gap-3">
            <Button onClick={connect}>Conectar</Button>
            <Button variant="secondary" onClick={disconnect}>
              Desconectar
            </Button>
            <Button variant="danger" onClick={logout}>
              Logout (limpa sessão)
            </Button>
            <Button
              variant="secondary"
              onClick={syncGroups}
              disabled={account.status !== "connected"}
            >
              Sincronizar grupos
            </Button>
          </CardBody>

          <CardHeader title="Configuração" />
          <CardBody>
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-zinc-500">
                <Term k="warmup">Warmup</Term>
              </dt>
              <dd className="text-zinc-900">
                {warmupModeLabel(account.warmupMode)}
              </dd>
              <dt className="text-zinc-500">
                <Term k="dailyLimit">Limite diário</Term>
              </dt>
              <dd className="text-zinc-900">
                {account.dailyLimit ?? (
                  <span className="text-zinc-400">Sem limite</span>
                )}
              </dd>
              <dt className="text-zinc-500">Enviadas hoje</dt>
              <dd className="text-zinc-900">{account.dailyUsed}</dd>
              <dt className="text-zinc-500">Telefone</dt>
              <dd className="text-zinc-900">
                {account.phoneE164 ?? (
                  <span className="text-zinc-400">—</span>
                )}
              </dd>
            </dl>
          </CardBody>
        </Card>

        <Card className="w-fit">
          <CardHeader
            title={<Term k="qrCode">QR Code</Term>}
            description="Escaneie no WhatsApp"
          />
          <CardBody>
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt="QR Code WhatsApp"
                className="w-64 h-64 rounded-md"
              />
            ) : (
              <div className="w-64 h-64 rounded-md bg-zinc-50 border border-dashed border-zinc-300 flex items-center justify-center text-sm text-zinc-400 text-center px-4">
                {account.status === "connected"
                  ? "Número conectado."
                  : "Clique em Conectar para gerar o QR."}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {eventLog.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Eventos recentes" />
          <CardBody>
            <ul className="space-y-1 text-xs font-mono text-zinc-600">
              {eventLog.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
