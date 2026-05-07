import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Radio, ChevronRight, Heart, Sparkles, Flame, ShieldCheck, Zap, Trophy, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Link as RLink } from "@tanstack/react-router";
import heroCards from "@/assets/hero-cards.jpg";

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

function Section({ title, to, children, viewLabel = "View More" }: any) {
  return (
    <section className="mb-7">
      <div className="mb-3 flex items-center justify-between px-4">
        <h2 className="text-base font-bold tracking-tight">{title}</h2>
        <Link to={to} className="flex items-center gap-0.5 text-xs font-semibold text-primary hover:text-primary-glow transition-colors">
          {viewLabel} <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      {children}
    </section>
  );
}

function Home() {
  const { profile, user } = useAuth();
  const interests = (profile?.interests as string[] | undefined) || [];
  const [streams, setStreams] = useState<any[]>([]);
  const [showOffStreams, setShowOffStreams] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [vault, setVault] = useState<any[]>([]);
  const [stats, setStats] = useState({ live: 0, collectors: 0, listings: 0 });

  useEffect(() => {
    const load = async () => {
      let sQ = supabase.from("live_streams").select("*").eq("status", "live").order("created_at", { ascending: false }).limit(6);
      if (interests.length > 0) sQ = sQ.in("category", interests);
      const { data: sData } = await sQ;
      if ((sData?.length || 0) === 0 && interests.length > 0) {
        const { data: fallback } = await supabase.from("live_streams").select("*").eq("status", "live").order("created_at", { ascending: false }).limit(6);
        setStreams(fallback || []);
      } else setStreams(sData || []);

      // Show Off discovery (public only)
      const { data: showData } = await supabase.from("live_streams")
        .select("*").eq("status", "live").eq("stream_type", "show_off").eq("is_private", false)
        .order("created_at", { ascending: false }).limit(6);
      setShowOffStreams(showData || []);

      let lQ = supabase.from("listings").select("*").order("created_at", { ascending: false }).limit(4);
      if (interests.length > 0) lQ = lQ.in("category", interests);
      const { data: lData } = await lQ;
      if ((lData?.length || 0) === 0 && interests.length > 0) {
        const { data: fb } = await supabase.from("listings").select("*").order("created_at", { ascending: false }).limit(4);
        setListings(fb || []);
      } else setListings(lData || []);

      supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(4).then(({ data }) => setPosts(data || []));
      supabase.from("vault_cards").select("*").order("created_at", { ascending: false }).limit(4).then(({ data }) => setVault(data || []));

      // Live counters for social proof
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
      {/* HERO — simplified: one headline, one dominant CTA */}
      <header className="relative overflow-hidden">
        <img
          src={heroCards}
          alt="Holographic trading cards"
          width={1920}
          height={1080}
          className="absolute inset-0 h-full w-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/75 to-background" />

        <div className="relative px-5 pb-7 pt-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-background/50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-live live-pulse" />
            {stats.live > 0 ? `${stats.live} Live now` : "PullBid Live"}
          </div>
          <h1 className="text-4xl font-black leading-[1.05] tracking-tight">
            Pull. Bid. <span className="holo-text">Vault.</span>
          </h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Live card auctions. Real collectors. Tap in.
          </p>

          <Link
            to="/live"
            className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-base font-bold text-primary-foreground shadow-lg active:scale-[0.98] transition-transform rare-glow"
            data-tap
          >
            <Radio className="h-5 w-5" /> Watch Live
          </Link>
          {!user ? (
            <Link
              to="/auth"
              className="mt-2 flex h-12 w-full items-center justify-center rounded-2xl border border-border bg-card text-sm font-bold active:scale-[0.98] transition-transform"
              data-tap
            >
              Sign Up
            </Link>
          ) : (
            <Link
              to="/market"
              className="mt-2 flex h-12 w-full items-center justify-center rounded-2xl border border-border bg-card text-sm font-bold active:scale-[0.98] transition-transform"
              data-tap
            >
              Browse Market
            </Link>
          )}

          {profile && interests.length === 0 && (
            <RLink to="/onboarding" className="mt-4 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs font-semibold text-primary">
              <Sparkles className="h-4 w-4" /> Personalize your feed →
            </RLink>
          )}
        </div>
      </header>

      <Section title="🔴 Live Now" to="/live">
        <div className="flex gap-3 overflow-x-auto px-4 pb-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:none]">
          {streams.length === 0 && <EmptyMini text="No live streams yet — be first to go live" />}
          {streams.map((s) => (
            <Link key={s.id} to="/live/$id" params={{ id: s.id }} className="w-56 flex-shrink-0 group" data-tap>
              <div className="card-foil-edge relative aspect-[3/4] overflow-hidden rounded-2xl bg-muted ring-1 ring-border group-hover:ring-primary/60 transition-all">
                {s.thumbnail_url
                  ? <img src={s.thumbnail_url} alt={s.title} loading="lazy" className="h-full w-full object-cover" />
                  : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/30 to-live/30"><Radio className="h-10 w-10" /></div>}
                <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-live px-2.5 py-1 text-[11px] font-bold text-live-foreground">
                  <span className="h-1.5 w-1.5 live-pulse rounded-full bg-live-foreground" /> LIVE
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3">
                  <p className="line-clamp-2 text-sm font-bold text-white">{s.title}</p>
                  <p className="mt-0.5 text-sm font-extrabold text-primary-glow">${Number(s.current_bid).toFixed(0)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="✨ Flex Live" to="/showoff" viewLabel="Open">
        <div className="flex gap-3 overflow-x-auto px-4 pb-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:none]">
          {showOffStreams.length === 0 && <EmptyMini text="No Flex Lives yet — flex your collection!" />}
          {showOffStreams.map((s) => (
            <Link key={s.id} to="/live/$id" params={{ id: s.id }} className="w-56 flex-shrink-0 group" data-tap>
              <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-gradient-to-br from-fuchsia-500/30 to-violet-500/30 ring-1 ring-fuchsia-500/30 group-hover:ring-fuchsia-400 transition-all">
                {s.thumbnail_url
                  ? <img src={s.thumbnail_url} alt={s.title} loading="lazy" className="h-full w-full object-cover" />
                  : <div className="flex h-full w-full items-center justify-center"><Sparkles className="h-10 w-10 text-fuchsia-300" /></div>}
                <div className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-fuchsia-500 px-2.5 py-1 text-[11px] font-bold text-white">
                  <Sparkles className="h-3 w-3" /> FLEX
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3">
                  <p className="line-clamp-2 text-sm font-bold text-white">{s.title}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="🛒 Hot Market" to="/market">
        <div className="grid grid-cols-2 gap-3 px-4">
          {listings.length === 0 && <EmptyMini text="No listings yet" />}
          {listings.map((l) => (
            <Link key={l.id} to="/market/$id" params={{ id: l.id }} className="overflow-hidden rounded-xl bg-card ring-1 ring-border hover:ring-primary/50 transition-all">
              <div className="card-foil-edge aspect-square bg-muted">
                {l.image_url ? <img src={l.image_url} loading="lazy" className="h-full w-full object-cover" alt={l.title} /> : <div className="h-full w-full bg-gradient-to-br from-primary/20 to-accent" />}
              </div>
              <div className="p-2.5">
                <p className="line-clamp-1 text-xs font-semibold">{l.title}</p>
                <p className="text-xs font-bold text-primary">${Number(l.is_auction ? l.current_bid || 0 : l.price || 0).toFixed(0)}{l.is_auction ? " bid" : ""}</p>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="💬 Community" to="/feed">
        <div className="space-y-3 px-4">
          {posts.length === 0 && <EmptyMini text="No posts yet" />}
          {posts.map((p) => (
            <div key={p.id} className="rounded-xl bg-card p-3 ring-1 ring-border">
              <div className="text-xs font-semibold text-primary">@{p.username}</div>
              <p className="mt-1 text-sm">{p.caption}</p>
              {p.image_url && <img src={p.image_url} loading="lazy" className="mt-2 max-h-48 w-full rounded-lg object-cover" alt="" />}
            </div>
          ))}
        </div>
      </Section>

      <Section title="🔒 Personal Vault" to="/vault">
        <div className="grid grid-cols-2 gap-3 px-4">
          {vault.length === 0 && <EmptyMini text="Sign in to save cards to your vault" />}
          {vault.map((v) => (
            <div key={v.id} className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
              <div className="card-foil-edge aspect-square bg-muted">
                {v.image_url ? <img src={v.image_url} loading="lazy" className="h-full w-full object-cover" alt={v.name} /> : <Heart className="m-auto h-8 w-8 text-muted-foreground" />}
              </div>
              <div className="p-2">
                <p className="line-clamp-1 text-xs font-semibold">{v.name}</p>
                <p className="text-[10px] text-muted-foreground">{v.category}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <footer className="px-4 pb-8 pt-2 text-center text-[11px] text-muted-foreground">
        <div className="flex items-center justify-center gap-1.5">
          <Users className="h-3 w-3" /> Built by collectors, for collectors.
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
