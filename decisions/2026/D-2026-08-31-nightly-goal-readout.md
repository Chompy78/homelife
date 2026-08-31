# D-2026-08-31-nightly-goal-readout

Date: 2026-08-31
Status: Done

**Context:** The pages-per-night goal existed only as a form input in the
Setup card, well below the book list. Logging a night's reading meant either
remembering the number or scrolling down to check it — and the page value
multiplier shipped earlier the same day made that worse, since on a weighted
book the goal no longer equals the pages you'd physically turn.

**Options:**

1. A computed target page on each book card ("Tonight: read to page 55"),
   derived from the current page, the remaining goal for today, and the book's
   page value.
2. A catch-up range ("15–45 pages: 15 to keep pace, 45 to clear the deficit").
3. A plain readout of the goal itself, repeated on each currently-reading book
   card, with no arithmetic.

A second axis: the goal is per kid per night, but a kid can have several books
open (Iya has two), so any per-book number has to say what it means.

**Decision:** Option 3 — each currently-reading book card carries the goal as
a plain line above its log row (`🎯 Goal: 15 pages a night`), repeated per card
rather than stated once for the kid. No target page, no range.

The readout does resolve four cases where a bare number would be wrong, all of
them lookups rather than arithmetic: a kid with no goal set shows nothing at
all; a goal with a future start date says when it begins; a date inside a
reading holiday says so; and a weekday not included in the goal says tonight
isn't a goal night. On a kid with any weighted book the noun becomes "counted
pages", matching the wording the ahead/behind banner already uses.

**Why:** The request was to stop having to remember the number, not to be told
what to do with it. Options 1 and 2 both answer a question that wasn't asked,
and both introduce a number that can be subtly wrong: a per-book target implies
the whole night belongs to that book, which is false as soon as a kid has two
open, and a catch-up range turns a glanceable line into two figures to parse at
bedtime. The plain readout can't be wrong about anything except whether tonight
counts — which is exactly why those four cases are handled and nothing else is.

Repeating the line per card rather than showing it once near the banner keeps
it beside the input it informs. The duplication is the point: the parent reads
it where they're typing, not at the top of a scrolled page. It also sidesteps
the multi-book problem entirely — the same true statement appears on both of
Iya's books, and the banner remains the single source of truth for whether
she's actually on track.

**Status:** Done.
