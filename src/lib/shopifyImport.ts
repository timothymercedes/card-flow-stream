/** Pure helpers for turning a Shopify product into PB Bazaar draft rows. */
export function markupCents(shopifyPrice: string | number, markupPct: number): number {
  const cents = Math.round(Number(shopifyPrice) * 100);
  if (!Number.isFinite(cents) || cents <= 0) return 0;
  return Math.round(cents * (1 + Math.max(0, markupPct) / 100));
}
export type ShopifyVariant = { id: number; title: string; price: string; sku: string | null; inventory_quantity?: number | null; option1?: string | null; option2?: string | null; option3?: string | null };
export type ShopifyProduct = { id: number; title: string; body_html: string | null; vendor: string | null; product_type: string | null; images: { src: string }[]; options: { name: string }[]; variants: ShopifyVariant[] };
export function variantOptions(p: ShopifyProduct, v: ShopifyVariant): Record<string, string> {
  const vals = [v.option1, v.option2, v.option3];
  const out: Record<string, string> = {};
  p.options.forEach((o, i) => { const val = vals[i]; if (val && val !== "Default Title") out[o.name] = val; });
  return out;
}
export const shopifySku = (v: ShopifyVariant) => `shopify:${v.id}`;
export const stripHtml = (h: string | null) => (h ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000);
