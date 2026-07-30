# D-2026-07-16-task-board-restructure

Date: 2026-07-16
Status: Done

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
