import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Radio,
  Send,
  Sparkles,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  X,
  Camera,
  Square,
  Timer,
  Settings,
  Play,
  Trophy,
  Pin,
  PinOff,
  Share2,
  Megaphone,
  Copy,
  Shield,
  ShieldPlus,
  Trash2,
  Zap,
  Users,
  Dice5,
  Globe,
  VolumeX,
  Ban,
  Clock as ClockIcon,
  RotateCw,
  Plus,
  Lock,
  Shuffle,
  Unlock,
  Check,
  Gift,
} from "lucide-react";
import { toast } from "sonner";
import { CardScanner } from "@/components/CardScanner";
import { HlsPlayer, type HlsVideoMetrics } from "@/components/HlsPlayer";
import { useCurrency, SUPPORTED_CURRENCIES, type Currency } from "@/lib/currency";
import { SpinWheel, weightedPick, type WheelSlot } from "@/components/SpinWheel";
import { LiveGiveaway } from "@/components/LiveGiveaway";
import { ViewerGiveawayJoin } from "@/components/ViewerGiveawayJoin";
import { HostPaymentLog, logPaymentEvent } from "@/components/HostPaymentLog";
import { UserActionsMenu } from "@/components/UserActionsMenu";
import { TipCheckout } from "@/components/TipCheckout";

