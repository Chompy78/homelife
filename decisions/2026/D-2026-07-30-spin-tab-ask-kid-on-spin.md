# D-2026-07-30-spin-tab-ask-kid-on-spin

Date: 2026-07-30
Status: Superseded

**Context:** The user asked for a tweak to the reward spinner: on the Spin tab, kids should not
appear in the sticky header's kid picker (`kidPickerRow`) the way they do on Quick Tap. Instead,
pressing SPIN should ask which kid it's for, then spin. This partially revisits
`D-2026-07-19-reward-tracker-mobile-header-and-table-redesign`, which put both Quick Tap and Spin
under one shared header kid picker (option 1 of that decision: "Quick Tap/Spin only").

**Options:**
1. Leave the header picker shared between Quick Tap and Spin (status quo) - rejected outright by
   the user's ask.
2. Hide the header picker on Spin and just keep using whatever `selectedKidId` was last set to
   (e.g. from Quick Tap, or the app's default-to-first-kid on load) - rejected: silently spinning
   for a leftover selection is exactly what the user didn't want; the point was an explicit ask
   each time.
3. Hide the header picker on Spin; pressing SPIN opens a modal listing every kid (reusing the
   existing `.catModal`/`.catCard` shell for consistency with the app's other modals), the chosen
   kid becomes the new `selectedKidId`, then the existing spin flow runs unchanged. **Chosen.**

**Why:** Option 3 satisfies the ask directly (no kid chips in Spin's header; an explicit prompt on
every SPIN press) while reusing `selectedKidId` as the single source of truth the rest of the Spin
tab (bonus-spin row, "earn a bonus spin" reasons list, the "Spinning for X" banner) already reads
from - so picking a kid in the new modal keeps all of that in sync for free, rather than needing a
second parallel "which kid" concept. The modal pre-highlights whichever kid is currently
`selectedKidId` (via a `.selected` style matching the header chip's own convention) so a parent
re-spinning for the same kid can just tap the same button again instead of hunting for them.
Quick Tap's header picker is untouched - this only changes Spin.

**Status:** Superseded by `D-2026-08-18-spin-kid-picker-before-spin` - the modal's kid buttons
landed on top of the SPIN button underneath, so closing it ghost-clicked SPIN and re-triggered a
spin. Spin is back on the shared header kid picker, with SPIN spinning immediately.
