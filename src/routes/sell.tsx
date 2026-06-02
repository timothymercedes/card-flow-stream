import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
const CardScanner = lazy(() =>
  import("@/components/CardScanner").then((m) => ({ default: m.CardScanner })),
);
import { ListingPhotoCapture } from "@/components/ListingPhotoCapture";
import { ShippingEstimator } from "@/components/ShippingEstimator";
import { LISTING_CATEGORIES } from "@/lib/listingCategories";
import { validateListingImage } from "@/lib/listingDisplay";
import { toast } from "sonner";
import {
  Camera,
  Radio,
  Smartphone,
  Monitor,
  Check,
  Loader2,
  RefreshCw,
  ChevronLeft,
  Zap,
  Timer,
  Disc3,
  Package,
  Sparkles,
  Library,
} from "lucide-react";

type VaultPick = {
  id: string;
  name: string;
  image_url: string | null;
  estimated_value: number | null;
  tcg_set: string | null;
  tcg_number: string | null;
  // Per-card overrides set in the Pre-B list (step 4)
  starting_bid?: string;
  buy_now_price?: string;
  voice_trigger?: string;
};
import { notifyGoingLive } from "@/lib/push.functions";
import { TCG_TAGS, type TcgTag } from "@/lib/streamTaxonomy";
import { useTour } from "@/components/MascotGuide";
import { SellerAgreementGate } from "@/components/SellerAgreementGate";
import { SellerVerificationGate } from "@/components/SellerVerificationGate";
import { useTutorialMode } from "@/lib/tutorialMode";
import { WatchTutorial } from "@/components/WatchTutorial";
import {
  releaseStudioCameraStreams,
  stashStudioCameraStreams,
  type StudioCameraHandoff,
} from "@/lib/studioCameraHandoff";

export const Route = createFileRoute("/sell")({ component: Sell });

type Condition = "NM" | "LP" | "MP" | "Damaged";
type ConditionPrices = { NM?: number; LP?: number; MP?: number; Damaged?: number };

// Same condition-based pricing helper used by the Vault, so listing
// prices and vault prices stay in sync regardless of where AI ID runs.
function priceFor(cond: Condition, base: number, cp: ConditionPrices | null | undefined): number {
  if (cp && cp[cond] && Number(cp[cond])) return Number(cp[cond]);
  const mult = cond === "NM" ? 1 : cond === "LP" ? 0.85 : cond === "MP" ? 0.6 : 0.25;
  return Math.max(0.5, Math.round(base * mult * 100) / 100);
}

