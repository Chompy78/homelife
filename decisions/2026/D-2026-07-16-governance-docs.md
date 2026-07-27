# D-2026-07-16-governance-docs

Date: 2026-07-16
Status: Done

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
