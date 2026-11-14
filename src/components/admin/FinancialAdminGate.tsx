import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { getFinancialAdminAccess } from "@/lib/adminShippingHealth.functions";

/** Owner/admin-only screen gate. Server functions re-check on every request. */
export function FinancialAdminGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const check = useServerFn(getFinancialAdminAccess);
  const access = useQuery({ queryKey: ["financial-admin-access", user?.id], enabled: !!user, retry: false, queryFn: () => check() });
  const box = (title: string, body: string, link?: ReactNode) => (
    <AppShell><div className="p-8 text-center"><h1 className="text-lg font-bold">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{body}</p>{link}</div></AppShell>
  );
  if (loading) return <AppShell><p className="p-6 text-sm text-muted-foreground">Checking access…</p></AppShell>;
  if (!user) return box("Sign in required", "Please sign in with an administrator account.", <Link to="/auth" className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Sign in</Link>);
  if (access.isLoading) return <AppShell><p className="p-6 text-sm text-muted-foreground">Verifying permissions…</p></AppShell>;
  if (!access.data?.allowed) return box("Access denied", "This dashboard is restricted to authorized administrators.", <Link to="/" className="mt-4 inline-block text-sm text-primary">Go home</Link>);
  return <>{children}</>;
}
