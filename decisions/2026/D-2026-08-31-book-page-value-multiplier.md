# D-2026-08-31-book-page-value-multiplier

Date: 2026-08-31
Status: Done

**Context:** Not every page is equal. A large-print early reader and a dense
chapter book both advance the reading tracker's nightly page count by one per
page, so a kid can hit their pages-per-night goal (and earn Reward Tracker
bonus spins) far faster on an easy book than a hard one. The parent wanted a
per-book multiplier so some books need more pages read to be worth one normal
page.

**Options:**

1. A "pages per normal page" ratio on each book (`2` = two of its pages equal
   one normal page), stored on `kid_reading_books`.
2. The same idea expressed as a percentage (`50` = each page is worth half a
   normal page), stored the same way.
3. A difficulty *band* per book (easy/normal/hard) mapping to fixed factors.

Two further axes were decided alongside the format:

- **Scope** — which numbers the multiplier touches: the goal's ahead/behind
  banner and the bonus-spin threshold, versus also the book's own "page 84 of
  312" progress display.
- **Retroactivity** — whether changing a book's value re-scores pages already
  logged against it (value lives on the book) or only affects future entries
  (value frozen onto each log row at insert time).

**Decision:** Option 2 — an integer `page_value_percent` column on
`kid_reading_books`, `NOT NULL DEFAULT 100`, `CHECK (between 1 and 1000)`. It
weights the ahead/behind banner (client-side, in `computeAheadBehind`) and the
bonus-spin threshold (`credit_reading_spins_atomic`, weighting per log entry in
SQL), and deliberately nothing else — the book's own page-count line and
progress bar always show real pages. Changing a book's value is retroactive:
it re-scores that book's whole history the moment it's saved, and the book
editor confirms first with the actual before/after schedule figures
("This kid goes from 30 pages ahead to 5 pages behind schedule").

**Why:** Percent over ratio (option 1) because it reads as *worth* rather than
*cost* and covers both directions with one field and no sign convention: 50% is
"half a page each", 150% is "each page counts for one and a half". A ratio
would have needed values below 1 to express a book worth *more* per page, which
is exactly the confusing half of that mental model. Option 3 was rejected as a
lossy special case of the same field — three fixed bands can't express "this
particular workbook is 40%", and nothing about a band is cheaper to store or
explain than the number it maps to.

Scope stops at the goal and the spin threshold because those are the two places
pages act as a *currency*; "page 84 of 312" is a statement about the physical
object in the kid's hands, and scaling it would make the app disagree with the
book. The log history shows both (`+40 → 20 counted`) so the arithmetic is never
hidden.

Retroactive over frozen-per-entry because the value is a property of the book,
not of the night it was read — a parent correcting a book they misjudged means
"this book was always worth 50%", not "worth 50% from today". It also avoids a
second stored copy of a derived number, matching how `pages_read` totals and
the reward tracker's balances are already computed rather than cached. The cost
is that a change moves history under the parent, which the confirm dialog
addresses directly by naming the new schedule position before the change lands.

The one real hazard is the bonus-spin counter: `reading_pages_credited_for_spin`
accumulates in weighted-page units, so lowering a book's value after the fact
can drop a kid's weighted total below what's already been credited. It needs no
new guard — `credit_reading_spins_atomic` computes `floor((total - credited) /
threshold)` and returns early when that isn't positive, so an already-granted
spin is never clawed back; the kid simply reads further before the next one.
That behaviour is now stated in the function's own header comment so it reads as
intended rather than accidental.

**Status:** Done.
