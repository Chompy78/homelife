# Homelife

Family apps, deployed as static sites on GitHub Pages.

## Apps

- [`apps/bedroom-reset`](apps/bedroom-reset) - kids' bedroom checklist PWA, one-tap auto-login per tablet, Mum Check, streaks
- [`apps/parent-dashboard`](apps/parent-dashboard) - see every kid's progress in one place

## Shared

- [`apps/shared/config.js`](apps/shared/config.js) - Supabase project connection details, kid list, and the checklist item definitions, used by both apps above

## Backend

Data (checklist state, streaks, progress history) is stored in a dedicated
Supabase project ("homelife", `ap-southeast-2`). The anon/publishable key in
`apps/shared/config.js` is safe to expose client-side - it's scoped by Row
Level Security to only the four tables this app uses, and this project holds
no other sensitive data.

Tables:

- `kids` - id, name, avatar, date of birth
- `kid_checklist_state` - today's checkbox state per kid
- `kid_streaks` - current streak, last pass date, last Mum result
- `kid_progress_log` - append-only history of resets and Mum checks, used by the parent dashboard

## Deployment

Pushing to `main` triggers `.github/workflows/deploy-pages.yml`, which
publishes the whole repo to GitHub Pages. Once live:

- Kids' app: `https://<your-username>.github.io/homelife/apps/bedroom-reset/`
- Parent dashboard: `https://<your-username>.github.io/homelife/apps/parent-dashboard/`
