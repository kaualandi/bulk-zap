"use client";

import { useEffect, useState } from "react";
import { api, type Account, type Group } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  EmptyRow,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui/table";

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string>("");

  async function refresh() {
    setAccounts(await api.get<Account[]>("/accounts"));
    const path = accountId ? `/groups?accountId=${accountId}` : "/groups";
    setGroups(await api.get<Group[]>(path));
  }
  useEffect(() => {
    refresh();
  }, [accountId]);

  async function syncFor(id: string) {
    await api.post(`/accounts/${id}/sync-groups`);
    refresh();
  }

  return (
    <div>
      <PageHeader
        title="Grupos"
        description="Grupos sincronizados dos números conectados. Cada grupo só pode receber disparo de números que sejam membros."
      />

      <div className="flex items-center gap-3 mb-6">
        <div className="w-72">
          <Select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">Todos os números</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName} ({a.status})
              </option>
            ))}
          </Select>
        </div>
        {accountId && (
          <Button variant="secondary" onClick={() => syncFor(accountId)}>
            Sincronizar este número
          </Button>
        )}
      </div>

      <Table>
        <THead>
          <tr>
            <Th>Grupo</Th>
            <Th>JID</Th>
            <Th>Participantes</Th>
            <Th>Última sync</Th>
          </tr>
        </THead>
        <TBody>
          {groups.map((g) => (
            <Tr key={g.id}>
              <Td className="font-medium text-zinc-900">{g.subject}</Td>
              <Td className="font-mono text-xs text-zinc-500">{g.jid}</Td>
              <Td>{g.participantsCount ?? "—"}</Td>
              <Td className="text-xs text-zinc-500">
                {g.lastSyncedAt
                  ? new Date(g.lastSyncedAt).toLocaleString()
                  : "—"}
              </Td>
            </Tr>
          ))}
          {groups.length === 0 && (
            <EmptyRow colSpan={4}>
              Nenhum grupo sincronizado. Sincronize um número para popular esta
              lista.
            </EmptyRow>
          )}
        </TBody>
      </Table>
    </div>
  );
}
