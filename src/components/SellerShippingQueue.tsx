import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { markOrderPacked, markOrderReady, PREP_LABEL, type PrepStatus } from "@/lib/shipping";
import { Package, Box, Truck, CheckCircle2, ScanLine } from "lucide-react";
import { PackageScanner } from "@/components/PackageScanner";
import { toast } from "sonner";

type OrderRow = {
  id: string;
  title: string;
  buyer_id: string;
  prep_status: PrepStatus;
  tracking_number: string | null;
  created_at: string;
  ship_name: string;
  ship_city: string;
  ship_state: string | null;
};

const STAGES: { key: PrepStatus | "all"; label: string; icon: any }[] = [
  { key: "all", label: "All", icon: Package },
  { key: "label_pending", label: "Awaiting label", icon: Package },
  { key: "label_created", label: "Label created", icon: Box },
  { key: "packed", label: "Packed", icon: Box },
  { key: "ready_for_dropoff", label: "Ready", icon: Truck },
  { key: "shipped", label: "Shipped", icon: CheckCircle2 },
];

/**
 * SellerShippingQueue — single source of truth for the seller's open
 * shipping pipeline. Reuses `orders` (not a parallel table). Realtime
 * via postgres_changes so scan updates appear instantly.
 *
 * Mobile-first: tab filter + per-row Pack / Ready buttons + a sticky
 * "Scan packages" CTA that opens the bulk scanner.
 */
export function SellerShippingQueue() {
  const { user } = useAuth();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [stage, setStage] = useState<PrepStatus | "all">("all");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    let q = supabase
      .from("orders")
      .select("id,title,buyer_id,prep_status,tracking_number,created_at,ship_name,ship_city,ship_state")
      .eq("seller_id", user.id)
      .neq("prep_status", "delivered")
      .order("created_at", { ascending: false })
      .limit(100);
    const { data } = await q;
    setRows(((data as any) || []) as OrderRow[]);
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

  const filtered = stage === "all" ? rows : rows.filter((r) => r.prep_status === stage);
  const counts = STAGES.reduce((acc, s) => {
    acc[s.key] = s.key === "all" ? rows.length : rows.filter((r) => r.prep_status === s.key).length;
    return acc;
  }, {} as Record<string, number>);

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

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 -mx-4 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
        <h2 className="flex items-center gap-1.5 text-sm font-extrabold"><Package className="h-4 w-4" /> Shipping queue</h2>
        <span className="ml-auto" />
        <button
          onClick={() => setScannerOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-extrabold text-primary-foreground"
        >
          <ScanLine className="h-3.5 w-3.5" /> Scan
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {STAGES.map((s) => {
          const Ico = s.icon;
          const active = stage === s.key;
          return (
            <button key={s.key} onClick={() => setStage(s.key)}
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              <Ico className="h-3 w-3" /> {s.label}
              <span className="ml-0.5 rounded-full bg-black/20 px-1 text-[9px]">{counts[s.key] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          Nothing in this stage.
        </p>
      )}

      <ul className="space-y-2">
        {filtered.map((o) => {
          const isPacked = ["packed", "ready_for_dropoff", "shipped"].includes(o.prep_status);
          const isReady = ["ready_for_dropoff", "shipped"].includes(o.prep_status);
          const isShipped = o.prep_status === "shipped";
          return (
            <li key={o.id} className="rounded-2xl border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{o.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {o.ship_name} · {o.ship_city}{o.ship_state ? `, ${o.ship_state}` : ""}
                  </p>
                  {o.tracking_number && (
                    <p className="mt-0.5 truncate text-[10px] font-mono text-muted-foreground">#{o.tracking_number}</p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider">
                  {PREP_LABEL[o.prep_status] ?? o.prep_status}
                </span>
              </div>
              {!isShipped && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => pack(o.id)} disabled={busyId === o.id || isPacked}
                    className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold disabled:opacity-40"
                  >Mark packed</button>
                  <button
                    onClick={() => ready(o.id)} disabled={busyId === o.id || isReady}
                    className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground disabled:opacity-40"
                  >Ready for dropoff</button>
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
