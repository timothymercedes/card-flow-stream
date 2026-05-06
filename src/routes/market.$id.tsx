import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, MessageCircle, Timer, Pencil } from "lucide-react";
import { ReportDialog } from "@/components/ReportDialog";
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
  const [unpaidOrders, setUnpaidOrders] = useState(0);
  const [qty, setQty] = useState(1);
  const [cartMode, setCartMode] = useState<"buy" | "cart">("buy");

  useEffect(() => {
    if (!user) { setUnpaidOrders(0); return; }
    supabase.from("orders").select("id", { count: "exact", head: true })
      .eq("buyer_id", user.id).eq("payment_status", "awaiting_payment")
      .then(({ count }) => setUnpaidOrders(count ?? 0));
  }, [user?.id]);

  // shipping — pulled from buyer profile, never typed at checkout
  const [showShip, setShowShip] = useState(false);
  const [ship, setShip] = useState({ name: "", address: "", city: "", state: "", zip: "", country: "US" });

  // Load buyer's saved shipping address from their profile
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles")
      .select("full_name,address_line1,address_city,address_state,address_zip,address_country")
      .eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setShip({
          name: data.full_name || "",
          address: data.address_line1 || "",
          city: data.address_city || "",
          state: data.address_state || "",
          zip: data.address_zip || "",
          country: data.address_country || "US",
        });
      });
  }, [user?.id]);

  function profileAddressComplete() {
    return !!(ship.name && ship.address && ship.city && ship.state && ship.zip);
  }
  function ensureBuyerAddress(): boolean {
    if (!profileAddressComplete()) {
      toast.error("Add your shipping address in your profile before purchasing");
      nav({ to: "/profile" });
      return false;
    }
    return true;
  }

  async function load() {
    const { data: l } = await supabase.from("listings").select("*").eq("id", id).maybeSingle();
    setListing(l);
    if (l) {
      const [{ data: sRows }, { data: bs }, { data: os }] = await Promise.all([
        (supabase.rpc as any)("public_profiles_by_ids", { _ids: [l.seller_id] }),
        supabase.from("listing_bids").select("*").eq("listing_id", id).order("created_at", { ascending: false }),
        supabase.from("offers").select("*").eq("listing_id", id).order("created_at", { ascending: false }),
      ]);
      setSeller((sRows && sRows[0]) || null);
      setBids(bs || []);
      setOffers(os || []);
    }
  }
  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-notify seller once when their auction ends below reserve
  useEffect(() => {
    if (!listing || !user) return;
    if (user.id !== listing.seller_id) return;
    if (listing.auction_status !== "active") return;
    if (!listing.reserve_price || !listing.auction_ends_at) return;
    const ended = new Date(listing.auction_ends_at).getTime() <= Date.now();
    const belowReserve = Number(listing.current_bid || 0) < Number(listing.reserve_price);
    if (!ended || !belowReserve) return;
    const key = `notified-below-reserve-${listing.id}`;
    if (typeof window !== "undefined" && window.localStorage.getItem(key)) return;
    (async () => {
      await supabase.from("notifications").insert({
        user_id: listing.seller_id, type: "bid",
        body: `Auction "${listing.title}" ended below reserve. Top bid: $${Number(listing.current_bid || 0).toFixed(0)} — accept or decline.`,
        link: `/market/${listing.id}`,
      });
      window.localStorage.setItem(key, "1");
    })();
  }, [listing, user]);

  async function placeBid() {
    if (!profile) return toast.error("Sign in first");
    if (unpaidOrders > 0) { toast.error("Pay your pending order before bidding"); nav({ to: "/orders" }); return; }
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
    if (unpaidOrders > 0) { toast.error("Pay your pending order before buying"); nav({ to: "/orders" }); return; }
    if (!ensureBuyerAddress()) return;
    setCartMode("buy");
    setShowShip(true);
  }

  async function addToCart() {
    if (!profile) return toast.error("Sign in first");
    if (!ensureBuyerAddress()) return;
    setCartMode("cart");
    setShowShip(true);
  }

  async function placeOrder(amount: number) {
    if (!ensureBuyerAddress()) return;
    const { error } = await supabase.from("orders").insert({
      listing_id: id, buyer_id: profile!.id, seller_id: listing.seller_id,
      title: listing.title, amount,
      quantity: qty,
      item_image_url: listing.image_url,
      status: "pending",
      payment_status: "awaiting_payment",
      ship_name: ship.name, ship_address: ship.address, ship_city: ship.city, ship_state: ship.state, ship_zip: ship.zip, ship_country: ship.country,
    });
    if (error) {
      if (error.message?.includes("inventory")) return toast.error(error.message);
      return toast.error(error.message);
    }
    await supabase.from("notifications").insert({ user_id: listing.seller_id, type: "order", body: `New order from @${profile!.username} for "${listing.title}"`, link: "/orders" });
    setShowShip(false);
    if (cartMode === "cart") {
      toast.success("Added to cart");
      nav({ to: "/cart" });
    } else {
      toast.success("Order placed!");
      nav({ to: "/cart" });
    }
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

  async function declineTopBidBelowReserve() {
    if (!listing) return;
    await supabase.from("listings").update({ auction_status: "declined_below_reserve" }).eq("id", id);
    if (listing.top_bidder_id) {
      await supabase.from("notifications").insert({
        user_id: listing.top_bidder_id, type: "bid",
        body: `Seller declined your $${listing.current_bid} bid on "${listing.title}" — reserve not met`,
        link: `/market/${id}`,
      });
    }
    toast.success("Bid declined");
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
            <div className="flex items-center gap-2">
              <Link to="/messages/$userId" params={{ userId: seller.id }} className="flex items-center gap-1 text-xs font-semibold text-primary"><MessageCircle className="h-3 w-3" /> Message</Link>
              <ReportDialog targetType="listing" targetId={listing.id} targetLabel={listing.title} />
            </div>
          )}
          {isSeller && (
            <Link to="/my-listings" className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-bold">
              <Pencil className="h-3 w-3" /> Edit
            </Link>
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
                  <div className="mt-2 flex gap-2">
                    <button onClick={acceptTopBidBelowReserve} className="flex-1 rounded-lg bg-primary py-2 font-bold text-primary-foreground">Accept</button>
                    <button onClick={declineTopBidBelowReserve} className="flex-1 rounded-lg bg-muted py-2 font-bold text-foreground">Decline</button>
                  </div>
                </div>
              )}
              {auctionEnded && !reserveMet && !isSeller && (
                <p className="rounded-lg bg-muted/40 p-2 text-[11px] text-muted-foreground">Reserve not met — waiting on seller.</p>
              )}
            </>

          ) : (() => {
            const totalQty = Number(listing.quantity ?? 1);
            const sold = Number(listing.sold_count ?? 0);
            const available = Math.max(0, totalQty - sold);
            const soldOut = available <= 0;
            return (
              <>
                <div>
                  <p className="text-xs text-muted-foreground">Price</p>
                  <p className="text-2xl font-bold text-primary">${Number(listing.price || 0).toFixed(2)}</p>
                  <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
                    {soldOut ? <span className="text-destructive">Sold out</span> : `${available} available`}
                  </p>
                </div>
                {!isSeller && type === "buy_now" && !soldOut && (
                  <>
                    {totalQty > 1 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Qty</span>
                        <button onClick={() => setQty(Math.max(1, qty - 1))} className="rounded-lg bg-muted px-3 py-1 text-sm font-bold">−</button>
                        <span className="w-8 text-center text-sm font-bold">{qty}</span>
                        <button onClick={() => setQty(Math.min(available, qty + 1))} className="rounded-lg bg-muted px-3 py-1 text-sm font-bold">+</button>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button onClick={addToCart} className="flex-1 rounded-xl bg-muted py-3 text-sm font-bold">Add to Cart</button>
                      <button onClick={buyNow} className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground">Buy Now</button>
                    </div>
                  </>
                )}
                {soldOut && !isSeller && (
                  <div className="rounded-lg bg-muted/40 p-2 text-center text-xs text-muted-foreground">This listing is sold out.</div>
                )}
              </>
            );
          })()}

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

        {showShip && (() => {
          const itemPrice = Number(listing.price || 0) * qty;
          const shipPrice = Number(listing.shipping_price || 0);
          const total = itemPrice + shipPrice;
          return (
            <div className="mt-4 space-y-2 rounded-xl bg-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">Ship to</p>
                <Link to="/profile" className="text-[11px] font-semibold text-primary">Edit in profile</Link>
              </div>
              <div className="rounded-lg bg-muted/40 p-3 text-xs leading-relaxed">
                <p className="font-semibold text-foreground">{ship.name}</p>
                <p className="text-muted-foreground">{ship.address}</p>
                <p className="text-muted-foreground">{ship.city}, {ship.state} {ship.zip}</p>
                <p className="text-muted-foreground">{ship.country}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2 text-xs space-y-1">
                <div className="flex justify-between"><span>Item{qty > 1 ? ` × ${qty}` : ""}</span><span>${itemPrice.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Shipping</span><span>{shipPrice > 0 ? `$${shipPrice.toFixed(2)}` : "Free"}</span></div>
                <div className="flex justify-between font-bold pt-1 border-t border-border"><span>Total</span><span>${total.toFixed(2)}</span></div>
              </div>
              <button onClick={() => placeOrder(total)} className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground">
                {cartMode === "cart" ? "Add to Cart" : "Place Order"}
              </button>
            </div>
          );
        })()}

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
