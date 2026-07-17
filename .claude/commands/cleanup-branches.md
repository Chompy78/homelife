---
description: Scan for stray non-main branches/worktrees, then delete only what's approved
allowed-tools: Read, Bash(git worktree *), Bash(git branch *), Bash(git fetch *), Bash(git log *)
disallowed-tools: Edit, Write, NotebookEdit, Bash(git push *), Bash(git commit *)
---

# Homelife — clean up stray branches and worktrees

This repo commits straight to `main` (see `AGENTS.md`) — there's no per-task branch/worktree convention,
so this skill will normally find nothing. It exists as a safety net for the rare case a branch or worktree
got created by mistake (a manual `git checkout -b`, an interrupted experiment) and never cleaned up.

## Step 1 — scan

```
git worktree list
git branch -vv
git fetch origin --prune
```
Anything other than `main` itself is a candidate. Classify each as:
- **merged** — its work is already on `main` (`git log origin/main..<branch>` is empty).
- **active elsewhere** — real commits ahead of `main`, no indication it's abandoned. Leave alone — this
  might be someone's in-progress experiment.
- **orphaned** — remote counterpart deleted (`: gone]` in `git branch -vv`) but the local ref/worktree
  wasn't cleaned up.
- **this session's** — leave alone regardless of classification.

## Step 2 — present

Show a table of cleanup candidates (merged + orphaned only) with classification and exactly what would be
run. Lettered list (`D1`, `D2`, ...).

## Step 3 — ask

"Delete D1, D3? Say the letters or `none`." Wait for the explicit reply.

## Step 4 — execute

For each approved letter: `git worktree remove` first if it has one, then `git branch -d` (only escalate
to `-D` if it refuses *and* the letter was already approved). Report what succeeded and what failed, and why.

---

$ARGUMENTS
