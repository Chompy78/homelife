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

There is no write path at all here - `get_kid_reward_state` is the only
action this app calls, and it only reads. A kid can't adjust their own
tally from this app even without a PIN, because there's nothing here that
writes anything.

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
