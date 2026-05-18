import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Send, Megaphone, Shield, ShieldOff } from "lucide-react";

type ChatMsg = {
  id: string;
  stream_id: string;
  user_id: string | null;
  username: string;
  content: string;
  is_system: boolean;
  is_announcement: boolean;
  is_hype: boolean;
  audience?: string;
  created_at: string;
};

/**
 * Studio-side chat dock. Renders messages with the same immersive bubble
 * styling as the public live page so the host sees chat as viewers do.
 *
 * Adds a "Hide mod messages" toggle so the host can mute chatter from their
 * own moderators when they want a cleaner view of buyer chat.
 */
export function StudioChatDock({ streamId }: { streamId: string }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [viewers, setViewers] = useState(0);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [announce, setAnnounce] = useState(false);
  const [modIds, setModIds] = useState<Set<string>>(new Set());
  const [hostId, setHostId] = useState<string | null>(null);
  const storageKey = `pb-hide-mod-chat-${streamId}`;
  const [hideMods, setHideMods] = useState<boolean>(() => {
    try { return localStorage.getItem(storageKey) === "1"; } catch { return false; }
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { localStorage.setItem(storageKey, hideMods ? "1" : "0"); } catch {}
  }, [hideMods, storageKey]);

  // Load + subscribe (messages, mods, host, presence)
  useEffect(() => {
    let active = true;

    supabase
      .from("chat_messages")
      .select("*")
      .eq("stream_id", streamId)
      .order("created_at")
      .limit(200)
      .then(({ data }) => { if (active) setMessages((data as any) || []); });

    supabase
      .from("live_streams")
      .select("seller_id")
      .eq("id", streamId)
      .maybeSingle()
      .then(({ data }) => { if (active && data) setHostId((data as any).seller_id); });

    async function loadMods() {
      const { data } = await supabase
        .from("stream_moderators")
        .select("mod_user_id")
        .eq("stream_id", streamId);
      if (active) setModIds(new Set((data || []).map((m: any) => m.mod_user_id)));
    }
    loadMods();

    const ch = supabase
      .channel(`studio-chat-${streamId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `stream_id=eq.${streamId}` },
        (p) => setMessages((m) => [...m, p.new as any].slice(-300)),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stream_moderators", filter: `stream_id=eq.${streamId}` },
        loadMods,
      );
    ch.subscribe();

    const presence = supabase.channel(`live-${streamId}`, {
      config: { presence: { key: user?.id || crypto.randomUUID() } },
    });
    presence
      .on("presence", { event: "sync" }, () => {
        setViewers(Object.keys(presence.presenceState()).length);
      })
      .subscribe(async (s) => {
        if (s === "SUBSCRIBED") {
          await presence.track({ host: true, at: Date.now() });
        }
      });

    return () => {
      active = false;
      try { supabase.removeChannel(ch); } catch {}
      try { supabase.removeChannel(presence); } catch {}
    };
  }, [streamId, user?.id]);

  const visibleMessages = useMemo(() => {
    return messages.filter((m) => {
      if (m.is_system) return true;
      if (!hideMods) return true;
      if (!m.user_id) return true;
      // Hide messages authored by mods (host's own messages stay visible)
      return !modIds.has(m.user_id);
    });
  }, [messages, hideMods, modIds]);

  // Auto-scroll on new message
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visibleMessages.length]);

  async function send() {
    const content = input.trim();
    if (!content || !user) return;
    setSending(true);
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();
      await supabase.from("chat_messages").insert({
        stream_id: streamId,
        user_id: user.id,
        username: prof?.username || user.email?.split("@")[0] || "host",
        content,
        is_announcement: announce,
      });
      setInput("");
    } finally {
      setSending(false);
    }
  }

  function bubbleClass(m: ChatMsg) {
    if (m.is_system) return "bg-white/5 text-white/70 italic ring-1 ring-white/10";
    if (m.is_announcement) return "bg-primary/20 ring-1 ring-primary/40";
    if (m.is_hype) return "bg-amber-500/20 ring-1 ring-amber-400/40";
    const aud = m.audience || "public";
    if (aud === "host_mods") return "bg-fuchsia-600/30 ring-1 ring-fuchsia-300/40";
    if (aud === "mods_only") return "bg-amber-500/25 ring-1 ring-amber-300/40";
    return "bg-black/50 ring-1 ring-white/10";
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl bg-gradient-to-b from-zinc-950 to-black ring-1 ring-white/5">
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-2 py-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-live" />
          Stream chat
          <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] text-white/70">{viewers} 👁</span>
        </div>
        <button
          type="button"
          onClick={() => setHideMods((v) => !v)}
          title={hideMods ? "Show mod messages" : "Hide mod messages"}
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold ring-1 transition ${
            hideMods
              ? "bg-amber-500/20 text-amber-300 ring-amber-400/40"
              : "bg-white/5 text-white/70 ring-white/10 hover:bg-white/10"
          }`}
        >
          {hideMods ? <ShieldOff className="h-2.5 w-2.5" /> : <Shield className="h-2.5 w-2.5" />}
          {hideMods ? "Mods hidden" : "Hide mods"}
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 space-y-1.5 overflow-y-auto p-2"
      >
        {visibleMessages.length === 0 && (
          <p className="py-4 text-center text-[10px] text-white/40">
            {hideMods && messages.length > 0 ? "All current chatter is from mods." : "No messages yet."}
          </p>
        )}
        {visibleMessages.map((m) => {
          const aud = m.audience || "public";
          const isMod = m.user_id && modIds.has(m.user_id);
          const isHost = m.user_id && hostId && m.user_id === hostId;
          return (
            <div
              key={m.id}
              className={`max-w-full rounded-2xl px-2.5 py-1 text-[11px] leading-snug text-white shadow-sm ${bubbleClass(m)}`}
            >
              {(aud === "mods_only" || aud === "host_mods") && (
                <span className="mr-1 rounded bg-black/40 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white/90">
                  {aud === "host_mods" ? "Host+Mods" : "Mods"}
                </span>
              )}
              {!m.is_system && (
                <span className="mr-1 font-semibold text-primary">
                  @{m.username}
                  {isHost ? (
                    <span className="ml-1 rounded bg-primary/30 px-1 text-[8px] font-bold uppercase tracking-wider text-primary-foreground">Host</span>
                  ) : isMod ? (
                    <span className="ml-1 rounded bg-blue-500/30 px-1 text-[8px] font-bold uppercase tracking-wider text-blue-200">Mod</span>
                  ) : null}
                </span>
              )}
              <span className="break-words">{m.content}</span>
            </div>
          );
        })}
      </div>

      {user ? (
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="flex shrink-0 items-center gap-1 border-t border-white/10 p-1.5"
        >
          <button
            type="button"
            onClick={() => setAnnounce((v) => !v)}
            className={`rounded-md p-1.5 ${announce ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/70 hover:bg-white/10"}`}
            title="Announcement"
          >
            <Megaphone className="h-3 w-3" />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={announce ? "Announcement…" : "Message viewers…"}
            maxLength={500}
            className="flex-1 min-w-0 rounded-md bg-white/5 px-2 py-1 text-[11px] text-white outline-none placeholder:text-white/40"
          />
          <button
            disabled={sending || !input.trim()}
            className="rounded-md bg-primary p-1.5 text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-3 w-3" />
          </button>
        </form>
      ) : (
        <p className="border-t border-white/10 p-2 text-center text-[10px] text-white/40">Sign in to chat</p>
      )}
    </div>
  );
}
