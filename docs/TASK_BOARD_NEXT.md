# Task Board — NEXT

Open work only — see `CHANGELOG.md` for what's already shipped and
`DECISIONS.md` for why non-obvious choices were made. Every task
carries enough detail (tags, status, a concrete "done when") that it
can be picked up cold — by an AI assistant or a human — without
re-deriving the design. Bigger tasks also carry a **Design notes**
block with the technical detail (schema, files, endpoints) needed to
actually build them.

**Tags in use:** `ai-vision`, `prompt`, `validation`, `feature`, `ux`,
`infra`, `refactor`, `migration`. Reuse these rather than inventing
near-duplicates, so the list stays scannable by tag.

**Status values:** `open` (not started) · `in-progress` · `blocked`
(needs something external, e.g. a person/service) · `done`.

Split from `docs/TASK_BOARD.md` on 2026-07-28 by its existing NOW/NEXT/LATER bands. Read when the task at
hand needs it — see `TASK_BOARD_NOW.md` for what's currently in progress.

---

## 🟡 NEXT

### Migration M2b - Wrap the scaffold in Capacitor, build a debug APK
- **Tags:** infra, migration
- **Status:** blocked (needs Migration M2 done)
- Add Capacitor (`@capacitor/core`, `@capacitor/android`) to the M2
  scaffold, `npx cap add android`, produce a debug APK. First real contact
  with Android Studio/SDK setup on this machine - budget real time if it's
  never had either installed.
- **Done when:** a debug APK builds and installs via `adb install` on an
  emulator or spare device, showing the scaffold's trivial screen.

### Migration M2c - Sideload on the child's tablet, verify Family Link independence (decision gate)
- **Tags:** infra, migration
- **Status:** blocked (needs Migration M2b done)
- Install the M2b APK directly on the actual child tablet used day-to-day.
  Check Android Settings > Apps for its own entry, then the real test: mark
  it "Unlimited" in Family Link, exhaust the daily screen-time limit, and
  confirm it stays open while Chrome/browsing gets blocked.
- **Done when:** confirmed independently-controllable in Family Link on the
  real tablet. **If this fails,** stop here and re-evaluate the whole
  migration direction rather than continuing to Migration M3 - see the
  "when I would NOT choose this" section of
  `D-2026-07-20-pwa-to-capacitor-migration-assessment`.

### Migration M3 - Port first real app to React/Vite
- **Tags:** feature, migration
- **Status:** blocked (needs Migration M2c passing)
- Pick the smallest real app (`my-rewards` or `leaderboard`) and rebuild it
  as React components calling the same `callApi()`/`family-api` edge
  function, unchanged backend. Keep the vanilla version live and deployed
  until the port has been used for real for a few days.
- **Done when:** every current feature of the chosen app works identically
  to the live vanilla version, verified against a disposable Supabase
  family.

### Migration M4 - Add PWA support to the ported app
- **Tags:** infra, migration
- **Status:** blocked (needs Migration M3 done)
- Replace the hand-rolled `manifest.json`/`service-worker.js` with
  `vite-plugin-pwa`, eliminating the manual `CACHE_NAME`-bump convention
  (see `AGENTS.md`'s "Project conventions") for this app going forward.
- **Done when:** install-to-homescreen and offline reload both work, and a
  rebuild auto-invalidates the old cache with no manual version bump.

### Migration M5 - Add Capacitor Android wrapper to the ported app
- **Tags:** infra, migration
- **Status:** blocked (needs Migration M4 done)
- Repeat Migration M2b's Capacitor wrap, this time on the real ported app,
  reusing whatever setup/config pattern M2b established.
- **Done when:** `npx cap open android` gives a buildable project for this
  app.

### Migration M6 - Build/test a release-quality APK for the ported app
- **Tags:** infra, migration
- **Status:** blocked (needs Migration M5 done)
- Produce a signed release APK - first time generating and safely backing
  up the signing keystore. Treat the keystore file with the same care as a
  production secret: never commit it, document *where* it's stored (not
  its contents) once a location is chosen.
- **Done when:** a signed APK installs and runs correctly on a real device.

### Migration M7 - Confirm the ported app on the tablet with Family Link
- **Tags:** infra, migration
- **Status:** blocked (needs Migration M6 done)
- Production confirmation of what Migration M2c already proved on the
  throwaway scaffold - now on the actual real app the kid will use daily.
- **Done when:** the real app is independently controllable in Family Link
  on the child's tablet.

