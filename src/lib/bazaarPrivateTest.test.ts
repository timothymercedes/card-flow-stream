import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { isSellable } from "./bazaarCheckout.server";

describe("PB Bazaar private test items", () => {
  it("published items in the active Direct store sell to everyone", () => expect(isSellable("published", "active", "pb-bazaar-direct", false)).toBe(true));
  it("private_test items are refused for non-admin shoppers", () => expect(isSellable("private_test", "private_test", "pb-bazaar-direct", false)).toBe(false));
  it("private_test items are allowed for admins in test checkout", () => expect(isSellable("private_test", "private_test", "pb-bazaar-direct", true)).toBe(true));
  it("drafts never sell, even to admins", () => expect(isSellable("draft", "active", "pb-bazaar-direct", true)).toBe(false));
  it("other stores never sell through Direct checkout", () => expect(isSellable("published", "active", "other-store", true)).toBe(false));
});
