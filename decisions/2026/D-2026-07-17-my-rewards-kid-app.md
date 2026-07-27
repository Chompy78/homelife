# D-2026-07-17-my-rewards-kid-app

Date: 2026-07-17
Status: Done

**Context:** Reward Tracker has no kid login by design (see
`D-2026-07-17-reward-tracker-app`) - only a parent code unlocks it. The
user asked how a kid actually checks their own balance day to day, and
the honest answer was "only if a parent's device happens to be logged in
and Kid View is open" - there was no independent way for a kid to check.
The user asked for a proper installable PWA for this.

**Options:**
1. Add a kid-login mode to Reward Tracker itself (a second gate,
   alongside the parent-code one, in the same app).
2. A new, separate app (`apps/my-rewards`) - its own manifest/icons/
   service worker, so it installs as its own home-screen icon, read-only,
   gated by the kid's existing `kid_code` (the same one bedroom-reset
   already gave them).

**Decision:** Option 2.

**Why:** Bedroom Reset and Parent Dashboard are already split this way
(one kid-facing app, one parent-facing app, not one app with two login
modes) - matching that keeps the pattern consistent rather than making
Reward Tracker the one app with two different identities depending on
which code you type in. A separate app also gets its own icon a kid can
actually find on their home screen, which a mode buried inside the
parent app wouldn't. Reusing `kid_code` (rather than inventing a new code
type) meant zero schema changes and reused the exact device-remembers-you
UX bedroom-reset already has, including the "already logged into
bedroom-reset -> automatically logged in here too" trick (same
`homelife_kid_token` local storage key, same origin).

**Decision (color):** `apps/my-rewards` is sage-green (matching the
now-refreshed shared favicon and the "green for kids" convention the
user set); Reward Tracker stays blue (parent-facing). Bedroom Reset and
Parent Dashboard don't follow this convention yet - the user asked for
just Reward Tracker's icon fixed and to note the concept for later,
not a full site-wide re-theme.

**Status:** Done. New read-only `get_kid_reward_state` action (kid
session only, no write path exists for it, so no PIN is needed - there's
nothing to gate). Verified server-side rejection of a kid session calling
`adjust_reward` (still parent-only) via a disposable test family, and the
frontend via a mocked Playwright run (balance renders, refresh picks up
new data, token persists across reload, "Not you?" clears it). Linked
from the root page and README.
