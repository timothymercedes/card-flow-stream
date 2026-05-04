import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, MessageCircle, Timer } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/market/$id")({ component: ListingDetail });

function fmtCountdown(ms: number) {
  if (ms <= 0) return "Ended";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${ss}s`;
  return `${m}m ${ss.toString().padStart(2, "0")}s`;
}

function ListingDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const { user, profile } = useAuth();
  const [listing, setListing] = useState<any>(null);
  const [seller, setSeller] = useState<any>(null);
  const [bids, setBids] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [bidAmt, setBidAmt] = useState("");
  const [offerAmt, setOfferAmt] = useState("");
  const [now, setNow] = useState(Date.now());

  // shipping
  const [showShip, setShowShip] = useState(false);
  const [ship, setShip] = useState({ name: "", address: "", city: "", state: "", zip: "", country: "US" });

  async function load() {
    const { data: l } = await supabase.from("listings").select("*").eq("id", id).maybeSingle();
    setListing(l);
    if (l) {
      const [{ data: s }, { data: bs }, { data: os }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", l.seller_id).maybeSingle(),
        supabase.from("listing_bids").select("*").eq("listing_id", id).order("created_at", { ascending: false }),
        supabase.from("offers").select("*").eq("listing_id", id).order("created_at", { ascending: false }),
      ]);
      setSeller(s);
      setBids(bs || []);
      setOffers(os || []);
    }
  }
  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function placeBid() {
    if (!profile) return toast.error("Sign in first");
    const amt = Number(bidAmt);
    if (!amt || amt <= Number(listing.current_bid || 0)) return toast.error("Bid must be higher");
    if (listing.auction_ends_at && new Date(listing.auction_ends_at).getTime() <= Date.now()) return toast.error("Auction ended");
    await supabase.from("listing_bids").insert({ listing_id: id, user_id: profile.id, username: profile.username, amount: amt });
    await supabase.from("listings").update({ current_bid: amt, top_bidder_id: profile.id }).eq("id", id);
    await supabase.from("notifications").insert({ user_id: listing.seller_id, type: "bid", body: `@${profile.username} bid $${amt} on "${listing.title}"`, link: `/market/${id}` });
    setBidAmt(""); load(); toast.success("Bid placed");
  }

  async function makeOffer() {
    if (!profile) return toast.error("Sign in first");
    const amt = Number(offerAmt);
    if (!amt || amt <= 1) return toast.error("Offer must be more than $1");
    // Dedupe: same buyer can't repeat the same exact amount that's still pending
    const dup = offers.find((o) => o.buyer_id === profile.id && Number(o.amount) === amt && o.status === "pending");
    if (dup) return toast.error("You already offered that amount");
    const { error } = await supabase.from("offers").insert({
      listing_id: id, buyer_id: profile.id, buyer_username: profile.username, seller_id: listing.seller_id, amount: amt,
    });
    if (error) {
      if (error.message?.includes("greater than $1")) return toast.error("Offer must be more than $1");
      if (error.code === "23505") return toast.error("You already offered that amount");
      return toast.error(error.message);
    }
    await supabase.from("notifications").insert({ user_id: listing.seller_id, type: "offer", body: `@${profile.username} offered $${amt} on "${listing.title}"`, link: `/market/${id}` });
    setOfferAmt(""); load(); toast.success("Offer sent");
  }

  async function buyNow() {
    if (!profile) return toast.error("Sign in first");
    setShowShip(true);
  }

  async function placeOrder(amount: number) {
    if (!ship.name || !ship.address || !ship.city || !ship.zip) return toast.error("Fill shipping address");
    const { error } = await supabase.from("orders").insert({
      listing_id: id, buyer_id: profile!.id, seller_id: listing.seller_id,
      title: listing.title, amount,
      ship_name: ship.name, ship_address: ship.address, ship_city: ship.city, ship_state: ship.state, ship_zip: ship.zip, ship_country: ship.country,
    });
    if (error) return toast.error(error.message);
    await supabase.from("notifications").insert({ user_id: listing.seller_id, type: "order", body: `New order from @${profile!.username} for "${listing.title}"`, link: "/orders" });
    toast.success("Order placed!");
    setShowShip(false);
    nav({ to: "/orders" });
  }

  async function respondOffer(o: any, status: "accepted" | "rejected") {
    await supabase.from("offers").update({ status }).eq("id", o.id);
    await supabase.from("notifications").insert({ user_id: o.buyer_id, type: "offer", body: `Your offer of $${o.amount} on "${listing.title}" was ${status}`, link: `/market/${id}` });
    load();
  }

  async function acceptTopBidBelowReserve() {
    if (!listing?.top_bidder_id || !listing?.current_bid) return toast.error("No bids yet");
    await supabase.from("listings").update({ auction_status: "accepted_below_reserve" }).eq("id", id);
    await supabase.from("notifications").insert({
      user_id: listing.top_bidder_id, type: "bid",
      body: `Seller accepted your $${listing.current_bid} bid on "${listing.title}" — complete checkout!`,
      link: `/market/${id}`,
    });
    toast.success("Top bidder notified");
    load();
  }

  if (!listing) return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Loading...</div>;

  const isSeller = user?.id === listing.seller_id;
  const type: string = listing.listing_type || (listing.is_auction ? "auction" : "buy_now");
  const endsMs = listing.auction_ends_at ? new Date(listing.auction_ends_at).getTime() - now : 0;
  const auctionEnded = type === "auction" && !!listing.auction_ends_at && endsMs <= 0;
  const reserveMet = !listing.reserve_price || Number(listing.current_bid || 0) >= Number(listing.reserve_price);

  return (
    <div className="mx-auto min-h-screen max-w-md bg-background pb-8">
      <div className="relative aspect-square bg-muted">
        {listing.image_url ? <img src={listing.image_url} className="h-full w-full object-cover" alt={listing.title} /> : <div className="h-full w-full bg-gradient-to-br from-primary/20 to-accent" />}
        <Link to="/market" className="absolute left-3 top-3 rounded-full bg-black/50 p-2 backdrop-blur"><ArrowLeft className="h-4 w-4 text-white" /></Link>
      </div>
      <div className="px-4 py-4">
        <h1 className="text-xl font-bold">{listing.title}</h1>
        <div className="mt-1 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">@{seller?.username || "seller"}</p>
          {!isSeller && seller && (
            <Link to="/messages/$userId" params={{ userId: seller.id }} className="flex items-center gap-1 text-xs font-semibold text-primary"><MessageCircle className="h-3 w-3" /> Message</Link>
          )}
        </div>
        {listing.description && <p className="mt-3 text-sm">{listing.description}</p>}

        <div className="mt-4 space-y-3 rounded-xl bg-card p-4">
          {type === "auction" ? (
            <>
              <div>
                <p className="text-xs text-muted-foreground">Current Bid</p>
                <p className="text-2xl font-bold text-primary">${Number(listing.current_bid || 0).toFixed(0)}</p>
                {listing.reserve_price && (
                  <p className={`text-[10px] font-semibold ${reserveMet ? "text-primary" : "text-muted-foreground"}`}>
                    {reserveMet ? "✓ Reserve met" : `Reserve not met (min $${Number(listing.reserve_price).toFixed(0)})`}
                  </p>
                )}
                {listing.auction_ends_at && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-bold text-live">
                    <Timer className="h-3 w-3" /> {fmtCountdown(endsMs)}
                  </p>
                )}
              </div>
              {!isSeller && !auctionEnded && (
                <div className="flex gap-2">
                  <input type="number" placeholder="Your bid" value={bidAmt} onChange={(e) => setBidAmt(e.target.value)} className="flex-1 rounded-xl bg-input px-3 py-2.5 text-sm outline-none" />
                  <button onClick={placeBid} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Bid</button>
                </div>
              )}
              {auctionEnded && !reserveMet && isSeller && listing.auction_status === "active" && (
                <div className="rounded-lg bg-yellow-500/10 p-3 text-xs">
                  <p className="font-semibold text-yellow-600">Auction ended below your reserve.</p>
                  <p className="mt-1 text-muted-foreground">Top bid: ${Number(listing.current_bid || 0).toFixed(0)}. Accept it or let it expire.</p>
                  <button onClick={acceptTopBidBelowReserve} className="mt-2 w-full rounded-lg bg-primary py-2 font-bold text-primary-foreground">Accept top bid</button>
                </div>
              )}
              {auctionEnded && !reserveMet && !isSeller && (
                <p className="rounded-lg bg-muted/40 p-2 text-[11px] text-muted-foreground">Reserve not met — waiting on seller.</p>
              )}
            </>

          ) : (
            <>
              <div>
                <p className="text-xs text-muted-foreground">Price</p>
                <p className="text-2xl font-bold text-primary">${Number(listing.price || 0).toFixed(2)}</p>
              </div>
              {!isSeller && type === "buy_now" && <button onClick={buyNow} className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground">Buy Now</button>}
            </>
          )}

          {!isSeller && (type === "offer" || listing.accepts_offers) && (
            <div className="border-t border-border pt-3">
              <p className="mb-2 text-xs text-muted-foreground">Make an offer</p>
              <div className="flex gap-2">
                <input type="number" placeholder="Your offer" value={offerAmt} onChange={(e) => setOfferAmt(e.target.value)} className="flex-1 rounded-xl bg-input px-3 py-2.5 text-sm outline-none" />
                <button onClick={makeOffer} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground">Offer</button>
              </div>
            </div>
          )}
        </div>

        {showShip && (
          <div className="mt-4 space-y-2 rounded-xl bg-card p-4">
            <p className="text-sm font-bold">Shipping address</p>
            <input className="w-full rounded-lg bg-input px-3 py-2 text-sm" placeholder="Full name" value={ship.name} onChange={(e) => setShip({ ...ship, name: e.target.value })} />
            <input className="w-full rounded-lg bg-input px-3 py-2 text-sm" placeholder="Street address" value={ship.address} onChange={(e) => setShip({ ...ship, address: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input className="rounded-lg bg-input px-3 py-2 text-sm" placeholder="City" value={ship.city} onChange={(e) => setShip({ ...ship, city: e.target.value })} />
              <input className="rounded-lg bg-input px-3 py-2 text-sm" placeholder="State" value={ship.state} onChange={(e) => setShip({ ...ship, state: e.target.value })} />
              <input className="rounded-lg bg-input px-3 py-2 text-sm" placeholder="ZIP" value={ship.zip} onChange={(e) => setShip({ ...ship, zip: e.target.value })} />
              <input className="rounded-lg bg-input px-3 py-2 text-sm" placeholder="Country" value={ship.country} onChange={(e) => setShip({ ...ship, country: e.target.value })} />
            </div>
            <button onClick={() => placeOrder(Number(listing.price || 0))} className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground">Place Order</button>
          </div>
        )}

        {isSeller && offers.length > 0 && (
          <div className="mt-4">
            <h2 className="mb-2 text-sm font-bold">Offers</h2>
            <div className="space-y-2">
              {offers.map((o) => (
                <div key={o.id} className="flex items-center justify-between rounded-xl bg-card p-3 text-sm">
                  <div>
                    <p className="font-semibold">@{o.buyer_username} — ${Number(o.amount).toFixed(0)}</p>
                    <p className="text-[10px] capitalize text-muted-foreground">{o.status}</p>
                  </div>
                  {o.status === "pending" && (
                    <div className="flex gap-1">
                      <button onClick={() => respondOffer(o, "accepted")} className="rounded-lg bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">Accept</button>
                      <button onClick={() => respondOffer(o, "rejected")} className="rounded-lg bg-muted px-3 py-1 text-xs">Reject</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {type === "auction" && bids.length > 0 && (
          <div className="mt-4">
            <h2 className="mb-2 text-sm font-bold">Bid History</h2>
            <div className="space-y-1 rounded-xl bg-card p-3">
              {bids.map((b) => (
                <div key={b.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">@{b.username}</span>
                  <span className="font-semibold">${Number(b.amount).toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
