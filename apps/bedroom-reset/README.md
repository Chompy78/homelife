# Bedroom Reset PWA

A tablet-friendly bedroom checklist for kids, with a one-time code-based
auto-login per tablet, PIN-gated Mum Check, room score, Focus Mode, daily
streaks, points, levels and badges. Works for any number of families - each
one is isolated by its own codes.

A kid also sees a room switcher above the checklist if their family has any
shared rooms (kitchen, etc., added by a parent from the dashboard) - tapping
one switches the whole screen to that room's checklist/streak/points, which
belong to the family rather than one kid. Switching back to "My Room" is
unaffected by anything that happened in a shared room.

## Files

- `index.html` - the app itself
- `app.js` - app logic, code entry, checklist rendering, backend sync
- `styles.css` - styling
- `manifest.json` - tells the tablet/browser how to install the app
- `service-worker.js` - caches the app so it can work offline after first load
- `icons/icon-192.png` and `icons/icon-512.png` - install icons
- `../shared/config.js` - checklist items, points/levels/badges rules, the backend URL
- `../shared/api.js` - the fetch helper used to call the backend
- `../shared/image.js` - resizes/compresses a photo in the browser before it's uploaded

## How the auto-login works

The first time the app opens on a tablet, it asks for a kid code (a parent
gets this from the parent dashboard and gives it to the kid, or shares a
direct link with the code baked in). Entering it saves a session token in
the browser's local storage on that device, so every future launch skips
straight to that kid's checklist - no typing, no passwords. A small "not
you? switch" link in the header resets it if a tablet is ever reused by a
different kid. A kid's code only ever unlocks that kid's own data - see the
root README for how that's enforced.

## Offline + sync behaviour

Checklist taps update the screen immediately from local storage (so the app
keeps working with no internet), and are pushed to the backend in the
background with a timeout so a hanging connection fails fast instead of
stalling the app. If a tablet goes offline mid-session, anything checked
while offline is reconciled and pushed the next time the app successfully
talks to the backend. A status line under the header shows "Synced" /
"Saved on this tablet" / "Offline" so it's obvious when a device has lost
connection. Points, streaks and levels always reflect the backend's numbers
(never guessed locally), since those are calculated server-side.

## Mum Check PIN

Tapping **Pass** or **Great Job** asks for the family's 4-digit PIN before
it counts - otherwise a kid could just tap their own room as passed. The PIN
is checked server-side (a parent sets/changes it from the parent dashboard),
never shipped to the kid's browser. **Try Again** and **Start a new day**
don't need the PIN since they can't be used to fake progress.

## The checklist itself

The bedroom checklist isn't fixed - each family has its own copy
(`family_bedroom_items`), seeded with a sensible 17-item default when the
family is created, which a parent can add to, rename or remove from the
parent dashboard. Categories (Clothes, Floor, Storage, etc.) are just a
label on each item, so a newly-added item can go under an existing
category or a new one of its own.

## Points, levels and badges

Checking an item, finishing the whole room, and a Mum Pass/Great Job all
award points - calculated and stored server-side (`supabase/functions/family-api`)
so they can't be spoofed by editing the page. Points add up to a level with
a fun title (`LEVELS` in `../shared/config.js`), and unlock badges for
streaks and rooms cleaned (`BADGES`) - shown on a shelf under the level bar,
greyed out until earned. Levels and badges are visible on both the kid's own
app and the parent dashboard.

## What Done Looks Like

A kid (or a parent, from the dashboard) can upload up to 3 reference photos
showing what a properly tidy room looks like - a visual target to aim for,
shown right above the checklist. Photos are resized/compressed in the
browser before upload (`../shared/image.js`) so it's fast even on a slow
connection, then stored privately in Supabase Storage - the bucket isn't
public, and every photo is served through a short-lived signed URL minted
by the edge function, never a permanent public link. Tap a photo to view it
full-size; from there it can be removed.

## Android tablet install

1. Open the deployed site URL in Chrome or Edge on the tablet (or a direct link with `?code=` filled in).
2. Enter the kid's code once.
3. Use the browser menu and choose **Install app** or **Add to Home screen**.
4. Open it from the tablet home screen from then on.
5. After the first load, it should still open offline from the installed app.
