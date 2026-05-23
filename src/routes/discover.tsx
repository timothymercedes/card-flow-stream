import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { FollowButton } from "@/components/FollowButton";
import { Search, X, Clock, Sparkles, Flame, ShieldCheck, Store, Radio, Zap } from "lucide-react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/discover")({
  component: DiscoverPage,
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Discover Collectors — PullBid Live" },
      { name: "description", content: "Search for collectors, sellers, live hosts, and cards on PullBid Live." },
    ],
  }),
});

const RECENT_KEY = "pbl_recent_searches";

type UserRow = {
  id: string;
  username: string;
  avatar_url: string | null;
  shop_name?: string | null;
  full_name?: string | null;
  seller_status?: string | null;
  live_verified?: boolean | null;
  follower_count?: number;
  recent_sales?: number;
  mutual_count?: number;
};

type ListingRow = { id: string; title: string; price: number | null; image_url: string | null };
type LiveHit = {
  stream_id: string;
  title: string;
  thumbnail_url: string | null;
  seller_id: string;
  current_item: string | null;
  matched_item?: { id: string; title: string; image_url: string | null; starting_bid: number; sale_type: string } | null;
};

function DiscoverPage() {
  const initialQ = (Route.useSearch() as any).q ?? "";
  const [query, setQuery] = useState(initialQ);
  const [results, setResults] = useState<UserRow[]>([]);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [liveHits, setLiveHits] = useState<LiveHit[]>([]);
  const [trending, setTrending] = useState<UserRow[]>([]);
  const [suggested, setSuggested] = useState<UserRow[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();
  const debounceRef = useRef<number | null>(null);

  // Load recents + trending + suggested
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw).slice(0, 8));
    } catch {}
    (supabase.rpc as any)("trending_sellers", { _limit: 12 }).then(({ data }: any) => setTrending(data || []));
    (supabase.rpc as any)("suggested_users", { _limit: 12 }).then(({ data }: any) => setSuggested(data || []));
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) { setResults([]); setListings([]); setLiveHits([]); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = window.setTimeout(async () => {
      const like = `%${q}%`;
      const [{ data: users }, { data: cards }, { data: streamsByTitle }, { data: queueMatches }] = await Promise.all([
        (supabase.rpc as any)("search_users", { _query: q, _limit: 25 }),
        supabase.from("listings")
          .select("id,title,price,image_url")
          .ilike("title", like)
          .limit(20),
        supabase.from("live_streams")
          .select("id,title,thumbnail_url,seller_id,current_item")
          .eq("is_active", true)
          .or(`title.ilike.${like},current_item.ilike.${like}`)
          .limit(20),
        supabase.from("auction_queue")
          .select("id,title,image_url,starting_bid,sale_type,stream_id,prebid_enabled,status")
          .ilike("title", like)
          .in("status", ["queued", "running"])
          .limit(40),
      ]);
      setResults(users || []);
      setListings((cards as any) || []);

      // Merge live hits: streams whose title/current item match + streams with matching queued items
      const map = new Map<string, LiveHit>();
      for (const s of (streamsByTitle || []) as any[]) {
        map.set(s.id, { stream_id: s.id, title: s.title, thumbnail_url: s.thumbnail_url, seller_id: s.seller_id, current_item: s.current_item, matched_item: null });
      }
      const qmatches = (queueMatches || []) as any[];
      const needStreams = Array.from(new Set(qmatches.map((q) => q.stream_id))).filter((sid) => !map.has(sid));
      if (needStreams.length) {
        const { data: extraStreams } = await supabase
          .from("live_streams")
          .select("id,title,thumbnail_url,seller_id,current_item,is_active")
          .in("id", needStreams)
          .eq("is_active", true);
        for (const s of (extraStreams || []) as any[]) {
          map.set(s.id, { stream_id: s.id, title: s.title, thumbnail_url: s.thumbnail_url, seller_id: s.seller_id, current_item: s.current_item, matched_item: null });
        }
      }
      for (const it of qmatches) {
        const hit = map.get(it.stream_id);
        if (!hit) continue;
        if (!hit.matched_item) hit.matched_item = { id: it.id, title: it.title, image_url: it.image_url, starting_bid: Number(it.starting_bid || 0), sale_type: it.sale_type };
      }
      setLiveHits(Array.from(map.values()));

      setSearching(false);
      saveRecent(q);
    }, 250);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [query]);

  function saveRecent(term: string) {
    const t = term.trim();
    if (!t) return;
    const next = [t, ...recent.filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(0, 8);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
  }
  function clearRecents() {
    setRecent([]);
    try { localStorage.removeItem(RECENT_KEY); } catch {}
  }

  function openProfile(username: string) {
    saveRecent(username);
    navigate({ to: "/seller/$username", params: { username } });
  }

  const showResults = query.trim().length > 0;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-4 pt-4">
        <h1 className="mb-1 text-2xl font-bold tracking-tight lg:text-3xl">Discover Collectors</h1>
        <p className="mb-3 text-xs text-muted-foreground">Find sellers, hosts, and friends to follow</p>


        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by username, store, or name…"
            className="w-full rounded-full border border-border bg-card py-2.5 pl-9 pr-9 text-sm outline-none focus:border-primary"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {!showResults && recent.length > 0 && (
          <section className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Recent</h2>
              <button onClick={clearRecents} className="text-[11px] font-semibold text-primary hover:underline">Clear</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {recent.map((r) => (
                <button key={r} onClick={() => setQuery(r)} className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold hover:border-primary/60">
                  {r}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      {showResults ? (
        <>
          <section className="mt-4 px-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Radio className="h-3.5 w-3.5 text-red-500" /> Live now {searching ? "· searching…" : `· ${liveHits.length}`}
            </h2>
            {liveHits.length === 0 && !searching && (
              <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No live hosts with "{query}" right now</div>
            )}
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {liveHits.map((h) => (
                <li key={h.stream_id}>
                  <Link
                    to="/live/$id"
                    params={{ id: h.stream_id }}
                    className="flex items-center gap-2 rounded-xl bg-card p-2 ring-1 ring-border hover:ring-primary/60"
                  >
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                      {h.thumbnail_url && <img src={h.thumbnail_url} alt="" className="h-full w-full object-cover" />}
                      <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[8px] font-bold uppercase text-white">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Live
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{h.title}</p>
                      {h.matched_item ? (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-amber-600 dark:text-amber-400">
                          <Zap className="h-3 w-3" /> Pre-bid: {h.matched_item.title}
                          {h.matched_item.starting_bid > 0 && <span className="text-muted-foreground"> · from ${h.matched_item.starting_bid.toFixed(2)}</span>}
                        </p>
                      ) : h.current_item ? (
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">On now: {h.current_item}</p>
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section className="mt-4 px-4">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              People {searching ? "· searching…" : `· ${results.length}`}
            </h2>
            {results.length === 0 && !searching && (
              <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No people match "{query}"</div>
            )}
            <ul className="space-y-2">
              {results.map((u) => <UserRow key={u.id} u={u} onOpen={openProfile} />)}
            </ul>
          </section>
          <section className="mt-5 px-4 pb-8">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Cards {searching ? "· searching…" : `· ${listings.length}`}
            </h2>
            {listings.length === 0 && !searching && (
              <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No cards match "{query}"</div>
            )}
            <ul className="grid grid-cols-2 gap-2">
              {listings.map((l) => (
                <li key={l.id}>
                  <Link to="/market/$id" params={{ id: l.id }} className="block overflow-hidden rounded-xl bg-card ring-1 ring-border">
                    <div className="aspect-square bg-muted">
                      {l.image_url && <img src={l.image_url} alt={l.title} className="h-full w-full object-cover" />}
                    </div>
                    <div className="p-2">
                      <p className="line-clamp-2 text-xs font-semibold">{l.title}</p>
                      {l.price != null && <p className="mt-0.5 text-[11px] font-bold text-primary">${Number(l.price).toFixed(2)}</p>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <>
          {suggested.length > 0 && (
            <section className="mt-6 px-4">
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold"><Sparkles className="h-4 w-4 text-primary" /> Suggested for you</h2>
              <ul className="space-y-2">
                {suggested.slice(0, 6).map((u) => <UserRow key={u.id} u={u} onOpen={openProfile} subtitle={u.mutual_count ? `${u.mutual_count} mutual` : undefined} />)}
              </ul>
            </section>
          )}

          <section className="mt-6 px-4 pb-8">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold"><Flame className="h-4 w-4 text-orange-500" /> Trending sellers</h2>
            {trending.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No trending sellers yet</div>
            ) : (
              <ul className="space-y-2">
                {trending.map((u) => <UserRow key={u.id} u={u} onOpen={openProfile} subtitle={u.recent_sales ? `${u.recent_sales} sales · ${u.follower_count ?? 0} followers` : `${u.follower_count ?? 0} followers`} />)}
              </ul>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}

function UserRow({ u, onOpen, subtitle }: { u: UserRow; onOpen: (username: string) => void; subtitle?: string }) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-card p-2.5 ring-1 ring-border">
      <button onClick={() => onOpen(u.username)} className="flex flex-1 items-center gap-3 text-left">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
          {u.avatar_url ? <img src={u.avatar_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-xs font-bold text-muted-foreground">{u.username.slice(0,1).toUpperCase()}</div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-bold">@{u.username}</p>
            {u.live_verified && <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-label="Verified" />}
            {u.seller_status === "approved" && <Store className="h-3.5 w-3.5 text-amber-500" aria-label="Seller" />}
          </div>
          {(u.shop_name || u.full_name || subtitle) && (
            <p className="truncate text-[11px] text-muted-foreground">
              {u.shop_name || u.full_name || subtitle}
              {u.shop_name && subtitle ? ` · ${subtitle}` : ""}
            </p>
          )}
        </div>
      </button>
      <FollowButton userId={u.id} />
    </li>
  );
}
