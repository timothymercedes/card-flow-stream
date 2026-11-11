# Project rules

- Share identity-log search validation and shortcut helpers between the audit and detail pages so return navigation preserves the same fingerprint, acting-user, and time filters.
- Admin's parent route always renders Outlet and renders the dashboard only for its exact match so admin tools can display their own screens.
- Use optional search schemas for optional navigation filters so existing links need no invented search values.