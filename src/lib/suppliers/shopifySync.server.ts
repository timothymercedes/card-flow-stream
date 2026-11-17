/** Server-only Shopify Storefront reads: live stock + supplier price, and the bulk catalog sync. Never places Shopify orders. */
import { shopifyPriceCents, shopifyVariantIdFromSku } from "./shopifyPricing";

function creds() {
  const domain = (process.env["SHOPIFY_STORE_DOMAIN"] ?? "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const token = process.env["SHOPIFY_STOREFRONT_PRIVATE_TOKEN"] ?? "";
  if (!domain || !token) throw new Error("Shopify isn't connected.");
  return { domain, token };
}

async function storefront(query: string, variables: Record<string, unknown> = {}) {
  const { domain, token } = creds();
  const res = await fetch(`https://${domain}/api/2024-10/graphql.json`, {
    method: "POST", headers: { "Shopify-Storefront-Private-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify returned ${res.status}`);
  const j = await res.json();
  if (j.errors?.length) throw new Error(`Shopify: ${j.errors[0].message}`);
  return j.data;
}

export type LiveVariant = { costCents: number; quantity: number };

/** Live price + stock for specific Shopify variant ids (numeric strings). Missing ids are absent from the map. */
export async function getLiveShopifyVariants(ids: string[]): Promise<Map<string, LiveVariant>> {
  const out = new Map<string, LiveVariant>();
  for (let i = 0; i < ids.length; i += 100) {
    const gids = ids.slice(i, i + 100).map((id) => `gid://shopify/ProductVariant/${id}`);
    const d = await storefront(`query($ids:[ID!]!){nodes(ids:$ids){... on ProductVariant{id price{amount} quantityAvailable}}}`, { ids: gids });
    for (const n of d.nodes ?? []) {
      if (!n?.id) continue;
      out.set(String(n.id).split("/").pop()!, { costCents: Math.round(Number(n.price.amount) * 100), quantity: Math.max(0, n.quantityAvailable ?? 0) });
    }
  }
  return out;
}

/** Reads the whole Shopify catalog and applies stock/price to every imported Shopify option in one database call per batch. */
export async function syncShopifyCatalog() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: sup } = await supabaseAdmin.from("bazaar_suppliers").select("id").eq("name", "Shopify").eq("is_demo", false).maybeSingle();
  if (!sup) throw new Error("Shopify supplier missing");

  const live = new Map<string, LiveVariant>();
  let after: string | null = null;
  for (let page = 0; page < 60; page++) {
    const d: any = await storefront(`query($after:String){products(first:100, after:$after){pageInfo{hasNextPage endCursor} nodes{variants(first:100){nodes{id price{amount} quantityAvailable}}}}}`, { after });
    for (const p of d.products.nodes) for (const v of p.variants.nodes)
      live.set(String(v.id).split("/").pop()!, { costCents: Math.round(Number(v.price.amount) * 100), quantity: Math.max(0, v.quantityAvailable ?? 0) });
    if (!d.products.pageInfo.hasNextPage) break;
    after = d.products.pageInfo.endCursor;
  }
  if (live.size === 0) throw new Error("Shopify returned no products; sync skipped so nothing gets hidden by mistake.");

  const links: { id: string; supplier_sku: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin.from("bazaar_supplier_product_links").select("id, supplier_sku").eq("supplier_id", sup.id).range(from, from + 999);
    if (error) throw new Error(error.message);
    links.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const rows = links.map((l) => {
    const v = live.get(shopifyVariantIdFromSku(l.supplier_sku) ?? "");
    return v ? { link_id: l.id, found: true, cost: v.costCents, qty: v.quantity, price: shopifyPriceCents(v.costCents) } : { link_id: l.id, found: false };
  });
  const totals = { in_stock: 0, sold_out: 0, removed: 0, published: 0, unpublished: 0 };
  for (let i = 0; i < rows.length; i += 2500) {
    const { data, error } = await (supabaseAdmin as any).rpc("bazaar_apply_shopify_sync", { _supplier_id: sup.id, _rows: rows.slice(i, i + 2500) });
    if (error) throw new Error(error.message);
    for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] += Number(data?.[k] ?? 0);
  }
  return totals;
}

export type ShopifyShipAddress = { line1: string; line2?: string; city: string; state: string; postalCode: string; name: string };

/** Pulls the deferred delivery-group payload out of a multipart/mixed @defer response. */
export function parseDeferredShippingCents(body: string): number | null {
  let best: number | null = null;
  for (const chunk of body.split(/\r?\n--graphql/)) {
    const start = chunk.indexOf("{");
    if (start < 0) continue;
    let j: any;
    try { j = JSON.parse(chunk.slice(start).trim()); } catch { continue; }
    const groups = j?.incremental?.flatMap((x: any) => x?.data?.deliveryGroups?.nodes ?? []) ?? j?.data?.cart?.deliveryGroups?.nodes ?? [];
    if (!groups.length) continue;
    let sum = 0;
    for (const g of groups) {
      const opts = (g?.deliveryOptions ?? []).map((o: any) => Math.round(Number(o?.estimatedCost?.amount) * 100)).filter((n: number) => Number.isFinite(n) && n >= 0);
      if (!opts.length) return null; // a package with no rate can't be shipped
      sum += Math.min(...opts);
    }
    best = sum;
  }
  return best;
}

/**
 * Real Shopify shipping for these variants to this US address, using the store's own shipping rates.
 * One cart per checkout so multi-item orders are rated together (no double-charging). Returns cents, or null if Shopify can't ship there.
 */
export async function quoteShopifyShippingCents(lines: { shopifyVariantId: string; quantity: number }[], a: ShopifyShipAddress): Promise<number | null> {
  const { domain, token } = creds();
  const url = `https://${domain}/api/2025-07/graphql.json`;
  const headers = { "Shopify-Storefront-Private-Token": token, "Content-Type": "application/json" };
  const [first, ...rest] = a.name.trim().split(/\s+/);
  const create = await fetch(url, { method: "POST", headers, body: JSON.stringify({
    query: `mutation($input:CartInput!){cartCreate(input:$input){userErrors{message} cart{id}}}`,
    variables: { input: {
      lines: lines.map((l) => ({ merchandiseId: `gid://shopify/ProductVariant/${l.shopifyVariantId}`, quantity: l.quantity })),
      buyerIdentity: { countryCode: "US" },
      delivery: { addresses: [{ selected: true, address: { deliveryAddress: { firstName: first || "Customer", lastName: rest.join(" ") || "-", address1: a.line1, address2: a.line2 || null, city: a.city, provinceCode: a.state, zip: a.postalCode, countryCode: "US" } } }] },
    } },
  }) });
  if (!create.ok) throw new Error(`Shopify returned ${create.status}`);
  const cj = await create.json();
  const cartId = cj?.data?.cartCreate?.cart?.id;
  if (!cartId) throw new Error(`Shopify: ${cj?.data?.cartCreate?.userErrors?.[0]?.message ?? cj?.errors?.[0]?.message ?? "cart failed"}`);
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { method: "POST", headers: { ...headers, Accept: "multipart/mixed" }, body: JSON.stringify({
      query: `query($id:ID!){cart(id:$id){id ... @defer { deliveryGroups(first:10, withCarrierRates:true){nodes{deliveryOptions{estimatedCost{amount currencyCode}}}} }}}`,
      variables: { id: cartId },
    }) });
    if (!r.ok) throw new Error(`Shopify returned ${r.status}`);
    const cents = parseDeferredShippingCents(await r.text());
    if (cents !== null) return cents;
    await new Promise((res) => setTimeout(res, 800));
  }
  return null;
}
