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

- Kid names and colours come from the family's real `kids` table instead of
  being hardcoded to three names (avatars now live there too, editable from
  Settings - see below).
- Categories are parent-editable per family instead of a fixed default list
  (though the same 9 defaults are seeded to start).
- No local JSON export/import and no per-category "Clear" button - data
  now lives centrally in Supabase, so a browser-local backup isn't the
  safety net anymore; Undo covers fixing a mis-tap instead. There's now a
  full "Reset all reward history" instead, in Settings.

## PIN protection

Spend, deleting a category, and Reset all ask for the family's PIN before
going ahead (the same PIN bedroom-reset's Parent Check uses); Earn never
does. Entering it correctly unlocks all three for 5 minutes on that device
(in-memory only - a reload re-locks it). Off by default is not an option
kept from the original app on purpose: it's on by default here too, but a
parent can flip it off entirely from Settings if it's more friction than
it's worth for their family. The PIN is verified server-side
(`verify_pin`), but note this is a UX friction layer, not the app's real
security boundary - anyone with the parent code already has full access to
every action here, same as every other reward-tracker action.

## Insights tab

A fairness view: this-week and this-month bars per kid (colour-coded to
match their chip/table colour everywhere else in the app), plus an
all-time balance and top category per kid. All computed server-side
(`get_reward_insights`) over the full ledger, not just the 100-row history
window `get_reward_state` caps at.

## Kid View

A read-only, giant-card view meant for a kid-facing tablet or photo frame -
no tap-to-adjust controls, just avatar, name, total balance and a
per-category breakdown. Opened from the 👶 toolbar button (shows every
kid) or via `?kid=<name>` in the URL (shows just that one kid - handy for
a dedicated device by a kid's door). Exiting goes through the same PIN gate
as Spend/Delete/Reset.

## Kid avatars

Settings has a picker (🌸 🌟 🦄 ⭐ 🦁 🐬 🚀 🎨 🐱 🐶) for each kid's avatar
emoji, shown in Quick Tap, Table headers, History and Kid View. This edits
the same `kids.avatar_emoji` column bedroom-reset and the parent dashboard
already use, so a change here shows up there too.

## 5-second Undo toast

Every earn/spend tap shows a toast with an Undo button, live for 5 seconds -
the fast path for catching a mis-tap immediately, no confirmation needed.
History's own Undo (with a confirm dialog) still covers correcting an
older entry.
