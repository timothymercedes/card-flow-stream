# Multi-category business description and compliance — review only

## Proposed Stripe business description

PullBid Live operates a multi-category online marketplace connecting independent sellers and buyers through fixed-price listings and live/automatic auctions. Categories include automotive and vehicles; tools and construction equipment; electronics and computers; trading cards and collectibles; fashion and sneakers; furniture and home goods; sports and outdoor equipment; and business and industrial equipment. Buyers pay the platform through Stripe Checkout; automatic auction winners may be charged their authorized saved payment method. Sellers complete Stripe-hosted Connect onboarding. The proposed future funds flow uses platform-owned charges and separate, delayed seller transfers after verified fulfillment and eligibility. Platform commissions, seller liabilities, taxes, expenses and reserves are recorded separately. The platform is responsible for payment fees, refund/dispute handling and marketplace compliance. Reserve and category-specific terms are pending Stripe review; this is not an escrow service.

This description is proposed only; no Stripe business profile/settings changed. Do not invent projected volume, average/max ticket, dealer licenses or operating countries: supply actual values during underwriting. Existing verified platform is US; initial US/USD testing is a proposal, not a restriction on the user's long-term international goal.

## Category and payment-method matrix

No blanket claim that all eight categories require special approval or are already approved. Stripe's restricted list is representative, country-dependent and product-specific; account underwriting and payment-method rules apply separately. All newly expanded categories should be disclosed to Stripe before processing them under Model A.

| Category | Ordinary physical goods scope | Additional review / exclusions |
|---|---|---|
| Automotive and vehicles | Lawful parts/accessories, subject to product review | Request written platform acceptance for full titled vehicles, high ticket/deposits, title/lien transfer, dealer/private-seller rules, delivery/pickup and refund timing. Affirm explicitly excludes titled cars/boats/motor vehicles and auto loans; this is not a blanket Stripe-card ban. No lending, financing, escrow or installment product added by this migration. |
| Tools and construction equipment | Lawful hand/power tools and equipment sales | High-value machinery: confirm ticket/fulfillment exposure; explosives, prohibited weapons, hazardous materials and controlled components blocked or reviewed per applicable policy. Equipment sales are not contractor services; financing eligibility differs for B2B and services. |
| Electronics and computers | Lawful new/used/refurbished devices | Authenticity/serials, stolen/locked goods, recalled batteries, personal-data removal, shipping safety; prohibited surveillance/export-controlled items require policy/legal screening, not automatic approval. |
| Trading cards and collectibles | Lawful authentic physical collectibles | Counterfeits/stolen items excluded. Randomized breaks, paid chance prizes, raffles/gambling or investment-like offerings require independent policy assessment; ordinary auctions are not automatically gambling. Precious metals/stones or other regulated collectible subtypes need separate restricted-category review where applicable. |
| Fashion and sneakers | Authentic lawful apparel/footwear | Counterfeits and infringing goods excluded; authentication, provenance, brand claims, returns; restricted wildlife materials/jewelry require product/jurisdiction review. |
| Furniture and home goods | Lawful household goods | Freight/pickup acceptance, recalls, product safety, prohibited hazardous products; don't equate all home goods with unrestricted products. |
| Sports and outdoor equipment | Lawful sports/outdoor goods | Firearms, ammunition, explosives and prohibited weapons excluded under applicable Stripe policy; regulated hunting/weapon accessories, wildlife products and safety-critical recalled goods screened individually. |
| Business and industrial equipment | Lawful commercial equipment | High-value B2B underwriting, sanctions/export/dual-use restrictions, hazardous/regulated goods, medical or financial-service equipment use where relevant. Affirm does not support B2B; do not enable it by default for industrial carts. |

**Provider-confirmed vs platform recommendation:** Affirm's titled-goods/B2B restrictions are documented. Vehicle/high-ticket written review is a recommended launch gate because this account has no verified approval for the expansion; it is not a published blanket Stripe vehicle prohibition. Prohibited goods cannot be made supportable merely by requesting approval. Restricted products need the applicable additional due diligence; country overlays and card-network rules must be checked for actual listings.

## Architecture and compliance changes proposed

- Snapshot category/subcategory, physical-product tax code, fulfillment kind (parcel/freight/pickup/vehicle handover), risk policy, commission and approval evidence per allocation. Classifications and payable totals are server-derived; seller text cannot bypass policy.
- Deny unsupported products/payment methods before Checkout and before saved auction charges; one unsupported item blocks the grouped checkout, or use explicitly disclosed separate permitted checkouts. No silent substitution of payment method, category or transaction type.
- Keep Embedded Checkout, platform-owned future charges, delayed transfers and existing automatic saved-card auction consent/recovery. High-ticket/payment-method amount limits require Stripe confirmation; no arbitrary dollar limit invented here.
- All eight categories are tangible goods: full digital-product tax/fraud/dispute/support handling is not applicable. Propose tax calculation/collection only, with correctly classified products and verified registrations. Stripe calculation does not file/remit taxes for the platform under that mode. Vehicle title/registration and taxes may need distinct jurisdiction-specific treatment.
- Confirm marketplace facilitator sales-tax responsibilities, seller tax reporting (including applicable 1099 reporting), merchant/statement disclosures, PCI scope, consumer returns/warranty rules, KYC/sanctions, licensing and product-safety obligations with legal/tax review. Connect identity checks do not establish ownership, authenticity, licenses or title.
- Parcel carrier evidence is not sufficient for all goods. Freight requires verified carrier proof of delivery; pickup requires reviewed dual-party, anti-replay handover evidence; vehicles require title/ownership and handover evidence. Do not let seller status, AI images or a buyer-only click automatically unlock funds. Until evidence policy is approved, unsupported fulfillment creates no eligibility.
- Delivery milestones remain 25/50/75/100 → 10/30/70/95% of verified-delivered net earnings. Category expansion increases risk differences: approve how seller-wide counts cross categories, what counts as a completed delivery, and time-based reserve release; do not change these percentages or invent below-25 behavior.

## Sources checked November 12, 2026

- Stripe restricted/prohibited business policy (search reports September 22, 2026 update): https://stripe.com/legal/restricted-businesses . Full page text was not retrievable in this sandbox; specific subtypes must be confirmed in current account/country terms before launch.
- Affirm official titled-goods, B2B and contractor-services exclusions: https://docs.stripe.com/payments/affirm .
- Platform liability/Separate Charges and Transfers: https://docs.stripe.com/connect/separate-charges-and-transfers .
- Physical-goods tax classification: https://docs.stripe.com/tax/tax-codes .

No new account/API reconciliation was performed for this document update; `reconciliation.md` remains the earlier verified evidence snapshot, not a new current-balance assertion.