function Sell() {
  const { user, profile } = useAuth();
  const tutorial = useTutorialMode();
  const nav = useNavigate();
  const { triggerOnce } = useTour();
  useEffect(() => {
    triggerOnce("seller-welcome");
  }, [triggerOnce]);
  const [tab, setTab] = useState<"live" | "listing">("live");
  const [sellerStatus, setSellerStatus] = useState<string | null>(null);
  const [stripeReady, setStripeReady] = useState<boolean | null>(null);
  const [shopName, setShopName] = useState<string | null | undefined>(undefined);

  // Live form
  const [streamTitle, setStreamTitle] = useState("");
  const [streamDesc, setStreamDesc] = useState("");
  const [startingBid, setStartingBid] = useState("1");
  const [timerMin, setTimerMin] = useState("10");
  const [minIncrement, setMinIncrement] = useState("1");
  const [defaultCondition, setDefaultCondition] = useState<"NM" | "LP" | "MP" | "Damaged">("NM");
  const [quickStart, setQuickStart] = useState(true);
  const [defaultTimerSec, setDefaultTimerSec] = useState("30");
  const [useObs, setUseObs] = useState(false);
  const [useCompositor, setUseCompositor] = useState(false); // browser-side canvas compositor → WHIP
  // 6-step wizard state
  const [step, setStep] = useState(1);
  type StreamMethod = "phone" | "webcam" | "obs";
  const [streamMethod, setStreamMethod] = useState<StreamMethod>("phone");
  const [selectedCameraIds, setSelectedCameraIds] = useState<string[]>([]);
  type AuctionPreset =
    | "sudden_death"
    | "timed"
    | "wheel_spin"
    | "pull_box"
    | "mystery_pack"
    | "custom";
  const [auctionPreset, setAuctionPreset] = useState<AuctionPreset>("timed");
  // 🆕 Pre-live Mystery Break setup
  const [enableBreak, setEnableBreak] = useState(false);
  const [breakSlotCount, setBreakSlotCount] = useState("20");
  const [breakSlotPrice, setBreakSlotPrice] = useState("10");
  const [breakSlotPrefix, setBreakSlotPrefix] = useState("");
  const [streamCategory, setStreamCategory] = useState<string>("pokemon");
  const [tcgTags, setTcgTags] = useState<TcgTag[]>([]);
  const [hypeTags, setHypeTags] = useState<string[]>([]);
  const [prebidVaultPicks, setPrebidVaultPicks] = useState<VaultPick[]>([]);
  // Schedule vs go-live-now (set in step 6). Empty string = go live now.
  const [scheduledFor, setScheduledFor] = useState<string>("");
  const [recurrence, setRecurrence] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [recurrenceUntil, setRecurrenceUntil] = useState<string>("");

  // Listing form — independent toggles
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [backImageUrl, setBackImageUrl] = useState(""); // 🆕 back of card (required)
  const [tcgNumber, setTcgNumber] = useState(""); // 🆕 card number (optional)
  const [tcgSet, setTcgSet] = useState(""); // 🆕 from AI ID
  const [tcgYear, setTcgYear] = useState(""); // 🆕 from AI ID
  const [condition, setCondition] = useState<Condition>("NM"); // 🆕 required
  const [condPrices, setCondPrices] = useState<ConditionPrices | null>(null); // 🆕 from AI ID
  const [identifying, setIdentifying] = useState(false); // 🆕 AI identify in-flight
  const [scanning, setScanning] = useState(false); // 🆕 image scan modal
  const [enableBuyNow, setEnableBuyNow] = useState(true);
  const [enableAuction, setEnableAuction] = useState(false);
  const [enableOffers, setEnableOffers] = useState(false);
  const [buyNowPrice, setBuyNowPrice] = useState("");
  const [auctionStart, setAuctionStart] = useState("");
  const [auctionDays, setAuctionDays] = useState("3");
  const [shippingPrice, setShippingPrice] = useState("0");
  const [shippingPreset, setShippingPreset] = useState<"stamp" | "pwe" | "bubble" | "small_box">("bubble");
  const [weightOz, setWeightOz] = useState<string>("4");
  const [showShipAdvanced, setShowShipAdvanced] = useState(false);
  const [category, setCategory] = useState<string>("pokemon");

  // Load seller status
  useEffect(() => {
    if (tutorial) {
      setSellerStatus("approved");
      setStripeReady(true);
      setShopName("Demo Card Shop");
      return;
    }
    if (user && sellerStatus === null) {
      supabase
        .from("profiles")
        .select("seller_status, shop_name")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          setSellerStatus((data as any)?.seller_status || "none");
          setShopName((data as any)?.shop_name ?? null);
        });
    }
    if (user && stripeReady === null) {
      supabase
        .from("stripe_accounts" as any)
        .select("charges_enabled")
        .eq("seller_id", user.id)
        .maybeSingle()
        .then(({ data }) => setStripeReady(!!(data as any)?.charges_enabled));
    }
  }, [user, sellerStatus, stripeReady, tutorial]);

  // Pick up a prefill stashed by the scanner (from Vault → "List for Sale"/"Start Auction")
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("pbl_prefill_listing");
      if (!raw) return;
      sessionStorage.removeItem("pbl_prefill_listing");
      const d = JSON.parse(raw);
      if (d?.listing_type === "auction") { setEnableAuction(true); setEnableBuyNow(false); setEnableOffers(false); }
      else if (d?.listing_type === "offer") { setEnableOffers(true); setEnableBuyNow(false); setEnableAuction(false); }
      else { setEnableBuyNow(true); setEnableAuction(false); setEnableOffers(false); }
      if (d.image) setImageUrl(d.image);
      if (d.name) setTitle(d.name);
      if (d.tcg_number) setTcgNumber(d.tcg_number);
      if (d.set) setTcgSet(d.set);
      if (d.year) setTcgYear(String(d.year));
      if (d.condition_prices) setCondPrices(d.condition_prices);
      const base = Number(d.estimated_value) || Number(d.condition_prices?.NM) || 0;
      if (base) {
        if (d.listing_type === "auction") setAuctionStart(String(base));
        else if (d.listing_type !== "offer") setBuyNowPrice(String(base));
      }
      toast.success(`Filled from scan: ${d.name || "card"}`);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🆕 Re-price the listing whenever the seller changes Condition (NM/LP/MP/Damaged).
  useEffect(() => {
    if (!condPrices) return;
    const base = Number(condPrices.NM) || 0;
    if (!base) return;
    setBuyNowPrice(String(priceFor(condition, base, condPrices)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [condition, condPrices]);

  const gateSellerStatus = tutorial ? "approved" : sellerStatus;
  const gateStripeReady = tutorial ? true : stripeReady;
  const gateShopName = tutorial ? "Demo Card Shop" : shopName;

  if (!user)
    return (
      <AppShell>
        <div className="px-6 py-16 text-center">
          <h1 className="text-xl font-bold">Sell</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to sell.</p>
          <Link
            to="/auth"
            className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
          >
            Sign In
          </Link>
        </div>
      </AppShell>
    );

  if (gateSellerStatus && gateSellerStatus !== "approved")
    return (
      <AppShell>
        <div className="px-6 py-16 text-center">
          <h1 className="text-xl font-bold">Seller application required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {gateSellerStatus === "pending"
              ? "Your application is awaiting admin approval."
              : "Apply to sell from your profile (verified ID + mailing address required)."}
          </p>
          <Link
            to="/profile"
            className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
          >
            Go to Profile
          </Link>
        </div>
      </AppShell>
    );

  if (gateSellerStatus === "approved" && gateStripeReady === false)
    return (
      <AppShell>
        <div className="px-6 py-16 text-center">
          <h1 className="text-xl font-bold">Connect payouts to start selling</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You need to connect your Stripe account to receive payments before you can list or go
            live.
          </p>
          <Link
            to="/payouts"
            className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
          >
            Connect Stripe
          </Link>
        </div>
      </AppShell>
    );

  if (gateSellerStatus === "approved" && gateShopName === null)
    return (
      <AppShell>
        <div className="px-6 py-16 text-center">
          <h1 className="text-xl font-bold">Claim your shop name</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick a unique PB Store name so buyers know who they're purchasing from. You can do this in
            your profile.
          </p>
          <Link
            to="/profile"
            className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
          >
            Go to Profile
          </Link>
        </div>
      </AppShell>
    );

  async function ensureSeller() {
    if (!profile?.is_seller)
      await supabase.from("profiles").update({ is_seller: true }).eq("id", user!.id);
  }

  async function startLive() {
    if (!streamTitle.trim()) return toast.error("Add a title");
    if (!tcgTags.length) return toast.error("Pick at least one TCG tag");
    const isScheduled = !!scheduledFor;
    let scheduledIso: string | null = null;
    if (isScheduled) {
      const d = new Date(scheduledFor);
      if (isNaN(d.getTime())) return toast.error("Pick a valid date/time");
      if (d.getTime() < Date.now() - 60_000) return toast.error("Scheduled time must be in the future");
      scheduledIso = d.toISOString();
    }
    const cameraHandoffStreams: StudioCameraHandoff[] = [];
    if (!isScheduled && useCompositor && selectedCameraIds.length > 0) {
      try {
        for (const deviceId of selectedCameraIds.slice(0, 3)) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: deviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio:
              cameraHandoffStreams.length === 0
                ? { echoCancellation: true, noiseSuppression: true }
                : false,
          });
          const videoTrack = stream.getVideoTracks()[0];
          const settings = videoTrack?.getSettings();
          const device = (await navigator.mediaDevices.enumerateDevices()).find(
            (d) => d.kind === "videoinput" && d.deviceId === (settings?.deviceId ?? deviceId),
          );
          cameraHandoffStreams.push({
            stream,
            label:
              videoTrack?.label || device?.label || `Camera ${cameraHandoffStreams.length + 1}`,
            deviceId: settings?.deviceId ?? deviceId,
            groupId: device?.groupId,
          });
        }
      } catch (error: unknown) {
        releaseStudioCameraStreams(cameraHandoffStreams);
        const cameraError = error as DOMException;
        const message =
          cameraError?.name === "NotAllowedError"
            ? "Camera permission was blocked. Allow camera access, then start live again."
            : "One of those cameras could not start. Uncheck it or close any app using it, then start live again.";
        toast.error(message);
        return;
      }
    }
    // Block if host already has an open (live or paused) stream
    const { data: openStream } = await supabase
      .from("live_streams")
      .select("id, mode, status")
      .eq("seller_id", user!.id)
      .in("status", ["live", "paused"])
      .maybeSingle();
    if (openStream) {
      releaseStudioCameraStreams(cameraHandoffStreams);
      toast.error(
        `You already have an open ${openStream.mode === "show_off" ? "Flex" : "live"} — end it first`,
      );
      return;
    }
    await ensureSeller();
    // Timer never starts on go-live — only starts when seller hits "Start Auction" inside the live page
    const ends_at: string | null = null;

    // Optional: provision OBS / Cloudflare Stream input (skip when scheduling)
    let cf: { cf_live_input_id?: string; cf_rtmps_url?: string; cf_stream_key?: string } = {};
    let cfPublic: { cf_playback_hls?: string; cf_whip_url?: string } = {};
    if (!isScheduled && (useObs || useCompositor)) {
      const { data, error } = await supabase.functions.invoke("create-stream-input", {
        body: { meta_name: streamTitle },
      });
      if (error || (data as any)?.error) {
        releaseStudioCameraStreams(cameraHandoffStreams);
        toast.error("Could not set up Cloudflare Stream — check keys");
        return;
      }
      cf = {
        cf_live_input_id: (data as any).live_input_id,
        cf_rtmps_url: (data as any).rtmps_url,
        cf_stream_key: (data as any).stream_key,
      };
      cfPublic = {
        cf_playback_hls: (data as any).hls_url,
        cf_whip_url: useCompositor ? (data as any).whip_url : null,
      };
    }

    const { data, error } = await supabase
      .from("live_streams")
      .insert({
        seller_id: user!.id,
        title: streamTitle,
        category: streamCategory || null,
        stream_type: "auction",
        tcg_tags: tcgTags,
        item_description:
          [streamDesc, hypeTags.length ? `Tags: ${hypeTags.join(", ")}` : ""]
            .filter(Boolean)
            .join(" — ") || null,
        listing_type: "auction",
        starting_bid: Number(startingBid) || 1,
        current_bid: Number(startingBid) || 1,
        current_item: streamTitle,
        min_bid_increment: Number(minIncrement) || 1,
        status: isScheduled ? "scheduled" : "live",
        is_active: !isScheduled,
        started_at: isScheduled ? null : new Date().toISOString(),
        scheduled_for: scheduledIso,
        recurrence: isScheduled ? recurrence : "none",
        recurrence_until: isScheduled && recurrence !== "none" && recurrenceUntil
          ? new Date(recurrenceUntil).toISOString()
          : null,
        ends_at,
        quick_start_enabled: quickStart,
        default_timer_sec: Number(defaultTimerSec) || 30,
        default_starting_bid: Number(startingBid) || 1,
        default_condition: defaultCondition,
        ...(enableBreak
          ? {
              break_mode: "open",
              break_slot_count: Math.max(2, Math.min(50, Number(breakSlotCount) || 20)),
              break_slot_prefix: breakSlotPrefix.trim() || null,
              break_teams: Array.from(
                { length: Math.max(2, Math.min(50, Number(breakSlotCount) || 20)) },
                (_, i) => `${breakSlotPrefix.trim() || "#"}${i + 1}`,
              ),
            }
          : {}),
        ...cfPublic,
      } as any)
      .select()
      .single();
    if (error) {
      releaseStudioCameraStreams(cameraHandoffStreams);
      return toast.error(error.message);
    }
    if (cf.cf_live_input_id || cf.cf_rtmps_url || cf.cf_stream_key) {
      await supabase.from("live_stream_credentials" as any).insert({
        stream_id: data.id,
        cf_live_input_id: cf.cf_live_input_id ?? null,
        cf_rtmps_url: cf.cf_rtmps_url ?? null,
        cf_stream_key: cf.cf_stream_key ?? null,
      });
    }
    if (!isScheduled && useCompositor && selectedCameraIds.length > 0) {
      if (cameraHandoffStreams.length > 0) stashStudioCameraStreams(data.id, cameraHandoffStreams);
      window.sessionStorage.setItem(
        `studio:${data.id}:cameraDeviceIds`,
        JSON.stringify(selectedCameraIds.slice(0, 3)),
      );
    }
    // Seed Pre-B queue with cards the host picked from their vault during setup.
    // Re-check vault status so anything already sold/won elsewhere is excluded.
    if (prebidVaultPicks.length > 0) {
      const ids = prebidVaultPicks.map((v) => v.id);
      const { data: stillAvail } = await supabase
        .from("vault_cards")
        .select("id")
        .in("id", ids)
        .eq("status", "available");
      const availSet = new Set(((stillAvail as any[]) || []).map((r) => r.id));
      const picks = prebidVaultPicks.filter((v) => availSet.has(v.id));
      const skipped = prebidVaultPicks.length - picks.length;
      if (skipped > 0) toast.message(`${skipped} card(s) skipped — already sold`);
      const rows = picks.map((v, i) => {
        const val = Number(v.estimated_value || 0);
        const startFromOverride = Number(v.starting_bid);
        const start = Number.isFinite(startFromOverride) && startFromOverride > 0
          ? startFromOverride
          : (val > 0 ? Math.max(1, Math.floor(val * 0.5)) : 1);
        const bnOverride = Number(v.buy_now_price);
        const buyNow = Number.isFinite(bnOverride) && bnOverride > 0
          ? bnOverride
          : (val > 0 ? val : null);
        const title = [v.name, v.tcg_set, v.tcg_number].filter(Boolean).join(" · ") || v.name;
        return {
          stream_id: data.id,
          host_id: user!.id,
          position: i,
          title,
          quantity: 1,
          image_url: v.image_url || null,
          sale_type: "prebid",
          starting_bid: start,
          duration_seconds: Number(defaultTimerSec) || 30,
          snipe_price: buyNow,
          buy_now_price: buyNow,
          voice_trigger: v.voice_trigger?.trim() || null,
          vault_card_id: v.id,
        };
      });
      if (rows.length > 0) {
        const { error: qErr } = await supabase.from("auction_queue" as any).insert(rows as any);
        if (qErr) toast.error(`Pre-B seeding: ${qErr.message}`);
      }
    }
    if (isScheduled) {
      toast.success(`Scheduled for ${new Date(scheduledIso!).toLocaleString()}`);
      nav({ to: "/my-listings" });
      return;
    }
    // Fire-and-forget push to followers — never block navigation.
    notifyGoingLive({ data: { streamId: data.id } }).catch(() => {});
    nav({ to: "/live/$id", params: { id: data.id } });
  }

  async function createListing() {
    if (!title.trim()) return toast.error("Add a title");
    if (!desc.trim()) return toast.error("Add a description");
    const frontErr = validateListingImage(imageUrl, { field: "Front photo" });
    if (frontErr) return toast.error(frontErr);
    const backErr = validateListingImage(backImageUrl, { field: "Back photo" });
    if (backErr) return toast.error(backErr);
    if (!category) return toast.error("Pick a category");
    if (!enableBuyNow && !enableAuction && !enableOffers)
      return toast.error("Pick at least one sale type");
    if (enableBuyNow && (!buyNowPrice || Number(buyNowPrice) <= 0))
      return toast.error("Set a Buy Now price");
    if (enableAuction && (!auctionStart || Number(auctionStart) <= 0))
      return toast.error("Set a starting bid");
    await ensureSeller();

    const auctionEnds = enableAuction
      ? new Date(Date.now() + Number(auctionDays) * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const primary = enableAuction ? "auction" : enableBuyNow ? "buy_now" : "offer";

    const { error } = await supabase.from("listings").insert({
      seller_id: user!.id,
      title,
      description: desc,
      image_url: imageUrl || null,
      back_image_url: backImageUrl || null,
      tcg_number: tcgNumber.trim() || null,
      category,
      condition,
      listing_type: primary,
      is_auction: enableAuction,
      accepts_offers: enableOffers,
      starting_bid: enableAuction ? Number(auctionStart) : null,
      current_bid: enableAuction ? Number(auctionStart) : null,
      price: enableBuyNow ? Number(buyNowPrice) : null,
      buy_now_price: enableBuyNow ? Number(buyNowPrice) : null,
      shipping_price: Number(shippingPrice) || 0,
      shipping_preset: shippingPreset,
      weight_oz: Number(weightOz) || null,
      auction_ends_at: auctionEnds,
    });
    if (error) {
      const msg = /image_url|image/i.test(error.message)
        ? "Photo upload didn't save. Please re-upload your front and back photos and try again."
        : error.message;
      return toast.error(msg);
    }
    toast.success("Listing created");
    nav({ to: "/market" });
  }

  // 🆕 AI identify (TEXT) — same flow as the Vault. Stores condition_prices so
  // the buy-now price auto-recomputes when the seller switches condition.
  async function aiIdentify() {
    const q = title.trim() || desc.trim() || tcgNumber.trim();
    if (!q) return toast.error("Type a card name, number, or description first");
    setIdentifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("identify-card", {
        body: {
          query: [
            q,
            tcgNumber && `#${tcgNumber}`,
            tcgSet && `set: ${tcgSet}`,
            tcgYear && `year: ${tcgYear}`,
          ]
            .filter(Boolean)
            .join(" "),
        },
      });
      if (error) throw error;
      applyIdResult(data);
      toast.success(`Identified: ${data?.name || q}${data?.set ? ` • ${data.set}` : ""}`);
    } catch (e: any) {
      toast.error(e.message || "Identify failed");
    } finally {
      setIdentifying(false);
    }
  }

  // 🆕 IMAGE-based identify — same engine as the Vault scanner. The seller
  // snaps the card with their camera; we run scan-card and apply the result.
  function onScanResult(r: {
    name: string;
    category: string;
    trend: string;
    image: string;
    set?: string;
    year?: string;
    tcg_number?: string;
    estimated_value?: number;
    condition_prices?: ConditionPrices;
  }) {
    if (!imageUrl) setImageUrl(r.image); // captured photo becomes the front image
    applyIdResult(r);
    setScanning(false);
    toast.success(`Identified: ${r.name}`);
  }

  // Shared "apply identification result to the form" used by both text & image flows.
  async function applyIdResult(d: any) {
    if (!d) return;
    if (d.name) setTitle(d.name);
    if (d.tcg_number && !tcgNumber) setTcgNumber(d.tcg_number);
    if (d.set && !tcgSet) setTcgSet(d.set);
    if (d.year && !tcgYear) setTcgYear(String(d.year));
    if (!desc.trim()) {
      const parts = [
        d.category,
        d.set,
        d.year && `(${d.year})`,
        d.tcg_number && `#${d.tcg_number}`,
      ].filter(Boolean);
      if (parts.length) setDesc(parts.join(" • "));
    }
    const cp: ConditionPrices | null = d.condition_prices || null;
    setCondPrices(cp);
    const base = Number(d.estimated_value) || Number(cp?.NM) || 0;
    if (base) setBuyNowPrice(String(priceFor(condition, base, cp)));
    if (!imageUrl && d.name) {
      try {
        const { data: img } = await supabase.functions.invoke("generate-card-image", {
          body: {
            name: d.name,
            category: d.category,
            set: d.set,
            year: d.year,
            tcg_number: d.tcg_number || tcgNumber,
          },
        });
        if (img?.image) {
          setImageUrl(img.image);
          toast.success("Card image generated");
        }
      } catch {
        /* ignore */
      }
    }
  }

  const Toggle = ({
    label,
    hint,
    on,
    set,
  }: {
    label: string;
    hint?: string;
    on: boolean;
    set: (v: boolean) => void;
  }) => (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl bg-card p-3">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => set(e.target.checked)}
        className="mt-1 h-5 w-5"
      />
    </label>
  );

  return (
    <SellerAgreementGate>
    <SellerVerificationGate>
      <AppShell>
        <div className="px-4 py-4">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-2xl font-bold">Sell</h1>
            <WatchTutorial routePath="/sell" label="Watch tutorial" />
          </div>
          <div className="mb-4 flex rounded-xl bg-card p-1">
            <button
              onClick={() => setTab("live")}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tab === "live" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              Go Live
            </button>
            <button
              onClick={() => setTab("listing")}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tab === "listing" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              List Item
            </button>
          </div>

          {tab === "live" ? (
            <LiveWizard
              step={step}
              setStep={setStep}
              streamTitle={streamTitle}
              setStreamTitle={setStreamTitle}
              streamCategory={streamCategory}
              setStreamCategory={setStreamCategory}
              tcgTags={tcgTags}
              setTcgTags={setTcgTags}
              streamMethod={streamMethod}
              setStreamMethod={setStreamMethod}
              selectedCameraIds={selectedCameraIds}
              setSelectedCameraIds={setSelectedCameraIds}
              useObs={useObs}
              setUseObs={setUseObs}
              useCompositor={useCompositor}
              setUseCompositor={setUseCompositor}
              startingBid={startingBid}
              setStartingBid={setStartingBid}
              minIncrement={minIncrement}
              setMinIncrement={setMinIncrement}
              defaultTimerSec={defaultTimerSec}
              setDefaultTimerSec={setDefaultTimerSec}
              defaultCondition={defaultCondition}
              setDefaultCondition={setDefaultCondition}
              quickStart={quickStart}
              setQuickStart={setQuickStart}
              auctionPreset={auctionPreset}
              setAuctionPreset={setAuctionPreset}
              enableBreak={enableBreak}
              setEnableBreak={setEnableBreak}
              breakSlotCount={breakSlotCount}
              setBreakSlotCount={setBreakSlotCount}
              breakSlotPrice={breakSlotPrice}
              setBreakSlotPrice={setBreakSlotPrice}
              breakSlotPrefix={breakSlotPrefix}
              setBreakSlotPrefix={setBreakSlotPrefix}
              streamDesc={streamDesc}
              setStreamDesc={setStreamDesc}
              hostId={user?.id || ""}
              prebidVaultPicks={prebidVaultPicks}
              setPrebidVaultPicks={setPrebidVaultPicks}
              scheduledFor={scheduledFor}
              setScheduledFor={setScheduledFor}
              recurrence={recurrence}
              setRecurrence={setRecurrence}
              recurrenceUntil={recurrenceUntil}
              setRecurrenceUntil={setRecurrenceUntil}
              startLive={async () => {
                await startLive();
              }}
            />
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-xl bg-input px-4 py-3 text-sm outline-none"
                  placeholder="Item title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setScanning(true)}
                  className="flex items-center gap-1 rounded-xl bg-primary px-3 py-3 text-xs font-bold text-primary-foreground"
                  title="Scan card with camera (same engine as Vault)"
                >
                  <Camera className="h-3.5 w-3.5" /> Scan
                </button>
                <button
                  type="button"
                  onClick={aiIdentify}
                  disabled={identifying}
                  className="rounded-xl bg-accent px-3 py-3 text-xs font-bold text-accent-foreground disabled:opacity-50"
                >
                  {identifying ? "…" : "✨ AI ID"}
                </button>
              </div>
              <p className="-mt-1 text-[10px] text-muted-foreground">
                Tap <b>Scan</b> to identify by photo (same as your Vault), or type a name + tap{" "}
                <b>AI ID</b>. Pricing adjusts for condition automatically.
              </p>
              <textarea
                className="w-full resize-none rounded-xl bg-input px-4 py-3 text-sm outline-none"
                rows={3}
                placeholder="Description (required)"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  className="rounded-xl bg-input px-3 py-3 text-xs outline-none"
                  placeholder="Set"
                  value={tcgSet}
                  onChange={(e) => setTcgSet(e.target.value)}
                />
                <input
                  className="rounded-xl bg-input px-3 py-3 text-xs outline-none"
                  placeholder="Year"
                  value={tcgYear}
                  onChange={(e) => setTcgYear(e.target.value)}
                />
                <input
                  className="rounded-xl bg-input px-3 py-3 text-xs outline-none"
                  placeholder="# (e.g. 4/102)"
                  value={tcgNumber}
                  onChange={(e) => setTcgNumber(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ListingPhotoCapture
                  value={imageUrl}
                  onChange={setImageUrl}
                  label="Front photo * (camera only)"
                />
                <ListingPhotoCapture
                  value={backImageUrl}
                  onChange={setBackImageUrl}
                  label="Back photo * (camera only)"
                />
              </div>
              <label className="block">
                <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Category *</p>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl bg-input px-4 py-3 text-sm outline-none"
                >
                  {LISTING_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.emoji} {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
                  Condition (required)
                </p>
                <div className="grid grid-cols-4 gap-1">
                  {(["NM", "LP", "MP", "Damaged"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCondition(c)}
                      className={`rounded-lg py-2 text-xs font-bold ${condition === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  Sale options (pick any combination)
                </p>
                <div className="space-y-2">
                  <Toggle
                    label="Buy Now"
                    hint="Set a fixed price buyers can pay instantly."
                    on={enableBuyNow}
                    set={(on) => {
                      setEnableBuyNow(on);
                      if (on) {
                        setEnableAuction(false);
                        setAuctionStart("");
                      }
                    }}
                  />
                  {enableBuyNow && (
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      className="w-full rounded-xl bg-input px-4 py-3 text-sm outline-none"
                      placeholder="Buy Now price ($)"
                      value={buyNowPrice}
                      onChange={(e) => setBuyNowPrice(e.target.value)}
                    />
                  )}
                  <Toggle
                    label="Auction"
                    hint="Buyers place bids. Highest at end-time wins."
                    on={enableAuction}
                    set={(on) => {
                      setEnableAuction(on);
                      if (on) {
                        setEnableBuyNow(false);
                        setBuyNowPrice("");
                      }
                    }}
                  />
                  {enableAuction && (
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        className="rounded-xl bg-input px-4 py-3 text-sm outline-none"
                        placeholder="Starting bid ($)"
                        value={auctionStart}
                        onChange={(e) => setAuctionStart(e.target.value)}
                      />
                      <select
                        value={auctionDays}
                        onChange={(e) => setAuctionDays(e.target.value)}
                        className="rounded-xl bg-input px-4 py-3 text-sm outline-none"
                      >
                        <option value="1">1 day</option>
                        <option value="3">3 days</option>
                        <option value="5">5 days</option>
                        <option value="7">7 days</option>
                      </select>
                    </div>
                  )}
                  <Toggle
                    label="Accept Offers"
                    hint="Buyers can send custom offers (>$1)."
                    on={enableOffers}
                    set={setEnableOffers}
                  />
                </div>
              </div>

              <div className="space-y-2 rounded-xl bg-muted/30 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Shipping (auto-quoted from carriers)</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] uppercase text-muted-foreground">
                    Package
                    <select
                      value={shippingPreset}
                      onChange={(e) => {
                        const v = e.target.value as typeof shippingPreset;
                        setShippingPreset(v);
                        const w = ({ stamp: "1", pwe: "1", bubble: "4", small_box: "10" })[v];
                        setWeightOz(w);
                      }}
                      className="mt-0.5 w-full rounded-lg bg-input px-2 py-2 text-sm outline-none"
                    >
                      <option value="stamp">Stamp (single card)</option>
                      <option value="pwe">PWE (1–3 cards)</option>
                      <option value="bubble">Bubble Mailer</option>
                      <option value="small_box">Small Box</option>
                    </select>
                  </label>
                  <label className="text-[10px] uppercase text-muted-foreground">
                    Weight (oz)
                    <input
                      type="number" min="0.1" step="0.1"
                      value={weightOz}
                      onChange={(e) => setWeightOz(e.target.value)}
                      className="mt-0.5 w-full rounded-lg bg-input px-2 py-2 text-sm outline-none"
                    />
                  </label>
                </div>
                {user && (
                  <ShippingEstimator
                    sellerId={user.id}
                    presetKey={shippingPreset}
                    weightOz={Number(weightOz) || undefined}
                    buyerCountry="US"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setShowShipAdvanced((v) => !v)}
                  className="text-[10px] font-semibold text-primary"
                >
                  {showShipAdvanced ? "Hide" : "Advanced"} — manual flat-rate override
                </button>
                {showShipAdvanced && (
                  <input
                    type="number" min="0" step="0.01"
                    className="w-full rounded-lg bg-input px-3 py-2 text-sm outline-none"
                    placeholder="Manual flat shipping ($) — leave 0 to use carrier rates"
                    value={shippingPrice}
                    onChange={(e) => setShippingPrice(e.target.value)}
                  />
                )}
              </div>
              <button
                onClick={createListing}
                className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground"
              >
                Create Listing
              </button>
            </div>
          )}
        </div>
        {scanning && (
          <Suspense fallback={null}>
            <CardScanner
              allowMulti={false}
              onClose={() => setScanning(false)}
              onResult={onScanResult}
              onAction={(action, r) => {
                // Always auto-fill the form first
                if (!imageUrl) setImageUrl(r.image);
                applyIdResult(r);
                if (action === "list") {
                  setEnableBuyNow(true);
                  setEnableAuction(false);
                  toast.success("Listing details filled — review and post");
                } else if (action === "auction") {
                  setEnableAuction(true);
                  setEnableBuyNow(false);
                  toast.success("Auction details filled — set duration and post");
                } else if (action === "offer") {
                  setEnableOffers(true);
                  setEnableBuyNow(false);
                  setEnableAuction(false);
                  toast.success("Make Offer enabled — review and post");
                } else if (action === "inventory") {
                  toast.success("Card details filled — save to Vault from there");
                } else if (action === "draft") {
                  try {
                    sessionStorage.setItem("pbl_sell_draft", JSON.stringify(r));
                    toast.success("Draft saved");
                  } catch {}
                }
                setScanning(false);
              }}
            />
          </Suspense>
        )}
      </AppShell>
    </SellerVerificationGate>
    </SellerAgreementGate>
  );
}

// =====================================================================
// 6-step Live Wizard — clean, mobile-first, big buttons.
// Step 1 → Title • 2 → Category • 3 → Method • 4 → Products
// Step 5 → Auction settings • 6 → Live preview & Go Live
// =====================================================================
type LiveWizardProps = {
  step: number;
  setStep: (n: number) => void;
  streamTitle: string;
  setStreamTitle: (v: string) => void;
  streamCategory: string;
  setStreamCategory: (v: string) => void;
  tcgTags: TcgTag[];
  setTcgTags: (fn: (cur: TcgTag[]) => TcgTag[]) => void;
  streamMethod: "phone" | "webcam" | "obs";
  setStreamMethod: (m: "phone" | "webcam" | "obs") => void;
  selectedCameraIds: string[];
  setSelectedCameraIds: (ids: string[]) => void;
  useObs: boolean;
  setUseObs: (v: boolean) => void;
  useCompositor: boolean;
  setUseCompositor: (v: boolean) => void;
  startingBid: string;
  setStartingBid: (v: string) => void;
  minIncrement: string;
  setMinIncrement: (v: string) => void;
  defaultTimerSec: string;
  setDefaultTimerSec: (v: string) => void;
  defaultCondition: "NM" | "LP" | "MP" | "Damaged";
  setDefaultCondition: (v: "NM" | "LP" | "MP" | "Damaged") => void;
  quickStart: boolean;
  setQuickStart: (v: boolean) => void;
  auctionPreset: "sudden_death" | "timed" | "wheel_spin" | "pull_box" | "mystery_pack" | "custom";
  setAuctionPreset: (v: LiveWizardProps["auctionPreset"]) => void;
  enableBreak: boolean;
  setEnableBreak: (v: boolean) => void;
  breakSlotCount: string;
  setBreakSlotCount: (v: string) => void;
  breakSlotPrice: string;
  setBreakSlotPrice: (v: string) => void;
  breakSlotPrefix: string;
  setBreakSlotPrefix: (v: string) => void;
  streamDesc: string;
  setStreamDesc: (v: string) => void;
  hostId: string;
  prebidVaultPicks: VaultPick[];
  setPrebidVaultPicks: (v: VaultPick[] | ((cur: VaultPick[]) => VaultPick[])) => void;
  scheduledFor: string;
  setScheduledFor: (v: string) => void;
  recurrence: "none" | "daily" | "weekly" | "monthly";
  setRecurrence: (v: "none" | "daily" | "weekly" | "monthly") => void;
  recurrenceUntil: string;
  setRecurrenceUntil: (v: string) => void;
  startLive: () => Promise<void>;
};

function LiveWizard(p: LiveWizardProps) {
  const stepLabels = ["Title", "Category", "Method", "Products", "Settings", "Go Live"];
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraScanStatus, setCameraScanStatus] = useState<"idle" | "scanning" | "ready" | "error">(
    "idle",
  );
  const [cameraScanError, setCameraScanError] = useState<string | null>(null);
  const [vaultCards, setVaultCards] = useState<VaultPick[]>([]);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultLoaded, setVaultLoaded] = useState(false);
  const [vaultSearch, setVaultSearch] = useState("");

  useEffect(() => {
    if (p.step !== 4 || vaultLoaded || !p.hostId) return;
    setVaultLoading(true);
    supabase
      .from("vault_cards")
      .select("id, name, image_url, estimated_value, tcg_set, tcg_number")
      .eq("user_id", p.hostId)
      .eq("status", "available")
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) => {
        setVaultCards(((data as any[]) || []) as VaultPick[]);
        setVaultLoaded(true);
        setVaultLoading(false);
      });
  }, [p.step, p.hostId, vaultLoaded]);

  const pickedIds = new Set(p.prebidVaultPicks.map((v) => v.id));
  function toggleVaultPick(card: VaultPick) {
    p.setPrebidVaultPicks((cur) =>
      cur.some((c) => c.id === card.id)
        ? cur.filter((c) => c.id !== card.id)
        : [...cur, { ...card, starting_bid: "", buy_now_price: "", voice_trigger: "" }],
    );
  }
  function updatePick(id: string, patch: Partial<VaultPick>) {
    p.setPrebidVaultPicks((cur) => cur.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  const filteredVault = (() => {
    const q = vaultSearch.trim().toLowerCase();
    if (!q) return vaultCards;
    return vaultCards.filter((v) =>
      [v.name, v.tcg_set, v.tcg_number].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  })();
  const total = stepLabels.length;
  const canNext = (() => {
    if (p.step === 1) return p.streamTitle.trim().length >= 3;
    if (p.step === 2) return p.tcgTags.length > 0;
    return true;
  })();

  function applyPreset(v: LiveWizardProps["auctionPreset"]) {
    p.setAuctionPreset(v);
    if (v === "sudden_death") {
      p.setDefaultTimerSec("10");
      p.setStartingBid("1");
      p.setMinIncrement("1");
      p.setQuickStart(true);
      p.setEnableBreak(false);
    } else if (v === "timed") {
      p.setDefaultTimerSec("30");
      p.setStartingBid("1");
      p.setMinIncrement("1");
      p.setQuickStart(true);
      p.setEnableBreak(false);
    } else if (v === "wheel_spin") {
      p.setDefaultTimerSec("20");
      p.setStartingBid("5");
      p.setMinIncrement("1");
      p.setEnableBreak(false);
    } else if (v === "pull_box") {
      p.setEnableBreak(true);
      p.setBreakSlotCount("20");
      p.setBreakSlotPrice("10");
      p.setQuickStart(false);
    } else if (v === "mystery_pack") {
      p.setEnableBreak(true);
      p.setBreakSlotCount("12");
      p.setBreakSlotPrice("5");
      p.setBreakSlotPrefix("Pack ");
      p.setQuickStart(false);
    }
  }

  async function scanBrowserCameras() {
    setCameraScanStatus("scanning");
    setCameraScanError(null);
    let probe: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices?.enumerateDevices) {
        throw new Error("This browser cannot list cameras. Try Chrome, Edge, Safari, or Firefox.");
      }
      if (typeof window !== "undefined" && window.isSecureContext === false) {
        throw new Error("Camera access requires HTTPS. Open the app via the secure URL.");
      }
      try {
        probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (e: any) {
        const name = e?.name || "";
        if (name === "NotReadableError" || name === "AbortError") {
          // Some browsers throw this while the camera is still warming up; keep scanning devices.
          await new Promise((r) => setTimeout(r, 400));
          try {
            probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          } catch {}
        } else {
          throw e;
        }
      }
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === "videoinput",
      );
      setCameraDevices(devices);
      setCameraScanStatus("ready");
    } catch (error: any) {
      const name = error?.name || "";
      let message = error?.message || "Could not scan cameras";
      if (name === "NotAllowedError" || name === "SecurityError") {
        message =
          "Camera permission was blocked. Click the camera icon in your browser's address bar to allow it, then try again.";
      } else if (name === "NotFoundError") {
        message = "No camera found on this device.";
      } else if (name === "NotReadableError" || /could not start video/i.test(message)) {
        message =
          "The browser couldn't start the camera. Refresh, unplug/replug the camera, or choose a different camera if one is listed.";
      }
      setCameraScanError(message);
      setCameraScanStatus("error");
    } finally {
      probe?.getTracks().forEach((track) => track.stop());
    }
  }

  function togglePreselectedCamera(deviceId: string) {
    if (!deviceId) return;
    p.setSelectedCameraIds(
      p.selectedCameraIds.includes(deviceId)
        ? p.selectedCameraIds.filter((id) => id !== deviceId)
        : [...p.selectedCameraIds, deviceId].slice(0, 3),
    );
  }

  return (
    <div className="space-y-4">
      {/* Stepper */}
      <div className="flex items-center justify-between gap-1">
        {stepLabels.map((label, i) => {
          const n = i + 1;
          const done = n < p.step;
          const active = n === p.step;
          return (
            <button
              key={label}
              type="button"
              onClick={() => n < p.step && p.setStep(n)}
              className={`flex flex-1 flex-col items-center gap-1 ${n > p.step ? "opacity-40" : ""}`}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${done ? "bg-emerald-500 text-white" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : n}
              </span>
              <span
                className={`text-[9px] font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Step body */}
      {p.step === 1 && (
        <section className="space-y-3 rounded-2xl bg-card p-4">
          <div>
            <h2 className="text-base font-bold">What's your stream called?</h2>
            <p className="text-xs text-muted-foreground">
              Buyers see this in the live feed. Be specific — “Friday PSA Reveal” beats “Cards”.
            </p>
          </div>
          <input
            data-tour="stream-title"
            autoFocus
            className="w-full rounded-xl bg-input px-4 py-4 text-base outline-none"
            placeholder="e.g. Friday Pokémon $1 starts"
            value={p.streamTitle}
            onChange={(e) => p.setStreamTitle(e.target.value)}
            maxLength={80}
          />
          <textarea
            className="w-full resize-none rounded-xl bg-input px-4 py-3 text-sm outline-none"
            rows={2}
            placeholder="Description (optional)"
            value={p.streamDesc}
            onChange={(e) => p.setStreamDesc(e.target.value)}
          />
        </section>
      )}

      {p.step === 2 && (
        <section className="space-y-3 rounded-2xl bg-card p-4">
          <div>
            <h2 className="text-base font-bold">What are you selling?</h2>
            <p className="text-xs text-muted-foreground">
              Pick at least one tag — this is how viewers discover your stream.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {TCG_TAGS.map((t) => {
              const on = p.tcgTags.includes(t.value);
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() =>
                    p.setTcgTags((cur) =>
                      on ? cur.filter((x) => x !== t.value) : [...cur, t.value],
                    )
                  }
                  className={`min-h-11 rounded-full px-4 py-2 text-sm font-bold ${on ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                >
                  {t.emoji} {t.label}
                </button>
              );
            })}
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">
              Primary category
            </span>
            <select
              value={p.streamCategory}
              onChange={(e) => p.setStreamCategory(e.target.value)}
              className="w-full rounded-xl bg-input px-4 py-3 text-sm outline-none"
            >
              {LISTING_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.emoji} {c.label}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      {p.step === 3 && (
        <section className="space-y-3 rounded-2xl bg-card p-4">
          <div>
            <h2 className="text-base font-bold">How will you stream?</h2>
            <p className="text-xs text-muted-foreground">
              Pick the easiest one for your setup. You can change this anytime.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <MethodCard
              active={p.streamMethod === "phone"}
              icon={<Smartphone className="h-5 w-5" />}
              title="Phone camera"
              hint="Easiest. Hold up cards to your phone — no extra apps."
              badge="Recommended for new sellers"
              onClick={() => {
                p.setStreamMethod("phone");
                p.setUseObs(false);
                p.setUseCompositor(false);
              }}
            />
            <MethodCard
              active={p.streamMethod === "webcam"}
              icon={<Camera className="h-5 w-5" />}
              title="Webcam / USB multi-cam studio"
              hint="Pick up to 3 laptop, USB, capture-card, or OBS Virtual Camera feeds before or during live."
              onClick={() => {
                p.setStreamMethod("webcam");
                p.setUseObs(false);
                p.setUseCompositor(true);
              }}
            />
            {p.streamMethod === "webcam" && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold">Camera sources</p>
                    <p className="text-[10px] text-muted-foreground">
                      Select up to 3 cameras now. You can add/switch cameras inside Live Studio too.
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={scanBrowserCameras}
                      disabled={cameraScanStatus === "scanning"}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-[11px] font-bold text-primary-foreground disabled:opacity-50"
                    >
                      {cameraScanStatus === "scanning" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Scan
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        window.open(window.location.href, "_blank", "noopener,noreferrer")
                      }
                      title="Open in a new tab — bypasses the preview iframe so the browser can prompt for camera access"
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-2 text-[11px] font-bold"
                    >
                      ↗ New tab
                    </button>
                  </div>
                </div>
                {typeof window !== "undefined" && window.self !== window.top && (
                  <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-[10px] text-amber-700 dark:text-amber-300">
                    You're inside the Lovable preview iframe. Camera permission may be blocked here
                    — click <b>↗ New tab</b> to run the studio in a normal browser tab.
                  </p>
                )}
                {cameraDevices.length > 0 ? (
                  <div className="space-y-1">
                    {cameraDevices.map((device, i) => {
                      const checked = p.selectedCameraIds.includes(device.deviceId);
                      const disabled = !checked && p.selectedCameraIds.length >= 3;
                      return (
                        <label
                          key={`${device.deviceId || device.groupId || "camera"}-${i}`}
                          className={`flex items-center gap-2 rounded-lg bg-background p-2 text-xs ${disabled ? "opacity-50" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => togglePreselectedCamera(device.deviceId)}
                            className="h-4 w-4 accent-primary"
                          />
                          <Camera className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate font-semibold">
                            {device.label || `Camera ${i + 1}`}
                          </span>
                          {checked && (
                            <span className="text-[9px] font-bold text-primary">Queued</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-lg bg-background p-2 text-[10px] text-muted-foreground">
                    Click Scan and allow camera permission so the browser can show your laptop, USB,
                    capture-card, and OBS Virtual Camera options.
                  </p>
                )}
                {cameraScanError && (
                  <p className="mt-2 text-[10px] text-destructive">{cameraScanError}</p>
                )}
              </div>
            )}
            <MethodCard
              active={p.streamMethod === "obs"}
              icon={<Monitor className="h-5 w-5" />}
              title="OBS desktop"
              hint="Pro encoder, overlays, multi-source. Step-by-step setup in OBS Hub."
              onClick={() => {
                p.setStreamMethod("obs");
                p.setUseObs(true);
                p.setUseCompositor(false);
              }}
            />
          </div>
          {p.streamMethod === "obs" && (
            <Link
              to="/obs-hub"
              className="block rounded-xl border border-primary/30 bg-primary/5 p-3 text-center text-xs font-semibold text-primary"
            >
              Open OBS Streamer Hub →
            </Link>
          )}
        </section>
      )}

      {p.step === 4 && (
        <section className="space-y-3 rounded-2xl bg-card p-4">
          <div>
            <h2 className="text-base font-bold">Set up Pre-B (optional)</h2>
            <p className="text-xs text-muted-foreground">
              Pick cards from your Vault to seed the Pre-Bid PB Store. Viewers can bid before you go live.
              You can still scan more cards live.
            </p>
            <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] leading-snug text-amber-700 dark:text-amber-300">
              ⚠️ Heads up: once a card is sold or won — anywhere (Pre-Bid, live auction, or marketplace) — it's automatically removed from your Vault, the Marketplace, and any scheduled Pre-Bid PB Stores. Please double-check before going live to make sure removed cards are no longer listed.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-background p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold">
                <Library className="h-4 w-4 text-cyan-500" />
                Your Vault
                {vaultLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </div>
              <span className="text-[10px] text-muted-foreground">
                {p.prebidVaultPicks.length} selected
              </span>
            </div>

            <input
              type="text"
              value={vaultSearch}
              onChange={(e) => setVaultSearch(e.target.value)}
              placeholder="Search your vault by name, set, or number…"
              className="mb-2 w-full rounded-lg bg-input px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-cyan-500/40"
            />

            {!vaultLoading && vaultCards.length === 0 && (
              <p className="rounded-md bg-muted/40 p-3 text-center text-[11px] text-muted-foreground">
                No vaulted cards yet. Add cards in your{" "}
                <Link to="/vault" className="font-bold text-primary underline">
                  Vault
                </Link>
                .
              </p>
            )}

            {vaultCards.length > 0 && (
              <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                {filteredVault.length === 0 && (
                  <p className="rounded-md bg-muted/40 p-2 text-center text-[11px] text-muted-foreground">
                    No matches for &ldquo;{vaultSearch}&rdquo;
                  </p>
                )}
                {filteredVault.map((v) => {
                  const picked = pickedIds.has(v.id);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => toggleVaultPick(v)}
                      className={`flex w-full items-center gap-2 rounded-lg border p-2 text-left transition ${
                        picked
                          ? "border-cyan-500 bg-cyan-500/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <span
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded border-2 ${
                          picked ? "border-cyan-500 bg-cyan-500 text-white" : "border-border"
                        }`}
                      >
                        {picked && <Check className="h-3 w-3" />}
                      </span>
                      {v.image_url ? (
                        <img
                          src={v.image_url}
                          alt={v.name}
                          className="h-10 w-8 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="h-10 w-8 shrink-0 rounded bg-muted" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">{v.name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {[v.tcg_set, v.tcg_number].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      {v.estimated_value ? (
                        <span className="shrink-0 text-[11px] font-bold text-emerald-600">
                          ${Number(v.estimated_value).toFixed(0)}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {p.prebidVaultPicks.length > 0 && (
            <div className="space-y-2 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
                Pre-B queue · {p.prebidVaultPicks.length} card{p.prebidVaultPicks.length === 1 ? "" : "s"}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Set a starting bid or Buy Now price per card. Add a voice trigger phrase to
                auto-pull the card on stream when you say it.
              </p>
              <div className="space-y-2">
                {p.prebidVaultPicks.map((v) => {
                  const suggestedStart =
                    v.estimated_value && v.estimated_value > 0
                      ? Math.max(1, Math.floor(Number(v.estimated_value) * 0.5))
                      : 1;
                  const suggestedBN = v.estimated_value ? Number(v.estimated_value) : 0;
                  return (
                    <div
                      key={v.id}
                      className="rounded-lg border border-border bg-background p-2"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        {v.image_url ? (
                          <img
                            src={v.image_url}
                            alt={v.name}
                            className="h-10 w-8 rounded object-cover"
                          />
                        ) : (
                          <div className="h-10 w-8 rounded bg-muted" />
                        )}
                        <p className="flex-1 truncate text-xs font-semibold">{v.name}</p>
                        <button
                          type="button"
                          onClick={() => toggleVaultPick(v)}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Remove from Pre-B"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="mb-0.5 block text-[10px] font-bold text-muted-foreground">
                            Starting bid ($)
                          </span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="1"
                            value={v.starting_bid ?? ""}
                            onChange={(e) =>
                              updatePick(v.id, { starting_bid: e.target.value })
                            }
                            placeholder={String(suggestedStart)}
                            className="w-full rounded-md bg-input px-2 py-1.5 text-xs outline-none"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-0.5 block text-[10px] font-bold text-muted-foreground">
                            Buy Now ($)
                          </span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="1"
                            value={v.buy_now_price ?? ""}
                            onChange={(e) =>
                              updatePick(v.id, { buy_now_price: e.target.value })
                            }
                            placeholder={suggestedBN > 0 ? String(suggestedBN) : "—"}
                            className="w-full rounded-md bg-input px-2 py-1.5 text-xs outline-none"
                          />
                        </label>
                      </div>
                      <label className="mt-2 block">
                        <span className="mb-0.5 block text-[10px] font-bold text-muted-foreground">
                          🎙️ Voice trigger (optional)
                        </span>
                        <input
                          type="text"
                          value={v.voice_trigger ?? ""}
                          onChange={(e) =>
                            updatePick(v.id, { voice_trigger: e.target.value })
                          }
                          placeholder={`e.g. "pull ${v.name.split(" ").slice(0, 2).join(" ")}"`}
                          className="w-full rounded-md bg-input px-2 py-1.5 text-xs outline-none"
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-xl bg-muted/40 p-3 text-[12px] text-muted-foreground">
            ⚡ <b>Scan-to-start</b> is on by default. While live, scan a card to instantly run an
            auction with your saved settings.
          </div>
          <Link
            to="/my-listings"
            className="block rounded-xl border border-border bg-card p-3 text-center text-sm font-semibold"
          >
            Manage existing listings →
          </Link>
        </section>
      )}

      {p.step === 5 && (
        <section className="space-y-3 rounded-2xl bg-card p-4">
          <div>
            <h2 className="text-base font-bold">Auction settings</h2>
            <p className="text-xs text-muted-foreground">
              Pick a preset to fill defaults, or fine-tune below.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <PresetCard
              active={p.auctionPreset === "sudden_death"}
              icon={<Zap className="h-4 w-4" />}
              label="Sudden Death"
              hint="10s timer, $1 start, fast pace."
              onClick={() => applyPreset("sudden_death")}
            />
            <PresetCard
              active={p.auctionPreset === "timed"}
              icon={<Timer className="h-4 w-4" />}
              label="Timed Auction"
              hint="30s timer, classic format."
              onClick={() => applyPreset("timed")}
            />
            <PresetCard
              active={p.auctionPreset === "wheel_spin"}
              icon={<Disc3 className="h-4 w-4" />}
              label="Wheel Spin"
              hint="Spin to pick a winner card."
              onClick={() => applyPreset("wheel_spin")}
            />
            <PresetCard
              active={p.auctionPreset === "pull_box"}
              icon={<Package className="h-4 w-4" />}
              label="Pull Box"
              hint="20 slots, $10 each. Random pulls."
              onClick={() => applyPreset("pull_box")}
            />
            <PresetCard
              active={p.auctionPreset === "mystery_pack"}
              icon={<Sparkles className="h-4 w-4" />}
              label="Mystery Pack"
              hint="12 packs, $5 each. Surprise hits."
              onClick={() => applyPreset("mystery_pack")}
            />
            <PresetCard
              active={p.auctionPreset === "custom"}
              icon={<Radio className="h-4 w-4" />}
              label="Custom"
              hint="Set every option yourself."
              onClick={() => applyPreset("custom")}
            />
          </div>

          <div className="space-y-2">
            <Field label="Starting bid ($)" hint="Lowest amount viewers can bid first.">
              <input
                type="number"
                min="1"
                inputMode="numeric"
                className="w-full rounded-xl bg-input px-4 py-3 text-base outline-none"
                value={p.startingBid}
                onChange={(e) => p.setStartingBid(e.target.value)}
              />
            </Field>
            <Field
              label="Bid timer (seconds)"
              hint="How long after each bid until the auction ends."
            >
              <div className="grid grid-cols-6 gap-1">
                {["5", "10", "15", "20", "30", "60"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => p.setDefaultTimerSec(s)}
                    className={`min-h-11 rounded-lg text-sm font-bold ${p.defaultTimerSec === s ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                  >
                    {s}s
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Min. bid increment ($)" hint="Smallest jump between bids.">
              <input
                type="number"
                min="1"
                inputMode="numeric"
                className="w-full rounded-xl bg-input px-4 py-3 text-base outline-none"
                value={p.minIncrement}
                onChange={(e) => p.setMinIncrement(e.target.value)}
              />
            </Field>
            <Field
              label="Default condition"
              hint="Used for auto-priced auctions during scan-to-start."
            >
              <div className="grid grid-cols-4 gap-1">
                {(["NM", "LP", "MP", "Damaged"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => p.setDefaultCondition(c)}
                    className={`min-h-11 rounded-lg text-sm font-bold ${p.defaultCondition === c ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </section>
      )}

      {p.step === 6 && (
        <section className="space-y-3 rounded-2xl border border-live/30 bg-live/5 p-4">
          <div>
            <h2 className="text-base font-bold">Ready to go live?</h2>
            <p className="text-xs text-muted-foreground">
              Quick preview before we start your stream.
            </p>
          </div>
          <ul className="space-y-2 rounded-xl bg-background/60 p-3 text-sm">
            <li className="flex justify-between gap-2">
              <span className="text-muted-foreground">Title</span>
              <span className="truncate font-semibold">{p.streamTitle || "—"}</span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-muted-foreground">Category</span>
              <span className="font-semibold">{p.streamCategory}</span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-muted-foreground">TCG tags</span>
              <span className="font-semibold">{p.tcgTags.join(", ") || "—"}</span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-muted-foreground">Method</span>
              <span className="font-semibold capitalize">{p.streamMethod}</span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-muted-foreground">Preset</span>
              <span className="font-semibold">{p.auctionPreset.replace("_", " ")}</span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-muted-foreground">Timer</span>
              <span className="font-semibold">{p.defaultTimerSec}s</span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-muted-foreground">Start bid</span>
              <span className="font-semibold">${p.startingBid}</span>
            </li>
          </ul>

          {/* Schedule vs Go Live now */}
          <div className="space-y-2 rounded-xl border border-border bg-background/60 p-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => p.setScheduledFor("")}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold ${
                  !p.scheduledFor
                    ? "bg-live text-live-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                🔴 Go live now
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!p.scheduledFor) {
                    const d = new Date(Date.now() + 60 * 60 * 1000);
                    d.setSeconds(0, 0);
                    const pad = (n: number) => String(n).padStart(2, "0");
                    p.setScheduledFor(
                      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
                    );
                  }
                }}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold ${
                  p.scheduledFor
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                📅 Schedule
              </button>
            </div>
            {p.scheduledFor && (
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold text-muted-foreground">
                  Date &amp; time
                </span>
                <input
                  type="datetime-local"
                  value={p.scheduledFor}
                  min={(() => {
                    const d = new Date();
                    const pad = (n: number) => String(n).padStart(2, "0");
                    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                  })()}
                  onChange={(e) => p.setScheduledFor(e.target.value)}
                  className="w-full rounded-md bg-input px-3 py-2 text-sm outline-none"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Followers will get notified and viewers can pre-bid before you go live.
                </p>
              </label>
            )}
            {p.scheduledFor && (
              <div className="space-y-2 rounded-lg bg-background/40 p-2">
                <span className="block text-[10px] font-bold text-muted-foreground">Repeat</span>
                <div className="grid grid-cols-4 gap-1">
                  {(["none", "daily", "weekly", "monthly"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => p.setRecurrence(r)}
                      className={`rounded-md px-2 py-1.5 text-[11px] font-bold capitalize ${
                        p.recurrence === r
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {r === "none" ? "Once" : r}
                    </button>
                  ))}
                </div>
                {p.recurrence !== "none" && (
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-bold text-muted-foreground">
                      Repeat until (optional)
                    </span>
                    <input
                      type="date"
                      value={p.recurrenceUntil}
                      onChange={(e) => p.setRecurrenceUntil(e.target.value)}
                      className="w-full rounded-md bg-input px-3 py-2 text-sm outline-none"
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Next show is auto-created when this one goes live. Sold cards are removed from the next Pre-B automatically.
                    </p>
                  </label>
                )}
              </div>
            )}
          </div>

          <button
            data-tour="start-stream"
            onClick={() => p.startLive()}
            className={`min-h-14 w-full rounded-2xl text-base font-extrabold ${
              p.scheduledFor
                ? "bg-primary text-primary-foreground"
                : "bg-live text-live-foreground"
            }`}
          >
            {p.scheduledFor ? "📅 Schedule Live" : "🔴 Start Live Stream"}
          </button>
        </section>
      )}

      {/* Nav buttons */}
      <div className="flex gap-2">
        {p.step > 1 && (
          <button
            type="button"
            onClick={() => p.setStep(p.step - 1)}
            className="flex min-h-12 flex-1 items-center justify-center gap-1 rounded-xl bg-muted text-sm font-bold"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
        )}
        {p.step < total && (
          <button
            type="button"
            disabled={!canNext}
            onClick={() => p.setStep(p.step + 1)}
            className="min-h-12 flex-[2] rounded-xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-40"
          >
            Continue → Step {p.step + 1}: {stepLabels[p.step]}
          </button>
        )}
      </div>
    </div>
  );
}

function MethodCard({
  active,
  icon,
  title,
  hint,
  badge,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  hint: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-3 rounded-xl border p-4 text-left ${active ? "border-primary bg-primary/10" : "border-border bg-muted/30"}`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${active ? "bg-primary text-primary-foreground" : "bg-muted"}`}
      >
        {icon}
      </span>
      <span className="flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-bold">{title}</span>
          {badge && (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-bold text-emerald-500">
              {badge}
            </span>
          )}
        </span>
        <span className="block text-[11px] text-muted-foreground">{hint}</span>
      </span>
      {active && <Check className="h-4 w-4 text-primary" />}
    </button>
  );
}

function PresetCard({
  active,
  icon,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left ${active ? "border-primary bg-primary/10" : "border-border bg-muted/30"}`}
    >
      <span className="flex items-center gap-1.5 text-sm font-bold">
        {icon} {label}
      </span>
      <span className="text-[10px] text-muted-foreground">{hint}</span>
    </button>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-[12px] font-bold">{label}</p>
      {hint && <p className="mb-2 text-[11px] text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}
