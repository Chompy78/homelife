# Decisions

A record of real decisions made on this project — choices between
options, design directions, fixes for non-obvious problems. Newest
entry on top. See `AGENTS.md` for the format and when to add one.

---

## D-2026-07-27-reward-tracker-big-rewards

**Context:** The family wanted a way to record ad-hoc "big" rewards - things bigger and rarer (1-2 per
month per kid) than a category tap in the existing Quick Tap tally, each with its own reason (when
earned) and what-it-was-spent-on (when spent later), both dated.

**Options considered:**
1. Two independent, unlinked log rows (an "earn" entry and a "spend" entry), mirroring
   `kid_reward_log`'s append-only ledger model.
2. A single record per big reward that moves through a lifecycle: `pending` (earned, reason + date) ->
   `spent` (what it went on + date), updated in place rather than only ever inserted/deleted.
3. Fold big rewards into the existing `family_reward_categories`/`kid_reward_log` tally as just another
   category, distinguished by a flag.

**Decision:** Option 2 - a new `kid_big_rewards` table, one row per big reward, with a `status` column
(`pending`/`spent`) and separate `add_big_reward` / `spend_big_reward` / `undo_big_reward_spend` /
`delete_big_reward` edge function actions. Free text only (reason, spent_on) - no dollar or point amount.
No PIN gate on editing/deleting (matches how low-frequency and low-stakes this is - a parent already has
full access via the parent code, same as every other reward-tracker action). Surfaced as a new "🎁 Big"
tab in `reward-tracker` (add/spend, parent-only) and read-only in `my-rewards` (a kid sees their own
pending + spent big rewards on their card).

**Why:** Option 1 loses the "this reward is still waiting to be spent" concept entirely - there'd be no
way to show a kid (or parent) which earned rewards haven't been cashed in yet, which is exactly the
detail that makes this worth a dedicated feature instead of just another category tap. Option 3 conflates
two different kinds of currency: the tap tally is a running balance summed live over an append-only
ledger (Undo = delete the row), while a big reward is a one-off event with its own narrative (why it was
earned, what it became) that doesn't compose with a balance at all - forcing it into that shape would
either fake a fractional balance or lose the reason/spent-on text. Option 2's "row updated in place"
departs from `kid_reward_log`'s immutable-ledger convention, but that's the right shape here: a big
reward genuinely has one lifecycle (earned -> spent), not two independent events to reconcile.

**Status:** Done.

---

## D-2026-07-26-kid-trade-balance-enforcement

**Context:** A kid could use `my-rewards`' propose-trade flow to offer a reward category they had zero (or
fewer than the offered quantity of) balance in — the "you give" picker listed every family reward category
regardless of the kid's actual holdings, and neither `propose_trade` nor `respond_to_trade` validated
balance server-side at all. Needed to decide where in the trade lifecycle to enforce "can't give away what
you don't have," given a trade has two distinct moments (propose, accept) separated by unbounded time
during which either kid's balance can change.

**Options considered:**
1. Client-side picker restriction only (hide categories with insufficient balance).
2. Server-side check at propose time only.
3. Server-side check at accept time only.
4. Both: propose-time check (fail fast, good UX) plus an authoritative accept-time re-check that
   auto-cancels a trade whose balances no longer hold up.

**Decision:** Option 4.

