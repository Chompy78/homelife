# Homelife

Family apps, deployed as static sites on GitHub Pages.

## Apps

- [`apps/bedroom-reset`](apps/bedroom-reset) - kids' bedroom checklist PWA, one-tap auto-login per tablet, PIN-gated Mum Check, streaks, points/levels/badges
- [`apps/parent-dashboard`](apps/parent-dashboard) - see every kid's progress, level, badges and a 7-day streak calendar in one place, auto-refreshing

## Shared

- [`apps/shared/config.js`](apps/shared/config.js) - Supabase project connection details, kid list, checklist items, the Mum Check PIN, and the points/levels/badges definitions, used by both apps above

## Backend

Data (checklist state, streaks, progress history) is stored in a dedicated
Supabase project ("homelife", `ap-southeast-2`). The anon/publishable key in
`apps/shared/config.js` is safe to expose client-side - it's scoped by Row
Level Security to only the four tables this app uses, and this project holds
no other sensitive data.

Tables:

- `kids` - id, name, avatar, date of birth
- `kid_checklist_state` - today's checkbox state per kid
- `kid_streaks` - current streak, best streak, last pass date, last Mum result, total points, total passes
- `kid_progress_log` - append-only history of resets and Mum checks (with a `log_date` per entry), used by the parent dashboard's recent activity and 7-day streak calendar

## Deployment

Pushing to `main` triggers `.github/workflows/deploy-pages.yml`, which
publishes the whole repo to GitHub Pages. Once live:

- Kids' app: `https://<your-username>.github.io/homelife/apps/bedroom-reset/`
- Parent dashboard: `https://<your-username>.github.io/homelife/apps/parent-dashboard/`
