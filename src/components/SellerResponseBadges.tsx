/**
 * SellerResponseBadges — small "Responds Fast", "Active Seller", "Top Rated" chips
 * powered by get_seller_response_badges.
 */
import { useEffect, useState } from "react";
import { Clock, Activity, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Badge = { badge: string; label: string; tier: string };

const ICON: Record<string, any> = {
  responds_fast: Clock,
  active_seller: Activity,
  top_rated: Star,
};

const TIER_CLS: Record<string, string> = {
  platinum: "bg-gradient-to-r from-cyan-400/20 to-fuchsia-400/20 text-cyan-300 ring-cyan-400/30",
  gold: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
  silver: "bg-slate-400/15 text-slate-200 ring-slate-300/30",
};

export function SellerResponseBadges({ sellerId, compact = false }: { sellerId: string; compact?: boolean }) {
  const [badges, setBadges] = useState<Badge[]>([]);

  useEffect(() => {
    if (!sellerId) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase.rpc as any)("get_seller_response_badges", { _seller_id: sellerId });
      if (!cancelled) setBadges(Array.isArray(data) ? data : []);
    })();
    return () => { cancelled = true; };
  }, [sellerId]);

  if (!badges.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1 ${compact ? "" : "mt-1"}`}>
      {badges.map((b) => {
        const Icon = ICON[b.badge] || Star;
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
