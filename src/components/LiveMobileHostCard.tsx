/**
 * LiveMobileHostCard — compact, mobile-first host card for the /live route.
 * Shows avatar + handle + shop, follow button, and trust badges.
 * Designed to live inside the pinned title overlay so buyers always know WHO
 * is hosting and can follow / open the store in one tap.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BadgeCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FollowButton } from "@/components/FollowButton";
import { SellerTrustBadges } from "@/components/SellerTrustBadges";

type Profile = {
  username: string | null;
  avatar_url: string | null;
  shop_name: string | null;
};

const profileCache = new Map<string, Profile>();
const verifiedCache = new Map<string, boolean>();

export function LiveMobileHostCard({
  sellerId,
  showTrustBadges = false,
}: {
  sellerId: string | null | undefined;
  showTrustBadges?: boolean;
}) {
  const [p, setP] = useState<Profile | null>(
    sellerId ? (profileCache.get(sellerId) ?? null) : null,
  );
  const [verified, setVerified] = useState<boolean>(
    sellerId ? (verifiedCache.get(sellerId) ?? false) : false,
  );

  useEffect(() => {
    if (!sellerId) return;
    let cancelled = false;
    (async () => {
      if (!profileCache.has(sellerId)) {
        const { data } = await supabase
          .from("profiles")
          .select("username, avatar_url, shop_name")
          .eq("id", sellerId)
          .maybeSingle();
        if (data && !cancelled) {
          profileCache.set(sellerId, data as Profile);
          setP(data as Profile);
        }
      }
      if (!verifiedCache.has(sellerId)) {
        const { data: v } = await (supabase.rpc as any)("is_seller_verified", {
          _user_id: sellerId,
        });
        const isV = !!v;
        verifiedCache.set(sellerId, isV);
        if (!cancelled) setVerified(isV);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  if (!sellerId || !p?.username) {
    return null;
  }

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
            {verified && (
              <BadgeCheck
                className="h-3.5 w-3.5 shrink-0 text-sky-300"
                aria-label="Verified seller"
              />
            )}
          </div>
          {p.shop_name && (
            <div className="truncate text-[10px] leading-tight text-white/70">
              @{p.username}
            </div>
          )}
        </div>
      </Link>
      {showTrustBadges && <SellerTrustBadges sellerId={sellerId} compact />}
      <FollowButton userId={sellerId} size="sm" className="ml-auto shrink-0" />
    </div>
  );
}
