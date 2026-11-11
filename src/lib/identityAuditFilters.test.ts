import { describe, expect, it } from "vitest";
import { identityLogShortcut, readIdentityLogFilters } from "./identityAuditFilters";

describe("identity log navigation filters", () => {
  const filters = { logFp: "old-fingerprint", logUser: "admin-one", logFrom: "2026-11-01T10:00", logTo: "2026-11-11T15:00" };

  it("applies the affected fingerprint while preserving user and time filters", () => {
    expect(identityLogShortcut(filters, "logFp", " abc123 ")).toEqual({ ...filters, logFp: "abc123" });
  });

  it("applies the acting user while preserving fingerprint and time filters", () => {
    expect(identityLogShortcut(filters, "logUser", "admin-two")).toEqual({ ...filters, logUser: "admin-two" });
  });

  it("retains filters when navigating through identity or profile details", () => {
    expect(readIdentityLogFilters(filters)).toEqual(filters);
  });

  it("ignores non-string search inputs", () => {
    expect(readIdentityLogFilters({ logFp: 123, logUser: { role: "admin" } })).toEqual({ logFp: undefined, logUser: undefined, logFrom: undefined, logTo: undefined });
  });
});