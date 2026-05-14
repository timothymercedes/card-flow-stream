/**
 * BookmarkButton — guest-friendly "save + notify me" toggle for scheduled shows.
 *
 * Guests see the button; tapping pops the AuthGateModal instead of erroring.
 * Logged-in users toggle a row in `show_bookmarks` and pick how they want to
 * be reminded (push, in-app bell, email) via a tiny popover.
 */
import { useEffect, useRef, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAuthGate } from "@/hooks/useAuthGate";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function BookmarkButton({ showId, compact = false }: { showId: string; compact?: boolean }) {
  const { user } = useAuth();
  const { requireAuth } = useAuthGate();
  const [bookmarked, setBookmarked] = useState(false);
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState({ notify_push: true, notify_inapp: true, notify_email: false });
  const [busy, setBusy] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) { setBookmarked(false); return; }
    supabase
      .from("show_bookmarks" as any)
      .select("notify_push, notify_inapp, notify_email")
      .eq("user_id", user.id).eq("show_id", showId).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setBookmarked(true);
          setPrefs({
            notify_push: (data as any).notify_push,
            notify_inapp: (data as any).notify_inapp,
            notify_email: (data as any).notify_email,
          });
        }
      });
  }, [user, showId]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function toggle() {
    if (!requireAuth("bookmark this show")) return;
    setBusy(true);
    if (bookmarked) {
      await supabase.from("show_bookmarks" as any).delete().eq("user_id", user!.id).eq("show_id", showId);
      setBookmarked(false);
      toast.success("Bookmark removed");
    } else {
      const { error } = await supabase.from("show_bookmarks" as any).insert({ user_id: user!.id, show_id: showId, ...prefs });
      if (error) { toast.error(error.message); }
      else { setBookmarked(true); toast.success("Bookmarked — we'll ping you when it goes live"); }
    }
    setBusy(false);
  }

  async function savePrefs(next: typeof prefs) {
    setPrefs(next);
    if (!bookmarked || !user) return;
    await supabase.from("show_bookmarks" as any).update(next).eq("user_id", user.id).eq("show_id", showId);
  }

  const Icon = bookmarked ? BellRing : Bell;
  return (
    <div className="relative inline-flex">
      <button
        onClick={toggle}
        disabled={busy}
        title={bookmarked ? "Bookmarked — tap to remove" : "Bookmark + notify me"}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ring-1 ring-border transition ${
          bookmarked ? "bg-primary/15 text-primary" : "bg-card text-muted-foreground hover:text-foreground"
        } ${compact ? "" : "px-3 py-1.5 text-xs"}`}
      >
        <Icon className="h-3.5 w-3.5" />
        {compact ? null : <span>{bookmarked ? "Saved" : "Notify me"}</span>}
      </button>
      {bookmarked && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="ml-1 rounded-full p-1 text-muted-foreground hover:text-foreground"
          title="Notification settings"
          aria-label="Notification settings"
        >
          <span className="text-[10px]">⚙️</span>
        </button>
      )}
      {open && (
        <div ref={popRef} className="absolute right-0 top-full z-50 mt-1 w-56 space-y-2 rounded-xl border border-border bg-card p-3 text-xs shadow-lg">
          <p className="font-bold">How should we ping you?</p>
          {[
            { k: "notify_push" as const, l: "Web push" },
            { k: "notify_inapp" as const, l: "In-app bell" },
            { k: "notify_email" as const, l: "Email" },
          ].map((row) => (
            <label key={row.k} className="flex items-center justify-between gap-2">
              <span>{row.l}</span>
              <input
                type="checkbox"
                checked={prefs[row.k]}
                onChange={(e) => savePrefs({ ...prefs, [row.k]: e.target.checked })}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
