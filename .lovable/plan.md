Add a new "Store" (/shop) tab to the primary navigation (desktop top bar + mobile bottom bar) and create an under-construction placeholder page for the upcoming PullBidLive subscriber store.

Changes:
1. **New route**: `src/routes/shop.tsx` — Under Construction page with a "Coming Soon" message and a fun illustration/animation.
2. **Navigation update**: `src/components/AppShell.tsx` — add `/shop` to `PRIMARY` nav array with `ShoppingBag` icon and `mobile: true`. This will appear in both the desktop top nav and the mobile bottom bar.
3. **Translations**: Add `"shop": "Store"` to `nav` in all 7 locale files (`en`, `es`, `fr`, `de`, `pt`, `ja`, `zh`).
4. **Route registration**: `src/routeTree.gen.ts` will auto-regenerate the new `/shop` route.

No backend changes. The page will be a lightweight placeholder optimized for mobile.