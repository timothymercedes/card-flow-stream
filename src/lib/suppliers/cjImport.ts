/** Pure helpers for the CJ discovery/import screen (browser-safe; no secrets). */
import { computePrice, type PricingRule, type PriceResult } from "@/lib/bazaarPricing";

/** Turn supplier HTML into plain text so no supplier markup/scripts reach shoppers. */
export function htmlToText(html: string | null | undefined, max = 5000): string {
  if (!html) return "";
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/p>|<\/li>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim().slice(0, max);
}

export type LandedPrice = PriceResult & { itemCostCents: number; shippingCents: number; landedCostCents: number };
/** Retail price from item cost + supplier shipping, through the existing rule (fees, extra costs, profit floor). */
export function landedPrice(itemCostCents: number, shippingCents: number | null, rule: PricingRule): LandedPrice {
  const ship = Math.max(0, shippingCents ?? 0);
  const landed = itemCostCents + ship;
  return { ...computePrice(landed, rule), itemCostCents, shippingCents: ship, landedCostCents: landed };
}

/** Pick the cheapest shipping quote (null when none). */
export function cheapestQuote<T extends { costCents: number }>(quotes: T[]): T | null {
  return quotes.reduce<T | null>((best, q) => (!best || q.costCents < best.costCents ? q : best), null);
}

export const CJ_SUPPLIER_NAME = "CJdropshipping";
export const DEMO_LABEL = "DEMO SAMPLE — not real CJ inventory";
