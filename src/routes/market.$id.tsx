import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/market/$id")({ component: ListingDetail });

function ListingDetail() {
  const { id } = Route.useParams();
  const { profile } = useAuth();
  const [listing, setListing] = useState<any>(null);
  const [seller, setSeller] = useState<any>(null);
  const [bids, setBids] = useState<any[]>([]);
  const [bidAmt, setBidAmt] = useState("");

  async function load() {
    const { data: l } = await supabase.from("listings").select("*").eq("id", id).maybeSingle();
    setListing(l);
    if (l) {
      supabase.from("profiles").select("*").eq("id", l.seller_id).maybeSingle().then(({ data }) => setSeller(data));
      supabase.from("listing_bids").select("*").eq("listing_id", id).order("created_at", { ascending: false }).then(({ data }) => setBids(data || []));
    }
  }
  useEffect(() => { load(); }, [id]);

  async function buyNow() {
    if (!profile) return toast.error("Sign in first");
    toast.success("Purchase recorded (demo)");
  }
  async function placeBid() {
    if (!profile) return toast.error("Sign in first");
    const amt = Number(bidAmt);
    if (!amt || amt <= Number(listing.current_bid || 0)) return toast.error("Bid must be higher than current");
    await supabase.from("listing_bids").insert({ listing_id: id, user_id: profile.id, username: profile.username, amount: amt });
    await supabase.from("listings").update({ current_bid: amt }).eq("id", id);
    setBidAmt("");
    load();
    toast.success("Bid placed");
  }

  if (!listing) return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="mx-auto min-h-screen max-w-md bg-background pb-8">
      <div className="relative aspect-square bg-muted">
        {listing.image_url ? <img src={listing.image_url} className="h-full w-full object-cover" alt={listing.title} /> : <div className="h-full w-full bg-gradient-to-br from-primary/20 to-accent" />}
        <Link to="/market" className="absolute left-3 top-3 rounded-full bg-black/50 p-2 backdrop-blur"><ArrowLeft className="h-4 w-4" /></Link>
      </div>
      <div className="px-4 py-4">
        <h1 className="text-xl font-bold">{listing.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">@{seller?.username || "seller"}</p>
        {listing.description && <p className="mt-3 text-sm">{listing.description}</p>}

        <div className="mt-4 rounded-xl bg-card p-4">
          {listing.is_auction ? (
            <>
              <p className="text-xs text-muted-foreground">Current Bid</p>
              <p className="text-2xl font-bold text-primary">${Number(listing.current_bid || 0).toFixed(0)}</p>
              <div className="mt-3 flex gap-2">
                <input type="number" placeholder="Your bid" value={bidAmt} onChange={(e) => setBidAmt(e.target.value)} className="flex-1 rounded-xl bg-input px-3 py-2.5 text-sm outline-none" />
                <button onClick={placeBid} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Bid</button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Price</p>
              <p className="text-2xl font-bold text-primary">${Number(listing.price).toFixed(2)}</p>
              <button onClick={buyNow} className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground">Buy Now</button>
            </>
          )}
        </div>

        {listing.is_auction && bids.length > 0 && (
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
