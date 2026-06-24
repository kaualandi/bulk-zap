"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AiRiskBadge } from "@/components/ai-risk-badge";
import { useAiRisk } from "@/lib/use-ai-risk";
import { AiGenerateModal } from "@/components/ai-generate-modal";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

const EMPTY_FORM = { name: "", body: "" };

export function AddTemplateModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  // Hook must run unconditionally — it stays idle while the body is short/empty.
  const riskState = useAiRisk(form.body, "marketing");

  if (!open) return null;

  const detectedVars = Array.from(
    form.body.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)
  )
    .map((m) => m[1])
    .filter((v): v is string => Boolean(v));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.body.trim()) return;
    setCreating(true);
    try {
      await api.post("/templates", {
        name: form.name.trim(),
        body: form.body,
      });
      setForm(EMPTY_FORM);
      onCreated();
      onClose();
      toast.success("Template criado");
    } catch (err) {
      toast.error(`Erro ao criar template: ${(err as Error).message}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Novo template</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Use variáveis como {`{{nome}}`} — substituídas por dados do
              destinatário no envio.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAiModalOpen(true)}
            >
              ✨ Gerar com IA
            </Button>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-700"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>
        </div>

        <form onSubmit={create} className="p-6 flex flex-col gap-4">
          <Field label="Nome">
            <Input
              autoFocus
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

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={creating || !form.name.trim() || !form.body.trim()}
            >
              {creating ? "Criando…" : "Criar template"}
            </Button>
          </div>
        </form>
      </div>

      <AiGenerateModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onPick={(text) => setForm((f) => ({ ...f, body: text }))}
      />
    </div>
  );
}
