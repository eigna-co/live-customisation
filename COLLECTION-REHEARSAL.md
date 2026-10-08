# Collection workflow rehearsal — updated 8 October 2026

## Completed without external messages or live orders

`test/collection-workflow.test.js` runs the real queue and notification service
code together against an in-memory database and a simulated Twilio response.
It uses synthetic customer details and a simulated event date.

Verified:

- Full name `Catherine` is saved without truncation.
- Order received → Engraving → Ready → Collected, with guest status updates.
- No SMS request at Order received or Engraving.
- Ready creates a pending notification. Concurrent worker calls make one
  simulated provider submission, with the booth wording and matching reference.
- Collected does not send a second notification or reserve another gift.
- Guest tracking responses expose status/reference, not customer contact details.
- Disabled SMS makes no provider call and does not block collection.
- A lost provider response is flagged for review. Staff retry cannot blindly
  resend a notification that may already have been accepted.
- An unauthenticated status update cannot schedule a notification.

Run all release checks with `node scripts/verify-release.mjs`.
Result: 101 tests and both production builds pass.

## Not proved by this rehearsal

The local rehearsal does not exercise deployed HTTP writes or trigger delivery.
The isolated deployed trigger check below verifies the event/runtime/SMS path
separately. It is not a full live customer → staff UI rehearsal.

Following the user's request to make collection SMS automatic, notifyCollection
was deployed and SMS enabled. Firebase bound the three existing Twilio secrets
to the worker runtime. The database trigger watches only events/nuvei/orders.
No live orders were created or real test messages sent during this deployment.
Any additional real SMS needs explicit recipient/send approval. Do not create
fake gift orders in the live event or grant unrelated secret access.

## Isolated deployed trigger result — 8 October

One explicitly approved recipient was stored only in an isolated Firestore
diagnostic record, not in the repository. A temporary trigger watched exactly
`events/nuvei-staging-20261008/smsChecks/approved-automatic-test` and called the
same notifyReady handler, with the same three Twilio secret bindings and region
as production. The record moved from Queued to Ready/Pending.

The first invocation failed before making an SMS attempt: Firebase Functions
had registered an internal named app, but no default app. The old getApps().length
check incorrectly skipped default-app initialisation. The new database helper
selects/creates the default app explicitly; three regression tests cover it.
The fix was deployed to redemptions, notifyCollection and monitorTwilioBalance.

The same unattempted record was woken after the fix, not recreated. Its durable
claim became Accepted, with exactly one provider submission. A read-only query
of that exact Twilio message returned delivered with no provider error.
No live gift orders were created and no inventory counters were changed.
The test record is retained; the temporary test trigger is removed after testing.
`scripts/check-automatic-sms.cjs --check-only` can inspect the existing result.
Never rerun a sending mode for this completed attempt.

The production trigger's actual live event path and staff UI still need the final
joint rehearsal; the test used an isolated diagnostic path deliberately.

Airtable's Font field and write access are now verified. The mirror worker is
deployed and ACTIVE, mapping internal Decorating to Airtable's Engraving option.
Production still needs to confirm physical height and matching font files.

## Integrated isolated rehearsal — 8 October, after Airtable setup

`scripts/rehearse-collection.cjs` passed using local HTTP through the shared
Firebase HTTP adapter and queue handler, real isolated Firestore REST transactions,
and the shared mirror handler writing a labelled Airtable test record.

- Isolated event: `events/nuvei-rehearsal-1791427527019-cc12594a`.
- Test reference: `NU·5265A58B3B`; name clearly marks it NOT A GIFT ORDER.
- Queued → Engraving → Ready → Collected persisted correctly in Airtable.
- Catherine and Segoe Print persisted correctly; customer tracking followed status.
- Replaying the identical submission did not reserve another gift. A second
  request from the same email was rejected. Isolated daily stock moved 50 → 49.
- Three status audit entries persisted; unauthenticated status changes rejected.
- Concurrent notification-handler calls submitted exactly one simulated SMS.
  No real Twilio request, phone number in Airtable, or live inventory changes.
- Staff identity was simulated, as staff account sign-in was explicitly skipped.
- Staging Firestore and Airtable test records are retained. Do not count the
  labelled test record toward production gifts; no deletion was performed.

The first initialization attempts stopped before any data write because the local
Admin Firestore client rejected the custom CLI credential. Using the previously
verified REST transaction adapter resolved it; no production code change needed.

This is an integrated rehearsal, not a deployed customer/staff UI test. It does
not exercise cloud trigger delivery or actual staff login. SMS delivery and the
isolated deployed notification trigger passed separately earlier; those checks
do not replace the final staff sign-in/production-path sign-off.

## Isolated deployed Airtable trigger — 8 October

A temporary Node 22 asia-southeast1 Firestore trigger used the same syncOrder
handler, default-app database initialization and AIRTABLE_TOKEN secret as the
production worker. Its path was restricted to the existing isolated rehearsal
event, with additional guards for the labelled test name/reference and existing
Airtable record ID. It did not have SMS secrets or watch the live event.

One preconditioned write marked the existing test order Pending and recorded
triggerTestRequestedAt. Actual cloud event delivery ran the handler, updating
mirrorStartedAt after that request and returning the order to Synced. A separate
read-only Airtable check verified reference NU·5265A58B3B, Collected status and
Segoe Print, with no phone number. No direct mirror invocation was used to finish
this test, no real SMS was sent, and live gift stock was untouched.

`scripts/check-airtable-trigger.cjs --check-only` inspects the retained result.
The one-shot wake mode refuses a second request. Temporary trigger source was
removed after the pass. Firebase confirmed successful deletion; the four
production workers remain ACTIVE and no temporary test worker remains.
This proves isolated deployed Airtable event delivery, not staff sign-in or the
complete live event HTTP/customer UI path.
