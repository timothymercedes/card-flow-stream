// 50 concurrent shipping-label generations (Shippo).
import http from "k6/http";
import { check } from "k6";
import { BASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, thresholds } from "./_lib.js";

export const options = {
  vus: 50,
  duration: "3m",
  thresholds: { ...thresholds, http_req_duration: ["p(95)<8000"] },
};

export default function () {
  const email = `sh_${__VU}_${Date.now()}@loadtest.invalid`;
  const s = http.post(`${SUPABASE_URL}/auth/v1/signup`,
    JSON.stringify({ email, password: "LoadTest123!" }),
    { headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY } });
  const token = s.json("access_token");

  const r = http.post(
    `${BASE_URL}/_serverFn/getShippingRates`,
    JSON.stringify({ data: { fromZip: "10001", toZip: "94105", weightOz: 8 } }),
    { headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" } },
  );
  check(r, { "rates returned": (x) => x.status >= 200 && x.status < 300 });
}
