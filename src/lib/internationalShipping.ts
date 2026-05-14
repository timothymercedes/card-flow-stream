// Helpers for cross-border shipping warnings & enforcement.
// Domestic = both buyer & seller in the USA. Anything else triggers warnings.

export type IntlContext = {
  isInternational: boolean;
  buyerCountry: string;
  sellerCountry: string;
  buyerOutsideUS: boolean;
  sellerOutsideUS: boolean;
  blocked: boolean;
};

export function normalizeCountry(c?: string | null): string {
  return (c || "US").toUpperCase().trim();
}

export function getIntlContext(
  buyerCountry?: string | null,
  sellerCountry?: string | null,
  blockedCountries?: string[] | null,
): IntlContext {
  const buyer = normalizeCountry(buyerCountry);
  const seller = normalizeCountry(sellerCountry);
  const buyerOutsideUS = buyer !== "US";
  const sellerOutsideUS = seller !== "US";
  const isInternational = buyer !== seller;
  const blocked =
    isInternational &&
    Array.isArray(blockedCountries) &&
    blockedCountries.map((c) => c.toUpperCase()).includes(buyer);
  return { isInternational, buyerCountry: buyer, sellerCountry: seller, buyerOutsideUS, sellerOutsideUS, blocked };
}

export function shouldShowIntlWarning(
  buyerCountry?: string | null,
  sellerCountry?: string | null,
): boolean {
  return getIntlContext(buyerCountry, sellerCountry).isInternational;
}

export const INTL_WARNING_BULLETS = [
  "International shipping costs may be higher than domestic rates.",
  "Customs duties, VAT, tariffs, or import taxes may apply — these are not charged by PullBid Live.",
  "Buyer is responsible for any additional import fees required by their country.",
  "Delivery times may be longer than domestic USA shipping.",
  "Some countries restrict certain items (e.g. trading cards, collectibles).",
];

export const INTL_ACK_KEY = "pbl_intl_ack_v1";
export function hasIntlAck(scope: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(INTL_ACK_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    return Boolean(obj?.[scope]);
  } catch { return false; }
}
export function setIntlAck(scope: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(INTL_ACK_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    obj[scope] = Date.now();
    window.localStorage.setItem(INTL_ACK_KEY, JSON.stringify(obj));
  } catch {}
}
