"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import {
  EmptyRow,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui/table";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Term } from "@/components/ui/term";
import {
  INBOUND_CLASSIFICATIONS,
  blocklistSourceLabel,
  inboundClassificationLabel,
  inboundClassificationTone,
} from "@/lib/labels";

type Inbound = {
  id: string;
  accountId: string;
  fromJid: string;
  text: string;
  classification:
    | "opt_out"
    | "interesse"
    | "duvida"
    | "reclamacao"
    | "outro"
    | null;
  confidence: number | null;
  createdAt: string;
};

type Blocklist = {
  id: string;
  jid: string;
  reason: string | null;
  source: string;
  blockedAt: string;
};


export default function InboundPage() {
  const [items, setItems] = useState<Inbound[]>([]);
  const [blocklist, setBlocklist] = useState<Blocklist[]>([]);

  async function refresh() {
    setItems(await api.get<Inbound[]>("/inbound"));
    setBlocklist(await api.get<Blocklist[]>("/inbound/blocklist"));
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  async function override(id: string, classification: string) {
    await api.post(`/inbound/${id}/override`, { classification });
    refresh();
  }

  async function unblock(jid: string) {
    if (!confirm(`Remover ${jid} da blocklist?`)) return;
    await api.delete(`/inbound/blocklist/${encodeURIComponent(jid)}`);
    refresh();
  }

  return (
    <div>
      <PageHeader
        title="Respostas (inbound)"
        description={
          <>
            A IA lê cada resposta recebida (<Term k="inbound">inbound</Term>) e
            classifica em <Term k="optOut">opt-out</Term>, interesse, dúvida,
            reclamação ou outro. Opt-outs vão automaticamente para a blocklist;
            você pode reverter qualquer classificação.
          </>
        }
      />

      <Card className="mb-8">
        <CardHeader
          title={
            <>
              <Term k="blocklist">Blocklist</Term> ({blocklist.length})
            </>
          }
          description="Contatos bloqueados — não receberão novas campanhas."
        />
        {blocklist.length === 0 ? (
          <CardBody>
            <p className="text-sm text-zinc-500">Nenhum contato bloqueado.</p>
          </CardBody>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {blocklist.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between px-5 py-3 text-sm"
              >
                <div>
                  <div className="font-mono text-xs text-zinc-700">{b.jid}</div>
                  <div className="text-xs text-zinc-500">
                    {b.reason} ·{" "}
                    <Badge tone="neutral">{blocklistSourceLabel(b.source)}</Badge>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => unblock(b.jid)}
                >
                  Desbloquear
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <h2 className="text-base font-semibold text-zinc-900 mb-3">
        Respostas recentes
      </h2>
      <Table>
        <THead>
          <tr>
            <Th>De</Th>
            <Th>Mensagem</Th>
            <Th>Classificação</Th>
            <Th>
              <Term k="confidence">Confiança</Term>
            </Th>
            <Th>Recebida</Th>
            <Th></Th>
          </tr>
        </THead>
        <TBody>
          {items.map((i) => (
            <Tr key={i.id}>
              <Td className="font-mono text-xs text-zinc-500 max-w-35 truncate">
                {i.fromJid}
              </Td>
              <Td className="max-w-md">
                <span className="text-zinc-800">{i.text}</span>
              </Td>
              <Td>
                {i.classification ? (
                  <Badge tone={inboundClassificationTone(i.classification)}>
                    {inboundClassificationLabel(i.classification)}
                  </Badge>
                ) : (
                  <span className="text-xs text-zinc-400">
                    classificando…
                  </span>
                )}
              </Td>
              <Td>
                {i.confidence != null ? (
                  <span className="text-xs text-zinc-600">
                    {(i.confidence * 100).toFixed(0)}%
                  </span>
                ) : (
                  "—"
                )}
              </Td>
              <Td className="text-xs text-zinc-500">
                {new Date(i.createdAt).toLocaleString()}
              </Td>
              <Td>
                <Select
                  className="h-8 text-xs"
                  value={i.classification ?? ""}
                  onChange={(e) => override(i.id, e.target.value)}
                >
                  <option value="" disabled>
                    Reclassificar…
                  </option>
                  {Object.entries(INBOUND_CLASSIFICATIONS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Td>
            </Tr>
          ))}
          {items.length === 0 && (
            <EmptyRow colSpan={6}>
              Nenhuma resposta recebida ainda.
            </EmptyRow>
          )}
        </TBody>
      </Table>
    </div>
  );
}
