# Internal Tutorial Mode

Adds a locked-down "tutorial mode" that lets Lovable record onboarding/explainer videos against the real Live Bid Connect UI without needing real auth, Stripe Connect, or seller approval. Safe by construction: disabled in production unless explicitly enabled by a workspace admin.

## How it activates (security model)

Tutorial mode is ON for the current browser session only when **all** of these are true:

1. The page URL contains `?tour=1` (or sets the session flag once via that URL).
2. One of the following gate signals is present:
   - `import.meta.env.DEV` is true (dev server / sandbox preview), **OR**
   - `import.meta.env.VITE_TUTORIAL_MODE_ENABLED === "true"` (build-time opt-in for the recording build), **OR**
   - The currently authenticated user has the `admin` role in `user_roles`.
3. Stored as `sessionStorage` key `pbl_tour_mode=1` (cleared on tab close, never written to `localStorage` and never set via cookie — so it cannot leak to a fresh visitor).

Production published builds default to `VITE_TUTORIAL_MODE_ENABLED` unset → flag is **inert**. A non-admin visitor who manually types `?tour=1` on `pullbidlive.com` gets nothing — the helper returns `false` and no gates change. Admins on prod can still flip it on for recording.

A small `<TutorialModeBanner />` (top of viewport, z-[300], dismissible) shows "TUTORIAL MODE — demo data, gates bypassed" whenever active, so it is impossible to use the app in tutorial mode without seeing it.

No DB migration. No new Supabase tables. No edge function. No public route changes.

## What gets bypassed (frontend only)

When `isTutorialMode()` returns true, these gates short-circuit to "allowed":

- `SellerAgreementGate` — renders children directly.
- Stripe Connect onboarding gate inside `routes/sell.tsx`, `routes/payouts.tsx`, `routes/store.tsx` seller hub, and "Go Live" entry — replaced with a fake `connected: true` state.
- Seller approval check (`profiles.seller_status !== 'approved'`) — treated as approved.
- `_authenticated` route guard — if no user, treats the session as a synthetic demo user (id `tour-demo-user`, username `demo_seller`).
- `useAuth()` returns a synthetic profile when no real session exists, so components that read `profile.is_seller` etc. work.

All bypasses are **frontend-only and read-only** — they never call `supabase.from(...).insert/update`, never call Stripe server functions, never write to the DB. Any server function still rejects unauthenticated calls; tutorial mode just unlocks the UI for screen recording.

## Demo data layer

New `src/lib/tutorialDemoData.ts` exports fixtures:

- `demoListings` (8 cards across categories)
- `demoBids` (rolling bid history)
- `demoChatMessages`
- `demoOrders` (mix of paid/shipped/delivered)
- `demoShippingTracking`
- `demoSellerAnalytics` (revenue, views, conversion)
- `demoNotifications`
- `demoLiveStream` (host + viewer POV state)
- `demoFlexLive`, `demoWheel`, `demoKO`

A `useTutorialData<T>(realData, demoData)` hook returns demo data when tutorial mode is on, real data otherwise. Pages opt in by wrapping their data hooks. We patch the highest-traffic seller/buyer/host screens listed in the request.

## Files

New:
- `src/lib/tutorialMode.ts` — `isTutorialMode()`, `enableTutorialMode()`, `disableTutorialMode()`, `useTutorialMode()` hook, `useTutorialData()` hook, synthetic demo user object.
- `src/lib/tutorialDemoData.ts` — all fixtures.
- `src/components/TutorialModeBanner.tsx` — visible banner.
- `src/components/TutorialModeBootstrap.tsx` — reads `?tour=1` from URL, validates gate signals, sets sessionStorage, mounts banner. Rendered once in `__root.tsx`.

Edited:
- `src/components/SellerAgreementGate.tsx` — bypass when tutorial mode.
- `src/hooks/useAuth.tsx` — return synthetic profile when tutorial mode + no session.
- `src/hooks/useSellerAgreementStatus.tsx` — return `needsAcceptance: false` in tutorial mode.
- `src/routes/__root.tsx` — mount `<TutorialModeBootstrap />`.
- `src/routes/_authenticated.tsx` (if present) or equivalent guard — allow synthetic user in tutorial mode.
- `src/routes/sell.tsx`, `routes/payouts.tsx`, `routes/store.tsx`, `routes/my-listings.tsx`, `routes/orders.tsx`, `routes/live.index.tsx` — Stripe Connect gates short-circuit; data hooks fall back to demo fixtures.

## Build-time guard

`tutorialMode.ts` reads `import.meta.env.DEV` and `import.meta.env.VITE_TUTORIAL_MODE_ENABLED`. The function is tree-shake friendly so when the env var is unset on prod, the bypass branches dead-code away. The synthetic demo user id (`tour-demo-user`) is not a valid uuid, so any accidental DB call with it will be rejected by Supabase RLS.

## Recorder integration

The existing Playwright recorder at `/tmp/tut/record/record-v2.mjs` will be updated to:
1. Append `?tour=1` to every navigation.
2. Skip the login flow entirely (no credentials needed for buyer/seller/host POV).
3. Re-record `welcome.mp4`, `bid-viewer.mp4`, `bid-host.mp4`, `list.mp4` against the now-unblocked UI.

That recorder change happens in a follow-up turn after this lands and you confirm the bypass works in preview.

## Out of scope

- No changes to RLS, edge functions, Stripe server functions, or webhooks.
- No new database tables.
- No public route or auth provider changes.
- Tutorial mode does not persist across tabs or survive a logout.
