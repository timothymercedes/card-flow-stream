import { describe, expect, it } from "vitest";
import { paymentEnvironment, paymentState } from "./paymentConfirmation";

describe("safe payment confirmation", () => {
  it("does not fulfill an unpaid completed checkout", () => expect(paymentState("unpaid")).toBe("pending"));
  it("recognizes settled payments", () => expect(paymentState("paid")).toBe("paid"));
  it("recognizes zero-payment checkouts", () => expect(paymentState("no_payment_required")).toBe("paid"));
  it("keeps test credentials in sandbox", () => expect(paymentEnvironment("pk_test_example")).toBe("sandbox"));
  it("fails closed when payment configuration is missing", () => expect(() => paymentEnvironment(undefined)).toThrow());
});