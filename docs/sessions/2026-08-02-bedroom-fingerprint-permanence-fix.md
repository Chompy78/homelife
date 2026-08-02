# 2026-08-02 — Tighten the room fingerprint prompt to permanent-only features

**Focus:** User reported the bedroom photo scorer's room "fingerprint" was picking changeable
details (bed cover) instead of truly permanent identity markers (floor, curtains, furniture type).

## Timeline

- User reported the issue directly: the fingerprint picks things that can change (bed cover) rather
  than truly permanent things (floor, curtains, type of furniture).
- Traced the fingerprint feature back through `D-2026-07-16-room-fingerprint` (why it exists - remove
  bedding as a room-match signal) and `D-2026-07-17-poller-fingerprint-generation` (where it's
  implemented - `generate_room_fingerprint()` in `poller.py`). Confirmed the existing prompt already
  said "structural-only... not bedding/linens," but that generic negative instruction wasn't strict
  enough in practice - the same category of failure this project has hit twice before (a vague
  instruction the model doesn't reliably apply on every call).
- Confirmed `poller.py` itself is not in this repo and never has been - every prior handoff
  (`D-2026-07-17-poller-fingerprint-generation`, `D-2026-07-18-poller-token-out-of-source`) delivered
  it directly to the user as a file, since it embeds `WORKER_TOKEN`. This session could not edit it
  directly.
- Wrote `D-2026-08-02-fingerprint-prompt-permanence-tightening`: revised prompt with an explicit
  ordered include-list (flooring, walls, windows/curtains, ceiling, fixed furniture by type/material
  only, doors/closets) and an explicit deny-list (bedding, comforters, pillows, cushions, throw rugs,
  clothes, toys, decorations), plus a deterministic keyword-filter backstop applied to the model's
  output in code - matching this project's established pattern of never trusting a model instruction
  alone when code can enforce the rule (per `D-2026-07-16-ai-anti-cheat-simplification`).
- Delivered the revised prompt and filter snippet to the user in chat to paste into their copy of
  `poller.py`. Updated `docs/TASK_BOARD_NOW.md`'s existing fingerprint-pipeline task with a
  2026-08-02 note pointing at the new decision, since confirming this fix live is part of that task's
  existing "done when" criteria (a real photo not falsely rejected over bedding differences).
- Also opened and merged PR #5 on this repo carrying the doc-only updates above.
- User then asked whether the `home-server-mcp` connector was active (yes), then asked to read
  `poller.py`'s actual path (`\data\projects\home-server\tidy-homelife-poller\scripts`). Traced it via
  `home-server-mcp`'s `home-ai-server` project docs: the poller was moved into its own git repo,
  renamed `hs-homelife-poller`, and transferred to the `jrc-homelab` GitHub org
  (`D-2026-07-26-github-org-for-project-repos` in that project). Attempted `add_repo` for
  `jrc-homelab/hs-homelife-poller` to edit it directly - failed, since this session is scoped to
  `chompy78/*` and cross-owner repo adds aren't supported mid-session. Documented the repo boundary
  and poller's real location in this repo's own `AGENTS.md` (new section) and amended
  `D-2026-08-02-fingerprint-prompt-permanence-tightening`'s Status with the same finding, so this
  doesn't need rediscovering next time. Opened and merged PR #6 carrying that update.
- User then pasted their actual current `poller.py` directly into chat as an uploaded file - working
  around the cross-repo boundary entirely. Reading it surfaced an important correction: the live
  `SCORER_PROMPT`/`llava_score()` still compares the submitted photo directly against raw reference
  photos for room-match, and the fingerprint is not read anywhere in the scoring pipeline - confirming
  the drift `D-2026-07-17-poller-fingerprint-generation` already flagged, which this project's own
  `TASK_BOARD_NOW.md` design notes had not been corrected to reflect. So this fix only corrects the
  parent-facing description text, not the scorer's actual room-match behavior.
- Applied the fix directly: rewrote `FINGERPRINT_PROMPT` with the explicit include/exclude checklist,
  added `CHANGEABLE_KEYWORDS` / `strip_changeable_mentions()`, wired into `generate_room_fingerprint()`.
  Diffed the edited file against the user's original upload to confirm only that section changed,
  verified it compiles (`py_compile`), and delivered the corrected `poller.py` back to the user via
  `SendUserFile` to drop in over their real copy.
- Corrected `TASK_BOARD_NOW.md`'s fingerprint-pipeline design notes (steps 5 and 6, plus the "Known
  open risk" paragraph) to accurately describe the fingerprint as parent-facing-only and the scorer's
  room-match step as still doing raw-photo comparison, and updated
  `D-2026-08-02-fingerprint-prompt-permanence-tightening` to Done (pending live confirmation). Opened
  and merged PR #7 carrying that batch.
- User asked to close the remaining gap: wire the fingerprint into the scorer's room-match step for
  real, finally delivering on what `D-2026-07-16-room-fingerprint` originally intended. Confirmed via
  `family-api/index.ts` that `get_pending_photo_scores` already returns `room_fingerprint` per job, so
  this was purely a `poller.py`-side change - no edge function/schema work needed.
- Wrote `D-2026-08-02-wire-fingerprint-into-scorer`. Changed `llava_score()` to accept a `fingerprint`
  argument and substitute it into `SCORER_PROMPT` via `str.replace()` (not `.format()` - the prompt's
  JSON examples contain literal `{ }` that would collide with format-string syntax); Step 1 (room
  match) now compares the submitted photo against the fingerprint text instead of the reference photos,
  Step 2 (tidiness) still uses the reference photos, unchanged. Changed `process_job()` to read
  `job["room_fingerprint"]`, generate one lazily via the existing `generate_room_fingerprint()` if
  missing (rejecting with "ask a parent to add reference photos first" if none exist to generate one
  from), and cache it via `submit_room_fingerprint`.
- Diffed the edited file against the version delivered earlier this session to confirm the scope of the
  change, verified it compiles (`py_compile`), and delivered it back to the user via `SendUserFile`.
- Flipped `TASK_BOARD_NOW.md`'s "not wired in" correction (written earlier this session) back to
  describe the real, now-fixed wiring, kept as a brief history note rather than deleting the drift
  story entirely. Updated the "Known open risk" paragraph. Added a `DECISIONS.md` index entry and a
  `CHANGELOG.md` line.

## Files touched

- `DECISIONS.md`, `decisions/2026/D-2026-08-02-fingerprint-prompt-permanence-tightening.md`,
  `decisions/2026/D-2026-08-02-wire-fingerprint-into-scorer.md`
- `docs/TASK_BOARD_NOW.md` - corrected fingerprint-pipeline design notes to match live code, twice
  (once to describe the drift, once to describe the fix)
- `CHANGELOG.md` - two 2026-08-02 entries
- `AGENTS.md` - new section on `poller.py`'s real location and the cross-repo boundary
- `poller.py` (user's own copy, not in this repo) - fingerprint prompt/filter fix and scorer wiring
  both applied directly and delivered back to the user; not yet dropped in or confirmed live

## Related

- `DECISIONS.md` → `decisions/2026/D-2026-08-02-fingerprint-prompt-permanence-tightening.md`,
  `decisions/2026/D-2026-08-02-wire-fingerprint-into-scorer.md`
- Builds on `D-2026-07-16-room-fingerprint`, `D-2026-07-17-poller-fingerprint-generation`

## Carried forward

- User needs to drop the delivered `poller.py` in over their real copy, then live-confirm: (a) a first
  scored submission for a target with no cached fingerprint generates one and scores correctly, (b) a
  real photo of the kid's own room with different bedding than the reference photos is not falsely
  rejected, (c) a genuinely different room is still rejected, and (d) new fingerprint text describes
  floor/curtains/furniture type instead of bedding.
