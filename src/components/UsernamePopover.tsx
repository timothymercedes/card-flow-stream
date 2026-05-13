/**
 * UsernamePopover — tap-friendly mini profile card popup.
 *
 * Wrap any clickable @username (e.g. in live chat) so buyers can quickly
 * verify a seller's credibility *without* leaving the live stream:
 *   - avatar, username, live indicator
 *   - average rating + review count
 *   - completed sales + on-time shipping %
 *   - Quick actions: Join Live · View Store · Message · Report
 *
 * Mobile-first: opens as a Radix Popover so it's tap-stable and dismissable.
 * Lazy loads stats only when opened to keep chat fast.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { Star, Truck, MessageCircle, Store, Radio, Flag, BadgeCheck } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { SellerResponseBadges } from "@/components/SellerResponseBadges";
import { BuyerTrustBadges } from "@/components/BuyerTrustBadges";

type Stats = {
  completed_sales?: number;
  total_sales?: number;
  avg_rating?: number | null;
  review_count?: number;
  avg_shipping_days?: number | null;
  on_time_rate?: number | null;
  success_rate?: number | null;
};

type Profile = {
  id: string;
  username: string;
  avatar_url: string | null;
  shop_name?: string | null;
  bio?: string | null;
  seller_status?: string | null;
  live_verified?: boolean | null;
};

export function UsernamePopover({
  username,
  children,
  className = "",
}: {
  username: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [liveId, setLiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || profile) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: prof } = await supabase
        .from("profiles")
        .select("id,username,avatar_url,shop_name,bio,seller_status,live_verified")
        .eq("username", username)
        .maybeSingle();
      if (cancelled || !prof) { setLoading(false); return; }
      setProfile(prof as any);

      const [{ data: ss }, { data: live }] = await Promise.all([
        (supabase.rpc as any)("get_seller_stats", { _seller_id: (prof as any).id }),
        supabase
          .from("live_streams")
          .select("id")
          .eq("seller_id", (prof as any).id)
          .eq("status", "live")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setStats((ss as any) || {});
      setLiveId((live as any)?.id ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, username, profile]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`cursor-pointer text-left ${className}`}
          aria-label={`Open profile card for @${username}`}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        className="w-72 rounded-2xl border border-border bg-card p-3 shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {loading && !profile ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
        ) : !profile ? (
          <p className="py-6 text-center text-xs text-muted-foreground">@{username} not found.</p>
        ) : (
          <div>
            <div className="flex items-start gap-3">
              <UserAvatar
                username={profile.username}
                avatarUrl={profile.avatar_url}
                isLive={!!liveId}
                liveStreamId={liveId}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <p className="truncate text-sm font-bold">@{profile.username}</p>
                  {(stats?.completed_sales ?? 0) >= 100 && (
                    <BadgeCheck className="h-3.5 w-3.5 text-primary" aria-label="Verified seller" />
                  )}
                </div>
                {profile.shop_name && (
                  <p className="truncate text-[11px] text-muted-foreground">{profile.shop_name}</p>
                )}
                <div className="mt-1 flex items-center gap-1 text-[11px]">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  <span className="font-semibold">
                    {stats?.avg_rating ? Number(stats.avg_rating).toFixed(1) : "—"}
                  </span>
                  <span className="text-muted-foreground">
                    · {stats?.review_count ?? 0} review{stats?.review_count === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            </div>

            {profile.bio && (
              <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">{profile.bio}</p>
            )}

            <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[10px]">
              <div className="rounded-lg bg-muted/50 p-1.5">
                <p className="text-muted-foreground">Sales</p>
                <p className="font-bold text-primary">{stats?.completed_sales ?? 0}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-1.5">
                <p className="text-muted-foreground">Ship</p>
                <p className="font-bold text-emerald-400">
                  {stats?.avg_shipping_days != null
                    ? `${Number(stats.avg_shipping_days).toFixed(1)}d`
                    : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-muted/50 p-1.5">
                <p className="text-muted-foreground">On-time</p>
                <p className="font-bold text-emerald-400">
                  {stats?.on_time_rate != null ? `${Math.round(Number(stats.on_time_rate))}%` : "—"}
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {liveId && (
                <Link
                  to="/live/$id"
                  params={{ id: liveId }}
                  onClick={() => setOpen(false)}
                  className="col-span-2 inline-flex items-center justify-center gap-1 rounded-lg bg-live px-2 py-1.5 text-[11px] font-bold text-live-foreground"
                >
                  <Radio className="h-3 w-3 animate-pulse" /> Join Live Stream
                </Link>
              )}
              <Link
                to="/seller/$username"
                params={{ username: profile.username }}
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center gap-1 rounded-lg bg-primary px-2 py-1.5 text-[11px] font-bold text-primary-foreground"
              >
                <Store className="h-3 w-3" /> View Store
              </Link>
              <Link
                to="/messages/$userId"
                params={{ userId: profile.id }}
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center gap-1 rounded-lg bg-card px-2 py-1.5 text-[11px] font-bold ring-1 ring-border"
              >
                <MessageCircle className="h-3 w-3" /> Message
              </Link>
            </div>

            {(stats?.success_rate != null || stats?.total_sales != null) && (
              <p className="mt-2 flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                <Truck className="h-3 w-3" />
                Delivery success {stats?.success_rate != null ? `${Math.round(Number(stats.success_rate))}%` : "—"}
              </p>
            )}

            <Link
              to="/seller/$username"
              params={{ username: profile.username }}
              search={{ tab: "reviews" } as any}
              onClick={() => setOpen(false)}
              className="mt-2 flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            >
              <Flag className="h-3 w-3" /> See full reviews & report options
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
