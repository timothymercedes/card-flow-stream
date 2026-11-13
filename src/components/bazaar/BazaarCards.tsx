import { Link } from "@tanstack/react-router";
import { BadgeCheck, Store } from "lucide-react";
import { STORE_TYPE_LABEL, formatCents, lowestPriceCents, type BazaarStoreType } from "@/lib/bazaar";

type Variant = { price_cents: number; compare_at_cents: number | null; quantity: number; is_active: boolean; options: unknown };
export type BazaarProductRow = { id: string; title: string; department: string | null; images: string[]; brand: string | null; bazaar_product_variants: Variant[] };
export type BazaarStoreRow = { id: string; slug: string; name: string; store_type: string; logo_url: string | null; description: string | null; verification_status: string; category: string | null };

export function StoreBadge({ type, verified }: { type: string; verified: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
      {verified && <BadgeCheck className="h-3 w-3" aria-hidden="true" />}
      {STORE_TYPE_LABEL[type as BazaarStoreType] ?? type}
    </span>
  );
}

export function StoreCard({ s }: { s: BazaarStoreRow }) {
  return (
    <Link to="/bazaar/stores/$slug" params={{ slug: s.slug }} className="flex w-56 shrink-0 flex-col gap-2 rounded-2xl bg-card p-3 ring-1 ring-border transition hover:ring-primary/50">
      <div className="flex items-center gap-2">
        <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-muted">
          {s.logo_url ? <img src={s.logo_url} alt="" className="h-full w-full object-cover" /> : <Store className="h-5 w-5 text-muted-foreground" />}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{s.name}</p>
          <StoreBadge type={s.store_type} verified={s.verification_status === "verified"} />
        </div>
      </div>
      {s.description && <p className="line-clamp-2 text-xs text-muted-foreground">{s.description}</p>}
    </Link>
  );
}

export function ProductCard({ p }: { p: BazaarProductRow }) {
  const variants = p.bazaar_product_variants ?? [];
  const price = lowestPriceCents(variants);
  const stock = variants.filter((v) => v.is_active).reduce((n, v) => n + v.quantity, 0);
  return (
    <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-border">
      <div className="aspect-square bg-muted">
        {p.images[0] ? <img src={p.images[0]} alt={p.title} loading="lazy" className="h-full w-full object-cover" /> : null}
      </div>
      <div className="space-y-1 p-3">
        <p className="line-clamp-2 text-sm font-semibold">{p.title}</p>
        {price !== null && <p className="text-sm font-black text-primary">{variants.length > 1 ? "From " : ""}{formatCents(price)}</p>}
        <p className="text-[11px] text-muted-foreground">
          {variants.length > 1 ? `${variants.length} options · ` : ""}{stock > 0 ? `${stock} in stock` : "Out of stock"}
        </p>
      </div>
    </div>
  );
}
