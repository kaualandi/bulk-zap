"use client";

import { useEffect, useState } from "react";
import { api, type Account } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import {
  EmptyRow,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui/table";
import { accountStatusLabel, accountStatusTone } from "@/lib/labels";

type Stats = { status: string; count: number }[];

export default function ReportsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [perAccount, setPerAccount] = useState<Record<string, Stats>>({});

  useEffect(() => {
    api.get<Account[]>("/accounts").then(async (acc) => {
      setAccounts(acc);
      for (const a of acc) {
        try {
          const res = await api.get<{ stats: Stats }>(
            `/reports/account/${a.id}`
          );
          setPerAccount((p) => ({ ...p, [a.id]: res.stats }));
        } catch {
          /* ignore */
        }
      }
    });
  }, []);

  function statFor(stats: Stats | undefined, key: string) {
    return stats?.find((s) => s.status === key)?.count ?? 0;
  }

  return (
    <div>
      <PageHeader
        title="Relatórios por número"
        description="Total acumulado de mensagens por número e estado atual."
      />

      <Table>
        <THead>
          <tr>
            <Th>Número</Th>
            <Th>Status</Th>
            <Th>Enviadas (total)</Th>
            <Th>Falhas</Th>
            <Th>Limite diário</Th>
            <Th>Hoje</Th>
          </tr>
        </THead>
        <TBody>
          {accounts.map((a) => {
            const stats = perAccount[a.id];
            return (
              <Tr key={a.id}>
                <Td className="font-medium text-zinc-900">{a.displayName}</Td>
                <Td>
                  <Badge tone={accountStatusTone(a.status)}>
                    {accountStatusLabel(a.status)}
                  </Badge>
                </Td>
                <Td className="text-green-700 font-medium">
                  {statFor(stats, "sent")}
                </Td>
                <Td className="text-red-700 font-medium">
                  {statFor(stats, "failed")}
                </Td>
                <Td>
                  {a.dailyLimit ?? (
                    <span className="text-zinc-400">Sem limite</span>
                  )}
                </Td>
                <Td>{a.dailyUsed}</Td>
              </Tr>
            );
          })}
          {accounts.length === 0 && (
            <EmptyRow colSpan={6}>
              Nenhum número cadastrado ainda.
            </EmptyRow>
          )}
        </TBody>
      </Table>
    </div>
  );
}
