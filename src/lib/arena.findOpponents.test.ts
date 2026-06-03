import { describe, it, expect } from "vitest";
import { fetchOpponentsCore, findOpponents } from "@/lib/arena.functions";

/**
 * Integration test for the Arena "find opponents" flow.
 *
 * 1. Confirms `findOpponents` is wired as a POST server function (it was GET,
 *    which crashed with "Cannot read properties of undefined (reading 'method')").
 * 2. Exercises the real opponent-fetch logic (`fetchOpponentsCore`, which the
 *    authenticated POST handler delegates to) against a Supabase query-builder
 *    fake, asserting it returns other users' companions with the opponent-safe
 *    projection and honours the community filter.
 */

const TEST_USER = "11111111-1111-1111-1111-111111111111";
const OTHER_USER = "22222222-2222-2222-2222-222222222222";

const ROWS = [
  {
    id: "c-own", user_id: TEST_USER, name: "My Charizard", category: "Pokémon",
    community: "pokemon", arena_category: "pokemon", image_url: null, attack: 50, defense: 40, speed: 30,
    hidden_traits: ["First Strike"], xp: 500, level: 3,
    wins: 10, losses: 2, win_streak: 3, longest_win_streak: 5, season_wins: 4,
    trophies: 120, arena_rank: 1200, title: "veteran",
  },
  {
    id: "c-poke", user_id: OTHER_USER, name: "Rival Blastoise", category: "Pokémon",
    community: "pokemon", arena_category: "pokemon", image_url: "https://img/blastoise.png", attack: 44, defense: 55, speed: 22,
    hidden_traits: ["Iron Wall"], xp: 300, level: 2,
    wins: 8, losses: 4, win_streak: 1, longest_win_streak: 3, season_wins: 2,
    trophies: 80, arena_rank: 1100, title: "rookie",
  },
  {
    id: "c-sport", user_id: OTHER_USER, name: "Rival Jordan", category: "Sports",
    community: "sports", arena_category: "sports", image_url: null, attack: 60, defense: 30, speed: 40,
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

describe("Arena findOpponents (authenticated POST)", () => {
  it("is configured as a POST server function", () => {
    // Was GET — switching to POST is the fix being verified.
    expect((findOpponents as unknown as { method: string }).method).toBe("POST");
  });

  it("returns opponents (other users' companions) when authenticated", async () => {
    const res = await fetchOpponentsCore(makeFakeAdmin(ROWS), TEST_USER);

    expect(Array.isArray(res.opponents)).toBe(true);
    expect(res.opponents.length).toBeGreaterThan(0);

    // Never include the caller's own companion.
    expect(res.opponents.some((o) => o.user_id === TEST_USER)).toBe(false);
    expect(res.opponents.every((o) => o.user_id === OTHER_USER)).toBe(true);
  });

  it("uses the opponent-safe projection (no hidden stats leaked)", async () => {
    const res = await fetchOpponentsCore(makeFakeAdmin(ROWS), TEST_USER);
    const sample = res.opponents[0] as Record<string, unknown>;

    expect(sample).toHaveProperty("win_rate");
    for (const secret of ["attack", "defense", "speed", "hidden_traits", "xp"]) {
      expect(sample).not.toHaveProperty(secret);
    }
  });

  it("filters opponents by Arena category", async () => {
    const res = await fetchOpponentsCore(makeFakeAdmin(ROWS), TEST_USER, "sports");

    expect(res.opponents.length).toBe(1);
    expect(res.opponents[0].arena_category).toBe("sports");
  });

  it("returns all non-self opponents for the 'all' category (cross-category)", async () => {
    const res = await fetchOpponentsCore(makeFakeAdmin(ROWS), TEST_USER, "all");
    expect(res.opponents.length).toBe(2);
  });

});
