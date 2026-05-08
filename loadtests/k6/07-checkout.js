// 50 concurrent Stripe checkout-session creations.
// Note: this only measures session creation latency, not full payment.
import http from "k6/http";
import { check } from "k6";
import { BASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, thresholds } from "./_lib.js";

const PRICE_ID = __ENV.PRICE_ID || "test_item";

export const options = {
  vus: 50,
  duration: "3m",
  thresholds: { ...thresholds, http_req_duration: ["p(95)<5000"] },
};

export default function () {
  const email = `co_${__VU}_${Date.now()}@loadtest.invalid`;
  const s = http.post(`${SUPABASE_URL}/auth/v1/signup`,
    JSON.stringify({ email, password: "LoadTest123!" }),
    { headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY } });
  const token = s.json("access_token");

  const r = http.post(
    `${BASE_URL}/_serverFn/createCheckoutSession`,
    JSON.stringify({ data: { priceId: PRICE_ID, quantity: 1, returnUrl: `${BASE_URL}/checkout/return`, environment: "sandbox" } }),
    { headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" } },
  );
  check(r, { "session created": (x) => x.status >= 200 && x.status < 300 });
}
