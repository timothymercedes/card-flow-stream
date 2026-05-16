import { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Users2, Check, X, PhoneIncoming } from "lucide-react";
import { toast } from "sonner";

type Invite = {
  id: string;
  stream_id: string;
  host_username: string;
  invitee_id: string;
  status: string;
  created_at: string;
};

/**
 * Floating "incoming-call" style banner shown to a user when they have a
 * pending collab invite on any stream.
 *
 *  - Accept → mark invite accepted (triggers DB → stream_collab_participants),
 *    then navigate to the live page UNLESS the user is already on that
 *    live page (in which case we just toast — the page reactively flips
 *    `isCohostParticipant` and shows the camera CTA).
 *  - Decline → mark invite declined.
 */
export function CollabInviteBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) { setInvites([]); return; }
    const { data } = await supabase
      .from("stream_collab_invites")
      .select("id, stream_id, host_username, invitee_id, status, created_at")
      .eq("invitee_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5);
    setInvites((data as any) || []);
  }, [user?.id]);

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel(`my-collab-invites-${user.id}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "stream_collab_invites", filter: `invitee_id=eq.${user.id}` } as any,
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, load]);

  async function accept(inv: Invite) {
    setBusyId(inv.id);
    const { error } = await supabase
      .from("stream_collab_invites")
      .update({ status: "accepted" })
      .eq("id", inv.id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    // Remove from the list immediately so the modal closes.
    setInvites((prev) => prev.filter((i) => i.id !== inv.id));
    const alreadyOnLive = location.pathname === `/live/${inv.stream_id}`;
    if (alreadyOnLive) {
      toast.success("You're on as co-host — tap the camera button to go live");
    } else {
      toast.success(`Joining @${inv.host_username}'s live as co-host`);
      navigate({ to: "/live/$id", params: { id: inv.stream_id } });
    }
  }

  async function decline(inv: Invite) {
    setBusyId(inv.id);
    const { error } = await supabase
      .from("stream_collab_invites")
      .update({ status: "declined" })
      .eq("id", inv.id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    setInvites((prev) => prev.filter((i) => i.id !== inv.id));
  }

  if (!user || invites.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[80] mx-auto flex max-w-md flex-col gap-3 px-3">
      {invites.map((inv) => (
        <div
          key={inv.id}
          className="pointer-events-auto relative overflow-hidden rounded-3xl bg-gradient-to-br from-fuchsia-600 via-violet-600 to-indigo-600 p-4 text-white shadow-[0_20px_60px_-15px_rgba(168,85,247,0.7)] ring-2 ring-white/30 backdrop-blur"
        >
          {/* Pulsing ring "ringing" effect */}
          <span className="pointer-events-none absolute inset-0 animate-ping rounded-3xl ring-2 ring-white/40" />
          <div className="relative flex items-center gap-3">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/25 ring-2 ring-white/40">
              <PhoneIncoming className="h-5 w-5 animate-pulse" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/80">
                Incoming co-host invite
              </p>
              <p className="truncate text-sm font-extrabold">@{inv.host_username}</p>
              <p className="truncate text-[11px] text-white/85">
                wants you to join their live as a co-host
              </p>
            </div>
          </div>
          <div className="relative mt-3 flex items-center gap-2">
            <button
              onClick={() => decline(inv)}
              disabled={busyId === inv.id}
              aria-label="Decline collab invite"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-white/15 px-3 py-2.5 text-xs font-extrabold ring-1 ring-white/25 hover:bg-white/25 disabled:opacity-50"
            >
              <X className="h-4 w-4" /> Decline
            </button>
            <button
              onClick={() => accept(inv)}
              disabled={busyId === inv.id}
              aria-label="Accept collab invite"
              className="flex flex-[1.4] items-center justify-center gap-1.5 rounded-full bg-emerald-400 px-3 py-2.5 text-xs font-extrabold text-emerald-950 shadow-lg hover:bg-emerald-300 disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> Accept & go on camera
            </button>
          </div>
          <div className="relative mt-2 flex items-center justify-center gap-1 text-[10px] font-semibold text-white/70">
            <Users2 className="h-3 w-3" /> You can accept without leaving this stream
          </div>
        </div>
      ))}
    </div>
  );
}
