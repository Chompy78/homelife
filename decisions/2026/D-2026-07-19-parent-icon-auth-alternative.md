# D-2026-07-19-parent-icon-auth-alternative

Date: 2026-07-19
Status: Done

**Context:** The user proposed a "3-of-9 graphical password" as a
child-friendlier alternative to the 4-digit parent PIN: a 3x3 grid of
distinctive fantasy icons, where a parent memorises any 3 (order
doesn't matter) and the grid's positions shuffle on every attempt to
resist shoulder-surfing by a kid watching. The spec was explicit that
this is "not bank-level security," just meant to raise the bar above
casual access while staying fast and touch-friendly for parents and
kids around age 8-10. Two things needed deciding before writing code:
which flows it should apply to, and whether it replaces the PIN
outright.

**Options considered (with the user's answers):**
1. Scope: reward-tracker's PIN-gated actions only, vs. also Bedroom
   Reset's Parent Check flow. **Chosen: both** - the two apps already
   share one `families.parent_pin` value, so supporting the icon
   picker in only one would leave the other's PIN meaning something
   different depending on which app you're in, which is more
   confusing than useful.
2. Relationship to the PIN: full replacement vs. a per-family choice
   between the two. **Chosen: per-family choice, in Settings** - some
   parents may prefer a PIN; the icon picker is explicitly a
   different security/UX tradeoff, not a strict upgrade, so families
   pick which one they want rather than having it forced on them.

**Why one shared verification helper, not three copies:** exploring
existing `parent_pin` usage first turned up three separate inline
string comparisons (`verify_pin`, `parent_check`,
`family_room_parent_check`). Adding an icons branch to each
independently would have tripled the duplication going forward, so all
three now call one `verifyParentSecret(familyId, body)` helper that
branches once on `family.parent_auth_method`.

**Why a family-level method, not a per-parent one:** `parent_pin` was
already a single family-wide value (not per-parent-login), and nothing
in the request asked for individual parent accounts - `parent_icons`
follows the same shape (`families.parent_auth_method` +
`families.parent_icons`), so no new identity concept was introduced.

**Why no lockout on wrong icon attempts:** matches the existing PIN's
behaviour (wrong PIN just shows an error and lets the parent retry
immediately) rather than the stricter 2-attempt lockout used elsewhere
in the app for kid-side trade-image verification - that lockout exists
to stop a kid brute-forcing a trade approval, which isn't the threat
model here.

**Why `get_family_auth_method` is callable by either role:** Bedroom
Reset's Parent Check is triggered from a kid's own device, so the kid
session needs to know which UI (numeric pad or icon grid) to render
before a parent even shows up to authenticate - the action only ever
returns the method name, never the secret, so this doesn't weaken the
security boundary.

**Status:** Done.
