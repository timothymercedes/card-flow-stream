import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { FollowButton } from "@/components/FollowButton";
import { Search, X, Clock, Sparkles, Flame, ShieldCheck, Store } from "lucide-react";
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

type ListingRow = { id: string; title: string; price_cents: number | null; image_url: string | null };

function DiscoverPage() {
  const initialQ = (Route.useSearch() as any).q ?? "";
  const [query, setQuery] = useState(initialQ);
  const [results, setResults] = useState<UserRow[]>([]);
  const [listings, setListings] = useState<ListingRow[]>([]);
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
    if (!q) { setResults([]); setListings([]); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = window.setTimeout(async () => {
      const [{ data: users }, { data: cards }] = await Promise.all([
        (supabase.rpc as any)("search_users", { _query: q, _limit: 25 }),
        supabase.from("listings")
          .select("id,title,price_cents,image_url")
          .ilike("title", `%${q}%`)
          .limit(20),
      ]);
      setResults(users || []);
      setListings((cards as any) || []);
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
      <div className="px-4 pt-4">
        <h1 className="mb-3 text-xl font-black">Discover Collectors</h1>

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
        <section className="mt-4 px-4">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {searching ? "Searching…" : `${results.length} result${results.length === 1 ? "" : "s"}`}
          </h2>
          {results.length === 0 && !searching && (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No collectors match "{query}"</div>
          )}
          <ul className="space-y-2">
            {results.map((u) => <UserRow key={u.id} u={u} onOpen={openProfile} />)}
          </ul>
        </section>
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
