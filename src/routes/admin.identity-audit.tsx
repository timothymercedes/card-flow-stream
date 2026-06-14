import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { getIdentityAuditFn, type IdentityAudit } from "@/lib/identityHealth.functions";
import { Fingerprint, RefreshCw, AlertTriangle, CheckCircle2, Languages } from "lucide-react";

export const Route = createFileRoute("/admin/identity-audit")({
  head: () => ({ meta: [{ title: "Identity Audit — Admin" }] }),
  component: IdentityAuditPage,
});

function IdentityAuditPage() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);
  const [audit, setAudit] = useState<IdentityAudit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runAudit = useServerFn(getIdentityAuditFn);

  useEffect(() => {
    if (!user) { setCheckingRole(false); return; }
    (async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const admin = (data || []).some((r: any) => r.role === "admin" || r.role === "owner");
      setIsAdmin(admin);
      setCheckingRole(false);
      if (admin) refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await runAudit({ data: {} as never });
      setAudit(res);
    } catch (e: any) {
      setError(e?.message ?? "Failed to run audit");
    } finally {
      setLoading(false);
    }
  }

  if (!user) return <AppShell><div className="p-8 text-center text-sm">Sign in.</div></AppShell>;
  if (checkingRole) return <AppShell><div className="p-8 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;
  if (!isAdmin) return (
    <AppShell><div className="p-8 text-center">
      <p className="text-sm text-muted-foreground">Admin access required.</p>
      <Link to="/admin" className="mt-4 inline-block text-xs text-primary">Back to admin</Link>
    </div></AppShell>
  );

  const dupGroups = audit?.duplicate_fingerprint_groups ?? [];
  const badLang = audit?.invalid_language_rows ?? [];
  const healthy = audit && dupGroups.length === 0 && badLang.length === 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-4 space-y-4">
        <div className="flex items-center gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Fingerprint className="h-6 w-6" /> Identity Audit
          </h1>
          <Link to="/admin" className="ml-auto text-xs text-primary">Back to admin</Link>
          <button
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground active:scale-[0.98] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Lists any remaining duplicate fingerprints or non-canonical language codes in the master
          card-identity table. A clean result means live scans and manual entries resolve to one record.
        </p>

        {error && (
          <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive ring-1 ring-destructive/30">
            {error}
          </div>
        )}

        {audit && (
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Identities" value={audit.total_identities} />
            <Stat label="Duplicate groups" value={dupGroups.length} bad={dupGroups.length > 0} />
            <Stat label="Bad languages" value={badLang.length} bad={badLang.length > 0} />
          </div>
        )}

        {healthy && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-500 ring-1 ring-emerald-500/30">
            <CheckCircle2 className="h-5 w-5" /> All clear — no duplicate fingerprints or invalid language codes.
          </div>
        )}

        {dupGroups.length > 0 && (
          <section className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-destructive">
              <AlertTriangle className="h-4 w-4" /> Duplicate fingerprints ({dupGroups.length})
            </h2>
            <div className="space-y-3">
              {dupGroups.map((g) => (
                <div key={g.fingerprint} className="rounded-xl bg-card p-3 ring-1 ring-border/60">
                  <div className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{g.fingerprint}</code>
                    <span className="font-bold text-destructive">{g.copies} copies</span>
                  </div>
                  <div className="space-y-1">
                    {g.rows.map((r) => (
                      <RowLine key={r.id} category={r.category} name={r.name} set={r.set} number={r.number} language={r.language} id={r.id} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {badLang.length > 0 && (
          <section className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-amber-500">
              <Languages className="h-4 w-4" /> Invalid language codes ({badLang.length})
            </h2>
            <div className="rounded-xl bg-card p-3 ring-1 ring-border/60 space-y-1">
              {badLang.map((r) => (
                <RowLine key={r.id} category={r.category} name={r.name} set={r.set} number={r.number} language={r.language} id={r.id} highlightLang />
              ))}
            </div>
          </section>
        )}

        {audit && (
          <p className="text-[10px] text-muted-foreground">
            Generated {new Date(audit.generated_at).toLocaleString()}
          </p>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value, bad }: { label: string; value: number; bad?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ring-1 ${bad ? "bg-destructive/10 ring-destructive/30" : "bg-card ring-border/60"}`}>
      <div className={`text-2xl font-bold ${bad ? "text-destructive" : ""}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function RowLine({
  category, name, set, number, language, id, highlightLang,
}: {
  category: string; name: string; set: string | null; number: string | null;
  language: string | null; id: string; highlightLang?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
      <span className="font-semibold">{name}</span>
      <span className="text-muted-foreground">{category}</span>
      {set && <span className="text-muted-foreground">· {set}</span>}
      {number && <span className="text-muted-foreground">#{number}</span>}
      <span className={`rounded px-1.5 py-0.5 text-[10px] ${highlightLang ? "bg-amber-500/15 text-amber-500 font-bold" : "bg-muted text-muted-foreground"}`}>
        lang: {language ?? "null"}
      </span>
      <code className="ml-auto font-mono text-[10px] text-muted-foreground">{id.slice(0, 8)}</code>
    </div>
  );
}
