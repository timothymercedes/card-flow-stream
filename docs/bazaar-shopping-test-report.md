# PB Bazaar shopping delivery — 13 November 2026

## Delivered in preview, not published
Product detail pages, gallery, descriptions/specifications, variant-specific SKU/price/compare-at price/stock, store link/verification and shipping/return policies. Separate cart persists in this browser across sessions, groups items by store, preserves selected options/quantities and rechecks public stock/prices. Unavailable products are blocked and removable; changed prices require acceptance. Checkout is disabled; no inventory reservation or order creation occurs.

## Verification
| Check | Result | Evidence |
|---|---|---|
| Saved cart parsing and option/quantity persistence | PASS | Unit tests |
| Sold-out/inactive option rejection | PASS | Unit tests |
| Stock limit includes existing cart quantity | PASS | Unit tests |
| Price-change and reduced-stock detection | PASS | Unit tests |
| Two-store grouping and corrupt storage rejection | PASS | Unit tests |
| Existing Bazaar and payment safety tests | PASS | 18 total targeted tests, including 9 new shopping tests |
| Compilation | PASS | Latest preview log: build OK |
| Real guest hub / empty cart / missing product | PASS | Actual backend returns empty inventory; no page errors |
| Real saved unavailable cart | PASS | Actual public function returned no products; blocked item displayed |
| Gallery selection / variant SKU-price / quantity / add / grouping | PASS — ISOLATED FIXTURE ONLY | Browser intercepts returned test products; no database fixtures |
| Desktop and 390px mobile layout | PASS — ISOLATED FIXTURE ONLY | Screenshots, no horizontal overflow |
| Signed-in browsing | BLOCKED | Restored session reaches existing beta access screen; no bypass performed |
| Real published product → add → reload → cart | NOT VERIFIED | Database has 0 stores/products/variants; no live fixtures authorized in this phase |
| New private media photo readback | NOT TESTED | No published product photos; existing resolver and policies unchanged |
| Physical phone photo picker | SCHEDULED, NOT TESTED | Later iPhone/Android device stage requires devices/operator |
| Cross-device cart | NOT IMPLEMENTED | Proposed account cart storage awaits review |
| Checkout, orders, supplier forwarding and payments | NOT ACTIVATED | Separate approval gates |

## Screenshots
- empty-cart.png: real signed-out state.
- unavailable-cart.png: real unavailable-item verification.
- fixture-product-desktop.png / fixture-product-mobile.png: browser-only test product, logo substituted for photography; not actual inventory or product photography.
- fixture-cart-desktop.png / fixture-cart-mobile.png: browser-only two-store test cart.

No changes to database schema/policies, Stripe, balances, payouts, auction settlement, Marketplace/PB Store records or production deployment. The preview uses the shared live backend; all populated visual tests were isolated in the browser to avoid writing production data.

Full ten-phase roadmap, proposed tables/permissions and dependencies are in bazaar-roadmap.md. Order tables and policy changes have not been executed.