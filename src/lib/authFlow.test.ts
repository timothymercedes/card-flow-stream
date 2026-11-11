import { describe, expect, it } from "vitest";
import { safeAuthReturnTo, signupNextStep } from "./authFlow";

describe("authentication completion", () => {
  it("keeps unconfirmed signups out of onboarding", () => {
    expect(signupNextStep(null)).toBe("confirm-email");
  });
  it("allows onboarding only with a signup session", () => {
    expect(signupNextStep({ user: { id: "collector" } })).toBe("onboarding");
  });
  it("retains same-origin destinations and filters", () => {
    expect(safeAuthReturnTo("/vault?category=sports", "https://pullbidlive.com")).toBe("/vault?category=sports");
  });
  it("rejects external and sign-in-loop destinations", () => {
    expect(safeAuthReturnTo("//evil.example/vault", "https://pullbidlive.com")).toBe("/");
    expect(safeAuthReturnTo("/auth?returnTo=/auth", "https://pullbidlive.com")).toBe("/");
  });
});