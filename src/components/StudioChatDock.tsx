import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Send, Megaphone } from "lucide-react";

type ChatMsg = {
  id: string;
  stream_id: string;
  user_id: string | null;
  username: string;
  content: string;
  is_system: boolean;
  is_announcement: boolean;
  is_hype: boolean;
  created_at: string;
};

/**
 * Compact studio-side chat dock. Reads + posts to chat_messages and tracks
 * presence count for the given stream. Intentionally minimal — full mod
 * tools still live on the public live page.
 */
export function StudioChatDock({ streamId }: { streamId: string }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [viewers, setViewers] = useState(0);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [announce, setAnnounce] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load + subscribe
  useEffect(() => {
    let active = true;
    supabase
      .from("chat_messages")
      .select("*")
      .eq("stream_id", streamId)
      .order("created_at")
      .limit(200)
      .then(({ data }) => { if (active) setMessages((data as any) || []); });

    const ch = supabase
      .channel(`studio-chat-${streamId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `stream_id=eq.${streamId}` },
        (p) => setMessages((m) => [...m, p.new as any].slice(-300)),
      );
    ch.subscribe();

    // Reuse the live presence channel so viewer count matches public page.
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

  // Auto-scroll to bottom on new message
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

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

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl bg-background">
      <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
        <div className="flex items-center gap-1 text-[11px] font-bold">
          Chat
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{viewers} 👁</span>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 min-h-0 space-y-1 overflow-y-auto px-2 py-1.5">
        {messages.length === 0 && (
          <p className="py-4 text-center text-[10px] text-muted-foreground">No messages yet.</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-md px-2 py-1 text-[11px] leading-snug ${
              m.is_announcement ? "border border-primary/40 bg-primary/10" :
              m.is_hype ? "bg-amber-500/10" :
              m.is_system ? "italic text-muted-foreground" :
              ""
            }`}
          >
            {!m.is_system && (
              <span className="mr-1 font-bold text-primary">{m.username}</span>
            )}
            <span className="break-words">{m.content}</span>
          </div>
        ))}
      </div>
      {user ? (
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="flex items-center gap-1 border-t border-border p-1.5"
        >
          <button
            type="button"
            onClick={() => setAnnounce((v) => !v)}
            className={`rounded-md p-1.5 ${announce ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}
            title="Announcement"
          >
            <Megaphone className="h-3 w-3" />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={announce ? "Announcement…" : "Message viewers…"}
            maxLength={500}
            className="flex-1 min-w-0 rounded-md bg-muted px-2 py-1 text-[11px] outline-none"
          />
          <button
            disabled={sending || !input.trim()}
            className="rounded-md bg-primary p-1.5 text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-3 w-3" />
          </button>
        </form>
      ) : (
        <p className="border-t border-border p-2 text-center text-[10px] text-muted-foreground">Sign in to chat</p>
      )}
    </div>
  );
}
