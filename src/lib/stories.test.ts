import { describe, it, expect } from "vitest";
import { groupStories, firstUnreadIndex, isStoryActive, type Story } from "./stories";

const mk = (id: string, user: string, t: number): Story => ({ id, user_id: user, username: user, avatar_url: null, image_url: "", caption: null, visibility: "public", created_at: new Date(t).toISOString(), expires_at: new Date(t + 864e5).toISOString(), media_type: "image", sequence_id: null, overlays: [] });

describe("stories", () => {
  it("expires after 24 hours", () => {
    const s = mk("a", "u", 0);
    expect(isStoryActive(s, 864e5 - 1)).toBe(true);
    expect(isStoryActive(s, 864e5)).toBe(false);
  });
  it("puts my stories first, then unread before viewed", () => {
    const g = groupStories([mk("1", "viewed", 1), mk("2", "unread", 2), mk("3", "me", 3)], new Set(["1"]), "me");
    expect(g.map((x) => x.stories[0]!.user_id)).toEqual(["me", "unread", "viewed"]);
    expect(g[2]!.unread).toBe(false);
  });
  it("opens at the first unseen story in a sequence", () => {
    expect(firstUnreadIndex([mk("1", "u", 1), mk("2", "u", 2)], new Set(["1"]))).toBe(1);
    expect(firstUnreadIndex([mk("1", "u", 1)], new Set(["1"]))).toBe(0);
  });
});
