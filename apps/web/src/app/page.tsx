import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";

const cards = [
  {
    href: "/accounts",
    title: "Conectar número",
    description:
      "Escaneie um QR e veja o número conectado em segundos. Sincroniza contatos e grupos automaticamente.",
  },
  {
    href: "/campaigns/new",
    title: "Nova campanha",
    description:
      "Crie disparos em grupos com jitter, rotação de números e validação pool×grupo antes de enviar.",
  },
  {
    href: "/reports",
    title: "Acompanhar resultados",
    description:
      "Mensagens enviadas, falhas e estado de cada número em tempo real.",
  },
];

export default function Page() {
  return (
    <div>
      <PageHeader
        title="BulkZap"
        description="Plataforma de disparos WhatsApp em grupos. Antes de mais nada, conecte um número e sincronize seus grupos."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="block group">
            <Card className="h-full transition-shadow group-hover:shadow-md group-hover:border-zinc-300">
              <CardBody>
                <h2 className="font-semibold text-zinc-900 mb-1">{c.title}</h2>
                <p className="text-sm text-zinc-600 leading-relaxed">
                  {c.description}
                </p>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
