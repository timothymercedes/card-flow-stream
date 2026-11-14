import { describe, it, expect } from "vitest";
import { detectOffPlatform as d } from "./offPlatform";

describe("off-platform detector", () => {
  for (const t of ["Cash App", "Zelle", "Venmo", "PayPal", "Apple Pay", "Google Pay", "Facebook Pay", "wire transfer", "direct deposit"])
    it(`flags payment request via ${t}`, () => expect(d(`Send me $20 on ${t} for this card`).risk).toBe("high"));
  for (const t of ["c a s h a p p", "ca$happ", "v3nmo", "z-e-l-l-e", "p@ypal"])
    it(`catches disguised "${t}"`, () => expect(["medium", "high"]).toContain(d(`pay me on ${t} for this`).risk));
  it("cashtag is high", () => expect(d("hit me at $cardking22 and it's yours").risk).toBe("high"));
  it("bypass checkout", () => expect(["medium", "high"]).toContain(d("text me 555-123-4567 to skip the fees").risk));
  it("external link", () => expect(d("paypal.me/someone").risk).toBe("high"));
  it("negated mention is not a violation", () => expect(["none", "low"]).toContain(d("I don't accept Cash App").risk));
  it("safety warning is not a violation", () => expect(["none", "low"]).toContain(d("Never pay sellers through Zelle outside PullBid Live").risk));
  it("plain chat is clean", () => expect(d("Great pull! Charizard looks mint").risk).toBe("none"));
  it("normal price chat is clean", () => expect(d("Starting this at $20, good luck everyone").risk).toBe("none"));
});
