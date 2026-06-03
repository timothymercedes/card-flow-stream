import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Star, Package, ArrowLeft, Users, BadgeCheck, UserPlus, UserCheck, MessageCircle, Radio, Share2, Instagram, Youtube, Globe2, MessageSquare } from "lucide-react";
import { ReportDialog } from "@/components/ReportDialog";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ensurePushSubscribed, pushSupported } from "@/lib/push";
import { getListingPriceDisplay, isPublicListingVisible } from "@/lib/listingDisplay";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { SellerTrustBadges } from "@/components/SellerTrustBadges";
import { SellerResponseBadges } from "@/components/SellerResponseBadges";
import { SellerReviewsPanel } from "@/components/SellerReviewsPanel";
import { BuyerTrustBadges } from "@/components/BuyerTrustBadges";
import { UserAvatar } from "@/components/UserAvatar";
import { StorefrontListingsBrowser } from "@/components/StorefrontListingsBrowser";
import { UpcomingShowsSection } from "@/components/UpcomingShowsSection";
import { FollowNotificationPrefs } from "@/components/FollowNotificationPrefs";
import { ShareButton } from "@/components/ShareButton";

export const Route = createFileRoute("/seller/$username")({
  head: ({ params }) => {
    const handle = params.username;
    const title = `@${handle} on PullBid Live — storefront, live shows & cards`;
    const description = `Browse cards, auctions, and live streams from @${handle}. Follow for new listings and live alerts on PullBid Live.`;
    const url = `https://pullbidlive.com/store/${handle}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: PublicStore,
});


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
  const nav = useNavigate();
  const { user, profile: myProfile } = useAuth();
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
  const [tab, setTab] = useState<"listings" | "sold" | "reviews" | "posts" | "vault">("listings");
  const [posts, setPosts] = useState<any[]>([]);
  const [stories, setStories] = useState<any[]>([]);
  const [vaultCards, setVaultCards] = useState<any[]>([]);
  const [sellerStats, setSellerStats] = useState<any>(null);
  const [liveStreamId, setLiveStreamId] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followPrefs, setFollowPrefs] = useState({ notify_on_live: true, notify_new_listing: true, notify_auction_start: true, notify_promotions: true });

  useEffect(() => {
    if (!user || !seller) { setIsFollowing(false); return; }
    (supabase.from("follows") as any).select("follower_id, notify_on_live, notify_new_listing, notify_auction_start, notify_promotions").eq("follower_id", user.id).eq("followee_id", seller.id).maybeSingle()
      .then(({ data }: any) => {
        setIsFollowing(!!data);
        if (data) setFollowPrefs({
          notify_on_live: data.notify_on_live ?? true,
          notify_new_listing: data.notify_new_listing ?? true,
          notify_auction_start: data.notify_auction_start ?? true,
          notify_promotions: data.notify_promotions ?? true,
        });
      });
  }, [user, seller]);

  async function toggleFollow() {
    if (!user || !myProfile) { toast.error("Sign in to follow"); return; }
    if (!seller || seller.id === user.id) return;
    if (isFollowing) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("followee_id", seller.id);
      setIsFollowing(false);
      setFollowers((c) => Math.max(0, c - 1));
    } else {
      const { error } = await supabase.from("follows").insert({ follower_id: user.id, followee_id: seller.id });
      if (error) { toast.error(error.message); return; }
      setIsFollowing(true);
      setFollowPrefs({ notify_on_live: true, notify_new_listing: true, notify_auction_start: true, notify_promotions: true });
      setFollowers((c) => c + 1);
      await supabase.from("notifications").insert({
        user_id: seller.id, type: "follow",
        body: `@${myProfile.username} started following you`,
        link: `/seller/${myProfile.username}`,
      });
      if (pushSupported()) {
        ensurePushSubscribed(user.id).then((r) => {
          if (r.ok) toast.success(`You'll get a ping when @${seller.username} goes live`);
        }).catch(() => {});
      }
    }
  }


  async function startMessage() {
    if (!user || !myProfile) { toast.error("Sign in to message"); return; }
    if (!seller || seller.id === user.id) return;
    const { data: existing } = await supabase.from("message_requests").select("*")
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${seller.id}),and(sender_id.eq.${seller.id},recipient_id.eq.${user.id})`)
      .maybeSingle();
    if (!existing) {
      await supabase.from("message_requests").insert({
        sender_id: user.id, sender_username: myProfile.username, recipient_id: seller.id,
      });
      await supabase.from("notifications").insert({
        user_id: seller.id, type: "msg_request", body: `@${myProfile.username} wants to message you`, link: `/messages`,
      });
      toast.success("Message request sent");
    }
    nav({ to: "/messages/$userId", params: { userId: seller.id } });
  }

  async function loadSeller() {
    const { data: profRows } = await (supabase.rpc as any)("public_profile_by_username", { _username: username });
    const prof = Array.isArray(profRows) ? profRows[0] : null;
    if (!prof) return;
    setSeller(prof);
    const [l, o, r, fr, fg, sc, bc, ps, st, vc] = await Promise.all([
      supabase.from("listings").select("*").eq("seller_id", prof.id).order("created_at", { ascending: false }),
      supabase.from("orders").select("id,title,amount,item_image_url,created_at,status").eq("seller_id", prof.id).in("status", ["shipped", "delivered"]).order("created_at", { ascending: false }).limit(50),
      supabase.from("seller_reviews").select("*").eq("seller_id", prof.id).order("created_at", { ascending: false }),
      supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", prof.id),
      supabase.from("follows").select("followee_id", { count: "exact", head: true }).eq("follower_id", prof.id),
      (supabase.rpc as any)("get_seller_completed_count", { _user: prof.id }),
      (supabase.rpc as any)("get_buyer_completed_count", { _user: prof.id }),
      supabase.from("posts").select("*").eq("user_id", prof.id).order("created_at", { ascending: false }).limit(40),
      supabase.from("stories").select("*").eq("user_id", prof.id).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }),
      supabase.from("vault_cards").select("id,user_id,name,image_url,category,tcg_set,tcg_number,tcg_year,condition,estimated_value,visibility,created_at").eq("user_id", prof.id).eq("visibility", "public").order("created_at", { ascending: false }),
    ]);
    setListings((l.data || []).filter(isPublicListingVisible));
    setSoldOrders(o.data || []);
    setReviews(r.data || []);
    setFollowers(fr.count || 0);
    setFollowing(fg.count || 0);
    setSellerCompleted(Number(sc?.data ?? 0));
    setBuyerCompleted(Number(bc?.data ?? 0));
    setPosts(ps.data || []);
    setStories(st.data || []);
    setVaultCards(vc.data || []);
    const { data: ss } = await (supabase.rpc as any)("get_seller_stats", { _seller_id: prof.id });
    setSellerStats(Array.isArray(ss) ? ss[0] : ss);
    const { data: live } = await supabase
      .from("live_streams")
      .select("id")
      .eq("seller_id", prof.id)
      .eq("status", "live")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLiveStreamId((live as any)?.id ?? null);
  }
  useEffect(() => { loadSeller(); }, [username]);

  // Realtime: listings/sold/reviews/follows update profile instantly
  const sellerId = seller?.id as string | undefined;
  useRealtimeTable({ name: `seller-listings-${sellerId ?? "none"}`, table: "listings", filter: sellerId ? `seller_id=eq.${sellerId}` : undefined, enabled: !!sellerId, debounceMs: 400 }, () => loadSeller());
  useRealtimeTable({ name: `seller-orders-${sellerId ?? "none"}`, table: "orders", filter: sellerId ? `seller_id=eq.${sellerId}` : undefined, enabled: !!sellerId, debounceMs: 400 }, () => loadSeller());
  useRealtimeTable({ name: `seller-reviews-${sellerId ?? "none"}`, table: "seller_reviews", filter: sellerId ? `seller_id=eq.${sellerId}` : undefined, enabled: !!sellerId, debounceMs: 200 }, () => loadSeller());
  useRealtimeTable({ name: `seller-follows-${sellerId ?? "none"}`, table: "follows", filter: sellerId ? `followee_id=eq.${sellerId}` : undefined, enabled: !!sellerId, debounceMs: 500 }, () => loadSeller());
  useRealtimeTable({ name: `seller-live-${sellerId ?? "none"}`, table: "live_streams", filter: sellerId ? `seller_id=eq.${sellerId}` : undefined, enabled: !!sellerId, debounceMs: 300 }, () => loadSeller());

  async function shareProfile() {
    const url = `${window.location.origin}/seller/${seller.username}`;
    const text = `Check out @${seller.username} on PullBid Live`;
    try {
      if (navigator.share) await navigator.share({ title: text, url });
      else { await navigator.clipboard.writeText(url); toast.success("Profile link copied"); }
    } catch { /* user cancelled */ }
  }

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

        {liveStreamId && (
          <Link
            to="/live/$id"
            params={{ id: liveStreamId }}
            className="mb-3 flex items-center justify-between gap-2 rounded-2xl bg-gradient-to-r from-live to-live/70 px-4 py-2.5 text-live-foreground shadow-lg"
          >
            <span className="inline-flex items-center gap-2 text-sm font-bold">
              <Radio className="h-4 w-4 animate-pulse" />
              @{seller.username} is live now
            </span>
            <span className="rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold">Join →</span>
          </Link>
        )}

        {seller.banner_url && (
          <div className="mb-3 overflow-hidden rounded-2xl">
            <img src={seller.banner_url} alt="" className="h-32 w-full object-cover sm:h-44" />
          </div>
        )}

        <div className="mb-4 rounded-2xl bg-card p-4" style={seller.accent_color ? { boxShadow: `inset 0 2px 0 0 ${seller.accent_color}` } : undefined}>

          <div className="flex items-center gap-3">
            <UserAvatar
              username={seller.username}
              avatarUrl={seller.avatar_url}
              isLive={!!liveStreamId}
              liveStreamId={liveStreamId}
              size="lg"
              noLink={!liveStreamId}
            />

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
                <div className="flex items-center gap-2">
                  {user && seller.id !== user.id && (
                    <>
                      <button
                        onClick={toggleFollow}
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold ${isFollowing ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"}`}
                      >
                        {isFollowing ? <><UserCheck className="h-3 w-3" /> Following</> : <><UserPlus className="h-3 w-3" /> Follow</>}
                      </button>
                      {isFollowing && user && (
                        <FollowNotificationPrefs
                          userId={user.id}
                          sellerId={seller.id}
                          initial={followPrefs}
                          onChange={setFollowPrefs}
                        />
                      )}
                      <button
                        onClick={startMessage}
                        className="inline-flex items-center gap-1 rounded-full bg-card px-3 py-1 text-[11px] font-bold ring-1 ring-border"
                      >
                        <MessageCircle className="h-3 w-3" /> Message
                      </button>
                      <button
                        onClick={() => nav({ to: "/trades", search: { to: seller.id } })}
                        className="inline-flex items-center gap-1 rounded-full bg-card px-3 py-1 text-[11px] font-bold ring-1 ring-border"
                      >
                        <ArrowLeftRight className="h-3 w-3" /> Trade
                      </button>
                    </>
                  )}
                  <ShareButton
                    entity={{ kind: "storefront", username: seller.username, displayName: seller.display_name, avatar: seller.avatar_url }}
                    variant="icon"
                    className="!h-7 !w-7 ring-1 ring-border"
                  />
                  <ReportDialog targetType="user" targetId={seller.id} targetLabel={`@${seller.username}`} />
                </div>
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

        {sellerStats && Number(sellerStats.completed_sales || 0) > 0 && (
          <div className="mb-4 space-y-2">
            <div className="flex flex-wrap items-center gap-1">
              <SellerTrustBadges sellerId={seller.id} />
              <SellerResponseBadges sellerId={seller.id} />
              <BuyerTrustBadges userId={seller.id} compact />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl bg-card p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Completed sales</p>
                <p className="mt-1 text-lg font-bold text-primary">{sellerStats.completed_sales ?? 0}</p>
                <p className="text-[9px] text-muted-foreground">of {sellerStats.total_sales ?? 0} paid</p>
              </div>
              <div className="rounded-xl bg-card p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Avg rating</p>
                <p className="mt-1 text-lg font-bold text-amber-400">
                  {sellerStats.avg_rating ? `${Number(sellerStats.avg_rating).toFixed(1)}★` : "—"}
                </p>
                <p className="text-[9px] text-muted-foreground">{sellerStats.review_count ?? 0} review{sellerStats.review_count === 1 ? "" : "s"}</p>
              </div>
              <div className="rounded-xl bg-card p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ship speed</p>
                <p className="mt-1 text-lg font-bold text-emerald-400">
                  {sellerStats.avg_shipping_days != null ? `${Number(sellerStats.avg_shipping_days).toFixed(1)}d` : "—"}
                </p>
                <p className="text-[9px] text-muted-foreground">avg paid → shipped</p>
              </div>
              <div className="rounded-xl bg-card p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">On-time</p>
                <p className="mt-1 text-lg font-bold text-primary">
                  {sellerStats.on_time_rate != null ? `${Number(sellerStats.on_time_rate).toFixed(0)}%` : "—"}
                </p>
                <p className="text-[9px] text-muted-foreground">within 3-day SLA</p>
              </div>
              <div className="rounded-xl bg-card p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Success rate</p>
                <p className="mt-1 text-lg font-bold text-primary">
                  {sellerStats.success_rate != null ? `${Number(sellerStats.success_rate).toFixed(0)}%` : "—"}
                </p>
                <p className="text-[9px] text-muted-foreground">delivered / paid</p>
              </div>
              <div className="rounded-xl bg-card p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Refund rate</p>
                <p className={`mt-1 text-lg font-bold ${Number(sellerStats.refund_rate || 0) > 5 ? "text-amber-400" : "text-foreground"}`}>
                  {sellerStats.refund_rate != null ? `${Number(sellerStats.refund_rate).toFixed(0)}%` : "—"}
                </p>
                <p className="text-[9px] text-muted-foreground">refunded orders</p>
              </div>
              <div className="rounded-xl bg-card p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Cancel rate</p>
                <p className={`mt-1 text-lg font-bold ${Number(sellerStats.cancel_rate || 0) > 5 ? "text-amber-400" : "text-foreground"}`}>
                  {sellerStats.cancel_rate != null ? `${Number(sellerStats.cancel_rate).toFixed(0)}%` : "—"}
                </p>
                <p className="text-[9px] text-muted-foreground">cancelled orders</p>
              </div>
              <div className="rounded-xl bg-card p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Response</p>
                <p className="mt-1 text-lg font-bold text-foreground">
                  {sellerStats.avg_response_minutes != null ? `${Math.max(1, Math.round(Number(sellerStats.avg_response_minutes) / 60))}h` : "—"}
                </p>
                <p className="text-[9px] text-muted-foreground">avg reply time</p>
              </div>
            </div>
          </div>
        )}

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

        {(seller.bio || (seller.social_links && Object.keys(seller.social_links).length > 0)) && (
          <div className="mb-3 rounded-2xl bg-card p-3 text-xs">
            {seller.bio && <p className="whitespace-pre-wrap text-foreground">{seller.bio}</p>}
            {seller.social_links && Object.keys(seller.social_links).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                {Object.entries(seller.social_links as Record<string, string>).filter(([, v]) => !!v).map(([k, v]) => {
                  const Icon = k === "instagram" ? Instagram : k === "youtube" ? Youtube : k === "discord" ? MessageSquare : Globe2;
                  const href = /^https?:\/\//.test(v) ? v : `https://${v}`;
                  return (
                    <a key={k} href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 font-semibold text-foreground hover:bg-muted/70">
                      <Icon className="h-3 w-3" /> {k}
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {seller?.id && <UpcomingShowsSection sellerId={seller.id} />}

        <div className="mb-3 flex gap-2 overflow-x-auto border-b border-border text-xs">

          {(["listings", "vault", "sold", "posts", "reviews"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`whitespace-nowrap border-b-2 px-3 py-2 capitalize ${tab === t ? "border-primary font-bold text-primary" : "border-transparent text-muted-foreground"}`}>
              {t === "sold" ? `Sold (${soldOrders.length})` : t === "reviews" ? `Reviews (${reviews.length})` : t === "posts" ? `Posts (${posts.length + stories.length})` : t === "vault" ? `Vault (${vaultCards.length})` : `Listings (${listings.length})`}
            </button>
          ))}
        </div>

        {tab === "listings" && <StorefrontListingsBrowser listings={listings} />}


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

        {tab === "posts" && (
          <>
            {posts.length === 0 && stories.length === 0 && <p className="py-12 text-center text-xs text-muted-foreground">No posts or stories yet.</p>}
            {stories.length > 0 && (
              <div className="mb-3">
                <p className="mb-2 text-[10px] font-bold uppercase text-muted-foreground">Active stories</p>
                <div className="grid grid-cols-3 gap-2">
                  {stories.map((s: any) => (
                    <div key={s.id} className="aspect-[3/4] overflow-hidden rounded-lg bg-muted">
                      {s.image_url && <img src={s.image_url} className="h-full w-full object-cover" alt="" />}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {posts.length > 0 && (
              <div className="space-y-2">
                {posts.map((p: any) => (
                  <div key={p.id} className="rounded-xl bg-card p-3">
                    <p className="text-xs">{p.caption}</p>
                    {p.image_url && <img src={p.image_url} className="mt-2 max-h-64 w-full rounded-lg object-cover" alt="" />}
                    <p className="mt-1 text-[10px] text-muted-foreground">{new Date(p.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {tab === "vault" && (
          <>
            {vaultCards.length === 0 && <p className="py-12 text-center text-xs text-muted-foreground">No public vault cards.</p>}
            <div className="grid grid-cols-2 gap-3">
              {vaultCards.map((v) => (
                <div key={v.id} className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
                  <div className="aspect-square overflow-hidden bg-muted">
                    {v.image_url ? <img src={v.image_url} alt={v.name} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><Package className="h-8 w-8 text-muted-foreground" /></div>}
                  </div>
                  <div className="p-2">
                    <p className="line-clamp-1 text-xs font-semibold">{v.name}</p>
                    {v.category && <p className="text-[10px] text-muted-foreground">{v.category}</p>}
                    {Number(v.estimated_value) > 0 && <p className="text-[11px] font-bold text-primary">${Number(v.estimated_value).toFixed(2)}</p>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {tab === "reviews" && seller && (
          <SellerReviewsPanel sellerId={seller.id} currentUserId={user?.id ?? null} />
        )}
      </div>
    </AppShell>
  );
}
