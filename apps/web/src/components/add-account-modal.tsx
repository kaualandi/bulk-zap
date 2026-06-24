"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api, type Account } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Term } from "@/components/ui/term";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

const EMPTY_FORM = {
  displayName: "",
  warmupMode: "off" as Account["warmupMode"],
  dailyLimit: "",
};

export function AddAccountModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  if (!open) return null;

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
      setForm(EMPTY_FORM);
      onCreated();
      onClose();
      toast.success("Número adicionado");
    } catch (err) {
      toast.error(`Erro ao adicionar número: ${(err as Error).message}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-auto">
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Adicionar novo número</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              O warmup é opcional — deixe &ldquo;sem warmup&rdquo; se quer
              disparar normalmente. Deixe o limite diário vazio para sem teto.
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

        <form onSubmit={createAccount} className="p-6 flex flex-col gap-4">
          <Field label="Nome do número">
            <Input
              autoFocus
              placeholder="Ex: Comercial"
              value={form.displayName}
              onChange={(e) =>
                setForm((f) => ({ ...f, displayName: e.target.value }))
              }
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={<Term k="warmup">Modo warmup</Term>}>
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
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={creating || !form.displayName.trim()}>
              {creating ? "Adicionando…" : "Adicionar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
