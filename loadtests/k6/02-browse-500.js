// 500 anonymous browsers — find first read bottleneck.
import http from "k6/http";
import { check } from "k6";
import { BASE_URL, unlockBeta, jitter, thresholds } from "./_lib.js";

export const options = {
  scenarios: {
    browse: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 200 },
        { duration: "2m", target: 500 },
        { duration: "3m", target: 500 },
        { duration: "1m", target: 0 },
      ],
    },
  },
  thresholds: { ...thresholds, http_req_duration: ["p(95)<3000", "p(99)<8000"] },
};

export function setup() { return { headers: unlockBeta() }; }

export default function (data) {
  const h = data.headers;
  const paths = ["/", "/market", "/live", "/feed", "/stories"];
  for (const p of paths) {
    const r = http.get(`${BASE_URL}${p}`, { headers: h });
    check(r, { [`${p} 2xx`]: (x) => x.status >= 200 && x.status < 300 });
    jitter(400, 1200);
  }
}
