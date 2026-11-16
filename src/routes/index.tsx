import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useShuffleBucket, shuffleBy } from "@/lib/shuffle";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { ArrowLeftRight, Newspaper, LayoutGrid, Radio, ChevronRight, Heart, Sparkles, Flame, Users, Gavel, ShoppingBag, Package, Lock, Compass } from "lucide-react";
import { useTour } from "@/components/MascotGuide";
import { useAuth } from "@/hooks/useAuth";
import { Link as RLink } from "@tanstack/react-router";
import heroCards from "@/assets/hero-cards.jpg";
import { SellerBadge } from "@/components/SellerBadge";
import { getListingPriceDisplay, isPublicListingVisible } from "@/lib/listingDisplay";
import PublicLanding from "@/components/PublicLanding";
import { isTutorialMode } from "@/lib/tutorialMode";
import { useRealtimeChannel } from "@/lib/realtime";
import { StoryRail } from "@/components/StoryRail";
import { DepartmentNavigation } from '@/components/DepartmentNavigation';
import { prioritizeInterestListings } from '@/lib/departmentInterests';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "PullBid Live — Discover, Collect, Shop & Connect" },
      { name: "description", content: "Shop products and collectibles across PullBid Live departments, discover sellers and watch live auctions." },
      { property: "og:title", content: "PullBid Live — Discover, Collect, Shop & Connect" },
      { property: "og:description", content: "Explore category shopping, live auctions and collectible discoveries on PullBid Live." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Section({ title, to, children, viewLabel }: any) {
  const { t } = useTranslation();
  const label = viewLabel ?? t("common.viewMore");
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between px-4">
        <h2 className="text-base font-bold tracking-tight">{title}</h2>
        <Link to={to} className="flex items-center gap-0.5 text-xs font-semibold text-primary hover:text-primary-glow transition-colors">
          {label} <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      {children}
    </section>
  );
}

