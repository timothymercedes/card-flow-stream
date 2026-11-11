import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  row: null as null | { id: string; challenge: string; purpose: string; user_id: string | null; origin: string; rp_id: string; expires_at: string },
  origin: "https://pullbidlive.com",
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequestHeader: () => state.origin }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => {
    const filters: Array<(row: NonNullable<typeof state.row>) => boolean> = [];
    const query = {
      delete: () => query,
      eq: (key: string, value: unknown) => { filters.push(row => row[key as keyof typeof row] === value); return query; },
      gt: (key: string, value: string) => { filters.push(row => String(row[key as keyof typeof row]) > value); return query; },
      lt: () => Promise.resolve({ error: null }),
      select: () => query,
      maybeSingle: async () => {
        const row = state.row;
        if (!row || !filters.every(filter => filter(row))) return { data: null, error: null };
        state.row = null;
        return { data: { challenge: row.challenge, user_id: row.user_id }, error: null };
      },
    };
    return query;
  } },
}));
import { consumeChallenge } from "./passkeyChallenges.server";

beforeEach(() => {
  state.origin = "https://pullbidlive.com";
  state.row = { id: "challenge-id", challenge: "nonce", purpose: "registration", user_id: "owner",
    origin: state.origin, rp_id: "pullbidlive.com", expires_at: new Date(Date.now() + 300000).toISOString() };
});
describe("passkey challenge security", () => {
  it("consumes a challenge exactly once", async () => {
    expect((await consumeChallenge("challenge-id", "registration", "owner")).challenge).toBe("nonce");
    await expect(consumeChallenge("challenge-id", "registration", "owner")).rejects.toThrow("already used");
  });
  it("rejects another registration owner", async () => {
    await expect(consumeChallenge("challenge-id", "registration", "other")).rejects.toThrow("expired");
  });
  it("rejects expired challenges", async () => {
    if (state.row) state.row.expires_at = new Date(Date.now() - 1000).toISOString();
    await expect(consumeChallenge("challenge-id", "registration", "owner")).rejects.toThrow("expired");
  });
  it("rejects a different origin", async () => {
    state.origin = "https://www.pullbidlive.com";
    await expect(consumeChallenge("challenge-id", "registration", "owner")).rejects.toThrow("expired");
  });
});