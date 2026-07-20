---
description: Fetch live roadmap state, pick the next task, and pre-flight it — no editing
argument-hint: [task title or tag]
allowed-tools: Read, Grep, Glob, Agent, AskUserQuestion, Skill, Bash(git fetch *), Bash(git log *)
disallowed-tools: Edit, Write, NotebookEdit, Bash(git push *), Bash(git commit *)
---

# Homelife — pick the next roadmap task

Help pick the next task from `docs/TASK_BOARD.md` and pre-flight it. This command only reads and reports
— it never edits a file. This repo has no branches/worktrees to set up (see `AGENTS.md`: commit straight
to `main`), so there's no worktree hand-off step like a branch-based workflow would have; Step 3's hand-off
goes straight to `/run-code-task`.

## Step 1 — get the latest information

Delegate to an `Explore`-type subagent (via `Agent`) so this session's own context stays clean — another
session may have pushed to `main` since you last looked:
```
git fetch origin
git show origin/main:AGENTS.md
git show origin/main:docs/TASK_BOARD.md
```
Have it return compact text: every task in NOW/NEXT/LATER verbatim, with its Tags/Status line.

## Step 2 — pick a task

- If `$ARGUMENTS` names a specific task, work on that one.
- Else if `$ARGUMENTS` names a tag or a difficulty preference ("quick", "small") — filter to matching
  tasks, or to ones that look genuinely small (a copy/config fix, a single well-scoped UI change), skipping
  bigger ones even if ranked higher. Say which items you skipped and why.
- Otherwise, pick the topmost task in 🔴 NOW whose **Status** is `open` (not `in-progress` or `blocked`).
  If NOW has nothing open, move to 🟡 NEXT and say that's what you did.

**Check — is someone already on it?** The board's own `Status` field is the signal here (no branch to
check, unlike a branch-per-task workflow): `in-progress` means another session likely has it; `blocked`
means it's waiting on something external. Skip either and say so rather than picking it anyway.

## Step 3 — engine calibration

`/run-code-task` inherits whatever model this session is already running. Suggest a tier and say why:
- **Haiku** — only for a genuinely mechanical pick: a copy/config tweak, a single isolated bug fix with an
  obvious cause, a docs-only change.
- **Sonnet** — the default: a normal feature/fix task, multi-file but non-architectural.
- **Opus** — escalate for real rework risk: anything touching the `family-api` edge function or RLS
  boundary, the AI-vision pipeline (`poller.py` and its layered gate/scorer logic), a schema/migration
  change, or a genuine design trade-off.

Default effort to **High**; flag above that only for a genuinely ambiguous judgment call.

## Step 4 — hand off

Tell the user which task you picked and why, the Status check result, and the suggested engine tier. If it
differs from what's running, say so and suggest `/model <engine>` first.

Then ask with `AskUserQuestion` (one question): "Start work now?" with options:
1. **"Run `/run-code-task <task title>` now"** (Recommended, if nothing blocked it) — invoke `run-code-task`
   immediately with the task's title/identifier.
2. **"Not yet"** — stop here.
3. **"Choose a different task"** — list remaining candidates, go back to Step 2 for the new pick.

**If the `AskUserQuestion` call itself errors**, retry once before treating anything as an answer. Once a
real answer comes back, restate it in one line before invoking anything.

---

$ARGUMENTS
