import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Search, UserPlus, Check, Trash2, Mic, MicOff, BadgeCheck, Users2, RotateCcw, XCircle } from "lucide-react";
import { useRealtimeChannel } from "@/lib/realtime";

type Profile = { id: string; username: string; avatar_url: string | null; age_verified?: boolean };
type Participant = { id: string; user_id: string; username: string; avatar_url: string | null; is_muted: boolean };
type Invite = { id: string; invitee_id: string; invitee_username: string; status: string; created_at: string };
type JoinReq = { id: string; requester_id: string; requester_username: string; requester_avatar_url: string | null; status: string; created_at: string };

export function CollabPanel({
  streamId, hostId, hostUsername, currentUserId, isHost, allowRequests, onClose, maxParticipants = 4,
}: {
  streamId: string;
  hostId: string;
  hostUsername: string;
  currentUserId: string | null;
  isHost: boolean;
  allowRequests: boolean;
  onClose: () => void;
  maxParticipants?: number;
}) {
  const [tab, setTab] = useState<"invite" | "requests" | "participants">(isHost ? "invite" : "participants");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [joinReqs, setJoinReqs] = useState<JoinReq[]>([]);
  const [allow, setAllow] = useState<boolean>(allowRequests);
  const [myReqStatus, setMyReqStatus] = useState<string | null>(null);

  // Search profiles (verified only for invite UX)
  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await (supabase.rpc as any)("search_public_profiles", { _query: q, _limit: 10 });
      if (cancelled) return;
      const ids = (data || []).map((r: any) => r.id);
      if (ids.length === 0) { setResults([]); return; }
      const { data: verif } = await supabase.from("profiles").select("id, age_verified").in("id", ids);
      const map = new Map((verif || []).map((v: any) => [v.id, v.age_verified]));
      setResults((data || []).map((r: any) => ({ ...r, age_verified: !!map.get(r.id) })));
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  // Load lists + realtime
  const [reloadTick, setReloadTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [{ data: p }, { data: inv }, { data: jr }] = await Promise.all([
        supabase.from("stream_collab_participants").select("*").eq("stream_id", streamId).order("joined_at"),
        supabase.from("stream_collab_invites").select("*").eq("stream_id", streamId).order("created_at", { ascending: false }),
        supabase.from("stream_collab_join_requests").select("*").eq("stream_id", streamId).order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      setParticipants((p as any) || []);
      setInvites((inv as any) || []);
      setJoinReqs((jr as any) || []);
      if (currentUserId && !isHost) {
        const mine = (jr || []).find((r: any) => r.requester_id === currentUserId);
        setMyReqStatus(mine?.status || null);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [streamId, currentUserId, isHost, reloadTick]);
  useRealtimeChannel({ name: `collab-${streamId}` }, (ch) => ch
    .on("postgres_changes" as any, { event: "*", schema: "public", table: "stream_collab_participants", filter: `stream_id=eq.${streamId}` } as any, () => setReloadTick((n) => n + 1))
    .on("postgres_changes" as any, { event: "*", schema: "public", table: "stream_collab_invites", filter: `stream_id=eq.${streamId}` } as any, () => setReloadTick((n) => n + 1))
    .on("postgres_changes" as any, { event: "*", schema: "public", table: "stream_collab_join_requests", filter: `stream_id=eq.${streamId}` } as any, () => setReloadTick((n) => n + 1)));

  async function invite(u: Profile) {
    if (!u.age_verified) return toast.error(`@${u.username} isn't age-verified (18+) yet`);
    if (u.id === hostId) return toast.error("That's you");
    const { error } = await supabase.from("stream_collab_invites").insert({
      stream_id: streamId, host_id: hostId, host_username: hostUsername,
      invitee_id: u.id, invitee_username: u.username,
    });
    if (error) {
      if (/duplicate|unique/i.test(error.message)) return toast.error(`@${u.username} already has a pending invite`);
      if (/verified/i.test(error.message)) return toast.error("Only age-verified (18+) users can collab");
      return toast.error(error.message);
    }
    await supabase.from("notifications").insert({
      user_id: u.id, type: "collab_invite",
      body: `🤝 @${hostUsername} invited you to collab on their live`,
      link: `/live/${streamId}`,
    });
    toast.success(`Invite sent to @${u.username}`);
    setQ(""); setResults([]);
  }

  async function cancelInvite(inv: Invite) {
    const { error } = await supabase
      .from("stream_collab_invites")
      .delete()
      .eq("id", inv.id);
    if (error) return toast.error(error.message);
    toast.success(`Invite to @${inv.invitee_username} cancelled`);
  }

  async function reinvite(inv: Invite) {
    // Clear old row first so the unique constraint doesn't block re-sending.
    await supabase.from("stream_collab_invites").delete().eq("id", inv.id);
    const { error } = await supabase.from("stream_collab_invites").insert({
      stream_id: streamId, host_id: hostId, host_username: hostUsername,
      invitee_id: inv.invitee_id, invitee_username: inv.invitee_username,
    });
    if (error) {
      if (/verified/i.test(error.message)) return toast.error("Only age-verified (18+) users can collab");
      return toast.error(error.message);
    }
    await supabase.from("notifications").insert({
      user_id: inv.invitee_id, type: "collab_invite",
      body: `🤝 @${hostUsername} invited you to collab on their live`,
      link: `/live/${streamId}`,
    });
    toast.success(`Re-invited @${inv.invitee_username}`);
  }

  async function respondJoin(r: JoinReq, status: "accepted" | "declined") {
    const { error } = await supabase.from("stream_collab_join_requests")
      .update({ status }).eq("id", r.id);
    if (error) return toast.error(error.message);
    await supabase.from("notifications").insert({
      user_id: r.requester_id, type: "collab_response",
      body: status === "accepted"
        ? `✅ @${hostUsername} approved your collab request`
        : `❌ @${hostUsername} declined your collab request`,
      link: `/live/${streamId}`,
    });
  }

  async function requestJoin() {
    if (!currentUserId) return toast.error("Sign in first");
    const { data: prof } = await supabase.from("profiles").select("username, avatar_url").eq("id", currentUserId).single();
    if (!prof) return;
    const { error } = await supabase.from("stream_collab_join_requests").insert({
      stream_id: streamId, host_id: hostId,
      requester_id: currentUserId, requester_username: prof.username, requester_avatar_url: prof.avatar_url,
    });
    if (error) {
      if (/duplicate|unique/i.test(error.message)) return toast.error("You already have a request pending");
      if (/verified/i.test(error.message)) return toast.error("Only age-verified (18+) users can collab — verify your account first");
      return toast.error(error.message);
    }
    await supabase.from("notifications").insert({
      user_id: hostId, type: "collab_request",
      body: `🙋 @${prof.username} wants to collab on your live`,
      link: `/live/${streamId}`,
    });
    toast.success("Request sent");
    setMyReqStatus("pending");
  }

  async function toggleMute(p: Participant) {
    const { error } = await supabase.from("stream_collab_participants")
      .update({ is_muted: !p.is_muted }).eq("id", p.id);
    if (error) return toast.error(error.message);
  }

  async function removeParticipant(p: Participant) {
    if (!confirm(`Remove @${p.username} from collab?`)) return;
    await supabase.from("stream_collab_participants").delete().eq("id", p.id);
    await supabase.from("stream_moderators").delete().eq("stream_id", streamId).eq("mod_user_id", p.user_id);
  }

  async function toggleAllowRequests() {
    const next = !allow;
    setAllow(next);
    const { error } = await supabase.from("live_streams").update({ allow_collab_requests: next }).eq("id", streamId);
    if (error) { setAllow(allow); toast.error(error.message); }
    else toast.success(next ? "Requests open" : "Requests closed");
  }

  const pendingReqs = joinReqs.filter((r) => r.status === "pending");
  const MAX = maxParticipants;
  const atMax = participants.length >= MAX;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-sm flex-col rounded-2xl bg-card text-foreground shadow-2xl" style={{ maxHeight: "85vh" }}>
        <div className="flex items-center justify-between border-b border-border p-3">
          <p className="flex items-center gap-1.5 text-sm font-bold"><Users2 className="h-4 w-4 text-primary" /> Collab</p>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border text-xs">
          {isHost && (
            <button onClick={() => setTab("invite")} className={`flex-1 py-2 font-bold ${tab === "invite" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>
              Invite
            </button>
          )}
          {isHost && (
            <button onClick={() => setTab("requests")} className={`relative flex-1 py-2 font-bold ${tab === "requests" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>
              Requests {pendingReqs.length > 0 && <span className="ml-1 rounded-full bg-live px-1.5 text-[10px] text-live-foreground">{pendingReqs.length}</span>}
            </button>
          )}
          <button onClick={() => setTab("participants")} className={`flex-1 py-2 font-bold ${tab === "participants" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>
            Live ({participants.length}/{MAX})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {/* INVITE TAB */}
          {isHost && tab === "invite" && (
            <div className="space-y-3">
              <label className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 p-2 text-xs">
                <span className="font-semibold">Allow viewers to request to join</span>
                <input type="checkbox" checked={allow} onChange={toggleAllowRequests} className="h-4 w-4" />
              </label>

              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search users or sellers by username"
                  className="w-full rounded-lg bg-input py-2 pl-7 pr-2 text-xs outline-none"
                />
              </div>

              {atMax && <p className="text-[11px] text-amber-500">Max {MAX} co-hosts already in stream.</p>}

              {results.length > 0 && (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
                  {results.map((u) => {
                    const already = participants.some((p) => p.user_id === u.id);
                    const invited = invites.some((i) => i.invitee_id === u.id && i.status === "pending");
                    return (
                      <div key={u.id} className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs hover:bg-muted">
                        <div className="flex min-w-0 items-center gap-2">
                          {u.avatar_url ? <img src={u.avatar_url} className="h-6 w-6 rounded-full object-cover" alt="" /> : <div className="h-6 w-6 rounded-full bg-muted-foreground/30" />}
                          <span className="truncate">@{u.username}</span>
                          {u.age_verified && <BadgeCheck className="h-3 w-3 text-primary" />}
                        </div>
                        <button
                          disabled={already || invited || atMax || !u.age_verified}
                          onClick={() => invite(u)}
                          className="flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground disabled:opacity-50"
                          title={!u.age_verified ? "Not verified" : ""}
                        >
                          <UserPlus className="h-3 w-3" /> {already ? "In" : invited ? "Sent" : "Invite"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {invites.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Invites</p>
                  <div className="space-y-1">
                    {invites.map((i) => {
                      const isPending = i.status === "pending";
                      const isAccepted = i.status === "accepted";
                      // If already in participants table, the participant row owns "End collab".
                      const alreadyInCall = participants.some((p) => p.user_id === i.invitee_id);
                      return (
                        <div key={i.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2 py-1.5 text-xs">
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate font-semibold">@{i.invitee_username}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {isPending ? "Pending…" : isAccepted ? (alreadyInCall ? "In call" : "Accepted") : i.status}
                            </span>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            {isPending && (
                              <button
                                onClick={() => cancelInvite(i)}
                                className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[10px] font-bold"
                                title="Cancel invite"
                              >
                                <XCircle className="h-3 w-3" /> End invite
                              </button>
                            )}
                            {!isPending && !alreadyInCall && (
                              <button
                                onClick={() => reinvite(i)}
                                className="flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground"
                                title="Send a new invite"
                              >
                                <RotateCcw className="h-3 w-3" /> Reinvite
                              </button>
                            )}
                            {alreadyInCall && (
                              <button
                                onClick={() => {
                                  const p = participants.find((pp) => pp.user_id === i.invitee_id);
                                  if (p) removeParticipant(p);
                                }}
                                className="flex items-center gap-1 rounded-full bg-destructive px-2 py-1 text-[10px] font-bold text-destructive-foreground"
                                title="End collab"
                              >
                                <Trash2 className="h-3 w-3" /> End collab
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* REQUESTS TAB */}
          {isHost && tab === "requests" && (
            <div className="space-y-2">
              {pendingReqs.length === 0 && <p className="py-6 text-center text-[11px] text-muted-foreground">No pending requests.</p>}
              {pendingReqs.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2 py-2 text-xs">
                  <div className="flex min-w-0 items-center gap-2">
                    {r.requester_avatar_url ? <img src={r.requester_avatar_url} className="h-7 w-7 rounded-full object-cover" alt="" /> : <div className="h-7 w-7 rounded-full bg-muted-foreground/30" />}
                    <span className="truncate font-semibold">@{r.requester_username}</span>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => respondJoin(r, "accepted")} disabled={atMax} className="rounded-full bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground disabled:opacity-50">
                      <Check className="inline h-3 w-3" /> Approve
                    </button>
                    <button onClick={() => respondJoin(r, "declined")} className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold">
                      Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* PARTICIPANTS TAB */}
          {tab === "participants" && (
            <div className="space-y-2">
              {participants.length === 0 && <p className="py-6 text-center text-[11px] text-muted-foreground">No co-hosts yet.</p>}
              {participants.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2 py-2 text-xs">
                  <div className="flex min-w-0 items-center gap-2">
                    {p.avatar_url ? <img src={p.avatar_url} className="h-7 w-7 rounded-full object-cover" alt="" /> : <div className="h-7 w-7 rounded-full bg-muted-foreground/30" />}
                    <span className="truncate font-semibold">@{p.username}</span>
                    {p.is_muted && <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-500">muted</span>}
                  </div>
                  {isHost && (
                    <div className="flex shrink-0 gap-1">
                      <button onClick={() => toggleMute(p)} className="rounded-full bg-muted p-1.5" title={p.is_muted ? "Unmute" : "Mute"}>
                        {p.is_muted ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                      </button>
                      <button onClick={() => removeParticipant(p)} className="rounded-full bg-destructive/80 p-1.5 text-destructive-foreground" title="End collab">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {/* Viewer request-to-join CTA */}
              {!isHost && currentUserId && (
                <div className="mt-3 rounded-lg border border-border p-2">
                  {!allow ? (
                    <p className="text-center text-[11px] text-muted-foreground">Host hasn't opened collab requests.</p>
                  ) : myReqStatus === "pending" ? (
                    <p className="text-center text-[11px] font-semibold text-primary">⏳ Request pending — host will review.</p>
                  ) : myReqStatus === "accepted" ? (
                    <p className="text-center text-[11px] font-semibold text-primary">✅ You're approved!</p>
                  ) : myReqStatus === "declined" ? (
                    <p className="text-center text-[11px] text-muted-foreground">Your last request was declined.</p>
                  ) : (
                    <button onClick={requestJoin} className="w-full rounded-full bg-primary py-2 text-xs font-bold text-primary-foreground">
                      🙋 Request to collab
                    </button>
                  )}
                  <p className="mt-1 text-center text-[10px] text-muted-foreground">Verified users only.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
