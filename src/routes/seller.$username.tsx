import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Star, Package, Store as StoreIcon, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/seller/$username")({ component: PublicStore });

function Stars({ n, size = 14 }: { n: number; size?: number }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} style={{ width: size, height: size }} className={i <= Math.round(n) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"} />
      ))}
    </span>
  );
}

function PublicStore() {
  const { username } = Route.useParams();
  const [seller, setSeller] = useState<any>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [soldOrders, setSoldOrders] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [tab, setTab] = useState<"listings" | "sold" | "reviews">("listings");

  useEffect(() => {
    (async () => {
      const { data: prof } = await supabase.from("profiles").select("id,username,avatar_url,full_name").eq("username", username).maybeSingle();
      if (!prof) return;
      setSeller(prof);
      const [l, o, r] = await Promise.all([
        supabase.from("listings").select("*").eq("seller_id", prof.id).order("created_at", { ascending: false }),
        supabase.from("orders").select("id,title,amount,item_image_url,created_at,status").eq("seller_id", prof.id).in("status", ["shipped", "delivered"]).order("created_at", { ascending: false }).limit(50),
        supabase.from("seller_reviews").select("*").eq("seller_id", prof.id).order("created_at", { ascending: false }),
      ]);
      setListings(l.data || []);
      setSoldOrders(o.data || []);
      setReviews(r.data || []);
    })();
  }, [username]);

  const stats = useMemo(() => {
    if (!reviews.length) return { count: 0, avg: 0, ship: 0 };
    const avg = reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / reviews.length;
    const ship = reviews.reduce((s, r) => s + Number(r.shipping_rating || 0), 0) / reviews.length;
    return { count: reviews.length, avg, ship };
  }, [reviews]);

  if (!seller) return (
    <AppShell>
      <div className="px-6 py-16 text-center">
        <h1 className="text-xl font-bold">Seller not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">No seller exists with @{username}.</p>
        <Link to="/market" className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Browse Market</Link>
      </div>
    </AppShell>
  );

  return (
    <AppShell>
      <div className="px-4 py-4">
        <Link to="/market" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Back</Link>

        <div className="mb-4 rounded-2xl bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-muted">
              {seller.avatar_url ? <img src={seller.avatar_url} alt={seller.username} className="h-full w-full object-cover" /> : <StoreIcon className="h-6 w-6 text-muted-foreground" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold">@{seller.username}</p>
              {seller.full_name && <p className="truncate text-xs text-muted-foreground">{seller.full_name}</p>}
              <div className="mt-1 flex items-center gap-2 text-xs">
                <Stars n={stats.avg} size={12} />
                <span className="text-muted-foreground">{stats.count ? `${stats.avg.toFixed(1)} · ${stats.count} review${stats.count === 1 ? "" : "s"}` : "No reviews yet"}</span>
              </div>
              {stats.count > 0 && (
                <p className="mt-0.5 text-[10px] text-muted-foreground">📦 Shipping rating <span className="font-semibold text-foreground">{stats.ship.toFixed(1)}</span> / 5</p>
              )}
            </div>
          </div>
        </div>

        <div className="mb-3 flex gap-2 border-b border-border text-xs">
          {(["listings", "sold", "reviews"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`border-b-2 px-3 py-2 capitalize ${tab === t ? "border-primary font-bold text-primary" : "border-transparent text-muted-foreground"}`}>
              {t === "sold" ? `Sold (${soldOrders.length})` : t === "reviews" ? `Reviews (${reviews.length})` : `Listings (${listings.length})`}
            </button>
          ))}
        </div>

        {tab === "listings" && (
          <>
            {listings.length === 0 && <p className="py-12 text-center text-xs text-muted-foreground">No active listings.</p>}
            <div className="grid grid-cols-2 gap-3">
              {listings.map((l) => (
                <Link key={l.id} to="/market/$id" params={{ id: l.id }} className="overflow-hidden rounded-xl bg-card">
                  <div className="aspect-square overflow-hidden bg-muted">
                    {l.image_url ? <img src={l.image_url} alt={l.title} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><Package className="h-8 w-8 text-muted-foreground" /></div>}
                  </div>
                  <div className="p-2">
                    <p className="line-clamp-1 text-xs font-semibold">{l.title}</p>
                    <p className="text-xs text-primary">${Number(l.current_bid || l.price || 0).toFixed(2)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        {tab === "sold" && (
          <>
            {soldOrders.length === 0 && <p className="py-12 text-center text-xs text-muted-foreground">No sold items yet.</p>}
            <div className="space-y-2">
              {soldOrders.map((o) => (
                <div key={o.id} className="flex gap-3 rounded-xl bg-card p-2">
                  <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
                    {o.item_image_url ? <img src={o.item_image_url} alt="" className="h-full w-full object-cover" /> : <Package className="h-5 w-5 m-auto text-muted-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-xs font-semibold">{o.title}</p>
                    <p className="text-xs text-primary">${Number(o.amount).toFixed(2)}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">{o.status} · {new Date(o.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "reviews" && (
          <>
            {reviews.length === 0 && <p className="py-12 text-center text-xs text-muted-foreground">No reviews yet.</p>}
            <div className="space-y-3">
              {reviews.map((r) => (
                <div key={r.id} className="rounded-xl bg-card p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold">@{r.buyer_username}</p>
                    <Stars n={r.rating} size={12} />
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">📦 Shipping: <Stars n={r.shipping_rating} size={10} /></p>
                  {r.comment && <p className="mt-1 text-xs">{r.comment}</p>}
                  <p className="mt-1 text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
