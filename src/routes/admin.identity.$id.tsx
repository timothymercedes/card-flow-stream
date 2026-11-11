import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { getIdentityDetailsFn, type IdentityDetails } from "@/lib/identityHealth.functions";
import { readIdentityLogFilters } from "@/lib/identityAuditFilters";
import { ArrowLeft, Fingerprint, Image, Tag, Package, Heart, BarChart3, DollarSign } from "lucide-react";

export const Route = createFileRoute("/admin/identity/$id")({
  validateSearch: (s: Record<string, unknown>) => ({
    ...readIdentityLogFilters(s),
    fromFp: typeof s.fromFp === "string" ? s.fromFp : undefined,
  }),
  head: () => ({ meta: [
    { title: "Identity Inspector — PullBid Live Admin" },
    { name: "description", content: "Inspect a PullBid Live card identity and its linked collection and pricing records." },
    { property: "og:title", content: "Identity Inspector — PullBid Live Admin" },
    { property: "og:description", content: "Review canonical card identity details and related records." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: IdentityInspectorPage,
});

function IdentityInspectorPage() {
  const { id } = Route.useParams();
  const { fromFp, ...logFilters } = Route.useSearch();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);
  const [data, setData] = useState<IdentityDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runDetails = useServerFn(getIdentityDetailsFn);

  useEffect(() => {
    if (!user) { setCheckingRole(false); return; }
    (async () => {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const admin = (roles || []).some((r: any) => r.role === "admin" || r.role === "owner");
      setIsAdmin(admin);
      setCheckingRole(false);
      if (admin) loadDetails();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  async function loadDetails() {
    setLoading(true);
    setError(null);
    try {
      const res = await runDetails({ data: { id } });
      setData(res);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load identity");
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

  const i = data?.identity;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-4 space-y-4">
        <div className="flex items-center gap-2">
          <Link
            to="/admin/identity-audit"
            search={{ ...logFilters, logFp: fromFp || logFilters.logFp }}
            className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground ring-1 ring-border/60 active:scale-[0.98]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to audit
          </Link>
          <h1 className="text-xl font-bold tracking-tight ml-2">Identity Inspector</h1>
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive ring-1 ring-destructive/30">{error}</div>
        )}

        {loading && <div className="text-sm text-muted-foreground">Loading identity…</div>}

        {i && (
          <div className="space-y-4">
            <div className="rounded-xl bg-card p-4 ring-1 ring-border/60 space-y-3">
              <div className="flex items-start gap-3">
                {i.image_url ? (
                  <img src={i.image_url} alt={i.name} className="h-20 w-14 object-contain rounded-md bg-muted" />
                ) : (
                  <div className="h-20 w-14 rounded-md bg-muted flex items-center justify-center">
                    <Image className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="space-y-1">
                  <h2 className="text-lg font-bold leading-tight">{i.name}</h2>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{i.category}</span>
                    {i.set_name && <span>· {i.set_name}</span>}
                    {i.number && <span>· #{i.number}</span>}
                    {i.year && <span>· {i.year}</span>}
                    {i.language && <span>· {i.language}</span>}
                  </div>
                  <code className="inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    <Fingerprint className="inline h-3 w-3 mr-0.5" />
                    {i.fingerprint}
                  </code>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <Field label="Player" value={i.player} />
                <Field label="Team" value={i.team} />
                <Field label="Variant" value={i.variant} />
                <Field label="Grade" value={i.grade ? `${i.grade} (${i.grading_company})` : null} />
                <Field label="Rarity" value={i.rarity} />
                <Field label="Rookie" value={i.is_rookie ? "Yes" : "No"} />
                <Field label="Verification" value={i.verification_status} />
                <Field label="Confidence" value={i.confidence_score != null ? `${Math.round(Number(i.confidence_score) * 100)}%` : null} />
              </div>

              {i.external_ids && Object.keys(i.external_ids).length > 0 && (
                <div className="rounded-lg bg-muted/50 p-2 text-[11px] text-muted-foreground">
                  <span className="font-semibold">External IDs:</span>{" "}
                  {JSON.stringify(i.external_ids)}
                </div>
              )}

              {i.provider_keys && i.provider_keys.length > 0 && (
                <div className="rounded-lg bg-muted/50 p-2 text-[11px] text-muted-foreground">
                  <span className="font-semibold">Provider keys:</span>{" "}
                  {i.provider_keys.join(", ")}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                <span>Created {new Date(i.created_at).toLocaleString()}</span>
                <span>Updated {new Date(i.updated_at).toLocaleString()}</span>
                {i.market_value_cents != null && (
                  <span className="font-semibold text-foreground">
                    <DollarSign className="inline h-3 w-3" />
                    ${(i.market_value_cents / 100).toFixed(2)}
                  </span>
                )}
              </div>
            </div>

            {data && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <CountCard icon={<Image className="h-4 w-4" />} label="Images" value={data.counts.images} />
                <CountCard icon={<BarChart3 className="h-4 w-4" />} label="Prices" value={data.counts.priceObservations} />
                <CountCard icon={<Tag className="h-4 w-4" />} label="Sold comps" value={data.counts.soldComps} />
                <CountCard icon={<Package className="h-4 w-4" />} label="Vault cards" value={data.counts.vaultCards} />
                <CountCard icon={<Heart className="h-4 w-4" />} label="Wishlist" value={data.counts.wishlistItems} />
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function CountCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl bg-card p-3 ring-1 ring-border/60 flex flex-col items-center gap-1">
      <div className="text-muted-foreground">{icon}</div>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
