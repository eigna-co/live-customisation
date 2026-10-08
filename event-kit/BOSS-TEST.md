# Temporary customer test — 8 October 2026

The normal customer website accepts orders for this approved test window, until
9 October 2026 at 12 noon Singapore time. No special link or customer trial label.

The review, submission, tracking, staff status workflow, Airtable mirror and
collection SMS all use the deployed production handlers. Marking Ready sends a
real SMS to the entered number and uses Twilio credit. Use only consenting testers'
contact details; staff must not mark unrelated records Ready for testing.

Server-side protection:

- Test orders carry `isTest: true` and `trialId: boss-20261008`.
- Their email entitlement and 50-slot test capacity are separate from the event's
  50-per-day allocation on 20–21 October. Testers may redeem during the real event.
- Staff queue shows the test marker. Airtable names have the existing test-only
  suffix so the Test records view includes them and the non-test view excludes them.
- The temporary window expires automatically. Afterwards new orders close until
  the real event; existing order tracking/status updates remain available.
- Nothing is deleted automatically. Cleanup must target only this trial ID and
  its linked records after testing; preserve real customer/event records.

Disable early by setting `trial.enabled` to false and redeploying redemptions.
