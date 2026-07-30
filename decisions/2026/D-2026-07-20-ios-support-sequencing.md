# D-2026-07-20-ios-support-sequencing

Date: 2026-07-20
Status: Open

**Context:** After the migration assessment above and its resulting Android-focused task-board plan
(Migration M2-M8), it came up that some family members are Apple/iOS users who also need this app.
Needed to assess how much this changes the recommendation and plan.

**Options considered:**
1. Treat iOS as equally in-scope from the start, running an iOS proof-of-concept alongside Android's
   (Migration M2b/M2c).
2. Prove Android fully first (through Migration M7), then run a separate iOS proof-of-concept track
   afterward.
3. Reconsider the architecture entirely now that iOS is required (e.g. weigh Bubblewrap again).

**Decision:** Option 2. Android is proven fully first; a separate iOS track (Migration iOS-1/iOS-2/iOS-3)
follows, using a cloud Mac CI service since no local Mac is available, starting with free-tier
device-registered installs on the 1-2 known family Apple devices before deciding whether the $99/year
Apple Developer account + TestFlight is warranted.

**Why:** Capacitor already supports iOS as a symmetric additive step (`npx cap add ios` alongside
`npx cap add android`) on the same web codebase, so the underlying recommendation doesn't change - if
anything it's reinforced, since Option 4 (Bubblewrap/TWA) has no iOS equivalent at all and is now
definitively ruled out, not just a weaker second choice. What does change is cost and risk: iOS needs a
genuinely new toolchain dependency (a cloud Mac CI service, since Xcode is Mac-only and no local Mac
exists here) and a recurring cost Android didn't have (the $99/year Apple Developer Program, needed for
any distribution beyond a 7-day-expiring free-tier test build - unworkable for a kid's daily-use app
long-term). It also introduces a second, separate unverified assumption: whether Apple's Screen Time
(App Limits / Always Allowed) treats a Capacitor-wrapped app independently of Safari - unverified either
way, and doesn't inherit from the Android Family Link result. Proving Android first avoids paying for
cloud Mac CI and risking a second platform's effort while the core premise is still unverified on either
platform, and avoids splitting focus across two unfamiliar toolchains at once.

**Status:** Open (revisit once Migration M7 passes and the iOS track begins).
