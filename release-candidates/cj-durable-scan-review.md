# Durable CJ scan — activation remains gated

## Current preview improvements
Product-level server pagination and category/status/search/sort controls replace the 1,000-link cap. Selected-product bulk actions keep drafts hidden, pause drafts or reject variants; private-test and published products are excluded. Product groups include complete linked variants. Review approval no longer publishes.

Scanner changes freeze the category tree in checkpoints, save after each processed product, retain all qualifying stocked variants rather than three, retain product and variant image URLs, sum multiple warehouses per country and quote only confirmed US/CN origin stock. Each imported variant still requires its own current US shipping quote and at least 200 cents net profit after configured costs/fees. Existing products imported under the three-variant cap are not automatically expanded; a separately controlled backfill is needed.

## Database proposal
`cj-durable-scan.sql` is unapplied. It adds service-only leased coordination with admin read access and backfills the latest cursor from existing checkpoints. It changes no existing catalog policies. Safe rollback: pause the new runs and disable the new schedule; preserve the table, checkpoints, catalog and orders.

## Remaining implementation before activation
1. Approve the exact coordination migration separately and verify it in an isolated draft.
2. Implement bounded variant-level continuation with atomic product/variant commit and checkpoint updates. A product with hundreds of variants must span invocations; merely removing the three-variant cap is not sufficient for durable execution.
3. Route every runner, including manual import/scan, through the same claim mechanism; migrate/stop the old workspace loop at a checkpoint boundary. Freeze category IDs and save fetched page IDs to tolerate supplier catalog changes.
4. Persist one terminal outcome per supplier product for exact discovered/rejected counts; current dashboard reconciliation uses distinct committed products and retained rejection counters, not a new exact outcome ledger.
5. Provision managed cron authentication through the documented repair tool and approve a hosted scan-only deployment. Schedule authenticated short callbacks with retry/backoff. No unpublished localhost callback can survive workspace sleep.
6. Test competing claims, crash recovery, partial variants, duplicate category appearances, final category completion, pauses and rate-limit retries. Confirm public projection still returns no hidden rows.

No schedule, migration, publication, Stripe setting change or CJ supplier order was executed in this development step. The existing workspace scan continues; it is not durable across workspace sleep.