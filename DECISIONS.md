# Decisions

A record of real decisions made on this project — choices between
options, design directions, fixes for non-obvious problems. Newest
entry on top. See `AGENTS.md` for the format and when to add one.

---

## D-2026-07-19-bonus-spin-category-flag

**Context:** A code-review finding on the Reward Tracker spin wheel: the
double-spin bonus mechanic was keyed off `cat.label.trim().toLowerCase() ===
"spin twice"` - a plain string match against the category's freely-editable
label, with nothing marking it as protected (unlike a `trigger_key`-linked
spin reason, which already gets a lock icon). Renaming that category would
silently break the mechanic; renaming any other category to that exact
string would silently hijack it.

**Options:**
1. Leave it as a label match, just warn parents in the UI not to rename it.
2. Add a stable `is_bonus_spin` boolean column on `family_reward_categories`,
   identify the mechanic by that instead of the label, and protect it from
   deletion the same way a linked spin reason is protected.

**Decision:** Option 2 - added `is_bonus_spin` (migration
`add_is_bonus_spin_flag_to_reward_categories`), backfilled every existing
family's "Spin twice" row (6 families had one), and updated the
`seed_default_reward_categories()` trigger so newly-created families get the
flag set from the start instead of relying on the label ever matching.

**Why:** A UI warning doesn't stop an accidental rename, and the codebase
already has a working precedent for exactly this problem (`trigger_key` on
spin reasons) - reusing that pattern here means a parent can now freely
rename "Spin twice" to anything without breaking it, and the edge function
blocks deleting the flagged category outright (`category_linked_to_spin_
mechanic`) instead of silently losing the mechanic.

**Status:** Done.

---

## D-2026-07-19-spin-credit-code-review-fixes

**Context:** A high-effort multi-angle code review of the spin-credit system (8 finder agents, 12
verified candidates) confirmed 10 real findings, topped by a race condition three independent finder
angles converged on independently. All 10 were fixed in this pass.

**Fixes:**
1./2. **Atomic RPCs + a hard cap, not a bigger client-side loop.** `grantSpinCredit` and
   `consume_bonus_spins` used to do a plain SELECT then a computed UPDATE - a concurrent grant and
   consume for the same kid could interleave and silently lose an increment or wipe out a freshly
   granted spin. Replaced both with single Postgres functions (`grant_spin_credit_atomic`,
   `consume_bonus_spins_atomic`) that lock the kid row (`SELECT ... FOR UPDATE`) for the whole
   check+insert+increment sequence, so a racing grant and consume now serialize instead of
   interleaving. Separately, `consume_bonus_spins` handed back the kid's *entire* accumulated count in
   one shot, but the client's spin-chain loop caps at `MAX_SPINS_PER_ROUND` (25) - anything beyond
   that was already zeroed server-side and silently lost. Rather than teach the client to consume in
   batches, `grant_spin_credit_atomic` now clamps `bonus_spins` at `MAX_BONUS_SPINS = 20` (comfortably
   under 25, leaving room for one "Spin twice" chain), so the loss condition can't be reached at all.
2. **Block deleting a trigger_key-linked reason, don't expose trigger_key for editing.** A parent
   could delete the seeded "Tidy Room AI Score" reason with no warning, permanently and silently
   severing Bedroom Reset's auto-grant (its lookup is by `trigger_key`, so nothing else could ever
   find it again). `manage_spin_reasons`'s delete branch now rejects deleting a `trigger_key`-linked
   row; the manage UI shows it as "🔒 Linked" instead of a delete button. Deliberately did NOT expose
   `trigger_key` as a settable field - it's internal wiring, not something a parent needs to hand-edit.
3. **PIN-gate spin-reason deletion**, matching the existing category-delete/Reset/Kid-View-exit
   pattern - this destructive action had simply been missed when the feature was first built.
4. **Re-render the wheel when the Spin tab becomes visible.** `renderWheel()`'s wedge-label math reads
   `wheel.clientWidth`, which is 0 whenever `#spinView` has `display:none` on an ancestor - so any
   render that happened while a different tab was active (which is most of them) positioned labels for
   a hardcoded 300px fallback instead of the real `min(320px, 88vw)` wheel. Now the `modeSwitch`
   handler calls `renderWheel()` again specifically when switching to Spin, when the section is
   actually visible and can be measured correctly.
5. **Checked `res.ok` on every `manage_spin_reasons` call site** (add/update/delete), matching the
   error-toast pattern already established for the sibling `undo_reward_log`/`grant_spin_credit` flows
   in the same feature - these three had been missed.
