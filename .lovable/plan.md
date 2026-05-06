## Scope

Five linked changes across UX, legal, and verification gating. Big-but-focused; no schema rewrites — extend existing tables.

---

### 1. Tour Guide — "Skip for now" vs "Don't show again"

`src/components/MascotGuide.tsx` currently has one Skip button that always marks the tour as seen. Split into two intents:

- **Skip for now** (X / soft close) — closes overlay, does NOT mark seen, tour can re-trigger next session.
- **Don't show again** — closes overlay AND writes the LS flag.

Update the bottom controls: replace the single "Skip · don't show again" with two clearly-labeled buttons. Apply across every tour (the component is shared, so one fix covers all).

---

### 2. Go Live form (`src/routes/sell.tsx` + `src/routes/showoff.tsx`)

- **Split Title and Tags** into two distinct visual sections (currently grouped). Title gets its own card with helper text; Tags gets its own card with chip input + suggestions.
- **Category picker dedupe**: `StreamCategoryPicker` is being rendered/triggered in two places during the create flow. Audit `sell.tsx` and `showoff.tsx`, keep one canonical category step, remove the duplicate.

---

### 3. Verification rules — buyer vs seller/host split

**Buyers (default)** — no ID, no selfie. Just need:
- 18+ confirmation
- ToS + Community Guidelines (already enforced via `LegalGate`)
→ Can buy / chat / follow / watch.

**Sellers & Live Hosts** — full gate before Seller Hub, payouts, going live, auctions, Flex Live, collab:
- email verified
- phone verified
- selfie verification
- optional social/store links
- admin approval

Statuses on `profiles.verification_status`: `unverified | pending | approved | denied | suspended | reverify_required` (most exist; add `unverified` + `suspended` to the allowed set in `admin_set_verification_status`).

**Re-verification triggers** (do NOT spam approved sellers):
- heavy report count (threshold)
- admin manual flag (`reverify_required`)
- payout/fraud event
- suspicious activity flag

Add `requireSellerVerified` guard hook used by: `/sell`, `/showoff`, `/payouts`, host actions in `/live/$id`. Buyer surfaces stay open.

---

### 4. Separate Seller / Host Agreement

New legal document type `seller_agreement` with its own version constant.

**Migration:**
- Add `seller_agreement` to allowed values in `legal_acceptances` (already free-text — just use a new value).
- Add `profiles.seller_agreement_version`, `seller_agreement_accepted_at`, `seller_agreement_review_required`.
- New RPC `accept_seller_agreement(_version, _user_agent)` — mirrors `accept_required_legal_documents` but only for the seller doc.
- New RPC `admin_force_seller_reaccept(_target_user)` — sets `seller_agreement_review_required = true`.
- Add `SELLER_AGREEMENT_VERSION` constant in `src/lib/legal.ts`.

**New page** `src/routes/legal.seller-host-agreement.tsx` — covers:
- shipping responsibilities (3 biz days, tracking, packaging)
- prohibited items / counterfeit policy
- scam / fraud policy
- livestream conduct (no nudity, harassment, hate speech, illegal activity)
- AI moderation + recording disclosure
- payouts, chargebacks, disputes
- moderation, suspension rights
- Flex Live / collab rules

**New gate `SellerAgreementGate`** — like `LegalGate` but only blocks seller/host features for users with `seller_status='approved'` (or pending) when `seller_agreement_version` ≠ current OR `seller_agreement_review_required = true`. Mounted around `/sell`, `/showoff`, `/payouts`, host-side `/live/$id` controls. Buyers never see it.

**Hook `useSellerAgreementStatus`** — parallel to `useLegalStatus`.

---

### 5. Prohibited conduct + AI moderation disclosure

Update `src/routes/legal.community-guidelines.tsx` to add an explicit **Prohibited Conduct** section (nudity, sexual/exploitative content, inappropriate exposure, harassment, hate speech, scam/fraud, dangerous/illegal). Add an **AI Moderation & Recording Disclosure** section noting:
- livestreams are AI-moderated
- livestreams may be recorded for moderation/safety
- admins/mods may review flagged streams
- violations → stream termination, suspension, payout hold, permanent ban

Cross-link from seller agreement.

---

### 6. Admin tools

In `src/components/admin/VerificationInbox.tsx` (or sibling), add:
- column showing `seller_agreement_version` + accepted_at
- "Force re-acceptance" button → calls `admin_force_seller_reaccept`
- existing suspend/deny flows already present

---

## Technical notes

- All new RPCs `SECURITY DEFINER` + `search_path=public`.
- `SellerAgreementGate` only renders when `profile.seller_status IN ('approved','pending')` AND user is on a seller surface — so buyers are never prompted.
- Tour LS keys unchanged; only the button behavior changes.
- No breaking changes to existing `legal_acceptances` table — `seller_agreement` is just a new `document_type` value.
- Reverify triggers: lightweight — admin-driven flag now; report/fraud thresholds wired as TODO comments referencing existing `user_reports` and dispute tables, to avoid scope creep.

---

## Files

**New**
- `src/routes/legal.seller-host-agreement.tsx`
- `src/components/SellerAgreementGate.tsx`
- `src/hooks/useSellerAgreementStatus.tsx`
- `src/hooks/useSellerVerified.tsx`
- migration: seller agreement columns + RPCs

**Edited**
- `src/components/MascotGuide.tsx` — split skip buttons
- `src/lib/legal.ts` — add `SELLER_AGREEMENT_VERSION`
- `src/routes/sell.tsx` — split title/tags, dedupe category, mount verify+agreement gates
- `src/routes/showoff.tsx` — same
- `src/routes/payouts.tsx` — mount agreement gate
- `src/routes/live.$id.tsx` — host controls require agreement+verified
- `src/routes/legal.community-guidelines.tsx` — prohibited conduct + AI/recording sections
- `src/components/admin/VerificationInbox.tsx` — agreement column + force reaccept
- `src/routes/__root.tsx` — register seller-host-agreement route is auto via file-based

---

Ready to implement on approval.