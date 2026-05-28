import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { ListingImageUpload } from "@/components/ListingImageUpload";
import { LISTING_CATEGORIES, categoryEmoji, categoryLabel } from "@/lib/listingCategories";
import { Tag, Trash2, RefreshCw, Pencil, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { getListingPriceDisplay, validateListingImage } from "@/lib/listingDisplay";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";

export const Route = createFileRoute("/my-listings")({ component: MyListings });

const CONDITIONS = [
  { value: "NM", label: "NM", help: "Near Mint" },
  { value: "LP", label: "LP", help: "Lightly Played" },
  { value: "MP", label: "MP", help: "Moderately Played" },
  { value: "Damaged", label: "DMG", help: "Damaged" },
] as const;
type Condition = typeof CONDITIONS[number]["value"];

type Listing = {
  id: string; title: string; description: string | null; image_url: string | null;
  back_image_url: string | null;
  price: number | null; current_bid: number | null; starting_bid: number | null;
  buy_now_price: number | null;
  listing_type: string; is_auction: boolean; accepts_offers: boolean;
  expires_at: string; auction_ends_at: string | null;
  auction_status: string; created_at: string;
  shipping_price: number | null;
  reserve_price: number | null;
  category: string | null;
  condition: Condition | null;
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
  const [saleTypeConfirm, setSaleTypeConfirm] = useState<null | { toAuction: boolean }>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  async function load() {
    if (!user) return;
    const { data } = await supabase.from("listings")
      .select("*").eq("seller_id", user.id)
      .order("created_at", { ascending: false });
    setItems((data || []) as Listing[]);
  }
  useEffect(() => { load(); }, [user]);

  // Realtime: bids, sales, and edits to my listings sync instantly
  useRealtimeTable(
    { name: `my-listings-${user?.id ?? "none"}`, table: "listings", filter: user ? `seller_id=eq.${user.id}` : undefined, enabled: !!user, debounceMs: 300 },
    () => load()
  );

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
    const fixedPrice = Number(editing.price ?? 0);
    const startingBid = Number(editing.starting_bid ?? 0);
    if (!editing.is_auction && fixedPrice <= 0 && !editing.accepts_offers) return toast.error("Set a Buy Now price or turn on offers");
    if (editing.is_auction && startingBid <= 0) return toast.error("Set a starting bid");
    if (!editing.condition) return toast.error("Select a condition (NM, LP, MP, or DMG)");
    const frontErr = validateListingImage(editing.image_url, { field: "Front photo" });
    if (frontErr) return toast.error(frontErr);
    if (editing.back_image_url) {
      const backErr = validateListingImage(editing.back_image_url, { field: "Back photo" });
      if (backErr) return toast.error(backErr);
    }
    const update: any = {
      title: editing.title,
      description: editing.description,
      image_url: editing.image_url,
      back_image_url: editing.back_image_url,
      category: editing.category,
      condition: editing.condition,
      price: !editing.is_auction && fixedPrice > 0 ? fixedPrice : null,
      buy_now_price: editing.buy_now_price != null ? Number(editing.buy_now_price) : null,
      reserve_price: editing.reserve_price != null ? Number(editing.reserve_price) : null,
      shipping_price: editing.shipping_price != null ? Number(editing.shipping_price) : 0,
      accepts_offers: editing.accepts_offers,
      listing_type: editing.is_auction ? "auction" : fixedPrice > 0 ? "buy_now" : "offer",
      is_auction: editing.is_auction,
    };
    // Starting bid only editable if no real bids yet
    if (editing.is_auction && !hasBids && editing.starting_bid != null) {
      update.starting_bid = Number(editing.starting_bid);
      update.current_bid = Number(editing.starting_bid);
    }
    if (editing.is_auction) {
      if (!editing.auction_ends_at) return toast.error("Set an auction end date and time");
      const endsAt = new Date(editing.auction_ends_at);
      if (isNaN(endsAt.getTime())) return toast.error("Invalid auction end date");
      if (endsAt.getTime() <= Date.now()) return toast.error("Auction end must be in the future");
      update.auction_ends_at = endsAt.toISOString();
      update.auction_status = "active";
    } else {
      update.auction_ends_at = null;
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
  const activeCount = items.filter((l) => !(new Date(l.expires_at).getTime() <= now || l.auction_status === "cancelled")).length;
  const expiredCount = items.length - activeCount;
  const counts = { active: activeCount, expired: expiredCount, all: items.length } as const;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl px-4 py-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">My Listings</h1>
            <p className="text-xs text-muted-foreground">{activeCount} active · {expiredCount} expired</p>
          </div>
          <Link to="/vault" className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-[var(--shadow-primary)] transition active:scale-[0.98]">
            <Tag className="h-3.5 w-3.5" /> List from Vault
          </Link>
        </div>

        {(() => {
          const missing = items.filter((l) => !l.condition);
          if (missing.length === 0) return null;
          return (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div className="flex-1">
                <p className="font-bold text-amber-200">Condition required on {missing.length} listing{missing.length === 1 ? "" : "s"}</p>
                <p className="mt-0.5 text-amber-200/80">All listings must show NM, LP, MP, or DMG. Tap Edit on each card to set it — buyers can't see listings without a condition.</p>
                <button
                  onClick={() => setEditing(missing[0])}
                  className="mt-2 rounded-full bg-amber-500 px-3 py-1 text-[11px] font-bold text-black"
                >
                  Fix first listing
                </button>
              </div>
            </div>
          );
        })()}

        <div className="sticky top-0 z-20 -mx-4 mb-3 flex gap-1.5 border-b border-border/60 bg-background/85 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          {(["active", "expired", "all"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${filter === f ? "bg-primary text-primary-foreground shadow-[var(--shadow-primary)]" : "bg-card/60 text-muted-foreground ring-1 ring-border/60 hover:bg-card hover:text-foreground"}`}>
              {f[0].toUpperCase() + f.slice(1)} <span className="ml-1 opacity-70">{counts[f]}</span>
            </button>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 py-12 text-center">
            <Tag className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-semibold">No {filter} listings</p>
            <p className="mt-1 text-xs text-muted-foreground">List a card to get started.</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((l) => {
            const expired = new Date(l.expires_at).getTime() <= now || l.auction_status === "cancelled";
            const display = getListingPriceDisplay(l);
            return (
              <div key={l.id} className="flex gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)]">
                <Link to="/market/$id" params={{ id: l.id }} className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border/60">
                  {l.image_url
                    ? <img src={l.image_url} loading="lazy" className="h-full w-full object-cover" alt={l.title} />
                    : <div className="h-full w-full bg-gradient-to-br from-primary/20 to-accent" />}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link to="/market/$id" params={{ id: l.id }} className="line-clamp-1 text-sm font-semibold hover:text-primary">{l.title}</Link>
                  {l.category && (
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-accent/30 px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
                      {categoryEmoji(l.category)} {categoryLabel(l.category)}
                    </span>
                  )}
                  {l.condition ? (
                    <span className="ml-1 inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                      {CONDITIONS.find((c) => c.value === l.condition)?.label ?? l.condition}
                    </span>
                  ) : (
                    <button
                      onClick={() => setEditing(l)}
                      className="ml-1 inline-flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 ring-1 ring-amber-500/40"
                    >
                      <AlertTriangle className="h-3 w-3" /> Set condition
                    </button>
                  )}
                  <p className="text-xs font-bold text-primary">
                    {display.kind === "offer" ? "Make Offer" : display.suffix ? `Bid ${display.label}` : display.label}
                    {l.accepts_offers && <span className="ml-1 font-normal text-muted-foreground">• Offers</span>}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {expired ? "Expired" : fmtRemain(l.is_auction && l.auction_ends_at ? l.auction_ends_at : l.expires_at)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {expired ? (
                      <button onClick={() => repost(l)} className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold text-primary-foreground transition active:scale-[0.98]">
                        <RefreshCw className="h-3 w-3" /> Repost
                      </button>
                    ) : (
                      <button onClick={() => setEditing(l)} className="flex items-center gap-1 rounded-full bg-card/60 px-2.5 py-1 text-[10px] font-bold ring-1 ring-border/60 transition hover:bg-card">
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                    )}
                    <button onClick={() => remove(l.id)} className="flex items-center gap-1 rounded-full bg-destructive/15 px-2.5 py-1 text-[10px] font-bold text-destructive transition hover:bg-destructive/25">
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
              <ListingImageUpload
                value={editing.image_url ?? ""}
                onChange={(url) => setEditing({ ...editing, image_url: url })}
                label="Front photo"
              />
              <ListingImageUpload
                value={editing.back_image_url ?? ""}
                onChange={(url) => setEditing({ ...editing, back_image_url: url })}
                label="Back photo"
              />
              <label className="block text-[11px] text-muted-foreground">Category
                <select
                  value={editing.category ?? ""}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                  className="mt-1 w-full rounded-lg bg-input px-3 py-2 text-sm"
                >
                  <option value="">— Select —</option>
                  {LISTING_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>
                  ))}
                </select>
              </label>

              <div className="block text-[11px] text-muted-foreground">
                <span>Condition <span className="text-destructive">*</span></span>
                <div className="mt-1 grid grid-cols-4 gap-1.5">
                  {CONDITIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setEditing({ ...editing, condition: c.value })}
                      title={c.help}
                      className={`rounded-lg py-2 text-xs font-bold ring-1 transition ${
                        editing.condition === c.value
                          ? "bg-primary text-primary-foreground ring-primary"
                          : "bg-muted text-muted-foreground ring-border/60 hover:bg-card"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                {!editing.condition && (
                  <p className="mt-1 text-[10px] text-amber-400">Required — pick NM, LP, MP, or DMG before saving.</p>
                )}
              </div>

              <div>
                <div className="text-[11px] text-muted-foreground mb-1">Sale type</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (editing.is_auction) {
                        setSaleTypeConfirm({ toAuction: false });
                      } else {
                        setEditing({ ...editing, is_auction: false, starting_bid: null });
                      }
                    }}
                    className={`rounded-lg px-3 py-2 text-xs font-bold ring-1 transition ${!editing.is_auction ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border"}`}
                  >Buy Now</button>
                  <button
                    type="button"
                    disabled={hasBids}
                    onClick={() => {
                      if (!editing.is_auction) {
                        setSaleTypeConfirm({ toAuction: true });
                      } else {
                        setEditing({
                          ...editing,
                          is_auction: true,
                          price: null,
                          auction_ends_at: editing.auction_ends_at || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                        });
                      }
                    }}
                    className={`rounded-lg px-3 py-2 text-xs font-bold ring-1 transition disabled:opacity-50 ${editing.is_auction ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border"}`}
                  >Auction / Bid</button>
                </div>
                {hasBids && <p className="mt-1 text-[10px] text-amber-400">Sale type locked — bids already placed.</p>}

                {saleTypeConfirm && (
                  <div ref={confirmRef} className="mt-2 rounded-lg border border-amber-500/40 bg-amber-950/20 p-3">
                    <p className="text-[11px] text-amber-200">
                      {saleTypeConfirm.toAuction
                        ? "Switch to Auction? This will clear your Buy Now price and start accepting bids."
                        : "Switch to Buy Now? This will clear your auction settings and stop accepting bids."}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className="flex-1 rounded-lg bg-primary py-1.5 text-[11px] font-bold text-primary-foreground"
                        onClick={() => {
                          if (saleTypeConfirm.toAuction) {
                            setEditing({
                              ...editing,
                              is_auction: true,
                              price: null,
                              auction_ends_at: editing.auction_ends_at || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                            });
                          } else {
                            setEditing({ ...editing, is_auction: false, starting_bid: null, auction_ends_at: null });
                          }
                          setSaleTypeConfirm(null);
                        }}
                      >Confirm switch</button>
                      <button
                        type="button"
                        className="rounded-lg bg-muted px-3 py-1.5 text-[11px]"
                        onClick={() => setSaleTypeConfirm(null)}
                      >Cancel</button>
                    </div>
                  </div>
                )}
              </div>

              {!editing.is_auction && (
                <label className="block text-[11px] text-muted-foreground">Buy Now price ($)
                  <input type="number" min="0.01" step="0.01" value={editing.price ?? ""} onChange={(e) => setEditing({ ...editing, price: e.target.value === "" ? null : Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg bg-input px-3 py-2 text-sm" />
                </label>
              )}
              {editing.is_auction && (
                <>
                  <label className="block text-[11px] text-muted-foreground">
                    Auction ends <span className="text-destructive">*</span>
                    {(() => {
                      const iso = editing.auction_ends_at;
                      const d = iso ? new Date(iso) : null;
                      const localVal = d && !isNaN(d.getTime())
                        ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
                        : "";
                      return (
                        <input
                          type="datetime-local"
                          required
                          value={localVal}
                          min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                          onChange={(e) => {
                            const v = e.target.value;
                            setEditing({ ...editing, auction_ends_at: v ? new Date(v).toISOString() : null });
                          }}
                          className="mt-1 w-full rounded-lg bg-input px-3 py-2 text-sm"
                        />
                      );
                    })()}
                    {editing.auction_ends_at && (
                      <span className="mt-1 block text-[10px] text-muted-foreground">
                        Ends {new Date(editing.auction_ends_at).toLocaleString()}
                      </span>
                    )}
                  </label>
                  <label className="block text-[11px] text-muted-foreground">
                    Starting bid ($) {hasBids && <span className="text-destructive">— locked, bids placed</span>}
                    <input type="number" min="0.01" step="0.01" disabled={hasBids} value={editing.starting_bid ?? ""}
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
