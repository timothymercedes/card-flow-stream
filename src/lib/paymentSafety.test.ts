import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: state.from } }));
// Expose handlers in isolation without executing authenticated network RPCs.
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const builder = { middleware: () => builder, inputValidator: () => builder, handler: (fn: unknown) => fn };
  return builder;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
import { processStripeEvent } from "./stripeWebhook.server";
import { requestPayout } from "./payouts.functions";
import type Stripe from "stripe";

beforeEach(() => state.from.mockClear());
describe("shared production payment isolation", () => {
  for (const type of ["payment_intent.succeeded", "payment_intent.payment_failed", "account.updated", "charge.refunded"] as const) {
    it(`ignores sandbox ${type} before any database access`, async () => {
      const event = { id: "evt_test", livemode: false, type, data: { object: { metadata: { order_id: "real-order" } } } } as unknown as Stripe.Event;
      expect(await (await processStripeEvent(event)).json()).toEqual({ received: true, test: true });
      expect(state.from).not.toHaveBeenCalled();
    });
  }
  it("rejects preview withdrawals before queuing a payout", async () => {
    const handler = requestPayout as unknown as (input: { data: { amountCents: number }; context: { userId: string } }) => Promise<unknown>;
    await expect(handler({ data: { amountCents: 500 }, context: { userId: "seller" } })).rejects.toThrow("disabled in preview");
    expect(state.from).not.toHaveBeenCalled();
  });
});