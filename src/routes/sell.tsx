import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { toast } from "sonner";
import { Radio } from "lucide-react";
import { notifyGoingLive } from "@/server/push.functions";

export const Route = createFileRoute("/sell")({ component: Sell });

function Sell() {
  const { user, profile } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState<"live" | "listing">("live");
  const [sellerStatus, setSellerStatus] = useState<string | null>(null);

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
  // 🆕 Pre-live Mystery Break setup
  const [enableBreak, setEnableBreak] = useState(false);
  const [breakSlotCount, setBreakSlotCount] = useState("20");
  const [breakSlotPrice, setBreakSlotPrice] = useState("10");
  const [breakSlotPrefix, setBreakSlotPrefix] = useState("");

  // Listing form — independent toggles
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [backImageUrl, setBackImageUrl] = useState(""); // 🆕 back of card (required)
  const [tcgNumber, setTcgNumber] = useState("");        // 🆕 card number (optional)
  const [condition, setCondition] = useState<"NM"|"LP"|"MP"|"Damaged">("NM"); // 🆕 required
  const [identifying, setIdentifying] = useState(false); // 🆕 AI identify in-flight
  const [enableBuyNow, setEnableBuyNow] = useState(true);
  const [enableAuction, setEnableAuction] = useState(false);
  const [enableOffers, setEnableOffers] = useState(false);
  const [buyNowPrice, setBuyNowPrice] = useState("");
  const [auctionStart, setAuctionStart] = useState("");
  const [auctionDays, setAuctionDays] = useState("3");
  const [shippingPrice, setShippingPrice] = useState("0");

  // Load seller status
  if (user && sellerStatus === null) {
    supabase.from("profiles").select("seller_status").eq("id", user.id).maybeSingle().then(({ data }) => setSellerStatus((data as any)?.seller_status || "none"));
  }

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

  async function ensureSeller() {
    if (!profile?.is_seller) await supabase.from("profiles").update({ is_seller: true }).eq("id", user!.id);
  }

  async function startLive() {
    if (!streamTitle.trim()) return toast.error("Add a title");
    await ensureSeller();
    const minutes = Number(timerMin) || 0;
    const ends_at = minutes > 0 ? new Date(Date.now() + minutes * 60 * 1000).toISOString() : null;

    // Optional: provision OBS / Cloudflare Stream input
    let cf: any = {};
    if (useObs) {
      const { data, error } = await supabase.functions.invoke("create-stream-input", { body: { meta_name: streamTitle } });
      if (error || (data as any)?.error) {
        toast.error("Could not set up OBS streaming — check Cloudflare keys");
        return;
      }
      cf = {
        cf_live_input_id: (data as any).live_input_id,
        cf_rtmps_url: (data as any).rtmps_url,
        cf_stream_key: (data as any).stream_key,
        cf_playback_hls: (data as any).hls_url,
      };
    }

    const { data, error } = await supabase.from("live_streams").insert({
      seller_id: user!.id,
      title: streamTitle,
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

  // 🆕 AI identify — same flow as the Vault: identifies the card, fills in details,
  // suggests a price for the selected condition, and (if no front photo yet) auto-generates one.
  async function aiIdentify() {
    const q = title.trim() || desc.trim() || tcgNumber.trim();
    if (!q) return toast.error("Type a card name, number, or description first");
    setIdentifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("identify-card", {
        body: { query: [q, tcgNumber && `#${tcgNumber}`].filter(Boolean).join(" ") },
      });
      if (error) throw error;
      const d: any = data || {};
      if (d.name) setTitle(d.name);
      if (d.tcg_number && !tcgNumber) setTcgNumber(d.tcg_number);
      // Build a richer description if the user hasn't typed one.
      if (!desc.trim()) {
        const parts = [d.category, d.set, d.year && `(${d.year})`, d.tcg_number && `#${d.tcg_number}`].filter(Boolean);
        if (parts.length) setDesc(parts.join(" • "));
      }
      // Suggest a buy-now price for the chosen condition from condition_prices map (NM/LP/MP/Damaged).
      const cp = d.condition_prices || {};
      const suggested = Number(cp[condition]) || Number(d.estimated_value) || 0;
      if (suggested && !buyNowPrice) setBuyNowPrice(String(suggested));
      // Auto-generate a front image if missing.
      if (!imageUrl) {
        try {
          const { data: img } = await supabase.functions.invoke("generate-card-image", {
            body: { name: d.name || title, category: d.category, set: d.set, year: d.year, tcg_number: d.tcg_number || tcgNumber },
          });
          if (img?.image) { setImageUrl(img.image); toast.success("Card image generated"); }
        } catch { /* ignore */ }
      }
      toast.success(`Identified: ${d.name || q}${d.set ? ` • ${d.set}` : ""}`);
    } catch (e: any) {
      toast.error(e.message || "Identify failed");
    } finally {
      setIdentifying(false);
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
            <textarea className="w-full resize-none rounded-xl bg-input px-4 py-3 text-sm outline-none" rows={2} placeholder="Item description (optional)" value={streamDesc} onChange={(e) => setStreamDesc(e.target.value)} />
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
                <p className="text-[11px] text-muted-foreground">Pro mode: get an RTMPS URL + stream key to use in OBS instead of the in-app camera.</p>
              </div>
              <input type="checkbox" checked={useObs} onChange={(e) => setUseObs(e.target.checked)} className="mt-1 h-5 w-5" />
            </label>

            <button onClick={startLive} className="w-full rounded-xl bg-live py-3 text-sm font-bold text-live-foreground">🔴 Start Live Stream</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input className="flex-1 rounded-xl bg-input px-4 py-3 text-sm outline-none" placeholder="Item title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <button type="button" onClick={aiIdentify} disabled={identifying}
                className="rounded-xl bg-accent px-3 py-3 text-xs font-bold text-accent-foreground disabled:opacity-50">
                {identifying ? "…" : "✨ AI ID"}
              </button>
            </div>
            <textarea className="w-full resize-none rounded-xl bg-input px-4 py-3 text-sm outline-none" rows={3} placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
            <input className="w-full rounded-xl bg-input px-4 py-3 text-sm outline-none" placeholder="Card number (optional, e.g. 4/102)" value={tcgNumber} onChange={(e) => setTcgNumber(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <input className="rounded-xl bg-input px-3 py-3 text-xs outline-none" placeholder="Front photo URL *" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
              <input className="rounded-xl bg-input px-3 py-3 text-xs outline-none" placeholder="Back photo URL *" value={backImageUrl} onChange={(e) => setBackImageUrl(e.target.value)} />
            </div>
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
    </AppShell>
  );
}
