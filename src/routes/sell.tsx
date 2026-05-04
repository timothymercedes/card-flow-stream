import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { toast } from "sonner";

export const Route = createFileRoute("/sell")({ component: Sell });

type ListingType = "buy_now" | "auction" | "offer";

function Sell() {
  const { user, profile } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState<"live" | "listing">("live");
  const [sellerStatus, setSellerStatus] = useState<string | null>(null);

  // Live form
  const [streamTitle, setStreamTitle] = useState("");
  const [streamDesc, setStreamDesc] = useState("");
  const [streamType, setStreamType] = useState<ListingType>("auction");
  const [startingBid, setStartingBid] = useState("1");
  const [timerMin, setTimerMin] = useState("10");
  const [minIncrement, setMinIncrement] = useState("1");
  const [defaultCondition, setDefaultCondition] = useState<"NM"|"LP"|"MP"|"Damaged">("NM");
  const [quickStart, setQuickStart] = useState(true);
  const [defaultTimerSec, setDefaultTimerSec] = useState("30");

  // Listing form
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [price, setPrice] = useState("");
  const [listingType, setListingType] = useState<ListingType>("buy_now");
  const [acceptsOffers, setAcceptsOffers] = useState(false);
  const [auctionDays, setAuctionDays] = useState("3");

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
    const ends_at = streamType === "auction" && minutes > 0 ? new Date(Date.now() + minutes * 60 * 1000).toISOString() : null;
    const { data, error } = await supabase.from("live_streams").insert({
      seller_id: user!.id,
      title: streamTitle,
      item_description: streamDesc || null,
      listing_type: streamType,
      starting_bid: Number(startingBid) || 1,
      current_bid: Number(startingBid) || 1,
      current_item: streamTitle,
      min_bid_increment: Number(minIncrement) || 1,
      status: "live",
      is_active: true,
      started_at: new Date().toISOString(),
      ends_at,
    }).select().single();
    if (error) return toast.error(error.message);
    nav({ to: "/live/$id", params: { id: data.id } });
  }

  async function createListing() {
    if (!title.trim()) return toast.error("Add a title");
    await ensureSeller();
    const amt = Number(price) || 0;
    const auctionEnds = listingType === "auction" ? new Date(Date.now() + Number(auctionDays) * 24 * 60 * 60 * 1000).toISOString() : null;
    const { error } = await supabase.from("listings").insert({
      seller_id: user!.id,
      title,
      description: desc,
      image_url: imageUrl || null,
      listing_type: listingType,
      is_auction: listingType === "auction",
      accepts_offers: listingType === "offer" ? true : acceptsOffers,
      starting_bid: listingType === "auction" ? amt : null,
      current_bid: listingType === "auction" ? amt : null,
      price: listingType !== "auction" ? amt : null,
      auction_ends_at: auctionEnds,
    });
    if (error) return toast.error(error.message);
    toast.success("Listing created");
    nav({ to: "/market" });
  }

  const TypeBtn = ({ v, label, set, cur }: { v: ListingType; label: string; set: (v: ListingType) => void; cur: ListingType }) => (
    <button type="button" onClick={() => set(v)} className={`flex-1 rounded-lg py-2 text-xs font-semibold ${cur === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{label}</button>
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
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Listing type</p>
              <div className="flex gap-2">
                <TypeBtn v="buy_now" label="Buy Now" set={setStreamType} cur={streamType} />
                <TypeBtn v="auction" label="Auction" set={setStreamType} cur={streamType} />
                <TypeBtn v="offer" label="Offers" set={setStreamType} cur={streamType} />
              </div>
            </div>
            <input type="number" min="1" className="w-full rounded-xl bg-input px-4 py-3 text-sm outline-none" placeholder="Starting price ($)" value={startingBid} onChange={(e) => setStartingBid(e.target.value)} />
            {streamType === "auction" && (
              <div className="grid grid-cols-2 gap-2">
                <input type="number" min="0" className="rounded-xl bg-input px-4 py-3 text-sm outline-none" placeholder="Timer (min)" value={timerMin} onChange={(e) => setTimerMin(e.target.value)} />
                <input type="number" min="1" className="rounded-xl bg-input px-4 py-3 text-sm outline-none" placeholder="Min bid increment ($)" value={minIncrement} onChange={(e) => setMinIncrement(e.target.value)} />
              </div>
            )}
            <button onClick={startLive} className="w-full rounded-xl bg-live py-3 text-sm font-bold text-live-foreground">🔴 Start Live Stream</button>
          </div>
        ) : (
          <div className="space-y-3">
            <input className="w-full rounded-xl bg-input px-4 py-3 text-sm outline-none" placeholder="Item title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea className="w-full resize-none rounded-xl bg-input px-4 py-3 text-sm outline-none" rows={3} placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
            <input className="w-full rounded-xl bg-input px-4 py-3 text-sm outline-none" placeholder="Image URL (optional)" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Listing type</p>
              <div className="flex gap-2">
                <TypeBtn v="buy_now" label="Buy Now" set={setListingType} cur={listingType} />
                <TypeBtn v="auction" label="Auction" set={setListingType} cur={listingType} />
                <TypeBtn v="offer" label="Make Offer" set={setListingType} cur={listingType} />
              </div>
            </div>
            {listingType === "buy_now" && (
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={acceptsOffers} onChange={(e) => setAcceptsOffers(e.target.checked)} className="h-4 w-4" />
                Also accept offers
              </label>
            )}
            {listingType === "auction" && (
              <select value={auctionDays} onChange={(e) => setAuctionDays(e.target.value)} className="w-full rounded-xl bg-input px-4 py-3 text-sm outline-none">
                <option value="1">1 day</option>
                <option value="3">3 days</option>
                <option value="5">5 days</option>
                <option value="7">7 days</option>
              </select>
            )}
            <input type="number" className="w-full rounded-xl bg-input px-4 py-3 text-sm outline-none" placeholder={listingType === "auction" ? "Starting bid ($)" : "Price ($)"} value={price} onChange={(e) => setPrice(e.target.value)} />
            <button onClick={createListing} className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground">Create Listing</button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
