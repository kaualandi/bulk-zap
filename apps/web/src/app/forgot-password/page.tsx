"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { forgetPassword } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await forgetPassword({
      email,
      redirectTo: "/reset-password",
    });
    setLoading(false);
    if (error) {
      setError(error.message || "Não foi possível enviar o e-mail.");
      return;
    }
    setSent(true);
    toast.success("Se o e-mail existir, enviamos um link de redefinição.");
  }

  if (sent) {
    return (
      <Card>
        <CardBody className="flex flex-col gap-4">
          <h1 className="text-xl font-semibold text-zinc-900">
            Verifique seu e-mail
          </h1>
          <Alert tone="success">
            Se houver uma conta com <strong>{email}</strong>, enviamos um link
            para redefinir a senha.
          </Alert>
          <Link href="/login" className="text-sm text-zinc-900 hover:underline">
            Voltar para o login
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
            Esqueceu a senha?
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Informe seu e-mail e enviaremos um link de redefinição.
          </p>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
          <Button type="submit" size="lg" disabled={loading}>
            {loading ? "Enviando…" : "Enviar link"}
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
