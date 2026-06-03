import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { LogOut, Radio, Tag, Package, Store as StoreIcon, ShieldCheck, Upload, Fingerprint, Phone, CheckCircle2, Bell, BellOff, Banknote, Star, ExternalLink, MessageSquare, LifeBuoy } from "lucide-react";
import { SignOutDialog } from "@/components/SignOutDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { startRegistration } from "@simplewebauthn/browser";
import { startPasskeyRegistration, finishPasskeyRegistration } from "@/lib/passkeys.functions";
import { ensurePushSubscribed, disablePush, pushSupported } from "@/lib/push";
import { AgreementModal } from "@/components/AgreementModal";
import { LiveNowPill } from "@/components/ReturnToLiveBadge";
import { SellerReviewsPanel } from "@/components/SellerReviewsPanel";
import { SellerTrustBadges } from "@/components/SellerTrustBadges";
import { SellerResponseBadges } from "@/components/SellerResponseBadges";
import { BuyerTrustBadges } from "@/components/BuyerTrustBadges";
import { ScheduledShowsPanel } from "@/components/ScheduledShowsPanel";

// SAFE MODE: skip real SMS; auto-accept any 6-digit code.
// When ready, replace sendOtp/verifyOtp with Twilio Verify API calls.
const SMS_SAFE_MODE = true;

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
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [sellerCompleted, setSellerCompleted] = useState(0);
  const [buyerCompleted, setBuyerCompleted] = useState(0);
  const [listOpen, setListOpen] = useState<null | "followers" | "following">(null);
  const [listRows, setListRows] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);

  const [sellerAgreementAccepted, setSellerAgreementAccepted] = useState<boolean | null>(null);
  const [showSellerAgreement, setShowSellerAgreement] = useState(false);
  const [acceptingAgreement, setAcceptingAgreement] = useState(false);

  const [myLiveStreamId, setMyLiveStreamId] = useState<string | null>(null);
  const [myStats, setMyStats] = useState<any>(null);
  const [showMyReviews, setShowMyReviews] = useState(false);
  const [restriction, setRestriction] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => setP(data));
    supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", user.id).then(({ count }) => setFollowers(count || 0));
    supabase.from("follows").select("followee_id", { count: "exact", head: true }).eq("follower_id", user.id).then(({ count }) => setFollowing(count || 0));
    (supabase.rpc as any)("get_seller_completed_count", { _user: user.id }).then(({ data }: any) => setSellerCompleted(Number(data ?? 0)));
    (supabase.rpc as any)("get_buyer_completed_count", { _user: user.id }).then(({ data }: any) => setBuyerCompleted(Number(data ?? 0)));
    supabase.from("user_roles").select("role").eq("user_id", user.id).in("role", ["owner","admin","moderator","support"]).then(({ data }) => setIsAdmin((data?.length ?? 0) > 0));
    supabase.from("live_streams").select("id").eq("seller_id", user.id).eq("status","live").order("started_at",{ascending:false}).limit(1).maybeSingle().then(({ data }) => setMyLiveStreamId((data as any)?.id ?? null));
    (supabase.rpc as any)("get_seller_stats", { _seller_id: user.id }).then(({ data }: any) => setMyStats(Array.isArray(data) ? data[0] : data));
    supabase.from("user_suspensions").select("*").eq("user_id", user.id).eq("active", true).order("created_at",{ascending:false}).limit(1).maybeSingle().then(({ data }) => setRestriction(data));
  }, [user]);

  async function openList(kind: "followers" | "following") {
    if (!user) return;
    setListOpen(kind);
    const { data } = await (supabase.rpc as any)(kind === "followers" ? "list_followers" : "list_following", { _user: user.id });
    setListRows(data || []);
  }

  // Check whether approved sellers have already signed the Seller Agreement.
  useEffect(() => {
    if (!user || !p) return;
    if (p.seller_status !== "approved") { setSellerAgreementAccepted(null); return; }
    supabase
      .from("legal_acceptances")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("document_type", "seller_agreement")
      .then(({ count }) => {
        const accepted = (count ?? 0) > 0;
        setSellerAgreementAccepted(accepted);
        if (!accepted) setShowSellerAgreement(true);
      });
  }, [user, p?.seller_status]);

  async function acceptSellerAgreement() {
    if (!user) return;
    setAcceptingAgreement(true);
    const { error } = await (supabase.rpc as any)("accept_legal_document", {
      _document_type: "seller_agreement",
      _version: "1.0",
      _user_agent: navigator.userAgent.slice(0, 200),
    });
    setAcceptingAgreement(false);
    if (error) return toast.error(error.message);
    setSellerAgreementAccepted(true);
    setShowSellerAgreement(false);
    toast.success("Seller Agreement accepted");
  }

  async function sendOtp() {
    if (!p?.phone || p.phone.length < 7) return toast.error("Enter a valid phone number");
    setOtpLoading(true);
    if (SMS_SAFE_MODE) {
      // No real SMS sent — UX placeholder. Use any 6-digit code to verify.
      await new Promise((r) => setTimeout(r, 500));
      setOtpSent(true);
      setOtpLoading(false);
      toast.success("Safe mode: enter any 6-digit code to verify");
      return;
    }
    // TODO: call server function that uses Twilio Verify to send the code.
    setOtpLoading(false);
  }

  async function verifyOtp() {
    if (otpCode.length !== 6) return toast.error("Enter the 6-digit code");
    setOtpLoading(true);
    if (SMS_SAFE_MODE) {
      const { error } = await supabase.from("profiles").update({
        phone_verified: true, phone_verified_at: new Date().toISOString(),
      }).eq("id", user!.id);
      setOtpLoading(false);
      if (error) return toast.error(error.message);
      setP({ ...p, phone_verified: true });
      setOtpSent(false);
      setOtpCode("");
      toast.success("Phone verified");
      return;
    }
    // TODO: call server function that checks the OTP via Twilio Verify.
    setOtpLoading(false);
  }

  async function save() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: p.full_name, phone: p.phone,
      address_line1: p.address_line1, address_city: p.address_city,
      address_state: p.address_state, address_zip: p.address_zip,
      address_country: p.address_country || "US",
      shipping_cap: p.shipping_cap === "" || p.shipping_cap == null ? null : Number(p.shipping_cap),
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
    if (file.size > 8 * 1024 * 1024) return toast.error("Image must be under 8MB");
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) { setUploading(false); return toast.error(error.message); }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);

    // 🆕 AI moderation — block obviously inappropriate avatars before they go live.
    try {
      const { data: mod } = await supabase.functions.invoke("moderate-image", {
        body: { image_url: data.publicUrl },
      });
      if (mod && mod.allowed === false) {
        // Remove the offending file so it isn't publicly accessible.
        await supabase.storage.from("avatars").remove([path]);
        setUploading(false);
        return toast.error(`Avatar rejected: ${mod.reason || "not appropriate for a public profile"}`);
      }
    } catch {
      // Fail-open: if moderation can't run we still let the upload through.
    }

    await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id);
    setP((x: any) => ({ ...x, avatar_url: data.publicUrl }));
    setUploading(false);
    toast.success("Avatar updated");
  }

  async function applyToSell() {
    if (!user) return;
    if (!p?.address_line1) return toast.error("Add your mailing address first");
    const { error: agreementError } = await (supabase.rpc as any)("accept_legal_document", {
      _document_type: "seller_agreement",
      _version: "1.0",
      _user_agent: navigator.userAgent.slice(0, 200),
    });
    if (agreementError) return toast.error(agreementError.message);
    const { error: rpcError } = await (supabase.rpc as any)("request_verification", {
      _kind: "seller",
      _note: null,
    });
    if (rpcError) return toast.error(rpcError.message);
    setP({ ...p, seller_status: "pending", verification_status: "pending" });
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
      <div className="mx-auto w-full max-w-5xl px-4 py-6 space-y-5">
        <LiveNowPill />
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/20 via-accent/10 to-card p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-4">
            <label className="relative h-20 w-20 cursor-pointer overflow-hidden rounded-full bg-primary ring-2 ring-border/60 shadow-[var(--shadow-md)]">
              {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" /> : (
                <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-primary-foreground">{p.username?.[0]?.toUpperCase() || "?"}</div>
              )}
              <input type="file" accept="image/*" onChange={uploadAvatar} className="hidden" />
              <span className="absolute bottom-0 right-0 rounded-full bg-black/70 p-1.5 backdrop-blur"><Upload className="h-3 w-3 text-white" /></span>
              {uploading && <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[10px] font-bold text-white">…</span>}
            </label>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xl font-bold tracking-tight">@{p.username}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              {p.public_id && <p className="mt-0.5 text-[10px] font-mono text-muted-foreground">ID: <span className="font-bold text-foreground">{p.public_id}</span></p>}
              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                <button onClick={() => openList("followers")} className="hover:text-foreground">
                  <span className="font-bold text-foreground">{followers}</span> followers
                </button>
                <button onClick={() => openList("following")} className="hover:text-foreground">
                  <span className="font-bold text-foreground">{following}</span> following
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {sellerCompleted >= 100 && <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">✓ Verified Seller</span>}
                {buyerCompleted >= 35 && <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-500">✓ Verified Buyer</span>}
                <Badge status={p.buyer_verified ? "verified" : "none"} label="Buyer" />
                <Badge status={p.phone_verified ? "verified" : "none"} label="Phone" />
                <Badge status={p.seller_status || "none"} label="Seller" />
              </div>
            </div>
          </div>
        </div>

        {/* Collector rank, level, achievements + Showcase 9 */}
        <CollectorShowcase userId={user.id} />




        {/* Quick action bar — own profile shortcuts */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {p.username && (
            <Link to="/seller/$username" params={{ username: p.username }} className="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-xs font-bold text-primary-foreground">
              <ExternalLink className="h-3.5 w-3.5" /> View Storefront
            </Link>
          )}
          {myLiveStreamId ? (
            <Link to="/live/$id" params={{ id: myLiveStreamId }} className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-live to-live/70 px-3 py-2.5 text-xs font-bold text-live-foreground">
              <Radio className="h-3.5 w-3.5 animate-pulse" /> Join My Live
            </Link>
          ) : p.seller_status === "approved" ? (
            <Link to="/sell" className="flex items-center justify-center gap-1.5 rounded-xl bg-card ring-1 ring-border px-3 py-2.5 text-xs font-bold">
              <Radio className="h-3.5 w-3.5 text-live" /> Go Live
            </Link>
          ) : null}
          <button onClick={() => setShowMyReviews((v) => !v)} className="flex items-center justify-center gap-1.5 rounded-xl bg-card ring-1 ring-border px-3 py-2.5 text-xs font-bold">
            <Star className="h-3.5 w-3.5 text-amber-400" /> {showMyReviews ? "Hide" : "View"} Reviews
          </button>
          <Link to="/messages" className="flex items-center justify-center gap-1.5 rounded-xl bg-card ring-1 ring-border px-3 py-2.5 text-xs font-bold">
            <MessageSquare className="h-3.5 w-3.5 text-primary" /> Messages
          </Link>
        </div>

        {/* Trust + response badges (own view) */}
        <div className="flex flex-wrap items-center gap-1">
          <SellerTrustBadges sellerId={user.id} />
          <SellerResponseBadges sellerId={user.id} />
          <BuyerTrustBadges userId={user.id} compact />
        </div>

        {/* Failed-payment / restriction banner */}
        {restriction && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs">
            <p className="font-bold text-destructive">⚠ Account {restriction.type === "ban" ? "banned" : "restricted"}</p>
            <p className="mt-1 text-muted-foreground">{restriction.reason}</p>
            {restriction.expires_at && <p className="mt-1 text-[10px] text-muted-foreground">Until {new Date(restriction.expires_at).toLocaleString()}</p>}
            <p className="mt-2 text-[10px] text-muted-foreground">Resolve outstanding payments to request review.</p>
          </div>
        )}

        {/* Seller stats quick-view */}
        {myStats && Number(myStats.completed_sales || 0) > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl bg-card p-3 text-center">
              <p className="text-[10px] uppercase text-muted-foreground">Sold</p>
              <p className="mt-1 text-base font-bold text-primary">{myStats.completed_sales ?? 0}</p>
            </div>
            <div className="rounded-xl bg-card p-3 text-center">
              <p className="text-[10px] uppercase text-muted-foreground">Rating</p>
              <p className="mt-1 text-base font-bold text-amber-400">{myStats.avg_rating ? `${Number(myStats.avg_rating).toFixed(1)}★` : "—"}</p>
            </div>
            <div className="rounded-xl bg-card p-3 text-center">
              <p className="text-[10px] uppercase text-muted-foreground">On-time</p>
              <p className="mt-1 text-base font-bold text-emerald-400">{myStats.on_time_rate != null ? `${Number(myStats.on_time_rate).toFixed(0)}%` : "—"}</p>
            </div>
            <div className="rounded-xl bg-card p-3 text-center">
              <p className="text-[10px] uppercase text-muted-foreground">Reviews</p>
              <p className="mt-1 text-base font-bold">{myStats.review_count ?? 0}</p>
            </div>
          </div>
        )}

        {/* Scheduled Shows */}
        <section className="rounded-xl bg-card p-3 ring-1 ring-border">
          <ScheduledShowsPanel compact />
        </section>

        {showMyReviews && (
          <section className="rounded-xl bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold">My Reviews</p>
              {p.username && (
                <Link to="/seller/$username" params={{ username: p.username }} className="text-[11px] font-bold text-primary">
                  Open public storefront →
                </Link>
              )}
            </div>
            <SellerReviewsPanel sellerId={user.id} currentUserId={user.id} />
          </section>
        )}

        {isAdmin && (
          <Link to="/admin" className="flex items-center justify-between rounded-xl bg-primary/10 p-3 hover:bg-primary/20">
            <span className="flex items-center gap-2 text-sm font-bold text-primary"><ShieldCheck className="h-4 w-4" /> Admin Dashboard</span>
            <span className="text-xs text-primary">Open →</span>
          </Link>
        )}

        {(sellerCompleted < 100 || buyerCompleted < 35) && (
          <section className="rounded-xl bg-card p-3 space-y-2">
            <p className="text-xs font-bold">Verification progress</p>
            {sellerCompleted < 100 && (
              <div>
                <div className="flex justify-between text-[10px] text-muted-foreground"><span>Verified Seller (100 completed orders)</span><span className="font-semibold text-foreground">{sellerCompleted} / 100</span></div>
                <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${Math.min(100, (sellerCompleted/100)*100)}%` }} /></div>
              </div>
            )}
            {buyerCompleted < 35 && (
              <div>
                <div className="flex justify-between text-[10px] text-muted-foreground"><span>Verified Buyer (35 dispute-free orders)</span><span className="font-semibold text-foreground">{buyerCompleted} / 35</span></div>
                <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"><div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (buyerCompleted/35)*100)}%` }} /></div>
              </div>
            )}
          </section>
        )}

        {listOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={() => setListOpen(null)}>
            <div onClick={(e) => e.stopPropagation()} className="max-h-[70vh] w-full max-w-md overflow-y-auto rounded-2xl bg-card p-4">
              <p className="mb-3 text-sm font-bold capitalize">{listOpen}</p>
              {listRows.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">No users yet.</p>}
              <div className="space-y-2">
                {listRows.map((u: any) => (
                  <Link key={u.id} to="/seller/$username" params={{ username: u.username }} onClick={() => setListOpen(null)} className="flex items-center gap-2 rounded-lg bg-muted p-2 hover:bg-muted/70">
                    <div className="h-8 w-8 overflow-hidden rounded-full bg-card">
                      {u.avatar_url ? <img src={u.avatar_url} className="h-full w-full object-cover" alt="" /> : <div className="flex h-full w-full items-center justify-center text-xs font-bold">{u.username[0]?.toUpperCase()}</div>}
                    </div>
                    <span className="text-xs font-semibold">@{u.username}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        <section className="rounded-xl bg-card p-4 space-y-2">
          <p className="text-sm font-bold">Contact & Mailing</p>
          <input value={p.full_name || ""} onChange={(e) => setP({ ...p, full_name: e.target.value })} placeholder="Full name" className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none" />
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <input
                value={p.phone || ""}
                onChange={(e) => { setP({ ...p, phone: e.target.value, phone_verified: false }); setOtpSent(false); }}
                placeholder="Phone"
                className="flex-1 rounded-lg bg-input px-3 py-2 text-xs outline-none"
              />
              {p.phone_verified ? (
                <span className="inline-flex items-center gap-1 rounded-lg bg-primary/15 px-2 text-[10px] font-bold text-primary">
                  <CheckCircle2 className="h-3 w-3" /> Verified
                </span>
              ) : (
                <button
                  type="button"
                  onClick={sendOtp}
                  disabled={otpLoading || !p.phone}
                  className="rounded-lg bg-primary px-3 text-[11px] font-bold text-primary-foreground disabled:opacity-50"
                >
                  <Phone className="mr-1 inline h-3 w-3" />Verify
                </button>
              )}
            </div>
            {otpSent && !p.phone_verified && (
              <div className="flex gap-2">
                <input
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6-digit code"
                  className="flex-1 rounded-lg bg-input px-3 py-2 text-xs outline-none"
                />
                <button onClick={verifyOtp} disabled={otpLoading} className="rounded-lg bg-primary px-3 text-[11px] font-bold text-primary-foreground disabled:opacity-50">Confirm</button>
              </div>
            )}
            {SMS_SAFE_MODE && !p.phone_verified && (
              <p className="text-[10px] text-muted-foreground">🔒 Safe mode: real SMS isn't sent yet. Any 6-digit code works for now.</p>
            )}
          </div>
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

        <section className="rounded-xl bg-card p-4 space-y-1">
          <p className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="h-4 w-4" /> Identity & KYC</p>
          <p className="text-[11px] text-muted-foreground">
            For your privacy, PullBid Live does <strong>not</strong> store government IDs or selfies.
            Seller identity (KYC) is verified securely by Stripe during payout onboarding — connect Stripe in <Link to="/payouts" className="text-primary underline">Payouts</Link> to complete verification.
          </p>
        </section>

        <section className="rounded-xl bg-card p-4 space-y-2">
          <p className="flex items-center gap-2 text-sm font-bold"><Fingerprint className="h-4 w-4" /> Face ID / Passkey Login</p>
          <p className="text-[11px] text-muted-foreground">Add a passkey on this device so you can sign in with Face ID, Touch ID, or Windows Hello — no password.</p>
          <button onClick={async () => {
            try {
              const opts = await startPasskeyRegistration({ data: { username: p.username } });
              const att = await startRegistration({ optionsJSON: opts as any });
              await finishPasskeyRegistration({ data: { response: att, label: navigator.userAgent.slice(0, 40) } });
              toast.success("Passkey added — try it next time you sign in");
            } catch (e: any) { toast.error(e?.message || "Couldn't add passkey"); }
          }} className="w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground">Add Passkey on this device</button>
        </section>
        <section className="rounded-xl bg-card p-4 space-y-2">
          <p className="text-sm font-bold">Sell on Pull Bid</p>
          <p className="text-[11px] text-muted-foreground">Apply to host live auctions and list on the marketplace. Identity verification is handled by Stripe Connect during payout setup.</p>
          {p.seller_status === "approved" ? (
            sellerAgreementAccepted === false ? (
              <div className="space-y-2">
                <p className="rounded-lg bg-yellow-500/10 px-3 py-2 text-xs font-semibold text-yellow-600">
                  ✓ Approved — please review and accept the Seller Agreement to start selling.
                </p>
                <button
                  onClick={() => setShowSellerAgreement(true)}
                  className="w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground"
                >
                  Review & Accept Seller Agreement
                </button>
              </div>
            ) : (
              <p className="rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">✓ Approved seller — agreement on file</p>
            )
          ) : p.seller_status === "pending" ? (
            <p className="rounded-lg bg-yellow-500/10 px-3 py-2 text-xs font-semibold text-yellow-600">Application pending review</p>
          ) : (
            <div className="space-y-1.5">
              <button onClick={applyToSell} className="w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground">Apply to Sell</button>
              <p className="text-center text-[10px] text-muted-foreground">
                By applying you accept the{" "}
                <a href="/legal/seller-agreement" target="_blank" rel="noreferrer" className="text-primary underline">Seller Agreement</a>.
              </p>
            </div>
          )}
          {p.seller_status === "approved" && (
            <div className="mt-2 rounded-lg border border-border p-3">
              <p className="mb-1 text-xs font-semibold">Combined-shipping cap (per buyer, per checkout)</p>
              <p className="mb-2 text-[11px] text-muted-foreground">When a buyer orders multiple items from you in one checkout, total shipping for your items will never exceed this cap. Leave blank for no cap.</p>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold">$</span>
                <input
                  type="number" min="0" step="0.01"
                  value={p.shipping_cap ?? ""}
                  onChange={(e) => setP({ ...p, shipping_cap: e.target.value })}
                  placeholder="e.g. 10"
                  className="w-32 rounded-lg bg-input px-3 py-2 text-xs outline-none"
                />
                <span className="text-[11px] text-muted-foreground">max total / checkout</span>
              </div>
            </div>
          )}
        </section>

        <div className="space-y-2">
          {p.seller_status === "approved" && sellerAgreementAccepted && !p.shop_name && (
            <ShopNameClaim userId={user!.id} onClaimed={(name) => setP((x: any) => ({ ...x, shop_name: name }))} />
          )}
          {p.seller_status === "approved" && sellerAgreementAccepted && p.shop_name && (
            <>
              <div className="rounded-xl bg-primary/10 p-3 text-xs">
                🏪 Your shop: <span className="font-bold text-primary">{p.shop_name}</span>
              </div>
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
                <div className="flex-1"><p className="text-sm font-semibold">My PB Store</p><p className="text-xs text-muted-foreground">Items you've sold</p></div>
              </Link>
              <Link to="/payouts" className="flex items-center gap-3 rounded-xl bg-card p-4">
                <Banknote className="h-5 w-5 text-primary" />
                <div className="flex-1"><p className="text-sm font-semibold">Payouts</p><p className="text-xs text-muted-foreground">Connect Stripe to receive payments</p></div>
              </Link>
            </>
          )}
          <Link to="/orders" className="flex items-center gap-3 rounded-xl bg-card p-4">
            <Package className="h-5 w-5 text-primary" />
            <div className="flex-1"><p className="text-sm font-semibold">My Orders</p><p className="text-xs text-muted-foreground">Items you've purchased</p></div>
          </Link>
          <Link to="/bookmarks" className="flex items-center gap-3 rounded-xl bg-card p-4">
            <Bell className="h-5 w-5 text-primary" />
            <div className="flex-1"><p className="text-sm font-semibold">My Bookmarks</p><p className="text-xs text-muted-foreground">Saved shows & reminder settings</p></div>
          </Link>
          <Link to="/support" className="flex items-center gap-3 rounded-xl bg-card p-4">
            <LifeBuoy className="h-5 w-5 text-primary" />
            <div className="flex-1"><p className="text-sm font-semibold">Help & Support</p><p className="text-xs text-muted-foreground">FAQs and contact our team</p></div>
          </Link>
          <PushToggle userId={user!.id} />
          <Link to="/disputes" className="flex items-center gap-3 rounded-xl bg-card p-4">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <div className="flex-1"><p className="text-sm font-semibold">Disputes & Reports</p><p className="text-xs text-muted-foreground">File or track a dispute</p></div>
          </Link>
          <div className="rounded-xl bg-card p-4">
            <p className="mb-2 text-sm font-bold">Legal</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Link to="/legal/tos" className="rounded-lg bg-muted/50 px-3 py-2 font-semibold">Terms of Service</Link>
              <Link to="/legal/privacy" className="rounded-lg bg-muted/50 px-3 py-2 font-semibold">Privacy Policy</Link>
              <Link to="/legal/buyer-terms" className="rounded-lg bg-muted/50 px-3 py-2 font-semibold">Buyer Terms</Link>
              <Link to="/legal/seller-agreement" className="rounded-lg bg-muted/50 px-3 py-2 font-semibold">Seller Agreement</Link>
            </div>
          </div>
          <button onClick={() => setSignOutOpen(true)} className="flex w-full items-center gap-3 rounded-xl bg-card p-4 text-left">
            <LogOut className="h-5 w-5 text-destructive" />
            <p className="text-sm font-semibold">Sign Out</p>
          </button>
        </div>
      </div>

      <AgreementModal
        open={showSellerAgreement}
        required
        onDismiss={() => setShowSellerAgreement(false)}
        loading={acceptingAgreement}
        title="Seller Agreement"
        subtitle="Required for all approved sellers before listing or going live."
        agreeLabel="I have read and agree to the Seller Agreement and will follow these rules on every sale and live stream."
        acceptLabel="Agree & Activate Seller Tools"
        onAccept={() => { void acceptSellerAgreement(); }}
      >
        <p>Congratulations on being approved as a seller on PullBid Live. Before you can list, host live auctions, or receive payouts, please review and accept this Seller Agreement.</p>

        <h2>1. Shipping Obligations</h2>
        <ul>
          <li>Ship paid orders within <strong>3 business days</strong> of payment unless a longer timeframe is clearly stated on the listing.</li>
          <li>Provide a valid tracking number through the order page within 24 hours of shipment.</li>
          <li>Use packaging appropriate for the item (toploader/sleeve for cards, bubble mailer minimum, rigid mailer for high-value).</li>
          <li>Honor combined-shipping caps when buyers win multiple items in the same stream.</li>
        </ul>

        <h2>2. Listing Accuracy</h2>
        <ul>
          <li>All listings must accurately describe the item: title, set, year, card number, and condition (NM, LP, MP, Damaged).</li>
          <li>Front and back photos must be of the actual item, well-lit, and unedited beyond cropping/brightness.</li>
          <li>Disclose any flaws, alterations, or restoration.</li>
          <li>AI-assisted identification does not transfer responsibility — you are accountable for what you list.</li>
        </ul>

        <h2>3. No Counterfeits or Fakes</h2>
        <ul>
          <li>Selling counterfeit, reproduction, proxy, or knowingly altered items is strictly prohibited.</li>
          <li>Violation results in <strong>immediate permanent ban</strong>, payout freeze, and potential reporting to authorities.</li>
        </ul>

        <h2>4. Live Auction Conduct</h2>
        <ul>
          <li>Run auctions fairly. <strong>No shill bidding</strong>, fake bidders, or collusion.</li>
          <li>Honor stated giveaway rules and announced winners.</li>
          <li>Maintain a respectful environment in chat. You are responsible for your moderators.</li>
        </ul>

        <h2>5. Order Fulfillment & Refunds</h2>
        <ul>
          <li>You are responsible for fulfilling every paid order. Cancelling without buyer agreement may incur penalties.</li>
          <li>If an item is lost or damaged in transit, work with the buyer to resolve (refund or replacement).</li>
          <li>Refunds for valid disputes must be processed promptly.</li>
        </ul>

        <h2>6. Fees & Payouts</h2>
        <ul>
          <li>The Platform deducts a commission (default 5%) from each completed sale. Stripe processing fees also apply.</li>
          <li>Payouts go to your connected Stripe account on the standard schedule.</li>
          <li>Payouts may be held pending dispute resolution or suspected fraud.</li>
        </ul>

        <h2>7. Suspension & Removal</h2>
        <ul>
          <li>The Platform may suspend or permanently remove sellers for violations including: late shipments, fakes, inaccurate listings, fraudulent auction conduct, high chargeback rates, or harassment.</li>
          <li>Removed sellers forfeit pending payouts only where required to satisfy buyer refunds and chargebacks.</li>
        </ul>

        <h2>8. Tax & Legal Compliance</h2>
        <p>You are solely responsible for collecting and remitting any applicable sales tax, VAT, and reporting income from sales on the Platform.</p>

        <p className="mt-3 text-xs text-muted-foreground">
          Full document: <a href="/legal/seller-agreement" target="_blank" className="text-primary underline">Seller Agreement</a>
        </p>
      </AgreementModal>
      <SignOutDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        onConfirm={async () => {
          await signOut();
          nav({ to: "/auth" });
        }}
      />
    </AppShell>
  );
}

function PushToggle({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!pushSupported()) return;
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      setEnabled(!!sub && Notification.permission === "granted");
    });
  }, []);
  async function toggle() {
    setBusy(true);
    try {
      if (enabled) {
        await disablePush();
        setEnabled(false);
        toast.success("Live alerts off");
      } else {
        const r = await ensurePushSubscribed(userId);
        if (!r.ok) { toast.error(r.reason || "Couldn't enable"); return; }
        setEnabled(true);
        toast.success("You'll get a ping when sellers you follow go live 🔔");
      }
    } finally { setBusy(false); }
  }
  if (!pushSupported()) return null;
  return (
    <button onClick={toggle} disabled={busy} className="flex w-full items-center gap-3 rounded-xl bg-card p-4 text-left disabled:opacity-60">
      {enabled ? <Bell className="h-5 w-5 text-primary" /> : <BellOff className="h-5 w-5 text-muted-foreground" />}
      <div className="flex-1">
        <p className="text-sm font-semibold">Live alerts</p>
        <p className="text-xs text-muted-foreground">{enabled ? "On — followed sellers will ping you" : "Off — tap to get notified when sellers go live"}</p>
      </div>
    </button>
  );
}

