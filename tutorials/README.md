# Real-App Tutorial Recorder

Records tutorial videos by **driving the actual published PullBidLive UI** in a
real browser via Playwright. **No Remotion. No fake screens. No mock UI.**

Every overlay label is anchored to the real element's bounding rect via its
`data-tour="…"` attribute, so labels always sit exactly on top of the live
button — including after layout shifts. The animated cursor moves to the real
DOM coordinates before each click. Voice narration is generated step-by-step
with ElevenLabs (or any TTS) and merged with the screen capture.

## How it works

1. **Browser**: Playwright launches Chromium against the preview / published URL.
2. **Recording**: Playwright's built-in `recordVideo` captures WebM at viewport size.
3. **Overlay**: a single `<div id="__pbl_overlay__">` is injected into the page
   per scene. It reads `el.getBoundingClientRect()` for the targeted
   `data-tour` element and re-positions on every animation frame, so the label
   stays glued to the real button even if the page reflows.
4. **Cursor**: a fake cursor sprite is animated to the element's center, then a
   click ripple plays in sync with `page.click(selector)` — meaning the visible
   click and the actual interaction happen at the same coordinate.
5. **Auth bypass**: scenes append `?tour=1` so `TutorialModeBootstrap` flips
   the synthetic demo user (locked behind `tutorialModeBuildAllowed()`, prod
   admins only). No DB writes, no Stripe, no real bid mutations.
6. **Render**: WebM is muxed with the narration MP3 to MP4 via ffmpeg.

## Run

```bash
# 1. Install
cd tutorials
npm i playwright
npx playwright install chromium

# 2. Configure
export PBL_BASE_URL="https://card-flow-stream.lovable.app"
export PBL_BETA_PASSWORD="…"               # optional, only if beta gate is on
export PBL_AUCTION_ID="…"                  # an existing auction stream id
export PBL_HOST_STREAM_ID="…"              # an existing host-side stream id

# 3. Record
node record.mjs bid                # buyer walkthrough  → out/bid.mp4
node record.mjs host               # host walkthrough   → out/host.mp4
node record.mjs seller-hub         # seller-hub tabs    → out/seller-hub.mp4
node record.mjs all
```

Outputs MP4s to `tutorials/out/`. Re-run after UI changes — overlays will
re-anchor automatically because they look up `data-tour` at runtime.

## Adding a step

Edit `scenes.mjs`. Each step looks like:

```js
{ goto: "/live/$AUCTION_ID", wait: '[data-tour="hold-bid"]' },
{ label: "Hold to bid", target: '[data-tour="hold-bid"]', voice: "Press and hold the red button — longer hold, higher bid." },
{ label: "Buy It Now",  target: '[data-tour="bin-button"]', voice: "Or hit Buy It Now to lock the card in instantly." },
```

`target` MUST be a `data-tour` selector that exists in the real app. If the
element isn't on the page yet, add the attribute in the corresponding TSX file
— **never** restyle or recreate the UI. The recorder fails loudly if a target
is missing, so fake/stale selectors can't slip through.

## Coverage (anchors that already exist in the real app)

Buyer (`/live/:id`):
- `data-tour="bid-controls"` — quick-bid +$1/+$5/+$10/+$25 chips
- `data-tour="hold-bid"`     — main hold-to-bid red button
- `data-tour="bin-button"`   — SNIPE Buy-Now strip
- `data-tour="timer"`        — countdown pill / dramatic burst
- `data-tour="chat"`         — chat input
- `data-tour="viewer-count"` — header viewer-count chip
- `data-tour="pin-item"`     — pin/unpin auction button

Host (`/sell`, `/live/:id`, `/store`):
- `data-tour="stream-title"`    — title field
- `data-tour="obs-hub-link"`    — open OBS Hub
- `data-tour="start-stream"`    — Start Live button
- `data-tour="scan-card"`       — Scan card to list
- `data-tour="auction-controls"`— Add Time / Lock Bids
- `data-tour="pin-item"`        — pin item over stream
- `data-tour="chat"`            — moderate chat (host sees same input)
- `data-tour="obs-download"`, `data-tour="obs-copy"` — OBS Hub
