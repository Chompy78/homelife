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
  `D-2026-08-02-fingerprint-prompt-permanence-tightening` to Done (pending live confirmation).

## Files touched

- `DECISIONS.md`, `decisions/2026/D-2026-08-02-fingerprint-prompt-permanence-tightening.md`
- `docs/TASK_BOARD_NOW.md` - corrected fingerprint-pipeline design notes to match live code
- `AGENTS.md` - new section on `poller.py`'s real location and the cross-repo boundary
- `poller.py` (user's own copy, not in this repo) - fingerprint prompt/filter fix applied directly
  and delivered back to the user; not yet dropped in or confirmed live

## Related

- `DECISIONS.md` → `decisions/2026/D-2026-08-02-fingerprint-prompt-permanence-tightening.md`
- Builds on `D-2026-07-16-room-fingerprint`, `D-2026-07-17-poller-fingerprint-generation`

## Carried forward

- User needs to drop the delivered `poller.py` in over their real copy, regenerate fingerprints for at
  least one real kid/room (existing cached ones won't self-correct), and confirm live that new
  fingerprints describe floor/curtains/furniture type instead of bedding.
- Separately, not part of this fix: the scorer's room-match step still does raw-photo comparison and
  never reads the fingerprint, so the original bedding-false-rejection problem
  `D-2026-07-16-room-fingerprint` set out to fix may still occur during scoring itself. Whether to wire
  the fingerprint into `SCORER_PROMPT` for real is an open question, not yet a task.
