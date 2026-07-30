# 2026-07-30 — Reading tracker: real favicon from the user's supplied artwork

**Focus:** Replace `apps/reading-tracker`'s generic placeholder icon with the user's own design.

## Timeline

- User said they'd added a new favicon, `homelife-reading-original.png`, and asked for it to be
  resized to 512x512 with a smaller file size, then wired into the reading app's favicon.
- The file wasn't in this session's local filesystem or on `main` yet; found it by fetching all
  remote branches and searching git history - it had landed on `main` via `assets/images/
  homelife-reading-original.png` from a different session/push. Pulled latest `main` to get it.
- Installed Pillow (no image tooling was preinstalled), resized the 1254x1254/502KB source down to
  512/192/32/16px, palette-quantized (48 colours, Floyd-Steinberg dither - the source is a flat
  vector-style icon so this is near-lossless) to shrink file size further: 512px landed at 19.5KB
  (vs. 124KB unquantized, 502KB source). Visually checked the 512 and 32px output before wiring
  anything in.
- Followed the existing per-app-favicon convention (parent-dashboard, reward-tracker previously did
  the same - see `CHANGELOG.md` 2026-07-17/2026-07-19 entries): saved to `apps/reading-tracker/
  icons/{favicon-16,favicon-32,icon-192,icon-512}.png`, pointed `index.html`'s favicon `<link>`
  tags at the local files instead of the shared `apps/shared/icons/favicon-{16,32}.png`, updated
  `service-worker.js`'s `ASSETS` list to match, bumped `CACHE_NAME` (v3 → v4). `manifest.json`
  already pointed at local `icons/icon-192.png`/`icon-512.png`, so no change needed there.
- No `DECISIONS.md` entry - this isn't a decision with real options, just following the
  already-established per-app-favicon pattern with the user's supplied artwork.

## Files touched

- `apps/reading-tracker/icons/favicon-16.png`, `favicon-32.png`, `icon-192.png`, `icon-512.png` -
  regenerated from `assets/images/homelife-reading-original.png`
- `apps/reading-tracker/index.html` - favicon `<link>` tags now point locally
- `apps/reading-tracker/service-worker.js` - `ASSETS` updated, `CACHE_NAME` bumped to v4
- `CHANGELOG.md`

## Related

- Mirrors the favicon convention from `CHANGELOG.md`'s 2026-07-17 (Reward Tracker) and 2026-07-19
  (Parent Dashboard) entries - no dedicated decision record exists for those either.
