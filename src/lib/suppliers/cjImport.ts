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

export type ProfitBreakdown = { priceCents: number; itemCostCents: number; supplierShippingCents: number; ruleShippingCents: number; feeCents: number; otherCostCents: number; netProfitCents: number; marginPercent: number; minProfitCents: number; floorCents: number; belowFloor: boolean };
/** Full per-variant breakdown; netProfit = price − item − CJ shipping − own shipping − payment fees − other costs. */
export function profitBreakdown(itemCostCents: number, shippingCents: number | null, rule: PricingRule, priceOverride?: number | null): ProfitBreakdown {
  const ship = Math.max(0, shippingCents ?? 0);
  const r = computePrice(itemCostCents + ship, rule, priceOverride);
  const feeCents = Math.round((r.priceCents * Number(rule.fee_percent)) / 100) + rule.fee_fixed_cents;
  const net = r.priceCents - itemCostCents - ship - rule.shipping_cost_cents - feeCents - rule.other_cost_cents;
  return { priceCents: r.priceCents, itemCostCents, supplierShippingCents: ship, ruleShippingCents: rule.shipping_cost_cents, feeCents, otherCostCents: rule.other_cost_cents, netProfitCents: net, marginPercent: r.priceCents > 0 ? Math.round((net / r.priceCents) * 10000) / 100 : 0, minProfitCents: rule.min_profit_cents, floorCents: r.floorCents, belowFloor: r.belowFloor };
}
