import { supabase } from "@/integrations/supabase/client";

export type BazaarStoreType = "independent" | "brand" | "pb_owned";

export const STORE_TYPE_LABEL: Record<BazaarStoreType, string> = {
  independent: "Independent",
  brand: "Official Brand",
  pb_owned: "PB Official",
};

export const BAZAAR_DEPARTMENTS = [
  "Fashion", "Footwear", "Electronics", "Home", "Beauty", "Tools", "Automotive", "Sports & Outdoors", "Toys & Hobbies", "Collectibles",
] as const;

/** Normalize a store name into a public URL slug (3-48 chars, a-z 0-9 dashes). */
export function slugifyStoreName(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/g, "");
}

export function isValidStoreSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/.test(slug);
}

/** Lowest active variant price, or null when the product has no buyable variant. */
export function lowestPriceCents(variants: { price_cents: number; is_active?: boolean }[]): number | null {
  const prices = variants.filter((v) => v.is_active !== false).map((v) => v.price_cents);
  return prices.length ? Math.min(...prices) : null;
}

export const formatCents = (c: number) => `$${(c / 100).toFixed(2)}`;

const STORE_COLS = "id, slug, name, store_type, logo_url, cover_url, description, category, verification_status, shipping_policy, return_policy, processing_days, published_at";
const PRODUCT_COLS = "id, store_id, title, department, images, brand, published_at, bazaar_product_variants(price_cents, compare_at_cents, quantity, is_active, options)";

export async function fetchActiveStores() {
  const { data, error } = await supabase.from("bazaar_stores").select(STORE_COLS).eq("status", "active").order("published_at", { ascending: false }).limit(48);
  if (error) throw error;
  return data ?? [];
}

export async function fetchNewProducts(dept?: string) {
  let q = supabase.from("bazaar_products").select(PRODUCT_COLS).eq("status", "published").order("published_at", { ascending: false }).limit(24);
  if (dept) q = q.eq("department", dept);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchStoreBySlug(slug: string) {
  const { data, error } = await supabase.from("bazaar_stores").select(STORE_COLS).eq("slug", slug).eq("status", "active").maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: products, error: pErr } = await supabase.from("bazaar_products").select(PRODUCT_COLS).eq("store_id", data.id).eq("status", "published").order("published_at", { ascending: false }).limit(60);
  if (pErr) throw pErr;
  return { store: data, products: products ?? [] };
}
