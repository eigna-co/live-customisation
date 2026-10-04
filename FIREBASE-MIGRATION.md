# Firebase migration preparation

Status: local preparation only. No project created, billing enabled, secrets copied,
live orders submitted or deployment performed.

Use a separate Firebase project for the reusable event platform, not the main EVFY
project. Airtable remains the order store. No Firestore database is required by
this migration.

## Local checks

1. Install the root dependencies with `pnpm install --frozen-lockfile`.
2. Install the separate function package with
   `pnpm --dir firebase-functions install --frozen-lockfile`.
3. Run `node --test --test-isolation=none test/*.test.js`.
4. Run `node scripts/build-firebase.mjs`. Only `dist/` is publicly served.
5. Run `node scripts/build.mjs` to refresh the tracked Netlify bundle as well.

Initial migration checks: 25 tests passed, both builds succeeded, the Firebase function module
loads, and public output contains only index.html, app.js and images. Local checks
used Node.js 24; Node.js 22 emulator/cloud verification is still pending. No live
Airtable requests were made by the tests.

## Before deployment

- Resolve the new Firebase project ID and owner account. No project alias is
  supplied intentionally, to avoid accidentally deploying to an EVFY project.
- Cloud Functions deployment requires the Blaze billing plan. The owner must
  approve this before enabling it. Instance limits are not a hard spending cap.
- Configure `AIRTABLE_TOKEN`, `AIRTABLE_BASE` and `AIRTABLE_TABLE` using Firebase
  Secret Manager (`firebase functions:secrets:set NAME --project PROJECT_ID`).
  Never put credentials in GitHub, browser code or this document.
- Initially use a dedicated test Airtable table with the same schema. Hosting
  preview channels can still invoke deployed functions; they do not isolate data.
- Deploy functions and hosting together with an explicit project ID only after
  approval. Region is Singapore (`asia-southeast1`); runtime is Node.js 22.
- Test a valid order, invalid input, duplicate email, reload, mobile layout and
  Airtable failure against test data. Verify the deployed platform's client IP
  handling; the inherited rate limit is best-effort per process, not global.
- Confirm the final event table, then retest before sharing the new event URL.
  Keep the existing Netlify URL available until cutover is explicitly approved.

## Existing limitations (not solved by moving hosting)

- Airtable duplicate check and create are separate operations; simultaneous
  submissions can still create duplicates. There is no atomic stock enforcement.
- Nuvei products and rules now use a shared event configuration; see EVENT-SETUP.md.
- SMS delivery and real queue/collection updates have not been verified.
- Staff authentication, event administration and inventory need separate work.

## Nuvei configuration

Implemented locally: black travel adaptor, configured quantity 100, five-letter personalisation limit,
Times New Roman / Segoe Print / Lucida Sans Regular choices, front top text and
bottom logo, event October 20–21. Confirm year before publishing date copy.

Pending assets/details: official logo, exact colour values, licensed web/production
font assets, engraving size and final placement template, permitted characters
and casing, and whether quantity 100 is shared across both days. Inter Tight or
Source Serif is the website typography request, distinct from engraving fonts.

References:
- https://firebase.google.com/docs/hosting/functions
- https://firebase.google.com/docs/functions/config-env
