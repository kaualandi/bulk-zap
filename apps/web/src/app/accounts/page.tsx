"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Account } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
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
import { Term } from "@/components/ui/term";

const statusTone: Record<
  Account["status"],
  "neutral" | "warning" | "success" | "danger"
> = {
  disconnected: "neutral",
  connecting: "warning",
  connected: "success",
  banned: "danger",
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    displayName: "",
    warmupMode: "off" as Account["warmupMode"],
    dailyLimit: "",
  });

  async function refresh() {
    const data = await api.get<Account[]>("/accounts");
    setAccounts(data);
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, []);

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!form.displayName.trim()) return;
    setCreating(true);
    try {
      await api.post<Account>("/accounts", {
        displayName: form.displayName.trim(),
        warmupMode: form.warmupMode,
        dailyLimit: form.dailyLimit ? Number(form.dailyLimit) : null,
      });
      setForm({ displayName: "", warmupMode: "off", dailyLimit: "" });
      refresh();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Números"
        description="Conjunto de números do WhatsApp que serão usados para disparar mensagens."
      />

      <div className="text-sm text-zinc-600 mb-6 leading-relaxed flex flex-wrap gap-x-1">
        <span>Termos:</span>
        <Term k="pool">pool</Term>
        <span>·</span>
        <Term k="driver" />
        <span>·</span>
        <Term k="baileys" />
        <span>·</span>
        <Term k="cloudApi">Cloud API</Term>
        <span>·</span>
        <Term k="warmup">warmup</Term>
        <span>·</span>
        <Term k="status">status</Term>
      </div>

      <Card className="mb-8">
        <CardHeader
          title="Adicionar novo número"
          description="O warmup é opcional — deixe 'sem warmup' se quer disparar normalmente. Deixe o limite diário vazio para sem teto."
        />
        <CardBody>
          <form
            onSubmit={createAccount}
            className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end"
          >
            <Field label="Nome do número">
              <Input
                placeholder="Ex: Comercial"
                value={form.displayName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, displayName: e.target.value }))
                }
              />
            </Field>
            <Field label="Modo warmup">
              <Select
                value={form.warmupMode}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    warmupMode: e.target.value as Account["warmupMode"],
                  }))
                }
              >
                <option value="off">Sem warmup</option>
                <option value="auto">Automático (cresce a cada dia)</option>
                <option value="manual">Manual</option>
              </Select>
            </Field>
            <Field label="Limite diário" hint="Vazio = sem limite">
              <Input
                type="number"
                min={0}
                placeholder="Ex: 500"
                value={form.dailyLimit}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dailyLimit: e.target.value }))
                }
              />
            </Field>
            <Button type="submit" disabled={creating}>
              Adicionar
            </Button>
          </form>
        </CardBody>
      </Card>

      <Table>
        <THead>
          <tr>
            <Th>Nome</Th>
            <Th>Driver</Th>
            <Th>Status</Th>
            <Th>Limite diário</Th>
            <Th>Enviadas hoje</Th>
            <Th></Th>
          </tr>
        </THead>
        <TBody>
          {accounts.map((a) => (
            <Tr key={a.id}>
              <Td className="font-medium text-zinc-900">{a.displayName}</Td>
              <Td>
                <Badge tone="neutral">{a.driver}</Badge>
              </Td>
              <Td>
                <Badge tone={statusTone[a.status]}>{a.status}</Badge>
              </Td>
              <Td>
                {a.dailyLimit ?? (
                  <span className="text-zinc-400">Sem limite</span>
                )}
              </Td>
              <Td>{a.dailyUsed}</Td>
              <Td className="text-right">
                <Link
                  href={`/accounts/${a.id}`}
                  className="text-sm font-medium text-zinc-900 hover:underline"
                >
                  Abrir →
                </Link>
              </Td>
            </Tr>
          ))}
          {accounts.length === 0 && (
            <EmptyRow colSpan={6}>
              Nenhum número cadastrado ainda. Adicione um acima para começar.
            </EmptyRow>
          )}
        </TBody>
      </Table>
    </div>
  );
}
