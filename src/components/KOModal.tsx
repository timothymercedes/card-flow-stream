import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, Search, Radio, Users, Check, X as XIcon, Zap, Trash2 } from "lucide-react";
import { toast } from "sonner";

export type KODestination = { stream_id: string; seller_id: string; username: string; avatar_url: string | null };

type LiveHost = { id: string; seller_id: string; title: string; thumbnail_url: string | null; category: string | null };
type Profile = { id: string; username: string; avatar_url: string | null };
type KORequest = {
  id: string;
  from_stream_id: string;
  from_seller_id: string;
  from_username: string;
  from_avatar_url: string | null;
  from_viewer_count: number;
  status: string;
};

const MAX_DESTS = 3;
const MAX_MSG = 120;

export function KOModal({
  open,
  onClose,
  streamId,
  hostSellerId,
  acceptsRequests,
  destinations,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  streamId: string;
  hostSellerId: string;
  acceptsRequests: boolean;
  destinations: KODestination[];
  onConfirm: (dests: KODestination[], message: string) => Promise<void> | void;
}) {
  const [accept, setAccept] = useState(acceptsRequests);
  const [dests, setDests] = useState<KODestination[]>(destinations || []);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<(LiveHost & { profile: Profile | null; viewers: number })[]>([]);
  const [requests, setRequests] = useState<KORequest[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setAccept(acceptsRequests); }, [acceptsRequests, open]);
  useEffect(() => { setDests(destinations || []); }, [destinations, open]);

  // Persist toggle
  useEffect(() => {
    if (!open) return;
    supabase.from("live_streams").update({ ko_accepts_requests: accept }).eq("id", streamId);
  }, [accept, open, streamId]);

  // Live host search
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const q = search.trim();
      let query = supabase
        .from("live_streams")
        .select("id, seller_id, title, thumbnail_url, category")
        .eq("status", "live")
        .neq("seller_id", hostSellerId)
        .limit(15);
      if (q) query = query.ilike("title", `%${q}%`);
      const { data: streams } = await query;
      if (cancelled || !streams) return;
      const sellerIds = streams.map((s: any) => s.seller_id);
      const { data: profs } = sellerIds.length
        ? await supabase.from("profiles").select("id, username, avatar_url").in("id", sellerIds)
        : { data: [] as Profile[] };
      const profMap = new Map((profs || []).map((p: any) => [p.id, p as Profile]));

      // viewer counts
      const cutoff = new Date(Date.now() - 90_000).toISOString();
      const ids = streams.map((s: any) => s.id);
      const { data: pres } = ids.length
        ? await supabase.from("live_stream_presence").select("stream_id").in("stream_id", ids).gte("last_seen_at", cutoff)
        : { data: [] as any[] };
      const counts: Record<string, number> = {};
      (pres || []).forEach((r: any) => { counts[r.stream_id] = (counts[r.stream_id] || 0) + 1; });

      // If query is empty, prefer username matches too
      let merged = streams.map((s: any) => ({ ...s, profile: profMap.get(s.seller_id) || null, viewers: counts[s.id] || 0 }));
      if (q) {
        merged = merged.filter((s) =>
          s.title?.toLowerCase().includes(q.toLowerCase()) ||
          s.profile?.username?.toLowerCase().includes(q.toLowerCase())
        );
      }
      setResults(merged);
    })();
    return () => { cancelled = true; };
  }, [search, open, hostSellerId]);

  // Incoming requests + realtime
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("ko_requests")
        .select("*")
        .eq("to_stream_id", streamId)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(10);
      if (!cancelled) setRequests((data as KORequest[]) || []);
    }
    load();
    const ch = supabase
      .channel(`ko-req-${streamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ko_requests", filter: `to_stream_id=eq.${streamId}` }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [open, streamId]);

  // Auto-prune destinations whose streams are no longer live
  useEffect(() => {
    if (!open || dests.length === 0) return;
    const ids = dests.map((d) => d.stream_id);
    let cancelled = false;
    async function check() {
      const { data } = await supabase.from("live_streams").select("id, status").in("id", ids);
      if (cancelled || !data) return;
      const liveIds = new Set(data.filter((s: any) => s.status === "live").map((s: any) => s.id));
      setDests((cur) => cur.filter((d) => liveIds.has(d.stream_id)));
    }
    check();
    const i = setInterval(check, 5000);
    return () => { cancelled = true; clearInterval(i); };
  }, [open, dests.length]);

  const visibleRequests = useMemo(() => requests.slice(0, 3), [requests]);

  function addDest(d: KODestination) {
    setDests((cur) => {
      if (cur.length >= MAX_DESTS) { toast.error("Max 3 destinations"); return cur; }
      if (cur.some((x) => x.stream_id === d.stream_id)) return cur;
      return [...cur, d];
    });
  }

  function removeDest(id: string) {
    setDests((cur) => cur.filter((d) => d.stream_id !== id));
  }

  async function acceptRequest(req: KORequest) {
    if (dests.length >= MAX_DESTS) return toast.error("Max 3 destinations");
    // confirm requester is still live
    const { data: ls } = await supabase.from("live_streams").select("id, seller_id, status").eq("id", req.from_stream_id).maybeSingle();
    if (!ls || ls.status !== "live") {
      toast.error("That host is no longer live");
      await supabase.from("ko_requests").update({ status: "expired" }).eq("id", req.id);
      return;
    }
    addDest({ stream_id: req.from_stream_id, seller_id: req.from_seller_id, username: req.from_username, avatar_url: req.from_avatar_url });
    await supabase.from("ko_requests").update({ status: "accepted" }).eq("id", req.id);
  }

  async function declineRequest(req: KORequest) {
    await supabase.from("ko_requests").update({ status: "declined" }).eq("id", req.id);
  }

  async function confirmKickout() {
    if (dests.length === 0) return toast.error("Pick at least 1 destination");
    setSubmitting(true);
    try {
      await onConfirm(dests, message.trim().slice(0, MAX_MSG));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 p-3 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-purple-500/30 bg-gradient-to-b from-zinc-950 to-black p-4 shadow-[0_0_60px_-10px_rgba(168,85,247,0.5)]">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 p-1.5 shadow-[0_0_20px_rgba(168,85,247,0.6)]">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-base font-extrabold tracking-tight text-white">K.O.</p>
              <p className="text-[10px] text-zinc-400">Send your viewers off to other live shows</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button>
        </div>

        {/* Toggle */}
        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
          <div>
            <p className="text-xs font-bold text-white">Accept KickOut Requests</p>
            <p className="text-[10px] text-zinc-400">Other live hosts can request to receive your viewers</p>
          </div>
          <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="peer sr-only" />
          <span className="relative h-5 w-9 rounded-full bg-zinc-700 transition-colors peer-checked:bg-gradient-to-r peer-checked:from-purple-500 peer-checked:to-blue-500">
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${accept ? "left-[18px]" : "left-0.5"}`} />
          </span>
        </label>

        {/* Requests */}
        {accept && (
          <div className="mt-3">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">Incoming requests</p>
            {visibleRequests.length === 0 ? (
              <p className="rounded-lg bg-white/[0.02] px-3 py-2 text-[11px] text-zinc-500">No requests yet — they'll appear here in real time.</p>
            ) : (
              <div className="space-y-1.5">
                {visibleRequests.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] p-2">
                    <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-zinc-800">
                      {r.from_avatar_url ? <img src={r.from_avatar_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[11px] font-bold text-zinc-400">{r.from_username[0]?.toUpperCase()}</div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <p className="truncate text-xs font-bold text-white">@{r.from_username}</p>
                        <span className="flex items-center gap-0.5 rounded-full bg-red-500/20 px-1.5 py-0 text-[8px] font-bold text-red-400"><span className="h-1 w-1 rounded-full bg-red-400" />LIVE</span>
                      </div>
                      <p className="flex items-center gap-1 text-[10px] text-zinc-400"><Users className="h-2.5 w-2.5" />{r.from_viewer_count} viewers</p>
                    </div>
                    <button onClick={() => acceptRequest(r)} className="rounded-full bg-green-500/20 p-1.5 text-green-400 hover:bg-green-500/30"><Check className="h-3.5 w-3.5" /></button>
                    <button onClick={() => declineRequest(r)} className="rounded-full bg-white/5 p-1.5 text-zinc-400 hover:bg-red-500/20 hover:text-red-400"><XIcon className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Selected destinations */}
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Destinations</p>
            <p className="text-[10px] text-zinc-500">{dests.length}/{MAX_DESTS}</p>
          </div>
          {dests.length === 0 ? (
            <p className="rounded-lg bg-white/[0.02] px-3 py-2 text-[11px] text-zinc-500">Pick up to 3 live hosts below.</p>
          ) : (
            <div className="space-y-1.5">
              {dests.map((d) => (
                <div key={d.stream_id} className="flex items-center gap-2 rounded-xl border border-purple-500/20 bg-gradient-to-r from-purple-500/10 to-blue-500/10 p-2">
                  <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-zinc-800">
                    {d.avatar_url ? <img src={d.avatar_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-zinc-400">{d.username[0]?.toUpperCase()}</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-white">@{d.username}</p>
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-red-500/20 px-1.5 py-0 text-[8px] font-bold text-red-400"><span className="h-1 w-1 rounded-full bg-red-400" />LIVE</span>
                  </div>
                  <button onClick={() => removeDest(d.stream_id)} className="rounded-full p-1.5 text-zinc-400 hover:bg-red-500/20 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Search */}
        {dests.length < MAX_DESTS && (
          <div className="mt-3">
            <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
              <Search className="h-3.5 w-3.5 text-zinc-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search live hosts..."
                className="flex-1 bg-transparent text-xs text-white outline-none placeholder:text-zinc-500"
              />
            </div>
            {results.length > 0 && (
              <div className="mt-1.5 max-h-44 space-y-1 overflow-y-auto rounded-xl border border-white/5 bg-black/40 p-1">
                {results.filter((r) => !dests.some((d) => d.stream_id === r.id)).map((r) => (
                  <button key={r.id} onClick={() => r.profile && addDest({ stream_id: r.id, seller_id: r.seller_id, username: r.profile.username, avatar_url: r.profile.avatar_url })}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/5">
                    <div className="h-7 w-7 flex-shrink-0 overflow-hidden rounded-full bg-zinc-800">
                      {r.profile?.avatar_url ? <img src={r.profile.avatar_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-zinc-400">{r.profile?.username?.[0]?.toUpperCase()}</div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-white">@{r.profile?.username || "host"}</p>
                      <p className="truncate text-[10px] text-zinc-400">{r.title}</p>
                    </div>
                    <span className="flex items-center gap-0.5 rounded-full bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold text-red-400"><Radio className="h-2 w-2" />LIVE</span>
                    <span className="flex items-center gap-0.5 text-[10px] text-zinc-400"><Users className="h-2.5 w-2.5" />{r.viewers}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Message */}
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">Goodbye message</p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX_MSG))}
            placeholder="Send your viewers off with a message..."
            rows={2}
            className="w-full resize-none rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none placeholder:text-zinc-500"
          />
          <p className="text-right text-[10px] text-zinc-500">{message.length}/{MAX_MSG}</p>
        </div>

        {/* Submit */}
        <button
          onClick={confirmKickout}
          disabled={submitting || dests.length === 0}
          className="relative mt-3 w-full overflow-hidden rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-600 to-blue-600 py-3.5 text-sm font-extrabold uppercase tracking-wider text-white shadow-[0_0_30px_rgba(168,85,247,0.55)] transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          <span className="relative z-10 flex items-center justify-center gap-2"><Zap className="h-4 w-4" /> KICK OUT</span>
        </button>
        <p className="mt-1.5 text-center text-[10px] text-zinc-500">Your stream ends automatically after viewers transfer.</p>
      </div>
    </div>
  );
}
