# AGENTS.md

Canonical instruction file for this project. This takes priority over
anything in a conversation's history or memory — if there's a conflict,
what's written here wins.

## Project

Homelife is a family chore-tracking PWA (Supabase-backed, deployed to
GitHub Pages). See `README.md` for architecture, schema, and deployment
details. This file is about *how to work on it*, not what it is.

## Governance docs

Three files track the project's state over time. Keep them current as
you go — updating them is part of finishing a task, not a separate
cleanup step done later or only when asked.

### DECISIONS.md

As of 2026-07-28, `DECISIONS.md` is a **thin index**, not the full record — restructured to keep it cheap
to read every session (see `decisions/2026/D-2026-07-16-task-board-restructure.md`'s sibling reasoning,
and AI_home_server's `RESTRUCTURE-SPEC-2026-07-27.md`, the origin of this pattern). Any time a real
decision gets made — choosing between options, a design direction, a fix for a non-obvious problem — do
two things:

1. Write the **full record** to `decisions/2026/D-YYYY-MM-DD-slug.md`, matching the existing format exactly:

```
# D-YYYY-MM-DD-slug

Date: YYYY-MM-DD
Status: Done | Open | Superseded

**Context:** what problem or question prompted this.
**Options:** what was actually considered (even if only two).
**Decision:** what was chosen.
**Why:** the reasoning — this is the part that matters most; it's
what lets a later reader tell whether the decision still holds.
**Status:** Done / Superseded by D-.../ Open (revisit later).
```

2. Add a **one-line index entry** to `DECISIONS.md` itself, newest on top:

```
## D-YYYY-MM-DD-slug

**Status:** Done | Open | Superseded

**Summary:** one or two sentences.

**Record:** decisions/2026/D-YYYY-MM-DD-slug.md
```

Never write full decision detail directly into `DECISIONS.md` again — it's index-only from this point
forward. Don't invent a different format or skip sections even if one feels thin for a given decision.

### CHANGELOG.md

Any time something real gets finished — a task completed, a feature
working, a fix applied — add a one-line dated entry, newest date on
top. This is the permanent record of what shipped. Once something's
in the changelog, it comes out of the task board — nothing finished
stays there.

### TASK_BOARD_NOW.md / TASK_BOARD_NEXT.md / TASK_BOARD_LATER.md

As of 2026-07-28, split from a single `TASK_BOARD.md` into three files by band, same reasoning as
`DECISIONS.md` above: `TASK_BOARD_NOW.md` (🔴 NOW — always read), `TASK_BOARD_NEXT.md` (🟡 NEXT — read when
picking up new work), `TASK_BOARD_LATER.md` (🟢 LATER — longer-term ideas, never pruned). Every task has
tags, a status, and a concrete "done when" condition. When a task finishes: write its CHANGELOG.md line,
remove it from whichever band file it's on (don't leave a "done" section sitting there — that's what the
changelog is for), and if the task represented a real decision along the way, log that in DECISIONS.md too
(record + index entry, per above).

### docs/sessions/

A chronological narrative log, one file per working session (see
`docs/sessions/README.md` for the naming convention and template).
This is where operational actions that don't fit the other three docs
belong — things that are neither a shipped feature (CHANGELOG.md) nor
a design decision (DECISIONS.md), e.g. creating a parent code for a
new family, or handing off a setup guide. Add or update the current
session's entry as you go, same as the other three.

## File editing rules

- Read a file in full immediately before editing it, even if you edited
  it earlier in the same session — don't trust a remembered copy.
- Prefer targeted edits over regenerating a whole file from scratch.
  Preserve formatting, comments, and unrelated content exactly as
  found — don't "clean up" sections you weren't asked to touch.
- When a change affects multiple files (a rename, a renamed field, a
  moved doc), grep the whole repo for references before considering
  the change finished — a stale reference is worse than no change.
- Don't regenerate DECISIONS.md, CHANGELOG.md, or the TASK_BOARD_*.md files from
  scratch to make an edit. Load the current file, make the specific
  addition or change, leave everything else untouched.

## Concurrent editing

- Run `git status` before starting substantial edits — uncommitted
  changes may be in-progress work from elsewhere, not junk to clear.
- If a file changed since you last read it in this session (another
  process, another session, a manual edit), re-read it before editing
  — don't edit a stale in-memory copy.
- Keep commits scoped to one logical change rather than batching
  unrelated work together, so the history stays legible to anyone
  (human or AI) reading it later.
- If a merge conflict or an unexpected diff shows up, stop and
  investigate rather than overwriting either side.

