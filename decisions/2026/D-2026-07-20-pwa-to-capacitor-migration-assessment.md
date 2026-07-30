# D-2026-07-20-pwa-to-capacitor-migration-assessment

Date: 2026-07-20
Status: Open

**Context:** Child tablets hit Google Family Link's daily screen-time limit and the installed PWAs
(bedroom-reset, reward-tracker, my-rewards, parent-dashboard) may stop opening, while Chrome can't safely
be marked "Unlimited" - that would also unlock YouTube and general browsing. Asked for a practical
assessment of migrating from the current no-build vanilla-JS PWA architecture to React + TypeScript +
Vite + PWA + Capacitor Android, to give these apps their own independent Android app identity that
Family Link can allow/restrict separately from Chrome.

**Options considered:**
1. Keep the current vanilla PWA structure as-is.
2. Convert to React + Vite + PWA only, no native wrapper.
3. React + Vite + PWA + Capacitor Android - a real native wrapper per app.
4. Bubblewrap / Trusted Web Activity - a thin native shell pointing at the existing live URL.

**Decision:** Option 3, staged so the Family-Link assumption is proven on a trivial "hello world" scaffold
before committing to porting any of the 5 real apps. The resulting execution plan is on
`docs/TASK_BOARD.md` as Migration M2 through M8, with a M2b/M2c Family-Link proof-of-concept pair inserted
before any real app porting, plus a LATER item to port the remaining 4 apps once a template exists from
the first port.

**Why:** Options 1 and 2 don't touch the actual problem - a browser-installed PWA (1) or a Vite-rebuilt PWA
(2) both still depend on Chrome/WebAPK wrapping, whose interaction with Family Link's per-app controls is
inconsistent across Android/Chrome versions and outside this project's control either way. Option 4 (TWA)
gives an app its own Android identity but still renders live content through the device's Chrome/WebView
component, plausibly carrying some of the same attribution ambiguity, just less severely - a real
Capacitor-wrapped native app runs its WebView inside its own process, which is the actual mechanism that
reliably lets Family Link treat it independently of Chrome. The existing backend (the `family-api`
Supabase edge function) is already fully framework-agnostic, and the current `apps/shared/*.js`
ES-module layer already separates business logic from DOM-wiring reasonably well - the riskiest,
highest-value part of the stack (data access, auth, per-family/per-kid scoping) needs zero changes under
any option, which meaningfully de-risks a frontend rewrite.

Sequencing the Family-Link proof-of-concept (M2b/M2c) *before* real app porting (M3 onward) specifically
keeps the cost of being wrong low: if Family Link still can't reliably distinguish a Capacitor-wrapped app
from Chrome on the actual tablet/Android version in use, that's cheap to discover on a throwaway "hello
world" scaffold and expensive to discover only after fully porting all 5 real apps.

**Status:** Open (revisit if Migration M2c's Family Link test fails - see that task's "decision gate"
framing on `docs/TASK_BOARD.md`).
