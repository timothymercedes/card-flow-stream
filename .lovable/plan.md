# Live System Stabilization — Phase 3.3

Big scope, so I'm grouping it into 5 workstreams. I'll execute them in order in one go unless you want to split.

## 1. Auto-end ghost streams (host inactivity)

Today: `useLivestreamSafety` already polls `apply_live_stream_safety` every 60s and surfaces `inactiveWarning` / `autoEndDue`. But the warning toast/modal isn't wired, and the auto-end RPC doesn't actually flip `status='ended'` reliably.

Fix:
- DB: harden `apply_live_stream_safety(_stream_id)` → if `now() - last_activity_at > tier.inactive_auto_end_minutes` AND no `host_active_confirmed_at` in the last `inactive_warning_minutes`, set `status='ended'`, `ended_at=now()`, `end_reason='inactivity_auto_end'`. Cancel any in-flight auction round.
- DB: new `pg_cron` job every 2 min calling a `sweep_inactive_streams()` function so it works even when the host's tab is closed.
- UI: new `HostInactivityCheckModal` — appears at `inactiveWarning`, big "I'm still here" button → calls `confirm_live_stream_active`. 5-min countdown. If ignored → stream auto-ends + buyers see "Stream ended by host inactivity" banner.

## 2. Shipping price sync (host → viewer → auction → checkout)

Today: host can set `shipping_price` + `shipping_method` + `shipping_service_tier`, debounced auto-save works, but the auction round inherits `shipping_amount` from a stale snapshot, and viewer's "Est. total" pulls from `live_streams` instead of the live `auction_rounds` row.

Fix:
- DB: `start_auction_round()` and `quickStartAuction` patch — always snapshot `shipping_price`, `shipping_method`, `shipping_service_tier` from `live_streams` at round start. `finalize_auction_round` uses the round's snapshot (not the stream's current value) so mid-round shipping changes don't change a buyer's invoice.
- UI: single `useStreamShipping(streamId)` hook → returns `{ price, tier, label, capRemaining }`. Replace 3 hard-coded shipping reads in `live.$id.tsx`, `BuyerOrderPopover`, and `StripeCheckout`.
- Buyer UI: shipping chip now reads from the live `auction_rounds.shipping_amount` while a round is active, else from `live_streams`. Always visible — never "Free shipping" unless the $7 USA cap actually triggered. Show "🇺🇸 $X.XX of $7 cap used" beneath.

## 3. Guest browsing (remove forced auth)

Audit shows several public-intent routes throw to `/login` during SSR. Fix list:
- `/live/$id`, `/live` (index), `/market`, `/market/$id`, `/seller/$username`, `/discover`, `/shows`, `/shows/$id`, `/showoff`, `/stories`, `/feed` (read-only mode), `/` → public.
- Replace loader-level `requireSupabaseAuth` calls with public `createServerFn` variants that use `supabaseAdmin` + explicit safe-column projection.
- Components gate **actions** (bid, buy, chat, follow, message, sell, bookmark, tip) through the existing `useAuthGate` modal. Guest can watch a livestream, hear audio, see chat, see auction state — but tapping any action opens `AuthGateModal`.
- Chat: guests see messages, input is replaced with "Sign in to chat" button.

## 4. Dashboard rebuild (`LiveSellerDashboard`)

Today's dashboard mixes mocked data and real RPCs, and the chip filter is broken ("Watching 1 · No watchers in this slice"). Full rebuild:

**Tabs:**
- **Watchers** — `useStreamPresence` viewers, virtualized list. Row → `UserActionsMenu` (mute/timeout/block/promote-to-mod/open profile).
- **Buyers** — distinct buyers with `payment_status='paid'` for this stream. Row → `BuyerOrderPopover` (already exists).
- **Pending** — orders in `awaiting_payment / processing / failed` for this stream. Realtime flip to ✅ Paid when buyer fixes card.
- **Winners** — `auction_rounds` where `status='settled'`, ordered desc. Tap → order popover.
- **Mods** — list of `stream_moderators`. Add: search user → invite. Remove: trash icon. Realtime.
- **Activity** — unified feed from `stream_events` (joins/leaves), `bids`, `orders`, `follows`, `stream_shares`, `stream_bookmarks`, `moderation_actions`, `giveaway_events`. Single realtime channel `dash-${streamId}`.

**Stats strip (top, sticky):** Gross sales (sum paid orders), Orders (count), Shares, Bookmarks, Tips, Watchers (live presence count). All driven by a single `useLiveDashboardStats(streamId)` hook subscribed to relevant tables.

**Moderation workflows:**
- New table `stream_moderation_actions (id, stream_id, target_user_id, mod_user_id, action enum[mute|timeout|block|unmute|unblock], duration_sec, reason, created_at)`.
- RPC `apply_stream_moderation(stream_id, target, action, duration)` — RLS: only host or active mod.
- Chat respects active mute/timeout/block (existing `chat_messages` insert policy gets a `NOT EXISTS active_block` check).

**Layout fixes:** ScrollArea with `min-h-0` on flex parent (the current bug), sticky tab bar, mobile-first 100dvh on `/live` so dashboard doesn't overflow the viewport on the 762×672 you're testing in.

## 5. Cleanup / dead UI

- Remove placeholder chips on dashboard with no handler.
- Remove the "No watchers in this slice" branch when count > 0 (was a stale filter).
- Audit empty states: every tab gets a real empty state with a CTA.

## Out of scope this turn
- Full mod role hierarchy (head mod vs mod) — single `mod` role only.
- Replacing Cloudflare presence with a custom WebSocket — staying on `useStreamPresence`.
- Stripe Connect payout flow changes.
- Email/push notifications for moderation actions.

## Order of work
1. DB migration (auto-end + cron, moderation table, round shipping snapshot)
2. Public route audit + guest gate refactor
3. Shipping sync hook + UI rewires
4. Dashboard rebuild (tabs, stats, mod actions, activity feed)
5. Inactivity modal + polish pass

Likely ~12–15 file edits + 1 migration + 1 cron job. I'll batch aggressively.

**Want me to ship all 5 in this turn, or split (e.g. 1+3+5 stability first, 2+4 rebuild second)?**