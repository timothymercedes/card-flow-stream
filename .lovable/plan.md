## Phase 11 — Refinements + Account Hold System

Rolling out in the priority order you set. All UI stays consistent with PullBid Live tokens (`bg-card`, `border-border`, `text-primary`, rounded-2xl, amber/red/blue semantic colors already in `styles.css`). Mobile-first; tested at 360 / 768 / 1280.

---

### 1. Story Preview — upgrades to existing `StoryRail.tsx`
- **File-size validation** before preview opens: images ≤ 8 MB, video ≤ 50 MB. Toast on reject.
- **Drag-to-reposition** for image stories: wrap preview `<img>` in a 9:16 frame with `object-cover`, track `translate` via pointer events, clamp to bounds. Persist crop offset alongside upload.
- **Retry on upload failure**: catch upload error, keep modal open, show inline "Upload failed — Retry" button (re-runs `confirmAndUpload` without re-picking file). Up to 3 attempts then surface support link.
- **Stub for future overlays**: leave a `<StoryOverlayLayer />` placeholder slot in the preview (no-op now) so text/sticker work plugs in later without refactor.

### 2. Admin Alert Banner — `AdminAlertBanner.tsx`
- **Priority colors** driven by highest-severity open count:
  - Red (`bg-destructive/15 border-destructive/40`) — fraud flags or payment failures > 0
  - Yellow (current amber) — disputes or open reports
  - Blue (`bg-blue-500/15 border-blue-500/40`) — only verifications pending
- **Click-through routing**: replace single "Review →" with per-segment chips. Each chip links to the filtered admin tab:
  - Reports → `/admin?tab=reports&status=open`
  - Disputes → `/admin?tab=disputes&status=open`
  - Verifications → `/admin?tab=verifications&status=pending`
  - Payment/shipping → `/admin?tab=orders&filter=issues`
- **Sound toggle**: small bell icon in banner; persists `admin-alert-sound` in `localStorage`. When new alert arrives via realtime AND sound enabled, play short `/sfx/alert.mp3` (reuse `src/lib/sfx.ts`).
- **Mobile**: stack chips vertically below the message at `< sm`, keep dismiss + sound toggle in a top row. Truncate parts list to "+N more" when > 2 segments on narrow viewports.

### 3. Legal / Important Notice v1.2
- **Bump** `REQUIRED_LEGAL_VERSION` → `"1.2"` (re-prompts everyone).
- **New sections** in `legal.important-notice.tsx`:
  - §13 Host responsibility for giveaways/givys
  - §14 International customs/import taxes (expand existing §1)
  - §15 Carrier-caused shipping delays disclaimer
  - §16 Payout holds during fraud/dispute investigations
  - §17 Digital goods & mystery products — final sale rules
- **Scroll-to-bottom gate** in `LegalGate.tsx`: the Important Notice checkbox stays disabled until user scrolls the embedded notice preview to the bottom (IntersectionObserver on a sentinel div). Visual hint: "Scroll to enable ↓".
- **Audit logging**: `accept_required_legal_documents` RPC already records timestamp + version. Add admin view at `/admin?tab=legal-acceptances` reading `legal_acceptances` table (no DB change — already populated).

### 4. AI Scanner Expansion — `scan-card/index.ts` + `CardScanner.tsx`
- **Multi-signal vision prompt**: instruct model to use border style, frame layout, art style, set symbol, holo pattern, and OCR text together — not OCR alone. Extract: `detected_game`, `confidence` (0–1), `name`, `set`, `number`, `rarity`, `condition_hints` (sleeved/damaged/holo/full-art/slab), `game_specific`.
- **Sports cards**: when `detected_game === "sports"`, additionally extract `player`, `team`, `year`, `manufacturer`, `card_number`.
- **Slabs / sealed products**: detect grading slab (PSA/BGS/CGC/SGC) → return `graded: { company, grade, cert_number }`. Sealed products (booster boxes, ETBs) → `product_type: "sealed"` with set/edition.
- **Confidence display**: show colored badge in `CardScanner.tsx` (green ≥0.8, yellow 0.5–0.8, red <0.5).
- **Manual correction**: "Not the right card?" button under result opens an inline edit form (game dropdown, name, set, number) → re-runs catalog/pricing lookup with corrected fields. Reuses `ManualCardFinder.tsx`.
- **Beta gate**: keep behind existing scanner UI; no auto-listing without user confirm.

### 5. Negative Balance / Account Hold System (NEW)
**DB migration:**
- New table `account_holds` (user_id, status enum `active|cleared|admin_override`, balance_owed_cents int, reason text, source enum `refund|chargeback|failed_label|fee|manual`, opened_at, cleared_at, opened_by, cleared_by). RLS: users see own row; admins see all.
- Trigger: when `profiles.balance_cents < -2000`, auto-insert active hold (one per user max via unique partial index on `status='active'`).
- View `v_user_hold_status` joining `profiles` + active hold for fast checks.

**Server-side enforcement** (server functions):
- `requireNoActiveHold` middleware reused in: `start-live-show`, `create-listing`, `request-payout`. Returns 423 with `hold_id` + `balance_owed_cents`.
- Payout flow: when active hold exists, automatically deduct up to `balance_owed_cents` from pending payout, mark hold cleared if balance ≥ 0.
- Repeat-offender flag: if user has ≥3 cleared holds in 90 days → set `profiles.risk_flag = true` (admins notified via existing AdminAlertBanner).

**UI:**
- New `AccountHoldBanner.tsx` mounted in `AppShell.tsx` (above admin banner). Red, sticky, dismissible only by paying. Shows owed amount, reason, "Pay Balance →" button → opens Stripe Embedded Checkout (one-time `price_data` for exact owed amount, success webhook clears hold).
- Hold-aware blocks in: `SellMenu`, `sell.tsx`, `payouts.tsx`, `studio.$id.tsx` start-show button — show inline "Account on hold" with link to balance banner.
- Buy / login / support routes remain fully accessible.

**Admin:**
- `/admin?tab=holds` — list of active holds with override button (`clear_hold_admin` RPC, audit-logged), reason history, linked source events (refund/chargeback/label IDs).

---

### Files
- **edit**: `src/components/StoryRail.tsx`, `src/components/AdminAlertBanner.tsx`, `src/components/LegalGate.tsx`, `src/lib/legal.ts`, `src/routes/legal.important-notice.tsx`, `src/components/CardScanner.tsx`, `supabase/functions/scan-card/index.ts`, `src/components/AppShell.tsx`, `src/components/SellMenu.tsx`, `src/routes/sell.tsx`, `src/routes/payouts.tsx`, `src/routes/admin.tsx`, `src/lib/sfx.ts`
- **new**: `src/components/AccountHoldBanner.tsx`, `src/components/admin/HoldsAdmin.tsx`, `src/components/admin/LegalAcceptancesAdmin.tsx`, `src/lib/holds.functions.ts`, `public/sfx/alert.mp3` (placeholder)
- **migration**: `account_holds` table + trigger + view + RLS + `clear_hold_admin` RPC

### Notes
- This is a large scope. I'll execute in the priority order you specified (Story → Banner → Legal → Scanner → Holds), pausing only if a DB migration needs your approval (the holds migration will).
- Stripe payment for clearing holds reuses the existing embedded checkout pattern — no new keys needed.
- All new banners stack: AccountHoldBanner (red, blocks) → AdminAlertBanner (staff only) → header. Mobile keeps each ≤ 2 lines.
