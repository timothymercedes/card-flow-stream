# Current work

- [x] Prepare managed email update: preserved account-email content/emerald buttons, converted daily buyer digest, retained idempotent outcome history, and removed the four legacy routes plus three infrastructure files without altering stored tables. All six auth previews and order preview return 200; unsigned requests return 401; compilation OK and 24 tests pass. No new real sends tested. Shipping, show-reminder, and push-notification fallback senders remain on their separate existing provider, unchanged. Not published.

- [x] Real signup via the form returned HTTP 200 without a session, displayed Check your email, and the signup email was logged as sent to the user's Gmail test alias. The two older failures were placeholder-domain test addresses, not a sender outage; existing account unchanged.
- [ ] Finish activation through the delivered Gmail confirmation link: awaiting the user's inbox click, then verify email_confirmed_at and sign-in. No confirmation bypass used.

- [x] Fresh password sign-in passed with a disposable confirmed account; signup submitted through the form, created a real unconfirmed account, and correctly showed the confirmation screen without a session. Test accounts were removed.
- [x] Passkey registration and full sign-in passed with Chromium's virtual authenticator; challenges now persist across workers, expire after five minutes, and are consumed once. Real Face ID/Touch ID hardware remains untested.
- [x] Google and Apple reach their real account prompts on primary, published, and preview domains. Fixed web OAuth return to the public origin and preserved the intended destination until session validation.
- [ ] Complete Google/Apple account consent and return using the user's provider session, and click a delivered signup confirmation email: blocked by unavailable provider sessions and test mailbox access. No credentials requested, no account passwords changed, and email confirmation remains enabled.

- [x] Check hosted authentication settings, login rendering, session redirect, and published OAuth handoff. Email/Google/Apple are enabled and email confirmation is required; current completion results are recorded above.
- [x] Check Cloudflare Calls session creation: provider returned 201. Cloudflare Stream inventory returned 403 authorization failure; its token-verification endpoint also reports invalid token.
- [x] Check Stripe test/live connections and go-live status: both respond and go-live is complete. App's separate legacy Stripe credential responds in live mode.
- [ ] Repair Stripe payment integration: current app uses legacy live PaymentIntents/PaymentElement, and managed webhooks target missing /api/public/payments/webhook in both preview and published app. Requires reviewed payment/security changes before transaction testing.
- [ ] Restore Cloudflare Stream access: blocked by account/token permissions; do not change Cloudflare account security without confirmation.

- [x] Finish identity action-log shortcuts and preserve filters across detail navigation; helper tests and apply/reload/clear checks pass.
- [x] Verify signed-in home, marketplace, vault, collection, wishlist, Arena, and identity audit; check mobile Arena. No crashes observed.
- [x] Apply the required package security update and confirm app health; app compilation and nine tests pass.
- [ ] Verify action-log row shortcuts with real entries: blocked by the current empty action log.
- [ ] Complete transaction, live-stream, and battle execution checks: not exercised during the page/navigation smoke checks.

Observed: audit reports one invalid language (`auto`) and zero duplicate groups; marketplace currently has zero active listings. No destructive data repairs or payment operations were performed.