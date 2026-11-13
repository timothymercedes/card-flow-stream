# PB Bazaar next-stage schema review

Product pages and the browser-persistent multi-store cart are implemented in preview. No payments, order tables, policy changes or publishing occurred. The current cart is saved on this browser, not across devices.

## Verification and remaining limits
18 targeted tests and compilation passed. Actual guest empty/unavailable-product checks passed. Gallery, option selection, add-to-cart, grouping and mobile layout passed with isolated browser-only fixtures—not live product data. Real populated shopping remains unverified because Bazaar has no approved products; signed-in testing reaches the beta gate. Physical phone photo-picker testing is scheduled for the later device stage.

## Proposed next approval boundary
Review the following design only. **Approving this plan is not approval to run a shared-production migration.** The backend is shared with the live site; an isolated database environment or explicit shared-backend authorization is required before execution. No payment activation is included.

### Technical schema and permissions proposal
| New storage | Relationships and purpose | Allowed access |
|---|---|---|
| Account carts + cart items | customer → cart → product/variant, quantity; unique cart/variant | Signed-in customer owns own cart; no guest/merchant access |
| Parent customer orders | customer, currency, immutable totals/address snapshots, unique request key | Customer reads own; authorized service writes |
| Store orders + order items | parent → store order → immutable product/SKU/options/price/quantity | Customer via parent; store owner/admin/fulfillment sees their store portion only |
| Approved suppliers + product mappings | supplier → product/variant external identifiers and private costs | Platform admin/service only; credentials stored separately server-side |
| Fulfillments + allocations | store order → supplier/original store origin; allocations link purchased lines | Service writes; customer safe projection; relevant store fulfillment staff |
| Shipments | fulfillment → carrier/tracking/status | Scoped safe read; signed verified service updates |
| Cancellation/return requests | customer → purchased line, requested quantity and workflow | Customer own requests; relevant store review; service enforces state |
| Inventory reservations | variant → order item, quantity/expiry/status | Service only; future atomic stock locking, not current cart reservation |
| Supplier event history | provider event key, payload hash, retries/status | Admin/service only; idempotent processing and redacted logs |

Every public table needs explicit grants followed by RLS. User IDs remain plain UUIDs. No client-controlled totals, roles or supplier assignment. No anonymous order reads, supplier costs or cross-store buyer details. Preserve current approval, team and media rules unchanged.

## Broader roadmap
1. Finish customer shopping enhancements: saved/recent products, follows, comparison, stock/price alerts, moderated Q&A after storage review.
2. Account cart and reviewed parent/store order architecture; checkout stays off.
3. Supplier Center using official authorized adapters, starting with CJdropshipping evaluation.
4. Customer history, partial tracking, cancellation and return requests.
5. Real-activity store discovery, labeled promotions, collections and coupons.
6. Verified-purchase reviews, reporting and moderation.
7. Creator/referral program with separately reviewed commission accounting.
8. Merchant-scoped analytics and admin platform/supplier reporting.
9. Shipping, loss/damage, returns and support workflows.
10. Expanded administration for imports, moderation, disputes and operational alerts.

## Supplier dependencies and risks
CJ official documentation describes API-key token exchange, server-only token storage, catalog/details/variants and real-time inventory. Requires approved account/access, authorized content, destination shipping quotes and verification of current rate limits, order behavior and webhook authenticity. No supplier connection or API action has occurred. Never scrape retailer content. Adapter design isolates authentication, import staging, stock/price sync, quotes, forwarding, tracking and retry handling.

## Required tests before any order release
Customer/store isolation; service-only transitions; atomic inventory reservation; idempotent order creation and events; partial allocation limits; cancellation/return/refund consistency; suspended/unpublished exclusion; protected costs/addresses; live/test separation. Payment integration and production release require independent approval.

The full audit, schema and ten-phase roadmap are included in the accompanying roadmap document; screenshots and an evidence-labeled test report are supplied separately.