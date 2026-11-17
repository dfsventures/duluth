# Local visual-check toolkit

Screenshots the admin pages (old and new look, light and dark, three screen sizes) from a
local copy of Molly filled with placeholder data, so a change can be looked at before anyone
else sees it. Nothing here touches production, the network, or any real data.

## Commands (run from the repo root)

1. `npx tsx scripts/visual/setup.ts` creates the tables in the local database `molly_local` and
   fills it with placeholder data (Acme, Globex, "Sam Admin", example.com ...). Safe to re-run: it wipes first.
2. `npx tsx scripts/visual/shoot.ts` starts `next dev` on port 3100, signs in as the seeded admin,
   takes the screenshots, and stops the server it started.

Narrow a run with `--pages companies,approvals` (dashboard, companies, updates, approvals, deals, memos, board),
`--looks new` (new, old), `--viewports desktop,phone` (desktop 1440x900, wide 1920x1080, phone 390x844),
`--out <dir>`, and `--no-states` (skips the open-pane, hover and command-palette pictures).

## One-time setup (outside the repo)

Playwright is kept out of the repo, in `/Users/josephbenson/.cache/molly-visual`:
`npm install playwright` there, then `npx playwright install chromium`.
The database needs to exist once: `createdb molly_local`.

## Safety guard

Both scripts refuse to run (exit 1) unless the database URL is on `127.0.0.1` or `localhost` and the
database is named `molly_local`. `setup.ts` uses `prisma db push --accept-data-loss`, which is acceptable
only because of that guard. All settings live in `env.ts` and are passed explicitly (no `.env` file is read);
every outside service (email, AI, Slack, Google, Granola, storage, Marge) is set to empty so nothing can be sent or called.
The session secret in `env.ts` is a fixed local-only string, not a secret.

## Where the pictures go

`/tmp/molly-visual/<timestamp>/`, named like `companies__new-light__desktop.png`. Extra states:
`companies-pane__...`, `companies-hover__...`, `approvals-pane__...`, `palette__...` (new look, first requested size).
The run exits non-zero if any page redirects to `/login` or shows an error page; browser console errors are printed.

Notes: the dev server shares the repo's `.next` folder, so do not run another `next dev` or `next build` in the repo at the same time.