**Why:** Option 1 alone violates this project's standing rule that a client-side UI restriction is never a
real security boundary (see `AGENTS.md`'s "Project conventions") — a kid could still hit the edge function
directly. Option 2 alone leaves a real gap: balances are a live sum over `kid_reward_log`, and either kid's
balance can shift between propose and accept (spent elsewhere, traded away in a different pending trade,
etc.), so a trade valid at propose time can still push a balance negative at accept time. Option 3 alone
means a kid sees a trade offer that looks valid in the UI but silently fails (or worse, isn't checked at
all currently) — worse UX with no fail-fast feedback. Option 4 gives immediate feedback when a trade
obviously can't be proposed, while keeping the actual boundary at the point balances are mutated (accept).
A trade that no longer checks out at accept time is auto-cancelled (`status: "cancelled"`) rather than left
pending forever or silently rejected with no state change, so it disappears from both kids' pending lists
instead of becoming a permanently-stuck ghost offer.

**Status:** Done.

---

## D-2026-07-20-pwa-to-capacitor-migration-assessment

**Context:** Child tablets hit Google Family Link's daily screen-time limit and the installed PWAs
(bedroom-reset, reward-tracker, my-rewards, parent-dashboard) may stop opening, while Chrome can't safely
be marked "Unlimited" - that would also unlock YouTube and general browsing. Asked for a practical
assessment of migrating from the current no-build vanilla-JS PWA architecture to React + TypeScript +
Vite + PWA + Capacitor Android, to give these apps their own independent Android app identity that
Family Link can allow/restrict separately from Chrome.

**Options considered:**
1. Keep the current vanilla PWA structure as-is.
2. Convert to React + Vite + PWA only, no native wrapper.
3. React + Vite + PWA + Capacitor Android - a real native wrapper per app.
4. Bubblewrap / Trusted Web Activity - a thin native shell pointing at the existing live URL.

**Decision:** Option 3, staged so the Family-Link assumption is proven on a trivial "hello world" scaffold
before committing to porting any of the 5 real apps. The resulting execution plan is on
`docs/TASK_BOARD.md` as Migration M2 through M8, with a M2b/M2c Family-Link proof-of-concept pair inserted
before any real app porting, plus a LATER item to port the remaining 4 apps once a template exists from
the first port.

**Why:** Options 1 and 2 don't touch the actual problem - a browser-installed PWA (1) or a Vite-rebuilt PWA
(2) both still depend on Chrome/WebAPK wrapping, whose interaction with Family Link's per-app controls is
inconsistent across Android/Chrome versions and outside this project's control either way. Option 4 (TWA)
gives an app its own Android identity but still renders live content through the device's Chrome/WebView
component, plausibly carrying some of the same attribution ambiguity, just less severely - a real
Capacitor-wrapped native app runs its WebView inside its own process, which is the actual mechanism that
reliably lets Family Link treat it independently of Chrome. The existing backend (the `family-api`
Supabase edge function) is already fully framework-agnostic, and the current `apps/shared/*.js`
ES-module layer already separates business logic from DOM-wiring reasonably well - the riskiest,
highest-value part of the stack (data access, auth, per-family/per-kid scoping) needs zero changes under
any option, which meaningfully de-risks a frontend rewrite.

Sequencing the Family-Link proof-of-concept (M2b/M2c) *before* real app porting (M3 onward) specifically
keeps the cost of being wrong low: if Family Link still can't reliably distinguish a Capacitor-wrapped app
from Chrome on the actual tablet/Android version in use, that's cheap to discover on a throwaway "hello
world" scaffold and expensive to discover only after fully porting all 5 real apps.

**Status:** Open (revisit if Migration M2c's Family Link test fails - see that task's "decision gate"
framing on `docs/TASK_BOARD.md`).

## D-2026-07-20-ios-support-sequencing

**Context:** After the migration assessment above and its resulting Android-focused task-board plan
(Migration M2-M8), it came up that some family members are Apple/iOS users who also need this app.
Needed to assess how much this changes the recommendation and plan.

**Options considered:**
1. Treat iOS as equally in-scope from the start, running an iOS proof-of-concept alongside Android's
   (Migration M2b/M2c).
2. Prove Android fully first (through Migration M7), then run a separate iOS proof-of-concept track
   afterward.
3. Reconsider the architecture entirely now that iOS is required (e.g. weigh Bubblewrap again).

**Decision:** Option 2. Android is proven fully first; a separate iOS track (Migration iOS-1/iOS-2/iOS-3)
follows, using a cloud Mac CI service since no local Mac is available, starting with free-tier
device-registered installs on the 1-2 known family Apple devices before deciding whether the $99/year
Apple Developer account + TestFlight is warranted.

**Why:** Capacitor already supports iOS as a symmetric additive step (`npx cap add ios` alongside
`npx cap add android`) on the same web codebase, so the underlying recommendation doesn't change - if
anything it's reinforced, since Option 4 (Bubblewrap/TWA) has no iOS equivalent at all and is now
definitively ruled out, not just a weaker second choice. What does change is cost and risk: iOS needs a
genuinely new toolchain dependency (a cloud Mac CI service, since Xcode is Mac-only and no local Mac
exists here) and a recurring cost Android didn't have (the $99/year Apple Developer Program, needed for
any distribution beyond a 7-day-expiring free-tier test build - unworkable for a kid's daily-use app
long-term). It also introduces a second, separate unverified assumption: whether Apple's Screen Time
(App Limits / Always Allowed) treats a Capacitor-wrapped app independently of Safari - unverified either
way, and doesn't inherit from the Android Family Link result. Proving Android first avoids paying for
cloud Mac CI and risking a second platform's effort while the core premise is still unverified on either
platform, and avoids splitting focus across two unfamiliar toolchains at once.

