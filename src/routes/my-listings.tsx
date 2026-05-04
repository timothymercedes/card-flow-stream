import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Tag, Trash2, RefreshCw, Pencil, Clock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/my-listings")({ component: MyListings });

type Listing = {
  id: string; title: string; description: string | null; image_url: string | null;
  price: number | null; current_bid: number | null; starting_bid: number | null;
  buy_now_price: number | null;
  listing_type: string; is_auction: boolean; accepts_offers: boolean;
  expires_at: string; auction_ends_at: string | null;
  auction_status: string; created_at: string;
  shipping_price: number | null;
  reserve_price: number | null;
};

function fmtRemain(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  if (d > 0) return `${d}d ${h}h left`;
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m left`;
}

function MyListings() {
  const { user } = useAuth();
  const [items, setItems] = useState<Listing[]>([]);
  const [filter, setFilter] = useState<"active" | "expired" | "all">("active");
  const [editing, setEditing] = useState<Listing | null>(null);

  async function load() {
    if (!user) return;
    const { data } = await supabase.from("listings")
      .select("*").eq("seller_id", user.id)
      .order("created_at", { ascending: false });
    setItems((data || []) as Listing[]);
  }
  useEffect(() => { load(); }, [user]);

  async function remove(id: string) {
    if (!confirm("Delete this listing?")) return;
    // Soft-delete: mark as expired by setting expires_at to now
    const { error } = await supabase.from("listings")
      .update({ expires_at: new Date().toISOString(), auction_status: "cancelled" })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Listing removed");
    load();
  }

  async function repost(l: Listing) {
    const { error } = await supabase.from("listings")
      .update({
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        auction_status: "active",
      })
      .eq("id", l.id);
    if (error) return toast.error(error.message);
    toast.success("Reposted for 30 days");
    load();
  }

  async function saveEdit() {
    if (!editing) return;
    const hasBids = editing.is_auction && (editing.current_bid ?? 0) > (editing.starting_bid ?? 0);
    const update: any = {
      title: editing.title,
      description: editing.description,
      image_url: editing.image_url,
      price: editing.price != null ? Number(editing.price) : null,
      buy_now_price: editing.buy_now_price != null ? Number(editing.buy_now_price) : null,
      reserve_price: editing.reserve_price != null ? Number(editing.reserve_price) : null,
      shipping_price: editing.shipping_price != null ? Number(editing.shipping_price) : 0,
      accepts_offers: editing.accepts_offers,
    };
    // Starting bid only editable if no real bids yet
    if (editing.is_auction && !hasBids && editing.starting_bid != null) {
      update.starting_bid = Number(editing.starting_bid);
      update.current_bid = Number(editing.starting_bid);
    }
    const { error } = await supabase.from("listings").update(update).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    setEditing(null);
    load();
  }

  if (!user) return (
    <AppShell>
      <div className="px-6 py-16 text-center">
        <h1 className="text-xl font-bold">My Listings</h1>
        <Link to="/auth" className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Sign In</Link>
      </div>
    </AppShell>
  );

  const now = Date.now();
  const filtered = items.filter((l) => {
    const expired = new Date(l.expires_at).getTime() <= now || l.auction_status === "cancelled";
    if (filter === "active") return !expired;
    if (filter === "expired") return expired;
    return true;
  });

  return (
    <AppShell>
      <div className="px-4 py-4">
        <h1 className="mb-3 text-2xl font-bold">My Listings</h1>

        <div className="mb-3 flex gap-2">
          {(["active", "expired", "all"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">No {filter} listings</p>
        )}

        <div className="space-y-2">
          {filtered.map((l) => {
            const expired = new Date(l.expires_at).getTime() <= now || l.auction_status === "cancelled";
            return (
              <div key={l.id} className="flex gap-3 rounded-xl bg-card p-3">
                <Link to="/market/$id" params={{ id: l.id }} className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {l.image_url
                    ? <img src={l.image_url} className="h-full w-full object-cover" alt={l.title} />
                    : <div className="h-full w-full bg-gradient-to-br from-primary/20 to-accent" />}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link to="/market/$id" params={{ id: l.id }} className="line-clamp-1 text-sm font-semibold">{l.title}</Link>
                  <p className="text-xs text-primary">
                    {l.is_auction
                      ? `Bid $${Number(l.current_bid || l.starting_bid || 0).toFixed(2)}`
                      : `$${Number(l.price || 0).toFixed(2)}`}
                    {l.accepts_offers && <span className="ml-1 text-muted-foreground">• Offers</span>}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {expired ? "Expired" : fmtRemain(l.is_auction && l.auction_ends_at ? l.auction_ends_at : l.expires_at)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {expired ? (
                      <button onClick={() => repost(l)} className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold text-primary-foreground">
                        <RefreshCw className="h-3 w-3" /> Repost
                      </button>
                    ) : (
                      <button onClick={() => setEditing(l)} className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold">
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                    )}
                    <button onClick={() => remove(l.id)} className="flex items-center gap-1 rounded-full bg-destructive/20 px-2.5 py-1 text-[10px] font-bold text-destructive">
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Link to="/vault" className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-bold text-accent-foreground">
          <Tag className="h-4 w-4" /> List a card from Vault
        </Link>
      </div>

      {editing && (() => {
        const hasBids = editing.is_auction && (editing.current_bid ?? 0) > (editing.starting_bid ?? 0);
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={() => setEditing(null)}>
            <div className="w-full max-w-md space-y-2 overflow-y-auto rounded-2xl bg-card p-4 max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
              <p className="font-bold">Edit listing</p>
              <label className="block text-[11px] text-muted-foreground">Title
                <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  className="mt-1 w-full rounded-lg bg-input px-3 py-2 text-sm" placeholder="Title" />
              </label>
              <label className="block text-[11px] text-muted-foreground">Description
                <textarea value={editing.description ?? ""} rows={2} onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  className="mt-1 w-full resize-none rounded-lg bg-input px-3 py-2 text-sm" placeholder="Description" />
              </label>
              <label className="block text-[11px] text-muted-foreground">Image URL
                <input value={editing.image_url ?? ""} onChange={(e) => setEditing({ ...editing, image_url: e.target.value })}
                  className="mt-1 w-full rounded-lg bg-input px-3 py-2 text-sm" placeholder="https://…" />
              </label>

              {!editing.is_auction && (
                <label className="block text-[11px] text-muted-foreground">Buy Now price ($)
                  <input type="number" min="0" step="0.01" value={editing.price ?? ""} onChange={(e) => setEditing({ ...editing, price: e.target.value === "" ? null : Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg bg-input px-3 py-2 text-sm" />
                </label>
              )}
              {editing.is_auction && (
                <>
                  <label className="block text-[11px] text-muted-foreground">
                    Starting bid ($) {hasBids && <span className="text-destructive">— locked, bids placed</span>}
                    <input type="number" min="0" step="0.01" disabled={hasBids} value={editing.starting_bid ?? ""}
                      onChange={(e) => setEditing({ ...editing, starting_bid: e.target.value === "" ? null : Number(e.target.value) })}
                      className="mt-1 w-full rounded-lg bg-input px-3 py-2 text-sm disabled:opacity-50" />
                  </label>
                  <label className="block text-[11px] text-muted-foreground">Reserve price (optional)
                    <input type="number" min="0" step="0.01" value={editing.reserve_price ?? ""} onChange={(e) => setEditing({ ...editing, reserve_price: e.target.value === "" ? null : Number(e.target.value) })}
                      className="mt-1 w-full rounded-lg bg-input px-3 py-2 text-sm" />
                  </label>
                  <label className="block text-[11px] text-muted-foreground">Buy Now price (optional, lets buyers skip the auction)
                    <input type="number" min="0" step="0.01" value={editing.buy_now_price ?? ""} onChange={(e) => setEditing({ ...editing, buy_now_price: e.target.value === "" ? null : Number(e.target.value) })}
                      className="mt-1 w-full rounded-lg bg-input px-3 py-2 text-sm" />
                  </label>
                </>
              )}

              <label className="block text-[11px] text-muted-foreground">Shipping ($)
                <input type="number" min="0" step="0.01" value={editing.shipping_price ?? 0} onChange={(e) => setEditing({ ...editing, shipping_price: e.target.value === "" ? 0 : Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg bg-input px-3 py-2 text-sm" />
              </label>

              <label className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <input type="checkbox" checked={editing.accepts_offers} onChange={(e) => setEditing({ ...editing, accepts_offers: e.target.checked })} className="h-4 w-4" />
                Accept offers
              </label>
              <div className="flex gap-2 pt-1">
                <button onClick={saveEdit} className="flex-1 rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground">Save</button>
                <button onClick={() => setEditing(null)} className="rounded-lg bg-muted px-3 py-2 text-sm">Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}
    </AppShell>
  );
}
