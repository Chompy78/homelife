# Decisions

A record of real decisions made on this project — choices between
options, design directions, fixes for non-obvious problems. Newest
entry on top. See `AGENTS.md` for the format and when to add one.

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
