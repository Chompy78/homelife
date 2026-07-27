# D-2026-07-17-agent-workflow-scaffold

Date: 2026-07-17
Status: Done

**Context:** Another project (PACT) has an `AGENTS.md` + `.claude/commands/` skill set
(`add-task`/`pick-task`/`run-task`/`sweep-tasks`/`cleanup-branches`/`close-session`/
`log-ai-lessons`/`plan-for-review`) for AI-assisted roadmap work, built around a one-branch-per-task +
worktree + PR model. The user asked to bring the same kind of workflow to this repo.

**Options:**
1. Port the skills as-is, introducing branches/worktrees/PRs to this repo to match the source project's
   model.
2. Adapt the skills to this repo's own established convention instead — commit and push straight to
   `main`, no branches, no PRs (already documented in `AGENTS.md`'s "Project conventions" before this
   change) — and keep this repo's existing `AGENTS.md`/`CHANGELOG.md`/`DECISIONS.md`/`TASK_BOARD.md`
   content untouched, only adding the new `.claude/` files plus stub `CLAUDE.md`/
   `.github/copilot-instructions.md` files.
3. Skip the roadmap-automation skills (`pick-task`/`run-task`/`sweep-tasks`) entirely, since they're the
   ones most shaped by the source project's branch/PR assumptions, and only bring over `add-task`
   (already branch-less) plus the general-purpose ones (`close-session`, `log-ai-lessons`,
   `plan-for-review`).

**Decision:** Option 2 — ported all 8 skills, but rewrote `run-task`/`sweep-tasks`/`cleanup-branches` to
work directly against `main` with no worktree/branch/PR step, and left every existing governance doc's
content untouched (only appended this entry and the matching `CHANGELOG.md` line).

**Why:** This repo's `AGENTS.md` already states the established convention explicitly: "Commit and push
straight to `main`. No feature-branch workflow is in use for this repo currently." Introducing branches
purely to match a different project's tooling would contradict a documented, working convention for no
real benefit here — this repo also has no CI test gate to make a PR-based review step earn its cost the
way it might elsewhere. `sweep-tasks` in particular got an extra safety adjustment beyond a mechanical
port: since there's no PR gate, every push here goes live immediately (`deploy-pages.yml` deploys `main`
on every push), so `sweep-tasks` reviews the local diff before pushing (not after, since there's no PR to
attach the review to) and defaults to a smaller batch cap (2-3) than the source project's skill uses.
Option 3 was rejected because the roadmap-automation skills are still useful here even without
branches — they just needed the branch/PR assumptions stripped out, not the skills themselves discarded.

**Status:** Done.
