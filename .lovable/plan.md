## Plan: 4 Platform Updates

### 1. Global Admin Alert Banner
- Create `src/components/AdminAlertBanner.tsx` — a sticky top-of-page banner (separate from the existing small `AdminAlertBadge` icon) that:
  - Polls/realtime-subscribes to: `user_reports` (status=open), `disputes` (open/investigating), `profiles` (verification pending/reverify), `orders` (shipping issues — `delivery_status` problem states), and any payment-failure flags already on `orders`/`payouts`.
  - Shows breakdown counts ("3 reports • 2 disputes • 1 verification") with a "Review now →" CTA linking to `/admin`.
  - Only renders for staff (admin/owner/moderator/support roles, reusing the role check in `AdminAlertBadge`).
  - Dismissible per-session but reappears on new alerts; stays sticky on `/admin*` routes until count = 0.
- Mount in `AppShell.tsx` above the header (below any existing banners).

### 2. Story Upload Preview
- Update `src/routes/stories.tsx` upload flow to add a preview step:
  - After file select → show full-size preview (`<img>` for images, `<video controls>` for video) in a modal.
  - Buttons: **Remove**, **Change media** (re-opens picker), **Post**.
  - Object-fit preview matching the story aspect ratio (9:16) with letterboxing.
  - Upload progress spinner overlay during the actual upload, with disabled buttons.
  - Locate current upload handler and split into `selectMedia` → `confirmAndUpload`.

### 3. AI Scanner Multi-TCG Expansion
- The catalog/pricing registry already supports MTG, Yu-Gi-Oh, One Piece, Lorcana, DBS, SWU, FAB, Sports (`supabase/functions/_shared/cards/games.ts`). The gap is in the **scanner** edge function (`supabase/functions/scan-card/index.ts`) and `identify-card`, which hard-code Pokémon.
- Update `scan-card/index.ts`:
  - Add a game-detection step: ask the vision model to first classify the card's game from a fixed list (Pokémon, MTG, Yu-Gi-Oh, One Piece, Lorcana, DBS Fusion, SWU, Flesh and Blood, Sports card, Other).
  - Pass the detected game into `resolveGame()` and route catalog/pricing through the existing adapter chain.
  - Improved OCR prompt: extract `name`, `set_code`, `collector_number`, `rarity`, plus game-specific fields (mana cost for MTG, attribute/level for YGO, etc.) — kept optional.
  - Return `detected_game` in the response so the UI can show it.
- Update `src/components/CardScanner.tsx` to display the detected game badge and pass it through to downstream pricing/listing flows.

### 4. Platform Agreement / Important Notice (v1.1)
- Bump `REQUIRED_LEGAL_VERSION` in `src/lib/legal.ts` from `"1.0"` → `"1.1"` so every existing user is re-prompted via the existing `LegalGate` flow.
- Expand `LegalGate.tsx` content to a scrollable "Important Notice" section listing the requested topics (intl shipping & customs, platform/processing fees, seller responsibilities, buyer protection, refund/dispute, prohibited items, chargeback abuse, shipping deadlines, auction rules, digital-item disclaimer, suspension reasons), with the existing 3 checkboxes (age/ToS+Privacy/Guidelines) plus a new **"I've read the Important Notice"** checkbox.
- Add a corresponding bullet block to `src/routes/legal.tos.tsx` (or a new `/legal/important-notice` route) so the linked detail page exists.
- Signup flow already routes through `LegalGate` for new accounts → no separate signup change needed; just version bump triggers re-acceptance for everyone.

### Technical notes
- No new DB tables needed — all four features reuse existing tables (`user_reports`, `disputes`, `profiles`, `orders`, `legal_acceptances` via `accept_required_legal_documents` RPC).
- Realtime: AdminAlertBanner reuses `useRealtimeChannel` like the existing badge.
- Scanner: keep the Pokémon-specific logic as the default fallback so existing behavior is preserved if game detection is uncertain.
- Legal version bump will force every active user to see the new modal once on next page load — no migration needed.

### Files touched
- new: `src/components/AdminAlertBanner.tsx`, `src/routes/legal.important-notice.tsx`
- edit: `src/components/AppShell.tsx`, `src/routes/stories.tsx`, `src/components/LegalGate.tsx`, `src/lib/legal.ts`, `src/routes/legal.tos.tsx`, `src/components/CardScanner.tsx`, `supabase/functions/scan-card/index.ts`
