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

## Revised schema — design refinement only, NOT executed
The authoritative design is [PB Bazaar revised schema review](bazaar-schema-review.md): 20 proposed tables, guest-to-account merge protocol, server validation, atomic inventory lifecycle, partial supplier/financial outcomes, complete relationship/index/permission dictionary, migration/rollback and isolated test plans. It supersedes the former 13-table sketch.

Design approval is not authorization for a shared-backend migration. Account cart/order/reservation/supplier code remains disconnected; checkout, payments, refunds, Stripe, payouts, supplier ordering and production deployment remain off. Preserve current product pages, browser cart, approval/team/media rules and separate Marketplace/PB Store inventory.

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
### CJdropshipping initial official-document evaluation
The official [authentication guide](https://developers.cjdropshipping.com/en/api/api2/api/auth.html) documents API-key token exchange, 180-day token lifetimes, 24-hour caching and a 1-call/second limit. The [token guide](https://developers.cjdropshipping.com/en/api/start/token.html) requires server-only storage. The [product synchronization guide](https://developers.cjdropshipping.com/en/api/start/Products-Synchronization-Processing.html) describes category/catalog/details/variant retrieval followed by real-time inventory checks. These establish a viable catalog adapter candidate, not an activated integration or verified order/webhook contract. No credentials or supplier requests were used; forwarding, shipping quotes, webhook signatures, restrictions and account authorization remain unverified and gated.

- Cart: variant identity survives reload; quantity cannot exceed verified stock; unavailable/depublished/suspended items blocked; changed price surfaced; two stores remain separate; no payment or order records written.
- Detail: guest/private exclusion, signed-in public view, signed photos, gallery keyboard access, selection/SKU/price/stock and mobile no overflow.
- Revised design awaits review; database execution requires separate explicit authorization and verified target/isolation. Supplier integration awaits authorized access/content and official contract verification. Orders, refunds and payments await separate approval.
- Schedule actual iPhone/Android photo-picker uploads, cancellation, large file handling and readback for a later physical-device stage; browser viewport simulation is not a phone picker test.