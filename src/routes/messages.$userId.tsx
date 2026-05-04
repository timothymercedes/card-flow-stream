import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/messages/$userId")({ component: ChatThread });

function ChatThread() {
  const { userId } = Route.useParams();
  const { user, profile } = useAuth();
  const [other, setOther] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from("profiles").select("id,username").eq("id", userId).maybeSingle().then(({ data }) => setOther(data));
  }, [userId]);

  useEffect(() => {
    if (!user) return;
    async function load() {
      const { data } = await supabase
        .from("direct_messages")
        .select("*")
        .or(`and(sender_id.eq.${user!.id},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${user!.id})`)
        .order("created_at");
      setMessages(data || []);
    }
    load();
    const ch = supabase.channel(`dm-${userId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, (p: any) => {
      const m = p.new;
      if ((m.sender_id === user.id && m.recipient_id === userId) || (m.sender_id === userId && m.recipient_id === user.id)) {
        setMessages((prev) => [...prev, m]);
      }
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, userId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !user || !profile) return;
    const content = input.trim();
    setInput("");
    const { error } = await supabase.from("direct_messages").insert({
      sender_id: user.id, sender_username: profile.username, recipient_id: userId, content,
    });
    if (error) return toast.error(error.message);
    await supabase.from("notifications").insert({
      user_id: userId, type: "message", body: `@${profile.username}: ${content.slice(0, 60)}`, link: `/messages/${user.id}`,
    });
  }

  if (!user) return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Sign in to chat</div>;

  return (
    <div className="mx-auto flex h-screen max-w-md flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-3 py-3">
        <Link to="/messages" className="rounded-full p-1"><ArrowLeft className="h-5 w-5" /></Link>
        <p className="text-sm font-bold">@{other?.username || "user"}</p>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {messages.length === 0 && <p className="py-12 text-center text-xs text-muted-foreground">Say hi 👋</p>}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.sender_id === user.id ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.sender_id === user.id ? "bg-primary text-primary-foreground" : "bg-card"}`}>{m.content}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-border bg-card p-3">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Message..." className="flex-1 rounded-full bg-input px-4 py-2 text-sm outline-none" />
        <button type="submit" className="rounded-full bg-primary p-2.5 text-primary-foreground"><Send className="h-4 w-4" /></button>
      </form>
    </div>
  );
}
