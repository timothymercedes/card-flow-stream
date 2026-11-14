# Administration preview — November 14, 2026

## Delivered
- Approved PB Shield reused from the concept artwork, cropped without redrawing it; portal-only asset.
- `/admin-login`: branded personnel screen reusing the existing email, passkey, Google/Apple and recovery form. No separate account system or signup access in this screen; auth settings unchanged.
- `/admin-control`: calm read-only overview, ten URL-backed sections, mobile menu, return-to-overview and confirmed sign-out with query-cache teardown.
- Server revalidates caller identity through existing auth middleware and owner/admin roles before every overview read; queries run as the caller, not a privileged client. Moderator/support membership expansion is deferred.
- Existing admin tools retain URLs, data handlers and access checks; their AppShell now uses administration branding with Overview/public-site links. Public shopping branding remains unchanged. Route-scoped favicon restores on public navigation.
- Counts accurately name current scope: profile registrations (not confirmed members), active Bazaar stores (not all divisions), public/unexpired/non-demo active listings, non-demo public live-status rows (not verified playback). Report totals are bounded raw report counts, not unified cases. Account alerts are existing own notifications, not new registration notices.

## Verification
50 focused unit tests pass. Browser checks: guest login/no signup, guest no portal metrics/tools, actual requesting-owner session through unchanged beta gate, overview and all nine secondary sections, legacy report queue and Overview return, public logo/favicon restoration, desktop 1331×892 and phones 390×844/360×800 without horizontal overflow. Screenshots inspected; complete shield and legible layouts. No uncaught page errors.

New portal reads are covered by real owner/guest checks and pure role tests; additional non-owner signed-in accounts and live permission revocation are not browser-certified. Existing role/RLS protections remain unchanged.

## Gates retained
- No shared migrations, policy/grant changes, role assignments, permission groups or portal membership schema.
- No new registration-alert sends, administration emails/preferences, unified cases/appeals or new system controls. Email branding awaits the separately authorized event/template design.
- No finance action surface in the new portal; existing financial code unchanged. No checkout, payment, payout or supplier ordering executed or activated.
- No publishing. No inventory/account fixtures created.
- Phase 1 A01 renewal enforcement, A04 public count, A05 public Vault/media projection, A06 Garden seller constraint await separately scoped database approval. Genuine broadcast verification requires an authorized real broadcast.

Rollback: remove the two new entry routes and administration shell selection, restoring previous AppShell usage. Revert optional AuthForm presentation and local theme; retain legacy tool routes and all database/history unchanged.