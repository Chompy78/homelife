---
description: Mine a session/file/glob for generalizable AI-coding lessons and draft ai-lessons-learned entries
argument-hint: [file|dir|glob — omit to mine this session]
allowed-tools: Read, Grep, Glob, Agent, Bash(git clone *), Edit
---

# Homelife — mine a session for cross-project lessons

Read a session, session file, or transcript and draft candidate entries for the separate, private
`chompy78/ai-lessons-learned` repo. This is a **report-only** pass for the drafting step — never write to
`inbox/`, commit, or push without approval, same convention as `/close-code-session`'s item 7 (which this
command supersedes as the reusable, standalone version).

## Step 1 — figure out the source

`$ARGUMENTS` is a file path, a directory, a glob, or empty:
- **Empty** — mine this session's own conversation so far.
- **A single file** — a `docs/sessions/*.md` entry, an exported transcript, a `DECISIONS.md` excerpt.
  Read it directly.
- **A directory or glob matching several files** — don't read them all inline. Delegate to a
  `general-purpose` agent: give it the file list, ask it to return only the drafted candidates as compact
  text, not the raw source content.

## Step 2 — make sure you can see the repo, and what's already in it

If `chompy78/ai-lessons-learned` isn't already cloned this session, call
`add_repo(owner="chompy78", repo="ai-lessons-learned")`, then `git clone --depth 1` it. Read the current
`INDEX.md` so you don't draft a duplicate of something already covered.

## Step 3 — draft candidates

For each genuinely new, generalizable lesson (not specific to Homelife's chore-tracking domain or its
stack), draft:

```markdown
## Candidate: <short title>
- **Trigger:** <the concrete scenario — specific enough a future reader recognizes it>
- **Rule:** <the generalized, actionable rule>
- **category:** <slug>
- **confidence:** <low|medium|high>
- **last-confirmed:** <today's date>
- **source:** <what you read this from — file path, session, repo/PR>
```

Be selective: skip anything project-specific, anything already in `INDEX.md`, and anything vague or
unactionable. Don't guess an `H-###` number — that's assigned later at curation time.

## Step 4 — show candidates for approval

List every drafted candidate, numbered (`C1`, `C2`, ...), each with its one-line trigger and rule visible.
If none, say so plainly.

Ask once which candidates to commit, spelling out what approval does: "Approving writes each selected
candidate as its own file in `inbox/` on `chompy78/ai-lessons-learned`, commits it, and pushes to `main`.
Which candidates? Say the letters or `none`." Wait for that reply.

## Step 5 — write, commit, push (only approved candidates)

For each approved candidate: write it as its own new file — `inbox/<today's date>-<short-slug>.md` — never
bundle multiple candidates into one file, never edit an existing `inbox/`/`topics/` file directly. Commit
(`feat(lessons): add inbox candidate <slug>`) and push to `main`.

Report back the filenames written and confirm they're pushed.

---

$ARGUMENTS
