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

Any time a real decision gets made — choosing between options, a design
direction, a fix for a non-obvious problem — add an entry. Look at the
existing entries first and match the format exactly:

```
## D-YYYY-MM-DD-slug

**Context:** what problem or question prompted this.
**Options:** what was actually considered (even if only two).
**Decision:** what was chosen.
**Why:** the reasoning — this is the part that matters most; it's
what lets a later reader tell whether the decision still holds.
**Status:** Done / Superseded by D-.../ Open (revisit later).
```

Newest entry on top. Don't invent a different format or skip sections
even if one feels thin for a given decision.

### CHANGELOG.md

Any time something real gets finished — a task completed, a feature
working, a fix applied — add a one-line dated entry, newest date on
top. This is the permanent record of what shipped. Once something's
in the changelog, it comes out of `TASK_BOARD.md` — nothing finished
stays on the task board.

### TASK_BOARD.md

Open work only: what's next (🔴 NOW), what's after that (🟡 NEXT), and
longer-term ideas (🟢 LATER). Every task has tags, a status, and a
concrete "done when" condition. When a task finishes: write its
CHANGELOG.md line, remove it from the board (don't leave a "done"
section sitting there — that's what the changelog is for), and if the
task represented a real decision along the way, log that in
DECISIONS.md too.

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
- Don't regenerate DECISIONS.md, CHANGELOG.md, or TASK_BOARD.md from
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