import { Confetti } from "@/components/Confetti";
import { useStreamPresence } from "@/hooks/useStreamPresence";
import { ReportDialog } from "@/components/ReportDialog";
import { Flag } from "lucide-react";
import { KOModal, type KODestination } from "@/components/KOModal";
import { KOViewerOverlay } from "@/components/KOViewerOverlay";
import { CollabPanel } from "@/components/CollabPanel";
import { ViewerListModal } from "@/components/ViewerListModal";
import { Users2 } from "lucide-react";
import { useVoiceCommands } from "@/hooks/useVoiceCommands";
import { useCloudflareCalls } from "@/hooks/useCloudflareCalls";
import { CoHostStage } from "@/components/CoHostStage";
import { useTour } from "@/components/MascotGuide";
import { FlexLiveControls } from "@/components/FlexLiveControls";
import { flexFilterCss } from "@/lib/flexFilters";
import { useLegalStatus } from "@/hooks/useLegalStatus";
import { useLivestreamSafety } from "@/hooks/useLivestreamSafety";

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
  const { needsAcceptance } = useLegalStatus();
  const { triggerOnce } = useTour();
  const [stream, setStream] = useState<any>(null);
  // Mascot tour: pick the right guide for the viewer's role + stream type.
  // Audience gating in MascotGuide is the safety net; we still avoid mismatched
  // calls so hosts never see buyer hints (and vice versa).
  useEffect(() => {
    if (!stream) return;
    const isHost = !!(user && stream.seller_id === user.id);
    const isFlex = stream.mode === "show_off";
    if (isHost) {
      if (isFlex) triggerOnce("seller-first-stream");
      else if (stream.cf_rtmps_url || stream.cf_stream_key) triggerOnce("obs-connect");
    } else {
      if (isFlex) triggerOnce("flex-live-screen");
      else triggerOnce("auction-live-screen");
    }
  }, [stream, user, triggerOnce]);
  const [sellerUsername, setSellerUsername] = useState<string>("");
  const [allStreams, setAllStreams] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [showChat, setShowChat] = useState(true);
  const [hostFocus, setHostFocus] = useState(false);
  const [flexImmersive, setFlexImmersive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [holdAdd, setHoldAdd] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [koOpen, setKoOpen] = useState(false);
  const [koEnrichedDests, setKoEnrichedDests] = useState<any[]>([]);
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
  const [tipOpen, setTipOpen] = useState(false);
  const [tipOverlay, setTipOverlay] = useState<{
    id: string;
    username: string;
    amount: number;
    message?: string;
  } | null>(null);
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
  const [showCollabPanel, setShowCollabPanel] = useState(false);
  const [showViewerList, setShowViewerList] = useState(false);
  const [showQuickMod, setShowQuickMod] = useState(false);
  const [quickModInput, setQuickModInput] = useState("");
  const [showViewerPreview, setShowViewerPreview] = useState(true);
  const [previewPos, setPreviewPos] = useState<{ x: number; y: number }>({ x: 12, y: 64 });
  const [obsDisplayMode, setObsDisplayMode] = useState<"auto" | "fit" | "vertical" | "horizontal">(
    "auto",
  );
  const [obsMetrics, setObsMetrics] = useState<HlsVideoMetrics | null>(null);
  const [switchingToBrowserCam, setSwitchingToBrowserCam] = useState(false);
  const [showPaymentLog, setShowPaymentLog] = useState(false);
  const [modSearchQ, setModSearchQ] = useState("");
  const [modSearchRes, setModSearchRes] = useState<any[]>([]);
  const [modInput, setModInput] = useState("");
  const [annOpen, setAnnOpen] = useState(false);
  const [annText, setAnnText] = useState("");
  const [hypeCard, setHypeCard] = useState<{
    name: string;
    category: string;
    set_guess: string;
    rarity_vibe: string;
    image: string;
  } | null>(null);

  // 🆕 Anti-snipe banner
  const [snipeFlash, setSnipeFlash] = useState(false);
  // 🆕 Snipe / buy-now-during-live
  const [snipePriceInput, setSnipePriceInput] = useState("");
  const [snipeOpen, setSnipeOpen] = useState(false);
  // 🆕 Chat moderation actions
  const [chatActions, setChatActions] = useState<any[]>([]);
  const [chatActionMenu, setChatActionMenu] = useState<{ userId: string; username: string } | null>(
    null,
  );
  // 🆕 Mystery break (numbered slots 1..N)
  const [breakSlots, setBreakSlots] = useState<any[]>([]);
  const [showBreakPanel, setShowBreakPanel] = useState(false);
  // Viewer-side break drawer (controlled separately from host editor)
  const [showViewerBreak, setShowViewerBreak] = useState(false);
  const [selectedBreakSlots, setSelectedBreakSlots] = useState<number[]>([]);
  const [claimingBreakSlots, setClaimingBreakSlots] = useState(false);
  const [selectionDeadline, setSelectionDeadline] = useState<number | null>(null);
  const [selectionCountdown, setSelectionCountdown] = useState<number>(0);
  const [breakSlotCount, setBreakSlotCount] = useState("20"); // 1..50
  const [breakPrice, setBreakPrice] = useState("10");
  const [breakPrefix, setBreakPrefix] = useState(""); // optional label e.g. "Box"
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
  // Track latest giveaway so we can live-tick its announcement and auto-hide it once a winner is decided.
  const [activeGiveaway, setActiveGiveaway] = useState<any>(null);
  const giveawayStatus = activeGiveaway?.status ?? null;
  // Per-viewer dismissed announcements (ids the viewer tapped X on)
  const [dismissedAnnouncementIds, setDismissedAnnouncementIds] = useState<Set<string>>(new Set());
  const [isFollowingHost, setIsFollowingHost] = useState(false);
  const [isPastBuyer, setIsPastBuyer] = useState(false);
  // 🆕 Currency display preference (per-viewer)
  const [viewerCurrency, setViewerCurrency] = useState<Currency>("USD");
  // 🆕 Live presence — viewer count + "joined the live" announcements
  const [viewerCount, setViewerCount] = useState(0);
  const announcedJoinsRef = useRef<Set<string>>(new Set());
  const { fmt: fmtMoney } = useCurrency(viewerCurrency);

  // 🆕 Spin Wheel state
  const [wheel, setWheel] = useState<any>(null);
  const [wheelSlots, setWheelSlots] = useState<WheelSlot[]>([]);
  const [showWheelOverlay, setShowWheelOverlay] = useState(false);
  const [showWheelEditor, setShowWheelEditor] = useState(false);
  const [wheelWinnerPopup, setWheelWinnerPopup] = useState<{ slot: string; winner: string } | null>(
    null,
  );
  const [draftSlotLabel, setDraftSlotLabel] = useState("");
  const [draftSlotWeight, setDraftSlotWeight] = useState("1");
  const wheelLandedRef = useRef<string | null>(null);

  const isMod = !!user && mods.some((m) => m.mod_user_id === user.id);
  const isStaff =
    !!user &&
    (mods.some((m) => m.mod_user_id === user.id) || (stream && user.id === stream.seller_id));

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
  // 🆕 Chat slow-mode (seconds between messages per viewer; 0 = off)
  const [editSlowMode, setEditSlowMode] = useState("0");
  const [editRevealMode, setEditRevealMode] = useState<"none" | "wheel" | "break">("none");
  // 🆕 Host quick-bar state — start a round in one tap without opening Settings
  const [quickItem, setQuickItem] = useState("");
  const [quickBuyNow, setQuickBuyNow] = useState("");
  const [lastQuick, setLastQuick] = useState<{
    item: string;
    start: string;
    timer: string;
    buyNow: string;
  } | null>(null);
  const lastChatTsRef = useRef<number>(0);

  useEffect(() => {
    supabase
      .from("live_streams")
      .select("*")
      .eq("status", "live")
      .order("created_at", { ascending: false })
      .then(({ data }) => setAllStreams(data || []));
  }, [id]);

  useEffect(() => {
    supabase
      .from("live_streams")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(async ({ data }) => {
        // Fetch private RTMPS credentials separately (only readable by stream owner via RLS)
        if (data && user && data.seller_id === user.id) {
          const { data: cred } = await supabase
            .from("live_stream_credentials" as any)
            .select("cf_live_input_id, cf_rtmps_url, cf_stream_key")
            .eq("stream_id", id)
            .maybeSingle();
          if (cred) Object.assign(data, cred);
        }
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
          setEditSlowMode(String((data as any).chat_slow_mode_sec ?? 0));
          setEditRevealMode(((data as any).auction_reveal_mode as any) || "none");
          if (data.break_slot_count) setBreakSlotCount(String(data.break_slot_count));
          if ((data as any).break_slot_price) setBreakPrice(String((data as any).break_slot_price));
          if (data.break_slot_prefix) setBreakPrefix(data.break_slot_prefix);
          if (Array.isArray(data.break_characters) && data.break_characters.length) {
            setBreakCharacters(data.break_characters as string[]);
          }
          const { data: spRows } = await (supabase.rpc as any)("public_profiles_by_ids", {
            _ids: [data.seller_id],
          });
          const sp = (spRows && spRows[0]) || null;
          if (sp?.username) setSellerUsername(sp.username);
        }
      });
    supabase
      .from("chat_messages")
      .select("*")
      .eq("stream_id", id)
      .order("created_at")
      .then(({ data }) => setMessages(data || []));
    supabase
      .from("stream_shoutouts")
      .select("*")
      .eq("stream_id", id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setShoutouts(data || []));
    supabase
      .from("stream_moderators")
      .select("*")
      .eq("stream_id", id)
      .then(({ data }) => setMods(data || []));
    supabase
      .from("stream_chat_actions")
      .select("*")
      .eq("stream_id", id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setChatActions(data || []));
    supabase
      .from("break_slots")
      .select("*")
      .eq("stream_id", id)
      .order("created_at")
      .then(({ data }) => setBreakSlots(data || []));

    const ch = supabase
      .channel(`live-${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `stream_id=eq.${id}` },
        (p) => setMessages((m) => [...m, p.new]),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_streams", filter: `id=eq.${id}` },
        (p) => {
          const next = p.new as any;
          // 🆕 Detect anti-snipe extension to flash UI
          setStream((prev: any) => {
            if (prev && next.snipe_extends > (prev.snipe_extends || 0)) {
              setSnipeFlash(true);
              setTimeout(() => setSnipeFlash(false), 1500);
            }
            return next;
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "stream_shoutouts",
          filter: `stream_id=eq.${id}`,
        },
        (p) => setShoutouts((s) => [p.new, ...s]),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "stream_moderators",
          filter: `stream_id=eq.${id}`,
        },
        (p) => setMods((m) => [...m, p.new]),
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "stream_moderators",
          filter: `stream_id=eq.${id}`,
        },
        (p) => setMods((m) => m.filter((x) => x.id !== (p.old as any).id)),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "stream_mod_messages",
          filter: `stream_id=eq.${id}`,
        },
        (p) => setModChat((m) => [...m, p.new]),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "stream_chat_actions",
          filter: `stream_id=eq.${id}`,
        },
        (p) => setChatActions((a) => [p.new, ...a]),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "break_slots", filter: `stream_id=eq.${id}` },
        (p) => setBreakSlots((s) => [...s, p.new]),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "break_slots", filter: `stream_id=eq.${id}` },
        (p) => setBreakSlots((s) => s.map((x) => (x.id === (p.new as any).id ? p.new : x))),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "stream_tips", filter: `stream_id=eq.${id}` },
        (p) => {
          const t: any = p.new;
          if (t.status === "paid") {
            setTipOverlay({
              id: t.id,
              username: t.buyer_username,
              amount: Number(t.amount),
              message: t.message,
            });
            setTimeout(() => setTipOverlay((cur) => (cur && cur.id === t.id ? null : cur)), 6000);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id]);

  // 🆕 Presence — count viewers + announce joins to chat
  useEffect(() => {
    if (!id) return;
    const myKey = user?.id || `guest-${Math.random().toString(36).slice(2, 10)}`;
    const myName = profile?.username || "viewer";
    const ch = supabase.channel(`presence-${id}`, { config: { presence: { key: myKey } } });
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState() as Record<string, any[]>;
      setViewerCount(Object.keys(state).length);
    });
    ch.on("presence", { event: "join" }, ({ key, newPresences }) => {
      if (key === myKey) return;
      if (announcedJoinsRef.current.has(key)) return;
      announcedJoinsRef.current.add(key);
      const u = (newPresences?.[0] as any)?.username || "viewer";
      // Only announce signed-in users (skip generic guests)
      if (!String(key).startsWith("guest-")) {
        sendMsg(`👋 @${u} has joined the live`, true);
      }
    });
    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ username: myName, joined_at: Date.now() });
      }
    });
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id, profile?.username]);
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("preferred_currency")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.preferred_currency) setViewerCurrency(data.preferred_currency as Currency);
      });
  }, [user?.id]);

  // 🆕 Auto-open viewer break drawer only when host pins it; otherwise never force it open/closed.
  useEffect(() => {
    if (!stream) return;
    if (stream.break_force_visible && stream.break_mode === "open") {
      setShowViewerBreak(true);
    } else if (stream.break_mode !== "open" || !stream.break_force_visible) {
      setShowViewerBreak(false);
    }
  }, [stream?.break_force_visible, stream?.break_mode]);

  useEffect(() => {
    if (!breakSlots.length) return;
    setSelectedBreakSlots((slots) =>
      slots.filter((n) => !breakSlots.some((s) => s.slot_number === n)),
    );
  }, [breakSlots]);

  // 🆕 5-second hold: if viewer doesn't claim in time, release selections
  useEffect(() => {
    if (!selectionDeadline) {
      setSelectionCountdown(0);
      return;
    }
    const tick = () => {
      const ms = selectionDeadline - Date.now();
      if (ms <= 0) {
        setSelectedBreakSlots([]);
        setSelectionDeadline(null);
        setSelectionCountdown(0);
        toast.message("Selection expired — slot released");
      } else {
        setSelectionCountdown(Math.ceil(ms / 1000));
      }
    };
    tick();
    const iv = setInterval(tick, 200);
    return () => clearInterval(iv);
  }, [selectionDeadline]);

  // 🆕 Block bidding/buying when there's an unpaid order — buyer must settle first
  const [unpaidOrders, setUnpaidOrders] = useState(0);
  useEffect(() => {
    if (!user) {
      setUnpaidOrders(0);
      return;
    }
    const refresh = () =>
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("buyer_id", user.id)
        .eq("payment_status", "awaiting_payment")
        .then(({ count }) => setUnpaidOrders(count ?? 0));
    refresh();
    const ch = supabase
      .channel(`unpaid-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `buyer_id=eq.${user.id}` },
        refresh,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  // 🆕 For Giveaway eligibility — does the current viewer follow the host / has bought from them?
  useEffect(() => {
    if (!user || !stream?.seller_id || user.id === stream.seller_id) {
      setIsFollowingHost(false);
      setIsPastBuyer(false);
      return;
    }
    supabase
      .from("follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("follower_id", user.id)
      .eq("followee_id", stream.seller_id)
      .then(({ count }) => setIsFollowingHost((count ?? 0) > 0));
    // 🆕 "Past buyers" = bought in THIS stream only (not across all past streams)
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("buyer_id", user.id)
      .eq("seller_id", stream.seller_id)
      .eq("stream_id", id)
      .then(({ count }) => setIsPastBuyer((count ?? 0) > 0));
  }, [user?.id, stream?.seller_id]);

  // 🆕 Live viewer presence (DB-backed; heartbeat + 1-min idle removal). Used for viewer list.
  const { viewers: liveViewers } = useStreamPresence(
    id || null,
    user?.id || null,
    profile?.username || null,
    profile?.avatar_url || null,
  );

  // Load mod chat once user is known to be staff
  useEffect(() => {
    if (!isStaff) {
      setModChat([]);
      return;
    }
    supabase
      .from("stream_mod_messages")
      .select("*")
      .eq("stream_id", id)
      .order("created_at")
      .then(({ data }) => setModChat(data || []));
  }, [isStaff, id]);

  // 🆕 Load Spin Wheel + slots, subscribe to realtime updates
  useEffect(() => {
    let cancelled = false;
    async function loadWheel() {
      const { data: w } = await supabase
        .from("spin_wheels")
        .select("*")
        .eq("stream_id", id)
        .maybeSingle();
      if (cancelled) return;
      setWheel(w || null);
      if (w) {
        const { data: ss } = await supabase
          .from("wheel_slots")
          .select("*")
          .eq("wheel_id", w.id)
          .order("position");
        if (!cancelled) setWheelSlots((ss || []) as WheelSlot[]);
      } else {
        setWheelSlots([]);
      }
    }
    loadWheel();
    const ch = supabase
      .channel(`wheel-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "spin_wheels", filter: `stream_id=eq.${id}` },
        (p) => {
          const next: any = p.new;
          setWheel(next || null);
          // Auto-open the wheel for everyone the moment a spin starts
          if (next?.is_spinning) {
            wheelLandedRef.current = null;
            setShowWheelOverlay(true);
          }
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "wheel_slots" }, async () => {
        // Re-fetch slots whenever any change occurs (small table, host-only writes)
        const wid =
          wheel?.id ||
          (await supabase.from("spin_wheels").select("id").eq("stream_id", id).maybeSingle()).data
            ?.id;
        if (!wid) return;
        const { data: ss } = await supabase
          .from("wheel_slots")
          .select("*")
          .eq("wheel_id", wid)
          .order("position");
        setWheelSlots((ss || []) as WheelSlot[]);
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "wheel_spins", filter: `stream_id=eq.${id}` },
        (p) => {
          const r: any = p.new;
          setWheelWinnerPopup({ slot: r.slot_label, winner: r.winner_username });
          setTimeout(() => setWheelWinnerPopup(null), 6000);
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 🆕 Track latest giveaway (status + ends_at) so the announcement bubble can tick live and auto-hide.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("giveaways")
        .select("*")
        .eq("stream_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setActiveGiveaway(data || null);
    }
    load();
    const ch = supabase
      .channel(`giveaway-status-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "giveaways", filter: `stream_id=eq.${id}` },
        (p) => setActiveGiveaway((p.new as any) || (p.old as any) || null),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [id]);

  // Auto-hide AI hype overlay after 5s
  useEffect(() => {
    if (!hypeCard) return;
    const t = setTimeout(() => setHypeCard(null), 5000);
    return () => clearTimeout(t);
  }, [hypeCard]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Seller capture modes:
  //   - usingObs:        Cloudflare HLS exists, no WHIP → seller broadcasts via OBS, no in-browser cam
  //   - usingCompositor: Cloudflare HLS + WHIP URL → seller broadcasts canvas-composited multi-cam from browser
  //   - else:            legacy in-app camera preview only
  const usingCompositor = !!stream?.cf_playback_hls && !!stream?.cf_whip_url;
  const usingObs = !!stream?.cf_playback_hls && !usingCompositor;
  const obsTinyFeed =
    !!obsMetrics &&
    (obsMetrics.hasLargeBlackBorders ||
      (!!obsMetrics.activeWidthRatio && obsMetrics.activeWidthRatio < 0.72) ||
      (!!obsMetrics.activeHeightRatio && obsMetrics.activeHeightRatio < 0.72));
  const obsScale =
    obsDisplayMode === "horizontal"
      ? 1
      : obsDisplayMode === "vertical"
        ? Math.max(
            obsMetrics?.recommendedZoom ?? 1,
            obsMetrics?.orientation === "horizontal" ? 1.35 : 1,
          )
        : obsDisplayMode === "fit" || obsTinyFeed
          ? (obsMetrics?.recommendedZoom ?? 1)
          : 1;
  const obsPositionX = obsMetrics?.activeCenterX ?? 50;
  const obsPositionY = obsMetrics?.activeCenterY ?? 50;
  const obsVideoStyle = {
    objectFit: "cover" as const,
    objectPosition: `${obsPositionX}% ${obsPositionY}%`,
    transform: `scale(${obsScale})`,
    transformOrigin: `${obsPositionX}% ${obsPositionY}%`,
    transition: "transform 220ms ease, object-position 220ms ease",
  };
  const obsPreviewAspectClass =
    obsDisplayMode === "horizontal" ||
    (obsDisplayMode === "auto" && obsMetrics?.orientation === "horizontal")
      ? "aspect-video"
      : "aspect-[9/16]";
  useEffect(() => {
    if (!isSeller || !stream || stream.status !== "live" || usingObs) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: true,
        });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        camStream.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
      camStream.current?.getTracks().forEach((t) => t.stop());
      camStream.current = null;
    };
  }, [isSeller, stream?.status, usingObs]);

  const remaining = useMemo(
    () => (stream?.ends_at ? new Date(stream.ends_at).getTime() - now : 0),
    [stream?.ends_at, now],
  );
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

  // 🆕 Voice trigger — hybrid multi-command (Web Speech API local keyword spotting).
  // Commands: "start" / "next" / "sold" / "extend" (+10s) / "end".
  // Falls back gracefully on unsupported browsers (e.g. iOS Safari) — host can use manual buttons.
  async function extendCurrentTimer(addSec = 10) {
    if (!isSeller || !stream || !auctionLive) return;
    const cur = stream.ends_at ? new Date(stream.ends_at).getTime() : Date.now();
    const next = new Date(Math.max(cur, Date.now()) + addSec * 1000).toISOString();
    setStream((prev: any) => (prev ? { ...prev, ends_at: next } : prev));
    await supabase.from("live_streams").update({ ends_at: next }).eq("id", id);
    await sendMsg(`⏱ Timer extended +${addSec}s`, true);
  }

  const voicePhrase = (stream?.voice_trigger_phrase || "next").toLowerCase().trim();
  const voice = useVoiceCommands({
    enabled: !!isSeller && !!stream?.voice_trigger_enabled,
    commands: [
      // "next" / custom phrase: end current round and start the next (or just start if idle)
      {
        phrase: `${voicePhrase}|next round|go go go`,
        cooldownMs: 2500,
        action: async () => {
          if (auctionLive) {
            endedRef.current = true;
            await finalizeAuctionRound();
            setTimeout(() => {
              startAuction().catch(() => {});
            }, 600);
          } else {
            startAuction().catch(() => {});
          }
        },
      },
      // "start" — start a round when idle
      {
        phrase: "start auction|start round|start now",
        cooldownMs: 2500,
        action: async () => {
          if (!auctionLive) startAuction().catch(() => {});
        },
      },
      // "sold" — finalize current round immediately
      {
        phrase: "sold|going once going twice",
        cooldownMs: 2500,
        action: async () => {
          if (!auctionLive) return;
          endedRef.current = true;
          await finalizeAuctionRound();
        },
      },
      // "extend" — add 10 seconds to running timer
      {
        phrase: "extend|add time|more time",
        cooldownMs: 1500,
        action: async () => {
          await extendCurrentTimer(10);
        },
      },
      // "end live" — end the entire stream
      {
        phrase: "end live|stop live|end stream",
        cooldownMs: 4000,
        action: async () => {
          setEndLiveOpen(true);
        },
      },
    ],
  });
  // Keep `voiceListening` flag in sync for the existing badge UI
  useEffect(() => {
    setVoiceListening(voice.listening);
  }, [voice.listening]);

  // ─── Cloudflare Calls multi-guest video ───────────────────────────
  const [callJoined, setCallJoined] = useState(false);
  const [isCohostParticipant, setIsCohostParticipant] = useState(false);
  useEffect(() => {
    if (!user || !stream || isSeller) {
      setIsCohostParticipant(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("stream_collab_participants")
        .select("id")
        .eq("stream_id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) setIsCohostParticipant(!!data);
    })();
    const ch = supabase
      .channel(`collab-self-${id}-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "stream_collab_participants",
          filter: `stream_id=eq.${id}`,
        },
        async () => {
          const { data } = await supabase
            .from("stream_collab_participants")
            .select("id")
            .eq("stream_id", id)
            .eq("user_id", user.id)
            .maybeSingle();
          if (!cancelled) setIsCohostParticipant(!!data);
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [user?.id, stream?.id, id, isSeller]);

  // Host auto-joins when streaming via in-browser camera (not OBS); co-hosts auto-join when accepted.
  const callShouldRun =
    !!stream &&
    stream.status !== "ended" &&
    ((isSeller && !usingObs) || isCohostParticipant) &&
    callJoined;

  const cfCall = useCloudflareCalls({
    enabled: callShouldRun,
    streamId: stream?.id ?? null,
    userId: user?.id ?? null,
    username: profile?.username ?? null,
    avatarUrl: profile?.avatar_url ?? null,
  });
  const [audioOn, setAudioOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  // Auto-join prompt for cohosts on acceptance
  useEffect(() => {
    if (isCohostParticipant && !callJoined) setCallJoined(true);
  }, [isCohostParticipant, callJoined]);
  // In compositor mode, host auto-joins on stream load so the canvas has the local cam immediately.
  useEffect(() => {
    if (isSeller && usingCompositor && !callJoined) setCallJoined(true);
  }, [isSeller, usingCompositor, callJoined]);

  const safety = useLivestreamSafety({
    stream,
    streamId: id,
    isSeller: !!isSeller,
    localStream: cfCall.localStream,
    videoRef,
    onAutoEnd: () => toast.message("Live auto-ended after extended inactivity"),
  });

  // Fire one-time host alert when the inactivity warning trips
  const inactivityNotifiedRef = useRef(false);
  useEffect(() => {
    if (!isSeller || !stream || !safety.inactiveWarning) return;
    if (inactivityNotifiedRef.current) return;
    inactivityNotifiedRef.current = true;
    (async () => {
      try {
        await supabase.from("chat_messages").insert({
          stream_id: id,
          username: "system",
          content: `⚠️ No activity detected. Tap "I'm still live" or the stream will auto-end in ${safety.tier.inactive_auto_end_minutes - safety.tier.inactive_warning_minutes} minutes.`,
          is_system: true,
        });
        await supabase.from("notifications").insert({
          user_id: stream.seller_id,
          type: "live_inactivity",
          body: "Your live stream is inactive — confirm you're still live to avoid auto-end.",
          link: `/live/${id}`,
        });
      } catch {}
    })();
  }, [isSeller, stream, safety.inactiveWarning, safety.tier, id]);
  useEffect(() => {
    if (!safety.inactiveWarning) inactivityNotifiedRef.current = false;
  }, [safety.inactiveWarning]);

  // Viewer-mode: regular viewers receive cohost video (recvonly) so they see the
  // multi-guest tiles overlaid on the HLS broadcast — no mic/cam permission required.
  const viewerCall = useCloudflareCalls({
    enabled: !!stream && stream.status !== "ended" && !isSeller && !isCohostParticipant,
    streamId: stream?.id ?? null,
    userId: user?.id ?? null,
    username: profile?.username ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    viewerMode: true,
  });

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
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(v, 0, 0);
      const blob: Blob | null = await new Promise((res) =>
        canvas.toBlob((b) => res(b), "image/jpeg", 0.85),
      );
      if (!blob) return null;
      const path = `${user!.id}/${id}-${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from("order-snapshots")
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (error) {
        console.error(error);
        return null;
      }
      const { data: pub } = supabase.storage.from("order-snapshots").getPublicUrl(path);
      const url = pub.publicUrl;
      await supabase.from("live_streams").update({ item_image_url: url }).eq("id", id);
      return url;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  async function sendMsg(
    content: string,
    isSystem = false,
    opts: { isAnnouncement?: boolean; isHype?: boolean; usernameOverride?: string } = {},
  ) {
    if (!profile && !isSystem) return toast.error("Sign in to chat");
    if (!isSystem && needsAcceptance)
      return toast.error("Accept the required agreements before chatting");
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
    if (!isSystem) safety.touch("chat");
  }

  // ---- Mod management ----
  async function addModBySearch(u: { id: string; username: string }) {
    if (!isSeller || !user || !profile) return;
    if (u.id === user.id) return toast.error("You're already the host");
    // Send a collab invite — invitee accepts to become co-host (mod).
    const { error } = await supabase.from("stream_collab_invites").insert({
      stream_id: id,
      host_id: user.id,
      host_username: profile.username,
      invitee_id: u.id,
      invitee_username: u.username,
    });
    if (error) {
      if (/duplicate|unique/i.test(error.message))
        return toast.error(`@${u.username} already has a pending invite`);
      return toast.error(error.message);
    }
    await supabase.from("notifications").insert({
      user_id: u.id,
      type: "collab_invite",
      body: `🤝 @${profile.username} invited you to co-host "${stream.title}"`,
      link: `/live/${id}`,
    });
    toast.success(`Invite sent to @${u.username}`);
    setModSearchQ("");
    setModSearchRes([]);
  }
  async function removeMod(modId: string) {
    if (!isSeller) return;
    await supabase.from("stream_moderators").delete().eq("id", modId);
  }
  async function sendModMsg() {
    if (!isStaff || !user || !profile) return;
    const t = modInput.trim();
    if (!t) return;
    const { error } = await supabase.from("stream_mod_messages").insert({
      stream_id: id,
      user_id: user.id,
      username: profile.username,
      content: t,
    });
    if (error) return toast.error(error.message);
    setModInput("");
  }
  async function postAnnouncement() {
    if (!isStaff || !user || !profile) return;
    const t = annText.trim();
    if (!t) return;
    await sendMsg(`📢 ${t}`, false, { isAnnouncement: true });
    setAnnText("");
    setAnnOpen(false);
    toast.success("Announcement posted");
  }

  // 🆕 Compute who is currently muted/banned in chat (latest action wins per user)
  const chatBlockSet = useMemo(() => {
    const latest: Record<string, any> = {};
    for (const a of [...chatActions].sort(
      (x, y) => +new Date(x.created_at) - +new Date(y.created_at),
    )) {
      latest[a.target_user_id] = a;
    }
    const blocked = new Set<string>();
    for (const [uid, a] of Object.entries(latest)) {
      if (a.action === "ban" || a.action === "mute") blocked.add(uid);
      if (a.action === "timeout" && a.expires_at && +new Date(a.expires_at) > Date.now())
        blocked.add(uid);
      if (a.action === "unmute" || a.action === "unban") blocked.delete(uid);
    }
    return blocked;
  }, [chatActions]);
  const meBlocked = !!user && chatBlockSet.has(user.id);
  // Combined: mod-mute OR host-ban-from-this-live (computed below after streamBannedIds is set)

  // 🆕 Personal blocks (this viewer mutes another user) + Stream bans (host bans user from this live)
  const [myBlockedIds, setMyBlockedIds] = useState<Set<string>>(new Set());
  const [streamBannedIds, setStreamBannedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!user) {
      setMyBlockedIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_blocks")
        .select("blocked_id")
        .eq("blocker_id", user.id);
      if (!cancelled) setMyBlockedIds(new Set((data || []).map((r: any) => r.blocked_id)));
    })();
    const ch = supabase
      .channel(`user-blocks-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_blocks", filter: `blocker_id=eq.${user.id}` },
        () => {
          supabase
            .from("user_blocks")
            .select("blocked_id")
            .eq("blocker_id", user.id)
            .then(({ data }) =>
              setMyBlockedIds(new Set((data || []).map((r: any) => r.blocked_id))),
            );
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [user]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("stream_user_bans")
        .select("banned_user_id")
        .eq("stream_id", id);
      if (!cancelled) setStreamBannedIds(new Set((data || []).map((r: any) => r.banned_user_id)));
    })();
    const ch = supabase
      .channel(`stream-bans-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stream_user_bans", filter: `stream_id=eq.${id}` },
        () => {
          supabase
            .from("stream_user_bans")
            .select("banned_user_id")
            .eq("stream_id", id)
            .then(({ data }) =>
              setStreamBannedIds(new Set((data || []).map((r: any) => r.banned_user_id))),
            );
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [id]);
  const meStreamBanned = !!user && streamBannedIds.has(user.id);
  const meBlockedOrBanned = meBlocked || meStreamBanned;

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (meBlockedOrBanned) return toast.error("You can't chat right now (muted by mod)");
    // 🆕 Slow-mode (host & mods bypass)
    const slow = Math.max(0, Number((stream as any)?.chat_slow_mode_sec || 0));
    if (slow > 0 && !isSeller && !isMod) {
      const since = Date.now() - lastChatTsRef.current;
      if (since < slow * 1000) {
        const wait = Math.ceil((slow * 1000 - since) / 1000);
        return toast.error(`Slow mode: wait ${wait}s before chatting again`);
      }
    }
    await sendMsg(input);
    lastChatTsRef.current = Date.now();
    setInput("");
  }

  // 🆕 Buyer readiness — must have completed shipping profile to bid/buy
  const [buyerReady, setBuyerReady] = useState(false);
  useEffect(() => {
    if (!user) {
      setBuyerReady(false);
      return;
    }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("full_name,address_line1,address_city,address_zip,buyer_verified")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const ok = !!(
          data.full_name &&
          data.address_line1 &&
          data.address_city &&
          data.address_zip
        );
        setBuyerReady(ok || !!data.buyer_verified);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  function requireBuyerReady(action = "continue"): boolean {
    if (!user || !profile) {
      toast.error(`Sign in to ${action}`);
      nav({ to: "/auth" });
      return false;
    }
    if (needsAcceptance) {
      toast.error("Accept the required agreements before interacting");
      return false;
    }
    if (!buyerReady) {
      toast.error("Complete your shipping profile first");
      nav({ to: "/profile" });
      return false;
    }
    return true;
  }

  // 🆕 Anti-snipe: bid in final 3s → +3s. After 3 extensions → SUDDEN DEATH:
  // the very next bid wins instantly. Different (and more savage) than Whatnot.
  async function placeBidAmount(amount: number) {
    if (!requireBuyerReady("bid")) return;
    if (!user || !profile) return;
    if (isSeller) return;
    if (unpaidOrders > 0) {
      toast.error("Pay your pending order before bidding again");
      nav({ to: "/orders" });
      return;
    }
    if (meBlockedOrBanned) return toast.error("You're banned/muted in this stream");
    if (stream.status !== "live") return toast.error("Auction ended");
    if (!auctionLive) return toast.error("Auction not running");
    const cur = Number(stream.current_bid || 0);
    if (amount <= cur) return toast.error(`Bid must be > $${cur}`);
    const prevBidder = stream.current_bidder_id;

    const update: any = { current_bid: amount, current_bidder_id: user.id };
    const remainingMs = stream.ends_at ? new Date(stream.ends_at).getTime() - Date.now() : 0;
    const exts = Number(stream.snipe_extends || 0);
    const sdEnabled = !!stream.sudden_death_enabled;
    const sdMax = Math.max(1, Number(stream.sudden_death_max_triggers || 3));
    const sdSec = Math.max(1, Number(stream.sudden_death_seconds_added || 5));
    const inSuddenDeath = !!stream.sudden_death_active;
    let extended = false;
    let suddenDeathWin = false;

    if (inSuddenDeath) {
      // 💀 Sudden death — bid wins instantly, end timer in 1.2s for drama.
      update.ends_at = new Date(Date.now() + 1200).toISOString();
      update.sudden_death_active = false;
      suddenDeathWin = true;
    } else if (sdEnabled && remainingMs > 0 && remainingMs <= 3000) {
      // Add +sdSec and bump extension counter
      update.ends_at = new Date(
        Math.max(new Date(stream.ends_at).getTime(), Date.now()) + sdSec * 1000,
      ).toISOString();
      update.snipe_extends = exts + 1;
      extended = true;
      // After max extensions, arm sudden death for the NEXT bid
      if (exts + 1 >= sdMax) update.sudden_death_active = true;
    }

    const { error } = await supabase.from("live_streams").update(update).eq("id", id);
    if (error) return toast.error(error.message);
    safety.touch("auction_bid");

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
      endedRef.current = false;
      snapshotRef.current = false;
      await sendMsg(`💥 SUDDEN-DEATH WIN — @${profile.username} took it for $${amount}!`, true);
    }
    await sendMsg(`💎 ${profile.username} bid $${amount}`, true);
    if (stream.seller_id !== user.id) {
      await supabase.from("notifications").insert({
        user_id: stream.seller_id,
        type: "bid",
        body: `@${profile.username} bid $${amount} on "${stream.current_item || stream.title}"`,
        link: `/live/${id}`,
      });
    }
    if (prevBidder && prevBidder !== user.id) {
      await supabase.from("notifications").insert({
        user_id: prevBidder,
        type: "outbid",
        body: `You were outbid on "${stream.current_item || stream.title}" — now $${amount}`,
        link: `/live/${id}`,
      });
    }
    // Notify the new top bidder they're winning
    await supabase.from("notifications").insert({
      user_id: user.id,
      type: "winning",
      body: `🥇 You're winning "${stream.current_item || stream.title}" at $${amount}`,
      link: `/live/${id}`,
    });
  }

  // 🆕 Buy-now snipe: instantly win at the host's snipe price
  async function buyNowSnipe() {
    if (!stream?.snipe_price) return;
    if (!requireBuyerReady("buy")) return;
    if (!user || !profile) return;
    if (isSeller) return;
    if (unpaidOrders > 0) {
      toast.error("Pay your pending order before buying");
      nav({ to: "/orders" });
      return;
    }
    if (!auctionLive) return toast.error("No active auction");
    const price = Number(stream.snipe_price);
    // Force win: set bid to snipe price + bidder = me, then end immediately
    const { error } = await supabase
      .from("live_streams")
      .update({
        current_bid: price,
        current_bidder_id: user.id,
        ends_at: new Date(Date.now() + 1500).toISOString(),
        snipe_price: null,
      })
      .eq("id", id);
    if (error) return toast.error(error.message);
    safety.touch("buy_now_snipe");
    endedRef.current = false;
    snapshotRef.current = false;
    await sendMsg(`💥 SNIPE! @${profile.username} hit Buy-Now for $${price} — instant win!`, true);
  }

  // 🆕 Mod chat action — mute/timeout/ban/unblock
  async function chatAction(
    target: { userId: string; username: string },
    action: "mute" | "timeout" | "ban" | "unmute" | "unban",
    minutes = 5,
  ) {
    if (!isStaff || !user) return;
    const expires_at =
      action === "timeout" ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
    const { error } = await supabase.from("stream_chat_actions").insert({
      stream_id: id,
      target_user_id: target.userId,
      target_username: target.username,
      action,
      by_user_id: user.id,
      expires_at,
    });
    if (error) return toast.error(error.message);
    const labels: Record<string, string> = {
      mute: "muted 🔇",
      timeout: `timed out for ${minutes}m ⏱️`,
      ban: "banned 🚫",
      unmute: "unmuted ✅",
      unban: "unbanned ✅",
    };
    toast.success(`@${target.username} ${labels[action]}`);
    setChatActionMenu(null);
  }

  // 🆕 Mystery break: numbered slots (1..N). Buyers claim a number, host runs a randomized "spin" reveal at the end.
  async function startBreakMode() {
    if (!isSeller) return;
    const count = Math.max(2, Math.min(50, Number(breakSlotCount) || 0));
    if (count < 2) return toast.error("Pick 2–50 slots");
    const price = Math.max(1, Number(breakPrice) || 0);
    const chars = Array.from(
      { length: count },
      (_, i) =>
        (breakCharacters[i] && breakCharacters[i].trim()) ||
        `${breakPrefix.trim() || "Slot "}${i + 1}`,
    );
    await supabase
      .from("live_streams")
      .update({
        break_mode: "open",
        break_force_visible: false,
        break_slot_count: count,
        break_slot_price: price,
        break_slot_prefix: breakPrefix.trim() || null,
        break_characters: chars,
        break_teams: chars,
      })
      .eq("id", id);
    await sendMsg(
      `🎲 BREAK OPEN — ${count} slots, $${price} each. Tap a slot below to claim!`,
      true,
    );
    toast.success("Break opened");
  }

  function toggleBreakSlotSelection(slotNumber: number) {
    if (breakSlots.some((s) => s.slot_number === slotNumber)) return;
    setSelectedBreakSlots((slots) => {
      const next = slots.includes(slotNumber)
        ? slots.filter((n) => n !== slotNumber)
        : [...slots, slotNumber].sort((a, b) => a - b);
      setSelectionDeadline(next.length > 0 ? Date.now() + 5000 : null);
      return next;
    });
  }

  async function claimSelectedBreakSlots() {
    if (!requireBuyerReady("claim a character")) return;
    if (!user || !profile) return;
    if (isSeller) return toast.error("Host can't claim slots");
    if (unpaidOrders > 0) {
      toast.error("Pay your pending order before claiming");
      nav({ to: "/orders" });
      return;
    }
    const slots = selectedBreakSlots.filter((n) => !breakSlots.some((s) => s.slot_number === n));
    if (slots.length === 0) return toast.error("Choose at least one character");
    setClaimingBreakSlots(true);
    const { data, error } = await (supabase.rpc as any)("claim_break_slots", {
      _stream_id: id,
      _slot_numbers: slots,
    });
    setClaimingBreakSlots(false);
    if (error) {
      if ((error as any).code === "23505")
        return toast.error("One of those characters was just claimed");
      return toast.error(error.message);
    }
    const result = Array.isArray(data) ? data[0] : data;
    const count = Number(result?.claimed_count || slots.length);
    const total = Number(
      result?.total_amount || Number((stream as any).break_slot_price || breakPrice) * count,
    );
    await sendMsg(
      `🎟️ @${profile.username} claimed ${count} Mystery Break character${count === 1 ? "" : "s"} ($${total.toFixed(2)})`,
      true,
    );
    await logPaymentEvent({
      streamId: id,
      buyerId: user.id,
      buyerUsername: profile.username,
      orderId: result?.order_id || null,
      eventType: "payment_paid",
      amount: total,
      itemLabel: `Mystery Break · ${count} character${count === 1 ? "" : "s"}`,
    });
    toast.success(`${count} character${count === 1 ? "" : "s"} claimed and paid`);
    setSelectedBreakSlots([]);
    setSelectionDeadline(null);
    setShowViewerBreak(false);
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
    // 🆕 If anyone has claimed: pick from claimed buyers.
    // If nobody has claimed yet: pick from the configured characters (so host can preview/spin a fun wheel during the live).
    const claimed = breakSlots.filter((s) => s.slot_number != null);
    let winnerSlotNumber: number;
    let winnerUsername: string;
    let winnerLabel: string;
    if (claimed.length > 0) {
      const w = claimed[Math.floor(Math.random() * claimed.length)];
      winnerSlotNumber = w.slot_number!;
      winnerUsername = w.buyer_username;
      winnerLabel = w.character_label || `${stream.break_slot_prefix || "#"}${w.slot_number}`;
    } else {
      const chars: string[] = Array.isArray(stream.break_characters) ? stream.break_characters : [];
      const total = chars.length || Number(stream.break_slot_count) || 0;
      if (total < 2) return toast.error("Set up at least 2 characters first");
      const idx = Math.floor(Math.random() * total);
      winnerSlotNumber = idx + 1;
      winnerUsername = "—";
      winnerLabel = chars[idx] || `${stream.break_slot_prefix || "#"}${idx + 1}`;
    }
    const startedAt = new Date();
    const endsAt = new Date(Date.now() + 6500);
    await supabase
      .from("live_streams")
      .update({
        break_wheel_spinning: true,
        break_wheel_started_at: startedAt.toISOString(),
        break_wheel_ends_at: endsAt.toISOString(),
        break_wheel_target_slot: winnerSlotNumber,
        break_wheel_last_winner_username: null,
        break_wheel_last_winner_label: null,
      })
      .eq("id", id);
    await sendMsg(`🎡 BREAK REVEAL spinning…`, true);
    setTimeout(async () => {
      await supabase
        .from("live_streams")
        .update({
          break_wheel_spinning: false,
          break_wheel_last_winner_username: winnerUsername,
          break_wheel_last_winner_label: winnerLabel,
        })
        .eq("id", id);
      await sendMsg(
        claimed.length > 0
          ? `🏆 BREAK WIN — ${winnerLabel} goes to @${winnerUsername}!`
          : `🎡 Test spin landed on ${winnerLabel} (no claims yet)`,
        true,
      );
    }, 6600);
  }

  async function setSnipePriceNow() {
    if (!isSeller) return;
    const v = Number(snipePriceInput);
    if (!v || v <= Number(stream.current_bid || 0))
      return toast.error("Snipe price must be above current bid");
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
    const { data, error } = await supabase
      .from("spin_wheels")
      .insert({
        stream_id: id,
        seller_id: user!.id,
        spin_speed: "10",
      })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return null;
    }
    setWheel(data);
    return data;
  }

  async function addWheelSlot() {
    const w = await ensureWheel();
    if (!w) return;
    const label = draftSlotLabel.trim();
    if (!label) return toast.error("Add a label");
    const weight = Math.max(1, Math.min(100, Number(draftSlotWeight) || 1));
    const palette = [
      "#7c3aed",
      "#ec4899",
      "#f59e0b",
      "#10b981",
      "#3b82f6",
      "#ef4444",
      "#06b6d4",
      "#a855f7",
      "#14b8a6",
      "#f97316",
    ];
    const color = palette[wheelSlots.length % palette.length];
    const { error } = await supabase.from("wheel_slots").insert({
      wheel_id: w.id,
      label,
      weight,
      color,
      position: wheelSlots.length,
    });
    if (error) return toast.error(error.message);
    setDraftSlotLabel("");
    setDraftSlotWeight("1");
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
    await supabase
      .from("spin_wheels")
      .update({ viewer_can_spin: !wheel.viewer_can_spin })
      .eq("id", wheel.id);
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
    await Promise.all(
      arr.map((s, idx) => supabase.from("wheel_slots").update({ position: idx }).eq("id", s.id)),
    );
    toast.success("Slots shuffled");
  }

  // 🆕 Reset the wheel — unlocks editing
  async function resetWheel() {
    if (!wheel || !isSeller) return;
    if (wheel.is_spinning) return toast.error("Wheel is still spinning");
    await supabase
      .from("spin_wheels")
      .update({
        is_locked: false,
        pending_decision_slot_id: null,
        pending_decision_slot_label: null,
        last_winner_username: null,
        last_winner_slot_label: null,
        last_winner_at: null,
      })
      .eq("id", wheel.id);
    toast.success("Wheel reset — you can edit slots again");
  }

  // Trigger a spin: host always allowed; viewers only if viewer_can_spin and idle.
  async function triggerSpin() {
    if (!user) return toast.error("Sign in to spin");
    if (!wheel) return toast.error("No wheel yet");
    if (wheel.is_spinning) return;
    if (wheel.pending_decision_slot_id)
      return toast.error("Host must decide on the last winner first");
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
    const { error } = await supabase
      .from("spin_wheels")
      .update({
        is_spinning: true,
        is_locked: true, // 🔒 lock the wheel from manual edits as soon as a spin starts
        spin_started_at: startedAt.toISOString(),
        spin_ends_at: endsAt.toISOString(),
        spin_target_slot_id: pick.id,
        spin_seed: Math.floor(Math.random() * 1_000_000),
      })
      .eq("id", wheel.id);
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
    const winnerUsername =
      stream?.winner_username ||
      (winnerId === user!.id ? profile?.username || "host" : "top bidder");

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
    await supabase
      .from("spin_wheels")
      .update({
        is_spinning: false,
        is_locked: true,
        pending_decision_slot_id: slot.id,
        pending_decision_slot_label: slot.label,
        last_winner_username: winnerUsername,
        last_winner_slot_label: slot.label,
        last_winner_at: new Date().toISOString(),
      })
      .eq("id", wheel.id);
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
    await supabase
      .from("spin_wheels")
      .update({
        pending_decision_slot_id: null,
        pending_decision_slot_label: null,
      })
      .eq("id", wheel.id);
    toast.success(action === "remove" ? "Slot removed" : "Slot kept on wheel");
  }

  async function startAuction() {
    if (!isSeller) return;
    const sec = Number(editTimerSec) || 60;
    const start = Number(editStartPrice) || 1;
    const qty = Math.max(1, Math.min(99, Number(editQuantity) || 1));
    const ends_at = new Date(Date.now() + sec * 1000).toISOString();
    const patch = {
      status: "live" as const,
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
      auction_reveal_mode: editRevealMode,
    } as any;
    // 🆕 Optimistic local update so the host's timer starts ticking instantly,
    // without waiting for the realtime UPDATE round-trip.
    setStream((prev: any) => (prev ? { ...prev, ...patch } : prev));
    endedRef.current = false;
    snapshotRef.current = false;
    await supabase.from("live_streams").update(patch).eq("id", id);
    safety.touch("auction_started");
    await sendMsg(
      `▶️ Auction started — ${sec}s, starting $${start}${qty > 1 ? ` · qty ${qty}` : ""}`,
      true,
    );
    toast.success(`Auction live — ${sec}s${qty > 1 ? ` · ${qty} rounds queued` : ""}`);
    setShowSettings(false);
  }

  // 🆕 Save voice trigger + quantity without starting an auction
  async function saveAuctionDefaults() {
    if (!isSeller) return;
    const qty = Math.max(1, Math.min(99, Number(editQuantity) || 1));
    await supabase
      .from("live_streams")
      .update({
        default_timer_sec: Number(editTimerSec) || 30,
        default_starting_bid: Number(editStartPrice) || 1,
        shipping_price: Number(editShipPrice) || 0,
        shipping_method: editShipMethod,
        quick_start_quantity: qty,
        voice_trigger_enabled: editVoiceEnabled,
        voice_trigger_phrase: editVoicePhrase.trim().toLowerCase() || "next",
        chat_slow_mode_sec: Math.max(0, Math.min(300, Number(editSlowMode) || 0)),
        auction_reveal_mode: editRevealMode,
      } as any)
      .eq("id", id);
    toast.success("Settings saved");
  }

  // 🆕 One-tap quick auction start — uses inline mini-bar values, no Settings panel
  async function quickStartAuction(opts?: {
    item?: string;
    start?: string;
    timer?: string;
    buyNow?: string;
  }) {
    if (!isSeller || !stream) return;
    const item = (opts?.item ?? quickItem).trim();
    if (!item) return toast.error("Add the item name");
    const sec = Math.max(5, Math.min(600, Number(opts?.timer ?? editTimerSec) || 30));
    const start = Math.max(1, Number(opts?.start ?? editStartPrice) || 1);
    const buyNowRaw = Number(opts?.buyNow ?? quickBuyNow);
    const buyNow = buyNowRaw > start ? buyNowRaw : null;
    const ends_at = new Date(Date.now() + sec * 1000).toISOString();
    const patch: any = {
      status: "live",
      listing_type: "auction",
      starting_bid: start,
      default_starting_bid: start,
      default_timer_sec: sec,
      current_bid: start,
      current_bidder_id: null,
      current_item: item,
      ends_at,
      winner_id: null,
      winning_bid: null,
      winner_username: null,
      snipe_extends: 0,
      snipe_price: buyNow,
      sudden_death_active: false,
    };
    setStream((prev: any) => (prev ? { ...prev, ...patch } : prev));
    endedRef.current = false;
    snapshotRef.current = false;
    await supabase.from("live_streams").update(patch).eq("id", id);
    safety.touch("auction_started");
    await sendMsg(
      `▶️ ${item} — ${sec}s · start $${start}${buyNow ? ` · Buy Now $${buyNow}` : ""}`,
      true,
    );
    setLastQuick({
      item,
      start: String(start),
      timer: String(sec),
      buyNow: buyNow ? String(buyNow) : "",
    });
    setQuickItem("");
    setQuickBuyNow("");
    toast.success("Round started");
  }

  async function repeatLastQuick() {
    if (!lastQuick) return;
    await quickStartAuction(lastQuick);
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
      sender_id: user.id,
      sender_username: profile.username,
      recipient_id: recipientId,
      content,
    });
    await supabase.from("notifications").insert({
      user_id: recipientId,
      type: "share",
      body: `@${profile.username} shared a live with you`,
      link,
    });
    toast.success(`Shared with @${recipientUsername}`);
    setShareOpen(false);
    setShareQuery("");
  }

  async function searchUsers(q: string, setter: (rows: any[]) => void) {
    if (!q.trim()) return setter([]);
    const { data } = await (supabase.rpc as any)("search_public_profiles", {
      _query: q,
      _limit: 8,
    });
    setter(data || []);
  }

  // Compute how much current viewer already spent on shout-outs in this stream
  useEffect(() => {
    if (!user) {
      setMySpent(0);
      return;
    }
    const total = shoutouts
      .filter((s) => s.buyer_id === user.id)
      .reduce((a, b) => a + Number(b.amount || 0), 0);
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
    if (amt > remaining)
      return toast.error(`You have $${remaining} shout-out budget left for this stream`);
    const { error } = await supabase.from("stream_shoutouts").insert({
      stream_id: id,
      seller_id: stream.seller_id,
      buyer_id: user.id,
      buyer_username: profile.username,
      message: msg,
      amount: amt,
    });
    if (error) return toast.error(error.message);
    await sendMsg(`📣 @${profile.username} sent a $${amt} shout-out: "${msg}"`, true);
    await supabase.from("notifications").insert({
      user_id: stream.seller_id,
      type: "shoutout",
      body: `📣 @${profile.username} ($${amt}): "${msg}"`,
      link: `/live/${id}`,
    });
    toast.success("Shout-out sent! (safe mode — no real charge)");
    setShoutoutOpen(false);
    setShoutoutMsg("");
    setShoutoutAmt(5);
  }

  async function finalizeAuctionRound() {
    if (!stream) return;
    safety.touch("auction_finalized");
    const winnerId = stream.current_bidder_id;
    const winningBid = Number(stream.current_bid || 0);
    // Ensure we have a snapshot if not already captured
    let snapshot = stream.item_image_url;
    if (!snapshot && isSeller) snapshot = await captureSnapshot();
    if (winnerId) {
      const { data: pubRows } = await (supabase.rpc as any)("public_profiles_by_ids", {
        _ids: [winnerId],
      });
      const pubP = (pubRows && pubRows[0]) || null;
      const winnerUsername = pubP?.username || "buyer";
      // Fetch shipping address via RPC (only seller of this stream is allowed to read it)
      const { data: shipRows } = await supabase.rpc("get_winner_shipping", {
        p_stream_id: id,
        p_winner_id: winnerId,
      });
      const p: any = (shipRows && shipRows[0]) || {};
      // Bid number for THIS sale on the stream — only increments when an item sells
      const nextRound = Number(stream.round_number || 0) + 1;
      const itemName = stream.current_item || stream.title;
      const labeledTitle = `Bid #${nextRound} — ${itemName}`;
      // Pull seller's combined-shipping cap (per buyer, per checkout)
      const { data: capRaw } = await (supabase.rpc as any)("get_seller_shipping_cap", {
        _user: stream.seller_id,
      });
      const cap = capRaw == null ? null : Number(capRaw);
      const rawShip = Number(stream.shipping_price || 0);
      // Sum shipping already on this buyer's open orders from this seller — apply cap
      const { data: openOrders } = await supabase
        .from("orders")
        .select("amount, listing_id, stream_id")
        .eq("buyer_id", winnerId)
        .eq("seller_id", stream.seller_id)
        .eq("payment_status", "awaiting_payment");
      const priorShip = (openOrders || []).reduce((a: number, _o: any) => a, 0);
      const shipForThis = cap != null ? Math.max(0, Math.min(rawShip, cap - priorShip)) : rawShip;
      await supabase.from("receipts").insert({
        stream_id: id,
        buyer_id: winnerId,
        seller_id: stream.seller_id,
        item_name: labeledTitle,
        item_image_url: snapshot || null,
        amount: winningBid,
      });
      // Create order so it appears in buyer's "My Orders" and seller's "My Store"
      // SAFE MODE: order starts as awaiting_payment — buyer must click "Pay Now" later
      await supabase.from("orders").insert({
        buyer_id: winnerId,
        seller_id: stream.seller_id,
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
      await logPaymentEvent({
        streamId: id,
        buyerId: winnerId,
        buyerUsername: winnerUsername,
        eventType: "payment_pending",
        amount: winningBid + shipForThis,
        itemLabel: labeledTitle,
        message: "Awaiting payment from buyer",
      });
      await supabase.from("notifications").insert({
        user_id: winnerId,
        type: "won",
        body: `🎉 You won Bid #${nextRound} "${itemName}" for $${winningBid}. Tap to pay now.`,
        link: `/orders`,
      });
      // Auto-DM the winner with a clear payment CTA so they don't miss it
      await supabase.from("direct_messages").insert({
        sender_id: stream.seller_id,
        sender_username: profile?.username || "seller",
        recipient_id: winnerId,
        content: `🏆 You won "${itemName}" for $${winningBid} on my live stream! Total with shipping: $${(winningBid + shipForThis).toFixed(2)}. Pay here: ${typeof window !== "undefined" ? window.location.origin : ""}/orders`,
      });
      await sendMsg(
        `🏆 Bid #${nextRound} — "${itemName}" sold to @${winnerUsername} for $${winningBid}`,
        true,
      );
      await supabase
        .from("live_streams")
        .update({
          winner_id: winnerId,
          winning_bid: winningBid,
          winner_username: winnerUsername,
          round_number: nextRound,
        })
        .eq("id", id);
      // 🆕 Auto-trigger pre-selected reveal (Spin Wheel or Mystery Break) for the winner
      const revealMode = (stream as any).auction_reveal_mode as string | undefined;
      if (isSeller && revealMode === "wheel") {
        // Fire & forget — pops up overlay for everyone
        triggerSpin().catch(() => {});
      } else if (isSeller && revealMode === "break") {
        spinBreakWheel().catch(() => {});
      }
      // Clear winner banner + ends_at after 5s, then auto-rearm next round if quantity remaining
      setTimeout(async () => {
        const remaining = Math.max(0, Number((stream as any).quick_start_remaining || 0));
        const sec = Number(stream.default_timer_sec || 30);
        const start = Number(stream.default_starting_bid || stream.starting_bid || 1);
        const update: any = {
          ends_at: null,
          winner_id: null,
          winning_bid: null,
          winner_username: null,
          current_bidder_id: null,
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
        if (remaining > 0)
          sendMsg(`▶️ Next round — ${sec}s, starting $${start} (qty ${remaining} left)`, true);
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

  const [endLiveOpen, setEndLiveOpen] = useState(false);
  const [pauseMessageDraft, setPauseMessageDraft] = useState("");
  async function endLive() {
    if (!isSeller) return;
    setPauseMessageDraft("");
    setEndLiveOpen(true);
  }
  // Track minutes streamed; called from pause / end paths.
  async function recordStreamMinutes() {
    try {
      const startedAt = stream?.started_at ? new Date(stream.started_at).getTime() : 0;
      if (!startedAt || !user) return;
      const mins = Math.max(0, Math.floor((Date.now() - startedAt) / 60_000));
      if (mins > 0)
        await (supabase.rpc as any)("add_stream_minutes", { _user_id: user.id, _minutes: mins });
    } catch {}
  }
  async function pauseLiveFor3h() {
    if (!isSeller) return;
    if (auctionLive) await finalizeAuctionRound();
    const until = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    const msg = pauseMessageDraft.trim().slice(0, 140) || null;
    await supabase
      .from("live_streams")
      .update({
        status: "paused",
        is_active: false,
        pause_until: until,
        pause_message: msg,
        pause_started_at: new Date().toISOString(),
      } as any)
      .eq("id", id);
    await recordStreamMinutes();
    await sendMsg(msg ? `⏸️ Host paused: ${msg}` : `⏸️ Host paused — back within 3 hours`, true);
    toast.success("Live paused — resume within 3 hours");
    camStream.current?.getTracks().forEach((t) => t.stop());
    setEndLiveOpen(false);
  }
  async function resumeLive() {
    if (!isSeller) return;
    await supabase
      .from("live_streams")
      .update({
        status: "live",
        is_active: true,
        pause_until: null,
        ended_at: null,
        pause_message: null,
        pause_started_at: null,
      } as any)
      .eq("id", id);
    await sendMsg(`▶️ Host is back — live resumed`, true);
    toast.success("Live resumed");
  }

  async function switchObsToBrowserCamera() {
    if (!isSeller || !stream) return;
    setSwitchingToBrowserCam(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-stream-input", {
        body: { meta_name: `Browser camera — ${stream.title || id}` },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      const d = data as any;
      const patch = { cf_playback_hls: d.hls_url, cf_whip_url: d.whip_url };
      const { error: updateErr } = await supabase.from("live_streams").update(patch).eq("id", id);
      if (updateErr) throw updateErr;
      await supabase
        .from("live_stream_credentials" as any)
        .update({
          cf_live_input_id: d.live_input_id ?? null,
          cf_rtmps_url: d.rtmps_url ?? null,
          cf_stream_key: d.stream_key ?? null,
        })
        .eq("stream_id", id);
      setStream((prev: any) => (prev ? { ...prev, ...patch } : prev));
      setCallJoined(true);
      toast.success("Browser camera is now connected");
    } catch (e: any) {
      toast.error(e?.message || "Could not switch to browser camera");
    } finally {
      setSwitchingToBrowserCam(false);
    }
  }

  async function confirmEndLive() {
    if (!isSeller) return;
    if (auctionLive) await finalizeAuctionRound();
    await supabase
      .from("live_streams")
      .update({
        status: "ended",
        is_active: false,
        ended_at: new Date().toISOString(),
        pause_until: null,
      })
      .eq("id", id);
    await recordStreamMinutes();
    await sendMsg(`🛑 Live ended`, true);
    toast.success("Live ended");
    camStream.current?.getTracks().forEach((t) => t.stop());
    setEndLiveOpen(false);
    nav({ to: "/store" });
  }

  // ===== K.O. (KickOut) =====
  async function confirmKO(dests: KODestination[], message: string) {
    if (!isSeller || !stream) return;
    // Re-validate destinations are still live
    const ids = dests.map((d) => d.stream_id);
    const { data: liveCheck } = await supabase
      .from("live_streams")
      .select("id, status")
      .in("id", ids);
    const liveSet = new Set(
      (liveCheck || []).filter((s: any) => s.status === "live").map((s: any) => s.id),
    );
    const validDests = dests.filter((d) => liveSet.has(d.stream_id));
    if (validDests.length === 0) {
      toast.error("No live destinations available");
      return;
    }

    if (auctionLive) await finalizeAuctionRound();
    await supabase
      .from("live_streams")
      .update({
        ko_active: true,
        ko_message: message || null,
        ko_destinations: validDests as any,
        ko_started_at: new Date().toISOString(),
      })
      .eq("id", id);
    await sendMsg(
      `⚡ K.O.! Sending viewers to ${validDests.map((d) => "@" + d.username).join(", ")}`,
      true,
    );
    setKoOpen(false);
    toast.success("Kicking viewers out…");

    // Wait for viewer transition (3s alert + up to 5s pick) then end stream
    setTimeout(async () => {
      await supabase
        .from("live_streams")
        .update({
          status: "ended",
          is_active: false,
          ended_at: new Date().toISOString(),
          pause_until: null,
          ko_active: false,
        })
        .eq("id", id);
      camStream.current?.getTracks().forEach((t) => t.stop());
      nav({ to: "/store" });
    }, 9000);
  }

  // Enrich KO destinations with title + viewer counts when overlay active
  useEffect(() => {
    if (
      !stream?.ko_active ||
      !Array.isArray(stream?.ko_destinations) ||
      stream.ko_destinations.length === 0
    ) {
      setKoEnrichedDests([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const dests = stream.ko_destinations as KODestination[];
      const ids = dests.map((d) => d.stream_id);
      const [{ data: streams }, { data: pres }] = await Promise.all([
        supabase.from("live_streams").select("id, title, category, status").in("id", ids),
        supabase
          .from("live_stream_presence")
          .select("stream_id")
          .in("stream_id", ids)
          .gte("last_seen_at", new Date(Date.now() - 90_000).toISOString()),
      ]);
      if (cancelled) return;
      const byId = new Map((streams || []).map((s: any) => [s.id, s]));
      const counts: Record<string, number> = {};
      (pres || []).forEach((r: any) => {
        counts[r.stream_id] = (counts[r.stream_id] || 0) + 1;
      });
      const enriched = dests
        .map((d) => {
          const meta: any = byId.get(d.stream_id);
          if (!meta || meta.status !== "live") return null;
          return {
            ...d,
            title: meta.title,
            category: meta.category,
            viewers: counts[d.stream_id] || 0,
          };
        })
        .filter(Boolean);
      setKoEnrichedDests(enriched as any[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [stream?.ko_active, JSON.stringify(stream?.ko_destinations || [])]);

  // Viewer-side: send a KO request to this host (only if I'm a live host elsewhere)
  const [myLiveStream, setMyLiveStream] = useState<any>(null);
  useEffect(() => {
    if (!user || isSeller) {
      setMyLiveStream(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("live_streams")
      .select("id, title")
      .eq("seller_id", user.id)
      .eq("status", "live")
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setMyLiveStream(data);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, isSeller, id]);

  async function sendKORequest() {
    if (!user || !profile || !myLiveStream || !stream) return;
    // count my viewers
    const { data: pres } = await supabase
      .from("live_stream_presence")
      .select("user_id")
      .eq("stream_id", myLiveStream.id)
      .gte("last_seen_at", new Date(Date.now() - 90_000).toISOString());
    const viewers = (pres || []).length;
    const { error } = await supabase.from("ko_requests").insert({
      from_stream_id: myLiveStream.id,
      from_seller_id: user.id,
      from_username: profile.username,
      from_avatar_url: profile.avatar_url,
      from_viewer_count: viewers,
      to_stream_id: stream.id,
      to_seller_id: stream.seller_id,
    });
    if (error) toast.error(error.message);
    else toast.success("KO request sent");
  }

  async function onScanResult(r: {
    name: string;
    category: string;
    trend: string;
    image: string;
    language?: string;
  }) {
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
    } catch {
      /* fall back to scan */
    }

    // Show 5-second card overlay (price-free)
    setHypeCard({
      name: hypeName,
      category: hypeCategory,
      set_guess: hypeSet,
      rarity_vibe: hypeVibe,
      image: r.image,
    });

    const update: any = {
      current_item: hypeName,
      current_bid: start,
      current_bidder_id: null,
      item_image_url: r.image,
      current_condition: cond,
    };
    if (useQuick) {
      const qty = Math.max(
        1,
        Math.min(99, Number(stream.quick_start_quantity || editQuantity || 1)),
      );
      update.status = "live";
      update.listing_type = "auction";
      update.starting_bid = start;
      update.ends_at = new Date(Date.now() + sec * 1000).toISOString();
      update.winner_id = null;
      update.winning_bid = null;
      update.winner_username = null;
      update.snipe_extends = 0;
      update.snipe_price = null;
      update.sudden_death_active = false;
      update.quick_start_quantity = qty;
      update.quick_start_remaining = qty - 1;
      endedRef.current = false;
      snapshotRef.current = false;
    }
    // 🆕 Optimistic local update so the timer ticks instantly on the host's screen.
    setStream((prev: any) => (prev ? { ...prev, ...update } : prev));
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
    touchStartX.current = null;
    touchStartY.current = null;
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
      if (steps !== lastStep) {
        lastStep = steps;
        setHoldAdd(steps * 3);
      }
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

  if (!stream)
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading...
      </div>
    );

  const ended = stream.status === "ended";
  const paused = stream.status === "paused";
  const pauseExpiresAt = paused && stream.pause_until ? new Date(stream.pause_until).getTime() : 0;
  const pauseExpired = paused && pauseExpiresAt > 0 && pauseExpiresAt < now;
  const pauseMsLeft = Math.max(0, pauseExpiresAt - now);
  const bidDisabled = isSeller || ended || paused || !auctionLive;

  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-black text-white"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Full-screen video */}
      <div
        className="absolute inset-0"
        style={
          stream.mode === "show_off" ? { filter: flexFilterCss(stream.video_filter) } : undefined
        }
      >
        {usingObs ? (
          <HlsPlayer
            src={stream.cf_playback_hls}
            className="h-full w-full"
            style={obsVideoStyle}
            onVideoMetrics={setObsMetrics}
            autoPlay
            muted={isSeller}
          />
        ) : isSeller ? (
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/30 via-black to-live/30">
            <Radio className="h-24 w-24 opacity-40" />
          </div>
        )}
      </div>

      {/* Cloudflare Calls multi-guest stage */}
      {callShouldRun && (
        <CoHostStage
          localStream={cfCall.localStream}
          localUsername={profile?.username || "you"}
          remotes={cfCall.remotes}
          audioOn={audioOn}
          videoOn={videoOn}
          onToggleAudio={() => {
            cfCall.toggleAudio();
            setAudioOn((v) => !v);
          }}
          onToggleVideo={() => {
            cfCall.toggleVideo();
            setVideoOn((v) => !v);
          }}
          onLeave={() => setCallJoined(false)}
        />
      )}

      {/* Viewer-side overlay: shows cohost tiles to regular viewers (read-only). */}
      {!isSeller && !isCohostParticipant && viewerCall.remotes.length > 0 && (
        <CoHostStage
          localStream={null}
          localUsername=""
          remotes={viewerCall.remotes}
          audioOn={true}
          videoOn={true}
          onToggleAudio={() => {}}
          onToggleVideo={() => {}}
          onLeave={() => {}}
          readOnly
        />
      )}
      <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between p-3">
        <Link to="/live" className="rounded-full bg-black/50 p-2 backdrop-blur">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex items-center gap-1.5">
          <div
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${ended ? "bg-muted text-muted-foreground" : "bg-live"}`}
          >
            {!ended && <span className="h-1.5 w-1.5 live-pulse rounded-full bg-live-foreground" />}{" "}
            {ended ? "ENDED" : "LIVE"}
          </div>
          {!ended && (
            <button
              onClick={() => setShowViewerList(true)}
              data-tour="viewer-count"
              className="flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[10px] font-bold text-white backdrop-blur transition active:scale-95"
              title="See who's watching"
            >
              <Users className="h-3 w-3" />{" "}
              {Math.max(viewerCount, liveViewers.length).toLocaleString()}
            </button>
          )}
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setShareOpen(true)}
            className="rounded-full bg-black/50 p-2 backdrop-blur"
          >
            <Share2 className="h-4 w-4" />
          </button>
          {isStaff && !ended && (
            <button
              onClick={() => setAnnOpen(true)}
              className="rounded-full bg-accent/80 p-2 backdrop-blur"
              title="Post announcement"
            >
              <Megaphone className="h-4 w-4" />
            </button>
          )}
          {isStaff && !ended && stream.mode !== "show_off" && (
            <button
              onClick={() => setShowModPanel((v) => !v)}
              className="relative rounded-full bg-primary/80 p-2 backdrop-blur"
              title="Mod panel"
            >
              <Shield className="h-4 w-4" />
              {modChat.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-live" />
              )}
            </button>
          )}
          {!ended && (isSeller || (!isSeller && stream.allow_collab_requests)) && (
            <button
              onClick={() => setShowCollabPanel(true)}
              className="rounded-full bg-fuchsia-600/80 p-2 backdrop-blur"
              title="Collab"
            >
              <Users2 className="h-4 w-4" />
            </button>
          )}
          {!ended && (isSeller || isCohostParticipant) && !callJoined && (
            <button
              onClick={() => setCallJoined(true)}
              className="rounded-full bg-emerald-600/80 p-2 backdrop-blur"
              title="Go on camera"
            >
              <Camera className="h-4 w-4" />
            </button>
          )}
          {!ended && isSeller && usingCompositor && (
            <Link
              to="/studio/$id"
              params={{ id: stream.id }}
              className="rounded-full bg-primary/85 p-2 backdrop-blur"
              title="Arrange cameras"
            >
              <Settings className="h-4 w-4" />
            </Link>
          )}
          {(auctionLive || stream.current_item) && (
            <button
              onClick={() => setPinned((v) => !v)}
              data-tour="pin-item"
              className="rounded-full bg-black/50 p-2 backdrop-blur"
              title={pinned ? "Unpin auction" : "Pin auction"}
            >
              {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </button>
          )}
          {isSeller && !ended && (
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="rounded-full bg-black/50 p-2 backdrop-blur"
              title={stream.mode === "show_off" ? "Flex settings" : "Settings"}
            >
              <Settings className="h-4 w-4" />
            </button>
          )}
          {isSeller && !ended && stream.mode !== "show_off" && (
            <button
              onClick={() => setKoOpen(true)}
              title="K.O. — KickOut viewers to other live shows"
              className="relative rounded-full bg-gradient-to-br from-purple-600 via-fuchsia-600 to-blue-600 p-2 text-white shadow-[0_0_18px_rgba(168,85,247,0.7)] ring-1 ring-purple-300/40 hover:scale-105 transition-transform"
            >
              <Zap className="h-4 w-4" />
              <span className="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-black/80 px-1 text-[7px] font-extrabold tracking-wider text-white">
                K.O.
              </span>
            </button>
          )}
          {!isSeller && !ended && myLiveStream && stream?.ko_accepts_requests && (
            <button
              onClick={sendKORequest}
              title="Request to receive these viewers"
              className="rounded-full bg-gradient-to-br from-purple-600 to-blue-600 p-2 text-white shadow-[0_0_14px_rgba(168,85,247,0.5)]"
            >
              <Zap className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => setShowChat((v) => !v)}
            className="rounded-full bg-black/50 p-2 backdrop-blur"
          >
            {showChat ? <X className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* 🆕 Always-visible auction timer.
          When ≤5s remain (or sudden death), it bursts to the center of the screen and grows huge.
          When the round ends it animates back to its top-pill spot. */}
      {!ended &&
        (() => {
          const dramatic = auctionLive && (remaining <= 5000 || stream.sudden_death_active);
          const wrapPos = dramatic
            ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            : "left-1/2 top-14 -translate-x-1/2";
          return (
            <div
              data-tour="timer"
              className={`pointer-events-none absolute z-30 ${wrapPos} transition-all duration-500 ease-out`}
            >
              {auctionLive ? (
                <div
                  className={`flex items-center gap-2 rounded-full font-extrabold tabular-nums shadow-2xl ring-2 transition-all duration-500 ease-out ${
                    dramatic ? "px-8 py-5 text-6xl ring-4 scale-100" : "px-3 py-1.5 text-base"
                  } ${
                    stream.sudden_death_active
                      ? "bg-red-600 text-white ring-red-300 animate-pulse"
                      : snipeFlash
                        ? "bg-yellow-400 text-black ring-yellow-200"
                        : remaining <= 5000
                          ? "bg-orange-500 text-white ring-orange-200 animate-pulse"
                          : "bg-live text-live-foreground ring-white/30"
                  }`}
                >
                  {stream.sudden_death_active ? (
                    <Zap className={dramatic ? "h-12 w-12" : "h-4 w-4"} />
                  ) : (
                    <Timer className={dramatic ? "h-12 w-12" : "h-4 w-4"} />
                  )}
                  <span>{fmtRemaining(remaining)}</span>
                  {Number(stream.snipe_extends || 0) > 0 && !stream.sudden_death_active && (
                    <span
                      className={`rounded bg-black/30 ${dramatic ? "px-2 py-1 text-sm" : "ml-1 px-1.5 py-0.5 text-[9px]"}`}
                    >
                      +{stream.snipe_extends}/3 OT
                    </span>
                  )}
                  {stream.sudden_death_active && (
                    <span
                      className={`rounded bg-black/30 uppercase tracking-wider ${dramatic ? "px-3 py-1 text-base" : "ml-1 px-1.5 py-0.5 text-[9px]"}`}
                    >
                      Sudden Death
                    </span>
                  )}
                  {Number((stream as any).quick_start_remaining || 0) >= 0 &&
                    Number((stream as any).quick_start_quantity || 1) > 1 &&
                    !stream.sudden_death_active &&
                    !dramatic && (
                      <span className="ml-1 rounded bg-primary/30 px-1.5 py-0.5 text-[9px] font-bold uppercase">
                        Slot{" "}
                        {Number((stream as any).quick_start_quantity || 1) -
                          Number((stream as any).quick_start_remaining || 0)}
                        /{Number((stream as any).quick_start_quantity || 1)}
                      </span>
                    )}
                </div>
              ) : stream.mode === "show_off" ? null : (
                <div className="flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/80 shadow-md ring-1 ring-white/15 backdrop-blur">
                  {ended ? "Ended" : stream.current_item ? "Ready" : "Auction not started"}
                </div>
              )}
            </div>
          );
        })()}

      {/* Title / auction notification overlay (pinnable) */}
      {pinned && (
        <div
          className={`absolute left-3 right-3 z-10 md:right-[19rem] ${auctionLive ? "top-28" : "top-14"}`}
        >
          <div className="flex items-center gap-2 rounded-lg bg-black/40 px-3 py-1.5 backdrop-blur">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{stream.title}</p>
              {sellerUsername && (
                <Link
                  to="/seller/$username"
                  params={{ username: sellerUsername }}
                  className="text-[10px] font-semibold text-primary hover:underline"
                >
                  @{sellerUsername}
                  {stream.mode !== "show_off" ? " · view store" : ""}
                </Link>
              )}
            </div>
            {stream.current_condition && (
              <span className="shrink-0 rounded-md bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">
                {stream.current_condition}
              </span>
            )}
            {auctionLive && (
              <div
                className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-extrabold tabular-nums transition ${snipeFlash ? "bg-yellow-400 text-black scale-110 ring-2 ring-yellow-200" : "bg-live text-live-foreground"}`}
              >
                <Timer className="h-4 w-4" /> {fmtRemaining(remaining)}
                {Number(stream.snipe_extends || 0) > 0 && (
                  <span className="ml-1 rounded bg-black/30 px-1 text-[9px]">
                    +{stream.snipe_extends}× OT
                  </span>
                )}
              </div>
            )}
          </div>
          {snipeFlash && (
            <div className="mt-1 animate-in zoom-in rounded-lg bg-yellow-400 px-3 py-1.5 text-center text-xs font-extrabold tracking-wide text-black shadow-lg">
              ⚡ OVERTIME +5s — last-second strike!
            </div>
          )}
          {stream.item_description && (
            <p className="mt-1 line-clamp-2 rounded-lg bg-black/30 px-3 py-1 text-[11px] backdrop-blur">
              {stream.item_description}
            </p>
          )}
          {stream.mode !== "show_off" &&
          ((stream.shipping_price != null && Number(stream.shipping_price) > 0) ||
            stream.shipping_method) ? (
            <p className="mt-1 inline-block rounded-lg bg-black/30 px-3 py-1 text-[10px] backdrop-blur">
              📦 {stream.shipping_method || "Shipping"} —{" "}
              {fmtMoney(Number(stream.shipping_price || 0))}
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
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {isSeller && !ended && (
            <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-bold text-white/80 ring-1 ring-white/15 backdrop-blur">
              <ClockIcon className="h-3 w-3" /> {safety.statusLabel} ·{" "}
              {stream.stream_type === "show_off" ? "Flex soft limits" : "Auction-friendly"}
            </div>
          )}
        </div>
      )}

      {/* Winner banner — branded slam-in with shine + confetti rain */}
      {(auctionFinished || ended) && stream.winner_username && pinned && (
        <>
          <Confetti count={70} durationMs={2400} />
          <div className="owned-slam absolute left-1/2 top-20 z-30 w-[92%] max-w-md -translate-x-1/2">
            <div className="owned-glow rounded-2xl bg-card/80 p-[2px] backdrop-blur">
              <div className="rounded-2xl bg-gradient-to-br from-primary/95 via-primary to-accent p-4 text-center text-primary-foreground ring-1 ring-white/30">
                <Trophy className="winner-burst mx-auto h-9 w-9 drop-shadow" />
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">
                  Now Owned By
                </p>
                <p className="mt-0.5 winner-shine bg-clip-text text-xl font-extrabold tracking-tight text-transparent">
                  @{stream.winner_username}
                </p>
                <p className="text-xs font-semibold opacity-90">
                  Winning bid: {fmtMoney(Number(stream.winning_bid || 0))}
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Persistent "Latest Winner" pill — stays on screen until a new winner replaces it */}
      {(() => {
        // Pick the most recent winner across bid + giveaway + wheel.
        const candidates: { ts: number; label: string; sub?: string; kind: string }[] = [];
        const sLastBidUser = (stream as any)?.last_winner_username;
        const sLastBidAmt = Number((stream as any)?.last_winning_bid || 0);
        const sLastBidAt = (stream as any)?.last_winner_at
          ? new Date((stream as any).last_winner_at).getTime()
          : 0;
        if (sLastBidUser)
          candidates.push({
            ts: sLastBidAt,
            label: `@${sLastBidUser}`,
            sub: sLastBidAmt ? `${fmtMoney(sLastBidAmt)} bid` : "Bid winner",
            kind: "🏆",
          });
        const gWinner = activeGiveaway?.winner_username;
        const gAt = activeGiveaway?.drawn_at ? new Date(activeGiveaway.drawn_at).getTime() : 0;
        if (gWinner && activeGiveaway?.status === "complete")
          candidates.push({
            ts: gAt,
            label: `@${gWinner}`,
            sub: activeGiveaway.prize_label || "Gift winner",
            kind: "🎁",
          });
        const wWinner = wheel?.last_winner_username;
        const wAt = wheel?.last_winner_at ? new Date(wheel.last_winner_at).getTime() : 0;
        if (wWinner)
          candidates.push({
            ts: wAt,
            label: `@${wWinner}`,
            sub: wheel.last_winner_slot_label || "Wheel winner",
            kind: "🎡",
          });
        const latest = candidates.sort((a, b) => b.ts - a.ts)[0];
        // Don't double up with the big slam-in banner
        const slamming = (auctionFinished || ended) && stream.winner_username && pinned;
        if (!latest || slamming) return null;
        return (
          <div className="pointer-events-none absolute left-2 top-28 z-20">
            <div className="flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-extrabold text-white shadow-lg backdrop-blur ring-1 ring-white/15">
              <span>{latest.kind}</span>
              <span className="text-white">{latest.label}</span>
              {latest.sub && <span className="text-white/70 font-semibold">· {latest.sub}</span>}
            </div>
          </div>
        );
      })()}

      {/* Stream switcher */}
      {allStreams.length > 1 && !ended && (
        <>
          <button
            onClick={() => swipeStream(-1)}
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 backdrop-blur"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => swipeStream(1)}
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 backdrop-blur"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}

      {/* Flex Live settings panel — host controls chat + co-hosts (no auction stuff) */}
      {isSeller && showSettings && !ended && stream.mode === "show_off" && (
        <div className="absolute inset-x-3 top-24 z-30 max-h-[60vh] overflow-y-auto rounded-2xl bg-card/95 p-4 text-foreground shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold">✨ Flex settings</p>
            <button onClick={() => setShowSettings(false)}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3">
            <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5">
              <p className="flex items-center justify-between text-xs font-bold">
                <span>
                  🐢 Slow chat
                  {Number((stream as any).chat_slow_mode_sec || 0) > 0 && (
                    <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                      {(stream as any).chat_slow_mode_sec}s
                    </span>
                  )}
                </span>
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Slow viewer chat. Host & co-hosts bypass.
              </p>
              <div className="mt-2 grid grid-cols-5 gap-1">
                {[0, 3, 5, 10, 30].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={async () => {
                      setEditSlowMode(String(s));
                      await supabase
                        .from("live_streams")
                        .update({ chat_slow_mode_sec: s })
                        .eq("id", id);
                      sendMsg(s === 0 ? "🐢 Slow chat OFF" : `🐢 Slow chat ON — ${s}s`, true);
                    }}
                    className={`rounded-md py-1.5 text-[11px] font-bold ${Number(editSlowMode) === s ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground"}`}
                  >
                    {s === 0 ? "Off" : `${s}s`}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                setShowSettings(false);
                setShowCollabPanel(true);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-500 to-violet-500 py-2.5 text-xs font-bold text-white"
            >
              <Users2 className="h-3.5 w-3.5" /> Manage co-hosts (add / remove collab)
            </button>
            <p className="text-[10px] text-muted-foreground">
              Removing a co-host kicks them off the video stage but does <b>not</b> ban them — they
              can still watch &amp; chat.
            </p>

            <label className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 p-2.5 text-xs font-bold">
              <span>🎙️ Allow collab requests</span>
              <input
                type="checkbox"
                checked={!!stream.allow_collab_requests}
                onChange={async (e) => {
                  await supabase
                    .from("live_streams")
                    .update({ allow_collab_requests: e.target.checked })
                    .eq("id", id);
                }}
                className="h-4 w-4"
              />
            </label>
          </div>
        </div>
      )}

      {/* Seller settings panel (auction mode) */}
      {isSeller && showSettings && !ended && stream.mode !== "show_off" && (
        <div className="absolute inset-x-3 top-24 z-30 max-h-[60vh] overflow-y-auto rounded-2xl bg-card/95 p-4 text-foreground shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold">Item & Auction</p>
            <button onClick={() => setShowSettings(false)}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-2">
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              rows={2}
              placeholder="Item description"
              className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min="1"
                value={editStartPrice}
                onChange={(e) => setEditStartPrice(e.target.value)}
                placeholder="Start price ($)"
                className="rounded-lg bg-input px-3 py-2 text-xs outline-none"
              />
              <select
                value={editTimerSec}
                onChange={(e) => setEditTimerSec(e.target.value)}
                className="rounded-lg bg-input px-3 py-2 text-xs outline-none"
              >
                <option value="5">5s</option>
                <option value="10">10s</option>
                <option value="15">15s</option>
                <option value="20">20s</option>
                <option value="30">30s</option>
                <option value="60">60s</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min="0"
                step="0.01"
                value={editShipPrice}
                onChange={(e) => setEditShipPrice(e.target.value)}
                placeholder="Shipping ($)"
                className="rounded-lg bg-input px-3 py-2 text-xs outline-none"
              />
              <input
                value={editShipMethod}
                onChange={(e) => setEditShipMethod(e.target.value)}
                placeholder="Method"
                className="rounded-lg bg-input px-3 py-2 text-xs outline-none"
              />
            </div>

            {/* 🆕 Quantity — N total slots, one winner per round */}
            <label className="block text-[11px] text-muted-foreground">
              Quantity available (slots)
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={editQuantity}
                  onChange={(e) => setEditQuantity(e.target.value)}
                  className="w-20 rounded-lg bg-input px-3 py-2 text-sm font-bold outline-none"
                />
                <span className="text-[10px] text-muted-foreground">
                  Multiple winners — each round picks one buyer until all slots are sold.
                </span>
              </div>
              {Number((stream as any).quick_start_remaining || 0) > 0 && (
                <p className="mt-1 text-[10px] font-bold text-primary">
                  ⏭ {(stream as any).quick_start_remaining} slot(s) remaining
                </p>
              )}
            </label>

            {/* 🆕 Voice trigger toggle + phrase */}
            <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5">
              <label className="flex cursor-pointer items-center justify-between gap-2 text-xs font-bold">
                <span className="flex items-center gap-1.5">
                  🎙️ Voice trigger
                  {voiceListening && (
                    <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
                      LISTENING
                    </span>
                  )}
                </span>
                <input
                  type="checkbox"
                  checked={editVoiceEnabled}
                  onChange={(e) => setEditVoiceEnabled(e.target.checked)}
                  className="h-4 w-4"
                />
              </label>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Hands-free auction control. Commands: <b>{voicePhrase || "next"}</b>, "start",
                "sold", "extend", "end live".
              </p>
              <input
                value={editVoicePhrase}
                onChange={(e) => setEditVoicePhrase(e.target.value)}
                placeholder='Custom "next round" phrase (e.g. "next" or "go go go")'
                className="mt-2 w-full rounded-md bg-input px-2 py-1.5 text-xs outline-none"
              />
              {!voice.supported && editVoiceEnabled && (
                <p className="mt-1 text-[10px] font-bold text-amber-400">
                  ⚠ Voice not supported in this browser (try Chrome on desktop or Android). Manual
                  buttons still work.
                </p>
              )}
              <button
                onClick={saveAuctionDefaults}
                className="mt-2 w-full rounded-md bg-card-foreground/10 py-1.5 text-[11px] font-bold"
              >
                💾 Save voice & quantity
              </button>
            </div>

            {/* 🆕 Chat slow-mode */}
            <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5">
              <p className="flex items-center justify-between text-xs font-bold">
                <span className="flex items-center gap-1.5">
                  🐢 Slow chat
                  {Number((stream as any).chat_slow_mode_sec || 0) > 0 && (
                    <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                      {(stream as any).chat_slow_mode_sec}s
                    </span>
                  )}
                </span>
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Limit how often each viewer can chat. Host & mods bypass.
              </p>
              <div className="mt-2 grid grid-cols-5 gap-1">
                {[0, 3, 5, 10, 30].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={async () => {
                      setEditSlowMode(String(s));
                      await supabase
                        .from("live_streams")
                        .update({ chat_slow_mode_sec: s })
                        .eq("id", id);
                      sendMsg(
                        s === 0 ? "🐢 Slow chat OFF" : `🐢 Slow chat ON — ${s}s between messages`,
                        true,
                      );
                    }}
                    className={`rounded-md py-1.5 text-[11px] font-bold ${Number(editSlowMode) === s ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground"}`}
                  >
                    {s === 0 ? "Off" : `${s}s`}
                  </button>
                ))}
              </div>
            </div>

            {/* 🆕 Sudden Death config */}
            <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5">
              <label className="flex cursor-pointer items-center justify-between gap-2 text-xs font-bold">
                <span className="flex items-center gap-1.5">💀 Sudden Death</span>
                <input
                  type="checkbox"
                  checked={!!stream?.sudden_death_enabled}
                  onChange={async (e) => {
                    await supabase
                      .from("live_streams")
                      .update({ sudden_death_enabled: e.target.checked })
                      .eq("id", id);
                  }}
                  className="h-4 w-4"
                />
              </label>
              <p className="mt-1 text-[10px] text-muted-foreground">
                When ON, late bids extend the timer up to N times.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-[10px] text-muted-foreground">
                  Max triggers
                  <input
                    type="number"
                    min={1}
                    max={10}
                    defaultValue={stream?.sudden_death_max_triggers ?? 3}
                    onBlur={async (e) => {
                      const v = Math.max(1, Math.min(10, Number(e.target.value) || 3));
                      await supabase
                        .from("live_streams")
                        .update({ sudden_death_max_triggers: v })
                        .eq("id", id);
                    }}
                    className="mt-1 w-full rounded-md bg-input px-2 py-1.5 text-xs font-bold outline-none"
                  />
                </label>
                <label className="text-[10px] text-muted-foreground">
                  Sec added per bid
                  <input
                    type="number"
                    min={1}
                    max={30}
                    defaultValue={stream?.sudden_death_seconds_added ?? 5}
                    onBlur={async (e) => {
                      const v = Math.max(1, Math.min(30, Number(e.target.value) || 5));
                      await supabase
                        .from("live_streams")
                        .update({ sudden_death_seconds_added: v })
                        .eq("id", id);
                    }}
                    className="mt-1 w-full rounded-md bg-input px-2 py-1.5 text-xs font-bold outline-none"
                  />
                </label>
              </div>
            </div>

            {/* 🆕 Auction reveal mode — auto-pop a wheel/break when someone wins */}
            <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5">
              <p className="flex items-center gap-1.5 text-xs font-bold">🎁 Winner reveal</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                When this auction ends with a winner, auto-pop:
              </p>
              <div className="mt-2 grid grid-cols-3 gap-1">
                {(
                  [
                    { v: "none", label: "None" },
                    { v: "wheel", label: "🎡 Wheel" },
                    { v: "break", label: "🎲 Break" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={async () => {
                      setEditRevealMode(o.v);
                      await supabase
                        .from("live_streams")
                        .update({ auction_reveal_mode: o.v } as any)
                        .eq("id", id);
                    }}
                    className={`rounded-md py-1.5 text-[11px] font-bold ${editRevealMode === o.v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={startAuction}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-xs font-bold text-primary-foreground"
            >
              <Play className="h-3.5 w-3.5" /> {auctionLive ? "Restart Auction" : "Start Auction"}
            </button>

            {/* OBS Connect Hub — one-tap profile download + copy */}
            {usingObs && (
              <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-[11px]">
                <p className="mb-1 flex items-center gap-1.5 font-bold text-primary">
                  <Radio className="h-3.5 w-3.5" /> OBS Connect Hub
                </p>
                <p className="mb-2 text-muted-foreground">
                  OBS has not sent video yet if the preview is blank. Use the rescue button below to
                  go live with your browser camera instead.
                </p>
                <button
                  onClick={switchObsToBrowserCamera}
                  disabled={switchingToBrowserCam}
                  className="mb-2 flex w-full items-center justify-center gap-1 rounded bg-live px-2 py-2 text-[10px] font-bold text-live-foreground disabled:opacity-60"
                >
                  {switchingToBrowserCam ? "Switching…" : "🚨 Use browser camera instead"}
                </button>
                <div className="mb-2 grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => {
                      nav({ to: "/obs-hub" });
                    }}
                    className="flex items-center justify-center gap-1 rounded bg-primary px-2 py-1.5 text-[10px] font-bold text-primary-foreground"
                  >
                    📥 Fixed OBS Hub
                  </button>
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(
                        `Server: ${stream.cf_rtmps_url}\nStream Key: ${stream.cf_stream_key}`,
                      );
                      toast.success("Server + key copied");
                    }}
                    className="flex items-center justify-center gap-1 rounded bg-muted px-2 py-1.5 text-[10px] font-bold"
                  >
                    📋 Copy both
                  </button>
                </div>
                <p className="mb-2 text-muted-foreground">
                  Or paste manually into OBS → Settings → Stream → Service "Custom":
                </p>
                <div className="space-y-2">
                  <div>
                    <p className="mb-0.5 font-semibold">Server (RTMPS URL)</p>
                    <div className="flex items-center gap-1.5">
                      <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-[10px]">
                        {stream.cf_rtmps_url}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(stream.cf_rtmps_url);
                          toast.success("Copied");
                        }}
                        className="rounded bg-muted px-2 py-1"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="mb-0.5 font-semibold">Fallback Server (RTMP URL)</p>
                    <div className="flex items-center gap-1.5">
                      <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-[10px]">
                        {stream.cf_rtmps_url
                          ? String(stream.cf_rtmps_url)
                              .replace(/^rtmps:\/\//, "rtmp://")
                              .replace(":443/", ":1935/")
                          : ""}
                      </code>
                      <button
                        onClick={() => {
                          const fallback = String(stream.cf_rtmps_url || "")
                            .replace(/^rtmps:\/\//, "rtmp://")
                            .replace(":443/", ":1935/");
                          navigator.clipboard.writeText(fallback);
                          toast.success("Fallback copied");
                        }}
                        className="rounded bg-muted px-2 py-1"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="mb-0.5 font-semibold">Stream Key</p>
                    <div className="flex items-center gap-1.5">
                      <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-[10px]">
                        {stream.cf_stream_key
                          ? "••••••••" + String(stream.cf_stream_key).slice(-6)
                          : ""}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(stream.cf_stream_key);
                          toast.success("Stream key copied");
                        }}
                        className="rounded bg-muted px-2 py-1"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Keep this private. Anyone with this key can broadcast to your stream.
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Recommended: 1080p · 30fps · 4500 kbps · Keyframe 2s · x264.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Auction notification feed (separate from chat, pinnable) */}
      {pinned && messages.some((m) => m.is_system && !hiddenSysIds.has(m.id)) && (
        <div className="pointer-events-none absolute right-3 top-32 z-10 flex max-h-[28vh] w-56 flex-col items-end gap-1 overflow-hidden">
          {messages
            .filter((m) => m.is_system && !hiddenSysIds.has(m.id))
            .slice(-5)
            .map((m) => (
              <div
                key={m.id}
                className="rounded-lg bg-primary/60 px-2.5 py-1 text-[11px] text-white backdrop-blur"
              >
                <Sparkles className="mr-1 inline h-3 w-3" />
                {m.content}
              </div>
            ))}
        </div>
      )}

      {/* Viewer giveaway/appreciation entry UI removed to keep bidding controls clear. */}

      {/* 📢 Announcements — pinned to TOP, above the chat. Live-ticks the giveaway timer. */}
      {(() => {
        // Always hide the giveaway-open announcement — the top-right chip already shows the live countdown.
        const annMsgs = messages.filter(
          (m) =>
            m.is_announcement &&
            !dismissedAnnouncementIds.has(m.id) &&
            !/Appreciation Gift opened/i.test(String(m.content || "")),
        );
        if (annMsgs.length === 0) return null;
        return (
          <div className="pointer-events-none absolute left-2 right-14 top-16 z-20 flex flex-col items-stretch gap-1">
            {annMsgs.slice(-3).map((m) => {
              return (
                <div
                  key={m.id}
                  className="pointer-events-auto relative rounded-lg border border-accent/60 bg-gradient-to-r from-accent/70 to-primary/70 py-1.5 pl-3 pr-7 text-[11px] font-bold text-white shadow-lg backdrop-blur"
                >
                  <span className="mr-1 rounded bg-accent px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-accent-foreground">
                    Announcement
                  </span>
                  @{m.username}: {m.content.replace(/^📢\s*/, "")}
                  <button
                    onClick={() => setDismissedAnnouncementIds((s) => new Set(s).add(m.id))}
                    className="absolute -right-1 -top-1 rounded-full bg-black/70 p-0.5 text-white/90 hover:bg-black"
                    title="Dismiss"
                    aria-label="Dismiss announcement"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Chat overlay — sits low and narrow so the stream stays unobstructed */}
      {showChat && !(isStaff && hostFocus) && !(stream.mode === "show_off" && flexImmersive) && (
        <div
          ref={chatScrollRef}
          className={`chat-scroll absolute z-10 overflow-y-auto overscroll-contain
            pb-1
            ${
              isStaff
                ? "right-2 bottom-64 max-h-[40vh] w-[62%] max-w-[17rem] rounded-xl bg-black/55 p-1.5 ring-1 ring-white/10 backdrop-blur"
                : "left-2 bottom-28 max-h-[20vh] w-[58%] max-w-[16rem] pr-1"
            }
            md:bottom-32 md:left-auto md:right-3 md:top-16 md:max-h-none md:h-auto md:w-72 md:max-w-none
            md:rounded-2xl md:bg-black/40 md:backdrop-blur md:p-3 md:ring-1 md:ring-white/10`}
        >
          <div className="flex flex-col items-start gap-1">
            {messages
              .filter((m) => {
                if (m.is_system || m.is_announcement) return false;
                // Hide messages from users I personally blocked, or users banned from this stream (unless I'm staff — keep visibility for context)
                if (m.user_id && myBlockedIds.has(m.user_id)) return false;
                if (m.user_id && streamBannedIds.has(m.user_id) && !isStaff) return false;
                return true;
              })
              .map((m) => {
                const parts = String(m.content).split(/(@[A-Za-z0-9_]+)/g);
                const isBlocked = m.user_id && chatBlockSet.has(m.user_id);
                return (
                  <div
                    key={m.id}
                    className={`max-w-full rounded-lg px-2 py-0.5 text-[11px] leading-snug backdrop-blur ${isBlocked ? "bg-red-500/30 line-through opacity-60" : "bg-black/50 md:bg-white/5"}`}
                  >
                    {isStaff &&
                    m.user_id &&
                    m.user_id !== user?.id &&
                    m.user_id !== stream.seller_id ? (
                      <button
                        onClick={() =>
                          setChatActionMenu({ userId: m.user_id, username: m.username })
                        }
                        className="mr-1 font-semibold text-live-foreground hover:underline"
                        title="Mod actions"
                      >
                        @{m.username}:
                      </button>
                    ) : (
                      <span className="mr-1 font-semibold text-live-foreground">
                        @{m.username}:
                      </span>
                    )}
                    <span className="break-words">
                      {parts.map((p, i) =>
                        p.startsWith("@") ? (
                          <Link
                            key={i}
                            to="/seller/$username"
                            params={{ username: p.slice(1) }}
                            className="font-semibold text-primary hover:underline"
                          >
                            {p}
                          </Link>
                        ) : (
                          <span key={i}>{p}</span>
                        ),
                      )}
                    </span>
                    {user && m.user_id && m.user_id !== user.id && (
                      <ReportDialog
                        targetType="message"
                        targetId={m.id}
                        targetLabel={`@${m.username}: ${String(m.content).slice(0, 60)}`}
                        trigger={
                          <button
                            className="ml-1 align-middle text-white/40 hover:text-white"
                            title="Report message"
                          >
                            <Flag className="inline h-2.5 w-2.5" />
                          </button>
                        }
                      />
                    )}
                    {user && m.user_id && m.user_id !== user.id && (
                      <UserActionsMenu
                        meId={user.id}
                        targetUserId={m.user_id}
                        targetUsername={m.username}
                        isStreamStaff={isStaff}
                        streamId={id}
                      />
                    )}
                  </div>
                );
              })}
            <div ref={chatEndRef} />
          </div>
        </div>
      )}

      {/* Bottom panel */}
      <div className="absolute bottom-0 left-0 right-0 z-20 space-y-2.5 bg-gradient-to-t from-black via-black/85 to-transparent p-3 pt-8 md:right-[19rem]">
        {stream.mode === "show_off" && (
          <>
            {/* Collapse / full-screen toggle for Flex Live */}
            <div className="flex justify-center">
              <button
                onClick={() => setFlexImmersive((v) => !v)}
                className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/80 ring-1 ring-white/15 backdrop-blur active:scale-[0.98]"
                title={flexImmersive ? "Show panels" : "Hide everything for full screen"}
              >
                {flexImmersive ? "▣ Show panels" : "⛶ Full-screen vibe"}
              </button>
            </div>
            {!flexImmersive && (
              <>
                <FlexLiveControls
                  streamId={id}
                  isHost={isSeller}
                  userId={user?.id || null}
                  username={profile?.username || null}
                  currentFilter={stream.video_filter || "none"}
                />
                {isSeller && !paused && (
                  <button
                    onClick={endLive}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-live py-2.5 text-sm font-extrabold text-live-foreground active:scale-[0.98]"
                  >
                    <Square className="h-3.5 w-3.5" /> End Flex
                  </button>
                )}
              </>
            )}
          </>
        )}
        {stream.mode !== "show_off" && (
          <>
            {/* PRIORITY 1: Current Bid — centered, large, focal point */}
            <div className="flex flex-col items-center gap-0.5 text-center">
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-white/60">
                <span className="rounded bg-white/15 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  Bid #{Number(stream.round_number || 0) + (auctionLive ? 1 : 0) || 1}
                </span>
                {ended || auctionFinished ? "Final Bid" : "Current Bid"}
              </p>
              <p
                key={`bid-${Number(stream.current_bid || 0)}`}
                className="bid-bump text-4xl font-extrabold text-primary tabular-nums drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
              >
                {fmtMoney(Number(stream.current_bid || 0))}
              </p>
              {/* PRIORITY 3: Item / status (compact) */}
              <p className="line-clamp-1 max-w-full text-xs font-semibold text-white/90">
                {stream.current_item || (auctionLive ? "Live auction" : "Waiting for next item")}
              </p>
            </div>

            {/* 🆕 SNIPE buy-now strip (visible to non-sellers when host set a snipe price) */}
            {!isSeller && auctionLive && stream.snipe_price && !meBlockedOrBanned && (
              <button
                onClick={buyNowSnipe}
                data-tour="bin-button"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-400 py-2.5 text-sm font-extrabold text-black shadow-lg ring-2 ring-yellow-200 active:scale-[0.98]"
              >
                <Zap className="h-4 w-4" /> SNIPE Buy-Now {fmtMoney(Number(stream.snipe_price))}
              </button>
            )}

            {/* 🆕 Mystery break stays collapsed for viewers unless they tap it or host pins it */}
            {!isSeller &&
              stream.break_mode === "open" &&
              stream.break_slot_count &&
              !stream.break_force_visible && (
                <div className="flex justify-center">
                  <button
                    onClick={() => setShowViewerBreak(true)}
                    className="flex items-center gap-2 rounded-full bg-card/70 px-3 py-1.5 text-[11px] font-extrabold text-foreground shadow-lg ring-1 ring-white/15 backdrop-blur active:scale-[0.98]"
                  >
                    <Dice5 className="h-3.5 w-3.5 text-primary" />
                    🎴 View Break
                    <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                      {breakSlots.length}/{stream.break_slot_count}
                    </span>
                  </button>
                </div>
              )}

            {/* Mystery break results — shown after host closes claims */}
            {!isSeller && stream.break_mode === "closed" && breakSlots.length > 0 && (
              <div className="rounded-xl bg-card/40 p-3 text-xs">
                <p className="mb-1 font-bold text-white">🎲 Mystery Break results</p>
                <div className="grid grid-cols-2 gap-1">
                  {[...breakSlots]
                    .sort((a, b) => (a.slot_number || 0) - (b.slot_number || 0))
                    .map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between rounded bg-white/5 px-2 py-1"
                      >
                        <span className="font-bold text-pink-300">
                          {stream.break_slot_prefix || "#"}
                          {s.slot_number}
                        </span>
                        <span className="truncate text-white/80">@{s.buyer_username}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* 🆕 Spin Wheel — viewers only see it when host enables viewer spins or a spin is live */}
            {!isSeller && wheel && wheelSlots.length > 0 && (
              <button
                onClick={() => setShowWheelOverlay(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-purple-500 py-2.5 text-sm font-extrabold text-white shadow-lg active:scale-[0.98]"
              >
                <RotateCw className={`h-4 w-4 ${wheel.is_spinning ? "animate-spin" : ""}`} />
                {wheel.is_spinning ? "Spinning live…" : "Spin the Wheel"}
                <span className="ml-1 text-[10px] font-semibold opacity-80">
                  {wheelSlots.filter((s) => s.is_active).length} prizes
                </span>
              </button>
            )}

            {/* Viewer Giveaway entry — chip with 1-tap join (auto-follows host if eligibility=followers) */}
            {!isSeller && (
              <ViewerGiveawayJoin
                streamId={id}
                sellerId={stream?.seller_id || null}
                userId={user?.id || null}
                username={profile?.username || null}
                isFollower={isFollowingHost}
                isBuyer={isPastBuyer}
                onFollowed={() => setIsFollowingHost(true)}
              />
            )}

            {!isSeller && (
              <>
                {auctionLive && !meBlockedOrBanned && !bidDisabled && (
                  <div data-tour="bid-controls" className="grid grid-cols-4 gap-1.5">
                    {[1, 5, 10, 25].map((inc) => (
                      <button
                        key={inc}
                        onClick={() => placeBidAmount(Number(stream.current_bid || 0) + inc)}
                        className="rounded-lg bg-white/10 py-2 text-xs font-extrabold tabular-nums text-white backdrop-blur ring-1 ring-white/15 active:scale-95 hover:bg-white/15"
                      >
                        +${inc}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    {!bidDisabled && !meBlockedOrBanned && holdAdd === 0 && (
                      <div className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 swipe-up-hint">
                        <div className="flex flex-col items-center text-[9px] font-bold uppercase tracking-wider text-primary-glow">
                          <span>Swipe ↑ +$3</span>
                        </div>
                      </div>
                    )}
                    <button
                      onPointerDown={bidDisabled || meBlockedOrBanned ? undefined : startHold}
                      disabled={bidDisabled || meBlockedOrBanned}
                      data-tour="hold-bid"
                      className="relative w-full select-none overflow-hidden rounded-xl bg-gradient-to-br from-red-600 via-red-500 to-red-700 py-3.5 text-base font-bold text-white shadow-[0_8px_24px_-8px_rgba(220,38,38,0.6)] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-muted disabled:bg-none disabled:text-muted-foreground disabled:shadow-none"
                    >
                      {!bidDisabled && !meBlockedOrBanned && holdAdd === 0 && (
                        <span className="pointer-events-none absolute inset-0 brand-shimmer opacity-50" />
                      )}
                      <span className="relative">
                        {meBlockedOrBanned
                          ? "🚫 You're muted/banned"
                          : bidDisabled
                            ? auctionFinished || ended
                              ? "Auction Ended"
                              : "Auction not started"
                            : holdAdd > 0
                              ? `+$${holdAdd} — release to bid`
                              : "THIS IS MINE  ↑ hold to bid"}
                      </span>
                    </button>
                  </div>
                  {!ended && !isSeller && (
                    <button
                      onClick={() =>
                        user ? setTipOpen(true) : toast.error("Sign in to shout out")
                      }
                      title="Send a shout-out tip"
                      className="flex shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 px-3 py-2 text-[10px] font-bold text-white active:scale-[0.98]"
                    >
                      <Megaphone className="h-4 w-4" />
                      Shout
                    </button>
                  )}
                </div>
              </>
            )}
            {isSeller && !ended && !paused && (safety.inactiveWarning || safety.flexReminder) && (
              <div className="space-y-2 rounded-xl bg-amber-500/15 p-3 ring-1 ring-amber-400/40 backdrop-blur">
                <p className="text-center text-[11px] font-bold text-amber-100">
                  {safety.inactiveWarning
                    ? `Still live? No activity detected — stream auto-ends in ${Math.max(0, Math.ceil(((stream?.last_activity_at ? new Date(stream.last_activity_at).getTime() : Date.now()) + safety.tier.inactive_auto_end_minutes * 60_000 - Date.now()) / 60_000))}m unless you confirm.`
                    : "Flex Live session reminder"}
                </p>
                <div className="flex gap-1.5">
                  <button
                    onClick={safety.confirmActive}
                    disabled={safety.confirming}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary py-2 text-[11px] font-extrabold text-primary-foreground disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" /> I’m still live
                  </button>
                  {stream.stream_type === "show_off" && (
                    <button
                      onClick={async () => {
                        await safety.extendFlex();
                        toast.success("Flex Live extended");
                      }}
                      className="rounded-lg bg-fuchsia-500 px-3 py-2 text-[11px] font-extrabold text-white"
                    >
                      Extend
                    </button>
                  )}
                </div>
              </div>
            )}
            {isSeller && paused && (
              <div className="space-y-2 rounded-xl bg-amber-500/15 p-3 ring-1 ring-amber-400/40 backdrop-blur">
                <p className="text-center text-[11px] font-bold text-amber-200">
                  ⏸️ Paused{" "}
                  {pauseExpired
                    ? "— window expired"
                    : `· ${Math.floor(pauseMsLeft / 60000)}m ${Math.floor((pauseMsLeft % 60000) / 1000)}s left`}
                </p>
                {(stream as any).pause_message && (
                  <p className="rounded-md bg-black/30 p-2 text-center text-[11px] italic text-amber-100">
                    "{(stream as any).pause_message}"
                  </p>
                )}
                <div className="flex gap-1.5">
                  <button
                    onClick={resumeLive}
                    disabled={pauseExpired}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 py-2 text-[12px] font-extrabold text-white shadow active:scale-[0.98] disabled:opacity-50"
                  >
                    <Play className="h-3.5 w-3.5" /> Resume
                  </button>
                  <button
                    onClick={confirmEndLive}
                    className="flex shrink-0 items-center justify-center gap-1 rounded-lg bg-live px-3 py-2 text-[11px] font-bold text-live-foreground active:scale-[0.98]"
                  >
                    <Square className="h-3 w-3" /> End for good
                  </button>
                </div>
              </div>
            )}
            {!isSeller && paused && !pauseExpired && (
              <div className="space-y-1.5 rounded-xl bg-amber-500/15 p-3 text-center ring-1 ring-amber-400/40 backdrop-blur">
                <p className="text-xs font-extrabold text-amber-100">⏸️ Host is on a quick break</p>
                <p className="text-[11px] tabular-nums text-amber-200">
                  Back within {Math.floor(pauseMsLeft / 3600000)}h{" "}
                  {Math.floor((pauseMsLeft % 3600000) / 60000)}m{" "}
                  {Math.floor((pauseMsLeft % 60000) / 1000)}s
                </p>
                {(stream as any).pause_message && (
                  <p className="rounded-md bg-black/30 p-2 text-[11px] italic text-amber-100">
                    "{(stream as any).pause_message}"
                  </p>
                )}
              </div>
            )}
            {isSeller && !ended && !paused && (
              <div className="space-y-1.5">
                {/* Host focus toggle — collapses everything to maximize live video */}
                <button
                  onClick={() => setHostFocus((v) => !v)}
                  className="flex w-full items-center justify-center gap-1 rounded-lg bg-white/10 py-1 text-[10px] font-bold text-white/90 ring-1 ring-white/15 active:scale-[0.98]"
                  title={hostFocus ? "Show all host panels" : "Hide panels for full video"}
                >
                  {hostFocus ? (
                    <ChevronLeft className="h-3 w-3 rotate-90" />
                  ) : (
                    <ChevronRight className="h-3 w-3 rotate-90" />
                  )}
                  {hostFocus ? "Show panels" : "Hide panels (focus video)"}
                </button>
                {!hostFocus && (
                  <>
                    {/* 🆕 Quick-Bar — start a round in one tap, no Settings round-trip */}
                    {!auctionLive && (
                      <div className="space-y-1 rounded-xl bg-card/60 p-1.5 ring-1 ring-white/10 backdrop-blur">
                        <div className="flex items-center gap-1">
                          <input
                            value={quickItem}
                            onChange={(e) => setQuickItem(e.target.value)}
                            placeholder="Item (e.g. Charizard PSA 9)"
                            maxLength={60}
                            className="flex-1 rounded-md bg-background/70 px-1.5 py-1 text-[11px] text-foreground outline-none placeholder:text-muted-foreground"
                          />
                          <button
                            onClick={() => repeatLastQuick()}
                            disabled={!lastQuick}
                            title={lastQuick ? `Repeat: ${lastQuick.item}` : "No previous round"}
                            className="rounded-md bg-white/10 px-1.5 py-1 text-[9px] font-bold text-white disabled:opacity-40"
                          >
                            ↻
                          </button>
                        </div>
                        <div className="flex items-center gap-1">
                          <label className="flex items-center gap-0.5 rounded-md bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                            $
                            <input
                              type="number"
                              min="1"
                              inputMode="decimal"
                              value={editStartPrice}
                              onChange={(e) => setEditStartPrice(e.target.value)}
                              className="w-9 bg-transparent text-[11px] font-bold text-foreground outline-none"
                            />
                          </label>
                          <label className="flex items-center gap-0.5 rounded-md bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                            Buy
                            <input
                              type="number"
                              min="1"
                              inputMode="decimal"
                              value={quickBuyNow}
                              onChange={(e) => setQuickBuyNow(e.target.value)}
                              placeholder="—"
                              className="w-10 bg-transparent text-[11px] font-bold text-foreground outline-none placeholder:text-muted-foreground"
                            />
                          </label>
                          <div className="flex items-center gap-0.5">
                            {([15, 30, 60, 120] as const).map((s) => (
                              <button
                                key={s}
                                onClick={() => setEditTimerSec(String(s))}
                                className={`rounded-md px-1 py-0.5 text-[9px] font-bold ${Number(editTimerSec) === s ? "bg-primary text-primary-foreground" : "bg-background/70 text-muted-foreground"}`}
                              >
                                {s < 60 ? `${s}s` : `${s / 60}m`}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-stretch gap-1">
                          <button
                            onClick={() => quickStartAuction()}
                            disabled={!quickItem.trim()}
                            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 py-1 text-[11px] font-extrabold text-white shadow active:scale-[0.98] disabled:opacity-50"
                          >
                            <Play className="h-3 w-3" /> START
                          </button>
                          <button
                            onClick={() => setShowSettings(true)}
                            title="Advanced settings"
                            className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-bold text-white"
                          >
                            <Settings className="h-3 w-3" />
                          </button>
                          <button
                            onClick={endLive}
                            className="flex shrink-0 items-center justify-center gap-1 rounded-lg bg-live px-2 py-1 text-[10px] font-bold text-live-foreground active:scale-[0.98]"
                          >
                            <Square className="h-2.5 w-2.5" /> End
                          </button>
                        </div>
                      </div>
                    )}
                    {auctionLive && (
                      <div className="flex items-stretch gap-1">
                        <button
                          onClick={() => {
                            endedRef.current = true;
                            finalizeAuctionRound();
                          }}
                          className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-orange-500 py-1 text-[10px] font-bold text-white shadow active:scale-[0.98]"
                        >
                          <Square className="h-2.5 w-2.5" /> End Auction
                        </button>
                        <button
                          onClick={endLive}
                          className="flex shrink-0 items-center justify-center gap-1 rounded-lg bg-live px-2 py-1 text-[10px] font-bold text-live-foreground active:scale-[0.98]"
                        >
                          <Square className="h-2.5 w-2.5" /> End Live
                        </button>
                      </div>
                    )}
                    {/* Secondary tools row */}
                    <div
                      className={`grid gap-0.5 ${stream.break_mode === "open" ? "grid-cols-6" : "grid-cols-5"}`}
                    >
                      <button
                        onClick={() => setScanning(true)}
                        className="flex flex-col items-center justify-center gap-0 rounded-md bg-accent py-0.5 text-[8px] font-bold text-accent-foreground active:scale-[0.98]"
                      >
                        <Camera className="h-2.5 w-2.5" /> Scan
                      </button>
                      <button
                        onClick={() => setShowBreakPanel(true)}
                        className="flex flex-col items-center justify-center gap-0 rounded-md bg-gradient-to-r from-pink-500 to-purple-500 py-0.5 text-[8px] font-bold text-white active:scale-[0.98]"
                      >
                        <Dice5 className="h-2.5 w-2.5" /> Break
                      </button>
                      {stream.break_mode === "open" && (
                        <button
                          onClick={async () => {
                            const next = !stream.break_force_visible;
                            setStream((prev: any) =>
                              prev ? { ...prev, break_force_visible: next } : prev,
                            );
                            await supabase
                              .from("live_streams")
                              .update({ break_force_visible: next })
                              .eq("id", id);
                            toast.success(
                              next
                                ? "Break grid pinned for viewers"
                                : "Viewers can collapse the break grid",
                            );
                          }}
                          className="flex flex-col items-center justify-center gap-0 rounded-md bg-card/70 py-0.5 text-[8px] font-bold text-foreground ring-1 ring-white/15 active:scale-[0.98]"
                        >
                          {stream.break_force_visible ? (
                            <PinOff className="h-2.5 w-2.5" />
                          ) : (
                            <Pin className="h-2.5 w-2.5" />
                          )}
                          {stream.break_force_visible ? "Unpin" : "Pin"}
                        </button>
                      )}
                      <button
                        onClick={() => setShowWheelEditor(true)}
                        className="flex flex-col items-center justify-center gap-0 rounded-md bg-gradient-to-r from-amber-500 to-rose-500 py-0.5 text-[8px] font-bold text-white active:scale-[0.98]"
                      >
                        <RotateCw className="h-2.5 w-2.5" /> Wheel
                      </button>
                      <button
                        onClick={() => {
                          setGiveawayComposer(true);
                          setShowGiveaway(true);
                        }}
                        className="flex flex-col items-center justify-center gap-0 rounded-md bg-gradient-to-r from-emerald-500 to-teal-500 py-0.5 text-[8px] font-bold text-white active:scale-[0.98]"
                      >
                        <Gift className="h-2.5 w-2.5" /> Gift
                      </button>
                      <button
                        disabled={!auctionLive}
                        onClick={() => setSnipeOpen(true)}
                        className="flex flex-col items-center justify-center gap-0 rounded-md bg-gradient-to-r from-yellow-500 to-amber-500 py-0.5 text-[8px] font-bold text-black active:scale-[0.98] disabled:opacity-40"
                        title={auctionLive ? "Set buy-now snipe price" : "Available during auction"}
                      >
                        <Zap className="h-2.5 w-2.5" /> Snipe
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {ended && (
              <div className="rounded-xl bg-card/20 p-3 text-center text-xs backdrop-blur">
                {stream.winner_id
                  ? `Sold to @${stream.winner_username || "buyer"} for $${Number(stream.winning_bid || 0).toFixed(2)}`
                  : "Live ended"}
              </div>
            )}
          </>
        )}

        {/* Chat input — hidden in Flex immersive mode */}
        {!(stream.mode === "show_off" && flexImmersive) && (
          <form onSubmit={handleSend} className="relative flex gap-2">
            {tagOpen && tagResults.length > 0 && (
              <div className="absolute bottom-full left-0 right-12 mb-2 max-h-48 overflow-y-auto rounded-xl bg-card text-foreground shadow-xl">
                {tagResults.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      const next = input.replace(/@([A-Za-z0-9_]*)$/, `@${u.username} `);
                      setInput(next);
                      setTagOpen(false);
                      setTagResults([]);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
                  >
                    @{u.username}
                  </button>
                ))}
              </div>
            )}
            <input
              value={input}
              data-tour="chat"
              onChange={(e) => {
                const v = e.target.value;
                setInput(v);
                const m = v.match(/@([A-Za-z0-9_]*)$/);
                if (m) {
                  setTagOpen(true);
                  searchUsers(m[1], setTagResults);
                } else {
                  setTagOpen(false);
                  setTagResults([]);
                }
              }}
              placeholder={
                !user
                  ? "Sign in to chat"
                  : meBlockedOrBanned
                    ? "🚫 You're muted in this stream"
                    : "Say something... use @ to tag"
              }
              disabled={!user || meBlockedOrBanned}
              className="flex-1 rounded-full bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/50 outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={meBlockedOrBanned}
              className="rounded-full bg-primary p-2.5 text-primary-foreground disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        )}
      </div>

      {/* End Live confirmation — pause for 3h (with custom message) or end for good */}
      {endLiveOpen && isSeller && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"
          onClick={() => setEndLiveOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm space-y-3 rounded-2xl bg-card p-4 text-foreground shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">
                {stream.mode === "show_off" ? "End Flex?" : "End live?"}
              </p>
              <button onClick={() => setEndLiveOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Quick break? Pause for up to <strong>3 hours</strong> — viewers see a "Be right back"
              countdown with your message. After 3h the stream auto-disappears.
            </p>
            <input
              value={pauseMessageDraft}
              onChange={(e) => setPauseMessageDraft(e.target.value.slice(0, 140))}
              placeholder='Optional message — e.g. "Bathroom break, back at 9pm"'
              className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none"
            />
            <div className="space-y-2">
              <button
                onClick={pauseLiveFor3h}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-sm font-extrabold text-white shadow active:scale-[0.98]"
              >
                ⏸️ Pause up to 3 hours
              </button>
              <button
                onClick={confirmEndLive}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-live py-2.5 text-sm font-extrabold text-live-foreground active:scale-[0.98]"
              >
                <Square className="h-4 w-4" />{" "}
                {stream.mode === "show_off" ? "End Flex for good" : "End live for good"}
              </button>
              <button
                onClick={() => setEndLiveOpen(false)}
                className="w-full rounded-xl bg-muted py-2 text-xs text-muted-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Snipe / Buy-Now price popup (seller) */}
      {snipeOpen && isSeller && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"
          onClick={() => setSnipeOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm space-y-3 rounded-2xl bg-card p-4 text-foreground shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-yellow-500" /> Buy-Now Snipe
              </p>
              <button onClick={() => setSnipeOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Set a price viewers can hit to instantly win the current item.
            </p>
            <input
              type="number"
              min="1"
              inputMode="decimal"
              value={snipePriceInput}
              onChange={(e) => setSnipePriceInput(e.target.value)}
              placeholder={`Above current bid ($${Number(stream?.current_bid || 0).toFixed(0)})`}
              className="w-full rounded-lg bg-input px-3 py-2 text-sm outline-none"
              autoFocus
            />
            <div className="flex gap-2">
              {stream?.snipe_price && (
                <button
                  onClick={async () => {
                    await supabase.from("live_streams").update({ snipe_price: null }).eq("id", id);
                    setSnipeOpen(false);
                    toast.success("Snipe cleared");
                  }}
                  className="flex-1 rounded-lg bg-muted py-2 text-xs font-semibold"
                >
                  Clear
                </button>
              )}
              <button
                onClick={async () => {
                  await setSnipePriceNow();
                  setSnipeOpen(false);
                }}
                className="flex-1 rounded-lg bg-yellow-500 py-2 text-xs font-bold text-black"
              >
                Set Snipe
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share modal */}
      {shareOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-3 sm:items-center"
          onClick={() => setShareOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-card p-4 text-foreground shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold">Share live</p>
              <button onClick={() => setShareOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={async () => {
                const url = `${window.location.origin}/live/${id}`;
                try {
                  if (navigator.share) await navigator.share({ title: stream.title, url });
                  else {
                    await navigator.clipboard.writeText(url);
                    toast.success("Link copied");
                  }
                } catch {
                  /* ignore */
                }
              }}
              className="mb-2 w-full rounded-lg bg-muted px-3 py-2 text-xs font-semibold"
            >
              Copy / system share
            </button>
            <input
              value={shareQuery}
              onChange={(e) => {
                setShareQuery(e.target.value);
                searchUsers(e.target.value, setShareUsers);
              }}
              placeholder="Search users to DM"
              className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none"
            />
            <div className="mt-2 max-h-56 overflow-y-auto">
              {shareUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => shareLiveTo(u.id, u.username)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs hover:bg-muted"
                >
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
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"
          onClick={() => setShoutoutOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-card p-4 text-foreground shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-bold">
                <Megaphone className="h-4 w-4 text-primary" /> Send a Shout-Out
              </p>
              <button onClick={() => setShoutoutOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-2 text-[11px] text-muted-foreground">
              Tip the seller and tell them what to shout. Make it fun! 🎉
              <br />
              You've spent <span className="font-semibold text-foreground">${mySpent}</span> ·{" "}
              <span className="font-semibold text-foreground">${50 - mySpent}</span> left this
              stream.
            </p>
            <textarea
              value={shoutoutMsg}
              onChange={(e) => setShoutoutMsg(e.target.value)}
              maxLength={140}
              rows={2}
              placeholder='e.g. "Shout out to my friend Mike!" or "Say hi to Tokyo!"'
              className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none"
            />
            <p className="mb-2 text-right text-[10px] text-muted-foreground">
              {shoutoutMsg.length}/140
            </p>

            <p className="mb-1 text-xs font-semibold">
              Amount: <span className="text-primary">${shoutoutAmt}</span>
            </p>
            <input
              type="range"
              min={5}
              max={Math.max(5, Math.min(50, 50 - mySpent))}
              step={1}
              value={shoutoutAmt}
              onChange={(e) => setShoutoutAmt(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="mt-1 mb-3 flex justify-between text-[10px] text-muted-foreground">
              <span>$5</span>
              <span>$25</span>
              <span>$50</span>
            </div>
            <div className="mb-3 grid grid-cols-4 gap-1.5">
              {[5, 10, 25, 50].map((v) => {
                const disabled = v > 50 - mySpent;
                return (
                  <button
                    key={v}
                    disabled={disabled}
                    onClick={() => setShoutoutAmt(v)}
                    className={`rounded-lg py-1.5 text-xs font-bold ${shoutoutAmt === v ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"} disabled:opacity-30`}
                  >
                    ${v}
                  </button>
                );
              })}
            </div>
            <button
              onClick={sendShoutout}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground"
            >
              Send ${shoutoutAmt} Shout-Out (safe mode)
            </button>
            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              No real charge yet — payments turn on later.
            </p>
          </div>
        </div>
      )}

      {/* AI HYPE overlay — 5s card details (NEVER price) */}
      {hypeCard && (
        <div className="pointer-events-none absolute left-1/2 top-24 z-30 w-[88%] max-w-md -translate-x-1/2 animate-in fade-in slide-in-from-top">
          <div className="flex gap-3 rounded-2xl border border-primary/40 bg-black/75 p-3 shadow-2xl backdrop-blur">
            <img
              src={hypeCard.image}
              alt={hypeCard.name}
              className="h-20 w-16 shrink-0 rounded-lg object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                <Sparkles className="h-3 w-3" /> AI Spotted
              </p>
              <p className="truncate text-sm font-extrabold text-white">{hypeCard.name}</p>
              <p className="truncate text-[11px] text-white/70">
                {hypeCard.category}
                {hypeCard.set_guess ? ` · ${hypeCard.set_guess}` : ""}
              </p>
              <span className="mt-1 inline-block rounded-md bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">
                {hypeCard.rarity_vibe}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Announcement composer (host & mods) */}
      {annOpen && isStaff && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"
          onClick={() => setAnnOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-card p-4 text-foreground shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-bold">
                <Megaphone className="h-4 w-4 text-accent" /> Announcement
              </p>
              <button onClick={() => setAnnOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-2 text-[11px] text-muted-foreground">
              Pinned highlight in the live chat — visible to everyone.
            </p>
            <textarea
              value={annText}
              onChange={(e) => setAnnText(e.target.value)}
              maxLength={200}
              rows={3}
              placeholder='e.g. "Combined shipping at $10 max — keep stacking!"'
              className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none"
            />
            <p className="mb-2 text-right text-[10px] text-muted-foreground">
              {annText.length}/200
            </p>
            <button
              onClick={postAnnouncement}
              disabled={!annText.trim()}
              className="w-full rounded-lg bg-accent py-2.5 text-sm font-bold text-accent-foreground disabled:opacity-50"
            >
              Post Announcement
            </button>
          </div>
        </div>
      )}

      {/* Mod panel — host adds/removes mods, host+mods chat privately */}
      {showModPanel && isStaff && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"
          onClick={() => setShowModPanel(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-sm flex-col rounded-2xl bg-card text-foreground shadow-2xl"
            style={{ maxHeight: "85vh" }}
          >
            <div className="flex items-center justify-between border-b border-border p-3">
              <p className="flex items-center gap-1.5 text-sm font-bold">
                <Shield className="h-4 w-4 text-primary" /> Mod Channel
              </p>
              <button onClick={() => setShowModPanel(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Host-only: add mods */}
            {isSeller && (
              <div className="border-b border-border p-3">
                <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">
                  Add a moderator
                </p>
                <input
                  value={modSearchQ}
                  onChange={(e) => {
                    setModSearchQ(e.target.value);
                    searchUsers(e.target.value, setModSearchRes);
                  }}
                  placeholder="Search by username"
                  className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none"
                />
                {modSearchRes.length > 0 && (
                  <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-border">
                    {modSearchRes.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => addModBySearch(u)}
                        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-muted"
                      >
                        <span>@{u.username}</span>
                        <ShieldPlus className="h-3.5 w-3.5 text-primary" />
                      </button>
                    ))}
                  </div>
                )}
                {mods.length > 0 && (
                  <div className="mt-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Active mods
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {mods.map((m) => (
                        <span
                          key={m.id}
                          className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]"
                        >
                          @{m.mod_username}
                          <button
                            onClick={() => removeMod(m.id)}
                            className="opacity-60 hover:opacity-100"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Private mod chat */}
            <div className="flex-1 overflow-y-auto p-3">
              <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                Private — host & mods only
              </p>
              {modChat.length === 0 && (
                <p className="text-center text-[11px] text-muted-foreground">
                  No messages yet. Coordinate with your mods here.
                </p>
              )}
              <div className="space-y-1.5">
                {modChat.map((m) => (
                  <div key={m.id} className="rounded-lg bg-muted px-2.5 py-1.5 text-xs">
                    <span className="mr-1 font-semibold text-primary">@{m.username}:</span>
                    {m.content}
                  </div>
                ))}
              </div>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendModMsg();
              }}
              className="flex gap-1.5 border-t border-border p-2"
            >
              <input
                value={modInput}
                onChange={(e) => setModInput(e.target.value)}
                placeholder="Message your mod team..."
                className="flex-1 rounded-full bg-input px-3 py-1.5 text-xs outline-none"
              />
              <button type="submit" className="rounded-full bg-primary p-2 text-primary-foreground">
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
            <button
              onClick={() => {
                setShowModPanel(false);
                setAnnOpen(true);
              }}
              className="m-2 mt-0 rounded-lg bg-accent py-2 text-xs font-bold text-accent-foreground"
            >
              <Megaphone className="mr-1 inline h-3.5 w-3.5" /> Post public announcement
            </button>
          </div>
        </div>
      )}

      {/* Collab panel — host invites/manages co-hosts; viewers can request to join */}
      {showCollabPanel && stream && (
        <CollabPanel
          streamId={id}
          hostId={stream.seller_id}
          hostUsername={sellerUsername || profile?.username || "host"}
          currentUserId={user?.id || null}
          isHost={isSeller}
          allowRequests={!!stream.allow_collab_requests}
          maxParticipants={stream.max_collab_count || 4}
          onClose={() => setShowCollabPanel(false)}
        />
      )}

      {/* Live viewer list modal — clickable count opens this; host can invite to collab */}
      {showViewerList && stream && (
        <ViewerListModal
          streamId={id}
          hostId={stream.seller_id}
          hostUsername={sellerUsername || profile?.username || "host"}
          currentUserId={user?.id || null}
          isHost={isSeller}
          modIds={new Set(mods.map((m: any) => m.mod_user_id))}
          onClose={() => setShowViewerList(false)}
        />
      )}

      {/* Chat-action menu (mod taps a username) */}
      {chatActionMenu && isStaff && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"
          onClick={() => setChatActionMenu(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-card p-4 text-foreground shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold">Mod actions · @{chatActionMenu.username}</p>
              <button onClick={() => setChatActionMenu(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => chatAction(chatActionMenu, "mute")}
                className="flex items-center justify-center gap-1 rounded-lg bg-amber-500/20 py-2 text-xs font-bold text-amber-300"
              >
                <VolumeX className="h-3.5 w-3.5" /> Mute
              </button>
              <button
                onClick={() => chatAction(chatActionMenu, "timeout", 5)}
                className="flex items-center justify-center gap-1 rounded-lg bg-amber-600/20 py-2 text-xs font-bold text-amber-200"
              >
                <ClockIcon className="h-3.5 w-3.5" /> 5m timeout
              </button>
              <button
                onClick={() => chatAction(chatActionMenu, "ban")}
                className="flex items-center justify-center gap-1 rounded-lg bg-red-500/20 py-2 text-xs font-bold text-red-300"
              >
                <Ban className="h-3.5 w-3.5" /> Ban
              </button>
              <button
                onClick={() => chatAction(chatActionMenu, "unmute")}
                className="flex items-center justify-center gap-1 rounded-lg bg-primary/20 py-2 text-xs font-bold text-primary"
              >
                ✅ Lift mute/ban
              </button>
            </div>
            <p className="mt-3 text-[10px] text-muted-foreground">
              Mute hides their chat & blocks bidding. Timeout expires automatically.
            </p>
          </div>
        </div>
      )}

      {/* 🆕 Mystery Break panel — character editor + live claims + spin reveal */}
      {showBreakPanel && isSeller && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"
          onClick={() => setShowBreakPanel(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-card text-foreground shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border/50 p-4 pb-3">
              <p className="flex items-center gap-1.5 text-sm font-bold">
                <Dice5 className="h-4 w-4 text-primary" /> Mystery Break
              </p>
              <button onClick={() => setShowBreakPanel(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-4">
              <p className="mb-3 text-[11px] text-muted-foreground">
                Name each slot (Charizard, Team A, Box #3 — anything). Buyers tap to claim. When all
                are claimed, hit <b>Spin reveal</b> and a fun wheel pops out for everyone.
              </p>

              <div className="mb-3 grid grid-cols-2 gap-2">
                <label className="text-[11px] text-muted-foreground">
                  Slot count
                  <input
                    type="number"
                    min="2"
                    max="50"
                    value={breakSlotCount}
                    onChange={(e) => {
                      const v = e.target.value;
                      setBreakSlotCount(v);
                      const n = Math.max(2, Math.min(50, Number(v) || 0));
                      setBreakCharacters((arr) => {
                        if (n <= arr.length) return arr.slice(0, n);
                        return [
                          ...arr,
                          ...Array.from(
                            { length: n - arr.length },
                            (_, i) => `Character ${arr.length + i + 1}`,
                          ),
                        ];
                      });
                    }}
                    disabled={stream.break_mode === "open"}
                    className="mt-1 w-full rounded-lg bg-input px-3 py-2 text-sm font-bold outline-none disabled:opacity-50"
                  />
                </label>
                <label className="text-[11px] text-muted-foreground">
                  Price/slot $
                  <input
                    type="number"
                    min="1"
                    value={breakPrice}
                    onChange={(e) => setBreakPrice(e.target.value)}
                    onBlur={() =>
                      supabase
                        .from("live_streams")
                        .update({ break_slot_price: Math.max(1, Number(breakPrice) || 10) })
                        .eq("id", id)
                    }
                    className="mt-1 w-full rounded-lg bg-input px-3 py-2 text-sm font-bold outline-none"
                  />
                </label>
              </div>

              {/* Character roster — one input per slot */}
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold text-muted-foreground">
                  Slot names ({Math.max(2, Math.min(50, Number(breakSlotCount) || 0))})
                </p>
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
                {Array.from(
                  { length: Math.max(2, Math.min(50, Number(breakSlotCount) || 0)) },
                  (_, i) => {
                    const taken = breakSlots.find((s) => s.slot_number === i + 1);
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-6 shrink-0 text-center text-[10px] font-bold text-muted-foreground">
                          {i + 1}
                        </span>
                        <input
                          value={breakCharacters[i] ?? ""}
                          onChange={(e) =>
                            setBreakCharacters((arr) => {
                              const next = [...arr];
                              next[i] = e.target.value;
                              return next;
                            })
                          }
                          onBlur={() => saveBreakCharacters(breakCharacters)}
                          placeholder={`Character ${i + 1}`}
                          className="flex-1 rounded-md bg-input px-2 py-1.5 text-xs outline-none"
                        />
                        {taken ? (
                          <span className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
                            @{taken.buyer_username}
                          </span>
                        ) : (
                          <span className="w-14 shrink-0 text-right text-[9px] text-muted-foreground">
                            open
                          </span>
                        )}
                      </div>
                    );
                  },
                )}
              </div>

              <label className="mb-3 block text-[11px] text-muted-foreground">
                Default prefix (used when a slot name is left blank)
                <input
                  value={breakPrefix}
                  onChange={(e) => setBreakPrefix(e.target.value.slice(0, 12))}
                  onBlur={() =>
                    supabase
                      .from("live_streams")
                      .update({ break_slot_prefix: breakPrefix.trim() || null })
                      .eq("id", id)
                  }
                  placeholder='e.g. "Box "'
                  className="mt-1 w-full rounded-lg bg-input px-3 py-2 text-xs outline-none"
                />
              </label>

              {stream.break_mode === "open" ? (
                <div className="space-y-2">
                  <div className="rounded-lg bg-muted/40 p-2 text-[11px]">
                    <p className="font-semibold">
                      Claimed: {breakSlots.length}/{stream.break_slot_count}
                    </p>
                  </div>
                  <button
                    onClick={spinBreakWheel}
                    disabled={stream.break_wheel_spinning}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-400 via-pink-500 to-purple-500 py-2.5 text-sm font-extrabold text-white shadow-lg disabled:opacity-50"
                  >
                    <RotateCw className="h-4 w-4" />{" "}
                    {stream.break_wheel_spinning
                      ? "Spinning…"
                      : breakSlots.length === 0
                        ? "🎡 Test spin (no claims yet)"
                        : "🎡 Spin reveal wheel"}
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
                <button
                  onClick={startBreakMode}
                  className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground"
                >
                  <Users className="mr-1 inline h-3.5 w-3.5" /> Open break for claims
                </button>
              )}

              {/* 🆕 Host toggle: force break panel over viewer screens */}
              <label className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/20 p-2.5 text-xs">
                <span className="flex flex-col">
                  <span className="font-bold">Pin break grid over viewer live screen</span>
                  <span className="text-[10px] text-muted-foreground">
                    Off = viewers see only "View Break" and can collapse it anytime
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={!!stream.break_force_visible}
                  onChange={async (e) => {
                    const checked = e.target.checked;
                    setStream((prev: any) =>
                      prev ? { ...prev, break_force_visible: checked } : prev,
                    );
                    await supabase
                      .from("live_streams")
                      .update({ break_force_visible: checked })
                      .eq("id", id);
                  }}
                  className="h-4 w-4"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* 🆕 Viewer Mystery Break drawer — compact sheet by default; fullscreen only when host pins it */}
      {showViewerBreak &&
        !isSeller &&
        stream &&
        stream.break_mode === "open" &&
        stream.break_slot_count && (
          <div
            className={`fixed inset-x-0 bottom-0 z-50 flex justify-center ${stream.break_force_visible ? "top-0 items-center bg-black/55 p-3 backdrop-blur-sm" : "pointer-events-none p-2 pb-[5.25rem]"}`}
            onClick={() => !stream.break_force_visible && setShowViewerBreak(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className={`pointer-events-auto flex w-full max-w-sm flex-col animate-in slide-in-from-bottom rounded-2xl bg-card p-3 text-foreground shadow-2xl ring-1 ring-border/60 ${stream.break_force_visible ? "max-h-[85vh]" : "max-h-[70vh]"}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm font-bold">
                  <Dice5 className="h-4 w-4 text-primary" /> Mystery Break
                  <span className="rounded-full bg-pink-500/20 px-2 py-0.5 text-[10px] font-bold text-pink-300">
                    {breakSlots.length}/{stream.break_slot_count}
                  </span>
                </p>
                {!stream.break_force_visible && (
                  <button
                    onClick={() => setShowViewerBreak(false)}
                    className="rounded-full p-1 hover:bg-muted"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="mb-3 text-[11px] text-muted-foreground">
                {stream.break_force_visible
                  ? "Host pinned this break grid"
                  : "Tap a slot to claim · choices save instantly"}
              </p>
              <div
                className="grid min-h-0 flex-1 grid-cols-3 gap-1.5 overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch] [scroll-behavior:smooth] [touch-action:pan-y]"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                {Array.from({ length: stream.break_slot_count }, (_, i) => i + 1).map((n) => {
                  const taken = breakSlots.find((s) => s.slot_number === n);
                  const mine = taken && taken.buyer_id === user?.id;
                  const selected = selectedBreakSlots.includes(n);
                  const charLabel =
                    (Array.isArray(stream.break_characters) && stream.break_characters[n - 1]) ||
                    `${stream.break_slot_prefix || "#"}${n}`;
                  return (
                    <button
                      key={n}
                      onClick={() => !taken && toggleBreakSlotSelection(n)}
                      disabled={!!taken}
                      className={`flex aspect-square min-h-0 flex-col items-center justify-center gap-0.5 rounded-md p-1.5 text-[10px] font-bold leading-tight ${
                        mine
                          ? "bg-emerald-500 text-white ring-2 ring-emerald-200"
                          : taken
                            ? "bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/40 cursor-not-allowed"
                            : selected
                              ? "bg-primary text-primary-foreground ring-2 ring-primary/40"
                              : "bg-gradient-to-br from-pink-500 to-purple-500 text-white active:scale-95"
                      }`}
                    >
                      <span className="text-sm font-extrabold leading-none">#{n}</span>
                      <span className="line-clamp-2 max-w-full px-0.5 text-[9px] leading-tight opacity-95">
                        {charLabel}
                      </span>
                      {taken ? (
                        <span className="line-clamp-1 max-w-full truncate rounded bg-black/30 px-1 text-[9px] font-extrabold">
                          {mine ? "✓ YOURS" : `@${taken.buyer_username}`}
                        </span>
                      ) : (
                        <span className="text-[8px] uppercase tracking-wide opacity-70">open</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={claimSelectedBreakSlots}
                disabled={selectedBreakSlots.length === 0 || claimingBreakSlots}
                className="mt-3 w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
              >
                {claimingBreakSlots
                  ? "Charging…"
                  : selectedBreakSlots.length > 0
                    ? `Claim mine · $${(Number((stream as any).break_slot_price || breakPrice) * selectedBreakSlots.length).toFixed(2)}${selectionCountdown ? ` · ${selectionCountdown}s` : ""}`
                    : "Choose characters"}
              </button>
              {!stream.break_force_visible && (
                <button
                  onClick={() => setShowViewerBreak(false)}
                  className="mt-2 w-full rounded-lg bg-muted py-2 text-xs font-bold text-foreground"
                >
                  Done
                </button>
              )}
            </div>
          </div>
        )}

      {drawAnim && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur">
          <div className="animate-in zoom-in text-center">
            <Dice5 className="mx-auto h-16 w-16 animate-spin text-yellow-300" />
            <p className="mt-3 text-2xl font-extrabold tracking-wider text-white">
              SHUFFLING TEAMS…
            </p>
            <p className="mt-1 text-sm text-white/70">Random fair draw in progress</p>
          </div>
        </div>
      )}

      {/* 🆕 BREAK REVEAL WHEEL — fullscreen, fun, visible to ALL viewers */}
      {(stream.break_wheel_spinning || stream.break_wheel_last_winner_username) &&
        (() => {
          const claimed = [...breakSlots]
            .filter((s) => s.slot_number != null)
            .sort((a, b) => a.slot_number - b.slot_number);
          const palette = [
            "#ec4899",
            "#7c3aed",
            "#f59e0b",
            "#10b981",
            "#3b82f6",
            "#ef4444",
            "#06b6d4",
            "#a855f7",
            "#14b8a6",
            "#f97316",
          ];
          // 🆕 Fall back to configured characters when nobody has claimed yet (lets host preview the wheel).
          const chars: string[] = Array.isArray(stream.break_characters)
            ? stream.break_characters
            : [];
          const total = Number(stream.break_slot_count) || chars.length || 0;
          const wheelSlots: WheelSlot[] =
            claimed.length > 0
              ? claimed.map((s, i) => ({
                  id: String(s.slot_number),
                  label: `${s.character_label || `${stream.break_slot_prefix || "#"}${s.slot_number}`} · @${s.buyer_username}`,
                  weight: 1,
                  color: palette[i % palette.length],
                  is_active: true,
                }))
              : Array.from({ length: total }, (_, i) => ({
                  id: String(i + 1),
                  label: chars[i] || `${stream.break_slot_prefix || "#"}${i + 1}`,
                  weight: 1,
                  color: palette[i % palette.length],
                  is_active: true,
                }));
          if (wheelSlots.length === 0) return null;
          const targetId =
            stream.break_wheel_target_slot != null ? String(stream.break_wheel_target_slot) : null;
          const startedAt = stream.break_wheel_started_at
            ? new Date(stream.break_wheel_started_at).getTime()
            : null;
          const finishAt = stream.break_wheel_ends_at
            ? new Date(stream.break_wheel_ends_at).getTime()
            : null;
          const winnerLabel = stream.break_wheel_last_winner_label;
          const winnerUser = stream.break_wheel_last_winner_username;
          return (
            <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-gradient-to-br from-purple-900/95 via-black/90 to-pink-900/95 p-4 backdrop-blur-sm animate-in fade-in">
              {isSeller && !stream.break_wheel_spinning && (
                <button
                  onClick={async () => {
                    await supabase
                      .from("live_streams")
                      .update({
                        break_wheel_last_winner_username: null,
                        break_wheel_last_winner_label: null,
                        break_wheel_target_slot: null,
                      })
                      .eq("id", id);
                  }}
                  className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
              <p className="mb-1 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-amber-300">
                <Dice5 className="h-3.5 w-3.5" /> Mystery Break Reveal
              </p>
              <p className="mb-4 text-[11px] text-white/70">
                {claimed.length} contenders · the wheel decides
              </p>
              <SpinWheel
                slots={wheelSlots}
                spinning={!!stream.break_wheel_spinning}
                targetSlotId={targetId}
                startedAt={startedAt}
                finishAt={finishAt}
                size={Math.min(
                  360,
                  typeof window !== "undefined"
                    ? Math.min(window.innerWidth, window.innerHeight) - 180
                    : 320,
                )}
              />
              {!stream.break_wheel_spinning && winnerLabel && winnerUser && (
                <div className="mt-6 w-full max-w-sm rounded-2xl bg-gradient-to-r from-amber-400 via-pink-500 to-purple-500 p-4 text-center shadow-2xl ring-2 ring-white/30 animate-in zoom-in">
                  <Trophy className="mx-auto h-8 w-8 text-white" />
                  <p className="mt-1 text-lg font-extrabold tracking-tight text-white">
                    {winnerLabel}
                  </p>
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
          >
            <X className="h-5 w-5" />
          </button>
          <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-300">
            <RotateCw className="h-3.5 w-3.5" /> {wheel.title || "Spin to Win"}
          </p>
          <p className="mb-4 text-[11px] text-white/60">
            Spin time:{" "}
            {String(wheel.spin_speed).match(/^\d+$/) ? `${wheel.spin_speed}s` : wheel.spin_speed} ·{" "}
            {wheelSlots.filter((s) => s.is_active).length} prizes
          </p>
          <SpinWheel
            slots={wheelSlots}
            spinning={!!wheel.is_spinning}
            targetSlotId={wheel.spin_target_slot_id || null}
            startedAt={wheel.spin_started_at ? new Date(wheel.spin_started_at).getTime() : null}
            finishAt={wheel.spin_ends_at ? new Date(wheel.spin_ends_at).getTime() : null}
            size={Math.min(
              360,
              typeof window !== "undefined"
                ? Math.min(window.innerWidth, window.innerHeight) - 140
                : 320,
            )}
          />

          <div className="mt-6 flex w-full max-w-sm flex-col gap-2">
            {/* Host post-spin decision: Remove or Keep the landed slot */}
            {isSeller && wheel.pending_decision_slot_id && !wheel.is_spinning && (
              <div className="rounded-xl bg-white/10 p-3">
                <p className="mb-2 text-center text-xs text-white/80">
                  Landed on{" "}
                  <span className="font-bold text-amber-300">
                    {wheel.pending_decision_slot_label}
                  </span>{" "}
                  — keep it on the wheel or remove it?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => decideAfterSpin("remove")}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-500 py-2.5 text-xs font-extrabold text-white"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                  <button
                    onClick={() => decideAfterSpin("keep")}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 py-2.5 text-xs font-extrabold text-white"
                  >
                    <Check className="h-3.5 w-3.5" /> Keep
                  </button>
                </div>
              </div>
            )}
            {!isSeller && wheel.pending_decision_slot_id && !wheel.is_spinning && (
              <div className="rounded-xl bg-white/5 p-3 text-center text-xs text-white/70">
                Waiting for host to decide on{" "}
                <span className="font-bold text-amber-300">
                  {wheel.pending_decision_slot_label}
                </span>
                …
              </div>
            )}

            {(isSeller || wheel.viewer_can_spin) &&
              !wheel.is_spinning &&
              !wheel.pending_decision_slot_id && (
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
            {!isSeller &&
              !wheel.viewer_can_spin &&
              !wheel.is_spinning &&
              !wheel.pending_decision_slot_id && (
                <p className="text-center text-xs text-white/50">
                  Only the host can spin right now
                </p>
              )}
            {isSeller &&
              wheel.is_locked &&
              !wheel.is_spinning &&
              !wheel.pending_decision_slot_id && (
                <button
                  onClick={resetWheel}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-white/10 py-2 text-xs font-bold text-white/80"
                >
                  <Unlock className="h-3.5 w-3.5" /> Reset wheel (unlock editing)
                </button>
              )}
            {wheel.last_winner_slot_label &&
              !wheel.is_spinning &&
              !wheel.pending_decision_slot_id && (
                <div className="rounded-xl bg-white/5 p-3 text-center text-xs text-white/80">
                  Last spin:{" "}
                  <span className="font-bold text-amber-300">{wheel.last_winner_slot_label}</span> →{" "}
                  <span className="font-bold text-white">@{wheel.last_winner_username}</span>
                </div>
              )}
          </div>
        </div>
      )}

      {/* 🆕 Winner popup — appears for everyone when a spin lands */}
      {wheelWinnerPopup && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setWheelWinnerPopup(null)}
        >
          <div className="animate-in zoom-in-95 fade-in rounded-3xl bg-gradient-to-br from-amber-400 via-rose-500 to-purple-600 p-1 shadow-2xl">
            <div className="rounded-3xl bg-black/85 px-8 py-6 text-center">
              <Trophy className="mx-auto h-12 w-12 text-amber-300" />
              <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-amber-300">
                Wheel Result
              </p>
              <p className="mt-2 text-2xl font-extrabold text-white">{wheelWinnerPopup.slot}</p>
              <p className="mt-4 text-xs text-white/70">is now owned by</p>
              <p className="mt-1 text-xl font-extrabold text-amber-300">
                @{wheelWinnerPopup.winner} 🎉
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 🆕 Wheel editor — host only */}
      {showWheelEditor && isSeller && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"
          onClick={() => setShowWheelEditor(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-card p-4 text-foreground shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-bold">
                <RotateCw className="h-4 w-4 text-primary" /> Spin Wheel
              </p>
              <button onClick={() => setShowWheelEditor(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {wheel?.is_spinning && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-yellow-500/20 p-2 text-[11px] text-yellow-300">
                <Lock className="h-3.5 w-3.5" /> Locked while spinning
              </div>
            )}
            {!wheel?.is_spinning && wheel?.is_locked && (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-amber-500/15 p-2 text-[11px] text-amber-300">
                <span className="flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" /> Wheel locked — reset to edit slots
                </span>
                <button
                  onClick={resetWheel}
                  className="flex items-center gap-1 rounded-md bg-amber-500/30 px-2 py-1 text-[10px] font-bold text-amber-100"
                >
                  <Unlock className="h-3 w-3" /> Reset
                </button>
              </div>
            )}

            {/* Settings */}
            <div className="mb-3 space-y-2 rounded-xl bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-muted-foreground">Spin time</p>
                <div className="flex gap-1">
                  {(["5", "10", "15"] as const).map((s) => (
                    <button
                      key={s}
                      disabled={!!wheel?.is_spinning}
                      onClick={() => updateWheelSpeed(s)}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${String(wheel?.spin_speed) === s ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"} disabled:opacity-50`}
                    >
                      {s}s
                    </button>
                  ))}
                </div>
              </div>
              <button
                disabled={!wheel}
                onClick={toggleViewerSpin}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] font-bold ${wheel?.viewer_can_spin ? "bg-primary/20 text-primary" : "bg-background text-muted-foreground"}`}
              >
                <span>Allow viewers to spin</span>
                <span>{wheel?.viewer_can_spin ? "ON" : "OFF"}</span>
              </button>
              <p className="text-[10px] text-muted-foreground">
                After each spin you'll choose <b>Remove</b> or <b>Keep</b> the landed prize.
              </p>
            </div>

            {/* Add slot */}
            <div className="mb-3 flex gap-2">
              <input
                value={draftSlotLabel}
                onChange={(e) => setDraftSlotLabel(e.target.value)}
                placeholder="Prize / item"
                maxLength={40}
                disabled={!!wheel?.is_locked || !!wheel?.is_spinning}
                className="flex-1 rounded-lg bg-muted px-3 py-2 text-sm outline-none disabled:opacity-50"
              />
              <input
                value={draftSlotWeight}
                onChange={(e) => setDraftSlotWeight(e.target.value)}
                type="number"
                min="1"
                max="100"
                disabled={!!wheel?.is_locked || !!wheel?.is_spinning}
                className="w-16 rounded-lg bg-muted px-2 py-2 text-center text-sm outline-none disabled:opacity-50"
              />
              <button
                disabled={!!wheel?.is_spinning || !!wheel?.is_locked}
                onClick={addWheelSlot}
                className="flex items-center gap-1 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">
                Higher weight = better odds. Min 2 slots to spin.
              </p>
              <button
                onClick={shuffleWheelSlots}
                disabled={
                  !!wheel?.is_spinning || !!wheel?.pending_decision_slot_id || wheelSlots.length < 2
                }
                className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[10px] font-bold text-foreground disabled:opacity-40"
              >
                <Shuffle className="h-3 w-3" /> Shuffle
              </button>
            </div>

            {/* Slot list */}
            <div className="mb-3 max-h-44 space-y-1 overflow-y-auto">
              {wheelSlots.length === 0 && (
                <p className="text-center text-xs text-muted-foreground">No slots yet</p>
              )}
              {wheelSlots.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-lg bg-muted/40 p-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
                  <p className="min-w-0 flex-1 truncate text-xs font-semibold">{s.label}</p>
                  <span className="rounded bg-background px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                    ×{s.weight}
                  </span>
                  <button
                    disabled={!!wheel?.is_spinning || !!wheel?.is_locked}
                    onClick={() => removeWheelSlot(s.id)}
                    className="text-destructive disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowWheelEditor(false);
                  setShowWheelOverlay(true);
                }}
                disabled={!wheel || wheelSlots.filter((s) => s.is_active).length < 2}
                className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 py-2.5 text-sm font-extrabold text-white disabled:opacity-50"
              >
                Open & Spin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Host/Mod payment activity log — slide-in panel + floating toggle */}
      {isStaff && !hostFocus && stream.mode !== "show_off" && (
        <>
          <button
            onClick={() => setShowPaymentLog(true)}
            className="fixed left-3 top-32 z-40 flex items-center gap-1.5 rounded-full bg-card/90 px-3 py-1.5 text-[11px] font-bold text-foreground shadow-2xl ring-1 ring-white/20 backdrop-blur hover:bg-card"
            aria-label="Open payment activity log"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Payments
          </button>
          <HostPaymentLog
            streamId={id}
            open={showPaymentLog}
            onClose={() => setShowPaymentLog(false)}
          />

          {/* 🆕 Quick Mod Chat — one-tap private DM with mods/host */}
          {!showQuickMod && (
            <button
              onClick={() => setShowQuickMod(true)}
              className="fixed left-3 top-44 z-40 flex items-center gap-1.5 rounded-full bg-primary/90 px-3 py-1.5 text-[11px] font-bold text-primary-foreground shadow-2xl ring-1 ring-white/20 backdrop-blur hover:bg-primary"
              aria-label="Open quick mod chat"
            >
              <Shield className="h-3.5 w-3.5" /> Mods
              {modChat.length > 0 && (
                <span className="rounded-full bg-live px-1.5 text-[9px] text-live-foreground">
                  {modChat.length}
                </span>
              )}
            </button>
          )}
          {showQuickMod && (
            <div className="fixed left-3 top-44 z-40 w-64 max-w-[80vw] overflow-hidden rounded-2xl bg-card/95 text-foreground shadow-2xl ring-1 ring-white/15 backdrop-blur">
              <div className="flex items-center justify-between bg-primary/20 px-3 py-1.5">
                <p className="flex items-center gap-1 text-[11px] font-bold">
                  <Shield className="h-3 w-3" /> Mod chat
                </p>
                <button
                  onClick={() => setShowQuickMod(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="max-h-40 space-y-1 overflow-y-auto px-2 py-2">
                {modChat.length === 0 && (
                  <p className="text-center text-[10px] text-muted-foreground">
                    No mod messages yet
                  </p>
                )}
                {modChat.slice(-30).map((m) => (
                  <div key={m.id} className="text-[11px] leading-snug">
                    <span className="font-bold text-primary">@{m.username}:</span>{" "}
                    <span className="break-words">{m.content}</span>
                  </div>
                ))}
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const t = quickModInput.trim();
                  if (!t || !user || !profile) return;
                  await supabase.from("stream_mod_messages").insert({
                    stream_id: id,
                    user_id: user.id,
                    username: profile.username,
                    content: t,
                  });
                  setQuickModInput("");
                }}
                className="flex gap-1 border-t border-white/10 p-1.5"
              >
                <input
                  value={quickModInput}
                  onChange={(e) => setQuickModInput(e.target.value)}
                  placeholder="Message mods…"
                  maxLength={200}
                  className="flex-1 rounded-md bg-muted px-2 py-1 text-[11px] outline-none"
                />
                <button
                  type="submit"
                  disabled={!quickModInput.trim()}
                  className="rounded-md bg-primary px-2 text-[11px] font-bold text-primary-foreground disabled:opacity-50"
                >
                  <Send className="h-3 w-3" />
                </button>
              </form>
            </div>
          )}

          {/* 🆕 Viewer Preview PIP — host sees what viewers see (HLS only) */}
          {isSeller && stream?.cf_playback_hls && (
            <div
              className="fixed z-30 w-40 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl bg-card/95 text-foreground shadow-2xl ring-1 ring-white/20 backdrop-blur sm:w-48 md:w-56"
              style={{ top: previewPos.y, right: previewPos.x }}
            >
              <div
                className="flex flex-row cursor-move items-center justify-between bg-black/60 px-2 py-1 select-none touch-none"
                onPointerDown={(e) => {
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  const startX = e.clientX, startY = e.clientY;
                  const start = { ...previewPos };
                  const onMove = (ev: PointerEvent) => {
                    const dx = startX - ev.clientX;
                    const dy = ev.clientY - startY;
                    setPreviewPos({
                      x: Math.max(4, start.x + dx),
                      y: Math.max(4, start.y + dy),
                    });
                  };
                  const onUp = () => {
                    window.removeEventListener("pointermove", onMove);
                    window.removeEventListener("pointerup", onUp);
                  };
                  window.addEventListener("pointermove", onMove);
                  window.addEventListener("pointerup", onUp);
                }}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/80">
                  Viewer preview
                </p>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setShowViewerPreview((v) => !v)}
                  className="rounded-md p-1 text-white/70 hover:text-white"
                  aria-label="Toggle viewer preview"
                >
                  {showViewerPreview ? <X className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                </button>
              </div>
              {showViewerPreview && (
                <div className="space-y-2 p-2">
                  {obsTinyFeed && (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/15 px-2 py-1.5 text-[11px] font-semibold text-destructive">
                      Your stream does not fill the screen properly.
                    </div>
                  )}
                  <HlsPlayer
                    src={stream.cf_playback_hls}
                    className={`${obsPreviewAspectClass} w-full rounded-lg bg-background`}
                    style={obsVideoStyle}
                    onVideoMetrics={setObsMetrics}
                    autoPlay
                    muted
                    controls
                  />
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => setObsDisplayMode("auto")}
                      className="rounded-md bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground"
                    >
                      Auto Fix
                    </button>
                    <button
                      onClick={() => setObsDisplayMode("fit")}
                      className="rounded-md bg-muted px-2 py-1 text-[10px] font-bold text-foreground"
                    >
                      Fit to Screen
                    </button>
                    <button
                      onClick={() => setObsDisplayMode("vertical")}
                      className="rounded-md bg-muted px-2 py-1 text-[10px] font-bold text-foreground"
                    >
                      Vertical Mode
                    </button>
                    <button
                      onClick={() => setObsDisplayMode("horizontal")}
                      className="rounded-md bg-muted px-2 py-1 text-[10px] font-bold text-foreground"
                    >
                      Horizontal Mode
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Giveaway controls are host-only; viewers should never see an appreciation/gift button over bidding. */}
      {isSeller && (
        <LiveGiveaway
          streamId={id}
          isSeller={isSeller}
          userId={user?.id || null}
          username={profile?.username || null}
          isFollower={isFollowingHost}
          isBuyer={isPastBuyer}
          sellerId={stream?.seller_id || null}
          onFollowed={() => setIsFollowingHost(true)}
          open={showGiveaway}
          onClose={() => {
            setShowGiveaway(false);
            setGiveawayComposer(false);
          }}
          hostOpenComposer={giveawayComposer}
          setHostOpenComposer={setGiveawayComposer}
        />
      )}

      {tipOpen && (
        <TipCheckout
          streamId={id}
          streamerName={sellerUsername}
          onClose={() => setTipOpen(false)}
        />
      )}

      {tipOverlay && (
        <div className="pointer-events-none fixed left-1/2 top-24 z-[150] -translate-x-1/2 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-3 rounded-2xl border border-pink-400/50 bg-gradient-to-r from-pink-500 to-rose-600 px-5 py-3 shadow-2xl shadow-pink-500/40">
            <Gift className="h-6 w-6 text-white" />
            <div className="text-white">
              <div className="text-xs opacity-90">@{tipOverlay.username} tipped</div>
              <div className="text-xl font-black">${tipOverlay.amount.toFixed(2)}</div>
              {tipOverlay.message && (
                <div className="mt-0.5 max-w-[260px] text-xs italic opacity-95">
                  "{tipOverlay.message}"
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* K.O. viewer overlay */}
      <KOViewerOverlay
        active={!!stream?.ko_active}
        hostUsername={sellerUsername || "host"}
        hostAvatar={(stream as any)?.host_avatar_url || null}
        message={stream?.ko_message || null}
        destinations={koEnrichedDests}
        isHost={isSeller}
      />

      {/* K.O. host modal */}
      {isSeller && stream && (
        <KOModal
          open={koOpen}
          onClose={() => setKoOpen(false)}
          streamId={stream.id}
          hostSellerId={stream.seller_id}
          acceptsRequests={!!stream.ko_accepts_requests}
          destinations={Array.isArray(stream.ko_destinations) ? stream.ko_destinations : []}
          onConfirm={confirmKO}
        />
      )}
    </div>
  );
}
