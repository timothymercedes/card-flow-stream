import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { FlaskConical, Minus, Plus, ShoppingCart } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BazaarImage } from "@/components/bazaar/BazaarImage";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useBazaarCart } from "@/hooks/useBazaarCart";
import { formatCents } from "@/lib/bazaar";
import { addCartItem, buyable, variantLabel } from "@/lib/bazaarShopping";
import { getBazaarPrivateTestProducts } from "@/lib/bazaarPreview.functions";

export const Route = createFileRoute("/admin/bazaar-preview/$id")({
  head: () => ({ meta: [
    { title: "Private Test Preview — PB Bazaar Admin" },
    { name: "description", content: "Admin-only preview of a private test PB Bazaar product." },
    { property: "og:title", content: "Private Test Preview — PB Bazaar Admin" },
    { property: "og:description", content: "Admin-only private test product preview." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  component: PreviewPage,
});

function PreviewPage() {
  const { id } = Route.useParams();
  const { user, loading } = useAuth();
  const fetchPreview = useServerFn(getBazaarPrivateTestProducts);
  const q = useQuery({ queryKey: ["bazaar-private-test", id, user?.id], enabled: !!user, queryFn: async () => (await fetchPreview({ data: { ids: [id] } }))[0] ?? null });
  const cart = useBazaarCart();
  const [selected, setSelected] = useState<string>();
  const [qty, setQty] = useState(1);
  const p = q.data;
  const variant = p?.bazaar_product_variants.find((v) => v.id === (selected ?? p.bazaar_product_variants.find(buyable)?.id));
  return <AppShell><div className="mx-auto max-w-5xl space-y-5 px-3 py-5 sm:px-5">
    <p role="status" className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm font-semibold"><FlaskConical className="h-4 w-4" />Admin private test preview — hidden from shoppers. Test-mode payments only.</p>
    {loading || q.isLoading ? <p>Loading…</p> : !user ? <p>Sign in as an admin.</p> : !p ? <p>Not found. Only admins can open private test products.</p> : <div className="grid gap-6 md:grid-cols-2">
      <div className="aspect-square overflow-hidden rounded-lg bg-muted">{p.images[0] && <BazaarImage src={p.images[0]} alt={p.title} className="h-full w-full object-contain" />}</div>
      <section className="space-y-4">
        <h1 className="text-2xl font-bold">{p.title}</h1>
        <p className="text-3xl font-bold">{variant ? formatCents(variant.price_cents) : "Out of stock"}</p>
        <div className="flex flex-wrap gap-2">{p.bazaar_product_variants.map((v) => <Button key={v.id} variant={variant?.id === v.id ? "default" : "outline"} aria-pressed={variant?.id === v.id} disabled={!buyable(v)} onClick={() => { setSelected(v.id); setQty(1); }}>{variantLabel(v.options)}</Button>)}</div>
        {variant && <p className="text-sm text-muted-foreground">{variant.quantity} available</p>}
        <div className="flex items-center gap-3"><div className="flex h-11 items-center rounded-lg border border-border"><Button variant="ghost" size="icon" aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setQty((n) => n - 1)}><Minus /></Button><span className="w-10 text-center">{qty}</span><Button variant="ghost" size="icon" aria-label="Increase quantity" disabled={!variant || qty >= variant.quantity} onClick={() => setQty((n) => n + 1)}><Plus /></Button></div>
          <Button className="flex-1" disabled={!variant || !buyable(variant) || !cart.ready} onClick={() => { try { cart.update((items) => addCartItem(items, p, variant!.id, qty)); toast.success("Added to your Bazaar cart"); } catch (e) { toast.error((e as Error).message); } }}><ShoppingCart />Add to cart</Button></div>
        {variant && buyable(variant) ? <Button asChild size="lg" variant="secondary" className="w-full"><Link to="/bazaar/checkout" search={{ product: p.id, variant: variant.id, qty }}>Buy Now (test mode)</Link></Button> : <Button size="lg" variant="secondary" className="w-full" disabled>Buy Now</Button>}
        <Button asChild variant="outline" className="w-full"><Link to="/bazaar/cart">Open cart</Link></Button>
      </section>
    </div>}
  </div></AppShell>;
}
