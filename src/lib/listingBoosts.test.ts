import { describe, expect, it } from "vitest";
import { interleaveBoosts, organicPerSlot } from "./listingBoosts";

const org = (n: number, seller = (i: number) => `s${i}`) => Array.from({ length: n }, (_, i) => ({ id: `o${i}`, seller_id: seller(i) }));
const boost = (i: number, seller: string, endsInMs = 3600_000, weight = 2) => ({ id: `b${i}`, seller_id: seller, boost_id: `x${i}`, boost_weight: weight, boost_ends_at: new Date(Date.now() + endsInMs).toISOString() });

describe("listing boosts feed", () => {
  it("keeps an exact-search boosted match visible without a sponsored slot", () => {
    const listing = { id: "b1", seller_id: "A", title: "Exact card match" };
    const feed = interleaveBoosts([listing], [boost(1, "A")], { feedPercent: 10 });
    expect(feed).toEqual([listing]);
  });
  it("preserves every organic match when boosts outnumber sponsored slots", () => {
    const listings = org(20).map((item, i) => ({ ...item, id: `b${i}` }));
    const feed = interleaveBoosts(listings, listings.map((item, i) => boost(i, item.seller_id)), { feedPercent: 10 });
    expect(feed.map((item) => item.id)).toEqual(listings.map((item) => item.id));
  });
  it("keeps matching listings when seller adjacency blocks promotion", () => {
    const listings = [...org(9, () => "A"), { id: "b1", seller_id: "A" }];
    const feed = interleaveBoosts(listings, [boost(1, "A"), boost(2, "A")], { feedPercent: 10 });
    expect(feed).toEqual(listings);
  });
  it("does not duplicate an organic match as a sponsored entry", () => {
    const listings = [{ id: "b1", seller_id: "A" }, ...org(18)];
    const feed = interleaveBoosts(listings, [boost(1, "A"), boost(2, "B")], { feedPercent: 10 });
    expect(feed.filter((item) => item.id === "b1")).toHaveLength(1);
    expect(feed.filter((item) => item.sponsored).map((item) => item.id)).toEqual(["b2"]);
  });
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
