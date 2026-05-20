"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (text: string) => void;
};

const CATEGORIES = [
  { value: "marketing", label: "Marketing" },
  { value: "transacional", label: "Transacional" },
  { value: "atendimento", label: "Atendimento" },
  { value: "outros", label: "Outros" },
] as const;

export function AiGenerateModal({ open, onClose, onPick }: Props) {
  const [description, setDescription] = useState("");
  const [category, setCategory] =
    useState<(typeof CATEGORIES)[number]["value"]>("marketing");
  const [tone, setTone] = useState("");
  const [loading, setLoading] = useState(false);
  const [variations, setVariations] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  if (!open) return null;

  async function generate() {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    setVariations([]);
    try {
      const res = await api.post<{ variations: string[] }>(
        "/ai/templates/generate",
        { description, category, tone: tone || undefined }
      );
      setVariations(res.variations);
    } catch (err) {
      const msg = (err as Error).message ?? "";
      if (msg.includes("503") || msg.includes("ai_unavailable")) {
        setUnavailable(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Gerar template com IA</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Descreva o que você quer comunicar; geramos 3 variações.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          {unavailable && (
            <Alert tone="warning" title="IA indisponível">
              Configure <code>ANTHROPIC_API_KEY</code> no servidor para ativar
              geração de templates.
            </Alert>
          )}
          {error && <Alert tone="danger">{error}</Alert>}

          <Field label="O que comunicar">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: anunciar promoção de 30% off para clientes VIP no Black Friday"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
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
            <Field label="Tom (opcional)">
              <Input
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder="Ex: amigável, formal, urgente"
              />
            </Field>
          </div>

          <div>
            <Button
              onClick={generate}
              disabled={loading || description.trim().length < 5}
            >
              {loading ? "Gerando…" : "Gerar 3 variações"}
            </Button>
          </div>

          {variations.length > 0 && (
            <div className="flex flex-col gap-3 pt-3 border-t border-zinc-200">
              <h3 className="text-sm font-semibold text-zinc-700">
                Variações geradas
              </h3>
              {variations.map((v, i) => (
                <div
                  key={i}
                  className="border border-zinc-200 rounded-lg p-3 flex items-start gap-3"
                >
                  <pre className="flex-1 whitespace-pre-wrap text-sm font-sans text-zinc-800">
                    {v}
                  </pre>
                  <Button
                    size="sm"
                    onClick={() => {
                      onPick(v);
                      onClose();
                    }}
                  >
                    Usar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
