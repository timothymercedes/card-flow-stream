import { describe, expect, it } from "vitest";
import { interleaveBoosts, organicPerSlot } from "./listingBoosts";

const org = (n: number, seller = (i: number) => `s${i}`) => Array.from({ length: n }, (_, i) => ({ id: `o${i}`, seller_id: seller(i) }));
const boost = (i: number, seller: string, endsInMs = 3600_000, weight = 2) => ({ id: `b${i}`, seller_id: seller, boost_id: `x${i}`, boost_weight: weight, boost_ends_at: new Date(Date.now() + endsInMs).toISOString() });

describe("listing boosts feed", () => {
  it("10% share means 1 boosted per 10 positions", () => { expect(organicPerSlot(10)).toBe(9); });
  it("never exceeds 10% of the feed even with many boosts", () => {
    const feed = interleaveBoosts(org(90), Array.from({ length: 50 }, (_, i) => boost(i, `seller${i}`)), { feedPercent: 10 });
    const sponsored = feed.filter((f) => f.sponsored).length;
    expect(sponsored).toBe(10);
    expect(sponsored / feed.length).toBeLessThanOrEqual(0.1);
  });
  it("never places the same seller's boosts back to back", () => {
    const feed = interleaveBoosts(org(200), [boost(1, "A"), boost(2, "A"), boost(3, "A"), boost(4, "B")], { feedPercent: 10 });
    const sellers = feed.filter((f) => f.sponsored).map((f) => f.seller_id);
    for (let i = 1; i < sellers.length; i++) expect(sellers[i]).not.toBe(sellers[i - 1]);
  });
  it("drops boosts the moment they expire", () => {
    const feed = interleaveBoosts(org(20), [boost(1, "A", -1)], { feedPercent: 10 });
    expect(feed.some((f) => f.sponsored)).toBe(false);
  });
});
