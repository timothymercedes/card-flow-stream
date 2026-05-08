// 1k authenticated users in a single bidding war.
// Tests realtime fanout + DB write contention on the bids table.
import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";
import { BASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, unlockBeta, jitter, thresholds } from "./_lib.js";

const AUCTION_ID = __ENV.AUCTION_ID || "REPLACE_WITH_LIVE_AUCTION_ID";

export const options = {
  scenarios: {
    bidders: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 250 },
        { duration: "2m", target: 1000 },
        { duration: "3m", target: 1000 },
        { duration: "1m", target: 0 },
      ],
    },
  },
  thresholds: { ...thresholds, http_req_duration: ["p(95)<3000"] },
};

export function setup() {
  return { headers: unlockBeta() };
}

export default function (data) {
  // Sign up a throwaway user
  const email = `lt_${__VU}_${__ITER}@loadtest.invalid`;
  const r = http.post(
    `${SUPABASE_URL}/auth/v1/signup`,
    JSON.stringify({ email, password: "LoadTest123!" }),
    { headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY } },
  );
  const token = r.json("access_token");
  if (!token) { sleep(1); return; }

  // Subscribe to realtime bid channel
  const wsUrl = `${SUPABASE_URL.replace("https", "wss")}/realtime/v1/websocket?apikey=${SUPABASE_ANON_KEY}&vsn=1.0.0`;
  ws.connect(wsUrl, {}, function (socket) {
    socket.on("open", () => {
      socket.send(JSON.stringify({
        topic: `realtime:public:bids:auction_id=eq.${AUCTION_ID}`,
        event: "phx_join", payload: { config: { broadcast: { self: false } } }, ref: "1",
      }));
    });
    socket.setTimeout(() => socket.close(), 30000);

    // Place 3-5 bids over the connection lifetime
    for (let i = 0; i < 4; i++) {
      sleep(Math.random() * 5 + 2);
      const bid = http.post(
        `${SUPABASE_URL}/rest/v1/rpc/place_bid`,
        JSON.stringify({ _auction_id: AUCTION_ID, _amount_cents: 100 + i * 50 }),
        { headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
      );
      check(bid, { "bid accepted": (x) => x.status >= 200 && x.status < 400 });
    }
  });
}
