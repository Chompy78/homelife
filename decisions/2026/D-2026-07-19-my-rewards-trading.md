# D-2026-07-19-my-rewards-trading

Date: 2026-07-19
Status: Done

**Context:** The user asked how kids see their own balance (answered by
`apps/my-rewards`), then asked for kids to be able to trade rewards with
each other from within that same app - one kid picks what to give up and
what they want back, the other kid can accept or decline, no parent step.
Accepting moves real balance, so it needed some gate against a mis-tap or
a sibling accepting on someone else's behalf - the user's own suggestion
was a 4x4 picture grid instead of a PIN, with a lockout after repeated
wrong picks.

**Decisions made (mine, since the user explicitly invited judgement on
the specifics not covered by their description):**
1. **Who picks a kid's secret picture:** the kid themselves, the first
   time they need to accept a trade (or any time after, via a
   "set/change my secret picture" link) - not a parent-assigned value.
   Matches how a PIN works in Reward Tracker: something the person using
   it controls, not something imposed on them.
2. **Lockout:** 2 wrong picks -> 15 minutes locked. Two attempts before
   locking (not more) keeps a genuine mis-tap forgivable without making
   guessing practical; 15 minutes is long enough to be a real deterrent
   without needing a parent to intervene to unlock it.
3. **No parent approval step** - matches the user's own description
   exactly (propose -> the other kid accepts/declines), so nothing extra
   was added here.
4. **No balance-floor check** on proposing or accepting a trade - matches
   how every other reward-tracker action already works (Spend already
   goes negative freely with no floor), so trading isn't held to a
   different standard than tapping is.

**Why the picture grid isn't a stronger security model than a PIN:**
worth being explicit that this doesn't claim to be one. A sibling who
watches an accept happen once learns the correct picture just as easily
as they'd learn a 4-digit PIN by watching it typed - shuffling the grid
position each time stops lazy screen-glancing from working by remembering
a *position*, but the picture *identity* itself is exactly as memorable
as a PIN digit sequence would be. This is fine and consistent with how
the parent PIN elsewhere in this app suite is already documented ("a UX
friction layer, not a real security boundary") - the ask was for
something kid-friendlier than typing digits, not something cryptographically
stronger.

**Status:** Done. New `kid_reward_trades` table and
`kids.verify_image`/`verify_fail_count`/`verify_locked_until` columns.
New actions: `get_kid_trade_state`, `set_kid_verify_image`,
`propose_trade`, `respond_to_trade`, `cancel_trade`. New Trade Center UI
in `apps/my-rewards` (propose/incoming/outgoing lists, a shuffled 16-image
verification grid, lockout messaging). Found and fixed three real bugs
during testing: (1) the client sent a payload field literally named
`action` inside `respond_to_trade`'s body, which collided with
`callApi`'s own top-level `action` dispatch key via object spread and
silently overwrote it - renamed to `response`, matching why this
codebase already used `kidAction`/`itemAction` elsewhere instead of
`action`; (2) a lockout wasn't reflected in the client's cached trade
state until the next full refresh, so an immediate retry showed the
picture grid again instead of the lockout screen; (3) accepting a trade
refreshed the trade list but not the main balance card, so a kid's own
total looked unchanged until the next 30-second auto-refresh. Verified
via Playwright against a mocked backend and live against a disposable
two-kid test family on production (propose, incoming/outgoing views,
first-time picture setup chained into accept, wrong-pick messaging,
lockout, lockout blocking even a correct pick, correct-pick acceptance
with exact balance verification on both kids, decline, cancel,
cross-kid cancel rejection, and double-accept rejection). Bumped the
my-rewards service worker cache to v2.