function ShopNameClaim({ userId, onClaimed }: { userId: string; onClaimed: (name: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function claim() {
    const v = name.trim();
    if (v.length < 3) return toast.error("Shop name must be at least 3 characters");
    if (!/^[A-Za-z0-9_ -]+$/.test(v)) return toast.error("Letters, numbers, spaces, _ and - only");
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ shop_name: v }).eq("id", userId);
    setBusy(false);
    if (error) {
      if (error.code === "23505" || /duplicate|unique/i.test(error.message)) return toast.error("That shop name is taken — try another");
      return toast.error(error.message);
    }
    toast.success(`Shop name claimed: ${v}`);
    onClaimed(v);
  }
  return (
    <div className="rounded-xl bg-yellow-500/10 p-4 ring-1 ring-yellow-500/30 space-y-2">
      <p className="text-sm font-bold text-yellow-600">🏪 One last step — claim your shop name</p>
      <p className="text-[11px] text-muted-foreground">Pick a unique public name for your shop on PullBid. This is how buyers will recognize you. You must claim a shop name before listing or going live.</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. The Card Vault"
        maxLength={30}
        className="w-full rounded-lg bg-input px-3 py-2 text-sm outline-none"
      />
      <button onClick={claim} disabled={busy || !name.trim()} className="w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">
        {busy ? "Claiming…" : "Claim shop name"}
      </button>
    </div>
  );
}
