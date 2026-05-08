# Capacity Report — PullBidLive

> Fill in after running the k6 scripts in `loadtests/k6/`. This file is the
> deliverable: it summarizes what breaks first, the safe user ceiling, and
> the upgrade path.

## Estimated safe capacity (pre-test placeholders)

These are **best-guess** values from architecture review. Replace with
measured numbers after k6 Cloud runs.

| Workload | Estimated safe ceiling | First bottleneck (predicted) |
|---|---|---|
| Anonymous browsers | ~500 concurrent | Edge SSR cold-start; mitigated by CF caching |
| Authenticated users (mixed) | ~300 concurrent | DB connection pool (default 60 on Cloud) |
| Bidders on a single auction | ~200 simultaneous | Realtime fanout + bid-validation trigger row lock |
| Live-stream viewers per stream | ~1000 | Cloudflare Calls handles this; HLS edge caches well |
| Concurrent live streams | ~10–20 | Encoder cost + DB presence write rate |
| Chat msgs/sec/stream | ~50 | Realtime broadcast; needs server-side rate limit |
| Stripe checkout creations | ~30/sec | Stripe API limit (25 req/s default) |
| Shipping labels | ~10/sec | Shippo API limit |

## Predicted "what breaks first" order

1. **DB connection pool exhaustion** (~300 auth'd users) — symptoms: 5xx on
   any RLS query, "remaining connection slots reserved" in postgres logs.
2. **Realtime fanout latency** during bid wars (>500 subscribers on one
   channel) — bids land on DB but viewers see updates 2–5s late.
3. **Edge function cold starts** for `cf-calls`, `scan-card`, `help-chat` —
   first invocation after idle adds 1–3s.
4. **Stripe webhook backpressure** if checkouts spike past 25/sec — webhook
   queue grows, order updates lag.
5. **Image upload bandwidth** to storage (no current size cap on listings).

## Scaling recommendations

### Immediate (no infra change)
- Add **server-side rate limit** to chat inserts (e.g., 5 msgs / 10s / user)
  via a `before insert` trigger on `stream_messages`.
- Add **DB indexes** on hot paths if `/admin/performance` shows slow queries
  (`bids(auction_id, created_at desc)`, `stream_messages(stream_id, created_at desc)`).
- Cache `/market` and `/live` SSR responses at the edge for 10–30s for
  anonymous traffic.
- Add per-user **bid throttle** (max 1 bid / 250ms) to flatten bid-war spikes.

### When measured ceiling is hit
- **Upgrade Lovable Cloud instance size** (Backend → Advanced settings →
  Upgrade instance). This raises the connection pool, CPU, and RAM, which is
  the lever that moves items 1, 2, and 4 above.
  Docs: https://docs.lovable.dev/features/cloud#advanced-settings-upgrade-instance
- Move heavy AI calls (`identify-card`, `generate-hype-post`) to a queue
  with a worker, so bursts don't compete with user requests.
- Pre-warm `cf-calls` / streaming edge functions with a 1/min health ping.

### Long-term (if you exceed ~5k MAU)
- Split read replicas for analytics queries (the `/admin/performance`
  dashboard itself can hit the primary DB hard at high traffic).
- Move HLS distribution fully to Cloudflare Stream (already partially used)
  to remove origin egress.
- Introduce a dedicated bid-processor (small queue + single writer per
  auction) to eliminate row contention on hot auctions.

## Measured results

> Paste numbers from `reports/<date>.md` files here.

| Date | Script | Peak VUs | p95 | Error % | First failure | Notes |
|---|---|---|---|---|---|---|
| | | | | | | |
