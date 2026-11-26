# Stop unpaid checkouts from counting toward the seller's weekly commission total

## Problem (confirmed)
Opening checkout reserves the sale against the seller's weekly total (5% up to $500, 8% above). The reservation is given back only when an order's status changes to cancelled/expired/failed. Two common cases never give it back:
- The buyer removes the item from the cart: the unpaid order is deleted, so no status change ever happens.
- The buyer leaves: the order stays "awaiting payment" with no expiry.

## Fix
1. Database change (needs approval):
   - Add a trigger: when an unpaid order is deleted, release its reservation and lower the weekly total.
   - Add a release function that releases reservations older than 30 minutes whose order is still unpaid. Run it at the start of every commission allocation, before the tier is chosen, so stale holds never affect the 5%/8% decision. No new scheduled job.
   - One-time correction: release reservations that are already stuck (deleted orders, or unpaid for more than 30 minutes) and lower the totals to match.
2. A late payment on a released order: the paid-order path already calls the allocator again, which reserves and confirms at the current total, so the commission stays correct and is never charged twice.
3. Test the new SQL on the throwaway local database first (abandon, delete, expire, late payment, 20 sales at the same moment), then apply it.

## Out of scope
PB Store and Bazaar stay excluded. Refund commission rules stay unchanged. Nothing gets published.
