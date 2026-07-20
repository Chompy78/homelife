---
description: Wrap-up that WRITES the session's CHANGELOG/DECISIONS/session-note, graduates finished tasks, then PROPOSES a ready commit — never stages, commits, or pushes
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(git status *), Bash(git log *), Bash(git diff *), Bash(git fetch *)
disallowed-tools: NotebookEdit, Bash(git add *), Bash(git commit *), Bash(git push *)
---

# Homelife — close off this session

Wrap up in three parts: **(1) log** the session's work (you write these entries yourself), **(2) verify**
the tree (report only), and **(3) propose a ready commit** for the human to run. You **never** stage,
commit, or push anything yourself. Other sessions may have uncommitted work in this same checkout — never
touch that.

**Before writing anything**, run `git status`/`git diff` and classify every touched path — log only this
session's real work. Re-read `AGENTS.md`, `CHANGELOG.md`, `DECISIONS.md`, and `docs/TASK_BOARD.md` in full
immediately before editing any of them, even if you read them earlier this session — another session may
have pushed since.

## Part 1 — Log the session's work (you WRITE these directly)

**1. `CHANGELOG.md`** — one-line dated entry for what shipped, newest date on top, matching the existing
format exactly. Always required for real, finished work.

**2. `DECISIONS.md`** — only if a change involved a non-obvious *why* (a design direction, a fix for a
non-obvious problem, a choice between real options). Write the full `Context → Options → Decision → Why →
Status` entry using `D-<YYYY-MM-DD>-<slug>`, matching the existing format exactly. If not warranted, say
so and skip it.

**3. `docs/sessions/<date>-<topic>.md`** — per `docs/sessions/README.md`'s convention: a chronological
narrative including anything operational that doesn't fit the other two docs (e.g. "created a parent code
for a family," "redeployed the edge function"). Add or update the current session's entry — if one for
today already exists, re-read and update it rather than assuming it's still accurate.

**4. Roadmap graduation** — if a `docs/TASK_BOARD.md` task finished this session, remove its entry now and
confirm the matching `CHANGELOG.md` line exists. For any newly-discovered task, format it in `/add-code-task`'s
house format and surface it in Part 3's report rather than writing it into the board yourself mid-close.

## Part 2 — Verify (report only — write nothing, change nothing)

**5. Verification check** — there's no automated test suite. If everything touched is docs-only, report
"skipped, docs-only." Otherwise confirm live verification actually happened this session (per each
task's own verification method — a disposable-Supabase-family test for backend changes, a manual app
reload for frontend/cache changes, a real-photo run for AI-vision-pipeline changes). If you can't confirm
it happened, say so rather than assuming it did.

**6. Working-tree sanity check**
```
git status
git fetch origin
git log origin/main..HEAD
```
Report anything committed locally but not yet pushed, and anything uncommitted that isn't this session's
own work (flag it, don't touch it).

**7. Cross-project hints** — did this session surface a lesson general to AI-assisted coding, not specific
to Homelife (a git pattern, a prompting/agent-design lesson, something about the AI-vision pipeline's
failure modes that would generalize to other vision-model work)? If yes, draft a candidate entry (one-line
trigger + one-line rule) and list "push it to `ai-lessons-learned`" as a follow-up option. **Draft only —
never write it anywhere without approval.** If nothing general came up, say so and skip.

## Part 3 — Propose the commit (you do NOT run it)

After Part 1's writes, run `git status`/`git diff` again, then:
- List the exact files belonging to this session's real, finished work. Never propose `git add -A`/`.` —
  name each file, since a shared checkout may hold another session's changes.
- Print a ready-to-run block:
  ```
  git add <the named files>
  git commit -m "<type(scope): summary>"
  git push origin main
  ```
  Check recent `git log --oneline` for the actual commit-message style in use. If more than one
  independent task finished, propose one commit per task.
- **Stop there.** `git add`/`commit`/`push` are disallowed for this skill on purpose.

## Output format

Short punch list by number. For Part 1, say plainly what you wrote (file + one-line summary). For Part 2,
mark each done/not-needed/needs-action.

For anything needing a decision, group every actionable follow-up under one lettered question (e.g.
"**A.** What should we run to close out?") with options **A1**, **A2**... underneath, each tagged
Recommended or Not recommended with a reason.

End with a one-line verdict: clear to close, or not yet (and why).

---

$ARGUMENTS
