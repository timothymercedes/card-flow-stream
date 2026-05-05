import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Star, Package, Store as StoreIcon, ArrowLeft, Users, BadgeCheck, UserPlus, UserCheck } from "lucide-react";
import { ReportDialog } from "@/components/ReportDialog";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

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
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [sellerCompleted, setSellerCompleted] = useState(0);
  const [buyerCompleted, setBuyerCompleted] = useState(0);
  const [followersList, setFollowersList] = useState<any[] | null>(null);
  const [followingList, setFollowingList] = useState<any[] | null>(null);
  const [listOpen, setListOpen] = useState<null | "followers" | "following">(null);
  const [tab, setTab] = useState<"listings" | "sold" | "reviews">("listings");

  useEffect(() => {
    (async () => {
      const { data: profRows } = await (supabase.rpc as any)("public_profile_by_username", { _username: username });
      const prof = Array.isArray(profRows) ? profRows[0] : null;
      if (!prof) return;
      setSeller(prof);
      const [l, o, r, fr, fg, sc, bc] = await Promise.all([
        supabase.from("listings").select("*").eq("seller_id", prof.id).order("created_at", { ascending: false }),
        supabase.from("orders").select("id,title,amount,item_image_url,created_at,status").eq("seller_id", prof.id).in("status", ["shipped", "delivered"]).order("created_at", { ascending: false }).limit(50),
        supabase.from("seller_reviews").select("*").eq("seller_id", prof.id).order("created_at", { ascending: false }),
        supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", prof.id),
        supabase.from("follows").select("followee_id", { count: "exact", head: true }).eq("follower_id", prof.id),
        (supabase.rpc as any)("get_seller_completed_count", { _user: prof.id }),
        (supabase.rpc as any)("get_buyer_completed_count", { _user: prof.id }),
      ]);
      setListings(l.data || []);
      setSoldOrders(o.data || []);
      setReviews(r.data || []);
      setFollowers(fr.count || 0);
      setFollowing(fg.count || 0);
      setSellerCompleted(Number(sc?.data ?? 0));
      setBuyerCompleted(Number(bc?.data ?? 0));
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
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-lg font-bold">@{seller.username}</p>
                  {sellerCompleted >= 100 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary"><BadgeCheck className="h-3 w-3" /> Verified Seller</span>
                  )}
                  {buyerCompleted >= 35 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-500"><BadgeCheck className="h-3 w-3" /> Verified Buyer</span>
                  )}
                </div>
                <ReportDialog targetType="user" targetId={seller.id} targetLabel={`@${seller.username}`} />
              </div>

              <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                <button
                  onClick={async () => {
                    setListOpen("followers");
                    if (!followersList) {
                      const { data } = await (supabase.rpc as any)("list_followers", { _user: seller.id });
                      setFollowersList(data || []);
                    }
                  }}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <Users className="h-3 w-3" /> <span className="font-semibold text-foreground">{followers}</span> followers
                </button>
                <button
                  onClick={async () => {
                    setListOpen("following");
                    if (!followingList) {
                      const { data } = await (supabase.rpc as any)("list_following", { _user: seller.id });
                      setFollowingList(data || []);
                    }
                  }}
                  className="hover:text-foreground"
                >
                  <span className="font-semibold text-foreground">{following}</span> following
                </button>
              </div>

              <div className="mt-1 flex items-center gap-2 text-xs">
                <Stars n={stats.avg} size={12} />
                <span className="text-muted-foreground">{stats.count ? `${stats.avg.toFixed(1)} · ${stats.count} review${stats.count === 1 ? "" : "s"}` : "No reviews yet"}</span>
              </div>
              {stats.count > 0 && (
                <p className="mt-0.5 text-[10px] text-muted-foreground">📦 Shipping rating <span className="font-semibold text-foreground">{stats.ship.toFixed(1)}</span> / 5</p>
              )}

              {sellerCompleted < 100 && (
                <div className="mt-2">
                  <div className="mb-0.5 flex justify-between text-[10px] text-muted-foreground">
                    <span>Verified Seller progress</span>
                    <span className="font-semibold text-foreground">{sellerCompleted} / 100</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${Math.min(100, (sellerCompleted / 100) * 100)}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {listOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={() => setListOpen(null)}>
            <div onClick={(e) => e.stopPropagation()} className="max-h-[70vh] w-full max-w-md overflow-y-auto rounded-2xl bg-card p-4">
              <p className="mb-3 text-sm font-bold capitalize">{listOpen}</p>
              {(listOpen === "followers" ? followersList : followingList)?.length === 0 && (
                <p className="py-8 text-center text-xs text-muted-foreground">No users yet.</p>
              )}
              <div className="space-y-2">
                {(listOpen === "followers" ? followersList : followingList)?.map((u: any) => (
                  <Link key={u.id} to="/seller/$username" params={{ username: u.username }} onClick={() => setListOpen(null)} className="flex items-center gap-2 rounded-lg bg-muted p-2 hover:bg-muted/70">
                    <div className="h-8 w-8 overflow-hidden rounded-full bg-card">
                      {u.avatar_url ? <img src={u.avatar_url} className="h-full w-full object-cover" alt="" /> : <div className="flex h-full w-full items-center justify-center text-xs font-bold">{u.username[0]?.toUpperCase()}</div>}
                    </div>
                    <span className="text-xs font-semibold">@{u.username}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

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
