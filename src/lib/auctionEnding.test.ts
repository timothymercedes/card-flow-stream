import { describe, it, expect } from "vitest";
import { dueWindow } from "./auctionEnding";
const now = 1_000_000_000_000;
const at = (m: number) => new Date(now + m * 60000).toISOString();
describe("dueWindow", () => {
  it("1 hour warning around 60 min", () => expect(dueWindow(at(60), now)).toBe("1h"));
  it("10 minute warning", () => expect(dueWindow(at(9), now)).toBe("10m"));
  it("nothing at 30 min", () => expect(dueWindow(at(30), now)).toBeNull());
  it("nothing after end", () => expect(dueWindow(at(-1), now)).toBeNull());
});
