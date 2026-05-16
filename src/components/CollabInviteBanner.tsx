import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Users2, Check, X } from "lucide-react";
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
 * Floating banner shown to a user when they have a pending collab invite
 * on any stream. Accept → triggers DB insert into stream_collab_participants
 * (handled by collab_invite_apply_accept_trg) and navigates to the live page.
 * Decline → marks invite status='declined'.
 */
export function CollabInviteBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
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
    toast.success(`Joining @${inv.host_username}'s live as co-host`);
    navigate({ to: "/live/$id", params: { id: inv.stream_id } });
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
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[60] mx-auto flex max-w-md flex-col gap-2 px-3">
      {invites.map((inv) => (
        <div
          key={inv.id}
          className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-600 to-violet-600 p-3 text-white shadow-2xl ring-1 ring-white/20 backdrop-blur"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
            <Users2 className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold">@{inv.host_username} invited you to collab</p>
            <p className="truncate text-[10px] text-white/80">Join their live as a co-host</p>
          </div>
          <button
            onClick={() => decline(inv)}
            disabled={busyId === inv.id}
            aria-label="Decline collab invite"
            className="rounded-full bg-white/15 p-2 hover:bg-white/25 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            onClick={() => accept(inv)}
            disabled={busyId === inv.id}
            aria-label="Accept collab invite"
            className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-fuchsia-700 hover:bg-white/90 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" /> Accept
          </button>
        </div>
      ))}
    </div>
  );
}
