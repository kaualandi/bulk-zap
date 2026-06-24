"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, type Contact, type Group, type List } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { AddListModal } from "@/components/add-list-modal";
import { cn } from "@/lib/cn";
import { listTypeLabel } from "@/lib/labels";

export default function ListsPage() {
  const [lists, setLists] = useState<List[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<List | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [memberFilter, setMemberFilter] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLists(await api.get<List[]>("/lists"));
    setGroups(await api.get<Group[]>("/groups"));
    setContacts(await api.get<Contact[]>("/contacts"));
  }
  useEffect(() => {
    refresh();
  }, []);

  async function openList(l: List) {
    setSelected(l);
    setChecked(new Set());
    setMemberFilter("");
    const members = await api.get<{ targetId: string }[]>(
      `/lists/${l.id}/members`
    );
    setChecked(new Set(members.map((m) => m.targetId)));
    setMemberCounts((m) => ({ ...m, [l.id]: members.length }));
  }

  async function saveMembers() {
    if (!selected) return;
    const items =
      selected.type === "groups"
        ? groups.map((g) => ({ targetType: "group" as const, targetId: g.id }))
        : contacts.map((c) => ({
            targetType: "contact" as const,
            targetId: c.id,
          }));
    const toAdd = items.filter((i) => checked.has(i.targetId));
    setSaving(true);
    const promise = api.post(`/lists/${selected.id}/members`, {
      members: toAdd,
    });
    toast.promise(promise, {
      loading: "Salvando membros...",
      success: () => {
        setMemberCounts((m) => ({ ...m, [selected.id]: toAdd.length }));
        return `${toAdd.length} membro${toAdd.length === 1 ? "" : "s"} salvo${toAdd.length === 1 ? "" : "s"}`;
      },
      error: (err) => `Erro ao salvar: ${(err as Error).message}`,
    });
    try {
      await promise;
    } finally {
      setSaving(false);
    }
  }

  function toggle(id: string) {
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const targets = selected?.type === "groups" ? groups : contacts;

  const filteredTargets = useMemo(() => {
    const q = memberFilter.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter((t) => {
      const label =
        selected?.type === "groups"
          ? (t as Group).subject
          : ((t as Contact).name ??
            (t as Contact).pushName ??
            (t as Contact).jid);
      return label.toLowerCase().includes(q);
    });
  }, [targets, memberFilter, selected]);

  return (
    <div>
      <PageHeader
        title="Listas"
        description="Agrupe grupos ou contatos em listas para reutilizar em campanhas."
        action={
          <Button onClick={() => setModalOpen(true)}>Nova lista</Button>
        }
      />

      <AddListModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={refresh}
      />

      <div className="grid md:grid-cols-[320px_1fr] gap-6">
        <Card>
          <CardHeader title="Listas existentes" />
          {lists.length === 0 ? (
            <CardBody>
              <p className="text-sm text-zinc-500">Nenhuma lista ainda.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {lists.map((l) => (
                <li
                  key={l.id}
                  className={cn(
                    "px-5 py-3 cursor-pointer transition-colors",
                    selected?.id === l.id
                      ? "bg-zinc-50"
                      : "hover:bg-zinc-50/60"
                  )}
                  onClick={() => openList(l)}
                >
                  <div className="font-medium text-sm text-zinc-900">
                    {l.name}
                  </div>
                  <div className="text-xs text-zinc-500 flex items-center gap-2 mt-0.5">
                    <Badge tone="neutral">{listTypeLabel(l.type)}</Badge>
                    {memberCounts[l.id] != null && (
                      <span>{memberCounts[l.id]} membros</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div>
          {selected ? (
            <Card>
              <CardHeader
                title={`Membros: ${selected.name}`}
                description={`Selecione ${selected.type === "groups" ? "grupos" : "contatos"} para incluir.`}
                action={
                  <Button onClick={saveMembers} disabled={saving}>
                    {saving ? "Salvando…" : `Salvar (${checked.size})`}
                  </Button>
                }
              />
              <div className="px-5 pt-4 pb-3 border-b border-zinc-100">
                <Input
                  placeholder={`Buscar ${selected.type === "groups" ? "grupos" : "contatos"}…`}
                  value={memberFilter}
                  onChange={(e) => setMemberFilter(e.target.value)}
                />
                {memberFilter && (
                  <p className="text-xs text-zinc-500 mt-2">
                    Mostrando {filteredTargets.length} de {targets.length}
                  </p>
                )}
              </div>
              <div className="max-h-[60vh] overflow-auto divide-y divide-zinc-100">
                {filteredTargets.map((t) => (
                  <label
                    key={t.id}
                    className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-zinc-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked.has(t.id)}
                      onChange={() => toggle(t.id)}
                      className="rounded"
                    />
                    <span className="text-sm text-zinc-800">
                      {selected.type === "groups"
                        ? (t as Group).subject
                        : ((t as Contact).name ??
                          (t as Contact).pushName ??
                          (t as Contact).jid)}
                    </span>
                  </label>
                ))}
                {targets.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-zinc-500">
                    Sem {selected.type} disponíveis. Sincronize um número
                    antes.
                  </p>
                ) : filteredTargets.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-zinc-500">
                    Nenhum resultado para &quot;{memberFilter}&quot;.
                  </p>
                ) : null}
              </div>
            </Card>
          ) : (
            <EmptyState
              title="Selecione uma lista"
              description="Clique numa lista à esquerda para gerenciar seus membros."
            />
          )}
        </div>
      </div>
    </div>
  );
}