**Status:** Open (revisit once Migration M7 passes and the iOS track begins).

## D-2026-07-20-pwa-version-display

**Context:** No device running any of the four PWAs had any visible way to confirm which build it was
actually on - the only version-like signal that exists at all is each app's own `CACHE_NAME` in its
`service-worker.js`, invisible to whoever's using the app. Wanted to surface it in the UI so a stale
cached device could actually be identified as such, without inventing a second version string to keep in
sync.

**Options:**
1. Duplicate the version as a separate constant in `app.js`/`index.html`, bumped alongside `CACHE_NAME`.
2. Have the page ask its active service worker for the version via `postMessage`/message-channel.
3. Have the page directly `fetch("./service-worker.js")` and regex out `CACHE_NAME` from the source text.

**Decision:** Option 3.

**Why:** Option 1 is exactly the kind of duplication this project has been actively removing all week
(shared `confirm.js`/`lightbox.js`/`escape.js`) - a second hand-typed copy is a second place to forget to
bump, defeating the point. Option 2 is the "correct" way to talk to a service worker but needs a
registration-ready check, a message round-trip, and still needs a fallback for the pre-install/first-load
case - real complexity for four apps that don't otherwise do any SW message-passing. Option 3 is a plain
`fetch` of a file already being served, works identically before and after install, and naturally reflects
whichever service worker instance is currently intercepting that fetch (the old one until it hands off to
a newly-activated one), which is exactly "what this device is actually running right now."

**Status:** Done.

---

## D-2026-07-20-rename-code-commands

**Context:** The user maintains a separate family of lighter "-chat-" Claude.ai Skills elsewhere
(project-tracking, no git/PR workflow) alongside these heavier engineering `.claude/commands/` skills.
Both families were becoming hard to tell apart by name alone. The user's other repo, PACT, already solved
this by inserting `-code-` into its 8 equivalent command filenames.

**Options:**
1. Leave the names as-is; rely on remembering which repo/context a command belongs to.
2. Mechanically insert `-code-` into every filename (`add-task.md`→`add-code-task.md`, etc.), no
   exceptions.
3. Mirror PACT's exact precedent: mechanical insertion for 6 of 8, but a deliberate rewrite for the 2
   where a literal insertion reads worse than a name that better matches what the command actually
   produces (`log-ai-lessons.md`→`log-code-lesson.md`, not `log-ai-code-lessons.md`;
   `plan-for-review.md`→`make-code-cold-plan-review.md`, not `plan-code-for-review.md`).

**Decision:** Option 3. Renamed (via `git mv`, so history follows): `add-task.md`→`add-code-task.md`,
`pick-task.md`→`pick-code-task.md`, `run-task.md`→`run-code-task.md`,
`sweep-tasks.md`→`sweep-code-tasks.md`, `cleanup-branches.md`→`cleanup-code-branches.md`,
`close-session.md`→`close-code-session.md`, `log-ai-lessons.md`→`log-code-lesson.md`,
`plan-for-review.md`→`make-code-cold-plan-review.md`. Updated cross-references between the command files
themselves and in `AGENTS.md`'s "AI agent workflow shortcuts" section.

