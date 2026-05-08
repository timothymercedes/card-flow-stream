// 200 users spamming chat — realtime broadcast + rate limits.
import http from "k6/http";
import { check, sleep } from "k6";
import { SUPABASE_URL, SUPABASE_ANON_KEY, thresholds } from "./_lib.js";

const STREAM_ID = __ENV.STREAM_ID || "REPLACE_WITH_LIVE_STREAM_ID";

export const options = {
  vus: 200,
  duration: "3m",
  thresholds,
};

export default function () {
  const email = `chat_${__VU}_${Date.now()}@loadtest.invalid`;
  const sr = http.post(`${SUPABASE_URL}/auth/v1/signup`,
    JSON.stringify({ email, password: "LoadTest123!" }),
    { headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY } });
  const token = sr.json("access_token");
  if (!token) return;

  for (let i = 0; i < 20; i++) {
    const r = http.post(
      `${SUPABASE_URL}/rest/v1/stream_messages`,
      JSON.stringify({ stream_id: STREAM_ID, content: `spam ${__VU}-${i}` }),
      { headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, Prefer: "return=minimal" } },
    );
    check(r, { "chat write": (x) => x.status >= 200 && x.status < 500 });
    sleep(Math.random() * 0.4 + 0.1); // 100-500ms between msgs
  }
}
