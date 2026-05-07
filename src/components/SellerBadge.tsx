import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Store as StoreIcon } from "lucide-react";

type Props = {
  sellerId?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  shopName?: string | null;
  size?: "sm" | "md";
  linkable?: boolean;
  className?: string;
};

const cache = new Map<string, { username: string; avatar_url: string | null; shop_name: string | null }>();

/**
 * Trust badge: avatar + @username + 🏪 shop name (both clickable).
 * Always lets the buyer verify exactly who they're buying from.
 */
export function SellerBadge({ sellerId, username, avatarUrl, shopName, size = "sm", className = "" }: Props) {
  const [data, setData] = useState<{ username: string; avatar_url: string | null; shop_name: string | null } | null>(
    username ? { username, avatar_url: avatarUrl ?? null, shop_name: shopName ?? null } : null
  );

  useEffect(() => {
    if (data?.username && data?.shop_name !== undefined) return;
    if (!sellerId) return;
    if (cache.has(sellerId)) { setData(cache.get(sellerId)!); return; }
    supabase.from("profiles")
      .select("username, avatar_url, shop_name")
      .eq("id", sellerId)
      .maybeSingle()
      .then(({ data: p }) => {
        if (!p) return;
        const v = { username: p.username || "seller", avatar_url: p.avatar_url, shop_name: p.shop_name };
        cache.set(sellerId, v);
        setData(v);
      });
  }, [sellerId]);

  if (!data?.username) return null;

  const avatarSize = size === "md" ? "h-7 w-7" : "h-5 w-5";
  const textSize = size === "md" ? "text-sm" : "text-xs";

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <Link
        to="/seller/$username"
        params={{ username: data.username }}
        className="flex items-center gap-1.5 hover:opacity-80"
        onClick={(e) => e.stopPropagation()}
      >
        {data.avatar_url ? (
          <img src={data.avatar_url} className={`${avatarSize} rounded-full object-cover`} alt={data.username} />
        ) : (
          <div className={`${avatarSize} rounded-full bg-muted`} />
        )}
        <span className={`${textSize} font-semibold text-foreground`}>@{data.username}</span>
      </Link>
      {data.shop_name && (
        <Link
          to="/seller/$username"
          params={{ username: data.username }}
          className={`inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 ${textSize} font-bold text-primary hover:bg-primary/20`}
          onClick={(e) => e.stopPropagation()}
        >
          <StoreIcon className="h-3 w-3" /> {data.shop_name}
        </Link>
      )}
    </div>
  );
}
