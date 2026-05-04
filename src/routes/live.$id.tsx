import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Radio, Send, Sparkles, ArrowLeft, ChevronLeft, ChevronRight, MessageCircle, X, Camera, Square, Timer, Settings, Play, Trophy, Pin, PinOff, Share2, Megaphone, Copy, Shield, ShieldPlus, Trash2, Zap, Users, Dice5, Globe, VolumeX, Ban, Clock as ClockIcon, RotateCw, Plus, Lock, Shuffle, Unlock, Check, Gift } from "lucide-react";
import { toast } from "sonner";
import { CardScanner } from "@/components/CardScanner";
import { HlsPlayer } from "@/components/HlsPlayer";
import { useCurrency, SUPPORTED_CURRENCIES, type Currency } from "@/lib/currency";
import { SpinWheel, weightedPick, type WheelSlot } from "@/components/SpinWheel";
import { LiveGiveaway } from "@/components/LiveGiveaway";

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
  // 🆕 Mystery break (numbered slots 1..N)
  const [breakSlots, setBreakSlots] = useState<any[]>([]);
  const [showBreakPanel, setShowBreakPanel] = useState(false);
  const [breakSlotCount, setBreakSlotCount] = useState("20"); // 1..50
  const [breakPrice, setBreakPrice] = useState("10");
  const [breakPrefix, setBreakPrefix] = useState("");         // optional label e.g. "Box"
  const [drawAnim, setDrawAnim] = useState(false);
  // 🆕 Per-slot character/team labels (host edits before opening claims)
  const [breakCharacters, setBreakCharacters] = useState<string[]>(
    Array.from({ length: 20 }, (_, i) => `Character ${i + 1}`),
  );
  // 🆕 Voice trigger phrase
  const [voiceListening, setVoiceListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  // 🆕 Break-reveal wheel animation state
  const [breakWheelAngle, setBreakWheelAngle] = useState(0);
  const breakWheelRafRef = useRef<number | null>(null);

  // 🆕 Giveaway
  const [showGiveaway, setShowGiveaway] = useState(false);
  const [giveawayComposer, setGiveawayComposer] = useState(false);
  const [isFollowingHost, setIsFollowingHost] = useState(false);
  const [isPastBuyer, setIsPastBuyer] = useState(false);
  // 🆕 Currency display preference (per-viewer)
  const [viewerCurrency, setViewerCurrency] = useState<Currency>("USD");
  const { fmt: fmtMoney } = useCurrency(viewerCurrency);

  // 🆕 Spin Wheel state
  const [wheel, setWheel] = useState<any>(null);
  const [wheelSlots, setWheelSlots] = useState<WheelSlot[]>([]);
  const [showWheelOverlay, setShowWheelOverlay] = useState(false);
  const [showWheelEditor, setShowWheelEditor] = useState(false);
  const [wheelWinnerPopup, setWheelWinnerPopup] = useState<{ slot: string; winner: string } | null>(null);
  const [draftSlotLabel, setDraftSlotLabel] = useState("");
  const [draftSlotWeight, setDraftSlotWeight] = useState("1");
  const wheelLandedRef = useRef<string | null>(null);

  const isMod = !!user && mods.some((m) => m.mod_user_id === user.id);
  const isStaff = !!user && (mods.some((m) => m.mod_user_id === user.id) || (stream && user.id === stream.seller_id));

  const isSeller = !!user && stream && user.id === stream.seller_id;

  // Settings form state (seller)
  const [editDesc, setEditDesc] = useState("");
  const [editStartPrice, setEditStartPrice] = useState("");
  const [editTimerSec, setEditTimerSec] = useState("30");
  const [editShipPrice, setEditShipPrice] = useState("");
  const [editShipMethod, setEditShipMethod] = useState("USPS Ground");
  // 🆕 Quantity (back-to-back identical auctions) + voice trigger
  const [editQuantity, setEditQuantity] = useState("1");
  const [editVoiceEnabled, setEditVoiceEnabled] = useState(false);
  const [editVoicePhrase, setEditVoicePhrase] = useState("next");

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
        setEditTimerSec(String(data.default_timer_sec || 30));
        setEditQuantity(String(data.quick_start_quantity || 1));
        setEditVoiceEnabled(!!data.voice_trigger_enabled);
        setEditVoicePhrase(data.voice_trigger_phrase || "next");
        if (data.break_slot_count) setBreakSlotCount(String(data.break_slot_count));
        if (data.break_slot_prefix) setBreakPrefix(data.break_slot_prefix);
        if (Array.isArray(data.break_characters) && data.break_characters.length) {
          setBreakCharacters(data.break_characters as string[]);
        }
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

  // 🆕 For Giveaway eligibility — does the current viewer follow the host / has bought from them?
  useEffect(() => {
    if (!user || !stream?.seller_id || user.id === stream.seller_id) {
      setIsFollowingHost(false); setIsPastBuyer(false); return;
    }
    supabase.from("follows").select("follower_id", { count: "exact", head: true })
      .eq("follower_id", user.id).eq("followee_id", stream.seller_id)
      .then(({ count }) => setIsFollowingHost((count ?? 0) > 0));
    supabase.from("orders").select("id", { count: "exact", head: true })
      .eq("buyer_id", user.id).eq("seller_id", stream.seller_id)
      .then(({ count }) => setIsPastBuyer((count ?? 0) > 0));
  }, [user?.id, stream?.seller_id]);

  // Load mod chat once user is known to be staff
  useEffect(() => {
    if (!isStaff) { setModChat([]); return; }
    supabase.from("stream_mod_messages").select("*").eq("stream_id", id).order("created_at").then(({ data }) => setModChat(data || []));
  }, [isStaff, id]);

  // 🆕 Load Spin Wheel + slots, subscribe to realtime updates
  useEffect(() => {
    let cancelled = false;
    async function loadWheel() {
      const { data: w } = await supabase.from("spin_wheels").select("*").eq("stream_id", id).maybeSingle();
      if (cancelled) return;
      setWheel(w || null);
      if (w) {
        const { data: ss } = await supabase.from("wheel_slots").select("*").eq("wheel_id", w.id).order("position");
        if (!cancelled) setWheelSlots((ss || []) as WheelSlot[]);
      } else {
        setWheelSlots([]);
      }
    }
    loadWheel();
    const ch = supabase.channel(`wheel-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "spin_wheels", filter: `stream_id=eq.${id}` }, (p) => {
        const next: any = p.new;
        setWheel(next || null);
        // Auto-open the wheel for everyone the moment a spin starts
        if (next?.is_spinning) {
          wheelLandedRef.current = null;
          setShowWheelOverlay(true);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "wheel_slots" }, async () => {
        // Re-fetch slots whenever any change occurs (small table, host-only writes)
        const wid = wheel?.id || (await supabase.from("spin_wheels").select("id").eq("stream_id", id).maybeSingle()).data?.id;
        if (!wid) return;
        const { data: ss } = await supabase.from("wheel_slots").select("*").eq("wheel_id", wid).order("position");
        setWheelSlots((ss || []) as WheelSlot[]);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wheel_spins", filter: `stream_id=eq.${id}` }, (p) => {
        const r: any = p.new;
        setWheelWinnerPopup({ slot: r.slot_label, winner: r.winner_username });
        setTimeout(() => setWheelWinnerPopup(null), 6000);
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

  // 🆕 Voice trigger — listens for the seller's phrase and re-fires the next auction round.
  useEffect(() => {
    if (!isSeller) return;
    if (!stream?.voice_trigger_enabled) return;
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const phrase = (stream.voice_trigger_phrase || "next").toLowerCase();
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (ev: any) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = String(ev.results[i][0]?.transcript || "").toLowerCase();
        if (t.includes(phrase)) {
          // Avoid double-fires while a round is live
          if (auctionLive) return;
          startAuction();
          return;
        }
      }
    };
    rec.onend = () => { try { rec.start(); } catch {} };
    try { rec.start(); setVoiceListening(true); } catch {}
    recognitionRef.current = rec;
    return () => {
      setVoiceListening(false);
      try { rec.onend = null; rec.stop(); } catch {}
      recognitionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSeller, stream?.voice_trigger_enabled, stream?.voice_trigger_phrase]);

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

  // 🆕 Anti-snipe: bid in final 3s → +3s. After 3 extensions → SUDDEN DEATH:
  // the very next bid wins instantly. Different (and more savage) than Whatnot.
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
    const exts = Number(stream.snipe_extends || 0);
    const inSuddenDeath = !!stream.sudden_death_active;
    let extended = false;
    let suddenDeathWin = false;

    if (inSuddenDeath) {
      // 💀 Sudden death — bid wins instantly, end timer in 1.2s for drama.
      update.ends_at = new Date(Date.now() + 1200).toISOString();
      update.sudden_death_active = false;
      suddenDeathWin = true;
    } else if (remainingMs > 0 && remainingMs <= 3000) {
      // Add +3s and bump extension counter
      update.ends_at = new Date(Math.max(new Date(stream.ends_at).getTime(), Date.now()) + 3000).toISOString();
      update.snipe_extends = exts + 1;
      extended = true;
      // After the 3rd extension we arm sudden death for the NEXT bid
      if (exts + 1 >= 3) update.sudden_death_active = true;
    }

    const { error } = await supabase.from("live_streams").update(update).eq("id", id);
    if (error) return toast.error(error.message);

    if (extended) {
      endedRef.current = false;
      snapshotRef.current = false;
      const willArm = exts + 1 >= 3;
      await sendMsg(
        willArm
          ? `💀 SUDDEN DEATH ARMED — next bid INSTANTLY wins! (@${profile.username} forced it)`
          : `⚡ OVERTIME +3s — @${profile.username} struck in the final 3s! (${exts + 1}/3)`,
        true,
      );
    }
    if (suddenDeathWin) {
      endedRef.current = false; snapshotRef.current = false;
      await sendMsg(`💥 SUDDEN-DEATH WIN — @${profile.username} took it for $${amount}!`, true);
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

  // 🆕 Mystery break: numbered slots (1..N). Buyers claim a number, host runs a randomized "spin" reveal at the end.
  async function startBreakMode() {
    if (!isSeller) return;
    const count = Math.max(2, Math.min(50, Number(breakSlotCount) || 0));
    if (count < 2) return toast.error("Pick 2–50 slots");
    const price = Math.max(1, Number(breakPrice) || 0);
    const chars = Array.from({ length: count }, (_, i) =>
      (breakCharacters[i] && breakCharacters[i].trim()) || `${(breakPrefix.trim() || "Slot ")}${i + 1}`,
    );
    await supabase.from("live_streams").update({
      break_mode: "open",
      break_slot_count: count,
      break_slot_prefix: breakPrefix.trim() || null,
      break_characters: chars,
      break_teams: chars,
    }).eq("id", id);
    await sendMsg(`🎲 BREAK OPEN — ${count} slots, $${price} each. Tap a slot below to claim!`, true);
    toast.success("Break opened");
  }

  async function claimBreakSlotNumber(slotNumber: number) {
    if (!user || !profile) return;
    if (isSeller) return toast.error("Host can't claim slots");
    const taken = breakSlots.some((s) => s.slot_number === slotNumber);
    if (taken) return toast.error("That slot is already taken");
    const price = Number(breakPrice) || 10;
    const charLabel =
      (Array.isArray(stream.break_characters) && stream.break_characters[slotNumber - 1]) ||
      `${stream.break_slot_prefix || "#"}${slotNumber}`;
    const { error } = await supabase.from("break_slots").insert({
      stream_id: id, buyer_id: user.id, buyer_username: profile.username, amount: price,
      slot_number: slotNumber, character_label: charLabel,
    });
    if (error) {
      if ((error as any).code === "23505") return toast.error("Slot just got claimed!");
      return toast.error(error.message);
    }
    await sendMsg(`🎟️ @${profile.username} grabbed ${charLabel} ($${price})`, true);
    toast.success(`${charLabel} is yours!`);
  }

  async function closeBreakClaims() {
    if (!isSeller) return;
    setDrawAnim(true);
    setTimeout(async () => {
      await supabase.from("live_streams").update({ break_mode: "closed" }).eq("id", id);
      setDrawAnim(false);
      await sendMsg(`🔒 Break claims closed — ${breakSlots.length} slots taken.`, true);
      toast.success("Claims closed");
    }, 1500);
  }

  // 🆕 BREAK reveal wheel — picks a random claimed slot, broadcasts to all viewers,
  // then announces "Character → @user" once it lands.
  async function spinBreakWheel() {
    if (!isSeller) return;
    const claimed = breakSlots.filter((s) => s.slot_number != null);
    if (claimed.length === 0) return toast.error("No slots claimed yet");
    const winner = claimed[Math.floor(Math.random() * claimed.length)];
    const startedAt = new Date();
    const endsAt = new Date(Date.now() + 6500);
    await supabase.from("live_streams").update({
      break_wheel_spinning: true,
      break_wheel_started_at: startedAt.toISOString(),
      break_wheel_ends_at: endsAt.toISOString(),
      break_wheel_target_slot: winner.slot_number,
      break_wheel_last_winner_username: null,
      break_wheel_last_winner_label: null,
    }).eq("id", id);
    await sendMsg(`🎡 BREAK REVEAL spinning…`, true);
    setTimeout(async () => {
      const label = winner.character_label || `${stream.break_slot_prefix || "#"}${winner.slot_number}`;
      await supabase.from("live_streams").update({
        break_wheel_spinning: false,
        break_wheel_last_winner_username: winner.buyer_username,
        break_wheel_last_winner_label: label,
      }).eq("id", id);
      await sendMsg(`🏆 BREAK WIN — ${label} goes to @${winner.buyer_username}!`, true);
    }, 6600);
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

  // ===== Spin Wheel handlers =====
  async function ensureWheel(): Promise<any | null> {
    if (wheel) return wheel;
    if (!isSeller) return null;
    const { data, error } = await supabase.from("spin_wheels").insert({
      stream_id: id, seller_id: user!.id, spin_speed: "10",
    }).select().single();
    if (error) { toast.error(error.message); return null; }
    setWheel(data);
    return data;
  }

  async function addWheelSlot() {
    const w = await ensureWheel();
    if (!w) return;
    const label = draftSlotLabel.trim();
    if (!label) return toast.error("Add a label");
    const weight = Math.max(1, Math.min(100, Number(draftSlotWeight) || 1));
    const palette = ["#7c3aed","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#06b6d4","#a855f7","#14b8a6","#f97316"];
    const color = palette[wheelSlots.length % palette.length];
    const { error } = await supabase.from("wheel_slots").insert({
      wheel_id: w.id, label, weight, color, position: wheelSlots.length,
    });
    if (error) return toast.error(error.message);
    setDraftSlotLabel(""); setDraftSlotWeight("1");
  }

  async function removeWheelSlot(slotId: string) {
    if (wheel?.is_spinning) return toast.error("Wheel is locked while spinning");
    if (wheel?.is_locked) return toast.error("Wheel is locked — reset it to edit");
    await supabase.from("wheel_slots").delete().eq("id", slotId);
  }

  async function updateWheelSpeed(spin_speed: "5" | "10" | "15") {
    if (!wheel || !isSeller) return;
    await supabase.from("spin_wheels").update({ spin_speed }).eq("id", wheel.id);
  }
  async function toggleViewerSpin() {
    if (!wheel || !isSeller) return;
    await supabase.from("spin_wheels").update({ viewer_can_spin: !wheel.viewer_can_spin }).eq("id", wheel.id);
  }

  function spinDurationMs(speed: string): number {
    const n = Number(speed);
    if (n === 5 || n === 10 || n === 15) return n * 1000;
    // back-compat for old 'slow'/'normal'/'fast' values
    if (speed === "slow") return 15000;
    if (speed === "fast") return 5000;
    return 10000;
  }

  // 🆕 Shuffle slot order on the wheel
  async function shuffleWheelSlots() {
    if (!wheel || !isSeller) return;
    if (wheel.is_spinning) return toast.error("Wheel is locked while spinning");
    if (wheel.pending_decision_slot_id) return toast.error("Decide on the last winner first");
    const arr = [...wheelSlots];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    // Persist new positions
    await Promise.all(arr.map((s, idx) => supabase.from("wheel_slots").update({ position: idx }).eq("id", s.id)));
    toast.success("Slots shuffled");
  }

  // 🆕 Reset the wheel — unlocks editing
  async function resetWheel() {
    if (!wheel || !isSeller) return;
    if (wheel.is_spinning) return toast.error("Wheel is still spinning");
    await supabase.from("spin_wheels").update({
      is_locked: false,
      pending_decision_slot_id: null,
      pending_decision_slot_label: null,
      last_winner_username: null,
      last_winner_slot_label: null,
      last_winner_at: null,
    }).eq("id", wheel.id);
    toast.success("Wheel reset — you can edit slots again");
  }

  // Trigger a spin: host always allowed; viewers only if viewer_can_spin and idle.
  async function triggerSpin() {
    if (!user) return toast.error("Sign in to spin");
    if (!wheel) return toast.error("No wheel yet");
    if (wheel.is_spinning) return;
    if (wheel.pending_decision_slot_id) return toast.error("Host must decide on the last winner first");
    const canSpin = isSeller || wheel.viewer_can_spin;
    if (!canSpin) return toast.error("Only the host can spin");
    const active = wheelSlots.filter((s) => s.is_active);
    if (active.length < 2) return toast.error("Add at least 2 slots");

    // Pick winning slot using weights — done client-side, persisted server-side.
    const pick = weightedPick(active);
    if (!pick) return;
    const dur = spinDurationMs(wheel.spin_speed);
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + dur);
    setShowWheelOverlay(true);
    wheelLandedRef.current = null;
    const { error } = await supabase.from("spin_wheels").update({
      is_spinning: true,
      is_locked: true, // 🔒 lock the wheel from manual edits as soon as a spin starts
      spin_started_at: startedAt.toISOString(),
      spin_ends_at: endsAt.toISOString(),
      spin_target_slot_id: pick.id,
      spin_seed: Math.floor(Math.random() * 1_000_000),
    }).eq("id", wheel.id);
    if (error) {
      toast.error(error.message);
      return;
    }

    // Schedule the result write at finish (any client can do it; RLS guards host-only).
    if (isSeller) {
      setTimeout(() => finalizeSpin(pick.id), dur + 150);
    }
  }

  async function finalizeSpin(slotId: string) {
    if (!wheel || !isSeller) return;
    if (wheelLandedRef.current === slotId) return;
    wheelLandedRef.current = slotId;
    const slot = wheelSlots.find((s) => s.id === slotId);
    if (!slot) return;
    // Winner = current top bidder if a live auction, else the seller for now.
    const winnerId = (stream?.current_bidder_id as string) || user!.id;
    const winnerUsername = stream?.winner_username || (winnerId === user!.id ? (profile?.username || "host") : "top bidder");

    await supabase.from("wheel_spins").insert({
      wheel_id: wheel.id,
      stream_id: id,
      triggered_by_id: user!.id,
      triggered_by_username: profile?.username || "host",
      winner_id: winnerId,
      winner_username: winnerUsername,
      slot_id: slot.id,
      slot_label: slot.label,
    });
    // 🆕 No automatic remove/keep — host decides AFTER landing.
    await supabase.from("spin_wheels").update({
      is_spinning: false,
      is_locked: true,
      pending_decision_slot_id: slot.id,
      pending_decision_slot_label: slot.label,
      last_winner_username: winnerUsername,
      last_winner_slot_label: slot.label,
      last_winner_at: new Date().toISOString(),
    }).eq("id", wheel.id);
    await sendMsg(`🎡 ${winnerUsername} won "${slot.label}" on the wheel!`, true);
  }

  // 🆕 Host's post-spin choice: remove the landed slot or keep it.
  async function decideAfterSpin(action: "remove" | "keep") {
    if (!wheel || !isSeller) return;
    const slotId = wheel.pending_decision_slot_id;
    if (!slotId) return;
    if (action === "remove") {
      await supabase.from("wheel_slots").delete().eq("id", slotId);
    }
    await supabase.from("spin_wheels").update({
      pending_decision_slot_id: null,
      pending_decision_slot_label: null,
    }).eq("id", wheel.id);
    toast.success(action === "remove" ? "Slot removed" : "Slot kept on wheel");
  }

  async function startAuction() {
    if (!isSeller) return;
    const sec = Number(editTimerSec) || 60;
    const start = Number(editStartPrice) || 1;
    const qty = Math.max(1, Math.min(99, Number(editQuantity) || 1));
    const ends_at = new Date(Date.now() + sec * 1000).toISOString();
    await supabase.from("live_streams").update({
      status: "live",
      listing_type: "auction",
      starting_bid: start,
      default_starting_bid: start,
      default_timer_sec: sec,
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
      sudden_death_active: false,
      quick_start_quantity: qty,
      quick_start_remaining: qty - 1,
      voice_trigger_enabled: editVoiceEnabled,
      voice_trigger_phrase: editVoicePhrase.trim().toLowerCase() || "next",
    }).eq("id", id);
    endedRef.current = false;
    await sendMsg(`▶️ Auction started — ${sec}s, starting $${start}${qty > 1 ? ` · qty ${qty}` : ""}`, true);
    toast.success("Auction started");
    setShowSettings(false);
  }

  // 🆕 Save voice trigger + quantity without starting an auction
  async function saveAuctionDefaults() {
    if (!isSeller) return;
    const qty = Math.max(1, Math.min(99, Number(editQuantity) || 1));
    await supabase.from("live_streams").update({
      default_timer_sec: Number(editTimerSec) || 30,
      default_starting_bid: Number(editStartPrice) || 1,
      shipping_price: Number(editShipPrice) || 0,
      shipping_method: editShipMethod,
      quick_start_quantity: qty,
      voice_trigger_enabled: editVoiceEnabled,
      voice_trigger_phrase: editVoicePhrase.trim().toLowerCase() || "next",
    }).eq("id", id);
    toast.success("Settings saved");
  }

  // 🆕 Persist edited break character labels (allowed any time)
  async function saveBreakCharacters(next: string[]) {
    if (!isSeller || !stream) return;
    await supabase.from("live_streams").update({ break_characters: next }).eq("id", id);
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
      // Clear winner banner + ends_at after 5s, then auto-rearm next round if quantity remaining
      setTimeout(async () => {
        const remaining = Math.max(0, Number((stream as any).quick_start_remaining || 0));
        const sec = Number(stream.default_timer_sec || 30);
        const start = Number(stream.default_starting_bid || stream.starting_bid || 1);
        const update: any = {
          ends_at: null, winner_id: null, winning_bid: null, winner_username: null, current_bidder_id: null,
        };
        if (remaining > 0) {
          update.ends_at = new Date(Date.now() + sec * 1000).toISOString();
          update.starting_bid = start;
          update.current_bid = start;
          update.snipe_extends = 0;
          update.sudden_death_active = false;
          update.quick_start_remaining = remaining - 1;
        }
        await supabase.from("live_streams").update(update).eq("id", id);
        endedRef.current = false;
        snapshotRef.current = false;
        if (remaining > 0) sendMsg(`▶️ Next round — ${sec}s, starting $${start} (qty ${remaining} left)`, true);
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
      update.snipe_extends = 0; update.snipe_price = null; update.sudden_death_active = false;
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

      {/* 🆕 Always-visible auction timer (regardless of pin state) */}
      {auctionLive && (
        <div className="pointer-events-none absolute left-1/2 top-14 z-20 -translate-x-1/2">
          <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-base font-extrabold tabular-nums shadow-2xl ring-2 transition ${
            stream.sudden_death_active
              ? "bg-red-600 text-white ring-red-300 animate-pulse"
              : snipeFlash
                ? "bg-yellow-400 text-black ring-yellow-200 scale-110"
                : remaining <= 5000
                  ? "bg-orange-500 text-white ring-orange-200 animate-pulse"
                  : "bg-live text-live-foreground ring-white/30"
          }`}>
            {stream.sudden_death_active ? <Zap className="h-4 w-4" /> : <Timer className="h-4 w-4" />}
            <span>{fmtRemaining(remaining)}</span>
            {Number(stream.snipe_extends || 0) > 0 && !stream.sudden_death_active && (
              <span className="ml-1 rounded bg-black/30 px-1.5 py-0.5 text-[9px]">+{stream.snipe_extends}/3 OT</span>
            )}
            {stream.sudden_death_active && (
              <span className="ml-1 rounded bg-black/30 px-1.5 py-0.5 text-[9px] uppercase tracking-wider">Sudden Death</span>
            )}
          </div>
        </div>
      )}

      {/* Title / auction notification overlay (pinnable) */}
      {pinned && (
        <div className={`absolute left-3 right-3 z-10 ${auctionLive ? "top-28" : "top-14"}`}>
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

        {/* 🆕 Mystery break — numbered slot grid for buyers */}
        {!isSeller && stream.break_mode === "open" && stream.break_slot_count && (
          <div className="rounded-xl bg-gradient-to-br from-pink-500/15 via-purple-500/15 to-indigo-500/15 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-xs font-extrabold text-white">
                <Dice5 className="h-4 w-4 text-pink-300" /> Mystery Break · ${breakPrice}/slot
              </p>
              <span className="text-[10px] text-white/60">
                {breakSlots.length}/{stream.break_slot_count} taken
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {Array.from({ length: stream.break_slot_count }, (_, i) => i + 1).map((n) => {
                const taken = breakSlots.find((s) => s.slot_number === n);
                const mine = taken && taken.buyer_id === user?.id;
                const charLabel =
                  (Array.isArray(stream.break_characters) && stream.break_characters[n - 1]) ||
                  `${stream.break_slot_prefix || "#"}${n}`;
                return (
                  <button
                    key={n}
                    onClick={() => !taken && claimBreakSlotNumber(n)}
                    disabled={!!taken}
                    title={taken ? `@${taken.buyer_username}` : `Claim ${charLabel}`}
                    className={`flex min-h-[44px] flex-col items-center justify-center rounded-lg px-1 py-1 text-[10px] font-extrabold leading-tight transition ${
                      mine ? "bg-emerald-500 text-white ring-2 ring-emerald-200" :
                      taken ? "bg-white/10 text-white/30 line-through cursor-not-allowed" :
                      "bg-white text-black active:scale-95 hover:bg-pink-200"
                    }`}
                  >
                    <span className="line-clamp-2 text-center">{charLabel}</span>
                    {taken && <span className="text-[8px] opacity-70">@{taken.buyer_username}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Mystery break results — shown after host closes claims */}
        {!isSeller && stream.break_mode === "closed" && breakSlots.length > 0 && (
          <div className="rounded-xl bg-card/40 p-3 text-xs">
            <p className="mb-1 font-bold text-white">🎲 Mystery Break results</p>
            <div className="grid grid-cols-2 gap-1">
              {[...breakSlots].sort((a, b) => (a.slot_number || 0) - (b.slot_number || 0)).map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded bg-white/5 px-2 py-1">
                  <span className="font-bold text-pink-300">{stream.break_slot_prefix || "#"}{s.slot_number}</span>
                  <span className="truncate text-white/80">@{s.buyer_username}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 🆕 Spin Wheel — visible to viewers whenever a wheel exists */}
        {!isSeller && wheel && wheelSlots.length > 0 && (
          <button
            onClick={() => setShowWheelOverlay(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-purple-500 py-2.5 text-sm font-extrabold text-white shadow-lg active:scale-[0.98]"
          >
            <RotateCw className={`h-4 w-4 ${wheel.is_spinning ? "animate-spin" : ""}`} />
            {wheel.is_spinning ? "Spinning live…" : "Open Spin Wheel"}
            <span className="ml-1 text-[10px] font-semibold opacity-80">{wheelSlots.filter((s)=>s.is_active).length} prizes</span>
          </button>
        )}

        {/* 🆕 Giveaway — viewer entry button */}
        {!isSeller && (
          <button
            onClick={() => setShowGiveaway(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-sm font-extrabold text-white shadow-lg active:scale-[0.98]"
          >
            <Gift className="h-4 w-4" /> Open Giveaway
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
            <button onClick={() => setShowWheelEditor(true)} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 py-2.5 text-xs font-bold text-white">
              <RotateCw className="h-3.5 w-3.5" /> Wheel
            </button>
            <button onClick={() => { setGiveawayComposer(true); setShowGiveaway(true); }} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-xs font-bold text-white">
              <Gift className="h-3.5 w-3.5" /> Giveaway
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
      {/* 🆕 Chat-action menu (mod taps a username) */}
      {chatActionMenu && isStaff && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center" onClick={() => setChatActionMenu(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-card p-4 text-foreground shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold">Mod actions · @{chatActionMenu.username}</p>
              <button onClick={() => setChatActionMenu(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => chatAction(chatActionMenu, "mute")} className="flex items-center justify-center gap-1 rounded-lg bg-amber-500/20 py-2 text-xs font-bold text-amber-300">
                <VolumeX className="h-3.5 w-3.5" /> Mute
              </button>
              <button onClick={() => chatAction(chatActionMenu, "timeout", 5)} className="flex items-center justify-center gap-1 rounded-lg bg-amber-600/20 py-2 text-xs font-bold text-amber-200">
                <ClockIcon className="h-3.5 w-3.5" /> 5m timeout
              </button>
              <button onClick={() => chatAction(chatActionMenu, "ban")} className="flex items-center justify-center gap-1 rounded-lg bg-red-500/20 py-2 text-xs font-bold text-red-300">
                <Ban className="h-3.5 w-3.5" /> Ban
              </button>
              <button onClick={() => chatAction(chatActionMenu, "unmute")} className="flex items-center justify-center gap-1 rounded-lg bg-primary/20 py-2 text-xs font-bold text-primary">
                ✅ Lift mute/ban
              </button>
            </div>
            <p className="mt-3 text-[10px] text-muted-foreground">Mute hides their chat & blocks bidding. Timeout expires automatically.</p>
          </div>
        </div>
      )}

      {/* 🆕 Mystery Break panel — character editor + live claims + spin reveal */}
      {showBreakPanel && isSeller && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center" onClick={() => setShowBreakPanel(false)}>
          <div onClick={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-card text-foreground shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/50 p-4 pb-3">
              <p className="flex items-center gap-1.5 text-sm font-bold"><Dice5 className="h-4 w-4 text-primary" /> Mystery Break</p>
              <button onClick={() => setShowBreakPanel(false)}><X className="h-4 w-4" /></button>
            </div>

            <div className="overflow-y-auto p-4">
              <p className="mb-3 text-[11px] text-muted-foreground">
                Name each slot (Charizard, Team A, Box #3 — anything). Buyers tap to claim. When all are claimed, hit <b>Spin reveal</b> and a fun wheel pops out for everyone.
              </p>

              <div className="mb-3 grid grid-cols-2 gap-2">
                <label className="text-[11px] text-muted-foreground">
                  Slot count
                  <input type="number" min="2" max="50" value={breakSlotCount}
                    onChange={(e) => {
                      const v = e.target.value;
                      setBreakSlotCount(v);
                      const n = Math.max(2, Math.min(50, Number(v) || 0));
                      setBreakCharacters((arr) => {
                        if (n <= arr.length) return arr.slice(0, n);
                        return [...arr, ...Array.from({ length: n - arr.length }, (_, i) => `Character ${arr.length + i + 1}`)];
                      });
                    }}
                    disabled={stream.break_mode === "open"}
                    className="mt-1 w-full rounded-lg bg-input px-3 py-2 text-sm font-bold outline-none disabled:opacity-50" />
                </label>
                <label className="text-[11px] text-muted-foreground">
                  Price/slot $
                  <input type="number" min="1" value={breakPrice}
                    onChange={(e) => setBreakPrice(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-input px-3 py-2 text-sm font-bold outline-none" />
                </label>
              </div>

              {/* Character roster — one input per slot */}
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold text-muted-foreground">Slot names ({Math.max(2, Math.min(50, Number(breakSlotCount) || 0))})</p>
                <button
                  type="button"
                  disabled={stream.break_mode === "open" || (Number(breakSlotCount) || 0) >= 50}
                  onClick={() => {
                    const next = Math.min(50, (Number(breakSlotCount) || 0) + 1);
                    setBreakSlotCount(String(next));
                    setBreakCharacters((arr) => [...arr, `Character ${arr.length + 1}`]);
                  }}
                  className="flex items-center gap-1 rounded-md bg-primary/15 px-2 py-1 text-[10px] font-bold text-primary disabled:opacity-50"
                >
                  <Plus className="h-3 w-3" /> Add slot
                </button>
              </div>
              <div className="mb-3 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border/50 bg-muted/20 p-2">
                {Array.from({ length: Math.max(2, Math.min(50, Number(breakSlotCount) || 0)) }, (_, i) => {
                  const taken = breakSlots.find((s) => s.slot_number === i + 1);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-6 shrink-0 text-center text-[10px] font-bold text-muted-foreground">{i + 1}</span>
                      <input
                        value={breakCharacters[i] ?? ""}
                        onChange={(e) => setBreakCharacters((arr) => {
                          const next = [...arr];
                          next[i] = e.target.value;
                          return next;
                        })}
                        disabled={stream.break_mode === "open"}
                        placeholder={`Character ${i + 1}`}
                        className="flex-1 rounded-md bg-input px-2 py-1.5 text-xs outline-none disabled:opacity-60"
                      />
                      {taken ? (
                        <span className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">@{taken.buyer_username}</span>
                      ) : (
                        <span className="w-14 shrink-0 text-right text-[9px] text-muted-foreground">open</span>
                      )}
                    </div>
                  );
                })}
              </div>

              <label className="mb-3 block text-[11px] text-muted-foreground">
                Default prefix (used when a slot name is left blank)
                <input value={breakPrefix} onChange={(e) => setBreakPrefix(e.target.value.slice(0, 12))}
                  disabled={stream.break_mode === "open"}
                  placeholder='e.g. "Box "'
                  className="mt-1 w-full rounded-lg bg-input px-3 py-2 text-xs outline-none disabled:opacity-50" />
              </label>

              {stream.break_mode === "open" ? (
                <div className="space-y-2">
                  <div className="rounded-lg bg-muted/40 p-2 text-[11px]">
                    <p className="font-semibold">Claimed: {breakSlots.length}/{stream.break_slot_count}</p>
                  </div>
                  <button
                    onClick={spinBreakWheel}
                    disabled={breakSlots.length === 0 || stream.break_wheel_spinning}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-400 via-pink-500 to-purple-500 py-2.5 text-sm font-extrabold text-white shadow-lg disabled:opacity-50"
                  >
                    <RotateCw className="h-4 w-4" /> {stream.break_wheel_spinning ? "Spinning…" : "🎡 Spin reveal wheel"}
                  </button>
                  <button
                    onClick={closeBreakClaims}
                    disabled={drawAnim}
                    className="w-full rounded-lg bg-card-foreground/10 py-2 text-xs font-bold text-foreground disabled:opacity-50"
                  >
                    {drawAnim ? "Locking…" : "🔒 Close claims"}
                  </button>
                </div>
              ) : (
                <button onClick={startBreakMode} className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground">
                  <Users className="mr-1 inline h-3.5 w-3.5" /> Open break for claims
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 🆕 Live break-draw celebration overlay */}
      {drawAnim && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur">
          <div className="animate-in zoom-in text-center">
            <Dice5 className="mx-auto h-16 w-16 animate-spin text-yellow-300" />
            <p className="mt-3 text-2xl font-extrabold tracking-wider text-white">SHUFFLING TEAMS…</p>
            <p className="mt-1 text-sm text-white/70">Random fair draw in progress</p>
          </div>
        </div>
      )}

      {/* 🆕 BREAK REVEAL WHEEL — fullscreen, fun, visible to ALL viewers */}
      {(stream.break_wheel_spinning || stream.break_wheel_last_winner_username) && (() => {
        const claimed = [...breakSlots].filter((s) => s.slot_number != null).sort((a, b) => a.slot_number - b.slot_number);
        if (claimed.length === 0) return null;
        const palette = ["#ec4899","#7c3aed","#f59e0b","#10b981","#3b82f6","#ef4444","#06b6d4","#a855f7","#14b8a6","#f97316"];
        const wheelSlots: WheelSlot[] = claimed.map((s, i) => ({
          id: String(s.slot_number),
          label: s.character_label || `${stream.break_slot_prefix || "#"}${s.slot_number}`,
          weight: 1,
          color: palette[i % palette.length],
          is_active: true,
        }));
        const targetId = stream.break_wheel_target_slot != null ? String(stream.break_wheel_target_slot) : null;
        const startedAt = stream.break_wheel_started_at ? new Date(stream.break_wheel_started_at).getTime() : null;
        const finishAt = stream.break_wheel_ends_at ? new Date(stream.break_wheel_ends_at).getTime() : null;
        const winnerLabel = stream.break_wheel_last_winner_label;
        const winnerUser = stream.break_wheel_last_winner_username;
        return (
          <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-gradient-to-br from-purple-900/95 via-black/90 to-pink-900/95 p-4 backdrop-blur-sm animate-in fade-in">
            {isSeller && !stream.break_wheel_spinning && (
              <button
                onClick={async () => {
                  await supabase.from("live_streams").update({
                    break_wheel_last_winner_username: null,
                    break_wheel_last_winner_label: null,
                    break_wheel_target_slot: null,
                  }).eq("id", id);
                }}
                className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white"
              ><X className="h-5 w-5" /></button>
            )}
            <p className="mb-1 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-amber-300">
              <Dice5 className="h-3.5 w-3.5" /> Mystery Break Reveal
            </p>
            <p className="mb-4 text-[11px] text-white/70">{claimed.length} contenders · the wheel decides</p>
            <SpinWheel
              slots={wheelSlots}
              spinning={!!stream.break_wheel_spinning}
              targetSlotId={targetId}
              startedAt={startedAt}
              finishAt={finishAt}
              size={Math.min(360, typeof window !== "undefined" ? Math.min(window.innerWidth, window.innerHeight) - 180 : 320)}
            />
            {!stream.break_wheel_spinning && winnerLabel && winnerUser && (
              <div className="mt-6 w-full max-w-sm rounded-2xl bg-gradient-to-r from-amber-400 via-pink-500 to-purple-500 p-4 text-center shadow-2xl ring-2 ring-white/30 animate-in zoom-in">
                <Trophy className="mx-auto h-8 w-8 text-white" />
                <p className="mt-1 text-lg font-extrabold tracking-tight text-white">{winnerLabel}</p>
                <p className="text-sm font-bold text-white/90">goes to @{winnerUser} 🎉</p>
              </div>
            )}
            {stream.break_wheel_spinning && (
              <p className="mt-4 animate-pulse text-sm font-bold text-amber-200">🎡 Spinning…</p>
            )}
          </div>
        );
      })()}

      {/* 🆕 Spin Wheel — fullscreen overlay (visible to ALL viewers when open) */}
      {showWheelOverlay && wheel && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <button
            onClick={() => setShowWheelOverlay(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white"
          ><X className="h-5 w-5" /></button>
          <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-300">
            <RotateCw className="h-3.5 w-3.5" /> {wheel.title || "Spin to Win"}
          </p>
          <p className="mb-4 text-[11px] text-white/60">
            Spin time: {String(wheel.spin_speed).match(/^\d+$/) ? `${wheel.spin_speed}s` : wheel.spin_speed} · {wheelSlots.filter(s=>s.is_active).length} prizes
          </p>
          <SpinWheel
            slots={wheelSlots}
            spinning={!!wheel.is_spinning}
            targetSlotId={wheel.spin_target_slot_id || null}
            startedAt={wheel.spin_started_at ? new Date(wheel.spin_started_at).getTime() : null}
            finishAt={wheel.spin_ends_at ? new Date(wheel.spin_ends_at).getTime() : null}
            size={Math.min(360, typeof window !== "undefined" ? Math.min(window.innerWidth, window.innerHeight) - 140 : 320)}
          />

          <div className="mt-6 flex w-full max-w-sm flex-col gap-2">
            {/* Host post-spin decision: Remove or Keep the landed slot */}
            {isSeller && wheel.pending_decision_slot_id && !wheel.is_spinning && (
              <div className="rounded-xl bg-white/10 p-3">
                <p className="mb-2 text-center text-xs text-white/80">
                  Landed on <span className="font-bold text-amber-300">{wheel.pending_decision_slot_label}</span> — keep it on the wheel or remove it?
                </p>
                <div className="flex gap-2">
                  <button onClick={() => decideAfterSpin("remove")} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-500 py-2.5 text-xs font-extrabold text-white">
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                  <button onClick={() => decideAfterSpin("keep")} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 py-2.5 text-xs font-extrabold text-white">
                    <Check className="h-3.5 w-3.5" /> Keep
                  </button>
                </div>
              </div>
            )}
            {!isSeller && wheel.pending_decision_slot_id && !wheel.is_spinning && (
              <div className="rounded-xl bg-white/5 p-3 text-center text-xs text-white/70">
                Waiting for host to decide on <span className="font-bold text-amber-300">{wheel.pending_decision_slot_label}</span>…
              </div>
            )}

            {(isSeller || wheel.viewer_can_spin) && !wheel.is_spinning && !wheel.pending_decision_slot_id && (
              <button
                onClick={triggerSpin}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 py-3 text-base font-extrabold text-white shadow-lg active:scale-[0.98]"
              >
                <RotateCw className="h-5 w-5" /> SPIN!
              </button>
            )}
            {wheel.is_spinning && (
              <div className="flex items-center justify-center gap-2 rounded-xl bg-white/10 py-3 text-sm font-bold text-white">
                <Lock className="h-4 w-4" /> Wheel locked while spinning
              </div>
            )}
            {!isSeller && !wheel.viewer_can_spin && !wheel.is_spinning && !wheel.pending_decision_slot_id && (
              <p className="text-center text-xs text-white/50">Only the host can spin right now</p>
            )}
            {isSeller && wheel.is_locked && !wheel.is_spinning && !wheel.pending_decision_slot_id && (
              <button onClick={resetWheel} className="flex items-center justify-center gap-1.5 rounded-xl bg-white/10 py-2 text-xs font-bold text-white/80">
                <Unlock className="h-3.5 w-3.5" /> Reset wheel (unlock editing)
              </button>
            )}
            {wheel.last_winner_slot_label && !wheel.is_spinning && !wheel.pending_decision_slot_id && (
              <div className="rounded-xl bg-white/5 p-3 text-center text-xs text-white/80">
                Last spin: <span className="font-bold text-amber-300">{wheel.last_winner_slot_label}</span> →{" "}
                <span className="font-bold text-white">@{wheel.last_winner_username}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🆕 Winner popup — appears for everyone when a spin lands */}
      {wheelWinnerPopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={() => setWheelWinnerPopup(null)}>
          <div className="animate-in zoom-in-95 fade-in rounded-3xl bg-gradient-to-br from-amber-400 via-rose-500 to-purple-600 p-1 shadow-2xl">
            <div className="rounded-3xl bg-black/85 px-8 py-6 text-center">
              <Trophy className="mx-auto h-12 w-12 text-amber-300" />
              <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-amber-300">Winner</p>
              <p className="mt-1 text-2xl font-extrabold text-white">{wheelWinnerPopup.slot}</p>
              <p className="mt-3 text-xs text-white/70">Owned by</p>
              <p className="text-lg font-bold text-white">@{wheelWinnerPopup.winner}</p>
            </div>
          </div>
        </div>
      )}

      {/* 🆕 Wheel editor — host only */}
      {showWheelEditor && isSeller && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center" onClick={() => setShowWheelEditor(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-card p-4 text-foreground shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-bold"><RotateCw className="h-4 w-4 text-primary" /> Spin Wheel</p>
              <button onClick={() => setShowWheelEditor(false)}><X className="h-4 w-4" /></button>
            </div>

            {wheel?.is_spinning && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-yellow-500/20 p-2 text-[11px] text-yellow-300">
                <Lock className="h-3.5 w-3.5" /> Locked while spinning
              </div>
            )}
            {!wheel?.is_spinning && wheel?.is_locked && (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-amber-500/15 p-2 text-[11px] text-amber-300">
                <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Wheel locked — reset to edit slots</span>
                <button onClick={resetWheel} className="flex items-center gap-1 rounded-md bg-amber-500/30 px-2 py-1 text-[10px] font-bold text-amber-100">
                  <Unlock className="h-3 w-3" /> Reset
                </button>
              </div>
            )}

            {/* Settings */}
            <div className="mb-3 space-y-2 rounded-xl bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-muted-foreground">Spin time</p>
                <div className="flex gap-1">
                  {(["5","10","15"] as const).map((s) => (
                    <button key={s} disabled={!!wheel?.is_spinning} onClick={() => updateWheelSpeed(s)}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${String(wheel?.spin_speed) === s ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"} disabled:opacity-50`}>
                      {s}s
                    </button>
                  ))}
                </div>
              </div>
              <button disabled={!wheel} onClick={toggleViewerSpin}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] font-bold ${wheel?.viewer_can_spin ? "bg-primary/20 text-primary" : "bg-background text-muted-foreground"}`}>
                <span>Allow viewers to spin</span>
                <span>{wheel?.viewer_can_spin ? "ON" : "OFF"}</span>
              </button>
              <p className="text-[10px] text-muted-foreground">After each spin you'll choose <b>Remove</b> or <b>Keep</b> the landed prize.</p>
            </div>

            {/* Add slot */}
            <div className="mb-3 flex gap-2">
              <input value={draftSlotLabel} onChange={(e) => setDraftSlotLabel(e.target.value)} placeholder="Prize / item" maxLength={40} disabled={!!wheel?.is_locked || !!wheel?.is_spinning} className="flex-1 rounded-lg bg-muted px-3 py-2 text-sm outline-none disabled:opacity-50" />
              <input value={draftSlotWeight} onChange={(e) => setDraftSlotWeight(e.target.value)} type="number" min="1" max="100" disabled={!!wheel?.is_locked || !!wheel?.is_spinning} className="w-16 rounded-lg bg-muted px-2 py-2 text-center text-sm outline-none disabled:opacity-50" />
              <button disabled={!!wheel?.is_spinning || !!wheel?.is_locked} onClick={addWheelSlot} className="flex items-center gap-1 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50">
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">Higher weight = better odds. Min 2 slots to spin.</p>
              <button onClick={shuffleWheelSlots} disabled={!!wheel?.is_spinning || !!wheel?.pending_decision_slot_id || wheelSlots.length < 2}
                className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[10px] font-bold text-foreground disabled:opacity-40">
                <Shuffle className="h-3 w-3" /> Shuffle
              </button>
            </div>

            {/* Slot list */}
            <div className="mb-3 max-h-44 space-y-1 overflow-y-auto">
              {wheelSlots.length === 0 && <p className="text-center text-xs text-muted-foreground">No slots yet</p>}
              {wheelSlots.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-lg bg-muted/40 p-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
                  <p className="min-w-0 flex-1 truncate text-xs font-semibold">{s.label}</p>
                  <span className="rounded bg-background px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">×{s.weight}</span>
                  <button disabled={!!wheel?.is_spinning || !!wheel?.is_locked} onClick={() => removeWheelSlot(s.id)} className="text-destructive disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={() => { setShowWheelEditor(false); setShowWheelOverlay(true); }} disabled={!wheel || wheelSlots.filter(s=>s.is_active).length < 2}
                className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 py-2.5 text-sm font-extrabold text-white disabled:opacity-50">
                Open & Spin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🆕 Lucky Letter Drop — Giveaway overlay */}
      <LiveGiveaway
        streamId={id}
        isSeller={isSeller}
        userId={user?.id || null}
        username={profile?.username || null}
        isFollower={isFollowingHost}
        isBuyer={isPastBuyer}
        open={showGiveaway}
        onClose={() => { setShowGiveaway(false); setGiveawayComposer(false); }}
        hostOpenComposer={giveawayComposer}
        setHostOpenComposer={setGiveawayComposer}
      />
    </div>
  );
}
