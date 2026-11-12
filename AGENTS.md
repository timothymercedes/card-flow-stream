# Project rules

- Share identity-log search validation and shortcut helpers between the audit and detail pages so return navigation preserves the same fingerprint, acting-user, and time filters.
- Admin's parent route always renders Outlet and renders the dashboard only for its exact match so admin tools can display their own screens.
- Use optional search schemas for optional navigation filters so existing links need no invented search values.
- Store single-use passkey challenges in a service-only database table bound to origin, purpose, expiry, and registration owner; workers do not share memory.
- Return web OAuth to the public origin and preserve the sanitized destination separately until the auth server validates the session.
- Keep app email sends in their feature server handlers through the managed template helper; retained email tables are notification history, never send gates.
- Deduplicate terminal email history by a deterministic event ID so signed webhook retries remain safe without changing retained table schemas.
- Managed Stripe notifications use /api/public/payments/webhook with signed environment selection; sandbox notifications never mutate shared production orders.
- Checkout verification uses admin-gated embedded sandbox sessions and server-verified account ownership on the return page; never infer payment success from URL flags.
- Marketplace checkout uses embedded gateway sessions with explicit environment selection and database-derived totals; sandbox sessions omit seller transfers and never stamp production order payment fields.