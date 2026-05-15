import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { claimDailyLogin } from "@/lib/progression";
import { Flame, X, Sparkles } from "lucide-react";

const LS_KEY = "pb.dailyLogin.lastShown";

/**
 * DailyLoginRewardModal — fires once per calendar day per user when signed in.
 * Calls the claim_daily_login RPC, shows streak + XP awarded.
 * Idempotent on the server: re-opening on the same day shows already_claimed=true
 * and we silently skip rendering.
 */
export function DailyLoginRewardModal() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [streak, setStreak] = useState(0);
  const [xp, setXp] = useState(0);

  useEffect(() => {
    if (!user) return;
    const today = new Date().toISOString().slice(0, 10);
    const last = typeof window !== "undefined" ? window.localStorage.getItem(LS_KEY) : today;
    if (last === today) return;
    let cancelled = false;
    (async () => {
      const res = await claimDailyLogin();
      if (cancelled || !res) return;
      try { window.localStorage.setItem(LS_KEY, today); } catch {}
      if (res.already_claimed) return;
      setStreak(res.streak);
      setXp(res.xp_awarded);
      setOpen(true);
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 animate-fade-in" onClick={() => setOpen(false)}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 via-orange-500 to-fuchsia-600 p-6 text-center text-white shadow-2xl ring-2 ring-white/30 animate-scale-in"
        role="dialog"
        aria-labelledby="daily-reward-title"
      >
        <button onClick={() => setOpen(false)} aria-label="Close" className="absolute right-3 top-3 rounded-full bg-black/30 p-1.5 text-white">
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-white/20 ring-2 ring-white/40">
          <Flame className="h-8 w-8 animate-pulse" />
        </div>
        <p className="text-[11px] font-bold uppercase tracking-widest opacity-90">Daily Login Reward</p>
        <h2 id="daily-reward-title" className="mt-1 text-3xl font-extrabold">{streak}-day streak!</h2>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-black/30 px-4 py-2 text-lg font-extrabold">
          <Sparkles className="h-4 w-4" /> +{xp} XP
        </p>
        <p className="mt-3 text-xs opacity-90">Come back tomorrow to keep the streak alive 🔥</p>
        <button
          onClick={() => setOpen(false)}
          className="mt-4 w-full rounded-full bg-white py-2.5 text-sm font-extrabold text-orange-600 shadow active:scale-95"
        >
          Let's go
        </button>
      </div>
    </div>
  );
}
