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

## Tapping is instant

Earn and Spend both commit the moment you tap `+` or `−` - no PIN, no
"pick a reason" prompt in the way. The balance on screen updates
immediately (optimistically, before the network round trip even starts),
so a tap feels instant regardless of connection speed; the app then
quietly reconciles with the server's real numbers a moment later. The
5-second Undo toast (see below) is the safety net for a mis-tap, not a
confirmation step beforehand.

A family's own customizable list of preset "reasons" still exists
(`family_reward_notes`, managed via "Manage reward reasons" in Table
mode) but isn't wired into tapping right now - it was originally the
thing a tap paused on to ask "why", which turned out to be exactly the
friction that made adding/spending feel slow.

## PIN protection

Deleting a category and Reset all still ask for the family's PIN before
going ahead (the same PIN bedroom-reset's Parent Check uses) - Earn and
Spend no longer do. Entering it correctly unlocks both for 5 minutes on
that device (in-memory only - a reload re-locks it). A parent can flip PIN
protection off entirely from Settings if it's more friction than it's
worth for their family. The PIN is verified server-side (`verify_pin`),
but note this is a UX friction layer, not the app's real security
boundary - anyone with the parent code already has full access to every
action here, same as every other reward-tracker action.

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
as deleting a category or Reset.

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

## Spin wheel

A 🎡 Spin mode alongside Quick Tap: a wheel with one wedge per reward
category (same colours as everywhere else), spun for whichever kid is
selected. Landing logs a real earn exactly like tapping + does, no
backend changes needed - it's `adjust_reward` under the hood, with an
automatic note ("🎡 Spinner: <category>") so History shows why the
balance moved. Landing on "Spin twice" (the seeded default category)
doesn't tally a literal reward - it triggers two more spins instead,
since that's what the category actually represents. See
`D-2026-07-18-reward-tracker-spin-wheel`.

Each category has a spin weight (1-5, editable in "Manage reward
categories" - `family_reward_categories.spin_weight`, defaults to 1).
Wedge *size* is proportional to weight, which does double duty: a
category weighted 5 is both visibly the biggest slice and, since landing
is just a uniform-random angle, correctly 5x as likely to be hit - no
separate weighted-random-pick logic needed, the geometry does it.

Spin sound (synthesized with Web Audio, no sound files - ticks that
spread out as the wheel slows, then a two-note chime on landing) is on by
default; a parent can turn it off in Settings. Spin duration is also a
Settings control (2-8 seconds, defaults to 2.6) - both are per-device
`localStorage` preferences, same as dark mode and PIN protection, not
family-wide settings. See `D-2026-07-19-reward-tracker-spin-weighting`.
