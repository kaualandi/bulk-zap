"use client";

import { useEffect, useState } from "react";
import { api, type Contact } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { contactSourceLabel } from "@/lib/labels";
import {
  EmptyRow,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui/table";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filter, setFilter] = useState("");

  async function refresh() {
    setContacts(await api.get<Contact[]>("/contacts"));
  }
  useEffect(() => {
    refresh();
  }, []);

  const filtered = contacts.filter((c) =>
    [c.name, c.pushName, c.jid]
      .filter(Boolean)
      .some((s) => s!.toLowerCase().includes(filter.toLowerCase()))
  );

  return (
    <div>
      <PageHeader
        title="Contatos"
        description="Contatos sincronizados automaticamente dos números conectados. Você também pode importar via CSV."
      />

      <div className="mb-4 max-w-sm">
        <Input
          placeholder="Filtrar por nome ou número…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <Table>
        <THead>
          <tr>
            <Th>Nome</Th>
            <Th>Push name</Th>
            <Th>JID</Th>
            <Th>Origem</Th>
          </tr>
        </THead>
        <TBody>
          {filtered.map((c) => (
            <Tr key={c.id}>
              <Td className="font-medium text-zinc-900">
                {c.name ?? <span className="text-zinc-400">—</span>}
              </Td>
              <Td>{c.pushName ?? <span className="text-zinc-400">—</span>}</Td>
              <Td className="font-mono text-xs text-zinc-500">{c.jid}</Td>
              <Td>
                <Badge tone="neutral">{contactSourceLabel(c.source)}</Badge>
              </Td>
            </Tr>
          ))}
          {filtered.length === 0 && (
            <EmptyRow colSpan={4}>
              Nenhum contato. Conecte um número para sincronizar
              automaticamente.
            </EmptyRow>
          )}
        </TBody>
      </Table>
    </div>
  );
}
