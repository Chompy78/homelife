# D-2026-07-15-reference-photos-parent-only

Date: 2026-07-15
Status: Done

**Context:** Kids could add and remove their own "what done looks
like" reference photos. The user reported this as unwanted — kids
were removing photos from their own view — and asked for parent-only
control.

**Options:**
1. Keep kid photo management but fix whatever bug let them remove
   photos unexpectedly.
2. Remove kid photo-management entirely: client UI removed for kids,
   and — the part that actually matters — the edge function's
   `upload_reference_photo` / `delete_reference_photo` /
   `upload_family_room_photo` / `delete_family_room_photo` actions
   reject any session that isn't `role === "parent"`.

**Decision:** Option 2.

**Why:** This was a real permissions gap, not just a UI bug — a kid
session could call the same edge-function actions directly regardless
of what the UI showed. Removing the client-side controls alone
wouldn't have closed that; the server-side role check is the actual
fix, per the standing rule that the edge function is the only real
security boundary in this project.

**Status:** Done. Verified with real backend requests proving a kid
session is rejected while a parent session still succeeds.
