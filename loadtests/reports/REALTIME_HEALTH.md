# Realtime / WebSocket Health Report

_Generated after the realtime hardening pass — May 2026._

## Diagnosis

| Symptom | Root cause | Status |
|---|---|---|
| `devserver_websocket_error`, `WebSocket connection failed` | Vite HMR socket dropping on tab sleep / preview reloads. Not the Supabase realtime socket. Cosmetic in preview, absent in production. | Documented — ignored in production builds |
| Realtime channels going silent after sleep / poor network | Each component called `supabase.channel(...).subscribe()` with no reconnect path. Once the socket closed, it never came back. | Fixed via `useRealtimeChannel` (auto-reconnect + exp. backoff) |
| Duplicate channels on hot-reload / re-render | Effect cleanup ran but a second subscribe could race. | Fixed — registry de-dupes by topic, removes prior channel before reconnect |
| Missing user feedback when offline | No status indicator. | Fixed — `<RealtimeStatusBadge />` mounted at root |
| React `controlled/uncontrolled` warnings | Audit found no nullable initial values; all inputs initialise with `""`/numbers. | Verified clean |

## What changed

- **New** `src/lib/realtime.ts` — `useRealtimeChannel(opts, setup)` hook.
  - Exponential backoff: 0.5s → 1s → 2s → 4s … capped at 30s, with jitter.
  - Listens to `online`/`offline`/`visibilitychange` to flip global status.
  - Records every (re)connect into `perf_metrics` (kind `ws`) and every error into `error_logs` for the perf dashboard.
  - De-dupes by channel topic so a hot-reload or React StrictMode double-mount can't leak.
- **New** `src/components/RealtimeStatusBadge.tsx` — pill that shows `Reconnecting…` / `Offline — reconnecting…` after a 2-second debounce. Hidden when healthy.
- **Migrated** to the new hook (auto-reconnect now applies to):
  - `NotificationBell` — notifications stream
  - `AppShell` — cart count
  - `useStreamPresence` — viewer count + presence
- **Console-safe**: every realtime error path goes through `recordError` (server-batched), never `console.error`. Production users see only the recovery pill.

## Routes that need migration next (still using raw `supabase.channel`)

These continue to work (they always did when fresh), but won't auto-recover from a dropped socket until migrated. Follow the same pattern used in `NotificationBell.tsx`:

- `src/routes/live.$id.tsx` (live bidding + chat)
- `src/routes/messages.index.tsx`, `src/routes/messages.$userId.tsx`
- `src/routes/feed.tsx`
- `src/components/LiveGiveaway.tsx`, `ViewerListModal.tsx`, `ViewerGiveawayJoin.tsx`, `GiveawayChip.tsx`
- `src/components/CollabPanel.tsx`, `KOModal.tsx`, `FlexLiveControls.tsx`, `HostPaymentLog.tsx`
- `src/components/StoryRail.tsx`, `AdminAlertBadge.tsx`
- `src/components/admin/VerificationInbox.tsx`, `admin/SupportInbox.tsx`
- `src/routes/admin.tsx`, `src/routes/index.tsx`, `src/routes/live.index.tsx`
- `src/components/HelpBubble.tsx`

(Drop-in: replace `supabase.channel(name).on(...).subscribe()` + the cleanup `removeChannel` with `useRealtimeChannel({ name, enabled }, ch => ch.on(...))`.)

## Reconnect behaviour by scenario

| Scenario | Behaviour |
|---|---|
| Tab refresh | New connection on mount, badge hidden. |
| Tab switch back after sleep | `visibilitychange` triggers status check; if socket was closed, hook reconnects automatically. |
| Wi-Fi drop → reconnect | `offline` event flips status to `Disconnected`. On `online`, channels reconnect with backoff; first attempt within 500ms. |
| Server restart | Channel emits `CLOSED`/`CHANNEL_ERROR`; hook retries with backoff up to 30s. |
| Repeated failure | Each retry recorded in `perf_metrics` so `/admin/performance` shows reconnect rate and latency. |

## Live measurements (populate after running k6)

| Metric | How to read |
|---|---|
| **Failed websocket routes** | `/admin/performance` → filter `kind = ws`, `status_code = 500`. |
| **Reconnect success rate** | `(ws metrics with status 200) / (total ws metrics)` over the chosen window. |
| **Realtime latency** | p50/p95 of `ws` `duration_ms` (subscribe completion time). |
| **Duplicate subscriptions** | Should be 0 — registry guards against it. If you see two metrics for the same `route` within milliseconds, file a bug. |
| **Memory leaks** | Channel count: open DevTools → Performance → take heap snapshot. With the hook, channel count resets to baseline on unmount. |
| **Slow queries** | `/admin/performance` → "Slowest routes" panel. |
| **Frontend crash points** | `error_logs` table (admin dashboard tab). All realtime errors land here under `kind: ws_disconnect`. |

## Combined load test — bidding + chat + notifications

Run all three together to validate fanout:

```bash
k6 cloud run -e AUCTION_ID=<id> loadtests/k6/03-bidwar-1000.js &
k6 cloud run -e STREAM_ID=<id> loadtests/k6/05-chat-spam.js &
wait
```

Watch `/admin/performance` for:
- `ws` p95 climbing past 2 s → realtime fanout pressure (start migrating remaining channels above)
- error rate climbing on `realtime:*` routes → DB CPU (see CAPACITY.md scaling section)
