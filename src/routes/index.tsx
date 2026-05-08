import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShuffleBucket, shuffleBy } from "@/lib/shuffle";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Radio, ChevronRight, Heart, Sparkles, Flame, ShieldCheck, Zap, Trophy, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Link as RLink } from "@tanstack/react-router";
import heroCards from "@/assets/hero-cards.jpg";
import { SellerBadge } from "@/components/SellerBadge";
import { getListingPriceDisplay, isPublicListingVisible } from "@/lib/listingDisplay";
import PublicLanding from "@/components/PublicLanding";
import { isTutorialMode } from "@/lib/tutorialMode";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "PullBid Live — Live card auctions, drops & vault" },
      { name: "description", content: "Hunt rare pulls, bid live, and trade with collectors. Holographic auctions for sports cards, Pokémon, and TCGs — streamed in real time." },
      { property: "og:title", content: "PullBid Live — Live Card Auctions" },
      { property: "og:description", content: "Live auctions and drops for collectors. Pull, bid, vault." },
      { property: "og:image", content: "/og.jpg" },
    ],
  }),
});

function Section({ title, to, children, viewLabel }: any) {
  const { t } = useTranslation();
  const label = viewLabel ?? t("common.viewMore");
  return (
    <section className="mb-7">
      <div className="mb-3 flex items-center justify-between px-4">
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
  const { profile, user, loading } = useAuth();
  const { t } = useTranslation();
  const showLanding = !loading && !user && !isTutorialMode();
  if (showLanding) return <PublicLanding />;
  const interests = (profile?.interests as string[] | undefined) || [];
  const [streamsAll, setStreamsAll] = useState<any[]>([]);
  const [showOffAll, setShowOffAll] = useState<any[]>([]);
  const [postsAll, setPostsAll] = useState<any[]>([]);
  const [listingsAll, setListingsAll] = useState<any[]>([]);
  const [vaultAll, setVaultAll] = useState<any[]>([]);
  const [stats, setStats] = useState({ live: 0, collectors: 0, listings: 0 });
  const bucket = useShuffleBucket();

  // Shuffle every 5 min via bucket; slice for display.
  const streams = useMemo(() => shuffleBy(streamsAll, bucket).slice(0, 6), [streamsAll, bucket]);
  const showOffStreams = useMemo(() => shuffleBy(showOffAll, bucket + 1).slice(0, 6), [showOffAll, bucket]);
  const listings = useMemo(() => shuffleBy(listingsAll, bucket + 2).slice(0, 4), [listingsAll, bucket]);
  const posts = useMemo(() => shuffleBy(postsAll, bucket + 3).slice(0, 4), [postsAll, bucket]);
  const vault = useMemo(() => shuffleBy(vaultAll, bucket + 4).slice(0, 4), [vaultAll, bucket]);

  useEffect(() => {
    const load = async () => {
      let sQ = supabase.from("live_streams").select("*").eq("status", "live").order("created_at", { ascending: false }).limit(40);
      if (interests.length > 0) sQ = sQ.in("category", interests);
      const { data: sData } = await sQ;
      if ((sData?.length || 0) === 0 && interests.length > 0) {
        const { data: fallback } = await supabase.from("live_streams").select("*").eq("status", "live").order("created_at", { ascending: false }).limit(40);
        setStreamsAll(fallback || []);
      } else setStreamsAll(sData || []);

      const { data: showData } = await supabase.from("live_streams")
        .select("*").eq("status", "live").eq("stream_type", "show_off").eq("is_private", false)
        .order("created_at", { ascending: false }).limit(40);
      setShowOffAll(showData || []);

      let lQ = supabase.from("listings").select("*").order("created_at", { ascending: false }).limit(80);
      if (interests.length > 0) lQ = lQ.in("category", interests);
      const { data: lData } = await lQ;
      if ((lData?.length || 0) === 0 && interests.length > 0) {
        const { data: fb } = await supabase.from("listings").select("*").order("created_at", { ascending: false }).limit(80);
        setListingsAll((fb || []).filter(isPublicListingVisible));
      } else setListingsAll((lData || []).filter(isPublicListingVisible));

      supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(40).then(({ data }) => setPostsAll(data || []));
      supabase.from("vault_cards")
        .select("*, profiles:user_id(id, username)")
        .eq("visibility", "public")
        .order("created_at", { ascending: false }).limit(60)
        .then(({ data }) => setVaultAll(data || []));

      const [{ count: liveCount }, { count: collectorCount }, { count: listingCount }] = await Promise.all([
        supabase.from("live_streams").select("*", { count: "exact", head: true }).eq("status", "live"),
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("listings").select("*", { count: "exact", head: true }),
      ]);
      setStats({ live: liveCount || 0, collectors: collectorCount || 0, listings: listingCount || 0 });
    };
    load();
    const ch = supabase.channel("home-discover")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_streams" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "listings" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [interests.join(",")]);

  return (
    <AppShell>
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

        <div className="relative px-4 pb-6 pt-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-background/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-live live-pulse" />
                {stats.live > 0 ? t("home.tagline_live_now", { count: stats.live }) : t("home.tagline_default")}
              </div>
              <h1 className="text-3xl font-black leading-tight tracking-tight">
                {t("home.headline_part_1")} <span className="holo-text">{t("home.headline_part_2")}</span>
              </h1>
              <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
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
          <div className="mt-4 flex gap-2">
            <Link to="/live" className="flex-1 rounded-xl bg-gradient-to-r from-primary to-primary-glow px-4 py-3 text-center text-sm font-bold text-primary-foreground rare-glow">
              {t("home.cta_watch_live")}
            </Link>
            {!user ? (
              <Link to="/auth" className="rounded-xl border border-border bg-card px-4 py-3 text-center text-sm font-bold">{t("home.cta_sign_up")}</Link>
            ) : (
              <Link to="/market" className="rounded-xl border border-border bg-card px-4 py-3 text-center text-sm font-bold">{t("home.cta_browse_market")}</Link>
            )}
          </div>

          {/* Trust strip */}
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <TrustBadge icon={<ShieldCheck className="h-3.5 w-3.5" />} label={t("home.trust_verified")} />
            <TrustBadge icon={<Zap className="h-3.5 w-3.5" />} label={t("home.trust_instant")} />
            <TrustBadge icon={<Trophy className="h-3.5 w-3.5" />} label={t("home.trust_authenticated")} />
          </div>

          {profile && interests.length === 0 && (
            <RLink to="/onboarding" className="mt-4 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs font-semibold text-primary">
              <Sparkles className="h-4 w-4" /> {t("home.personalize_cta")}
            </RLink>
          )}
        </div>
      </header>

      {/* Stat ribbon */}
      <div className="mx-4 -mt-2 mb-6 grid grid-cols-3 gap-2 rounded-2xl border border-border bg-card/60 p-3 backdrop-blur">
        <Stat value={stats.live} label={t("home.stats_live")} accent />
        <Stat value={stats.collectors} label={t("home.stats_collectors")} />
        <Stat value={stats.listings} label={t("home.stats_listings")} />
      </div>

      <Section title="🔴 Live Now" to="/live">
        <div className="flex gap-3 overflow-x-auto px-4 pb-1">
          {streams.length === 0 && <EmptyMini text="No live streams yet — be first to go live" />}
          {streams.map((s) => (
            <Link key={s.id} to="/live/$id" params={{ id: s.id }} className="w-40 flex-shrink-0 group">
              <div className="card-foil-edge relative aspect-[3/4] overflow-hidden rounded-xl bg-muted ring-1 ring-border group-hover:ring-primary/60 transition-all">
                {s.thumbnail_url
                  ? <img src={s.thumbnail_url} alt={s.title} loading="lazy" className="h-full w-full object-cover" />
                  : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/30 to-live/30"><Radio className="h-8 w-8" /></div>}
                <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-live px-2 py-0.5 text-[10px] font-bold text-live-foreground">
                  <span className="h-1.5 w-1.5 live-pulse rounded-full bg-live-foreground" /> LIVE
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                  <p className="line-clamp-1 text-xs font-bold text-white">{s.title}</p>
                  {Number(s.current_bid) > 0 && <p className="text-[11px] font-semibold text-primary-glow">${Number(s.current_bid).toFixed(0)}</p>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="✨ Flex Live — Live Now" to="/showoff" viewLabel="Open Flex Live">
        <div className="flex gap-3 overflow-x-auto px-4 pb-1">
          {showOffStreams.length === 0 && <EmptyMini text="No Flex Lives yet — flex your collection!" />}
          {showOffStreams.map((s) => (
            <Link key={s.id} to="/live/$id" params={{ id: s.id }} className="w-40 flex-shrink-0 group">
              <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-gradient-to-br from-fuchsia-500/30 to-violet-500/30 ring-1 ring-fuchsia-500/30 group-hover:ring-fuchsia-400 transition-all">
                {s.thumbnail_url
                  ? <img src={s.thumbnail_url} alt={s.title} loading="lazy" className="h-full w-full object-cover" />
                  : <div className="flex h-full w-full items-center justify-center"><Sparkles className="h-8 w-8 text-fuchsia-300" /></div>}
                <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-fuchsia-500 px-2 py-0.5 text-[10px] font-bold text-white">
                  <Sparkles className="h-2.5 w-2.5" /> SHOW OFF
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                  <p className="line-clamp-1 text-xs font-bold text-white">{s.title}</p>
                  {Array.isArray(s.tcg_tags) && s.tcg_tags.length > 0 && (
                    <p className="line-clamp-1 text-[10px] text-fuchsia-200">{s.tcg_tags.slice(0, 3).join(" · ")}</p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="🛒 Hot Market" to="/market">
        <div className="grid grid-cols-2 gap-3 px-4">
          {listings.length === 0 && <EmptyMini text="No listings yet" />}
          {listings.map((l) => {
            const display = getListingPriceDisplay(l, true);
            return (
              <Link key={l.id} to="/market/$id" params={{ id: l.id }} className="overflow-hidden rounded-xl bg-card ring-1 ring-border hover:ring-primary/50 transition-all">
                <div className="card-foil-edge aspect-square bg-muted">
                  {l.image_url ? <img src={l.image_url} loading="lazy" className="h-full w-full object-cover" alt={l.title} /> : <div className="h-full w-full bg-gradient-to-br from-primary/20 to-accent" />}
                </div>
                <div className="p-2.5">
                  <p className="line-clamp-1 text-xs font-semibold">{l.title}</p>
                  <div className="mt-1"><SellerBadge sellerId={l.seller_id} linkable={false} className="max-w-full flex-wrap" /></div>
                  {display.kind === "offer" ? (
                    <span className="mt-1 inline-flex rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">{t("home.make_offer")}</span>
                  ) : (
                    <p className="mt-1 text-xs font-bold text-primary">{display.label}{display.suffix ? ` ${display.suffix}` : ""}</p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </Section>

      <Section title="💬 Community" to="/feed">
        <div className="space-y-3 px-4">
          {posts.length === 0 && <EmptyMini text="No posts yet" />}
          {posts.map((p) => (
            <div key={p.id} className="rounded-xl bg-card p-3 ring-1 ring-border">
              <Link to="/seller/$username" params={{ username: p.username }} className="text-xs font-semibold text-primary hover:underline">@{p.username}</Link>
              <p className="mt-1 text-sm">{p.caption}</p>
              {p.image_url && <img src={p.image_url} loading="lazy" className="mt-2 max-h-48 w-full rounded-lg object-cover" alt="" />}
            </div>
          ))}
        </div>
      </Section>

      <Section title="🔓 Public Vault" to="/discover" viewLabel="Browse Collectors">
        <div className="grid grid-cols-2 gap-3 px-4">
          {vault.length === 0 && <EmptyMini text="No public vaults yet — set yours to public to appear here" />}
          {vault.map((v) => {
            const username = v.profiles?.username;
            return (
              <div key={v.id} className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
                <div className="card-foil-edge aspect-square bg-muted">
                  {v.image_url ? <img src={v.image_url} loading="lazy" className="h-full w-full object-cover" alt={v.name} /> : <Heart className="m-auto h-8 w-8 text-muted-foreground" />}
                </div>
                <div className="p-2">
                  <p className="line-clamp-1 text-xs font-semibold">{v.name}</p>
                  <p className="text-[10px] text-muted-foreground">{v.category}</p>
                  {username && (
                    <Link to="/seller/$username" params={{ username }} className="mt-1 line-clamp-1 block text-[11px] font-semibold text-primary hover:underline">
                      @{username}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <footer className="px-4 pb-8 pt-2 text-center text-[11px] text-muted-foreground">
        <div className="flex items-center justify-center gap-1.5">
          <Users className="h-3 w-3" /> {t("home.footer_built_by")}
        </div>
        <p className="mt-1">© {new Date().getFullYear()} PullBid Live</p>
      </footer>
    </AppShell>
  );
}

function TrustBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center justify-center gap-1 rounded-lg border border-border bg-card/60 px-1.5 py-1.5 text-[10px] font-semibold text-muted-foreground backdrop-blur">
      <span className="text-primary">{icon}</span>
      <span className="truncate">{label}</span>
    </div>
  );
}

function Stat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className="text-center">
      <div className={`text-lg font-black tabular-nums ${accent ? "text-primary" : ""}`}>{value.toLocaleString()}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function EmptyMini({ text }: { text: string }) {
  return <div className="col-span-2 w-full rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">{text}</div>;
}
