"use client";

import { useEffect, useState } from "react";
import { api, type Template } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { AddTemplateModal } from "@/components/add-template-modal";
import { Term } from "@/components/ui/term";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  async function refresh() {
    setTemplates(await api.get<Template[]>("/templates"));
  }
  useEffect(() => {
    refresh();
  }, []);

  async function remove(id: string) {
    if (!confirm("Excluir este template?")) return;
    await api.delete(`/templates/${id}`);
    refresh();
  }

  return (
    <div>
      <PageHeader
        title="Templates de mensagem"
        description={
          <>
            Crie <Term k="template">templates</Term> reutilizáveis com variáveis
            como {`{{nome}}`} — substituídas por dados do destinatário no envio.
            O risk-check de IA avalia o tom como{" "}
            <Term k="marketing">categoria marketing</Term>.
          </>
        }
        action={
          <Button onClick={() => setModalOpen(true)}>Novo template</Button>
        }
      />

      <AddTemplateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={refresh}
      />

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
    </div>
  );
}
