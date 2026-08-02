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
- User asked if anything could make the system faster. Recommended two changes: caching reference
  photos (currently re-fetched/re-encoded from Supabase storage on every scoring job) and generating
  the fingerprint eagerly on reference-photo upload instead of lazily on a kid's first submission.
  User also asked whether tidiness's reference-photo comparison could be converted to text like the
  fingerprint was - explained why not: tidiness needs the actual visual detail to score accurately,
  unlike room identity, which is a small set of describable structural facts. User asked to build both
  approved speed fixes.
- Wrote `D-2026-08-02-poller-speed-improvements`. Added `fetch_reference_photo_b64()` to `poller.py` -
  an id-keyed disk cache under `~/.cache/homelife-poller/reference_photos`
  (`HOMELIFE_POLLER_CACHE_DIR`-overridable), wired into both `llava_score()` and
  `generate_room_fingerprint()`. Verified with a stubbed-network unit test (2 lookups of the same photo
  id with a deliberately different URL produced exactly 1 network call). Delivered the updated file
  back to the user via `SendUserFile`.
- For eager fingerprint generation, edited `supabase/functions/family-api/index.ts` directly (this
  repo's own code, unlike `poller.py`): `upload_reference_photo` / `delete_reference_photo` /
  `upload_family_room_photo` / `delete_family_room_photo` now also set
  `room_fingerprint_regen_requested_at`, reusing the exact signal/poll/column
  `request_fingerprint_regeneration` already relies on - zero new mechanism, same
  `room_fingerprint_locked` guard preserved.
- Read the full 2659-line `index.ts` (unavoidable - the deploy tool needs literal file content, no
  path-based deploy option) and deployed via `mcp__Supabase__deploy_edge_function` as v41. Verified the
  deploy byte-for-byte via `get_edge_function` (md5 match against the local file), following the same
  safety-net pattern used in the 2026-08-01 session's redeploy.
- Live-smoke-tested against a fresh disposable test family (`ZZTEST_FingerprintEager`): created via SQL,
  called `upload_reference_photo` through the real HTTP endpoint with a 1x1 PNG, confirmed
  `room_fingerprint_regen_requested_at` was set on the kid row; cleared it, called
  `delete_reference_photo`, confirmed it was set again. Cleaned up via the API's own
  `delete_reference_photo` (proper storage cleanup) followed by deleting the test family (cascade
  removed the test kid too, confirmed by a 0-row follow-up query).
- User asked to actually test scoring speed on the home server. Explained the limit: `home-server-mcp`
  only gives file read/write access to registered projects, no command execution - couldn't run
  `poller.py`/Ollama directly. Delivered a standalone `time_scoring.py` harness instead (fetches Eira's
  real photos via `family-api`, times each real pipeline stage, never calls `submit_photo_score` so it's
  read-only) for the user to run themselves.
- User proposed a better approach: resubmit a real photo through the live system and time how long the
  actual running poller/cron takes to process it end to end - no home-server execution needed, since I
  could drive it entirely through the API. Checked first and found Eira's family has
  `ai_score_mode: "auto_approve"` (threshold 8) - a real score ≥8 would auto-award real points/streak/
  spin credit with no undo path. Asked the user how to handle that; they said a real reward was fine.
- Fetched Eira's actual last-submitted photo bytes via her real session, resubmitted it fresh via
  `submit_photo_for_scoring`, then polled `get_kid_state` every 15s in a background task until it left
  `pending`. Result: 28s wall-clock (23.0s by `scored_at - created_at`), status `failed`. Pulled a
  14-day baseline across all families (`scored` avg 86.0s range 14.6-143.5s; `failed` avg 68.9s range
  13.2-126.8s) for context - explained the wide variance is almost certainly Ollama model warm-up, not
  the network overhead our caching fix targets, and that this particular run used the user's
  not-yet-updated `poller.py`, so it wasn't a valid before/after comparison of today's fixes.
- Flagged a real oddity in that result: the `rejection_reason` text read as an affirmative room
  description ("This is an indoor bedroom-type room as evidenced by...") rather than an explanation for
  rejection - and the same exact text had appeared on an earlier historical rejection for the same kid.
  User asked to dig into it.
- Diagnosed it via code review (no live Ollama access to reproduce directly): `GATE_SCHEMA`'s
  `reject_reason_if_invalid` was a required, non-nullable string, forcing the model to write content
  even when it believed `setting` was `indoor_room` - a stricter check (confidence not `"high"`, most
  likely) could still fail `valid`, surfacing that affirmative text as the shown rejection reason.
  `SCORER_SCHEMA`'s analogous `mismatch_reason` was already nullable with an explicit null-for-valid
  worked example - the gate never got the same fix. Wrote `D-2026-08-02-gate-rejection-reason-bug`.
- Made `reject_reason_if_invalid` nullable, added a fourth `GATE_PROMPT` worked example (valid room →
  `null`), and rewrote `llava_gate()` to build the rejection reason from whichever specific criterion
  failed, only trusting the model's own text when `setting != indoor_room`. Verified with three
  monkeypatched-`ollama_generate` unit tests: the exact real-world scenario (now gives a coherent,
  specific message), a genuinely invalid photo (real reason still passes through unchanged), and a
  genuinely valid photo (still passes cleanly). Diffed the edit to confirm scope, verified it compiles,
  delivered the updated file back to the user.

## Files touched

- `DECISIONS.md`, `decisions/2026/D-2026-08-02-fingerprint-prompt-permanence-tightening.md`,
  `decisions/2026/D-2026-08-02-wire-fingerprint-into-scorer.md`,
  `decisions/2026/D-2026-08-02-poller-speed-improvements.md`,
  `decisions/2026/D-2026-08-02-gate-rejection-reason-bug.md`
- `docs/TASK_BOARD_NOW.md` - corrected fingerprint-pipeline design notes to match live code, twice
  (once to describe the drift, once to describe the fix), then updates for the speed changes and the
  gate bug fix
- `CHANGELOG.md` - four 2026-08-02 entries
- `AGENTS.md` - new section on `poller.py`'s real location and the cross-repo boundary
- `poller.py` (user's own copy, not in this repo) - fingerprint prompt/filter fix, scorer wiring,
  reference-photo caching, and the gate rejection-reason fix all applied directly and delivered back to
  the user; not yet dropped in or confirmed live
- `supabase/functions/family-api/index.ts` - eager fingerprint-regen flag on 4 actions; deployed (v41)
  and live-tested

## Related

- `DECISIONS.md` → `decisions/2026/D-2026-08-02-fingerprint-prompt-permanence-tightening.md`,
  `decisions/2026/D-2026-08-02-wire-fingerprint-into-scorer.md`,
  `decisions/2026/D-2026-08-02-poller-speed-improvements.md`,
  `decisions/2026/D-2026-08-02-gate-rejection-reason-bug.md`
- Builds on `D-2026-07-16-room-fingerprint`, `D-2026-07-17-poller-fingerprint-generation`

## Carried forward

- User needs to drop the latest delivered `poller.py` in over their real copy (it now includes the
  fingerprint prompt fix, the scorer wiring, the reference-photo cache, and the gate rejection-reason
  fix, all together), then live-confirm: (a) a first scored submission for a target with no cached
  fingerprint generates one and scores correctly, (b) a real photo of the kid's own room with different
  bedding than the reference photos is not falsely rejected, (c) a genuinely different room is still
  rejected, (d) new fingerprint text describes floor/curtains/furniture type instead of bedding, (e) a
  fingerprint now appears shortly after uploading reference photos, before any kid submission, and (f) a
  rejected photo's reason text is coherent with an actual rejection, not an affirmative room description.
- A real photo-scoring request was created for Eira during testing (with the user's explicit go-ahead,
  given the family's `auto_approve` mode) - it's now permanent, real history for that kid, same as any
  normal submission.
