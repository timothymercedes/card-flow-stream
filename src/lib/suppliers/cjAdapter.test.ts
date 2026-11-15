import { describe, it, expect, vi } from "vitest";
import { CJDropshippingAdapter, redact, toCents } from "./cjAdapter.server";
import { SupplierError } from "./types";

const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ code: 200, result: true, data }), { status });
const tok = (n = 1) => ok({ accessToken: `a${n}`, refreshToken: `r${n}`, accessTokenExpiryDate: "2030-01-01T00:00:00Z", refreshTokenExpiryDate: "2031-01-01T00:00:00Z" });
function mk(responses: Response[], extra: Partial<ConstructorParameters<typeof CJDropshippingAdapter>[0]> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init: init ?? {} }); const r = responses.shift(); if (!r) throw new Error("no response"); return r; }) as unknown as typeof fetch;
  const a = new CJDropshippingAdapter({ apiKey: "KEY", fetchImpl, sleep: async () => {}, log: () => {}, now: () => Date.parse("2026-11-15T00:00:00Z"), ...extra });
  return { a, calls };
}
const order = { orderNumber: "PB-BZR-0001", shippingMethod: "CJPacket", recipient: { name: "T", phone: "1", address: "1 St", city: "C", province: "NY", zip: "10001", countryCode: "US", country: "United States" }, products: [{ vid: "v1", quantity: 1 }] };