function Home() {
  const { profile, user } = useAuth();
  const { t } = useTranslation();
  const [hubTab, setHubTab] = useState<HubKey>("all");
  const [tradeAll, setTradeAll] = useState<any[]>([]);
  // messaging, follow/like, and selling are still gated server-side and redirect
  // to /auth from their respective handlers.
  const interests = (profile?.interests as string[] | undefined) || [];
  const [streamsAll, setStreamsAll] = useState<any[]>([]);
  const [showOffAll, setShowOffAll] = useState<any[]>([]);
  const [postsAll, setPostsAll] = useState<any[]>([]);
  const [listingsAll, setListingsAll] = useState<any[]>([]);
  const [vaultAll, setVaultAll] = useState<any[]>([]);
  const [stats, setStats] = useState<{live:number|null;collectors:number|null;listings:number|null}>({ live: null, collectors: null, listings: null });
  const [vaultReadFailed,setVaultReadFailed] = useState(false);
  const [liveReadState, setLiveReadState] = useState<'pending' | 'ready' | 'error'>('pending');
  const [flexReadState, setFlexReadState] = useState<'pending' | 'ready' | 'error'>('pending');
  const bucket = useShuffleBucket();

  // Shuffle every 5 min via bucket; slice for display.
  const streams = useMemo(() => shuffleBy(streamsAll, bucket).slice(0, 6), [streamsAll, bucket]);
  const showOffStreams = useMemo(() => shuffleBy(showOffAll, bucket + 1).slice(0, 6), [showOffAll, bucket]);
  const listings = useMemo(() => prioritizeInterestListings(shuffleBy(listingsAll, bucket + 2), interests).slice(0, 20), [listingsAll, bucket, interests.join(',')]);
  const posts = useMemo(() => postsAll.slice(0, 12), [postsAll]);
  const vault = useMemo(() => shuffleBy(vaultAll, bucket + 4).slice(0, 10), [vaultAll, bucket]);
  const tradeCards = useMemo(() => shuffleBy(tradeAll, bucket + 5).slice(0, 20), [tradeAll, bucket]);

  const [rtTick, setRtTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLiveReadState('pending');
      setFlexReadState('pending');
      let sQ = supabase.from("live_streams").select("*").eq("status", "live").eq('is_demo',false).eq('is_private',false).order("promotion_score", { ascending: false }).order("created_at", { ascending: false }).limit(40);
      if (interests.length > 0) sQ = sQ.in("category", interests);
      const { data: sData, error: sError } = await sQ;
      if (cancelled) return;
      setLiveReadState(sError ? 'error' : 'ready');
      if (!sError && (sData?.length || 0) === 0 && interests.length > 0) {
        const { data: fallback, error: fallbackError } = await supabase.from("live_streams").select("*").eq("status", "live").eq('is_demo',false).eq('is_private',false).order("promotion_score", { ascending: false }).order("created_at", { ascending: false }).limit(40);
        if (cancelled) return;
        setLiveReadState(fallbackError ? 'error' : 'ready');
        setStreamsAll(fallback || []);
      } else setStreamsAll(sData || []);

      const { data: showData, error: showError } = await supabase.from("live_streams")
        .select("*").eq("status", "live").eq('is_demo',false).eq("stream_type", "show_off").eq("is_private", false)
        .order("created_at", { ascending: false }).limit(40);
      if (cancelled) return;
      setShowOffAll(showData || []);
      setFlexReadState(showError ? 'error' : 'ready');

      let lQ = supabase.from("listings").select("*").order("created_at", { ascending: false }).limit(80);
      const { data: lData } = await lQ;
      if (cancelled) return;
      if ((lData?.length || 0) === 0 && interests.length > 0) {
        const { data: fb } = await supabase.from("listings").select("*").order("created_at", { ascending: false }).limit(80);
        if (cancelled) return;
        setListingsAll((fb || []).filter(isPublicListingVisible).filter(notDemo));
      } else setListingsAll((lData || []).filter(isPublicListingVisible).filter(notDemo));

      supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(40).then(({ data }) => { if (!cancelled) setPostsAll(data || []); });
      supabase.from("vault_cards")
        .select("*, profiles:user_id(id, username)")
        .eq("visibility", "public").eq("is_demo", false)
        .order("created_at", { ascending: false }).limit(60)
        .then(({ data,error }) => {if (!cancelled) {setVaultAll((data || []).filter(notDemo));setVaultReadFailed(!!error);}});
      supabase.from("vault_cards")
        .select("id, name, image_url, market_price, estimated_value, profiles:user_id(id, username)")
        .eq("visibility", "public").eq("is_demo", false).eq("accept_trades", true)
        .order("created_at", { ascending: false }).limit(40)
        .then(({ data }) => { if (!cancelled) setTradeAll((data || []).filter(notDemo)); });

      const [{ count: liveCount }, { count: collectorCount }, { count: listingCount }] = await Promise.all([
        supabase.from("live_streams").select("*", { count: "exact", head: true }).eq("status", "live").eq('is_demo',false).eq('is_private',false),
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("listings").select("*", { count: "exact", head: true }),
      ]);
      if (!cancelled) setStats({ live: liveCount, collectors: collectorCount, listings: listingCount });
    };
    load();
    return () => { cancelled = true; };
  }, [interests.join(","), rtTick]);
  useRealtimeChannel({ name: "home-discover" }, (ch) => ch
    .on("postgres_changes" as any, { event: "*", schema: "public", table: "live_streams" } as any, () => setRtTick((n) => n + 1))
    .on("postgres_changes" as any, { event: "*", schema: "public", table: "posts" } as any, () => setRtTick((n) => n + 1))
    .on("postgres_changes" as any, { event: "*", schema: "public", table: "listings" } as any, () => setRtTick((n) => n + 1)));

  return (
    <AppShell>
    <div className="mx-auto w-full max-w-7xl">
      <DepartmentNavigation />
      {/* HERO */}
      <header className="relative overflow-hidden">
        <img
          src={heroCards}
          alt="Holographic trading cards fanned on velvet"
          width={1920}
          height={1080}
          className="absolute inset-0 h-full w-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
        <div className="absolute inset-0 holo-foil opacity-[0.08] mix-blend-overlay pointer-events-none" />

        <div className="relative px-4 pb-6 pt-6 lg:px-8 lg:pb-10 lg:pt-10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-background/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-live live-pulse" />
                {stats.live !== null && stats.live > 0 ? t("home.tagline_live_now", { count: stats.live }) : t("home.tagline_default")}
              </div>
              <h1 className="text-3xl font-black leading-tight tracking-tight lg:text-5xl">
                {t("home.headline_part_1")} <span className="holo-text">{t("home.headline_part_2")}</span>
              </h1>
              <p className="mt-1.5 max-w-xs text-sm text-muted-foreground lg:max-w-md lg:text-base">
                {t("home.subheadline")}
              </p>
            </div>
            {profile && (profile.current_streak ?? 0) > 0 && (
              <div className="flex shrink-0 items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-bold text-orange-500" title={`Longest streak: ${profile.longest_streak ?? 0} days`}>
                <Flame className="h-3.5 w-3.5" /> {profile.current_streak}d
              </div>
            )}
          </div>

          {/* CTA row */}
          <div className="mt-4 flex gap-2 lg:max-w-md">
            <Link to="/live" className="flex-1 rounded-xl bg-gradient-to-r from-primary to-primary-glow px-4 py-3 text-center text-sm font-bold text-primary-foreground shadow-[var(--shadow-primary)] rare-glow transition active:scale-[0.98]">
              {t("home.cta_watch_live")}
            </Link>
            {!user ? (
              <Link to="/auth" className="rounded-xl border border-border/60 bg-card/60 px-4 py-3 text-center text-sm font-bold shadow-[var(--shadow-xs)] backdrop-blur transition hover:bg-card">{t("home.cta_sign_up")}</Link>
            ) : (
              <Link to="/market" className="rounded-xl border border-border/60 bg-card/60 px-4 py-3 text-center text-sm font-bold shadow-[var(--shadow-xs)] backdrop-blur transition hover:bg-card">{t("home.cta_browse_market")}</Link>
            )}
          </div>

          {/* Inline stats — replaces both trust strip + stat ribbon */}
          <div className="mt-4 flex items-center gap-4 rounded-xl border border-border/60 bg-card/40 px-3 py-2 text-[11px] shadow-[var(--shadow-xs)] backdrop-blur lg:max-w-md">
            <InlineStat value={stats.live} label={t("home.stats_live")} accent />
            <span className="h-6 w-px bg-border/60" />
            <InlineStat value={stats.collectors} label={t("home.stats_collectors")} />
            <span className="h-6 w-px bg-border/60" />
            <InlineStat value={stats.listings} label={t("home.stats_listings")} />
          </div>

          {profile && interests.length === 0 && (
            <RLink to="/onboarding" className="mt-3 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 p-2.5 text-xs font-semibold text-primary lg:max-w-md">
              <Sparkles className="h-4 w-4" /> {t("home.personalize_cta")}
            </RLink>
          )}
        </div>
      </header>

      <DivisionGrid />


      <section className="mb-6 mt-2 px-4" aria-label="Discover">
        <div className="sticky top-0 z-10 -mx-4 mb-4 bg-background/85 px-4 py-2 backdrop-blur">
          <div role="tablist" className="no-scrollbar flex gap-1.5 overflow-x-auto rounded-2xl bg-card p-1 ring-1 ring-border">
            {HUB_TABS.map((h) => (
              <button key={h.key} role="tab" aria-selected={hubTab === h.key} onClick={() => setHubTab(h.key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${hubTab === h.key ? "bg-gradient-to-r from-primary to-primary-glow text-primary-foreground shadow-[var(--shadow-primary)]" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                <h.icon className="h-3.5 w-3.5" />{h.label}
                {h.key === "live" && (stats.live ?? 0) > 0 && <span className="h-1.5 w-1.5 rounded-full bg-live live-pulse" />}
              </button>
            ))}
          </div>
        </div>

        {(hubTab === "all" || hubTab === "stories") && (
          <HubBlock title="Stories" to="/stories" show={hubTab === "all"}>
            <StoryRail />
          </HubBlock>
        )}

        {(hubTab === "all" || hubTab === "live") && (
          <HubBlock title="Live auctions" to="/live" show={hubTab === "all"} icon={Radio}>
            {liveReadState === 'pending' ? <EmptyMini text="Loading live shows…" /> : liveReadState === 'error' ? <div role="alert" className="py-4 text-sm text-muted-foreground">Live shows are unavailable. <Button variant="link" onClick={() => setRtTick(tick => tick + 1)}>Retry</Button></div> : (streams.length + showOffStreams.length) === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-gradient-to-br from-live/10 to-transparent p-8 text-center">
                <Radio className="h-8 w-8 text-live" />
                <p className="text-sm font-bold">No one is live right now</p>
                <p className="text-xs text-muted-foreground">Be the first to go live and grab the spotlight.</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button asChild size="sm"><Link to={user ? "/sell" : "/auth"}><Radio className="mr-1 h-3.5 w-3.5" />{user ? "Go Live now" : "Sign in to go live"}</Link></Button>
                  <Button asChild size="sm" variant="outline"><Link to="/shows">Upcoming shows</Link></Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {[...streams, ...showOffStreams].slice(0, hubTab === "all" ? 5 : 15).map((s) => (
                  <Link key={s.id} to="/live/$id" params={{ id: s.id }} className="group">
                    <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-muted ring-1 ring-border transition group-hover:-translate-y-0.5 group-hover:ring-primary/60">
                      <SafeImg src={s.thumbnail_url} alt={s.title} />
                      <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-live px-2 py-0.5 text-[10px] font-bold text-live-foreground">
                        <span className="h-1.5 w-1.5 live-pulse rounded-full bg-live-foreground" /> {s.stream_type === "show_off" ? "FLEX" : "LIVE"}
                      </div>
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 to-transparent p-2">
                        <p className="line-clamp-1 text-xs font-bold">{s.title}</p>
                        {Number(s.current_bid) > 0 && <p className="text-[11px] font-semibold text-primary">${Number(s.current_bid).toFixed(0)}</p>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </HubBlock>
        )}

        {(hubTab === "all" || hubTab === "market") && (
          <HubBlock title="Hot in the Market" to="/market" show={hubTab === "all"} icon={Gavel}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {listings.length === 0 && <EmptyMini text="No active listings right now — check back soon." />}
              {listings.slice(0, hubTab === "all" ? 5 : 20).map((l) => {
                const display = getListingPriceDisplay(l, true);
                return (
                  <Link key={l.id} to="/market/$id" params={{ id: l.id }} className="group overflow-hidden rounded-xl bg-card ring-1 ring-border transition hover:-translate-y-0.5 hover:ring-primary/50">
                    <div className="aspect-square overflow-hidden bg-muted"><SafeImg src={l.image_url} alt={l.title} /></div>
                    <div className="p-2.5">
                      <p className="line-clamp-1 text-xs font-semibold">{l.title}</p>
                      <div className="mt-1"><SellerBadge sellerId={l.seller_id} linkable={false} className="max-w-full flex-wrap" /></div>
                      {display.kind === "offer" ? (
                        <span className="mt-1 inline-flex rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">{t("home.make_offer")}</span>
                      ) : (
                        <p className="mt-1 text-sm font-black text-primary">{display.label}{display.suffix ? ` ${display.suffix}` : ""}</p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </HubBlock>
        )}

        {(hubTab === "all" || hubTab === "trade") && (
          <HubBlock title="Open for trade" to="/trades" show={hubTab === "all"} icon={ArrowLeftRight}>
            {tradeCards.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-8 text-center">
                <ArrowLeftRight className="h-8 w-8 text-primary" />
                <p className="text-sm font-bold">No items listed for trade yet</p>
                <p className="text-xs text-muted-foreground">Mark items in your Vault as “Open to trade” and they will show up here.</p>
                <div className="flex gap-2"><Button asChild size="sm"><Link to="/vault">Open my Vault</Link></Button><Button asChild size="sm" variant="outline"><Link to="/trades/discover">Find matches</Link></Button></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {tradeCards.slice(0, hubTab === "all" ? 5 : 20).map((v) => (
                  <Link key={v.id} to="/trades/discover" className="group overflow-hidden rounded-xl bg-card ring-1 ring-border transition hover:-translate-y-0.5 hover:ring-primary/50">
                    <div className="relative aspect-[3/4] overflow-hidden bg-muted">
                      <SafeImg src={v.image_url} alt={v.name} contain />
                      <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">TRADE</span>
                    </div>
                    <div className="p-2.5">
                      <p className="line-clamp-1 text-xs font-semibold">{v.name}</p>
                      {v.profiles?.username && <p className="line-clamp-1 text-[11px] text-muted-foreground">@{v.profiles.username}</p>}
                      {Number(v.market_price || v.estimated_value) > 0 && <p className="text-xs font-bold text-primary">≈ ${Number(v.market_price || v.estimated_value).toFixed(2)}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </HubBlock>
        )}

        {(hubTab === "all" || hubTab === "feed") && (
          <HubBlock title="Community feed" to="/feed" show={hubTab === "all"} icon={Newspaper}>
            <div className="grid gap-3 sm:grid-cols-2">
              {posts.length === 0 && <EmptyMini text={t("home.empty_posts")} />}
              {posts.slice(0, hubTab === "all" ? 4 : 12).map((p) => (
                <article key={p.id} className="flex gap-3 rounded-2xl bg-card p-3 ring-1 ring-border">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-black text-primary">{(p.username?.[0] || "?").toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link to="/seller/$username" params={{ username: p.username }} className="truncate text-xs font-bold hover:text-primary">@{p.username}</Link>
                      <span className="text-[10px] text-muted-foreground">{timeAgo(p.created_at)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-3 text-sm">{p.caption}</p>
                    {p.image_url && <img src={p.image_url} loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} className="mt-2 max-h-40 w-full rounded-lg object-cover" alt="" />}
                  </div>
                </article>
              ))}
            </div>
          </HubBlock>
        )}

        {hubTab === "all" && vault.length > 0 && (
          <HubBlock title={t("home.section_vault")} to="/discover" show icon={Lock}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {vault.slice(0, 5).map((v) => (
                <div key={v.id} className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
                  <div className="aspect-[3/4] overflow-hidden bg-muted"><SafeImg src={v.image_url} alt={v.name} contain /></div>
                  <div className="p-2.5">
                    <p className="line-clamp-1 text-xs font-semibold">{v.name}</p>
                    {v.profiles?.username && <Link to="/seller/$username" params={{ username: v.profiles.username }} className="line-clamp-1 text-[11px] font-semibold text-primary hover:underline">@{v.profiles.username}</Link>}
                  </div>
                </div>
              ))}
            </div>
          </HubBlock>
        )}
      </section>

      <footer className="px-4 pb-8 pt-2 text-center text-[11px] text-muted-foreground">
        <div className="flex items-center justify-center gap-1.5">
          <Users className="h-3 w-3" /> {t("home.footer_built_by")}
        </div>
        <p className="mt-1">© {new Date().getFullYear()} PullBid Live</p>
      </footer>
    </div>
    </AppShell>
  );
}


function InlineStat({ value, label, accent }: { value: number|null; label: string; accent?: boolean }) {
  return (
    <div className="flex flex-1 items-baseline justify-center gap-1.5">
      <span aria-label={value === null ? `${label} unavailable` : undefined} className={`text-sm font-black tabular-nums ${accent ? "text-primary" : ""}`}>{value?.toLocaleString() ?? '—'}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

type HubKey = "all" | "live" | "market" | "trade" | "feed" | "stories";
const HUB_TABS: { key: HubKey; label: string; icon: any }[] = [
  { key: "all", label: "For you", icon: LayoutGrid },
  { key: "live", label: "Live auctions", icon: Radio },
  { key: "market", label: "Market", icon: Gavel },
  { key: "trade", label: "PB Trade", icon: ArrowLeftRight },
  { key: "feed", label: "News feed", icon: Newspaper },
  { key: "stories", label: "Stories", icon: Sparkles },
];

function notDemo(row: any) {
  if (row?.is_demo) return false;
  const u = row?.profiles?.username || row?.seller_username || "";
  return !/^demo[_-]/i.test(u);
}

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m}m`; const h = Math.floor(m / 60); if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}d`;
}

function SafeImg({ src, alt, contain }: { src?: string | null; alt: string; contain?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-primary/20 via-card to-accent p-3 text-center">
      <Package className="h-7 w-7 text-primary/70" />
      <span className="line-clamp-2 text-[10px] font-semibold text-muted-foreground">{alt}</span>
    </div>
  );
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={`h-full w-full transition duration-300 group-hover:scale-105 ${contain ? "object-contain p-1" : "object-cover"}`} />;
}

function HubBlock({ title, to, show, icon: Icon, children }: { title: string; to: string; show: boolean; icon?: any; children: ReactNode }) {
  return (
    <div className="mb-7">
      {show && (
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-black tracking-tight">{Icon && <Icon className="h-4 w-4 text-primary" />}{title}</h2>
          <Link to={to} className="flex items-center gap-0.5 text-xs font-semibold text-primary hover:text-primary-glow">See all <ChevronRight className="h-3 w-3" /></Link>
        </div>
      )}
      {children}
    </div>
  );
}

function EmptyMini({ text }: { text: string }) {
  return <div className="col-span-2 w-full rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">{text}</div>;
}

const DIVISIONS = [
  { key: "live", to: "/live", icon: Radio, name: "Live", desc: "Live shows, hosts and real-time auctions." },
  { key: "market", to: "/market", icon: Gavel, name: "Marketplace", desc: "Buy and sell collectibles with other collectors." },
  { key: "bazaar", to: "/bazaar", icon: ShoppingBag, name: "PB Bazaar", desc: "Everyday merchandise at fixed prices." },
  { key: "store", to: "/shop", icon: Package, name: "PB Store", desc: "New trading cards and sealed products.", soon: true },
  { key: "social", to: "/feed", icon: Users, name: "PB Social", desc: "Collectors, stories and community posts." },
  { key: "vault", to: "/vault", icon: Lock, name: "Vault", desc: "Organize your card collection." },
] as const;

function DivisionGrid() {
  const { startTour } = useTour();
  const { t } = useTranslation();
  return (
    <section className="mb-5 mt-4 px-4" data-tour="divisions">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold tracking-tight">{t("home.explore_title", "Explore PullBid Live")}</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => startTour("platform-quick", true)}><Compass className="mr-1 h-3.5 w-3.5" />{t("home.quick_tour", "Quick Tour")}</Button>
          <Button size="sm" variant="outline" onClick={() => startTour("platform-full", true)}>{t("home.full_tour", "Full Tour")}</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {DIVISIONS.map((d) => (
          <Link key={d.key} to={d.to} data-tour={`div-${d.key}`} className="group rounded-xl border border-border bg-card p-3 transition hover:border-primary/60">
            <d.icon className="h-5 w-5 text-primary" />
            <p className="mt-2 flex items-center gap-1.5 text-sm font-bold">{t(`home.div_${d.key}_name`, d.name)}{"soon" in d && d.soon && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase text-muted-foreground">{t("home.soon", "Soon")}</span>}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{t(`home.div_${d.key}_desc`, d.desc)}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
