# D-2026-07-19-reward-tracker-spin-weighting

Date: 2026-07-19
Status: Done

**Context:** The user asked for four spin-wheel improvements: a sound
option, adjustable spin duration, customizable colours per option (colour
was already covered by the existing category colour picker), and
weighting so some options land more often than others. Asked before
building rather than guessing, since the weighting/options question
determines whether it needs a new data model.

**Options considered (with the user's answers):**
1. Wheel options: reuse `family_reward_categories` with weighting added,
   vs. a wholly separate "Spin Options" list independent of the reward
   categories. **Chosen: reuse + add weighting** - one list to manage,
   not two.
2. Sound: on by default vs off by default. **Chosen: on by default**,
   toggle in Settings.
3. Duration: one adjustable Settings value vs randomised per spin vs
   both. **Chosen: one adjustable value.**
4. Weighting style: a simple 1-5 relative weight vs percentages that must
   total 100%. **Chosen: simple 1-5 weight** - no cross-option math
   required to change one.

**Why wedge size = weight, not just invisible odds:** making the wedge's
*angular width* proportional to weight means a uniform-random landing
angle is automatically correctly weighted - there's no separate
weighted-random-selection step to get right or test independently, and
it's also the more honest visual: a category weighted 5 visibly *is* the
biggest slice, not secretly favoured behind an unchanged-looking wheel.

**Why sound is synthesized, not sound files:** no external assets to
fetch, host, or worry about size/licensing for - a few Web Audio
oscillator tones (ticks that spread out as the wheel decelerates, a
two-note chime on landing) cost nothing and need no network access,
consistent with this being a fully offline-capable PWA.

**Status:** Done. `family_reward_categories.spin_weight` (integer 1-5,
default 1), editable via a `<select>` next to each category in Manage
Categories. `manage_reward_categories`'s add/update now accept and
validate it. The wheel's `conic-gradient` wedges are sized by weight;
`runOneSpin()` simplified to a single uniform `Math.random() * 360` landing
angle instead of a separate index-then-jitter pick, since wedge geometry
now encodes the weighting itself. New Settings controls: a spin-sound
toggle (on by default) and a spin-duration slider (2-8s, default 2.6),
both per-device `localStorage`, same convention as dark mode and PIN
protection. Caught and fixed a real bug during testing:
`getSpinDurationSeconds()` read `Number(localStorage.getItem(...))`
directly - `Number(null)` is `0`, not `NaN`, so a never-set duration was
silently clamped to the 2-second minimum instead of falling through to
the intended 2.6s default; fixed by checking for `null` explicitly before
the `Number()` conversion. Verified via Playwright: wedge angles match
the 5:1 weight ratio exactly, sound-off/duration persist to localStorage
and the duration value actually changes the wheel's CSS transition
timing, and the weight `<select>` in Manage Categories reflects and
updates the right category. Bumped the reward-tracker service worker
cache to v10.
