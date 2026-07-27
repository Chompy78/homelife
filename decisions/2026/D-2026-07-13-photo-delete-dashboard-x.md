# D-2026-07-13-photo-delete-dashboard-x

Date: 2026-07-13
Status: Done

**Context:** Reported bug: removing a reference photo appeared to do
nothing — the screen "flashed," and the photo was still there after
closing the dialog. Root cause: `.confirmModal` rendered behind the
open `.lightbox` (lower z-index), so the confirm dialog was invisible
and unclickable.

**Options:**
1. Fix the z-index bug only, keep the existing
  lightbox-then-confirm-modal delete flow.
2. Remove that flow entirely and add a direct ✕ button on each photo
   tile on the dashboard itself, per the user's own stated preference
   ("ideally it would just be a x on the dashboard instead").

**Decision:** Option 2 — plus defensively bumped `.confirmModal`'s
z-index above `.lightbox`/`.pinModal` in both apps anyway, to prevent
the same class of bug recurring elsewhere.

**Why:** The user's explicit preference was for a simpler, more
discoverable interaction, not just a working version of the old one.
Fixing only the z-index would have solved the report but ignored the
better UX that was asked for directly.

**Status:** Done.
