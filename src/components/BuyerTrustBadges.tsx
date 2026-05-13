/**
 * BuyerTrustBadges — public buyer reputation badges
 * (trusted_buyer, fast_payer, verified_buyer, repeat_customer, auction_veteran, supportive_buyer).
 *
 * Only safe-to-expose positive signals are pulled from get_buyer_public_badges.
 * Negative signals (unpaid wins, restrictions) live in BuyerInsightsPanel and are
 * gated server-side to admins / sellers with an active order with the buyer.
 */
import { useEffect, useState } from "react";
import { ShieldCheck, Zap, BadgeCheck, Repeat, Trophy, Heart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Badge = { badge: string; label: string; tier: string };

const ICON: Record<string, any> = {
  trusted_buyer: ShieldCheck,
  fast_payer: Zap,
  verified_buyer: BadgeCheck,
  repeat_customer: Repeat,
  auction_veteran: Trophy,
  supportive_buyer: Heart,
};

const TIER_CLS: Record<string, string> = {
  platinum: "bg-gradient-to-r from-cyan-400/20 to-fuchsia-400/20 text-cyan-300 ring-cyan-400/30",
  gold: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
  silver: "bg-slate-400/15 text-slate-200 ring-slate-300/30",
};

export function BuyerTrustBadges({ userId, compact = false }: { userId: string; compact?: boolean }) {
  const [badges, setBadges] = useState<Badge[]>([]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase.rpc as any)("get_buyer_public_badges", { _user_id: userId });
      if (!cancelled) setBadges(Array.isArray(data) ? data : []);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  if (!badges.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1 ${compact ? "" : "mt-1"}`}>
      {badges.map((b) => {
        const Icon = ICON[b.badge] || BadgeCheck;
        return (
          <span
            key={b.badge}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${TIER_CLS[b.tier] || TIER_CLS.silver}`}
          >
            <Icon className="h-3 w-3" /> {b.label}
          </span>
        );
      })}
    </div>
  );
}
