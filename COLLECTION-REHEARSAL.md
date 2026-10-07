# Collection workflow rehearsal — updated 8 October 2026

## Completed without external messages or live orders

`test/collection-workflow.test.js` runs the real queue and notification service
code together against an in-memory database and a simulated Twilio response.
It uses synthetic customer details and a simulated event date.

Verified:

- Full name `Catherin` is saved without truncation.
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
Result: 95 tests and both production builds pass.

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

Airtable remains a separate blocker: the owner needs to add Font and provide
write access before its mirror worker can be enabled. Production also needs to
confirm physical height, minimum readable text and matching font files.
