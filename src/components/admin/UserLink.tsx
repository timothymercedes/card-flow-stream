import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, { username: string; shop_name: string | null }>();

export function UserLink({
  userId,
  onOpen,
  showId,
}: {
  userId?: string | null;
  onOpen?: (userId: string) => void;
  showId?: boolean;
}) {
  const [p, setP] = useState<{ username: string; shop_name: string | null } | null>(
    userId ? (cache.get(userId) ?? null) : null,
  );

  useEffect(() => {
    if (!userId || cache.has(userId)) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("username, shop_name")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled || !data) return;
      cache.set(userId, data as any);
      setP(data as any);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!userId) return <span className="text-muted-foreground">—</span>;
  const label = p?.username ? `@${p.username}` : userId.slice(0, 8);
  return (
    <button
      type="button"
      onClick={() => onOpen?.(userId)}
      className="text-primary hover:underline font-medium"
      title={userId}
    >
      {label}
      {showId && <span className="ml-1 text-[10px] text-muted-foreground">({userId.slice(0, 6)})</span>}
    </button>
  );
}

export function StoreLink({
  sellerId,
  onOpen,
}: {
  sellerId?: string | null;
  onOpen?: (userId: string) => void;
}) {
  const [p, setP] = useState<{ username: string; shop_name: string | null } | null>(
    sellerId ? (cache.get(sellerId) ?? null) : null,
  );
  useEffect(() => {
    if (!sellerId || cache.has(sellerId)) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("username, shop_name")
        .eq("id", sellerId)
        .maybeSingle();
      if (cancelled || !data) return;
      cache.set(sellerId, data as any);
      setP(data as any);
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerId]);
  if (!sellerId) return <span className="text-muted-foreground">—</span>;
  const label = p?.shop_name || (p?.username ? `@${p.username}` : sellerId.slice(0, 8));
  return (
    <button
      type="button"
      onClick={() => onOpen?.(sellerId)}
      className="text-primary hover:underline font-medium"
      title={sellerId}
    >
      🏪 {label}
    </button>
  );
}