### Migration M8 - Extract reusable template + document the convention
- **Tags:** infra, migration, refactor
- **Status:** blocked (needs Migration M7 done)
- Generalize whatever's hardcoded to the first ported app into a
  copy-and-rename template; update `AGENTS.md`/`README.md` with the new
  build/deploy/Capacitor conventions, the way they currently document the
  existing no-build conventions. Android-only for now - fold in iOS once
  Migration iOS-3 below has passed.
- **Done when:** a second app built from the template takes noticeably less
  time than the first.

### Migration iOS-1 - Cloud Mac CI setup + wrap the scaffold in Capacitor iOS
- **Tags:** infra, migration
- **Status:** blocked (needs Migration M7 done)
- No local Mac is available, so iOS builds need a cloud Mac CI service
  (Codemagic / GitHub Actions macOS runner / MacStadium - pick one). Add
  `@capacitor/ios` to the `migration/hello-world/` scaffold from Migration
  M2 (still around, reused here rather than rebuilt), `npx cap add ios`,
  and produce a build via that CI service. Deliberately sequenced after
  Android is fully proven (Migration M7), not alongside it - see
  `D-2026-07-20-ios-support-sequencing`.
- **Done when:** an iOS build artifact is produced via the chosen cloud Mac
  CI, without needing a physically owned Mac.

### Migration iOS-2 - Free-tier device install, verify Apple Screen Time independence (decision gate)
- **Tags:** infra, migration
- **Status:** blocked (needs Migration iOS-1 done)
- Register the 1-2 known family Apple device UDIDs using a free Apple ID
  (no paid account yet) and install directly. The free-tier signing
  certificate expires after 7 days - that's fine, this task only needs to
  answer the Screen Time question, not ship a daily-use build. Within that
  window, check iOS Settings > Screen Time > App Limits / Always Allowed
  for an independent entry, and test whether marking it "Always Allowed"
  keeps it usable once Safari/other apps are Downtime-restricted.
- **Done when:** confirmed (or refuted) whether Apple Screen Time treats
  the Capacitor-wrapped app independently of Safari on a real device.
  **If this fails,** the iOS side needs its own re-evaluation - the
  Android result (Migration M2c) does not transfer.

### Migration iOS-3 - Apple Developer account + TestFlight, if iOS-2 passes
- **Tags:** infra, migration
- **Status:** blocked (needs Migration iOS-2 passing)
- Only worth doing once iOS-2 confirms the mechanism works - the free-tier
  7-day certificate expiry is unworkable for a kid's daily-use app, so
  ongoing real use needs either the $99/year Apple Developer Program
  account + TestFlight (recommended - builds stay valid ~90 days, no
  manual reinstall chore) or continued weekly manual Mac-side reinstalls
  (not recommended).
- **Done when:** a build is distributed via TestFlight (or an equivalent
  ongoing mechanism) to the known family devices with no weekly manual
  reinstall required.

### Per-kid reward weighting overrides for the spin wheel
- **Tags:** feature, ux
- **Status:** open
- `family_reward_categories.spin_weight` (see
  `D-2026-07-19-reward-tracker-spin-weighting`) is currently one
  family-wide value per reward, applied identically on every kid's spin
  wheel. Let a parent override that weight per kid instead - e.g. "make
  dessert land more often for Kid A but not Kid B" - with an explicit way
  to reset a kid back to the shared/family default rather than every kid
  needing its own value forever. A per-kid weight of `0` means that
  reward is excluded from that kid's wheel entirely (not just rare -
  absent), same principle as an angular wedge width of zero.

<details>
<summary>Design notes</summary>

**Schema:** a new table (e.g. `family_reward_category_kid_weights`,
columns `category_id`, `kid_id`, `spin_weight`) holding only the
*overrides* - no row means "use the family default," so "reset to
shared" is just deleting the override row rather than needing a separate
sentinel value. Enforce in the `family-api` edge function, never rely on
a client-side UI restriction alone.

**Wheel math:** `runOneSpin()`/wedge-sizing (`apps/reward-tracker/app.js`
around the `totalWeight`/`span` calculation, ~line 594-611) needs to
resolve weight per-kid (override if present, else `spin_weight`) before
computing wedge angles, and must handle a kid whose *every* reward
resolves to 0 (empty wheel) without dividing by zero.

**UI:** Manage Categories currently edits one `spin_weight` `<select>`
per category (`apps/reward-tracker/app.js` ~line 1123-1147); this needs a
per-kid view/editor (e.g. select a kid, see/edit that kid's effective
weight per reward, with a visible "reset to default" action per row).
</details>

- **Done when:** a parent can set a reward's weight differently for two
  different kids, reset one kid back to the family default weight, and
  set a kid's weight to 0 for a reward and confirm it never appears on
  that kid's wheel - verified against a disposable Supabase family.

---

