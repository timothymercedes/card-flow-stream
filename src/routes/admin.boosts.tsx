import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Rocket } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/admin/boosts")({
  head: () => ({ meta: [{ title: "Listing Boosts — Admin" }, { name: "description", content: "Configure listing boost packages and feed limits." }] }),
  component: Page,
});

type Pkg = { key: string; hours: number; cents: number; weight: number };

function Page() {
  const { user } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [s, setS] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [{ data: st }, { data: b }] = await Promise.all([
      supabase.from("listing_boost_settings").select("*").maybeSingle(),
      supabase.from("listing_boosts").select("id, listing_id, seller_id, kind, package_key, hours, amount_cents, status, environment, ends_at, created_at, listings(title)").order("created_at", { ascending: false }).limit(100),
    ]);
    setS(st); setRows(b ?? []);
  }
  useEffect(() => {
    if (!user) return;
    void Promise.all([supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }), supabase.rpc("has_role", { _user_id: user.id, _role: "owner" })])
      .then(([a, o]) => { const ok = !!(a.data || o.data); setAllowed(ok); if (ok) void load(); });
  }, [user?.id]);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("listing_boost_settings").update({
      packages: s.packages, custom_cents_per_hour: s.custom_cents_per_hour, custom_weight: s.custom_weight, free_hours: s.free_hours,
      free_cooldown_days: s.free_cooldown_days, free_weight: s.free_weight, feed_percent: s.feed_percent, max_paid_per_seller: s.max_paid_per_seller,
      updated_at: new Date().toISOString(), updated_by: user!.id,
    }).eq("id", true);
    setSaving(false);
    if (error) toast.error("Couldn't save. Check the values are in range."); else toast.success("Boost settings saved");
  }
  async function cancel(id: string) {
    const { error } = await supabase.rpc("cancel_listing_boost", { _boost_id: id });
    if (error) toast.error("Couldn't cancel"); else { toast.success("Boost cancelled"); void load(); }
  }

  if (allowed === false) return <AppShell><p className="p-6 text-sm">Admins only.</p></AppShell>;
  if (!s) return <AppShell><p className="p-6 text-sm text-muted-foreground">Loading…</p></AppShell>;
  const num = (k: string, label: string, min: number, max: number) => (
    <label className="text-xs font-semibold">{label}
      <input type="number" min={min} max={max} value={s[k]} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
    </label>
  );
  const setPkg = (i: number, patch: Partial<Pkg>) => setS({ ...s, packages: (s.packages as Pkg[]).map((p, j) => j === i ? { ...p, ...patch } : p) });
  const now = new Date().toISOString();

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <Link to="/admin" className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground"><ArrowLeft className="h-3 w-3" /> Admin</Link>
        <h1 className="flex items-center gap-2 text-xl font-bold"><Rocket className="h-5 w-5 text-primary" /> Listing Boosts</h1>
        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-bold">Paid packages</h2>
          {(s.packages as Pkg[]).map((p, i) => (
            <div key={p.key} className="grid grid-cols-3 gap-2">
              <label className="text-xs">Price ($)<input type="number" min={0.5} step={0.5} value={p.cents / 100} onChange={(e) => setPkg(i, { cents: Math.round(Number(e.target.value) * 100) })} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
              <label className="text-xs">Hours<input type="number" min={1} max={24} value={p.hours} onChange={(e) => setPkg(i, { hours: Math.max(1, Math.min(24, Number(e.target.value))) })} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
              <label className="text-xs">Rotation priority (1–10)<input type="number" min={1} max={10} value={p.weight} onChange={(e) => setPkg(i, { weight: Math.max(1, Math.min(10, Number(e.target.value))) })} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {num("custom_cents_per_hour", "Custom price per hour (cents)", 50, 10000)}
            {num("custom_weight", "Custom priority (1–10)", 1, 10)}
            {num("free_hours", "Free boost hours", 1, 24)}
            {num("free_cooldown_days", "Free boost every (days)", 1, 30)}
            {num("free_weight", "Free boost priority (1–10)", 1, 10)}
            {num("feed_percent", "Max feed share % (1–10)", 1, 10)}
            {num("max_paid_per_seller", "Paid boosts per seller", 1, 5)}
          </div>
          <Button onClick={() => void save()} disabled={saving}>Save settings</Button>
        </Card>
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-bold">Recent boosts</h2>
          {rows.length === 0 ? <p className="text-xs text-muted-foreground">No boosts yet.</p> : (
            <ul className="divide-y divide-border text-xs">
              {rows.map((r) => {
                const running = r.status === "active" && r.ends_at > now;
                return (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0 truncate"><b>{r.listings?.title ?? "Listing"}</b> · {r.kind} {r.package_key} · {r.hours}h{r.amount_cents ? ` · $${(r.amount_cents / 100).toFixed(2)}` : ""}{r.environment === "sandbox" && r.kind === "paid" ? " · test" : ""}</span>
                    <span className="flex shrink-0 items-center gap-2">{running ? "Running" : r.status === "active" ? "expired" : r.status}{(running || r.status === "pending") && <Button size="sm" variant="outline" onClick={() => void cancel(r.id)}>Cancel</Button>}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
