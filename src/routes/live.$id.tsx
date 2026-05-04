import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Radio, Send, Sparkles, ArrowLeft, ChevronUp, ChevronDown, MessageCircle, X, Camera } from "lucide-react";
import { toast } from "sonner";
import { CardScanner } from "@/components/CardScanner";

export const Route = createFileRoute("/live/$id")({ component: LiveDetail });

function LiveDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const { user, profile } = useAuth();
  const [stream, setStream] = useState<any>(null);
  const [allStreams, setAllStreams] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [showChat, setShowChat] = useState(true);
  const [scanning, setScanning] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    supabase.from("live_streams").select("*").eq("is_active", true).order("created_at", { ascending: false }).then(({ data }) => setAllStreams(data || []));
  }, []);

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
    if (!profile && !isSystem) return toast.error("Sign in to chat");
    if (!content.trim()) return;
    await supabase.from("chat_messages").insert({
      stream_id: id, user_id: profile?.id || user?.id, username: isSystem ? "AI" : profile?.username || "guest", content, is_system: isSystem,
    });
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
    if (stream.seller_id !== user.id) {
      await supabase.from("notifications").insert({ user_id: stream.seller_id, type: "bid", body: `@${profile?.username} bid $${next} on "${stream.current_item || stream.title}"`, link: `/live/${id}` });
    }
  }

  function onScanResult(r: { name: string; category: string; trend: string }) {
    setScanning(false);
    if (!isSeller) return;
    supabase.from("live_streams").update({ current_item: r.name, current_bid: stream.starting_bid || 1 }).eq("id", id);
    sendMsg(`${r.name} — ${r.trend}`, true);
    toast.success("Card scanned");
  }

  function swipeStream(dir: 1 | -1) {
    if (!allStreams.length || !stream) return;
    const idx = allStreams.findIndex((s) => s.id === stream.id);
    const next = allStreams[(idx + dir + allStreams.length) % allStreams.length];
    if (next && next.id !== stream.id) nav({ to: "/live/$id", params: { id: next.id } });
  }

  function onTouchStart(e: React.TouchEvent) { touchStartX.current = e.touches[0].clientX; }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) > 60) swipeStream(dx < 0 ? 1 : -1);
  }

  if (!stream) return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Loading...</div>;

  const isSeller = user?.id === stream.seller_id;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Full-screen video background */}
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/30 via-black to-live/30">
        <Radio className="h-24 w-24 opacity-40" />
      </div>

      {/* Top bar */}
      <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between p-3">
        <Link to="/live" className="rounded-full bg-black/50 p-2 backdrop-blur"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="flex items-center gap-1 rounded-full bg-live px-2.5 py-1 text-[10px] font-bold">
          <span className="h-1.5 w-1.5 live-pulse rounded-full bg-live-foreground" /> LIVE
        </div>
        <button onClick={() => setShowChat((v) => !v)} className="rounded-full bg-black/50 p-2 backdrop-blur">
          {showChat ? <X className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
        </button>
      </div>

      {/* Title overlay */}
      <div className="absolute left-3 right-3 top-14 z-10">
        <p className="rounded-lg bg-black/40 px-3 py-1.5 text-sm font-semibold backdrop-blur">{stream.title}</p>
        {stream.item_description && <p className="mt-1 line-clamp-2 rounded-lg bg-black/30 px-3 py-1 text-[11px] backdrop-blur">{stream.item_description}</p>}
      </div>

      {/* Stream switcher arrows */}
      {allStreams.length > 1 && (
        <>
          <button onClick={() => swipeStream(-1)} className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 backdrop-blur"><ChevronUp className="h-5 w-5 -rotate-90" /></button>
          <button onClick={() => swipeStream(1)} className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 backdrop-blur"><ChevronDown className="h-5 w-5 -rotate-90" /></button>
        </>
      )}

      {/* Chat overlay (right side) */}
      {showChat && (
        <div className="absolute bottom-44 left-0 right-0 z-10 max-h-[40vh] overflow-y-auto px-3 pb-2">
          <div className="flex flex-col gap-1.5 items-start">
            {messages.slice(-30).map((m) => (
              <div key={m.id} className={`max-w-[85%] rounded-lg px-2.5 py-1 text-xs backdrop-blur ${m.is_system ? "bg-primary/40" : "bg-black/50"}`}>
                <span className={`mr-1 font-semibold ${m.is_system ? "text-primary-foreground" : "text-live-foreground"}`}>
                  {m.is_system ? <Sparkles className="inline h-3 w-3" /> : "@"}{m.username}:
                </span>
                <span>{m.content}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        </div>
      )}

      {/* Bottom panel */}
      <div className="absolute bottom-0 left-0 right-0 z-20 space-y-2 bg-gradient-to-t from-black via-black/80 to-transparent p-3 pt-6">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-white/60">Current Item</p>
            <p className="text-sm font-bold">{stream.current_item || "—"}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-white/60">{stream.listing_type === "buy_now" ? "Price" : "Current Bid"}</p>
            <p className="text-2xl font-bold text-primary">${Number(stream.current_bid || 0).toFixed(0)}</p>
          </div>
        </div>

        {!isSeller && (
          <button onClick={placeBid} className="w-full rounded-xl bg-primary py-3.5 text-base font-bold text-primary-foreground active:scale-[0.98]">
            THIS IS MINE
          </button>
        )}
        {isSeller && (
          <button onClick={() => setScanning(true)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-xs font-semibold text-accent-foreground">
            <Camera className="h-3.5 w-3.5" /> AI Scan Card
          </button>
        )}

        <form onSubmit={handleSend} className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={user ? "Say something..." : "Sign in to chat"} disabled={!user} className="flex-1 rounded-full bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/50 outline-none disabled:opacity-50" />
          <button type="submit" className="rounded-full bg-primary p-2.5 text-primary-foreground"><Send className="h-4 w-4" /></button>
        </form>
      </div>

      {scanning && <CardScanner onResult={onScanResult} onClose={() => setScanning(false)} />}
    </div>
  );
}
