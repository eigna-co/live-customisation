# Nuvei readiness — 8 October 2026

## Completed

- Nuvei draft merged into GitHub main; frontend published at tge-live.netlify.app.
- Netlify connected to approved Firebase backend. Read-only health checks pass;
  anonymous staff operations are rejected. Domains remain unchanged.
- Blaze billing approved, Singapore Firestore with deny-all client rules, core
  backend and event-only staff authentication deployed.
- Test staff account verified, enabled and has the Nuvei role (rechecked 8 October).
  Siew Ping's supplied email currently returns user-not-found in Firebase; she
  needs an account, verification, event role and her own live sign-in.
- 50 gifts per Singapore day on 20–21 October 2026; 100 total with no rollover.
- One gift per normalised email; top-only engraving, fixed bottom logo.
- Five-letter limit removed. Longer names shrink in the approximate preview;
  3.5 cm is treated as provisional width, with physical height unconfirmed.
- Printing text now allows spaces, numbers and symbols; Chinese/Han characters
  are blocked. The example is Catherine and guest guidance/labels are simplified.
- Audited staff workflow; review before submission; no guest cancellation/editing.
- Hourly Twilio balance monitor deployed; light-red warning at US$5 or below.
  No automatic top-up or credentials in source.
- 50 simulated live visitors passed all 100 HTML/availability requests.
- Isolated real Firestore staging verified stock, duplication and retry recovery.
  Bounded client retries completed the second simultaneous 50-order wave.
- One approved SMS test delivered and receipt confirmed by the user.
- Revised SMS uses “at the booth” and omits Nuvei. Automatic collection SMS
  enabled and notifyCollection deployed on the user's instruction. It triggers
  from pending Ready notifications; durable claims prevent duplicate sends.
- Local service-level rehearsal verifies order creation through Engraving, Ready,
  notification acceptance and Collected with a fake SMS provider. Duplicate worker
  calls send once; uncertain responses cannot be retried by staff. This is not a
  deployed Firestore-trigger test. See COLLECTION-REHEARSAL.md.
- On 8 October, an isolated deployed Firestore trigger using the same notification
  handler submitted exactly one approved SMS; Twilio reports delivered, no error.
  No live orders or inventory changes. Fixed the default-app startup bug discovered
  by this test and deployed the fix to the backend, SMS and balance workers.
- Customer and staff copy reviewed: removed draft production notes and preview
  overlays, simplified status/connection wording, and replaced raw Error/Processing
  labels with useful instructions. Closed event is no longer labelled sold out.
  Browser walkthrough used the isolated trial only; no real SMS or orders.
- All 99 tests and both builds pass. See LOAD-TEST-RESULTS.md for scope/limitations.
- Customer records retained as instructed; no automatic data deletion.

## Still required before event sign-off

1. Airtable owner adds the missing Font text field and provides write access;
   current account is read-only. Font is still missing on the 8 October read-only
   API check; no customer records were returned. Keep its old SMS automation off.
2. Isolated Airtable create/status/reconciliation test, then deploy mirror worker.
3. Final production-path rehearsal after staff onboarding/Airtable setup. The
   isolated deployed trigger/shared SMS handler has passed; a customer submission
   through live HTTP and staff Ready action has not been exercised end-to-end.
4. Production engraving dimensions, text size, matching font files and allowed
   characters. Browser font fallbacks are not final production artwork.
5. Owning Netlify team checks current plan and remaining usage; current login cannot
   view its billing/settings. No automatic upgrades or card changes.
6. Final customer privacy/retention/SMS wording and approved staff live login.
7. Full isolated staging rehearsal, including deployed Node 22/HTTP writes and
   triggers. Existing real database test used a local REST adapter, not that path.

Optional later: live.thegiftexpert.com needs DNS access, not a launch dependency.