**Why:** These two commands' descriptions are identical in substance to PACT's own commands of the same
original name, so the same reasoning applies directly: `log-ai-lessons` already implied "AI" in a way
that duplicated the new `-code-` marker's purpose, and dropping it plus singularizing to `lesson` better
matches the command drafting one candidate at a time; `plan-for-review` didn't say what kind of plan,
while `make-code-cold-plan-review` names the actual artifact (a plan written for a reviewer with no
shared context). Deliberately left `CHANGELOG.md`, `DECISIONS.md`, and `docs/sessions/*.md` using the old
names — they're a historical record of what happened at the time, not something to retroactively rewrite.

**Status:** Done.

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

**Status:** Done

**Summary:** Added actual fingerprint generation to poller.py (additive, new function + second
  poll) after discovering the deployed worker never implemented the fingerprint concept at all.

**Record:** decisions/2026/D-2026-07-17-poller-fingerprint-generation.md

## D-2026-07-17-my-rewards-kid-app

**Status:** Done

**Summary:** Built a separate, read-only my-rewards PWA (its own installable icon, kid_code
  login) rather than a second login mode bolted onto the parent-only Reward Tracker.

**Record:** decisions/2026/D-2026-07-17-my-rewards-kid-app.md

## D-2026-07-17-fingerprint-regenerate-now

**Status:** Done

**Summary:** Added an explicit parent-triggered 'regenerate now' fingerprint request (polled by
  the worker) instead of only regenerating lazily on the next photo submission.

**Record:** decisions/2026/D-2026-07-17-fingerprint-regenerate-now.md

## D-2026-07-17-agent-workflow-scaffold

**Status:** Done

**Summary:** Ported PACT's 8-command AI agent workflow to this repo, adapted to
  commit-straight-to-main with no branches/worktrees/PRs, since this repo already works that
  way.

**Record:** decisions/2026/D-2026-07-17-agent-workflow-scaffold.md

## D-2026-07-17-reward-tracker-pin-and-insights

**Status:** Done

**Summary:** Added server-side PIN verification, a full-ledger (uncapped) Insights aggregation
  action, Kid View, avatars, and Undo toast; skipped a proposed GitHub-Gist sync as conflicting
  with the RLS security model.

**Record:** decisions/2026/D-2026-07-17-reward-tracker-pin-and-insights.md

## D-2026-07-17-reward-tracker-app

**Status:** Done

**Summary:** Rebuilt a standalone localStorage Reward Tracker into the shared Supabase backend
  as a parent-gated app with an append-only ledger, kept as a separate currency from the
  chore-streak points.

**Record:** decisions/2026/D-2026-07-17-reward-tracker-app.md

## D-2026-07-16-fingerprint-lock-and-parent-visibility

**Status:** Done

**Summary:** Added a room_fingerprint_locked flag so a parent's manual fingerprint correction
  survives later reference-photo changes instead of being silently auto-invalidated.

**Record:** decisions/2026/D-2026-07-16-fingerprint-lock-and-parent-visibility.md

## D-2026-07-16-room-fingerprint

**Status:** Done

**Summary:** Reversed the earlier no-fingerprint call: room identity now matches against a
  cached, structure-only written fingerprint instead of raw reference photos, after bedding
  differences caused false rejections.

**Record:** decisions/2026/D-2026-07-16-room-fingerprint.md

## D-2026-07-16-gate-scorer-split

**Status:** Done

**Summary:** Split the vision-model call into a perception-only gate (reports evidence, never
  self-asserts valid/invalid) plus a separate scorer, after three independent reviews converged
  on 'completion bias' as the root cause.

**Record:** decisions/2026/D-2026-07-16-gate-scorer-split.md

