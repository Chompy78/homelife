# D-2026-07-20-rename-code-commands

Date: 2026-07-20
Status: Done

**Context:** The user maintains a separate family of lighter "-chat-" Claude.ai Skills elsewhere
(project-tracking, no git/PR workflow) alongside these heavier engineering `.claude/commands/` skills.
Both families were becoming hard to tell apart by name alone. The user's other repo, PACT, already solved
this by inserting `-code-` into its 8 equivalent command filenames.

**Options:**
1. Leave the names as-is; rely on remembering which repo/context a command belongs to.
2. Mechanically insert `-code-` into every filename (`add-task.md`→`add-code-task.md`, etc.), no
   exceptions.
3. Mirror PACT's exact precedent: mechanical insertion for 6 of 8, but a deliberate rewrite for the 2
   where a literal insertion reads worse than a name that better matches what the command actually
   produces (`log-ai-lessons.md`→`log-code-lesson.md`, not `log-ai-code-lessons.md`;
   `plan-for-review.md`→`make-code-cold-plan-review.md`, not `plan-code-for-review.md`).

**Decision:** Option 3. Renamed (via `git mv`, so history follows): `add-task.md`→`add-code-task.md`,
`pick-task.md`→`pick-code-task.md`, `run-task.md`→`run-code-task.md`,
`sweep-tasks.md`→`sweep-code-tasks.md`, `cleanup-branches.md`→`cleanup-code-branches.md`,
`close-session.md`→`close-code-session.md`, `log-ai-lessons.md`→`log-code-lesson.md`,
`plan-for-review.md`→`make-code-cold-plan-review.md`. Updated cross-references between the command files
themselves and in `AGENTS.md`'s "AI agent workflow shortcuts" section.

**Why:** These two commands' descriptions are identical in substance to PACT's own commands of the same
original name, so the same reasoning applies directly: `log-ai-lessons` already implied "AI" in a way
that duplicated the new `-code-` marker's purpose, and dropping it plus singularizing to `lesson` better
matches the command drafting one candidate at a time; `plan-for-review` didn't say what kind of plan,
while `make-code-cold-plan-review` names the actual artifact (a plan written for a reviewer with no
shared context). Deliberately left `CHANGELOG.md`, `DECISIONS.md`, and `docs/sessions/*.md` using the old
names — they're a historical record of what happened at the time, not something to retroactively rewrite.

**Status:** Done.
