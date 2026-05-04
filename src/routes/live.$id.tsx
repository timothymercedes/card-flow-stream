import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Radio, Send, Sparkles, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/live/$id")({ component: LiveDetail });

function LiveDetail() {
  const { id } = Route.useParams();
  const { user, profile } = useAuth();
  const [stream, setStream] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from("live_streams").select("*").eq("id", id).maybeSingle().then(({ data }) => setStream(data));
    supabase.from("chat_messages").select("*").eq("stream_id", id).order("created_at").then(({ data }) => setMessages(data || []));

    const ch = supabase.channel(`live-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `stream_id=eq.${id}` }, (p) => setMessages((m) => [...m, p.new]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_streams", filter: `id=eq.${id}` }, (p) => setStream(p.new))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function sendMsg(content: string, isSystem = false) {
    if (!profile) return toast.error("Sign in to chat");
    if (!content.trim()) return;
    await supabase.from("chat_messages").insert({ stream_id: id, user_id: profile.id, username: isSystem ? "AI" : profile.username, content, is_system: isSystem });
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    await sendMsg(input);
    setInput("");
  }

  async function placeBid() {
    if (!user) return toast.error("Sign in to bid");
    const next = Number(stream.current_bid || 0) + 1;
    const { error } = await supabase.from("live_streams").update({ current_bid: next, current_bidder_id: user.id }).eq("id", id);
    if (error) return toast.error(error.message);
    await sendMsg(`💎 ${profile?.username} bid $${next}`, true);
  }

  async function aiScan() {
    if (!user || user.id !== stream?.seller_id) return toast.error("Only the seller can scan");
    const cards = ["Charizard", "Pikachu Illustrator", "Black Lotus", "Mewtwo VMAX", "Blue-Eyes White Dragon"];
    const trends = ["Value Picking Up 📈", "Hot Right Now 🔥", "Trending Up 📈", "Rare Find 💎"];
    const card = cards[Math.floor(Math.random() * cards.length)];
    const trend = trends[Math.floor(Math.random() * trends.length)];
    await supabase.from("live_streams").update({ current_item: card, current_bid: 1 }).eq("id", id);
    await sendMsg(`${card} — ${trend}`, true);
    toast.success("Card scanned");
  }

  if (!stream) return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Loading...</div>;

  const isSeller = user?.id === stream.seller_id;

  return (
    <div className="mx-auto flex h-screen max-w-md flex-col bg-background">
      {/* Video */}
      <div className="relative aspect-video w-full bg-black">
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/30 to-live/30">
          <Radio className="h-16 w-16 opacity-50" />
        </div>
        <Link to="/live" className="absolute left-3 top-3 rounded-full bg-black/50 p-2 backdrop-blur"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-live px-2.5 py-1 text-[10px] font-bold">
          <span className="h-1.5 w-1.5 live-pulse rounded-full bg-live-foreground" /> LIVE
        </div>
      </div>

      {/* Title */}
      <div className="border-b border-border px-4 py-2">
        <p className="text-sm font-semibold">{stream.title}</p>
      </div>

      {/* Chat */}
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {messages.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">Be the first to chat 👋</p>}
        {messages.map((m) => (
          <div key={m.id} className={`flex gap-2 text-sm ${m.is_system ? "rounded-lg bg-primary/10 p-2" : ""}`}>
            <span className={`font-semibold ${m.is_system ? "text-primary" : "text-live"}`}>
              {m.is_system ? <Sparkles className="inline h-3 w-3" /> : "@"}{m.username}:
            </span>
            <span className="text-foreground/90">{m.content}</span>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Bottom panel */}
      <div className="border-t border-border bg-card px-3 py-3">
        <div className="mb-2 flex items-end justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Current Item</p>
            <p className="text-sm font-bold">{stream.current_item || "—"}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Current Bid</p>
            <p className="text-lg font-bold text-primary">${Number(stream.current_bid || 0).toFixed(0)}</p>
          </div>
        </div>
        <button onClick={placeBid} className="w-full rounded-xl bg-primary py-3.5 text-base font-bold text-primary-foreground active:scale-[0.98] transition-transform">
          THIS IS MINE
        </button>
        {isSeller && (
          <button onClick={aiScan} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-xs font-semibold">
            <Sparkles className="h-3.5 w-3.5" /> AI Scan Card
          </button>
        )}
        <form onSubmit={handleSend} className="mt-2 flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={user ? "Say something..." : "Sign in to chat"} disabled={!user} className="flex-1 rounded-full bg-input px-4 py-2 text-sm outline-none disabled:opacity-50" />
          <button type="submit" className="rounded-full bg-primary p-2.5 text-primary-foreground"><Send className="h-4 w-4" /></button>
        </form>
      </div>
    </div>
  );
}
