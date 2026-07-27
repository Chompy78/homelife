# D-2026-07-18-reward-tracker-instant-tap

Date: 2026-07-18
Status: Done

**Context:** Even after `D-2026-07-18-reward-tracker-inline-plus-minus`
put `+`/`-` directly on each row, the user reported adding/spending as
"very slow, very lagging" and asked to drop the PIN on Spend and the
reason prompt entirely. Tracing the actual flow: every tap opened a note
modal (pick a preset or skip), Spend additionally required the PIN first,
and the balance on screen only updated after `adjust_reward` **and** a
full `loadState()` round trip had both completed - so a tap did nothing
visible until two sequential network calls finished.

**Options:**
1. Just remove the PIN gate and the note modal's blocking step, but keep
   awaiting the network before updating the UI.
2. Also make the balance update optimistically - update `state.balances`
   and re-render immediately on tap, fire `adjust_reward` in the
   background, then reconcile via `loadState()` without blocking on it.

**Decision:** Option 2.

**Why:** Removing the PIN and the modal fixes the "no reason" and
"no PIN" asks directly, but the "laggy" complaint was really about
latency between tap and visible feedback - which a modal and a PIN
prompt make worse, but don't fully explain on a slow connection even
without them, since the balance still wouldn't move until the network
finished. Optimistic updates fix that at the root: the number changes
the instant you tap, independent of connection speed, and the Undo toast
(already the existing safety net for a mis-tap) still catches anything
that needs correcting once the real write completes. This makes the note
modal fully unreachable, so it and its dedicated `#noteModal` DOM/CSS
were removed rather than left as dead code; the underlying
`family_reward_notes` table and "Manage reward reasons" screen
(`D-2026-07-18-reward-tracker-custom-reasons`) are untouched and still
reachable from Table view, just not wired into a tap for now.

**Status:** Done. `tapReward()` replaces `openNoteModal`/`commitTap`;
`requirePin` no longer wraps Spend in either Quick Tap or Table view
(still used for category delete, Reset, and Kid View exit). Verified via
Playwright with an artificially slow (800ms) mocked `adjust_reward` -
confirmed the balance updates in under 100ms regardless, and that no PIN
or note modal ever appears for either action. Bumped the reward-tracker
service worker cache to v8.
