# PullBidLive Load Testing (Phase B)

External k6 scripts that simulate real traffic against the published app.
Run these from **k6 Cloud**, **Grafana k6**, or any machine with k6 installed —
**not** from inside the app, or numbers will be skewed by the same CPU.

## Quick start (local smoke test)

```bash
brew install k6   # or: choco install k6 / apt install k6
export BASE_URL="https://pullbidlive.com"
export SUPABASE_URL="https://yklpitgmqyclscnsswte.supabase.co"
export SUPABASE_ANON_KEY="<anon key from .env>"
export BETA_PASSWORD="<beta password>"   # if VITE_BETA_MODE=true
k6 run loadtests/k6/01-browse-100.js
```

## Cloud runs (recommended for 500+ VUs)

1. Sign in at https://app.k6.io (Grafana k6 Cloud).
2. Create a new project → "Run from CLI".
3. `k6 cloud login --token <your-token>`
4. `k6 cloud run loadtests/k6/03-bidwar-1000.js`

Cloud runs show p50/p95/p99, error rate, throughput, and let you compare runs.

## Scripts

| File | Scenario | VUs | Goal |
|------|----------|-----|------|
| `k6/01-browse-100.js` | Anonymous browsing (landing, market, listing) | 100 | Baseline read latency |
| `k6/02-browse-500.js` | Same, scaled | 500 | Find first read bottleneck |
| `k6/03-bidwar-1000.js` | 1k auth'd users bidding on 1 auction | 1000 | Realtime + DB write ceiling |
| `k6/04-live-viewers.js` | 500 concurrent live-stream viewers | 500 | HLS + presence channel |
| `k6/05-chat-spam.js` | 200 users spamming chat | 200 | Realtime broadcast / rate limits |
| `k6/06-multi-stream.js` | 10 simultaneous live auctions, 50 viewers each | 500 | Multi-host capacity |
| `k6/07-checkout.js` | 50 concurrent Stripe checkouts | 50 | Stripe Connect throughput |
| `k6/08-shipping.js` | 50 concurrent shipping-label generations | 50 | Shippo + edge fn ceiling |

All scripts emit standard k6 metrics; the dashboard at `/admin/performance`
captures the **server-side** half of the picture (DB query times, edge fn
latency, errors). Run both side by side.

## Capacity report

After each cloud run, paste the summary into `loadtests/reports/<date>.md`
following the template in `reports/_template.md`. Once 03/04/05 have all run
once, fill in `reports/CAPACITY.md` with the actual breaking points.
