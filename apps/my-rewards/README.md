# My Rewards PWA

A read-only, kid-facing view of a single kid's own reward tally - a giant
avatar/name/total card plus a per-category breakdown. Installable on a
kid's own device, so checking their balance doesn't depend on a parent's
device staying logged into Reward Tracker.

## Files

- `index.html` - the app itself
- `app.js` - code entry, auto-refresh, rendering
- `styles.css` - styling (sage-green, kid-facing - see the color convention below)
- `manifest.json` - tells the device/browser how to install the app
- `service-worker.js` - caches the app so it can work offline after first load
- `icons/icon-192.png` and `icons/icon-512.png` - install icons (the green reward star)
- `../shared/api.js` - the fetch helper used to call the backend

## Auth model

Gated by a kid's own `kid_code` - the same one they already have for
Bedroom Reset - via the existing `redeem_kid_code` action. This reuses
`homelife_kid_token` in local storage, the *same* key Bedroom Reset uses,
so a kid already logged into Bedroom Reset on a device is automatically
logged into this app too.

Checking a balance has no write path - `get_kid_reward_state` only reads.
Trading with a sibling (below) does write, but only ever moves reward
units between two kids in the same family; there's still no way for a kid
to adjust their own tally out of thin air.

## Trading with a sibling

A kid can propose giving up some of one reward category for some of a
sibling's, from the 🔁 Trade button on the main card. The other kid sees
it as a pending offer and can Accept or Decline - no parent step. New
actions: `get_kid_trade_state` (siblings, categories, pending trades in
both directions), `propose_trade`, `respond_to_trade`, `cancel_trade`.
Accepted trades write four `kid_reward_log` rows (each kid loses what
they gave up, gains what they received), tagged "🔁 Traded to/from
<name>" so History still makes sense afterward.

**Verification instead of a PIN:** accepting is the one action here that
moves real balance, so it's gated - but a 4-digit PIN felt like the wrong
fit for a kid-facing app that might have younger readers than Reward
Tracker's parent audience. Instead, a kid picks their own secret picture
once (`kids.verify_image`, one of a fixed 16-emoji pool) and picks it
again - out of a shuffled grid of all 16 - to accept. Two wrong picks
locks accepting out for 15 minutes (`kids.verify_fail_count` /
`verify_locked_until`). This is the same "friction, not a hardened
security boundary" posture as Reward Tracker's parent PIN - a sibling who
watches an accept happen once learns the picture just as easily as they'd
learn a PIN, this is just the kid-friendlier version of the same idea. See
`D-2026-07-19-my-rewards-trading`.

## Color convention

Green is kid-facing, blue is parent-facing - this app is green (matching
the shared favicon's style) while Reward Tracker (parent-operated) is
blue. Bedroom Reset and Parent Dashboard don't follow this yet; ask before
assuming it applies there too.

## Why a separate app instead of a mode inside Reward Tracker

Reward Tracker's "Kid View" (a read-only mode reachable from its toolbar)
already covers viewing balances, but only on a device where a *parent*
has already redeemed the parent code - it's not independently
installable or loggable-into by a kid. This app fills that gap: a kid's
own code, their own installable icon, no dependency on a parent's device
staying unlocked.
