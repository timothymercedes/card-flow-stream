import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Send, Lock } from "lucide-react";
import { toast } from "sonner";
import { ReportDialog } from "@/components/ReportDialog";
import { HeaderSearch } from "@/components/HeaderSearch";
import { useRealtimeChannel } from "@/lib/realtime";

export const Route = createFileRoute("/messages/$userId")({ component: ChatThread });

function ChatThread() {
  const { userId } = Route.useParams();
  const { user, profile } = useAuth();
  const [other, setOther] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const didInitialScroll = useRef(false);

  useEffect(() => {
    (supabase.rpc as any)("public_profiles_by_ids", { _ids: [userId] }).then(({ data }: any) => setOther((data && data[0]) || null));
  }, [userId]);

  // Clear message notifications from this sender so the unread badge syncs.
  useEffect(() => {
    if (!user) return;
    supabase.from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("type", "message")
      .eq("read", false)
      .like("link", `%/messages/${userId}%`)
      .then(() => {});
  }, [user, userId, messages.length]);

  useEffect(() => {
    if (!user) return;
    async function check() {
      const { data } = await supabase.from("message_requests").select("*")
        .or(`and(sender_id.eq.${user!.id},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${user!.id})`)
        .maybeSingle();
      // Allow sending if accepted, or if you're the sender of a pending request (Instagram-style first DM = the request)
      if (data?.status === "accepted") setAccepted(true);
      else if (data?.status === "pending" && data.sender_id === user!.id) setAccepted(true);
      else if (!data) {
        // No request yet — auto-create one as the sender so first message goes through
        await supabase.from("message_requests").insert({
          sender_id: user!.id, sender_username: profile?.username || "user", recipient_id: userId,
        });
        setAccepted(true);
      } else setAccepted(false);
    }
    check();

    async function load() {
      const { data } = await supabase
        .from("direct_messages")
        .select("*")
        .or(`and(sender_id.eq.${user!.id},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${user!.id})`)
        .order("created_at");
      setMessages(data || []);
    }
    load();
  }, [user, userId]);
  useRealtimeChannel({ name: `dm-${user?.id ?? "anon"}-${userId}`, enabled: !!user }, (ch) =>
    ch.on("postgres_changes" as any, { event: "INSERT", schema: "public", table: "direct_messages" } as any, (p: any) => {
      const m = p.new;
      if (!user) return;
      if ((m.sender_id === user.id && m.recipient_id === userId) || (m.sender_id === userId && m.recipient_id === user.id)) {
        setMessages((prev) => {
          // Dedupe: replace optimistic temp row or skip realtime echo of our own insert.
          if (prev.some((x) => x.id === m.id)) return prev;
          const withoutTemp = prev.filter((x) => !(x._optimistic && x.content === m.content && x.sender_id === m.sender_id));
          return [...withoutTemp, m];
        });
      }
    }));

  // Instant jump on first load, smooth for subsequent messages.
  useEffect(() => {
    if (!messages.length) return;
    const behavior: ScrollBehavior = didInitialScroll.current ? "smooth" : "auto";
    endRef.current?.scrollIntoView({ behavior });
    didInitialScroll.current = true;
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !user || !profile || sending) return;
    if (!accepted) return toast.error("Send a message request first");
    const content = input.trim();
    setInput("");
    setSending(true);
    // Optimistic bubble for instant feedback on slow mobile networks.
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, _optimistic: true, sender_id: user.id, recipient_id: userId, content, created_at: new Date().toISOString() }]);
    try {
      const { error } = await supabase.from("direct_messages").insert({
        sender_id: user.id, sender_username: profile.username, recipient_id: userId, content,
      });
      if (error) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setInput(content);
        return toast.error(error.message);
      }
      await supabase.from("notifications").insert({
        user_id: userId, type: "message", body: `@${profile.username}: ${content.slice(0, 60)}`, link: `/messages/${user.id}`,
      });
    } finally {
      setSending(false);
    }
  }

  if (!user) return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Sign in to chat</div>;

  return (
    <div className="mx-auto flex max-w-md flex-col bg-background" style={{ height: "100dvh" }}>
      <header className="flex flex-col gap-2 border-b border-border px-3 py-2" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
        <div className="flex items-center gap-3">
          <Link to="/messages" className="rounded-full p-1" aria-label="Back to messages"><ArrowLeft className="h-5 w-5" /></Link>
          <p className="flex-1 text-sm font-bold">@{other?.username || "user"}</p>
          {other?.id && <ReportDialog targetType="user" targetId={other.id} targetLabel={`@${other.username}`} size="icon" />}
        </div>
        <HeaderSearch />
      </header>
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-3" style={{ WebkitOverflowScrolling: "touch" }}>
        {messages.length === 0 && <p className="py-12 text-center text-xs text-muted-foreground">Say hi 👋</p>}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.sender_id === user.id ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.sender_id === user.id ? "bg-primary text-primary-foreground" : "bg-card"} ${m._optimistic ? "opacity-60" : ""}`}>{m.content}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {accepted === false ? (
        <div className="flex items-center gap-2 border-t border-border bg-card p-3 text-xs text-muted-foreground" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <Lock className="h-4 w-4" /> Message request required. Go to Messages → search to send a request.
        </div>
      ) : (
        <form onSubmit={send} className="flex gap-2 border-t border-border bg-card p-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message..."
            enterKeyHint="send"
            autoComplete="off"
            autoCorrect="on"
            className="flex-1 rounded-full bg-input px-4 py-2 text-base outline-none sm:text-sm"
          />
          <button type="submit" disabled={sending || !input.trim()} className="rounded-full bg-primary p-2.5 text-primary-foreground disabled:opacity-50" aria-label="Send message"><Send className="h-4 w-4" /></button>
        </form>
      )}
    </div>
  );
}

