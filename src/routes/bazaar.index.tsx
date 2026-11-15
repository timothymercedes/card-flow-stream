import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { AppShell } from "@/components/AppShell";
import { ShoppingBag, ShoppingCart, Store, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BAZAAR_DEPARTMENTS, fetchActiveStores, fetchNewProducts } from "@/lib/bazaar";
import { ProductCard, StoreCard, type BazaarProductRow, type BazaarStoreRow } from "@/components/bazaar/BazaarCards";
import { listComingSoonProducts } from "@/lib/bazaarComingSoon.functions";
import { BazaarImage } from "@/components/bazaar/BazaarImage";
import { formatCents, lowestPriceCents } from "@/lib/bazaar";
import { DepartmentPhoto } from '@/components/DepartmentPhoto';
import { BAZAAR_DEPT } from '@/components/DepartmentChoiceDialog';
import { SHOPPING_DEPARTMENTS } from '@/lib/categoryShoppingConfig';

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
  const [open, setOpen] = useState(false);
  const stores = useQuery({ queryKey: ["bazaar", "stores"], queryFn: fetchActiveStores });
  const products = useQuery({ queryKey: ["bazaar", "products", dept ?? ""], queryFn: async () => {
    const [live, soon] = await Promise.all([fetchNewProducts(dept), listComingSoonProducts({ data: { dept } }).catch(() => [])]);
    return [...live, ...soon];
  } });

  const marketKey = dept ? Object.keys(BAZAAR_DEPT).find((k) => BAZAAR_DEPT[k] === dept) : undefined;
  const marketDept = marketKey ? SHOPPING_DEPARTMENTS.find((d) => d.value === marketKey) : undefined;
  const term = q.trim().toLowerCase();
  const storeList = ((stores.data ?? []) as BazaarStoreRow[]).filter((s) => (!type || s.store_type === type) && (!term || s.name.toLowerCase().includes(term)));
  const productList = ((products.data ?? []) as unknown as BazaarProductRow[]).filter((p) => !term || p.title.toLowerCase().includes(term) || (p.brand ?? "").toLowerCase().includes(term) || (p.department ?? "").toLowerCase().includes(term));
  const pill = (active: boolean) => `shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${active ? "bg-primary text-primary-foreground ring-primary" : "bg-card text-muted-foreground ring-border hover:text-foreground"}`;
  const photoKey: Record<string,string> = {Fashion:'fashion',Footwear:'footwear',Electronics:'electronics',Home:'home',Beauty:'beauty',Tools:'tools',Automotive:'automotive','Sports & Outdoors':'sports_outdoors','Toys & Hobbies':'collectibles',Collectibles:'collectibles'};

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl space-y-6 px-3 py-4 sm:px-4">
        {marketDept && <nav aria-label="Where to shop" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm font-semibold">
          <span aria-current="page" className="rounded-md bg-card px-3 py-2 text-center text-foreground shadow-sm">PB Bazaar <span className="hidden text-xs font-normal text-muted-foreground sm:inline">· new, fixed price</span></span>
          <Link to="/marketplace/$department" params={{ department: marketDept.slug }} search={{}} className="rounded-md px-3 py-2 text-center text-muted-foreground hover:text-foreground">Independent Market <span className="hidden text-xs font-normal sm:inline">· sellers &amp; auctions</span></Link>
        </nav>}
        <section className="rounded-3xl bg-gradient-to-br from-primary/20 via-card to-card p-5 ring-1 ring-border">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-primary"><ShoppingBag className="h-3.5 w-3.5" /> PB Bazaar</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Shop verified stores & brands</h1>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">Independent businesses, official brands and PullBid retail — separate from the collector Marketplace.</p>
            </div>
            <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to="/bazaar/cart"><ShoppingCart />Bazaar cart</Link></Button></div>
          </div>
          <div className="relative mt-4" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
            <label className="flex items-center gap-2 rounded-xl bg-background px-3 py-2 ring-1 ring-border">
              <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={(e) => { if (e.key === "Escape" || e.key === "Enter") setOpen(false); }} placeholder="Search stores, brands or products…" className="w-full bg-transparent text-sm outline-none" aria-label="Search PB Bazaar" aria-expanded={open && !!term} role="combobox" />
              {q && <button type="button" aria-label="Clear search" onClick={() => { setQ(""); setOpen(false); }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
            </label>
            {open && term && (
              <div role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-96 overflow-y-auto rounded-xl bg-popover p-2 text-popover-foreground shadow-lg ring-1 ring-border">
                {storeList.length > 0 && <p className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Stores</p>}
                {storeList.slice(0, 4).map((s) => (
                  <Link key={s.id} to="/bazaar/stores/$slug" params={{ slug: s.slug }} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-accent">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">{s.logo_url ? <BazaarImage src={s.logo_url} alt="" className="h-full w-full object-cover" /> : <Store className="h-4 w-4 text-muted-foreground" />}</span>
                    <span className="truncate text-sm font-semibold">{s.name}</span>
                  </Link>
                ))}
                {productList.length > 0 && <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Items</p>}
                {productList.slice(0, 8).map((p) => { const price = lowestPriceCents(p.bazaar_product_variants ?? []); return (
                  <Link key={p.id} to="/bazaar/products/$id" params={{ id: p.id }} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-accent">
                    <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-muted">{p.images?.[0] ? <BazaarImage src={p.images[0]} alt="" className="h-full w-full object-cover" /> : null}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm">{p.title}</span><span className="block text-[11px] text-muted-foreground">{p.checking ? "Coming soon" : price !== null ? formatCents(price) : ""}{p.department ? ` · ${p.department}` : ""}</span></span>
                  </Link>
                ); })}
                {!storeList.length && !productList.length ? <p className="px-2 py-3 text-sm text-muted-foreground">No stores or items match “{q.trim()}”.</p> : (
                  <button type="button" onClick={() => setOpen(false)} className="mt-1 w-full rounded-lg px-2 py-2 text-left text-sm font-semibold text-primary hover:bg-accent">See all results for “{q.trim()}” ({storeList.length + productList.length})</button>
                )}
              </div>
            )}
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <button className={pill(!type)} onClick={() => nav({ search: (p) => ({ ...p, type: undefined }) })}>All stores</button>
            <button className={pill(type === "brand")} onClick={() => nav({ search: (p) => ({ ...p, type: "brand" }) })}>Official brands</button>
            <button className={pill(type === "independent")} onClick={() => nav({ search: (p) => ({ ...p, type: "independent" }) })}>Independent</button>
            <button className={pill(type === "pb_owned")} onClick={() => nav({ search: (p) => ({ ...p, type: "pb_owned" }) })}>Partner Stores</button>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">Featured stores</h2>
          {stores.isLoading ? <p className="text-sm text-muted-foreground">Loading stores…</p> : storeList.length ? (
            <div className="flex gap-3 overflow-x-auto pb-2">{storeList.map((s) => <StoreCard key={s.id} s={s} />)}</div>
          ) : (
            <div className="rounded-2xl bg-card p-6 text-center ring-1 ring-border">
              <Store className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold">Partner stores are coming soon</p>
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">Shop by department</h2>
          <div className="flex gap-3 overflow-x-auto py-2">
            <Button variant="outline" className="h-auto min-h-11 w-28 shrink-0 whitespace-normal" onClick={() => nav({ search: (p) => ({ ...p, dept: undefined }) })}>All Bazaar departments</Button>
            {BAZAAR_DEPARTMENTS.map((d) => <Button variant="ghost" aria-pressed={dept === d} key={d} className={`h-auto w-36 shrink-0 flex-col gap-0 overflow-hidden border p-0 text-left ${dept === d ? 'border-primary text-primary' : 'border-border text-foreground'}`} onClick={() => nav({ search: (p) => ({ ...p, dept: d }) })}><DepartmentPhoto value={photoKey[d]} className="aspect-[16/10] w-full"/><span className="block min-h-14 w-full whitespace-normal p-3 text-xs font-semibold">{d}</span></Button>)}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">All products{productList.length ? ` (${productList.length})` : ""}</h2>
          {products.isLoading ? <p className="text-sm text-muted-foreground">Loading products…</p> : productList.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{productList.map((p) => <ProductCard key={p.id} p={p} />)}</div>
          ) : <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground ring-1 ring-border">No products published yet.</p>}
        </section>
      </div>
    </AppShell>
  );
}

