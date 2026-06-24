"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { signIn } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn.email({ email, password });
    setLoading(false);
    if (error) {
      const msg =
        error.code === "EMAIL_NOT_VERIFIED"
          ? "Confirme seu e-mail antes de entrar. Reenviamos o link se necessário."
          : error.message || "Não foi possível entrar. Verifique seus dados.";
      setError(msg);
      return;
    }
    toast.success("Bem-vindo de volta!");
    router.replace("/");
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Entrar</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Acesse seu painel do BulkZap.
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
          <Field label="Senha">
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          <Button type="submit" size="lg" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </Button>
        </form>

        <div className="flex items-center justify-between text-sm">
          <Link href="/forgot-password" className="text-zinc-600 hover:underline">
            Esqueci a senha
          </Link>
          <Link href="/signup" className="text-zinc-900 font-medium hover:underline">
            Criar conta
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
