import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Radio, Send, Sparkles, ArrowLeft, ChevronLeft, ChevronRight, MessageCircle, X, Camera, Square, Timer, Settings, Play, Trophy, Pin, PinOff, Share2 } from "lucide-react";
import { toast } from "sonner";
import { CardScanner } from "@/components/CardScanner";

export const Route = createFileRoute("/live/$id")({ component: LiveDetail });

function fmtRemaining(ms: number) {
  if (ms <= 0) return "00:00";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = (s % 60).toString().padStart(2, "0");
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = (m % 60).toString().padStart(2, "0");
    return `${h}:${mm}:${ss}`;
  }
  return `${m.toString().padStart(2, "0")}:${ss}`;
}

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
  const [now, setNow] = useState(Date.now());
  const [holdAdd, setHoldAdd] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [pinned, setPinned] = useState(true);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagResults, setTagResults] = useState<any[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUsers, setShareUsers] = useState<any[]>([]);
  const [shareQuery, setShareQuery] = useState("");
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const endedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const camStream = useRef<MediaStream | null>(null);

  const isSeller = !!user && stream && user.id === stream.seller_id;

  // Settings form state (seller)
  const [editDesc, setEditDesc] = useState("");
  const [editStartPrice, setEditStartPrice] = useState("");
  const [editTimerSec, setEditTimerSec] = useState("60");
  const [editShipPrice, setEditShipPrice] = useState("");
  const [editShipMethod, setEditShipMethod] = useState("USPS Ground");

  useEffect(() => {
    supabase.from("live_streams").select("*").eq("status", "live").order("created_at", { ascending: false }).then(({ data }) => setAllStreams(data || []));
  }, [id]);

  useEffect(() => {
    supabase.from("live_streams").select("*").eq("id", id).maybeSingle().then(({ data }) => {
      setStream(data);
      if (data) {
        setEditDesc(data.item_description || "");
        setEditStartPrice(String(data.starting_bid || 1));
        setEditShipPrice(String(data.shipping_price || 0));
        setEditShipMethod(data.shipping_method || "USPS Ground");
      }
    });
    supabase.from("chat_messages").select("*").eq("stream_id", id).order("created_at").then(({ data }) => setMessages(data || []));

    const ch = supabase.channel(`live-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `stream_id=eq.${id}` }, (p) => setMessages((m) => [...m, p.new]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_streams", filter: `id=eq.${id}` }, (p) => setStream(p.new))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // Seller: start camera preview
  useEffect(() => {
    if (!isSeller || !stream || stream.status !== "live") return;
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: true });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        camStream.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); }
      } catch {/* ignore */}
    })();
    return () => { cancelled = true; camStream.current?.getTracks().forEach((t) => t.stop()); camStream.current = null; };
  }, [isSeller, stream?.status]);

  const remaining = useMemo(() => stream?.ends_at ? new Date(stream.ends_at).getTime() - now : 0, [stream?.ends_at, now]);
  const auctionLive = !!stream?.ends_at && remaining > 0 && stream?.status === "live";
  const auctionFinished = !!stream?.ends_at && remaining <= 0;

  // Auto-end auction round when timer hits 0 (seller drives this)
  useEffect(() => {
    if (!isSeller || !stream || stream.status !== "live" || !stream.ends_at) return;
    if (endedRef.current) return;
    if (remaining <= 0) {
      endedRef.current = true;
      finalizeAuctionRound();
    }
  }, [remaining, isSeller, stream?.status]);

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

  async function placeBidAmount(amount: number) {
    if (!user || !profile) return toast.error("Sign in to bid");
    if (isSeller) return;
    if (stream.status !== "live") return toast.error("Auction ended");
    if (!auctionLive) return toast.error("Auction not running");
    const cur = Number(stream.current_bid || 0);
    if (amount <= cur) return toast.error(`Bid must be > $${cur}`);
    const prevBidder = stream.current_bidder_id;
    const { error } = await supabase.from("live_streams").update({ current_bid: amount, current_bidder_id: user.id }).eq("id", id);
    if (error) return toast.error(error.message);
    await sendMsg(`💎 ${profile.username} bid $${amount}`, true);
    if (stream.seller_id !== user.id) {
      await supabase.from("notifications").insert({ user_id: stream.seller_id, type: "bid", body: `@${profile.username} bid $${amount} on "${stream.current_item || stream.title}"`, link: `/live/${id}` });
    }
    if (prevBidder && prevBidder !== user.id) {
      await supabase.from("notifications").insert({ user_id: prevBidder, type: "outbid", body: `You were outbid on "${stream.current_item || stream.title}" — now $${amount}`, link: `/live/${id}` });
    }
  }

  async function startAuction() {
    if (!isSeller) return;
    const sec = Number(editTimerSec) || 60;
    const start = Number(editStartPrice) || 1;
    const ends_at = new Date(Date.now() + sec * 1000).toISOString();
    await supabase.from("live_streams").update({
      status: "live",
      listing_type: "auction",
      starting_bid: start,
      current_bid: start,
      current_bidder_id: null,
      item_description: editDesc || null,
      shipping_price: Number(editShipPrice) || 0,
      shipping_method: editShipMethod,
      ends_at,
      winner_id: null,
      winning_bid: null,
      winner_username: null,
    }).eq("id", id);
    endedRef.current = false;
    await sendMsg(`▶️ Auction started — ${sec}s, starting $${start}`, true);
    toast.success("Auction started");
    setShowSettings(false);
  }

  async function endAuctionNow() {
    if (!isSeller) return;
    await supabase.from("live_streams").update({ ends_at: new Date().toISOString() }).eq("id", id);
  }

  async function finalizeAuctionRound() {
    if (!stream) return;
    const winnerId = stream.current_bidder_id;
    const winningBid = Number(stream.current_bid || 0);
    let winnerUsername: string | null = null;
    if (winnerId) {
      const { data: p } = await supabase.from("profiles").select("username").eq("id", winnerId).maybeSingle();
      winnerUsername = p?.username || "buyer";
      await supabase.from("receipts").insert({
        stream_id: id, buyer_id: winnerId, seller_id: stream.seller_id,
        item_name: stream.current_item || stream.title,
        item_image_url: stream.item_image_url || null,
        amount: winningBid,
      });
      await supabase.from("notifications").insert({
        user_id: winnerId, type: "won",
        body: `🎉 You won "${stream.current_item || stream.title}" for $${winningBid}`,
        link: `/orders`,
      });
      await sendMsg(`🏆 Now owned by @${winnerUsername} — $${winningBid}`, true);
    } else {
      await sendMsg(`🏁 Auction ended with no bids`, true);
    }
    await supabase.from("live_streams").update({
      winner_id: winnerId, winning_bid: winningBid, winner_username: winnerUsername,
    }).eq("id", id);
  }

  async function endLive() {
    if (!isSeller) return;
    if (auctionLive) await finalizeAuctionRound();
    await supabase.from("live_streams").update({
      status: "ended", is_active: false, ended_at: new Date().toISOString(),
    }).eq("id", id);
    await sendMsg(`🛑 Live ended`, true);
    toast.success("Live ended");
    camStream.current?.getTracks().forEach((t) => t.stop());
  }

  function onScanResult(r: { name: string; category: string; trend: string; image: string }) {
    setScanning(false);
    if (!isSeller) return;
    supabase.from("live_streams").update({
      current_item: r.name,
      current_bid: Number(editStartPrice) || stream.starting_bid || 1,
      current_bidder_id: null,
      item_image_url: r.image,
    }).eq("id", id);
    sendMsg(`${r.name} — ${r.trend}`, true);
    toast.success("Card scanned");
  }

  function swipeStream(dir: 1 | -1) {
    if (!allStreams.length || !stream) return;
    const idx = allStreams.findIndex((s) => s.id === stream.id);
    if (idx < 0) return;
    const next = allStreams[(idx + dir + allStreams.length) % allStreams.length];
    if (next && next.id !== stream.id) nav({ to: "/live/$id", params: { id: next.id } });
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null || touchStartY.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null; touchStartY.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) swipeStream(dx < 0 ? 1 : -1);
  }

  function startHold(e: React.PointerEvent) {
    e.preventDefault();
    if (isSeller || !stream) return;
    setHoldAdd(0);
    const startY = e.clientY;
    let lastStep = 0;
    const move = (ev: PointerEvent) => {
      const dy = startY - ev.clientY;
      const steps = Math.max(0, Math.floor(dy / 40));
      if (steps !== lastStep) { lastStep = steps; setHoldAdd(steps * 3); }
    };
    const up = async () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      const inc = Number(stream.min_bid_increment || 1);
      const add = lastStep > 0 ? lastStep * 3 : inc;
      const next = Number(stream.current_bid || 0) + add;
      setHoldAdd(0);
      await placeBidAmount(next);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  if (!stream) return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Loading...</div>;

  const ended = stream.status === "ended";
  const bidDisabled = isSeller || ended || !auctionLive;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Full-screen video */}
      <div className="absolute inset-0">
        {isSeller ? (
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/30 via-black to-live/30">
            <Radio className="h-24 w-24 opacity-40" />
          </div>
        )}
      </div>

      {/* Top bar */}
      <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between p-3">
        <Link to="/live" className="rounded-full bg-black/50 p-2 backdrop-blur"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${ended ? "bg-muted text-muted-foreground" : "bg-live"}`}>
            {!ended && <span className="h-1.5 w-1.5 live-pulse rounded-full bg-live-foreground" />} {ended ? "ENDED" : "LIVE"}
          </div>
          {auctionLive && (
            <div className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold backdrop-blur">
              <Timer className="h-3 w-3" /> {fmtRemaining(remaining)}
            </div>
          )}
        </div>
        <div className="flex gap-1">
          {isSeller && !ended && (
            <button onClick={() => setShowSettings((v) => !v)} className="rounded-full bg-black/50 p-2 backdrop-blur"><Settings className="h-4 w-4" /></button>
          )}
          <button onClick={() => setShowChat((v) => !v)} className="rounded-full bg-black/50 p-2 backdrop-blur">
            {showChat ? <X className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Title overlay */}
      <div className="absolute left-3 right-3 top-14 z-10">
        <p className="rounded-lg bg-black/40 px-3 py-1.5 text-sm font-semibold backdrop-blur">{stream.title}</p>
        {stream.item_description && <p className="mt-1 line-clamp-2 rounded-lg bg-black/30 px-3 py-1 text-[11px] backdrop-blur">{stream.item_description}</p>}
        {(stream.shipping_price != null && Number(stream.shipping_price) > 0) || stream.shipping_method ? (
          <p className="mt-1 inline-block rounded-lg bg-black/30 px-3 py-1 text-[10px] backdrop-blur">
            📦 {stream.shipping_method || "Shipping"} — ${Number(stream.shipping_price || 0).toFixed(2)}
          </p>
        ) : null}
      </div>

      {/* Winner banner */}
      {(auctionFinished || ended) && stream.winner_username && (
        <div className="absolute left-3 right-3 top-32 z-10 rounded-xl bg-primary/80 p-3 text-center backdrop-blur">
          <Trophy className="mx-auto h-5 w-5" />
          <p className="mt-1 text-sm font-bold">Now owned by @{stream.winner_username}</p>
          <p className="text-xs">Final bid: ${Number(stream.winning_bid || 0).toFixed(2)}</p>
        </div>
      )}

      {/* Stream switcher */}
      {allStreams.length > 1 && !ended && (
        <>
          <button onClick={() => swipeStream(-1)} className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 backdrop-blur"><ChevronLeft className="h-5 w-5" /></button>
          <button onClick={() => swipeStream(1)} className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 backdrop-blur"><ChevronRight className="h-5 w-5" /></button>
        </>
      )}

      {/* Seller settings panel */}
      {isSeller && showSettings && !ended && (
        <div className="absolute inset-x-3 top-24 z-30 max-h-[60vh] overflow-y-auto rounded-2xl bg-card/95 p-4 text-foreground shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold">Item & Auction</p>
            <button onClick={() => setShowSettings(false)}><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-2">
            <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2} placeholder="Item description" className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none" />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" min="1" value={editStartPrice} onChange={(e) => setEditStartPrice(e.target.value)} placeholder="Start price ($)" className="rounded-lg bg-input px-3 py-2 text-xs outline-none" />
              <select value={editTimerSec} onChange={(e) => setEditTimerSec(e.target.value)} className="rounded-lg bg-input px-3 py-2 text-xs outline-none">
                <option value="30">30s</option>
                <option value="60">60s</option>
                <option value="120">2 min</option>
                <option value="300">5 min</option>
                <option value="600">10 min</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" min="0" step="0.01" value={editShipPrice} onChange={(e) => setEditShipPrice(e.target.value)} placeholder="Shipping ($)" className="rounded-lg bg-input px-3 py-2 text-xs outline-none" />
              <input value={editShipMethod} onChange={(e) => setEditShipMethod(e.target.value)} placeholder="Method" className="rounded-lg bg-input px-3 py-2 text-xs outline-none" />
            </div>
            <button onClick={startAuction} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-xs font-bold text-primary-foreground">
              <Play className="h-3.5 w-3.5" /> {auctionLive ? "Restart Auction" : "Start Auction"}
            </button>
          </div>
        </div>
      )}

      {/* Chat overlay */}
      {showChat && (
        <div className="absolute bottom-44 left-0 right-0 z-10 max-h-[35vh] overflow-y-auto px-3 pb-2">
          <div className="flex flex-col items-start gap-1.5">
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
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wide text-white/60">Current Item</p>
            <p className="line-clamp-1 text-sm font-bold">{stream.current_item || "—"}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-white/60">{ended || auctionFinished ? "Final" : "Current Bid"}</p>
            <p className="text-2xl font-bold text-primary">${Number(stream.current_bid || 0).toFixed(0)}</p>
          </div>
        </div>

        {!isSeller && (
          <button
            onPointerDown={bidDisabled ? undefined : startHold}
            disabled={bidDisabled}
            className="w-full select-none rounded-xl bg-primary py-3.5 text-base font-bold text-primary-foreground active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            {bidDisabled
              ? (auctionFinished || ended ? "Auction Ended" : "Waiting for auction...")
              : (holdAdd > 0 ? `+$${holdAdd} — release to bid` : "THIS IS MINE  ↑ hold & swipe up for +$3")}
          </button>
        )}
        {isSeller && !ended && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setScanning(true)} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-accent py-2.5 text-xs font-semibold text-accent-foreground">
              <Camera className="h-3.5 w-3.5" /> Scan
            </button>
            {!auctionLive ? (
              <button onClick={() => setShowSettings(true)} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground">
                <Play className="h-3.5 w-3.5" /> Start Auction
              </button>
            ) : (
              <button onClick={endAuctionNow} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-accent py-2.5 text-xs font-bold text-accent-foreground">
                <Square className="h-3.5 w-3.5" /> End Auction
              </button>
            )}
            <button onClick={endLive} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-live py-2.5 text-xs font-bold text-live-foreground">
              <Square className="h-3.5 w-3.5" /> End Live
            </button>
          </div>
        )}
        {ended && (
          <div className="rounded-xl bg-card/20 p-3 text-center text-xs backdrop-blur">
            {stream.winner_id ? `Sold to @${stream.winner_username || "buyer"} for $${Number(stream.winning_bid || 0).toFixed(2)}` : "Live ended"}
          </div>
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
