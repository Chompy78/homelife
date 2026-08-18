# D-2026-08-18-spin-kid-picker-before-spin

Date: 2026-08-18
Status: Done

**Context:** The user reported the reward-tracker Spin tab is hard to use: "I press spin, it then
prompts the child, then it spins but it keeps triggering a spin when I interact with it." The asked-for
mechanic is the reverse order - open Spin, pick a child who is shown on the tab, then press SPIN. This
directly revisits `D-2026-07-30-spin-tab-ask-kid-on-spin`, which had removed Spin from the header kid
picker and made SPIN open a "Spin for who?" modal (`#spinKidModal`) first.

The repeated-spin symptom has a concrete cause, not just a feel: `#spinKidModal` uses the shared
`.catModal` shell, which centres its card in the viewport - so on a phone the kid buttons land almost
exactly on top of the SPIN button, which sits at the centre of `.wheelWrap`. Tapping a kid hid the
modal synchronously inside the same tap, so the follow-up `click` (and, on touch, the ~300ms
synthesized click after `touchend`) fell through onto the SPIN button that had just been revealed
underneath - a classic ghost click, re-entering `spin()` as soon as the previous one finished.

**Options:**
1. Keep the modal but harden it against ghost clicks (close it on a delay, swallow the next click,
   or move the kid grid off-centre so it can't overlap the SPIN button) - rejected: it treats the
   symptom, and leaves the press-then-prompt ordering the user explicitly asked to change.
2. Keep the modal but open it from a separate "Spin for..." button rather than from SPIN itself -
   rejected: still two taps and an overlay for something the app already has a component for.
3. Put Spin back on the sticky header's kid picker (`kidPickerRow`, shared with Quick Tap), delete the
   modal entirely, and have SPIN spin immediately for whoever is selected. Grey the chips out while a
   spin is running so the result can't be credited to a kid chosen mid-animation. **Chosen.**

**Why:** Option 3 is what was asked for, and it removes the ghost-click path by construction: with no
overlay opening and closing over the wheel, there is nothing left to fall through onto SPIN. It also
restores the invariant the rest of the Spin tab already assumed - the bonus-spin row, the "earn a bonus
spin" reasons list and the "Spinning for X" banner all read `selectedKidId` and were already rendered
for a kid *before* any modal was answered, which is exactly why the press-then-prompt ordering felt
wrong: the tab was already showing one kid's state while asking which kid to spin for.

`D-2026-07-30`'s worry - that a leftover `selectedKidId` means silently spinning for the wrong kid - is
answered by visibility rather than by a prompt: the chosen kid is shown twice on the tab (header chip,
highlighted; and the "🎡 Spinning for <name>" banner directly under the tabs) before SPIN is pressed.
That is the same guarantee Quick Tap has always run on, where a mis-aimed tap costs a real reward
entry, so the standard is if anything stricter there.

`spin()` also now sets `spinning = true` synchronously before its first `await` (previously the first
statement was `await askWhichKidToSpin()`, leaving a window where two presses could both get past the
`if (spinning)` guard), and re-renders the kid picker at both ends of the spin to drive the disabled
state.

**Status:** Done. Supersedes `D-2026-07-30-spin-tab-ask-kid-on-spin`; re-establishes the shared
Quick Tap/Spin header picker from `D-2026-07-19-reward-tracker-mobile-header-and-table-redesign`.
