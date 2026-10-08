# Nuvei readiness — 8 October 2026

## Completed

- Nuvei draft merged into GitHub main; frontend published at tge-live.netlify.app.
- Netlify connected to approved Firebase backend. Read-only health checks pass;
  anonymous staff operations are rejected. Domains remain unchanged.
- Blaze billing approved, Singapore Firestore with deny-all client rules, core
  backend and event-only staff authentication deployed.
- Test staff account verified, enabled and has the Nuvei role (rechecked 8 October).
  Siew Ping's approved account is now enabled, email-verified and has the Nuvei
  staff role. Her own successful live queue sign-in still needs confirmation.
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
- Welcome heading keeps its original styling; full stops removed as requested.
- All 101 tests and both builds pass. See LOAD-TEST-RESULTS.md for scope/limitations.
- Airtable Font field is present and all nine required fields passed preflight.
  Saved one labelled non-customer test record with no phone number or stock use;
  create and Engraving update succeeded using the existing saved token.
- Airtable Status choices now include Engraving and Collected alongside Queued
  and Ready. The mirror maps internal Decorating to the visible Engraving label.
  Existing records were not changed. Legacy Airtable SMS automation remains off.
- Latest approved frontend build is confirmed live by matching its bundle hash.
- Shared mirror handler verified Queued, Engraving, Ready and Collected against
  the same labelled Airtable test record; no SMS, real orders or inventory changes.
- Firebase reports mirrorOrders created successfully in asia-southeast1.
  CLI ended with an artifact-image cleanup-policy warning, not a deployment failure.
- Deployed mirrorOrders, redemptions, notifyCollection and monitorTwilioBalance
  are all confirmed ACTIVE in asia-southeast1.
- Integrated rehearsal passed via local HTTP, isolated real Firestore and real
  Airtable: all statuses, Catherine/Segoe Print, tracking, duplicate email rejection,
  idempotency and three audit entries. Exactly one simulated SMS, no real SMS or
  live inventory changes. Staff identity simulated as explicitly requested.
  See COLLECTION-REHEARSAL.md for test references and remaining scope.
- Actual deployed Airtable event delivery passed on the existing isolated test
  order: Pending → Processing → Synced, with read-only Airtable status/font
  verification. No real SMS or live inventory changes. Temporary trigger source
  removed after the pass; cloud deletion verified. Only the four ACTIVE production
  workers remain. Test records were retained, not deleted.
- Customer records retained as instructed; no automatic data deletion.
- Live welcome, customer details and product selection, plus the public staff
  sign-in page, checked in a 390px portrait viewport with no horizontal overflow.
  Live engraving/review and the authenticated mobile queue remain unverified:
  orders are closed before event dates and staff sign-in needs a fresh session.
- Customer QR PNG/SVG, printable HTML and staff guide prepared in event-kit.
  QR payload matches the live customer URL; physical phone scan before printing
  remains a handover check.
- Airtable Test records view shows the two labelled rehearsal rows; Orders -
  excluding tests excludes them. Original Grid view and records are unchanged.
  Non-test rows include older records and must not be counted as current stock.
- Read-only cost review: billing enabled, no artifact cleanup policy. Budget
  access returned 403, so alert configuration remains unverified. See event-kit.

## Still required before event sign-off

1. Confirm Siew Ping can open the live queue with her approved staff account.
2. Use the non-test Airtable view for operational review. Retain labelled tests
   without counting them as gift orders; no customer record deletion.
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
8. Configure a suitable deployment-image cleanup policy with the project owner;
   current warning means old images may accumulate and incur storage charges.

Optional later: live.thegiftexpert.com needs DNS access, not a launch dependency.
