# D-2026-07-15-ai-scoring-configurable-modes

Date: 2026-07-15
Status: Done

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
