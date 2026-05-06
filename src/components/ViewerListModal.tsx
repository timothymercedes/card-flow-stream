import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Search, Users, BadgeCheck, Shield, UserPlus } from "lucide-react";
import type { PresenceUser } from "@/hooks/useStreamPresence";

type Enrich = { id: string; live_verified: boolean };

function fmtWatching(joinedAtMs: number) {
  const s = Math.max(0, Math.floor((Date.now() - joinedAtMs) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function ViewerListModal({
  streamId, hostId, hostUsername, currentUserId, isHost, modIds, onClose,
}: {
  streamId: string;
  hostId: string;
  hostUsername: string;
  currentUserId: string | null;
  isHost: boolean;
  modIds: Set<string>;
  onClose: () => void;
}) {
  const [viewers, setViewers] = useState<(PresenceUser & { joined_at_ms: number })[]>([]);
  const [verifiedMap, setVerifiedMap] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const [, setTick] = useState(0);

  // Local clock for watching-duration label
  useEffect(() => {
    const i = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(i);
  }, []);

  // Load + realtime presence
  useEffect(() => {
    let cancelled = false;
    const joinedSeen = new Map<string, number>();

    async function load() {
      const cutoff = new Date(Date.now() - 60_000).toISOString();
      const { data } = await supabase
        .from("live_stream_presence")
        .select("*")
        .eq("stream_id", streamId)
        .gte("last_seen_at", cutoff);
      if (cancelled) return;
      const rows = (data || []) as PresenceUser[];
      const enriched = rows.map((r) => {
        if (!joinedSeen.has(r.user_id)) joinedSeen.set(r.user_id, Date.now());
        return { ...r, joined_at_ms: joinedSeen.get(r.user_id)! };
      });
      setViewers(enriched);

      // Fetch verified flags for unknown users
      const ids = rows.map((r) => r.user_id).filter((id) => !(id in verifiedMap));
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, live_verified").in("id", ids);
        if (cancelled || !profs) return;
        setVerifiedMap((m) => {
          const next = { ...m };
          (profs as Enrich[]).forEach((p) => { next[p.id] = !!p.live_verified; });
          return next;
        });
      }
    }
    load();
    const ch = supabase.channel(`viewer-list-${streamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_stream_presence", filter: `stream_id=eq.${streamId}` }, load)
      .subscribe();
    const refresh = setInterval(load, 25_000);
    return () => { cancelled = true; supabase.removeChannel(ch); clearInterval(refresh); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const list = ql ? viewers.filter((v) => v.username.toLowerCase().includes(ql)) : viewers;
    return list.slice().sort((a, b) => a.username.localeCompare(b.username));
  }, [viewers, q]);

  async function inviteToCollab(v: PresenceUser) {
    if (!isHost || !currentUserId) return;
    if (v.user_id === hostId) return toast.error("That's you");
    if (!verifiedMap[v.user_id]) return toast.error(`@${v.username} isn't verified`);
    const { error } = await supabase.from("stream_collab_invites").insert({
      stream_id: streamId, host_id: hostId, host_username: hostUsername,
      invitee_id: v.user_id, invitee_username: v.username,
    });
    if (error) {
      if (/duplicate|unique/i.test(error.message)) return toast.error(`Already invited @${v.username}`);
      if (/verified/i.test(error.message)) return toast.error("Only verified users can collab");
      return toast.error(error.message);
    }
    await supabase.from("notifications").insert({
      user_id: v.user_id, type: "collab_invite",
      body: `🤝 @${hostUsername} invited you to collab on their live`,
      link: `/live/${streamId}`,
    });
    toast.success(`Invite sent to @${v.username}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-sm flex-col rounded-2xl bg-card text-foreground shadow-2xl animate-in slide-in-from-bottom-4 duration-200"
        style={{ maxHeight: "80vh" }}
      >
        <div className="flex items-center justify-between border-b border-border p-3">
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <Users className="h-4 w-4 text-primary" /> Viewers · {viewers.length}
          </p>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>

        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search viewers"
              className="w-full rounded-lg bg-input py-2 pl-7 pr-2 text-xs outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-[11px] text-muted-foreground">
              {viewers.length === 0 ? "No viewers yet." : "No matches."}
            </p>
          )}
          <div className="space-y-1">
            {filtered.map((v) => {
              const isHostRow = v.user_id === hostId;
              const isMod = modIds.has(v.user_id);
              const verified = !!verifiedMap[v.user_id];
              return (
                <div key={v.user_id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted">
                  {v.avatar_url
                    ? <img src={v.avatar_url} className="h-7 w-7 shrink-0 rounded-full object-cover" alt="" />
                    : <div className="h-7 w-7 shrink-0 rounded-full bg-primary/30" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="truncate font-semibold">@{v.username}</span>
                      {isHostRow && <span className="rounded bg-live px-1 text-[8px] font-bold uppercase text-live-foreground">Host</span>}
                      {!isHostRow && isMod && <Shield className="h-3 w-3 text-primary" aria-label="Moderator" />}
                      {verified && <BadgeCheck className="h-3 w-3 text-primary" aria-label="Verified" />}
                    </div>
                    <p className="text-[10px] text-muted-foreground">Watching · {fmtWatching(v.joined_at_ms)}</p>
                  </div>
                  {isHost && !isHostRow && (
                    <button
                      onClick={() => inviteToCollab(v)}
                      disabled={!verified}
                      className="flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground disabled:opacity-50"
                      title={verified ? "Invite to collab" : "Not verified"}
                    >
                      <UserPlus className="h-3 w-3" /> Collab
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
