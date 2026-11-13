import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ArrowLeft, Search, Store, Truck, RotateCcw } from "lucide-react";
import { fetchStoreBySlug } from "@/lib/bazaar";
import { ProductCard, StoreBadge, type BazaarProductRow } from "@/components/bazaar/BazaarCards";

export const Route = createFileRoute("/bazaar/stores/$slug")({
  head: ({ params }) => ({ meta: [
    { title: `${params.slug} — PB Bazaar Store` },
    { name: "description", content: "Shop this store's products, policies and shipping on PB Bazaar." },
    { property: "og:title", content: `${params.slug} on PB Bazaar` },
    { property: "og:description", content: "A PB Bazaar storefront on PullBid Live." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Storefront,
});

function Storefront() {
  const { slug } = Route.useParams();
  const [q, setQ] = useState("");
  const { data, isLoading, error } = useQuery({ queryKey: ["bazaar", "store", slug], queryFn: () => fetchStoreBySlug(slug) });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-4">
        <Link to="/bazaar" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> PB Bazaar</Link>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading store…</p> : error ? (
          <p role="alert" className="text-sm text-destructive">Couldn't load this store.</p>
        ) : !data ? (
          <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
            <Store className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 font-semibold">This store isn't open</p>
          </div>
        ) : (() => {
          const { store, products } = data;
          const term = q.trim().toLowerCase();
          const list = (products as unknown as BazaarProductRow[]).filter((p) => !term || p.title.toLowerCase().includes(term));
          return (
            <div className="space-y-5">
              <div className="overflow-hidden rounded-3xl bg-card ring-1 ring-border">
                <div className="h-32 bg-gradient-to-r from-primary/30 to-muted sm:h-44">
                  {store.cover_url && <img src={store.cover_url} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="flex flex-wrap items-end gap-3 p-4">
                  <div className="-mt-12 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-muted ring-4 ring-card">
                    {store.logo_url ? <img src={store.logo_url} alt="" className="h-full w-full object-cover" /> : <Store className="h-8 w-8 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 className="text-2xl font-black">{store.name}</h1>
                    <StoreBadge type={store.store_type} verified={store.verification_status === "verified"} />
                    {store.description && <p className="mt-2 text-sm text-muted-foreground">{store.description}</p>}
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-2 rounded-xl bg-card px-3 py-2 ring-1 ring-border">
                <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search in this store…" className="w-full bg-transparent text-sm outline-none" aria-label="Search this store" />
              </label>
              {list.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{list.map((p) => <ProductCard key={p.id} p={p} />)}</div>
              ) : <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground ring-1 ring-border">No products yet.</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-card p-4 ring-1 ring-border"><p className="flex items-center gap-1.5 text-sm font-bold"><Truck className="h-4 w-4" /> Shipping</p><p className="mt-1 text-sm text-muted-foreground">{store.shipping_policy || "Not provided yet."}{store.processing_days != null ? ` Ships in ${store.processing_days} business day(s).` : ""}</p></div>
                <div className="rounded-2xl bg-card p-4 ring-1 ring-border"><p className="flex items-center gap-1.5 text-sm font-bold"><RotateCcw className="h-4 w-4" /> Returns</p><p className="mt-1 text-sm text-muted-foreground">{store.return_policy || "Not provided yet."}</p></div>
              </div>
            </div>
          );
        })()}
      </div>
    </AppShell>
  );
}
