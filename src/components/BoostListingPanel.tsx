import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { useServerFn } from "@tanstack/react-start";
import { Rocket, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { startPaidBoostCheckout } from "@/lib/listingBoosts.functions";
import { boostErrorMessage } from "@/lib/listingBoosts";

const token = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;
const stripePromise = token ? loadStripe(token) : null;
type Pkg = { key: string; hours: number; cents: number };

function left(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "ended";
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return h ? `${h}h ${m}m left` : `${m}m left`;
}

/** Seller-only boost controls for one listing: free weekly boost, paid packages, live status. */
export function BoostListingPanel({ listingId, sellerId }: { listingId: string; sellerId: string }) {
  const [settings, setSettings] = useState<any>(null);
  const [active, setActive] = useState<any>(null);
  const [freeNext, setFreeNext] = useState<Date | null>(null);
  const [paidRunning, setPaidRunning] = useState(0);
  const [customHours, setCustomHours] = useState(6);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const startPaid = useServerFn(startPaidBoostCheckout);

  async function load() {
    const nowIso = new Date().toISOString();
    const [{ data: s }, { data: mine }] = await Promise.all([
      supabase.from("listing_boost_settings").select("*").maybeSingle(),
      supabase.from("listing_boosts").select("id, listing_id, kind, status, starts_at, ends_at, hours").eq("seller_id", sellerId).order("created_at", { ascending: false }).limit(50),
    ]);
    setSettings(s);
    const rows = mine ?? [];
    setActive(rows.find((r) => r.listing_id === listingId && r.status === "active" && r.ends_at && r.ends_at > nowIso) ?? null);
    setPaidRunning(rows.filter((r) => r.kind === "paid" && r.status === "active" && r.ends_at && r.ends_at > nowIso).length);
    const lastFree = rows.find((r) => r.kind === "free" && r.starts_at && r.status !== "pending");
    const next = lastFree && s ? new Date(new Date(lastFree.starts_at!).getTime() + s.free_cooldown_days * 86400000) : null;
    setFreeNext(next && next.getTime() > Date.now() ? next : null);
  }
  useEffect(() => { void load(); }, [listingId, sellerId]);

  async function free() {
    setBusy(true);
    const { error } = await supabase.rpc("start_free_listing_boost", { _listing_id: listingId });
    setBusy(false);
    if (error) return toast.error(boostErrorMessage(error.message));
    toast.success("Free boost is on! Your listing is now in Sponsored rotation.");
    void load();
  }
  async function paid(packageKey: string, hours?: number) {
    setBusy(true);
    const r = await startPaid({ data: { listingId, packageKey, hours, environment: token?.startsWith("pk_live_") ? "live" : "sandbox" } });
    setBusy(false);
    if ("error" in r) return toast.error(r.error);
    setSecret(r.clientSecret);
  }

  if (!settings) return null;
  const pkgs = (settings.packages ?? []) as Pkg[];
  const atCap = paidRunning >= settings.max_paid_per_seller;

  return (
    <section aria-label="Boost this listing" className="mt-3 rounded-2xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2"><Rocket className="h-4 w-4 text-primary" /><h2 className="text-sm font-bold">Boost this listing</h2></div>
      {active ? (
        <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-primary"><Clock className="h-3 w-3" /> {active.kind === "free" ? "Free" : "Paid"} boost running · {left(active.ends_at)}</p>
      ) : secret ? (
        <div className="mt-2"><EmbeddedCheckoutProvider key={secret} stripe={stripePromise} options={{ clientSecret: secret }}><EmbeddedCheckout /></EmbeddedCheckoutProvider></div>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted-foreground">Boosted listings appear in a limited Sponsored spot (about 1 in every 10 items). One-time charge, no renewals.</p>
          <Button size="sm" className="mt-2 w-full" disabled={busy || !!freeNext} onClick={() => void free()}>
            {freeNext ? `Free boost resets ${freeNext.toLocaleDateString()}` : `Use free weekly boost · ${settings.free_hours}h`}
          </Button>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {pkgs.map((p) => <Button key={p.key} size="sm" variant="outline" disabled={busy || atCap} onClick={() => void paid(p.key)}>${(p.cents / 100).toFixed(0)} · {p.hours}h</Button>)}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input aria-label="Custom boost hours" type="number" min={settings.custom_min_hours} max={settings.custom_max_hours} value={customHours} onChange={(e) => setCustomHours(Math.max(settings.custom_min_hours, Math.min(settings.custom_max_hours, Number(e.target.value) || 1)))} className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm" />
            <Button size="sm" variant="outline" className="flex-1" disabled={busy || atCap} onClick={() => void paid("custom", customHours)}>Custom {customHours}h · ${((customHours * settings.custom_cents_per_hour) / 100).toFixed(2)}</Button>
          </div>
          {atCap && <p className="mt-1 text-xs text-muted-foreground">You have {settings.max_paid_per_seller} paid boosts running — the most allowed at once.</p>}
        </>
      )}
    </section>
  );
}
