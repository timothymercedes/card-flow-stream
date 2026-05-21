import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Gavel, UserPlus, LogIn, LogOut, ShoppingBag, Gift, Heart, Sparkles } from "lucide-react";

type Event = {
  id: string;
  kind: "bid" | "join" | "leave" | "follow" | "purchase" | "tip" | "reaction" | "mod";
  username: string;
  detail?: string;
  ts: number;
};

const ICON: Record<Event["kind"], any> = {
  bid: Gavel,
  join: LogIn,
  leave: LogOut,
  follow: UserPlus,
  purchase: ShoppingBag,
  tip: Gift,
  reaction: Heart,
  mod: Sparkles,
};

const COLOR: Record<Event["kind"], string> = {
  bid: "text-amber-300",
  join: "text-emerald-300",
  leave: "text-white/40",
  follow: "text-fuchsia-300",
  purchase: "text-emerald-400",
  tip: "text-yellow-300",
  reaction: "text-rose-300",
  mod: "text-sky-300",
};

const fmtAmt = (n: number) => `$${n.toFixed(2)}`;

/**
 * Real-time activity feed for a live stream. Subscribes to bids, presence
 * (joins/leaves via last_seen_at), follows of the seller, purchases (paid
 * orders for the stream), tips, and reactions. Capped at 50 events.
 */
export function LiveActivityFeed({
  streamId,
  sellerId,
  className = "",
}: {
  streamId: string;
  sellerId?: string;
  className?: string;
}) {
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    if (!streamId) return;
    const push = (e: Omit<Event, "id" | "ts"> & { id?: string }) => {
      setEvents((prev) =>
        [
          {
            id: e.id ?? `${e.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            ts: Date.now(),
            ...e,
          },
          ...prev,
        ].slice(0, 50),
      );
    };

    const channels: any[] = [];

    // Bids
    channels.push(
      supabase
        .channel(`feed-bids-${streamId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "live_bids", filter: `stream_id=eq.${streamId}` },
          (p) => {
            const r: any = p.new;
            push({
              id: `bid-${r.id}`,
              kind: "bid",
              username: r.bidder_username || "bidder",
              detail: `placed ${fmtAmt(Number(r.amount))}${r.was_anti_snipe ? " · anti-snipe!" : ""}`,
            });
          },
        )
        .subscribe(),
    );

    // Joins (presence inserts) and leaves not tracked separately; use INSERT for join
    channels.push(
      supabase
        .channel(`feed-presence-${streamId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "live_stream_presence", filter: `stream_id=eq.${streamId}` },
          (p) => {
            const r: any = p.new;
            push({
              id: `join-${r.user_id}-${r.last_seen_at}`,
              kind: "join",
              username: r.username || "viewer",
              detail: "joined the stream",
            });
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "live_stream_presence", filter: `stream_id=eq.${streamId}` },
          (p) => {
            const r: any = p.old;
            push({
              id: `leave-${r.user_id}-${Date.now()}`,
              kind: "leave",
              username: r.username || "viewer",
              detail: "left",
            });
          },
        )
        .subscribe(),
    );

    // Purchases (orders for this stream become paid)
    channels.push(
      supabase
        .channel(`feed-orders-${streamId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "orders", filter: `stream_id=eq.${streamId}` },
          (p) => {
            const r: any = p.new;
            const prev: any = p.old;
            if (r.payment_status === "paid" && prev?.payment_status !== "paid") {
              push({
                id: `order-${r.id}`,
                kind: "purchase",
                username: r.buyer_username || "buyer",
                detail: `won ${r.title} · ${fmtAmt(Number(r.amount || 0))}`,
              });
            }
          },
        )
        .subscribe(),
    );

    // Tips
    channels.push(
      supabase
        .channel(`feed-tips-${streamId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "stream_tips", filter: `stream_id=eq.${streamId}` },
          (p) => {
            const r: any = p.new;
            if (r.status === "paid" || r.status === "pending") {
              push({
                id: `tip-${r.id}`,
                kind: "tip",
                username: r.buyer_username || "supporter",
                detail: `tipped ${fmtAmt(Number(r.amount || 0))}${r.message ? ` — "${r.message}"` : ""}`,
              });
            }
          },
        )
        .subscribe(),
    );

    // Reactions
    channels.push(
      supabase
        .channel(`feed-reactions-${streamId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "stream_reactions", filter: `stream_id=eq.${streamId}` },
          (p) => {
            const r: any = p.new;
            push({
              id: `rx-${r.id}`,
              kind: "reaction",
              username: r.username || "viewer",
              detail: `reacted ${r.emoji || "❤️"}`,
            });
          },
        )
        .subscribe(),
    );

    // Moderation
    channels.push(
      supabase
        .channel(`feed-mod-${streamId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "stream_chat_actions", filter: `stream_id=eq.${streamId}` },
          (p) => {
            const r: any = p.new;
            push({
              id: `mod-${r.id}`,
              kind: "mod",
              username: r.moderator_username || "moderator",
              detail: `${r.action || "moderated"} @${r.target_username || "user"}`,
            });
          },
        )
        .subscribe(),
    );

    // Follows of the seller
    if (sellerId) {
      channels.push(
        supabase
          .channel(`feed-follow-${sellerId}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "follows", filter: `followed_id=eq.${sellerId}` },
            (p) => {
              const r: any = p.new;
              push({
                id: `follow-${r.id ?? `${r.follower_id}-${r.followed_id}`}`,
                kind: "follow",
                username: r.follower_username || "viewer",
                detail: "followed the seller",
              });
            },
          )
          .subscribe(),
      );
    }

    return () => {
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [streamId, sellerId]);

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-white/70">
          Live activity
        </h3>
        <span className="text-[10px] text-white/40">{events.length}</span>
      </div>
      <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-xl bg-black/40 p-2 ring-1 ring-white/10 backdrop-blur">
        {events.length === 0 && (
          <li className="px-1 py-3 text-center text-[11px] text-white/50">
            Waiting for the action…
          </li>
        )}
        {events.map((e) => {
          const Icon = ICON[e.kind];
          return (
            <li key={e.id} className="flex items-start gap-2 rounded-lg bg-white/[0.04] px-2 py-1.5">
              <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${COLOR[e.kind]}`} />
              <p className="min-w-0 flex-1 text-[11px] leading-tight text-white/90">
                <span className="font-bold">@{e.username}</span>{" "}
                <span className="text-white/70">{e.detail}</span>
              </p>
              <span className="shrink-0 text-[9px] text-white/40">
                {timeAgo(e.ts)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function timeAgo(ts: number) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 5) return "now";
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.round(m / 60)}h`;
}
