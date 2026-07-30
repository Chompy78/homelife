# D-2026-07-18-reward-tracker-custom-reasons

Date: 2026-07-18
Status: Done

**Context:** The note modal's preset "reasons" (e.g. "Tidied room",
"Redeemed today") were a fixed list hardcoded in `app.js`. The user asked
for these to be fully customizable - add or delete any, while keeping the
existing defaults as a starting point rather than wiping them out.

**Options:**
1. Keep the presets client-side but make them editable via localStorage
   (per-device, not shared across the family's parent devices).
2. A new family-scoped table (`family_reward_notes`), same pattern as
   `family_reward_categories` - seeded with the old hardcoded list as
   defaults via a per-family trigger, fully editable through a new
   `manage_reward_notes` edge-function action.

**Decision:** Option 2.

**Why:** Categories already prove this exact pattern works (server-owned,
per-family, seeded-then-editable) - reasons are the same shape of data,
so reusing it instead of inventing a device-local scheme keeps every
parent device in sync and matches how a parent already expects to manage
this kind of list. A reason is stored as free text on `kid_reward_log.note`
at tap time (not a foreign key), so deleting a reason from the list never
touches existing history - no confirm dialog or PIN gate needed for
delete, unlike deleting a category. Existing families were backfilled
with the same defaults the seed trigger gives new families, so nobody's
list started empty.

**Status:** Done.
