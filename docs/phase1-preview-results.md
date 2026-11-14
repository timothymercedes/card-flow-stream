# Phase 1 preview stabilization — November 14, 2026

## Verified preview changes
- A02: absent/hidden listing reads finish at a neutral unavailable page; error state offers retry; request versions discard stale responses.
- A03: homepage, landing, Live and Flex queries exclude explicit demos/private broadcasts. Existing demo detail shows a Demo designation. Live/Flex read failures differ from empty results. Desktop 1331×892 and phone 390×844 Live filters fit without horizontal overflow and have accessible names.
- A07: collectibles navigation separates Vault from Scan a card; safe sign-in return retains scanner intent. Existing beta form remains enforced. Camera access requires Enable camera. Browser without a camera shows the denial/device error; `scan=false` does not open the scanner.
- A01 presentation: honest unfiltered catalog-empty versus filtered-no-match states; failed Marketplace search does not claim no matches. Retry recovers. Concurrent/filter-change reads discard obsolete results.
- A04/A05 presentation: count failures remain unavailable rather than zero; seller public Vault failures do not claim an empty collection.
- A06 presentation: Garden browse filter and search survive reload; Garden seller writes remain disabled.

## Checks
November 14 continuation: homepage Live/Flex sections now distinguish pending, read errors and empty results, offer Retry, and ignore obsolete responses after navigation/filter changes. Garden search/reload/error recovery, Live error/retry and desktop/mobile layout, signed-in scanner consent/denial/false intent and demo labels rechecked successfully. 50 focused tests pass including six administration access tests. No Phase 1 database-dependent work was executed.

44 targeted unit tests passed: stabilization, auth return, category shopping, department validation, payment confirmation and preview payment isolation. Preview compilation OK. Guest Garden/search/reload, injected search-error/retry, Live read-error/retry, desktop/phone sizing, signed-in scanner/denial/false intent, signed-in Live and Flex demo exclusion, retained demo label and existing administration screen verified. Browser reported no uncaught page errors.

Injected failures were local browser response substitutions, not backend changes. No inventory/account/order writes or broadcast starts were performed.

## Separate approval gates remain
- A01 atomic renewal and companion database enforcement: not implemented; existing Repost behavior remains unchanged, not certified safe by these tests.
- A04 bounded public collector count: not implemented.
- A05 privacy-safe public Vault projection/media review: not implemented; existing permissions unchanged.
- A06 compatible Garden seller constraint/search rules: not implemented.
- Real broadcaster heartbeat/playback: unverified; four current live-status rows are demos with no playback. No new liveness algorithm inferred from viewer presence.
- No populated shopping/renewal/auction/payment/scanner-image recognition certification without isolated fixtures and scope approval.
- No deployment, shared database changes, checkout activation, payouts or supplier ordering.