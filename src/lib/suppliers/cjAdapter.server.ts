/**
 * CJdropshipping Open API v2.0 adapter (server-only; never import from browser code).
 * Safety: order creation is blocked unless CJ_ORDERS_ENABLED === "true"; balance payment is
 * intentionally NOT implemented (manual confirmation in the CJ console only).
 */
import { SupplierError, type SupplierAdapter, type SupplierOrderPayload, type SupplierProductDetail, type ShippingQuote, type SupplierStock } from "./types";

export const CJ_DEFAULT_BASE = "https://developers.cjdropshipping.com/api2.0";
type Fetch = typeof fetch;
export type CJConfig = { apiKey: string; baseUrl?: string; ordersEnabled?: boolean; sandbox?: boolean; fetchImpl?: Fetch; now?: () => number; sleep?: (ms: number) => Promise<void>; maxRetries?: number; log?: (event: string, details: Record<string, unknown>) => void };
type Tokens = { access: string; accessExp: number; refresh: string; refreshExp: number };
type CJEnvelope<T> = { code: number; result: boolean; message?: string; data: T; requestId?: string };

export const toCents = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.split("--")[0]) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};
const parseExp = (v: unknown, fallback: number) => { const t = typeof v === "string" ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : fallback; };
const REDACT = /(apiKey|accessToken|refreshToken|CJ-Access-Token|phone|address|name)/i;
export function redact(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, REDACT.test(k) ? "[redacted]" : v]));
}

export class CJDropshippingAdapter implements SupplierAdapter {
  readonly kind = "cj" as const;
  private tokens: Tokens | null = null;
  private authInFlight: Promise<string> | null = null;
  private readonly f: Fetch; private readonly now: () => number; private readonly sleep: (ms: number) => Promise<void>;
  private readonly base: string; private readonly maxRetries: number;
  constructor(private readonly cfg: CJConfig) {
    if (!cfg.apiKey?.trim()) throw new SupplierError("CJ API key is not configured.", "config");
    this.f = cfg.fetchImpl ?? fetch; this.now = cfg.now ?? Date.now;
    this.sleep = cfg.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.base = (cfg.baseUrl ?? CJ_DEFAULT_BASE).replace(/\/+$/, ""); this.maxRetries = cfg.maxRetries ?? 3;
  }
  private log(event: string, d: Record<string, unknown> = {}) { (this.cfg.log ?? ((e, x) => console.info(`[cj] ${e}`, x)))(event, redact(d)); }

