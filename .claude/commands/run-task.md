---
description: Do the work for one roadmap task picked by /pick-task — edit, verify, commit, push straight to main
argument-hint: <task title>
---

# Homelife — work the roadmap task

`$ARGUMENTS` identifies one task from `docs/TASK_BOARD.md`, handed off from `/pick-task`. This repo
**commits and pushes straight to `main`** — no branch, no worktree, no PR (see `AGENTS.md`'s "Project
conventions"). If `/pick-task` hasn't been run yet this session, ask for its output first.

**Engine check.** Restate `/pick-task`'s suggested engine tier before starting Step 1. This command
inherits whatever model the session is already running and cannot switch it — if it doesn't match, stop
and tell the user to run `/model <engine>` first.

## Step 1 — sync and re-check

```
git fetch origin
git status
```
Pull latest `main` before editing. If the file(s) you're about to touch changed since you last read them
this session (another session may have pushed), re-read them now — don't edit a stale copy. Update the
task's `Status` to `in-progress` in `docs/TASK_BOARD.md` as your first edit if this is a multi-step task
likely to span more than one sitting, so the board's own status reflects reality for anyone else looking.

## Step 2 — do the work

Be efficient: read each file once, search instead of reading whole files when you can. Follow `AGENTS.md`'s
hard rules as they apply to this task:
- Enforce any family/kid-data access in the `family-api` edge function, never client-side alone.
- If you edited `supabase/functions/family-api/index.ts`, redeploy it explicitly — a push to `main` alone
  won't update it.
- If you changed a cached asset, bump that app's `CACHE_NAME` in `service-worker.js`.
- If you touched point values, keep `POINTS` in sync between the edge function and `apps/shared/config.js`.

Update `CHANGELOG.md` (add the entry) and remove the task's entry from `docs/TASK_BOARD.md` in the same
commit as the edit — don't defer either. Add a `DECISIONS.md` entry (format: `D-<YYYY-MM-DD>-<slug>`) if
the change involved a non-obvious *why*.

If the task turns out to be bigger than `/pick-task` assumed, stop and flag it rather than forcing it
through — leave its `Status` as `open` (not `in-progress`) and say clearly why you're dropping it.

## Step 3 — verify

There's no automated test suite. Verify live:
- **Backend/data changes:** test against a disposable Supabase family (create one via SQL, verify, clean
  up — remember `storage.objects` rows need the Storage API/dashboard, not raw SQL, to remove). Never test
  against a real family's data.
- **Frontend/PWA changes:** load the affected app and exercise the changed flow; confirm the cache bump
  (if any) actually takes effect on a reload.
- **AI-vision pipeline changes:** if you touched `poller.py`'s gate/scorer logic, run it against a small
  set of known-good and known-bad test photos before considering the change verified — this pipeline has
  a documented history of failure modes that only surfaced under real (or realistic) photos, not by
  inspection alone.

## Step 4 — commit and push

```
git add <the files this task actually touched>
git commit -m "<type(scope): summary>"
git push origin main
```
Never `git add -A`/`.` — name the files, since a shared checkout may hold another session's in-progress
work. If the push is rejected as non-fast-forward, `git pull --rebase origin main` and retry once; if a
real conflict shows up, stop and show it rather than resolving it silently.

---

$ARGUMENTS
