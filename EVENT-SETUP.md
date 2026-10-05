# Nuvei event configuration

The active event and product rules are in `firebase-functions/event-config.json`.
The browser and both hosting adapters use the same rules. This file is edited in
code; it is not a staff administration screen.

Configured from supplied requirements:
- Nuvei, 20–21 October (year deliberately omitted pending confirmation).
- Black travel adaptor: 50 per Singapore calendar day, 100 total across both dates.
- One normalised contact number can claim one gift across the entire event;
  email remains an order detail, not the uniqueness key. Existing validation accepts SG mobiles only.
- A final review displays the engraving, font and contact details. Customers must
  acknowledge checking the name/font and no cancellation before submission.
- One to five letters; surrounding whitespace is trimmed, internal spaces,
  numbers and symbols are rejected. Letter casing is preserved. International
  letters are accepted; any narrower character or word restrictions are pending.
- Times New Roman, Segoe Print and Lucida Sans Regular.
- Customer personalisation above the front socket only, maximum five letters.
  The bottom already has a fixed pre-engraved Nuvei logo. No bottom text is accepted.
  The font selector applies only to the customer's top text.
- Inter Tight website typography, one of the two requested website fonts.

The product card and preview use an AI-retouched studio version of the supplied
front-facing photo, displayed through an SVG viewport with separate text overlays.
Original brochure and front photo remain unmodified in images/. The retouched
asset is a website visual only, not an exact engineering or production reference.
Text size and positioning are approximate, not a production engraving proof.
The preview uses the actual Nuvei wordmark from the supplied product reference, cropped
through SVG and recoloured grey without modifying the source image. Its width is approximately
38% of the front face, centred below the socket. Final physical size and placement still
need a production proof; a photograph of the pre-engraved front would confirm the match.
Exact font rendering depends on fonts installed on
the guest's device. Licensed web font files and matching production fonts are
needed before approving the proof. No fonts were copied from Windows or bundled.

The website now uses the official primary palette from Nuvei ANZ Partner Brand
Guidelines v.01, page 12: Signal Blue #0C98D3, Core Navy #160850, Warm White #FAF9F8,
and Support Grey #CFC9C2. These replace the photograph-derived approximations.
The guide is linked from https://www.nuvei.com/partner-marketing-kit/anz and its
document URL is recorded in event-config.json. Navy text on blue buttons preserves
contrast; small text uses navy rather than blue on white. The client-approved visual direction and
front top/bottom placement are sufficient for the website draft. Final logo
artwork, engraving size and physical measurements remain production details
handled by the team. The allocation is confirmed as 50 per day, without rollover.

## Event dates and contact-key migration

`schedule.year` remains null until the event year is confirmed. The live service fails
closed until it is set, and rejects new orders outside 20–21 October in Asia/Singapore.
Day stock documents use `adaptor-YYYY-MM-DD`; the total stock counter is also retained.
Neither the guest nor staff chooses the redemption date. Successful request retries
can recover their original receipt after a date change without reserving more stock.
The isolated preview explicitly simulates 20 October 2026; this is NOT a confirmed event year.

Order IDs now hash normalised contact numbers rather than email. Before applying this
to a database that already contains email-keyed orders, migrate those records and
their request/tracking links, deduplicate contacts and initialise day counters from
the actual orders. Do not simply deploy over old data: that could permit duplicate gifts.
No live database migration has been performed. SMS remains unconnected, pending provider,
sender, credentials, costs and approved message text. The review does not promise an SMS.

## Airtable preparation before publishing

Use the separate event table. Required fields:
`Name`, `Company`, `Email`, `Phone`, `Gift`, `Decoration`, `Font`, `Ticket`, `Status`.
Use an ordinary text field for `Font`; it stores only the selected font name for
the engraving team. Airtable's display typeface has no effect on engraving.
`Decoration` stores the customer's top text only, e.g. `ABCDE`.
The pre-engraved logo is not a customer preference. No new Airtable
columns are needed for this change.
Allow `travel adaptor` in `Gift` and `Queued`, `Decorating`, `Ready`, `Collected`
in `Status` if using single-select.
No live Airtable schema changes have been made.

The new local backend reserves stock atomically in Firestore and blocks sold-out
orders. Staff queue updates and collection confirmation are implemented locally.
Airtable is a copy, not the stock authority. SMS is not implemented. Orders fail
closed when stock cannot be checked. Cloud setup and verification remain pending;
see QUEUE-BACKEND-SETUP.md.

Changes are prepared locally on `migration/firebase-preparation`. No domain
change, deployment, Firebase project creation or billing change has been made.

Verification includes automated validation/queue tests and isolated browser
checks using sample details only. No order was submitted to a live service.
Cloud runtime verification is pending.
