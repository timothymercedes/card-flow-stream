import { describe, it, expect, vi } from "vitest";
import { deriveKey, encryptToken, decryptToken } from "./tokenCrypto";
import { CJDropshippingAdapter, type StoredTokens, type TokenStore } from "./cjAdapter.server";

const SECRET = "x".repeat(64);
describe("token encryption", () => {
  it("round-trips and never stores plaintext", async () => {
    const k = await deriveKey(SECRET); const blob = await encryptToken("secret-token", k, "sup:access");
    expect(blob).not.toContain("secret-token"); expect(blob.startsWith("v1.")).toBe(true);
    expect(await decryptToken(blob, k, "sup:access")).toBe("secret-token");
  });
  it("uses a fresh IV each time", async () => { const k = await deriveKey(SECRET); expect(await encryptToken("t", k, "a")).not.toBe(await encryptToken("t", k, "a")); });
  it("rejects the wrong key", async () => { const blob = await encryptToken("t", await deriveKey(SECRET), "a"); await expect(decryptToken(blob, await deriveKey("y".repeat(64)), "a")).rejects.toThrow(); });
  it("rejects swapping access/refresh ciphertexts (bound context)", async () => { const k = await deriveKey(SECRET); await expect(decryptToken(await encryptToken("t", k, "s:access"), k, "s:refresh")).rejects.toThrow(); });
  it("rejects tampering", async () => { const k = await deriveKey(SECRET); const b = await encryptToken("token", k, "a"); const parts = b.split("."); parts[2] = parts[2].slice(0, -4) + (parts[2].endsWith("AAAA") ? "BBBB" : "AAAA"); await expect(decryptToken(parts.join("."), k, "a")).rejects.toThrow(); });
  it("refuses short keys", async () => { await expect(deriveKey("short")).rejects.toThrow(); });
});

/** In-memory store mirroring the database lock rules (lease expiry, owner check on save). */
function fakeStore(nowFn: () => number) {
  const row: { t: StoredTokens | null; owner: string | null; until: number } = { t: null, owner: null, until: 0 };
  const store: TokenStore = {
    async load() { return row.t ? { ...row.t } : null; },
    async claim(o) { const n = nowFn(); if (!row.owner || row.until < n || row.owner === o) { row.owner = o; row.until = n + 30_000; return true; } return false; },
    async save(o, t) { if (row.owner !== o || row.until <= nowFn()) return false; row.t = { ...t }; row.owner = null; row.until = 0; return true; },
  };
  return { store, row };
}
const tokRes = (n: number, accessExp = "2030-01-01T00:00:00Z") => new Response(JSON.stringify({ code: 200, result: true, data: { accessToken: `a${n}`, refreshToken: `r${n}`, accessTokenExpiryDate: accessExp, refreshTokenExpiryDate: "2031-01-01T00:00:00Z" } }));

describe("shared token store", () => {
  it("five concurrent server copies cause exactly one CJ sign-in", async () => {
    let now = Date.parse("2026-11-15T00:00:00Z"); const { store } = fakeStore(() => now);
    const fetchImpl = vi.fn(async () => { await new Promise((r) => setTimeout(r, 20)); return tokRes(1); }) as unknown as typeof fetch;
    const copies = Array.from({ length: 5 }, () => new CJDropshippingAdapter({ apiKey: "K", tokenStore: store, fetchImpl, log: () => {}, now: () => now, sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 10))) }));
    const tokens = await Promise.all(copies.map((c) => c.getAccessToken()));
    expect(new Set(tokens)).toEqual(new Set(["a1"])); expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("reuses saved tokens across copies without signing in", async () => {
    const now = Date.parse("2026-11-15T00:00:00Z"); const { store, row } = fakeStore(() => now);
    row.t = { access: "saved", refresh: "r", accessExp: now + 864e5, refreshExp: now + 864e6 };
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect(await new CJDropshippingAdapter({ apiKey: "K", tokenStore: store, fetchImpl, log: () => {}, now: () => now }).getAccessToken()).toBe("saved");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("refreshes an expired saved token with the refresh token (not a new sign-in)", async () => {
    const now = Date.parse("2026-11-15T00:00:00Z"); const { store, row } = fakeStore(() => now);
    row.t = { access: "old", refresh: "r0", accessExp: now - 1, refreshExp: now + 864e6 };
    const calls: string[] = []; const fetchImpl = vi.fn(async (u: string) => { calls.push(String(u)); return tokRes(2); }) as unknown as typeof fetch;
    expect(await new CJDropshippingAdapter({ apiKey: "K", tokenStore: store, fetchImpl, log: () => {}, now: () => now }).getAccessToken()).toBe("a2");
    expect(calls[0]).toContain("refreshAccessToken"); expect(row.t?.access).toBe("a2");
  });
  it("a copy whose lock expired cannot overwrite tokens", async () => {
    let now = 0; const { store, row } = fakeStore(() => now);
    expect(await store.claim("A")).toBe(true); now += 31_000;
    expect(await store.claim("B")).toBe(true);
    expect(await store.save("A", { access: "stale", refresh: "r", accessExp: 1, refreshExp: 1 }, "login")).toBe(false);
    expect(await store.save("B", { access: "fresh", refresh: "r", accessExp: 1, refreshExp: 1 }, "login")).toBe(true);
    expect(row.t?.access).toBe("fresh");
  });
  it("a held, unexpired lock blocks a second claimer", async () => { const { store } = fakeStore(() => 0); expect(await store.claim("A")).toBe(true); expect(await store.claim("B")).toBe(false); });
});
