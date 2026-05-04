import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { LogOut, Radio, Tag, Package, Store as StoreIcon, ShieldCheck, Upload, Loader2, Fingerprint } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { startRegistration } from "@simplewebauthn/browser";
import { startPasskeyRegistration, finishPasskeyRegistration } from "@/server/passkeys.functions";

export const Route = createFileRoute("/profile")({ component: Profile });

function Badge({ status, label }: { status: string; label: string }) {
  const map: Record<string, string> = {
    none: "bg-muted text-muted-foreground",
    pending: "bg-yellow-500/20 text-yellow-600",
    verified: "bg-primary/20 text-primary",
    approved: "bg-primary/20 text-primary",
    rejected: "bg-destructive/20 text-destructive",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${map[status] || map.none}`}>{label}: {status}</span>;
}

function Profile() {
  const { user, profile, signOut } = useAuth();
  const nav = useNavigate();
  const [p, setP] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => setP(data));
  }, [user]);

  async function save() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: p.full_name, phone: p.phone,
      address_line1: p.address_line1, address_city: p.address_city,
      address_state: p.address_state, address_zip: p.address_zip,
      address_country: p.address_country || "US",
    }).eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      // mark buyer verified once minimum info present
      if (p.full_name && p.phone && p.address_line1 && p.address_city && p.address_zip) {
        await supabase.from("profiles").update({ buyer_verified: true }).eq("id", user.id);
        setP((x: any) => ({ ...x, buyer_verified: true }));
      }
      toast.success("Profile saved");
    }
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file || !user) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) { setUploading(false); return toast.error(error.message); }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id);
    setP((x: any) => ({ ...x, avatar_url: data.publicUrl }));
    setUploading(false);
    toast.success("Avatar updated");
  }

  async function uploadId(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file || !user) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/id-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("id-documents").upload(path, file, { upsert: true });
    if (error) { setUploading(false); return toast.error(error.message); }
    await supabase.from("profiles").update({ id_document_url: path, id_status: "pending" }).eq("id", user.id);
    setP((x: any) => ({ ...x, id_document_url: path, id_status: "pending" }));
    setUploading(false);
    toast.success("ID submitted for review");
  }

  async function applyToSell() {
    if (!user) return;
    if (!p?.id_document_url) return toast.error("Upload your ID first");
    if (!p?.address_line1) return toast.error("Add your mailing address first");
    await supabase.from("profiles").update({ seller_status: "pending" }).eq("id", user.id);
    setP({ ...p, seller_status: "pending" });
    toast.success("Application submitted — awaiting admin approval");
  }

  if (!user) return (
    <AppShell>
      <div className="px-6 py-16 text-center">
        <h1 className="text-xl font-bold">Profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to view your profile.</p>
        <Link to="/auth" className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Sign In</Link>
      </div>
    </AppShell>
  );

  if (!p) return <AppShell><div className="p-8 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;

  return (
    <AppShell>
      <div className="px-4 py-6 space-y-5">
        <div className="flex items-center gap-3">
          <label className="relative h-16 w-16 cursor-pointer overflow-hidden rounded-full bg-primary">
            {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" /> : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-primary-foreground">{p.username?.[0]?.toUpperCase() || "?"}</div>
            )}
            <input type="file" accept="image/*" onChange={uploadAvatar} className="hidden" />
            <span className="absolute bottom-0 right-0 rounded-full bg-black/60 p-1"><Upload className="h-3 w-3 text-white" /></span>
          </label>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">@{p.username}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            {p.public_id && <p className="mt-0.5 text-[10px] font-mono text-muted-foreground">User ID: <span className="font-bold text-foreground">{p.public_id}</span></p>}
            <div className="mt-1 flex flex-wrap gap-1">
              <Badge status={p.buyer_verified ? "verified" : "none"} label="Buyer" />
              <Badge status={p.id_status || "none"} label="ID" />
              <Badge status={p.seller_status || "none"} label="Seller" />
            </div>
          </div>
        </div>

        <section className="rounded-xl bg-card p-4 space-y-2">
          <p className="text-sm font-bold">Contact & Mailing</p>
          <input value={p.full_name || ""} onChange={(e) => setP({ ...p, full_name: e.target.value })} placeholder="Full name" className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none" />
          <input value={p.phone || ""} onChange={(e) => setP({ ...p, phone: e.target.value })} placeholder="Phone" className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none" />
          <input value={p.address_line1 || ""} onChange={(e) => setP({ ...p, address_line1: e.target.value })} placeholder="Street address" className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none" />
          <div className="grid grid-cols-3 gap-2">
            <input value={p.address_city || ""} onChange={(e) => setP({ ...p, address_city: e.target.value })} placeholder="City" className="rounded-lg bg-input px-3 py-2 text-xs outline-none" />
            <input value={p.address_state || ""} onChange={(e) => setP({ ...p, address_state: e.target.value })} placeholder="State" className="rounded-lg bg-input px-3 py-2 text-xs outline-none" />
            <input value={p.address_zip || ""} onChange={(e) => setP({ ...p, address_zip: e.target.value })} placeholder="ZIP" className="rounded-lg bg-input px-3 py-2 text-xs outline-none" />
          </div>
          <button onClick={save} disabled={saving} className="w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground disabled:opacity-60">
            {saving ? "Saving…" : "Save Profile"}
          </button>
        </section>

        <section className="rounded-xl bg-card p-4 space-y-2">
          <p className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="h-4 w-4" /> Identity Verification</p>
          <p className="text-[11px] text-muted-foreground">Upload a photo of a government-issued ID. Reviewed manually.</p>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-input/50 py-3 text-xs font-semibold">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {p.id_document_url ? "Replace ID" : "Upload ID"}
            <input type="file" accept="image/*,application/pdf" onChange={uploadId} className="hidden" />
          </label>
        </section>

        <section className="rounded-xl bg-card p-4 space-y-2">
          <p className="flex items-center gap-2 text-sm font-bold"><Fingerprint className="h-4 w-4" /> Face ID / Passkey Login</p>
          <p className="text-[11px] text-muted-foreground">Add a passkey on this device so you can sign in with Face ID, Touch ID, or Windows Hello — no password.</p>
          <button onClick={async () => {
            try {
              const opts = await startPasskeyRegistration({ data: { userId: user.id, username: p.username } });
              const att = await startRegistration({ optionsJSON: opts as any });
              await finishPasskeyRegistration({ data: { userId: user.id, response: att, label: navigator.userAgent.slice(0, 40) } });
              toast.success("Passkey added — try it next time you sign in");
            } catch (e: any) { toast.error(e?.message || "Couldn't add passkey"); }
          }} className="w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground">Add Passkey on this device</button>
        </section>
        <section className="rounded-xl bg-card p-4 space-y-2">
          <p className="text-sm font-bold">Sell on Pull Bid</p>
          <p className="text-[11px] text-muted-foreground">Apply to host live auctions and list on the marketplace. Requires verified ID + mailing address. Admin reviews each application.</p>
          {p.seller_status === "approved" ? (
            <p className="rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">✓ Approved seller</p>
          ) : p.seller_status === "pending" ? (
            <p className="rounded-lg bg-yellow-500/10 px-3 py-2 text-xs font-semibold text-yellow-600">Application pending review</p>
          ) : (
            <button onClick={applyToSell} className="w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground">Apply to Sell</button>
          )}
        </section>

        <div className="space-y-2">
          {p.seller_status === "approved" && (
            <>
              <Link to="/sell" className="flex items-center gap-3 rounded-xl bg-card p-4">
                <Radio className="h-5 w-5 text-live" />
                <div className="flex-1"><p className="text-sm font-semibold">Go Live</p><p className="text-xs text-muted-foreground">Start a live auction stream</p></div>
              </Link>
              <Link to="/sell" className="flex items-center gap-3 rounded-xl bg-card p-4">
                <Tag className="h-5 w-5 text-primary" />
                <div className="flex-1"><p className="text-sm font-semibold">List an Item</p><p className="text-xs text-muted-foreground">Sell or auction a card</p></div>
              </Link>
              <Link to="/my-listings" className="flex items-center gap-3 rounded-xl bg-card p-4">
                <Tag className="h-5 w-5 text-accent" />
                <div className="flex-1"><p className="text-sm font-semibold">My Listings</p><p className="text-xs text-muted-foreground">Manage active &amp; expired listings</p></div>
              </Link>
              <Link to="/store" className="flex items-center gap-3 rounded-xl bg-card p-4">
                <StoreIcon className="h-5 w-5 text-primary" />
                <div className="flex-1"><p className="text-sm font-semibold">My Store</p><p className="text-xs text-muted-foreground">Items you've sold</p></div>
              </Link>
            </>
          )}
          <Link to="/orders" className="flex items-center gap-3 rounded-xl bg-card p-4">
            <Package className="h-5 w-5 text-primary" />
            <div className="flex-1"><p className="text-sm font-semibold">My Orders</p><p className="text-xs text-muted-foreground">Items you've purchased</p></div>
          </Link>
          <button onClick={async () => { await signOut(); nav({ to: "/" }); }} className="flex w-full items-center gap-3 rounded-xl bg-card p-4 text-left">
            <LogOut className="h-5 w-5 text-destructive" />
            <p className="text-sm font-semibold">Sign Out</p>
          </button>
        </div>
      </div>
    </AppShell>
  );
}
