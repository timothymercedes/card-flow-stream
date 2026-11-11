# Current work

- [ ] Verify fresh password sign-in and signup, Google/Apple completion, and passkey registration/sign-in; repair reproducible authentication issues without changing existing users' passwords.

- [x] Check hosted authentication settings, login rendering, session redirect, and published OAuth handoff. Email/Google/Apple are enabled and email confirmation is required. Fresh password login, completed social login, and passkeys remain unverified without interactive user authentication.
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