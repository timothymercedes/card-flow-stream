# PB Bazaar Supplier Phase S1 — Final Design for Approval

Nothing below is built yet. Approving this plan authorizes only the additive database changes and admin screens described here. Checkout, payments, live supplier connections and publishing stay off.

## Your five decisions (locked in)
1. **One store:** every imported product lives in an internal store called "PB Bazaar Direct" and appears in the normal Bazaar catalog. Shoppers never see supplier names, costs or IDs.
2. **Approval:** an admin approves each product one at a time. Auto-approval rules can be saved but cannot be switched on.
3. **Pricing:** automatic price = supplier cost + percentage and/or fixed markup, with a minimum profit floor that counts shipping, payment fees and other costs. Admins can override any price. Prices are recalculated when the supplier cost changes.
4. **Stock:** zero stock shows **SOLD OUT** and comes back automatically when stock is confirmed. Discontinued items show as unavailable, and admins can delete them. Sales are blocked when stock can't be verified or the last sync is too old.
5. **Shipping:** each supplier has its own delivery window, shown on product pages (and at checkout later). One order may ship in several packages with separate tracking.

## Database (all new tables; admin/service only, no shopper access)
- **bazaar_suppliers**: name, kind (aliexpress/wish/temu/shein/manual/demo), status (not_connected, application_pending, approved, connected, paused, error, demo), delivery window min/max days, stale-sync limit in hours, and a `is_demo` flag. Wish is seeded as Application Pending. Credentials are never stored here; they stay in server secrets.
- **bazaar_pricing_rules**: percentage markup, fixed markup, minimum profit (amount and %), estimated shipping cost, fee % + fixed fee, other costs, rounding. There is one default rule, and a supplier or a product can have its own rule.
- **bazaar_supplier_product_links**: links a Bazaar product/option to the supplier's item and SKU, plus supplier cost, currency, supplier stock, last synced time, sync status (ok/stale/unverified/discontinued), review status (pending/approved/rejected), price override, computed price and margin.
- **bazaar_supplier_sync_jobs**: a history of imports and syncs, with counts and errors.
- **bazaar_supplier_events**: an append-only log of cost, stock and status changes.
- **bazaar_auto_approval_rules**: saved conditions with `enabled` locked to false by a database check until a future approval.

## Changes to existing Bazaar (need your approval because shoppers see them)
- **Show SOLD OUT instead of hiding options:** today, options with zero stock are hidden. A new shopper-safe view will return the option with an `available` flag and a reason (`sold_out`, `unavailable`, `unverified`). Quantities, costs and suppliers are never included.
- **Show a delivery window on product pages:** a generic line such as "Estimated delivery: 7–14 days" with no supplier name.
- **Block add-to-cart** for any option that is sold out, unavailable or not verified. The cart re-check uses the same flags.
- Regular merchant stores work as they do today, with no supplier rows and no change in behavior.

## Admin screens (Admin → Bazaar)
- **Suppliers tab:** list, status badges, delivery windows, sync limits and a clear DEMO label. There is no "connect" button for unapproved suppliers.
- **Imports tab:** review queue showing cost, calculated price, margin and a warning when the profit floor isn't met. Actions: approve, reject, override price, mark discontinued and delete permanently.
- **Pricing tab:** default rule, rules per supplier, and a live profit preview.
- **Sync history:** jobs and events.
- Demo data can only be loaded into a supplier marked DEMO, and products from it are labeled and never published.

## Migration plan
1. One additive migration: new tables, grants (admin and service only), RLS, a shopper-safe availability function, the pricing-calculation function, and the "PB Bazaar Direct" store row and Wish supplier row created only if they don't already exist.
2. Update the shopper projection and the product and cart pages to use the availability flags.
3. Admin screens.
No existing table is dropped or renamed. **Rollback:** remove the new tables and functions, then restore the previous projection. Bazaar currently has no live stores or products, so nothing customer-facing is lost.

## Testing plan
- Unit tests: pricing math (percentage, fixed, combined, profit floor, override, recalculation), the stale-sync block, and SOLD OUT/restore/discontinued states.
- Database checks using temporary accounts: a shopper or merchant cannot read supplier tables, costs or IDs, and auto-approval cannot be enabled.
- Browser checks: product page shows SOLD OUT and the delivery window, add-to-cart is blocked, and the admin tabs work. All temporary data is removed afterward.
- Regression: existing Bazaar, Marketplace and PB Store tests still pass.

## Still off
Checkout, payments, Stripe, payouts, live supplier APIs, automatic publishing and placing orders with suppliers.

## Technical notes
The shared database serves both preview and the live site, so the migration takes effect immediately. That is safe because every change only adds new tables and functions. The `bazaar_product_variants` quantity>0 SELECT policy stays in place; shopper availability comes from a SECURITY DEFINER projection instead.
