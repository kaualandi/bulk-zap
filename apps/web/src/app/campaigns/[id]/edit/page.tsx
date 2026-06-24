"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  api,
  type Account,
  type Campaign,
  type List,
  type Template,
} from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { accountStatusLabel, accountStatusTone } from "@/lib/labels";

const CATEGORIES = [
  { value: "marketing", label: "Marketing" },
  { value: "transacional", label: "Transacional" },
  { value: "atendimento", label: "Atendimento" },
  { value: "outros", label: "Outros" },
] as const;

function toLocalInput(date: string | null): string {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EditCampaignPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  const [name, setName] = useState("");
  const [category, setCategory] =
    useState<(typeof CATEGORIES)[number]["value"]>("outros");
  const [listId, setListId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [poolIds, setPoolIds] = useState<Set<string>>(new Set());
  const [jitterMin, setJitterMin] = useState(15);
  const [jitterMax, setJitterMax] = useState(90);
  const [scheduleAt, setScheduleAt] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notDraft, setNotDraft] = useState(false);

  useEffect(() => {
    (async () => {
      const [c, a, l, t] = await Promise.all([
        api.get<Campaign>(`/campaigns/${id}`),
        api.get<Account[]>("/accounts"),
        api.get<List[]>("/lists"),
        api.get<Template[]>("/templates"),
      ]);
      setAccounts(a);
      setLists(l);
      setTemplates(t);
      if (c.status !== "draft") {
        setNotDraft(true);
        return;
      }
      setName(c.name);
      setCategory(c.category);
      setListId(c.listId);
      setTemplateId(c.templateId);
      setPoolIds(new Set(c.accountPoolIds));
      setJitterMin(Math.round(c.jitterMinMs / 1000));
      setJitterMax(Math.round(c.jitterMaxMs / 1000));
      setScheduleAt(toLocalInput(c.scheduleAt));
      setLoaded(true);
    })();
  }, [id]);

  function togglePool(accountId: string) {
    setPoolIds((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }

  async function save() {
    if (!name.trim() || !templateId || !listId || poolIds.size === 0) {
      toast.error("Preencha nome, template, lista e pool.");
      return;
    }
    setSaving(true);
    const promise = api.put<Campaign>(`/campaigns/${id}`, {
      name: name.trim(),
      category,
      templateId,
      listId,
      accountPoolIds: [...poolIds],
      scheduleAt: scheduleAt
        ? new Date(scheduleAt).toISOString()
        : null,
      jitterMinMs: jitterMin * 1000,
      jitterMaxMs: jitterMax * 1000,
    });
    toast.promise(promise, {
      loading: "Salvando rascunho…",
      success: "Rascunho atualizado",
      error: (err) => `Erro: ${(err as Error).message}`,
    });
    try {
      await promise;
      router.push(`/campaigns/${id}`);
    } finally {
      setSaving(false);
    }
  }

  if (notDraft) {
    return (
      <div>
        <PageHeader
          title="Não é possível editar"
          description="Esta campanha não é um rascunho."
        />
        <Alert tone="warning">
          Apenas campanhas em rascunho podem ser editadas. Esta já foi
          iniciada ou agendada.
        </Alert>
        <div className="mt-4">
          <Button onClick={() => router.push(`/campaigns/${id}`)}>
            Voltar para a campanha
          </Button>
        </div>
      </div>
    );
  }

  if (!loaded) return <p className="text-sm text-zinc-500">Carregando…</p>;

  return (
    <div>
      <PageHeader
        title="Editar rascunho"
        description="Ajuste os parâmetros antes de disparar."
      />

      <Card>
        <CardHeader title="Detalhes" />
        <CardBody className="flex flex-col gap-5">
          <Field label="Nome">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>

          <div className="grid md:grid-cols-2 gap-5">
            <Field label="Categoria">
              <Select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as typeof category)
                }
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Template">
              <Select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                <option value="">Selecione…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Lista">
            <Select
              value={listId}
              onChange={(e) => setListId(e.target.value)}
            >
              <option value="">Selecione…</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.type})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Pool de números">
            <div className="border border-zinc-300 rounded-md max-h-56 overflow-auto bg-white divide-y divide-zinc-100">
              {accounts.map((a) => (
                <label
                  key={a.id}
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-zinc-50"
                >
                  <input
                    type="checkbox"
                    checked={poolIds.has(a.id)}
                    onChange={() => togglePool(a.id)}
                    className="rounded"
                  />
                  <span className="text-sm flex-1">{a.displayName}</span>
                  <Badge tone={accountStatusTone(a.status)}>
                    {accountStatusLabel(a.status)}
                  </Badge>
                </label>
              ))}
            </div>
          </Field>

          <div className="grid md:grid-cols-3 gap-5">
            <Field label="Jitter mínimo (s)">
              <Input
                type="number"
                min={1}
                value={jitterMin}
                onChange={(e) => setJitterMin(Number(e.target.value))}
              />
            </Field>
            <Field label="Jitter máximo (s)">
              <Input
                type="number"
                min={1}
                value={jitterMax}
                onChange={(e) => setJitterMax(Number(e.target.value))}
              />
            </Field>
            <Field label="Agendar para (opcional)">
              <Input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
              />
            </Field>
          </div>

          <div className="flex gap-3 pt-2">
            <Button onClick={save} disabled={saving}>
              {saving ? "Salvando…" : "Salvar alterações"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => router.push(`/campaigns/${id}`)}
            >
              Cancelar
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
