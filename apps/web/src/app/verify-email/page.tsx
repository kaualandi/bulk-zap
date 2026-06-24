"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { sendVerificationEmail, useSession } from "@/lib/auth-client";

function VerifyEmailInner() {
  const params = useSearchParams();
  const { data: session } = useSession();
  const errorParam = params.get("error");
  const verified = params.get("verified") === "true";

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);

  async function onResend(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await sendVerificationEmail({
      email: session?.user.email ?? email,
      callbackURL: "/verify-email?verified=true",
    });
    setLoading(false);
    if (error) {
      toast.error(error.message || "Não foi possível reenviar o e-mail.");
      return;
    }
    setResent(true);
    toast.success("E-mail de confirmação reenviado.");
  }

  // Successful verification (callbackURL landed back here).
  if (verified || (session && session.user.emailVerified)) {
    return (
      <Card>
        <CardBody className="flex flex-col gap-4">
          <h1 className="text-xl font-semibold text-zinc-900">
            E-mail confirmado
          </h1>
          <Alert tone="success">
            Sua conta está ativa. Você já pode acessar o painel.
          </Alert>
          <Link href="/">
            <Button size="lg" className="w-full">
              Ir para o painel
            </Button>
          </Link>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">
            Confirme seu e-mail
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            O link pode ter expirado. Reenvie a confirmação abaixo.
          </p>
        </div>

        {errorParam && (
          <Alert tone="danger">
            Não foi possível confirmar o e-mail (link inválido ou expirado).
          </Alert>
        )}

        {resent && (
          <Alert tone="success">
            Enviamos um novo link. Confira sua caixa de entrada.
          </Alert>
        )}

        <form onSubmit={onResend} className="flex flex-col gap-4">
          {!session && (
            <Field label="E-mail">
              <Input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com"
              />
            </Field>
          )}
          <Button type="submit" size="lg" disabled={loading}>
            {loading ? "Enviando…" : "Reenviar confirmação"}
          </Button>
        </form>

        <p className="text-sm text-zinc-600 text-center">
          <Link href="/login" className="text-zinc-900 font-medium hover:underline">
            Voltar para o login
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
