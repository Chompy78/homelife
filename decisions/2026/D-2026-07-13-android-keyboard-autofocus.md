# D-2026-07-13-android-keyboard-autofocus

Date: 2026-07-13
Status: Done

**Context:** Reported bug: on Android, the on-screen keyboard never
appeared on the code-entry screen, so the code couldn't be typed at
all.

**Options:**
1. Detect Android via user-agent sniffing and special-case the focus
   timing.
2. Remove the programmatic `.focus()` call on page load entirely and
   rely on the user's own tap to focus the field.

**Decision:** Option 2.

**Why:** Root cause was that Android Chrome doesn't summon the
on-screen keyboard for a script-triggered `.focus()`, and having the
field already-focused on load also blocked a subsequent real tap from
re-triggering focus — so removing the auto-focus fixes it everywhere,
with no browser-sniffing and no risk of missing some other affected
device/browser combination.

**Status:** Done. Verified via Playwright that no element is focused
immediately after page load.
