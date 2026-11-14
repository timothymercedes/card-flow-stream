import type { Json } from "@/integrations/supabase/types";
export type ShoppingVariant = { id: string; sku: string | null; options: Json; price_cents: number; compare_at_cents: number | null; quantity: number; is_active: boolean; available?: boolean; reason?: "sold_out" | "unavailable" | "unverified" | null; delivery_min_days?: number | null; delivery_max_days?: number | null };
export type ShoppingStore = { id: string; slug: string; name: string; store_type: string; verification_status: string; logo_url: string | null; shipping_policy: string | null; return_policy: string | null; processing_days: number | null };
export type ShoppingProduct = { id: string; title: string; description: string | null; department: string | null; brand: string | null; model: string | null; condition: string; specifications: Json; images: string[]; bazaar_stores: ShoppingStore; bazaar_product_variants: ShoppingVariant[] };
export type CartItem = { productId: string; variantId: string; quantity: number; seenPrice: number };
export type CheckedCartItem = { item: CartItem; product: ShoppingProduct | null; variant: ShoppingVariant | null; issue: "unavailable" | "stock" | "price" | null };
export const BAZAAR_CART_KEY = "pbl-bazaar-cart-v1";

export function variantLabel(options: unknown): string {
  if (!options || typeof options !== "object" || Array.isArray(options)) return "Standard";
  return Object.entries(options).filter(([, v]) => typeof v === "string").map(([k, v]) => `${k}: ${v}`).join(" · ") || "Standard";
}
export function buyable(v: ShoppingVariant): boolean {
  return v.available !== false && v.is_active && Number.isInteger(v.quantity) && v.quantity > 0;
}
export function parseCart(value: string | null): CartItem[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.filter((v): v is CartItem => {
      if (!v || typeof v !== "object") return false;
      const valid = typeof v.productId === "string" && typeof v.variantId === "string" && /^[0-9a-f-]{36}$/i.test(v.productId) && /^[0-9a-f-]{36}$/i.test(v.variantId) && Number.isInteger(v.quantity) && v.quantity > 0 && v.quantity <= 10000 && Number.isInteger(v.seenPrice) && v.seenPrice >= 0 && !seen.has(v.variantId);
      if (valid) seen.add(v.variantId);
      return valid;
    }).slice(0, 100);
  } catch { return []; }
}
export function addCartItem(items: CartItem[], product: ShoppingProduct, variantId: string, quantity: number): CartItem[] {
  const variant = product.bazaar_product_variants.find((v) => v.id === variantId);
  if (!variant || !buyable(variant)) throw new Error("This option is unavailable.");
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Choose a valid quantity.");
  const existing = items.find((i) => i.variantId === variantId);
  const total = quantity + (existing?.quantity ?? 0);
  if (total > variant.quantity) throw new Error(`Only ${variant.quantity} available, including items already in your cart.`);
  if (!existing && items.length >= 100) throw new Error("Your cart is full.");
  const next = { productId: product.id, variantId, quantity: total, seenPrice: variant.price_cents };
  return existing ? items.map((i) => i.variantId === variantId ? next : i) : [...items, next];
}
export function checkCart(items: CartItem[], products: ShoppingProduct[]): CheckedCartItem[] {
  return items.map((item) => {
    const product = products.find((p) => p.id === item.productId) ?? null;
    const variant = product?.bazaar_product_variants.find((v) => v.id === item.variantId) ?? null;
    const issue = !product || !variant || !buyable(variant) ? "unavailable" : item.quantity > variant.quantity ? "stock" : item.seenPrice !== variant.price_cents ? "price" : null;
    return { item, product, variant, issue };
  });
}
export function groupCart(rows: CheckedCartItem[]) {
  const groups = new Map<string, { store: ShoppingStore | null; rows: CheckedCartItem[] }>();
  for (const row of rows) {
    const store = row.product?.bazaar_stores ?? null;
    const key = store?.id ?? "unavailable";
    const group = groups.get(key) ?? { store, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()];
}