# Nuvei event configuration

The active event and product rules are in `firebase-functions/event-config.json`.
The browser and both hosting adapters use the same rules. This file is edited in
code; it is not a staff administration screen.

Configured from supplied requirements:
- Nuvei, 20–21 October (year deliberately omitted pending confirmation).
- Black travel adaptor, event allocation 100.
- One to five letters; surrounding whitespace is trimmed, internal spaces,
  numbers and symbols are rejected. Letter casing is preserved. International
  letters are accepted; any narrower character or word restrictions are pending.
- Times New Roman, Segoe Print and Lucida Sans Regular.
- Personalisation above the front three-pin socket, logo below.
- Inter Tight website typography, one of the two requested website fonts.

The supplied product reference image is included unmodified on the product card.
The placement illustration shows the selected text above the front socket and
the Nuvei label below, following the confirmed top/bottom placement. It is not a
production engraving proof or the final logo artwork. Exact font rendering currently depends on fonts installed on
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
handled by the team. Whether 100 units is shared across both dates is pending.

## Airtable preparation before publishing

Use the separate event table. Required fields:
`Name`, `Company`, `Email`, `Phone`, `Gift`, `Decoration`, `Font`, `Ticket`, `Status`.
Use an ordinary text field for `Font`; it stores only the selected font name for
the engraving team. Airtable's display typeface has no effect on engraving.
Allow `travel adaptor` in `Gift` and `Queued` in `Status` if using single-select.
No live Airtable schema changes have been made.

Quantity 100 is event configuration, not a live remaining-stock counter.
Automatic sold-out enforcement and atomic duplicate prevention still require
durable inventory/order coordination. No claimed stock figure is displayed by
default. SMS, staff queue updates and collection confirmation are not implemented
here; the ticket acknowledges the order and directs guests to the event team.

Changes are prepared locally on `migration/firebase-preparation`. No domain
change, deployment, Firebase project creation or billing change has been made.

Verification: 29 automated tests pass, including shared text/font validation,
server-side order fields and hosting adapters. Both production builds succeed.
Browser check: sample guest details, adaptor selection, invalid text blocked,
five-letter text accepted, and font selection/preview confirmed locally. No
test order was submitted to a live service. Cloud runtime verification is pending.
