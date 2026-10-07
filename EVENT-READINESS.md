# Nuvei readiness — 7 October 2026

## Completed

- Nuvei draft merged into GitHub main; frontend published at tge-live.netlify.app.
- Netlify connected to approved Firebase backend. Read-only health checks pass;
  anonymous staff operations are rejected. Domains remain unchanged.
- Blaze billing approved, Singapore Firestore with deny-all client rules, core
  backend and event-only staff authentication deployed.
- Staff accounts provisioned. Test account email verified and local cloud login
  tested; Siew Ping still needs email verification and her own live sign-in.
- 50 gifts per Singapore day on 20–21 October 2026; 100 total with no rollover.
- One gift per normalised email; top-only five-letter engraving, fixed bottom logo.
- Audited staff workflow; review before submission; no guest cancellation/editing.
- Hourly Twilio balance monitor deployed; light-red warning at US$5 or below.
  No automatic top-up or credentials in source.
- 50 simulated live visitors passed all 100 HTML/availability requests.
- Isolated real Firestore staging verified stock, duplication and retry recovery.
  Bounded client retries completed the second simultaneous 50-order wave.
- One approved SMS test delivered and receipt confirmed by the user.
- Revised SMS uses “at the booth” and omits Nuvei. Live SMS remains off.
- All 87 tests and both builds pass. See LOAD-TEST-RESULTS.md for scope/limitations.
- Customer records retained as instructed; no automatic data deletion.

## Still required before event sign-off

1. Airtable owner adds the missing Font text field and provides write access;
   current account is read-only. Keep its old SMS automation off.
2. Isolated Airtable create/status/reconciliation test, then deploy mirror worker.
3. Controlled Ready → SMS worker integration test and deployment. Direct provider
   success does not yet prove automatic trigger delivery. Do not enable live SMS early.
4. Production engraving dimensions, text size, matching font files and allowed
   characters. Browser font fallbacks are not final production artwork.
5. Owning Netlify team checks current plan and remaining usage; current login cannot
   view its billing/settings. No automatic upgrades or card changes.
6. Final customer privacy/retention/SMS wording and approved staff live login.
7. Full isolated staging rehearsal, including deployed Node 22/HTTP writes and
   triggers. Existing real database test used a local REST adapter, not that path.

Optional later: live.thegiftexpert.com needs DNS access, not a launch dependency.
