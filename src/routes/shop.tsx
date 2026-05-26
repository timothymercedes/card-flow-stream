import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Construction, Sparkles, Bell, ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Store — PullBid Live" },
      { name: "description", content: "The PullBid Live Store is coming soon — exclusive merch, supplies, and member perks for subscribers." },
      { property: "og:title", content: "PullBid Live Store — Coming Soon" },
      { property: "og:description", content: "Exclusive merch, supplies, and member perks for PullBid Live subscribers." },
    ],
  }),
  component: ShopComingSoon,
});

function ShopComingSoon() {
  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-12 text-center">
        <div className="relative mb-6">
          <div className="absolute inset-0 animate-pulse rounded-full bg-primary/20 blur-2xl" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-primary-glow shadow-[var(--shadow-primary)]">
            <Construction className="h-12 w-12 text-primary-foreground" aria-hidden="true" />
          </div>
        </div>

        <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
          <Sparkles className="h-3 w-3" /> Coming Soon
        </span>

        <h1 className="text-3xl font-black tracking-tight">PullBid Live Store</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          We're building an exclusive store for our subscriber community — premium supplies, limited merch, mystery packs, and member-only perks.
        </p>

        <div className="mt-6 grid w-full grid-cols-3 gap-2">
          {[
            { icon: ShoppingBag, label: "Supplies" },
            { icon: Sparkles, label: "Mystery Packs" },
            { icon: Bell, label: "Member Perks" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="rounded-xl bg-card p-3 ring-1 ring-border">
              <Icon className="mx-auto h-5 w-5 text-primary" aria-hidden="true" />
              <p className="mt-1.5 text-[11px] font-semibold">{label}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex w-full flex-col gap-2">
          <Link
            to="/market"
            className="rounded-xl bg-gradient-to-r from-primary to-primary-glow px-4 py-3 text-sm font-bold text-primary-foreground shadow-[var(--shadow-primary)]"
          >
            Browse the Market
          </Link>
          <Link to="/" className="rounded-xl border border-border/60 bg-card/60 px-4 py-3 text-sm font-bold">
            Back to Home
          </Link>
        </div>

        <p className="mt-8 text-[11px] text-muted-foreground">
          Want early access? Watch your notifications — subscribers get first dibs.
        </p>
      </div>
    </AppShell>
  );
}
