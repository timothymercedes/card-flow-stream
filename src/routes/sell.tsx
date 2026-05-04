import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { toast } from "sonner";

export const Route = createFileRoute("/sell")({ component: Sell });

function Sell() {
  const { user, profile } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState<"live" | "listing">("live");

  // Live form
  const [streamTitle, setStreamTitle] = useState("");

  // Listing form
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [isAuction, setIsAuction] = useState(false);

  if (!user) return (
    <AppShell>
      <div className="px-6 py-16 text-center">
        <h1 className="text-xl font-bold">Sell</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to sell.</p>
        <Link to="/auth" className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Sign In</Link>
      </div>
    </AppShell>
  );

  async function startLive() {
    if (!streamTitle.trim()) return;
    if (!profile?.is_seller) {
      await supabase.from("profiles").update({ is_seller: true }).eq("id", user!.id);
    }
    const { data, error } = await supabase.from("live_streams").insert({ seller_id: user!.id, title: streamTitle }).select().single();
    if (error) return toast.error(error.message);
    nav({ to: "/live/$id", params: { id: data.id } });
  }

  async function createListing() {
    if (!title.trim()) return;
    if (!profile?.is_seller) {
      await supabase.from("profiles").update({ is_seller: true }).eq("id", user!.id);
    }
    const { error } = await supabase.from("listings").insert({
      seller_id: user!.id, title, description: desc,
      price: isAuction ? null : Number(price) || 0,
      current_bid: isAuction ? Number(price) || 0 : null,
      is_auction: isAuction,
    });
    if (error) return toast.error(error.message);
    toast.success("Listing created");
    nav({ to: "/market" });
  }

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
            <button onClick={startLive} className="w-full rounded-xl bg-live py-3 text-sm font-bold text-live-foreground">🔴 Start Live Stream</button>
          </div>
        ) : (
          <div className="space-y-3">
            <input className="w-full rounded-xl bg-input px-4 py-3 text-sm outline-none" placeholder="Item title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea className="w-full resize-none rounded-xl bg-input px-4 py-3 text-sm outline-none" rows={3} placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isAuction} onChange={(e) => setIsAuction(e.target.checked)} className="h-4 w-4" />
              Auction (bidding)
            </label>
            <input type="number" className="w-full rounded-xl bg-input px-4 py-3 text-sm outline-none" placeholder={isAuction ? "Starting bid ($)" : "Price ($)"} value={price} onChange={(e) => setPrice(e.target.value)} />
            <button onClick={createListing} className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground">Create Listing</button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
