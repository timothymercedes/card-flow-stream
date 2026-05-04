import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Radio, Send, Sparkles, ArrowLeft, ChevronLeft, ChevronRight, MessageCircle, X, Camera, Square, Timer, Settings, Play, Trophy, Pin, PinOff, Share2, Megaphone, Copy, Shield, ShieldPlus, Trash2, Zap, Users, Dice5, Globe, VolumeX, Ban, Clock as ClockIcon } from "lucide-react";
import { toast } from "sonner";
import { CardScanner } from "@/components/CardScanner";
import { HlsPlayer } from "@/components/HlsPlayer";
import { useCurrency, SUPPORTED_CURRENCIES, type Currency } from "@/lib/currency";

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
  const [sellerUsername, setSellerUsername] = useState<string>("");
  const [allStreams, setAllStreams] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [showChat, setShowChat] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [holdAdd, setHoldAdd] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [pinned, setPinned] = useState(true);
  const [hiddenSysIds, setHiddenSysIds] = useState<Set<string>>(new Set());
  const snapshotRef = useRef(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagResults, setTagResults] = useState<any[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUsers, setShareUsers] = useState<any[]>([]);
  const [shareQuery, setShareQuery] = useState("");
  const [shoutoutOpen, setShoutoutOpen] = useState(false);
  const [shoutoutMsg, setShoutoutMsg] = useState("");
  const [shoutoutAmt, setShoutoutAmt] = useState(5);
  const [shoutouts, setShoutouts] = useState<any[]>([]);
  const [mySpent, setMySpent] = useState(0);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const endedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const camStream = useRef<MediaStream | null>(null);

  // Mods, mod-chat, announcements, AI hype overlay
  const [mods, setMods] = useState<any[]>([]);
  const [modChat, setModChat] = useState<any[]>([]);
  const [showModPanel, setShowModPanel] = useState(false);
  const [modSearchQ, setModSearchQ] = useState("");
  const [modSearchRes, setModSearchRes] = useState<any[]>([]);
  const [modInput, setModInput] = useState("");
  const [annOpen, setAnnOpen] = useState(false);
  const [annText, setAnnText] = useState("");
  const [hypeCard, setHypeCard] = useState<{ name: string; category: string; set_guess: string; rarity_vibe: string; image: string } | null>(null);

  // 🆕 Anti-snipe banner
  const [snipeFlash, setSnipeFlash] = useState(false);
  // 🆕 Snipe / buy-now-during-live
  const [snipePriceInput, setSnipePriceInput] = useState("");
  // 🆕 Chat moderation actions
  const [chatActions, setChatActions] = useState<any[]>([]);
  const [chatActionMenu, setChatActionMenu] = useState<{ userId: string; username: string } | null>(null);
  // 🆕 Mystery break (team draw)
  const [breakSlots, setBreakSlots] = useState<any[]>([]);
  const [showBreakPanel, setShowBreakPanel] = useState(false);
  const [breakTeamsInput, setBreakTeamsInput] = useState("");
  const [breakPrice, setBreakPrice] = useState("10");
  const [drawAnim, setDrawAnim] = useState(false);
  // 🆕 Currency display preference (per-viewer)
  const [viewerCurrency, setViewerCurrency] = useState<Currency>("USD");
  const { fmt: fmtMoney } = useCurrency(viewerCurrency);

  const isMod = !!user && mods.some((m) => m.mod_user_id === user.id);
  const isStaff = !!user && (mods.some((m) => m.mod_user_id === user.id) || (stream && user.id === stream.seller_id));

  const isSeller = !!user && stream && user.id === stream.seller_id;

  // Settings form state (seller)
  const [editDesc, setEditDesc] = useState("");
  const [editStartPrice, setEditStartPrice] = useState("");
  const [editTimerSec, setEditTimerSec] = useState("30");
  const [editShipPrice, setEditShipPrice] = useState("");
  const [editShipMethod, setEditShipMethod] = useState("USPS Ground");

  useEffect(() => {
    supabase.from("live_streams").select("*").eq("status", "live").order("created_at", { ascending: false }).then(({ data }) => setAllStreams(data || []));
  }, [id]);

  useEffect(() => {
    supabase.from("live_streams").select("*").eq("id", id).maybeSingle().then(async ({ data }) => {
      setStream(data);
      if (data) {
        setEditDesc(data.item_description || "");
        setEditStartPrice(String(data.starting_bid || 1));
        setEditShipPrice(String(data.shipping_price || 0));
        setEditShipMethod(data.shipping_method || "USPS Ground");
        const { data: sp } = await supabase.from("profiles").select("username").eq("id", data.seller_id).maybeSingle();
        if (sp?.username) setSellerUsername(sp.username);
      }
    });
    supabase.from("chat_messages").select("*").eq("stream_id", id).order("created_at").then(({ data }) => setMessages(data || []));
    supabase.from("stream_shoutouts").select("*").eq("stream_id", id).order("created_at", { ascending: false }).then(({ data }) => setShoutouts(data || []));
    supabase.from("stream_moderators").select("*").eq("stream_id", id).then(({ data }) => setMods(data || []));
    supabase.from("stream_chat_actions").select("*").eq("stream_id", id).order("created_at", { ascending: false }).then(({ data }) => setChatActions(data || []));
    supabase.from("break_slots").select("*").eq("stream_id", id).order("created_at").then(({ data }) => setBreakSlots(data || []));

    const ch = supabase.channel(`live-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `stream_id=eq.${id}` }, (p) => setMessages((m) => [...m, p.new]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_streams", filter: `id=eq.${id}` }, (p) => {
        const next = p.new as any;
        // 🆕 Detect anti-snipe extension to flash UI
        setStream((prev: any) => {
          if (prev && next.snipe_extends > (prev.snipe_extends || 0)) {
            setSnipeFlash(true);
            setTimeout(() => setSnipeFlash(false), 1500);
          }
          return next;
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "stream_shoutouts", filter: `stream_id=eq.${id}` }, (p) => setShoutouts((s) => [p.new, ...s]))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "stream_moderators", filter: `stream_id=eq.${id}` }, (p) => setMods((m) => [...m, p.new]))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "stream_moderators", filter: `stream_id=eq.${id}` }, (p) => setMods((m) => m.filter((x) => x.id !== (p.old as any).id)))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "stream_mod_messages", filter: `stream_id=eq.${id}` }, (p) => setModChat((m) => [...m, p.new]))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "stream_chat_actions", filter: `stream_id=eq.${id}` }, (p) => setChatActions((a) => [p.new, ...a]))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "break_slots", filter: `stream_id=eq.${id}` }, (p) => setBreakSlots((s) => [...s, p.new]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "break_slots", filter: `stream_id=eq.${id}` }, (p) => setBreakSlots((s) => s.map((x) => x.id === (p.new as any).id ? p.new : x)))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  // 🆕 Load viewer's preferred currency
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("preferred_currency").eq("id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.preferred_currency) setViewerCurrency(data.preferred_currency as Currency); });
  }, [user?.id]);

  // Load mod chat once user is known to be staff
  useEffect(() => {
    if (!isStaff) { setModChat([]); return; }
    supabase.from("stream_mod_messages").select("*").eq("stream_id", id).order("created_at").then(({ data }) => setModChat(data || []));
  }, [isStaff, id]);

  // Auto-hide AI hype overlay after 5s
  useEffect(() => {
    if (!hypeCard) return;
    const t = setTimeout(() => setHypeCard(null), 5000);
    return () => clearTimeout(t);
  }, [hypeCard]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // Seller: start camera preview (skip if seller is broadcasting via OBS)
  const usingObs = !!stream?.cf_playback_hls;
  useEffect(() => {
    if (!isSeller || !stream || stream.status !== "live" || usingObs) return;
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
  }, [isSeller, stream?.status, usingObs]);

  const remaining = useMemo(() => stream?.ends_at ? new Date(stream.ends_at).getTime() - now : 0, [stream?.ends_at, now]);
  const auctionLive = !!stream?.ends_at && remaining > 0 && stream?.status === "live";
  const auctionFinished = !!stream?.ends_at && remaining <= 0;

  // Auto-end auction round when timer hits 0 (seller drives this); snapshot at T-2s
  useEffect(() => {
    if (!isSeller || !stream || stream.status !== "live" || !stream.ends_at) return;
    if (!snapshotRef.current && remaining > 0 && remaining <= 2000) {
      snapshotRef.current = true;
      captureSnapshot();
    }
    if (endedRef.current) return;
    if (remaining <= 0) {
      endedRef.current = true;
      finalizeAuctionRound();
    }
  }, [remaining, isSeller, stream?.status]);

  // Auto-hide system notifications after 5s
  useEffect(() => {
    const sysMsgs = messages.filter((m) => m.is_system && !hiddenSysIds.has(m.id));
    const timers = sysMsgs.map((m) => {
      const age = Date.now() - new Date(m.created_at).getTime();
      const remain = Math.max(0, 5000 - age);
      return setTimeout(() => {
        setHiddenSysIds((s) => new Set(s).add(m.id));
      }, remain);
    });
    return () => timers.forEach(clearTimeout);
  }, [messages]);

  async function captureSnapshot(): Promise<string | null> {
    try {
      const v = videoRef.current;
      if (!v || !v.videoWidth) return null;
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth; canvas.height = v.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(v, 0, 0);
      const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.85));
      if (!blob) return null;
      const path = `${user!.id}/${id}-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from("order-snapshots").upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (error) { console.error(error); return null; }
      const { data: pub } = supabase.storage.from("order-snapshots").getPublicUrl(path);
      const url = pub.publicUrl;
      await supabase.from("live_streams").update({ item_image_url: url }).eq("id", id);
      return url;
    } catch (e) { console.error(e); return null; }
  }

  async function sendMsg(content: string, isSystem = false, opts: { isAnnouncement?: boolean; isHype?: boolean; usernameOverride?: string } = {}) {
    if (!profile && !isSystem) return toast.error("Sign in to chat");
    if (!content.trim()) return;
    await supabase.from("chat_messages").insert({
      stream_id: id,
      user_id: profile?.id || user?.id,
      username: opts.usernameOverride || (isSystem ? "AI" : profile?.username || "guest"),
      content,
      is_system: isSystem,
      is_announcement: !!opts.isAnnouncement,
      is_hype: !!opts.isHype,
    });
  }

  // ---- Mod management ----
  async function addModBySearch(u: { id: string; username: string }) {
    if (!isSeller || !user) return;
    if (u.id === user.id) return toast.error("You're already the host");
    const { error } = await supabase.from("stream_moderators").insert({
      stream_id: id, host_id: user.id, mod_user_id: u.id, mod_username: u.username,
    });
    if (error) return toast.error(error.message);
    await supabase.from("notifications").insert({
      user_id: u.id, type: "mod_added", body: `🛡️ You're now a mod for "${stream.title}"`, link: `/live/${id}`,
    });
    toast.success(`@${u.username} added as mod`);
    setModSearchQ(""); setModSearchRes([]);
  }
  async function removeMod(modId: string) {
    if (!isSeller) return;
    await supabase.from("stream_moderators").delete().eq("id", modId);
  }
  async function sendModMsg() {
    if (!isStaff || !user || !profile) return;
    const t = modInput.trim(); if (!t) return;
    const { error } = await supabase.from("stream_mod_messages").insert({
      stream_id: id, user_id: user.id, username: profile.username, content: t,
    });
    if (error) return toast.error(error.message);
    setModInput("");
  }
  async function postAnnouncement() {
    if (!isStaff || !user || !profile) return;
    const t = annText.trim(); if (!t) return;
    await sendMsg(`📢 ${t}`, false, { isAnnouncement: true });
    setAnnText(""); setAnnOpen(false);
    toast.success("Announcement posted");
  }

  // 🆕 Compute who is currently muted/banned in chat (latest action wins per user)
  const chatBlockSet = useMemo(() => {
    const latest: Record<string, any> = {};
    for (const a of [...chatActions].sort((x, y) => +new Date(x.created_at) - +new Date(y.created_at))) {
      latest[a.target_user_id] = a;
    }
    const blocked = new Set<string>();
    for (const [uid, a] of Object.entries(latest)) {
      if (a.action === "ban" || a.action === "mute") blocked.add(uid);
      if (a.action === "timeout" && a.expires_at && +new Date(a.expires_at) > Date.now()) blocked.add(uid);
      if (a.action === "unmute" || a.action === "unban") blocked.delete(uid);
    }
    return blocked;
  }, [chatActions]);
  const meBlocked = !!user && chatBlockSet.has(user.id);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (meBlocked) return toast.error("You can't chat right now (muted by mod)");
    await sendMsg(input);
    setInput("");
  }

  // 🆕 Anti-snipe: if a bid lands in the final 3s, extend the timer by +5s.
  // Different from Whatnot's flat 10s/15s — we use a 3s/5s nibble that
  // resets snappily and shows a fun "⚡ +5s OVERTIME" flash.
  async function placeBidAmount(amount: number) {
    if (!user || !profile) return toast.error("Sign in to bid");
    if (isSeller) return;
    if (meBlocked) return toast.error("You're banned/muted in this stream");
    if (stream.status !== "live") return toast.error("Auction ended");
    if (!auctionLive) return toast.error("Auction not running");
    const cur = Number(stream.current_bid || 0);
    if (amount <= cur) return toast.error(`Bid must be > $${cur}`);
    const prevBidder = stream.current_bidder_id;

    const update: any = { current_bid: amount, current_bidder_id: user.id };
    const remainingMs = stream.ends_at ? new Date(stream.ends_at).getTime() - Date.now() : 0;
    let extended = false;
    if (remainingMs > 0 && remainingMs <= 3000) {
      // Add 5s + 1 to extends counter
      const newEnd = new Date(Date.now() + 5000 + Math.max(remainingMs - 0, 0)).toISOString();
      // Simpler: ensure at least 5s left from now
      update.ends_at = new Date(Math.max(new Date(stream.ends_at).getTime(), Date.now()) + 5000).toISOString();
      update.snipe_extends = Number(stream.snipe_extends || 0) + 1;
      extended = true;
    }

    const { error } = await supabase.from("live_streams").update(update).eq("id", id);
    if (error) return toast.error(error.message);

    if (extended) {
      // Reset auto-end + snapshot guards so the new countdown can re-trigger
      endedRef.current = false;
      snapshotRef.current = false;
      await sendMsg(`⚡ OVERTIME +5s — @${profile.username} struck in the final 3s!`, true);
    }
    await sendMsg(`💎 ${profile.username} bid $${amount}`, true);
    if (stream.seller_id !== user.id) {
      await supabase.from("notifications").insert({ user_id: stream.seller_id, type: "bid", body: `@${profile.username} bid $${amount} on "${stream.current_item || stream.title}"`, link: `/live/${id}` });
    }
    if (prevBidder && prevBidder !== user.id) {
      await supabase.from("notifications").insert({ user_id: prevBidder, type: "outbid", body: `You were outbid on "${stream.current_item || stream.title}" — now $${amount}`, link: `/live/${id}` });
    }
    // Notify the new top bidder they're winning
    await supabase.from("notifications").insert({ user_id: user.id, type: "winning", body: `🥇 You're winning "${stream.current_item || stream.title}" at $${amount}`, link: `/live/${id}` });
  }

  // 🆕 Buy-now snipe: instantly win at the host's snipe price
  async function buyNowSnipe() {
    if (!user || !profile || !stream?.snipe_price) return;
    if (isSeller) return;
    if (!auctionLive) return toast.error("No active auction");
    const price = Number(stream.snipe_price);
    // Force win: set bid to snipe price + bidder = me, then end immediately
    const { error } = await supabase.from("live_streams").update({
      current_bid: price, current_bidder_id: user.id,
      ends_at: new Date(Date.now() + 1500).toISOString(),
      snipe_price: null,
    }).eq("id", id);
    if (error) return toast.error(error.message);
    endedRef.current = false; snapshotRef.current = false;
    await sendMsg(`💥 SNIPE! @${profile.username} hit Buy-Now for $${price} — instant win!`, true);
  }

  // 🆕 Mod chat action — mute/timeout/ban/unblock
  async function chatAction(target: { userId: string; username: string }, action: "mute" | "timeout" | "ban" | "unmute" | "unban", minutes = 5) {
    if (!isStaff || !user) return;
    const expires_at = action === "timeout" ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
    const { error } = await supabase.from("stream_chat_actions").insert({
      stream_id: id, target_user_id: target.userId, target_username: target.username,
      action, by_user_id: user.id, expires_at,
    });
    if (error) return toast.error(error.message);
    const labels: Record<string, string> = { mute: "muted 🔇", timeout: `timed out for ${minutes}m ⏱️`, ban: "banned 🚫", unmute: "unmuted ✅", unban: "unbanned ✅" };
    toast.success(`@${target.username} ${labels[action]}`);
    setChatActionMenu(null);
  }

  // 🆕 Mystery break: random team draw across paid slots
  async function startBreakMode() {
    if (!isSeller) return;
    const teams = breakTeamsInput.split(",").map((s) => s.trim()).filter(Boolean);
    if (teams.length < 2) return toast.error("List at least 2 teams (comma-separated)");
    await supabase.from("live_streams").update({
      break_mode: "open",
      break_teams: teams,
    }).eq("id", id);
    setShowBreakPanel(false);
    await sendMsg(`🎲 BREAK OPEN — ${teams.length} teams, $${breakPrice}/slot. Hit "Claim Slot" below!`, true);
    toast.success("Break opened");
  }

  async function claimBreakSlot() {
    if (!user || !profile || !stream?.break_teams) return;
    if (isSeller) return toast.error("Host can't claim slots");
    const price = Number(breakPrice) || 10;
    const { error } = await supabase.from("break_slots").insert({
      stream_id: id, buyer_id: user.id, buyer_username: profile.username, amount: price,
    });
    if (error) return toast.error(error.message);
    await sendMsg(`🎟️ @${profile.username} claimed a break slot ($${price})`, true);
    toast.success("Slot claimed — wait for the draw!");
  }

  async function drawBreakTeams() {
    if (!isSeller || !stream?.break_teams) return;
    const teams = [...(stream.break_teams as string[])];
    const slots = breakSlots.filter((s) => !s.team_label);
    if (slots.length === 0) return toast.error("No unassigned slots");
    setDrawAnim(true);
    // Fisher-Yates on teams; assign one team per slot (cycle if more slots than teams)
    for (let i = teams.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [teams[i], teams[j]] = [teams[j], teams[i]];
    }
    setTimeout(async () => {
      for (let i = 0; i < slots.length; i++) {
        const team = teams[i % teams.length];
        await supabase.from("break_slots").update({
          team_label: team, assigned_at: new Date().toISOString(),
        }).eq("id", slots[i].id);
        await sendMsg(`🎉 @${slots[i].buyer_username} pulled ${team}!`, true);
      }
      await supabase.from("live_streams").update({ break_mode: "closed" }).eq("id", id);
      setDrawAnim(false);
      toast.success("Teams drawn!");
    }, 2200);
  }

  async function setSnipePriceNow() {
    if (!isSeller) return;
    const v = Number(snipePriceInput);
    if (!v || v <= Number(stream.current_bid || 0)) return toast.error("Snipe price must be above current bid");
    await supabase.from("live_streams").update({ snipe_price: v }).eq("id", id);
    await sendMsg(`💸 Buy-Now SNIPE set at $${v} — first to hit it wins instantly!`, true);
    setSnipePriceInput("");
    toast.success("Snipe price set");
  }

  async function saveCurrencyPref(c: Currency) {
    setViewerCurrency(c);
    if (!user) return;
    await supabase.from("profiles").update({ preferred_currency: c }).eq("id", user.id);
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
      snipe_extends: 0,
      snipe_price: null,
    }).eq("id", id);
    endedRef.current = false;
    await sendMsg(`▶️ Auction started — ${sec}s, starting $${start}`, true);
    toast.success("Auction started");
    setShowSettings(false);
  }

  // Auction ends only by timer (no manual end button for host)

  async function shareLiveTo(recipientId: string, recipientUsername: string) {
    if (!user || !profile) return toast.error("Sign in to share");
    const link = `/live/${id}`;
    const content = `📺 Check out this live: "${stream.title}" ${window.location.origin}${link}`;
    await supabase.from("direct_messages").insert({
      sender_id: user.id, sender_username: profile.username,
      recipient_id: recipientId, content,
    });
    await supabase.from("notifications").insert({
      user_id: recipientId, type: "share", body: `@${profile.username} shared a live with you`, link,
    });
    toast.success(`Shared with @${recipientUsername}`);
    setShareOpen(false); setShareQuery("");
  }

  async function searchUsers(q: string, setter: (rows: any[]) => void) {
    if (!q.trim()) return setter([]);
    const { data } = await supabase.from("profiles").select("id,username,avatar_url").ilike("username", `%${q}%`).limit(8);
    setter(data || []);
  }

  // Compute how much current viewer already spent on shout-outs in this stream
  useEffect(() => {
    if (!user) { setMySpent(0); return; }
    const total = shoutouts.filter((s) => s.buyer_id === user.id).reduce((a, b) => a + Number(b.amount || 0), 0);
    setMySpent(total);
  }, [shoutouts, user]);

  async function sendShoutout() {
    if (!user || !profile) return toast.error("Sign in to send a shout-out");
    if (isSeller) return toast.error("Sellers can't shout out themselves");
    const msg = shoutoutMsg.trim();
    if (!msg) return toast.error("Tell the seller what to shout!");
    if (msg.length > 140) return toast.error("Keep it under 140 chars");
    const amt = Math.max(5, Math.min(50, Number(shoutoutAmt) || 5));
    const remaining = 50 - mySpent;
    if (amt > remaining) return toast.error(`You have $${remaining} shout-out budget left for this stream`);
    const { error } = await supabase.from("stream_shoutouts").insert({
      stream_id: id, seller_id: stream.seller_id, buyer_id: user.id,
      buyer_username: profile.username, message: msg, amount: amt,
    });
    if (error) return toast.error(error.message);
    await sendMsg(`📣 @${profile.username} sent a $${amt} shout-out: "${msg}"`, true);
    await supabase.from("notifications").insert({
      user_id: stream.seller_id, type: "shoutout",
      body: `📣 @${profile.username} ($${amt}): "${msg}"`,
      link: `/live/${id}`,
    });
    toast.success("Shout-out sent! (safe mode — no real charge)");
    setShoutoutOpen(false); setShoutoutMsg(""); setShoutoutAmt(5);
  }

  async function finalizeAuctionRound() {
    if (!stream) return;
    const winnerId = stream.current_bidder_id;
    const winningBid = Number(stream.current_bid || 0);
    // Ensure we have a snapshot if not already captured
    let snapshot = stream.item_image_url;
    if (!snapshot && isSeller) snapshot = await captureSnapshot();
    if (winnerId) {
      const { data: p } = await supabase.from("profiles").select("username, address_line1, address_city, address_state, address_zip, address_country, full_name").eq("id", winnerId).maybeSingle();
      const winnerUsername = p?.username || "buyer";
      // Bid number for THIS sale on the stream — only increments when an item sells
      const nextRound = Number(stream.round_number || 0) + 1;
      const itemName = stream.current_item || stream.title;
      const labeledTitle = `Bid #${nextRound} — ${itemName}`;
      // Pull seller's combined-shipping cap (per buyer, per checkout)
      const { data: sp } = await supabase.from("profiles").select("shipping_cap").eq("id", stream.seller_id).maybeSingle();
      const cap = sp?.shipping_cap == null ? null : Number(sp.shipping_cap);
      const rawShip = Number(stream.shipping_price || 0);
      // Sum shipping already on this buyer's open orders from this seller — apply cap
      const { data: openOrders } = await supabase.from("orders")
        .select("amount, listing_id, stream_id")
        .eq("buyer_id", winnerId).eq("seller_id", stream.seller_id)
        .eq("payment_status", "awaiting_payment");
      const priorShip = (openOrders || []).reduce((a: number, _o: any) => a, 0);
      const shipForThis = cap != null ? Math.max(0, Math.min(rawShip, cap - priorShip)) : rawShip;
      await supabase.from("receipts").insert({
        stream_id: id, buyer_id: winnerId, seller_id: stream.seller_id,
        item_name: labeledTitle,
        item_image_url: snapshot || null,
        amount: winningBid,
      });
      // Create order so it appears in buyer's "My Orders" and seller's "My Store"
      // SAFE MODE: order starts as awaiting_payment — buyer must click "Pay Now" later
      await supabase.from("orders").insert({
        buyer_id: winnerId, seller_id: stream.seller_id,
        title: labeledTitle,
        description: stream.item_description || null,
        amount: winningBid + shipForThis,
        item_image_url: snapshot || null,
        stream_id: id,
        condition: stream.current_condition || null,
        status: "pending",
        payment_status: "awaiting_payment",
        ship_name: p?.full_name || winnerUsername,
        ship_address: p?.address_line1 || "",
        ship_city: p?.address_city || "",
        ship_state: p?.address_state || "",
        ship_zip: p?.address_zip || "",
        ship_country: p?.address_country || "US",
      });
      await supabase.from("notifications").insert({
        user_id: winnerId, type: "won",
        body: `🎉 You won Bid #${nextRound} "${itemName}" for $${winningBid}`,
        link: `/orders`,
      });
      await sendMsg(`🏆 Bid #${nextRound} — "${itemName}" sold to @${winnerUsername} for $${winningBid}`, true);
      await supabase.from("live_streams").update({
        winner_id: winnerId, winning_bid: winningBid, winner_username: winnerUsername,
        round_number: nextRound,
      }).eq("id", id);
      // Clear winner banner + ends_at after 5s
      setTimeout(async () => {
        await supabase.from("live_streams").update({
          ends_at: null, winner_id: null, winning_bid: null, winner_username: null, current_bidder_id: null,
        }).eq("id", id);
        endedRef.current = false;
        snapshotRef.current = false;
      }, 5000);
    } else {
      // No winner: silently clear after 5s, no banner/notif
      setTimeout(async () => {
        await supabase.from("live_streams").update({ ends_at: null }).eq("id", id);
        endedRef.current = false;
        snapshotRef.current = false;
      }, 5000);
    }
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
    nav({ to: "/store" });
  }

  async function onScanResult(r: { name: string; category: string; trend: string; image: string; language?: string }) {
    setScanning(false);
    if (!isSeller) return;
    const useQuick = !!stream.quick_start_enabled && !auctionLive;
    const start = Number(stream.default_starting_bid || editStartPrice || 1);
    const sec = Number(stream.default_timer_sec || editTimerSec || 30);
    const cond = stream.default_condition || null;

    // Get HYPE-only AI blurb (NEVER prices) for live streams
    let hypeName = r.name;
    let hypeCategory = r.category;
    let hypeSet = "";
    let hypeVibe = r.trend || "Solid Pickup 💪";
    let hypeLines: string[] = [];
    try {
      const { data: hype, error: hypeErr } = await supabase.functions.invoke("live-card-hype", {
        body: { image: r.image, language: r.language },
      });
      if (!hypeErr && hype) {
        hypeName = hype.name || hypeName;
        hypeCategory = hype.category || hypeCategory;
        hypeSet = hype.set_guess || "";
        hypeVibe = hype.rarity_vibe || hypeVibe;
        hypeLines = Array.isArray(hype.hype_lines) ? hype.hype_lines : [];
      }
    } catch {/* fall back to scan */}

    // Show 5-second card overlay (price-free)
    setHypeCard({ name: hypeName, category: hypeCategory, set_guess: hypeSet, rarity_vibe: hypeVibe, image: r.image });

    const update: any = {
      current_item: hypeName,
      current_bid: start,
      current_bidder_id: null,
      item_image_url: r.image,
      current_condition: cond,
    };
    if (useQuick) {
      update.status = "live";
      update.listing_type = "auction";
      update.starting_bid = start;
      update.ends_at = new Date(Date.now() + sec * 1000).toISOString();
      update.winner_id = null; update.winning_bid = null; update.winner_username = null;
      update.snipe_extends = 0; update.snipe_price = null;
      endedRef.current = false; snapshotRef.current = false;
    }
    supabase.from("live_streams").update(update).eq("id", id);

    // Post hype to chat as AI hype messages (no price)
    if (useQuick) {
      sendMsg(`▶️ ${hypeName}${cond ? ` [${cond}]` : ""} — ${sec}s round`, true);
    }
    sendMsg(`${hypeName} — ${hypeVibe}`, true, { isHype: true });
    for (const line of hypeLines.slice(0, 2)) {
      sendMsg(line, true, { isHype: true });
    }
    toast.success(useQuick ? "Auction auto-started" : "Card scanned");
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
        {usingObs ? (
          <HlsPlayer src={stream.cf_playback_hls} className="h-full w-full object-cover" autoPlay muted={isSeller} />
        ) : isSeller ? (
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
        <div className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${ended ? "bg-muted text-muted-foreground" : "bg-live"}`}>
          {!ended && <span className="h-1.5 w-1.5 live-pulse rounded-full bg-live-foreground" />} {ended ? "ENDED" : "LIVE"}
        </div>
        <div className="flex gap-1">
          <button onClick={() => setShareOpen(true)} className="rounded-full bg-black/50 p-2 backdrop-blur"><Share2 className="h-4 w-4" /></button>
          {isStaff && !ended && (
            <button onClick={() => setAnnOpen(true)} className="rounded-full bg-accent/80 p-2 backdrop-blur" title="Post announcement">
              <Megaphone className="h-4 w-4" />
            </button>
          )}
          {isStaff && !ended && (
            <button onClick={() => setShowModPanel((v) => !v)} className="relative rounded-full bg-primary/80 p-2 backdrop-blur" title="Mod panel">
              <Shield className="h-4 w-4" />
              {modChat.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-live" />
              )}
            </button>
          )}
          {(auctionLive || stream.current_item) && (
            <button onClick={() => setPinned((v) => !v)} className="rounded-full bg-black/50 p-2 backdrop-blur" title={pinned ? "Unpin auction" : "Pin auction"}>
              {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </button>
          )}
          {isSeller && !ended && (
            <button onClick={() => setShowSettings((v) => !v)} className="rounded-full bg-black/50 p-2 backdrop-blur"><Settings className="h-4 w-4" /></button>
          )}
          <button onClick={() => setShowChat((v) => !v)} className="rounded-full bg-black/50 p-2 backdrop-blur">
            {showChat ? <X className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Title / auction notification overlay (pinnable) */}
      {pinned && (
        <div className="absolute left-3 right-3 top-14 z-10">
          <div className="flex items-center gap-2 rounded-lg bg-black/40 px-3 py-1.5 backdrop-blur">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{stream.title}</p>
              {sellerUsername && (
                <Link to="/seller/$username" params={{ username: sellerUsername }} className="text-[10px] font-semibold text-primary hover:underline">@{sellerUsername} · view store</Link>
              )}
            </div>
            {stream.current_condition && (
              <span className="shrink-0 rounded-md bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">{stream.current_condition}</span>
            )}
            {auctionLive && (
              <div className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-extrabold tabular-nums transition ${snipeFlash ? "bg-yellow-400 text-black scale-110 ring-2 ring-yellow-200" : "bg-live text-live-foreground"}`}>
                <Timer className="h-4 w-4" /> {fmtRemaining(remaining)}
                {Number(stream.snipe_extends || 0) > 0 && (
                  <span className="ml-1 rounded bg-black/30 px-1 text-[9px]">+{stream.snipe_extends}× OT</span>
                )}
              </div>
            )}
          </div>
          {snipeFlash && (
            <div className="mt-1 animate-in zoom-in rounded-lg bg-yellow-400 px-3 py-1.5 text-center text-xs font-extrabold tracking-wide text-black shadow-lg">
              ⚡ OVERTIME +5s — last-second strike!
            </div>
          )}
          {stream.item_description && <p className="mt-1 line-clamp-2 rounded-lg bg-black/30 px-3 py-1 text-[11px] backdrop-blur">{stream.item_description}</p>}
          {(stream.shipping_price != null && Number(stream.shipping_price) > 0) || stream.shipping_method ? (
            <p className="mt-1 inline-block rounded-lg bg-black/30 px-3 py-1 text-[10px] backdrop-blur">
              📦 {stream.shipping_method || "Shipping"} — {fmtMoney(Number(stream.shipping_price || 0))}
            </p>
          ) : null}
          {auctionLive && stream.snipe_price && (
            <p className="mt-1 inline-block rounded-lg bg-yellow-500/90 px-3 py-1 text-[10px] font-extrabold text-black backdrop-blur">
              💸 SNIPE: hit {fmtMoney(Number(stream.snipe_price))} to win NOW
            </p>
          )}
          {auctionLive && stream.current_bidder_id && (
            <p className="mt-1 inline-block rounded-lg bg-primary/60 px-3 py-1 text-[10px] font-bold backdrop-blur">
              🥇 Winning bid: {fmtMoney(Number(stream.current_bid || 0))}
            </p>
          )}
          {/* 🆕 Currency selector */}
          <div className="mt-1 flex items-center gap-1">
            <Globe className="h-3 w-3 opacity-60" />
            <select
              value={viewerCurrency}
              onChange={(e) => saveCurrencyPref(e.target.value as Currency)}
              className="rounded bg-black/40 px-1.5 py-0.5 text-[10px] outline-none backdrop-blur"
              title="Display currency (charges always in USD)"
            >
              {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Winner banner — prominent popup at the top once auction ends with a winner */}
      {(auctionFinished || ended) && stream.winner_username && pinned && (
        <div className="absolute left-1/2 top-20 z-30 w-[92%] max-w-md -translate-x-1/2 rounded-2xl bg-gradient-to-r from-primary to-accent p-4 text-center shadow-2xl ring-2 ring-white/40 backdrop-blur animate-in fade-in zoom-in">
          <Trophy className="mx-auto h-7 w-7" />
          <p className="mt-1 text-base font-extrabold tracking-tight">🎉 @{stream.winner_username} owns this item!</p>
          <p className="text-xs opacity-90">Winning bid: ${Number(stream.winning_bid || 0).toFixed(2)}</p>
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
                <option value="5">5s</option>
                <option value="10">10s</option>
                <option value="15">15s</option>
                <option value="20">20s</option>
                <option value="30">30s</option>
                <option value="60">60s</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" min="0" step="0.01" value={editShipPrice} onChange={(e) => setEditShipPrice(e.target.value)} placeholder="Shipping ($)" className="rounded-lg bg-input px-3 py-2 text-xs outline-none" />
              <input value={editShipMethod} onChange={(e) => setEditShipMethod(e.target.value)} placeholder="Method" className="rounded-lg bg-input px-3 py-2 text-xs outline-none" />
            </div>
            <button onClick={startAuction} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-xs font-bold text-primary-foreground">
              <Play className="h-3.5 w-3.5" /> {auctionLive ? "Restart Auction" : "Start Auction"}
            </button>

            {/* OBS / Cloudflare Stream credentials */}
            {usingObs && (
              <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-[11px]">
                <p className="mb-2 flex items-center gap-1.5 font-bold text-primary"><Radio className="h-3.5 w-3.5" /> OBS / Streamlabs setup</p>
                <p className="mb-2 text-muted-foreground">In OBS → Settings → Stream → Service "Custom...", paste these values:</p>
                <div className="space-y-2">
                  <div>
                    <p className="mb-0.5 font-semibold">Server (RTMPS URL)</p>
                    <div className="flex items-center gap-1.5">
                      <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-[10px]">{stream.cf_rtmps_url}</code>
                      <button onClick={() => { navigator.clipboard.writeText(stream.cf_rtmps_url); toast.success("Copied"); }} className="rounded bg-muted px-2 py-1"><Copy className="h-3 w-3" /></button>
                    </div>
                  </div>
                  <div>
                    <p className="mb-0.5 font-semibold">Stream Key</p>
                    <div className="flex items-center gap-1.5">
                      <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-[10px]">{stream.cf_stream_key ? "••••••••" + String(stream.cf_stream_key).slice(-6) : ""}</code>
                      <button onClick={() => { navigator.clipboard.writeText(stream.cf_stream_key); toast.success("Stream key copied"); }} className="rounded bg-muted px-2 py-1"><Copy className="h-3 w-3" /></button>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">Keep this private. Anyone with this key can broadcast to your stream.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Auction notification feed (separate from chat, pinnable) */}
      {pinned && messages.some((m) => m.is_system && !hiddenSysIds.has(m.id)) && (
        <div className="pointer-events-none absolute right-3 top-32 z-10 flex max-h-[28vh] w-56 flex-col items-end gap-1 overflow-hidden">
          {messages.filter((m) => m.is_system && !hiddenSysIds.has(m.id)).slice(-5).map((m) => (
            <div key={m.id} className="rounded-lg bg-primary/60 px-2.5 py-1 text-[11px] text-white backdrop-blur">
              <Sparkles className="mr-1 inline h-3 w-3" />{m.content}
            </div>
          ))}
        </div>
      )}

      {/* Chat overlay (separate, scrollable up/down) */}
      {showChat && (
        <div ref={chatScrollRef} className="absolute bottom-44 left-0 right-0 z-10 max-h-[35vh] overflow-y-auto overscroll-contain px-3 pb-2">
          <div className="flex flex-col items-start gap-1.5">
            {messages.filter((m) => !m.is_system || m.is_announcement).map((m) => {
              if (m.is_announcement) {
                return (
                  <div key={m.id} className="w-full rounded-lg border border-accent/60 bg-gradient-to-r from-accent/40 to-primary/40 px-3 py-1.5 text-xs font-bold text-white shadow backdrop-blur">
                    <span className="mr-1 rounded bg-accent px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-accent-foreground">Announcement</span>
                    @{m.username}: {m.content.replace(/^📢\s*/, "")}
                  </div>
                );
              }
              const parts = String(m.content).split(/(@[A-Za-z0-9_]+)/g);
              const isBlocked = m.user_id && chatBlockSet.has(m.user_id);
              return (
                <div key={m.id} className={`max-w-[85%] rounded-lg px-2.5 py-1 text-xs backdrop-blur ${isBlocked ? "bg-red-500/30 line-through opacity-60" : "bg-black/50"}`}>
                  {isStaff && m.user_id && m.user_id !== user?.id && m.user_id !== stream.seller_id ? (
                    <button
                      onClick={() => setChatActionMenu({ userId: m.user_id, username: m.username })}
                      className="mr-1 font-semibold text-live-foreground hover:underline"
                      title="Mod actions"
                    >
                      @{m.username}:
                    </button>
                  ) : (
                    <span className="mr-1 font-semibold text-live-foreground">@{m.username}:</span>
                  )}
                  <span>
                    {parts.map((p, i) => p.startsWith("@") ? (
                      <Link key={i} to="/seller/$username" params={{ username: p.slice(1) }} className="font-semibold text-primary hover:underline">{p}</Link>
                    ) : <span key={i}>{p}</span>)}
                  </span>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>
        </div>
      )}

      {/* Bottom panel */}
      <div className="absolute bottom-0 left-0 right-0 z-20 space-y-2 bg-gradient-to-t from-black via-black/80 to-transparent p-3 pt-6">
        <div className="flex items-end justify-between">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/60">
              <span className="rounded bg-white/15 px-1.5 py-0.5 text-[9px] font-bold text-white">Bid #{Number(stream.round_number || 0) + (auctionLive ? 1 : 0) || 1}</span>
              Current Item
            </p>
            <p className="line-clamp-1 text-sm font-bold">{stream.current_item || "—"}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-white/60">{ended || auctionFinished ? "Final" : "Current Bid"}</p>
            <p className="text-2xl font-bold text-primary">{fmtMoney(Number(stream.current_bid || 0))}</p>
          </div>
        </div>

        {/* 🆕 SNIPE buy-now strip (visible to non-sellers when host set a snipe price) */}
        {!isSeller && auctionLive && stream.snipe_price && !meBlocked && (
          <button
            onClick={buyNowSnipe}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-400 py-2.5 text-sm font-extrabold text-black shadow-lg ring-2 ring-yellow-200 active:scale-[0.98]"
          >
            <Zap className="h-4 w-4" /> SNIPE Buy-Now {fmtMoney(Number(stream.snipe_price))}
          </button>
        )}

        {/* 🆕 Mystery break — Claim Slot for buyers */}
        {!isSeller && stream.break_mode === "open" && (
          <button
            onClick={claimBreakSlot}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 py-2.5 text-sm font-extrabold text-white shadow-lg active:scale-[0.98]"
          >
            <Dice5 className="h-4 w-4" /> Claim Mystery Break Slot · ${breakPrice}
          </button>
        )}

        {!isSeller && (
          <div className="flex gap-2">
            <button
              onPointerDown={bidDisabled || meBlocked ? undefined : startHold}
              disabled={bidDisabled || meBlocked}
              className="flex-1 select-none rounded-xl bg-primary py-3.5 text-base font-bold text-primary-foreground active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              {meBlocked ? "🚫 You're muted/banned"
                : bidDisabled
                  ? (auctionFinished || ended ? "Auction Ended" : "Waiting for auction...")
                  : (holdAdd > 0 ? `+$${holdAdd} — release to bid` : "THIS IS MINE  ↑ hold & swipe up for +$3")}
            </button>
            {!ended && (
              <button
                onClick={() => user ? setShoutoutOpen(true) : toast.error("Sign in to shout out")}
                disabled={mySpent >= 50}
                title={mySpent >= 50 ? "$50 cap reached for this stream" : "Send a shout-out"}
                className="flex shrink-0 flex-col items-center justify-center rounded-xl bg-accent px-3 py-2 text-[10px] font-bold text-accent-foreground active:scale-[0.98] disabled:opacity-50"
              >
                <Megaphone className="h-4 w-4" />
                Shout
                <span className="text-[8px] opacity-70">${50 - mySpent} left</span>
              </button>
            )}
          </div>
        )}
        {isSeller && !ended && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setScanning(true)} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-accent py-2.5 text-xs font-semibold text-accent-foreground">
              <Camera className="h-3.5 w-3.5" /> Scan
            </button>
            {!auctionLive && (
              <button onClick={() => setShowSettings(true)} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground">
                <Play className="h-3.5 w-3.5" /> Start Auction
              </button>
            )}
            {/* 🆕 Snipe price quick-set for hosts during a live auction */}
            {auctionLive && (
              <div className="flex flex-1 items-center gap-1 rounded-xl bg-yellow-500/20 px-2 py-1">
                <Zap className="h-3.5 w-3.5 text-yellow-300" />
                <input
                  type="number" min="1" inputMode="decimal"
                  value={snipePriceInput} onChange={(e) => setSnipePriceInput(e.target.value)}
                  placeholder="Snipe $"
                  className="w-16 bg-transparent text-xs text-yellow-100 outline-none placeholder:text-yellow-200/50"
                />
                <button onClick={setSnipePriceNow} className="rounded-md bg-yellow-400 px-2 py-1 text-[10px] font-bold text-black">Set</button>
              </div>
            )}
            <button onClick={() => setShowBreakPanel(true)} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 py-2.5 text-xs font-bold text-white">
              <Dice5 className="h-3.5 w-3.5" /> Break
            </button>
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

        <form onSubmit={handleSend} className="relative flex gap-2">
          {tagOpen && tagResults.length > 0 && (
            <div className="absolute bottom-full left-0 right-12 mb-2 max-h-48 overflow-y-auto rounded-xl bg-card text-foreground shadow-xl">
              {tagResults.map((u) => (
                <button key={u.id} type="button" onClick={() => {
                  const next = input.replace(/@([A-Za-z0-9_]*)$/, `@${u.username} `);
                  setInput(next); setTagOpen(false); setTagResults([]);
                }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted">
                  @{u.username}
                </button>
              ))}
            </div>
          )}
          <input
            value={input}
            onChange={(e) => {
              const v = e.target.value; setInput(v);
              const m = v.match(/@([A-Za-z0-9_]*)$/);
              if (m) { setTagOpen(true); searchUsers(m[1], setTagResults); }
              else { setTagOpen(false); setTagResults([]); }
            }}
            placeholder={!user ? "Sign in to chat" : meBlocked ? "🚫 You're muted in this stream" : "Say something... use @ to tag"}
            disabled={!user || meBlocked}
            className="flex-1 rounded-full bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/50 outline-none disabled:opacity-50"
          />
          <button type="submit" disabled={meBlocked} className="rounded-full bg-primary p-2.5 text-primary-foreground disabled:opacity-50"><Send className="h-4 w-4" /></button>
        </form>
      </div>

      {/* Share modal */}
      {shareOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={() => setShareOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-card p-4 text-foreground shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold">Share live</p>
              <button onClick={() => setShareOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <button onClick={async () => {
              const url = `${window.location.origin}/live/${id}`;
              try {
                if (navigator.share) await navigator.share({ title: stream.title, url });
                else { await navigator.clipboard.writeText(url); toast.success("Link copied"); }
              } catch {/* ignore */}
            }} className="mb-2 w-full rounded-lg bg-muted px-3 py-2 text-xs font-semibold">Copy / system share</button>
            <input
              value={shareQuery}
              onChange={(e) => { setShareQuery(e.target.value); searchUsers(e.target.value, setShareUsers); }}
              placeholder="Search users to DM"
              className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none"
            />
            <div className="mt-2 max-h-56 overflow-y-auto">
              {shareUsers.map((u) => (
                <button key={u.id} onClick={() => shareLiveTo(u.id, u.username)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs hover:bg-muted">
                  @{u.username}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {scanning && <CardScanner onResult={onScanResult} onClose={() => setScanning(false)} />}

      {/* Shout-Out modal */}
      {shoutoutOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center" onClick={() => setShoutoutOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-card p-4 text-foreground shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-bold"><Megaphone className="h-4 w-4 text-primary" /> Send a Shout-Out</p>
              <button onClick={() => setShoutoutOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <p className="mb-2 text-[11px] text-muted-foreground">
              Tip the seller and tell them what to shout. Make it fun! 🎉<br />
              You've spent <span className="font-semibold text-foreground">${mySpent}</span> · <span className="font-semibold text-foreground">${50 - mySpent}</span> left this stream.
            </p>
            <textarea
              value={shoutoutMsg}
              onChange={(e) => setShoutoutMsg(e.target.value)}
              maxLength={140}
              rows={2}
              placeholder='e.g. "Shout out to my friend Mike!" or "Say hi to Tokyo!"'
              className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none"
            />
            <p className="mb-2 text-right text-[10px] text-muted-foreground">{shoutoutMsg.length}/140</p>

            <p className="mb-1 text-xs font-semibold">Amount: <span className="text-primary">${shoutoutAmt}</span></p>
            <input
              type="range" min={5} max={Math.max(5, Math.min(50, 50 - mySpent))} step={1}
              value={shoutoutAmt}
              onChange={(e) => setShoutoutAmt(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="mt-1 mb-3 flex justify-between text-[10px] text-muted-foreground">
              <span>$5</span><span>$25</span><span>$50</span>
            </div>
            <div className="mb-3 grid grid-cols-4 gap-1.5">
              {[5, 10, 25, 50].map((v) => {
                const disabled = v > (50 - mySpent);
                return (
                  <button key={v} disabled={disabled}
                    onClick={() => setShoutoutAmt(v)}
                    className={`rounded-lg py-1.5 text-xs font-bold ${shoutoutAmt === v ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"} disabled:opacity-30`}>
                    ${v}
                  </button>
                );
              })}
            </div>
            <button onClick={sendShoutout} className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground">
              Send ${shoutoutAmt} Shout-Out (safe mode)
            </button>
            <p className="mt-2 text-center text-[10px] text-muted-foreground">No real charge yet — payments turn on later.</p>
          </div>
        </div>
      )}

      {/* AI HYPE overlay — 5s card details (NEVER price) */}
      {hypeCard && (
        <div className="pointer-events-none absolute left-1/2 top-24 z-30 w-[88%] max-w-md -translate-x-1/2 animate-in fade-in slide-in-from-top">
          <div className="flex gap-3 rounded-2xl border border-primary/40 bg-black/75 p-3 shadow-2xl backdrop-blur">
            <img src={hypeCard.image} alt={hypeCard.name} className="h-20 w-16 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                <Sparkles className="h-3 w-3" /> AI Spotted
              </p>
              <p className="truncate text-sm font-extrabold text-white">{hypeCard.name}</p>
              <p className="truncate text-[11px] text-white/70">{hypeCard.category}{hypeCard.set_guess ? ` · ${hypeCard.set_guess}` : ""}</p>
              <span className="mt-1 inline-block rounded-md bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">{hypeCard.rarity_vibe}</span>
            </div>
          </div>
        </div>
      )}

      {/* Announcement composer (host & mods) */}
      {annOpen && isStaff && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center" onClick={() => setAnnOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-card p-4 text-foreground shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-bold"><Megaphone className="h-4 w-4 text-accent" /> Announcement</p>
              <button onClick={() => setAnnOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <p className="mb-2 text-[11px] text-muted-foreground">Pinned highlight in the live chat — visible to everyone.</p>
            <textarea
              value={annText}
              onChange={(e) => setAnnText(e.target.value)}
              maxLength={200}
              rows={3}
              placeholder='e.g. "Combined shipping at $10 max — keep stacking!"'
              className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none"
            />
            <p className="mb-2 text-right text-[10px] text-muted-foreground">{annText.length}/200</p>
            <button onClick={postAnnouncement} disabled={!annText.trim()} className="w-full rounded-lg bg-accent py-2.5 text-sm font-bold text-accent-foreground disabled:opacity-50">
              Post Announcement
            </button>
          </div>
        </div>
      )}

      {/* Mod panel — host adds/removes mods, host+mods chat privately */}
      {showModPanel && isStaff && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center" onClick={() => setShowModPanel(false)}>
          <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-sm flex-col rounded-2xl bg-card text-foreground shadow-2xl" style={{ maxHeight: "85vh" }}>
            <div className="flex items-center justify-between border-b border-border p-3">
              <p className="flex items-center gap-1.5 text-sm font-bold"><Shield className="h-4 w-4 text-primary" /> Mod Channel</p>
              <button onClick={() => setShowModPanel(false)}><X className="h-4 w-4" /></button>
            </div>

            {/* Host-only: add mods */}
            {isSeller && (
              <div className="border-b border-border p-3">
                <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Add a moderator</p>
                <input
                  value={modSearchQ}
                  onChange={(e) => { setModSearchQ(e.target.value); searchUsers(e.target.value, setModSearchRes); }}
                  placeholder="Search by username"
                  className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none"
                />
                {modSearchRes.length > 0 && (
                  <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-border">
                    {modSearchRes.map((u) => (
                      <button key={u.id} onClick={() => addModBySearch(u)} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-muted">
                        <span>@{u.username}</span>
                        <ShieldPlus className="h-3.5 w-3.5 text-primary" />
                      </button>
                    ))}
                  </div>
                )}
                {mods.length > 0 && (
                  <div className="mt-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Active mods</p>
                    <div className="flex flex-wrap gap-1.5">
                      {mods.map((m) => (
                        <span key={m.id} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                          @{m.mod_username}
                          <button onClick={() => removeMod(m.id)} className="opacity-60 hover:opacity-100"><Trash2 className="h-3 w-3" /></button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Private mod chat */}
            <div className="flex-1 overflow-y-auto p-3">
              <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">Private — host & mods only</p>
              {modChat.length === 0 && <p className="text-center text-[11px] text-muted-foreground">No messages yet. Coordinate with your mods here.</p>}
              <div className="space-y-1.5">
                {modChat.map((m) => (
                  <div key={m.id} className="rounded-lg bg-muted px-2.5 py-1.5 text-xs">
                    <span className="mr-1 font-semibold text-primary">@{m.username}:</span>{m.content}
                  </div>
                ))}
              </div>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); sendModMsg(); }} className="flex gap-1.5 border-t border-border p-2">
              <input
                value={modInput}
                onChange={(e) => setModInput(e.target.value)}
                placeholder="Message your mod team..."
                className="flex-1 rounded-full bg-input px-3 py-1.5 text-xs outline-none"
              />
              <button type="submit" className="rounded-full bg-primary p-2 text-primary-foreground"><Send className="h-3.5 w-3.5" /></button>
            </form>
            <button onClick={() => { setShowModPanel(false); setAnnOpen(true); }} className="m-2 mt-0 rounded-lg bg-accent py-2 text-xs font-bold text-accent-foreground">
              <Megaphone className="mr-1 inline h-3.5 w-3.5" /> Post public announcement
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