## D-2026-07-16-layered-anti-cheat-checks

**Status:** Open

**Summary:** Added cheap deterministic pre-checks (blank/blur pixel stats, perceptual-hash
  duplicate detection) in front of the vision model, narrowing what the model is actually asked
  to judge.

**Record:** decisions/2026/D-2026-07-16-layered-anti-cheat-checks.md

## D-2026-07-16-ai-anti-cheat-simplification

**Status:** Done

**Summary:** Simplified the AI-scoring build-out: dropped a planned fingerprint store, replaced
  EXIF freshness checks (which client compression strips) with a captured lastModified
  timestamp, used the existing failed status instead of score:0.

**Record:** decisions/2026/D-2026-07-16-ai-anti-cheat-simplification.md

## D-2026-07-16-governance-docs

**Status:** Done

**Summary:** Set up dedicated AGENTS.md/DECISIONS.md/CHANGELOG.md files, trimming the task
  board to open work only, replacing reliance on conversation history for project memory.

**Record:** decisions/2026/D-2026-07-16-governance-docs.md

## D-2026-07-16-task-board-restructure

**Status:** Done

**Summary:** Restructured the flat-prose roadmap into NOW/NEXT/LATER bands with tags, status,
  and a concrete done-when per task, renaming ROADMAP.md to TASK_BOARD.md.

**Record:** decisions/2026/D-2026-07-16-task-board-restructure.md

## D-2026-07-15-worker-token-auth

**Status:** Done

**Summary:** Authenticated the home-network AI-scoring worker via a simple static WORKER_TOKEN
  secret rather than forcing it into the parent/kid session-token model.

**Record:** decisions/2026/D-2026-07-15-worker-token-auth.md

## D-2026-07-15-ai-scoring-configurable-modes

**Status:** Done

**Summary:** Built AI room-scoring with a per-family configurable mode
  (off/informational/nudge/auto_approve) from the start, reusing the existing Parent-Check
  points/streak logic.

**Record:** decisions/2026/D-2026-07-15-ai-scoring-configurable-modes.md

## D-2026-07-15-ai-scoring-pull-architecture

**Status:** Done

**Summary:** The home-network AI worker polls Supabase for pending jobs (pull architecture)
  rather than the cloud calling into the home network, avoiding any inbound exposure.

**Record:** decisions/2026/D-2026-07-15-ai-scoring-pull-architecture.md

## D-2026-07-15-reference-photos-parent-only

**Status:** Done

**Summary:** Reference-photo management restricted to parent sessions only, enforced
  server-side in the edge function (not just hidden in the UI), after kids were removing their
  own photos.

**Record:** decisions/2026/D-2026-07-15-reference-photos-parent-only.md

## D-2026-07-13-photo-delete-dashboard-x

**Status:** Done

**Summary:** Replaced the buggy lightbox-then-confirm-modal photo-delete flow with a direct X
  button on each photo tile, per the user's stated preference, plus a defensive z-index fix.

**Record:** decisions/2026/D-2026-07-13-photo-delete-dashboard-x.md

## D-2026-07-13-android-keyboard-autofocus

**Status:** Done

**Summary:** Removed the programmatic focus() call on the code-entry field, since it silently
  blocked the on-screen keyboard from appearing on Android Chrome.

**Record:** decisions/2026/D-2026-07-13-android-keyboard-autofocus.md

## D-2026-07-13-parent-agnostic-wording

**Status:** Done

**Summary:** Renamed all 'Mum' references (DB columns, action names, UI text) to neutral
  'Parent' throughout the codebase, with a data migration for historical rows.

**Record:** decisions/2026/D-2026-07-13-parent-agnostic-wording.md

## D-2026-07-13-service-role-session-auth

**Status:** Done

**Summary:** Documents this project's founding architecture: RLS-locked tables with zero
  policies, all access routed through one service-role edge function using opaque session
  tokens instead of Supabase Auth.

**Record:** decisions/2026/D-2026-07-13-service-role-session-auth.md
