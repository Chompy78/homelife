# D-2026-08-02-fingerprint-prompt-permanence-tightening

Date: 2026-08-02
Status: Open

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

**Status:** Open. `poller.py` is not committed to this repo (embeds
`WORKER_TOKEN`, delivered directly to the user per every prior
handoff - see `D-2026-07-18-poller-token-out-of-source`), so this
session could not edit `generate_room_fingerprint()` directly. Revised
prompt text and a keyword-filter snippet were delivered to the user in
chat to paste into their copy of `poller.py`. Needs: user applies the
change, regenerates fingerprints for at least one real kid/room
(existing cached fingerprints won't self-correct - `room_fingerprint`
must be reset to `null` or regenerated via the "Regenerate now" flow),
and live-confirms the new fingerprints describe floor/curtains/furniture
type instead of bedding before this closes out.
