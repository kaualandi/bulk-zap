"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { API_URL } from "@/lib/api";

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
];

const externalNav = [
  {
    href: `${API_URL}/admin/queues`,
    label: "Filas (Bull Board)",
  },
];

export function Sidebar() {
  const pathname = usePathname();

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

      <div className="mt-auto p-4 border-t border-zinc-200">
        <p className="text-xs text-zinc-400 leading-relaxed">
          Disparos em grupos com anti-ban e fallback Cloud API.
        </p>
      </div>
    </aside>
  );
}
