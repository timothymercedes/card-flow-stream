/**
 * LiveMobileHostCard — compact, mobile-first host card for the /live route.
 * Shows avatar + handle + shop, follow button, verification + trust badges,
 * and (optionally) a rating chip. Designed to live inside the pinned title
 * overlay so buyers always know WHO is hosting and can follow in one tap.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FollowButton } from "@/components/FollowButton";
import { SellerTrustBadges } from "@/components/SellerTrustBadges";

type Profile = {
  username: string | null;
  avatar_url: string | null;
  shop_name: string | null;
  rating_avg?: number | null;
  rating_count?: number | null;
  is_verified_seller?: boolean | null;
};

const cache = new Map<string, Profile>();

export function LiveMobileHostCard({
  sellerId,
  compact = true,
}: {
  sellerId: string | null | undefined;
  compact?: boolean;
}) {
  const [p, setP] = useState<Profile | null>(sellerId ? (cache.get(sellerId) ?? null) : null);

  useEffect(() => {
    if (!sellerId || cache.has(sellerId)) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("username, avatar_url, shop_name, rating_avg, rating_count, is_verified_seller")
        .eq("id", sellerId)
        .maybeSingle();
      if (cancelled || !data) return;
      cache.set(sellerId, data as Profile);
      setP(data as Profile);
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  if (!sellerId || !p?.username) {
    return null;
  }

  const rating = Number(p.rating_avg || 0);
  const ratingCount = Number(p.rating_count || 0);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Link
        to="/seller/$username"
        params={{ username: p.username }}
        className="flex min-w-0 items-center gap-2"
        aria-label={`Open ${p.shop_name || `@${p.username}`}`}
      >
        {p.avatar_url ? (
          <img
            src={p.avatar_url}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-white/20"
            loading="lazy"
          />
        ) : (
          <div className="h-8 w-8 shrink-0 rounded-full bg-white/15 ring-1 ring-white/20" />
        )}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1">
            <span className="truncate text-xs font-extrabold leading-tight text-white">
              {p.shop_name || `@${p.username}`}
            </span>
            {p.is_verified_seller && (
              <BadgeCheck
                className="h-3.5 w-3.5 shrink-0 text-sky-300"
                aria-label="Verified seller"
              />
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] leading-tight text-white/70">
            {p.shop_name && <span className="truncate">@{p.username}</span>}
            {ratingCount > 0 && (
              <span className="inline-flex items-center gap-0.5 tabular-nums text-amber-300">
                <Star className="h-2.5 w-2.5 fill-current" />
                {rating.toFixed(1)}
                <span className="text-white/50">({ratingCount})</span>
              </span>
            )}
          </div>
        </div>
      </Link>
      {!compact && <SellerTrustBadges sellerId={sellerId} compact />}
      <FollowButton userId={sellerId} size="sm" className="ml-auto shrink-0" />
    </div>
  );
}