  private async raw<T>(path: string, init: RequestInit, auth: string | null, retries = this.maxRetries): Promise<CJEnvelope<T>> {
    let attempt = 0;
    for (;;) {
      const headers = new Headers(init.headers); headers.set("Content-Type", "application/json");
      if (auth) headers.set("CJ-Access-Token", auth);
      let res: Response;
      try { res = await this.f(`${this.base}${path}`, { ...init, headers }); }
      catch (e) {
        if (attempt++ < retries) { await this.sleep(250 * 2 ** attempt); continue; }
        throw new SupplierError(`CJ network error: ${(e as Error).message}`, "upstream", true);
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt++ < retries) { this.log("retry", { path, status: res.status, attempt }); await this.sleep(250 * 2 ** attempt); continue; }
        throw new SupplierError(`CJ unavailable (${res.status})`, res.status === 429 ? "rate_limited" : "upstream", true, res.status);
      }
      let body: CJEnvelope<T>;
      try { body = await res.json() as CJEnvelope<T>; } catch { throw new SupplierError("CJ returned invalid JSON", "invalid_response", false, res.status); }
      if (res.status === 401 || body.code === 1600001 || body.code === 1600003) throw new SupplierError(body.message ?? "CJ authorization failed", "auth", false, res.status);
      if (body.code === 1600200 || body.code === 429) throw new SupplierError(body.message ?? "CJ rate limit", "rate_limited", true);
      if (!res.ok || body.result === false || body.code !== 200) throw new SupplierError(body.message ?? `CJ error ${body.code}`, "upstream", false, res.status);
      return body;
    }
  }

  /** Returns a valid access token, refreshing or re-authenticating once (deduplicated across callers). */
  async getAccessToken(): Promise<string> {
    const t = this.tokens, skew = 5 * 60_000;
    if (t && t.accessExp - skew > this.now()) return t.access;
    if (this.authInFlight) return this.authInFlight;
    this.authInFlight = (async () => {
      try {
        if (t && t.refreshExp - skew > this.now()) {
          try { return this.store((await this.raw<Record<string, unknown>>("/v1/authentication/refreshAccessToken", { method: "POST", body: JSON.stringify({ refreshToken: t.refresh }) }, null)).data, "refresh"); }
          catch (e) { this.log("refresh_failed", { message: (e as Error).message }); }
        }
        return this.store((await this.raw<Record<string, unknown>>("/v1/authentication/getAccessToken", { method: "POST", body: JSON.stringify({ apiKey: this.cfg.apiKey }) }, null)).data, "login");
      } finally { this.authInFlight = null; }
    })();
    return this.authInFlight;
  }
  private store(d: Record<string, unknown>, via: string): string {
    if (typeof d?.accessToken !== "string" || typeof d?.refreshToken !== "string") throw new SupplierError("CJ token response missing tokens", "invalid_response");
    const n = this.now();
    this.tokens = { access: d.accessToken, refresh: d.refreshToken, accessExp: parseExp(d.accessTokenExpiryDate, n + 14 * 864e5), refreshExp: parseExp(d.refreshTokenExpiryDate, n + 179 * 864e5) };
    this.log("token_obtained", { via, sandbox: !!this.cfg.sandbox });
    return d.accessToken;
  }
  private async call<T>(path: string, init: RequestInit = { method: "GET" }, retries = this.maxRetries): Promise<T> {
    try { return (await this.raw<T>(path, init, await this.getAccessToken(), retries)).data; }
    catch (e) {
      if (e instanceof SupplierError && e.code === "auth" && this.tokens) { this.tokens = null; return (await this.raw<T>(path, init, await this.getAccessToken(), retries)).data; }
      throw e;
    }
  }

  async testConnection() {
    try { await this.getAccessToken(); return { ok: true, message: this.cfg.sandbox ? "Connected (sandbox mode)" : "Connected" }; }
    catch (e) { return { ok: false, message: (e as Error).message }; }
  }

  /** Product List V2 (Elasticsearch-backed). */
  async searchProducts(p: { keyword?: string; categoryId?: string; page?: number; pageSize?: number; countryCode?: string }) {
    const q = new URLSearchParams({ page: String(Math.max(1, p.page ?? 1)), size: String(Math.min(100, Math.max(1, p.pageSize ?? 20))) });
    if (p.keyword?.trim()) q.set("keyWord", p.keyword.trim().slice(0, 200));
    if (p.categoryId) q.set("categoryId", p.categoryId);
    if (p.countryCode) q.set("countryCode", p.countryCode);
    const d = await this.call<{ totalRecords?: number; content?: { productList?: Record<string, unknown>[] }[] }>(`/v2/product/listV2?${q}`);
    const list = (d?.content ?? []).flatMap((c) => c.productList ?? []);
    return { total: Number(d?.totalRecords ?? list.length), items: list.map((x) => ({ ref: String(x.id ?? x.pid ?? ""), title: String(x.nameEn ?? x.productNameEn ?? ""), imageUrl: (x.bigImage ?? x.productImage ?? null) as string | null, costCents: toCents(x.sellPrice), categoryName: (x.threeCategoryName ?? x.categoryName ?? null) as string | null })).filter((x) => x.ref) };
  }

  async getProductDetail(ref: string): Promise<SupplierProductDetail> {
    if (!ref) throw new SupplierError("Product reference required", "not_found");
    const d = await this.call<Record<string, unknown>>(`/v1/product/query?pid=${encodeURIComponent(ref)}`);
    if (!d) throw new SupplierError("CJ product not found", "not_found");
    const imgs = Array.isArray(d.productImageSet) ? d.productImageSet as string[] : typeof d.productImage === "string" ? [d.productImage] : [];
    const variants = (Array.isArray(d.variants) ? d.variants as Record<string, unknown>[] : []).map((v) => {
      const cost = toCents(v.variantSellPrice);
      return cost == null ? null : { vid: String(v.vid), sku: (v.variantSku ?? null) as string | null, name: (v.variantNameEn ?? null) as string | null, costCents: cost, weightGrams: typeof v.variantWeight === "number" ? v.variantWeight : null, options: typeof v.variantKey === "string" ? { Option: v.variantKey } : {} };
    }).filter((v): v is NonNullable<typeof v> => !!v);
    return { ref: String(d.pid ?? ref), title: String(d.productNameEn ?? ""), description: (d.description ?? null) as string | null, images: imgs, categoryName: (d.categoryName ?? null) as string | null, variants };
  }

  async getStock(vid: string): Promise<SupplierStock[]> {
    const d = await this.call<Record<string, unknown>[]>(`/v1/product/stock/queryByVid?vid=${encodeURIComponent(vid)}`);
    return (d ?? []).map((s) => ({ vid, warehouse: (s.areaEn ?? null) as string | null, countryCode: (s.countryCode ?? null) as string | null, quantity: Math.max(0, Number(s.storageNum ?? s.totalInventoryNum ?? 0) || 0) }));
  }

  async calculateShipping(p: { startCountryCode: string; endCountryCode: string; zip?: string; products: { vid: string; quantity: number }[] }): Promise<ShippingQuote[]> {
    if (!p.products.length) throw new SupplierError("At least one product is required", "not_found");
    const d = await this.call<Record<string, unknown>[]>("/v1/logistic/freightCalculate", { method: "POST", body: JSON.stringify({ startCountryCode: p.startCountryCode, endCountryCode: p.endCountryCode, zip: p.zip, products: p.products }) });
    return (d ?? []).map((q) => { const days = String(q.logisticAging ?? "").match(/(\d+)\D+(\d+)/); const cost = toCents(q.logisticPrice);
      return cost == null ? null : { method: String(q.logisticName), costCents: cost, minDays: days ? Number(days[1]) : null, maxDays: days ? Number(days[2]) : null }; }).filter((q): q is ShippingQuote => !!q);
  }

  /** Creates an UNPAID CJ order (payType 3 = create only). Never pays from balance. No retries on non-idempotent POST. */
  async createOrder(o: SupplierOrderPayload) {
    if (!this.cfg.ordersEnabled) throw new SupplierError("CJ order submission is disabled in this environment.", "blocked");
    if (!/^PB-BZR-[A-Za-z0-9-]{4,60}$/.test(o.orderNumber)) throw new SupplierError("Invalid PullBid order reference", "blocked");
    if (!o.products.length || o.products.some((x) => !x.vid || !Number.isInteger(x.quantity) || x.quantity < 1)) throw new SupplierError("Invalid order lines", "blocked");
    const r = o.recipient;
    const body = { orderNumber: o.orderNumber, shippingCountryCode: r.countryCode, shippingCountry: r.country, shippingProvince: r.province, shippingCity: r.city, shippingAddress: r.address, shippingAddress2: r.address2, shippingCustomerName: r.name, shippingPhone: r.phone, shippingZip: r.zip, logisticName: o.shippingMethod, fromCountryCode: "CN", payType: 3, products: o.products };
    const d = await this.call<Record<string, unknown>>("/v2/shopping/order/createOrderV3", { method: "POST", body: JSON.stringify(body) }, 0);
    this.log("order_created", { orderNumber: o.orderNumber, sandbox: !!this.cfg.sandbox });
    return { supplierOrderId: String(d?.orderId ?? ""), orderNumber: o.orderNumber, status: String(d?.orderStatus ?? "CREATED") };
  }

  async getOrderStatus(id: string) {
    const d = await this.call<Record<string, unknown>>(`/v1/shopping/order/getOrderDetail?orderId=${encodeURIComponent(id)}`);
    return { supplierOrderId: id, status: String(d?.orderStatus ?? "UNKNOWN"), trackingNumber: (d?.trackNumber ?? null) as string | null, carrier: (d?.logisticName ?? null) as string | null, raw: d };
  }

  async cancelOrder(id: string) {
    if (!this.cfg.ordersEnabled) throw new SupplierError("CJ order changes are disabled in this environment.", "blocked");
    await this.call<unknown>(`/v1/shopping/order/deleteOrder?orderId=${encodeURIComponent(id)}`, { method: "DELETE" });
    this.log("order_cancelled", { id });
    return { success: true };
  }
}

/** Factory reading server-only env. Sandbox by default; orders need explicit opt-in. */
export function createCJAdapterFromEnv(): CJDropshippingAdapter {
  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) throw new SupplierError("CJ is not connected yet.", "config");
  return new CJDropshippingAdapter({ apiKey, baseUrl: process.env.CJ_API_BASE_URL || CJ_DEFAULT_BASE, sandbox: process.env.CJ_MODE !== "live", ordersEnabled: process.env.CJ_ORDERS_ENABLED === "true" });
}
