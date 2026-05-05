import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Radio, ChevronRight, Heart, Sparkles, Flame } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Link as RLink } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Section({ title, to, children }: any) {
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between px-4">
        <h2 className="text-base font-bold">{title}</h2>
        <Link to={to} className="flex items-center gap-0.5 text-xs font-medium text-primary">
          View More <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      {children}
    </section>
  );
}

function Home() {
  const { profile } = useAuth();
  const interests = (profile?.interests as string[] | undefined) || [];
  const [streams, setStreams] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [vault, setVault] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      // Streams: prefer interest-matched, fall back to all
      let sQ = supabase.from("live_streams").select("*").eq("status", "live").order("created_at", { ascending: false }).limit(6);
      if (interests.length > 0) sQ = sQ.in("category", interests);
      const { data: sData } = await sQ;
      if ((sData?.length || 0) === 0 && interests.length > 0) {
        const { data: fallback } = await supabase.from("live_streams").select("*").eq("status", "live").order("created_at", { ascending: false }).limit(6);
        setStreams(fallback || []);
      } else setStreams(sData || []);

      let lQ = supabase.from("listings").select("*").order("created_at", { ascending: false }).limit(4);
      if (interests.length > 0) lQ = lQ.in("category", interests);
      const { data: lData } = await lQ;
      if ((lData?.length || 0) === 0 && interests.length > 0) {
        const { data: fb } = await supabase.from("listings").select("*").order("created_at", { ascending: false }).limit(4);
        setListings(fb || []);
      } else setListings(lData || []);

      supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(4).then(({ data }) => setPosts(data || []));
      supabase.from("vault_cards").select("*").order("created_at", { ascending: false }).limit(4).then(({ data }) => setVault(data || []));
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
      <div className="bg-gradient-to-b from-primary/15 to-transparent px-4 pb-6 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Discover</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {interests.length > 0 ? "Personalized for what you collect." : "Live auctions, drops & cards from collectors."}
            </p>
          </div>
          {profile && (profile.current_streak ?? 0) > 0 && (
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-bold text-orange-500" title={`Longest streak: ${profile.longest_streak ?? 0} days`}>
              <Flame className="h-3.5 w-3.5" /> {profile.current_streak}-day streak
            </div>
          )}
        </div>
        {profile && interests.length === 0 && (
          <RLink to="/onboarding" className="mt-3 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs font-semibold text-primary">
            <Sparkles className="h-4 w-4" /> Tell us what you collect → personalized feed
          </RLink>
        )}
      </div>

      <Section title="🔴 Live Now" to="/live">
        <div className="flex gap-3 overflow-x-auto px-4 pb-1">
          {streams.length === 0 && <EmptyMini text="No live streams yet" />}
          {streams.map((s) => (
            <Link key={s.id} to="/live/$id" params={{ id: s.id }} className="w-40 flex-shrink-0">
              <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-muted">
                {s.thumbnail_url ? <img src={s.thumbnail_url} alt={s.title} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/30 to-live/30"><Radio className="h-8 w-8" /></div>}
                <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-live px-2 py-0.5 text-[10px] font-bold text-live-foreground">
                  <span className="h-1.5 w-1.5 live-pulse rounded-full bg-live-foreground" /> LIVE
                </div>
              </div>
              <p className="mt-2 line-clamp-1 text-sm font-semibold">{s.title}</p>
              <p className="text-xs text-muted-foreground">${Number(s.current_bid).toFixed(0)}</p>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="💬 Status" to="/feed">
        <div className="space-y-3 px-4">
          {posts.length === 0 && <EmptyMini text="No posts yet" />}
          {posts.map((p) => (
            <div key={p.id} className="rounded-xl bg-card p-3">
              <div className="text-xs font-semibold text-primary">@{p.username}</div>
              <p className="mt-1 text-sm">{p.caption}</p>
              {p.image_url && <img src={p.image_url} className="mt-2 max-h-48 w-full rounded-lg object-cover" alt="" />}
            </div>
          ))}
        </div>
      </Section>

      <Section title="🛒 Market" to="/market">
        <div className="grid grid-cols-2 gap-3 px-4">
          {listings.length === 0 && <EmptyMini text="No listings yet" />}
          {listings.map((l) => (
            <Link key={l.id} to="/market/$id" params={{ id: l.id }} className="overflow-hidden rounded-xl bg-card">
              <div className="aspect-square bg-muted">
                {l.image_url ? <img src={l.image_url} className="h-full w-full object-cover" alt={l.title} /> : <div className="h-full w-full bg-gradient-to-br from-primary/20 to-accent" />}
              </div>
              <div className="p-2">
                <p className="line-clamp-1 text-xs font-semibold">{l.title}</p>
                <p className="text-xs text-primary">${Number(l.is_auction ? l.current_bid || 0 : l.price || 0).toFixed(0)}{l.is_auction ? " bid" : ""}</p>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="🔒 Personal Vault" to="/vault">
        <div className="grid grid-cols-2 gap-3 px-4">
          {vault.length === 0 && <EmptyMini text="Sign in to save cards" />}
          {vault.map((v) => (
            <div key={v.id} className="overflow-hidden rounded-xl bg-card">
              <div className="aspect-square bg-muted">
                {v.image_url ? <img src={v.image_url} className="h-full w-full object-cover" alt={v.name} /> : <Heart className="m-auto h-8 w-8 text-muted-foreground" />}
              </div>
              <div className="p-2">
                <p className="line-clamp-1 text-xs font-semibold">{v.name}</p>
                <p className="text-[10px] text-muted-foreground">{v.category}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </AppShell>
  );
}

function EmptyMini({ text }: { text: string }) {
  return <div className="col-span-2 w-full rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">{text}</div>;
}
