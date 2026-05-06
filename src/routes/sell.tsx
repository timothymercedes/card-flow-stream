import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { CardScanner } from "@/components/CardScanner";
import { ListingImageUpload } from "@/components/ListingImageUpload";
import { LISTING_CATEGORIES } from "@/lib/listingCategories";
import { toast } from "sonner";
import { Camera, Radio } from "lucide-react";
import { notifyGoingLive } from "@/server/push.functions";
import { StreamCategoryPicker } from "@/components/StreamCategoryPicker";
import type { StreamType, TcgTag } from "@/lib/streamTaxonomy";
import { useTour } from "@/components/MascotGuide";

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
  const nav = useNavigate();
  const { triggerOnce } = useTour();
  useEffect(() => { triggerOnce("seller-welcome"); }, [triggerOnce]);
  const [tab, setTab] = useState<"live" | "listing">("live");
  const [sellerStatus, setSellerStatus] = useState<string | null>(null);
  const [stripeReady, setStripeReady] = useState<boolean | null>(null);

  // Live form
  const [streamTitle, setStreamTitle] = useState("");
  const [streamDesc, setStreamDesc] = useState("");
  const [startingBid, setStartingBid] = useState("1");
  const [timerMin, setTimerMin] = useState("10");
  const [minIncrement, setMinIncrement] = useState("1");
  const [defaultCondition, setDefaultCondition] = useState<"NM"|"LP"|"MP"|"Damaged">("NM");
  const [quickStart, setQuickStart] = useState(true);
  const [defaultTimerSec, setDefaultTimerSec] = useState("30");
  const [useObs, setUseObs] = useState(false);
  const [useCompositor, setUseCompositor] = useState(false); // browser-side canvas compositor → WHIP
  // 🆕 Pre-live Mystery Break setup
  const [enableBreak, setEnableBreak] = useState(false);
  const [breakSlotCount, setBreakSlotCount] = useState("20");
  const [breakSlotPrice, setBreakSlotPrice] = useState("10");
  const [breakSlotPrefix, setBreakSlotPrefix] = useState("");
  const [streamCategory, setStreamCategory] = useState<string>("pokemon");
  const [pickerOpen, setPickerOpen] = useState(false);

  // Listing form — independent toggles
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [backImageUrl, setBackImageUrl] = useState(""); // 🆕 back of card (required)
  const [tcgNumber, setTcgNumber] = useState("");        // 🆕 card number (optional)
  const [tcgSet, setTcgSet] = useState("");               // 🆕 from AI ID
  const [tcgYear, setTcgYear] = useState("");             // 🆕 from AI ID
  const [condition, setCondition] = useState<Condition>("NM"); // 🆕 required
  const [condPrices, setCondPrices] = useState<ConditionPrices | null>(null); // 🆕 from AI ID
  const [identifying, setIdentifying] = useState(false); // 🆕 AI identify in-flight
  const [scanning, setScanning] = useState(false);       // 🆕 image scan modal
  const [enableBuyNow, setEnableBuyNow] = useState(true);
  const [enableAuction, setEnableAuction] = useState(false);
  const [enableOffers, setEnableOffers] = useState(false);
  const [buyNowPrice, setBuyNowPrice] = useState("");
  const [auctionStart, setAuctionStart] = useState("");
  const [auctionDays, setAuctionDays] = useState("3");
  const [shippingPrice, setShippingPrice] = useState("0");
  const [category, setCategory] = useState<string>("pokemon");

  // Load seller status
  useEffect(() => {
    if (user && sellerStatus === null) {
      supabase.from("profiles").select("seller_status").eq("id", user.id).maybeSingle().then(({ data }) => setSellerStatus((data as any)?.seller_status || "none"));
    }
    if (user && stripeReady === null) {
      supabase.from("stripe_accounts" as any).select("charges_enabled").eq("seller_id", user.id).maybeSingle().then(({ data }) => setStripeReady(!!(data as any)?.charges_enabled));
    }
  }, [user, sellerStatus, stripeReady]);

  // 🆕 Re-price the listing whenever the seller changes Condition (NM/LP/MP/Damaged).
  useEffect(() => {
    if (!condPrices) return;
    const base = Number(condPrices.NM) || 0;
    if (!base) return;
    setBuyNowPrice(String(priceFor(condition, base, condPrices)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [condition, condPrices]);

  if (!user) return (
    <AppShell>
      <div className="px-6 py-16 text-center">
        <h1 className="text-xl font-bold">Sell</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to sell.</p>
        <Link to="/auth" className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Sign In</Link>
      </div>
    </AppShell>
  );

  if (sellerStatus && sellerStatus !== "approved") return (
    <AppShell>
      <div className="px-6 py-16 text-center">
        <h1 className="text-xl font-bold">Seller application required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {sellerStatus === "pending" ? "Your application is awaiting admin approval." : "Apply to sell from your profile (verified ID + mailing address required)."}
        </p>
        <Link to="/profile" className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Go to Profile</Link>
      </div>
    </AppShell>
  );

  if (sellerStatus === "approved" && stripeReady === false) return (
    <AppShell>
      <div className="px-6 py-16 text-center">
        <h1 className="text-xl font-bold">Connect payouts to start selling</h1>
        <p className="mt-2 text-sm text-muted-foreground">You need to connect your Stripe account to receive payments before you can list or go live.</p>
        <Link to="/payouts" className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Connect Stripe</Link>
      </div>
    </AppShell>
  );

  async function ensureSeller() {
    if (!profile?.is_seller) await supabase.from("profiles").update({ is_seller: true }).eq("id", user!.id);
  }

  async function startLive(meta?: { stream_type: StreamType; tcg_tags: TcgTag[] }) {
    if (!streamTitle.trim()) return toast.error("Add a title");
    if (!meta) { setPickerOpen(true); return; }
    // Block if host already has an open (live or paused) stream
    const { data: openStream } = await supabase.from("live_streams")
      .select("id, mode, status").eq("seller_id", user!.id).in("status", ["live", "paused"]).maybeSingle();
    if (openStream) {
      toast.error(`You already have an open ${openStream.mode === "show_off" ? "Flex" : "live"} — end it first`);
      return;
    }
    await ensureSeller();
    // Timer never starts on go-live — only starts when seller hits "Start Auction" inside the live page
    const ends_at: string | null = null;

    // Optional: provision OBS / Cloudflare Stream input
    let cf: any = {};
    if (useObs || useCompositor) {
      const { data, error } = await supabase.functions.invoke("create-stream-input", { body: { meta_name: streamTitle } });
      if (error || (data as any)?.error) {
        toast.error("Could not set up Cloudflare Stream — check keys");
        return;
      }
      cf = {
        cf_live_input_id: (data as any).live_input_id,
        cf_rtmps_url: (data as any).rtmps_url,
        cf_stream_key: (data as any).stream_key,
        cf_playback_hls: (data as any).hls_url,
        cf_whip_url: (data as any).whip_url,
      };
    }

    const { data, error } = await supabase.from("live_streams").insert({
      seller_id: user!.id,
      title: streamTitle,
      category: streamCategory || null,
      stream_type: meta.stream_type,
      tcg_tags: meta.tcg_tags,
      item_description: streamDesc || null,
      listing_type: "auction",
      starting_bid: Number(startingBid) || 1,
      current_bid: Number(startingBid) || 1,
      current_item: streamTitle,
      min_bid_increment: Number(minIncrement) || 1,
      status: "live",
      is_active: true,
      started_at: new Date().toISOString(),
      ends_at,
      quick_start_enabled: quickStart,
      default_timer_sec: Number(defaultTimerSec) || 30,
      default_starting_bid: Number(startingBid) || 1,
      default_condition: defaultCondition,
      ...(enableBreak ? {
        break_mode: "open",
        break_slot_count: Math.max(2, Math.min(50, Number(breakSlotCount) || 20)),
        break_slot_prefix: breakSlotPrefix.trim() || null,
        break_teams: Array.from({ length: Math.max(2, Math.min(50, Number(breakSlotCount) || 20)) }, (_, i) => `${(breakSlotPrefix.trim() || "#")}${i + 1}`),
      } : {}),
      ...cf,
    }).select().single();
    if (error) return toast.error(error.message);
    // Fire-and-forget push to followers — never block navigation.
    notifyGoingLive({ data: { streamId: data.id } }).catch(() => {});
    nav({ to: "/live/$id", params: { id: data.id } });
  }

  async function createListing() {
    if (!title.trim()) return toast.error("Add a title");
    if (!imageUrl.trim()) return toast.error("Front photo is required");
    if (!backImageUrl.trim()) return toast.error("Back photo is required");
    if (!category) return toast.error("Pick a category");
    if (!enableBuyNow && !enableAuction && !enableOffers) return toast.error("Pick at least one sale type");
    if (enableBuyNow && (!buyNowPrice || Number(buyNowPrice) <= 0)) return toast.error("Set a Buy Now price");
    if (enableAuction && (!auctionStart || Number(auctionStart) <= 0)) return toast.error("Set a starting bid");
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
      auction_ends_at: auctionEnds,
    });
    if (error) return toast.error(error.message);
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
        body: { query: [q, tcgNumber && `#${tcgNumber}`, tcgSet && `set: ${tcgSet}`, tcgYear && `year: ${tcgYear}`].filter(Boolean).join(" ") },
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
  function onScanResult(r: { name: string; category: string; trend: string; image: string;
                            set?: string; year?: string; tcg_number?: string;
                            estimated_value?: number; condition_prices?: ConditionPrices }) {
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
      const parts = [d.category, d.set, d.year && `(${d.year})`, d.tcg_number && `#${d.tcg_number}`].filter(Boolean);
      if (parts.length) setDesc(parts.join(" • "));
    }
    const cp: ConditionPrices | null = d.condition_prices || null;
    setCondPrices(cp);
    const base = Number(d.estimated_value) || Number(cp?.NM) || 0;
    if (base) setBuyNowPrice(String(priceFor(condition, base, cp)));
    if (!imageUrl && d.name) {
      try {
        const { data: img } = await supabase.functions.invoke("generate-card-image", {
          body: { name: d.name, category: d.category, set: d.set, year: d.year, tcg_number: d.tcg_number || tcgNumber },
        });
        if (img?.image) { setImageUrl(img.image); toast.success("Card image generated"); }
      } catch { /* ignore */ }
    }
  }



  const Toggle = ({ label, hint, on, set }: { label: string; hint?: string; on: boolean; set: (v: boolean) => void }) => (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl bg-card p-3">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="mt-1 h-5 w-5" />
    </label>
  );

  return (
    <AppShell>
      <div className="px-4 py-4">
        <h1 className="mb-4 text-2xl font-bold">Sell</h1>
        <div className="mb-4 flex rounded-xl bg-card p-1">
          <button onClick={() => setTab("live")} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tab === "live" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Go Live</button>
          <button onClick={() => setTab("listing")} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tab === "listing" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>List Item</button>
        </div>

        {tab === "live" ? (
          <div className="space-y-3">
            <input className="w-full rounded-xl bg-input px-4 py-3 text-sm outline-none" placeholder="Stream title" value={streamTitle} onChange={(e) => setStreamTitle(e.target.value)} />
            {/* 🆕 Quick preset chips — tap to add hype tags / standard formats to the title */}
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Quick tags — tap to add</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "$1 Start", emoji: "💵", apply: () => { setStartingBid("1"); return "$1 Start"; } },
                  { label: "Vintage Holo", emoji: "✨", apply: () => "Vintage Holo" },
                  { label: "Mystery Break", emoji: "🎁", apply: () => { setEnableBreak(true); return "Mystery Break"; } },
                  { label: "Slab Sunday", emoji: "🧊", apply: () => "Slab Sunday" },
                  { label: "PSA 10s Only", emoji: "🏆", apply: () => "PSA 10s Only" },
                  { label: "No Reserve", emoji: "🔥", apply: () => "No Reserve" },
                  { label: "Rookie Cards", emoji: "🌟", apply: () => "Rookie Cards" },
                  { label: "Modern Chase", emoji: "⚡", apply: () => "Modern Chase" },
                  { label: "Graded Only", emoji: "🛡️", apply: () => "Graded Only" },
                  { label: "Personal Collection", emoji: "💎", apply: () => "Personal Collection" },
                  { label: "10s Auction", emoji: "⏱️", apply: () => { setDefaultTimerSec("10"); return "10s Auctions"; } },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      const tag = p.apply();
                      setStreamTitle((t) => (t.toLowerCase().includes(tag.toLowerCase()) ? t : `${t ? t + " • " : ""}${tag}`).slice(0, 80));
                    }}
                    className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold hover:border-primary hover:bg-primary/10"
                  >
                    {p.emoji} {p.label}
                  </button>
                ))}
              </div>
            </div>
            <textarea className="w-full resize-none rounded-xl bg-input px-4 py-3 text-sm outline-none" rows={2} placeholder="Item description (optional)" value={streamDesc} onChange={(e) => setStreamDesc(e.target.value)} />
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Category — helps viewers find your stream</span>
              <select value={streamCategory} onChange={(e) => setStreamCategory(e.target.value)} className="w-full rounded-xl bg-input px-4 py-3 text-sm outline-none">
                {LISTING_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>)}
              </select>
            </label>
            <input type="number" min="1" className="w-full rounded-xl bg-input px-4 py-3 text-sm outline-none" placeholder="Starting price ($)" value={startingBid} onChange={(e) => setStartingBid(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" min="0" className="rounded-xl bg-input px-4 py-3 text-sm outline-none" placeholder="Timer (min)" value={timerMin} onChange={(e) => setTimerMin(e.target.value)} />
              <input type="number" min="1" className="rounded-xl bg-input px-4 py-3 text-sm outline-none" placeholder="Min bid increment ($)" value={minIncrement} onChange={(e) => setMinIncrement(e.target.value)} />
            </div>
            <div className="rounded-xl bg-card p-3 space-y-2">
              <label className="flex items-center justify-between text-xs font-semibold">
                <span>⚡ Scan-to-start (run bids hands-free)</span>
                <input type="checkbox" checked={quickStart} onChange={(e) => setQuickStart(e.target.checked)} className="h-4 w-4" />
              </label>
              <p className="text-[10px] text-muted-foreground">When ON: scanning a card during the live stream instantly starts an auction with the defaults below.</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] text-muted-foreground">
                  Default timer
                  <select value={defaultTimerSec} onChange={(e) => setDefaultTimerSec(e.target.value)} className="mt-1 w-full rounded-lg bg-input px-3 py-2 text-sm">
                    {["5","10","15","20","30","60"].map((s) => <option key={s} value={s}>{s}s</option>)}
                  </select>
                </label>
                <label className="text-[10px] text-muted-foreground">
                  Default condition
                  <div className="mt-1 grid grid-cols-4 gap-1">
                    {(["NM","LP","MP","Damaged"] as const).map((c) => (
                      <button key={c} type="button" onClick={() => setDefaultCondition(c)}
                        className={`rounded px-1 py-1 text-[10px] font-bold ${defaultCondition === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{c}</button>
                    ))}
                  </div>
                </label>
              </div>
            </div>

            {/* OBS / Pro broadcaster toggle */}
            <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl bg-card p-3">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-semibold"><Radio className="h-4 w-4 text-primary" /> Broadcast from OBS / Streamlabs</p>
                <p className="text-[11px] text-muted-foreground">Pro mode: get an RTMPS URL + stream key to use in OBS.</p>
              </div>
              <input type="checkbox" checked={useObs} onChange={(e) => { setUseObs(e.target.checked); if (e.target.checked) setUseCompositor(false); }} className="mt-1 h-5 w-5" />
            </label>

            <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl bg-card p-3">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-semibold"><Camera className="h-4 w-4 text-fuchsia-400" /> Multi-cam in-browser (composited)</p>
                <p className="text-[11px] text-muted-foreground">Broadcast from this browser with all co-host video tiles baked into one stream — viewers + recording see everyone.</p>
              </div>
              <input type="checkbox" checked={useCompositor} onChange={(e) => { setUseCompositor(e.target.checked); if (e.target.checked) setUseObs(false); }} className="mt-1 h-5 w-5" />
            </label>

            <button onClick={() => startLive()} className="w-full rounded-xl bg-live py-3 text-sm font-bold text-live-foreground">🔴 Start Live Stream</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input className="flex-1 rounded-xl bg-input px-4 py-3 text-sm outline-none" placeholder="Item title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <button type="button" onClick={() => setScanning(true)}
                className="flex items-center gap-1 rounded-xl bg-primary px-3 py-3 text-xs font-bold text-primary-foreground"
                title="Scan card with camera (same engine as Vault)">
                <Camera className="h-3.5 w-3.5" /> Scan
              </button>
              <button type="button" onClick={aiIdentify} disabled={identifying}
                className="rounded-xl bg-accent px-3 py-3 text-xs font-bold text-accent-foreground disabled:opacity-50">
                {identifying ? "…" : "✨ AI ID"}
              </button>
            </div>
            <p className="-mt-1 text-[10px] text-muted-foreground">
              Tap <b>Scan</b> to identify by photo (same as your Vault), or type a name + tap <b>AI ID</b>. Pricing adjusts for condition automatically.
            </p>
            <textarea className="w-full resize-none rounded-xl bg-input px-4 py-3 text-sm outline-none" rows={3} placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
            <div className="grid grid-cols-3 gap-2">
              <input className="rounded-xl bg-input px-3 py-3 text-xs outline-none" placeholder="Set" value={tcgSet} onChange={(e) => setTcgSet(e.target.value)} />
              <input className="rounded-xl bg-input px-3 py-3 text-xs outline-none" placeholder="Year" value={tcgYear} onChange={(e) => setTcgYear(e.target.value)} />
              <input className="rounded-xl bg-input px-3 py-3 text-xs outline-none" placeholder="# (e.g. 4/102)" value={tcgNumber} onChange={(e) => setTcgNumber(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ListingImageUpload value={imageUrl} onChange={setImageUrl} label="Front photo *" />
              <ListingImageUpload value={backImageUrl} onChange={setBackImageUrl} label="Back photo *" />
            </div>
            <label className="block">
              <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Category *</p>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl bg-input px-4 py-3 text-sm outline-none"
              >
                {LISTING_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>
                ))}
              </select>
            </label>
            <div>
              <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Condition (required)</p>
              <div className="grid grid-cols-4 gap-1">
                {(["NM","LP","MP","Damaged"] as const).map((c) => (
                  <button key={c} type="button" onClick={() => setCondition(c)}
                    className={`rounded-lg py-2 text-xs font-bold ${condition === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{c}</button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">Sale options (pick any combination)</p>
              <div className="space-y-2">
                <Toggle label="Buy Now" hint="Set a fixed price buyers can pay instantly." on={enableBuyNow} set={setEnableBuyNow} />
                {enableBuyNow && (
                  <input type="number" min="0" step="0.01" className="w-full rounded-xl bg-input px-4 py-3 text-sm outline-none" placeholder="Buy Now price ($)" value={buyNowPrice} onChange={(e) => setBuyNowPrice(e.target.value)} />
                )}
                <Toggle label="Auction" hint="Buyers place bids. Highest at end-time wins." on={enableAuction} set={setEnableAuction} />
                {enableAuction && (
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" min="0" step="0.01" className="rounded-xl bg-input px-4 py-3 text-sm outline-none" placeholder="Starting bid ($)" value={auctionStart} onChange={(e) => setAuctionStart(e.target.value)} />
                    <select value={auctionDays} onChange={(e) => setAuctionDays(e.target.value)} className="rounded-xl bg-input px-4 py-3 text-sm outline-none">
                      <option value="1">1 day</option>
                      <option value="3">3 days</option>
                      <option value="5">5 days</option>
                      <option value="7">7 days</option>
                    </select>
                  </div>
                )}
                <Toggle label="Accept Offers" hint="Buyers can send custom offers (>$1)." on={enableOffers} set={setEnableOffers} />
              </div>
            </div>

            <input type="number" min="0" step="0.01" className="w-full rounded-xl bg-input px-4 py-3 text-sm outline-none" placeholder="Shipping price ($) — 0 for free" value={shippingPrice} onChange={(e) => setShippingPrice(e.target.value)} />
            <button onClick={createListing} className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground">Create Listing</button>
          </div>
        )}
      </div>
      {scanning && (
        <CardScanner allowMulti={false} onClose={() => setScanning(false)} onResult={onScanResult} />
      )}
      <StreamCategoryPicker
        open={pickerOpen}
        onCancel={() => setPickerOpen(false)}
        onConfirm={(v) => { setPickerOpen(false); startLive(v); }}
      />
    </AppShell>
  );
}
