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

## Files touched

- `DECISIONS.md`, `decisions/2026/D-2026-08-02-fingerprint-prompt-permanence-tightening.md`
- `docs/TASK_BOARD_NOW.md` - added 2026-08-02 update note under the fingerprint pipeline task
- `poller.py` (user's local copy, not in this repo) - revised prompt delivered in chat, not yet
  applied by the user

## Related

- `DECISIONS.md` → `decisions/2026/D-2026-08-02-fingerprint-prompt-permanence-tightening.md`
- Builds on `D-2026-07-16-room-fingerprint`, `D-2026-07-17-poller-fingerprint-generation`

## Carried forward

- User needs to apply the revised prompt/filter to their `poller.py`, regenerate fingerprints for at
  least one real kid/room (existing cached ones won't self-correct), and confirm live that new
  fingerprints describe floor/curtains/furniture type instead of bedding.