describe("CJ adapter", () => {
  it("requires an API key", () => { expect(() => new CJDropshippingAdapter({ apiKey: "" })).toThrow(SupplierError); });
  it("authenticates with apiKey only (no email)", async () => {
    const { a, calls } = mk([tok()]); await a.getAccessToken();
    expect(calls[0].url).toContain("/v1/authentication/getAccessToken");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ apiKey: "KEY" });
  });
  it("caches tokens and sends CJ-Access-Token header", async () => {
    const { a, calls } = mk([tok(), ok([]), ok([])]); await a.getStock("v1"); await a.getStock("v1");
    expect(calls).toHaveLength(3); expect(new Headers(calls[2].init.headers).get("CJ-Access-Token")).toBe("a1");
  });
  it("deduplicates concurrent logins", async () => {
    const { a, calls } = mk([tok()]); await Promise.all([a.getAccessToken(), a.getAccessToken()]); expect(calls).toHaveLength(1);
  });
  it("refreshes an expired access token with the refresh token", async () => {
    let now = Date.parse("2026-11-15T00:00:00Z");
    const { a, calls } = mk([ok({ accessToken: "a1", refreshToken: "r1", accessTokenExpiryDate: "2026-11-15T01:00:00Z", refreshTokenExpiryDate: "2031-01-01T00:00:00Z" }), tok(2)], { now: () => now });
    await a.getAccessToken(); now += 2 * 3600_000;
    expect(await a.getAccessToken()).toBe("a2"); expect(calls[1].url).toContain("refreshAccessToken");
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ refreshToken: "r1" });
  });
  it("re-authenticates once after an auth error", async () => {
    const { a } = mk([tok(), new Response(JSON.stringify({ code: 1600001, result: false, message: "bad" }), { status: 200 }), tok(2), ok([{ storageNum: 3 }])]);
    expect((await a.getStock("v1"))[0].quantity).toBe(3);
  });
  it("retries 5xx then succeeds", async () => {
    const { a } = mk([tok(), new Response("x", { status: 503 }), ok([{ storageNum: 2 }])]); expect((await a.getStock("v")).length).toBe(1);
  });
  it("gives up after max retries with retryable error", async () => {
    const { a } = mk([tok(), ...Array.from({ length: 4 }, () => new Response("x", { status: 500 }))], { maxRetries: 3 });
    await expect(a.getStock("v")).rejects.toMatchObject({ code: "upstream", retryable: true });
  });
  it("uses Product List V2 and maps results", async () => {
    const { a, calls } = mk([tok(), ok({ totalRecords: 1, content: [{ productList: [{ id: "p1", nameEn: "Lamp", sellPrice: "4.5", bigImage: "i" }] }] })]);
    const r = await a.searchProducts({ keyword: "lamp", pageSize: 500 });
    expect(calls[1].url).toContain("/v2/product/listV2?"); expect(calls[1].url).toContain("size=100");
    expect(r.items[0]).toMatchObject({ ref: "p1", costCents: 450 });
  });
  it("maps product detail variants and drops unpriced ones", async () => {
    const { a } = mk([tok(), ok({ pid: "p1", productNameEn: "Lamp", productImageSet: ["x"], variants: [{ vid: "v1", variantSellPrice: 3.2 }, { vid: "v2" }] })]);
    const d = await a.getProductDetail("p1"); expect(d.variants).toHaveLength(1); expect(d.variants[0].costCents).toBe(320);
  });
  it("parses shipping quotes", async () => {
    const { a } = mk([tok(), ok([{ logisticName: "CJPacket", logisticPrice: 5.1, logisticAging: "7-12" }])]);
    expect(await a.calculateShipping({ startCountryCode: "CN", endCountryCode: "US", products: [{ vid: "v", quantity: 1 }] })).toEqual([{ method: "CJPacket", costCents: 510, minDays: 7, maxDays: 12 }]);
  });
  it("blocks order creation unless explicitly enabled", async () => {
    const { a, calls } = mk([]); await expect(a.createOrder(order)).rejects.toMatchObject({ code: "blocked" }); expect(calls).toHaveLength(0);
  });
  it("blocks cancellation unless enabled", async () => { const { a } = mk([]); await expect(a.cancelOrder("x")).rejects.toMatchObject({ code: "blocked" }); });
  it("creates an unpaid order (payType 3) with our reference and never retries the POST", async () => {
    const { a, calls } = mk([tok(), new Response("x", { status: 503 })], { ordersEnabled: true });
    await expect(a.createOrder(order)).rejects.toMatchObject({ code: "upstream" }); expect(calls).toHaveLength(2);
    const body = JSON.parse(String(calls[1].init.body)); expect(body.payType).toBe(3); expect(body.orderNumber).toBe("PB-BZR-0001");
  });
  it("rejects invalid order references and quantities", async () => {
    const { a } = mk([], { ordersEnabled: true });
    await expect(a.createOrder({ ...order, orderNumber: "x" })).rejects.toMatchObject({ code: "blocked" });
    await expect(a.createOrder({ ...order, products: [{ vid: "v", quantity: 0 }] })).rejects.toMatchObject({ code: "blocked" });
  });
  it("reads order status and tracking", async () => {
    const { a } = mk([tok(), ok({ orderStatus: "SHIPPED", trackNumber: "T1", logisticName: "USPS" })]);
    expect(await a.getOrderStatus("o1")).toMatchObject({ status: "SHIPPED", trackingNumber: "T1", carrier: "USPS" });
  });
  it("verifyRefresh exchanges the refresh token without exposing tokens", async () => {
    const { a, calls } = mk([tok(), tok(2)]);
    expect(await a.verifyRefresh()).toEqual({ loggedIn: true, refreshed: true });
    expect(calls[1].url).toContain("refreshAccessToken"); expect(await a.getAccessToken()).toBe("a2");
  });
  it("has no balance-payment method", () => { const { a } = mk([]); expect((a as unknown as Record<string, unknown>).payBalance).toBeUndefined(); });
  it("redacts secrets and personal data in logs", () => { expect(redact({ apiKey: "k", shippingPhone: "1", orderNumber: "PB" })).toEqual({ apiKey: "[redacted]", shippingPhone: "[redacted]", orderNumber: "PB" }); });
  it("converts prices safely", () => { expect(toCents("1.99")).toBe(199); expect(toCents("2.5--4")).toBe(250); expect(toCents("abc")).toBeNull(); expect(toCents(-1)).toBeNull(); });
});
