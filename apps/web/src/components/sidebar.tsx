"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { API_URL } from "@/lib/api";
import { signOut, useSession } from "@/lib/auth-client";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/accounts", label: "Números" },
  { href: "/contacts", label: "Contatos" },
  { href: "/groups", label: "Grupos" },
  { href: "/lists", label: "Listas" },
  { href: "/templates", label: "Templates" },
  { href: "/campaigns", label: "Campanhas" },
  { href: "/inbound", label: "Respostas" },
  { href: "/reports", label: "Relatórios" },
  { href: "/billing", label: "Plano & Cobrança" },
];

const externalNav = [
  {
    href: `${API_URL}/admin/queues`,
    label: "Filas (Bull Board)",
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    toast.success("Você saiu da conta.");
    router.replace("/login");
  }

  const user = session?.user;

  return (
    <aside className="w-60 shrink-0 border-r border-zinc-200 bg-white min-h-screen flex flex-col">
      <div className="px-5 py-5 border-b border-zinc-200">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-zinc-900 flex items-center justify-center text-white text-xs font-bold">
            B
          </div>
          <span className="font-semibold text-zinc-900 tracking-tight">
            BulkZap
          </span>
        </Link>
      </div>

      <nav className="flex flex-col gap-0.5 p-3">
        {nav.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "px-3 py-2 rounded-md text-sm font-medium transition-colors",
                active
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-700 hover:bg-zinc-100"
              )}
            >
              {item.label}
            </Link>
          );
        })}

        <div className="mt-4 mb-1 px-3 text-[10px] uppercase tracking-wide text-zinc-400 font-semibold">
          Admin
        </div>
        {externalNav.map((item) => (
          <a
            key={item.href}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 rounded-md text-sm font-medium text-zinc-700 hover:bg-zinc-100 inline-flex items-center justify-between gap-2"
          >
            <span>{item.label}</span>
            <span className="text-xs text-zinc-400">↗</span>
          </a>
        ))}
      </nav>

      <div className="mt-auto p-3 border-t border-zinc-200">
        {user && (
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 shrink-0 rounded-full bg-zinc-900 text-white flex items-center justify-center text-xs font-semibold uppercase">
              {(user.name || user.email || "?").charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-900 truncate">
                {user.name || "Conta"}
              </p>
              <p className="text-xs text-zinc-500 truncate">{user.email}</p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="mt-1 w-full px-3 py-2 rounded-md text-sm font-medium text-zinc-700 hover:bg-zinc-100 text-left transition-colors disabled:opacity-50"
        >
          {signingOut ? "Saindo…" : "Sair"}
        </button>
      </div>
    </aside>
  );
}
