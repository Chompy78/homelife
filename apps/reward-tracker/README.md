# Reward Tracker PWA

A parent-run reward tally: pick a kid, tap a reward category to earn or
spend, done. Originally a single-family standalone app (localStorage only,
hardcoded kid names); this version is wired into the shared Supabase
backend so it works for any family on this deployment, syncs across
devices, and its data survives a browser being cleared.

## Files

- `index.html` - the app itself
- `app.js` - app logic, gate/code entry, tile/table/history rendering, backend sync
- `styles.css` - styling
- `manifest.json` - tells the device/browser how to install the app
- `service-worker.js` - caches the app so it can work offline after first load
- `icons/icon-192.png` and `icons/icon-512.png` - install icons (the reward wheel)
- `../shared/api.js` - the fetch helper used to call the backend

## Auth model

This is a parent-operated tool, same as the parent dashboard - not a
per-kid login. Enter the family's parent code once and this device
remembers it (`homelife_parent_token` in local storage, the *same* key
Parent Dashboard uses - a parent already logged into one is automatically
logged into the other on the same device, since both apps share an origin).
Kids don't get their own reward-tracker session; this matches the original
app's intent that kids can't quietly adjust their own counts.

## Data model

- `family_reward_categories` - the family's own customizable list of reward
  types (seeded with 9 defaults when a family is created, same pattern as
  `family_bedroom_items`). A parent can add, rename, recolor or delete these
  from the "Manage reward categories" button in Table mode.
- `kid_reward_log` - an append-only ledger: one row per tap (kid, category,
  +1 or -1, optional note, timestamp). Balances (and the earned/spent split
  shown in Table mode) are a live sum over this ledger, computed by the
  edge function - not a separately stored running total. That means **Undo
  is just deleting the log row** - no separate balance to keep in sync or
  drift out of step with the history.

This is a separate currency from the bedroom-reset points/streaks system -
intentionally not merged into `kid_streaks.total_points` or the public
leaderboard, since a reward tally (things like "Macdonalds" or "$5 at the
reject shop") isn't the same kind of thing as a chore-completion streak.

## What's different from the original standalone version

- Kid names, avatars and colours come from the family's real `kids` table
  instead of being hardcoded to three names.
- Categories are parent-editable per family instead of a fixed default list
  (though the same 9 defaults are seeded to start).
- No local JSON export/import and no per-category "Clear" button - data
  now lives centrally in Supabase, so a browser-local backup isn't the
  safety net anymore; Undo covers fixing a mis-tap instead.
