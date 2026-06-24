"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { signUp } from "@/lib/auth-client";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signUp.email({ name, email, password });
    setLoading(false);
    if (error) {
      setError(error.message || "Não foi possível criar a conta.");
      return;
    }
    setDone(true);
    toast.success("Conta criada! Confira seu e-mail.");
  }

  if (done) {
    return (
      <Card>
        <CardBody className="flex flex-col gap-4">
          <h1 className="text-xl font-semibold text-zinc-900">
            Confirme seu e-mail
          </h1>
          <Alert tone="success" title="Quase lá!">
            Enviamos um link de confirmação para <strong>{email}</strong>. Abra o
            e-mail e clique no link para ativar sua conta.
          </Alert>
          <p className="text-sm text-zinc-500">
            Não recebeu? Verifique a caixa de spam ou{" "}
            <Link href="/login" className="text-zinc-900 hover:underline">
              tente entrar
            </Link>{" "}
            para reenviar.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Criar conta</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Comece a disparar em grupos com anti-ban.
          </p>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Nome">
            <Input
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
            />
          </Field>
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
          <Field label="Senha" hint="Mínimo de 8 caracteres.">
            <Input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          <Button type="submit" size="lg" disabled={loading}>
            {loading ? "Criando…" : "Criar conta"}
          </Button>
        </form>

        <p className="text-sm text-zinc-600 text-center">
          Já tem conta?{" "}
          <Link href="/login" className="text-zinc-900 font-medium hover:underline">
            Entrar
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
