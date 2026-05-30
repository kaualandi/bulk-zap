"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { resetPassword } from "@/lib/auth-client";

function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const errorParam = params.get("error");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const invalidToken = !token || errorParam === "INVALID_TOKEN";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    if (!token) {
      setError("Token ausente. Solicite um novo link.");
      return;
    }
    setLoading(true);
    const { error } = await resetPassword({ newPassword: password, token });
    setLoading(false);
    if (error) {
      setError(error.message || "Não foi possível redefinir a senha.");
      return;
    }
    toast.success("Senha redefinida! Faça login.");
    router.replace("/login");
  }

  if (invalidToken) {
    return (
      <Card>
        <CardBody className="flex flex-col gap-4">
          <h1 className="text-xl font-semibold text-zinc-900">
            Link inválido
          </h1>
          <Alert tone="danger">
            Este link de redefinição é inválido ou expirou.
          </Alert>
          <Link href="/forgot-password">
            <Button size="lg" className="w-full">
              Solicitar novo link
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
          <h1 className="text-xl font-semibold text-zinc-900">Nova senha</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Defina uma nova senha para sua conta.
          </p>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Nova senha" hint="Mínimo de 8 caracteres.">
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
          <Field label="Confirmar senha">
            <Input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          <Button type="submit" size="lg" disabled={loading}>
            {loading ? "Salvando…" : "Redefinir senha"}
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
