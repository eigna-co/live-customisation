# Event queue backend — local preparation only

Keep the current Netlify address. Firebase supplies the order service, Firestore
database and staff authentication; Airtable receives an asynchronous event copy.
Nothing has been deployed or provisioned. No billing, domain, staff account or
live Airtable schema has been changed.

## Implemented locally

- Order creation, normalised-email uniqueness and stock reservation in one
  transaction. Unchanged retries recover the same receipt without using stock.
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

Firestore is the stock/status authority; Airtable edits do not update the queue.
No cancellation, stock release, order editing, SMS, global distributed rate
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

1. Confirm the Firebase project ID and owner. A separate event-platform project
   avoids mixing other EVFY data. Owner must approve paid services before enabling
   them. Instance limits are not a spending cap.
2. Provision Firestore with an appropriate location and email/password Firebase
   Authentication. No public staff self-registration flow is provided.
3. Approve actual staff email addresses and verify their accounts. A trusted admin
   grants the event custom claim using Admin SDK, preserving existing claims.
   Never grant roles from browser code.
4. Set backend `FIREBASE_WEB_API_KEY` and Secret Manager `AIRTABLE_TOKEN`,
   `AIRTABLE_BASE`, `AIRTABLE_TABLE`. Use a separate staging table initially.
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
Top/bottom engraving is now implemented with five letters per area; see EVENT-SETUP.md.
