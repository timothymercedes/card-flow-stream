import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense } from "react";
import { ShoppingCart, Trash2, Minus, Plus, RefreshCw, ArrowLeft, Truck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { BazaarImage } from "@/components/bazaar/BazaarImage";
import { getBazaarShoppingProducts } from "@/lib/bazaarShopping.functions";
import { checkCart, groupCart, variantLabel, type CartItem } from "@/lib/bazaarShopping";
import { useBazaarCart } from "@/hooks/useBazaarCart";
import { formatCents } from "@/lib/bazaar";
import { toast } from "sonner";

export const Route = createFileRoute("/bazaar/cart")({
  head: () => ({ meta: [{ title: "Your Multi-Store Cart — PB Bazaar" }, { name: "description", content: "Review your PB Bazaar products, selected options, stock and shipping by store." }, { property: "og:title", content: "Your PB Bazaar Cart" }, { property: "og:description", content: "A separate multi-store shopping cart for PB Bazaar." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: CartPage,
  errorComponent: () => <AppShell><div role="alert" className="p-6">Couldn't verify your cart. Please reload to try again.</div></AppShell>,
  notFoundComponent: () => <AppShell><p className="p-6">Cart unavailable.</p></AppShell>,
});
function CartPage() {
  const cart = useBazaarCart();
  return <AppShell><div className="mx-auto max-w-6xl space-y-6 px-3 py-5 sm:px-5"><Button asChild variant="ghost" size="sm"><Link to="/bazaar"><ArrowLeft />Continue shopping</Link></Button><h1 className="flex items-center gap-3 text-2xl font-bold"><ShoppingCart />Your Bazaar cart</h1>
    {cart.storageError && <p role="alert" className="text-destructive">Allow site storage to access your saved cart.</p>}
    {!cart.ready ? <p>Loading cart…</p> : !cart.items.length ? <section className="space-y-4 border-t border-border py-10"><p className="text-muted-foreground">Your cart is empty.</p><Button asChild><Link to="/bazaar">Browse PB Bazaar</Link></Button></section> : <Suspense fallback={<p>Checking availability and prices…</p>}><CartContents items={cart.items} update={cart.update} /></Suspense>}
  </div></AppShell>;
}
function CartContents({ items, update }: { items: CartItem[]; update: (transform: (previous: CartItem[]) => CartItem[]) => void }) {
  const ids = [...new Set(items.map((i) => i.productId))].sort();
  const options = queryOptions({ queryKey: ["bazaar-cart-check", ids], queryFn: () => getBazaarShoppingProducts({ data: { ids } }), staleTime: 0, refetchOnWindowFocus: "always" as const, refetchOnMount: "always" as const, refetchInterval: 60000 });
  const { data: products, isFetching } = useSuspenseQuery(options);
  const client = useQueryClient();
  const rows = checkCart(items, products);
  const groups = groupCart(rows);
  const needsReview = rows.some((r) => r.issue);
  const total = rows.reduce((n, r) => n + (!r.issue && r.variant ? r.variant.price_cents * r.item.quantity : 0), 0);
  const save = (fn: (previous: CartItem[]) => CartItem[]) => { try { update(fn); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save your cart."); } };
  return <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_300px]">
    <div className="min-w-0 space-y-6"><div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{items.reduce((n, i) => n + i.quantity, 0)} items · {groups.filter((g) => g.store).length} stores</p><Button variant="outline" size="sm" disabled={isFetching} onClick={() => void client.invalidateQueries({ queryKey: options.queryKey })}><RefreshCw className={isFetching ? "animate-spin" : ""} />{isFetching ? "Checking…" : "Recheck"}</Button></div>
      {groups.map(({ store, rows: storeRows }) => <section key={store?.id ?? "unavailable"} className="border-t border-border pt-4">
        {store ? <Link to="/bazaar/stores/$slug" params={{ slug: store.slug }} className="text-lg font-bold hover:text-primary">{store.name}</Link> : <h2 className="text-lg font-bold">Unavailable items</h2>}
        {store && <div className="mt-2 flex items-start gap-2 text-sm text-muted-foreground"><Truck className="mt-0.5 h-4 w-4 shrink-0" /><p className="whitespace-pre-wrap break-words">{store.shipping_policy || "Shipping rates not available yet."}{store.processing_days != null ? ` Processing: ${store.processing_days} business days.` : ""}</p></div>}
        <div className="mt-3 divide-y divide-border">{storeRows.map(({ item, product, variant, issue }) => <article key={item.variantId} className="flex gap-3 py-4">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">{product?.images[0] && <BazaarImage src={product.images[0]} alt={product.title} className="h-full w-full object-contain" />}</div>
          <div className="min-w-0 flex-1">{product ? <Link to="/bazaar/products/$id" params={{ id: product.id }} className="break-words font-semibold hover:text-primary">{product.title}</Link> : <p className="font-semibold">Product no longer available</p>}
            {variant && <><p className="mt-1 break-words text-xs text-muted-foreground">{variantLabel(variant.options)}{variant.sku ? ` · ${variant.sku}` : ""}</p><p className="mt-2 font-bold">{formatCents(variant.price_cents)} each</p></>}
            {issue && <p role="alert" className="mt-2 text-sm text-destructive">{issue === "unavailable" ? "This product or selected option is unavailable." : issue === "stock" ? `Only ${variant?.quantity ?? 0} available. Reduce the quantity.` : `Price changed from ${formatCents(item.seenPrice)} to ${formatCents(variant?.price_cents ?? 0)}.`}</p>}
            {issue === "price" && variant && <Button variant="outline" size="sm" className="mt-2" onClick={() => save((all) => all.map((i) => i.variantId === item.variantId ? { ...i, seenPrice: variant.price_cents } : i))}>Accept updated price</Button>}
            <div className="mt-3 flex flex-wrap items-center gap-2"><div className="flex items-center rounded-md border border-border"><Button variant="ghost" size="icon" aria-label={`Decrease quantity for ${product?.title ?? "item"}`} disabled={item.quantity <= 1 || !variant} onClick={() => save((all) => all.map((i) => i.variantId === item.variantId ? { ...i, quantity: i.quantity - 1 } : i))}><Minus /></Button><span className="w-8 text-center tabular-nums">{item.quantity}</span><Button variant="ghost" size="icon" aria-label={`Increase quantity for ${product?.title ?? "item"}`} disabled={!variant || item.quantity >= variant.quantity || issue === "unavailable"} onClick={() => save((all) => all.map((i) => i.variantId === item.variantId ? { ...i, quantity: i.quantity + 1 } : i))}><Plus /></Button></div><Button variant="ghost" size="icon" aria-label={`Remove ${product?.title ?? "unavailable item"}`} title="Remove item" onClick={() => save((all) => all.filter((i) => i.variantId !== item.variantId))}><Trash2 /></Button></div>
          </div>
          {!issue && variant && <p className="hidden shrink-0 font-bold sm:block">{formatCents(variant.price_cents * item.quantity)}</p>}
        </article>)}</div>
      </section>)}
    </div>
    <aside className="space-y-4 border-t border-border pt-4"><h2 className="text-lg font-bold">Summary</h2><div className="flex justify-between gap-3"><span>{needsReview ? "Available items subtotal" : "Items subtotal"}</span><strong>{formatCents(total)}</strong></div><p className="text-sm text-muted-foreground">Shipping and tax are not calculated.</p>{needsReview && <p className="text-sm text-destructive">Some items need your review.</p>}<Button className="w-full" disabled>Checkout not available yet</Button><p className="text-xs text-muted-foreground">No payment will be taken. Items are not reserved.</p></aside>
  </div>;
}