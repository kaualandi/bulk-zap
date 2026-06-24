"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api, type List } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

const EMPTY_FORM = {
  name: "",
  type: "groups" as List["type"],
};

export function AddListModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  if (!open) return null;

  async function createList(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      await api.post("/lists", { name: form.name.trim(), type: form.type });
      setForm(EMPTY_FORM);
      onCreated();
      onClose();
      toast.success("Lista criada");
    } catch (err) {
      toast.error(`Erro ao criar lista: ${(err as Error).message}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-auto">
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Nova lista</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Agrupe grupos ou contatos para reutilizar em campanhas. Os membros
              são escolhidos depois de criar a lista.
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

        <form onSubmit={createList} className="p-6 flex flex-col gap-4">
          <Field label="Nome">
            <Input
              autoFocus
              placeholder="Ex: Grupos VIP"
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
            />
          </Field>

          <Field label="Tipo" hint="Define se a lista agrupa grupos ou contatos.">
            <Select
              value={form.type}
              onChange={(e) =>
                setForm((f) => ({ ...f, type: e.target.value as List["type"] }))
              }
            >
              <option value="groups">Grupos</option>
              <option value="contacts">Contatos</option>
            </Select>
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={creating || !form.name.trim()}>
              {creating ? "Criando…" : "Criar lista"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
