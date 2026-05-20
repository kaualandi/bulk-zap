"use client";

import { useEffect, useState } from "react";
import { api, type Template } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { AiRiskBadge } from "@/components/ai-risk-badge";
import { useAiRisk } from "@/lib/use-ai-risk";
import { AiGenerateModal } from "@/components/ai-generate-modal";
import { Term } from "@/components/ui/term";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [form, setForm] = useState({ name: "", body: "" });
  const [aiModalOpen, setAiModalOpen] = useState(false);

  async function refresh() {
    setTemplates(await api.get<Template[]>("/templates"));
  }
  useEffect(() => {
    refresh();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.body.trim()) return;
    await api.post("/templates", { name: form.name.trim(), body: form.body });
    setForm({ name: "", body: "" });
    refresh();
  }

  async function remove(id: string) {
    if (!confirm("Excluir este template?")) return;
    await api.delete(`/templates/${id}`);
    refresh();
  }

  const detectedVars = Array.from(form.body.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g))
    .map((m) => m[1])
    .filter((v): v is string => Boolean(v));

  const riskState = useAiRisk(form.body, "marketing");

  return (
    <div>
      <PageHeader
        title="Templates de mensagem"
        description={`Use {{nome}} ou outras variáveis. As variáveis são substituídas por dados do destinatário na hora do envio.`}
      />

      <div className="text-sm text-zinc-600 mb-6 leading-relaxed flex flex-wrap gap-x-1">
        <span>Termos:</span>
        <Term k="template" />
        <span>·</span>
        <Term k="marketing">categoria marketing</Term>
        <span>·</span>
        <span>
          O risk-check usa IA para avaliar quão promocional/spammy a mensagem
          soa.
        </span>
      </div>

      <Card className="mb-8">
        <CardHeader
          title="Novo template"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAiModalOpen(true)}
            >
              ✨ Gerar com IA
            </Button>
          }
        />
        <CardBody>
          <form onSubmit={create} className="flex flex-col gap-4">
            <Field label="Nome">
              <Input
                placeholder="Ex: Boas-vindas"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </Field>
            <Field
              label="Corpo da mensagem"
              hint='Exemplo: "Oi {{nome}}, novidade!"'
            >
              <Textarea
                placeholder="Digite a mensagem…"
                value={form.body}
                onChange={(e) =>
                  setForm((f) => ({ ...f, body: e.target.value }))
                }
              />
            </Field>
            {detectedVars.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-zinc-500">
                  Variáveis detectadas:
                </span>
                {detectedVars.map((v) => (
                  <Badge key={v} tone="info">{`{{${v}}}`}</Badge>
                ))}
              </div>
            )}
            <AiRiskBadge state={riskState} />
            <div>
              <Button type="submit">Criar template</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {templates.length === 0 ? (
        <EmptyState
          title="Nenhum template criado"
          description="Templates ficam reutilizáveis em campanhas."
        />
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardBody className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-zinc-900">{t.name}</h3>
                  <p className="text-sm text-zinc-700 whitespace-pre-wrap mt-1">
                    {t.body}
                  </p>
                  {t.variables.length > 0 && (
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {t.variables.map((v) => (
                        <Badge
                          key={v}
                          tone="info"
                        >{`{{${v}}}`}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => remove(t.id)}
                >
                  Excluir
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <AiGenerateModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onPick={(text) => setForm((f) => ({ ...f, body: text }))}
      />
    </div>
  );
}
