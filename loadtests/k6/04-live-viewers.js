// 500 concurrent live-stream viewers — HLS + presence channel.
import http from "k6/http";
import { check } from "k6";
import { BASE_URL, unlockBeta, jitter, thresholds } from "./_lib.js";

const STREAM_ID = __ENV.STREAM_ID || "REPLACE_WITH_LIVE_STREAM_ID";

export const options = {
  scenarios: {
    viewers: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 200 },
        { duration: "2m", target: 500 },
        { duration: "5m", target: 500 },
        { duration: "1m", target: 0 },
      ],
    },
  },
  thresholds,
};

export function setup() { return { headers: unlockBeta() }; }

export default function (data) {
  const h = data.headers;
  let r = http.get(`${BASE_URL}/live/${STREAM_ID}`, { headers: h });
  check(r, { "stream page 200": (x) => x.status === 200 });
  jitter(1000, 2000);

  // Poll HLS playlist (a viewer fetches every ~4s)
  for (let i = 0; i < 30; i++) {
    r = http.get(`${BASE_URL}/api/public/hls/${STREAM_ID}.m3u8`, { headers: h });
    check(r, { "hls 2xx or 404": (x) => x.status === 200 || x.status === 404 });
    jitter(3500, 4500);
  }
}
