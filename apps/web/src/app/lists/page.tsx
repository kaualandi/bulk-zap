"use client";

import { useEffect, useState } from "react";
import { api, type Contact, type Group, type List } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";

export default function ListsPage() {
  const [lists, setLists] = useState<List[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState({
    name: "",
    type: "groups" as List["type"],
  });
  const [selected, setSelected] = useState<List | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});

  async function refresh() {
    setLists(await api.get<List[]>("/lists"));
    setGroups(await api.get<Group[]>("/groups"));
    setContacts(await api.get<Contact[]>("/contacts"));
  }
  useEffect(() => {
    refresh();
  }, []);

  async function createList(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    await api.post("/lists", { name: form.name.trim(), type: form.type });
    setForm({ name: "", type: "groups" });
    refresh();
  }

  async function openList(l: List) {
    setSelected(l);
    setChecked(new Set());
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
    await api.post(`/lists/${selected.id}/members`, { members: toAdd });
    setMemberCounts((m) => ({ ...m, [selected.id]: toAdd.length }));
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

  return (
    <div>
      <PageHeader
        title="Listas"
        description="Agrupe grupos ou contatos em listas para reutilizar em campanhas."
      />

      <Card className="mb-8">
        <CardHeader title="Criar lista" />
        <CardBody>
          <form
            onSubmit={createList}
            className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end"
          >
            <Field label="Nome">
              <Input
                placeholder="Ex: Grupos VIP"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </Field>
            <Field label="Tipo">
              <Select
                value={form.type}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    type: e.target.value as List["type"],
                  }))
                }
              >
                <option value="groups">Grupos</option>
                <option value="contacts">Contatos</option>
              </Select>
            </Field>
            <div className="md:col-span-2">
              <Button type="submit">Criar lista</Button>
            </div>
          </form>
        </CardBody>
      </Card>

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
                    <Badge tone="neutral">
                      {l.type === "groups" ? "Grupos" : "Contatos"}
                    </Badge>
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
                  <Button onClick={saveMembers}>
                    Salvar ({checked.size})
                  </Button>
                }
              />
              <div className="max-h-[60vh] overflow-auto divide-y divide-zinc-100">
                {targets.map((t) => (
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
                {targets.length === 0 && (
                  <p className="px-5 py-8 text-center text-sm text-zinc-500">
                    Sem {selected.type} disponíveis. Sincronize um número
                    antes.
                  </p>
                )}
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
