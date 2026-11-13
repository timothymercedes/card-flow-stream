import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { AppShell } from "@/components/AppShell";
import { ShoppingBag, Store, Search, PlusCircle } from "lucide-react";
import { BAZAAR_DEPARTMENTS, fetchActiveStores, fetchNewProducts } from "@/lib/bazaar";
import { ProductCard, StoreCard, type BazaarProductRow, type BazaarStoreRow } from "@/components/bazaar/BazaarCards";

export const Route = createFileRoute("/bazaar/")({
  validateSearch: zodValidator(z.object({ dept: z.string().optional(), type: z.enum(["independent", "brand", "pb_owned"]).optional() })),
  head: () => ({ meta: [
    { title: "PB Bazaar — Multi-Store Retail on PullBid Live" },
    { name: "description", content: "Shop independent stores, official brands and PB retail in one place on PullBid Live." },
    { property: "og:title", content: "PB Bazaar — Shop Verified Stores" },
    { property: "og:description", content: "Independent businesses, official brands and PullBid stores, all in PB Bazaar." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: BazaarHome,
});

function BazaarHome() {
  const { dept, type } = Route.useSearch();
  const nav = Route.useNavigate();
  const [q, setQ] = useState("");
  const stores = useQuery({ queryKey: ["bazaar", "stores"], queryFn: fetchActiveStores });
  const products = useQuery({ queryKey: ["bazaar", "products", dept ?? ""], queryFn: () => fetchNewProducts(dept) });

  const term = q.trim().toLowerCase();
  const storeList = ((stores.data ?? []) as BazaarStoreRow[]).filter((s) => (!type || s.store_type === type) && (!term || s.name.toLowerCase().includes(term)));
  const productList = ((products.data ?? []) as unknown as BazaarProductRow[]).filter((p) => !term || p.title.toLowerCase().includes(term) || (p.brand ?? "").toLowerCase().includes(term));
  const pill = (active: boolean) => `shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${active ? "bg-primary text-primary-foreground ring-primary" : "bg-card text-muted-foreground ring-border hover:text-foreground"}`;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl space-y-6 px-3 py-4 sm:px-4">
        <section className="rounded-3xl bg-gradient-to-br from-primary/20 via-card to-card p-5 ring-1 ring-border">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-primary"><ShoppingBag className="h-3.5 w-3.5" /> PB Bazaar</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Shop verified stores & brands</h1>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">Independent businesses, official brands and PullBid retail — separate from the collector Marketplace.</p>
            </div>
            <Link to="/bazaar/apply" className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"><PlusCircle className="h-4 w-4" /> Open a store</Link>
          </div>
          <label className="mt-4 flex items-center gap-2 rounded-xl bg-background px-3 py-2 ring-1 ring-border">
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stores, brands or products…" className="w-full bg-transparent text-sm outline-none" aria-label="Search PB Bazaar" />
          </label>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <button className={pill(!type)} onClick={() => nav({ search: (p) => ({ ...p, type: undefined }) })}>All stores</button>
            <button className={pill(type === "brand")} onClick={() => nav({ search: (p) => ({ ...p, type: "brand" }) })}>Official brands</button>
            <button className={pill(type === "independent")} onClick={() => nav({ search: (p) => ({ ...p, type: "independent" }) })}>Independent</button>
            <button className={pill(type === "pb_owned")} onClick={() => nav({ search: (p) => ({ ...p, type: "pb_owned" }) })}>PB Official</button>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">Featured stores</h2>
          {stores.isLoading ? <p className="text-sm text-muted-foreground">Loading stores…</p> : storeList.length ? (
            <div className="flex gap-3 overflow-x-auto pb-2">{storeList.map((s) => <StoreCard key={s.id} s={s} />)}</div>
          ) : (
            <div className="rounded-2xl bg-card p-6 text-center ring-1 ring-border">
              <Store className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold">No stores are open yet</p>
              <p className="text-xs text-muted-foreground">Be one of the first — apply to open your store.</p>
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">Shop by department</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button className={pill(!dept)} onClick={() => nav({ search: (p) => ({ ...p, dept: undefined }) })}>All</button>
            {BAZAAR_DEPARTMENTS.map((d) => <button key={d} className={pill(dept === d)} onClick={() => nav({ search: (p) => ({ ...p, dept: d }) })}>{d}</button>)}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">New arrivals</h2>
          {products.isLoading ? <p className="text-sm text-muted-foreground">Loading products…</p> : productList.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{productList.map((p) => <ProductCard key={p.id} p={p} />)}</div>
          ) : <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground ring-1 ring-border">No products published yet.</p>}
        </section>
      </div>
    </AppShell>
  );
}
