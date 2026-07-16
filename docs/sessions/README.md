# Session log

A chronological narrative of each working session on this project —
what happened, in order, including things that don't belong in the
other governance docs:

- `CHANGELOG.md` records *what shipped* (finished features/fixes).
- `DECISIONS.md` records *why* non-obvious choices were made.
- A session log records *what happened* — including operational
  actions that are neither a shipped feature nor a design decision
  (e.g. "created a parent code for the Kellers," "sent the user the
  worker setup guide as a PDF"). If those don't fit anywhere else,
  they belong here.

## Convention

One file per working session: `YYYY-MM-DD-slug.md`, dated the day the
entry is written. If more than one distinct session happens on the
same date, suffix with `-2`, `-3`, etc.

Each file:

```
# YYYY-MM-DD — <short title>

**Focus:** one line on what this session was mainly about.

## Timeline

- Chronological bullets — what was asked, what was done, in order.
  Include operational actions, not just code changes.

## Files touched

- List of files created/modified (brief, not a full diff).

## Related

- Links to any DECISIONS.md / CHANGELOG.md entries this session
  produced.

## Carried forward

- Anything left open at the end of the session — unanswered
  questions, unfinished tasks — so the next session (or the next
  reader) doesn't have to reconstruct it from the task board alone.
```

Keep entries factual and skimmable — this is a log, not a transcript.
It doesn't need to (and shouldn't try to) reproduce full conversation
history.
