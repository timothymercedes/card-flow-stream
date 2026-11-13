# PB Bazaar development roadmap and review proposal

## Scope and safety
Product pages and a separate multi-store cart are approved for preview. No publishing, checkout, payments, supplier calls, production data fixtures, policy changes or order table creation are part of this implementation. Preview shares the live database: even an additive migration would immediately affect production, so all proposed tables below are review-only.

## Existing foundation
Completed: store applications, admin approval, merchant catalog, stock and variant editing, team permissions, private photo storage, public approved storefronts. The previous 68-check report covers foundation access; it does not cover future checkout or device photo pickers.

## Approved shopping delivery
- Product detail with private-media resolver, image gallery, specifications, available variant selection, SKU, price, compare-at price, quantity, store link and policies.
- Separate cart grouped by store; save only product/variant identifiers, quantities and last-seen prices. Re-read public availability and prices on opening, focus and before adding. Changed prices require acceptance; unavailable rows remain removable. Adding does not reserve inventory.
- Browser-local persistence across visits and browser sessions only. Cross-device/account persistence requires the reviewed cart tables below; no existing Marketplace cart records are reused.
- Shipping shows each store's actual policy and processing days, not fabricated rates or delivery dates. Supplier estimates await authorized supplier mappings.
- Recently viewed/saved items, follows, comparisons, alerts and Q&A are subsequent customer-experience work, not silently bundled into this delivery.

## Proposed schema — NOT executed
All IDs UUID; user IDs plain UUID, not foreign keys to managed auth. Money is integer cents with explicit currency. New tables use explicit grants followed by RLS and narrow policies.

| Table | Key fields and relationships | Permission proposal |
|---|---|---|
| bazaar_carts | id, customer_id, currency, updated_at; one open cart/customer/currency | Customer reads/writes own cart; no merchant/guest access |
| bazaar_cart_items | cart_id, product_id, variant_id, quantity; unique cart/variant | Customer owns parent cart; validate published product, active store and positive stock; do not trust stored totals |
| bazaar_customer_orders | id, customer_id, currency, lifecycle, immutable totals/address snapshots, idempotency_key | Customer reads own; trusted order service writes; no direct client settlement |
| bazaar_store_orders | parent_order_id, store_id, lifecycle, shipping snapshots, store totals | Customer reads via own parent; owning store and fulfillment staff read their portion only |
| bazaar_order_items | store_order_id, product_id, variant_id, immutable SKU/options/price snapshots, quantity | Same parent/store scope; no merchant access to other stores' lines |
| bazaar_suppliers | provider_key, approved status, non-secret config | Platform admin only; credentials stored server-side outside table |
| bazaar_supplier_product_links | supplier_id, product_id/variant_id, external IDs, cost currency, last_sync | Platform admin/service only; supplier costs never public |
| bazaar_fulfillments | store_order_id, supplier_id nullable, origin type, status, external_order_id | Customer reads safe tracking projection; relevant store fulfillment staff read only own |
| bazaar_fulfillment_items | fulfillment_id, order_item_id, quantity | Service writes; validate same store and total quantities against purchased amount |
| bazaar_shipments | fulfillment_id, carrier, tracking, status, delivered_at | Safe customer/store read; authenticated signed webhook service writes |
| bazaar_order_requests | order_item_id, customer_id, type(cancel/return), quantity, status | Customer creates own requests; relevant store reviews, service enforces workflow |
| bazaar_inventory_reservations | variant_id, order_item_id, quantity, expires_at, status | Service only; atomic row locks prevent overselling when checkout is separately approved |
| bazaar_supplier_events | supplier_id, unique event_key, payload hash, status, retries | Admin/service only; webhook idempotency and redacted audit history |

Authenticated grants limited to operations allowed by each policy; service grants only for required operations. Anonymous users receive no cart/order/supplier access. Merchant permissions are derived from existing store membership, never client claims. Order totals, ownership and supplier assignments are validated server-side. Customers receive public tracking DTOs, not supplier credentials, costs or other customers' addresses.

## Ten-phase sequence
1. Shopping: current approved detail/gallery/variants; later search refinements, saved/recent items, follows, comparison, notifications and moderated Q&A. Propose owner-only preference tables and public moderated Q&A before implementation.
2. Cart: current local cart; review account cart and parent/store order schema. Do not enable checkout.
3. Supplier Center: evaluate CJdropshipping official API; adapter contract for authentication, catalog, inventory, quotes, order submission, tracking and events. Requires approved account/API access, content-use authorization, destination/shipping restrictions and rate-limit/retry validation. Stage imports for admin review; do not scrape.
4. Customer orders: enable read-only history/tracking after separately reviewed order creation; partial shipments and cancellation/return requests.
5. Marketing: real activity-based discovery, followers, announcements, collections and approved coupons; label sponsored placements. No synthetic sales/reviews/discounts.
6. Trust: verified-purchase review eligibility from immutable fulfilled order lines, photos, moderation, reports and seller replies.
7. Creator program: approved applications, referral attribution and separately reviewed commission ledger; no payment changes implied.
8. Analytics: deduplicated product views, real order conversion and merchant-scoped reporting; platform reports admin only.
9. Shipping/support: authorized rate providers, signed tracking events, partial returns, loss/damage workflows and scoped support records.
10. Administration: suppliers/import staging, moderation, promotions, disputes, reviews and operational alerts.

## Release gates and tests
- Cart: variant identity survives reload; quantity cannot exceed verified stock; unavailable/depublished/suspended items blocked; changed price surfaced; two stores remain separate; no payment or order records written.
- Detail: guest/private exclusion, signed-in public view, signed photos, gallery keyboard access, selection/SKU/price/stock and mobile no overflow.
- Schema implementation awaits user review. Supplier integration awaits credentials, authorized content and official contract verification. Orders, refunds and payments await separate approval.
- Schedule actual iPhone/Android photo-picker uploads, cancellation, large file handling and readback for a later physical-device stage; browser viewport simulation is not a phone picker test.