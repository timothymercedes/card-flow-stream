// Shared helpers for all k6 scripts.
import http from "k6/http";
import { check, sleep } from "k6";

export const BASE_URL = __ENV.BASE_URL || "https://pullbidlive.com";
export const SUPABASE_URL = __ENV.SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || "";
export const BETA_PASSWORD = __ENV.BETA_PASSWORD || "";

export function jitter(minMs, maxMs) {
  sleep((Math.random() * (maxMs - minMs) + minMs) / 1000);
}

/** Unlock the beta gate cookie if VITE_BETA_MODE is on. */
export function unlockBeta() {
  if (!BETA_PASSWORD) return {};
  const r = http.post(`${BASE_URL}/api/public/beta-verify`, JSON.stringify({ password: BETA_PASSWORD }), {
    headers: { "Content-Type": "application/json" },
  });
  check(r, { "beta unlocked": (x) => x.status === 200 });
  return { Cookie: `pbl_beta=1` };
}

/** Sign up a throwaway test user via Supabase auth. */
export function signUpAnon() {
  const email = `lt_${Date.now()}_${Math.floor(Math.random() * 1e6)}@loadtest.invalid`;
  const password = "LoadTest123!";
  const r = http.post(
    `${SUPABASE_URL}/auth/v1/signup`,
    JSON.stringify({ email, password }),
    { headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY } },
  );
  if (r.status !== 200 && r.status !== 201) return null;
  const body = r.json();
  return { email, token: body.access_token, userId: body.user?.id };
}

export const thresholds = {
  http_req_duration: ["p(95)<2000", "p(99)<5000"],
  http_req_failed: ["rate<0.05"],
};
