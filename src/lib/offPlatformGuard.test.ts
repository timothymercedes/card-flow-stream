import { describe, it, expect, vi } from "vitest";
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
import { offPlatformAction as a } from "./offPlatformGuard";
import { canAccessFinancialAdmin as can } from "./adminAccess";

describe("off-platform guard actions", () => {
  it("blocks DM payment handle", () => expect(a("Venmo me at $seller12 to save 10%")).toBe("block"));
  it("blocks live chat bypass", () => expect(a("Zelle me $50 to skip fees")).toBe("block"));
  it("blocks PayPal link in listing description", () => expect(a("Nice card", "pay at paypal.me/bob")).toBe("block"));
  it("allows educational warning", () => expect(a("Never pay sellers through Zelle outside PullBid Live")).toBe("allow"));
  it("allows negated mention", () => expect(a("I don't accept PayPal")).toBe("allow"));
  it("allows price talk", () => expect(a("PSA 10 sold for $300 last week")).toBe("allow"));
  it("allows local pickup arrangement", () => expect(a("Local pickup available at the convention center")).toBe("allow"));
  it("allows pickup handoff code talk", () => expect(a("Bring your 6-digit handoff code to pickup on Saturday")).toBe("allow"));
  it("allows empty", () => expect(a("", null)).toBe("allow"));
});

describe("financial admin access", () => {
  it("owner allowed", () => expect(can(["owner"])).toBe(true));
  it("admin allowed", () => expect(can(["admin"])).toBe(true));
  it("moderator denied", () => expect(can(["moderator"])).toBe(false));
  it("support denied", () => expect(can(["support"])).toBe(false));
  it("no roles denied", () => expect(can([])).toBe(false));
});
