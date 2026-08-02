# D-2026-08-02-fingerprint-prompt-permanence-tightening

Date: 2026-08-02
Status: Done

**Context:** `D-2026-07-16-room-fingerprint` introduced a one-time,
cached "fingerprint" description (via `generate_room_fingerprint()` in
`poller.py`) specifically to remove bedding/linens as a signal from the
room-identity check, since normal day-to-day bedding variation was
getting misread as "a different room." That prompt already told the
model to describe "structural-only" features and explicitly said "not
bedding/linens." Live use since then shows the instruction wasn't
strict enough in practice: generated fingerprints still lean on
changeable details like the current bed cover/comforter rather than
truly permanent identity markers (flooring, curtains, wall
color/material, furniture *type*). A generic negative instruction
("not bedding") without a concrete list of what to look at instead
left the model free to default to whatever's most visually salient in
the reference photo, which is very often the bedspread.

**Options:**
1. Leave the prompt as a short negative instruction and hope the model
   applies "structural-only" consistently - the same category of fix
   already shown to fail twice before (`D-2026-07-16-ai-anti-cheat-simplification`,
   `D-2026-07-16-room-fingerprint` itself started from this exact
   failure mode).
2. Rewrite the prompt with an explicit, ordered checklist of what
   *must* be described (flooring, walls, windows/curtains, ceiling,
   fixed furniture by type/material only, doors/closets) and an
   explicit deny-list of changeable items (bedding, comforters,
   pillows, cushions, throw rugs, clothes, toys, decorations,
   anything swappable within a week) - matching the project's
   established pattern of giving the model concrete categories rather
   than an abstract judgment call.
3. Same as 2, plus a deterministic post-generation filter in
   `poller.py` that strips or flags any sentence containing known
   changeable-item keywords before the fingerprint is stored, as a
   code-level backstop - mirroring the gate/scorer split's core
   lesson (`D-2026-07-16-ai-anti-cheat-simplification`: never trust
   the model's self-judgment alone when code can enforce the rule
   instead).

**Decision:** Option 3.

**Why:** This project has already hit "the model doesn't reliably
apply a subtle instruction on every call" twice (the room-match
false-rejection that motivated the fingerprint in the first place, and
the gate's completion-bias issue that motivated never trusting a bare
`valid` boolean). A concrete checklist (option 2) is a real
improvement over a vague negative instruction, but option 3 adds a
cheap, deterministic safety net on top - consistent with how every
other layer in this pipeline treats AI output as untrusted evidence
that code then applies a rule to, not as ground truth. A keyword-based
strip is intentionally crude but catches the exact failure already
observed (bedding/comforter language leaking into the fingerprint)
without adding a second model call.

**Status history:** `poller.py` is not committed to this repo (embeds
`WORKER_TOKEN`, delivered directly to the user per every prior
handoff - see `D-2026-07-18-poller-token-out-of-source`), so this
session initially could not edit `generate_room_fingerprint()`
directly and only delivered prompt/filter text in chat for the user to
paste in by hand.

**2026-08-02 follow-up (repo location):** traced `poller.py`'s actual
current location - `/data/projects/home-server/tidy-homelife-poller/scripts/poller.py`,
backed by its own private git repo `jrc-homelab/hs-homelife-poller`
(not `chompy78`). Attempted to `add_repo` it into this session to edit
directly; failed - a session scoped to `chompy78/*` repos cannot
cross-add a `jrc-homelab/*` repo mid-session ("cross-tier adds are not
supported"). Documented this repo boundary in this project's own
`AGENTS.md` so future sessions don't have to rediscover it.

**2026-08-02 follow-up (fix applied):** the user pasted their actual
current `poller.py` directly into chat. This surfaced an important
correction to this project's own documentation: `TASK_BOARD_NOW.md`'s
design notes describe the fingerprint as feeding the scorer's
room-identity check (per `D-2026-07-16-room-fingerprint`'s original
intent), but the live code's own docstring and `SCORER_PROMPT` confirm
the drift already flagged in `D-2026-07-17-poller-fingerprint-generation`:
scoring's room-match step still compares the submitted photo directly
against raw reference photos (bedding included); the fingerprint is
purely a parent-facing description field, unconnected to scoring. So
this fix corrects what the parent-facing description says, not the
scorer's actual room-match behavior - see `TASK_BOARD_NOW.md` for the
now-corrected design notes. Rewrote `FINGERPRINT_PROMPT` with the
explicit include/exclude checklist and added `CHANGEABLE_KEYWORDS` /
`strip_changeable_mentions()`, wired into `generate_room_fingerprint()`.
Diffed the edited file against the user's upload to confirm only the
fingerprint section changed, verified it compiles (`py_compile`), and
delivered it back to the user to drop in over their real `poller.py`.

**Status:** Done, pending live confirmation. Still needs: the user
replaces their `poller.py` with the delivered version, regenerates
fingerprints for at least one real kid/room (existing cached ones
won't self-correct - `room_fingerprint` must be reset to `null` or
regenerated via the "Regenerate now" flow), and confirms the new
fingerprint text describes floor/curtains/furniture type instead of
bedding. Separately - not part of this fix - the underlying scorer
room-match step still does raw-photo comparison; whether to actually
wire the fingerprint into scoring (the original `D-2026-07-16-room-fingerprint`
intent) is an open question for a future task, not resolved here.
