import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Integration test for the Arena "find opponents" flow.
 *
 * Verifies that `findOpponents` — after being switched from GET to POST — can be
 * invoked while authenticated and returns an opponent roster. The Supabase auth
 * middleware and admin client are mocked so the real server-function handler
 * (validation + query intent + opponent-safe projection) runs in CI without
 * live credentials.
 */

const TEST_USER = "11111111-1111-1111-1111-111111111111";
const OTHER_USER = "22222222-2222-2222-2222-222222222222";

// Seeded companion rows across users/communities. Full stats are present so we
// can assert the public projection strips them out.
const ROWS = [
  {
    id: "c-own", user_id: TEST_USER, name: "My Charizard", category: "Pokémon",
    community: "pokemon", image_url: null, attack: 50, defense: 40, speed: 30,
    hidden_traits: ["First Strike"], xp: 500, level: 3,
    wins: 10, losses: 2, win_streak: 3, longest_win_streak: 5, season_wins: 4,
    trophies: 120, arena_rank: 1200, title: "veteran",
  },
  {
    id: "c-poke", user_id: OTHER_USER, name: "Rival Blastoise", category: "Pokémon",
    community: "pokemon", image_url: "https://img/blastoise.png", attack: 44, defense: 55, speed: 22,
    hidden_traits: ["Iron Wall"], xp: 300, level: 2,
    wins: 8, losses: 4, win_streak: 1, longest_win_streak: 3, season_wins: 2,
    trophies: 80, arena_rank: 1100, title: "rookie",
  },
  {
    id: "c-sport", user_id: OTHER_USER, name: "Rival Jordan", category: "Sports",
    community: "sports", image_url: null, attack: 60, defense: 30, speed: 40,
    hidden_traits: ["Berserker"], xp: 900, level: 4,
    wins: 20, losses: 5, win_streak: 6, longest_win_streak: 9, season_wins: 12,
    trophies: 200, arena_rank: 1500, title: "elite",
  },
];

// A minimal Supabase query-builder fake that honours .neq()/.eq()/.limit() and
// resolves like a PostgREST builder when awaited.
function makeFakeAdmin(rows: typeof ROWS) {
  return {
    from(_table: string) {
      let data = [...rows];
      const builder: any = {
        select() { return builder; },
        neq(col: string, val: unknown) { data = data.filter((r: any) => r[col] !== val); return builder; },
        eq(col: string, val: unknown) { data = data.filter((r: any) => r[col] === val); return builder; },
        limit(n: number) { data = data.slice(0, n); return builder; },
        then(resolve: (v: { data: any[]; error: null }) => void) { resolve({ data, error: null }); },
      };
      return builder;
    },
  };
}

// Replace the auth middleware with a pass-through that injects an authenticated context.
vi.mock("@/integrations/supabase/auth-middleware", async () => {
  const { createMiddleware } = await import("@tanstack/react-start");
  return {
    requireSupabaseAuth: createMiddleware({ type: "function" }).server(
      async ({ next }: any) => next({ context: { userId: TEST_USER, supabase: {}, claims: { sub: TEST_USER } } }),
    ),
  };
});

// Replace the admin client (loaded via dynamic import inside the handler).
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: makeFakeAdmin(ROWS),
}));

describe("Arena findOpponents (authenticated POST)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is configured as a POST server function", async () => {
    const { findOpponents } = await import("@/lib/arena.functions");
    // createServerFn exposes its config; method must be POST (was GET, which crashed).
    expect((findOpponents as any).options?.method ?? (findOpponents as any).method).toBe("POST");
  });

  it("returns opponents (other users' companions) when authenticated", async () => {
    const { findOpponents } = await import("@/lib/arena.functions");
    const res = await findOpponents({ data: {} });

    expect(Array.isArray(res.opponents)).toBe(true);
    expect(res.opponents.length).toBeGreaterThan(0);

    // Never include the caller's own companion.
    expect(res.opponents.some((o) => o.user_id === TEST_USER)).toBe(false);
    expect(res.opponents.every((o) => o.user_id === OTHER_USER)).toBe(true);
  });

  it("uses the opponent-safe projection (no hidden stats leaked)", async () => {
    const { findOpponents } = await import("@/lib/arena.functions");
    const res = await findOpponents({ data: {} });
    const sample = res.opponents[0] as Record<string, unknown>;

    expect(sample).toHaveProperty("win_rate");
    for (const secret of ["attack", "defense", "speed", "hidden_traits", "xp"]) {
      expect(sample).not.toHaveProperty(secret);
    }
  });

  it("filters opponents by community", async () => {
    const { findOpponents } = await import("@/lib/arena.functions");
    const res = await findOpponents({ data: { community: "sports" } });

    expect(res.opponents.length).toBe(1);
    expect(res.opponents[0].community).toBe("sports");
  });
});
