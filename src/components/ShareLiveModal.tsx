/**
 * ShareLiveModal — universal share sheet for live auctions / Flex Live streams.
 *
 * Shows:
 *  • Stream preview (thumbnail + title + seller + LIVE pill)
 *  • One-tap external destinations: copy, native share, SMS, email, X,
 *    Facebook, WhatsApp, Telegram, Reddit (plus Discord/Instagram/TikTok/
 *    Snapchat which open via copy-link since they have no public web-share
 *    intent — link is auto-copied so the user can paste into the app).
 *  • In-app "Send to": pre-populated with people you follow + recent DMs,
 *    plus a search box for everyone else.
 *
 * Sending in-app inserts a rich `direct_messages` row with the live URL +
 * a `notifications` row so the recipient gets a realtime ping with a
 * one-tap deep-link back to the stream.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAuthGate } from "@/hooks/useAuthGate";
import { toast } from "sonner";
import {
  X,
  Copy,
  Share2,
  Mail,
  MessageSquare,
  Send,
  Search,
  Radio,
  Check,
} from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";

type Recipient = { id: string; username: string; avatar_url?: string | null };

export function ShareLiveModal({
  open,
  onClose,
  streamId,
  title,
  thumbnailUrl,
  sellerUsername,
  isLive = true,
}: {
  open: boolean;
  onClose: () => void;
  streamId: string;
  title: string;
  thumbnailUrl?: string | null;
  sellerUsername?: string | null;
  isLive?: boolean;
}) {
  const { user, profile } = useAuth();
  const { requireAuth } = useAuthGate();
  const [follows, setFollows] = useState<Recipient[]>([]);
  const [recents, setRecents] = useState<Recipient[]>([]);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Recipient[]>([]);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

  const url = useMemo(
    () =>
      typeof window !== "undefined"
        ? `${window.location.origin}/live/${streamId}`
        : `/live/${streamId}`,
    [streamId],
  );
  const shareText = `📺 ${sellerUsername ? `@${sellerUsername} ` : ""}is LIVE: "${title}"`;

  // Load following + recent DMs whenever modal opens
  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      // 1. People you follow
      const { data: f } = await supabase
        .from("follows")
        .select("followee_id")
        .eq("follower_id", user.id)
        .limit(40);
      const followIds = (f || []).map((r: any) => r.followee_id);

      // 2. Recent DM partners (last 30 days)
      const { data: dms } = await supabase
        .from("direct_messages")
        .select("sender_id, recipient_id, created_at")
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(30);
      const recentIds: string[] = [];
      const seen = new Set<string>();
      (dms || []).forEach((m: any) => {
        const other = m.sender_id === user.id ? m.recipient_id : m.sender_id;
        if (other && !seen.has(other)) {
          seen.add(other);
          recentIds.push(other);
        }
      });

      const allIds = Array.from(new Set([...followIds, ...recentIds]));
      if (allIds.length === 0) {
        if (!cancelled) {
          setFollows([]);
          setRecents([]);
        }
        return;
      }
      const { data: profiles } = await (supabase.rpc as any)(
        "public_profiles_by_ids",
        { _ids: allIds },
      );
      if (cancelled) return;
      const map = new Map<string, Recipient>();
      (profiles || []).forEach((p: any) =>
        map.set(p.id, { id: p.id, username: p.username, avatar_url: p.avatar_url }),
      );
      setFollows(followIds.map((id) => map.get(id)!).filter(Boolean));
      setRecents(recentIds.map((id) => map.get(id)!).filter(Boolean).slice(0, 8));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  // Search-as-you-type with light debounce
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await (supabase.rpc as any)("search_public_profiles", {
        _query: query.trim(),
        _limit: 10,
      });
      setSearchResults(data || []);
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  if (!open) return null;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  async function systemShare() {
    if ((navigator as any).share) {
      try {
        await (navigator as any).share({ title, text: shareText, url });
      } catch {
        /* user cancelled */
      }
    } else {
      copyLink();
    }
  }

  function openExternal(href: string) {
    window.open(href, "_blank", "noopener,noreferrer");
  }

  async function sendInApp(r: Recipient) {
    if (!requireAuth("share to a friend")) return;
    if (!user || !profile) return;
    if (sentTo.has(r.id)) return;
    const content = `📺 ${shareText}\n${url}`;
    const { error } = await supabase.from("direct_messages").insert({
      sender_id: user.id,
      sender_username: profile.username,
      recipient_id: r.id,
      content,
    });
    if (error) return toast.error(error.message);
    await supabase.from("notifications").insert({
      user_id: r.id,
      type: "share_live",
      body: `@${profile.username} shared a LIVE auction with you — tap to join`,
      link: `/live/${streamId}`,
    });
    // Best-effort referral tracking (silently ignored if table absent)
    try {
      await supabase.from("share_events" as any).insert({
        sharer_id: user.id,
        recipient_id: r.id,
        stream_id: streamId,
        channel: "in_app",
      });
    } catch {
      /* table optional */
    }
    setSentTo((s) => new Set(s).add(r.id));
    toast.success(`Sent to @${r.username}`);
  }

  const externals: { key: string; label: string; bg: string; onClick: () => void; icon: React.ReactNode }[] = [
    { key: "copy", label: "Copy link", bg: "bg-muted", icon: <Copy className="h-4 w-4" />, onClick: copyLink },
    { key: "system", label: "More…", bg: "bg-muted", icon: <Share2 className="h-4 w-4" />, onClick: systemShare },
    { key: "sms", label: "SMS", bg: "bg-emerald-600 text-white", icon: <MessageSquare className="h-4 w-4" />, onClick: () => openExternal(`sms:?&body=${encodeURIComponent(`${shareText} ${url}`)}`) },
    { key: "email", label: "Email", bg: "bg-slate-600 text-white", icon: <Mail className="h-4 w-4" />, onClick: () => openExternal(`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${shareText}\n\n${url}`)}`) },
    { key: "whatsapp", label: "WhatsApp", bg: "bg-[#25D366] text-white", icon: <span className="text-[10px] font-black">W</span>, onClick: () => openExternal(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`) },
    { key: "telegram", label: "Telegram", bg: "bg-[#229ED9] text-white", icon: <Send className="h-4 w-4" />, onClick: () => openExternal(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`) },
    { key: "x", label: "X", bg: "bg-black text-white", icon: <span className="text-[11px] font-black">𝕏</span>, onClick: () => openExternal(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`) },
    { key: "facebook", label: "Facebook", bg: "bg-[#1877F2] text-white", icon: <span className="text-[11px] font-black">f</span>, onClick: () => openExternal(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`) },
    { key: "reddit", label: "Reddit", bg: "bg-[#FF4500] text-white", icon: <span className="text-[10px] font-black">R</span>, onClick: () => openExternal(`https://reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(shareText)}`) },
    { key: "discord", label: "Discord", bg: "bg-[#5865F2] text-white", icon: <span className="text-[10px] font-black">D</span>, onClick: async () => { await copyLink(); openExternal("https://discord.com/channels/@me"); } },
    { key: "instagram", label: "Instagram", bg: "bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5] text-white", icon: <span className="text-[10px] font-black">IG</span>, onClick: async () => { await copyLink(); toast.success("Link copied — paste in Instagram DM"); } },
    { key: "tiktok", label: "TikTok", bg: "bg-black text-white", icon: <span className="text-[10px] font-black">TT</span>, onClick: async () => { await copyLink(); toast.success("Link copied — paste in TikTok"); } },
    { key: "snapchat", label: "Snapchat", bg: "bg-[#FFFC00] text-black", icon: <span className="text-[10px] font-black">SC</span>, onClick: async () => { await copyLink(); toast.success("Link copied — paste in Snapchat"); } },
  ];

  // De-duplicate combined people list
  const peopleMap = new Map<string, Recipient>();
  recents.forEach((r) => peopleMap.set(r.id, r));
  follows.forEach((r) => peopleMap.set(r.id, r));
  const people = Array.from(peopleMap.values());
  const visiblePeople = query.trim() ? searchResults : people;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-card p-4 text-foreground shadow-2xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-bold">Share this live</p>
          <button onClick={onClose} aria-label="Close share">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stream preview */}
        <div className="mb-3 flex gap-3 rounded-xl bg-muted/50 p-2">
          <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
            {thumbnailUrl ? (
              <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/30 to-live/30">
                <Radio className="h-6 w-6" />
              </div>
            )}
            {isLive && (
              <span className="absolute left-1 top-1 rounded-full bg-live px-1.5 py-0.5 text-[8px] font-black text-live-foreground">
                LIVE
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-xs font-bold">{title}</p>
            {sellerUsername && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">@{sellerUsername}</p>
            )}
            <p className="mt-1 truncate text-[10px] text-muted-foreground/80">{url}</p>
          </div>
        </div>

        {/* External destinations */}
        <div className="mb-4 grid grid-cols-5 gap-2">
          {externals.map((b) => (
            <button
              key={b.key}
              onClick={b.onClick}
              className="flex flex-col items-center gap-1 rounded-lg p-1 hover:bg-muted/60"
              aria-label={b.label}
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-full ${b.bg}`}
              >
                {b.icon}
              </span>
              <span className="text-[9px] font-semibold leading-tight">{b.label}</span>
            </button>
          ))}
        </div>

        {/* In-app send */}
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-input px-3 py-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Send via DM — search friends or @username"
            className="w-full bg-transparent text-xs outline-none"
          />
        </div>

        {!query.trim() && recents.length > 0 && (
          <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Recent
          </p>
        )}

        <div className="max-h-72 space-y-1 overflow-y-auto pt-1">
          {visiblePeople.length === 0 && (
            <p className="py-6 text-center text-[11px] text-muted-foreground">
              {query.trim()
                ? "No matches — try a different username."
                : "Follow some sellers to quick-share with them here."}
            </p>
          )}
          {visiblePeople.map((r) => {
            const sent = sentTo.has(r.id);
            return (
              <button
                key={r.id}
                onClick={() => sendInApp(r)}
                disabled={sent}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted disabled:opacity-60"
              >
                <UserAvatar
                  username={r.username}
                  avatarUrl={r.avatar_url}
                  size="sm"
                  noLink
                />
                <span className="flex-1 truncate text-xs font-semibold">@{r.username}</span>
                {sent ? (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                    <Check className="h-3 w-3" /> Sent
                  </span>
                ) : (
                  <span className="rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                    Send
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