6. **Resync instead of retry-loop on a 409.** The grant button's failure handler treated every error
   identically - on the specific `already_granted_this_period` conflict (two devices, or a manual
   grant racing Bedroom Reset's automated one), it now calls `loadState()` to flip to the real "Used"
   state instead of re-enabling a button that would just 409 again.
7. **`grant_spin_credit` now accepts `trigger_key` as an alternative to `reason_id`**, resolved
   server-side. The action's own doc comment and this feature's original design (D-2026-07-19-
   spin-credit-system) both describe it as "generic - any app can call it," but the only caller
   (Bedroom Reset) cheated by resolving `trigger_key` via direct DB access in the same file/process; a
   genuinely separate future caller had no public way to do that resolution. Now it does.
8. **Logged (not surfaced in the response) `grantSpinCredit`'s previously-discarded error** in
   `submit_photo_score`'s auto-approve branch - skips logging the benign, expected
   `already_granted_this_period` case, but a real `not_found` (e.g. a stale kid/reason at the exact
   moment of auto-approval) is no longer silently invisible.
9. **`Object.hasOwn` instead of `in`** in `spinSoundPreset()` - `in` walks the prototype chain, so a
   localStorage value like `"toString"` would pass as a "valid" preset name and later crash
   `playSpinTicks`/`playLandingChime` with a TypeError. Devtools-tampering-only in practice, but a
   one-line fix.

**Why fix the counter's atomicity instead of switching to a derived-from-rows count:** the reviewer
noted `kid_spin_credit_grants` already has full per-grant history, so `bonus_spins` could in principle
be derived (grants minus consumptions) rather than stored as a mutable counter, avoiding the race
class entirely. Not done here - the row-locked RPC fix is smaller, keeps the existing schema/API
shape, and closes the specific confirmed race without a data-model change; deriving the count is a
reasonable future refactor if more counter-style fields accumulate the same pattern, not warranted for
one column today.

**Status:** Done. Live-verified the two new RPCs directly (grant succeeds/caps correctly/rejects a
same-period repeat, consume zeroes and returns the right count) against a disposable test family, then
separately verified the deployed edge function end-to-end (`grant_spin_credit` resolving a
`trigger_key` with no `reason_id` supplied, and `manage_spin_reasons` correctly rejecting a delete on
the trigger_key-linked reason) against a second disposable family. Full Playwright regression suite
(11 files, including a new one targeting all 10 fixes) passes.

## D-2026-07-19-spin-credit-system

**Context:** The user asked for six things at once: a sticky-header scroll glitch, a broken History
Undo button, letting other apps (e.g. Bedroom Reset) grant a kid a spin, a bigger wheel with wedge
labels and a centered/hideable SPIN button, customizable spin sound, and named "reasons" that grant a
bonus spin with per-period limits. The last three (spin-granting, reasons, per-period limits) are one
underlying feature - designing them separately would have meant redoing the schema twice.

**Options considered (with the user's answers):**
1. Does earning a bonus spin gate spinning itself (no spin without a credit), or stay purely additive
   on top of the existing always-free SPIN button? **Chosen: additive** - a bonus credit just chains
   one extra automatic spin onto the next SPIN tap (reusing the exact mechanic the "Spin twice"
   category already has), rather than restricting spinning itself.
2. Per-reason limit shape: one cadence per reason (daily/weekly/monthly) vs. a count+period pair
   (e.g. "3 times per month"). **Chosen: one cadence per reason** - simpler to configure and to show
   ("once a week") than a two-part number+period combination.
3. Cross-app trigger: hardcode a specific Bedroom Reset event, or build one generic action any app can
   call. **Chosen: generic** (`grant_spin_credit`, usable by a parent session for any kid, or a kid
   session for themselves only) - the user deliberately didn't pick a specific Bedroom Reset event
   when offered the choice, so the mechanism itself is the deliverable; it's wired to Bedroom Reset's
   AI room-score auto-approve as the first real caller (matching the user's own example), not as the
   only possible one.
4. Sound customization: preset styles vs. an uploaded custom audio file. **Chosen: presets** (Chimes/
   Arcade/Retro/Off) - keeps it a Settings dropdown, no storage/upload plumbing needed.

**Why one shared `grantSpinCredit` helper for both manual and automated grants:** a parent ticking a
reason "yes" in Reward Tracker and Bedroom Reset's AI auto-approve path both need the *same*
per-reason-per-period cap enforced - if they used separate code paths, the cap could be bypassed by
whichever path didn't check it. Both now call one function; `grant_spin_credit` (the action) and the
`submit_photo_score` auto-approve branch (the automated caller) are just two callers of it.

**Why `trigger_key`, not label matching:** an automated caller needs a stable way to find "the reason
Bedroom Reset's AI score maps to" without breaking if a parent renames the human-readable label later.
`family_spin_reasons.trigger_key` (e.g. `'bedroom_ai_score'`) is looked up directly; the label is free
to edit without touching the link.

**Why the grant is per-kid only, not shared rooms:** `bonus_spins` is a column on `kids`, and a shared
room's AI auto-approval (`awardRoomPass`) has no single kid to attribute it to. The Bedroom Reset hook
only fires on the `updated.kid_id` branch of `submit_photo_score`, not the `updated.room_id` one.

**Known verification gap:** `submit_photo_score` (and so the Bedroom Reset auto-approve hook) is
gated by a worker-only secret (`WORKER_TOKEN`) that lives only in the Supabase project's own secret
store and the self-hosted AI-scoring worker machine - neither accessible from this session. Every
other new action (`grant_spin_credit`, `manage_spin_reasons`, `consume_bonus_spins`, the per-period
cap, the kid-can-only-grant-to-self boundary) was verified live against a disposable test family; the
`submit_photo_score` hook itself was verified by code review only, calling the same already-verified
`grantSpinCredit` helper. Worth a real end-to-end check next time the AI-scoring worker is run
against a live `auto_approve` family.

**Status:** Done, with the verification gap above noted.

## D-2026-07-19-reward-tracker-mobile-header-and-table-redesign

**Context:** The user supplied a detailed UI-improvement brief (a pasted design doc) asking for a
compact sticky header, spreadsheet-style sticky table headers/columns, and a View/Edit mode split
for the reward table, aimed at fixing a too-tall header and a cluttered table on mobile. The brief's
own mockups assumed a single "[Child ▼]" selector in the header, but the app already has two
different kid-selection models that don't map onto one selector cleanly - needed resolving before
writing any CSS.

**Options considered (with the user's answers):**
1. Child selector scope: one selector everywhere, vs. only for Quick Tap/Spin (which pick one active
   kid) with Table view showing no selector at all. **Chosen: Quick Tap/Spin only** - Table view
   already shows every kid as its own spreadsheet column simultaneously, which is what the doc's own
   sticky-column requirements need multiple columns *for*; forcing Table view down to one kid at a
   time would contradict the rest of the brief.
2. View/Edit mode scope: Table view only, vs. also Quick Tap's tile rows (same +/- clutter pattern).
   **Chosen: Table view only** - Quick Tap is inherently a fast-tap-to-add-points screen, not a
   read-then-edit one.
3. Per-kid running totals (shown today on each kid chip): keep a compact total next to the selector,
   vs. drop them. **Chosen: drop** - Table view's columns and the Insights tab already show totals;
   duplicating them in the compact header works against the header's whole point.
4. "Manage reward categories"/"Manage reward reasons" (previously permanent buttons under the
   table): move into the new overflow menu, vs. leave in place. **Chosen: move into the menu** -
   matches the doc's own "admin-style controls shouldn't take permanent space" instruction.

**Why border-collapse: separate, not collapse, on the sticky table:** `border-collapse: collapse`
has known rendering bugs with `position: sticky` cells (mainly Safari) where the shared border
between a stuck and non-stuck cell can vanish or double up during scroll. `border-spacing: 0` with
an explicit `border-right`/`border-bottom` per cell gets visually the same grid look without
depending on collapsed-border-and-sticky interaction at all.

**Why the sticky header's z-index needed to be low (20), not high:** the table's own sticky cells
(header row, left column, corner) only need to beat plain page content, so a modest z-index clears
that easily - but the app's existing modals sit much higher (settingsModal/catModal 60, confirmModal
70, pinModal 80). Giving the sticky app bar a high z-index (100, the first attempt) made it paint
*above* every modal, silently intercepting clicks on any modal content that happened to render
underneath the header's screen area - caught by the `test_spin_weight.js` regression test failing
with "element intercepts pointer events" on `#settingsModalClose`, not by visual inspection.

**Status:** Done.

## D-2026-07-19-parent-icon-auth-alternative

**Context:** The user proposed a "3-of-9 graphical password" as a
child-friendlier alternative to the 4-digit parent PIN: a 3x3 grid of
distinctive fantasy icons, where a parent memorises any 3 (order
doesn't matter) and the grid's positions shuffle on every attempt to
resist shoulder-surfing by a kid watching. The spec was explicit that
this is "not bank-level security," just meant to raise the bar above
casual access while staying fast and touch-friendly for parents and
kids around age 8-10. Two things needed deciding before writing code:
which flows it should apply to, and whether it replaces the PIN
outright.

**Options considered (with the user's answers):**
1. Scope: reward-tracker's PIN-gated actions only, vs. also Bedroom
   Reset's Parent Check flow. **Chosen: both** - the two apps already
   share one `families.parent_pin` value, so supporting the icon
   picker in only one would leave the other's PIN meaning something
   different depending on which app you're in, which is more
   confusing than useful.
2. Relationship to the PIN: full replacement vs. a per-family choice
   between the two. **Chosen: per-family choice, in Settings** - some
   parents may prefer a PIN; the icon picker is explicitly a
   different security/UX tradeoff, not a strict upgrade, so families
   pick which one they want rather than having it forced on them.

**Why one shared verification helper, not three copies:** exploring
existing `parent_pin` usage first turned up three separate inline
string comparisons (`verify_pin`, `parent_check`,
`family_room_parent_check`). Adding an icons branch to each
independently would have tripled the duplication going forward, so all
three now call one `verifyParentSecret(familyId, body)` helper that
branches once on `family.parent_auth_method`.

**Why a family-level method, not a per-parent one:** `parent_pin` was
already a single family-wide value (not per-parent-login), and nothing
in the request asked for individual parent accounts - `parent_icons`
follows the same shape (`families.parent_auth_method` +
`families.parent_icons`), so no new identity concept was introduced.

**Why no lockout on wrong icon attempts:** matches the existing PIN's
behaviour (wrong PIN just shows an error and lets the parent retry
immediately) rather than the stricter 2-attempt lockout used elsewhere
in the app for kid-side trade-image verification - that lockout exists
to stop a kid brute-forcing a trade approval, which isn't the threat
model here.

**Why `get_family_auth_method` is callable by either role:** Bedroom
Reset's Parent Check is triggered from a kid's own device, so the kid
session needs to know which UI (numeric pad or icon grid) to render
before a parent even shows up to authenticate - the action only ever
returns the method name, never the secret, so this doesn't weaken the
security boundary.

**Status:** Done.

## D-2026-07-19-reward-tracker-spin-weighting

**Context:** The user asked for four spin-wheel improvements: a sound
option, adjustable spin duration, customizable colours per option (colour
was already covered by the existing category colour picker), and
weighting so some options land more often than others. Asked before
building rather than guessing, since the weighting/options question
determines whether it needs a new data model.

**Options considered (with the user's answers):**
1. Wheel options: reuse `family_reward_categories` with weighting added,
   vs. a wholly separate "Spin Options" list independent of the reward
   categories. **Chosen: reuse + add weighting** - one list to manage,
   not two.
2. Sound: on by default vs off by default. **Chosen: on by default**,
   toggle in Settings.
3. Duration: one adjustable Settings value vs randomised per spin vs
   both. **Chosen: one adjustable value.**
4. Weighting style: a simple 1-5 relative weight vs percentages that must
   total 100%. **Chosen: simple 1-5 weight** - no cross-option math
   required to change one.

**Why wedge size = weight, not just invisible odds:** making the wedge's
*angular width* proportional to weight means a uniform-random landing
angle is automatically correctly weighted - there's no separate
weighted-random-selection step to get right or test independently, and
it's also the more honest visual: a category weighted 5 visibly *is* the
biggest slice, not secretly favoured behind an unchanged-looking wheel.

**Why sound is synthesized, not sound files:** no external assets to
fetch, host, or worry about size/licensing for - a few Web Audio
oscillator tones (ticks that spread out as the wheel decelerates, a
two-note chime on landing) cost nothing and need no network access,
consistent with this being a fully offline-capable PWA.

**Status:** Done. `family_reward_categories.spin_weight` (integer 1-5,
default 1), editable via a `<select>` next to each category in Manage
Categories. `manage_reward_categories`'s add/update now accept and
validate it. The wheel's `conic-gradient` wedges are sized by weight;
`runOneSpin()` simplified to a single uniform `Math.random() * 360` landing
angle instead of a separate index-then-jitter pick, since wedge geometry
now encodes the weighting itself. New Settings controls: a spin-sound
toggle (on by default) and a spin-duration slider (2-8s, default 2.6),
both per-device `localStorage`, same convention as dark mode and PIN
protection. Caught and fixed a real bug during testing:
`getSpinDurationSeconds()` read `Number(localStorage.getItem(...))`
directly - `Number(null)` is `0`, not `NaN`, so a never-set duration was
silently clamped to the 2-second minimum instead of falling through to
the intended 2.6s default; fixed by checking for `null` explicitly before
the `Number()` conversion. Verified via Playwright: wedge angles match
the 5:1 weight ratio exactly, sound-off/duration persist to localStorage
and the duration value actually changes the wheel's CSS transition
timing, and the weight `<select>` in Manage Categories reflects and
updates the right category. Bumped the reward-tracker service worker
cache to v10.

---

## D-2026-07-19-my-rewards-trading

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

---

## D-2026-07-18-reward-tracker-spin-wheel

**Context:** The user asked for an actual spinning reward wheel a kid can
watch land on a random category, added to their tally, operated from the
parent app. One of the seeded default categories has always been called
"Spin twice" - almost certainly a holdover from a real physical prize
wheel this app's whole reward-tracker concept is modelled on (the app's
own icon is a ferris wheel, 🎡), where earning "Spin twice" meant literally
getting to spin the wheel two more times.

**Options for what landing on "Spin twice" should do:**
1. Tally it like any other category (+1 "Spin twice" on the kid's balance).
2. Treat it as a wheel mechanic, not a reward: trigger two bonus spins
   automatically instead of logging anything for that landing.

**Decision:** Option 2.

**Why:** A literal "+1 Spin twice" tally entry would be a reward that
does nothing and means nothing on its own - the name only makes sense as
an instruction to the wheel, not a prize. Auto-triggering two more spins
is what the category is actually for, and it's a satisfying "landed on
a bonus" moment for a kid watching, closer to what the original physical
wheel almost certainly did. If a family renames or deletes that category
the spinner just treats it as a normal wedge - the special case matches
on the label "spin twice" (case-insensitive), not a schema flag, so it
degrades gracefully.

**Status:** Done. New "🎡 Spin" mode in `apps/reward-tracker`: a
conic-gradient wheel built from `state.categories`, CSS-transform spin
(always rotates forward from wherever it currently sits, never snaps
back, so a chained bonus spin continues smoothly), landing calls the
existing `adjust_reward` via `tapReward()` with an automatic note - no
backend changes needed. A `MAX_SPINS_PER_ROUND` safety cap (25) guards
against every category somehow being named "Spin twice" at once, which
would otherwise loop forever. Verified via Playwright with `Math.random`
stubbed to a fixed sequence, forcing a "Spin twice" landing followed by
two real landings and confirming: exactly two bonus spins fired, no
literal tally for "Spin twice" itself, correct balances for the two real
landings, and the button disables for the whole chain. Bumped the
reward-tracker service worker cache to v9.

---

## D-2026-07-18-poller-token-out-of-source

**Context:** `poller.py`'s `WORKER_TOKEN` was hardcoded as a plain
string literal. The user's next planned step was to push `poller.py`
to a (private) GitHub repo - doing that with the token still hardcoded
would put a real secret into git history permanently. Private
visibility doesn't protect against this risk (account compromise,
accidental collaborator access, a visibility toggle mistake), and
rewriting git history after a push is unreliable. The token had, at
the point this was caught, never been committed or pushed anywhere -
so there was nothing to clean up yet, only something to prevent.

**Options:**
1. Read the token from an environment variable, set wherever the
   script actually runs (cron/systemd/shell), never in the source file.
2. Read it from a separate config file that's git-ignored from the
   start.
3. Leave it hardcoded and just remember not to `git add` that one line
   (rejected outright - relies on manual discipline every future edit,
   exactly the kind of thing that eventually slips).

**Decision:** Option 1.

**Why:** No new file to manage or accidentally forget to `.gitignore`
- `poller.py` already runs exclusively via a cron job on the user's
  own machine, so an environment variable set in the crontab itself
  (a `NAME=value` line above the job entry - never a file that gets
  committed anywhere) is the natural fit. Fails closed (`sys.exit` with
  a clear message) if the variable isn't set, rather than silently
  running with an empty token and getting confusing `unauthorized`
  errors back from the edge function.

**Status:** Done. `poller.py` now does
`WORKER_TOKEN = os.environ.get("HOMELIFE_WORKER_TOKEN")` with a
fail-closed check right after. The actual secret value now lives only
in the user's crontab. Hit and resolved an unrelated crontab
gotcha along the way: an interactive `crontab -e` edit failed with
"bad minute" (cron mis-parsed the new env-var line as a schedule
line, root cause not fully pinned down - suspected an invisible
character from copy-paste). Worked around it with the more reliable
dump/edit/reinstall pattern (`crontab -l > file`, edit the plain file,
`crontab file`) instead of the interactive editor. Verified live via
the poller's own log output - clean polling plus a real
fingerprint-regeneration request processed successfully after the
crontab update took effect. `poller.py` is now safe to push to that
private repo whenever the user gets to it.

---

## D-2026-07-18-reward-tracker-instant-tap

**Context:** Even after `D-2026-07-18-reward-tracker-inline-plus-minus`
put `+`/`-` directly on each row, the user reported adding/spending as
"very slow, very lagging" and asked to drop the PIN on Spend and the
reason prompt entirely. Tracing the actual flow: every tap opened a note
modal (pick a preset or skip), Spend additionally required the PIN first,
and the balance on screen only updated after `adjust_reward` **and** a
full `loadState()` round trip had both completed - so a tap did nothing
visible until two sequential network calls finished.

**Options:**
1. Just remove the PIN gate and the note modal's blocking step, but keep
   awaiting the network before updating the UI.
2. Also make the balance update optimistically - update `state.balances`
   and re-render immediately on tap, fire `adjust_reward` in the
   background, then reconcile via `loadState()` without blocking on it.

**Decision:** Option 2.

**Why:** Removing the PIN and the modal fixes the "no reason" and
"no PIN" asks directly, but the "laggy" complaint was really about
latency between tap and visible feedback - which a modal and a PIN
prompt make worse, but don't fully explain on a slow connection even
without them, since the balance still wouldn't move until the network
finished. Optimistic updates fix that at the root: the number changes
the instant you tap, independent of connection speed, and the Undo toast
(already the existing safety net for a mis-tap) still catches anything
that needs correcting once the real write completes. This makes the note
modal fully unreachable, so it and its dedicated `#noteModal` DOM/CSS
were removed rather than left as dead code; the underlying
`family_reward_notes` table and "Manage reward reasons" screen
(`D-2026-07-18-reward-tracker-custom-reasons`) are untouched and still
reachable from Table view, just not wired into a tap for now.

**Status:** Done. `tapReward()` replaces `openNoteModal`/`commitTap`;
`requirePin` no longer wraps Spend in either Quick Tap or Table view
(still used for category delete, Reset, and Kid View exit). Verified via
Playwright with an artificially slow (800ms) mocked `adjust_reward` -
confirmed the balance updates in under 100ms regardless, and that no PIN
or note modal ever appears for either action. Bumped the reward-tracker
service worker cache to v8.

---

## D-2026-07-18-reward-tracker-inline-plus-minus

**Context:** Quick Tap required toggling a global "+ Earn / − Spend"
switch before tapping a category tile. The user reported the "− Spend"
button "does not work" - tracing it confirmed the switch's click handler
was in fact wired (the DOM-collision bug fixed in
`D-2026-07-18-reward-tracker-kid-theme-colours` was the root cause, not a
second bug), but the two-step flow itself was the real complaint: it's
easy to forget which mode is active and tap the wrong one. The user asked
for `+`/`-` to live directly on each reward row instead.

**Options:**
1. Keep the Earn/Spend mode switch, just fix its wiring.
2. Remove the switch entirely - each reward becomes a thin row (swatch +
   label + balance + its own `−`/`+` buttons), matching the Table view's
   existing per-cell button pattern. Grid auto-fits to 2+ columns on wide
   screens, 1 on mobile.

**Decision:** Option 2.

**Why:** A mode switch is a piece of state a parent has to remember is
set correctly before every tap - a chronic source of "I meant to spend
but it earned" mistakes, and exactly the kind of state that's easy to
break by accident (as the DOM-collision bug proved). Putting both
actions on the row removes the mode entirely: there's nothing to get
out of sync. It also reuses the same row shape the "make it more compact"
ask from earlier today was already pushing toward, so both requests
converged on one layout. Spend still requires the PIN via the same
`requirePin` gate as before - only which button starts that flow changed.

**Status:** Done. Removed `quickType` state and the Quick Tap
Earn/Spend switch; `.tileGrid`/`.tile` replaced with `.rewardRows`/
`.rewardRow` (CSS grid, `auto-fit, minmax(260px, 1fr)`). Verified via
Playwright, including the exact reported flow (tap `−` -> PIN prompt ->
note modal opens with "−1"). Bumped the reward-tracker service worker
cache to v7.

---

## D-2026-07-18-reward-tracker-kid-theme-colours

**Context:** In Quick Tap, nothing distinguished "which kid am I currently
tapping for" beyond the small selected-state on the kid picker chip -
easy to miss, especially with several kids. The user asked for it to be
obvious who a tap affects, suggested a per-kid colour "theme" that's
randomly assigned but customizable, plus separately asked for the Quick
Tap tiles to take up less space and for a warning on reward categories
nobody has ever used.

**Options (kid colour):**
1. Keep the existing client-side scheme (`KID_PALETTE[index % length]`,
   recomputed from a kid's position in `state.kids` on every render).
2. A new `theme_color` column on `kids` (shared table), randomly assigned
   from a curated palette when a kid is added (avoiding a sibling's
   colour where possible), overridable via `manage_kid`'s existing
   `rename` sub-action.

**Decision:** Option 2.

**Why:** The index-based scheme meant a kid's colour silently changed
whenever a sibling was added or removed before them in sort order -
identity that shifts based on unrelated changes is confusing, and it
can't be customized at all. Storing it on `kids` makes it stable and
lets a parent override it from Settings, same pattern as `avatar_emoji`.
Existing kids were backfilled with the exact colour they already
rendered as (position-based into the same palette) so nobody's colour
visibly changed by this migration - only newly-added kids get a genuinely
random assignment. Scoped the persisted column to the shared `kids`
table (correct normalization - it's kid identity, not reward-tracker
data) but only wired the UI into Reward Tracker for now; other apps
(bedroom-reset, parent-dashboard) could adopt it later without a schema
change.

**Decision (unused-category warning + compact tiles):** Added a
zero-usage check (`earned + spent === 0` across every kid) computed
client-side from data the app already has (`state.balances`), surfaced
as a summary line plus a per-row "Unused" badge in Manage Categories -
no new backend query needed. Shrank `.tile` significantly (row layout,
much smaller padding, no fixed min-height) since with per-kid colour
theming taking over the "who" signal, tiles no longer needed to be huge
to stay identifiable.

**Status:** Done. Migration `add_kids_theme_color`. Also fixed a real
bug found while building the active-kid banner: `#reasonsTypeSwitch`
(added in `D-2026-07-18-reward-tracker-custom-reasons`) reused the
`.earnSpendSwitch` class and sat earlier in the DOM than Quick Tap's own
switch, so `document.querySelector(".earnSpendSwitch")` had been
silently binding the Quick Tap Earn/Spend toggle's click handler to the
wrong element since that feature shipped. Fixed by giving Quick Tap's
switch a unique id.

---

## D-2026-07-18-reward-tracker-custom-reasons

**Context:** The note modal's preset "reasons" (e.g. "Tidied room",
"Redeemed today") were a fixed list hardcoded in `app.js`. The user asked
for these to be fully customizable - add or delete any, while keeping the
existing defaults as a starting point rather than wiping them out.

**Options:**
1. Keep the presets client-side but make them editable via localStorage
   (per-device, not shared across the family's parent devices).
2. A new family-scoped table (`family_reward_notes`), same pattern as
   `family_reward_categories` - seeded with the old hardcoded list as
   defaults via a per-family trigger, fully editable through a new
   `manage_reward_notes` edge-function action.

**Decision:** Option 2.

**Why:** Categories already prove this exact pattern works (server-owned,
per-family, seeded-then-editable) - reasons are the same shape of data,
so reusing it instead of inventing a device-local scheme keeps every
parent device in sync and matches how a parent already expects to manage
this kind of list. A reason is stored as free text on `kid_reward_log.note`
at tap time (not a foreign key), so deleting a reason from the list never
touches existing history - no confirm dialog or PIN gate needed for
delete, unlike deleting a category. Existing families were backfilled
with the same defaults the seed trigger gives new families, so nobody's
list started empty.

**Status:** Done.

---

## D-2026-07-17-poller-fingerprint-generation

**Context:** While deploying the "regenerate now" fingerprint feature
(`D-2026-07-17-fingerprint-regenerate-now`), the user shared their
actual current `poller.py`. It doesn't generate or use room
fingerprints at all - `llava_score` compares the submitted photo
directly against raw reference photos every time, and never reads
`job["room_fingerprint"]`. The whole fingerprint concept had drifted to
a parent-facing-description-only field, disconnected from scoring,
some time after `D-2026-07-13`-era work assumed poller.py would use it
for matching. The "Regenerate now" button was consequently a no-op on
the worker side - nothing would ever poll for or clear a pending
request.

**Options:**
1. Add fingerprint generation to `poller.py` as new, purely additive
   code - a new prompt/function plus a second poll loop - without
   touching the existing scoring pipeline.
2. Drop the fingerprint feature entirely (columns, actions, UI) since
   poller.py's direct-comparison approach already replaced what it was
   for, and it's currently dead weight.
3. Leave it as-is and let the button silently do nothing.

**Decision:** Option 1, per the user.

**Why:** The user wants the fingerprint field to keep working as a
parent-facing description even though it no longer feeds scoring - it
still has value as something a parent can glance at to confirm which
room a kid/room target maps to. Keeping it additive (new function +
second poll, zero changes to `process_job`/`llava_score`) means zero
risk to the scoring pipeline that's actually working well.

**Status:** Done. `generate_room_fingerprint()` added (llava:13b,
JSON-schema-constrained like the rest of the file, prompt explicitly
told not to judge tidiness - purely structural description). `main()`
now also polls `get_pending_fingerprint_regenerations` and submits via
the existing `submit_room_fingerprint` action. Delivered to the user as
a file (not committed to the repo - embeds `WORKER_TOKEN`, same as
every prior `poller.py` handoff).

---

## D-2026-07-17-my-rewards-kid-app

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

---

## D-2026-07-17-fingerprint-regenerate-now

**Context:** Room fingerprints regenerate lazily - only as a side effect of
the worker processing a submitted photo-scoring job. A parent clicking
"Clear (let AI regenerate)" therefore sees nothing happen until a kid
next submits a photo, which reads as broken (see the same-day fix for
the confirm-modal stacking bug reported in the same flow). User asked
for an explicit "regenerate now" action that doesn't wait for a kid.

**Options:**
1. Have the parent dashboard call the AI worker directly somehow (e.g. a
   webhook to the home server). Not viable - the home server has no
   public inbound endpoint, and exposing one just for this would be a
   real new attack surface for a cosmetic convenience feature.
2. Add a `room_fingerprint_regen_requested_at` timestamp column, set by
   a new parent-facing action, and a new worker-polled endpoint
   (`get_pending_fingerprint_regenerations`) that the worker checks
   alongside its existing photo-scoring poll. `submit_room_fingerprint`
   (already used by the lazy path) clears the timestamp when a fresh
   fingerprint lands, so both paths converge on the same completion
   signal.

**Decision:** Option 2.

**Why:** Keeps the pull-only architecture from
`D-2026-07-13-service-role-session-auth` intact - the cloud still never
reaches into the home network, the worker still just polls a bit more
often. A timestamp (not a boolean) doubles as "how long has this been
pending" for free, and reusing `submit_room_fingerprint` as the single
completion signal means no new worker-side concept for "which kind of
job just finished" - a fresh fingerprint value satisfies either an
explicit request or a lazy one.

**Status:** Done on the Supabase side. Migration
`room_fingerprint_regen`, new actions `request_fingerprint_regeneration`
(parent-gated, requires ≥1 reference photo, resets and unlocks the
fingerprint same as Clear) and `get_pending_fingerprint_regenerations`
(worker-gated, self-heals a request whose reference photos got deleted
before the worker got to it rather than looping on it forever).
`submit_room_fingerprint` now clears the timestamp on any successful
write. Parent dashboard shows a pending state (disabled buttons,
"⏳ Regeneration requested...") and polls every 8s for up to ~3 minutes
while the modal is open, swapping in the new fingerprint the moment it
lands. Deployed as edge function v19, verified via Node script and
Playwright (including simulating the worker's completion mid-poll by
writing the DB row directly, since the real `WORKER_TOKEN` isn't
available in this session and regenerating it would break the user's
live worker). `poller.py` itself - the actual new polling loop and
fingerprint-only generation call - still needs updating; the user's
current copy isn't in this session's context (never committed, embeds
the token), so it needs to come from them before it can be edited
precisely rather than reconstructed from memory.

---

## D-2026-07-17-agent-workflow-scaffold

**Context:** Another project (PACT) has an `AGENTS.md` + `.claude/commands/` skill set
(`add-task`/`pick-task`/`run-task`/`sweep-tasks`/`cleanup-branches`/`close-session`/
`log-ai-lessons`/`plan-for-review`) for AI-assisted roadmap work, built around a one-branch-per-task +
worktree + PR model. The user asked to bring the same kind of workflow to this repo.

**Options:**
1. Port the skills as-is, introducing branches/worktrees/PRs to this repo to match the source project's
   model.
2. Adapt the skills to this repo's own established convention instead — commit and push straight to
   `main`, no branches, no PRs (already documented in `AGENTS.md`'s "Project conventions" before this
   change) — and keep this repo's existing `AGENTS.md`/`CHANGELOG.md`/`DECISIONS.md`/`TASK_BOARD.md`
   content untouched, only adding the new `.claude/` files plus stub `CLAUDE.md`/
   `.github/copilot-instructions.md` files.
3. Skip the roadmap-automation skills (`pick-task`/`run-task`/`sweep-tasks`) entirely, since they're the
   ones most shaped by the source project's branch/PR assumptions, and only bring over `add-task`
   (already branch-less) plus the general-purpose ones (`close-session`, `log-ai-lessons`,
   `plan-for-review`).

**Decision:** Option 2 — ported all 8 skills, but rewrote `run-task`/`sweep-tasks`/`cleanup-branches` to
work directly against `main` with no worktree/branch/PR step, and left every existing governance doc's
content untouched (only appended this entry and the matching `CHANGELOG.md` line).

**Why:** This repo's `AGENTS.md` already states the established convention explicitly: "Commit and push
straight to `main`. No feature-branch workflow is in use for this repo currently." Introducing branches
purely to match a different project's tooling would contradict a documented, working convention for no
real benefit here — this repo also has no CI test gate to make a PR-based review step earn its cost the
way it might elsewhere. `sweep-tasks` in particular got an extra safety adjustment beyond a mechanical
port: since there's no PR gate, every push here goes live immediately (`deploy-pages.yml` deploys `main`
on every push), so `sweep-tasks` reviews the local diff before pushing (not after, since there's no PR to
attach the review to) and defaults to a smaller batch cap (2-3) than the source project's skill uses.
Option 3 was rejected because the roadmap-automation skills are still useful here even without
branches — they just needed the branch/PR assumptions stripped out, not the skills themselves discarded.

**Status:** Done.

---

## D-2026-07-17-reward-tracker-pin-and-insights

**Context:** The user asked to add a batch of features from a list they'd
been keeping for the original standalone app: a PIN lock on Spend/Delete/
Reset, a fairness/Insights view, a read-only Kid View, per-kid emoji
avatars, and a 5-second Undo toast. One item on their list (G2, cloud sync
via a private GitHub Gist) was explicitly skipped after checking with the
user - it would have meant storing family reward data in a GitHub Gist,
which conflicts directly with this project's security model (zero-policy
RLS, server-side-only access) and is redundant now that the app is fully
Supabase-backed (that was the point of the earlier session's work).

**Options for where the PIN check lives:**
1. Client-side only - compare against a PIN typed into a settings field.
2. Server-side, via a new `verify_pin` action that checks the family's
   `parent_pin` column (same one bedroom-reset's Parent Check already uses),
   same pattern as every other reward-tracker action that only requires a
   parent session.

**Decision:** Option 2.

**Why:** The PIN was never meant to be this app's actual security boundary
- whoever has the parent code already has full authority over every
reward-tracker action, PIN or not. What it's actually for is stopping a
kid from tapping Spend on a device a parent left logged in. Given that,
checking server-side costs nothing extra (one more `family-api` action)
and keeps the "PIN never touches the client" rule consistent with the
rest of this codebase, rather than special-casing this one feature to
compare a hardcoded value in the browser.

**Options for Insights data:**
1. Reuse `get_reward_state`'s existing 100-row history cap and compute
   weekly/monthly totals client-side from whatever's in that window.
2. A new `get_reward_insights` action that aggregates weekly/monthly
   earned, all-time balance, and top category server-side over the *full*
   ledger, independent of the history-view row cap.

**Decision:** Option 2.

**Why:** A family that's been using this for months will have more than
100 log rows; computing "this month's total" from a capped, most-recent
window would silently under-count and get worse over time. A dedicated
query with no cap avoids that, and keeps the aggregation logic in one
place (the ledger-summing pattern already used by `getRewardBalances`)
rather than duplicating it in the browser.

**Status:** Done. New actions: `verify_pin`, `get_reward_insights`,
`reset_reward_history` (wipes the ledger, keeps categories - the ledger
design from the original build made this a one-line delete). PIN
protection defaults on, toggleable per-device in Settings; the unlock
(5 minutes) is in-memory only, so it always resets on reload. Kid View
supports `?kid=<name>` to scope it to one kid for a dedicated tablet.
Avatars reuse the existing `kids.avatar_emoji` column via `manage_kid`
rename - no schema change. Verified via a disposable test family (PIN
accept/reject, insights aggregation, reset) and two Playwright runs
against a mocked backend covering the full UI surface (PIN gate on
spend/delete/reset/Kid-View-exit with wrong-then-right PIN, the 5-minute
unlock persisting across actions, Insights bars and stats, avatar
picker, PIN-protection toggle, Kid View both full and `?kid=`-scoped, and
the 5-second undo toast) - no console errors, no regressions in the
quick-tap/table/history/category-management flows from the previous round.

## D-2026-07-17-reward-tracker-app

**Context:** The user brought in a standalone "Reward Tracker" PWA they'd
built separately (single `index.html`, localStorage only, hardcoded to
three kid names with hardcoded colours) and wanted it added to this
monorepo, wired into the shared Supabase backend, and made consistent
with the rest of the suite. This meant deciding how it authenticates, how
its data is modeled, and whether it shares any of the existing
points/streaks/leaderboard system.

**Options for auth:**
1. Give it its own per-kid login like bedroom-reset (kid_code session).
2. Make it a parent-operated tool like the parent dashboard (parent_code
   session only) - a kid doesn't get their own reward-tracker session.

**Decision:** Option 2.

**Why:** The original app's own design intent was that kids can't quietly
adjust their own counts ("kids can't mess with counts if you leave it on
History view"). A parent-code gate matches that intent directly, and lets
one parent tap rewards for any of their kids from a single shared device
(a wall tablet), which is how the original was actually used. It also
reuses the *same* `homelife_parent_token` local storage key Parent
Dashboard uses, so a parent already logged into one is automatically
logged into the other on the same device (same origin, different path).

**Options for the data model:**
1. A `kid_reward_balances` table with running earned/spent totals,
   updated on every tap (mirrors `kid_streaks`'s running-total approach).
2. An append-only `kid_reward_log` ledger (kid, category, +1/-1, note,
   timestamp), with balances computed as a live sum at read time.

**Decision:** Option 2.

**Why:** A running-total table means Undo has to carefully reverse a
specific prior tap's effect on a shared counter, which is exactly the
kind of thing that drifts out of sync under a bug or a race. With a pure
ledger, Undo is just "delete that log row" and the balance is always
correct by construction - no separate state to keep in sync. The history
view the app already needed (for Undo) and the balances come from the
same table for free.

**Decision (currency):** Reward tallies are a separate currency from
`kid_streaks.total_points`, not merged into it or the public leaderboard.

**Why:** A reward category like "Macdonalds" or "$5 at the reject shop"
isn't the same kind of thing as a chore-completion streak - conflating
them would make the leaderboard compare families on an axis (what
rewards they've configured) that has nothing to do with chores done.

**Status:** Done. New tables `family_reward_categories` (parent-editable,
seeded with the original app's 9 default categories via a trigger on
family insert, same pattern as `family_bedroom_items`) and
`kid_reward_log`. Four new `family-api` actions: `get_reward_state`,
`adjust_reward`, `undo_reward_log`, `manage_reward_categories`. New app at
`apps/reward-tracker`, using the wheel icon from the original app as its
PWA home-screen icon while keeping the shared `apps/shared/icons`
favicon for the browser tab, matching every other app's convention.
Local JSON export/import and the per-category "Clear" button from the
original weren't carried over - data lives centrally in Supabase now, so
a browser-local backup isn't the safety net anymore, and Undo covers a
mis-tap instead. Verified against a disposable test family (categories
seed correctly, earn/spend/undo all adjust the ledger correctly, invalid
colors fall back to a default) before cleanup.

## D-2026-07-16-fingerprint-lock-and-parent-visibility

**Context:** The room fingerprint (see `D-2026-07-16-room-fingerprint`
below) is auto-generated by the worker and auto-invalidated to `null`
whenever a parent changes reference photos. The user asked for three
things on top of the shipped AI-scoring feature: a history view of past
attempts with a legit/false filter, a processing-time estimate so kids
stop re-submitting mid-score, and direct parent editing of the
fingerprint text. The editing request runs straight into the existing
auto-invalidation behavior: if a parent corrects a bad fingerprint and
then later adds one more reference photo, the existing invalidation
logic would silently wipe their edit back to `null` and let the worker
regenerate it from scratch.

**Options:**
1. Let a parent edit the fingerprint, but keep the existing
   invalidate-on-photo-change behavior unconditionally - simplest change,
   but a parent's correction is a ticking time bomb that vanishes on the
   next unrelated photo upload with no warning.
2. Add a `room_fingerprint_locked` boolean. A parent edit with non-empty
   text sets it `true` and all four invalidation call sites
   (`upload_reference_photo` / `delete_reference_photo` /
   `upload_family_room_photo` / `delete_family_room_photo`) skip
   invalidation while locked. Submitting an empty string clears both the
   text and the lock, explicitly opting back into AI auto-regeneration.

**Decision:** Option 2.

**Why:** A parent manually editing this text is a deliberate correction
- treating it as more authoritative than the next auto-generation, not
less, matches what a parent would expect. Making "clear the text" the
one explicit way back to auto-generate mode avoids a separate toggle
control while still being fully reversible in one action.

**Status:** Done. Migration `room_fingerprint_locked` adds the column to
`kids` and `family_rooms`. New `update_room_fingerprint` action (parent
session only) sets both fields together; all four invalidation call
sites gained a `.eq("room_fingerprint_locked", false)` guard. Also
shipped alongside: `get_photo_score_history` (up to 50 resolved rows,
newest first, client-side legit/false filter on `status`) and an
`ai_score_avg_seconds` figure (mean over the last 10 *scored* - not
failed - requests, to avoid near-instant local-check rejections skewing
the estimate) surfaced on both `get_kid_state` and
`get_family_room_state`. Deployed as edge function v12. The parent
dashboard combines all three into one "AI Scoring" modal per kid/room
(fingerprint editor + filterable history) rather than separate surfaces,
since they're all facets of the same AI-scoring management task for a
parent. The kid app shows the average both as a pre-submission hint
("usually takes about Xs") and as a live-ticking elapsed-time line while
a submission is pending, specifically to discourage repeated
resubmission attempts. Verified via Node script (lock persists through a
reference-photo upload, clearing resets both fields, history
ordering/filtering, average-seconds calculation) and Playwright against
a disposable test family (modal prefill, filter counts, save
confirmation, kid-app pending-state copy).

---

## D-2026-07-16-room-fingerprint

**Context:** After the gate/scorer split shipped, live testing surfaced a
new failure - the opposite direction from the earlier ones. A real photo
of the kid's own actual room got rejected by the scorer's room-match
step with a reason citing bedding pattern, flooring, and wall-color
differences. The room-match check compares the submission against raw
reference photos on every request (per the earlier
`D-2026-07-16-ai-anti-cheat-simplification` reasoning); bedding/linens
naturally look different from day to day - that's the whole point of a
tidiness check - but the model was treating that surface-level
difference as evidence of a different room entirely.

**Options:**
1. Tighten the room-match prompt wording (clarify "same bed" means the
   frame/furniture, not the linens) and hope the model reliably
   distinguishes structural identity from surface appearance on every
   comparison, against every reference photo, every time.
2. Move room-identity matching off raw photo comparison entirely: have
   a parent's reference photos produce one written "fingerprint" -
   fixed/structural features only (walls, flooring, windows, fixed
   furniture), explicitly excluding anything that's supposed to change
   between messy and tidy - generated once, cached, and reused for
   every future room-match check instead of re-deriving it from noisy
   raw images each time.

**Decision:** Option 2 - this directly reverses the "no stored
fingerprint" call from `D-2026-07-16-ai-anti-cheat-simplification`.

**Why:** Option 1 is the same category of fix that's already failed
twice this session (asking the model to reliably apply a subtle
distinction on every single call, under time/token pressure, with no
structural guarantee it does so consistently). Option 2 removes the
noisy signal (bedding) from the comparison entirely, by construction,
rather than hoping the model correctly discounts it every time. It also
only costs one extra model call per reference-photo-set (not per
submission) since the fingerprint is generated once and cached -
cheaper in aggregate, not more expensive. The earlier reasoning for
skipping a fingerprint ("the model already gets reference photos in
every request, no need to precompute") assumed raw-photo comparison
would work reliably; that assumption is what live testing disproved.

**Status:** Done. Migration adds `room_fingerprint` to `kids` and
`family_rooms` (null = needs (re)generation), invalidated automatically
whenever reference photos change via `upload_reference_photo` /
`delete_reference_photo` / `upload_family_room_photo` /
`delete_family_room_photo`. New worker-token-gated
`submit_room_fingerprint` action stores it; `get_pending_photo_scores`
returns the current value (or `null`) per job. Deployed as edge
function v11, verified via Node script (8 checks: pre-seeded value
returned, invalidation on upload, invalidation on delete, fresh
submission stored and returned, bad-input and wrong-token rejected).
`poller.py` generates a fingerprint lazily on first use per
kid/room and reuses it thereafter; reference photos are still sent to
the scorer for the separate tidiness-comparison step, only the
room-identity check moved to fingerprint text. Delivered to the user;
live confirmation that it actually stops the bedding false-rejection is
pending.

---

## D-2026-07-16-gate-scorer-split

**Context:** The layered pipeline from `D-2026-07-16-layered-anti-cheat-checks`
still had the `llava:13b` vision-model step doing one compound job -
decide if the photo is valid, and if so, score it - in a single
prompt/completion. A second opinion was sought from three independent
outside reviews. All three converged on the same root-cause diagnosis,
different from the "OOD detection" framing used up to that point: this
is "completion bias" (sometimes called sycophancy) - asking one model
call to both gatekeep *and* perform a task biases it toward performing
the task even on input that should be rejected, because the model has
a strong prior toward completing the pattern it's given rather than
refusing. All three also converged on the same fix, independently.

**Options:**
1. Keep iterating on the single compound prompt's wording (more
   examples, stricter language, chain-of-thought instructions inside
   the same call).
2. Split into a perception-only gate call (reports observed evidence,
   never a self-asserted `valid` boolean) followed by a separate scorer
   call, with plain code - not the model - deciding pass/fail from the
   gate's evidence fields. Add a cheap `moondream` pre-gate ahead of
   that for the clear-cut cases, and switch to Ollama's `format`
   JSON-schema parameter (constrained output) instead of parsing JSON
   out of prose.

**Decision:** Option 2.

**Why:** Option 1 keeps the same structural problem - the model still
has an incentive to bias toward "yes, this is scoreable" as long as
it's the one deciding whether to continue. Removing the model's ability
to make that call at all (report evidence, let code apply the rule) is
a categorically different fix, not a stronger version of the same one.
The `format` JSON-schema switch is a straightforward correctness
improvement (constrained output beats regex-extracting from prose)
adopted regardless of the rest. The `moondream` pre-gate reuses a model
already pulled, at zero extra dependency cost, and only auto-rejects on
a *confident* no - it's a cheap first pass, not a sole authority.

**Status:** Done - `poller.py` rebuilt with this architecture and
delivered to the user (not committed to this repo - it embeds
`WORKER_TOKEN`). Not yet confirmed against the real worker (see
`docs/TASK_BOARD.md`, 🔴 NOW). Several other ideas surfaced by the same
review round (a deterministic scene-classifier gate, reference-photo
embedding similarity, evaluating newer local VLMs, a daily anti-cheat
capture token, a parent-review state) were deliberately not built this
round - logged as 🟢 LATER tasks rather than expanding scope further
before confirming this round actually works.

---

## D-2026-07-16-layered-anti-cheat-checks

**Context:** Live testing on the user's real Ubuntu/Ollama box (after
fixing an unrelated model-tag mismatch, `llava` vs `llava:13b`)
surfaced that the single consolidated prompt did not reliably reject
an obviously-invalid photo - a flat-lay of shoes on outdoor pavement
was scored as if it were a messy bedroom, inventing feedback about
shelves and closets that weren't in the photo. This isn't a prompt
wording bug so much as a real capability limit: small/older vision
models are known to be inconsistent at refusing to answer versus
guessing, and no amount of prompt tweaking reliably fixes that.

**Options:**
1. Keep iterating on the prompt wording alone, hoping to find phrasing
   `llava:13b` follows more reliably.
2. Try a bigger/different vision model - more capable, but a
   multi-gigabyte download of uncertain fit for the user's hardware,
   and no guarantee of actually fixing this class of failure.
3. Run the same compound question multiple times and vote - helps with
   *inconsistent* answers, not *consistently wrong* ones, and this
   failure looked confident and consistent, not wavering.
4. Add cheap, deterministic (no-AI) checks in front of the model for
   the failure modes that don't actually need visual judgment - blank/
   blurry photos (measurable directly from pixel data) and reused
   photos (a perceptual-hash comparison against the target's last
   scored photo) - so the model is only asked the judgment calls that
   genuinely need a vision model, narrowing what it has to get right.

**Decision:** Option 4, layered in front of the existing prompt (which
still handles room-type/room-matching, since those genuinely do need
visual judgment).

**Why:** Options 1-3 all still route every photo through the same
model for the same broad judgment call, so none of them address the
actual failure mode - a model that doesn't hedge on out-of-distribution
input. Option 4 doesn't try to make the model more reliable at things
it's bad at; it removes two whole categories of check (blank/blurry,
reused) from the model's job entirely, since those are measurable
facts, not judgment calls, and a deterministic check can't hallucinate.
That leaves the model responsible only for what actually requires
seeing and understanding an image (is this the right room, is it
tidy) - a narrower, more honest scope for what a local 13B vision
model can be trusted with.

**Status:** Repo side (schema `photo_hash` column, edge-function
plumbing) deployed as edge function v10, verified via Node script.
`poller.py` rebuilt with the layered pipeline and delivered to the
user - confirming the blank/blur and duplicate checks live, and
re-testing the AI layer's room-validity judgment specifically, is not
yet done (see `docs/TASK_BOARD.md`). The underlying model-capability
limitation is not "solved," only narrowed in scope - flagged as an
open risk for the `auto_approve` mode specifically.

---

## D-2026-07-16-ai-anti-cheat-simplification

**Context:** The task board scoped the AI scoring-quality/anti-cheat
cluster as ~10 separate tasks, including storing a "room fingerprint"
(extracted features from reference photos, saved to a new column) to
compare submitted photos against, and reading EXIF timestamps for
freshness checks. Building this out surfaced that some of that scope
wasn't actually needed, and one piece (EXIF) wouldn't have worked at
all.

**Options:**
1. Build it exactly as scoped: a fingerprint-extraction step, a new
   schema column to store it, comparison logic, and EXIF-based
   freshness checks.
2. Simplify: drop the fingerprint storage (the model already gets the
   room's reference photos in every scoring request, so it can compare
   directly, in the same call); replace EXIF with a client-captured
   timestamp; use the schema's existing but unused `'failed'` status
   for rejections instead of overloading `score` with a fake `0`; and
   collapse the ~8 prompt-related tasks (consistency, structured
   output, room detection, invalid-photo rejection, room matching,
   actionable feedback, child-friendly tone, consolidation) into one
   prompt from the start, since "consolidate into one prompt" was
   already the end state the original scoping was building toward.

**Decision:** Option 2.

**Why:** `get_pending_photo_scores` already returns the submitted photo
*and* the room's reference photos together - a fingerprint would have
been storing a lossy summary of information the model already receives
in full on every request, for no real benefit. On freshness: this
project's own client-side compression (`apps/shared/image.js`)
re-encodes photos through a canvas, which strips EXIF - so an
EXIF-based check would have silently never worked, since the only
place a photo exists in the pipeline is post-compression. Capturing
`file.lastModified` before compression sidesteps that entirely. On
`'failed'` vs `score: 0`: the schema already had a status value for
exactly this case; using it is more explicit than teaching every
consumer of `ai_score` that `0` is a special sentinel.

**Status:** Done for the repo-side pieces (freshness validation, the
`failed`/rejection path, exposing `rejection_reason` to both apps) -
deployed as edge function v9 and verified against a disposable test
family. The consolidated-prompt piece lives in `poller.py` on the
user's Ubuntu box, outside this repo - delivered but not yet confirmed
redeployed (see `docs/TASK_BOARD.md`).

**Superseded (partially):** the "no stored fingerprint" reasoning above
turned out to be wrong in practice - see `D-2026-07-16-room-fingerprint`.
Comparing against raw reference photos on every request meant ordinary
day-to-day bedding differences got read as evidence of "a different
room," causing real false rejections. The freshness (`lastModified`)
and `'failed'`-status decisions above still stand; only the
no-fingerprint call was reversed.

---

## D-2026-07-16-governance-docs

**Context:** `CHANGELOG.md`, `DECISIONS.md`, and a task board weren't
being used consistently — open ideas, finished work, and the reasoning
behind non-obvious choices all lived only in conversation history,
which doesn't survive between sessions.

**Options:**
1. Keep relying on conversation history and the task board's own prose
   to carry this context.
2. Set up dedicated `AGENTS.md` (canonical instructions), `DECISIONS.md`
   (why), and `CHANGELOG.md` (what shipped) files, with `TASK_BOARD.md`
   trimmed to hold only open work.

**Decision:** Option 2.

**Why:** A task board that also tries to be a changelog and a decision
log ends up doing all three badly — finished work clutters the list of
what's actually next, and the reasoning behind a fix gets lost once the
task line is deleted. Splitting them keeps each file scannable for its
one job, and `AGENTS.md` gives a fresh session (human or AI) one place
to learn the rules instead of re-deriving them from history.

**Status:** Done.

---

## D-2026-07-16-task-board-restructure

**Context:** `docs/ROADMAP.md` was a flat list of scoped-but-unbuilt
ideas with no priority, status, or acceptance criteria — every entry
read the same regardless of urgency or how close to done it was.

**Options:**
1. Keep the flat prose-list format, just add new ideas to it.
2. Restructure by priority (NOW/NEXT/LATER) with tags, a status per
   task, and a concrete "done when" condition on every task, while
   keeping a "Design notes" block for tasks that need real technical
   depth to be picked up cold.

**Decision:** Option 2, and renamed the file (`ROADMAP.md` →
`TASK_BOARD.md`, via an intermediate `TASK-LIST.md`) to match its new
purpose.

**Why:** "Improve the AI prompt" never closes; "obviously messy test
photos consistently score below 5" does. The old format's real strength
— enough implementation detail that a cold pickup doesn't require
re-deriving the design — was worth keeping for big tasks, so that
became an optional nested section rather than being dropped for the
sake of scannability.

**Status:** Done. Superseded the "Also deferred" / flat-idea format.

---

## D-2026-07-15-worker-token-auth

**Context:** The AI photo-scoring worker (a script on the user's home
network) needs to call two edge-function actions
(`get_pending_photo_scores`, `submit_photo_score`), but it isn't a
parent or a kid — it has no session token, and Supabase Auth JWTs
aren't used anywhere in this project (see the RLS/session-token
pattern in `AGENTS.md`).

**Options:**
1. Force the worker into the existing parent/kid session-token model
   somehow (e.g. a synthetic "worker family").
2. A separate, simple static-secret scheme: a `WORKER_TOKEN` edge
   function secret, compared via equality, fails closed if unset.

**Decision:** Option 2.

**Why:** The worker is a single trusted process on the user's own
network, not a multi-tenant actor — it doesn't need per-family scoping
or rotation machinery, just a bar high enough to keep the two
worker-only actions from being callable by a browser. Reusing the
session-token model would have added complexity (fake family/kid rows)
for no real security benefit.

**Status:** Done.

---

## D-2026-07-15-ai-scoring-configurable-modes

**Context:** Initial scope for AI room-tidiness scoring was
informational-only (just show a score). While scoping the build, the
user's answer to "how should the score affect the app?" expanded this:
they wanted the option to tie it to the existing Parent Check flow.

**Options:**
1. Ship informational-only, revisit auto-approval later as a separate
   feature.
2. Build a per-family configurable mode from the start: `off` /
   `informational` / `nudge` / `auto_approve` (with a threshold),
   sharing the exact points/streak logic the PIN-confirmed Parent
   Check already uses.

**Decision:** Option 2.

**Why:** The user explicitly wanted control over how much to trust the
AI before it can act on its own — informational-only would have meant
rebuilding the mode system later anyway once someone wanted
auto-approval. Reusing the existing pass-award logic (extracted into
shared `awardBedroomPass`/`awardRoomPass` helpers) meant auto-approve
could reuse the same points/streak/idempotency guarantees as a human
check, rather than reimplementing them.

**Status:** Done. Auto-approve currently awards the same points as a
PIN-confirmed pass, on purpose, to keep the model simple — open to
revisit if that's judged to undervalue the human check (tracked as an
open question in `TASK_BOARD.md`).

---

## D-2026-07-15-ai-scoring-pull-architecture

**Context:** The AI vision model runs on the user's home network
(Ollama), but Supabase's edge function runs in the cloud. The cloud
side has no way to reach into a home network without port forwarding,
a tunnel, or a public endpoint.

**Options:**
1. Push architecture — Supabase calls out to the home network when a
   photo is submitted, requiring the user to expose something inbound.
2. Pull/poll architecture — a script on the home network polls
   Supabase for pending work and posts results back; nothing inbound
   needed on the user's side.

**Decision:** Option 2.

**Why:** Home networks are asymmetric by default — outbound is easy,
inbound requires the user to actively expose their network, which is a
real security cost for a chore-tracking app. Pull/poll trades a small
amount of latency (poll interval) for zero exposure.

**Status:** Done.

---

## D-2026-07-15-reference-photos-parent-only

**Context:** Kids could add and remove their own "what done looks
like" reference photos. The user reported this as unwanted — kids
were removing photos from their own view — and asked for parent-only
control.

**Options:**
1. Keep kid photo management but fix whatever bug let them remove
   photos unexpectedly.
2. Remove kid photo-management entirely: client UI removed for kids,
   and — the part that actually matters — the edge function's
   `upload_reference_photo` / `delete_reference_photo` /
   `upload_family_room_photo` / `delete_family_room_photo` actions
   reject any session that isn't `role === "parent"`.

**Decision:** Option 2.

**Why:** This was a real permissions gap, not just a UI bug — a kid
session could call the same edge-function actions directly regardless
of what the UI showed. Removing the client-side controls alone
wouldn't have closed that; the server-side role check is the actual
fix, per the standing rule that the edge function is the only real
security boundary in this project.

**Status:** Done. Verified with real backend requests proving a kid
session is rejected while a parent session still succeeds.

---

## D-2026-07-13-photo-delete-dashboard-x

**Context:** Reported bug: removing a reference photo appeared to do
nothing — the screen "flashed," and the photo was still there after
closing the dialog. Root cause: `.confirmModal` rendered behind the
open `.lightbox` (lower z-index), so the confirm dialog was invisible
and unclickable.

**Options:**
1. Fix the z-index bug only, keep the existing
  lightbox-then-confirm-modal delete flow.
2. Remove that flow entirely and add a direct ✕ button on each photo
   tile on the dashboard itself, per the user's own stated preference
   ("ideally it would just be a x on the dashboard instead").

**Decision:** Option 2 — plus defensively bumped `.confirmModal`'s
z-index above `.lightbox`/`.pinModal` in both apps anyway, to prevent
the same class of bug recurring elsewhere.

**Why:** The user's explicit preference was for a simpler, more
discoverable interaction, not just a working version of the old one.
Fixing only the z-index would have solved the report but ignored the
better UX that was asked for directly.

**Status:** Done.

---

## D-2026-07-13-android-keyboard-autofocus

**Context:** Reported bug: on Android, the on-screen keyboard never
appeared on the code-entry screen, so the code couldn't be typed at
all.

**Options:**
1. Detect Android via user-agent sniffing and special-case the focus
   timing.
2. Remove the programmatic `.focus()` call on page load entirely and
   rely on the user's own tap to focus the field.

**Decision:** Option 2.

**Why:** Root cause was that Android Chrome doesn't summon the
on-screen keyboard for a script-triggered `.focus()`, and having the
field already-focused on load also blocked a subsequent real tap from
re-triggering focus — so removing the auto-focus fixes it everywhere,
with no browser-sniffing and no risk of missing some other affected
device/browser combination.

**Status:** Done. Verified via Playwright that no element is focused
immediately after page load.

---

## D-2026-07-13-parent-agnostic-wording

**Context:** The app referred to the checking parent as "Mum"
throughout — DB columns, edge function action names, UI text, CSS
class names — which doesn't fit every family.

**Options:**
1. Add a configurable label per family (e.g. "Mum," "Dad," "Nana")
   stored as a setting.
2. Rename everything to a neutral "Parent" — DB columns, action names,
   event types, UI copy, CSS classes — with a data migration for
   historical rows.

**Decision:** Option 2.

**Why:** The user's own framing was "not bad but just a parent or
something" — a configurable label was more machinery than the request
called for, and "Parent" already reads naturally in every context the
old "Mum" wording appeared in. A full rename (not just UI copy) keeps
the codebase itself consistent instead of leaving `mum_check` etc. as
an internal name mismatched with what's shown to users.

**Status:** Done. Verified with a full-repo grep confirming zero
remaining "mum" references, and a regression test proving behavior is
unchanged post-rename.

---

## D-2026-07-13-service-role-session-auth

**Context:** The app needs to keep each family's data completely
separate from every other family's, and keep kids from accessing
anything beyond their own account, without requiring parents to go
through a full signup flow (email, password, verification) for what's
essentially "type in a code your parent sent you."

**Options:**
1. Use Supabase's built-in Auth (email/password or magic-link
   signup), with RLS policies written per table to scope access by
   the logged-in user's ID.
2. Enable RLS on every family/kid table with zero policies defined
   (so the public/anon key can't touch them at all), and route every
   read/write through a single edge function (`family-api`) that
   holds the service-role key and enforces per-family/per-kid access
   itself, authenticating callers via a simple opaque session token
   issued when a parent code or kid code is redeemed — not a Supabase
   Auth JWT.

**Decision:** Option 2.

**Why:** The whole point of this app is that a parent hands a kid a
short code and a device remembers it — there's no email, no password,
nothing to "sign up" for. Building that on top of Supabase Auth would
mean either forcing a real account system onto a use case that
doesn't need one, or fighting Auth's session model to fake code-based
login on top of it. Locking every table down completely and putting a
single, fully-controlled function in front of all of them is simpler
to reason about than writing and auditing a separate RLS policy per
table — there's exactly one place permission logic lives.

**Status:** Done — this has been the architecture since the project's
first commit. Documented in `supabase/functions/family-api/index.ts`'s
header comment; backfilled here because it predates this session's
decision log and had never been written down anywhere else. Caveat
worth keeping in mind going forward: because this one function is the
*only* line of defense (no RLS policies backing it up), a missed
permission check in a new edge-function action is a real hole, not
just a redundant safeguard failing — the parent-only-photos fix
earlier this session (D-2026-07-15-reference-photos-parent-only) was
exactly that shape of bug. Every new action added to `family-api`
needs its access check reviewed as carefully as the rest of the
function.
