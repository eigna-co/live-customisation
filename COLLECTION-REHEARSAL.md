# Collection workflow rehearsal — 7 October 2026

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
Result: 92 tests and both production builds pass.

## Not proved by this rehearsal

This does not exercise deployed Node 22 HTTP writes, Eventarc delivery, runtime
secret permissions, real Twilio submission or handset delivery. The earlier
approved direct SMS reached the handset, but does not prove automatic triggering.

The production notification worker remains undeployed and SMS disabled.
Before enabling it, verify the runtime's three existing Twilio secret bindings
and rehearse the deployed trigger with an isolated test order. A new real test
SMS needs explicit recipient/send approval. Do not create test records in the
live event or silently grant additional service-account secret access.

Airtable remains a separate blocker: the owner needs to add Font and provide
write access before its mirror worker can be enabled. Production also needs to
confirm physical height, minimum readable text and matching font files.
