import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { markOrderPacked, markOrderReady, PREP_LABEL, type PrepStatus } from "@/lib/shipping";
import { Package, Box, Truck, CheckCircle2, ScanLine, Clock, Copy, ExternalLink, Search } from "lucide-react";
import { PackageScanner } from "@/components/PackageScanner";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

type OrderRow = {
  id: string;
  title: string;
  buyer_id: string;
  buyer_username?: string | null;
  prep_status: PrepStatus;
  tracking_number: string | null;
  created_at: string;
  ship_name: string;
  ship_city: string;
  ship_state: string | null;
  ship_country?: string | null;
};

const STAGES: { key: PrepStatus | "all"; label: string; short: string; icon: any }[] = [
  { key: "all", label: "All open", short: "All", icon: Package },
  { key: "label_pending", label: "Awaiting label", short: "Label", icon: Package },
  { key: "label_created", label: "Label created", short: "Created", icon: Box },
  { key: "packed", label: "Packed", short: "Packed", icon: Box },
  { key: "ready_for_dropoff", label: "Ready", short: "Ready", icon: Truck },
  { key: "shipped", label: "Shipped", short: "Shipped", icon: CheckCircle2 },
];

const STALE_DAYS = 3;
const isStale = (o: OrderRow) =>
  !["shipped", "delivered"].includes(o.prep_status) &&
  Date.now() - new Date(o.created_at).getTime() > STALE_DAYS * 86400_000;

/**
 * SellerShippingQueue — single source of truth for the seller's open
 * shipping pipeline. Reuses `orders` (not a parallel table). Realtime
 * via postgres_changes so scan updates appear instantly.
 *
 * Mobile-first: large touch targets, sticky scan CTA, stale-order
 * highlights, quick tracking copy, and a search-by-buyer filter.
 */
export function SellerShippingQueue() {
  const { user } = useAuth();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [stage, setStage] = useState<PrepStatus | "all">("all");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function load() {
    if (!user) return;
    const { data } = await supabase
      .from("orders")
      .select("id,title,buyer_id,prep_status,tracking_number,created_at,ship_name,ship_city,ship_state,ship_country,profiles:buyer_id(username)")
      .eq("seller_id", user.id)
      .neq("prep_status", "delivered")
      .order("created_at", { ascending: false })
      .limit(100);
    const mapped = ((data as any[]) || []).map((r) => ({
      ...r,
      buyer_username: r.profiles?.username ?? null,
    })) as OrderRow[];
    setRows(mapped);
  }

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel(`seller-ship-${user.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `seller_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const stageFiltered = stage === "all" ? rows : rows.filter((r) => r.prep_status === stage);
  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return stageFiltered;
    return stageFiltered.filter((r) =>
      r.title?.toLowerCase().includes(q) ||
      r.ship_name?.toLowerCase().includes(q) ||
      r.ship_city?.toLowerCase().includes(q) ||
      r.buyer_username?.toLowerCase().includes(q) ||
      r.tracking_number?.toLowerCase().includes(q),
    );
  }, [stageFiltered, q]);

  const counts = STAGES.reduce((acc, s) => {
    acc[s.key] = s.key === "all" ? rows.length : rows.filter((r) => r.prep_status === s.key).length;
    return acc;
  }, {} as Record<string, number>);
  const staleCount = rows.filter(isStale).length;

  async function pack(id: string) {
    setBusyId(id);
    try { await markOrderPacked(id); toast.success("Marked packed"); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  }
  async function ready(id: string) {
    setBusyId(id);
    try { await markOrderReady(id); toast.success("Ready for dropoff"); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  }
  async function copyTracking(t: string) {
    try { await navigator.clipboard.writeText(t); toast.success("Tracking copied"); }
    catch { toast.error("Couldn't copy"); }
  }

  return (
    <div className="space-y-3">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 -mx-4 space-y-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-extrabold">
            <Package className="h-4 w-4" /> Shipping queue
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
              {rows.length}
            </span>
          </h2>
          {staleCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-extrabold text-amber-600 dark:text-amber-400">
              <Clock className="h-3 w-3" /> {staleCount} aging
            </span>
          )}
          <button
            onClick={() => setScannerOpen(true)}
            className="ml-auto inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-extrabold text-primary-foreground active:scale-95 transition-transform"
          >
            <ScanLine className="h-4 w-4" /> Scan
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search buyer, city, tracking…"
            className="w-full rounded-full border border-border bg-muted/40 py-1.5 pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* Stage tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {STAGES.map((s) => {
          const Ico = s.icon;
          const active = stage === s.key;
          const c = counts[s.key] ?? 0;
          return (
            <button
              key={s.key}
              onClick={() => setStage(s.key)}
              className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <Ico className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{s.short}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-black/20" : "bg-background/70"}`}>{c}</span>
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <Package className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-bold">{q ? "No matches" : "Nothing in this stage"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {q ? "Try a different search term" : stage === "all" ? "You're all caught up 🎉" : "Move on to the next stage when ready"}
          </p>
        </div>
      )}

      {/* Order list */}
      <ul className="space-y-2">
        {filtered.map((o) => {
          const isPacked = ["packed", "ready_for_dropoff", "shipped"].includes(o.prep_status);
          const isReady = ["ready_for_dropoff", "shipped"].includes(o.prep_status);
          const isShipped = o.prep_status === "shipped";
          const stale = isStale(o);
          const daysOld = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 86400_000);
          return (
            <li
              key={o.id}
              className={`rounded-2xl border bg-card p-3 transition-colors ${
                stale ? "border-amber-500/50 bg-amber-500/5" : "border-border"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{o.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span className="truncate">{o.ship_name}</span>
                    <span>·</span>
                    <span className="truncate">{o.ship_city}{o.ship_state ? `, ${o.ship_state}` : ""}{o.ship_country && o.ship_country !== "US" ? ` · ${o.ship_country}` : ""}</span>
                    {o.buyer_username && (
                      <>
                        <span>·</span>
                        <Link to="/u/$username" params={{ username: o.buyer_username }} className="inline-flex items-center gap-0.5 text-primary hover:underline">
                          @{o.buyer_username}<ExternalLink className="h-2.5 w-2.5" />
                        </Link>
                      </>
                    )}
                  </p>
                  {o.tracking_number && (
                    <button
                      onClick={() => copyTracking(o.tracking_number!)}
                      className="mt-1 inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-muted"
                    >
                      #{o.tracking_number}<Copy className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider">
                    {PREP_LABEL[o.prep_status] ?? o.prep_status}
                  </span>
                  {stale && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                      <Clock className="h-2.5 w-2.5" /> {daysOld}d old
                    </span>
                  )}
                </div>
              </div>
              {!isShipped && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => pack(o.id)} disabled={busyId === o.id || isPacked}
                    className="inline-flex min-h-[32px] items-center rounded-full bg-muted px-3 py-1 text-[11px] font-bold transition-colors hover:bg-muted/80 disabled:opacity-40 disabled:hover:bg-muted"
                  >
                    {isPacked ? "✓ Packed" : "Mark packed"}
                  </button>
                  <button
                    onClick={() => ready(o.id)} disabled={busyId === o.id || isReady}
                    className="inline-flex min-h-[32px] items-center rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-primary-foreground transition-colors active:scale-95 disabled:opacity-40"
                  >
                    {isReady ? "✓ Ready" : "Ready for dropoff"}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <PackageScanner open={scannerOpen} onClose={() => setScannerOpen(false)} bulk />
    </div>
  );
}
