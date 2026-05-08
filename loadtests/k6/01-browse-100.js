// 100 anonymous browsers — baseline read latency.
import http from "k6/http";
import { check } from "k6";
import { BASE_URL, unlockBeta, jitter, thresholds } from "./_lib.js";

export const options = {
  scenarios: {
    browse: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 50 },
        { duration: "1m", target: 100 },
        { duration: "2m", target: 100 },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds,
};

export function setup() { return { headers: unlockBeta() }; }

export default function (data) {
  const h = data.headers;
  let r = http.get(`${BASE_URL}/`, { headers: h });
  check(r, { "/ 200": (x) => x.status === 200 });
  jitter(500, 1500);

  r = http.get(`${BASE_URL}/market`, { headers: h });
  check(r, { "/market 200": (x) => x.status === 200 });
  jitter(800, 2000);

  r = http.get(`${BASE_URL}/live`, { headers: h });
  check(r, { "/live 200": (x) => x.status === 200 });
  jitter(1000, 3000);
}
