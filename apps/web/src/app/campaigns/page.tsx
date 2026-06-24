"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Campaign } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
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
import {
  campaignCategoryLabel,
  campaignCategoryTone,
  campaignStatusLabel,
  campaignStatusTone,
} from "@/lib/labels";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  async function refresh() {
    setCampaigns(await api.get<Campaign[]>("/campaigns"));
  }
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <PageHeader
        title="Campanhas"
        description="Cada campanha define template, lista, pool de números, jitter e categoria."
        action={
          <Link href="/campaigns/new">
            <Button>+ Nova campanha</Button>
          </Link>
        }
      />

      <Table>
        <THead>
          <tr>
            <Th>Nome</Th>
            <Th>Categoria</Th>
            <Th>Status</Th>
            <Th>Pool</Th>
            <Th>Criada</Th>
            <Th></Th>
          </tr>
        </THead>
        <TBody>
          {campaigns.map((c) => (
            <Tr key={c.id}>
              <Td className="font-medium text-zinc-900">{c.name}</Td>
              <Td>
                <Badge tone={campaignCategoryTone(c.category)}>
                  {campaignCategoryLabel(c.category)}
                </Badge>
              </Td>
              <Td>
                <Badge tone={campaignStatusTone(c.status)}>
                  {campaignStatusLabel(c.status)}
                </Badge>
              </Td>
              <Td>
                {c.accountPoolIds.length} número
                {c.accountPoolIds.length === 1 ? "" : "s"}
              </Td>
              <Td className="text-xs text-zinc-500">
                {new Date(c.createdAt).toLocaleString()}
              </Td>
              <Td className="text-right">
                <Link
                  href={`/campaigns/${c.id}`}
                  className="text-sm font-medium text-zinc-900 hover:underline"
                >
                  Abrir →
                </Link>
              </Td>
            </Tr>
          ))}
          {campaigns.length === 0 && (
            <EmptyRow colSpan={6}>
              Nenhuma campanha ainda. Crie a primeira para começar a disparar.
            </EmptyRow>
          )}
        </TBody>
      </Table>
    </div>
  );
}
