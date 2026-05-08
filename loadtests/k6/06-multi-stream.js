// 10 simultaneous live auctions, 50 viewers each = 500 VUs total.
import http from "k6/http";
import { check } from "k6";
import { BASE_URL, unlockBeta, jitter, thresholds } from "./_lib.js";

// Comma-separated list: STREAM_IDS=id1,id2,...
const STREAM_IDS = (__ENV.STREAM_IDS || "").split(",").filter(Boolean);

export const options = {
  scenarios: {
    multistream: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 250 },
        { duration: "2m", target: 500 },
        { duration: "5m", target: 500 },
        { duration: "1m", target: 0 },
      ],
    },
  },
  thresholds,
};

export function setup() {
  if (STREAM_IDS.length === 0) throw new Error("Set STREAM_IDS env var with comma-separated stream IDs");
  return { headers: unlockBeta() };
}

export default function (data) {
  const id = STREAM_IDS[__VU % STREAM_IDS.length];
  const h = data.headers;
  const r = http.get(`${BASE_URL}/live/${id}`, { headers: h });
  check(r, { "stream 200": (x) => x.status === 200 });
  jitter(2000, 4000);
  for (let i = 0; i < 20; i++) {
    http.get(`${BASE_URL}/api/public/hls/${id}.m3u8`, { headers: h });
    jitter(3500, 4500);
  }
}
