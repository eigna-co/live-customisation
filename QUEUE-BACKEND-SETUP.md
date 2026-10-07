# Event queue backend — local preparation only

Keep the current Netlify address. Firebase supplies the order service, Firestore
database and staff authentication; Airtable receives an asynchronous event copy.
The user created `tgelive-1b68d` on Spark; `.firebaserc` selects it locally.
No backend has been deployed or provisioned. No billing, domain, staff account or
live Airtable schema has been changed.

## Implemented locally

- Order creation, normalised-email uniqueness across the event, and daily/total stock reservation in one
  transaction. Unchanged retries recover the same receipt without using stock.
- Singapore calendar-day allocation: 50 on each of 20 and 21 October, no rollover,
  100 total, in 2026. Orders outside the dates are blocked.
- Customer review and acknowledgement before submission; no guest cancellation or edit endpoint.
  Existing contact-keyed database records require migration before deploying this change; see EVENT-SETUP.md.
- Public stock checks without personal data. Secret tracking tokens return only
  a reference and status. Ticket screens refresh automatically while open.
- Staff sign-in and verified, event-authorised accounts. Every staff operation
  checks the `eventStaff: "nuvei"` custom claim and token revocation.
- Queued → Decorating → Ready → Collected, conflict checking and audit records.
  Guests cannot mark their own orders collected.
- Airtable mirroring with worker claims; ambiguous create failures go to review,
  never a blind second POST. Staff can retry failures, check existing copies and
  recover workers stalled over two minutes. Multiple matches need human review.
- Browser Firestore access denied. Legacy Netlify endpoint uses the same proxy.
- Collection SMS is queued atomically on the first Ready transition. A durable
  attempt claim prevents duplicate sends from trigger retries, network timeouts,
  staff double clicks, or crashes. Ambiguous attempts require Twilio log review;
  only blocked, never-attempted messages can be requeued by authenticated staff.
  Accepted means submitted, NOT delivered. Confirm delivery in Twilio logs.

Firestore is the stock/status authority; Airtable edits do not update the queue.
No cancellation, stock release, order editing, automatic SMS delivery callbacks, global distributed rate
limiting or event administration UI is included. Staff listing is capped at 200
rows, sufficient for this 100-unit event but not a general large-event solution.
Guest tracking is memory-only: a screenshot preserves a reference, not a
resumable tracking link. Staff can find lost references in the authenticated queue.

## Local checks

Install root and separate `firebase-functions` dependencies using frozen lockfiles.
Run `node --test --test-isolation=none test/*.test.js`, then both
`node scripts/build-firebase.mjs` and `node scripts/build.mjs`.
The former creates the `dist/` directory published by Netlify.

Optional isolated browser preview: `node scripts/preview-test.mjs`, port 4174.
Fake staff account: `staff@example.test` / `preview-only`.
This script uses ONLY in-memory sample data and never authenticates or writes to
cloud services. It is not production authentication and must never be deployed.

Service tests use a database double, not the Firebase emulator. Actual transaction
retries, deployed auth, trigger delivery, Airtable integration and Node 22 runtime
still need staging checks. Local tests ran on Node 24. Browser checks also used
the isolated preview with sample data only.

## Setup required before publishing

1. Selected Firebase project: `tgelive-1b68d`. A separate event-platform project
   avoids mixing other EVFY data. Owner must approve paid services before enabling
   them. Instance limits are not a spending cap.
2. Provision Firestore with an appropriate location and email/password Firebase
   Authentication. No public staff self-registration flow is provided.
3. Approve actual staff email addresses and verify their accounts. A trusted admin
   grants the event custom claim using Admin SDK, preserving existing claims.
   Never grant roles from browser code.
4. Set backend `FIREBASE_WEB_API_KEY` and Secret Manager `AIRTABLE_TOKEN`,
   `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY`, `TWILIO_API_SECRET`. The server-only integration-config.json
   records the supplied event Airtable IDs and tested sender. Use a separate
   staging table initially. Keep `sms.enabled` false until credentials, billing,
   schema, permissions and one controlled staging test are verified.
   Never put credentials in GitHub or frontend files.
5. Deploy ONLY `functions,firestore:rules` with an explicit project ID after
   approval. Functions use Singapore region. Do not deploy Firebase Hosting or
   change domains; its optional configuration is not required for this setup.
6. Set Netlify server environment `FIREBASE_QUEUE_URL` to the deployed HTTPS
   Firebase order endpoint. The proxy only accepts Firebase/Cloud Run hosts.
7. Test final-unit contention, uncertain retries, expired/unapproved staff,
   conflicting updates, offline tracking and mirror failure/reconciliation in
   staging. Verify database rules and billing alerts.
8. Confirm event stock allocation and unique event ID before live orders. Config
   edits do not overwrite existing inventory capacity. Never reuse `nuvei` for
   a future event containing previous orders.
9. Then publish Netlify. Publishing before setup deliberately blocks ordering
   rather than accepting orders without reliable stock checks.

Staff page: existing site address plus `?staff=1`. Session tokens stay in memory,
expire, and are cleared on sign-out. No production staff credentials are bundled.
Top-only engraving is implemented with five letters; the bottom has a fixed pre-engraved Nuvei logo. See EVENT-SETUP.md.

Approved staff email: `siewping.fong@thegiftexpert.com`. This is a setup reference,
not a grant of access: provision and verify the Firebase user and event claim.
Customer records are retained for future reference as instructed; no automatic
deletion job is enabled. Final privacy wording and production font specifications
still need review before publishing. No secrets are stored in the repository.

### Twilio balance notice (prepared, not live)

The staff page shows a small, dismissible, non-modal notice when the last verified
USD balance is US$5 or less. Dismissal lasts only for the current page visit;
reopening/reloading the staff page shows it again after sign-in if still low.
It never tops up, sends SMS or blocks queue actions. Customers cannot view it.

The separate `monitorTwilioBalance` worker checks the read-only Twilio Balance API
hourly and caches only balance, currency and check time in a staff-only Firestore
document. A missing, failed or two-hour-old check displays “balance unavailable”
instead of treating the account as funded. This is not real-time monitoring or a
guarantee that SMS will be delivered; trial restrictions and number rental still
apply. The threshold is configurable in `integration-config.json`.

Before activating, an authorised administrator must enable Blaze/billing, store
`TWILIO_BALANCE_AUTH_TOKEN` in Secret Manager (never in chat or Git), verify it
belongs to `TWILIO_ACCOUNT_SID`, enable `balanceMonitor.enabled`, deploy the
scheduled worker, and verify its first check. The auth token is bound only to
this private worker, not the browser or public queue API. Scheduler and backend
usage may incur charges. Monitoring remains disabled until that setup is done.
