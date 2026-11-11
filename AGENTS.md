# Project rules

- Share identity-log search validation and shortcut helpers between the audit and detail pages so return navigation preserves the same fingerprint, acting-user, and time filters.
- Admin's parent route always renders Outlet and renders the dashboard only for its exact match so admin tools can display their own screens.
- Use optional search schemas for optional navigation filters so existing links need no invented search values.
- Store single-use passkey challenges in a service-only database table bound to origin, purpose, expiry, and registration owner; workers do not share memory.
- Return web OAuth to the public origin and preserve the sanitized destination separately until the auth server validates the session.