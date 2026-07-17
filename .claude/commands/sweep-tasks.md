---
description: Autonomously work through low-risk open TODOs on the roadmap — pick, execute, verify, push, repeat
argument-hint: [batch size, e.g. 3]
---

# Homelife — sweep the roadmap's quick, safe work

The unattended version of `/pick-task` → `/run-task`, run in a loop over eligible tasks instead of one at
a time with a human confirming each step. If nothing is eligible, say so plainly and stop — that's a
legitimate outcome.

**This repo has no PR gate.** Every push here goes straight to `main` and triggers a live GitHub Pages
deploy (`.github/workflows/deploy-pages.yml`) immediately — there's no review step between commit and
production the way a PR-based workflow would have. Be more conservative here than a branch/PR-based sweep
would need to be.

**This repo's `docs/TASK_BOARD.md` has no Effort/Risk tags** (unlike a stored-tag convention another
project might use) — this skill classifies eligibility itself at sweep time, using the rule below, rather
than trusting a pre-existing tag.

## Step 1 — get live state

Delegate to an `Explore`-type subagent:
```
git fetch origin
git show origin/main:AGENTS.md
git show origin/main:docs/TASK_BOARD.md
```
Return every task verbatim with its Tags/Status.

## Step 2 — build the eligible queue

A task is **never** eligible, full stop, if any of these apply — this is the safety gate:
- `Status` is `blocked` or `in-progress`.
- It touches the `family-api` edge function, RLS policies, or any DB schema/migration (security boundary
  — always needs a human).
- It touches the AI-vision pipeline's core gate/scorer logic (`poller.py`'s layered checks) — this
  pipeline has a documented history of subtle failure modes (see `docs/TASK_BOARD.md`'s own NOW entry)
  that only surfaced under real photos, not by inspection.
- The task's own description reads as a genuine design trade-off rather than a well-scoped build — e.g. it
  says "evaluate", "benchmark", or otherwise doesn't have one clear implementation path.

Everything else — a well-scoped `feature`/`ux`/`refactor` task with `Status: open` and a concrete "done
when" — is eligible. Order: NOW before NEXT before LATER, and within a tier, smaller-looking scope first.

**Batch size:** use `$ARGUMENTS` as the cap only if it's a bare positive integer. Otherwise ask once via
`AskUserQuestion` — recommended default **2-3**, deliberately small given there's no PR gate to catch a
mistake before it's live. This is the only prompt this skill makes; everything after runs unattended.

If zero tasks are eligible, report why (each excluded task and which rule excluded it) and stop.

## Step 3 — execute each task in the queue, in order

Track a **consecutive-failure counter**, starting at 0. A "failure" is: `/run-task` dropping a task as
bigger-than-expected, a verification step that couldn't be confirmed, or a review finding (Step 3b) that
needed a fix beyond a trivial one. Reset to 0 on every successful push. **If the counter reaches 2, stop
the sweep immediately** and report why.

For each candidate:
1. **Invoke `/run-task <task title>`** through Step 3 (verify) — but **do not let it push yet**; stop it
   after the commit is made locally, before `git push`.
2. **Review the local diff** with `/code-review low` (or `medium` if the task touches anything beyond a
   single file/app) before it goes live, since there's no PR to catch a problem after the fact.
3. **If a real finding survives**, fix it, re-verify per `/run-task`'s Step 3, and amend the commit. If the
   finding needs a genuine redesign rather than a small fix, park the task — revert the local commit
   (`git reset --soft HEAD~1` and discard the working changes), leave `docs/TASK_BOARD.md`'s entry as
   `open`, count it toward the circuit breaker, and move on.
4. **Push.** `git push origin main`. If rejected as non-fast-forward, `git pull --rebase origin main` and
   retry once; a real conflict is a park, not something to resolve silently.
5. Reset the consecutive-failure counter to 0.

## Step 4 — new tasks discovered mid-sweep

If executing or reviewing a task surfaces genuinely new, separate work, format it in `/add-task`'s exact
house format, but skip that skill's clarifying-questions/approval steps (this runs unattended). Commit it
directly to `main` (pull first; retry once on a non-fast-forward push, otherwise note in the final report
that it didn't land). If it clears Step 2's eligibility bar, fold it into this run's queue (respecting the
batch cap); otherwise it sits on the board for later.

## Step 5 — final report

A short table: task · outcome (pushed / parked / excluded) · why, for every task considered — including
every task Step 2 excluded and which rule excluded it, not just the ones that ran. If the circuit breaker
triggered, say so plainly without speculating on a root cause.

## Step 6 — log the run

Add a session-log entry (`docs/sessions/<date>-sweep.md`, or append to today's existing session file if
one already exists per `docs/sessions/README.md`'s convention) summarizing: batch size, tasks
attempted with outcomes, whether the circuit breaker triggered. Commit and push it the same way as Step 4.

---

$ARGUMENTS
