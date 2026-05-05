import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MoreVertical, Ban, UserX, Undo2 } from "lucide-react";

type Props = {
  targetUserId: string;
  targetUsername: string;
  meId: string | null;
  isStreamStaff?: boolean; // host or mod of current stream → can ban from stream
  streamId?: string | null;
  onChanged?: () => void;
};

/** Tiny menu: Block (personal mute) + Ban from this live (host/mod only). */
export function UserActionsMenu({ targetUserId, targetUsername, meId, isStreamStaff, streamId, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [banned, setBanned] = useState(false);

  useEffect(() => {
    if (!open || !meId) return;
    let cancelled = false;
    (async () => {
      const { data: b } = await supabase.from("user_blocks").select("blocker_id")
        .eq("blocker_id", meId).eq("blocked_id", targetUserId).maybeSingle();
      if (!cancelled) setBlocked(!!b);
      if (streamId) {
        const { data: s } = await supabase.from("stream_user_bans").select("id")
          .eq("stream_id", streamId).eq("banned_user_id", targetUserId).maybeSingle();
        if (!cancelled) setBanned(!!s);
      }
    })();
    return () => { cancelled = true; };
  }, [open, meId, targetUserId, streamId]);

  if (!meId || meId === targetUserId) return null;

  async function block() {
    setBusy(true);
    const { error } = await supabase.from("user_blocks").insert({ blocker_id: meId!, blocked_id: targetUserId });
    setBusy(false);
    if (error) {
      if (error.message?.includes("Admins")) return toast.error("Admins cannot be blocked");
      if (error.code !== "23505") return toast.error(error.message);
    }
    setBlocked(true);
    toast.success(`Blocked @${targetUsername}`);
    setOpen(false);
    onChanged?.();
  }
  async function unblock() {
    setBusy(true);
    const { error } = await supabase.from("user_blocks").delete()
      .eq("blocker_id", meId!).eq("blocked_id", targetUserId);
    setBusy(false);
    if (error) return toast.error(error.message);
    setBlocked(false);
    toast.success(`Unblocked @${targetUsername}`);
    setOpen(false);
    onChanged?.();
  }
  async function ban() {
    if (!streamId) return;
    setBusy(true);
    const payload: any = { stream_id: streamId, banned_user_id: targetUserId, banned_by: meId };
    const { error } = await (supabase.from("stream_user_bans") as any).insert(payload);
    setBusy(false);
    if (error) {
      if (error.message?.includes("Admins")) return toast.error("Admins cannot be banned");
      if (error.code !== "23505") return toast.error(error.message);
    }
    setBanned(true);
    toast.success(`Banned @${targetUsername} from this live`);
    setOpen(false);
    onChanged?.();
  }
  async function unban() {
    if (!streamId) return;
    setBusy(true);
    const { error } = await supabase.from("stream_user_bans").delete()
      .eq("stream_id", streamId).eq("banned_user_id", targetUserId);
    setBusy(false);
    if (error) return toast.error(error.message);
    setBanned(false);
    toast.success(`Unbanned @${targetUsername}`);
    setOpen(false);
    onChanged?.();
  }

  return (
    <span className="relative inline-flex">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((s) => !s); }}
        className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-white/40 hover:text-white"
        aria-label={`Actions for @${targetUsername}`}
      >
        <MoreVertical className="h-3 w-3" />
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-5 z-50 min-w-[160px] rounded-lg border border-white/10 bg-card p-1 text-xs shadow-2xl">
            <button
              disabled={busy}
              onClick={blocked ? unblock : block}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-foreground hover:bg-muted"
            >
              {blocked ? <Undo2 className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
              {blocked ? `Unblock @${targetUsername}` : `Block @${targetUsername}`}
            </button>
            {isStreamStaff && streamId && (
              <button
                disabled={busy}
                onClick={banned ? unban : ban}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-rose-400 hover:bg-muted"
              >
                {banned ? <Undo2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                {banned ? "Unban from this live" : "Ban from this live"}
              </button>
            )}
          </div>
        </>
      )}
    </span>
  );
}
