## What changes

Move the **Extra** quick-actions out of the bottom control bar and into the **Flex settings** panel (the same popover that contains *Slow chat*), as a button that opens its own popup with an × close.

## Where

`src/routes/live.$id.tsx`

1. **Flex settings panel** (around lines 4496–4530, right next to the `Slow chat` block): add a new tile/button labeled `✨ Extra`.
2. **Bottom control bar** (lines 5907–5982): remove the existing `<details>` Extra accordion entirely.

## Behavior

- New state: `const [extraOpen, setExtraOpen] = useState(false)`.
- The `Extra` button in Flex settings opens a centered popup (fixed overlay + card) containing the existing 5–6 actions: **Scan, Break, Pin (when break_mode=open), Wheel, Gift, Snipe**.
- Popup has an **×** in the top-right corner, closes on backdrop click and Escape.
- Each action runs its existing handler and then calls `setExtraOpen(false)`.
- Disabled states (e.g. Snipe requires `auctionLive`, Scan respects `liveScanBusy`) are preserved.
- All other UI (Pre-Bid button, Cameras panel, main control bar) stays unchanged.

## Files

- `src/routes/live.$id.tsx` — add `extraOpen` state, insert Extra button in Flex settings panel, render popup, delete bottom-bar `<details>` block.
