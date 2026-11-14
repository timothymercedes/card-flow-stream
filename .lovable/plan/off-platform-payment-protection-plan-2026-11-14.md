# Off-Platform Payment Protection — Plan

## What already exists (reuse, don't rebuild)
- **Reports:** a Report button and admin report queue already exist (harassment, scam, spam...). No "outside payment" reason yet.
- **Admin moderation:** the existing Admin dashboard already has reports, user history, evidence review, audit log, buyer restrictions and warnings. The new section goes inside it, not in a second dashboard.
- **Chat safety check:** live chat already passes a database safety check before saving. Private messages, comments, listings and bios do not.
- **Live captions:** ElevenLabs speech-to-text already runs, but only on the viewer's screen for captions. Nothing is checked or stored on the server.
- **Local Pickup:** pickup rules exist, but there is no warning before choosing pickup.
- **Payment-word detection:** none today. Cash App, Zelle and similar words only appear in the legal pages.

## What I'll build (Phase A: text protection)
1. **One shared detector on the server:** a word list admins can edit, catching tricks like "c a s h a p p", "ca$happ", "v3nmo", "z-e-l-l-e" and $cashtags, phone numbers and outside payment links. It reads context: "I don't accept Cash App" passes, while "send me $20 on Cash App" is high risk. Every result gets a score: Low, Medium or High.
2. **Enforced where content is saved** (on the server, not just in the app):
   - private messages, live chat, comments and replies
   - Marketplace listings, PB Store and PB Bazaar product text
   - seller bios, storefront descriptions, live show titles and descriptions
3. **What happens at each level:**
   - **Low:** the user sees a private tip, and it's logged.
   - **Medium:** the content is held, the user is told, and moderators review it.
   - **High:** blocked, moderators alerted, evidence kept for 180 days.
   - **Repeat offenders:** restrictions get stricter step by step. Suspension always needs a moderator.
4. **Local Pickup warning:** must be acknowledged before pickup can be confirmed, using the five points you listed.
5. **New report reasons:** "Asked me to pay outside PullBid", "Bypass checkout", "Move to another app", "Suspicious pickup".
6. **"Payment Protection" tab in Admin:** flagged items, risk level, reason, user history, and Review / Dismiss / Warn / Remove / Restrict / Escalate. Every action records who did it and when.

## Phase B: live speech (separate approval)
- This needs the host's live audio sent through server-side transcription, plus a notice telling hosts and viewers.
- **Cost:** ElevenLabs bills per minute of audio, roughly $0.40/hour of streaming per show (estimate).
- I won't say spoken detection works until it's built and tested.
- **Overlay/video text reading:** not planned now. It needs image analysis on video frames, which is costly. I can price it separately.

## Database changes (this needs your separate approval, because the database is shared with the live site)
- New tables: payment-term list, detection events, enforcement history (only admins and moderators can see them). Plus a pickup-acknowledgement record.
- Safety checks added when messages, comments, listings, products, bios and show text are saved. Existing access rules stay the same. Seller and owner selling permissions stay the same.
- I'll test everything first in an isolated test copy, then show you the results before anything touches the live database.

## Costs
- Phase A: no outside service. Optional AI second opinion on borderline Medium cases uses Lovable AI, which costs very little per check.
- Phase B: ElevenLabs minutes (above).

## Testing
- Every payment term, misspellings and disguised spellings, and false-positive examples
- Each place it's enforced: messages, live chat, comments, listings, PB Store, PB Bazaar, bios, shows
- The pickup warning, reports, moderator actions and escalation
- Regression: checkout, seller and owner selling, and the 34 Vault cards

## Technical details
- Pure detector in `src/lib/offPlatform.ts` (normalisation + intent rules + scoring) with unit tests. The same rules are mirrored in a SQL function `public.detect_off_platform(text)`, used by BEFORE INSERT/UPDATE triggers so direct browser inserts can't bypass it.
- Admin edits through `src/lib/offPlatform.functions.ts` (`requireSupabaseAuth` + `has_role`).
- UI: `ReportDialog.tsx`, the pickup step in checkout, a new tab in `admin.tsx`, and an inline warning toast in the composers.
