"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { useSession } from "@/lib/auth-client";

// Routes that render WITHOUT the dashboard shell and are accessible logged-out.
const AUTH_ROUTES = [
  "/login",
  "/signup",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
];

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + "/")
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = useSession();

  const onAuthRoute = isAuthRoute(pathname);
  const authed = !!session;

  useEffect(() => {
    if (isPending) return;
    // Unauthenticated user on a protected app page -> send to login.
    if (!authed && !onAuthRoute) {
      router.replace("/login");
    }
    // Authenticated user sitting on an auth page -> send to dashboard.
    if (authed && onAuthRoute) {
      router.replace("/");
    }
  }, [authed, onAuthRoute, isPending, router]);

  // Auth pages: minimal centered shell, no sidebar.
  if (onAuthRoute) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-md">{children}</div>
      </div>
    );
  }

  // While we resolve the session, or while redirecting an unauthed user,
  // show a neutral loading state instead of flashing the dashboard.
  if (isPending || !authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-400">Carregando…</p>
      </div>
    );
  }

  // Authenticated app shell.
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="max-w-6xl mx-auto px-8 py-10">{children}</div>
      </main>
    </div>
  );
}
