# Event queue backend — setup in progress

Keep the current Netlify address. Firebase supplies the order service, Firestore
database and staff authentication; Airtable receives an asynchronous event copy.
The user created `tgelive-1b68d`; `.firebaserc` selects it locally.
On 7 October 2026 the console confirmed Blaze billing, and setup permissions
became available for jerryl@evfy.sg. The default Standard Firestore database was
created in asia-southeast1 (Singapore) with production deny-all client rules and
no optional scheduled backups. Firebase Authentication email/password sign-in is
enabled; passwordless sign-in remains disabled. The user created the approved
staff account siewping.fong@thegiftexpert.com. Its eventStaff claim is now `nuvei`,
verified through the Admin SDK; email verification is still pending. No Firebase
administrator permissions were granted. Firebase CLI 15.32.1 is authenticated as jerryl@evfy.sg.
The deployed staff sign-in flow sends a Firebase verification email after a
successful password sign-in by approved, unverified staff; no session or queue
data is returned until verified. All 81 tests pass. No real verification email
has been sent by the agent; the user must sign in with their private password.
The loopback-only `scripts/preview-staff-cloud.mjs` on port 4182 connects to the
real API for staff login/read-only queue checks. Its allowlist rejects order
creation and status changes (HTTP 403, verified). Do not deploy this script.
The user also created `jerryl@evfy.sg` as the test staff login. On 7 October the
Admin SDK granted and verified its `eventStaff: "nuvei"` claim, preserving any
existing claims. The account is enabled; its email verification was subsequently
confirmed by a read-only Admin SDK lookup. The user signed in successfully through
the Firebase-connected local staff page, which displayed the empty queue.
The zero available stock is expected outside event dates. The balance monitor is
now deployed and enabled; the staff page displays the cached US$13.09 balance.
This application account is separate from Google/Firebase console IAM access.
The provisioning script now requires an explicit allow-listed email argument.
The Airtable collaborator dialog confirms jerryl@evfy.sg has Read only access.
Angie is the workspace owner. The missing `Font` single-line-text column remains
a setup blocker: an authorised creator/owner must add it. Do not change sharing
permissions or read/write customer records to work around this restriction.
The TGE Live Queue web app is registered. The core `redemptions` function and
deny-all client database rules are deployed in Singapore. The API endpoint is
https://redemptions-s3i7tgf25a-as.a.run.app. Read-only smoke checks confirmed
transactional mode, staff login configuration, unauthenticated staff rejection
(HTTP 401), and orders closed outside the configured 20/21 October event dates.
Secret Manager is enabled. The user saved all five integration secret entries:
`AIRTABLE_TOKEN`, `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY`, `TWILIO_API_SECRET`, and
`TWILIO_BALANCE_AUTH_TOKEN`. Values were not opened in the browser or printed.
Read-only provider checks used the stored credentials privately: Twilio Balance
API succeeded (USD 13.0875 on 7 October), and Airtable accepted the token but the
zero-record required-field check failed because `Font` is missing. No customer
records were read or created. SMS key authentication has not been tested because
its restricted key permits message creation only; an approved test SMS is needed.
Airtable/SMS workers are not deployed. The balance-only scheduled worker is live,
and the live frontend is not connected to this API yet. The domain and
live Airtable schema remain unchanged. No live SMS was sent during this setup.
The backend public web API key setting was renamed to `EVENT_WEB_API_KEY` because
Firebase reserves the `FIREBASE_` prefix. The official Functions Framework was
added because Google's pnpm cloud build requires it. All 81 local tests passed
after the balance monitor setup; both builds passed after the setting rename.
The CLI confirmed the function update succeeded but exited with a warning that
Artifact Registry has no image cleanup policy. No automatic deletion policy was
enabled; set an approved retention policy to limit accumulated build-image costs.

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

Run `pnpm verify:release` for the automated local test suite and both production
builds. It stops on the first failure and never deploys or publishes anything.
Run `pnpm check:cloud` for nine non-mutating checks of the exact deployed event
API: configuration, public availability, anonymous rejection on all four staff
operations, invalid tracking, malformed JSON and unsupported HTTP methods.
All nine passed on 7 October 2026. No sign-in attempts, customer record reads,
orders or SMS are performed. Malformed JSON is rejected by Google's HTTP
framework before the application handler, so its response format is platform-owned.
The added staff mutation regression test verifies missing, revoked, wrong-event
and unverified identities cannot write any records across all three mutations.

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
4. Set backend `EVENT_WEB_API_KEY` and Secret Manager `AIRTABLE_TOKEN`,
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

### Twilio balance notice (live backend, local staff preview)

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

On 7 October 2026 the scheduled worker was deployed. Cloud Scheduler confirmed
the exact `firebase-schedule-monitorTwilioBalance-asia-southeast1` job is ENABLED
with an every-60-minutes schedule. A manual invocation of that managed job
updated the cache to USD 13.0875; the later check time was verified by a read-only
Firestore lookup. This proves the cloud worker can read its secrets, query Twilio
and save the balance, independently of the local setup helper. The auth token is
bound only to this private worker, not the browser or public queue API. Scheduler
and backend usage may incur charges. No SMS or top-up was performed.

`scripts/check-live-balance.cjs` supports `--read-cache` (no secret access or
writes) and `--verify-schedule` (verifies and manually runs only this exact
balance job). Its default mode queries Twilio and updates only the balance cache.
It authenticates using the approved administrator's local Firebase CLI session
and does not print credentials. The existing Netlify site is unchanged.
