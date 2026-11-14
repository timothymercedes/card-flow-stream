# PB Bazaar — Supplier Integration Readiness Report

Status: inspection only. No code, database, supplier, payment or deployment changes were made.

## 1. What PB Bazaar already has
- Store registry with three store types (independent / brand / pb_owned), application wizard, admin approval, team roles.
- Products and variants (SKU, price, stock), private media with server-verified public signing.
- Unified catalog hub, storefronts, product detail pages, browser-local multi-store cart (checkout disabled).
- Reviewed design (not built) for account carts, parent orders, store suborders, fulfillments, shipments, cancel/return requests, reservations, supplier links/events/commands (docs/bazaar-schema-review.md).

## 2. What is missing
- Supplier registry with the seven required statuses, connector framework, sync jobs and error/retry tracking.
- Product source tracking on catalog items (supplier, external IDs, last sync).
- Supplier Management admin dashboard and imported-product approval queue.
- Catalog filter by source is intentionally not customer-facing (one unified catalog).
- All order, fulfillment, shipment and payment tables.

## 3. Reusable tables
bazaar_stores (supplier products live in a PB-owned or brand store), bazaar_products, bazaar_product_variants, bazaar_store_members, bazaar-media storage, user_roles / is_bazaar_admin.

## 4. New tables needed
Phase S1 (safe, no customer data): bazaar_suppliers, bazaar_supplier_product_links, bazaar_supplier_sync_jobs, bazaar_supplier_events (admin/service only, no anonymous access, credentials stored as server secrets, never in rows).
Later (already designed, separately gated): carts, customer/store orders, order items, fulfillments, shipments, order requests, reservations, supplier commands, order events.

## 5. Buildable now without supplier approval
- Supplier registry seeded with real statuses: Wish = Application Pending; Temu, SHEIN, AliExpress = Not Connected.
- Connector interface (auth, import, normalize, price/stock sync, order, tracking, cancel/return) with every method returning "not authorized".
- Normalization + sync engine, idempotent upserts, discontinued detection, retry/backoff, tested against clearly labeled demonstration fixtures that never appear in the public catalog.
- Admin dashboard with all listed metrics and controls (connect/sync buttons disabled until authorized).

## 6. Requires real API authorization / agreements
Credentials and token refresh, live product import, live price/stock sync, order submission, order-status/tracking webhooks, cancellations/returns, scheduled sync against a real API. Notes: AliExpress offers official developer/dropshipping APIs; Temu and SHEIN only provide partner/seller programs by invitation; Wish requires the pending API Partner approval.

## 7. Risks to existing PullBid Live
- Shared preview/live database: every migration is immediately live. S1 is additive only.
- Supplier products must not leak into Marketplace or PB Store (separate tables already enforce this).
- Price/stock drift and overselling once real sync begins — mitigated by reservation design before checkout.
- Supplier terms may forbid resale display or cost exposure; costs stay admin-only.
- Payments/checkout untouched until separate approval.

## Proposed Phase S1 (awaiting approval)
Additive migration for the four supplier tables + admin-only policies; connector framework with demo fixtures; /admin/bazaar/suppliers dashboard; unit tests for normalization, idempotency, status rules. Rollback: drop the four new tables (nothing else depends on them).
