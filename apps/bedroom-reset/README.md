# Bedroom Reset PWA

A tablet-friendly bedroom checklist for kids, with a one-time "who are you"
picker per device, cloud sync via Supabase, Mum Check, room score, One Thing
At A Time mode, and daily streaks.

## Files

- `index.html` - the app itself
- `app.js` - app logic, kid picker, checklist rendering, Supabase sync
- `styles.css` - styling
- `manifest.json` - tells the tablet/browser how to install the app
- `service-worker.js` - caches the app so it can work offline after first load
- `icons/icon-192.png` and `icons/icon-512.png` - install icons
- `../shared/config.js` - Supabase project config + kid list + checklist items, shared with the parent dashboard

## How the auto-login works

The first time the app opens on a tablet, it shows a full-screen picker with
each kid's name. Tapping a name saves that choice in the browser's local
storage on that device, so every future launch skips straight to that kid's
checklist - no typing, no passwords. A small "not you? switch" link in the
header resets it if a tablet is ever reused by a different kid.

## Offline + sync behaviour

Every change is written to local storage immediately (so the app keeps
working with no internet), and pushed to Supabase in the background. If the
tablet is offline, the sync calls just fail silently and the app carries on
working from local storage; nothing is lost.

## Android tablet install

1. Open the deployed site URL in Chrome or Edge on the tablet.
2. Use the browser menu and choose **Install app** or **Add to Home screen**.
3. Open it from the tablet home screen and tap the kid's name once.
4. After the first load, it should still open offline from the installed app.
