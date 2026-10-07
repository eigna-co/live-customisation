# Nuvei visitor check — 7 October 2026

Target: https://tge-live.netlify.app/

50 simulated visitors each requested the HTML page and then the read-only
availability API. All 100 requests succeeded in 3.287 seconds overall.

| Request | Successful | Median | 95th percentile | Slowest |
| --- | ---: | ---: | ---: | ---: |
| Homepage HTML | 50/50 | 443 ms | 556 ms | 751 ms |
| Availability | 50/50 | 1,911 ms | 2,635 ms | 2,650 ms |

No customer records were created, inventory changed or SMS sent. This is a
bounded HTTP check, not 50 actual browsers: assets, rendering, keyboards,
authenticated staff sessions and order submission were not load-tested.
Measurements reflect this client/network and are not a service guarantee.

Reproduce with `node scripts/check-50-visitors.mjs`. This sends exactly 100
read-only requests to the fixed production site and may consume hosting usage.
Do not repeatedly run it as a monitor.

Local queue tests additionally simulate 60 concurrent submissions on each day
(exactly 50 accepted per day, 100 total), and 50 concurrent submissions of the
same email (one accepted). These use a database double, not real Firestore:
actual transaction retries/ contention still require isolated staging tests.

Before event sign-off, complete Airtable mirroring, the controlled SMS test,
production engraving specifications and the owning Netlify team's usage check.

## Real database staging check — 7 October

The shared queue handler ran against real Firestore REST transactions in fresh
`events/nuvei-staging-*` namespaces. Production stock/orders were untouched;
production integration triggers match only `events/nuvei/orders/*`.
Synthetic staging records were retained, not deleted.

The first simultaneous wave completed 16 orders immediately; 34 had temporary
transaction-contention failures. Identical-request recovery completed all 50
without extra reservations. After adding bounded client retries (three attempts,
backoff and jitter), the second wave completed all 50 in 15.894 seconds with no
final errors. Daily/total stock reservation count was exactly 50. Duplicate-email,
unchanged-receipt recovery and sold-out rejection passed.

This used production queue logic with a local REST transaction adapter (five
transaction attempts), not deployed Node 22 Admin SDK/Netlify HTTP writes. It
validates real transaction correctness, not guaranteed deployed write latency.

## Approved SMS check

One approved test used the saved restricted Twilio key. Twilio reported `sent`
without an error, and the user confirmed receipt. A durable isolated staging
claim prevents automatic resends. No live gift order was created.
Live collection SMS stays disabled pending worker integration verification.

Revised message: “Your personalised travel adaptor is ready! Please collect it
at the booth and show your order reference [reference].”

All 87 local tests and both builds passed after these changes.
