import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ShoppingCart, ArrowLeft, Minus, Plus, Truck, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BazaarImage } from "@/components/bazaar/BazaarImage";
import { StoreBadge } from "@/components/bazaar/BazaarCards";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/bazaar";
import { getBazaarShoppingProducts } from "@/lib/bazaarShopping.functions";
import { addCartItem, buyable, variantLabel } from "@/lib/bazaarShopping";
import { useBazaarCart } from "@/hooks/useBazaarCart";
import { toast } from "sonner";
import { availabilityLabel, deliveryWindow } from "@/lib/bazaarPricing";

const productQuery = (id: string) => queryOptions({ queryKey: ["bazaar-shopping", id], queryFn: async () => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return (await getBazaarShoppingProducts({ data: { ids: [id] } }))[0] ?? null;
}, staleTime: 0 });

export const Route = createFileRoute("/bazaar/products/$id")({
  loader: async ({ context, params }) => { const p = await context.queryClient.ensureQueryData(productQuery(params.id)); if (!p) throw notFound(); return { title: p.title, description: p.description?.slice(0, 160) || `Shop ${p.title} from ${p.bazaar_stores.name} on PB Bazaar.`, image: p.images[0] }; },
  head: ({ loaderData }) => ({ meta: [
    { title: `${loaderData?.title ?? "Product unavailable"} — PB Bazaar` },
    { name: "description", content: loaderData?.description ?? "Browse published retail products on PB Bazaar." },
    { property: "og:title", content: `${loaderData?.title ?? "Product unavailable"} — PB Bazaar` },
    { property: "og:description", content: loaderData?.description ?? "Shop approved PB Bazaar stores." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
    ...(loaderData?.image?.startsWith("https://") ? [{ property: "og:image", content: loaderData.image }, { name: "twitter:image", content: loaderData.image }] : []),
  ] }),
  component: ProductPage,
  notFoundComponent: () => <AppShell><div className="mx-auto max-w-6xl space-y-4 px-4 py-10"><h1 className="text-2xl font-bold">Product unavailable</h1><p className="text-muted-foreground">This product is not currently published in an open store.</p><Button asChild><Link to="/bazaar">Back to PB Bazaar</Link></Button></div></AppShell>,
  errorComponent: () => <ProductError />,
});
function ProductError() {
  const router = useRouter();
  return <AppShell><div className="mx-auto max-w-6xl space-y-4 px-4 py-10" role="alert"><p>Couldn't load this product.</p><Button onClick={() => void router.invalidate()}>Try again</Button></div></AppShell>;
}
function ProductPage() {
  const { id } = Route.useParams();
  const { data: p } = useSuspenseQuery(productQuery(id));
  return p ? <ProductContent key={p.id} product={p} /> : null;
}
function ProductContent({ product: p }: { product: NonNullable<Awaited<ReturnType<typeof getBazaarShoppingProducts>>>[number] }) {
  const [image, setImage] = useState(0);
  const [selected, setSelected] = useState((p.bazaar_product_variants.find(buyable) ?? p.bazaar_product_variants[0])?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const cart = useBazaarCart();
  const queryClient = useQueryClient();
  const fetchProducts = useServerFn(getBazaarShoppingProducts);
  const variant = p.bazaar_product_variants.find((v) => v.id === selected);
  const store = p.bazaar_stores;
  const add = useMutation({ mutationFn: async () => {
    const fresh = (await fetchProducts({ data: { ids: [p.id] } }))[0];
    if (!fresh) throw new Error("This product is no longer available.");
    queryClient.setQueryData(productQuery(p.id).queryKey, fresh);
    const current = fresh.bazaar_product_variants.find((v) => v.id === selected);
    if (!current || !buyable(current)) throw new Error("This option is no longer available.");
    if (current.price_cents !== variant?.price_cents) throw new Error("The price changed. Review the updated price and add again.");
    cart.update((items) => addCartItem(items, fresh, selected, quantity));
  }, onSuccess: () => toast.success("Added to your Bazaar cart"), onError: (e) => toast.error(e.message) });
  const specs = p.specifications && typeof p.specifications === "object" && !Array.isArray(p.specifications) ? Object.entries(p.specifications) : [];
  return <AppShell><div className="mx-auto max-w-6xl space-y-7 px-3 py-5 sm:px-5">
    <div className="flex items-center justify-between gap-3"><Button asChild variant="ghost" size="sm"><Link to="/bazaar"><ArrowLeft />PB Bazaar</Link></Button><Button asChild variant="outline"><Link to="/bazaar/cart"><ShoppingCart />Bazaar cart{cart.ready && cart.items.length > 0 ? ` (${cart.items.reduce((n, i) => n + i.quantity, 0)})` : ""}</Link></Button></div>
    <div className="grid gap-7 md:grid-cols-2">
      <section aria-label="Product gallery" className="min-w-0 space-y-3">
        <div className="aspect-square overflow-hidden rounded-lg bg-muted">{p.images[image] ? <BazaarImage src={p.images[image]} alt={`${p.title}, image ${image + 1}`} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-muted-foreground">No image</div>}</div>
        <div className="flex gap-2 overflow-x-auto pb-1">{p.images.map((src, i) => <Button key={`${src}-${i}`} variant="outline" aria-label={`View image ${i + 1}`} aria-pressed={image === i} onClick={() => setImage(i)} className={`h-16 w-16 shrink-0 overflow-hidden p-0 ${image === i ? "ring-2 ring-primary" : ""}`}><BazaarImage src={src} alt="" className="h-full w-full object-contain" /></Button>)}</div>
      </section>
      <section className="min-w-0 space-y-5">
        <div><p className="text-sm text-muted-foreground">{p.department}{p.brand ? ` · ${p.brand}` : ""}</p><h1 className="mt-2 break-words text-2xl font-bold sm:text-3xl">{p.title}</h1><div className="mt-3 flex flex-wrap items-center gap-2"><Link to="/bazaar/stores/$slug" params={{ slug: store.slug }} className="font-semibold text-primary hover:underline">{store.name}</Link><StoreBadge type={store.store_type} verified={store.verification_status === "verified"} /></div></div>
        <div className="flex items-baseline gap-3"><p className="text-3xl font-bold">{variant ? formatCents(variant.price_cents) : "Out of stock"}</p>{variant && !buyable(variant) && <span className="rounded-md bg-destructive px-2 py-1 text-xs font-bold text-destructive-foreground">{availabilityLabel(variant.reason ?? "sold_out")}</span>}{variant?.compare_at_cents && variant.compare_at_cents > variant.price_cents ? <p className="text-muted-foreground line-through">{formatCents(variant.compare_at_cents)}</p> : null}</div>
        <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Choose an option</legend><div className="flex flex-wrap gap-2">{p.bazaar_product_variants.map((v) => <Button key={v.id} variant={selected === v.id ? "default" : "outline"} aria-pressed={selected === v.id} onClick={() => { setSelected(v.id); setQuantity(1); }} className={`h-auto min-h-9 whitespace-normal text-left ${buyable(v) ? "" : "opacity-60"}`}>{variantLabel(v.options)}{!buyable(v) && ` · ${availabilityLabel(v.reason ?? "sold_out")}`}</Button>)}</div>{!p.bazaar_product_variants.length && <p className="text-sm text-muted-foreground">No options available</p>}</fieldset>
        {variant && buyable(variant) && <p className="text-sm text-muted-foreground">{variant.quantity} available{variant.sku ? ` · SKU: ${variant.sku}` : ""} · {p.condition}</p>}
        <div className="flex items-center gap-3"><div className="flex h-11 items-center rounded-lg border border-border"><Button variant="ghost" size="icon" aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => setQuantity((n) => Math.max(1, n - 1))}><Minus /></Button><span className="w-10 text-center tabular-nums" aria-label="Selected quantity">{quantity}</span><Button variant="ghost" size="icon" aria-label="Increase quantity" disabled={!variant || quantity >= variant.quantity} onClick={() => setQuantity((n) => n + 1)}><Plus /></Button></div><Button size="lg" className="min-w-0 flex-1" disabled={!variant || !buyable(variant) || !cart.ready || add.isPending || quantity > variant.quantity} onClick={() => add.mutate()}><ShoppingCart />{add.isPending ? "Checking…" : "Add to cart"}</Button></div>
        {cart.storageError && <p role="alert" className="text-sm text-destructive">Allow site storage to save your cart.</p>}
        <div className="space-y-4 border-t border-border pt-5"><div><h2 className="flex items-center gap-2 font-semibold"><Truck className="h-4 w-4" />Shipping</h2><p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{store.shipping_policy || "Shipping policy not provided."}</p>{deliveryWindow(variant?.delivery_min_days, variant?.delivery_max_days) && <p className="mt-1 text-sm font-medium">{deliveryWindow(variant?.delivery_min_days, variant?.delivery_max_days)}</p>}{store.processing_days != null && <p className="mt-1 text-sm text-muted-foreground">Processing: {store.processing_days} business days</p>}</div><div><h2 className="flex items-center gap-2 font-semibold"><RotateCcw className="h-4 w-4" />Returns</h2><p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{store.return_policy || "Return policy not provided."}</p></div></div>
      </section>
    </div>
    <section className="border-t border-border pt-6"><h2 className="text-xl font-bold">Product details</h2><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{p.description || "No description provided."}</p></section>
    <section className="pb-6"><h2 className="text-xl font-bold">Specifications</h2><dl className="mt-3 divide-y divide-border">{[["Brand", p.brand], ["Model", p.model], ["Condition", p.condition], ...specs].filter(([, value]) => value != null).map(([name, value]) => <div key={name} className="grid grid-cols-2 gap-4 py-3 text-sm"><dt className="break-words text-muted-foreground">{name}</dt><dd className="break-words">{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>)}</dl></section>
  </div></AppShell>;
}