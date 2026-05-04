// Lightweight FX conversion for display only. Charges remain in USD.
// Rates are static defaults; refreshed on demand from open exchangerate API.

const SUPPORTED = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "MXN", "BRL", "INR", "PHP"] as const;
export type Currency = typeof SUPPORTED[number];
export const SUPPORTED_CURRENCIES = SUPPORTED;

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  USD: "$", EUR: "€", GBP: "£", CAD: "C$", AUD: "A$", JPY: "¥", MXN: "Mex$", BRL: "R$", INR: "₹", PHP: "₱",
};

// Reasonable fallbacks (USD = 1)
const FALLBACK_RATES: Record<Currency, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, CAD: 1.36, AUD: 1.51, JPY: 156, MXN: 17.2, BRL: 5.05, INR: 83.5, PHP: 57.2,
};

let cache: { rates: Record<string, number>; ts: number } | null = null;

export async function getRates(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.ts < 1000 * 60 * 60) return cache.rates;
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD");
    if (r.ok) {
      const j = await r.json();
      if (j?.rates) {
        cache = { rates: j.rates, ts: Date.now() };
        return j.rates;
      }
    }
  } catch { /* ignore */ }
  return FALLBACK_RATES;
}

export function convertSync(usd: number, to: Currency, rates: Record<string, number>): number {
  const r = rates[to] ?? FALLBACK_RATES[to] ?? 1;
  return usd * r;
}

export function formatMoney(amount: number, currency: Currency): string {
  const sym = CURRENCY_SYMBOL[currency] || "$";
  const digits = currency === "JPY" ? 0 : 2;
  return `${sym}${amount.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

// Convenience React hook
import { useEffect, useState } from "react";
export function useCurrency(preferred: Currency | null | undefined) {
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  useEffect(() => { getRates().then(setRates); }, []);
  const cur: Currency = preferred && SUPPORTED.includes(preferred) ? preferred : "USD";
  function fmt(usd: number | null | undefined) {
    const n = Number(usd || 0);
    if (cur === "USD" || !rates) return formatMoney(n, "USD");
    return `${formatMoney(convertSync(n, cur, rates), cur)} (~${formatMoney(n, "USD")})`;
  }
  return { currency: cur, fmt, rates };
}
