export function paymentState(paymentStatus: string): "paid" | "pending" {
  return paymentStatus === "paid" || paymentStatus === "no_payment_required" ? "paid" : "pending";
}

export function paymentEnvironment(token: string | undefined): "sandbox" | "live" {
  if (token?.startsWith("pk_test_")) return "sandbox";
  if (token?.startsWith("pk_live_")) return "live";
  throw new Error("Complete Stripe go-live before accepting payments.");
}