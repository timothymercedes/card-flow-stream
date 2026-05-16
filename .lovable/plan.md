# Live Stage System Overhaul

This is a substantial change touching the live page, co-host stage, chat, and Flex Live. Breaking into 3 focused workstreams.

## 1. Host-controlled stage layout (broadcast to viewers)

**Goal:** Host's drag/resize/zoom of camera tiles becomes the authoritative public layout that viewers + co-hosts see. Co-hosts can still rearrange tiles *locally* for their own viewing.

Changes:
- New table `live_stage_layouts` storing per-stream tile rects: `{ stream_id, user_id (tile owner), x, y, w, h, z, object_fit, updated_at }` with RLS allowing the stream host to write and everyone to read.
- Enable realtime on the table so viewers get instant updates.
- `CoHostStage.tsx`:
  - Add `mode: "host-broadcast" | "local-only" | "viewer"` prop.
  - In `host-broadcast`: writes positions to `live_stage_layouts` (debounced) instead of localStorage.
  - In `viewer`: subscribes to `live_stage_layouts`, renders read-only tiles in the broadcast positions. No drag handles. Layout is pinned to a normalized 16:9 stage container (percent-based coords) so it scales correctly on mobile.
  - In `local-only` (co-host personal view): falls back to localStorage like today but layered above the broadcast layout so it doesn't pollute it.
  - Add per-tile `objectFit` toggle (contain/cover) + simple zoom slider; host's choice serializes into the layout row.
- `live.$id.tsx`:
  - Host renders `<CoHostStage mode="host-broadcast" />`.
  - Co-host renders both: a read-only viewer stage for "what viewers see" + a personal `<CoHostStage mode="local-only" />` toggle.
  - Viewers render `<CoHostStage mode="viewer" />`.
  - Position the stage container so it never covers the chat column (chat stays in its left strip; stage is constrained to the video area's safe rect).

## 2. Private mod chat channel

Goal: host can post to `public`, `mods_only`, or `host_mods` (private).

Changes:
- Add column `audience text not null default 'public'` to `chat_messages` with check in `('public','mods_only','host_mods')`.
- RLS update: rows with non-`public` audience are only visible to the stream host or users with `moderator`/`mod` role for that stream (use existing roles table; if there's no per-stream mod role yet, gate on global `admin`/`moderator` from `user_roles`).
- Chat composer (host UI): segmented control "Public · Mods · Host+Mods". Viewers always send `public`.
- Chat renderer: mod-only messages render with a small badge + tinted bubble so mods can distinguish them. Filtered server-side via RLS so viewers literally don't receive them.

## 3. Flex Live parity

- Reuse the same `CoHostStage` + `live_stage_layouts` plumbing on the Flex Live route. Today Flex Live uses `FlexLiveControls` at the bottom but the camera area is a single feed — wire in the stage container so hosts can drag/resize/zoom co-host tiles identically.
- No behavioral change to filters / reactions / weekly vibe.

## Technical notes

- Coords stored as 0..1 percentages of stage width/height (not raw px) so mobile viewers see the same relative layout the host arranged.
- Debounce writes during drag (commit on pointerup + every ~150ms while dragging) to keep realtime payload light.
- Realtime channel: one channel per `stream_id` shared with existing presence to avoid extra socket cost.
- No business-logic changes to bidding, auctions, or cloudflare calls.

## What I'll ship in order

1. Migration: `live_stage_layouts` + `chat_messages.audience` + RLS + realtime publication.
2. `CoHostStage` rewrite with the three modes + percent coords + object-fit/zoom.
3. `live.$id.tsx` wiring (host / co-host / viewer branches) + ensure chat column isn't overlapped.
4. Chat composer + renderer audience support.
5. Flex Live: drop the stage container in.

After approval I'll start with the migration.