## Technical access ≠ scope

Any AI session without real technical permission-scoping (i.e. most sessions — Claude Code with enforced
deny-rules is the exception) should not read or edit files belonging to a different project than this one,
unless explicitly asked. Checking another project's rules or adding something there on request is fine;
doing it unprompted isn't. Confirmed via direct testing (28 July 2026, Home AI Server) that a session with
broad, non-enforced access will cross into another project's files if asked, seeing no rule against it —
see AI_templates' `D-2026-07-28-technical-access-not-scope`.

## Project conventions (established, keep following unless told otherwise)

- **Commit and push straight to `main`.** No feature-branch workflow is
  in use for this repo currently.
- **Security boundary is server-side, always.** Every family/kid table
  has RLS enabled with zero policies — the anon key can't touch them
  directly. The `family-api` edge function (service-role key,
  never shipped to the browser) is the only reader/writer, and it
  enforces per-family/per-kid scoping itself based on opaque session
  tokens (not Supabase Auth JWTs — `verify_jwt: false` on the function,
  reasoning documented in its header comment). A client-side UI
  restriction alone (hiding a button) is never sufficient — enforce
  in the edge function.
- **The edge function deploys separately** from the GitHub Pages
  workflow. Redeploy it explicitly after editing
  `supabase/functions/family-api/index.ts` — pushing to `main` alone
  won't update it.
- **Bump `CACHE_NAME`** in each app's `service-worker.js` whenever any
  cached asset changes (JS, HTML, CSS, manifest, icons), or
  already-installed devices won't pick up the update.
- **Keep `POINTS` in sync** between `supabase/functions/family-api/index.ts`
  and `apps/shared/config.js`.
- **Test against disposable Supabase data**, not production families —
  create a throwaway test family via SQL, verify, then clean it up.
  Note: `storage.objects` rows can't be deleted via raw SQL (Supabase
  blocks it) — use the Storage API or dashboard for that part of
  cleanup.

## The AI photo-scoring worker (`poller.py`) lives outside this repo

The Ollama-based worker that polls `get_pending_photo_scores` /
`get_pending_fingerprint_regenerations` and submits results via
`submit_photo_score` / `submit_room_fingerprint` is **not** part of
this repo and never has been — it embeds `WORKER_TOKEN`, so every
version has been delivered directly to the user rather than committed
here (see `D-2026-07-17-poller-fingerprint-generation`,
`D-2026-07-18-poller-token-out-of-source`).

- **Current location:** `/data/projects/home-server/tidy-homelife-poller/scripts/poller.py`
  on the user's home AI server (renamed from `homelife-poller` on
  2026-07-31 — see that project's own `D-2026-07-31-homelife-poller-renamed-tidy-homelife-poller`).
- **It has its own git repo:** `jrc-homelab/hs-homelife-poller` — private,
  under the `jrc-homelab` GitHub organization, not `chompy78`. Its own
  history/decisions live in the separate **Home AI Server** project
  (reachable via the `home-server-mcp` connector's `home-ai-server`
  project key — see its `AGENTS.md`/`DECISIONS.md`/`CHANGELOG.md`),
  not in this repo's docs.
- **Cross-repo boundary confirmed 2026-08-02:** a Claude Code session
  scoped to `chompy78/*` repos cannot cross-add a `jrc-homelab/*` repo
  mid-session (`add_repo` fails: "cross-tier adds are not supported").
  To edit `poller.py` directly, either start a fresh session with
  `jrc-homelab/hs-homelife-poller` as the initial repo source, or work
  through a Home AI Server session instead. A session scoped to this
  repo can only hand the user prompt/code text to paste in by hand, or
  document the decision/design side here (`DECISIONS.md`,
  `TASK_BOARD_*.md`) — not edit the worker's actual source.

## AI agent workflow shortcuts

`.claude/commands/` has slash-command skills for working `docs/TASK_BOARD_NOW.md`/`_NEXT.md`/`_LATER.md`:
`/add-code-task`, `/pick-code-task`, `/run-code-task`, `/sweep-code-tasks`,
`/cleanup-code-branches`, `/close-code-session`, `/log-code-lesson`,
`/make-code-cold-plan-review`. These commit and push straight to `main` like
everything else in this repo (see `D-2026-07-17-agent-workflow-scaffold`) —
no branches or PRs. See each command's own file for details. (Renamed from
their original `-task`/`-session`/etc. names in `D-2026-07-20-rename-code-commands`
to carry `-code-`, distinguishing them from a separate family of lighter
"-chat-" Claude.ai Skills used outside this repo.)
