import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Radio, Sparkles, ShieldCheck, Zap, Trophy, PackageCheck, CreditCard,
  Gavel, Store, Video, Lock, PlayCircle, Users, Globe, MessageSquare,
  Truck, ScanLine, ChevronRight, Mail, ArrowRight,
} from "lucide-react";
import { Turnstile } from "@/components/Turnstile";
import heroCards from "@/assets/hero-cards.jpg";
import logo from "@/assets/logo.png";

export default function PublicLanding() {
  const [streams, setStreams] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [stats, setStats] = useState({ live: 0, collectors: 0, listings: 0 });

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: l }, [{ count: live }, { count: coll }, { count: ll }]] = await Promise.all([
        supabase.from("live_streams").select("id,title,thumbnail_url,current_bid,category").eq("status","live").order("created_at",{ascending:false}).limit(6),
        supabase.from("listings").select("id,title,image_url,price,category").order("created_at",{ascending:false}).limit(8),
        Promise.all([
          supabase.from("live_streams").select("*",{count:"exact",head:true}).eq("status","live"),
          supabase.from("profiles").select("*",{count:"exact",head:true}),
          supabase.from("listings").select("*",{count:"exact",head:true}),
        ]),
      ]);
      setStreams(s || []);
      setListings(l || []);
      setStats({ live: live||0, collectors: coll||0, listings: ll||0 });
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />

      {/* HERO */}
      <header className="relative overflow-hidden">
        <img src={heroCards} alt="Holographic trading cards" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
        <div className="absolute inset-0 holo-foil opacity-[0.08] mix-blend-overlay pointer-events-none" />
        <div className="relative mx-auto max-w-6xl px-5 pb-14 pt-10 md:pb-24 md:pt-20">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary backdrop-blur">
            <Lock className="h-3 w-3" /> Private Beta · Invite Only
          </div>
          <h1 className="text-4xl font-black leading-[1.05] tracking-tight md:text-6xl">
            Pull. Bid. <span className="holo-text">Vault.</span>
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground md:text-lg">
            Live trading-card auctions, Flex Live shows, and a global collector marketplace —
            streamed in real time with protected payments and tracked shipping.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#beta" className="rounded-xl bg-gradient-to-r from-primary to-primary-glow px-5 py-3 text-sm font-bold text-primary-foreground rare-glow inline-flex items-center gap-2">
              Request Beta Access <ArrowRight className="h-4 w-4" />
            </a>
            <Link to="/auth" className="rounded-xl border border-border bg-card/70 px-5 py-3 text-sm font-bold backdrop-blur">
              Sign In
            </Link>
            <a href="#demo" className="rounded-xl border border-border bg-card/70 px-5 py-3 text-sm font-bold backdrop-blur inline-flex items-center gap-2">
              <PlayCircle className="h-4 w-4" /> Watch Demo
            </a>
          </div>

          <div className="mt-10 grid max-w-2xl grid-cols-3 gap-3">
            <Stat value={stats.live} label="Live now" accent />
            <Stat value={stats.collectors} label="Collectors" />
            <Stat value={stats.listings} label="Listings" />
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Pill icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Verified Sellers" />
            <Pill icon={<Zap className="h-3.5 w-3.5" />} label="Instant Bidding" />
            <Pill icon={<Trophy className="h-3.5 w-3.5" />} label="Authenticated Pulls" />
            <Pill icon={<Truck className="h-3.5 w-3.5" />} label="Tracked Shipping" />
          </div>
        </div>
      </header>

      {/* LIVE PREVIEW */}
      <Section eyebrow="Live Now" title="Real auctions, streamed in real time"
        subtitle="Join scheduled drops or jump into a Flex Live show. Bidding, chat, and payment all in one place."
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(streams.length ? streams : Array.from({length:4})).slice(0,4).map((s: any, i) => (
            <div key={s?.id || i} className="card-foil-edge relative aspect-[3/4] overflow-hidden rounded-xl bg-muted ring-1 ring-border">
              {s?.thumbnail_url
                ? <img src={s.thumbnail_url} alt={s.title} className="h-full w-full object-cover" />
                : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/30 to-live/30"><Radio className="h-8 w-8" /></div>}
              <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-live px-2 py-0.5 text-[10px] font-bold text-live-foreground">
                <span className="h-1.5 w-1.5 live-pulse rounded-full bg-live-foreground" /> {s?.title ? "LIVE" : "DEMO"}
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                <p className="line-clamp-1 text-xs font-bold text-white">{s?.title || "Sample Live Auction"}</p>
                <p className="text-[11px] font-semibold text-primary-glow">${Number(s?.current_bid || (i+1)*25).toFixed(0)} current bid</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* MARKETPLACE PREVIEW */}
      <Section eyebrow="Marketplace" title="Featured cards & products"
        subtitle="Buy now, make offers, or save to your vault — all gated behind beta until launch."
      >
        <div className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-2">
          {(listings.length ? listings : Array.from({length:6})).map((l: any, i) => (
            <div key={l?.id || i} className="w-44 flex-shrink-0 overflow-hidden rounded-xl bg-card ring-1 ring-border">
              <div className="card-foil-edge aspect-square bg-muted">
                {l?.image_url
                  ? <img src={l.image_url} className="h-full w-full object-cover" alt={l.title} />
                  : <div className="h-full w-full bg-gradient-to-br from-primary/20 to-accent" />}
              </div>
              <div className="p-2.5">
                <p className="line-clamp-1 text-xs font-semibold">{l?.title || "Featured card"}</p>
                <p className="mt-1 text-xs font-bold text-primary">${Number(l?.price || (i+1)*15).toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* AUDIENCES */}
      <Section eyebrow="Built for everyone" title="One platform, three sides">
        <div className="grid gap-4 md:grid-cols-3">
          <AudienceCard
            icon={<Gavel className="h-6 w-6" />}
            title="For Buyers"
            points={["Bid live with one tap", "Protected checkout via Stripe", "Tracked shipping & dispute support", "Save to your personal Vault"]}
          />
          <AudienceCard
            icon={<Store className="h-6 w-6" />}
            title="For Sellers"
            points={["List in seconds with AI scanner", "Schedule drops & live auctions", "Automatic payouts to your bank", "Built-in messaging & analytics"]}
          />
          <AudienceCard
            icon={<Video className="h-6 w-6" />}
            title="For Live Hosts"
            points={["Studio-grade live streaming", "OBS Hub for pro setups", "Real-time bidding overlays", "Captions, voice-over, and tips"]}
          />
        </div>
      </Section>

      {/* DEMO VIDEO */}
      <section id="demo" className="mx-auto max-w-6xl px-5 py-12">
        <div className="overflow-hidden rounded-3xl border border-border bg-card">
          <div className="grid gap-0 md:grid-cols-2">
            <div className="relative aspect-video bg-black">
              <video
                src="/__l5e/assets-v1/21c2a990-2dcf-4437-a79c-1d2182b8fbcb/welcome.mp4"
                controls
                playsInline
                preload="metadata"
                className="h-full w-full object-contain"
              />
              <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-bold uppercase backdrop-blur">Welcome tour</div>
            </div>
            <div className="p-6 md:p-8">
              <p className="text-[11px] font-bold uppercase tracking-wider text-primary">How it works</p>
              <h3 className="mt-1 text-2xl font-black tracking-tight">From pull to payout, in minutes</h3>
              <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
                <li className="flex gap-2"><span className="font-bold text-primary">1.</span> Scan or list your card with the AI scanner.</li>
                <li className="flex gap-2"><span className="font-bold text-primary">2.</span> Go live or schedule a drop. Buyers bid in real time.</li>
                <li className="flex gap-2"><span className="font-bold text-primary">3.</span> Stripe captures payment, Shippo prints labels.</li>
                <li className="flex gap-2"><span className="font-bold text-primary">4.</span> Payouts hit your bank. Buyers vault their pull.</li>
              </ol>
              <Link to="/tutorials" className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">
                <PlayCircle className="h-4 w-4" /> Watch all tutorials
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* TUTORIAL HIGHLIGHTS */}
      <Section eyebrow="Learn in minutes" title="Short videos for every role"
        subtitle="Buyers, sellers, and live hosts — pick your path and watch the basics in under 5 minutes.">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            { title: "How to Bid in a Live Auction", role: "Buyers", color: "from-primary/30 to-fuchsia-500/20" },
            { title: "Listing Your First Card", role: "Sellers", color: "from-emerald-500/30 to-primary/20" },
            { title: "Hosting Your First Live Show", role: "Hosts", color: "from-live/30 to-primary/20" },
          ].map((t) => (
            <Link key={t.title} to="/tutorials" className={`group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br ${t.color} p-5 aspect-video flex flex-col justify-between`}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary">{t.role}</p>
              <div>
                <p className="text-sm font-bold">{t.title}</p>
                <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground group-hover:text-foreground">
                  <PlayCircle className="h-3.5 w-3.5" /> Watch tutorial
                </p>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      {/* SELLER HUB PREVIEW */}
      <Section eyebrow="Seller Hub" title="Run your business from one dashboard"
        subtitle="Inventory, drops, orders, payouts, messaging, analytics — everything sellers need without leaving the app.">
        <div className="grid gap-3 md:grid-cols-4">
          {[
            { icon: <ScanLine className="h-5 w-5" />, label: "AI Scanner" },
            { icon: <Store className="h-5 w-5" />, label: "Listings & Drops" },
            { icon: <PackageCheck className="h-5 w-5" />, label: "Orders & Shipping" },
            { icon: <CreditCard className="h-5 w-5" />, label: "Payouts" },
            { icon: <MessageSquare className="h-5 w-5" />, label: "Messaging" },
            { icon: <Video className="h-5 w-5" />, label: "OBS Hub" },
            { icon: <Users className="h-5 w-5" />, label: "Followers" },
            { icon: <Sparkles className="h-5 w-5" />, label: "AI Pricing" },
          ].map((f) => (
            <div key={f.label} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">{f.icon}</div>
              <span className="text-sm font-semibold">{f.label}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* TRUST & SAFETY */}
      <Section eyebrow="Trust & safety" title="Protected by design">
        <div className="grid gap-4 md:grid-cols-3">
          <SafetyCard icon={<CreditCard className="h-5 w-5" />} title="Stripe-protected checkout"
            body="Every payment is held by Stripe Connect. Funds release to sellers only after delivery — buyers are protected if something goes wrong." />
          <SafetyCard icon={<Truck className="h-5 w-5" />} title="Tracked shipping included"
            body="Shippo-powered labels with built-in tracking and signature options. Disputes auto-link to delivery proof." />
          <SafetyCard icon={<ShieldCheck className="h-5 w-5" />} title="Verified sellers & moderation"
            body="Identity-verified sellers, AI moderation on streams and chat, and a global block & report system across the app." />
        </div>
      </Section>

      {/* BETA FORM */}
      <BetaForm />

      {/* FOOTER */}
      <Footer />
    </div>
  );
}

function SiteNav() {
  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt="PullBid Live" className="h-7 w-7 rounded-md" />
          <span className="text-sm font-black tracking-tight">PullBid Live</span>
          <span className="ml-1 hidden rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary sm:inline">Beta</span>
        </Link>
        <div className="flex items-center gap-2">
          <a href="#beta" className="hidden rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground sm:inline">Request Access</a>
          <Link to="/auth" className="rounded-lg bg-card px-3 py-1.5 text-xs font-bold ring-1 ring-border">Sign In</Link>
        </div>
      </div>
    </nav>
  );
}

function Section({ eyebrow, title, subtitle, children }: { eyebrow?: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-6xl px-5 py-12">
      {eyebrow && <p className="text-[11px] font-bold uppercase tracking-wider text-primary">{eyebrow}</p>}
      <h2 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">{title}</h2>
      {subtitle && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Stat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-3 text-center backdrop-blur">
      <div className={`text-xl font-black tabular-nums ${accent ? "text-primary" : ""}`}>{value.toLocaleString()}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function Pill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1 text-[11px] font-semibold text-muted-foreground backdrop-blur">
      <span className="text-primary">{icon}</span>{label}
    </div>
  );
}

function AudienceCard({ icon, title, points }: { icon: React.ReactNode; title: string; points: string[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</div>
      <h3 className="mt-3 text-lg font-black tracking-tight">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
        {points.map((p) => (
          <li key={p} className="flex gap-2"><ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{p}</li>
        ))}
      </ul>
    </div>
  );
}

function SafetyCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</div>
      <h3 className="mt-3 text-base font-bold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function BetaForm() {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", role: "buyer", message: "" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email) return;
    setSubmitting(true);
    const { error } = await supabase.from("beta_access_requests").insert({
      email: form.email.trim().toLowerCase(),
      name: form.name.trim() || null,
      role: form.role,
      message: form.message.trim() || null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Couldn't submit — try again");
      return;
    }
    setDone(true);
    toast.success("You're on the list! We'll email when your invite is ready.");
  };

  return (
    <section id="beta" className="mx-auto max-w-3xl px-5 py-16">
      <div className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-6 md:p-10">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
          <Lock className="h-3 w-3" /> Invite only
        </div>
        <h2 className="text-2xl font-black tracking-tight md:text-3xl">Request beta access</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          We're onboarding collectors, sellers, and live hosts in waves. Drop your email and we'll send your invite code.
        </p>
        {done ? (
          <div className="mt-6 rounded-xl border border-primary/30 bg-primary/10 p-5 text-center">
            <Mail className="mx-auto h-6 w-6 text-primary" />
            <p className="mt-2 text-sm font-bold">You're on the list.</p>
            <p className="text-xs text-muted-foreground">We'll email <span className="font-semibold text-foreground">{form.email}</span> when an invite is ready.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 grid gap-3 md:grid-cols-2">
            <input required type="email" placeholder="you@email.com" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="md:col-span-2 rounded-xl border border-border bg-background px-4 py-3 text-sm" />
            <input type="text" placeholder="Name (optional)" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded-xl border border-border bg-background px-4 py-3 text-sm" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="rounded-xl border border-border bg-background px-4 py-3 text-sm">
              <option value="buyer">I want to buy / collect</option>
              <option value="seller">I want to sell</option>
              <option value="host">I want to host live shows</option>
              <option value="both">All of the above</option>
            </select>
            <textarea placeholder="Tell us what you collect or sell (optional)" value={form.message} rows={3}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="md:col-span-2 rounded-xl border border-border bg-background px-4 py-3 text-sm" />
            <button disabled={submitting} type="submit"
              className="md:col-span-2 rounded-xl bg-gradient-to-r from-primary to-primary-glow px-5 py-3 text-sm font-bold text-primary-foreground rare-glow disabled:opacity-50">
              {submitting ? "Submitting…" : "Request invite"}
            </button>
            <p className="md:col-span-2 text-center text-[11px] text-muted-foreground">
              Already have an invite code? <Link to="/auth" className="font-semibold text-primary">Sign in</Link>.
            </p>
          </form>
        )}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <img src={logo} alt="" className="h-7 w-7 rounded-md" />
            <span className="text-sm font-black tracking-tight">PullBid Live</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Live card auctions, holo drops & a global collector community.</p>
          <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            <Globe className="h-3 w-3" /> Worldwide · Private Beta
          </div>
        </div>
        <FooterCol title="Product" links={[["Live", "/live"], ["Marketplace", "/market"], ["Flex Live", "/showoff"], ["Tutorials", "/tutorials"]]} />
        <FooterCol title="Legal" links={[["Terms", "/legal/tos"], ["Privacy", "/legal/privacy"], ["Buyer Terms", "/legal/buyer-terms"], ["Seller Agreement", "/legal/seller-agreement"], ["Community", "/legal/community-guidelines"]]} />
        <FooterCol title="Support" links={[["Help & Tutorials", "/tutorials"], ["Contact", "mailto:support@pullbidlive.com"], ["Status", "#"]]} />
      </div>
      <div className="border-t border-border px-5 py-4 text-center text-[11px] text-muted-foreground">
        © {new Date().getFullYear()} PullBid Live · All rights reserved
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map(([label, href]) => (
          <li key={label}>
            {href.startsWith("/") ? (
              <Link to={href as any} className="text-foreground/80 hover:text-primary">{label}</Link>
            ) : (
              <a href={href} className="text-foreground/80 hover:text-primary">{label}</a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
