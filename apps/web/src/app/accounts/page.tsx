"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Account } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AddAccountModal } from "@/components/add-account-modal";
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
import {
  accountStatusLabel,
  accountStatusTone,
  driverLabel,
} from "@/lib/labels";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  async function refresh() {
    const data = await api.get<Account[]>("/accounts");
    setAccounts(data);
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <PageHeader
        title="Números"
        description={
          <>
            O <Term k="pool">pool</Term> de números do WhatsApp usados para
            disparar mensagens.
          </>
        }
        action={
          <Button onClick={() => setModalOpen(true)}>Adicionar número</Button>
        }
      />

      <AddAccountModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={refresh}
      />

      <Table>
        <THead>
          <tr>
            <Th>Nome</Th>
            <Th>
              <Term k="driver" />
            </Th>
            <Th>
              <Term k="status" />
            </Th>
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
                <Badge tone="neutral">{driverLabel(a.driver)}</Badge>
              </Td>
              <Td>
                <Badge tone={accountStatusTone(a.status)}>
                  {accountStatusLabel(a.status)}
                </Badge>
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
                  aria-label={`Abrir ${a.displayName}`}
                  title="Abrir"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </Link>
              </Td>
            </Tr>
          ))}
          {accounts.length === 0 && (
            <EmptyRow colSpan={6}>
              Nenhum número cadastrado ainda. Clique em “Adicionar número” para
              começar.
            </EmptyRow>
          )}
        </TBody>
      </Table>
    </div>
  );
}
